/**
 * Tauri `beforeDevCommand`: start Vite only if nothing is already serving devUrl.
 * Avoids "Port 5173 is already in use" when `npm run dev` runs separately or a stale
 * Node process still holds the port while `npm run tauri dev` is started.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEV_URL = new URL(process.env.TAURI_DEV_URL ?? "http://127.0.0.1:5173/");

function viteAlreadyRunning() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: DEV_URL.hostname,
        port: DEV_URL.port || 5173,
        path: "/",
        method: "GET",
        timeout: 400,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode != null && res.statusCode < 500);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

if (await viteAlreadyRunning()) {
  console.log(`[skyhaven] Vite already reachable at ${DEV_URL.origin} — skipping second dev server.`);
  process.exit(0);
}

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  cwd: root,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
