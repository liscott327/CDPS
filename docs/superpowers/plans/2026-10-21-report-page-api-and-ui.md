# 跨廠調派明細報表查詢 (report.html) 功能串接實施計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 CPDS 系統完成 `report.html` 的前後端完整串接，包含建立獨立後端報表 API (`routes/report.js`) 查詢 `vw_CPDS_DispatchDetail`、預設排序與多維度動態篩選、嚴格 5 大狀態判定、以及透過 SheetJS 匯出原生 Excel (.xlsx) 檔案。

**Architecture:** 
- 後端建立獨立模組 `routes/report.js` 掛載於 `/api/reports`，具備 JWT 認證、參數化 SQL 查詢與離線記憶體雙軌備援，預設依調度日期 DESC ➔ 來源廠 ASC ➔ 目的廠 ASC ➔ 工號 ASC ➔ 狀態 ASC 排序。
- 前端 `report.html` 整合 `scripts/api.js` 與 `scripts/auth.js`，預設起訖日期為當日，廠別由 `/api/departments` 動態載入，加入關鍵字搜尋，精準解析狀態（0: 待簽到, 1: 已簽到, 2: 逾期簽到, 3: 異常, 4: 已逾期），並支援任意表頭手動排序與 SheetJS 原生 `.xlsx` 匯出。

**Tech Stack:** Node.js, Express, mssql, msnodesqlv8, JWT, HTML5, Bootstrap 5.3.2, Bootstrap-Table 1.24.1, Select2 4.1.0, SheetJS (xlsx 0.18.5)

## Global Constraints

- **狀態代號與定義**：
  - `0`: 待簽到（到調度時間結束前尚未簽到者）
  - `1`: 已簽到（到調度時間開始的前 10 分鐘內簽到者，即 StartTime - 10分 ~ StartTime + 10分）
  - `2`: 逾期簽到（到調度時間開始超過 10 分鐘後才簽到者，即 > StartTime + 10分）
  - `3`: 異常（主管手動標記為異常者）
  - `4`: 已逾期（到調度時間結束後未簽到者，僅前端顯示用，不更動資料庫狀態，限當天；但若已經過去的狀態皆顯示已逾期）
- **SQL 預設排序**：`ORDER BY DispatchDate DESC, SourceDeptName ASC, TargetDeptName ASC, EmpId ASC, DisplayStatus ASC`
- **匯出格式**：僅限標準 Microsoft Excel 活頁簿 (`.xlsx`)，不提供 CSV。
- **預設查詢區間**：進入頁面時起訖日期預設為**系統當天** (`YYYY-MM-DD`)。

---

### Task 1: 建立後端報表 API 模組 (`routes/report.js`) 與掛載 (`server.js`)

**Files:**
- Create: `d:/work/CPDS/routes/report.js`
- Modify: `d:/work/CPDS/server.js:470-495`
- Test: `d:/work/CPDS/scripts/verify_report_api.js`

**Interfaces:**
- Consumes: `getDbPool`, `sql`, `JWT_SECRET`
- Produces: `GET /api/reports?startDate=&endDate=&sourceDeptId=&targetDeptId=&status=&keyword=`

- [x] **Step 1: 撰寫 API 驗證測試腳本 `scripts/verify_report_api.js`**
  - 測試無參數預設查詢。
  - 測試日期區間、廠別篩選、狀態篩選、關鍵字查詢。
  - 驗證回傳資料結構包含 `planNo`, `dispatchDate`, `sourceDeptName`, `targetDeptName`, `empId`, `empName`, `status`, `dispatchTimeRange` 等欄位。
  - 驗證預設 ORDER BY 順序。

- [x] **Step 2: 建立 `routes/report.js` 路由模組**
  - 加入 JWT 驗證中介軟體。
  - 實作 SQL 查詢 `vw_CPDS_DispatchDetail`，動態綁定參數防護 SQL Injection。
  - 加入 SQL 預設排序：`ORDER BY DispatchDate DESC, SourceDeptName ASC, TargetDeptName ASC, EmpId ASC, DisplayStatus ASC`。
  - 實作離線/Demo 記憶體備援資料集與對應的 JS 篩選/排序邏輯。

- [x] **Step 3: 於 `server.js` 掛載 `/api/reports` 路由**
  - 引入 `routes/report.js`。
  - 掛載至 `app.use('/api/reports', createReportRouter({ ... }))`。

- [x] **Step 4: 執行 `scripts/verify_report_api.js` 驗證後端 API 正確性**
  - 確認測試腳本執行無誤，exit code 為 0。

---

### Task 2: 前端 `report.html` UI 重構（動態選單、關鍵字搜尋與 SheetJS 引入）

**Files:**
- Modify: `d:/work/CPDS/report.html:1-300`

**Interfaces:**
- Consumes: SheetJS CDN (`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`)
- Produces:
  - 日期起訖預設為當日 (`#filterStartDate`, `#filterEndDate`)
  - 關鍵字輸入框 (`#filterKeyword`)
  - 動態來源廠 (`#filterFromPlant`) 與目的廠 (`#filterToPlant`)

- [x] **Step 1: 於 `report.html` `<head>` 中引入 SheetJS**
  - `<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>`

- [x] **Step 2: 重構多維度條件篩選卡片 HTML**
  - 調整欄位配置加入「關鍵字搜尋」輸入框（placeholder: `搜尋工號、姓名、調度單號或異常說明...`，支援 Enter 觸發）。
  - 將清空條件按鈕與匯出 Excel 按鈕標籤規範化（移除 CSV 相關文字，按鈕標題為「匯出 Excel」）。
  - 清空寫死之來源廠與目的廠 `<option>`，保留 `<select>` 供 JS 動態注入。

---

### Task 3: 前端 `report.html` 資料串接、動態廠別與精準狀態比對

**Files:**
- Modify: `d:/work/CPDS/report.html:310-750`

**Interfaces:**
- Consumes: `API.get('/api/reports')`, `API.get('/api/departments')`
- Produces:
  - `loadDepartments()`
  - `fetchReportData()`
  - `resolveRecordStatus(record)`
  - `multiColumnComparator(a, b)`

- [x] **Step 1: 引入 `scripts/api.js`**
  - 在 `report.html` 底部引入 `<script src="scripts/api.js"></script>`。

- [x] **Step 2: 實作動態廠別載入函式 `loadDepartments()`**
  - 呼叫 `API.get('/api/departments')` 取得廠別清單。
  - 動態為 `#filterFromPlant` 與 `#filterToPlant` 填入 `<option value="廠別名稱">廠別名稱</option>`，並初始化 Select2。

- [x] **Step 3: 實作前端精準狀態校驗 `resolveRecordStatus(record)`**
  - 狀態 3：異常維持 3。
  - 若有簽到時間：簽到時間大於調度開始時間 10 分鐘 ➔ 2 (逾期簽到)；否則 ➔ 1 (已簽到)。
  - 若無簽到時間：
    - 調度日期 < 今天 ➔ 4 (已逾期)。
    - 當天且當前時間已超過調度結束時間 (`EndTime`) ➔ 4 (已逾期)。
    - 否則 ➔ 0 (待簽到)。

- [x] **Step 4: 實作非同步報表資料查詢 `fetchReportData()`**
  - 組合起訖日期、來源廠、目的廠、狀態、關鍵字參數。
  - 呼叫 `API.get('/api/reports', params)`。
  - 對資料進行前端狀態二次即時校驗後載入 Bootstrap-Table：`$('#reportTable').bootstrapTable('load', records)`。
  - 更新資料筆數顯示。

- [x] **Step 5: 實作「清空條件」重置邏輯**
  - 起訖日期重設為「當天」。
  - 清空廠別、狀態與關鍵字，並自動重新觸發 `fetchReportData()`。

---

### Task 4: 前端原生 Excel 匯出功能實作 (`exportToExcel`)

**Files:**
- Modify: `d:/work/CPDS/report.html:750-850`

**Interfaces:**
- Consumes: `$('#reportTable').bootstrapTable('getData')`, `XLSX.utils.book_new()`, `XLSX.writeFile()`
- Produces: `exportToExcel()`

- [x] **Step 1: 移除舊版 `exportToCSV()` 函式**
  - 清理舊版 CSV 產生代碼與 BOM 字符邏輯。

- [x] **Step 2: 實作 `exportToExcel()` 函式**
  - 取得當前表格渲染之資料：`const data = $('#reportTable').bootstrapTable('getData')`。
  - 若無資料則跳出 Toast 提示。
  - 建立標準中文表頭陣列與欄位對應資料。
  - 使用 `XLSX.utils.aoa_to_sheet` 產生工作表 `跨廠調派明細`。
  - 設定自動欄寬（`!cols`）。
  - 使用 `XLSX.writeFile(workbook, '跨廠調派明細報表_YYYY-MM-DD.xlsx')` 觸發下載。

---

### Task 5: 整合測試與端到端驗證

**Files:**
- Test: `scripts/verify_report_api.js`
- Test: 瀏覽器操作檢核

- [x] **Step 1: 執行後端 API 測試腳本**
  - `node scripts/verify_report_api.js` 確認各項查詢條件與排序完全符合預期。

- [x] **Step 2: 啟動伺服器並驗證前端畫面**
  - 進入 `http://localhost:3000/report.html`。
  - 驗證預設日期為當日。
  - 驗證廠別由 API 載入。
  - 驗證關鍵字查詢與 Enter 觸發。
  - 驗證手動點擊各欄位表頭排序。
  - 驗證點擊「匯出 Excel」產出正確 `.xlsx` 檔案。
