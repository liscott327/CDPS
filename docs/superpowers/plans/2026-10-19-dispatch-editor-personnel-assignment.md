# 支援調度單編輯器人員指派與明細連動實作計畫 (Dispatch Editor Personnel Assignment Implementation Plan)

## 任務目標
在 `CPDS/index.html` 中實作：
1. 點擊編輯主調度單時，人員清單完整呈現所有已被指派的廠別與時段並鎖定。
2. 點擊下方任一子明細時，回填表單並將該筆明細之人員解除鎖定並倒回勾選，其餘人員維持鎖定與指派標示。
3. 再次點擊已選取之子明細列時，取消選取並重置回全部鎖定與指派標籤顯示。

---

## 執行步驟

### Task 1: 調整 `getEmployeeConflictInfo` 衝突判定邏輯
- **檔案**：`CPDS/index.html` (約第 781-838 行)
- **變更點**：
  1. 對於 `currentSubItems`：只要 `item.seq !== selectedSubItemSeq` 且 `item.dispatchDate === formDate`，若員工已存在於該明細中，即回傳指派資訊 `{ targetDept: item.targetDept, startTime: item.startTime, endTime: item.endTime }`。
  2. 當 `selectedSubItemSeq === null` 時，外部預調派 (`externalAssigned`) 及其他調度單 (`masterDispatchList`) 之同日調派皆視為衝突。

### Task 2: 調整 `loadPlanToEditor` 與初始化設定
- **檔案**：`CPDS/index.html` (約第 1003-1039 行及 HTML 預設值)
- **變更點**：
  1. 將 `selectedSubItemSeq` 設為 `null`（不預先選取第 1 筆）。
  2. 清空 `#targetDept` 與 `#purpose`，重置時間選單。
  3. 呼叫 `renderPersonnelChecklist(plan.sourceDept, [])`，使所有同仁呈現指派鎖定。
  4. 呼叫 `refreshSubItemTable()` 與 `updateSubActionButtonsState()`。
  5. 調整 HTML 表單 `#targetDept` 預設為空選項、`#purpose` 預設為空字串。

### Task 3: 完善 `initSubItemTable` 之 `onClickRow` 連動
- **檔案**：`CPDS/index.html` (約第 752-768 行)
- **變更點**：
  1. 當點選未選取列時：設定 `selectedSubItemSeq = row.seq`，加上 `.selected-row`，呼叫 `populateFormFromSubItem(row)`。
  2. 當點選已選取列（取消選取）時：設定 `selectedSubItemSeq = null`，移除 `.selected-row`，清空 `#targetDept` 與 `#purpose`，呼叫 `renderPersonnelChecklist($('#sourceDept').val(), [])`，呼叫 `updateSubActionButtonsState()`。

### Task 4: 測試腳本撰寫與邏輯驗證
- **腳本**：`scratch/verify_editor_assignment.js`
- **驗證項目**：
  - 進入編輯模式時，4 位同仁是否全部處於衝突鎖定狀態並標有各別廠別與時段。
  - 點選 Seq 1 時，陳家羚與張秀燕是否解除鎖定並勾選，江佩芬與莊麗勤是否維持鎖定標示。
  - 點選 Seq 2 時，江佩芬與莊麗勤是否解除鎖定並勾選，陳家羚與張秀燕是否維持鎖定標示。
  - 取消選取 Seq 2 時，是否恢復為全部鎖定標示。
  - 既有回歸測試 (`scratch/verify_all.js`) 通過。

### Task 5: 程式碼庫記憶庫同步 (Codebase Memory MCP)
- 透過 codebase-memory MCP 偵測變更並更新索引。
