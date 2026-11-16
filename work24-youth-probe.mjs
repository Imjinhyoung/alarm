import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import { chromium } from "playwright";

// Exercise the existing collector with the original date condition. Read only:
// no monitoring-state writes, issues, scheduled runs, or email delivery.
const source = fs.readFileSync(new URL("./monitor.mjs", import.meta.url), "utf8");
const scope = vm.createContext({ URL, crypto });
vm.runInContext(source.slice(source.indexOf("const clean ="), source.indexOf("function statusOf(")) + source.slice(source.indexOf("async function collectWork24("), source.indexOf("async function main(")) + ";globalThis.collect = collectWork24;", scope);
const site = { id: "work24_winter", url: "https://yw.work24.go.kr/d/a/selectWkexPrgmList.do?operBe=1&operBgde=2026-12-01&operEnde=2027-02-28&recordCountPerPage=48&listCnt=48&currentPageNo=1" };
const browser = await chromium.launch({ headless: true, ...(process.env.PROBE_BROWSER_CHANNEL ? { channel: process.env.PROBE_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ locale: "ko-KR", ignoreHTTPSErrors: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" });
  const items = await scope.collect(page, site);
  if (!(await page.locator("#operBe1").isChecked())) throw new Error("참여기간 시작일 기준이 적용되지 않았습니다.");
  console.log(JSON.stringify({ success: true, condition: "참여 시작 2026-12-01~2027-02-28 / 지역·직무·유형 전체", count: items.length, sample: items.slice(0, 10).map(({ title, period, url }) => ({ title, period, url })) }));
} finally { await browser.close(); }
