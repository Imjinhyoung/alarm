import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Commit from the current remote branch, merging only the group checked by
// this run. A concurrent code deployment must not discard another group's state.
const pending = JSON.parse(await fs.readFile("state.json", "utf8"));
const group = process.env.SITE_GROUP || "training";
const git = (args, cwd = process.cwd()) => execFileSync("git", args, { cwd, encoding: "utf8" });
for (let attempt = 1; attempt <= 3; attempt += 1) {
  git(["fetch", "origin", "main"]);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "alarm-state-"));
  git(["worktree", "add", "--detach", folder, "origin/main"]);
  const file = path.join(folder, "state.json");
  const current = JSON.parse(await fs.readFile(file, "utf8"));
  for (const [id, site] of Object.entries(pending.sites)) {
    if ((id.startsWith("skku_") ? "school" : "training") === group) current.sites[id] = site;
  }
  current.checkedAt = [current.checkedAt, pending.checkedAt].sort().at(-1);
  await fs.writeFile(file, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  git(["add", "state.json"], folder);
  if (!git(["diff", "--cached", "--name-only"], folder).trim()) break;
  git(["commit", "-m", "chore: update monitoring state"], folder);
  try {
    git(["push", "origin", "HEAD:main"], folder);
    break;
  } catch (error) {
    if (attempt === 3) throw error;
  }
}
