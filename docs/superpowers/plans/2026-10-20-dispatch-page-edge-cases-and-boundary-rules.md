# 支援調度頁面 (index.html) 功能邊界與情境防呆實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依據最新確認之功能邊界與防呆規則，全面優化 `index.html` 與後端組織 API，包含：SQL 條件括號修正、查詢預設明日日期、列表隱藏單號、動作按鈕未來/當天/過去三態切換、來源與目的廠動態互斥排除、當日時間動態預設、明細級別過期鎖定、已簽到資料保護，以及純檢視模式。

**Architecture:**
1. 後端 `server.js` 與 `routes/dispatch.js`：修正 `/api/departments` SQL 運算子優先級，補充已簽到防護檢核。
2. 前端 `index.html`：
   - 列表欄位調整（隱藏單號、動作欄位三態渲染：未來 [編輯/刪除]、當天 [編輯，無過期時段才顯示刪除]、過去 [檢視]）。
   - 下拉連動互斥：來源廠變更時動態過濾目的廠選項。
   - 動態時間管理：選擇今天時，調度起時自動跳至下一個整點/半點，阻擋建立與修改過去時間。
   - 時段級別鎖定：當天單據編輯時，過期時段明細鎖定不可改不可刪，未過期時段正常操作。
   - 唯讀檢視模式：點擊「檢視」完整呈現唯讀狀態與關閉檢視返回按鈕。

**Tech Stack:** Node.js (Express), MSSQL LocalDB, HTML5, Bootstrap 5.3, Bootstrap Table 1.22, Flatpickr, Select2, jQuery 3.7.

## Global Constraints
- 前端嚴格維持 No-Build / Zero-Build Pipeline（純原生 HTML/JS）。
- 嚴格遵守調度排程邊界：
  - 各廠每天僅能建立一單。
  - 同一人同日僅能被調派一次（若已被排在單內其他時段或其他單據，強制鎖定顯示警示）。
  - 起訖時段限同一天（00:00~23:59），不支援跨日班次。
  - 嚴格禁止建立、更新、刪除過去日期時間的資料。
  - 若現場已有同仁簽到 (`CheckInStatus IN (1, 2)`)，受保護禁止刪除該時段或調度單。

---

### Task 1: 後端 `/api/departments` SQL 條件括號修正與廠別標準化

**Files:**
- Modify: `server.js`
- Test: `scripts/verify_departments_sql.js`

**Interfaces:**
- Produces: 正確套用 `AND (...)` 括號之部門清單，確保僅回傳 `isMain = 1` 且代號開頭為 JMA/JMB 或等於 JW001/JL001 之有效組織單位。

- [ ] **Step 1: 修正 `server.js` 中的 `/api/departments` 與 `/api/department-names` 查詢**
修正括號以符合 SQL 運算子優先順序：
```sql
WHERE Functions.isMain = 1 
  AND OrganizationUnit.organizationUnitType = 0 
  AND (
      OrganizationUnit.id LIKE 'JMA%' 
      OR OrganizationUnit.id LIKE 'JMB%' 
      OR OrganizationUnit.id IN ('JW001', 'JL001')
  )
```
確保備援清單完整包含 16 個標準廠別：
`'A12-1廠', 'A12-2廠', 'A12-3廠', 'A5-1廠', 'A5-2廠', 'A7廠', 'B10-1廠', 'B10-2廠', 'B10-3廠', 'B11廠', 'B4廠', 'C1廠', 'ED廠', 'F1廠', '工程部', '物流部'`。

- [ ] **Step 2: 撰寫檢核腳本 `scripts/verify_departments_sql.js`**
驗證 `/api/departments` 正確回傳且無重複、無無效組織。

---

### Task 2: 查詢列表優化（隱藏單號、預設明日、動作按鈕三態顯示）

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 查詢條件預設起訖日改為「今天 + 1 天（明日）」**
```javascript
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = formatDate(tomorrow);
$('#filterStartDate').val(tomorrowStr);
$('#filterEndDate').val(tomorrowStr);
```

- [ ] **Step 2: 列表清單隱藏「單號」欄位**
移除 `#dispatchListTable` 中 `field: 'planNo'` 的可見欄位，或設定 `visible: false`。

- [ ] **Step 3: 實作動作欄位（操作）三態按鈕邏輯**
依據 `row.dispatchDate` 與明細時段：
- **未來日期 (`row.dispatchDate > today`)**：顯示 `[編輯]`、`[刪除]`。
- **當天日期 (`row.dispatchDate === today`)**：
  - 顯示 `[編輯]`。
  - 檢視 `row.items` 中是否有任何時段之 `startTime <= currentTime`（已開始/過去）。若**無任何過去時段**，顯示 `[刪除]`；若**已有過去時段**，隱藏 `[刪除]`。
- **過去日期 (`row.dispatchDate < today`)**：僅顯示 `[檢視]`（鎖定不可修改）。

---

### Task 3: 表單來源廠與目的廠相互動態排除（同廠互斥）

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 實作目的廠動態過濾**
當 `#sourceDept` 變更時：
1. 取得當前選定的來源廠代碼與文字。
2. 重新產生 `#targetDept` 的 `<option>` 清單，將與來源廠相同者排除（不渲染或設為 disabled）。
3. 若目前 `#targetDept` 的選取值恰巧等於來源廠，重置為空。
4. 觸發 Select2 更新。

- [ ] **Step 2: 前端送出與驗證防呆**
在 `validateAndReadForm()` 中確保若 `sourceDeptId === targetDeptId`，彈出提示「不支援同廠支援調度！」並阻擋送出。

---

### Task 4: 調度時間預設與「過去時間」防呆檢核

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 新增模式下的時間預設邏輯**
監聽 `#dispatchDate` 變更：
- 若日期為**未來日期**（> 今日）：預設起訖為 `08:00 ~ 17:00`。
- 若日期為**當天日期**（=== 今日）：
  - 取得當前時間 `now`。
  - 若 `now < 08:00`：預設 `08:00 ~ 17:00`。
  - 若 `08:00 <= now < 17:00`：將起始時間設為「下一個整點/半點」（例如 14:15 ➔ 15:00），結束時間預設為 `17:00`（若已滿 16:30 則設為 17:30 或 18:00）。
  - 若 `now >= 17:00`：起始時間設為下一個半點，結束時間預設為 `23:59`。

- [ ] **Step 2: 嚴格禁止建立/修改過去時間與跨日檢核**
在加入時段與送出前：
1. 若 `dispatchDate < today`：阻擋「不可建立過去日期的調度單據」。
2. 若 `dispatchDate === today` 且 `startTime <= currentTime`：阻擋「調度開始時間已過去 (${dispatchDate} ${startTime})，無法建立為過去的時間！」。
3. 若 `startTime >= endTime`：阻擋「結束時間必須大於開始時間，且本系統不支援跨日班次！」。

---

### Task 5: 當日單據編輯時的明細級別鎖定與已簽到防護

**Files:**
- Modify: `index.html`
- Modify: `routes/dispatch.js`

- [ ] **Step 1: 當日單據明細級別（Item-level）鎖定**
在編輯當日單據點選下方子時段時：
- 比對該時段之 `startTime`：
  - 若 `row.dispatchDate === today` 且 `row.startTime <= currentTime`：
    - 右側時段編輯區提示警示條「此時段已過或進行中，僅供查閱不可修改/刪除」。
    - 停用「修改時段」與「刪除時段」按鈕。
    - 表單欄位設為唯讀。
  - 若尚未開始（`row.startTime > currentTime`）：正常開放修改與刪除。

- [ ] **Step 2: 現場已簽到資料防護**
後端 `routes/dispatch.js` 與前端：
- 在刪除整單或刪除/變更時段時，查詢關聯的 Detail 是否有 `CheckInStatus IN (1, 2)`。
- 若已有簽到同仁，拒絕刪除並回傳：`現場同仁已有簽到紀錄，無法取消或刪除此調度時段！`。

---

### Task 6: 同廠同日重複建單即時黃底警示與純檢視模式完備

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 即時黃底醒目提示**
當使用者切換 `#dispatchDate` 或 `#sourceDept` 時，即時比對是否已有當日同廠有效單據。
若有，在表單頂端立即顯示黃底 Alert：`已建立過 [調度日期] + [廠別] 的調度單`（不帶按鈕）。送出時若仍重複則阻擋。

- [ ] **Step 2: 純檢視模式 (View Only Mode) 介面完備**
點擊列表「檢視」按鈕進入：
1. 鎖定表單所有欄位（日期、來源廠、目的廠、時間、用途、人員 Checkbox 全部 disabled）。
2. 隱藏「加入時段」、「修改時段」、「刪除時段」、「儲存調度單」按鈕。
3. 表單標頭顯示「檢視支援調度（唯讀鎖定）」，右上角顯示「關閉檢視」按鈕。
4. 點擊「關閉檢視」按鈕恢復新增模式並清空表單。

---

### Task 7: 綜合驗證與整合測試

**Files:**
- Test: `scripts/verify_edge_cases.js`

- [ ] **Step 1: 建立驗證腳本覆蓋所有邊界情境**
- [ ] **Step 2: 執行自動化測試並手動確認介面流暢度**
