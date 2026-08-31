// 只為「尚未有導讀」的熱門考點切批 → tools/intro-todo/{領域}_{n}.json
// usage: node tools/make-intro-todo.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const qs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions-raw.json'), 'utf-8'));
const merged = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'explanations.json'), 'utf-8'));
const intros = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'topic-intros.json'), 'utf-8'));
const SRC = path.join(ROOT, 'data', 'intro-src');
// 既有 intro-src 檔名 → 每個領域已用到的最大編號（無編號的檔案視為佔用 1 號）
const used = {};
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.json'))) {
  const base = f.replace(/\.json$/, '');
  const m = base.match(/^(.*?)_(\d+)$/);
  const c = m ? m[1] : base;
  const n = m ? Number(m[2]) : 1;
  used[c] = Math.max(used[c] || 0, n);
}
const qById = Object.fromEntries(qs.map(q => [q.id, q]));

const MIN_COUNT = 3, CH = 12;
const { workDir, workFile } = require('./paths');
const OUT = workDir('intro-todo');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const cat = {};
for (const [id, e] of Object.entries(merged)) {
  const q = qById[id]; if (!q) continue;
  const c = e.tags[0], s = e.topic;
  cat[c] = cat[c] || {};
  const t = cat[c][s] = cat[c][s] || { count: 0, years: new Set(), qs: [] };
  t.count++; t.years.add(q.year); t.qs.push(q.question);
}

const index = [];
for (const [c, subs] of Object.entries(cat)) {
  const todo = Object.entries(subs)
    .filter(([n, t]) => t.count >= MIN_COUNT && !(intros[c] && intros[c][n]))
    .sort((a, b) => b[1].count - a[1].count);
  if (!todo.length) continue;
  // 續編號：避開 data/intro-src 既有的檔名
  const nChunks = Math.ceil(todo.length / CH);
  for (let i = 0; i < nChunks; i++) {
    const part = todo.slice(i * CH, (i + 1) * CH);
    const payload = {
      category: c,
      subtopics: part.map(([name, t]) => ({
        name, count: t.count,
        years: [...t.years].sort(),
        sampleQuestions: t.qs.slice(0, 3).map(x => x.slice(0, 90)),
      })),
    };
    const id = `${c}_todo${i + 1}`;
    const target = `${c}_${(used[c] || 0) + i + 1}.json`;
    payload.targetFile = `data/intro-src/${target}`;
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(payload, null, 0));
    index.push({ introId: id, category: c, subtopics: part.length, targetFile: payload.targetFile });
  }
}
fs.writeFileSync(workFile('intro-todo-index.json'), JSON.stringify(index, null, 1));
console.log(`待補批次 ${index.length} 個，考點 ${index.reduce((s, b) => s + b.subtopics, 0)} 個`);
index.forEach(b => console.log(`  ${b.introId}: ${b.subtopics} → ${b.targetFile}`));
