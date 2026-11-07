#!/usr/bin/env python3
"""Stage a code-only sidebar repair; explicit apply commands never touch services.

Build first, then stage against the exact installed package (or an isolated copy).
Publication is hash-fenced and atomic per file, not a cross-file transaction.
Rollback restores overwritten files; newly added immutable UI assets are retained.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

PROJECT = Path(__file__).resolve().parents[1]
OWNER = "extensions/browser/src/browser/"
NEW_REGIONS = [OWNER + "interaction-stream.ts", OWNER + "routes/interact.ts"]
INDEX = OWNER + "routes/index.ts"
GUARD = OWNER + "pw-session-navigation.ts"
REGIONS = re.compile(r"//#region ([^\n]+)\n[\s\S]*?//#endregion")
IMPORTS = re.compile(r"^import .*?;$", re.M)
EXPORTS = re.compile(r"^export \{([^}]+)\};$", re.M)
MODULES = re.compile(r"(?:from\s*|import\s*\()(['\"])(\.[^'\"]+)\1")


def check(ok: bool, reason: str) -> None:
    if not ok:
        raise RuntimeError(reason)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_bytes())


def atomic(path: Path, data: bytes, mode: int = 0o600) -> None:
    fd, temporary = tempfile.mkstemp(prefix=".sidebar-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
        # Directory fsync is what makes a rename durable on POSIX, and it has no
        # Windows equivalent: `os.open(directory, os.O_RDONLY)` is denied there,
        # so every write through here raised PermissionError before the file it
        # was replacing could be read back. The file itself is still fsynced
        # above, which is the part that keeps the content; whether the rename
        # survives a power cut is what the platform does or does not promise.
        if os.name == "posix":
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def save(path: Path, manifest: dict) -> None:
    atomic(path, (json.dumps(manifest, indent=2) + "\n").encode())


def safe(root: Path, relative: str) -> Path:
    parts = Path(relative).parts
    check(parts and not Path(relative).is_absolute() and all(p not in ("..", ".") for p in parts),
          f"unsafe relative path: {relative}")
    target = root.joinpath(*parts)
    for parent in (target, *target.parents):
        if parent == root:
            break
        check(not parent.is_symlink(), f"symlink not allowed: {relative}")
    check(not target.exists() or target.is_file(), f"not a regular file: {relative}")
    return target


def digest_at(root: Path, relative: str) -> str | None:
    path = safe(root, relative)
    return sha(path.read_bytes()) if path.exists() else None


def inventory(root: Path) -> dict[str, str]:
    result = {}
    check(root.is_dir() and not root.is_symlink(), f"missing real directory: {root}")
    for path in sorted(root.rglob("*")):
        check(not path.is_symlink(), f"symlink in code tree: {path.name}")
        if path.is_file():
            result[path.relative_to(root).as_posix()] = sha(path.read_bytes())
    return result


def regions(text: str) -> dict[str, str]:
    matches = list(REGIONS.finditer(text))
    result = {m[1]: m[0] for m in matches}
    check(len(result) == len(matches), "duplicate generated region")
    return result


def owner_bundle(dist: Path, region: str) -> tuple[Path, str]:
    matches = []
    for path in dist.glob("*.js"):
        text = path.read_text()
        if "//#region " + region + "\n" in text:
            matches.append((path, text))
    check(len(matches) == 1, f"expected one built owner for {region}, found {len(matches)}")
    return matches[0]


def syntax(path: Path) -> None:
    node = shutil.which("node")
    check(bool(node), "node is required for syntax verification")
    result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
    check(result.returncode == 0, f"candidate syntax failed: {path.name}: {result.stderr[:1200]}")


def transplant(target: Path, build: Path) -> tuple[str, bytes, dict]:
    old_path, old = owner_bundle(target / "dist", INDEX)
    built_path, built = owner_bundle(build / "dist", INDEX)
    before, after = regions(old), regions(built)
    check(set(after) - set(before) == set(NEW_REGIONS), "unexpected added backend regions")
    check(set(before) <= set(after), "built bundle lost existing regions")
    check(all(before[name] == after[name] for name in before if name != INDEX),
          "existing backend region changed outside routes/index.ts")
    check("interactionStreamsByState" in after[NEW_REGIONS[1]] and
          "WeakMap" in after[NEW_REGIONS[1]], "stale build: runtime-owned stream store missing")
    check("registerBrowserInteractionRoutes(app, ctx);" in after[INDEX], "missing route registration")
    check(after[INDEX].replace("\tregisterBrowserInteractionRoutes(app, ctx);\n", "") == before[INDEX],
          "unexpected index-region change")
    check(EXPORTS.findall(old) == EXPORTS.findall(built), "backend export aliases changed")
    guard_path, old_guard = owner_bundle(target / "dist", GUARD)
    _, new_guard = owner_bundle(build / "dist", GUARD)
    check(regions(old_guard)[GUARD] == regions(new_guard)[GUARD], "navigation guard contract drift")
    bindings = [piece.strip().split(" as ") for block in EXPORTS.findall(old_guard)
                for piece in block.split(",")]
    alias = [parts[-1] for parts in bindings if parts[0] == "withPageNavigationRequestGuard"]
    check(len(alias) == 1 and re.fullmatch(r"\w+", alias[0]), "guard export alias unavailable")
    added_imports = ('import { randomUUID } from "node:crypto";\n'
                     f'import {{ {alias[0]} as withPageNavigationRequestGuard }} from "./{guard_path.name}";\n')
    check(not any(re.search(r"\b(randomUUID|withPageNavigationRequestGuard)\b", line)
                  for line in IMPORTS.findall(old)), "new imports already exist")
    new_regions = "\n".join(after[name] for name in NEW_REGIONS) + "\n"
    candidate = added_imports + old.replace(before[INDEX], new_regions + after[INDEX], 1)
    check(candidate[len(added_imports):].replace(new_regions + after[INDEX], before[INDEX], 1) == old,
          "transplant altered original remainder")
    check(IMPORTS.findall(candidate)[2:] == IMPORTS.findall(old), "original imports changed")
    for _, relative in MODULES.findall(candidate):
        check((target / "dist" / relative).is_file(), f"unresolved original graph import: {relative}")
    return "dist/" + old_path.name, candidate.encode(), {
        "built_bundle": str(built_path), "built_sha256": sha(built.encode()),
        # `sha()` of the file's bytes, not of the text read out of it: the two
        # differ wherever the file has CRLF, and this hash is checked against
        # `digest_at()` on the very next line, which hashes the bytes.
        "guard_path": "dist/" + guard_path.name,
        "guard_sha256": digest_at(target / "dist", guard_path.name),
    }


def validate_ui(root: Path, files: dict[str, str]) -> str:
    for name in ("index.html", "asset-manifest.json", "sw.js", "manifest.webmanifest"):
        check(name in files, f"UI output incomplete: {name}")
    manifest = read_json(root / "asset-manifest.json")
    check(manifest.get("version") == 1, "unsupported UI asset manifest")
    seen, lines = set(), []
    for item in manifest["assets"]:
        name = item["path"]
        path = safe(root, name)
        check(name not in seen and files.get(name) == item["sha256"] and
              path.stat().st_size == item["size"], f"UI manifest integrity failure: {name}")
        seen.add(name)
        lines.append(f"{name}\0{item['size']}\0{item['sha256']}\n")
    check(sha("".join(lines).encode()) == manifest["generation"], "UI generation mismatch")
    # Vite excludes diagnostic source maps from its runtime asset manifest.
    # They remain hash-fenced by our complete candidate inventory.
    check(all(not p.startswith("assets/") or p.endswith(".map") or p in seen for p in files),
          "unlisted UI assets")
    return manifest["generation"]


def stage(args: argparse.Namespace) -> Path:
    target, build, output = args.target_root.resolve(), args.build_root.resolve(), args.output.resolve()
    check(output.is_relative_to(PROJECT) and not output.exists(), "new stage must be inside this project")
    check(not output.is_relative_to(target) and not target.is_relative_to(output), "stage overlaps target")
    version = read_json(target / "package.json")["version"]
    check(read_json(build / "package.json")["version"] == version, "source/installed version drift")
    talk = read_json(args.talk_manifest)
    check(talk.get("status") == "applied" and talk["version"] == version, "Talk baseline not deployed")
    preserved = {}
    for entry in talk["files"]:
        name = "dist/" + entry["file"]
        check(digest_at(target, name) == entry["after_sha256"], f"Talk patch drift: {name}")
        preserved[name] = entry["after_sha256"]
    backend, code, provenance = transplant(target, build)
    preserved[provenance["guard_path"]] = provenance["guard_sha256"]
    ui = inventory(build / "dist/control-ui")
    generation = validate_ui(build / "dist/control-ui", ui)
    previous_ui = inventory(target / "dist/control-ui")
    records = []
    output.mkdir(parents=True)
    for relative, after_hash in [(backend, sha(code)), *(("dist/control-ui/" + p, h) for p, h in ui.items())]:
        old = safe(target, relative)
        before_hash = digest_at(target, relative)
        candidate = safe(output / "candidate", relative)
        candidate.parent.mkdir(parents=True, exist_ok=True)
        data = code if relative == backend else safe(build, relative).read_bytes()
        check(sha(data) == after_hash, f"build changed while staging: {relative}")
        mode = old.stat().st_mode & 0o777 if old.exists() else 0o644
        atomic(candidate, data, mode)
        if before_hash == after_hash:
            continue
        if before_hash is not None:
            backup = safe(output / "original", relative)
            backup.parent.mkdir(parents=True, exist_ok=True)
            data = old.read_bytes()
            check(sha(data) == before_hash, f"target changed while backing up: {relative}")
            atomic(backup, data, mode)
        records.append({"path": relative, "phase": "backend" if relative == backend else "ui",
                        "before": before_hash, "after": after_hash, "mode": mode, "current": "before"})
    syntax(output / "candidate" / backend)
    (output / "backend.diff").write_bytes("".join(difflib.unified_diff(
        safe(target, backend).read_bytes().decode().splitlines(True),
        code.decode().splitlines(True),
        fromfile=backend, tofile=backend + " (candidate)")).encode())
    source = {p: sha(safe(build, p).read_bytes()) for p in [*NEW_REGIONS, INDEX]}
    manifest = {"format": 1, "target_root": str(target), "version": version,
                "backend": backend, "build_root": str(build), "provenance": provenance,
                "source_sha256": source, "preserved": preserved, "ui_before": previous_ui,
                "ui_candidate": ui, "ui_generation": generation, "files": records,
                "phases": {"backend": "staged", "ui": "staged"}}
    path = output / "manifest.json"
    save(path, manifest)
    verify(path, target)
    return path


def verify(path: Path, target: Path) -> dict:
    manifest = read_json(path)
    check(manifest.get("format") == 1 and str(target) == manifest["target_root"], "manifest target mismatch")
    check(bool(re.fullmatch(r"dist/routes-[A-Za-z0-9_-]+\.js", manifest["backend"])), "invalid backend target")
    check(read_json(target / "package.json")["version"] == manifest["version"], "installed version drift")
    records = {entry["path"]: entry for entry in manifest["files"]}
    check(len(records) == len(manifest["files"]), "duplicate deployment targets")
    for name, entry in records.items():
        check(name == manifest["backend"] or name.startswith("dist/control-ui/"), "unexpected write target")
        check(entry["phase"] == ("backend" if name == manifest["backend"] else "ui"), "invalid phase")
        check(digest_at(path.parent / "candidate", name) == entry["after"], f"candidate drift: {name}")
        if entry["before"] is not None:
            check(digest_at(path.parent / "original", name) == entry["before"], f"backup drift: {name}")
        check(digest_at(target, name) == entry[entry["current"]], f"installed hash drift: {name}")
    for name, expected in manifest["preserved"].items():
        check(digest_at(target, name) == expected, f"preserved dependency/Talk patch drift: {name}")
    for name, expected in manifest["ui_before"].items():
        relative = "dist/control-ui/" + name
        if relative not in records:
            check(digest_at(target, relative) == expected, f"untouched UI drift: {name}")
    candidate_ui = inventory(path.parent / "candidate/dist/control-ui")
    check(candidate_ui == manifest["ui_candidate"], "staged UI graph changed")
    validate_ui(path.parent / "candidate/dist/control-ui", candidate_ui)
    syntax(path.parent / "candidate" / manifest["backend"])
    return manifest


def restore(path: Path, target: Path, manifest: dict, entries: list[dict]) -> None:
    # Revert the document first; leave added hashed assets available for open clients.
    entries = sorted(entries, key=lambda e: (e["path"] != "dist/control-ui/index.html", e["path"]))
    for entry in entries:
        name = entry["path"]
        check(digest_at(target, name) in (entry["before"], entry["after"]),
              f"refusing rollback over concurrent change: {name}")
        if entry["before"] is not None:
            check(digest_at(path.parent / "original", name) == entry["before"], f"rollback backup drift: {name}")
    for entry in entries:
        name, before, after = entry["path"], entry["before"], entry["after"]
        current = digest_at(target, name)
        check(current in (before, after), f"refusing rollback over concurrent change: {name}")
        if before is None:
            entry["current"] = "after" if current == after else "before"
        else:
            original = safe(path.parent / "original", name).read_bytes()
            check(sha(original) == before, f"rollback backup drift: {name}")
            if current != before:
                atomic(safe(target, name), original, entry["mode"])
            entry["current"] = "before"
        save(path, manifest)


def apply(path: Path, target: Path, phase: str | None) -> None:
    # Mutually exclusive and explicit; there is no resume/retry or service control.
    lock = target / "dist/.sidebar-release.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    retain_lock = False
    try:
        os.write(fd, str(path).encode())
        os.fsync(fd)
        if phase is None:
            manifest = read_json(path)
            check(manifest.get("format") == 1 and str(target) == manifest["target_root"], "rollback target mismatch")
            check(bool(re.fullmatch(r"dist/routes-[A-Za-z0-9_-]+\.js", manifest["backend"])), "invalid backend target")
            check(read_json(target / "package.json")["version"] == manifest["version"], "version drift")
            for name, expected in manifest["preserved"].items():
                check(digest_at(target, name) == expected, f"preserved-file drift: {name}")
            entries = manifest["files"]
            check(all(e["path"] == manifest["backend"] or e["path"].startswith("dist/control-ui/")
                      for e in entries), "invalid rollback target")
            try:
                restore(path, target, manifest, entries)
                manifest["phases"] = {"backend": "rolled_back", "ui": "rolled_back"}
                save(path, manifest)
                verify(path, target)
            except BaseException:
                retain_lock = True
                raise
            return
        manifest = verify(path, target)
        check(manifest["phases"][phase] == "staged", "phase already attempted; no automatic retry")
        check(phase == "backend" or manifest["phases"]["backend"] == "applied", "apply backend before UI")
        entries = [e for e in manifest["files"] if e["phase"] == phase]
        # Content-hashed assets first; the boot document is the publication point.
        entries.sort(key=lambda e: (e["path"] == "dist/control-ui/index.html",
                                   not e["path"].startswith("dist/control-ui/assets/"), e["path"]))
        manifest["phases"][phase] = "applying"
        save(path, manifest)
        try:
            for entry in entries:
                name = entry["path"]
                check(digest_at(target, name) == entry["before"], f"target drift before write: {name}")
                data = safe(path.parent / "candidate", name).read_bytes()
                check(sha(data) == entry["after"], f"candidate drift before write: {name}")
                destination = safe(target, name)
                destination.parent.mkdir(parents=True, exist_ok=True)
                atomic(destination, data, entry["mode"])
                check(digest_at(target, name) == entry["after"], f"write verification failed: {name}")
                entry["current"] = "after"
                save(path, manifest)
            manifest["phases"][phase] = "applied"
            save(path, manifest)
            verify(path, target)
        except BaseException:
            try:
                restore(path, target, manifest, entries)
                manifest["phases"][phase] = "failed"
                save(path, manifest)
            except BaseException:
                manifest["phases"][phase] = "recovery_required"
                save(path, manifest)
                retain_lock = True
            raise
    finally:
        os.close(fd)
        if not retain_lock:
            lock.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["stage", "verify", "apply-backend", "apply-ui", "rollback"])
    parser.add_argument("--target-root", type=Path, required=True, help="explicit installed package or isolated copy")
    parser.add_argument("--build-root", type=Path, help="frozen repair-source containing FINAL dist")
    parser.add_argument("--talk-manifest", type=Path, help="existing applied Talk deployment manifest")
    parser.add_argument("--output", type=Path, help="new project-local staging directory")
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    if args.mode == "stage":
        check(all([args.build_root, args.talk_manifest, args.output]), "stage needs build-root, talk-manifest, output")
        result = stage(args)
    else:
        check(args.manifest is not None, "manifest is required")
        result, target = args.manifest.resolve(), args.target_root.resolve()
        if args.mode == "verify":
            manifest = verify(result, target)
            print(json.dumps({"verified": True, "phases": manifest["phases"]}))
        else:
            apply(result, target, None if args.mode == "rollback" else args.mode.removeprefix("apply-"))
    print(result)


if __name__ == "__main__":
    main()
