import crypto from 'node:crypto';
import { qualify, ocr } from './linkareer.mjs';

export const superDuties = ['2587','2589','25a1','25a5','25a6','25a8','25a9'].map(x => `661de91a8b129f42ef6c${x}`);
export const domesticCities = Array.from({length:17},(_,i)=>(BigInt('0x579f18168b129f673b4efead')+BigInt(i)).toString(16));
export const superUrl = new URL('https://www.superookie.com/jobs/search');
superUrl.searchParams.set('job_type','job');
superUrl.searchParams.append('job_level[]','579f18168b129f673b4efebe');
for(const id of superDuties) superUrl.searchParams.append('duty_group[]',id);
for(const id of domesticCities) superUrl.searchParams.append('city[]',id);
export const ssgUrl = 'https://www.ssgsag.kr/intern?chip=intern_experience&jobs=103%2C104%2C109';
const koreanDate = s => s ? Date.parse(String(s).replace(' ','T') + (/[Zz]|[+]\d\d:\d\d$/.test(s)?'':'+09:00')) : NaN;
const compact = s => String(s||'').replace(/\s+/g,' ').trim();

async function get(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{Referer:'https://www.superookie.com/jobs/search','X-Requested-With':'XMLHttpRequest'}});
  if(!response.ok) throw new Error(`슈퍼루키 HTTP ${response.status}`);
  return response;
}
export function qualifySuper(p, now=Date.now(), poster='') {
  if(p.job_level_id!=='579f18168b129f673b4efebe') return {pass:false,reason:'인턴 아님'};
  if(!superDuties.includes(p.duty_group_lv2_id) || !domesticCities.includes(p.city_id)) return {pass:false,reason:'선택 직무/국내 지역 아님'};
  const close=koreanDate(p.end_at);
  if(!Number.isFinite(close) && p.registering!==true) return {pass:false,reason:'모집 상태 확인 불가'};
  return qualify({title:p.job_title_decoded||p.job_title,status:'OPEN',jobTypes:['INTERN'],recruitCloseAt:close,
    addresses:[{isAbroad:false,address:p.city||'국내 지역 코드 확인'}],
    bodyHtml:[p.job_requirement,p.about_job,p.additional_info,p.preference,p.custom_field,
      p.training_period?`근무기간: ${p.training_period}`:'',/대재/.test(p.achievement||'')?'재학생 지원 가능':''].filter(Boolean).join('\n')},poster,now,'선택 생산·제조/연구개발 직무');
}
export function qualifySsg(p, now=Date.now()) {
  const duty=[p.jobName,p.outline].join('\n');
  const field=duty.match(/엔지니어|설계|제조|생산|품질|공정|설비|개발|개발자|프로그래밍|소프트웨어|연구/);
  if(!field) return {pass:false,reason:'선택 직무 본문 확인 불가'};
  const address=compact(p.regionName);
  if(!/서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충[남북]|충청|전[남북]|전라|경[남북]|경상|제주|수도권|국내|전국/.test(address)||/해외|미국|영국|캐나다|일본|중국/.test(address)) return {pass:false,reason:'국내 근무 확인 불가'};
  const close=koreanDate(p.posterEndDate);
  if(p.categoryIdx!==4 || !Number.isFinite(close)) return {pass:false,reason:'인턴/마감일 확인 불가'};
  return qualify({title:p.posterName,status:'OPEN',jobTypes:['INTERN'],recruitCloseAt:close,addresses:[{isAbroad:false,address}],
    bodyHtml:[p.target,p.outline,p.benefit,p.posterDetail].filter(Boolean).join('\n')},'',now,field[0]);
}

async function rpc(page,name,args) {
  const response=await page.request.post(ssgUrl,{headers:{'x-ssgsag-rpc':`browse.${name}`},multipart:{args:JSON.stringify(args)},timeout:30000});
  if(!response.ok()) throw new Error(`슥삭 HTTP ${response.status()}`);
  const result=await response.json();
  if(!result.ok||!result.value) throw new Error(`슥삭 데이터 조회 실패: ${result.error||name}`);
  return result.value;
}
export async function superListing() {
  const html=await(await get(superUrl.href)).text();
  // This is the public search page's own client token, refreshed each run.
  const token=html.match(/loadNext\("[^"]+",\s*'([^']+)'/)?.[1];
  if(!token) throw new Error('슈퍼루키 공개 검색 설정을 읽지 못했습니다.');
  const live=new Map();let pages=1;
  for(let n=1;n<=pages;n++) {
    const url=new URL(superUrl);url.pathname='/api/jobs/search';
    for(const[k,v]of Object.entries({access_token:token,page:n,short:1,page_length:12}))url.searchParams.set(k,String(v));
    const data=await(await get(url)).json();
    if(!Array.isArray(data.data)||data.current_page!==n||!Number.isInteger(data.last_page)||data.last_page>100)throw new Error('슈퍼루키 목록/페이지 구조 변경');
    pages=data.last_page;
    for(const p of data.data) {if(!p._id||!p.job_title)throw new Error('슈퍼루키 공고 구조 변경');if(live.has(p._id))throw new Error('슈퍼루키 페이지 중복');live.set(p._id,p);}
  }
  return [...live.values()];
}
export async function ssgListing(page) {
  const live=new Map();let total=1;
  for(let n=1;live.size<total;n++) {
    const data=await rpc(page,'loadRecruitmentPage',[{chipIds:[10],jobIds:[103,104,109],ordering:0,page:n,pageSize:12}]);
    if(!Array.isArray(data.data)||!Number.isInteger(data.totalCount)||data.totalCount>1200)throw new Error('슥삭 목록 구조 변경');
    total=data.totalCount;
    for(const p of data.data){if(!p.posterIdx||!p.posterName||live.has(String(p.posterIdx)))throw new Error('슥삭 공고/페이지 검증 실패');live.set(String(p.posterIdx),p);}
    if(!data.data.length&&live.size<total)throw new Error('슥삭 목록 누락');
  }
  return [...live.values()];
}
export async function collectInternSource(page,site,old={}) {
  const isSuper=site.id==='superookie_intern';
  const list=isSuper?await superListing():await ssgListing(page);
  const known=new Set(old.knownIds||[]), baseline=!Array.isArray(old.knownIds);
  const items=[],stats={listed:list.length,examined:0,matched:0,rejected:{},baseline,deferred:0};
  for(const post of list) {
    const id=String(isSuper?post._id:post.posterIdx);
    if(known.has(id))continue;
    if(stats.examined>=120){stats.deferred++;continue;}
    const p=isSuper?post:await rpc(page,'loadPosterDetail',[post.posterIdx]);
    let result=isSuper?qualifySuper(p):qualifySsg(p);stats.examined++;
    if(isSuper && !result.pass && /자격|기간|지원 가능/.test(result.reason) && /<img\b/i.test(p.custom_field||'') && process.env.LINKAREER_TESSDATA) {
      result=qualifySuper(p,Date.now(),await ocr(page,p.custom_field,'superookie'));
    }
    if(result.pass) {
      stats.matched++;
      if(!baseline){const url=isSuper?`https://www.superookie.com/jobs/${id}`:`https://www.ssgsag.kr/posters/${id}`;
        items.push({key:crypto.createHash('sha256').update(`${site.id}|${url}`).digest('hex').slice(0,20),title:compact(isSuper?p.job_title_decoded||p.job_title:p.posterName),url,status:'모집 중',period:result.period,matchReasons:result.reasons,context:result.reasons.join(' / ')});}
    } else stats.rejected[result.reason]=(stats.rejected[result.reason]||0)+1;
    known.add(id);
  }
  // Baseline every listed ID, including any beyond the per-run detail budget.
  if(baseline)for(const p of list)known.add(String(isSuper?p._id:p.posterIdx));
  items.metadata={knownIds:[...known],filterStats:stats};
  console.log(`${site.id} 필터: ${JSON.stringify(stats)}`);return items;
}
