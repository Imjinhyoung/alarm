import { chromium, request } from "playwright";

// Read-only probe of the exact public training-course URL supplied by the user.
// This script never updates monitoring state, creates issues, or sends mail.
const url = "https://m.work24.go.kr/hr/a/a/1100/trnnCrsInf2.do?dghtSe=A&traingMthCd=A&tracseTme=29&endDate=20271116&keyword1=&keyword2=&pageSize=10&orderBy=ASC&startDate_datepicker=2026-11-16&currentTab=1&topMenuYn=&pop=&tracseId=AIG20250000539952&pageRow=10&totamtSuptYn=A&ncsSearchKeyword=&keywordTrngNm=&crseTracseSeNum=&keywordType=1&gb=&keyword=%EB%B0%98%EB%8F%84%EC%B2%B4&kDgtlYn=&area=00%7C%EC%A0%84%EA%B5%AD+%EC%A0%84%EC%B2%B4&orderKey=2&mberSe=&kdgLinkYn=&srchType=all_type&crseTracseSe=A%7C%EB%94%94%EC%A7%80%ED%84%B8%EC%8B%A0%EA%B8%B0%EC%88%A0%EB%B6%84%EC%95%BC+%EC%A0%84%EC%B2%B4&tranRegister=&mberId=&i2=A&pageId=6&areaSearchKeyword=&programMenuIdentification=EBG020000000313&crseTracseSeKDT=A_KDT%7C%ED%9B%88%EB%A0%A8%EC%9C%A0%ED%98%95+%EC%A0%84%EC%B2%B4&endDate_datepicker=2027-11-16&monthGubun=&pageOrder=2ASC&pageIndex=1&bgrlInstYn=&startDate=20261116&ncs=&gvrnInstt=&selectNCSKeyword=&compareArgArr=&action=trnnCrsInf2Post.do";
const errors = [];
let receivedHtml;
const client = await request.newContext({ ignoreHTTPSErrors: true });
try {
  const response = await client.get(url, { timeout: 30000 });
  const html = await response.text();
  if (response.ok()) receivedHtml = html;
  console.log(JSON.stringify({ method: "HTTP", status: response.status(), url: response.url(), bytes: html.length, title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(), excerpt: html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1600) }));
} catch (error) { errors.push(`HTTP: ${error.message}`); }
finally { await client.dispose(); }

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PROBE_BROWSER_CHANNEL ? { channel: process.env.PROBE_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ locale: "ko-KR", ignoreHTTPSErrors: true });
  if (!receivedHtml) throw new Error("HTTP 조회로 유효한 HTML을 받지 못했습니다.");
  // The live site's scripts replace browser globals and break automation's
  // selector engine. Training results are already server-rendered, so parse
  // the received HTML without executing scripts or fetching assets.
  await page.route("**/*", route => route.abort());
  await page.setContent(receivedHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""), { waitUntil: "domcontentloaded", timeout: 15000 });
  const text = await page.locator("body").innerText({ timeout: 5000 });
  const html = await page.content();
  const hasCourseId = html.includes("AIG20250000539952");
  const courseIds = await page.locator('input[name="tracseId"][value]').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  const courseNames = await page.locator('a[onclick*="fn_viewTracseInfo"]').allTextContents();
  const labels = ["훈련기간", "훈련시간", "훈련비", "훈련기관", "훈련과정"].filter(label => text.includes(label));
  const contentLoaded = courseIds.length > 0 && courseNames.some(name => name.trim()) && labels.length >= 3 && !/접근이 차단|자동입력 방지|비정상적인 접근/.test(text);
  console.log(JSON.stringify({ method: "static HTML parser", title: await page.title(), hasCourseId, requestedCourseInResults: courseIds.includes("AIG20250000539952"), courseIds, courseNames: courseNames.map(name => name.trim()).filter(Boolean).slice(0, 10), resultCount: text.match(/전체\s*(\d+)\s*건/)?.[1], labels, contentLoaded, excerpt: text.slice(-1800) }));
  if (!contentLoaded) process.exitCode = 1;
} catch (error) { errors.push(`browser: ${error.message}`); process.exitCode = 1; }
finally { if (browser) await browser.close(); }
for (const error of errors) console.log(error);
