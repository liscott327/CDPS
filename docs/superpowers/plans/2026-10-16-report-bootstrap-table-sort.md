# report.html 表格欄位排序功能實作計畫 (Bootstrap-Table)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 CPDS 系統的 `report.html` 引進 Bootstrap-Table 套件，將報表表格 9 個欄位全數改為可點擊排序功能，並保留現有多維度篩選、自訂徽章渲染與 CSV 匯出功能。

**Architecture:** 引入 jQuery 及 Bootstrap-Table CDN，將原有原生 `<table>` 透過 Bootstrap-Table 初始化，將篩選機制（`applyReportFilters`）與匯出邏輯（`exportToCSV`）串接至 Bootstrap-Table 的 `load` 與 `getData` API。

**Tech Stack:** HTML5, CSS3, Bootstrap 5, Bootstrap Icons, jQuery 3.7.1, Bootstrap-Table 1.24.1 (zh-TW locale), JavaScript (ES6+).

## Global Constraints
- 嚴格維持現有的版面風格、導覽列（Navbar TabView）、多維度篩選卡片與按鈕外觀。
- 表格全數 9 個欄位皆需支援升冪 (ASC) / 降冪 (DESC) 點擊排序。
- 簽到狀態仍需依照「簽到時間超過調度起始時間 10 分鐘自動為已逾期 (status: 2)」之業務邏輯即時動態判定。
- 匯出 CSV 必須跟隨當前表格之排序與篩選順序，並維持 UTF-8 BOM 防亂碼。

---

### Task 1: 引入 CDN 依賴庫與配置表頭 `<th>` 排序屬性

**Files:**
- Modify: `d:\work\CPDS\report.html:7-12` (引入 CSS)
- Modify: `d:\work\CPDS\report.html:220-240` (調整 `<table>` 及 `<thead>`)
- Modify: `d:\work\CPDS\report.html:255-260` (引入 JS)

- [ ] **Step 1: 在 `<head>` 引入 Bootstrap-Table CSS**
在 `report.html` `<head>` 內引入 `bootstrap-table.min.css`：
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-table@1.24.1/dist/bootstrap-table.min.css">
```

- [ ] **Step 2: 在 `<body>` 尾部引入 jQuery、Bootstrap-Table JS 與繁中語系**
依正確載入順序（jQuery -> Bootstrap Bundle -> Bootstrap-Table -> zh-TW Locale）引入：
```html
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.24.1/dist/bootstrap-table.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.24.1/dist/locale/bootstrap-table-zh-TW.min.js"></script>
```

- [ ] **Step 3: 配置 `#reportTable` 的 `<thead>` 表頭欄位**
替 9 個 `<th>` 加入 `data-field`、`data-sortable="true"` 與對應自訂格式化函式屬性：
```html
<table class="table table-hover align-middle mb-0" id="reportTable">
  <thead>
    <tr>
      <th data-field="dispatchDate" data-sortable="true" data-formatter="dispatchDateFormatter" style="min-width: 110px;">調派日期</th>
      <th data-field="route" data-sortable="true" data-formatter="routeFormatter" style="min-width: 150px;">來源廠 → 目的廠</th>
      <th data-field="empId" data-sortable="true" data-formatter="empIdFormatter" style="min-width: 90px;">工號</th>
      <th data-field="empName" data-sortable="true" data-formatter="empNameFormatter" style="min-width: 90px;">姓名</th>
      <th data-field="status" data-sortable="true" data-sorter="statusSorter" data-formatter="statusFormatter" style="min-width: 100px;">狀態</th>
      <th data-field="dispatchTimeRange" data-sortable="true" data-formatter="timeRangeFormatter" style="min-width: 140px;">調度時間起訖</th>
      <th data-field="checkinTime" data-sortable="true" data-sorter="checkinTimeSorter" data-formatter="checkinTimeFormatter" style="min-width: 100px;">簽到時間</th>
      <th data-field="receiverName" data-sortable="true" data-formatter="receiverNameFormatter" style="min-width: 110px;">確認人</th>
      <th data-field="anomalyNote" data-sortable="true" data-formatter="anomalyNoteFormatter">備註與異常註記</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
```

---

### Task 2: 實作自訂 Formatter、Sorter 與 Bootstrap-Table 資料驅動整合

**Files:**
- Modify: `d:\work\CPDS\report.html:520-660`

- [ ] **Step 1: 實作各欄位自訂 Formatter 與 Sorter 函式**
在 `<script>` 區塊內定義全域 Formatter 與 Sorter：
```javascript
function dispatchDateFormatter(value) {
  return `<span class="fw-bold">${value || '-'}</span>`;
}

function routeFormatter(value, row) {
  return `
    <span class="badge-route-from">${row.fromPlant}</span>
    <i class="bi bi-arrow-right text-muted mx-1"></i>
    <span class="badge-route-to">${row.toPlant}</span>
  `;
}

function empIdFormatter(value) {
  return `<span class="font-monospace text-secondary">${value || '-'}</span>`;
}

function empNameFormatter(value) {
  return `<span class="fw-bold">${value || '-'}</span>`;
}

function statusFormatter(value) {
  return getStatusBadge(value);
}

function statusSorter(a, b) {
  const order = { '0': 0, '1': 1, '2': 2, '3': 3 };
  return (order[String(a)] ?? 99) - (order[String(b)] ?? 99);
}

function timeRangeFormatter(value) {
  return `<span class="font-monospace text-secondary small">${value || '-'}</span>`;
}

function checkinTimeFormatter(value) {
  return `<span class="font-monospace text-secondary small">${formatCheckinTime(value)}</span>`;
}

function checkinTimeSorter(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function receiverNameFormatter(value) {
  return `<span class="small">${value || '-'}</span>`;
}

function anomalyNoteFormatter(value) {
  return value ? `<span class="badge-anomaly-note">${value}</span>` : '<span class="text-muted">-</span>';
}
```

- [ ] **Step 2: 重構 `applyReportFilters()` 與表格載入**
將原有直接操作 `tbody.innerHTML` 的渲染改為呼叫 Bootstrap-Table API：
```javascript
function applyReportFilters() {
  const records = getRecords();
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const fromPlant = document.getElementById('filterFromPlant').value;
  const toPlant = document.getElementById('filterToPlant').value;
  const status = document.getElementById('filterStatus').value;

  const filtered = records.filter(item => {
    const itemStatus = resolveRecordStatus(item);
    if (startDate && item.dispatchDate < startDate) return false;
    if (endDate && item.dispatchDate > endDate) return false;
    if (fromPlant && item.fromPlant !== fromPlant) return false;
    if (toPlant && item.toPlant !== toPlant) return false;
    if (status !== '' && itemStatus !== String(status)) return false;
    return true;
  }).map(item => ({
    ...item,
    status: resolveRecordStatus(item),
    route: `${item.fromPlant} → ${item.toPlant}`
  }));

  document.getElementById('filterResultCount').innerText = 
    `共查詢到 ${filtered.length} 筆資料 (總庫存 ${records.length} 筆)`;

  $('#reportTable').bootstrapTable('load', filtered);
}
```

- [ ] **Step 3: 重構 `exportToCSV()` 與頁面初始化**
匯出資料直接讀取 Bootstrap-Table 當前顯示與排序的資料：
```javascript
function exportToCSV() {
  const targetRecords = $('#reportTable').bootstrapTable('getData');
  if (!targetRecords || targetRecords.length === 0) {
    showToast('目前無任何符合的資料可匯出', true);
    return;
  }

  const headers = ['調派編號', '調派日期', '來源廠', '目的廠', '工號', '姓名', '調派狀態', '調度時間起訖', '簽到時間', '確認人', '備註與異常註記'];
  const statusMap = {
    '0': '待簽到',
    '1': '已簽到',
    '2': '已逾期',
    '3': '異常'
  };

  const rows = targetRecords.map(r => {
    return [
      `"${r.id}"`,
      `"${r.dispatchDate}"`,
      `"${r.fromPlant}"`,
      `"${r.toPlant}"`,
      `"${r.empId}"`,
      `"${r.empName}"`,
      `"${statusMap[r.status] || r.status}"`,
      `"${r.dispatchTimeRange || ''}"`,
      `"${formatCheckinTime(r.checkinTime) === '-' ? '' : formatCheckinTime(r.checkinTime)}"`,
      `"${r.receiverName || ''}"`,
      `"${(r.anomalyNote || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `跨廠人員調派報表_${getFormattedDate(0)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast(`已成功匯出 ${targetRecords.length} 筆報表資料`);
}
```

在 `DOMContentLoaded` 中初始化 Bootstrap-Table：
```javascript
$(function() {
  $('#reportTable').bootstrapTable({
    locale: 'zh-TW',
    sortReset: true
  });
  applyReportFilters();
  if (window.Auth) {
    Auth.renderNavbarUser('#navbarUserArea');
  }
});
```

---

### Task 3: 驗證與微調
- [ ] **Step 1: 檢查 HTML 語法與無缺失標籤**
- [ ] **Step 2: 驗證所有欄位排序、篩選器與匯出功能**
