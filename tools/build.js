// 護理師國考冒險記 — build index.html from template + data
// usage: node tools/build.js   (run from 國考題庫 root or tools/)
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DATA = p => path.join(ROOT, 'data', p);

const SUBJECT_DEFAULT_TAG = { 1: '解剖生理', 2: '護理原理', 3: '急重症與周手術', 4: '兒科護理', 5: '社區衛生護理' };

// ---------- load ----------
const template = fs.readFileSync(path.join(ROOT, 'tools', 'template.html'), 'utf-8').replace(/\r\n/g, '\n');
const raw = JSON.parse(fs.readFileSync(DATA('questions-raw.json'), 'utf-8'));
const expMap = fs.existsSync(DATA('explanations.json')) ? JSON.parse(fs.readFileSync(DATA('explanations.json'), 'utf-8')) : {};
const introsFile = fs.existsSync(DATA('topic-intros.json')) ? JSON.parse(fs.readFileSync(DATA('topic-intros.json'), 'utf-8')) : {};

// ---------- questions ----------
const questions = raw.map(q => {
  const e = expMap[q.id];
  let answer;
  if (q.answerType === 'multi') answer = (q.accept || []).join('、');
  else if (q.answerType === 'free') answer = 'A、B、C、D';
  else answer = q.answer;
  return {
    number: q.number,
    question: q.question,
    options: q.options,
    answer,
    tags: e && e.tags && e.tags.length ? e.tags : [SUBJECT_DEFAULT_TAG[q.subjIdx]],
    id: q.id,
    year: q.year,
    session: q.session,
    exam_type: q.subject,
    source: `${q.year}年第${q.session}次專技高考護理師・${q.subject} 第${q.number}題`,
  };
});

// ---------- explanations ----------
const EXP = {};
for (const q of raw) {
  const e = expMap[q.id];
  if (!e || !e.exp) continue;
  let banner = '';
  if (q.answerType === 'free') banner += `> 📢 **官方公告送分**：${q.note || '本題一律給分'}\n\n`;
  else if (q.answerType === 'multi') banner += `> 📢 **官方公告**：${q.note || '本題多個答案均給分'}\n\n`;
  else if (q.note) banner += `> 📢 **官方公告**：${q.note}\n\n`;
  if (/如下圖|如附圖|下圖|附圖|圖所示|示意圖|見圖/.test(q.question)) banner += `> 🖼️ 本題原試卷附有圖片，建議對照官方 PDF 檔（pdfs/${q.year}-${q.session}-${q.subjIdx}-Q.pdf）。\n\n`;
  EXP[q.id] = banner + e.exp;
}

// ---------- topics aggregation ----------
const TOPICS = {};
for (const q of raw) {
  const e = expMap[q.id];
  if (!e || !e.topic || !e.tags || !e.tags.length) continue;
  const cat = e.tags[0];
  const sub = e.topic;
  TOPICS[cat] = TOPICS[cat] || {};
  const t = TOPICS[cat][sub] = TOPICS[cat][sub] || { stars: 1, count: 0, qids: [], years: [] };
  t.count++;
  t.qids.push(q.id);
  if (!t.years.includes(q.year)) t.years.push(q.year);
}
for (const cat of Object.keys(TOPICS)) {
  for (const sub of Object.keys(TOPICS[cat])) {
    const t = TOPICS[cat][sub];
    t.years.sort();
    t.stars = t.count >= 20 ? 5 : t.count >= 12 ? 4 : t.count >= 7 ? 3 : t.count >= 3 ? 2 : 1;
  }
}

// ---------- topic intros (+ inject samples into TOPICS) ----------
const INTROS = {};
for (const [cat, subs] of Object.entries(introsFile)) {
  INTROS[cat] = {};
  for (const [sub, intro] of Object.entries(subs)) {
    const { samples, ...rest } = intro;
    INTROS[cat][sub] = rest;
    if (samples && TOPICS[cat] && TOPICS[cat][sub]) TOPICS[cat][sub].samples = samples;
  }
}

// ---------- template split ----------
const lines = template.split('\n');
const qdIdx = lines.findIndex(l => l.startsWith('window.__QD='));
const introIdx = lines.findIndex(l => l.startsWith('window.__TOPIC_INTROS='));
if (qdIdx < 0 || introIdx < 0) throw new Error('template data block not found');
let head = lines.slice(0, qdIdx).join('\n');
let tail = lines.slice(introIdx + 1).join('\n');

// ---------- patches ----------
let patchFail = 0;
function patch(part, from, to, label) {
  const target = part === 'head' ? head : tail;
  const cnt = target.split(from).length - 1;
  if (cnt !== 1) { console.error(`✗ patch "${label}" matched ${cnt} times (expect 1)`); patchFail++; return; }
  if (part === 'head') head = head.replace(from, to); else tail = tail.replace(from, to);
  console.log(`✓ ${label}`);
}

patch('head', '<title>專科護理師冒險記 ⚔️</title>', '<title>護理師國考冒險記 ⚔️</title>', 'title');
patch('head', '⚕️ NP QUEST ⚕️', '⚕️ RN QUEST ⚕️', 'logo-tag');
patch('head', '專科護理師<br>冒險記', '護理師國考<br>冒險記', 'logo-h1');
patch('head', '像素冒險風 Design System — 專科護理師刷題神器', '像素冒險風 Design System — 護理師國考刷題神器', 'css-comment');
patch('head', '📋 選擇考試類型（可複選，不選＝全部）', '📋 選擇考科（可複選，不選＝全部）', 'examtype-label');
patch('head', '🔬 選擇科別（不選＝全部）', '🔬 選擇領域（不選＝全部）', 'subject-label');
patch('head', '① 類別', '① 領域群', 'cat-label');
patch('head', '② 細科（可複選）', '② 領域（可複選）', 'sub-label');
patch('head', '<span class="mode-icon">🔬</span><div class="mode-name">科別</div><div class="mode-desc">指定科目練習</div>', '<span class="mode-icon">🔬</span><div class="mode-name">考科</div><div class="mode-desc">考科／領域練習</div>', 'mode-card');
patch('head', '年份 / 科別<br>智慧複習 / 錯題', '年份 / 考科<br>智慧複習 / 錯題', 'landing-desc');

patch('tail', `const SUBJECT_CATEGORIES = {
  '內科系': ['心臟血管', '呼吸系統', '消化系統', '腎臟泌尿', '神經系統', '內分泌代謝', '感染免疫', '血液腫瘤'],
  '外科系': ['外科周手術', '骨骼肌肉', '重症加護'],
  '專  科': ['婦產科', '精神科', '兒科'],
  '基礎通論': ['評估診斷', '藥理用藥', '護理通論', '法規倫理'],
};`, `const SUBJECT_CATEGORIES = {
  '基礎醫學': ['解剖生理', '病理學', '藥理學', '微生物免疫'],
  '基本護理': ['基本護理技術', '護理原理', '感染控制', '護理行政'],
  '內外科': ['心臟血管', '呼吸系統', '消化系統', '腎臟泌尿', '內分泌代謝', '神經系統', '骨骼肌肉', '血液腫瘤', '急重症與周手術', '眼耳鼻喉皮膚'],
  '產兒科': ['產科護理', '兒科護理'],
  '精神與社區': ['精神科護理', '社區衛生護理'],
  '共同科目': ['法規倫理'],
};`, 'subject-categories');

patch('tail', `    } else if (State.mode === 'subject' && State.selectedTags.length > 0) {
      pool = pool.filter(q => q.tags.some(t => State.selectedTags.includes(t)));`, `    } else if (State.mode === 'subject') {
      if (State.selectedExamTypes.length > 0)
        pool = pool.filter(q => State.selectedExamTypes.includes(q.exam_type));
      if (State.selectedTags.length > 0)
        pool = pool.filter(q => q.tags.some(t => State.selectedTags.includes(t)));`, 'subject-mode-filter');

patch('tail', `  if (State.mode === 'mixed' || State.mode === 'subject') show('subject-section');`, `  if (State.mode === 'mixed' || State.mode === 'subject') show('subject-section');
  if (State.mode === 'subject') show('exam-type-section');`, 'subject-mode-ui');

patch('tail', '你是專科護理師國家考試的解題專家', '你是台灣護理師國家考試（專技高考）的解題專家', 'ai-prompt');

// localStorage namespace（head 無 np_ 鍵，僅 tail）
const npKeyCount = (tail.match(/np_/g) || []).length;
tail = tail.replace(/np_/g, 'rnq_');
console.log(`✓ localStorage keys renamed np_→rnq_ (${npKeyCount} occurrences)`);

if (patchFail) { console.error(`\n${patchFail} patches FAILED — abort`); process.exit(1); }

// ---------- data lines ----------
const dataBlock = [
  'window.__QD=' + JSON.stringify({ version: '1.0', total: questions.length, questions }),
  'window.__EXP=' + JSON.stringify(EXP),
  'window.__TOPICS=' + JSON.stringify(TOPICS),
  'window.__TOPIC_INTROS=' + JSON.stringify(INTROS),
].join('\n');

const out = head + '\n' + dataBlock + '\n' + tail;
fs.writeFileSync(path.join(ROOT, 'index.html'), out);
console.log(`\nbuilt index.html: ${(out.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`questions: ${questions.length}, explanations: ${Object.keys(EXP).length}, topic-cats: ${Object.keys(TOPICS).length}, intro-cats: ${Object.keys(INTROS).length}`);
