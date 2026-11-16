import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const compact = value => String(value ?? "").replace(/\s+/g, " ").trim();
const sector = /반도체|디스플레이|자동차|모빌리티|방산|방위산업|항공|우주|기계|로봇|철강|금속|공공|비영리|공기업|공단|재단/;

export function htmlText(html) {
  return String(html || "").replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
}

export function nextState(html) {
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error("링커리어 구조화 데이터를 찾지 못했습니다.");
  const state = JSON.parse(match[1]).props?.pageProps?.__APOLLO_STATE__;
  if (!state) throw new Error("링커리어 데이터 구조가 변경됐습니다.");
  return state;
}

const resolve = (state, ref) => ref?.__ref ? state[ref.__ref] : ref;

export function listing(html) {
  const state = nextState(html);
  const connection = Object.entries(state.ROOT_QUERY || {}).find(([key, value]) => key.startsWith("activities(") && value?.__typename === "ActivityConnection")?.[1];
  if (!connection || !Array.isArray(connection.nodes)) throw new Error("링커리어 인턴 목록을 검증하지 못했습니다.");
  const nodes = connection.nodes.map(ref => resolve(state, ref));
  if (nodes.some(node => !node?.id || !node.jobTypes?.includes("INTERN"))) throw new Error("인턴 목록 필터가 적용되지 않았습니다.");
  return { total: connection.totalCount, nodes };
}

export function detail(html, id) {
  const state = nextState(html);
  const activity = state[`Activity:${id}`];
  if (!activity?.title || !activity.detailText) throw new Error(`공고 ${id} 본문을 읽지 못했습니다.`);
  return {
    ...activity,
    bodyHtml: resolve(state, activity.detailText)?.text || "",
    company: resolve(state, activity.company),
    addresses: (activity.addresses || []).map(ref => resolve(state, ref)),
    categories: (activity.categories || []).map(ref => resolve(state, ref)?.name || "")
  };
}

function employmentPeriod(title, text) {
  const lines = text.split("\n").map(compact).filter(Boolean);
  const chunks = [title];
  for (let i = 0; i < lines.length; i += 1) {
    if (/근무\s*(?:기간|형태)|인턴\s*(?:십\s*)?기간|계약\s*기간|고용\s*형태/.test(lines[i])) chunks.push(lines.slice(i, i + 3).join(" "));
  }
  const context = chunks.join("\n");
  if (/(?<!\d)[1-9]\d?\s*년(?!\s*\d+\s*월)/.test(context)) return null;
  if (/최소\s*\d+\s*개월|\d+\s*개월\s*(?:이상|단위|[~～])|기간\s*(?:협의|미정)/.test(context)) return null;
  // A month number in an explicit calendar date is not a duration.
  const durationMonths = [...context.matchAll(/(\d+)\s*개\s*월/g)].map(m => Number(m[1]));
  if (durationMonths.length) {
    if (Math.max(...durationMonths) > 3 || Math.min(...durationMonths) < 1) return null;
    return `${Math.max(...durationMonths)}개월`;
  }
  const weeks = [...context.matchAll(/(\d+)\s*주(?:간)?/g)].map(m => Number(m[1]));
  if (weeks.length && Math.max(...weeks) <= 12 && Math.min(...weeks) > 0) return `${Math.max(...weeks)}주`;
  const days = [...context.matchAll(/(?:근무|계약|인턴)\s*기간\s*[:：]?\s*(\d+)\s*일/g)].map(m => Number(m[1]));
  if (days.length && Math.max(...days) <= 90 && Math.min(...days) > 0) return `${Math.max(...days)}일`;
  for (const chunk of chunks.slice(1)) {
    const range = chunk.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?\s*[~～\-–]\s*(?:(20\d{2})[.\-/년]\s*)?(\d{1,2})[.\-/월]\s*(\d{1,2})/);
    if (!range) continue;
    const [, y, m, d, ey, em, ed] = range;
    const start = new Date(Date.UTC(+y, +m - 1, +d));
    const end = new Date(Date.UTC(ey ? +ey : +y, +em - 1, +ed));
    const limit = new Date(start); limit.setUTCMonth(limit.getUTCMonth() + 3);
    if (end >= start && end < limit) return `${y}-${m}-${d} ~ ${ey || y}-${em}-${ed}`;
  }
  return null;
}

export function qualify(activity, ocrText = "", now = Date.now()) {
  const text = htmlText(activity.bodyHtml) + "\n" + ocrText;
  const title = compact(activity.title);
  if (activity.status !== "OPEN" || !activity.jobTypes?.includes("INTERN") || (activity.recruitCloseAt && activity.recruitCloseAt < now)) return { pass: false, reason: "마감/인턴 아님" };
  if (!activity.addresses?.length || activity.addresses.some(a => !a || a.isAbroad !== false) || activity.regions?.some(r => /해외/.test(r.name))) return { pass: false, reason: "국내 근무 확인 불가" };
  const fieldText = `${title} ${activity.organizationName || ""} ${activity.organizationType || ""} ${activity.company?.detailedIndustry || ""} ${(activity.categories || []).join(" ")}`;
  const field = fieldText.match(sector)?.[0];
  if (!field) return { pass: false, reason: "희망 분야 확인 불가" };
  if (/(?:재학|휴학|대학생)[^\n.]{0,25}(?:지원\s*불가|지원\s*불가능|지원할\s*수\s*없|지원\s*가능하지\s*않|제외|불허)/.test(text)) return { pass: false, reason: "재학생 지원 불가" };
  const student = text.match(/(?:재[·ㆍ/\s]*휴학[생자]?|재학[생자]?|휴학[생자]?)[^\n.]{0,45}/)?.[0];
  const graduateOnly = /기?졸업\s*(?:자|예정|\(예정\))|학사\s*(?:학위|이상)|학위\s*(?:소지|취득)|졸업\s*필수/.test(text);
  const educationFree = activity.education === "NO_LIMIT" || /학력\s*무관|학력\s*(?:제한\s*없|제한없)/.test(text);
  if (!student && (graduateOnly || !educationFree)) return { pass: false, reason: "재학생 지원 가능 확인 불가" };
  // NO_LIMIT alone cannot certify an image-only qualification section.
  if (compact(text).length < 45) return { pass: false, reason: "자격/기간 본문 확인 불가" };
  const period = employmentPeriod(title, text);
  if (!period) return { pass: false, reason: "3개월 이내 근무기간 확인 불가" };
  return { pass: true, period, reasons: [`분야: ${field}`, `자격: ${compact(student || "학력 무관").slice(0, 100)}`, `근무기간: ${period}`, `근무지: ${activity.addresses.map(a => compact(a.address)).join(" / ")}`] };
}

async function request(page, url) {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await page.request.get(url, { timeout: 30000 });
      if (!response.ok()) throw new Error(`링커리어 HTTP ${response.status()}`);
      return response;
    } catch (error) { last = error; }
  }
  throw last;
}

async function ocr(page, bodyHtml) {
  if (!process.env.LINKAREER_TESSDATA) throw new Error("링커리어 한국어 OCR 준비가 필요합니다.");
  const images = [...bodyHtml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => new URL(m[1], "https://linkareer.com"))
    .filter(url => url.protocol === "https:" && /(^|\.)linkareer\.com$/.test(url.hostname) && /se2editor|upload|image/.test(url.pathname)).slice(0, 3);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "intern-ocr-"));
  const texts = [];
  for (const [i, image] of images.entries()) {
    const response = await request(page, image.href);
    const body = await response.body();
    if (body.length > 15 * 1024 * 1024) throw new Error("공고 이미지 크기 초과");
    const file = path.join(folder, `poster-${i}.img`);
    await fs.writeFile(file, body);
    const { stdout } = await exec("tesseract", [file, "stdout", "--tessdata-dir", process.env.LINKAREER_TESSDATA, "-l", "kor+eng", "--psm", "11"], { timeout: 45000, maxBuffer: 1024 * 1024 });
    texts.push(stdout);
  }
  return texts.join("\n");
}

export async function collectLinkareer(page, site, oldSite = {}) {
  const live = new Map();
  let pages = 1;
  for (let n = 1; n <= pages; n += 1) {
    const url = new URL(site.url); url.searchParams.set("page", n);
    const data = listing(await (await request(page, url.href)).text());
    pages = Math.max(1, Math.ceil(data.total / 20));
    if (pages > 100) throw new Error("인턴 목록이 2,000건을 초과했습니다. 수집 범위 점검 필요");
    if (n > 1 && data.nodes.length && live.has(String(data.nodes[0].id))) throw new Error("링커리어 페이지 이동 검증 실패");
    for (const node of data.nodes) live.set(String(node.id), node);
  }
  const items = [];
  const known = new Set(oldSite.knownIds || []);
  const stats = { listed: live.size, examined: 0, matched: 0, rejected: {}, deferred: 0 };
  if (!Array.isArray(oldSite.knownIds)) {
    // Verify a real detail/poster once during cloud onboarding, before saving
    // a baseline that future runs will rely on. No existing post is emailed.
    const sample = [...live.values()].find(node => sector.test(node.title));
    if (sample && process.env.LINKAREER_TESSDATA) {
      const activity = detail(await (await request(page, `https://linkareer.com/activity/${sample.id}`)).text(), sample.id);
      let poster = "";
      if (/<img\b/i.test(activity.bodyHtml)) poster = await ocr(page, activity.bodyHtml);
      stats.onboarding = { id: String(sample.id), ocrCharacters: poster.length, result: qualify(activity, poster) };
    }
    for (const id of live.keys()) known.add(id);
    stats.baseline = true;
  } else {
    const pending = [...live.keys()].filter(id => !known.has(id));
    stats.deferred = Math.max(0, pending.length - 120);
    for (const id of pending.slice(0, 120)) {
      const activity = detail(await (await request(page, `https://linkareer.com/activity/${id}`)).text(), id);
      let result = qualify(activity);
      if (!result.pass && /자격|기간|지원 가능/.test(result.reason) && /<img\b/i.test(activity.bodyHtml)) result = qualify(activity, await ocr(page, activity.bodyHtml));
      stats.examined += 1;
      if (result.pass) {
        const url = `https://linkareer.com/activity/${id}`;
        items.push({ key: crypto.createHash("sha256").update(`${site.id}|${url}`).digest("hex").slice(0, 20), title: compact(activity.title), url, status: "모집 중", period: result.period, matchReasons: result.reasons, context: result.reasons.join(" / ") });
        stats.matched += 1;
      } else stats.rejected[result.reason] = (stats.rejected[result.reason] || 0) + 1;
      known.add(id);
    }
  }
  items.metadata = { knownIds: [...known], filterStats: stats };
  console.log(`링커리어 필터: ${JSON.stringify(stats)}`);
  return items;
}
