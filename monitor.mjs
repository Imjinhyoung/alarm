import { chromium } from "playwright";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const STATE_PATH = new URL("./state.json", import.meta.url);
const ALERT_PATH = new URL("./alert.md", import.meta.url);

const sites = [
  {
    id: "boottent",
    name: "부트텐트 반도체·디스플레이",
    url: "https://boottent.com/camps?industries=003&tagCodes=300",
    selectors: ["#default-bootcamp-list tr:has(> th a[href*='/camps/'])"],
    accept: /./,
    reject: /부트캠프 리스트|추천|비교정리/
  },
  {
    id: "ksia",
    name: "KSIA 예비취업자 교육",
    url: "https://infra.ksia.or.kr/user/Wo/WoUser0101.do?SCH_PRM_GB=002&CURRENT_MENU_CODE=MENU0046&TOP_MENU_CODE=MENU0040",
    selectors: ["a"],
    accept: /모집기간|교육기간|반도체|소자|공정|패키징|실습|부트캠프/,
    reject: /개인정보|이메일무단|전체보기|관심목록|사업 소개|커뮤니티/
  },
  {
    id: "snu_isrc",
    name: "서울대 ISRC 교육",
    url: "https://isrc.snu.ac.kr/edu/school/event/list?",
    selectors: [".event_list_rg > ul > li", ".event_list_rg li", "a"],
    accept: /접수기간|모집안내|교육기간|인턴십/,
    reject: /개인정보|로그인|회원가입/
  },
  {
    id: "hace",
    name: "H-ACE 교육",
    url: "https://stormy-swoop-e2e.notion.site/2026-H-ACE-318e4f105f3580329e9eecd2a1237486",
    selectors: ["a"],
    accept: /접수중|예정|모집|교육|과정|이벤트/,
    reject: /종료|마감 과정|찾아오시는 길|FAQ|자주 묻는 질문/
  },
  {
    id: "suwon",
    name: "수원시 직업교육훈련",
    url: "https://www.suwon.go.kr:22871/M000149/S001/fw/bbs/board/00007/list.do",
    selectors: ["a[href*='view.do']"],
    accept: /./,
    reject: /개인정보|이용약관/
  },
  {
    id: "ekcdi",
    name: "한국커리어개발원 온라인 과정",
    url: "https://www.ekcdi.co.kr/html/trainning/trainning_online.php",
    selectors: ["a"],
    accept: /과정|교육|강의|실습/,
    reject: /공지사항|수강안내|대학\/기업교육|교육신청|취업준비전략/
  },
  {
    id: "postech",
    name: "POSTECH 환동해 글로컬 연합 아카데미",
    url: "https://popens.postech.ac.kr/contents/03_apply/sub01.html",
    selectors: ["h2", "a"],
    accept: /20\d{2}년.*(교육|과정)|취업준비형|반도체|이차전지|바이오제약/,
    reject: /교육신청$|교육과정$/
  },
  {
    id: "ust",
    name: "UST 연구인턴십",
    url: "https://intern.ust.ac.kr/home",
    selectors: ["a", "h2"],
    accept: /인턴십|인턴 모집/,
    reject: /연구인턴십$/
  },
  {
    id: "skku_eee_notice",
    group: "school",
    name: "성균관대 전자전기공학부 학부공지",
    url: "https://eee.skku.edu/eee/notice.do",
    selectors: ["a[href*='mode=view']"],
    accept: /./,
    reject: /개인정보|이메일무단|네티즌윤리/
  },
  {
    id: "skku_eee_total",
    group: "school",
    name: "성균관대 전자전기공학부 통합공지",
    url: "https://eee.skku.edu/eee/notice_total.do",
    selectors: ["a[href*='mode=view']"],
    accept: /./,
    reject: /개인정보|이메일무단|네티즌윤리/
  },
  {
    id: "skku_ice_notice",
    group: "school",
    name: "성균관대 정보통신대학 학부공지",
    url: "https://ice.skku.edu/ice/notice.do",
    selectors: ["a[href*='mode=view']"],
    accept: /./,
    reject: /개인정보|이메일무단|네티즌윤리/
  },
  {
    id: "skku_ase_notice",
    group: "school",
    name: "성균관대 차세대반도체공학연계전공 공지",
    url: "https://ase.skku.edu/ase/notice.do",
    selectors: ["a[href*='mode=view']"],
    accept: /./,
    reject: /개인정보|이메일무단|네티즌윤리/
  }
];

const siteGroup = process.env.SITE_GROUP || "training";
const activeSites = sites.filter(site => (site.group || "training") === siteGroup);

const clean = value => String(value ?? "")
  .replace(/\s+/g, " ")
  .replace(/[|•]+/g, " ")
  .trim();

const digest = value => crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);

function statusOf(text) {
  const match = text.match(/접수\s?가능|접수\s?중|모집\s?중|모집\s?전|접수\s?대기|모집\s?마감|마감|종료|Closed/i);
  return match ? clean(match[0]).toLowerCase() : "";
}

function periodOf(text) {
  const matches = text.match(/20\d{2}[.\-/년]\s?\d{1,2}[.\-/월]\s?\d{1,2}(?:일)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g);
  return matches ? matches.slice(0, 4).map(clean).join(" ~ ") : "";
}

function isOpen(status) {
  return /접수가능|접수중|모집중/.test(status.replace(/\s/g, ""));
}

function isWaiting(status) {
  return /모집전|접수대기/.test(status.replace(/\s/g, ""));
}

async function collect(page, site) {
  await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (site.id === "boottent") {
    await page.locator(site.selectors[0]).first().waitFor({ state: "attached", timeout: 30000 });
  }
  await page.waitForTimeout(site.id === "hace" ? 7000 : 2500);

  const raw = await page.evaluate(({ selectors }) => {
    const nodes = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))];
    const normalize = value => String(value ?? "").replace(/\s+/g, " ").trim();
    const nearestUsefulText = element => {
      let current = element;
      let best = normalize(element.innerText || element.textContent);
      for (let i = 0; i < 5 && current?.parentElement; i += 1) {
        current = current.parentElement;
        const text = normalize(current.innerText || current.textContent);
        if (text.length >= best.length && text.length <= 900) best = text;
        if (/모집기간|접수기간|교육기간|모집중|접수중|모집전|접수 대기/.test(text) && text.length <= 900) return text;
      }
      return best;
    };
    return nodes.map(element => {
      const imageAlt = [...element.querySelectorAll?.("img[alt]") ?? []].map(img => img.alt).join(" ");
      const ownAlt = element instanceof HTMLImageElement ? element.alt : "";
      const nestedHeading = element.querySelector?.("h2")?.innerText || "";
      const title = normalize(nestedHeading || element.innerText || element.getAttribute?.("aria-label") || element.getAttribute?.("title") || ownAlt || imageAlt);
      const href = element.href || element.closest?.("a")?.href || element.querySelector?.("a[href*='/camps/']")?.href || "";
      return { title, href, context: nearestUsefulText(element) };
    });
  }, { selectors: site.selectors });

  const items = new Map();
  for (const candidate of raw) {
    const title = clean(candidate.title);
    const context = clean(candidate.context);
    const searchable = `${title} ${context}`;
    if (title.length < 5 || !site.accept.test(searchable) || site.reject.test(searchable)) continue;
    let href = clean(candidate.href);
    try {
      const parsed = new URL(href);
      for (const key of [...parsed.searchParams.keys()]) {
        if (["card", "pvs", "article.offset", "articleLimit"].includes(key) || key.startsWith("utm_")) parsed.searchParams.delete(key);
      }
      href = parsed.toString();
    } catch {
      // Relative and javascript links are handled by the fallback title key below.
    }
    const canonicalTitle = title.length > 180 ? title.slice(0, 180) : title;
    const keySource = href && !href.startsWith("javascript:") && !href.endsWith("#") ? href : canonicalTitle;
    const key = digest(`${site.id}|${keySource}`);
    const existing = items.get(key);
    const item = {
      key,
      title: canonicalTitle,
      url: href || site.url,
      status: statusOf(searchable),
      period: periodOf(searchable),
      context: context.slice(0, 500)
    };
    if (!existing || item.context.length > existing.context.length) items.set(key, item);
  }

  if (!items.size) throw new Error("감시할 모집·교육 항목을 찾지 못했습니다.");
  return [...items.values()].slice(0, 100);
}

async function main() {
  const previous = JSON.parse(await fs.readFile(STATE_PATH, "utf8"));
  const next = { version: 1, initialized: true, checkedAt: new Date().toISOString(), sites: { ...(previous.sites ?? {}) } };
  const alerts = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
  });

  try {
    for (const site of activeSites) {
      const oldSite = previous.sites?.[site.id] ?? { items: [], failures: 0 };
      const siteInitialized = Array.isArray(previous.sites?.[site.id]?.items);
      const page = await context.newPage();
      try {
        const items = await collect(page, site);
        const oldItems = new Map((oldSite.items ?? []).map(item => [item.key, item]));
        const changes = [];
        const recoveringWithoutBaseline = (oldSite.failures ?? 0) > 0 && (oldSite.items?.length ?? 0) === 0;
        if (siteInitialized && !recoveringWithoutBaseline) {
          for (const item of items) {
            const old = oldItems.get(item.key);
            if (!old) {
              changes.push({ type: "새 항목", item });
            } else if (isWaiting(old.status) && isOpen(item.status)) {
              changes.push({ type: `${old.status || "대기"} → ${item.status}`, item });
            } else if (old.period && item.period && old.period !== item.period) {
              changes.push({ type: "접수·교육 일정 변경", item });
            }
          }
        }
        if (changes.length) alerts.push({ site, changes });
        next.sites[site.id] = { name: site.name, url: site.url, failures: 0, items };
      } catch (error) {
        const failures = (oldSite.failures ?? 0) + 1;
        next.sites[site.id] = { ...oldSite, name: site.name, url: site.url, failures, lastError: String(error.message ?? error) };
        if (siteInitialized && failures === 3) {
          alerts.push({ site, changes: [{ type: "연속 3회 확인 실패", item: { title: String(error.message ?? error), url: site.url, status: "점검 필요", period: "" } }] });
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  const lines = [siteGroup === "school" ? "# 학교 공지사항 새 글 알림" : "# 교육·인턴 모집 변경 알림", ""];
  for (const alert of alerts) {
    lines.push(`## ${alert.site.name}`, "");
    for (const { type, item } of alert.changes) {
      lines.push(`- **${type}**: [${item.title}](${item.url || alert.site.url})`);
      if (item.status) lines.push(`  - 상태: ${item.status}`);
      if (item.period) lines.push(`  - 확인된 일정: ${item.period}`);
    }
    lines.push("");
  }
  await fs.writeFile(ALERT_PATH, alerts.length ? `${lines.join("\n")}\n` : "", "utf8");

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    await fs.appendFile(output, `alert=${alerts.length ? "true" : "false"}\n`, "utf8");
    await fs.appendFile(output, `alert_count=${alerts.reduce((sum, entry) => sum + entry.changes.length, 0)}\n`, "utf8");
  }
  console.log(previous.initialized ? `확인 완료: ${alerts.length}개 사이트에서 변경 감지` : "첫 실행 기준선 저장 완료");
}

await main();
