import { execFileSync, spawnSync } from "node:child_process";

const output = execFileSync("git", ["status", "--porcelain=v1", "-z"], {
  encoding: "utf8",
});
const supported = /\.(?:ts|tsx|json|md)$/i;
const files = output
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3))
  .filter((file) => supported.test(file));

if (files.length === 0) {
  console.log("No uncommitted Prettier-supported files found.");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "prettier", "--write", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
