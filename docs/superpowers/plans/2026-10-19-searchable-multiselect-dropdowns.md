# 查詢篩選條件「搜尋 + 可多選」下拉選單實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 `report.html`、`index_BPM.html` 與 `index_final.html` 的查詢篩選下拉選單升級為支援關鍵字搜尋與多標籤勾選的 Select2 Bootstrap 5 元件。

**Architecture:** 引入 Select2 4.1.0-rc.0 與 select2-bootstrap-5-theme，將傳統單選 `<select>` 改為 `multiple="multiple"` 下拉元件，透過陣列包含邏輯相容原本的多條件查詢過濾器，並在重設按鈕觸發 Select2 的清空事件。

**Tech Stack:** Bootstrap 5, Select2 4.1.0-rc.0, select2-bootstrap-5-theme 1.3.0, jQuery 3.7.1, Vanilla JS.

## Global Constraints
- 維持原有 Bootstrap 5 頁面風格與排版，不得破壞響應式配置。
- 多選比對邏輯為 OR（聯集）；若未選取任何項目則視為全部（無限制）。
- 各頁面重設按鈕點選時，需確實觸發 Select2 清空。

---

### Task 1: `report.html` 篩選下拉升級為 Select2 多選

**Files:**
- Modify: `report.html`

- [x] **Step 1: 引入 Select2 CSS 與 JS 資源**
- [x] **Step 2: 修改 HTML 中的三個篩選 `<select>` 標籤**
- [x] **Step 3: 更新 JavaScript 初始化、過濾與重設邏輯**
- [x] **Step 4: 驗證 `report.html`**

---

### Task 2: `index_BPM.html` 篩選下拉升級為 Select2 多選

**Files:**
- Modify: `index_BPM.html`

- [x] **Step 1: 引入 Select2 CSS 與 JS 資源**
- [x] **Step 2: 修改 HTML 來源廠 `<select id="filterDept">`**
- [x] **Step 3: 更新 JavaScript 初始化、過濾與重設邏輯**
- [x] **Step 4: 驗證 `index_BPM.html`**

---

### Task 3: `index_final.html` 篩選下拉升級為 Select2 多選

**Files:**
- Modify: `index_final.html`

- [x] **Step 1: 引入 jQuery、Select2 CSS 與 JS 資源**
- [x] **Step 2: 修改 HTML 來源廠 `<select id="filterDept">`**
- [x] **Step 3: 更新 JavaScript 動態產出、過濾與重設邏輯**
- [x] **Step 4: 驗證 `index_final.html`**

---

### Task 4: 跨頁完整性驗證

- [x] **Step 1: 檢查三個頁面的語法正確性與相容性**
- [x] **Step 2: 確認所有單選與多選行為皆符合設計規範**
