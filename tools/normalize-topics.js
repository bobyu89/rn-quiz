// 考點名稱正規化：依 tools/topic-aliases.json 合併同義 topic
// 會就地改寫 data/explanations.json 與 data/topic-intros.json
// usage: node tools/normalize-topics.js [--dry]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const aliases = JSON.parse(fs.readFileSync(path.join(__dirname, 'topic-aliases.json'), 'utf-8'));
delete aliases._comment;
const expPath = path.join(ROOT, 'data', 'explanations.json');
const introPath = path.join(ROOT, 'data', 'topic-intros.json');
const exp = JSON.parse(fs.readFileSync(expPath, 'utf-8'));
const intros = JSON.parse(fs.readFileSync(introPath, 'utf-8'));

// 1) 改寫 explanations 的 topic
const hits = {};
for (const e of Object.values(exp)) {
  const cat = e.tags && e.tags[0];
  const map = aliases[cat];
  if (!map || !map[e.topic]) continue;
  const k = `${cat}/${e.topic} → ${map[e.topic]}`;
  hits[k] = (hits[k] || 0) + 1;
  e.topic = map[e.topic];
}

// 2) 改寫 topic-intros 的 key（若目標已存在，保留既有、丟棄被合併者）
const introMoves = [], introDrops = [];
for (const [cat, map] of Object.entries(aliases)) {
  if (!intros[cat]) continue;
  for (const [from, to] of Object.entries(map)) {
    if (!intros[cat][from]) continue;
    if (intros[cat][to]) { introDrops.push(`${cat}/${from}（${to} 已有導讀）`); }
    else { intros[cat][to] = intros[cat][from]; introMoves.push(`${cat}/${from} → ${to}`); }
    delete intros[cat][from];
  }
}

console.log('題目 topic 改名：');
Object.entries(hits).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n} 題  ${k}`));
console.log(`小計 ${Object.values(hits).reduce((s, n) => s + n, 0)} 題、${Object.keys(hits).length} 組`);
if (introMoves.length) { console.log('導讀改名：'); introMoves.forEach(m => console.log('  ' + m)); }
if (introDrops.length) { console.log('導讀丟棄（目標已有）：'); introDrops.forEach(m => console.log('  ' + m)); }

if (DRY) { console.log('\n[dry run] 未寫檔'); process.exit(0); }
fs.writeFileSync(expPath, JSON.stringify(exp));
fs.writeFileSync(introPath, JSON.stringify(intros));
console.log('\n已寫回 data/explanations.json、data/topic-intros.json');
