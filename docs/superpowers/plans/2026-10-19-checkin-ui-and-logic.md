# 現場簽到作業 (checkin.html) 畫面與功能重構實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `checkin.html` 的掃描簽到彈窗整合至主畫面藍底標題列，落實單一頁面無跳窗操作，並實作全新的五大狀態定義、精準調度時間檢核與異常標記總儲存功能。

**Architecture:** 
1. 移除 `#scanModal` 彈跳視窗及重新整理按鈕，將工號輸入框 `#barcodeInput` 與即時結果回饋區 `#scanResultArea` 整合入頂部 `.alert-primary` 藍底列。
2. 提取簽到狀態判定純邏輯函式 `evaluateCheckinStatus(emp, now)` 與時間解析器 `parseDispatchRange(rangeStr)`，精準處理開始前 10 分鐘 ~ 結束前各區間。
3. 待簽到表格動態比對當前時間，超過調度結束時間者顯示「已逾期」徽章；異常標記卡片標頭新增總儲存按鈕，單列操作僅保留復原。

**Tech Stack:** HTML5, Bootstrap 5.3, Bootstrap Table 1.22, jQuery 3.7, Node.js (用於單元邏輯驗證).

## Global Constraints
- 嚴格遵守五大情境文案與呈現規格：
  - 情境 1: 重複掃描 ➔ `✓ 重複掃描 {工號} {姓名}，已略過` (藍灰/提示)
  - 情境 2: 未在調度名單 ➔ `✗ 發生錯誤，工號 {工號} 未於調度名單中` (紅/錯誤)
  - 情境 3: 未在調度時間 ➔ `✗ 發生錯誤，{工號} {姓名} ，應在 調度時間內 簽到` (紅/錯誤)
  - 情境 4: 準時簽到 ➔ `✓ 簽到成功 {工號} {姓名}、簽到時間 {HH:mm}` (綠/成功)
  - 情境 5: 逾期簽到 ➔ `✓ 逾期簽到成功 {工號} {姓名}、簽到時間 {HH:mm}` (橘黃/警告)
- 狀態碼映射：
  - `0`: 待簽到 (`bg-secondary`)
  - `1`: 已簽到 (`bg-success`)
  - `2`: 逾期簽到 (`bg-warning text-dark`)
  - `3`: 異常 (`bg-warning text-dark`)
  - `4`: 已逾期 (`bg-danger`)，僅動態渲染於待簽到列表
- 異常標記卡片標頭具備「儲存所有異常原因」總儲存按鈕，每列只保留「復原」按鈕。

---

### Task 1: 建立簽到邏輯核心與單元測試腳本

**Files:**
- Create: `scripts/verify_checkin_logic.js`

**Interfaces:**
- Produces: `parseDispatchRange(rangeStr)` 解析 `"10:00~12:00"` 為開始/結束分鐘數。
- Produces: `evaluateCheckinStatus(emp, currentTimeStr)` 回傳 `{ success, isDuplicate, isNotFound, isTimeError, status, message, alertClass }`。

- [x] **Step 1: 建立測試與驗證腳本 `scripts/verify_checkin_logic.js`**

```javascript
// scripts/verify_checkin_logic.js
const assert = require('assert');

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return null;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function parseDispatchRange(rangeStr) {
    if (!rangeStr) return null;
    const parts = rangeStr.split('~');
    if (parts.length !== 2) return null;
    const start = parseTimeToMinutes(parts[0]);
    const end = parseTimeToMinutes(parts[1]);
    if (start === null || end === null) return null;
    return { start, end };
}

function evaluateCheckinStatus(targetId, currentTimeStr, checkedInData, notCheckedInData, abnormalData) {
    const checked = checkedInData.find(e => e.id === targetId || e.name === targetId);
    if (checked) {
        return {
            type: 'DUPLICATE',
            message: `✓ 重複掃描 ${checked.id} ${checked.name}，已略過`,
            alertClass: 'alert-info'
        };
    }

    const notChecked = notCheckedInData.find(e => e.id === targetId || e.name === targetId);
    const abnormal = abnormalData.find(e => e.id === targetId || e.name === targetId);
    const emp = notChecked || abnormal;

    if (!emp) {
        return {
            type: 'NOT_FOUND',
            message: `✗ 發生錯誤，工號 ${targetId} 未於調度名單中`,
            alertClass: 'alert-danger'
        };
    }

    const range = parseDispatchRange(emp.dispatchTime);
    const currentMin = parseTimeToMinutes(currentTimeStr);

    if (range && currentMin !== null) {
        const windowStart = range.start - 10;
        const onTimeLimit = range.start + 10;
        const windowEnd = range.end;

        if (currentMin < windowStart || currentMin > windowEnd) {
            return {
                type: 'TIME_ERROR',
                emp: emp,
                message: `✗ 發生錯誤，${emp.id} ${emp.name} ，應在 調度時間內 簽到`,
                alertClass: 'alert-danger'
            };
        }

        if (currentMin <= onTimeLimit) {
            return {
                type: 'SUCCESS_ON_TIME',
                emp: emp,
                status: '1',
                message: `✓ 簽到成功 ${emp.id} ${emp.name}、簽到時間 ${currentTimeStr}`,
                alertClass: 'alert-success'
            };
        } else {
            return {
                type: 'SUCCESS_LATE',
                emp: emp,
                status: '2',
                message: `✓ 逾期簽到成功 ${emp.id} ${emp.name}、簽到時間 ${currentTimeStr}`,
                alertClass: 'alert-warning'
            };
        }
    }

    return {
        type: 'SUCCESS_ON_TIME',
        emp: emp,
        status: '1',
        message: `✓ 簽到成功 ${emp.id} ${emp.name}、簽到時間 ${currentTimeStr}`,
        alertClass: 'alert-success'
    };
}

// 測試案例
const mockChecked = [
    { id: "JM10001", name: "王小明", dept: "A12-2廠", dispatchTime: "10:00~11:00", time: "10:02", status: "1" }
];
const mockNotChecked = [
    { id: "JM10002", name: "李大華", dept: "A5-2廠", dispatchTime: "10:00~11:00", status: "0" },
    { id: "JM10007", name: "趙大成", dept: "A12-1廠", dispatchTime: "14:00~17:00", status: "0" }
];
const mockAbnormal = [];

// 1. 重複掃描
const r1 = evaluateCheckinStatus("JM10001", "10:05", mockChecked, mockNotChecked, mockAbnormal);
assert.strictEqual(r1.type, 'DUPLICATE');
assert.strictEqual(r1.message, '✓ 重複掃描 JM10001 王小明，已略過');

// 2. 未於調度名單中
const r2 = evaluateCheckinStatus("JM99999", "10:05", mockChecked, mockNotChecked, mockAbnormal);
assert.strictEqual(r2.type, 'NOT_FOUND');
assert.strictEqual(r2.message, '✗ 發生錯誤，工號 JM99999 未於調度名單中');

// 3. 過早簽到 (下午調度，早上來)
const r3 = evaluateCheckinStatus("JM10007", "09:30", mockChecked, mockNotChecked, mockAbnormal);
assert.strictEqual(r3.type, 'TIME_ERROR');
assert.strictEqual(r3.message, '✗ 發生錯誤，JM10007 趙大成 ，應在 調度時間內 簽到');

// 4. 超過結束時間 (10:00~11:00，11:05 來)
const r4 = evaluateCheckinStatus("JM10002", "11:05", mockChecked, mockNotChecked, mockAbnormal);
assert.strictEqual(r4.type, 'TIME_ERROR');
assert.strictEqual(r4.message, '✗ 發生錯誤，JM10002 李大華 ，應在 調度時間內 簽到');

// 5. 準時簽到 (10:00~11:00，09:55 或 10:08 來)
const r5 = evaluateCheckinStatus("JM10002", "09:55", mockChecked, mockNotChecked, mockAbnormal);
assert.strictEqual(r5.type, 'SUCCESS_ON_TIME');
assert.strictEqual(r5.status, '1');
assert.strictEqual(r5.message, '✓ 簽到成功 JM10002 李大華、簽到時間 09:55');

// 6. 逾期簽到 (10:00~11:00，10:15 來)
const r6 = evaluateCheckinStatus("JM10002", "10:15", mockChecked, mockNotChecked, mockAbnormal);
assert.strictEqual(r6.type, 'SUCCESS_LATE');
assert.strictEqual(r6.status, '2');
assert.strictEqual(r6.message, '✓ 逾期簽到成功 JM10002 李大華、簽到時間 10:15');

console.log('All logic tests PASSED!');
```

- [x] **Step 2: 執行驗證腳本確認邏輯完全正確**

Run: `node scripts/verify_checkin_logic.js`
Expected: `All logic tests PASSED!`

---

### Task 2: 重構 `checkin.html` 畫面 DOM 結構

**Files:**
- Modify: `checkin.html:114-250`

- [x] **Step 1: 替換頂部 `.alert-primary` 藍底列**
  - 移除「重新整理」按鈕與「點擊開始掃描」按鈕。
  - 加入工號輸入框 `#barcodeInput` 與即時結果提示區 `#scanResultArea`。

- [x] **Step 2: 調整「異常標記」卡片標頭與表格結構**
  - 在卡片標頭新增 `[ 儲存所有異常原因 ]` 按鈕。

- [x] **Step 3: 移除底部的 `#scanModal` 彈出視窗整個 DOM**

---

### Task 3: 實作五大情境判定、動態狀態計算與異常批次儲存

**Files:**
- Modify: `checkin.html:260-636`

- [x] **Step 1: 整合核心判斷邏輯函式**
  - 引入 `parseTimeToMinutes` 與 `parseDispatchRange`。
  - 更新 `statusFormatter` 支援 `4` 或待簽到超過結束時間動態顯示為紅色「已逾期」，已簽到 `2` 顯示為「逾期簽到」。
  - 更新 `checkinComparator` 支援逾期簽到權重。

- [x] **Step 2: 實作即時提示更新函式 `showScanResult(type, message, alertClass)`**
  - 根據情境更新 `#scanResultArea` 的 HTML 與背景色彩（`alert-success`, `alert-warning`, `alert-danger`, `alert-info`）。

- [x] **Step 3: 重寫 `handleScanSubmit()` 函式**
  - 取消跳出彈窗，改由 `#barcodeInput` 直接觸發。
  - 嚴格依照 Task 1 的判定矩陣執行五大情境處理。
  - 簽到成功後清空輸入框、重新聚焦、自動同步更新表格與計數器。

- [x] **Step 4: 實作異常標記總儲存 `saveAllAbnormal()` 與簡化操作列**
  - 每列僅保留 `復原` 按鈕。
  - 標頭「儲存所有異常原因」按鈕點擊後彈出儲存成功 Toast/Alert。

---

### Task 4: 端對端功能驗證與整體檢查

**Files:**
- Test: `scripts/verify_checkin_logic.js`
- Test: `checkin.html`

- [x] **Step 1: 再次執行 `node scripts/verify_checkin_logic.js` 確保無破壞性變更**
- [x] **Step 2: 啟動靜態測試或以指令檢驗 `checkin.html` 語法無報錯**
- [x] **Step 3: 驗證畫面元素：確認無 Modal 彈窗殘留，確認輸入框與結果提示區正確配置，確認總儲存按鈕存在**
