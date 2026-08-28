// Harvest v2: nursing-only, session 1/2/3, corrected answers (t=M)
const fs = require('fs');
const path = require('path');
const BASE = 'https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx';
const FILE = 'https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx';
const OUT = path.join(__dirname, 'pdfs2');
fs.mkdirSync(OUT, { recursive: true });

const SUBJECTS = [
  { idx: 1, key: '基礎醫學', re: /基礎醫學\(包括解剖/ },
  { idx: 2, key: '基本護理學與護理行政', re: /基本護理學/ },
  { idx: 3, key: '內外科護理學', re: /內外科護理學/ },
  { idx: 4, key: '產兒科護理學', re: /產兒科護理學/ },
  { idx: 5, key: '精神科與社區衛生護理學', re: /精神科與社區衛生護理學/ },
];

const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
function extractHidden(html) {
  const fields = {}; let m;
  const re = /<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g;
  while ((m = re.exec(html))) fields[m[1]] = m[2];
  return fields;
}
function extractOptions(html, selectName) {
  const selRe = new RegExp(`<select name="${selectName.replace(/\$/g, '\\$')}"[\\s\\S]*?</select>`);
  const sel = html.match(selRe);
  if (!sel) return [];
  const opts = []; let m;
  const re = /<option(?: selected="selected")? value="([^"]*)">([^<]*)<\/option>/g;
  while ((m = re.exec(sel[0]))) opts.push({ value: m[1], text: m[2] });
  return opts;
}
async function post(fields) {
  const body = new URLSearchParams(fields).toString();
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0', 'Referer': BASE }, body });
  return res.text();
}
async function download(url, dest) {
  if (fs.existsSync(dest)) return { size: fs.statSync(dest).size, cached: true };
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': BASE } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  await new Promise(r => setTimeout(r, 300));
  return { size: buf.length };
}

async function main() {
  const manifest = [];
  for (const adYear of [2021, 2022, 2023, 2024, 2025, 2026]) {
    const rocYear = adYear - 1911;
    let html = await (await fetch(BASE, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    let hidden = extractHidden(html);
    const common = {
      'ctl00$holderContent$wUctlExamYearStart$ddlExamYear': String(adYear),
      'ctl00$holderContent$wUctlExamYearEnd$ddlExamYear': String(adYear),
      'ctl00$holderContent$txtKeyword': '',
    };
    html = await post({ ...hidden, ...common, 'ctl00$holderContent$btnYear': '依考試年度設定考試簡稱' });
    const codes = extractOptions(html, 'ctl00$holderContent$ddlExamCode').filter(c => c.text.includes('護理師'));
    for (const code of codes) {
      hidden = extractHidden(html);
      const resHtml = await post({ ...hidden, ...common, 'ctl00$holderContent$ddlExamCode': code.value, 'ctl00$holderContent$btnSearch': '查詢' });
      const session = /第一次/.test(code.text) ? 1 : /第二次/.test(code.text) ? 2 : /第三次/.test(code.text) ? 3 : 0;
      const rows = resHtml.split(/<tr[ >]/).slice(1);
      let found = 0;
      for (const row of rows) {
        const text = strip(row);
        const subj = SUBJECTS.find(s => s.re.test(text));
        if (!subj) continue;
        // extract links
        const links = {};
        for (const m of row.matchAll(/wHandExamQandA_File\.ashx\?t=([QSM])&amp;code=(\d+)&amp;c=(\d+)&amp;s=(\d+)&amp;q=(\d+)/g)) {
          links[m[1]] = `${FILE}?t=${m[1]}&code=${m[2]}&c=${m[3]}&s=${m[4]}&q=${m[5]}`;
        }
        if (!links.Q || !links.S) continue;
        found++;
        const tag = `${rocYear}-${session}-${subj.idx}`;
        const rec = { rocYear, session, examCode: code.value, subjIdx: subj.idx, subject: subj.key, tag };
        try {
          rec.q = (await download(links.Q, path.join(OUT, `${tag}-Q.pdf`))).size;
          rec.a = (await download(links.S, path.join(OUT, `${tag}-A.pdf`))).size;
          if (links.M) rec.m = (await download(links.M, path.join(OUT, `${tag}-M.pdf`))).size;
          console.log(`${tag} ${subj.key} Q:${rec.q} A:${rec.a}${rec.m ? ' M:' + rec.m : ''}`);
        } catch (e) { rec.error = e.message; console.log(`${tag} ERROR ${e.message}`); }
        manifest.push(rec);
      }
      console.log(`  [exam ${code.value} session ${session}] nursing subjects found: ${found} — ${code.text.slice(0, 50)}`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'manifest2.json'), JSON.stringify(manifest, null, 1));
  const ok = manifest.filter(m => !m.error);
  console.log(`\nDONE: ${ok.length} subject-sessions, ${ok.filter(m => m.m).length} with corrected answers`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
