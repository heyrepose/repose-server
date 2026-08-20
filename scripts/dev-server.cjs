/**
 * Dev API process: runs dist/main.js and restarts when tsc rewrites dist/.
 * Use: pnpm api   (not `pnpm server` — that is a pnpm built-in for the package store)
 */
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const entry = path.join(root, "dist", "main.js");
const distDir = path.join(root, "dist");
const port = Number(process.env.PORT || 4000);

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[api] ${msg}`);
}

function err(msg) {
  // eslint-disable-next-line no-console
  console.error(`[api] ${msg}`);
}

if (!fs.existsSync(entry)) {
  err(
    "dist/main.js not found.\n" +
      "         In another terminal: pnpm com\n" +
      '         Wait for "Found 0 errors", then run pnpm api again.',
  );
  process.exit(1);
}

/** PIDs listening on TCP port (Windows netstat). */
function pidsOnPort(p) {
  const pids = new Set();
  try {
    // Prefer cmd.exe netstat so Git Bash doesn't rewrite the path.
    const out = execFileSync("cmd.exe", ["/c", "netstat", "-ano"], {
      encoding: "utf8",
      windowsHide: true,
    });
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      // Match :4000 as a port bound (IPv4 or IPv6), not :40000 etc.
      if (!line.match(new RegExp(`:${p}(?!\\d)`))) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(Number(pid));
    }
  } catch {
    /* ignore */
  }
  return [...pids];
}

function killPort(p) {
  const pids = pidsOnPort(p).filter((pid) => pid !== process.pid);
  if (!pids.length) return;
  for (const pid of pids) {
    log(`port ${p} busy — stopping PID ${pid}`);
    try {
      execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      try {
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
          ],
          { stdio: "ignore", windowsHide: true },
        );
      } catch {
        err(`could not stop PID ${pid} — free port ${p} manually`);
      }
    }
  }
}

function canBind(p, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => {
      s.close(() => resolve(true));
    });
    s.listen(p, host);
  });
}

async function ensurePortFree(p) {
  // Always clear listeners first — on Windows IPv6 :::port can be busy
  // while an IPv4 probe still succeeds, so don't trust a single bind check.
  killPort(p);

  for (let i = 0; i < 10; i++) {
    const v4 = await canBind(p, "0.0.0.0");
    const v6 = await canBind(p, "::");
    if (v4 && v6) return;
    killPort(p);
    await new Promise((r) => setTimeout(r, 300));
  }

  const left = pidsOnPort(p);
  if (left.length) {
    err(
      `port ${p} still in use by PID(s) ${left.join(", ")}. ` +
        `Run: taskkill /PID ${left[0]} /F`,
    );
    process.exit(1);
  }
}

let child = null;
let restartTimer = null;
let shuttingDown = false;

function stopChild() {
  if (!child) return;
  const c = child;
  child = null;
  try {
    c.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  // Windows: ensure the tree is gone before rebinding the port.
  try {
    if (c.pid) {
      execFileSync("taskkill.exe", ["/PID", String(c.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  } catch {
    /* already dead */
  }
}

function startChild() {
  if (shuttingDown) return;
  stopChild();
  log(`starting node dist/main.js (port ${port})`);
  child = spawn(process.execPath, ["--enable-source-maps", entry], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  child.on("exit", (code, signal) => {
    if (child === null) return;
    child = null;
    if (shuttingDown) return;
    if (signal) {
      err(`process killed (${signal})`);
      return;
    }
    if (code === 0) {
      err("process exited — waiting for next compile to restart");
      return;
    }
    err(
      `process exited with code ${code} — waiting for next compile to restart`,
    );
  });
}

function scheduleRestart(reason) {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    log(`reload (${reason})`);
    void ensurePortFree(port).then(() => startChild());
  }, 500);
}

async function main() {
  await ensurePortFree(port);

  log("watching dist/ for changes — Ctrl+C to stop");
  startChild();

  let watch;
  try {
    watch = fs.watch(distDir, { recursive: true }, (_event, filename) => {
      if (!filename) {
        scheduleRestart("dist change");
        return;
      }
      if (!String(filename).endsWith(".js")) return;
      scheduleRestart(String(filename));
    });
  } catch (e) {
    err(`could not watch dist/: ${/** @type {Error} */ (e).message}`);
    err("API will not auto-restart on compile — restart pnpm api manually.");
  }

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (restartTimer) clearTimeout(restartTimer);
    try {
      watch?.close();
    } catch {
      /* ignore */
    }
    stopChild();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
