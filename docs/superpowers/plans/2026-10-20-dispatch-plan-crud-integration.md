# 調度排程 (index.html) 端到端 API 串接與資料庫交易實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成「跨廠人員調度與簽到系統 (CPDS)」的調度排程功能（`index.html`），將既有前端介面全面串接 Node.js RESTful API 與 MSSQL v2.0 三層式資料表（Master ➔ Item ➔ Detail），具備事務交易（Transaction）原子性寫入與嚴格排程防呆。

**Architecture:** 
1. 資料庫透過 `db/schema.sql` 升級為 v2.0（`CustCPDSDispatchPlan_Master`, `CustCPDSDispatchPlan_Item`, `CustCPDSDispatchPlan_Detail`）。
2. 後端建立 `routes/dispatch.js` 模組，於 `server.js` 掛載 `/api/dispatch-plans`，以 `sql.Transaction` 保證單據及人員寫入一致性。
3. 前端抽離 `scripts/api.js` 原生 Fetch 模組，自動注入 JWT Token，改造 `index.html` 之下拉選單、查詢、新增、編輯與刪除流程。

**Tech Stack:** Node.js (Express), mssql / msnodesqlv8 (ODBC Driver 17), JWT (jsonwebtoken), HTML5, Bootstrap 5.3, Bootstrap Table 1.22, jQuery 3.7.

## Global Constraints
- 前端維持零建置工具（No-Build / Zero-Build Pipeline），純 HTML5 + 原生 JS（ES6+）與現有 jQuery/Bootstrap 函式庫協同。
- 調度單單號格式：`DPyyyyMMdd-NNN`（如 `DP20261020-001`）。
- 嚴格落實防呆：同一廠區在同一調度日期僅能有一張正常調度單（`PlanStatus = 1`）；同一同仁在同一調度日僅能被調派一次（異常者除外）。
- 寫入與更新必須在單一 SQL Transaction 內完成，失敗立即 Rollback。

---

### Task 1: 資料庫表結構升級至 v2.0 並建立檢核腳本

**Files:**
- Create: `scripts/verify_db_schema.js`
- Test: `scripts/verify_db_schema.js`

**Interfaces:**
- Produces: 升級後的 LocalDB 資料表 `CustCPDSDispatchPlan_Master`, `CustCPDSDispatchPlan_Item`, `CustCPDSDispatchPlan_Detail`，以及檢驗腳本回傳 schema 欄位清單。

- [ ] **Step 1: 建立資料庫結構檢核腳本 `scripts/verify_db_schema.js`**

```javascript
// scripts/verify_db_schema.js
const sql = require('mssql/msnodesqlv8');
const dbConfig = require('../dbConfig');

async function verifyDbSchema() {
    console.log('[Task 1] 開始檢核 LocalDB 資料庫表結構...');
    const pool = await sql.connect({ connectionString: dbConfig.connectionString });

    const tables = ['CustCPDSDispatchPlan_Master', 'CustCPDSDispatchPlan_Item', 'CustCPDSDispatchPlan_Detail', 'CustCPDSUser'];
    for (const tbl of tables) {
        const res = await pool.request()
            .input('tbl', sql.NVarChar, tbl)
            .query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tbl`);
        if (res.recordset.length === 0) {
            console.error(`❌ 資料表 ${tbl} 不存在！`);
            await pool.close();
            process.exit(1);
        }
        console.log(`✅ 資料表 ${tbl} 存在，包含 ${res.recordset.length} 個欄位`);
    }

    console.log('🎉 所有資料表檢核通過！');
    await pool.close();
}

verifyDbSchema().catch(err => {
    console.error('檢核失敗:', err);
    process.exit(1);
});
```

- [ ] **Step 2: 執行資料庫升級並執行檢核**

執行更新 LocalDB 結構為 v2.0：
```bash
node -e "const fs = require('fs'); const sql = require('mssql/msnodesqlv8'); const dbConfig = require('./dbConfig'); (async()=>{ const code = fs.readFileSync('db/schema.sql', 'utf8'); const batches = code.split(/^\s*GO\s*$/m); const pool = await sql.connect({connectionString: dbConfig.connectionString}); for(const b of batches){ const trimmed = b.trim(); if(trimmed) await pool.request().batch(trimmed); } console.log('v2.0 schema executed successfully'); await pool.close(); })();"
node scripts/verify_db_schema.js
```
預期輸出：所有 4 張表皆存在且包含正確欄位。

---

### Task 2: 後端調度排程業務模組 (`routes/dispatch.js`) 與路由掛載

**Files:**
- Create: `routes/dispatch.js`
- Modify: `server.js`

**Interfaces:**
- Produces:
  - `GET /api/dispatch-plans`
  - `GET /api/dispatch-plans/:planNo`
  - `POST /api/dispatch-plans`
  - `PUT /api/dispatch-plans/:planNo`
  - `DELETE /api/dispatch-plans/:planNo`
  - `POST /api/dispatch-plans/check-conflict`

- [ ] **Step 1: 建立 `routes/dispatch.js`**

實作以下完整功能：
1. JWT 認證中介層 `authenticateToken`。
2. 流水單號產生器 `generatePlanNo(pool, dispatchDate)`。
3. `POST /check-conflict` 檢查指定工號陣列在指定日期是否衝突。
4. `GET /` 依篩選條件（日期區間、來源廠、目的廠、時段、關鍵字）查詢 Master、Item、Detail 聚合清單。
5. `GET /:planNo` 取得單筆完整調度單資料。
6. `POST /` 在 `sql.Transaction` 內執行同日同廠唯一性檢核、人員防呆檢核、產號與 Master/Item/Detail 寫入。
7. `PUT /:planNo` 在 `sql.Transaction` 內執行衝突比對、更新 Master、清空重寫 Items 與 Details。
8. `DELETE /:planNo` 將 `PlanStatus` 設為 0（軟刪除釋放額度）。

- [ ] **Step 2: 在 `server.js` 掛載 `/api/dispatch-plans` 路由**

在 `server.js` 中引入 `routes/dispatch.js` 並將 `dbPool` 與 `sql` 實例注入或共用。

---

### Task 3: 後端 API 整合測試腳本 (`scripts/verify_dispatch_api.js`)

**Files:**
- Create: `scripts/verify_dispatch_api.js`
- Test: `scripts/verify_dispatch_api.js`

**Interfaces:**
- Consumes: `/api/dispatch-plans` 系列端點
- Produces: 測試報表與 Exit Code 0 (全部通過)

- [ ] **Step 1: 撰寫自動化 API 測試腳本**

測試情境：
1. 使用測試帳號 `JM30448` 登入取得 JWT Token。
2. 呼叫 `POST /api/dispatch-plans` 建立調度單 A（Master + 1 個 Item + 1 位同仁 JM11504），驗證回傳單號。
3. 同一天同一來源廠重複呼叫 `POST` ➔ 驗證回傳 409 錯誤（阻擋重複建單）。
4. 另一個廠呼叫 `POST` 嘗試調派同一位同仁 JM11504 ➔ 驗證回傳 400 衝突錯誤。
5. 呼叫 `GET /api/dispatch-plans` 驗證查詢結果包含該單據。
6. 呼叫 `PUT /api/dispatch-plans/:planNo` 修改該單據用途與時段。
7. 呼叫 `DELETE /api/dispatch-plans/:planNo` 刪除該單據。
8. 再次查詢確認單據已標記刪除，且 JM11504 當日額度已被釋放。

- [ ] **Step 2: 執行 API 整合測試**

```bash
node scripts/verify_dispatch_api.js
```
預期輸出：所有 8 項測試皆通過。

---

### Task 4: 前端共用原生 API Client (`scripts/api.js`)

**Files:**
- Create: `scripts/api.js`

**Interfaces:**
- Produces: `window.API` 全域物件，包含 `API.get()`, `API.post()`, `API.put()`, `API.delete()`。

- [x] **Step 1: 撰寫 `scripts/api.js`**

實作包含：
- 自動攔截並加上 `Authorization: Bearer ${Auth.getToken()}`。
- 支援 URLSearchParams 自動轉字串。
- 當 Response 狀態碼為 401 時，清空 session 並彈出提示轉回 `login.html`。
- 回傳標準 `{ success: true, data: ... }` 或拋出具備 message 的 Error 物件。

---

### Task 5: 前端 `index.html` 畫面改造與 API 串接

**Files:**
- Modify: `index.html`

- [x] **Step 1: 引入 `scripts/api.js` 與 `scripts/auth.js`**
在 `<head>` 或 `<body>` 底部確保先後載入：
```html
<script src="scripts/auth.js"></script>
<script src="scripts/api.js"></script>
```

- [x] **Step 2: 身分檢核與導覽列掛載**
在頁面初始化開頭：
```javascript
if (!Auth.requireAuth()) return;
Auth.renderNavbarUser('#navbarUserArea');
```

- [x] **Step 3: 動態載入部門下拉選單**
呼叫 `API.get('/api/departments')`，動態填充：
- `#filterDept` (來源廠篩選)
- `#filterTargetDept` (目的廠篩選)
- `#sourceDept` (新增調度單來源廠)
- `#modalTargetDept` (時段明細目的廠)
並觸發 Select2 更新。

- [x] **Step 4: 串接上半部調度列表查詢與篩選**
改造 `applyMasterFilter()`：
呼叫 `API.get('/api/dispatch-plans', queryParams)`，直接以 `$('#dispatchListTable').bootstrapTable('load', res.data)` 載入後端真實資料。

- [x] **Step 5: 串接調度單新增、編輯載入與更新**
- 新增儲存：點擊「儲存整張調度單」時，組裝 payload 呼叫 `API.post('/api/dispatch-plans', payload)`。
- 修改調度單：點擊清單中的「修改」按鈕時，呼叫 `API.get('/api/dispatch-plans/' + planNo)` 完整載入回填編輯器。編輯後儲存呼叫 `API.put('/api/dispatch-plans/' + planNo, payload)`。
- 刪除調度單：點擊「刪除」按鈕時，確認後呼叫 `API.delete('/api/dispatch-plans/' + planNo)`。

- [x] **Step 6: 人員排定前衝突防呆**
在將人員加入時段前或儲存前，調用 `API.post('/api/dispatch-plans/check-conflict')`，若有衝突即時於 UI 標紅警告。

---

### Task 6: 端到端綜合驗證與功能驗證

**Files:**
- Test: 瀏覽器手動操作與端到端流程

- [ ] **Step 1: 啟動伺服器並驗證登入與權限**
啟動服務 `node server.js`，開啟瀏覽器訪問 `http://localhost:3000/index.html`，驗證轉導至 `login.html`。
登入 `JM30448 / 123`，驗證正確返回 `index.html` 且導覽列顯示使用者資訊。

- [ ] **Step 2: 驗證動態組織選單與清單查詢**
確認來源廠與目的廠下拉選單正確由資料庫動態載入。

- [ ] **Step 3: 驗證新增調度單與防呆**
新增一張明日支援單據，指派同仁並儲存，確認清單即時顯示該單據。
嘗試建立同廠同日第二張調度單，確認被防呆攔截。

- [ ] **Step 4: 驗證修改與刪除**
修改剛建立的調度單，變更時段與用途並儲存，確認更新成功。
點選刪除，確認單據由有效清單中移除。
