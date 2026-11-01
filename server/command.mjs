import spawn from "cross-spawn";

// cross-spawn handles Windows npm shims and shebangs without concatenating
// user-controlled JSON into an unescaped shell command.
export const spawnCommand = (command, args, options = {}) =>
  spawn(command, args, { windowsHide: true, ...options });

export function execCommand(
  command,
  args,
  { timeout = 25000, maxBuffer = 4 * 1024 * 1024, ...options } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let failure;
    const timer = setTimeout(() => {
      failure = Object.assign(new Error("The command timed out."), {
        code: "TIMEOUT",
        killed: true,
      });
      child.kill("SIGKILL");
    }, timeout);
    for (const stream of ["stdout", "stderr"])
      child[stream].on("data", (part) => {
        sizes[stream] += part.length;
        if (sizes[stream] > maxBuffer) {
          failure ||= Object.assign(
            new Error("Command output exceeded its limit."),
            {
              code: "MAX_BUFFER",
            },
          );
          child.kill("SIGKILL");
        } else chunks[stream].push(part);
      });
    child.on("error", (error) => {
      failure ||= error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = Object.fromEntries(
        Object.entries(chunks).map(([key, parts]) => [
          key,
          Buffer.concat(parts).toString("utf8"),
        ]),
      );
      if (failure || code !== 0)
        reject(
          Object.assign(failure || new Error("Command failed."), {
            code: failure?.code ?? code,
            ...result,
          }),
        );
      else resolve(result);
    });
  });
}
