# 支援調度單編輯器人員指派與明細連動功能設計規格 (Dispatch Editor Personnel Assignment Design Spec)

## 1. 背景與需求概述 (Background & Requirements)

在目前系統 (`CPDS/index.html`) 中，使用者在編輯調度單及操作子明細時回報以下問題與期望行為：
1. **點擊編輯時呈現已被指派狀態**：
   點擊支援調度單的「編輯」按鈕時，人員清單中應清楚呈現該調度單中所有已經被指派同仁的目標廠別與時段標籤（如 `[已被指派到 A5-2廠 10:00~11:00]`），並處於鎖定（disabled）狀態。
2. **點擊下方子明細列倒回勾選資料**：
   當使用者點選下方明細清單（`#subItemTable`）中的任一筆資料列時，表單欄位（目的廠、調度時間、用途）自動帶入該筆資料，且該筆明細中的同仁解除鎖定並倒回勾選（checked: true）；其餘子明細的同仁則維持標示已被指派並維持鎖定。
3. **取消選取（Toggle Off）**：
   若使用者再次點擊當前已選取之明細列，則取消該列的選取狀態，表單目的廠與用途清空，人員清單中所有明細同仁恢復鎖定與已被指派標籤顯示。

---

## 2. 現況問題根因分析 (Root Cause Analysis)

1. **`loadPlanToEditor` 強制預設選中第一筆子明細**：
   - 原始程式碼在進入編輯時執行 `selectedSubItemSeq = currentSubItems.length > 0 ? 1 : null;` 並直接呼叫 `populateFormFromSubItem(currentSubItems[0]);`。
   - 這導致進入編輯時預設載入了第 1 筆明細，但明細表格列上並無 `.selected-row` 高亮樣式，且無法讓使用者一覽整張單據所有已被佔用的人員。
2. **`getEmployeeConflictInfo` 時間重疊判斷限制**：
   - 檢查 `currentSubItems` 時使用了 `isTimeOverlap(formStart, formEnd, item.startTime, item.endTime)`。
   - 當表單時間設定為 10:00~11:00（第 1 筆）時，第 2 筆（15:00~17:00）的同仁因時間不重疊，未能被標記為衝突，導致其在人員清單中看起來像未指派人員。
3. **取消選取時表單欄位未完整重置**：
   - 在明細表格點擊相同列取消選取時，僅清空 `selectedSubItemSeq = null`，未清空目的廠與用途，造成介面混淆。

---

## 3. 系統設計與行為規範 (System Design & Behavioral Rules)

### 3.1 狀態定義與資料流
- `editingPlanId`: 當前正在編輯的主調度單編號（若為 null 則為新增主調度單模式）。
- `currentSubItems`: 當前主調度單之子明細陣列。
- `selectedSubItemSeq`: 當前選中的子明細順序序號（null 表示未選中任何明細列）。

### 3.2 衝突與已指派判定邏輯 (`getEmployeeConflictInfo`)
對於指定員工 `emp`：
1. **外部預先調派 (`externalAssigned`)**：
   - 若同日期且未指定子項目 (`selectedSubItemSeq === null`) 或時段重疊，判定為衝突，回傳外部指派資訊。
2. **其他主檔調度單據 (`masterDispatchList`)**：
   - 排除 `editingPlanId`。
   - 若同日期且未指定子項目或時段重疊，且包含該員工，判定為衝突。
3. **當前單據子明細 (`currentSubItems`)**：
   - 若 `selectedSubItemSeq !== null && item.seq === selectedSubItemSeq`，略過該列（允許正在編輯該列時反向勾選與編輯）。
   - 若為其他子明細列（`item.seq !== selectedSubItemSeq`），只要同日期且該員工存在於該明細中，即判定為已被指派：
     回傳 `{ targetDept: item.targetDept, startTime: item.startTime, endTime: item.endTime }`。

### 3.3 編輯器載入行為 (`loadPlanToEditor`)
1. 設定 `selectedSubItemSeq = null`。
2. 清空表單非主單共通欄位（`#targetDept` 設為空字串、`#purpose` 設為空字串，時間設為預設）。
3. 呼叫 `renderPersonnelChecklist(plan.sourceDept, [])`：
   - 由於 `selectedSubItemSeq === null`，所有子明細之同仁皆會回傳衝突資訊，顯示 `[已被指派到 <targetDept> <startTime>~<endTime>]` 並 disabled。
4. 呼叫 `refreshSubItemTable()`，表格無選取列。
5. 呼叫 `updateSubActionButtonsState()`：「新增子明細」啟用，「修改子明細」與「刪除子明細」禁用。

### 3.4 明細表格點擊連動 (`onClickRow`)
1. **點選未選取列 (row.seq !== selectedSubItemSeq)**：
   - 設定 `selectedSubItemSeq = row.seq`。
   - 表格當前列加上 `.selected-row` 高亮樣式。
   - 呼叫 `populateFormFromSubItem(row)`：
     - 回填調度起訖時間、目的廠、用途。
     - 傳入 `row.employees.map(e => e.id)` 至 `renderPersonnelChecklist`。
     - 該列同仁：解除衝突鎖定並打勾 (`checked: true`)。
     - 其他列同仁：維持鎖定並呈現其指派廠別與時段 Badge。
   - 呼叫 `updateSubActionButtonsState()`：「修改」與「刪除」啟用。
2. **點選已選取列 (row.seq === selectedSubItemSeq，取消選取)**：
   - 設定 `selectedSubItemSeq = null`。
   - 移除表格中所有列的 `.selected-row`。
   - 清空 `#targetDept` 與 `#purpose`。
   - 呼叫 `renderPersonnelChecklist($('#sourceDept').val(), [])`：
     - 所有子明細同仁皆恢復鎖定並顯示其已被指派的廠別時段。
     - 清空所有勾選。
   - 呼叫 `updateSubActionButtonsState()`：「修改」與「刪除」禁用。

---

## 4. 驗證情境 (Verification Scenarios)

1. **情境一：點擊主單據「編輯」**
   - 進入編輯模式後，下方表格無選取高亮列。
   - 人員清單中，DP-20261016-01 的明細同仁：
     - [JM10069] 陳家羚、[JM10099] 張秀燕 標示「已被指派到 A5-2廠 10:00~11:00」且 disabled、unchecked。
     - [JM10206] 江佩芬、[JM10179] 莊麗勤 標示「已被指派到 A5-3廠 15:00~17:00」且 disabled、unchecked。
     - 其餘人員為可選取狀態且無指派標籤。
2. **情境二：點選第 1 筆明細列 (A5-2廠 10:00~11:00)**
   - 表格第 1 列高亮。
   - 表單目的廠回填 A5-2廠、時間回填 10:00~11:00、用途回填「測試」。
   - 陳家羚、張秀燕 解除鎖定並打勾 (checked)。
   - 江佩芬、莊麗勤 維持鎖定並標示「已被指派到 A5-3廠 15:00~17:00」。
3. **情境三：點選第 2 筆明細列 (A5-3廠 15:00~17:00)**
   - 表格第 2 列高亮，第 1 列取消高亮。
   - 表單目的廠回填 A5-3廠、時間回填 15:00~17:00、用途回填「測試A」。
   - 江佩芬、莊麗勤 解除鎖定並打勾 (checked)。
   - 陳家羚、張秀燕 恢復鎖定並標示「已被指派到 A5-2廠 10:00~11:00」。
4. **情境四：再次點選第 2 筆明細列 (取消選取)**
   - 表格第 2 列取消高亮。
   - 目的廠與用途清空。
   - 4 位明細同仁全部恢復鎖定並標示已被指派，勾選清空。
