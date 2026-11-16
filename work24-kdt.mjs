import crypto from "node:crypto";

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const DAY = 86400000;

export function inclusiveDays(start, end) {
  const parse = text => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return NaN;
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === text ? date.valueOf() : NaN;
  };
  const from = parse(start), to = parse(end);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? (to - from) / DAY + 1 : null;
}

export function searchUrl(now = new Date(), page = 1) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = key => parts.find(p => p.type === key).value;
  const start = `${part("year")}-${part("month")}-${part("day")}`;
  const endDate = new Date(`${start}T00:00:00Z`); endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
  const end = endDate.toISOString().slice(0, 10);
  const url = new URL("https://m.work24.go.kr/hr/a/a/1100/trnnCrsInf2.do");
  for (const [key, value] of Object.entries({ keyword: "반도체", keywordType: "1", srchType: "all_type", area: "00|전국 전체", dghtSe: "A", traingMthCd: "A", totamtSuptYn: "A", startDate: start.replaceAll("-", ""), endDate: end.replaceAll("-", ""), startDate_datepicker: start, endDate_datepicker: end, pageRow: "10", pageSize: "10", pageIndex: String(page), currentTab: "1", pageId: "6", pageOrder: "2ASC", orderKey: "2", orderBy: "ASC", programMenuIdentification: "EBG020000000313", crseTracseSe: "A|디지털신기술분야 전체", action: "trnnCrsInf2Post.do" })) url.searchParams.set(key, value);
  for (const [code, label] of [["kdgtal_tgcr_yn", "K-디지털트레이닝"], ["kdgtal_tgcr_shrt_yn", "K-디지털트레이닝(단기)"], ["kdgtal_tgcr_ai_cam_yn", "K-디지털트레이닝(AI캠퍼스)"]]) url.searchParams.append("crseTracseSeKDT", `${code}|${label}`);
  return url;
}

export function filterCourses(rows, from, stats = {}) {
  const accepted = new Map();
  Object.assign(stats, { listedRounds: rows.length, eligible: 0, excludedType: 0, excludedPeriod: 0, excludedClosed: 0, unknownDate: 0 });
  for (const row of rows) {
    if (!/^K-?디지털트레이닝(?:\(.*\))?$/.test(clean(row.type).replace(/\s/g, ""))) { stats.excludedType += 1; continue; }
    if (row.status !== "모집중") { stats.excludedClosed += 1; continue; }
    const dates = clean(row.dates).match(/(20\d{2}-\d{2}-\d{2})\s*[~～]\s*(20\d{2}-\d{2}-\d{2})/);
    const days = dates ? inclusiveDays(dates[1], dates[2]) : null;
    if (days === null) { stats.unknownDate += 1; continue; }
    if (dates[1] < from || days > 70) { stats.excludedPeriod += 1; continue; }
    if (!row.id || !row.round || !row.title) throw new Error("고용24 과정·회차 식별자 누락");
    const url = new URL("https://m.work24.go.kr/hr/a/a/3100/selectTracseDetl1Post.do");
    for (const [key, value] of Object.entries({ tracseId: row.id, tracseTme: row.round, crseTracseSe: row.code || "C0061", trainstCstmrId: row.customer || "", programMenuIdentification: "EBG020000000313" })) url.searchParams.set(key, value);
    const item = { title: `${clean(row.title)} (${row.round}회차)`, url: url.href, status: "모집중", period: `${dates[1]} ~ ${dates[2]} (달력 기준 ${days}일)`, matchReasons: [`유형: ${clean(row.type)}`, `검색어: 반도체`, `기관: ${clean(row.provider)}`, `개강~종료 ${days}일 (시작·종료일 포함, 최대 70일)`], context: `${clean(row.type)} / ${clean(row.provider)} / ${days}일` };
    accepted.set(`${row.id}|${row.round}`, item);
  }
  stats.eligible = accepted.size;
  return [...accepted.values()];
}

export async function collectKdt70(page, site) {
  const rows = [];
  let pages = 1;
  let total = null;
  const first = searchUrl();
  const seenPages = new Set();
  await page.route("**/*", route => route.abort());
  for (let n = 1; n <= pages; n += 1) {
    const url = new URL(first); url.searchParams.set("pageIndex", n);
    const response = await page.request.get(url.href, { timeout: 45000 });
    if (!response.ok()) throw new Error(`고용24 KDT HTTP ${response.status()}`);
    const html = await response.text();
    await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""), { waitUntil: "domcontentloaded", timeout: 15000 });
    const data = await page.evaluate(() => {
      const text = element => (element?.textContent || "").replace(/\s+/g, " ").trim();
      const count = text(document.querySelector("#totalCount")).match(/([\d,]+)\s*건/);
      const result = [];
      for (const card of document.querySelectorAll(".list[data-tracseid]")) {
        const link = card.querySelector('.company_title a[onclick*="fn_viewTracseInfo"]');
        const args = [...(link?.getAttribute("onclick") || "").matchAll(/'([^']*)'/g)].map(m => m[1]);
        const type = [...card.querySelectorAll(".company_title span")].map(text).find(t => /^K-디지털/.test(t) && t.length < 100) || "";
        const status = [...text(card).matchAll(/모집중|모집마감|모집예정/g)].at(-1)?.[0] || "";
        const common = { title: text(link), type, status, provider: text(card.querySelector('.company_title a[onclick*="fn_viewTrainstInfo"]')), code: args[2], customer: args[3] };
        result.push({ ...common, id: card.getAttribute("data-tracseid"), round: card.getAttribute("data-tracsetme"), dates: text(card.querySelector(".info_area .time")) });
        for (const option of card.querySelectorAll("option[data-tgcr_id][data-tgcr_tme]")) result.push({ ...common, id: option.getAttribute("data-tgcr_id"), round: option.getAttribute("data-tgcr_tme"), code: option.getAttribute("data-crse_trng_crse_se") || common.code, customer: option.getAttribute("data-trin_cstm_id") || common.customer, dates: text(option) });
      }
      return { keyword: document.querySelector('#keyword')?.value, total: count ? Number(count[1].replaceAll(",", "")) : null, rows: result };
    });
    if (data.keyword !== "반도체" || data.total === null || (data.total > 0 && !data.rows.length)) throw new Error("고용24 KDT 검색 결과 구조/검색어를 확인하지 못했습니다.");
    total = data.total;
    pages = Math.max(1, Math.ceil(total / 10));
    if (pages > 50) throw new Error("고용24 KDT 결과가 500개를 초과했습니다.");
    const signature = data.rows.map(r => `${r.id}:${r.round}`).join("|");
    if (data.rows.length && seenPages.has(signature)) throw new Error("고용24 페이지 이동 검증 실패");
    seenPages.add(signature);
    rows.push(...data.rows);
  }
  const stats = { totalCourses: total, searchStart: first.searchParams.get("startDate_datepicker"), searchEnd: first.searchParams.get("endDate_datepicker") };
  const items = filterCourses(rows, stats.searchStart, stats);
  if (rows.length && stats.unknownDate === rows.length) throw new Error("고용24 모든 과정의 훈련 날짜를 읽지 못했습니다.");
  for (const item of items) item.key = crypto.createHash("sha256").update(`${site.id}|${item.url}`).digest("hex").slice(0, 20);
  items.metadata = { filterStats: stats };
  console.log(`고용24 KDT 70일 필터: ${JSON.stringify(stats)}`);
  return items;
}
