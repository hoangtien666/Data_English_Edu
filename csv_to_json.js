const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const CSV = path.join(BASE, 'questions_all_filled.csv');
const OUT_JSON = path.join(BASE, 'questions_all_filled.json');
const OUT_MAP = path.join(BASE, 'questions_all_filled_map.json');
const OUT_REVMAP = path.join(BASE, 'questions_all_filled_id_to_index.json');

function parseCSV(content){
  const lines = content.split(/\r?\n/).filter(l=>l.trim()!=='');
  if(lines.length===0) return {header:[], rows:[]};
  const header = [];
  // simple CSV parse supporting quoted fields
  const parseLine = (line)=>{
    const cols = []; let cur=''; let inQ=false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(inQ){
        if(ch==='"'){
          if(line[i+1]==='"'){ cur+='"'; i++; } else { inQ=false; }
        } else cur+=ch;
      } else {
        if(ch==='"'){ inQ=true; }
        else if(ch===','){ cols.push(cur); cur=''; }
        else cur+=ch;
      }
    }
    cols.push(cur);
    return cols;
  };
  const first = parseLine(lines[0]);
  for(const c of first) header.push(c.trim());
  const rows = lines.slice(1).map(l=>{
    const cols = parseLine(l);
    const obj = {};
    for(let i=0;i<header.length;i++) obj[header[i]] = (cols[i]||'').trim();
    return obj;
  });
  return {header, rows};
}

if(!fs.existsSync(CSV)){
  console.error('CSV not found:', CSV); process.exit(1);
}

const raw = fs.readFileSync(CSV,'utf8');
const {header, rows} = parseCSV(raw);

// write JSON array
fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2), 'utf8');

// build mappings: index (1-based) -> question_id, and reverse
const map = {};
const rev = {};
for(let i=0;i<rows.length;i++){
  const idx = i+1;
  const id = String(rows[i].question_id || rows[i].questionId || rows[i].id || idx);
  map[idx] = id;
  rev[id] = idx;
}
fs.writeFileSync(OUT_MAP, JSON.stringify(map, null, 2), 'utf8');
fs.writeFileSync(OUT_REVMAP, JSON.stringify(rev, null, 2), 'utf8');

console.log('Wrote', OUT_JSON);
console.log('Wrote', OUT_MAP, 'and', OUT_REVMAP);
