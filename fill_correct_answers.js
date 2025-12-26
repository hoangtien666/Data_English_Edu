const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const QIN = path.join(BASE, 'questions_all.csv');
const OUT = path.join(BASE, 'questions_all_filled.csv');
const CAP1 = path.join(BASE, 'network_captures.json');
const CAP2 = path.join(BASE, 'network_captures_all.json');
const CAP3 = path.join(BASE, 'network_captures_submit.json');
const CAP4 = path.join(BASE, 'network_captures_submit_missing.json');

function strip(s){ if(!s) return ''; return String(s).replace(/<[^>]+>/g,'').replace(/^[A-Da-d]\.?\s*/,'').replace(/\s+/g,' ').trim(); }

function loadCaptures(file){
  if(!fs.existsSync(file)) return [];
  try{ return JSON.parse(fs.readFileSync(file,'utf8')); }catch(e){ return []; }
}

function collectCorrectMap(captures){
  const map = new Map();
  for(const e of captures){
    const b = e.body;
    if(!b) continue;
    // shapes: object with exam.pages[].questions[]
    if(typeof b === 'object' && b.exam && Array.isArray(b.exam.pages)){
      for(const p of b.exam.pages){ if(!p.questions) continue; for(const q of p.questions){ if(q && q.id && (q.correctAnswer||q.answer||q.correctAnswer==="")){ map.set(String(q.id), strip(q.correctAnswer||q.answer||q.correct_answer||q.answer_text||'')); } }}
    }
    // direct questions array
    if(Array.isArray(b.questions)){
      for(const q of b.questions) if(q && q.id && (q.correctAnswer||q.answer||q.correct_answer)) map.set(String(q.id), strip(q.correctAnswer||q.answer||q.correct_answer));
    }
    // submit responses sometimes contain exam -> pages
    if(typeof b === 'object' && b.exam && Array.isArray(b.exam.pages)){
      for(const p of b.exam.pages){ if(!p.questions) continue; for(const q of p.questions){ if(q && q.id && (q.correctAnswer||q.answer)) map.set(String(q.id), strip(q.correctAnswer||q.answer)); }}
    }
  }
  return map;
}

// minimal CSV parser for RFC4180-ish (handles quoted fields with doubled quotes)
function parseCSV(content){
  const lines = content.split(/\r?\n/);
  const rows = [];
  for(const line of lines){ if(line.trim()=== '') continue; const cols = []; let cur=''; let inQuotes=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(inQuotes){ if(ch==='"'){ if(line[i+1]==='"'){ cur+='"'; i++; } else { inQuotes=false; } } else { cur+=ch; } } else { if(ch==='"'){ inQuotes=true; } else if(ch===','){ cols.push(cur); cur=''; } else { cur+=ch; } } } cols.push(cur); rows.push(cols); }
  return rows;
}

function writeCSV(header, rows, out){
  const lines = [];
  lines.push(header.join(','));
  for(const r of rows){ const vals = header.map(h=>{ const v = r[h]===undefined||r[h]===null ? '' : String(r[h]).replace(/"/g,'""'); if(v.includes(',')||v.includes('\n')||v.includes('"')) return `"${v}"`; return v; }); lines.push(vals.join(',')); }
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
}

(async ()=>{
  if(!fs.existsSync(QIN)){ console.error('questions_all.csv not found'); process.exit(1); }
  const csv = fs.readFileSync(QIN,'utf8');
  const parsed = parseCSV(csv);
  const header = parsed[0];
  const rows = parsed.slice(1).map(cols=>{ const obj={}; for(let i=0;i<header.length;i++){ obj[header[i]] = cols[i] || ''; } return obj; });

  const caps1 = loadCaptures(CAP1);
  const caps2 = loadCaptures(CAP2);
  const caps3 = loadCaptures(CAP3);
  const caps4 = loadCaptures(CAP4);
  const map1 = collectCorrectMap(caps1);
  const map2 = collectCorrectMap(caps2);
  const map3 = collectCorrectMap(caps3);
  const map4 = collectCorrectMap(caps4);

  const merged = new Map([...map1, ...map2, ...map3, ...map4]);

  let updated = 0;
  for(const r of rows){ const id = String(r.question_id||r.questionId||r.id||'').trim(); if(!id) continue; if(r.correct_text && r.correct_text.trim()!=='') continue; const found = merged.get(id); if(found){ r.correct_text = found; // deduce option
      const opts = [r.option_A||'', r.option_B||'', r.option_C||'', r.option_D||''].map(s=>strip(s));
      const target = strip(found);
      let matched = '';
      for(let i=0;i<opts.length;i++){ if(opts[i] && opts[i]===target){ matched = ['A','B','C','D'][i]; break; } }
      if(!matched){ // try prefix-insensitive compare
        for(let i=0;i<opts.length;i++){ if(opts[i] && opts[i].replace(/^[A-Da-d]\.?\s*/,'')===target.replace(/^[A-Da-d]\.?\s*/,'')){ matched = ['A','B','C','D'][i]; break; } }
      }
      if(matched){ r.correct_option = matched; } else { r.correct_option = r.correct_option || ''; }
      updated++; }
  }

  writeCSV(header, rows, OUT);
  console.log('Wrote', OUT, ' — updated', updated, 'rows (filled correct_text/correct_option where found).');
})();
