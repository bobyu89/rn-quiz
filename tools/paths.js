// 共用路徑約定
//   輸入資料：<repo>/data
//   中繼檔與代理產出：<repo>/work（已 gitignore，可用 --work=<dir> 或 RNQ_WORK 覆蓋）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const argWork = (process.argv.find(a => a.startsWith('--work=')) || '').slice('--work='.length);
const WORK = path.resolve(argWork || process.env.RNQ_WORK || path.join(ROOT, 'work'));

const dataFile = n => path.join(DATA, n);
const workFile = n => path.join(WORK, n);
const workDir = n => path.join(WORK, n);
const ensure = d => { fs.mkdirSync(d, { recursive: true }); return d; };

// 讀取必要輸入，缺檔時給明確訊息而不是堆疊追蹤
function readJSON(p, hint) {
  if (!fs.existsSync(p)) {
    console.error(`找不到檔案：${p}${hint ? '\n' + hint : ''}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function requireDir(d, hint) {
  if (!fs.existsSync(d)) {
    console.error(`找不到目錄：${d}${hint ? '\n' + hint : ''}`);
    process.exit(1);
  }
  return d;
}

module.exports = { ROOT, DATA, WORK, dataFile, workFile, workDir, ensure, readJSON, requireDir };
