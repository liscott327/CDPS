# CPDS 支援調度同日多時段排程與時間區間重疊防呆實作計畫 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消同仁「一人一天僅限一次調度」之限制，支援同仁在同日不同時段被多次調度；同時以嚴格之時間區間重疊比對演算法 ($S_1 < E_2 \land E_1 > S_2$) 進行跨層級防呆，且現場簽到精確匹配「調度時段開始後 ~ 結束前」之有效時間窗口。

**Architecture:** 
1. 資料庫層：移除舊有唯一索引 `UQ_CustCPDSDetail_DispatchDate_EmpId`，建立 `TR_CustCPDSDetail_TimeOverlapCheck` Trigger 防呆重疊區間。
2. 後端 API 層：擴充 `/check-conflict` 接收 `startTime` 與 `endTime`，全面升級 `POST /plan`、`PUT /plan/:planNo` 與備援記憶體比對邏輯；在 `routes/checkin.js` 實作多時段自動命中與嚴格簽到時間區間檢驗。
3. 前端 UI 層：`index.html` 監聽起訖時間變更即時計算衝突，提供未重疊時段可勾選並標示輔助 badge，加入/修改明細執行即時重疊防呆。

**Tech Stack:** Node.js, Express, Microsoft SQL Server (tedious/mssql), Bootstrap 5, Flatpickr, jQuery.

## Global Constraints
- **時間重疊判定公式**：$S_1 < E_2 \land E_1 > S_2$。相接時間（如 $E_1 = S_2$，08:00~12:00 接 12:00~16:00）為合法，不加計緩衝時間。
- **異常狀態額度鎖定**：無論簽到狀態為何（包含待簽到 0、已簽到 1、逾期 2、異常 3），時段一律被佔用，重疊皆需阻擋。
- **簽到時間有效窗口**：現場掃碼僅允許在「調度開始後 ~ 調度結束前」執行（$\text{StartTime} \le \text{now} \le \text{EndTime}$）。

---

### Task 1: 資料庫 DDL 與 Trigger 重疊防呆 (`db/schema.sql`)

**Files:**
- Modify: `db/schema.sql:180-240`
- Test: `scripts/verify_db_schema.js`

**Interfaces:**
- Consumes: `CustCPDSDispatchPlan_Detail` (DetailId, ItemId, DispatchDate, EmpId), `CustCPDSDispatchPlan_Item` (ItemId, StartTime, EndTime)
- Produces: 移除 `UQ_CustCPDSDetail_DispatchDate_EmpId`；新增 `TR_CustCPDSDetail_TimeOverlapCheck` Trigger；連動更新 `TR_CustCPDSItem_Validate`。

- [ ] **Step 1: 撰寫資料庫結構驗證測試**

在 `scripts/verify_db_schema.js` 新增針對 `UQ_CustCPDSDetail_DispatchDate_EmpId` 已移除，且 `TR_CustCPDSDetail_TimeOverlapCheck` 存在的檢核邏輯。
```javascript
// 在 scripts/verify_db_schema.js 中加入檢驗
const triggerCheck = await pool.request().query(`
    SELECT name FROM sys.triggers WHERE name = 'TR_CustCPDSDetail_TimeOverlapCheck'
`);
assert.strictEqual(triggerCheck.recordset.length, 1, 'Trigger TR_CustCPDSDetail_TimeOverlapCheck 必須存在');

const indexCheck = await pool.request().query(`
    SELECT name FROM sys.indexes WHERE name = 'UQ_CustCPDSDetail_DispatchDate_EmpId'
`);
assert.strictEqual(indexCheck.recordset.length, 0, '舊唯一索引 UQ_CustCPDSDetail_DispatchDate_EmpId 必須已被移除');
```

- [ ] **Step 2: 執行測試確認預期失敗**

Run: `node scripts/verify_db_schema.js`
Expected: 失敗（因舊索引尚未移除或 Trigger 尚未建立）。

- [ ] **Step 3: 修改 `db/schema.sql` 移除舊索引並建立時間區間 Trigger**

修改 `db/schema.sql`：
```sql
-- 4.1 移除舊的同日單次唯一索引 (改由 Trigger 進行區間重疊防呆)
DROP INDEX IF EXISTS [UQ_CustCPDSDetail_DispatchDate_EmpId] 
    ON [dbo].[CustCPDSDispatchPlan_Detail];
GO

-- 5.3 Detail：新增/修改時確保同一位同仁在同一天不可排定重疊的調度時段
CREATE OR ALTER TRIGGER [dbo].[TR_CustCPDSDetail_TimeOverlapCheck]
ON [dbo].[CustCPDSDispatchPlan_Detail]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted d1
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i1 ON i1.[ItemId] = d1.[ItemId]
        JOIN [dbo].[CustCPDSDispatchPlan_Detail] d2 
            ON d2.[DispatchDate] = d1.[DispatchDate] 
           AND d2.[EmpId] = d1.[EmpId]
           AND d2.[DetailId] <> d1.[DetailId]
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i2 ON i2.[ItemId] = d2.[ItemId]
        WHERE i1.[StartTime] < i2.[EndTime] 
          AND i1.[EndTime] > i2.[StartTime]
    )
    BEGIN
        RAISERROR(N'人員排班時間衝突：同一位同仁在同一天不可排定重疊的調度時段！', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
END
GO
```
並確保 `TR_CustCPDSItem_Validate` 在 Item 的 `StartTime` / `EndTime` 變更時亦觸發相應的同仁排班重疊檢核。

- [ ] **Step 4: 執行資料庫重建與驗證腳本**

Run: `node scripts/init-db.js; node scripts/verify_db_schema.js`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql scripts/verify_db_schema.js
git commit -m "feat(db): replace single-day unique index with time overlap trigger"
```

---

### Task 2: 後端調度衝突檢驗與排程 API 升級 (`routes/dispatch.js`)

**Files:**
- Modify: `routes/dispatch.js:93-175, 590-645, 715-745, 860-900`
- Test: `scripts/verify_dispatch_api.js`

**Interfaces:**
- Consumes:
  - `POST /api/dispatch-plans/check-conflict`: `{ dispatchDate, startTime, endTime, empIds, excludePlanNo }`
  - `POST /api/dispatch-plans`: `{ dispatchDate, sourceDeptId, items: [...] }`
  - `PUT /api/dispatch-plans/:planNo`: `{ dispatchDate, sourceDeptId, items: [...] }`
- Produces:
  - 400 Bad Request if internal or external overlap detected: `{ success: false, message, conflicts }`
  - 200 OK if no overlap detected.

- [ ] **Step 1: 在 `scripts/verify_dispatch_api.js` 撰寫多時段與重疊測試案例**

新增測試案例：
1. Case A: 同一人同日排定 `08:00~12:00` 與 `13:00~17:00`（不重疊）$\rightarrow$ 應成功儲存。
2. Case B: 同一人同日排定 `08:00~12:00` 與 `10:00~14:00`（重疊）$\rightarrow$ 預期 400 Bad Request。
3. Case C: 同一人同日排定 `08:00~12:00` 與 `12:00~16:00`（相接）$\rightarrow$ 應成功儲存。
4. Case D: 當前排程中有人員處於異常狀態（`CheckInStatus = 3`），排入重疊時段 $\rightarrow$ 預期 400 Bad Request。

- [ ] **Step 2: 執行測試確認預期失敗**

Run: `node scripts/verify_dispatch_api.js`
Expected: Case A 失敗（因舊邏輯在當天只要有一筆就擋下）。

- [ ] **Step 3: 修改 `routes/dispatch.js`**

1. 在 `POST /check-conflict` 中，接收 `startTime` 與 `endTime`：
   - SQL 查詢條件加入：`AND (i.StartTime < @endTime AND i.EndTime > @startTime)`。
   - 移除 `d.CheckInStatus <> 3`（所有狀態均視為佔用）。
   - 本地備援記憶體查詢同步更新為區間比對：`!(empEnd <= startTime || empStart >= endTime)`。
2. 在 `POST /plan` 與 `PUT /plan/:planNo`：
   - 進行**單內多時段自我比對**：檢查送出的所有 items，是否有同一個同仁被同時分配在重疊的時段中。
   - 進行**跨單既有排程比對**：以 `(i.StartTime < @itemEndTime AND i.EndTime > @itemStartTime)` 檢查資料庫既有單據（排除自身）。
   - 移除 `CheckInStatus <> 3` 排除條件。
   - 本地備援 `memoryPlans` 同步使用區間比對。

- [ ] **Step 4: 執行測試確認全部通過**

Run: `node scripts/verify_dispatch_api.js`
Expected: Case A, B, C, D 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add routes/dispatch.js scripts/verify_dispatch_api.js
git commit -m "feat(api): implement time overlap detection in dispatch conflict endpoints"
```

---

### Task 3: 現場簽到時段智慧匹配與時間檢驗 (`routes/checkin.js`)

**Files:**
- Modify: `routes/checkin.js:300-420, 50-80`
- Test: `scripts/verify_checkin_api.js`

**Interfaces:**
- Consumes: `POST /api/checkin/scan`: `{ deptId, dispatchDate, empId, currentTime? }`
- Produces: 依據當前時間落在哪個時段的 `[StartTime, EndTime]` 精確定位對應的 `DetailId` 並完成簽到。若早於 `StartTime` 或晚於 `EndTime` 則拒絕簽到。

- [ ] **Step 1: 在 `scripts/verify_checkin_api.js` 撰寫多時段與時間檢驗案例**

新增測試案例：
1. 同一人當日於同一廠有兩筆排程：`08:00~12:00` 與 `13:00~17:00`。
2. 於 `07:55` 掃碼（早於 StartTime）$\rightarrow$ 預期失敗（提示「應於調度時段開始後~結束前簽到」）。
3. 於 `08:05` 掃碼 $\rightarrow$ 命中 `08:00~12:00` 時段，簽到成功（準時 `status = 1`）。
4. 於 `13:20` 掃碼 $\rightarrow$ 命中 `13:00~17:00` 時段，簽到成功（逾期 `status = 2`）。

- [ ] **Step 2: 執行測試確認預期失敗**

Run: `node scripts/verify_checkin_api.js`
Expected: 失敗（因舊邏輯支援提早 10 分鐘，且無法區分同人同日多時段）。

- [ ] **Step 3: 修改 `routes/checkin.js` 簽到匹配邏輯**

1. 修改簽到有效區間：
   - 僅允許 `nowMinutes >= startMin && nowMinutes <= endMin`（嚴格於時段開始後至結束前）。
   - 準時區間：`nowMinutes <= startMin + 10`。
2. 多時段匹配邏輯：
   - 若同仁有多筆排程，撈出所有記錄，以 `nowMinutes >= startMin && nowMinutes <= endMin` 進行過濾，精確取得當前命中且未簽到之明細。
   - 若未命中任何區間，回傳錯誤，並列出該員當日排定的所有時段。
3. 本地備援 `memoryCheckinRecords` 同步實作此多時段篩選邏輯。

- [ ] **Step 4: 執行測試確認通過**

Run: `node scripts/verify_checkin_api.js`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add routes/checkin.js scripts/verify_checkin_api.js
git commit -m "feat(checkin): support multi-slot matching and enforce checkin within slot range"
```

---

### Task 4: 前端調度單時段即時聯動與防呆 (`index.html`)

**Files:**
- Modify: `index.html:1008-1120, 1590-1670`
- Test: `scripts/verify_index_integration.js`

**Interfaces:**
- Consumes: `#startTime`, `#endTime`, `#dispatchDate`, `currentSubItems`
- Produces: 
  - 動態傳遞 `startTime` 與 `endTime` 至 `/api/dispatch-plans/check-conflict`。
  - 對 `currentSubItems` 以區間重疊比對衝突同仁。
  - 衝突人員：checkbox `disabled` + 紅色鎖定 badge。
  - 非重疊時段同仁：checkbox 可勾選 + 次要提示 badge（例 `[今日已排 14:00~17:00 B廠]`）。

- [ ] **Step 1: 在 `scripts/verify_index_integration.js` 新增前端時段防呆檢核測試**

模擬 DOM 環境或測試腳本，驗證：
1. 修改 `#startTime` / `#endTime` 時，呼叫 `/check-conflict` 帶有時段參數。
2. 同仁在不同時段時，checkbox 未被 disabled。
3. 加入明細時若與 `currentSubItems` 時段重疊，彈出 alert 阻擋。

- [ ] **Step 2: 執行測試確認預期失敗**

Run: `node scripts/verify_index_integration.js`
Expected: 失敗（因前端目前仍為全日單次排程邏輯）。

- [ ] **Step 3: 修改 `index.html`**

1. 在 `index.html` 的事件監聽區塊：
   - 監聽 `#startTime` 與 `#endTime` 的 `change` 事件（加 debounce 300ms），呼叫 `renderPersonnelChecklist`。
2. 在 `renderPersonnelChecklist` 函式中：
   - 取得當前輸入的 `startTime` 與 `endTime`，傳入 `/api/dispatch-plans/check-conflict`。
   - 前端比對 `currentSubItems`：
     ```javascript
     const curStart = $('#startTime').val();
     const curEnd = $('#endTime').val();
     // 區間重疊條件: item.startTime < curEnd && item.endTime > curStart
     const isOverlapping = (item.startTime < curEnd && item.endTime > curStart);
     ```
   - 若為非重疊時段，保持可勾選，並渲染提示標籤 `今日已排定 {startTime}~{endTime} {targetDept}`。
3. 在「加入明細」`#btnAddSubItem` 與「修改明細」`#btnUpdateSubItem` 事件處理器中：
   - 驗證送出的同仁是否與 `currentSubItems` 或後端 API 存在時段重疊。

- [ ] **Step 4: 執行測試確認通過**

Run: `node scripts/verify_index_integration.js`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add index.html scripts/verify_index_integration.js
git commit -m "feat(ui): dynamic personnel checklist conflict checking on time range change"
```

---

### Task 5: 全模組端對端整合驗證與測試驗收

**Files:**
- Create: `scripts/verify_multi_slot_e2e.js`
- Test: All verify scripts

**Interfaces:**
- Consumes: 全系統所有 API 與靜態頁面
- Produces: 完整的自動化 E2E 驗收報告。

- [ ] **Step 1: 撰寫全流程端對端整合驗證腳本 `scripts/verify_multi_slot_e2e.js`**

涵蓋完整使用者場景：
1. 登入系統取得 Token。
2. 建立調度單：同一位同仁在同一天排定兩段不重疊時間（09:00~12:00 支援 A 廠，13:00~17:00 支援 B 廠）$\rightarrow$ 成功建立。
3. 嘗試在另一張調度單將該員排入 10:00~14:00 $\rightarrow$ 阻擋失敗（400）。
4. 嘗試將該員排入 12:00~13:00（完全相接無縫隙）$\rightarrow$ 成功建立。
5. 現場分別以不同時間模擬掃碼簽到 $\rightarrow$ 正確簽入各自時段。
6. 將該員在某時段標記為異常 $\rightarrow$ 再次嘗試排入重疊時段依然被阻擋。

- [ ] **Step 2: 執行完整測試套件**

Run:
```bash
node scripts/verify_db_schema.js
node scripts/verify_dispatch_api.js
node scripts/verify_checkin_api.js
node scripts/verify_index_integration.js
node scripts/verify_multi_slot_e2e.js
```
Expected: 所有驗證腳本皆輸出 PASS 且 Exit Code 0。

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_multi_slot_e2e.js
git commit -m "test: add comprehensive end-to-end verification for multi-slot dispatch"
```
