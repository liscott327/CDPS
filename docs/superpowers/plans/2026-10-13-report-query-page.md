# 跨廠調派明細報表查詢頁面 (report.html) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依照截圖建立一個專屬且獨立的跨廠調派明細報表查詢頁面 `report.html`，具備「來源廠」欄位、移除「預計崗位」欄位，並支援多條件即時篩選、清空條件與 CSV 報表匯出功能。

**Architecture:** 單頁 HTML 應用程式，使用 Bootstrap 5 構建響應式介面，使用原生 JavaScript 操作 DOM 與 LocalStorage（`cross_plant_dispatch_records_v1`），實現無後端依賴、即開即用的報表查詢體驗。

**Tech Stack:** HTML5, CSS3, JavaScript (ES6+), Bootstrap 5.3.2, Bootstrap Icons 1.11.2, LocalStorage API, Blob/CSV API.

## Global Constraints

- 依使用者要求，完全保留原 `code_artifact.html` 不動，新建獨立檔案 `report.html`。
- 篩選卡片「調出廠區」文字修改為「來源廠」。
- 表格明細移除「預計崗位」欄位，總計 8 個欄位。
- 資料來源與 `code_artifact.html` 共享相同的 LocalStorage 鍵值 `cross_plant_dispatch_records_v1`。
- 匯出之 CSV 必須包含 UTF-8 BOM (`\uFEFF`)，防止 Microsoft Excel 開啟時出現中文亂碼。

---

### Task 1: 建立 report.html 基礎架構與卡片式 UI 佈局

**Files:**
- Create: `d:/work/CPDS/report.html`

**Interfaces:**
- Consumes: Bootstrap 5.3.2 CDN, Bootstrap Icons 1.11.2 CDN
- Produces: `report.html` 完整 DOM 結構（含多維度條件篩選卡片與跨廠調派明細總表卡片）

- [ ] **Step 1: 建立 report.html 檔案與 HTML5/Bootstrap 骨架**
- [ ] **Step 2: 建立「多維度條件篩選」卡片 HTML（包含「來源廠」等 5 個篩選控制項及資訊與按鈕工具列）**
- [ ] **Step 3: 建立「跨廠調派明細總表」卡片 HTML（定義 8 個欄位表頭）**

---

### Task 2: 實作資料管理、預設資料初始化與即時動態篩選核心邏輯

**Files:**
- Modify: `d:/work/CPDS/report.html`

**Interfaces:**
- Consumes: LocalStorage `cross_plant_dispatch_records_v1`
- Produces: `getRecords()`, `applyReportFilters()`, `resetFilters()` 等 JS 函式

- [ ] **Step 1: 實作 LocalStorage 讀取與 5 筆示範資料初始注入邏輯**
- [ ] **Step 2: 實作 `applyReportFilters()` 即時多條件動態過濾與筆數計算**
- [ ] **Step 3: 實作 `renderReportTable()` 8 欄位資料渲染（路線徽章、狀態徽章、異常粉紅警示標籤）**
- [ ] **Step 4: 實作 `resetFilters()` 清空條件功能**

---

### Task 3: 實作 UTF-8 BOM CSV 匯出功能與整合驗證

**Files:**
- Modify: `d:/work/CPDS/report.html`

**Interfaces:**
- Consumes: 篩選後的記錄或總記錄
- Produces: `exportToCSV()` 函式與點擊觸發檔案下載

- [ ] **Step 1: 實作 `exportToCSV()`，生成帶有 UTF-8 BOM 的 CSV 檔案並觸發瀏覽器下載**
- [ ] **Step 2: 執行驗證腳本，檢查 HTML 語法、DOM ID 完整性及靜態檔案託管存取**
