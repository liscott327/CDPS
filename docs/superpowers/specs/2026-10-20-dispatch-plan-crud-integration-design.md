# 技術規格書：調度排程 (index.html) 端到端 API 串接與資料庫交易整合

**文件日期：** 2026-10-20  
**作者/架構審核：** 資深全端網頁軟體工程師  
**狀態：** 已與使用者確認通過 (Approved)  
**技術架構：** Node.js (Express) + MSSQL LocalDB / ODBC Driver 17 + 純 HTML5 / 原生 JavaScript (Zero-Build)

---

## 1. 系統目標與背景說明 (Context & Objectives)

本規格針對「跨廠人員調度與簽到系統 (CPDS)」第一核心模組——**人員跨廠支援調度排程 (`index.html`)**，提供從前端畫面、共用網路層、後端 RESTful API 到 MSSQL 資料庫的三層端到端（End-to-End）完整實作方案。

### 核心訴求：
1. **Zero-Build 純原生工程**：前端維持純 HTML + 原生 JavaScript (ES6+)，無需 Webpack/Vite 等建置工具，利於本機及企業內部伺服器（IIS/靜態伺服器）零門檻部屬。
2. **資料庫 v2.0 三層結構整合**：完全落實今日最新之 `Master` (調度單) ➔ `Item` (時段用途) ➔ `Detail` (調派人員) 資料結構。
3. **交易完整性 (ACID)**：新增與更新調度單時，透過 MSSQL Transaction 確保單頭、時段與人員資料一致性，杜絕孤兒紀錄。
4. **極致防呆機制**：
   - 來源廠每日僅能有一張正常調度單 (`PlanStatus = 1`)。
   - 同一位同仁在同一調度日期僅能被調派一次（若有衝突則阻擋並提示）。
   - 時段起訖檢核 (`StartTime < EndTime`)。
5. **共用 API Client**：抽離 `scripts/api.js`，提供統一 JWT 授權標頭注入、401 攔截與錯誤處理，作為未來現場簽到 (`checkin.html`) 與報表 (`report.html`) 之共用基石。

---

## 2. 系統架構與資料流 (System Architecture)

```mermaid
flowchart TD
    subgraph Frontend["前端 (純 HTML5 + 原生 JS + Bootstrap 5)"]
        IndexPage["index.html (調度排程主頁)"]
        AuthJS["scripts/auth.js (JWT 憑證管理)"]
        APIClient["scripts/api.js (原生 Fetch 封裝 / 統一攔截器)"]
        
        IndexPage -->|1. 驗證登入身分| AuthJS
        IndexPage -->|2. 調用 API (CRUD/查詢)| APIClient
        APIClient -->|3. 發出 HTTP Request (附帶 Bearer Token)| Server
    end

    subgraph Backend["後端 (Node.js / Express API 服務)"]
        Server["server.js (主入口 & 路由掛載)"]
        AuthMW["驗證中介軟體 (verifyToken)"]
        DispatchRoute["routes/dispatch.js (調度業務邏輯模組)"]
        
        Server --> AuthMW
        AuthMW --> DispatchRoute
    end

    subgraph Database["資料庫 (MSSQL LocalDB / 正式環境)"]
        DBPool["mssql Connection Pool"]
        DBTransaction["SQL Transaction (ACID 交易保護)"]
        MasterTbl["CustCPDSDispatchPlan_Master (單頭)"]
        ItemTbl["CustCPDSDispatchPlan_Item (時段明細)"]
        DetailTbl["CustCPDSDispatchPlan_Detail (人員名單)"]
        ViewUser["vw_ActiveUserMainFunction (BPM 組織檢視表)"]

        DispatchRoute --> DBPool
        DBPool --> DBTransaction
        DBTransaction --> MasterTbl
        DBTransaction --> ItemTbl
        DBTransaction --> DetailTbl
        DispatchRoute -.->|部門清單與人員查詢| ViewUser
    end
```

---

## 3. 資料庫結構規格與建表作業

升級 LocalDB 結構至 v2.0，執行 `db/schema.sql`：

### 3.1 `CustCPDSDispatchPlan_Master` (調度單主檔)
- `PlanNo` (VARCHAR(15), PK): 調度單號，格式 `DPyyyyMMdd-NNN`
- `DispatchDate` (DATE, NOT NULL): 調度日期
- `SourceDeptId` (VARCHAR(50), NOT NULL): 來源廠代碼
- `PlanStatus` (TINYINT, DEFAULT 1): 狀態（1: 正常, 0: 邏輯刪除）
- `CreateUser` (VARCHAR(10), NOT NULL): 建立人工號
- `CreateTime` (DATETIME, DEFAULT GETDATE()): 建立時間
- `UpdateUser` (VARCHAR(10), NULL): 最後修改人工號
- `UpdateTime` (DATETIME, NULL): 最後修改時間
- **索引**：`UQ_CustCPDSMaster_Date_SourceDept` (`UNIQUE NONCLUSTERED (DispatchDate, SourceDeptId) WHERE PlanStatus = 1`)

### 3.2 `CustCPDSDispatchPlan_Item` (時段明細檔)
- `ItemId` (BIGINT IDENTITY, PK): 時段流水號
- `PlanNo` (VARCHAR(15), FK to Master, CASCADE DELETE)
- `Seq` (SMALLINT, NOT NULL): 單內序號 (1, 2, 3...)
- `DispatchDate` (DATE, NOT NULL): 調度日期 (冗餘加速查詢)
- `TargetDeptId` (VARCHAR(50), NOT NULL): 目的廠代碼
- `StartTime` (TIME(0), NOT NULL): 調度起時
- `EndTime` (TIME(0), NOT NULL): 調度訖時
- `Purpose` (NVARCHAR(100), NULL): 支援用途
- `CreateTime` (DATETIME, DEFAULT GETDATE())
- `UpdateTime` (DATETIME, NULL)
- **約束**：`CHECK (StartTime < EndTime)`

### 3.3 `CustCPDSDispatchPlan_Detail` (人員調派與簽到檔)
- `DetailId` (BIGINT IDENTITY, PK): 調派流水號
- `ItemId` (BIGINT, FK to Item, CASCADE DELETE)
- `DispatchDate` (DATE, NOT NULL): 調度日期
- `EmpId` (VARCHAR(10), NOT NULL): 調派員工工號
- `CheckInStatus` (TINYINT, DEFAULT 0): 0 待簽到 / 1 已簽到 / 2 逾期簽到 / 3 異常
- `CheckInTime` (DATETIME, NULL): 簽到時間
- `CheckInMethod` (TINYINT, NULL): 1 條碼掃描 / 2 主管代簽
- `ConfirmUser` (VARCHAR(10), NULL): 確認人工號
- `AbnormalReason` (NVARCHAR(200), NULL): 異常說明
- `CreateTime` (DATETIME, DEFAULT GETDATE())
- `UpdateTime` (DATETIME, NULL)
- **索引**：`UQ_CustCPDSDetail_DispatchDate_EmpId` (`UNIQUE NONCLUSTERED (DispatchDate, EmpId) WHERE CheckInStatus <> 3`)

---

## 4. 後端 RESTful API 詳細規格 (`routes/dispatch.js`)

後端掛載基底路徑：`/api/dispatch-plans`

### 4.1 查詢調度單清單：`GET /api/dispatch-plans`
- **權限**：需驗證 JWT Bearer Token
- **Query 參數**：
  - `startDate` (可選): 起始日期 `YYYY-MM-DD`
  - `endDate` (可選): 結束日期 `YYYY-MM-DD`
  - `sourceDeptId` (可選): 來源廠代碼（可逗號分隔多選）
  - `targetDeptId` (可選): 目的廠代碼（可逗號分隔多選）
  - `startTime` (可選): 時段起 `HH:mm`
  - `endTime` (可選): 時段訖 `HH:mm`
  - `keyword` (可選): 關鍵字（支援單號、部門名、員工工號、姓名、用途搜尋）
- **回應格式**：
  ```json
  {
    "success": true,
    "data": [
      {
        "planNo": "DP20261020-001",
        "dispatchDate": "2026-10-21",
        "sourceDeptId": "OU_A51_MFG",
        "sourceDeptName": "A5-1廠 製造部",
        "createUser": "JM30448",
        "createUserName": "李奕諴",
        "createTime": "2026-10-20 14:30:00",
        "items": [
          {
            "itemId": 1,
            "seq": 1,
            "targetDeptId": "JMB03",
            "targetDeptName": "B10-3廠",
            "startTime": "08:00",
            "endTime": "17:00",
            "purpose": "機台突發故障維修支援",
            "employees": [
              {
                "detailId": 101,
                "empId": "JM11504",
                "name": "沈佳承",
                "title": "作業員",
                "deptName": "B10-3廠"
              }
            ]
          }
        ],
        "totalItemCount": 1,
        "totalEmpCount": 1
      }
    ]
  }
  ```

### 4.2 取得單筆完整調度單：`GET /api/dispatch-plans/:planNo`
- **說明**：供前端點選修改時讀取詳細結構回填編輯區。
- **回應格式**：回傳上述單筆物件，若不存在或已刪除回傳 404。

### 4.3 新增調度單：`POST /api/dispatch-plans`
- **Request Body**：
  ```json
  {
    "dispatchDate": "2026-10-21",
    "sourceDeptId": "OU_A51_MFG",
    "items": [
      {
        "seq": 1,
        "targetDeptId": "JMB03",
        "startTime": "08:00",
        "endTime": "17:00",
        "purpose": "維修支援",
        "employees": [
          { "empId": "JM11504" }
        ]
      }
    ]
  }
  ```
- **交易處理與防呆步驟**：
  1. 檢核當前登入者是否合法。
  2. 檢查 `(dispatchDate, sourceDeptId)` 是否已有有效單據。若有則拋出 `409 Conflict`：「該廠該日已存在調度單據」。
  3. 蒐集所有要調派的工號清單，檢核這群人在 `dispatchDate` 是否已被其他單據調派（`CheckInStatus <> 3`）。若有人員已被預排，立即回傳 `400 Bad Request` 並列出衝突人員。
  4. 開啟 MSSQL Transaction：
     - 自動產出調度單號 `DPyyyyMMdd-NNN`。
     - 寫入 `CustCPDSDispatchPlan_Master`。
     - 逐筆寫入 `CustCPDSDispatchPlan_Item`。
     - 逐筆寫入 `CustCPDSDispatchPlan_Detail`。
     - 提交交易 (`COMMIT`)。
- **回應格式**：
  `{ "success": true, "message": "調度單建立成功", "planNo": "DP20261021-001" }`

### 4.4 修改調度單：`PUT /api/dispatch-plans/:planNo`
- **Request Body**：與 POST 相同。
- **交易處理**：
  1. 檢核原單是否存在。
  2. 排除本單既有人員後，比對新指派人員在當日是否與其他單據衝突。
  3. 啟動 Transaction：
     - 更新 Master 之 `UpdateTime`, `UpdateUser`。
     - 刪除舊有 Items（因設定 CASCADE DELETE，關聯之 Detail 會一併被清除）。
     - 重新寫入新 Items 與 Details。
     - 提交交易 (`COMMIT`)。

### 4.5 刪除調度單：`DELETE /api/dispatch-plans/:planNo`
- **邏輯**：將 `CustCPDSDispatchPlan_Master.PlanStatus` 設為 `0`，保留歷史軌跡但釋放該單據下所有同仁調派額度。

### 4.6 人員排班前衝突檢驗：`POST /api/dispatch-plans/check-conflict`
- **Request Body**：
  `{ "dispatchDate": "2026-10-21", "empIds": ["JM11504", "A0123"] }`
- **回應格式**：
  ```json
  {
    "success": true,
    "conflicts": [
      {
        "empId": "JM11504",
        "name": "沈佳承",
        "planNo": "DP20261021-001",
        "sourceDeptName": "A5-1廠",
        "targetDeptName": "B10-3廠"
      }
    ]
  }
  ```

---

## 5. 前端 API 封裝與畫面改造 (`scripts/api.js` & `index.html`)

### 5.1 `scripts/api.js` 模組實作
- 封裝 `window.API` 全域工具：
  - `API.request(url, options)`：核心 Fetch 處理器。
  - 自動附加 HTTP Header：`Authorization: Bearer ${Auth.getToken()}`。
  - 回應攔截：若 `response.status === 401`，呼叫 `Auth.clearAuth()` 並轉導 `login.html`。
  - 便捷方法：`API.get(url, params)`、`API.post(url, body)`、`API.put(url, body)`、`API.delete(url)`。

### 5.2 `index.html` 畫面改造
1. **身分守護與導覽列**：引入 `scripts/auth.js` 與 `scripts/api.js`，啟動 `Auth.requireAuth()` 與 `Auth.renderNavbarUser()`。
2. **部門選單動態載入**：
   - 移除 HTML 中寫死的靜態 `<option>`。
   - 呼叫 `API.get('/api/departments')` 動態填入「篩選來源廠」、「篩選目的廠」、「調度來源廠」、「調度目的廠」，並維持 Select2 正常渲染。
3. **調度單清單讀取與篩選**：
   - 頁面載入及點選「查詢」按鈕時，收集篩選條件呼叫 `API.get('/api/dispatch-plans', params)`。
   - 將後端回傳資料餵入 `$('#dispatchListTable').bootstrapTable('load', data)`。
4. **編輯與新增儲存**：
   - 表單送出時，由目前狀態判斷：
     - 若為新增：調用 `API.post('/api/dispatch-plans', payload)`。
     - 若為編輯：調用 `API.put('/api/dispatch-plans/' + currentEditingPlanNo, payload)`。
   - 送出成功後清空表單、切換回新增模式並重新查詢重繪表格。
5. **刪除處理**：
   - 點選操作欄「刪除」按鈕，跳出確認詢問後調用 `API.delete('/api/dispatch-plans/' + planNo)`，完成後自動更新列表。

---

## 6. 驗證與測試計畫 (Verification Plan)

### 6.1 自動化與腳本驗證 (Node.js Test Scripts)
1. **資料庫建表測試**：執行 `node scripts/init-db.js` 或 SQL 腳本，確認三張表與索引建立成功。
2. **端點單元/整合測試**：撰寫測試腳本驗證：
   - 正常新增調度單（Master + Item + Detail）並驗證回傳。
   - 同廠同日重複新增 ➔ 驗證拋出 409。
   - 同日人員重複排程 ➔ 驗證拋出 400 衝突。
   - 查詢清單與篩選比對。
   - 邏輯刪除驗證 ➔ 驗證同仁額度是否正確釋放。

### 6.2 前端手動操作驗證
1. 未登入狀態訪問 `index.html` ➔ 驗證自動轉向 `login.html`。
2. 以帳號 `JM30448` 登入 ➔ 驗證導覽列顯示使用者姓名與工號。
3. 下拉選單驗證 ➔ 來源廠與目的廠皆正確動態載入。
4. 新增一張調度單 ➔ 點選儲存 ➔ 上半部清單即時顯示該筆單據。
5. 點擊「修改」調度單 ➔ 確認時段與挑選人員能正確帶回下半部編輯器並成功更新。
6. 點擊「刪除」調度單 ➔ 確認單據從清單中消失。
