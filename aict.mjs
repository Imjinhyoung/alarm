import crypto from 'node:crypto';
import { htmlText } from './linkareer.mjs';

export const aictUrl='https://aict.snu.ac.kr/bbs/BBSMSTR_000000000001/list.do';
export function parseAict(html,siteId='aict_gspec') {
  const posts=[...html.matchAll(/<button\b[^>]*onclick="[^"]*fn_search_detail\('([^']+)'\)[^"]*"[^>]*>([\s\S]*?)<\/button>/gi)];
  if(!posts.length)throw new Error('AICT 공지 목록 구조를 확인하지 못했습니다.');
  const items=new Map();
  for(const[,id,body]of posts) {
    const heading=body.match(/<strong\b[^>]*class="board__subject-text"[^>]*>([\s\S]*?)<\/strong>/i)?.[1];
    if(!heading)throw new Error('AICT 공지 제목 구조 변경');
    const title=htmlText(heading).replace(/\s+/g,' ').trim();
    if(!/g[\s\-‐‑–—_]*spec/i.test(title))continue;
    const url=new URL('view.do',aictUrl);url.searchParams.set('nttId',id);
    items.set(id,{key:crypto.createHash('sha256').update(`${siteId}|${url.href}`).digest('hex').slice(0,20),title,url:url.href,status:'',period:'',context:title});
  }
  return [...items.values()];
}
export async function collectAict(page,site) {
  const response=await page.request.get(aictUrl,{timeout:30000});
  if(!response.ok())throw new Error(`AICT HTTP ${response.status()}`);
  return parseAict(await response.text(),site.id);
}
