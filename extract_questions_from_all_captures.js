const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, 'network_captures_all.json');
const OUT = path.join(__dirname, 'questions_all.csv');

if(!fs.existsSync(IN)){ console.error('Input not found:', IN); process.exit(1); }
const captures = JSON.parse(fs.readFileSync(IN,'utf8'));

function stripHtml(s){ if(!s) return ''; return String(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }

const map = new Map();

for(const entry of captures){
  try{
    const b = entry.body;
    if(!b) continue;
    let pages = null;
    if(typeof b === 'object'){
      if(b.exam && Array.isArray(b.exam.pages)) pages = b.exam.pages;
      else if(Array.isArray(b.pages)) pages = b.pages;
      else if(b.exam && Array.isArray(b.exam.questions)) pages = [{questions: b.exam.questions}];
    }
    if(!pages) continue;
    for(const p of pages){
      if(!p || !Array.isArray(p.questions)) continue;
      for(const q of p.questions){
        const id = q.id || q._id || q.question_id || '';
        if(!id) continue;
        if(map.has(id)) continue;
        const question = stripHtml(q.name || q.question || q.content || q.title || '');
        const answers = q.answers || q.options || q.choices || [];
        const opts = answers.map(a => stripHtml(a.name||a.content||a.text||a.answer||''));
        while(opts.length<4) opts.push('');
        let correct_text = q.correctAnswer || q.correct_answer || q.answer || '';
        if(!correct_text){
          for(const a of (q.answers||[])) if(a.is_correct||a.correct) { correct_text = a.name||a.content||a.answer||''; break; }
        }
        correct_text = stripHtml(correct_text||'');
        let correct_option = '';
        if(correct_text){
          for(let i=0;i<4;i++){ if(opts[i] && opts[i].replace(/^[A-Da-d]\.\s*/,'').trim() === correct_text.replace(/^[A-Da-d]\.\s*/,'').trim()){ correct_option = ['A','B','C','D'][i]; break; } }
        }
        map.set(String(id), {question_id: id, question, option_A: opts[0], option_B: opts[1], option_C: opts[2], option_D: opts[3], correct_option, correct_text});
      }
    }
  }catch(e){}
}

const rows = Array.from(map.values());
if(rows.length===0){ console.error('No questions extracted.'); process.exit(1); }
const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
const lines = [header.join(',')];
for(const r of rows){
  const vals = header.map(h=>{ const v = r[h]===undefined||r[h]===null ? '' : String(r[h]).replace(/"/g,'""'); if(v.includes(',')||v.includes('\n')||v.includes('"')) return `"${v}"`; return v; });
  lines.push(vals.join(','));
}
fs.writeFileSync(OUT, lines.join('\n'));
console.log('Wrote', OUT, 'with', rows.length, 'questions.');
