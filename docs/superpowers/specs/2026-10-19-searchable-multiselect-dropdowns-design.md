# 查詢篩選條件「搜尋 + 可多選」下拉選單設計規範

- **日期**：2026-10-19
- **目標頁面**：`index_BPM.html`、`index_final.html`、`report.html`
- **套件技術**：Select2 4.1.0-rc.0 + select2-bootstrap-5-theme 1.3.0 + jQuery 3.7.1

---

## 1. 概述與需求

在以下三個頁面的查詢篩選條件區塊中，將原本單選的 `<select>` 下拉選單改造為具備「關鍵字輸入搜尋」與「核取多選標籤 (Tags)」之功能：

1. **`index_BPM.html`**：
   - 來源廠（`#filterDept`）
2. **`index_final.html`**：
   - 來源廠（`#filterDept`）
3. **`report.html`**：
   - 來源廠（`#filterFromPlant`）
   - 目的廠（`#filterToPlant`）
   - 狀態（`#filterStatus`）

---

## 2. 外部資源引進 (CDN)

所有頁面需引入以下依賴（若頁面中尚未載入）：
- **jQuery**（若尚未載入，如 `index_final.html`）：
  ```html
  <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
  ```
- **Select2 CSS**：
  ```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/select2-bootstrap-5-theme@1.3.0/dist/select2-bootstrap-5-theme.min.css">
  ```
- **Select2 JS**：
  ```html
  <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
  ```

---

## 3. 各頁面改造細節

### 3.1 `report.html`
- **HTML 結構**：
  - 將 `#filterFromPlant`、`#filterToPlant`、`#filterStatus` 加入 `multiple="multiple"`。
  - 移除靜態佔位的 `<option value="">全部</option>` / `<option value="">全部狀態</option>`。
  - 設定 `data-placeholder` 分別為：「請選擇來源廠...」、「請選擇目的廠...」、「請選擇狀態...」。
- **JavaScript 邏輯**：
  - 初始化：
    ```javascript
    $('#filterFromPlant, #filterToPlant, #filterStatus').select2({
      theme: 'bootstrap-5',
      width: '100%',
      allowClear: true,
      placeholder: function() { return $(this).data('placeholder'); }
    }).on('change', function() {
      applyReportFilters();
    });
    ```
  - 篩選比對（`applyReportFilters`）：
    ```javascript
    const fromPlants = $('#filterFromPlant').val() || [];
    const toPlants = $('#filterToPlant').val() || [];
    const statuses = $('#filterStatus').val() || [];

    if (fromPlants.length > 0 && !fromPlants.includes(item.fromPlant)) return false;
    if (toPlants.length > 0 && !toPlants.includes(item.toPlant)) return false;
    if (statuses.length > 0 && !statuses.includes(itemStatus)) return false;
    ```
  - 清空重設（`resetFilters`）：
    ```javascript
    $('#filterFromPlant, #filterToPlant, #filterStatus').val(null).trigger('change');
    ```

### 3.2 `index_BPM.html`
- **HTML 結構**：
  - 將 `#filterDept` 改為：
    ```html
    <select class="form-select form-select-sm" id="filterDept" multiple="multiple" data-placeholder="請選擇來源廠 (可多選)...">
      <option value="A5-1廠">A5-1廠</option>
      <option value="A5-2廠">A5-2廠</option>
      <option value="A5-3廠">A5-3廠</option>
    </select>
    ```
- **JavaScript 邏輯**：
  - 初始化：
    ```javascript
    $('#filterDept').select2({
      theme: 'bootstrap-5',
      width: '100%',
      allowClear: true,
      placeholder: '請選擇來源廠 (可多選)...'
    });
    ```
  - 篩選比對（`applyMasterFilter`）：
    ```javascript
    const depts = $('#filterDept').val() || [];
    if (depts.length > 0 && !depts.includes(plan.sourceDept)) return false;
    ```
  - 重設清空：
    ```javascript
    $('#filterDept').val(null).trigger('change');
    ```

### 3.3 `index_final.html`
- **HTML 結構**：
  - 在 `<head>` 引入 Select2 CSS 與 Bootstrap 5 主題。
  - 在 `<body>` 底部依序引入 jQuery、Select2 JS。
  - 將 `#filterDept` 標籤改為：
    ```html
    <select class="form-select" id="filterDept" multiple="multiple" data-placeholder="請選擇來源廠 (可多選)..."></select>
    ```
- **JavaScript 邏輯**：
  - 動態載入廠區列表後更新 Select2：
    ```javascript
    elFilterDept.innerHTML = '';
    factoryNames.forEach(name => {
      elFilterDept.add(new Option(name, name));
    });
    $('#filterDept').select2({
      theme: 'bootstrap-5',
      width: '100%',
      allowClear: true,
      placeholder: '請選擇來源廠 (可多選)...'
    });
    ```
  - 查詢按鈕篩選比對（`elBtnFilterQuery`）：
    ```javascript
    const selectedDepts = $('#filterDept').val() || [];
    if (selectedDepts.length > 0) {
      const match = selectedDepts.some(dept => 
        item.sourceDeptName === dept || (item.sourceDeptName && item.sourceDeptName.includes(dept))
      );
      if (!match) return false;
    }
    ```
  - 重設按鈕清空（`elBtnFilterReset`）：
    ```javascript
    $('#filterDept').val(null).trigger('change');
    ```

---

## 4. 驗證標準
1. 在三個頁面開啟時，篩選下拉皆正常渲染為 Select2 Bootstrap 5 風格。
2. 點擊輸入框可鍵盤即時過濾選項。
3. 支援點選多個選項並呈現標籤；點擊標籤上的 `x` 或總清除按鈕可移除選取。
4. 篩選時支援多條件（OR 邏輯），未選任何項目時顯示全部資料。
5. 點擊重設按鈕能清空所有選取的項目並重新載入完整清單。
