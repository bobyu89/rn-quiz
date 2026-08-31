// QC: verify ✅ marker lands on the official answer in every explanation
const fs = require('fs');
const path = require('path');
const { dataFile, workDir, workFile, readJSON, requireDir } = require('./paths');
const qs = readJSON(dataFile('questions-raw.json'));
const qById = Object.fromEntries(qs.map(q => [q.id, q]));
const EXP_DIR = requireDir(workDir('exp'), '代理產出的詳解 JSON 應放在 work/exp/（見 tools/AGENT-INSTRUCTIONS.md）');

const bad = [], noMark = [], byFile = {};
let checked = 0;

for (const f of fs.readdirSync(EXP_DIR).filter(f => f.endsWith('.json')).sort()) {
  let arr; try { arr = JSON.parse(fs.readFileSync(path.join(EXP_DIR, f), 'utf-8')); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  for (const it of arr) {
    const q = qById[it.id]; if (!q || !it.exp) continue;
    checked++;
    // find which option letters carry ✅ — match lines like "(A) → ✅ ..." or "(A) ✅"
    const marked = [];
    for (const L of 'ABCD') {
      const re = new RegExp(`\\(${L}\\)[^\\n]*✅`);
      if (re.test(it.exp)) marked.push(L);
    }
    const expected = q.answerType === 'free' ? null
      : q.answerType === 'multi' ? (q.accept || [])
      : [q.answer];
    if (!marked.length) { noMark.push({ f, id: it.id, type: q.answerType }); continue; }
    if (expected === null) continue; // free: any marking acceptable
    const ok = marked.length === expected.length && marked.every(m => expected.includes(m));
    if (!ok) {
      bad.push({ f, id: it.id, marked: marked.join(''), expect: expected.join(''), neg: /錯誤|不適當|不正確|不宜|非/.test(q.question) });
      byFile[f] = (byFile[f] || 0) + 1;
    }
  }
}
console.log(`checked: ${checked}`);
console.log(`✅ misplaced: ${bad.length}  (negative-stem: ${bad.filter(b => b.neg).length})`);
console.log(`no ✅ marker: ${noMark.length}`);
if (Object.keys(byFile).length) {
  console.log('\nby file:');
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${f}: ${n}`));
}
bad.slice(0, 15).forEach(b => console.log(`  id=${b.id} marked=${b.marked} expect=${b.expect} ${b.neg ? '(否定式)' : ''} [${b.f}]`));
fs.writeFileSync(workFile('qc-bad.json'), JSON.stringify(bad, null, 1));
