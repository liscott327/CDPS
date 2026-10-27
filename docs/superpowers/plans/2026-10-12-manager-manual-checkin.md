# 主管手動簽到功能實作計劃 (Manager Manual Check-in Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `checkin.html` 中的「手動填寫原因」輸入框與送出按鈕替換為「主管手動簽到」按鈕，支援一鍵將未報到員工移至已報到、標記主管代簽並動態更新人數計數。

**Architecture:** 前端純原生 JavaScript 與 Bootstrap Table 狀態管理，以陣列資料操作 (`checkedInData`, `notCheckedInData`) 驅動表格重新載入 (`table.bootstrapTable('load', ...)`）與 DOM 計數器更新。

**Tech Stack:** HTML5, Bootstrap 5, Bootstrap Table 1.22.1, jQuery 3.7.1, Bootstrap Icons

## Global Constraints

- 遵循 `checkin.html` 既有版型與色彩規範（使用 Bootstrap 5 樣式類別）。
- 未報到表格操作欄按鈕使用警告/橘黃色系（`btn-outline-warning`），標示「主管手動簽到」。
- 已報到表格狀態徽章支援兩種狀態：
  - `status === 'Y'`：綠色徽章 `<span class="badge bg-success px-3 py-2"><i class="bi bi-check-lg me-1"></i>正常報到</span>`
  - `status === 'M'`：橘黃色徽章 `<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-person-badge me-1"></i>主管代簽</span>`
- 卡片標頭人數動態更新。

---

### Task 1: 更新 `checkin.html` 畫面標頭計數器與表格配置

**Files:**
- Modify: `d:/work/CPDS/checkin.html:66-162`

**Interfaces:**
- Consumes: 現有 `checkedInData` 與 `notCheckedInData`
- Produces: 
  - `updateCounters()`: 更新 `#checked-in-count` 與 `#not-checked-in-count`
  - `statusFormatter(value, row)`: 支援正常報到與主管代簽之 Badge 渲染
  - `managerActionFormatter(value, row)`: 渲染主管手動簽到按鈕
  - `managerCheckIn(id)`: 處理簽到業務邏輯

- [x] **Step 1: 更新 HTML 卡片標頭結構加入計數 ID**

在 `checkin.html` 的已報到與未報到卡片標頭中，加入可供 JS 操作的 `id` 標籤：
```html
        <!-- 已報到區塊 -->
        <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-success text-white py-3">
                <h6 class="card-title mb-0 fw-bold">
                    <i class="bi bi-person-check-fill me-2"></i>已報到 (<span id="checked-in-count">1</span>人)
                </h6>
            </div>
            <div class="card-body p-0">
                <table id="checked-in-table" class="table-hover table-striped"></table>
            </div>
        </div>

        <!-- 未報到區塊 -->
        <div class="card shadow-sm border-0 mb-4">
            <div class="card-header bg-danger text-white py-3">
                <h6 class="card-title mb-0 fw-bold">
                    <i class="bi bi-person-dash-fill me-2"></i>未報到 (<span id="not-checked-in-count">5</span>人)
                </h6>
            </div>
            <div class="card-body p-0">
                <table id="not-checked-in-table" class="table-hover"></table>
            </div>
        </div>
```

- [x] **Step 2: 調整 JavaScript 邏輯與 Formatter**

在 `checkin.html` 的 `<script>` 區塊：
1. 實作 `updateCounters()` 更新卡片標頭人數。
2. 更新 `statusFormatter`，支援 `status === 'Y'`（正常報到）與 `status === 'M'`（主管代簽）。
3. 實作 `managerActionFormatter(value, row)` 渲染主管手動簽到按鈕。
4. 實作 `managerCheckIn(id)` 處理將該員自 `notCheckedInData` 移至 `checkedInData`、記錄時間與 `status: 'M'`，並重新呼叫 `load` 與 `updateCounters()`。
5. 調整 `#not-checked-in-table` 欄位為 `[name, dept, action]`，欄位名稱為「操作」。
6. 調整 `#checked-in-table` 欄位 title 為「報到狀態」。

```javascript
        // 狀態列 Formatter
        function statusFormatter(value, row) {
            if (value === 'Y') {
                return '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-lg me-1"></i>正常報到</span>';
            } else if (value === 'M') {
                return '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-person-badge me-1"></i>主管代簽</span>';
            }
            return value;
        }

        // 主管手動簽到按鈕 Formatter
        function managerActionFormatter(value, row) {
            return '<button class="btn btn-outline-warning btn-sm text-nowrap fw-semibold" onclick="managerCheckIn(\'' + row.id + '\')">' +
                   '<i class="bi bi-person-check-fill me-1"></i> 主管手動簽到</button>';
        }

        // 動態更新計數器
        function updateCounters() {
            $('#checked-in-count').text(checkedInData.length);
            $('#not-checked-in-count').text(notCheckedInData.length);
        }

        // 主管手動簽到事件處理
        function managerCheckIn(id) {
            var index = notCheckedInData.findIndex(function(item) { return item.id === id; });
            if (index === -1) return;

            var emp = notCheckedInData.splice(index, 1)[0];
            var now = new Date();
            var hours = String(now.getHours()).padStart(2, '0');
            var minutes = String(now.getMinutes()).padStart(2, '0');
            emp.time = hours + ':' + minutes;
            emp.status = 'M';

            // 將該筆加入已報到列表頂部
            checkedInData.unshift(emp);

            // 重新載入表格與計數
            $('#not-checked-in-table').bootstrapTable('load', notCheckedInData);
            $('#checked-in-table').bootstrapTable('load', checkedInData);
            updateCounters();
        }
```

- [x] **Step 3: 驗證檔案完整性**

檢視 `checkin.html` 確保所有語法無缺漏，無遺留未使用的函式如 `submitReason` 或 `inputReasonFormatter`。

---

### Task 2: 驗證現場簽到頁面功能

**Files:**
- Test: `d:/work/CPDS/checkin.html`

- [x] **Step 1: 靜態檢查與結構檢驗**
檢查 HTML 標籤結構、按鈕 class、表格欄位配置是否完全符合規格。

- [x] **Step 2: 執行驗證確認**
透過檔案內容比對與邏輯追蹤，確認點擊主管手動簽到時各陣列與 UI 更新步驟均能正常運作。
