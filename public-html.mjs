import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export function validatePublicHtml(html) {
  const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
  if(/503|service unavailable|bad gateway|gateway timeout|access denied|attention required|just a moment/i.test(title) ||
    /<h1[^>]*>\s*(?:Service Unavailable|Bad Gateway|Gateway Timeout)/i.test(html)) {
    throw new Error(`외부 사이트 장애/차단 페이지: ${title.trim()||'Service Unavailable'}`);
  }
  if(!/<(?:html|body|head|form)\b/i.test(html))throw new Error('HTML 페이지가 아닌 응답');
  return html;
}

// Independent normal HTTP clients handle intermittent DNS/TLS/reset failures.
// No cache is returned as a successful live check when the upstream is down.
export async function fetchPublicHtml(page,url,options={}) {
  const transports=options.transports||[
    async()=>{
      const r=await fetch(url,{signal:AbortSignal.timeout(25000)});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return r.text();
    },
    async()=>{
      const {stdout}=await exec('curl',['--ipv4','--http1.1','--fail','--location','--connect-timeout','10','--max-time','30','--silent','--show-error',url],{timeout:35000,maxBuffer:8*1024*1024});
      return stdout;
    },
    async()=>{
      const r=await page.request.get(url,{timeout:25000});
      if(!r.ok())throw new Error(`HTTP ${r.status()}`);
      return r.text();
    }
  ];
  const sleep=options.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const errors=[];
  for(let i=0;i<transports.length;i++) {
    if(i)await sleep(i===1?3000:8000);
    try{return validatePublicHtml(await transports[i]());}
    catch(error){errors.push(String(error.message||error).replace(/\s+/g,' ').slice(0,260));}
  }
  throw new Error(`외부 사이트 조회 실패 (${errors.join(' / ')})`);
}
