// Merge per-category 考點導讀 JSON files into data/topic-intros.json
// usage: node tools/merge-intros.js <intro-dir>
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv[2] || path.join(ROOT, 'data', 'intro-src');

if (!fs.existsSync(SRC)) { console.error('intro source dir not found:', SRC); process.exit(1); }

const out = {};
let files = 0, topics = 0;
const problems = [];
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.json')).sort()) {
  // "心臟血管.json" or "兒科護理_2.json" → category
  const cat = f.replace(/\.json$/, '').replace(/_\d+$/, '');
  let obj;
  try { obj = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf-8')); }
  catch (e) { problems.push(`${f}: parse error ${e.message.slice(0, 60)}`); continue; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { problems.push(`${f}: not an object`); continue; }
  files++;
  out[cat] = out[cat] || {};
  for (const [name, intro] of Object.entries(obj)) {
    if (!intro || !intro.summary) { problems.push(`${f}: ${name} missing summary`); continue; }
    if (out[cat][name]) problems.push(`${f}: duplicate topic ${cat}/${name}`);
    out[cat][name] = intro;
    topics++;
  }
}

fs.writeFileSync(path.join(ROOT, 'data', 'topic-intros.json'), JSON.stringify(out));
console.log(`merged ${files} files → ${Object.keys(out).length} categories, ${topics} topics`);
if (problems.length) { console.log('problems:'); problems.slice(0, 10).forEach(p => console.log('  !', p)); }
