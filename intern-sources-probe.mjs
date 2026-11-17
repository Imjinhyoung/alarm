import { chromium } from 'playwright';
import { collectInternSource } from './intern-sources.mjs';
const browser=await chromium.launch({headless:true,...(process.env.LOCAL_CHROME?{channel:'chrome'}:{})});
try {
  const page=await browser.newPage();
  for(const id of ['superookie_intern','ssgsag_intern']) {
    try {const items=await collectInternSource(page,{id},{});if(items.length)throw new Error('첫 실행에 알림이 생성됐습니다.');console.log(JSON.stringify({id,success:true,stats:items.metadata.filterStats}));}
    catch(error){console.error(id,error);process.exitCode=1;}
  }
}finally{await browser.close();}
