# CPDS 首頁調度列表篩選擴充與邊界條件防呆實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `CPDS/index.html` 的支援調度列表中增加「目的廠(多選)」與「調度時間」篩選，支援單獨篩選目的廠時僅呈現符合之單筆摘要項目，並於新增與編輯明細時阻擋過去時間，以及各廠每日僅能新增一調度單之防呆。

**Architecture:** 
- 前端使用 Bootstrap 5、Select2 與 Flatpickr 擴充上方篩選工具列與下半部編輯表單。
- 透過 Bootstrap-Table 的 column formatter 動態比對當前篩選之目的廠與時段交集，僅輸出符合條件的摘要項目。
- 加入時間與重疊判定函式進行新增、編輯與送出邊界條件防呆。

**Tech Stack:** HTML5, JavaScript (ES6+), jQuery 3.7.1, Bootstrap 5.3.2, Select2 4.1.0, Flatpickr, Bootstrap-Table 1.22.1

## Global Constraints
- 嚴格維持現有 `index.html` 樣式風格與排版規範（AdminLTE 4 + Bootstrap 5 + Select2 Bootstrap 5 主題）。
- 目的廠篩選必須支援多選，調度時間篩選以起訖時間重疊交集比對。
- 阻擋過去時間以「調度日期 + 調度開始時間」小於系統目前時間為標準。
- 各廠每日一單限制以「來源廠 + 調度日期」為唯一識別鍵，具備即時警示與送出攔截。

---

### Task 1: 擴充篩選工具列 UI 與編輯區警示元素

**Files:**
- Modify: `d:/work/CPDS/index.html:200-240` (篩選表單區域)
- Modify: `d:/work/CPDS/index.html:260-290` (編輯表單即時警示區域)

**Interfaces:**
- Consumes: 現有 `filterForm` 與 `itemInputForm`
- Produces: 
  - `#filterTargetDept` (Select2 多選下拉選單)
  - `#filterStartTime`, `#filterEndTime` (Flatpickr 時間輸入框)
  - `#duplicatePlanAlert` (即時警示文字標籤容器)

- [x] **Step 1: 修改篩選工具列 HTML 結構**
在 `index.html` 的 `#filterForm` 中調整排版，加入「目的廠」與「調度時間(起、訖)」：
```html
<form id="filterForm" class="row g-2 mb-3 align-items-end">
    <div class="col-md-2 col-sm-6">
        <label class="form-label small fw-bold text-secondary mb-1">調度日期(起)</label>
        <input type="date" class="form-control form-control-sm" id="filterStartDate" value="2026-10-15">
    </div>
    <div class="col-md-2 col-sm-6">
        <label class="form-label small fw-bold text-secondary mb-1">調度日期(訖)</label>
        <input type="date" class="form-control form-control-sm" id="filterEndDate" value="2026-10-16">
    </div>
    <div class="col-md-2 col-sm-6">
        <label class="form-label small fw-bold text-secondary mb-1">來源廠</label>
        <select class="form-select form-select-sm" id="filterDept" multiple="multiple" data-placeholder="請選擇來源廠...">
            <option value="A5-1廠">A5-1廠</option>
            <option value="A5-2廠">A5-2廠</option>
            <option value="A5-3廠">A5-3廠</option>
        </select>
    </div>
    <div class="col-md-2 col-sm-6">
        <label class="form-label small fw-bold text-secondary mb-1">目的廠</label>
        <select class="form-select form-select-sm" id="filterTargetDept" multiple="multiple" data-placeholder="請選擇目的廠...">
            <option value="A5-1廠">A5-1廠</option>
            <option value="A5-2廠">A5-2廠</option>
            <option value="A5-3廠">A5-3廠</option>
        </select>
    </div>
    <div class="col-md-2 col-sm-6">
        <label class="form-label small fw-bold text-secondary mb-1">調度時間(起~訖)</label>
        <div class="input-group input-group-sm">
            <input type="text" class="form-control text-center timepicker-24hr" id="filterStartTime" placeholder="起 HH:mm">
            <span class="input-group-text px-1 bg-light">~</span>
            <input type="text" class="form-control text-center timepicker-24hr" id="filterEndTime" placeholder="訖 HH:mm">
        </div>
    </div>
    <div class="col-md-2 col-sm-6">
        <label class="form-label small fw-bold text-secondary mb-1">關鍵字搜尋</label>
        <div class="input-group input-group-sm">
            <input type="text" class="form-control" id="filterKeyword" placeholder="搜尋用途/工號/姓名...">
            <button type="button" class="btn btn-primary px-2" id="btnFilterQuery" title="查詢">
                <i class="bi bi-search"></i>
            </button>
            <button type="button" class="btn btn-outline-secondary px-2" id="btnFilterReset" title="重設">
                <i class="bi bi-arrow-counterclockwise"></i>
            </button>
        </div>
    </div>
</form>
```

- [x] **Step 2: 在下半部編輯表單上方加入重複單據提示容器**
在 `itemInputForm` 表格上方加入 `#duplicatePlanAlert`：
```html
<div id="duplicatePlanAlert" class="alert alert-warning py-1 px-3 mb-2 small fw-semibold d-none" role="alert">
    <i class="bi bi-exclamation-triangle-fill me-1"></i>
    <span id="duplicatePlanAlertText">已建立過該日期廠別的調度單</span>
</div>
```

---

### Task 2: 初始化新元件並綁定重設邏輯

**Files:**
- Modify: `d:/work/CPDS/index.html:480-540`
- Modify: `d:/work/CPDS/index.html:1120-1135`

**Interfaces:**
- Consumes: `#filterTargetDept`, `#filterStartTime`, `#filterEndTime`
- Produces: 
  - `fpFilterStartTime`, `fpFilterEndTime` (Flatpickr 實例)
  - `btnFilterReset` 點擊清空新元件

- [x] **Step 1: 在 `$(document).ready` 初始化目的廠 Select2 與篩選時間 Flatpickr**
```javascript
$('#filterTargetDept').select2({
    theme: 'bootstrap-5',
    width: '100%',
    language: 'zh-TW',
    allowClear: true,
    placeholder: '請選擇目的廠...'
});

const filterTimeConfig = {
    enableTime: true,
    noCalendar: true,
    dateFormat: "H:i",
    time_24hr: true,
    allowInput: true,
    minuteIncrement: 15
};
flatpickr("#filterStartTime", filterTimeConfig);
flatpickr("#filterEndTime", filterTimeConfig);
```

- [x] **Step 2: 更新 `btnFilterReset` 重設邏輯**
```javascript
$('#btnFilterReset').on('click', function () {
    $('#filterStartDate').val('');
    $('#filterEndDate').val('');
    $('#filterDept').val(null).trigger('change.select2');
    $('#filterTargetDept').val(null).trigger('change.select2');
    $('#filterStartTime').val('');
    $('#filterEndTime').val('');
    $('#filterKeyword').val('');
    applyMasterFilter();
});
```

---

### Task 3: 實作目的廠與調度時間過濾及動態摘要渲染

**Files:**
- Modify: `d:/work/CPDS/index.html:560-575` (`dispatchListTable` column formatter)
- Modify: `d:/work/CPDS/index.html:1130-1160` (`applyMasterFilter`)

**Interfaces:**
- Consumes: `masterDispatchList`, `#filterTargetDept`, `#filterStartTime`, `#filterEndTime`
- Produces: 
  - 動態過濾的 summary formatter
  - 支援多維度篩選的 `applyMasterFilter`

- [x] **Step 1: 實作時間重疊比對輔助函式 `isTimeRangeOverlap`**
```javascript
function isTimeRangeOverlap(s1, e1, s2, e2) {
    if (!s1 || !e1) return true;
    if (!s2 || !e2) return true;
    return (s1 < e2 && e1 > s2);
}
```

- [x] **Step 2: 更新 `summary` 欄位的 formatter 支援動態過濾**
```javascript
formatter: function (value, row) {
    if (!row.items || row.items.length === 0) return '<span class="text-muted">-</span>';
    
    const targetDepts = $('#filterTargetDept').val() || [];
    const filterStart = $('#filterStartTime').val().trim();
    const filterEnd = $('#filterEndTime').val().trim();

    // 依目的廠與調度時間進行動態篩選
    const displayedItems = row.items.filter(item => {
        if (targetDepts.length > 0 && !targetDepts.includes(item.targetDept)) {
            return false;
        }
        if (filterStart && filterEnd) {
            if (!isTimeRangeOverlap(item.startTime, item.endTime, filterStart, filterEnd)) {
                return false;
            }
        }
        return true;
    });

    if (displayedItems.length === 0) return '<span class="text-muted small">無符合條件之時段</span>';

    return displayedItems.map(item => {
        const empNames = item.employees.map(e => `[${e.id}] ${e.name}`).join(', ');
        return `<div class="small mb-1">
                <span class="badge bg-info text-dark me-1">${item.targetDept}</span>
                <span class="fw-semibold text-secondary me-1">(${item.startTime}~${item.endTime})</span>
                <span class="text-dark">${empNames}</span>
            </div>`;
    }).join('');
}
```

- [x] **Step 3: 更新 `applyMasterFilter` 進行多條件過濾**
```javascript
function applyMasterFilter() {
    const start = $('#filterStartDate').val().replace(/-/g, '/');
    const end = $('#filterEndDate').val().replace(/-/g, '/');
    const sourceDepts = $('#filterDept').val() || [];
    const targetDepts = $('#filterTargetDept').val() || [];
    const filterStart = $('#filterStartTime').val().trim();
    const filterEnd = $('#filterEndTime').val().trim();
    const kw = $('#filterKeyword').val().trim().toLowerCase();

    const filtered = masterDispatchList.filter(plan => {
        if (start && plan.dispatchDate < start) return false;
        if (end && plan.dispatchDate > end) return false;
        if (sourceDepts.length > 0 && !sourceDepts.includes(plan.sourceDept)) return false;

        // 目的廠篩選：此調度單是否有任一明細符合目的廠
        if (targetDepts.length > 0) {
            const hasTarget = plan.items.some(item => targetDepts.includes(item.targetDept));
            if (!hasTarget) return false;
        }

        // 調度時間篩選：此調度單是否有任一明細與查詢時段重疊
        if (filterStart && filterEnd) {
            const hasTimeMatch = plan.items.some(item => isTimeRangeOverlap(item.startTime, item.endTime, filterStart, filterEnd));
            if (!hasTimeMatch) return false;
        }

        // 關鍵字比對
        if (kw) {
            const matchPlan = plan.sourceDept.toLowerCase().includes(kw) || plan.dispatchDate.includes(kw);
            const matchItems = plan.items.some(item =>
                item.targetDept.toLowerCase().includes(kw) ||
                item.purpose.toLowerCase().includes(kw) ||
                item.employees.some(e => e.id.toLowerCase().includes(kw) || e.name.toLowerCase().includes(kw))
            );
            if (!matchPlan && !matchItems) return false;
        }
        return true;
    });

    $('#dispatchListTable').bootstrapTable('load', filtered);
}
```

---

### Task 4: 實作過去時間檢核函式並整合至新增/編輯明細

**Files:**
- Modify: `d:/work/CPDS/index.html:1030-1075`

**Interfaces:**
- Produces: `isPastDateTime(dateStr, timeStr)`
- Consumes: `#btnAddSubItem`, `#btnUpdateSubItem`

- [x] **Step 1: 實作 `isPastDateTime` 輔助函式**
```javascript
function isPastDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return false;
    const formattedDate = dateStr.replace(/\//g, '-');
    const targetDate = new Date(`${formattedDate}T${timeStr}:00`);
    const now = new Date();
    return targetDate < now;
}
```

- [x] **Step 2: 在 `#btnAddSubItem` 中阻擋過去時間**
```javascript
$('#btnAddSubItem').on('click', function () {
    const prevSelected = selectedSubItemSeq;
    selectedSubItemSeq = null;
    renderPersonnelChecklist($('#sourceDept').val(), getCheckedEmployees().map(e => e.id));

    const formData = validateAndReadForm();
    if (!formData) {
        selectedSubItemSeq = prevSelected;
        return;
    }

    if (isPastDateTime(formData.dispatchDate, formData.startTime)) {
        alert(`調度開始時間已過去 (${formData.dispatchDate} ${formData.startTime})，無法新增過去的明細！`);
        selectedSubItemSeq = prevSelected;
        return;
    }

    const newSeq = currentSubItems.length + 1;
    currentSubItems.push({
        seq: newSeq,
        ...formData
    });

    selectedSubItemSeq = null;
    refreshSubItemTable();
    renderPersonnelChecklist($('#sourceDept').val(), []);
});
```

- [x] **Step 3: 在 `#btnUpdateSubItem` 中阻擋過去時間**
```javascript
$('#btnUpdateSubItem').on('click', function () {
    if (selectedSubItemSeq === null) return;
    const formData = validateAndReadForm();
    if (!formData) return;

    if (isPastDateTime(formData.dispatchDate, formData.startTime)) {
        alert(`調度開始時間已過去 (${formData.dispatchDate} ${formData.startTime})，無法更新為過去的時間！`);
        return;
    }

    const idx = currentSubItems.findIndex(item => item.seq === selectedSubItemSeq);
    if (idx !== -1) {
        currentSubItems[idx] = {
            seq: selectedSubItemSeq,
            ...formData
        };
        refreshSubItemTable();
        renderPersonnelChecklist(formData.sourceDept, formData.employees.map(e => e.id));
    }
});
```

---

### Task 5: 實作各廠每日一調度單防呆（即時提示 + 送出阻擋）

**Files:**
- Modify: `d:/work/CPDS/index.html:1085-1120`
- Modify: `d:/work/CPDS/index.html:980-1010`

**Interfaces:**
- Produces: `checkDuplicatePlan(dateStr, sourceDept)`
- Consumes: `#btnSubmitPlan`, `#dispatchDate`, `#sourceDept`

- [x] **Step 1: 實作 `checkDuplicatePlan` 輔助函式與即時 UI 提示**
```javascript
function checkDuplicatePlan(dateStr, sourceDept) {
    if (!dateStr || !sourceDept) return null;
    const targetDate = dateStr.replace(/-/g, '/');
    return masterDispatchList.find(p => {
        if (editingPlanId && p.planId === editingPlanId) return false;
        return p.dispatchDate === targetDate && p.sourceDept === sourceDept;
    });
}

function updateDuplicatePlanAlert() {
    const curDate = $('#dispatchDate').val();
    const curDept = $('#sourceDept').val();
    const dup = checkDuplicatePlan(curDate, curDept);
    if (dup) {
        const displayDate = curDate.replace(/-/g, '/');
        $('#duplicatePlanAlertText').text(`已建立過 ${displayDate} ${curDept} 的調度單`);
        $('#duplicatePlanAlert').removeClass('d-none');
    } else {
        $('#duplicatePlanAlert').addClass('d-none');
    }
}
```

- [x] **Step 2: 在日期與來源廠變更、切換模式時連動 `updateDuplicatePlanAlert`**
- 於 `#dispatchDate, #sourceDept` 綁定 `change` 事件時呼叫 `updateDuplicatePlanAlert()`。
- 於 `loadPlanToEditor` 與 `resetToCreateMode` 中呼叫 `updateDuplicatePlanAlert()`。

- [x] **Step 3: 在 `#btnSubmitPlan` 中阻擋重複建立**
```javascript
$('#btnSubmitPlan').on('click', function () {
    if (currentSubItems.length === 0) {
        alert('請至少新增一筆支援調度明細後再儲存送出！');
        return;
    }

    const mainDate = currentSubItems[0].dispatchDate;
    const mainSource = currentSubItems[0].sourceDept;

    const dup = checkDuplicatePlan(mainDate, mainSource);
    if (dup) {
        alert(`已建立過 ${mainDate} ${mainSource} 的調度單`);
        return;
    }

    if (editingPlanId) {
        const idx = masterDispatchList.findIndex(p => p.planId === editingPlanId);
        if (idx !== -1) {
            masterDispatchList[idx].dispatchDate = mainDate;
            masterDispatchList[idx].sourceDept = mainSource;
            masterDispatchList[idx].items = JSON.parse(JSON.stringify(currentSubItems));
        }
        alert('支援調度單更新成功！');
    } else {
        const newPlanId = 'DP-' + Date.now();
        masterDispatchList.unshift({
            planId: newPlanId,
            dispatchDate: mainDate,
            sourceDept: mainSource,
            editable: true,
            items: JSON.parse(JSON.stringify(currentSubItems))
        });
        alert('支援調度單新增成功！');
    }

    applyMasterFilter();
    resetToCreateMode();
});
```

---

### Task 6: 驗證各項功能與邊界條件

**Files:**
- Verify: `d:/work/CPDS/index.html`

- [x] **Step 1: 驗證目的廠多選篩選**
- [x] **Step 2: 驗證單獨篩選目的廠時，表格摘要只顯示該目的廠單筆明細**
- [x] **Step 3: 驗證調度時間起訖篩選**
- [x] **Step 4: 驗證過去時間新增/修改阻擋**
- [x] **Step 5: 驗證各廠每日僅能新增一單之即時警示與送出阻擋**
