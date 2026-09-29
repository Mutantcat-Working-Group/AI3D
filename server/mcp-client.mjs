import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicJson } from "./store.mjs";
import { log, errorDetail } from "./log.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

/* A minimal MCP client over stdio, written against the same newline-delimited
   JSON-RPC wire the bundled `ai3d-mcp` server speaks. It launches a
   user-configured local process only; nothing here accepts a remote command. */
export class McpSession {
  constructor(
    { id, name, command, args },
    { cwd, clientName = "ai3d", clientVersion = "0" } = {},
  ) {
    this.id = id;
    this.name = name;
    this.command = command;
    this.args = args || [];
    this.cwd = cwd;
    this.clientInfo = { name: clientName, version: clientVersion };
    this.child = null;
    this.buffer = "";
    this.pending = new Map();
    this.tools = [];
    this.connected = false;
    this.lastError = null;
  }

  request(method, params = {}, { timeoutMs = 20000 } = {}) {
    if (
      !this.child ||
      this.child.exitCode !== null ||
      this.child.signalCode !== null
    )
      return Promise.reject(
        new Error("The MCP connection is not running; connect it first."),
      );
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.close();
        reject(
          new Error(
            `The MCP method ${method} timed out after ${timeoutMs} ms and the connection was closed.`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        this.close();
        reject(
          new Error(
            `The MCP server did not accept input: ${String(error.message || error)}`,
          ),
        );
      }
    });
  }

  notify(method, params = {}) {
    if (!this.child || this.child.exitCode !== null) return;
    try {
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
      );
    } catch {
      this.close();
    }
  }

  open() {
    if (this.child) return;
    this.buffer = "";
    this.nextId = 1;
    this.tools = [];
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => this.onData(chunk));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => this.onStderr(chunk));
    child.on("error", (error) => this.onError(error));
    child.on("exit", (code, signal) => this.onExit(code, signal));
  }

  async connect() {
    this.open();
    try {
      const initialized = await this.request(
        "initialize",
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: this.clientInfo,
        },
        { timeoutMs: 15000 },
      );
      const listed = await this.request("tools/list", {});
      this.notify("notifications/initialized");
      this.tools = Array.isArray(listed?.tools) ? listed.tools : [];
      this.connected = true;
      this.lastError = null;
      return this.snapshot();
    } catch (error) {
      this.lastError = String(error.message || error).slice(0, 300);
      log.warn("mcp", "connection failed", {
        id: this.id,
        ...errorDetail(error),
      });
      this.close();
      throw error;
    }
  }

  async callTool(name, args) {
    if (!this.connected)
      throw new Error("The MCP connection is not connected; connect it first.");
    const result = await this.request(
      "tools/call",
      { name, arguments: args || {} },
      { timeoutMs: 120000 },
    );
    return {
      isError: result?.isError === true,
      content: result?.content || [],
      structuredContent: result?.structuredContent ?? null,
    };
  }

  snapshot() {
    return {
      id: this.id,
      name: this.name,
      command: this.command,
      args: this.args,
      connected: this.connected,
      tools: this.connected ? this.tools : [],
      lastError: this.lastError,
    };
  }

  close() {
    this.connected = false;
    this.tools = [];
    const child = this.child;
    this.child = null;
    if (!child) return;
    try {
      child.stdin.end();
    } catch {
      /* already closed */
    }
    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, 1000);
    killTimer.unref?.();
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error("The MCP connection was closed."));
    }
    this.pending.clear();
  }

  onData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        log.warn("mcp", "ignoring non-JSON output from MCP server", {
          id: this.id,
          line: line.slice(0, 200),
        });
        continue;
      }
      if (message.id === undefined) continue; // server notification
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            String(
              message.error.message || JSON.stringify(message.error),
            ).slice(0, 300),
          ),
        );
      } else {
        pending.resolve(message.result);
      }
    }
  }

  onStderr(chunk) {
    const line = String(chunk).trim().slice(0, 500);
    if (line) log.warn("mcp", "server stderr", { id: this.id, line });
  }

  onError(error) {
    const reason =
      error.code === "ENOENT"
        ? "the MCP command was not found"
        : `the MCP command failed to start (${error.code || "UNKNOWN"})`;
    this.lastError = reason;
    log.warn("mcp", reason, { id: this.id, ...errorDetail(error) });
    this.close();
  }

  onExit(code, signal) {
    const reason =
      signal != null
        ? `the MCP server exited on ${signal}`
        : `the MCP server exited with code ${code}`;
    this.lastError = this.lastError || reason;
    this.connected = false;
    this.close();
  }
}

/* Connections live in their own file beside review state. They are local
   launcher configuration, not part of a review round, so they must not travel
   with state.json, and the browser may not invent a process to run: every
   command here was saved by a user action on this service. */
export class McpConnections {
  constructor(runtime, { workspace, clientName, clientVersion } = {}) {
    this.file = path.join(runtime, "mcp-connections.json");
    this.workspace = workspace;
    this.clientName = clientName;
    this.clientVersion = clientVersion;
    this.connections = new Map();
    this.sessions = new Map();
    this.load();
  }

  load() {
    let entries = [];
    try {
      if (fs.existsSync(this.file))
        entries = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (error) {
      log.warn("mcp", "connection file was not readable; starting empty", {
        file: this.file,
        ...errorDetail(error),
      });
    }
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (
        typeof entry?.id !== "string" ||
        typeof entry.command !== "string" ||
        !entry.command.trim()
      )
        continue;
      this.connections.set(entry.id, {
        id: entry.id,
        name: String(entry.name || entry.command),
        command: entry.command,
        args: Array.isArray(entry.args)
          ? entry.args.map(String).filter(Boolean)
          : [],
      });
    }
  }

  save() {
    atomicJson(
      this.file,
      [...this.connections.values()].map(({ id, name, command, args }) => ({
        id,
        name,
        command,
        args,
      })),
    );
  }

  list() {
    return [...this.connections.values()].map((connection) => {
      const session = this.sessions.get(connection.id);
      return {
        ...connection,
        connected: !!session?.connected,
        tools: session?.connected ? session.tools : [],
        lastError: session?.lastError || null,
      };
    });
  }

  upsert({ id, name, command, args }) {
    const nextId = id && this.connections.has(id) ? id : crypto.randomUUID();
    const connection = {
      id: nextId,
      name: String(name || command).slice(0, 80),
      command,
      args: (args || []).map(String).filter(Boolean),
    };
    this.connections.set(nextId, connection);
    this.save();
    return connection;
  }

  remove(id) {
    this.disconnect(id);
    this.connections.delete(id);
    this.save();
  }

  async connect(id) {
    const connection = this.connections.get(id);
    if (!connection) throw new Error("No such MCP connection; save it first.");
    await this.disconnect(id);
    const session = new McpSession(connection, {
      cwd: this.workspace,
      clientName: this.clientName,
      clientVersion: this.clientVersion,
    });
    this.sessions.set(id, session);
    try {
      return await session.connect();
    } catch (error) {
      this.sessions.delete(id);
      throw error;
    }
  }

  disconnect(id) {
    const session = this.sessions.get(id);
    if (!session) return { id, connected: false };
    this.sessions.delete(id);
    session.close();
    return { id, connected: false };
  }

  async callTool(id, name, args) {
    const session = this.sessions.get(id);
    if (!session?.connected)
      throw new Error(
        "The MCP connection is not connected; connect it before calling a tool.",
      );
    return session.callTool(name, args);
  }
}
