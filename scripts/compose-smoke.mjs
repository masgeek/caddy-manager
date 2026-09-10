import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
    child.on("error", reject);
  });
}

try {
  await run("docker", ["compose", "up", "-d", "--build"]);
  await run("node", ["scripts/smoke.mjs"]);
} finally {
  await run("docker", ["compose", "down"]);
}
