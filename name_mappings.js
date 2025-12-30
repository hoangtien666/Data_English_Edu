const fs = require('fs');
const path = require('path');

const inPath = path.join(__dirname, 'mapping_output.json');
const outPath = path.join(__dirname, 'mapping_output_named.json');

let data;
try {
  data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
} catch (err) {
  console.error('Error reading or parsing', inPath, err.message);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error('Expected mapping_output.json to contain an array');
  process.exit(1);
}

const named = data.map((mapping, idx) => {
  const name = `text box ${idx + 1}`;
  return { [name]: mapping };
});

fs.writeFileSync(outPath, JSON.stringify(named, null, 2), 'utf8');
console.log(`Wrote ${named.length} named mappings to ${outPath}`);
