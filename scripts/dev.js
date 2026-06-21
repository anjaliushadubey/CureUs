import { spawn } from "node:child_process";

const processes = [
  spawn("node server/auth-server.js", { stdio: "inherit", shell: true }),
  spawn("npm run dev:frontend -- --host 127.0.0.1", { stdio: "inherit", shell: true })
];

function stopAll(code = 0) {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) stopAll(code);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
