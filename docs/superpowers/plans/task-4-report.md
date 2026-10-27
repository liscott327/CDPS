# Task 4 實作與驗證報告：前端共用原生 API Client (scripts/api.js)

**實作者**：Task 4 Implementer Subagent  
**執行日期**：2026-10-20  
**測試狀態**：✅ **全部通過 (9/9 通過，Exit Code: 0)**  
**報告檔案**：`docs/superpowers/plans/task-4-report.md`

---

## 1. 任務目標與範疇
為 CPDS 前端建立高內聚、零外部依賴、同時相容瀏覽器 (`window.API`) 與 Node.js 執行環境之通用 API 封裝模組 [`scripts/api.js`](file:///d:/work/CPDS/scripts/api.js)，提供：
1. **JWT 憑證自動注入**：
   - 優先讀取 `window.Auth?.getToken()`，備援讀取 `sessionStorage.getItem('cpds_auth_token')`。
   - 若呼叫方未手動設定 `Authorization` Header 且存在 Token，自動注入 `Authorization: Bearer ${token}`。
2. **Payload 與 Header 自動標準化**：
   - 偵測 Request Body 若為物件 (Object) 且非 FormData / Blob 等特殊型別，自動序列化為 JSON 字串並設定 `Content-Type: application/json`。
   - 預設附帶 `Accept: application/json, text/plain, */*`。
3. **401 未授權攔截**：
   - 當回應狀態碼為 401 時，自動清除身分憑證 (`window.Auth?.clearAuth()` 或清除 `sessionStorage`)。
   - 若在瀏覽器環境，自動跳出逾時警示訊息並轉導至 `login.html`。
4. **統一錯誤處理與回應解析**：
   - 自動解析 JSON 或純文字回應，支援 HTTP 204 No Content 空內容。
   - 當 HTTP 狀態非 2xx 或回應內容包含 `data.success === false` 時，自動建構並拋出包含 `err.status` 與 `err.data` 之 `Error` 物件。
5. **快捷語法支援**：
   - `API.get(url, params, options)`：支援 `URLSearchParams`，正確序列化純字串、數值及陣列參數（例如 `sourceDeptId: ['A', 'B']` 序列化為 `sourceDeptId=A,B`），並相容原 URL 既有的 Query String。
   - `API.post(url, body, options)`
   - `API.put(url, body, options)`
   - `API.delete(url, options)` / `API.del(url, options)`

---

## 2. 相關新增與異動檔案

| 檔案路徑 | 動作 | 說明 |
|---|---|---|
| [`scripts/api.js`](file:///d:/work/CPDS/scripts/api.js) | 新增 | 輕量原生 API Client 模組，暴露至全域 `window.API`，亦支援 CommonJS `module.exports`。 |
| [`scripts/verify_api_client.js`](file:///d:/work/CPDS/scripts/verify_api_client.js) | 新增 | 自動化單元與整合測試腳本，涵蓋 9 大核心功能與邊界情境檢驗。 |
| [`package.json`](file:///d:/work/CPDS/package.json) | 修改 | 新增 `"test:client": "node scripts/verify_api_client.js"` 測試捷徑。 |

---

## 3. 測試情境與執行結果

測試執行指令：
```bash
npm run test:client
# 或
node scripts/verify_api_client.js
```

### 9 項單元測試情境檢驗表

| 項次 | 測試情境 | 檢驗重點 | 預期結果 | 實際結果 | 判定 |
|:---:|---|---|---|---|:---:|
| 1 | 介面完整性檢查 | `request`, `get`, `post`, `put`, `delete`, `buildUrlWithParams` | 全部方法型態為 function | 全部方法均存在且為 function | ✅ PASS |
| 2 | Query Parameter 序列化 | 陣列合併（如 `['OU_A', 'OU_B']`）、空值過濾、既有 `?` 附加 | `sourceDeptId=OU_A%2COU_B`，正確串接既有 URL | 序列化格式完全符合預期 | ✅ PASS |
| 3 | GET 請求發送 | URL 與參數組裝、HTTP Method 設定 | 發送 GET，回傳 JSON 資料 | URL 帶 QueryString，Method 為 GET | ✅ PASS |
| 4 | POST 請求發送 | Body 自動 JSON 序列化與 Header 設定 | `Content-Type: application/json`，Body 為字串 | Header 與 Body 序列化均正確 | ✅ PASS |
| 5 | PUT 與 DELETE 方法 | Method 與 Body 正確性 | PUT 帶 Method='PUT'，DELETE 帶 Method='DELETE' | Method 正確帶入 Fetch 呼叫 | ✅ PASS |
| 6 | Token 自動注入機制 | `window.Auth.getToken` 優先、`sessionStorage` 備援、手動 Header 不覆寫 | 帶 `Authorization: Bearer <token>` | 優先級與備援機制運作正常 | ✅ PASS |
| 7 | 401 攔截與轉導 | Token 清除、`alert` 訊息與 `location.replace('login.html')` | 呼叫 clearAuth，alert 提示並導向登入頁，拋出 401 Error | 憑證清除與轉導動作確實觸發 | ✅ PASS |
| 8 | 統一錯誤拋出封裝 | HTTP 400、HTTP 500 (HTML)、HTTP 200 業務失敗 (`success: false`) | 均正確包裝 `err.status` 與 `err.data` 並拋出 | 錯誤狀態與錯誤訊息完全一致 | ✅ PASS |
| 9 | 邊界回應情境支援 | HTTP 204 No Content (空 Body) 與原生 Array 回應 | 204 回傳 null 不拋錯；原生 Array 直接回傳 | 正常解析無語法例外 | ✅ PASS |

---

## 4. 終端機執行輸出截圖記錄

```text
> test:client
> node scripts/verify_api_client.js

================================================================
  開始執行 scripts/api.js 模組驗證測試
================================================================

  [PASS] Test 1: API 物件包含所有必要函式介面
  [PASS] Test 2: buildUrlWithParams 正確處理字串、數值、空值與陣列格式
  [PASS] Test 3: API.get 能正確組裝網址並發送 GET 請求
  [PASS] Test 4: API.post 自動序列化 Body 為 JSON 且設置 Content-Type: application/json
  [PASS] Test 5: API.put 與 API.delete 正確設定 HTTP Method
  [PASS] Test 6: 自動注入 Authorization: Bearer <token> (支援 window.Auth 與 sessionStorage)
  [PASS] Test 7: 401 攔截器自動清空 Auth 憑證，並執行 alert 與跳轉至 login.html
  [PASS] Test 8: 錯誤統一包裝：非 2xx 或 success: false 正確附加 err.status 與 err.data 並拋出
  [PASS] Test 9: 支援 HTTP 204 No Content 空內容與標準 RESTful 陣列回應

================================================================
  驗證完成: 全部 9/9 項測試成功通過！
================================================================
```

---

## 5. 整合與相容性檢驗
同步執行既有後端整合測試腳本 `npm run test:api`，確認新模組未對既有後端路由造成任何負面影響：
```bash
npm run test:api
# 結果：所有 9 項情境測試均全部通過！(Exit Code: 0)
```

---

## 6. 結論
Task 4「前端共用原生 API Client (`scripts/api.js`)」已全數開發完成。此模組提供了乾淨、零依賴且具備自動化身分驗證注入與 401 攔截的輕量客戶端，為 Task 5（`index.html` 畫面改造與 API 串接）打下堅固的基礎。
