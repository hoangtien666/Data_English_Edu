const fs = require('fs');
const p = 'questions_all_filled.csv';
if(!fs.existsSync(p)){ console.error('File not found', p); process.exit(2); }
const s = fs.readFileSync(p,'utf8');
const lines = s.split(/\r?\n/);
const header = lines[0].split(',');
const idx = header.indexOf('correct_text');
if(idx===-1){ console.error('correct_text header not found'); process.exit(2); }
const rows = lines.slice(1).filter(l=>l.trim()!=='');
const missing = [];
for(const l of rows){ const cols=[]; let cur=''; let inQ=false; for(let i=0;i<l.length;i++){ const ch = l[i]; if(inQ){ if(ch==='"'){ if(l[i+1]==='"'){ cur+='"'; i++; } else { inQ=false; } } else { cur+=ch; } } else { if(ch==='"'){ inQ=true; } else if(ch===','){ cols.push(cur); cur=''; } else { cur+=ch; } } } cols.push(cur); if(!cols[idx] || cols[idx].trim()==='') missing.push(cols); }
const out = 'questions_missing_answers.csv';
const outLines = [header.join(',')].concat(missing.map(r=>r.map(v=>{ if(v===undefined) v=''; const vv = String(v).replace(/"/g,'""'); if(vv.includes(',')||vv.includes('\n')||vv.includes('"')) return '"'+vv+'"'; return vv; }).join(',')));
fs.writeFileSync(out, outLines.join('\n'));
console.log('Wrote', out, '— missing rows:', missing.length);
console.log('First 50 missing (question_id, question):');
console.log(missing.slice(0,50).map(r=>r[0]+', '+r[1]).join('\n'));
