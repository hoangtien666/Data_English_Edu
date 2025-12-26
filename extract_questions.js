const axios = require('axios');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const fs = require('fs');
const { URL } = require('url');

const START_URL = process.argv[2] || 'https://baitaptracnghiem.com/danh-sach-bai-tap/bai-tap-tieng-anh';
const OUTPUT_CSV = 'questions.csv';
const LIMIT = parseInt(process.env.LIMIT || '50', 10);

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

async function fetchHTML(url) {
  const res = await client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (crawler)' } });
  return res.data;
}

function resolveUrl(base, relative) {
  try { return new URL(relative, base).href; } catch (e) { return relative; }
}

async function getExerciseLinks(listUrl) {
  const html = await fetchHTML(listUrl);
  const $ = cheerio.load(html);
  const links = new Set();

  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.includes('/bai-tap') || href.includes('bai-tap') || href.includes('/danh-sach-bai-tap/')) {
      links.add(resolveUrl(listUrl, href));
    }
  });

  if (links.size === 0) {
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (href.startsWith('/') || href.startsWith(listUrl) || href.includes(new URL(listUrl).hostname)) {
        links.add(resolveUrl(listUrl, href));
      }
    });
  }

  return Array.from(links).slice(0, LIMIT);
}

async function submitFormHtml(pageHtml, pageUrl) {
  const $ = cheerio.load(pageHtml);
  const form = $('form').first();
  if (!form || !form.length) return null;
  const action = form.attr('action') || pageUrl;
  const method = (form.attr('method') || 'POST').toUpperCase();
  const inputs = {};

  form.find('input, textarea, select').each((i, el) => {
    const t = $(el);
    const name = t.attr('name');
    if (!name) return;
    if (el.tagName.toLowerCase() === 'select') {
      const opt = t.find('option[selected]').attr('value') || t.find('option').first().attr('value');
      inputs[name] = opt || '';
      return;
    }
    const type = (t.attr('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (t.attr('checked') || t.attr('value')) inputs[name] = t.attr('value') || 'on';
      return;
    }
    inputs[name] = t.attr('value') || '';
  });

  const target = resolveUrl(pageUrl, action);
  try {
    if (method === 'POST') {
      const body = new URLSearchParams(inputs).toString();
      const res = await client.post(target, body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (crawler)' } });
      return res.data;
    } else {
      const res = await client.get(target, { params: inputs });
      return res.data;
    }
  } catch (err) {
    return null;
  }
}

function normalizeText(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').replace(/\r|\n/g, ' ').trim();
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function findQuestionsFromDom($) {
  const candidates = [];
  const selectors = ['.question', '[class*="question"]', '.q-item', '.quest', '.question-item', '.quest-item', 'article.question'];
  const seen = new Set();

  selectors.forEach(sel => {
    $(sel).each((i, el) => {
      if (seen.has(el)) return;
      seen.add(el);
      candidates.push($(el));
    });
  });

  // If none found, try to find blocks with radio lists
  if (candidates.length === 0) {
    $('div, section, article').each((i, el) => {
      const t = $(el);
      if (t.find('input[type="radio"]').length >= 2 || t.find('label').length >= 2) {
        candidates.push(t);
      }
    });
  }

  const questions = [];
  candidates.forEach((t, idx) => {
    let qText = '';
    const qSelectors = ['.question-text', '.q-text', 'h3', 'h4', 'p'];
    for (const s of qSelectors) {
      const found = t.find(s).first();
      if (found && found.text()) { qText = normalizeText(found.text()); break; }
    }
    if (!qText) {
      const full = normalizeText(t.text());
      qText = full.split('\n')[0];
    }

    // find options
    const opts = [];
    // radio + label pairing
    t.find('input[type="radio"]').each((i, inp) => {
      const id = $(inp).attr('id');
      let label = '';
      if (id) {
        const lab = t.find(`label[for="${id}"]`).first();
        if (lab && lab.text()) label = normalizeText(lab.text());
      }
      if (!label) {
        const sib = $(inp).next('label');
        if (sib && sib.text()) label = normalizeText(sib.text());
      }
      if (!label) label = normalizeText($(inp).parent().text());
      if (label) opts.push(label);
    });

    // look for list items or .option
    if (opts.length === 0) {
      t.find('li').each((i, li) => {
        const txt = normalizeText($(li).text());
        if (txt && txt.length < 500) opts.push(txt);
      });
    }

    if (opts.length === 0) {
      t.find('[class*="option"]').each((i, el) => {
        const txt = normalizeText($(el).text());
        if (txt) opts.push(txt);
      });
    }

    if (!qText && opts.length === 0) return;

    questions.push({ question: qText, options: opts });
  });

  return questions;
}

function findCorrectFromResponseHtml(html, questions) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];

  // Strategy 1: look for elements with class containing 'correct' or 'answer'
  const correctEls = $('[class*="correct"], [class*="answer"], .dap-an, .dap-an-dung');
  if (correctEls.length > 0) {
    correctEls.each((i, el) => {
      const txt = normalizeText($(el).text());
      if (txt) results.push(txt);
    });
    return results;
  }

  // Strategy 2: find text patterns like "Đáp án: X" or "Correct:"
  const bodyText = normalizeText($.root().text());
  const reVn = /Đáp án(?: đúng)?[:\s]*([A-D]|[A-D]\.?)|Đáp án[:]?(.*?)(?=\s{2,}|$)/gi;
  let m;
  while ((m = reVn.exec(bodyText)) !== null) {
    if (m[1]) results.push(m[1].trim());
    else if (m[2]) results.push(m[2].trim());
  }

  const reEn = /Correct answer[:\s]*(A|B|C|D|[A-D])|Answer[:\s]*(A|B|C|D)/gi;
  while ((m = reEn.exec(bodyText)) !== null) {
    if (m[1]) results.push(m[1].trim());
    else if (m[2]) results.push(m[2].trim());
  }

  // Strategy 3: try to locate JSON data in scripts
  $('script').each((i, el) => {
    const s = $(el).html();
    if (!s) return;
    if (s.includes('questions') || s.includes('answers') || s.includes('dap_an')) {
      const js = s.replace(/^\s*window\.__NEXT_DATA__\s*=\s*/m, '');
      // try to find a JSON object
      const firstIdx = js.indexOf('{');
      const lastIdx = js.lastIndexOf('}');
      if (firstIdx >= 0 && lastIdx > firstIdx) {
        try {
          const json = JSON.parse(js.slice(firstIdx, lastIdx + 1));
          if (json && typeof json === 'object') {
            if (json.props && json.props.pageProps) {
              const qp = JSON.stringify(json.props.pageProps);
              const matches = qp.match(/(A|B|C|D)\b/g);
              if (matches) matches.forEach(x => results.push(x));
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
  });

  return results;
}

(async () => {
  console.log('Start URL:', START_URL);
  const links = await getExerciseLinks(START_URL);
  console.log(`Found ${links.length} candidate links (limit ${LIMIT}).`);

  const rows = [];
  let qGlobalId = 1;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    console.log(`(${i+1}/${links.length}) Processing: ${link}`);
    let pageHtml;
    try {
      pageHtml = await fetchHTML(link);
    } catch (e) {
      console.error('Failed to fetch', link, e.message);
      continue;
    }

    const $ = cheerio.load(pageHtml);
    let questions = findQuestionsFromDom($);

    // If not found, try to extract from script JSON
    if (questions.length === 0) {
      $('script').each((i, el) => {
        const s = $(el).html();
        if (!s) return;
        if (s.includes('questions') || s.includes('answers') || s.includes('dap_an')) {
          const jsonTextMatch = s.match(/\{[\s\S]*\}/);
          if (jsonTextMatch) {
            try {
              const j = JSON.parse(jsonTextMatch[0]);
              if (j.questions && Array.isArray(j.questions)) {
                j.questions.forEach(q => {
                  const opts = (q.options || q.answers || []).map(x => typeof x === 'string' ? x : (x.text || ''));
                  questions.push({ question: q.question || q.title || '', options: opts });
                });
              }
            } catch (e) { }
          }
        }
      });
    }

    // attempt to submit the form to get answers
    const respHtml = await submitFormHtml(pageHtml, link);
    const corrects = findCorrectFromResponseHtml(respHtml || pageHtml, questions);

    // map questions to rows
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      const opts = q.options || [];
      const A = opts[0] || '';
      const B = opts[1] || '';
      const C = opts[2] || '';
      const D = opts[3] || '';
      let correct_option = '';
      let correct_text = '';

      // try to use corrects array by index
      if (corrects && corrects[qi]) {
        const c = corrects[qi];
        // if c is letter
        const letter = (c || '').toUpperCase().match(/[A-D]/);
        if (letter) {
          correct_option = letter[0];
          const idx = 'ABCD'.indexOf(correct_option);
          correct_text = [A,B,C,D][idx] || '';
        } else {
          // match by option text
          const foundIdx = [A,B,C,D].findIndex(x => x && c && x.includes(c));
          if (foundIdx >= 0) {
            correct_option = 'ABCD'[foundIdx];
            correct_text = [A,B,C,D][foundIdx];
          } else {
            correct_text = c;
          }
        }
      }

      const row = {
        question_id: qGlobalId++,
        question: q.question || '',
        option_A: A,
        option_B: B,
        option_C: C,
        option_D: D,
        correct_option: correct_option,
        correct_text: correct_text
      };
      rows.push(row);
    }
  }

  // write CSV
  const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    const line = [r.question_id, csvEscape(r.question), csvEscape(r.option_A), csvEscape(r.option_B), csvEscape(r.option_C), csvEscape(r.option_D), csvEscape(r.correct_option), csvEscape(r.correct_text)].join(',');
    lines.push(line);
  });
  fs.writeFileSync(OUTPUT_CSV, lines.join('\n'), 'utf8');
  console.log('Wrote', OUTPUT_CSV, 'with', rows.length, 'questions.');
})();
