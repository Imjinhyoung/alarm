import fs from "node:fs";
import { chromium } from "playwright";
import { collectKdt70 } from "./work24-kdt.mjs";
import { collectLinkareer } from "./linkareer.mjs";

// Read-only: exercise the production collectors without writing state/alerts
// or creating GitHub issues. Recheck three previously discovered real posts
// so the qualification and image paths are tested even without fresh posts.
const previous = JSON.parse(fs.readFileSync(new URL("./state.json", import.meta.url), "utf8"));
const oldLinkareer = previous.sites.linkareer_intern;
if (!Array.isArray(oldLinkareer?.knownIds)) throw new Error("링커리어 기존 기준선이 없습니다.");
const recheckIds = ["364846", "364614", "364554"];
const snapshot = { ...oldLinkareer, knownIds: oldLinkareer.knownIds.filter(id => !recheckIds.includes(id)) };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "ko-KR", timezoneId: "Asia/Seoul", ignoreHTTPSErrors: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" });
  const kdtPage = await context.newPage();
  const linkPage = await context.newPage();
  const results = await Promise.allSettled([
    collectKdt70(kdtPage, { id: "work24_kdt70" }),
    collectLinkareer(linkPage, { id: "linkareer_intern", url: "https://linkareer.com/list/intern?orderBy_direction=DESC&orderBy_field=RECENT&page=1" }, snapshot)
  ]);
  for (const [i, result] of results.entries()) {
    const name = i === 0 ? "고용24 반도체 KDT 70일" : "링커리어 재학생·국내·3개월 인턴";
    if (result.status === "rejected") {
      console.error(JSON.stringify({ name, success: false, error: String(result.reason?.message || result.reason) }));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ name, success: true, readOnly: true, forcedRecheckIds: i === 1 ? recheckIds : undefined, stats: result.value.metadata?.filterStats, matches: result.value.map(({ title, url, period, matchReasons }) => ({ title, url, period, matchReasons })) }));
    }
  }
} finally { await browser.close(); }
