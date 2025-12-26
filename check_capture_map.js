const fs = require('fs');
function load(f){ try{ return JSON.parse(fs.readFileSync(f,'utf8')); }catch(e){ return []; } }
const caps = [...load('network_captures.json'), ...load('network_captures_all.json')];
const map = new Map();
for(const e of caps){ const b = e.body; if(!b) continue; if(typeof b === 'object' && b.exam && Array.isArray(b.exam.pages)){ for(const p of b.exam.pages){ if(!p.questions) continue; for(const q of p.questions){ if(q && q.id && (q.correctAnswer||q.answer||q.correct_answer)) map.set(String(q.id), String(q.correctAnswer||q.answer||q.correct_answer)); } } }
  if(Array.isArray(b.questions)){ for(const q of b.questions) if(q && q.id && (q.correctAnswer||q.answer||q.correct_answer)) map.set(String(q.id), String(q.correctAnswer||q.answer||q.correct_answer)); }
}
console.log('captured correct map size', map.size);
let i=0;
for(const [k,v] of map.entries()){ if(i++<20) console.log(k, '->', v); else break; }
