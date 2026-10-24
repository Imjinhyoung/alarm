import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "alarm-save-test-"));
const remote = path.join(root, "remote.git");
const worker = path.join(root, "worker");
const deployment = path.join(root, "deployment");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
git(root, "init", "--bare", remote);
git(root, "clone", remote, worker);
for (const folder of [worker]) {
  git(folder, "config", "user.name", "State test");
  git(folder, "config", "user.email", "test@example.invalid");
}
git(worker, "checkout", "-b", "main");
const initial = { version: 1, checkedAt: "2026-10-24T00:00:00Z", sites: { semi: { items: [] }, skku_test: { items: [] } } };
await fs.writeFile(path.join(worker, "state.json"), JSON.stringify(initial));
git(worker, "add", "."); git(worker, "commit", "-m", "initial"); git(worker, "push", "-u", "origin", "main");
git(root, "clone", "--branch", "main", remote, deployment);
git(deployment, "config", "user.name", "State test"); git(deployment, "config", "user.email", "test@example.invalid");
await fs.writeFile(path.join(deployment, "state.json"), JSON.stringify({ ...initial, checkedAt: "2026-10-24T02:00:00Z", sites: { ...initial.sites, skku_test: { items: ["new school"] } } }));
await fs.writeFile(path.join(deployment, "new-code.txt"), "concurrent deployment");
git(deployment, "add", "."); git(deployment, "commit", "-m", "concurrent update"); git(deployment, "push");
await fs.writeFile(path.join(worker, "state.json"), JSON.stringify({ ...initial, checkedAt: "2026-10-24T01:00:00Z", sites: { ...initial.sites, semi: { items: ["new semi"] } } }));
execFileSync(process.execPath, [fileURLToPath(new URL("./save-state.mjs", import.meta.url))], { cwd: worker, env: { ...process.env, SITE_GROUP: "training" }, stdio: "pipe" });
git(deployment, "pull", "--ff-only");
const actual = JSON.parse(await fs.readFile(path.join(deployment, "state.json"), "utf8"));
assert.deepEqual(actual.sites.semi.items, ["new semi"]);
assert.deepEqual(actual.sites.skku_test.items, ["new school"]);
assert.equal(actual.checkedAt, "2026-10-24T02:00:00Z");
assert.equal(await fs.readFile(path.join(deployment, "new-code.txt"), "utf8"), "concurrent deployment");
console.log("PASS: 동시 코드 배포와 다른 그룹 기준선을 보존하며 현재 그룹 결과 저장");
