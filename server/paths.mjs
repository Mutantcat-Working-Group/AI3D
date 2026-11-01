import path from "node:path";

// One containment test for the whole project. A `relative.startsWith("..")`
// spelling misses that "..foo" is a legitimate name and that an absolute
// result also means escape, so it must not be re-derived per call site.
export function within(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

// Any path that leaves this process — a tool's own output, a registry entry,
// a stored filename — is written with forward slashes, because that is the
// spelling those inputs are defined in. `path.relative` answers in the platform
// separator, so on Windows it handed back `projects\lamp` for a project the
// caller had named `projects/lamp`, which the caller's own validator then
// refused. Converting at the boundary keeps the platform separator inside the
// process and the canonical one everywhere else.
export function relativePosix(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}
