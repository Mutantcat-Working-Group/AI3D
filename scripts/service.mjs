import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listenerConfig } from "../server/network.mjs";
import { readInstance, INTEGRATION_API } from "../server/instance.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.resolve(
  process.env.REVIEW_DATA_DIR || path.join(repo, "runtime"),
);
const port = Number(process.env.PORT || 43173),
  pidFile = path.join(runtime, "server.pid");
const command = process.argv[2] || "status";
const configFile = path.join(runtime, "config.json");
const config = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, "utf8"))
  : {};
const instance = readInstance(config);
const network = listenerConfig(
  process.env.REVIEW_HOST || config.host || "127.0.0.1",
);
const url = `http://${network.host}:${port}/`;
async function health() {
  try {
    const response = await fetch(`${url}api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await response.json();
    if (data.app !== "3d-agent-review") return null;
    if (
      instance &&
      (data.instance?.id !== instance.id ||
        data.instance?.projectId !== instance.projectId ||
        data.integrationApi !== INTEGRATION_API)
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
async function stop() {
  const current = await health();
  if (!current) {
    console.log("No AI3D review service is running on this port.");
    return;
  }
  if (
    !fs.existsSync(pidFile) ||
    Number(fs.readFileSync(pidFile, "utf8")) !== current.pid
  )
    throw new Error("PID mismatch; no process was stopped.");
  process.kill(current.pid, "SIGTERM");
  for (let i = 0; i < 40; i++) {
    if (!(await health())) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    "The service has not finished stopping and was not force-killed.",
  );
}
async function start() {
  if (await health()) {
    console.log(`AI3D review service started: ${url} (runtime ${runtime})`);
    return;
  }
  fs.mkdirSync(runtime, { recursive: true });
  const log = fs.openSync(path.join(runtime, "server.log"), "a", 0o600);
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repo,
    env: process.env,
    stdio: ["ignore", log, log],
    detached: true,
  });
  child.unref();
  fs.closeSync(log);
  for (let i = 0; i < 60; i++) {
    const up = await health();
    if (up) {
      // Record the pid the service reports, and only once it is actually
      // serving. Writing it before meant a child that died on a busy port left
      // a stale pid behind, and every later stop refused with "PID mismatch".
      fs.writeFileSync(pidFile, `${up.pid}\n`, { mode: 0o600 });
      console.log(
        `AI3D review service started: ${url} (runtime ${runtime})`,
      );
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `The service did not start; see ${path.join(runtime, "server.log")}. No PID file was written.`,
  );
}
if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "restart") {
  await stop();
  await start();
} else if (command === "status")
  // Always name the runtime being addressed: every REVIEW_* path comes from
  // the ambient environment, and reading the wrong instance has already cost
  // a debugging session once.
  console.log(
    JSON.stringify(
      { runtime, url, ...((await health()) || { ok: false }) },
      null,
      2,
    ),
  );
else throw new Error("Commands: start, stop, restart, status");
