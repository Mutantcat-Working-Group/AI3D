import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { agentSocketPath, readInstance } from "../../server/instance.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function startReview(
  t,
  {
    protectedAccess = false,
    origin,
    host = "127.0.0.1",
    instance,
    workspace,
    managed = false,
    stallAfter,
    idleHours,
    idleTickMs,
  } = {},
) {
  const repo = process.cwd();
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "http-review-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.copyFileSync(
    path.join(repo, "tests/fake-openclaw.mjs"),
    path.join(bin, "openclaw"),
  );
  fs.chmodSync(path.join(bin, "openclaw"), 0o755);
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify({ origin, instance, managed }),
  );
  let port = "0";
  const launch = () =>
    spawn(process.execPath, ["server/index.mjs"], {
      cwd: repo,
      env: {
        ...process.env,
        PORT: port,
        REVIEW_HOST: host,
        REVIEW_DATA_DIR: dir,
        ...(workspace ? { REVIEW_WORKSPACE: workspace } : {}),
        REVIEW_MEDIA_DIR: path.join(dir, "models"),
        // A test that passes no origin gets none: giving a string here would
        // invent a webchat route, which changes "no origin" into "an origin
        // whose bridge happens to be reachable." Absence is the honest shape.
        ...(origin ? { REVIEW_SESSION_KEY: "" } : {}),
        REVIEW_BRIDGE: "on",
        REVIEW_OUTBOX_MS: "1000",
        // Absent means the 24-hour default, which no test can sit through; a
        // test that wants reclaiming says so in seconds.
        ...(idleHours === undefined
          ? {}
          : { REVIEW_IDLE_HOURS: String(idleHours) }),
        ...(idleTickMs ? { REVIEW_IDLE_TICK_MS: String(idleTickMs) } : {}),
        ...(stallAfter ? { REVIEW_STALL_AFTER: String(stallAfter) } : {}),
        REVIEW_ACCESS: protectedAccess ? "required" : "",
        REVIEW_ALLOWED_HOSTS: "review.test",
        REVIEW_UPDATE_CHECK: "off",
        REVIEW_DIST_DIR: path.join(repo, "tmp/refinement-dist"),
        REVIEW_FAKE_GATEWAY_LOG: path.join(dir, "fake-gateway.json"),
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
      stdio: "ignore",
    });
  let child = launch();
  async function stopChild() {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await Promise.race([exited, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  }
  t.after(async () => {
    await stopChild();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  function ipc(route, body) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath: agentSocketPath(
            dir,
            readInstance(
              JSON.parse(
                fs.readFileSync(path.join(dir, "config.json"), "utf8"),
              ),
            ),
          ),
          path: route,
          method: body === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          let data = "";
          res.on("data", (part) => {
            data += part;
          });
          res.on("end", () => {
            // A route the server does not have answers in HTML, and a test
            // about unroutable requests cannot assert on a response the
            // fixture refused to hand back.
            let body;
            try {
              body = JSON.parse(data);
            } catch {
              body = undefined;
            }
            resolve({ status: res.statusCode, body, text: data });
          });
        },
      );
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function waitReady() {
    let status;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("Isolated review failed to start");
      try {
        status = await ipc("/status");
        if (status.body.network?.port) break;
      } catch {
        /* starting */
      }
      await delay(30);
    }
    if (!status?.body?.network?.port)
      throw new Error("Isolated review readiness timed out");
    return status;
  }
  const status = await waitReady();
  port = String(status.body.network.port);
  const url = `http://${status.body.network.host}:${status.body.network.port}`;
  async function restart(whileStopped) {
    await stopChild();
    await whileStopped?.();
    child = launch();
    await waitReady();
  }
  function api(route, { method = "GET", body, cookie, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        new URL(`${url}/api/${route}`),
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Review-Client": "1",
            ...(payload
              ? { "Content-Length": Buffer.byteLength(payload) }
              : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (part) => chunks.push(part));
          res.on("end", () => {
            const raw = Buffer.concat(chunks);
            const text = raw.toString();
            let value;
            try {
              value = JSON.parse(text);
            } catch {
              value = text;
            }
            const responseHeaders = new Headers();
            for (const [key, values] of Object.entries(res.headers))
              for (const value of Array.isArray(values) ? values : [values])
                if (value !== undefined) responseHeaders.append(key, value);
            resolve({
              status: res.statusCode,
              body: value,
              raw,
              headers: responseHeaders,
            });
          });
        },
      );
      req.setTimeout(5000, () =>
        req.destroy(new Error("Fixture HTTP request timed out")),
      );
      req.on("error", reject);
      req.end(payload);
    });
  }
  async function publish(
    version = "v1",
    name = "parametric-bracket.glb",
    originValue,
    // A source the viewer cannot draw does not live with the drawable samples,
    // so a test that needs one says where its file is instead.
    file = `tmp/samples/${name}`,
  ) {
    const r = await ipc("/publish", {
      file,
      name: "Isolated review",
      version,
      ...(originValue ? { origin: originValue } : {}),
    });
    if (r.status !== 200)
      throw new Error("Isolated fixture model failed to publish");
    return r.body.model;
  }
  const alive = () => child.exitCode === null && child.signalCode === null;
  const waitExit = (ms = 5000) =>
    alive()
      ? Promise.race([once(child, "exit").then(() => true), delay(ms)]).then(
          () => !alive(),
        )
      : Promise.resolve(true);
  return { repo, dir, url, ipc, api, publish, restart, alive, waitExit };
}
