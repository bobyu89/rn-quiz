// 把 tools/topic-aliases.json 的考點正規化套用到 data/intro-src/*.json 的 key
// （normalize-topics.js 只改題目端；導讀來源檔也要跟著改，否則 merge-intros.js 會把舊 key 蓋回來）
// usage: node tools/normalize-intro-src.js [--dry]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'intro-src');
const DRY = process.argv.includes('--dry');

const aliases = JSON.parse(fs.readFileSync(path.join(__dirname, 'topic-aliases.json'), 'utf-8'));
delete aliases._comment;

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json')).sort();
const catOf = f => f.replace(/\.json$/, '').replace(/_\d+$/, '');

// 先掃過一遍：每個領域「已經存在的正式名」有哪些（跨檔案）
const existing = {};
const loaded = {};
for (const f of files) {
  const obj = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf-8'));
  loaded[f] = obj;
  const c = catOf(f);
  existing[c] = existing[c] || new Set();
  Object.keys(obj).forEach(k => existing[c].add(k));
}

const renamed = [], dropped = [];
const dirty = new Set();

for (const f of files) {
  const c = catOf(f);
  const map = aliases[c];
  if (!map) continue;
  const obj = loaded[f];
  for (const [from, to] of Object.entries(map)) {
    if (!(from in obj)) continue;
    if (existing[c].has(to)) {
      // 正式名已有導讀（可能在別的檔案），丟棄被合併的那份
      delete obj[from];
      dropped.push(`${f}: ${from}（${to} 已有導讀）`);
    } else {
      obj[to] = obj[from];
      delete obj[from];
      existing[c].add(to);
      renamed.push(`${f}: ${from} → ${to}`);
    }
    existing[c].delete(from);
    dirty.add(f);
  }
}

if (renamed.length) { console.log('改名：'); renamed.forEach(x => console.log('  ' + x)); }
if (dropped.length) { console.log('丟棄：'); dropped.forEach(x => console.log('  ' + x)); }
if (!renamed.length && !dropped.length) console.log('沒有需要正規化的 key');

if (DRY) { console.log('\n[dry run] 未寫檔'); process.exit(0); }
for (const f of dirty) {
  fs.writeFileSync(path.join(SRC, f), JSON.stringify(loaded[f], null, 1));
}
console.log(`\n已更新 ${dirty.size} 個 intro-src 檔案，請接著執行 node tools/merge-intros.js`);
