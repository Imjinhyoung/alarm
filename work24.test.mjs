import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./monitor.mjs", import.meta.url), "utf8");
const context = vm.createContext({ URL, crypto });
vm.runInContext(source.slice(source.indexOf("const clean ="), source.indexOf("function statusOf(")) + source.slice(source.indexOf("async function collectWork24("), source.indexOf("async function main(")) + ";globalThis.collect = collectWork24;", context);
const site = { id: "work24_winter", url: "https://yw.work24.go.kr/d/a/selectWkexPrgmList.do?operBe=1&operBgde=2026-12-01&operEnde=2027-02-28" };
function pageFor(rows, total = rows.length, pages = 1) {
  let pageNo = 1;
  return {
    async goto(url) { pageNo = Number(new URL(url).searchParams.get("currentPageNo")); },
    async content() { return `totalRecordCount : "${total}", totalPageCount : "${pages}"`; },
    locator(selector) { return {
      async inputValue() { return selector === "#operBgde" ? "2026-12-01" : "2027-02-28"; },
      async evaluateAll() { return rows.map(row => ({ ...row, href: row.href.replace("PROGRAM", `PROGRAM${pageNo}`) })); }
    }; }
  };
}
assert.equal((await context.collect(pageFor([]), site)).length, 0);
const row = { title: "동계 프로그램", href: "javascript:fn_searchDetail('I','PROGRAM');", participation: "26-12-01 ~ 27-03-01", recruitment: "26-10-10 ~ 26-11-20", context: "동계 프로그램" };
const items = await context.collect(pageFor([row], 2, 2), site);
assert.equal(items.length, 2);
assert.notEqual(items[0].key, items[1].key);
assert.equal(items[0].key, (await context.collect(pageFor([row]), site))[0].key);
await assert.rejects(context.collect(pageFor([{ ...row, participation: "26-11-30 ~ 27-02-28" }]), site), /필터/);
await assert.rejects(context.collect(pageFor([], 1), site), /구조/);
console.log("PASS: 정상 0건, 전체 페이지 수집, 고유 ID 유지, 조건 이탈 및 파싱 실패 검출");
