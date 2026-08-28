// Rebuild batch files containing ONLY questions still missing explanations
const fs = require('fs');
const path = require('path');
const qs = require('./questions-raw.json');
const merged = JSON.parse(fs.readFileSync(path.join(__dirname, 'exp-merged.json'), 'utf-8'));

const TODO = path.join(__dirname, 'todo');
fs.rmSync(TODO, { recursive: true, force: true });
fs.mkdirSync(TODO, { recursive: true });

const SUBJ = { 1: '基礎醫學', 2: '基本護理學與護理行政', 3: '內外科護理學', 4: '產兒科護理學', 5: '精神科與社區衛生護理學' };

// group missing questions by paper
const papers = {};
for (const q of qs) {
  if (merged[q.id]) continue;
  const key = `${q.year}-${q.session}-${q.subjIdx}`;
  (papers[key] = papers[key] || []).push(q);
}

const TARGET = 28;  // aim per agent; split evenly so no runt chunks
const index = [];
for (const [key, list] of Object.entries(papers)) {
  list.sort((a, b) => a.number - b.number);
  const slim = list.map(q => ({
    id: q.id, number: q.number, question: q.question, options: q.options,
    answer: q.answer, answerType: q.answerType,
    ...(q.accept ? { accept: q.accept } : {}), ...(q.note ? { note: q.note } : {}),
  }));
  const nChunks = Math.max(1, Math.round(slim.length / TARGET));
  const size = Math.ceil(slim.length / nChunks);
  for (let i = 0; i < nChunks; i++) {
    const part = slim.slice(i * size, (i + 1) * size);
    if (!part.length) continue;
    const id = nChunks > 1 ? `${key}_${i + 1}` : key;
    fs.writeFileSync(path.join(TODO, `${id}.json`), JSON.stringify(part, null, 0));
    const [y, s, sj] = key.split('-');
    index.push({ todoId: id, count: part.length, year: +y, session: +s, subjIdx: +sj, subject: SUBJ[sj] });
  }
}
fs.writeFileSync(path.join(__dirname, 'todo-index.json'), JSON.stringify(index, null, 1));
console.log(`todo batches: ${index.length}, questions: ${index.reduce((s, b) => s + b.count, 0)}`);
const bySubj = {};
index.forEach(b => bySubj[b.subject] = (bySubj[b.subject] || 0) + b.count);
console.log(bySubj);
