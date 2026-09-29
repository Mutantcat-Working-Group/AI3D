import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { run, parseArgs, cliOrigin } from "../cli/ai3d.mjs";

// The manager hands its own environment to the service it starts, so this
// reaches every instance these cases open: no suite talks to the internet.
process.env.REVIEW_UPDATE_CHECK = "off";

const repo = process.cwd();
const stl =
  "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";

function workspace(t) {
  fs.mkdirSync(path.join(repo, "tmp"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(repo, "tmp", "cli-workspace-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "web"));
  fs.writeFileSync(
    path.join(dir, "web/index.html"),
    "<!doctype html><title>fixture</title>",
  );
  fs.mkdirSync(path.join(dir, "projects/lamp"), { recursive: true });
  fs.writeFileSync(path.join(dir, "projects/lamp/part.stl"), stl);
  fs.writeFileSync(
    path.join(dir, "openclaw.plugin.json"),
    JSON.stringify({ id: "ai3d" }),
  );
  return {
    dir,
    options: {
      cwd: dir,
      installRoot: dir,
      serverEntry: path.join(repo, "server/index.mjs"),
      distRoot: path.join(dir, "web"),
      environment: { REVIEW_BRIDGE: "off" },
    },
  };
}

test("arguments become the same input object the tool layer already takes", () => {
  const { action, input } = parseArgs([
    "open",
    "--project",
    "projects/lamp",
    "--file",
    "projects/lamp/part.stl",
    "--version",
    "v1",
    "--no-activate",
    "--resume",
  ]);
  assert.equal(action, "open");
  assert.deepEqual(input, {
    project: "projects/lamp",
    file: "projects/lamp/part.stl",
    version: "v1",
    activate: false,
    resume: true,
  });
  // A flag that swallows the next flag as its value is how a caller ends up
  // opening something it did not name.
  assert.throws(() => parseArgs(["status", "--project", "--owner"]), {
    code: "BAD_USAGE",
  });
  assert.throws(() => parseArgs(["status", "--nonsense", "x"]), {
    code: "BAD_USAGE",
  });
});

test("a CLI states its owner rather than being given one", () => {
  assert.throws(() => cliOrigin(undefined), { code: "MISSING_OWNER" });
  const origin = cliOrigin("a-session");
  assert.equal(origin.harness, "cli");
  assert.equal(origin.sessionKey, "a-session");
  // No route: nothing will be pushed anywhere, which is the truth about a
  // process that exits before the reviewer has finished looking.
  assert.equal(origin.route, undefined);
});

test("the CLI opens a review, reports it, and still refuses a stranger", async (t) => {
  const f = workspace(t);
  const mine = ["--owner", "cli-session-one", "--project", "projects/lamp"];
  const opened = await run(
    [
      "open",
      ...mine,
      "--file",
      "projects/lamp/part.stl",
      "--name",
      "lamp",
      "--version",
      "v1",
      "--host",
      "127.0.0.1",
      "--client-address",
      "127.0.0.1",
    ],
    f.options,
  );
  try {
    assert.ok(opened.url, "an opened review has somewhere to be looked at");

    const status = await run(["status", ...mine], f.options);
    assert.equal(status.project, "projects/lamp");
    assert.equal(status.versions.length, 1);
    assert.equal(status.origin.harness, "cli");
    // No route: nothing will announce a submission here, and the tool says so
    // rather than leaving an Agent waiting for a message that cannot arrive.
    assert.equal(status.origin.route, undefined);
    assert.deepEqual(status.notifier, { send: false, observe: false });

    // The installed-versus-running comparison used to exist only in the OpenClaw
    // adapter, so a reviewer reached through any other harness would have looked
    // at an old build with nothing saying so. It belongs to the base now.
    assert.equal(status.integrationVersion, "unknown");
    assert.equal(status.serving.running, status.version);
    assert.equal(status.serving.installed, "unknown");

    // Ownership did not loosen when the route went away. Another session asking
    // about this project gets the same refusal a different conversation gets.
    await assert.rejects(
      run(
        ["status", "--owner", "someone-else", "--project", "projects/lamp"],
        f.options,
      ),
      (error) => error.code === "RESUME_REQUIRED",
    );
    // And an invocation that names no owner at all never reaches the project.
    await assert.rejects(
      run(["status", "--project", "projects/lamp"], f.options),
      {
        code: "MISSING_OWNER",
      },
    );
  } finally {
    await run(["stop", ...mine], f.options);
  }
});

test("precheck measures a file without an owner, a project or an instance", async (t) => {
  const f = workspace(t);
  const measured = await run(
    ["precheck", "--file", "projects/lamp/part.stl"],
    f.options,
  );
  assert.equal(measured.verdict, "ok");
  assert.equal(measured.triangles, 1);
  await assert.rejects(run(["precheck"], f.options), { code: "BAD_USAGE" });
});

test("a review survives being handed from one harness to another", async (t) => {
  const f = workspace(t);
  fs.writeFileSync(
    path.join(f.dir, "projects/lamp/part-two.stl"),
    stl.replace("solid t", "solid u"),
  );
  const openFlags = (owner, file, version) => [
    "open",
    "--owner",
    owner,
    "--project",
    "projects/lamp",
    "--file",
    `projects/lamp/${file}`,
    "--name",
    "lamp",
    "--version",
    version,
    "--host",
    "127.0.0.1",
    "--client-address",
    "127.0.0.1",
  ];
  const first = await run(openFlags("harness-a", "part.stl", "v1"), f.options);
  try {
    assert.ok(first.url);
    const before = await run(
      ["status", "--owner", "harness-a", "--project", "projects/lamp"],
      f.options,
    );
    assert.equal(before.versions.length, 1);

    // Another harness does not simply take it. Continuing someone else's round
    // stays a decision a person makes, exactly as it always has been.
    await assert.rejects(
      run(openFlags("harness-b", "part-two.stl", "v2"), f.options),
      (error) => error.code === "RESUME_REQUIRED",
    );

    // Said explicitly, the handover happens — and nothing published before it
    // goes away with the harness that published it.
    const handed = await run(
      [...openFlags("harness-b", "part-two.stl", "v2"), "--resume"],
      f.options,
    );
    assert.ok(handed.url);
    const after = await run(
      ["status", "--owner", "harness-b", "--project", "projects/lamp"],
      f.options,
    );
    assert.equal(after.versions.length, 2);
    assert.deepEqual(after.versions.map((v) => v.version).sort(), ["v1", "v2"]);
    assert.equal(after.origin.sessionKey, "harness-b");
    // And the first harness is now the one that has to ask.
    await assert.rejects(
      run(
        ["status", "--owner", "harness-a", "--project", "projects/lamp"],
        f.options,
      ),
      (error) => error.code === "RESUME_REQUIRED",
    );
  } finally {
    await run(
      ["stop", "--owner", "harness-b", "--project", "projects/lamp"],
      f.options,
    );
  }
});
