# 護理師國考冒險記 ⚔️（RN QUEST）

台灣護理師國考（專技高考護理師）刷題系統 — 單一 HTML 檔、零後端、完全離線可用。
規格比照 [np-quiz](https://github.com/bobyu89/np-quiz)（專科護理師冒險記）製作。

## 題庫內容

- **題源**：考選部「考畢試題查詢平臺」官方 PDF（wwwq.moex.gov.tw）
- **範圍**：民國 110–115 年，共 15 場考試（110–111 年每年 2 次、112–114 年每年 3 次、115 年 2 次）
- **科目**：全部 5 科
  1. 基礎醫學（解剖學、生理學、病理學、藥理學、微生物學與免疫學）
  2. 基本護理學（護理原理、護理技術）與護理行政
  3. 內外科護理學
  4. 產兒科護理學
  5. 精神科與社區衛生護理學
- **總題數**：4,560 題（110–111 年多為每科 80 題，112 年起每科 50 題）
- **答案**：以官方「標準答案／更正答案」為準；送分題與多重答案題依官方公告處理（送分題任何作答均算對，並於詳解標註公告內容）

## 功能

- 🔥 重點考點分析：23 個臨床領域 × 子考點星等排序；423 個高頻考點（≥3 題）**全數**附完整導讀（定義機轉、重點整理、比較對照表、診斷標準、必背重點、常考陷阱、記憶口訣、常見考法）
- ⚔️ 刷題系統：混合／年份／考科／錯題／SRS 智慧複習（間隔重複）
- 💡 每題 AI 結構化詳解：【核心考點】【解析推理】【選項分析】【記憶筆記】
- 📊 成績雷達圖、弱點分析、練習紀錄趨勢
- 📈 學習儀表板：學習曲線（累積答題數 × 各次正確率 × 3 次移動平均）、每日練習量、SRS 掌握度、五大考科與 23 領域表現、練習明細表
- 🔍 文字放大縮小：題幹／選項／詳解／導讀 80–180% 縮放，右下角控制列，或快捷鍵 `[` 縮小、`]` 放大、`\` 重置
- 🎨 7 種主題配色（電光藍／森林綠／純白色／夜燈暖護／霓虹電魂／和風雅途／深海靜謐），圖表配色跟著主題走
- 📝 筆記本（可匯出匯入）、🏆 成就系統、🖨️ 講義生成列印
- 進度自動儲存（localStorage，鍵前綴 `rnq_`）、中斷續答

## 目前完成度

| 項目 | 狀態 |
|------|------|
| 題庫 | 4,560 題（100%） |
| 每題詳解 | 4,560 題（100%） |
| 考點導讀 | 23／23 領域、423 個高頻考點（100%） |

低於 3 題的長尾考點不另附導讀，在考點分析頁仍可正常瀏覽星等、題數、年份分布與「練習這個考點」。

## 資料維護

題庫與詳解的產生流程見 `tools/`：

| 工具 | 用途 |
|------|------|
| `parse-pdfs2.js` | 解析考選部官方 PDF → `data/questions-raw.json` |
| `merge-exp.js` / `check-exp.js` | 合併與檢查每題詳解 |
| `topic-aliases.json` | 考點名稱正規化表（同義考點合併，例如「長期照護／長照 2.0」→「長期照顧」） |
| `normalize-topics.js` | 把正規化表套用到 `data/explanations.json` 的 `topic` |
| `normalize-intro-src.js` | 把正規化表套用到 `data/intro-src/*.json` 的 key（**必跑**，否則 merge 會把舊名蓋回來） |
| `make-intro-todo.js` | 只為「尚未有導讀」的熱門考點切批 → `tools/intro-todo/` |
| `INTRO-INSTRUCTIONS.md` | 導讀生成規格（交給 AI 代理依批次撰寫） |
| `merge-intros.js` | `data/intro-src/*.json` → `data/topic-intros.json` |
| `check-intros.js` | 驗收：覆蓋率、欄位完整性、孤兒導讀 |
| `build.js` | `tools/template.html` + `data/` → `index.html` |
| `serve.js` | 本機預覽（<http://localhost:8377>） |

補導讀的完整流程：

```bash
node tools/normalize-topics.js && node tools/normalize-intro-src.js
node tools/make-intro-todo.js
# 依 tools/INTRO-INSTRUCTIONS.md 為每個批次產生 data/intro-src/{領域}_{n}.json
node tools/merge-intros.js && node tools/check-intros.js && node tools/build.js
```

`build.js` 完全可重現：資料未變動時重跑會產生 byte-identical 的 `index.html`。

## 使用

直接用瀏覽器開啟 `index.html` 即可（或部署到 GitHub Pages）。

本機預覽伺服器：

```bash
node tools/serve.js
```

## 專案結構

```
index.html          ← 完整應用（含內嵌題庫與詳解，可單檔部署）
data/
  questions-raw.json   ← 解析後的原始題庫（題目/選項/官方答案/更正註記）
  explanations.json    ← 每題詳解 + 領域標籤 + 子考點
  topic-intros.json    ← 考點導讀
pdfs/               ← 考選部官方試題/答案 PDF（{年}-{次}-{科}-Q/A/M.pdf，M=更正答案）
tools/
  template.html     ← App 模板（np-quiz 為基底）
  build.js          ← 組裝 index.html（模板 + 資料 + 品牌/邏輯補丁）
  harvest2.js       ← 考選部網站抓取腳本
  parse-pdfs2.js    ← PDF 座標式解析器（雙格式：圈字/點號）
  serve.js          ← 本機預覽伺服器
```

## 重建

```bash
node tools/build.js
```

## 資料備註

- 題目與答案版權屬考選部；本專案僅供個人學習使用。
- 詳解與考點分類由 AI（Claude）生成，僅供參考，請以教科書與官方資料為準。
- 少數題目原卷附圖（詳解內有標註），建議對照 `pdfs/` 內的原始 PDF。
