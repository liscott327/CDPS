# CPDS 報表狀態定義與逾期簽到機制實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `CPDS/report.html` 中新增「逾期簽到」（超過起始時間 10 分鐘以上才簽到者），並重新定義「已逾期」（超過起始時間 10 分鐘後仍未到者），同時更新篩選、表格呈現、排序、CSV 匯出與展示資料庫。

**Architecture:** 
- 前端更新 `#filterStatus` 下拉選單。
- 於前端報表邏輯中實作未簽到逾期演算法 `isNotCheckedInOverdue`，並重構 `resolveRecordStatus` 狀態解析函式。
- 升級徽章產生器 `getStatusBadge`、自訂排序器 `statusSorter`、複合排序器 `multiColumnComparator` 與 CSV 匯出對應表。
- 提升 LocalStorage 版本至 `v6`，並重構假資料以展示完整 5 種狀態。

**Tech Stack:** HTML5, JavaScript (ES6+), Bootstrap 5.3.2, Bootstrap-Table 1.24.1, Select2 4.1.0

## Global Constraints
- 狀態代碼標準：
  - `0`: 待簽到（次要灰）
  - `1`: 已簽到（綠色）
  - `2`: 逾期簽到（橙黃色 warning）
  - `3`: 異常（橙黃色 warning）
  - `4`: 已逾期（紅色 danger）
- 逾期簽到定義：有簽到時間，且 $\text{簽到時間} > \text{起始時間} + 10 \text{ 分鐘}$。
- 已逾期定義：無簽到時間，且 $\text{當前時間} > \text{調派日期} + \text{起始時間} + 10 \text{ 分鐘}$。

---

### Task 1: 更新篩選選單 UI 與狀態徽章樣式

**Files:**
- Modify: `d:/work/CPDS/report.html:225-238` (狀態下拉選單)

**Interfaces:**
- Consumes: `#filterStatus`
- Produces: 
  - 支援 5 種狀態選項：`0: 待簽到`, `1: 已簽到`, `2: 逾期簽到`, `4: 已逾期`, `3: 異常`

- [x] **Step 1: 修改 `#filterStatus` 下拉選單 HTML**
```html
<select class="form-select" id="filterStatus" multiple="multiple" data-placeholder="請選擇狀態...">
  <option value="0">待簽到</option>
  <option value="1">已簽到</option>
  <option value="2">逾期簽到</option>
  <option value="4">已逾期</option>
  <option value="3">異常</option>
</select>
```

---

### Task 2: 實作未簽到逾期檢測函式與重構 `resolveRecordStatus`

**Files:**
- Modify: `d:/work/CPDS/report.html:345-380`

**Interfaces:**
- Produces:
  - `isNotCheckedInOverdue(dispatchDate, dispatchTimeRange)`
  - `resolveRecordStatus(record)`: 回傳 `'0'`、`'1'`、`'2'`、`'3'` 或 `'4'`

- [x] **Step 1: 實作 `isNotCheckedInOverdue` 輔助函式**
```javascript
function isNotCheckedInOverdue(dispatchDate, dispatchTimeRange) {
  if (!dispatchDate || !dispatchTimeRange) return false;
  const rangeParts = dispatchTimeRange.split(/[~-]/);
  if (rangeParts.length < 2) return false;
  const startTimeStr = rangeParts[0].trim();
  const formattedDate = dispatchDate.replace(/\//g, '-');
  const startDateTime = new Date(`${formattedDate}T${startTimeStr}:00`);
  if (isNaN(startDateTime.getTime())) return false;
  
  // 起始時間超過 10 分鐘門檻
  const overdueThreshold = new Date(startDateTime.getTime() + 10 * 60 * 1000);
  const now = new Date();
  return now > overdueThreshold;
}
```

- [x] **Step 2: 重構 `resolveRecordStatus` 函式**
```javascript
function resolveRecordStatus(record) {
  if (String(record.status) === '3' || String(record.status) === 'Anomaly' || record.status === '異常') {
    return '3'; // 異常狀態維持不變
  }
  
  // 1. 若有簽到時間：判斷是否超過起始時間 10 分鐘
  if (record.checkinTime && record.dispatchTimeRange) {
    if (isCheckinOverdue(record.checkinTime, record.dispatchTimeRange)) {
      return '2'; // 逾期簽到
    }
    return '1'; // 已簽到 (準時)
  }

  // 2. 若無簽到時間：判斷當前時間是否已超過起始時間 10 分鐘
  if (isNotCheckedInOverdue(record.dispatchDate, record.dispatchTimeRange)) {
    return '4'; // 已逾期 (超過 10 分鐘仍未到者)
  }

  return '0'; // 待簽到
}
```

---

### Task 3: 升級狀態徽章渲染、排序器與 CSV 匯出對應

**Files:**
- Modify: `d:/work/CPDS/report.html:560-585` (`getStatusBadge`)
- Modify: `d:/work/CPDS/report.html:615-625` (`statusSorter`)
- Modify: `d:/work/CPDS/report.html:680-692` (`multiColumnComparator`)
- Modify: `d:/work/CPDS/report.html:740-755` (`exportToCSV`)

**Interfaces:**
- Consumes: `resolveRecordStatus` 的輸出
- Produces: 
  - `getStatusBadge` 渲染 `逾期簽到` 與 `已逾期` 徽章
  - `statusSorter` 與 `multiColumnComparator` 權重：`0 -> 1 -> 2 -> 4 -> 3`
  - `exportToCSV` 中文字串對應

- [x] **Step 1: 更新 `getStatusBadge`**
```javascript
function getStatusBadge(status) {
  switch (String(status)) {
    case '0':
    case 'Pending':
    case '待簽到':
      return '<span class="badge bg-secondary badge-status"><i class="bi bi-hourglass-split me-1"></i>待簽到</span>';
    case '1':
    case 'Received':
    case '已簽到':
      return '<span class="badge bg-success badge-status"><i class="bi bi-check-circle me-1"></i>已簽到</span>';
    case '2':
    case 'LateCheckin':
    case '逾期簽到':
      return '<span class="badge bg-warning text-dark badge-status"><i class="bi bi-clock-history me-1"></i>逾期簽到</span>';
    case '3':
    case 'Anomaly':
    case '異常':
      return '<span class="badge bg-warning text-dark badge-status"><i class="bi bi-exclamation-triangle-fill me-1"></i>異常</span>';
    case '4':
    case 'Expired':
    case '已逾期':
      return '<span class="badge bg-danger badge-status"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
    default:
      return `<span class="badge bg-secondary badge-status">${status}</span>`;
  }
}
```

- [x] **Step 2: 更新 `statusSorter` 與 `multiColumnComparator`**
```javascript
const statusWeight = {
  '0': 0, 'Pending': 0, '待簽到': 0,
  '1': 1, 'Received': 1, '已簽到': 1,
  '2': 2, 'LateCheckin': 2, '逾期簽到': 2,
  '4': 3, 'Expired': 3, '已逾期': 3,
  '3': 4, 'Anomaly': 4, '異常': 4
};
```

- [x] **Step 3: 更新 `exportToCSV` 的 `statusMap`**
```javascript
const statusMap = {
  '0': '待簽到',
  '1': '已簽到',
  '2': '逾期簽到',
  '3': '異常',
  '4': '已逾期',
  'Pending': '待簽到',
  'Received': '已簽到',
  'LateCheckin': '逾期簽到',
  'Anomaly': '異常',
  'Expired': '已逾期'
};
```

---

### Task 4: 更新展示資料庫 (Demo Records) 與版本金鑰

**Files:**
- Modify: `d:/work/CPDS/report.html:320-325` (STORAGE_KEY)
- Modify: `d:/work/CPDS/report.html:380-520` (`generateDemoRecords`)

**Interfaces:**
- Produces: 
  - `STORAGE_KEY = 'cross_plant_dispatch_records_v6'`
  - 包含準時簽到、逾期簽到、已逾期、未來待簽到、異常之示範資料

- [x] **Step 1: 更新 LocalStorage 版本金鑰至 v6**
- [x] **Step 2: 調整示範資料**
  - `DISP-1001`: `checkinTime: '10:05'` (10:00~11:30) $\rightarrow$ 1: 已簽到
  - `DISP-1002`: `checkinTime: null` (2026-10-15 14:30~17:30，過去) $\rightarrow$ 4: 已逾期
  - `DISP-1003`: `checkinTime: '08:06'` (08:00~12:00) $\rightarrow$ 1: 已簽到
  - `DISP-1004`: 異常 (3: 異常)
  - `DISP-1005`: `checkinTime: '14:48'` (14:30~17:30) $\rightarrow$ 2: 逾期簽到
  - `DISP-1006`: `checkinTime: '08:52'` (08:30~11:30) $\rightarrow$ 2: 逾期簽到
  - `DISP-1007`: 異常 (3: 異常)
  - `DISP-1008`: `checkinTime: '08:08'` (08:00~12:00) $\rightarrow$ 1: 已簽到
  - `DISP-1009`: `checkinTime: null` (2026-10-12 14:30~17:30，過去) $\rightarrow$ 4: 已逾期
  - `DISP-1010`: 未來日期 (如 `getFormattedDate(1)` 或 `2099-01-01` 09:00~12:00)，`checkinTime: null` $\rightarrow$ 0: 待簽到

---

### Task 5: 執行完整邏輯驗證

**Files:**
- Create: `scratch/verify_report_status.js`
- Test: `report.html`

- [x] **Step 1: 編寫驗證腳本確認所有 5 種狀態的解析、篩選與排序邏輯**
- [x] **Step 2: 執行驗證並確認 0 錯誤**
