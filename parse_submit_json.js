const fs = require('fs');
const path = require('path');

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const input = process.argv[2] || 'sample_submit.json';
const out = process.argv[3] || 'questions.csv';

let raw;
try {
  raw = fs.readFileSync(input, 'utf8');
} catch (e) {
  console.error('Failed to read', input, e.message);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON in', input, e.message);
  process.exit(1);
}

const rows = [];
let qid = 1;
const pages = (data.exam && data.exam.pages) || [];
for (const page of pages) {
  const questions = page.questions || [];
  for (const q of questions) {
    const question_id = q.id || qid++;
    const question = stripHtml(q.name || q.title || q.question || '');

    const opts = { A: '', B: '', C: '', D: '' };
    const answers = q.answers || [];
    // answers[].name expected like "A anger"
    for (const a of answers) {
      const name = a.name || '';
      const m = name.match(/^\s*([A-D])\s*\s*(.*)$/i);
      if (m) {
        const letter = m[1].toUpperCase();
        const text = m[2].trim();
        opts[letter] = text;
      } else {
        // if no letter, fill sequentially
        const letters = ['A','B','C','D'];
        for (const L of letters) {
          if (!opts[L]) { opts[L] = stripHtml(name); break; }
        }
      }
    }

    let correct_option = '';
    let correct_text = '';
    const ca = q.correctAnswer || q.answer || q.correct || '';
    const m2 = String(ca).match(/^\s*([A-D])\s*(.*)$/i);
    if (m2) {
      correct_option = m2[1].toUpperCase();
      const rest = m2[2].trim();
      correct_text = rest || opts[correct_option] || '';
    } else if (ca) {
      // try to match by text
      const txt = String(ca).trim();
      const found = Object.entries(opts).find(([k,v]) => v && v === txt || (v && txt && v.includes(txt)));
      if (found) {
        correct_option = found[0];
        correct_text = found[1];
      } else {
        correct_text = txt;
      }
    }

    rows.push({ question_id, question, option_A: opts.A, option_B: opts.B, option_C: opts.C, option_D: opts.D, correct_option, correct_text });
  }
}

// write CSV
const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
const lines = [header.join(',')];
for (const r of rows) {
  const line = [r.question_id, csvEscape(r.question), csvEscape(r.option_A), csvEscape(r.option_B), csvEscape(r.option_C), csvEscape(r.option_D), csvEscape(r.correct_option), csvEscape(r.correct_text)].join(',');
  lines.push(line);
}
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log('Wrote', out, 'with', rows.length, 'rows');
