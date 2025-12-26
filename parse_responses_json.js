const fs = require('fs');

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractJsonFromString(s) {
  const results = [];
  if (!s || typeof s !== 'string') return results;
  let idx = 0;
  while (true) {
    const keyIdx = s.indexOf('"exam"', idx);
    if (keyIdx === -1) break;
    // find preceding '{'
    let start = s.lastIndexOf('{', keyIdx);
    if (start === -1) start = s.indexOf('{', keyIdx);
    if (start === -1) break;
    // find matching '}'
    let depth = 0;
    let end = -1;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;
    const substr = s.slice(start, end + 1);
    try {
      const j = JSON.parse(substr);
      results.push(j);
      idx = end + 1;
    } catch (e) {
      // unable to parse, move idx forward to avoid infinite loop
      idx = keyIdx + 6;
    }
  }
  return results;
}

function parseExamObject(obj) {
  const rows = [];
  let qid = 1;
  if (!obj) return rows;
  const pages = (obj.pages && obj.pages.length) ? obj.pages : (obj.exam && obj.exam.pages) || [];
  const base = obj.exam || obj;
  for (const page of pages) {
    const questions = page.questions || [];
    for (const q of questions) {
      const question_id = q.id || qid++;
      const qtext = stripHtml(q.name || q.title || q.question || '');
      const opts = { A: '', B: '', C: '', D: '' };
      const answers = q.answers || q.answers_file || q.options || [];
      for (const a of answers) {
        const name = a.name || a.text || '';
        const m = String(name).match(/^\s*([A-D])\s*(.*)$/i);
        if (m) { opts[m[1].toUpperCase()] = m[2].trim(); }
        else {
          const letters = ['A','B','C','D'];
          for (const L of letters) { if (!opts[L]) { opts[L] = stripHtml(name); break; } }
        }
      }
      let correct_option = '';
      let correct_text = '';
      const ca = q.correctAnswer || q.answer || q.correct || q.correctAnswerText || q.correct_answer || (page && page.answers_file) || '';
      const m2 = String(ca).match(/^\s*([A-D])\s*(.*)$/i);
      if (m2) {
        correct_option = m2[1].toUpperCase();
        correct_text = m2[2].trim() || opts[correct_option];
      } else if (ca) {
        const txt = String(ca).trim();
        const found = Object.entries(opts).find(([k,v]) => v && (v === txt || v.includes(txt)));
        if (found) { correct_option = found[0]; correct_text = found[1]; }
        else correct_text = txt;
      }
      rows.push({ question_id, question: qtext, option_A: opts.A, option_B: opts.B, option_C: opts.C, option_D: opts.D, correct_option, correct_text });
    }
  }
  return rows;
}

const RESP = 'responses.json';
const OUT = 'questions.csv';

let raw;
try { raw = fs.readFileSync(RESP, 'utf8'); } catch (e) { console.error('Failed to read', RESP, e.message); process.exit(1); }
let arr;
try { arr = JSON.parse(raw); } catch (e) { console.error('responses.json is not valid JSON array', e.message); process.exit(1); }

let allRows = [];
for (const entry of arr) {
  // entry.data may be HTML or JSON string
  const payload = entry.data;
  if (typeof payload === 'object') {
    // maybe already parsed
    const rows = parseExamObject(payload);
    allRows = allRows.concat(rows);
  } else if (typeof payload === 'string') {
    // try to parse whole string as JSON
    try {
      const j = JSON.parse(payload);
      const rows = parseExamObject(j);
      allRows = allRows.concat(rows);
      continue;
    } catch (e) {}
    // otherwise search for embedded json
    const found = extractJsonFromString(payload);
    for (const f of found) {
      const rows = parseExamObject(f);
      allRows = allRows.concat(rows);
    }
  }
}

// dedupe by question_id
const map = new Map();
for (const r of allRows) {
  if (!map.has(r.question_id)) map.set(r.question_id, r);
}
const finalRows = Array.from(map.values());

const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
const lines = [header.join(',')];
for (const r of finalRows) {
  const line = [r.question_id, csvEscape(r.question), csvEscape(r.option_A), csvEscape(r.option_B), csvEscape(r.option_C), csvEscape(r.option_D), csvEscape(r.correct_option), csvEscape(r.correct_text)].join(',');
  lines.push(line);
}
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('Wrote', OUT, 'with', finalRows.length, 'questions (from', arr.length, 'response entries)');
