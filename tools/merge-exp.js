// Merge + validate agent explanation outputs
const fs = require('fs');
const path = require('path');
const { dataFile, workDir, workFile, readJSON, requireDir } = require('./paths');
const qs = readJSON(dataFile('questions-raw.json'));
const EXP_DIR = requireDir(workDir('exp'), '代理產出的詳解 JSON 應放在 work/exp/');

const VALID_TAGS = ['解剖生理', '病理學', '藥理學', '微生物免疫', '基本護理技術', '護理原理', '感染控制', '護理行政', '心臟血管', '呼吸系統', '消化系統', '腎臟泌尿', '內分泌代謝', '神經系統', '骨骼肌肉', '血液腫瘤', '急重症與周手術', '眼耳鼻喉皮膚', '產科護理', '兒科護理', '精神科護理', '社區衛生護理', '法規倫理'];
const VALID = new Set(VALID_TAGS);

// normalize near-miss tags agents sometimes emit
const ALIAS = {
  '兒科護理學': '兒科護理', '產科護理學': '產科護理', '精神科護理學': '精神科護理',
  '社區衛生護理學': '社區衛生護理', '社區護理': '社區衛生護理', '公共衛生': '社區衛生護理',
  '解剖學': '解剖生理', '生理學': '解剖生理', '解剖生理學': '解剖生理',
  '微生物學': '微生物免疫', '免疫學': '微生物免疫', '微生物與免疫': '微生物免疫',
  '基本護理': '基本護理技術', '護理技術': '基本護理技術', '基本護理學': '基本護理技術',
  '護理管理': '護理行政', '行政管理': '護理行政',
  '急重症': '急重症與周手術', '周手術護理': '急重症與周手術', '外科護理': '急重症與周手術',
  '重症加護': '急重症與周手術', '手術護理': '急重症與周手術',
  '眼耳鼻喉': '眼耳鼻喉皮膚', '皮膚': '眼耳鼻喉皮膚', '感官系統': '眼耳鼻喉皮膚',
  '倫理法規': '法規倫理', '護理倫理': '法規倫理', '醫護法規': '法規倫理',
  '腫瘤護理': '血液腫瘤', '血液系統': '血液腫瘤',
  '泌尿系統': '腎臟泌尿', '腎臟': '腎臟泌尿',
  '心血管': '心臟血管', '循環系統': '心臟血管',
  '內分泌': '內分泌代謝', '代謝': '內分泌代謝',
  '肌肉骨骼': '骨骼肌肉',
};
function normTag(t) {
  if (typeof t !== 'string') return null;
  t = t.trim();
  if (VALID.has(t)) return t;
  if (ALIAS[t]) return ALIAS[t];
  // suffix trim: 「XX護理學」→「XX護理」
  const trimmed = t.replace(/學$/, '');
  if (VALID.has(trimmed)) return trimmed;
  if (ALIAS[trimmed]) return ALIAS[trimmed];
  return null;
}

const SUBJECT_DEFAULT_TAG = { 1: '解剖生理', 2: '護理原理', 3: '急重症與周手術', 4: '兒科護理', 5: '社區衛生護理' };
const qById = Object.fromEntries(qs.map(q => [q.id, q]));

const merged = {};
const problems = [];
for (const f of fs.readdirSync(EXP_DIR).filter(f => f.endsWith('.json')).sort()) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(EXP_DIR, f), 'utf-8')); }
  catch (e) { problems.push(`${f}: JSON parse error: ${e.message.slice(0, 80)}`); continue; }
  if (!Array.isArray(arr)) { problems.push(`${f}: not an array`); continue; }
  for (const item of arr) {
    if (!item || !item.id || !item.exp || !item.topic) { problems.push(`${f}: incomplete item id=${item && item.id}`); continue; }
    if (!qById[item.id]) { problems.push(`${f}: unknown id=${item.id}`); continue; }
    const raw = Array.isArray(item.tags) ? item.tags : [];
    const tags = [...new Set(raw.map(normTag).filter(Boolean))];
    const dropped = raw.filter(t => !normTag(t));
    if (dropped.length) problems.push(`${f}: id=${item.id} unmappable tags: ${dropped.join(',')}`);
    if (merged[item.id]) { problems.push(`${f}: duplicate id=${item.id}`); continue; }
    merged[item.id] = {
      tags: tags.length ? tags : [SUBJECT_DEFAULT_TAG[qById[item.id].subjIdx]],
      topic: String(item.topic).trim(),
      exp: item.exp,
    };
  }
}

const missingSet = new Set(qs.filter(q => !merged[q.id]).map(q => q.id));
const batchIndex = readJSON(workFile('batches-index.json'), '請先執行 node tools/make-todo.js');
const incomplete = [];
for (const b of batchIndex) {
  const batch = JSON.parse(fs.readFileSync(workFile(`batches/${b.batchId}.json`), 'utf-8'));
  const miss = batch.filter(q => missingSet.has(q.id));
  if (miss.length) incomplete.push({ batchId: b.batchId, missing: miss.length, of: batch.length, ids: miss.map(q => q.id) });
}

fs.writeFileSync(workFile('exp-merged.json'), JSON.stringify(merged));
fs.writeFileSync(workFile('incomplete.json'), JSON.stringify(incomplete, null, 1));
// also write to project data dir
fs.writeFileSync(dataFile('explanations.json'), JSON.stringify(merged));

console.log(`covered: ${Object.keys(merged).length}/${qs.length}`);
console.log(`problems: ${problems.length}`);
problems.slice(0, 10).forEach(p => console.log('  !', p));
console.log(`incomplete batches: ${incomplete.length} (fully-missing: ${incomplete.filter(b => b.missing === b.of).length}, partial: ${incomplete.filter(b => b.missing < b.of).length})`);
incomplete.filter(b => b.missing < b.of).forEach(b => console.log(`  ~ ${b.batchId}: ${b.missing}/${b.of} missing`));
