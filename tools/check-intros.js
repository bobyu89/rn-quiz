// 考點導讀驗收：覆蓋率 + 欄位完整性 + 孤兒導讀
// usage: node tools/check-intros.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const D = p => path.join(ROOT, 'data', p);

const qs = JSON.parse(fs.readFileSync(D('questions-raw.json'), 'utf-8'));
const exp = JSON.parse(fs.readFileSync(D('explanations.json'), 'utf-8'));
const intros = JSON.parse(fs.readFileSync(D('topic-intros.json'), 'utf-8'));
const qById = Object.fromEntries(qs.map(q => [q.id, q]));

const MIN_COUNT = 3;
const REQUIRED = ['summary', 'definition', 'keyPoints', 'mustKnow', 'traps', 'mnemonics', 'samples'];
const ARRAYS = ['keyPoints', 'mustKnow', 'traps', 'mnemonics', 'samples'];

// 題目端聚合
const cat = {};
for (const [id, e] of Object.entries(exp)) {
  const q = qById[id]; if (!q) continue;
  const c = e.tags[0], s = e.topic;
  cat[c] = cat[c] || {};
  cat[c][s] = (cat[c][s] || 0) + 1;
}

let hot = 0, covered = 0;
const missing = [], badFields = [], orphans = [];

for (const [c, subs] of Object.entries(cat)) {
  for (const [name, count] of Object.entries(subs)) {
    if (count < MIN_COUNT) continue;
    hot++;
    const intro = intros[c] && intros[c][name];
    if (!intro) { missing.push(`${c}/${name}（${count} 題）`); continue; }
    covered++;
    const bad = [];
    for (const f of REQUIRED) {
      if (intro[f] == null || intro[f] === '') bad.push(f + ' 缺');
      else if (ARRAYS.includes(f) && (!Array.isArray(intro[f]) || !intro[f].length)) bad.push(f + ' 非陣列或空');
    }
    if (typeof intro.definition === 'string' && intro.definition.length < 40) bad.push('definition 過短');
    if (bad.length) badFields.push(`${c}/${name}: ${bad.join('、')}`);
  }
}

// 有導讀但題目端已無對應考點（多半是 topic 改名後的殘留）
for (const [c, subs] of Object.entries(intros)) {
  for (const name of Object.keys(subs)) {
    if (!cat[c] || cat[c][name] == null) orphans.push(`${c}/${name}`);
  }
}

const pct = hot ? (covered / hot * 100).toFixed(1) : '0';
console.log(`熱門考點（>=${MIN_COUNT} 題）：${hot} 個`);
console.log(`已有導讀：${covered} 個（${pct}%）`);
console.log(`導讀總數：${Object.values(intros).reduce((s, o) => s + Object.keys(o).length, 0)} 個、${Object.keys(intros).length} 個領域`);

function list(title, arr, limit = 30) {
  if (!arr.length) { console.log(`\n${title}：無`); return; }
  console.log(`\n${title}：${arr.length} 筆`);
  arr.slice(0, limit).forEach(x => console.log('  ! ' + x));
  if (arr.length > limit) console.log(`  …另有 ${arr.length - limit} 筆`);
}
list('尚未產生導讀', missing);
list('欄位不完整', badFields);
list('孤兒導讀（題目端已無此考點）', orphans);

process.exit(missing.length || badFields.length ? 1 : 0);
