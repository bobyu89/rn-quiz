// Build per-category batches of HIGH-FREQUENCY subtopics for 考點導讀 generation
const fs = require('fs');
const path = require('path');
const { dataFile, workDir, workFile, readJSON, requireDir } = require('./paths');
const qs = readJSON(dataFile('questions-raw.json'));
const merged = readJSON(fs.existsSync(workFile('exp-merged.json')) ? workFile('exp-merged.json') : dataFile('explanations.json'));
const qById = Object.fromEntries(qs.map(q => [q.id, q]));

const MIN_COUNT = 3;      // only subtopics with >= 3 questions get an intro
const OUT = workDir('intro-batches');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(workDir('intro'), { recursive: true });

// aggregate
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
  const hot = Object.entries(subs)
    .filter(([, t]) => t.count >= MIN_COUNT)
    .sort((a, b) => b[1].count - a[1].count);
  if (!hot.length) continue;
  // split into chunks of ~12 subtopics per agent
  const CH = 12;
  const nChunks = Math.ceil(hot.length / CH);
  for (let i = 0; i < nChunks; i++) {
    const part = hot.slice(i * CH, (i + 1) * CH);
    const payload = {
      category: c,
      subtopics: part.map(([name, t]) => ({
        name, count: t.count,
        years: [...t.years].sort(),
        sampleQuestions: t.qs.slice(0, 3).map(x => x.slice(0, 90)),
      })),
    };
    const id = nChunks > 1 ? `${c}_${i + 1}` : c;
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(payload, null, 0));
    index.push({ introId: id, category: c, subtopics: part.length });
  }
}
fs.writeFileSync(workFile('intro-index.json'), JSON.stringify(index, null, 1));
console.log(`intro batches: ${index.length}, subtopics: ${index.reduce((s, b) => s + b.subtopics, 0)}`);
index.forEach(b => console.log(`  ${b.introId}: ${b.subtopics}`));
