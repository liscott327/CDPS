# 人員跨廠支援調度單 (index.html) CRUD 與分組編輯規格設計書

**建立日期**：2026-10-13  
**系統模組**：跨廠人員調度與簽到系統 (CPDS)  
**目標檔案**：
- 前端：`D:\work\CPDS\index.html`
- 後端：`D:\work\CPDS\server.js`

---

## 1. 需求與目標概述

本功能旨在完善 `index.html` 跨廠調度單的資料生命週期管理與互動體驗，核心包含：
1. **調度單列表查詢與呈現**：
   - 預設顯示調度日期為當天至未來（`DispatchDate >= 今日`）的正常資料（排除軟刪除）。
   - 表格滾動容器高度限制為約 10 筆資料高度（約 480px），表頭 `sticky-top` 固定。
   - 提供「檢視」、「編輯」與「軟刪除」操作。
2. **調度單表單共用與狀態切換**：
   - 支援「新增」與「編輯」雙狀態切換。
   - 點擊列表「編輯」時，透過 API 取得調度單明細 JSON，回填表單並更新標題與送出按鈕。
   - 列表與表單區塊均提供切換回「新增模式」的觸發按鈕。
   - 點擊「刪除」時跳出確認對話框，經確認後發送軟刪除請求，列表中不再顯示。
3. **任務分組編輯與倒回機制**：
   - 分組清單卡片支援「編輯此組」功能。
   - 點擊「編輯此組」時暫存備份並移出當前清單，將目的廠、用途及同仁勾選倒回至「挑選支援人員與目的廠」表單中。
   - 提供「確認更新本組」與「取消」；取消時自動原樣還原該組資料。
4. **全端 JSON 資料規格**：
   - 前端表單與後端 API 間皆採用結構化 JSON 通訊。

---

## 2. 後端 RESTful API 規格 (server.js)

後端依據資料庫連線狀態支援 **MSSQL 資料庫 (CustCPDSDispatchPlan_Master / Detail)** 與 **記憶體備援 Mock 模式** 雙軌運作。

### 2.1 API 列表

| HTTP 方法 | 路徑 | 功能說明 | 備註 |
|---|---|---|---|
| `GET` | `/api/dispatch-plans` | 查詢調度單清單 | 支援 `startDate`, `endDate`, `dept`, `keyword` 篩選；排除 `PlanStatus = 0` |
| `GET` | `/api/dispatch-plans/:planNo` | 取得單筆調度單明細與任務分組 JSON | 回傳階層式群組與同仁陣列 |
| `POST` | `/api/dispatch-plans` | 新增調度單及明細群組 | 自動產生單號 `DP` + 8碼，預設 `PlanStatus = 1` |
| `PUT` | `/api/dispatch-plans/:planNo` | 更新調度單主檔及明細群組 | 更新主檔、替換舊明細為新群組資料 |
| `DELETE` | `/api/dispatch-plans/:planNo` | 軟刪除調度單 | 將 `PlanStatus` 更新為 `0`，保留歷史軌跡 |

### 2.2 API 資料結構範例

#### 2.2.1 `GET /api/dispatch-plans` 回傳範例
```json
{
  "success": true,
  "data": [
    {
      "planId": "DP2026101301",
      "dispatchDate": "2026-10-13",
      "sourceDeptId": "A5-1廠",
      "sourceDeptName": "A5-1廠",
      "memo": "機台緊急支援",
      "totalCount": 2,
      "targetSummary": "B10-1廠 [李奕諴, 王大明]",
      "status": "已排定"
    }
  ]
}
```

#### 2.2.2 `GET /api/dispatch-plans/:planNo` 回傳範例
```json
{
  "success": true,
  "data": {
    "planId": "DP2026101301",
    "dispatchDate": "2026-10-13",
    "sourceDeptId": "A5-1廠",
    "sourceDeptName": "A5-1廠",
    "memo": "機台緊急支援",
    "groups": [
      {
        "id": "grp_1728800000000",
        "targetDeptId": "B10-1廠",
        "targetDeptName": "B10-1廠",
        "purpose": "產線支援",
        "employees": [
          { "empId": "JM30448", "name": "李奕諴" },
          { "empId": "A0123", "name": "王大明" }
        ]
      }
    ]
  }
}
```

#### 2.2.3 `POST` / `PUT` 請求 Body 範例
```json
{
  "dispatchDate": "2026-10-13",
  "sourceDept": "A5-1廠",
  "memo": "機台趕工支援",
  "groups": [
    {
      "targetDeptId": "B10-1廠",
      "targetDeptName": "B10-1廠",
      "purpose": "機台異常趕工支援",
      "employees": [
        { "empId": "JM30448", "name": "李奕諴" }
      ]
    }
  ]
}
```

---

## 3. 前端 UI 與互動邏輯設計 (index.html)

### 3.1 列表預設條件與高度限制
- 頁面載入時：
  - `filterStartDate` 預設賦值為今日日期字串（`YYYY-MM-DD`）。
  - 表格外層 `.table-responsive` 樣式設定 `max-height: 480px; overflow-y: auto;`。
  - 表頭維持 `sticky-top bg-light`，超過 10 筆時內部滾動，確保排版穩定。
  - 呼叫 `loadDispatchTable()` 發送 `GET /api/dispatch-plans?startDate=today` 取得清單。

### 3.2 表單新增 / 編輯模式狀態機
- 定義全域狀態：
  - `currentFormMode`: `'CREATE'` 或 `'EDIT'`。
  - `currentEditingPlanNo`: 當前編輯的單號字串，若在新增模式則為 `null`。
- **模式切換函式 `setFormMode(mode, planNo = null)`**：
  - **`'CREATE'` (新增模式)**：
    - 表單卡片標題：「<i class="bi bi-plus-circle-fill text-success me-2"></i>新增人員跨廠支援調度單」
    - 隱藏卡片標題列的「取消編輯」按鈕。
    - 送出按鈕樣式：「<i class="bi bi-send-fill me-1"></i> 儲存並送出調度單」（`btn-success`）。
    - 重置欄位：調度日期重設為今日、來源廠保留登入者預設廠別、備註清空、`dispatchGroups = []`。
  - **`'EDIT'` (編輯模式)**：
    - 表單卡片標題：「<i class="bi bi-pencil-square text-warning me-2"></i>編輯人員跨廠支援調度單 [${planNo}]」
    - 顯示卡片標題列的「<i class="bi bi-x-circle me-1"></i>取消編輯 / 回到新增」按鈕。
    - 送出按鈕樣式：「<i class="bi bi-check2-circle me-1"></i> 確認更新調度單」（`btn-warning`）。

### 3.3 列表操作按鈕處理
1. **「新增調度單」按鈕**：
   - 於上半部查詢卡片標題列右側新增「<i class="bi bi-plus-lg me-1"></i>新增調度單」按鈕。
   - 點擊後執行 `setFormMode('CREATE')` 並捲動至下方表單。
2. **「編輯」按鈕 (`editRecord(planId)`)**：
   - 發送 `GET /api/dispatch-plans/${planId}`。
   - 取得 JSON 資料後執行 `setFormMode('EDIT', planId)`。
   - 回填主檔（日期、來源廠、備註）。
   - 回填 `dispatchGroups`，並呼叫 `renderGroups()` 渲染群組卡片。
   - 捲動至表單區塊。
3. **「刪除」按鈕 (`deleteRecord(planId)`)**：
   - 提示：`if (confirm(`確定要刪除調度單 [${planId}] 嗎？`))`
   - 使用者確認後發送 `DELETE /api/dispatch-plans/${planId}`。
   - 成功後提示刪除成功，並重新載入列表資料。

### 3.4 任務分組編輯與倒回/還原機制
- 全域變數：`editingGroupBackup = null`（暫存群組備份）。
- **觸發「編輯此組」 (`editGroup(groupId)`)**：
  1. 尋找該群組物件，深度複製至 `editingGroupBackup`。
  2. 從 `dispatchGroups` 移除該群組（釋放已選同仁）。
  3. 呼叫 `renderGroups()` 更新群組卡片與已選總人數。
  4. 展開 `#inlineGroupForm` 內嵌表單，捲動至該表單。
  5. 內嵌表單標題切換為：「<i class="bi bi-pencil-square me-1"></i>編輯支援任務群組」。
  6. 回填目的廠 `elTargetDept`、用途 `groupPurpose`。
  7. 呼叫 `renderPersonnelCheckboxes()` 載入同仁清單，並依據 `editingGroupBackup.employees` 自動勾選。
  8. 按鈕「確認加入本組」更換文字為「確認更新本組」。
- **點擊「確認更新本組」**：
  1. 驗證目的廠與同仁勾選（至少 1 人）。
  2. 封裝新群組物件，保留 `id: editingGroupBackup.id`，放入 `dispatchGroups`。
  3. 重置 `editingGroupBackup = null`，關閉內嵌表單，呼叫 `renderGroups()`。
- **點擊「取消」 (`btnCancelGroup`)**：
  1. 若 `editingGroupBackup` 不為空，將備份群組重新放回 `dispatchGroups.push(editingGroupBackup)`。
  2. 重置 `editingGroupBackup = null`。
  3. 關閉內嵌表單，呼叫 `renderGroups()`，確保原資料完整還原。

---

## 4. 錯誤處理與邊界條件
1. **API 錯誤防護**：
   - 網路異常或伺服器回應 500 時，跳出清楚提示訊息，並保留表單既有輸入避免資料遺失。
2. **來源廠變更保護**：
   - 當處於編輯模式或已建立分組時，若使用者變更來源廠，跳出提示警告「變更來源廠將清空已設定之任務群組」，避免跨廠同仁名單混亂。
3. **防呆檢核**：
   - 送出時若 `dispatchGroups.length === 0` 禁止送出。
