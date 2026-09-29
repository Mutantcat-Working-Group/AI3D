import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// 2 (0.9.0): an origin is an owner and an optional route rather than a chat
// route, so a manager and an instance from either side of this line cannot
// agree on what a rebind means. An instance still answering the old contract is
// replaced by reopening the project; it is never left unreachable.
export const INTEGRATION_API = 2;
export const INSTANCE_SCHEMA = 1;

export function readInstance(config) {
  if (!config.instance) return null;
  const value = config.instance;
  if (
    value.schema !== INSTANCE_SCHEMA ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.id || "",
    ) ||
    !/^[a-f0-9]{32}$/.test(value.projectId || "")
  ) {
    throw new Error(
      "Unsupported or invalid AI3D instance identity; data was not migrated.",
    );
  }
  return { id: value.id, projectId: value.projectId, schema: value.schema };
}

export function instanceCookieName(instance) {
  return instance
    ? `review_access_${instance.id.replaceAll("-", "")}`
    : "review_access";
}

// Darwin AF_UNIX names have a short byte limit. Managed instances keep their
// persistent state in the project but put only the ephemeral socket in a
// private, per-uid OS temporary directory. Legacy instances keep their path.
export function agentSocketPath(runtime, instance = null) {
  if (!instance) return path.join(runtime, "agent.sock");
  const key = crypto
    .createHash("sha256")
    .update(fs.realpathSync(runtime))
    .digest("hex")
    .slice(0, 24);
  return path.join(
    os.tmpdir(),
    `ai3d-${process.getuid?.() ?? "user"}`,
    `${key}.sock`,
  );
}

export function prepareSocketDirectory(socketPath, instance) {
  if (!instance) return;
  const directory = path.dirname(socketPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(directory);
  if (
    !st.isDirectory() ||
    st.isSymbolicLink() ||
    (process.getuid && st.uid !== process.getuid()) ||
    st.mode & 0o077
  ) {
    throw new Error("AI3D IPC directory is not private to this user.");
  }
  if (Buffer.byteLength(socketPath) >= 104)
    throw new Error("AI3D IPC path exceeds the platform limit.");
}
