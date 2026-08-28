// Parser v2: dual-format (circled-PUA / dotted) MOEX nursing exam PDFs → questions-raw.json
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
const pdfParse = require('pdf-parse');

const PDF_DIR = path.join(__dirname, 'pdfs2');
const SUBJECT_NAMES = {
  1: '基礎醫學', 2: '基本護理學與護理行政', 3: '內外科護理學',
  4: '產兒科護理學', 5: '精神科與社區衛生護理學',
};

const toHalf = s => s.replace(/[Ａ-Ｚａ-ｚ０-９＃]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const stripPUA = s => s.replace(/[-]/g, '');
const clean = s => s.replace(/[ˉ]/g, '').replace(/[-]/g, '').replace(/\s+/g, ' ').trim();

async function getPages(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  return pages;
}

function groupLines(items, yTol = 5) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    let line = lines.length && Math.abs(lines[lines.length - 1].y - it.y) <= yTol ? lines[lines.length - 1] : null;
    if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

const SKIP_LINE = /^(代號：\d+|頁次：\d+－\d+|請接背面|背面尚有試題|試題完.*|（?請翻頁.*)$/;

// ---------- Q format A: circled PUA markers ----------
function isMarkerPUA(it) {
  const noPua = stripPUA(it.str).trim();
  const hasPua = /[-]/.test(it.str);
  return hasPua && noPua === '' && it.w >= 6 && it.w <= 16;
}
function parseCircled(pages) {
  const questions = [];
  let cur = null, target = null, started = false;
  const flush = () => {
    if (!cur) return;
    const opts = {};
    'ABCD'.split('').forEach((L, i) => { if (cur.opts[i]) opts[L] = clean(cur.opts[i].join('')); });
    questions.push({ number: cur.number, question: clean(cur.stem.join('')), options: opts, optCount: cur.opts.length });
    cur = null;
  };
  for (const items of pages) {
    const lines = groupLines(items);
    for (const line of lines) {
      const joined = clean(line.items.map(i => i.str).join(''));
      if (SKIP_LINE.test(joined)) continue;
      const first = line.items[0];
      if (!first) continue;
      const isQ = first.x < 56 && /^\d{1,2}$/.test(first.str.trim());
      if (!started) { if (isQ && parseInt(first.str) === 1) started = true; else continue; }
      let rest = line.items;
      if (isQ && (!cur || parseInt(first.str) === cur.number + 1)) {
        flush();
        cur = { number: parseInt(first.str), stem: [], opts: [] };
        target = 'stem';
        rest = line.items.slice(1);
      }
      if (!cur) continue;
      for (const it of rest) {
        if (isMarkerPUA(it)) {
          if (cur.opts.length < 4) { cur.opts.push([]); target = cur.opts.length - 1; }
          continue;
        }
        if (target === 'stem') cur.stem.push(it.str);
        else cur.opts[target].push(it.str);
      }
    }
  }
  flush();
  return questions;
}

// ---------- Q format B: dotted "1." / "A." ----------
function parseDotted(pages) {
  const questions = [];
  let cur = null, target = null, started = false;
  const flush = () => {
    if (!cur) return;
    const opts = {};
    'ABCD'.split('').forEach((L, i) => { if (cur.opts[i]) opts[L] = clean(cur.opts[i].join('')); });
    questions.push({ number: cur.number, question: clean(cur.stem.join('')), options: opts, optCount: cur.opts.length });
    cur = null;
  };
  for (const items of pages) {
    const lines = groupLines(items);
    for (const line of lines) {
      const joined = clean(line.items.map(i => i.str).join(''));
      if (SKIP_LINE.test(joined)) continue;
      const first = line.items[0];
      if (!first) continue;
      const qm = first.x < 44 && first.str.trim().match(/^(\d{1,2})\.$/);
      if (!started) { if (qm && parseInt(qm[1]) === 1) started = true; else continue; }
      let rest = line.items;
      if (qm && (!cur || parseInt(qm[1]) === cur.number + 1)) {
        flush();
        cur = { number: parseInt(qm[1]), stem: [], opts: [] };
        target = 'stem';
        rest = line.items.slice(1);
      }
      if (!cur) continue;
      for (const it of rest) {
        const om = it.str.trim().match(/^([A-D])\.$/);
        if (om && it.x < 58 && 'ABCD'.indexOf(om[1]) === cur.opts.length && cur.opts.length < 4) {
          cur.opts.push([]); target = cur.opts.length - 1; continue;
        }
        if (target === 'stem') cur.stem.push(it.str);
        else cur.opts[target].push(it.str);
      }
    }
  }
  flush();
  return questions;
}

async function parseQuestionPdf(file) {
  const pages = await getPages(file);
  // detect format: dotted has items "A." at x<58
  let dotted = 0;
  for (const items of pages.slice(0, 2)) {
    for (const it of items) if (/^[A-D]\.$/.test(it.str.trim()) && it.x < 58) dotted++;
  }
  return dotted >= 4 ? { fmt: 'dotted', qs: parseDotted(pages) } : { fmt: 'circled', qs: parseCircled(pages) };
}

// ---------- Answer format A: 第N題 grid ----------
function parseAnswerGrid(items) {
  const titleCells = [];
  for (const it of items) {
    const m = it.str.match(/^第(\d{1,3})題$/);
    if (m) titleCells.push({ n: parseInt(m[1]), x: it.x, y: it.y });
  }
  if (!titleCells.length) return null;
  const letterItems = items.filter(it => /^[A-D#]+$/.test(toHalf(it.str).trim()));
  const cols = [];
  for (const t of titleCells) if (!cols.some(c => Math.abs(c - t.x) < 15)) cols.push(t.x);
  cols.sort((a, b) => a - b);
  const colIdx = x => { let b = -1, bd = 1e9; cols.forEach((c, i) => { const d = Math.abs(c - x); if (d < bd) { bd = d; b = i; } }); return b; };
  const rows = [];
  for (const t of titleCells) if (!rows.some(r => Math.abs(r - t.y) < 4)) rows.push(t.y);
  rows.sort((a, b) => b - a);
  const answers = {};
  for (const li of letterItems) {
    let rowY = null, bd = 1e9;
    for (const r of rows) { const d = r - li.y; if (d > 2 && d < 30 && d < bd) { bd = d; rowY = r; } }
    if (rowY === null) continue;
    const startCol = colIdx(li.x);
    toHalf(li.str).trim().split('').forEach((L, k) => {
      const t = titleCells.find(t => Math.abs(t.y - rowY) < 4 && colIdx(t.x) === startCol + k);
      if (t) answers[t.n] = L;
    });
  }
  return answers;
}

// ---------- Answer format B: 題號 row of digits, 答案 row of letters ----------
function parseAnswerRows(items) {
  const numItems = items.filter(it => /^\d{1,3}$/.test(toHalf(it.str).trim()) && it.w < 30);
  const letterItems = items.filter(it => /^[A-D#]$/.test(toHalf(it.str).trim()));
  if (!numItems.length || !letterItems.length) return null;
  const answers = {};
  for (const ni of numItems) {
    const n = parseInt(toHalf(ni.str).trim());
    if (n < 1 || n > 100) continue;
    // nearest letter below within 30pt, x within 10
    let best = null, bd = 1e9;
    for (const li of letterItems) {
      const dy = ni.y - li.y, dx = Math.abs(ni.x - li.x);
      if (dy > 2 && dy < 30 && dx < 10 && dy < bd) { bd = dy; best = li; }
    }
    if (best) answers[n] = toHalf(best.str).trim();
  }
  return answers;
}

async function parseAnswerPdf(file) {
  const pages = await getPages(file);
  const items = pages.flat();
  let answers = parseAnswerGrid(items);
  if (!answers || Object.keys(answers).length === 0) answers = parseAnswerRows(items) || {};
  const text = (await pdfParse(fs.readFileSync(file))).text;
  const cnt = text.match(/單選題數：(\d+)題/) || text.match(/題[\s　]*數：(\d+)題/);
  const notes = [];
  const noteSection = text.split(/備[\s　]*註：/)[1] || '';
  for (const nm of noteSection.matchAll(/第\d{1,3}題(?:(?!第\d{1,3}題)[^。])*。?/g)) notes.push(nm[0].replace(/[，；]\s*$/, '').trim());
  return { answers, expected: cnt ? parseInt(cnt[1]) : null, notes };
}

function resolveCorrections(notes) {
  const info = {};
  for (const note of notes) {
    const t = toHalf(note);
    const nm = t.match(/第(\d{1,3})題/);
    if (!nm) continue;
    const n = parseInt(nm[1]);
    const or = t.match(/答([A-D]{1,4}(?:或[A-D]{1,4})*)者?均?給分/);
    if (or) {
      const letters = [...new Set(or[1].split('或').flatMap(s => s.split('')))];
      if (letters.length >= 2) info[n] = { type: 'multi', accept: letters, note: t };
      else info[n] = { type: 'fixed', answer: letters[0], note: t };
    }
    else if (/一律給分|均給分|都給分|送分/.test(t)) info[n] = { type: 'free', note: t };
    else {
      const fix = t.match(/更正(?:標準)?答案為([A-D])/);
      if (fix) info[n] = { type: 'fixed', answer: fix[1], note: t };
      else info[n] = { type: 'note', note: t };
    }
  }
  return info;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest2.json'), 'utf-8'));
  const all = [], report = [];
  let gid = 0;
  const bySession = manifest.filter(m => !m.error);
  bySession.sort((a, b) => a.rocYear - b.rocYear || a.session - b.session || a.subjIdx - b.subjIdx);

  for (const rec of bySession) {
    const tag = rec.tag;
    const qPath = path.join(PDF_DIR, `${tag}-Q.pdf`);
    const hasM = fs.existsSync(path.join(PDF_DIR, `${tag}-M.pdf`));
    const aPath = path.join(PDF_DIR, hasM ? `${tag}-M.pdf` : `${tag}-A.pdf`);
    try {
      const { fmt, qs } = await parseQuestionPdf(qPath);
      const { answers, expected, notes } = await parseAnswerPdf(aPath);
      const corrections = resolveCorrections(notes);
      const issues = [];
      if (expected && qs.length !== expected) issues.push(`count ${qs.length}≠${expected}`);
      // number continuity check
      const nums = qs.map(q => q.number);
      for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) { issues.push(`gap@${nums[i - 1]}→${nums[i]}`); break; }
      let missingAns = 0, badOpts = 0, imgQ = 0;
      for (const q of qs) {
        let ans = answers[q.number] || null;
        let answerType = 'single', accept = null, note = null;
        const corr = corrections[q.number];
        if (ans === '#' || corr) {
          if (corr?.type === 'free') { answerType = 'free'; ans = null; note = corr.note; }
          else if (corr?.type === 'multi') { answerType = 'multi'; accept = corr.accept; ans = corr.accept.join('/'); note = corr.note; }
          else if (corr?.type === 'fixed') { ans = corr.answer; note = corr.note; }
          else if (ans === '#') { answerType = 'free'; ans = null; note = corr?.note || '本題經公告更正，詳見官方備註'; }
          else note = corr?.note || null;
        }
        if (!ans && answerType !== 'free') missingAns++;
        if (Object.keys(q.options).length !== 4) badOpts++;
        if (/如下圖|如附圖|下圖|附圖|圖所示|示意圖|見圖/.test(q.question + Object.values(q.options).join(''))) imgQ++;
        all.push({
          id: ++gid, year: rec.rocYear, session: rec.session,
          subjIdx: rec.subjIdx, subject: SUBJECT_NAMES[rec.subjIdx],
          number: q.number, question: q.question, options: q.options,
          answer: ans, answerType, ...(accept ? { accept } : {}), ...(note ? { note } : {}),
          source: `${rec.rocYear}年第${rec.session}次專技高考護理師`,
        });
      }
      if (missingAns) issues.push(`missingAns:${missingAns}`);
      if (badOpts) issues.push(`badOpts:${badOpts}`);
      report.push({ tag, fmt, parsed: qs.length, expected, imgQ, notes: notes.length, issues: issues.join(' ') });
    } catch (e) { report.push({ tag, error: e.message }); }
  }

  fs.writeFileSync(path.join(__dirname, 'questions-raw.json'), JSON.stringify(all, null, 1));
  console.log('tag        | fmt     | parsed | exp | imgQ | notes | issues');
  for (const r of report) {
    if (r.error) console.log(`${r.tag} ERROR: ${r.error}`);
    else console.log(`${r.tag.padEnd(10)} | ${r.fmt.padEnd(7)} | ${String(r.parsed).padStart(6)} | ${String(r.expected).padStart(3)} | ${String(r.imgQ).padStart(4)} | ${String(r.notes).padStart(5)} | ${r.issues}`);
  }
  console.log(`\nTOTAL: ${all.length} questions`);
  console.log(`free: ${all.filter(q => q.answerType === 'free').length}, multi: ${all.filter(q => q.answerType === 'multi').length}`);
  const bad = report.filter(r => r.error || r.issues);
  console.log(`files with issues: ${bad.length}`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
