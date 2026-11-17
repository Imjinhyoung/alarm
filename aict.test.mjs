import assert from 'node:assert/strict';
import {parseAict} from './aict.mjs';
const post=(id,title)=>`<button onclick="fn_search_detail('${id}'); return false;" class="board__link"><strong class="board__subject-text">${title}</strong></button>`;
const result=parseAict(post('1','2026 G-SPEC 교육 모집')+post('1','2026 G-SPEC 교육 모집')+post('2','다른 공고')+post('3','g spec 모집'));
assert.equal(result.length,2);assert.equal(new URL(result[0].url).searchParams.get('nttId'),'1');
assert.equal(parseAict(post('2','다른 공고')).length,0);
assert.throws(()=>parseAict('<html>접속 차단</html>'));
assert.equal(parseAict(post('1','변경된 G-SPEC 제목'))[0].key,result[0].key);
console.log('AICT G-SPEC 제목 필터·고유번호·중복·정상 0건·구조 변경 검증 통과');
