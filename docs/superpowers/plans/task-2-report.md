# Task 2: 後端調度衝突檢驗與排程 API 升級 實作報告

- **狀態**: DONE
- **Commit Hash**: `837f352`
- **Commit Message**: `feat(api): implement time overlap detection in dispatch conflict endpoints`
- **修改檔案**:
  - `routes/dispatch.js`
  - `scripts/verify_dispatch_api.js`

---

## 實作內容摘要

1. **時間標準化與區間重疊比對工具函式 (`routes/dispatch.js`)**：
   - 實作 `normalizeTime(t)`：統一將 `HH:mm` 或 `HH:mm:ss` 格式轉為標準雙位數補零字串（如 `08:00`）。
   - 實作 `isTimeOverlap(s1, e1, s2, e2)`：依照規範公式 `s1 < e2 && e1 > s2` 進行比對。
   - 相接時段（如 `12:00 == 12:00`）判定為 `false`（合法通行，不重疊）；包含重疊時段（如 `08:00~12:00` 與 `10:00~14:00`）判定為 `true`（衝突重疊）。

2. **衝突檢驗 API 升級 (`POST /check-conflict`)**：
   - 擴充接收參數：`dispatchDate`, `startTime`, `endTime`, `empIds`, `excludePlanNo`。
   - SQL 查詢條件升級：當傳入 `startTime` 與 `endTime` 時，增加 `AND (i.StartTime < @endTime AND i.EndTime > @startTime)` 篩選。
   - 回傳明細擴充：在 `SELECT` 欄位加入 `CONVERT(VARCHAR(5), i.StartTime, 108) AS startTime, CONVERT(VARCHAR(5), i.EndTime, 108) AS endTime`，提供前端完整的衝突時段資訊。
   - 移除 `CheckInStatus <> 3` 排除條件：確保所有簽到狀態（包含異常 3）皆被視為佔用時段。
   - `memoryPlans` 備援模式同步實作時間區間重疊檢驗與全狀態額度鎖定。

3. **新增調度單 API 升級 (`POST /api/dispatch-plans`)**：
   - **單內自我重疊比對**：移除原本單純以工號為依據的單據唯一性檢查 (`distinctEmpIds.size < allEmpIds.length`)，改為檢核同一調度單內同一位同仁被排定的時段是否有區間重疊（`isTimeOverlap`）。允許同一位同仁在同日排定多個不重疊或相接的支援時段。
   - **跨單既有排程比對**：
     - SQL 模式：使用參數化查詢比對 `(d.EmpId IN (...) AND i.StartTime < @endTime AND i.EndTime > @startTime)`。
     - 移除 `CheckInStatus <> 3` 排除條件。
     - 若偵測到衝突，回傳 HTTP 400 Bad Request 與衝突清單。
   - **本地備援模式**：同步以 `isTimeOverlap` 比對 `memoryPlans`，無排除異常狀態。
   - **狀態保存**：在 Detail 寫入時保留 payload 之 `checkInStatus`（預設為 0）。

4. **修改調度單 API 升級 (`PUT /api/dispatch-plans/:planNo`)**：
   - **單內自我重疊比對**：檢查送出修改之 items，若同一同仁排入重疊時段即回傳 HTTP 400。
   - **跨單既有排程比對**：排除自身單號 (`m.PlanNo <> @currentPlanNo`)，並以時間區間重疊比對資料庫其他既有排程。
   - 移除 `CheckInStatus <> 3` 排除條件。
   - 本地備援模式同步實作區間比對與自我重疊檢核。

---

## 測試驗證結果 (TDD 流程)

### 1. 測試案例設計 (`scripts/verify_dispatch_api.js`)
整合測試新增了涵蓋所有邊界條件之測試案例：
- **情境 10 (Case A)**: 同一人同日非重疊時段 (`08:00~12:00` 與 `13:00~17:00`) -> 應成功儲存 (HTTP 200/201)。
- **情境 11 (Case B)**: 同一人同日重疊時段 (`08:00~12:00` 與 `10:00~14:00`) -> 驗證單內自我重疊阻擋 (HTTP 400)、衝突 API 檢出 (`check-conflict` 命中)、跨單重疊建單阻擋 (HTTP 400)。
- **情境 12 (Case C)**: 同一人同日相接時段 (`08:00~12:00` 與 `12:00~16:00`) -> 應成功儲存 (HTTP 200/201)，邊界時間無衝突。
- **情境 13 (Case D)**: 異常狀態 (`CheckInStatus = 3`) 人員排入重疊時段 -> `check-conflict` 檢出衝突，跨單重疊阻擋 (HTTP 400)。
- **情境 14 (Case E)**: 修改調度單 (PUT) 單內自我重疊阻擋 (HTTP 400) 與合法相接時段更新 (HTTP 200)。

### 2. TDD 紅燈階段 (修改前)
執行 `node scripts/verify_dispatch_api.js`：
```
❌ [FAIL] 情境 10 (Case A): 同一人同日非重疊時段 (08:00~12:00 與 13:00~17:00) 應成功儲存 (Status: 400, PlanNo: N/A, Message: 同一張調度單內同一位同仁不可被重複排入！)
❌ [FAIL] 情境 11 (Case B): 同一人同日重疊時段 (08:00~12:00 與 10:00~14:00) 預期 400 Bad Request
❌ [FAIL] 情境 12 (Case C): 同一人同日相接時段 (08:00~12:00 與 12:00~16:00) 應成功儲存
總測試項目數: 13, 成功: 10, 失敗: 3
```
確認舊程式因全日唯一限制阻擋了 Case A 與 Case C，且無法正確判定多時段衝突。

### 3. TDD 綠燈階段 (修改後)
執行 `node scripts/verify_dispatch_api.js`：
```
================================================================
  CPDS 調度排程模組 API 自動化整合測試
================================================================
✅ [PASS] 情境 1: 登入取得 JWT Bearer Token (POST /api/auth/login) (取得 Token 長度: 327)
✅ [PASS] 情境 2: 建立測試調度單 (POST /api/dispatch-plans) (成功產生單號: DP20261101-001)
✅ [PASS] 情境 3: 同廠同日重複建單防呆檢驗 (POST /api/dispatch-plans 重複) (Status: 409)
✅ [PASS] 情境 4: 跨廠人員排定衝突檢驗 (POST /api/dispatch-plans 衝突) (Status: 400)
✅ [PASS] 情境 5: 查詢調度單清單 (GET /api/dispatch-plans) (找到單據 DP20261101-001, 時段數: 1, 人數: 1)
✅ [PASS] 情境 6: 查詢單筆調度單完整明細 (GET /api/dispatch-plans/:planNo)
✅ [PASS] 情境 7: 修改調度單用途與時段 (PUT /api/dispatch-plans/:planNo)
✅ [PASS] 情境 8: 軟刪除調度單 (DELETE /api/dispatch-plans/:planNo)
✅ [PASS] 情境 9: 驗證刪除後狀態 (清單不顯示 & 衝突額度釋出)
✅ [PASS] 情境 10 (Case A): 同一人同日非重疊時段 (08:00~12:00 與 13:00~17:00) 應成功儲存 (Status: 200, PlanNo: DP20261102-001)
✅ [PASS] 情境 11 (Case B): 同一人同日重疊時段 (08:00~12:00 與 10:00~14:00) 預期 400 Bad Request (單內自我重疊阻擋: ✔, 衝突API檢出: ✔, 跨單重疊阻擋: ✔)
✅ [PASS] 情境 12 (Case C): 同一人同日相接時段 (08:00~12:00 與 12:00~16:00) 應成功儲存 (Status: 200, PlanNo: DP20261104-002, 邊界時段無衝突: ✔)
✅ [PASS] 情境 13 (Case D): 異常狀態 (CheckInStatus = 3) 人員排入重疊時段預期 400 Bad Request (單據建立: 200, 異常人員時段鎖定 (衝突檢核): ✔, 跨單重疊阻擋 (HTTP 400): ✔)
✅ [PASS] 情境 14: 修改調度單 (PUT) 單內自我重疊阻擋與合法時段更新 (PUT單內重疊阻擋: ✔, PUT相接合法更新: ✔)

================================================================
  測試執行統計總結
================================================================
  總測試項目數: 14
  成功項目數  : 14
  失敗項目數  : 0
================================================================
🎉 所有 14 項情境測試均全部通過！(Exit Code: 0)
```
