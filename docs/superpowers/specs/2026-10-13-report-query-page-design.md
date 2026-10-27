# 跨廠調派明細報表查詢頁面 (report.html) 設計規格書

## 1. 概述 (Overview)
本功能旨在提供一個獨立、專注的「跨廠調派明細報表查詢」頁面 (`report.html`)。依據使用者提供的畫面設計，提供多維度條件篩選器與跨廠調派明細總表，支援即時篩選、清空條件與 UTF-8 CSV 報表匯出功能，並與現有 `code_artifact.html` 共用 LocalStorage 資料來源。

## 2. 頁面佈局與元件規格 (Layout & Components)

### 2.1 頁面框架
- 採用乾淨簡潔的卡片式佈局，背景色 `#f4f6f9`。
- 引入 Bootstrap 5 CSS 及 Bootstrap Icons。

### 2.2 多維度條件篩選卡片 (Filter Section)
- **卡片標題**：`<i class="bi bi-funnel-fill text-primary me-2"></i>多維度條件篩選`
- **篩選欄位**：
  1. `調派日期 (起)`：`<input type="date" id="filterStartDate">`
  2. `調派日期 (迄)`：`<input type="date" id="filterEndDate">`
  3. `來源廠`：`<select id="filterFromPlant">`，選項包含：全部、A廠、B廠、C廠
  4. `目的接收廠`：`<select id="filterToPlant">`，選項包含：全部、A廠、B廠、C廠
  5. `調派狀態`：`<select id="filterStatus">`，選項包含：全部狀態、Pending (待點收)、Received (已接收)、Anomaly (異常)
- **資訊列與操作按鈕**：
  - 左側資訊：`共查詢到 X 筆資料 (總庫存 Y 筆)`（元素 id: `filterResultCount`）
  - 右側按鈕：
    - `清空條件`：按鈕 class `btn btn-outline-secondary btn-sm`，圖示 `bi-arrow-repeat`，清空所有篩選欄位並重刷表格
    - `匯出 CSV 報表`：按鈕 class `btn btn-outline-success btn-sm`，圖示 `bi-file-earmark-spreadsheet`，觸發 CSV 檔案下載

### 2.3 跨廠調派明細總表卡片 (Table Section)
- **卡片標題**：`<i class="bi bi-table text-primary me-2"></i>跨廠調派明細總表`
- **欄位定義 (共 8 欄，已移除預計崗位)**：
  1. `調派日期`：粗體，格式 YYYY-MM-DD
  2. `路線`：來源廠徽章（`<span class="badge bg-light text-dark border">`） + 灰色箭頭（`<i class="bi bi-arrow-right text-muted mx-1"></i>`） + 目的廠徽章（`<span class="badge bg-primary">`）
  3. `工號`：等寬字型 `font-monospace text-secondary`
  4. `姓名`：粗體 `fw-bold`
  5. `狀態`：
     - `Pending` (待點收)：`<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>待點收</span>`
     - `Received` (已接收)：`<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>已接收</span>`
     - `Anomaly` (異常)：`<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i>異常</span>`
  6. `點收時間`：等寬字型 `font-monospace`，無時間時顯示 `-`
  7. `確認人`：文字，未點收時顯示 `-`
  8. `備註與異常註記`：若有異常註記則以 `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">` 呈現，否則顯示 `-`

## 3. 資料結構與存取規格 (Data Model & Storage)

### 3.1 LocalStorage 鍵值
- `cross_plant_dispatch_records_v1`

### 3.2 預設示範資料 (當本地無紀錄時初始化)
包含 5 筆預設資料（與截圖內容一致）：
1. `DISP-1001`：日期 2026-10-13，A廠 -> B廠，工號 A045，姓名 陳志遠，狀態 Received，點收時間 2026-10-12 10:49:40，確認人 站所主管-陳領班
2. `DISP-1002`：日期 2026-10-13，A廠 -> B廠，工號 A089，姓名 林美玲，狀態 Pending
3. `DISP-1003`：日期 2026-10-12，B廠 -> A廠，工號 B012，姓名 張家銘，狀態 Received，點收時間 2026-10-12 08:15，確認人 A廠-何課長
4. `DISP-1004`：日期 2026-10-12，C廠 -> B廠，工號 C033，姓名 郭建銘，狀態 Anomaly，點收時間 2026-10-12 08:45，確認人 站所主管-陳領班，異常註記：未報到 (曠職/失聯)：電話未接，經與C廠確認當日臨時請病假。
5. `DISP-1005`：日期 2026-10-13，C廠 -> B廠，工號 C058，姓名 黃子芸，狀態 Pending

## 4. 匯出 CSV 規格
- 檔案名稱：`跨廠人員調度報表_YYYY-MM-DD.csv`
- 編碼：UTF-8 含 BOM（`\uFEFF`），確保 Excel 開啟繁體中文不亂碼
- 包含欄位：`調派編號`, `調派日期`, `來源廠`, `目的廠區`, `工號`, `姓名`, `狀態`, `點收時間`, `點收人員`, `異常說明`
