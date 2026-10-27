# Task 3 實作與驗證報告：後端 API 整合測試腳本 (verify_dispatch_api.js)

**實作者**：Task 3 Implementer Subagent  
**執行日期**：2026-10-20  
**測試狀態**：✅ **全部通過 (9/9 通過，Exit Code: 0)**

---

## 1. 任務目標與範疇
為調度排程業務模組（`/api/dispatch-plans`）建立端到端自動化整合測試腳本 `scripts/verify_dispatch_api.js`，包含：
1. 自動檢測環境是否有執行中的 CPDS 伺服器；若無則自動在備用 Port (3001) 啟動測試用 Express 服務，並在測試完成後優雅退出釋放 Port。
2. 完整涵蓋 JWT 身分驗證、調度單 Master/Item/Detail 建立、同廠同日重覆防呆、同日跨廠人員排程衝突防呆、清單篩選查詢、單筆明細取回、單據修改交易、軟刪除（`PlanStatus = 0`）與刪除後衝突額度釋放等 9 大業務情境。
3. 確保測試具備冪等性（Idempotent），可重複執行且不殘留髒資料。

---

## 2. 相關異動檔案

| 檔案路徑 | 動作 | 說明 |
|---|---|---|
| [`scripts/verify_dispatch_api.js`](file:///d:/work/CPDS/scripts/verify_dispatch_api.js) | 新增 | 自動化 API 整合測試腳本，支援自啟伺服器、9 大情境檢驗、詳細格式化日誌與統計退出碼。 |
| [`routes/dispatch.js`](file:///d:/work/CPDS/routes/dispatch.js) | 修改 | 強化 `DELETE /:planNo` 於資料庫模式與本地備援模式下同步將 Detail 的 `CheckInStatus` 設為 3（異常釋放），並完善備援模式下的重複與衝突檢核。 |
| [`package.json`](file:///d:/work/CPDS/package.json) | 修改 | 新增 `"test:api": "node scripts/verify_dispatch_api.js"` 測試腳本捷徑。 |

---

## 3. 測試情境與執行結果

測試執行指令：
```bash
npm run test:api
# 或
node scripts/verify_dispatch_api.js
```

### 9 項測試情境結果表

| 項次 | 測試情境 | 呼叫端點 | 預期結果 | 實際測試結果 | 判定 |
|:---:|---|---|---|---|:---:|
| 1 | 登入取得 JWT Bearer Token | `POST /api/auth/login` | 200 OK，回傳有效 JWT 字串 | 取得 Token 長度 261 字元 | ✅ PASS |
| 2 | 建立測試調度單 | `POST /api/dispatch-plans` | 200/201，單號為 `DP20261101-NNN` | 成功建立單號 `DP20261101-003` | ✅ PASS |
| 3 | 同廠同日重複建單防呆 | `POST /api/dispatch-plans` | 409 Conflict，提示已存在調度單 | 狀態碼 409，提示【同廠同日限制】 | ✅ PASS |
| 4 | 跨廠人員排定衝突檢驗 | `POST /api/dispatch-plans` | 400 Bad Request，提示同仁已有排程 | 狀態碼 400，攔截 JM11504 衝突 | ✅ PASS |
| 5 | 查詢調度單清單 | `GET /api/dispatch-plans` | 200 OK，包含該單據且總人數為 1 | 找到單據，時段數 1，人數 1 | ✅ PASS |
| 6 | 查詢單筆調度單完整明細 | `GET /api/dispatch-plans/:planNo` | 200 OK，階層資料（目的廠與人員）完整吻合 | 單號與目的廠 JMB03 相符，人員為 JM11504 (沈佳承) | ✅ PASS |
| 7 | 修改調度單用途與時段 | `PUT /api/dispatch-plans/:planNo` | 200 OK，重新查詢反映變更 | 用途更新為「測試支援-已更新」，時段改為 08:30~17:30 | ✅ PASS |
| 8 | 軟刪除調度單 | `DELETE /api/dispatch-plans/:planNo` | 200 OK，回傳刪除成功 | 狀態碼 200，調度單已成功刪除 | ✅ PASS |
| 9 | 刪除後狀態驗證 | `GET /api/dispatch-plans` & `POST /api/dispatch-plans/check-conflict` | 清單不再出現該單據；且 `check-conflict` 顯示該員額度已釋放 | 清單已排除該單；JM11504 衝突完全釋放 (`conflicts: []`) | ✅ PASS |

---

## 4. 終端機執行輸出截圖記錄

```text
> test:api
> node scripts/verify_dispatch_api.js

================================================================
  CPDS 調度排程模組 API 自動化整合測試
================================================================

🚀 正在於 Port 3001 啟動後端伺服器 (node server.js)...
   [Server] CPDS 伺服器已啟動
  連線網址: http://localhost:3001
  資料庫設定檔: dbConfig.js
  資料庫狀態: 尚未嘗試連線
   [Server] ✅ [DB] LocalDB 資料庫連線成功！(Database: BPMTEST)
✅ 伺服器已於 Port 3001 成功就緒！

✅ [PASS] 情境 1: 登入取得 JWT Bearer Token (POST /api/auth/login) (取得 Token 長度: 261)
✅ [PASS] 情境 2: 建立測試調度單 (POST /api/dispatch-plans) (成功產生單號: DP20261101-003)
✅ [PASS] 情境 3: 同廠同日重複建單防呆檢驗 (POST /api/dispatch-plans 重複) (Status: 409, 提示: 【同廠同日限制】該廠於 2026-11-01 已存在有效調度單（單號：DP20261101-003），請直接進行修改！)
✅ [PASS] 情境 4: 跨廠人員排定衝突檢驗 (POST /api/dispatch-plans 衝突) (Status: 400, 提示: 選取的人員在調度當日已存在其他有效調派排程！)
✅ [PASS] 情境 5: 查詢調度單清單 (GET /api/dispatch-plans) (找到單據 DP20261101-003, 時段數: 1, 人數: 1)
✅ [PASS] 情境 6: 查詢單筆調度單完整明細 (GET /api/dispatch-plans/:planNo) (單號相符, 目的廠: JMB03, 人員: JM11504 (沈佳承))
✅ [PASS] 情境 7: 修改調度單用途與時段 (PUT /api/dispatch-plans/:planNo) (用途更新為: "測試支援-已更新", 時段: 08:30~17:30)
✅ [PASS] 情境 8: 軟刪除調度單 (DELETE /api/dispatch-plans/:planNo) (Status: 200, 訊息: 調度單已成功刪除)
✅ [PASS] 情境 9: 驗證刪除後狀態 (清單不顯示 & 衝突額度釋出) (清單已排除: ✔, 人員衝突已完全釋放: ✔)

🛑 正在關閉測試用伺服器...

================================================================
  測試執行統計總結
================================================================
  總測試項目數: 9
  成功項目數  : 9
  失敗項目數  : 0
================================================================

🎉 所有 9 項情境測試均全部通過！(Exit Code: 0)
```

---

## 5. 結論
Task 3「後端 API 整合測試腳本」已圓滿完成，所有 9 項端點業務情境在 LocalDB (BPMTEST) 真實資料庫環境下均正確通過驗證，退出碼為 0，可隨時作為 CI/CD 或後續前後端整合回歸之用。
