# CPDS 現場簽到頁面（checkin.html）主管手動簽到功能設計規範

## 1. 概述 (Overview)
本設計旨在優化現場簽到頁面（`checkin.html`）中的簽到流程。將原先未報到人員清單中之「手動填寫原因」輸入框與送出按鈕，替換為直覺便捷的「主管手動簽到」按鈕。點擊後可立即將該員工轉入「已報到」清單，並標記為主管代簽，同時動態更新雙方人數計數。

## 2. 介面與功能變更規格 (UI & Functional Specifications)

### 2.1 未報到表格 (`#not-checked-in-table`)
- **欄位移除**：
  - 移除原有的「手動填寫原因 (`reason`)」輸入框。
- **欄位結構**：
  1. **姓名 (`name`)**：顯示姓名與工號 `<small class="text-muted">({id})</small>`。
  2. **部門 (`dept`)**：顯示所屬部門。
  3. **操作 (`action`)**：居中顯示「主管手動簽到」按鈕。
     - 按鈕樣式：`<button class="btn btn-outline-warning btn-sm text-nowrap" onclick="managerCheckIn('{id}')"><i class="bi bi-person-check-fill me-1"></i>主管手動簽到</button>`

### 2.2 已報到表格 (`#checked-in-table`)
- **欄位結構**：
  1. **姓名 (`name`)**：顯示姓名與工號。
  2. **部門 (`dept`)**：顯示所屬部門。
  3. **報到時間點 (`time`)**：顯示報到時分（`HH:mm`）。
  4. **報到狀態 (`status`)**：欄位名稱由「正常報到」改為「報到狀態」，並透過 Formatter 呈現不同徽章：
     - `status === 'Y'`：綠色徽章 `<span class="badge bg-success px-3 py-2"><i class="bi bi-check-lg me-1"></i>正常報到</span>`
     - `status === 'M'`：橘黃色徽章 `<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-person-badge me-1"></i>主管代簽</span>`

### 2.3 卡片標頭計數動態更新
- 已報到卡片標頭：`<span id="checked-in-count">1</span>人`
- 未報到卡片標頭：`<span id="not-checked-in-count">5</span>人`
- 透過 `updateCounters()` 函式依據 `checkedInData.length` 與 `notCheckedInData.length` 同步更新畫面數字。

## 3. 資料結構與事件處理 (Data Flow & Event Handling)

### 3.1 資料模型 (Data Model)
- **已報到人員物件**：
  ```javascript
  {
    id: "1001",
    name: "王小明",
    dept: "製造部",
    time: "08:15",
    status: "Y" // 'Y' 為正常 QR 掃描簽到，'M' 為主管手動代簽
  }
  ```
- **未報到人員物件**：
  ```javascript
  {
    id: "1002",
    name: "李大華",
    dept: "品管部"
  }
  ```

### 3.2 主管簽到動作函式 (`managerCheckIn(id)`)
1. 依工號 `id` 於 `notCheckedInData` 陣列尋找該名員工。
2. 若找不到則結束流程。
3. 自 `notCheckedInData` 移除該員。
4. 取得當前時間字串（格式為 `HH:mm`，補零如 `09:05`）。
5. 設定其屬性 `time = currentTime`，`status = 'M'`。
6. 將該筆資料 `unshift` 或 `push` 加入 `checkedInData` 頂部。
7. 呼叫 `$('#not-checked-in-table').bootstrapTable('load', notCheckedInData)` 與 `$('#checked-in-table').bootstrapTable('load', checkedInData)` 重新渲染表格。
8. 呼叫 `updateCounters()` 更新雙方人數。

## 4. 驗證與測試標準 (Verification Criteria)
1. 初始載入時，已報到人數顯示為 1 人，未報到人數顯示為 5 人。
2. 未報到表格僅有姓名、部門、操作三欄，操作欄內有「主管手動簽到」按鈕。
3. 點選任一位未報到人員的「主管手動簽到」按鈕：
   - 該員立即自「未報到」清單消失，未報到人數減少 1。
   - 該員立即出現在「已報到」清單中，報到時間顯示為當前時間，狀態標籤顯示為橘黃色「主管代簽」。
   - 已報到人數增加 1。
4. 表格排列無跑版，在不同螢幕寬度下皆能正常呈現。
