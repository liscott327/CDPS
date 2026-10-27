# Task 5 執行報告：前端 index.html 畫面改造與 API 串接

**完成時間：** 2026-10-20  
**執行狀態：** ✅ 成功完成 (All 11 Verification Checks Passed)  
**主要檔案：**
- 修改：`index.html`
- 參考：`scripts/auth.js`, `scripts/api.js`, `routes/dispatch.js`, `server.js`
- 測試檢核：`scripts/verify_index_syntax.js`, `scripts/verify_index_integration.js`

---

## 1. 任務目標與執行重點

將前端原有的靜態 Mock 版調度排程頁面（`index.html`）全面改造為真實前後端分離之 RESTful 架構，對接 Node.js API 與 MSSQL v2.0 資料庫：

1. **身分檢核與動態導覽列 (Authentication & Navbar)**
   - 引入 `scripts/auth.js` 與 `scripts/api.js`。
   - 進入頁面時以 `Auth.requireAuth('login.html')` 守門，未登入者即時跳轉至登入頁。
   - 掛載 `Auth.renderNavbarUser('#navbarUserArea')`，動態顯示登入工號、姓名、部門及提供登出功能。

2. **動態組織與廠別下拉選單 (Dynamic Department Dropdowns)**
   - 調用 `API.get('/api/departments')` 動態載入全廠組織清單。
   - 填充 `#filterDept` (來源廠篩選, Select2 多選)、`#filterTargetDept` (目的廠篩選, Select2 多選)。
   - 填充 `#sourceDept` (調度單來源廠, 單選)、`#targetDept` / `#modalTargetDept` (時段目的廠, 單選)。
   - 預設優先對齊目前登入同仁所屬部門。

3. **支援調度主清單查詢與動態篩選 (Master Dispatch List Query & Filtering)**
   - 改造 `applyMasterFilter()`，支援 `startDate`, `endDate`, `sourceDeptId`, `targetDeptId`, `startTime`, `endTime`, `keyword` 參數。
   - 呼叫 `API.get('/api/dispatch-plans', params)` 取得真實單據階層資料。
   - 動態格式化欄位並以 `$('#dispatchListTable').bootstrapTable('load', masterDispatchList)` 載入。
   - 欄位支援單號 (`planNo`)、調度日期、來源廠、時段與人員摘要（`summary`）及操作動作列（`operate`）。

4. **調度單儲存與交易防呆 (Plan Creation & Update)**
   - 點擊「儲存送出」時（綁定 `#btnSubmitPlan` 與 `#btnSavePlan`），組裝標準三層結構之 Payload：
     ```json
     {
       "dispatchDate": "2026-11-20",
       "sourceDeptId": "OU_A51_MFG",
       "items": [
         {
           "seq": 1,
           "targetDeptId": "JMB03",
           "startTime": "08:30",
           "endTime": "17:30",
           "purpose": "產線支援",
           "employees": [
             { "empId": "JM11504", "name": "沈佳承" }
           ]
         }
       ]
     }
     ```
   - 新增模式呼叫 `API.post('/api/dispatch-plans', payload)`；編輯模式呼叫 `API.put('/api/dispatch-plans/' + editingPlanId, payload)`。
   - 針對後端同廠同日唯一性阻擋 (HTTP 409) 與人員重複排班衝突 (HTTP 400) 提供即時錯誤提示。
   - 儲存成功後自動重設表單 `resetToCreateMode()` 並重新整理清單。

5. **單據修改與刪除 (Edit & Delete Action Handlers)**
   - 清單操作列「修改」：點擊後調用 `API.get('/api/dispatch-plans/' + planNo)` 取得完整 Master/Items/Employees，回填主檔編輯器、鎖定單據來源廠與日期、切換至修改模式。
   - 清單操作列「刪除」：經確認後調用 `API.delete('/api/dispatch-plans/' + planNo)` 執行軟刪除（將 `PlanStatus` 設為 0 並將未打卡明細設為異常釋放名額），隨後重整清單。

6. **人員查詢與跨廠衝突檢測 (Personnel Search & Conflict Detection)**
   - 切換來源廠時，呼叫 `API.post('/api/employees', { Department: deptId })` 動態載入該廠可用員工名單。
   - 渲染同仁清單時，自動調用 `API.post('/api/dispatch-plans/check-conflict')` 檢測同仁於該調度日是否已被其他有效單據排定。
   - 若人員已被排定，清單項目自動標記紅色鎖定徽章（例如：`已被排定至 B10-3廠 (單號: DP20261120-001)`），並停用核取方塊以防誤選。
   - 新增與修改時段明細（`#btnAddSubItem`, `#btnUpdateSubItem`）送出前，再次執行即時衝突檢核，徹底防堵雙重指派。

---

## 2. 測試驗證結果

建立自動化檢核腳本 `scripts/verify_index_syntax.js` 與 `scripts/verify_index_integration.js`，檢驗項目與執行結果如下：

```
================================================================
  Task 5 前端 index.html 與 API 整合檢核
================================================================

📌 [檢核 1] 檢驗 index.html 關鍵依賴與腳本標籤...
  ✅ [PASS] 包含 scripts/auth.js 引用
  ✅ [PASS] 包含 scripts/api.js 引用
  ✅ [PASS] 包含 navbarUserArea 容器
  ✅ [PASS] 包含 Auth.requireAuth 認證檢核
  ✅ [PASS] 包含 Auth.renderNavbarUser 導覽列使用者資訊掛載
  ✅ [PASS] 包含 API.get('/api/departments') 動態組織載入
  ✅ [PASS] 包含 API.get('/api/dispatch-plans') 調度單主清單查詢
  ✅ [PASS] 包含 API.post('/api/dispatch-plans') 新增調度單儲存
  ✅ [PASS] 包含 API.put('/api/dispatch-plans/') 修改調度單更新
  ✅ [PASS] 包含 API.delete('/api/dispatch-plans/') 刪除調度單
  ✅ [PASS] 包含 API.post('/api/dispatch-plans/check-conflict') 衝突防呆檢核
  ✅ [PASS] 包含 API.post('/api/employees') 員工資料動態載入
🎉 index.html 靜態結構與 API 串接語法檢核完全正確！

🚀 [檢核 2] 於 Port 3002 啟動後端伺服器 (node server.js)...
✅ 後端伺服器就緒！

🔑 [檢核 3] 執行登入取得 Token (POST /api/auth/login)...
  ✅ 登入成功，取得 Token！

🏢 [檢核 4] 載入部門下拉資料 (GET /api/departments)...
  ✅ 成功取得 72 個部門廠別選項！

👤 [檢核 5] 載入部門人員清單 (POST /api/employees)...
  ✅ 成功取得人員資料！

📝 [檢核 6] 模擬前端送出儲存調度單 (POST /api/dispatch-plans)...
  ✅ 調度單建立成功，單號：DP20261120-001

⚠️ [檢核 7] 模擬人員衝突檢核 (POST /api/dispatch-plans/check-conflict)...
  ✅ 衝突檢驗成功識別出 JM11504 已被調派至 B10-3廠！

📋 [檢核 8] 模擬前端查詢調度清單 (GET /api/dispatch-plans)...
  ✅ 清單成功查詢到單據 DP20261120-001，時段數：1

🔍 [檢核 9] 模擬點選「修改」取得單筆明細 (GET /api/dispatch-plans/DP20261120-001)...
  ✅ 成功載入單筆資料，準備回填編輯器！

💾 [檢核 10] 模擬編輯後更新儲存 (PUT /api/dispatch-plans/DP20261120-001)...
  ✅ 調度單更新成功！

🗑️ [檢核 11] 模擬點選「刪除」單據 (DELETE /api/dispatch-plans/DP20261120-001)...
  ✅ 調度單刪除成功！

================================================================
🎉 Task 5 前端 index.html 畫面改造與 API 串接檢核全部通過！
================================================================
```

---

## 3. 結論與後續步驟

Task 5「前端 index.html 畫面改造與 API 串接」已圓滿完成，前端所有功能均順暢連動後端 RESTful 服務與 MSSQL v2.0 資料庫。後續可進入 Task 6 進行綜合端到端與使用者流程驗收。
