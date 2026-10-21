# CPDS 支援調度同日多時段排程與時間區間重疊防呆設計規格書

## 1. 背景與需求目標

在目前跨廠人員調度與簽到系統 (CPDS) 中，資料庫與系統邏輯採用「一人一天僅限調度一次」之限制 (`UQ_CustCPDSDetail_DispatchDate_EmpId`)。然而在廠區實際營運情境中，同一位同仁可能在同一個工作天的不同時段被調派支援不同產線或廠別（例如：上午支援 A 廠、下午支援 B 廠）。

本規格旨在升級排程防呆模型：
1. **取消「一人一天僅限一次調度」**，改為支援**同一人在同一天不同時段可被多次調度**。
2. **時段重疊嚴格阻擋**：同一位同仁在同一天的調度時間區間不得有任何重疊；若有重疊，系統一律跳出錯誤提示並阻擋建立或修改。
3. **無須路程緩衝時間**：時間區間相接（例如 `08:00~12:00` 與 `12:00~16:00`）視為合法，不額外加計交通緩衝時間。
4. **異常標記不釋出額度**：調派人員無論後續簽到狀態為何（待簽到 `0`、已簽到 `1`、逾期簽到 `2`、異常 `3`），只要該時段已被排定，該人員的時間即被佔用，不可重複排程。
5. **現場簽到精確匹配時段**：同仁若同日有多筆排程，現場掃碼簽到時依「調度時段開始後 ~ 調度時段結束前」之有效區間自動匹配正確的調派記錄。

---

## 2. 核心判定演算法 (Core Algorithm)

### 2.1 時間區間重疊判定
兩段時間 $[S_1, E_1)$ 與 $[S_2, E_2)$ 重疊之充要條件為：
$$S_1 < E_2 \quad \land \quad E_1 > S_2$$

* **合法情境**：
  * $E_1 \le S_2$：前段結束時間等於或早於後段開始時間（如 `08:00~12:00` 與 `12:00~16:00`）。
  * $S_1 \ge E_2$：前段開始時間等於或晚於後段結束時間。
* **違規衝突情境**：
  * 包含、交錯或完全相同（如 `08:00~12:00` 與 `10:00~14:00`，或 `08:00~12:00` 與 `08:00~12:00`）。

### 2.2 現場有效簽到時間窗口
* 簽到有效窗口：`現在時間 >= StartTime AND 現在時間 <= EndTime`（在調度時段開始後 ~ 調度時段結束前）。
* 準時簽到：`現在時間 <= StartTime + 10 分鐘`（狀態 `1: 已簽到`）。
* 逾期簽到：`現在時間 > StartTime + 10 分鐘`（狀態 `2: 逾期簽到`）。
* 若當前時間不在同仁任何未簽到時段的 `[StartTime, EndTime]` 區間內，則拒絕簽到並提示錯誤。

---

## 3. 系統各層級詳細調整設計

### 3.1 資料庫層 (Database Layer - `db/schema.sql`)

1. **移除舊有限制索引**：
   ```sql
   DROP INDEX IF EXISTS [UQ_CustCPDSDetail_DispatchDate_EmpId] 
       ON [dbo].[CustCPDSDispatchPlan_Detail];
   ```
2. **新增時間區間重疊防呆 Trigger**：
   在 `CustCPDSDispatchPlan_Detail` 新增/更新時，檢查同仁當日是否存在重疊排程：
   ```sql
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
3. **Item 時間變更連動驗證**：
   當 `CustCPDSDispatchPlan_Item` 調整 `StartTime` 或 `EndTime` 時，由現有/擴充之 `TR_CustCPDSItem_Validate` 觸發檢驗其下關聯人員是否產生時間衝突。

---

### 3.2 後端 API 層 (Backend API Layer - `routes/dispatch.js` & `routes/checkin.js`)

#### 1. 人員排班衝突檢驗 API：`POST /api/dispatch-plans/check-conflict`
* **請求格式**：
  ```json
  {
    "dispatchDate": "2026-10-21",
    "startTime": "08:00",
    "endTime": "12:00",
    "empIds": ["JM10001", "JM10002"],
    "excludePlanNo": "DP20261021-001"
  }
  ```
* **查詢邏輯**：
  查詢 `CustCPDSDispatchPlan_Detail` 中，`DispatchDate = @dispatchDate` 且 `EmpId IN (@empIds)` 且與 `@startTime ~ @endTime` 發生區間重疊之紀錄（包含所有簽到狀態）。
* **回傳格式**：
  ```json
  {
    "success": true,
    "conflicts": [
      {
        "empId": "JM10001",
        "name": "王小明",
        "planNo": "DP20261021-002",
        "sourceDeptName": "A5-1廠",
        "targetDeptName": "B10-1廠",
        "startTime": "10:00",
        "endTime": "14:00"
      }
    ]
  }
  ```

#### 2. 調度單儲存與修改 API：`POST /plan` 與 `PUT /plan/:planNo`
* **驗證步驟**：
  1. **單內自我重疊檢核**：檢核本次請求的各 items 之間，若有同一個 `empId` 被排在重疊時段，立即回傳 HTTP 400。
  2. **跨單既有排程重疊檢核**：以 SQL 區間比對其他單據，若有衝突回傳詳細衝突名單與時段。
  3. **寫入資料庫**：在資料庫交易內完成寫入。
* **本地備援模式 (`memoryPlans`)**：以相同時間區間重疊演算法同步防呆。

#### 3. 現場簽到 API：`POST /api/checkin/scan` (`routes/checkin.js`)
* 依工號 `empId`、目的廠 `deptId`、日期 `dispatchDate` 取得所有該員調派明細。
* 比對當前時間落在滿足 `StartTime <= now <= EndTime` 之有效時段：
  * 若找到有效且未簽到之明細，執行簽到（依 `StartTime + 10 分鐘` 判定準時或逾期）。
  * 若無任何符合時間之時段，回傳錯誤訊息並列出該同仁本日應到之所有時段。

---

### 3.3 前端介面與互動設計 (Frontend UI - `index.html`)

1. **時間欄位聯動重新整理**：
   * 在調度單編輯區塊，監聽 `#startTime` 與 `#endTime` 變更。
   * 時段變更時自動以 debounce 重新呼叫 `/api/dispatch-plans/check-conflict` 並重新渲染人員選單。
2. **人員選單鎖定狀態呈現**：
   * **時段重疊**：人員 Checkbox 設為 `disabled`，顯示紅色鎖定 badge：`已被排定至 {廠別} ({起}~{訖})`。
   * **時段不重疊（已排其他時段）**：人員 Checkbox **維持可勾選**，若本日有其他排程，顯示灰色/次要提示 badge：`今日已排 {起}~{訖} {廠別}`，提供排班者完整資訊。
   * **完全無排程**：人員 Checkbox 正常可勾選。
3. **加入/修改明細送出防呆**：
   * 按下「加入明細」或「修改明細」時，即時比對暫存列表 `currentSubItems` 中所有時段，若有重疊人員則阻擋並彈窗警示。

---

## 4. 測試與驗證計畫

1. **單元測試與驗證腳本 (`scripts/verify_dispatch_api.js`)**：
   * 驗證同一位同仁在同一天排入兩個**不重疊時段**（如 08:00~12:00 與 13:00~17:00）可成功儲存。
   * 驗證同一位同仁在同一天排入**重疊時段**（如 08:00~12:00 與 10:00~14:00）會被拒絕並回傳 400。
   * 驗證同一位同仁在同一天排入**邊界相接時段**（如 08:00~12:00 與 12:00~16:00）可成功儲存。
   * 驗證標記異常 (`CheckInStatus = 3`) 的同仁，其時段仍被佔用，重疊排程依然被阻擋。
2. **簽到比對驗證 (`scripts/verify_checkin_api.js`)**：
   * 驗證同一同仁多時段於現場掃碼時，依時間自動匹配正確時段。
   * 驗證在 `StartTime` 前掃碼會提示不在時段內。
3. **前端介面驗證 (`scripts/verify_index_integration.js`)**：
   * 驗證時段調整時，人員清單即時更新衝突狀態與勾選權限。
