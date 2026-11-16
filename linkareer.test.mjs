import assert from "node:assert/strict";
import { qualify, listing, htmlText, collectLinkareer } from "./linkareer.mjs";

const base = {
  id: "1", title: "반도체 연구 인턴", organizationName: "테스트 기업", organizationType: "중견기업",
  education: "NO_LIMIT", status: "OPEN", jobTypes: ["INTERN"], regions: [{ name: "경기" }],
  addresses: [{ isAbroad: false, address: "경기 수원시" }],
  bodyHtml: "<p>지원자격: 대학 재학생 및 휴학생 지원 가능</p><p>연구팀에서 반도체 실험을 지원합니다.</p><p>근무기간: 3개월</p>"
};
assert.equal(qualify(base).pass, true);
for (const word of ["디스플레이", "자동차", "모빌리티", "방산", "항공우주", "기계", "로봇", "철강", "금속", "공공", "비영리"]) assert.equal(qualify({ ...base, title: `${word} 인턴` }).pass, true, word);
const withBody = bodyHtml => qualify({ ...base, bodyHtml });
assert.equal(withBody("지원자격: 대학 졸업자 또는 졸업예정자만 지원 가능\n근무기간: 3개월\n연구팀에서 실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 대학 졸업(예정)자\n근무기간: 3개월\n연구팀에서 실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생은 지원할 수 없습니다. 졸업자만 지원 가능\n근무기간: 3개월").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 6개월 (수습기간 3개월)\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 최소 3개월 이상\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 3~6개월\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 1년간 (수습 3개월)\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 1년 (수습 3개월)\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 최소 2개월\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 협의 후 결정\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n접수기간: 2026-12-01 ~ 2027-02-28\n실험을 지원합니다.").pass, false);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 2026-12-01 ~ 2027-02-28\n실험을 지원합니다.").pass, true);
assert.equal(withBody("지원자격: 재학생 지원 가능\n근무기간: 2026-12-01 ~ 2027-04-01\n실험을 지원합니다.").pass, false);
assert.equal(qualify({ ...base, addresses: [{ isAbroad: true, address: "미국" }] }).pass, false);
assert.equal(qualify({ ...base, addresses: [] }).pass, false);
assert.equal(qualify({ ...base, title: "식품 마케팅 인턴" }).pass, false);
assert.equal(qualify({ ...base, status: "CLOSED" }).pass, false);
assert.equal(qualify({ ...base, bodyHtml: '<img src="https://media-cdn.linkareer.com/se2editor/image/1">' }).pass, false);
assert.equal(qualify({ ...base, bodyHtml: '<img src="poster">' }, "지원자격: 재학생 또는 휴학생 지원 가능\n연구팀에서 실험을 지원합니다.\n근무기간: 2개월").pass, true);
assert.equal(htmlText("<svg><text>3개월</text></svg><p>6개월</p>"), "6개월");

const makeList = (ids, total) => `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { __APOLLO_STATE__: { ROOT_QUERY: { 'activities({})': { __typename: "ActivityConnection", totalCount: total, nodes: ids.map(id => ({ __ref: `Activity:${id}` })) } }, ...Object.fromEntries(ids.map(id => [`Activity:${id}`, { id, jobTypes: ["INTERN"] }])) } } } })}</script>`;
assert.equal(listing(makeList(["1"], 1)).nodes[0].id, "1");
assert.throws(() => listing("로그인 페이지"));
const page = { request: { async get(url) { return { ok: () => true, text: async () => makeList(new URL(url).searchParams.get("page") === "2" ? ["21"] : Array.from({ length: 20 }, (_, i) => String(i + 1)), 21) }; } } };
const baseline = await collectLinkareer(page, { id: "linkareer_intern", url: "https://linkareer.com/list/intern?page=1" });
assert.equal(baseline.length, 0);
assert.equal(baseline.metadata.knownIds.length, 21);
const unchanged = await collectLinkareer(page, { id: "linkareer_intern", url: "https://linkareer.com/list/intern?page=1" }, { knownIds: baseline.metadata.knownIds });
assert.equal(unchanged.length, 0);
assert.equal(unchanged.metadata.filterStats.examined, 0);
console.log("PASS: 재학생·기간·국내·분야·이미지 불확실성·전체 페이지 기준선·중복 방지");
