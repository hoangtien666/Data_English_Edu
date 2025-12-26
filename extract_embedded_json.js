const fs = require('fs');

function findBalanced(str, startIdx) {
  let i = startIdx;
  if (str[i] !== '{') return null;
  let depth = 0;
  for (; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') depth--;
    if (depth === 0) return str.slice(startIdx, i + 1);
  }
  return null;
}

const data = JSON.parse(fs.readFileSync('responses.json', 'utf8'));
const found = [];

for (const entry of data) {
  const body = entry.body || '';

  // __NEXT_DATA__ = {...}
  const nextDataRegex = /__NEXT_DATA__\s*=\s*({[\s\S]*?})\s*;/g;
  let m;
  while ((m = nextDataRegex.exec(body)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      found.push({ url: entry.url, type: '__NEXT_DATA__', data: parsed });
    } catch (e) {}
  }

  // self.__next_f.push([...,"<escaped>"])
  const nextFRegex = /self\.__next_f\.push\(\[[\s\S]*?,"([\s\S]*?)"\]\)/g;
  while ((m = nextFRegex.exec(body)) !== null) {
    let s = m[1];
    // unescape common sequences
    s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\"/g, '\"');
    s = s.replace(/\\\//g, '/');
    s = s.replace(/\\\\/g, '\\');

    // if it looks like JSON array/object, try to find exam/questions
    if (s.includes('"exam"') || s.includes('"questions"')) {
      // attempt to locate "exam":{...}
      const idx = s.indexOf('"exam"');
      if (idx !== -1) {
        const colon = s.indexOf(':', idx);
        if (colon !== -1) {
          const braceIdx = s.indexOf('{', colon);
          if (braceIdx !== -1) {
            const candidate = findBalanced(s, braceIdx);
            if (candidate) {
              try {
                const parsed = JSON.parse(candidate);
                found.push({ url: entry.url, type: 'exam', data: parsed });
              } catch (e) {
                // ignore parse errors
              }
            }
          }
        }
      }
      // also try to find a top-level JSON object in s
      const topIdx = s.indexOf('{');
      if (topIdx !== -1) {
        const candidate = findBalanced(s, topIdx);
        if (candidate) {
          try {
            const parsed = JSON.parse(candidate);
            found.push({ url: entry.url, type: 'obj', data: parsed });
          } catch (e) {}
        }
      }
    }
  }

  // fallback: search for escaped "questions":\n sequences
  const escQuestions = body.match(/\\\"questions\\\"/g);
  if (escQuestions) {
    // try to unescape entire body and search
    let un = body.replace(/\\\"/g, '"').replace(/\\n/g, '\n');
    const qIdx = un.indexOf('"questions"');
    if (qIdx !== -1) {
      const colon = un.indexOf(':', qIdx);
      const braceIdx = un.indexOf('{', colon);
      if (braceIdx !== -1) {
        const candidate = findBalanced(un, braceIdx);
        if (candidate) {
          try {
            const parsed = JSON.parse(candidate);
            found.push({ url: entry.url, type: 'questions-obj', data: parsed });
          } catch (e) {}
        }
      }
    }
  }
}

fs.writeFileSync('extracted_jsons.json', JSON.stringify(found, null, 2));
console.log('Wrote extracted_jsons.json with', found.length, 'items');
