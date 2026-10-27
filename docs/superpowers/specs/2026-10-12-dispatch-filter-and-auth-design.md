# 系統規格設計：支援調度篩選與人員登入模組 (CPDS)

## 1. 概述 (Overview)
本文件定義跨廠人員調度與簽到系統 (CPDS) 之核心規格：
1. **主頁面 (`index.html`) 上下分塊版面改版與篩選工具列**：
   - 上半部：新增「調度日期區間（起日～訖日）」、「所屬部門（DeptId 下拉）」與「關鍵字」篩選工具列，並配置調度清單紀錄表格。
   - 下半部：保留原有支援調度單建立表單，登入後自動帶入登入者之所屬部門 (`DeptId`)。
   - *(註：後端調度單查詢 API 與完整資料庫查詢結構保留至下階段再行決定與實作，本階段聚焦前端篩選介面佈局與資料連動)*。
2. **人員登入與身分驗證模組**：
   - 獨立登入頁面 (`login.html`)。
   - 後端驗證帳密主檔 `CustCPDSUser`，並直接關聯 `[BPMTEST].[dbo].[vw_ActiveUserMainFunction]` 取得部門代號 (`DeptId`)、部門名稱 (`DeptName`) 與職務。
   - 不須額外提取廠區代碼，全面改以部門代號 (`DeptId`) 進行對應與辨識。
   - 採用 JWT 進行身分驗證與前端路由保護 (`scripts/auth.js`)。

---

## 2. 人員登入模組架構設計 (Authentication Module)

### 2.1 資料庫設計與資料來源
1. **使用者帳密主檔 (`CustCPDSUser`)**：
   - `EmpId` (VARCHAR/NVARCHAR)：員工工號 (主鍵，對應 View 的 userID)
   - `Name` (NVARCHAR)：員工姓名
   - `Password` (VARCHAR/NVARCHAR)：員工登入密碼

2. **部門與職務來源檢視表 (`[BPMTEST].[dbo].[vw_ActiveUserMainFunction]`)**：
   ```sql
   SELECT [userID]
         ,[userName]
         ,[organizationUnitID]
         ,[organizationUnitName]
         ,[functionDefinitionName]
     FROM [BPMTEST].[dbo].[vw_ActiveUserMainFunction]
   ```
   - **關聯與對應方式**：
     - 使用者於 `CustCPDSUser` 驗證帳號密碼成功後。
     - 透過 `EmpId = [userID]` 查詢對應之 `[organizationUnitID]`、`[organizationUnitName]` 及 `[functionDefinitionName]`。
     - **直接對應**：將 `[organizationUnitID]` 直接作為系統中的部門代號 **`DeptId`**，將 `[organizationUnitName]` 作為部門名稱 **`DeptName`**，**不進行任何廠區代碼前綴提取**。

### 2.2 後端 API 規格 (`server.js`)
1. **登入驗證 API**：
   - **路由**：`POST /api/auth/login`
   - **Request Body**：
     ```json
     {
       "empId": "JM30448",
       "password": "userPassword"
     }
     ```
   - **處理流程**：
     - 比對 `CustCPDSUser` 中對應之 `EmpId` 與密碼。
     - 查詢 `[BPMTEST].[dbo].[vw_ActiveUserMainFunction]` 取得 `organizationUnitID` (`deptId`)、`organizationUnitName` (`deptName`) 與職稱。
     - 簽發 JWT Token（有效期限可設為 8~12 小時，Payload 包含 `empId`, `name`, `deptId`, `deptName`）。
   - **Response Body (200 OK)**：
     ```json
     {
       "success": true,
       "token": "eyJhbGciOi...",
       "user": {
         "empId": "JM30448",
         "name": "李奕諴",
         "deptId": "OU_A51_IT",
         "deptName": "A5-1廠 資訊部",
         "title": "軟體工程師"
       }
     }
     ```

2. **目前登入者資訊 API**：
   - **路由**：`GET /api/auth/me`
   - **Header**：`Authorization: Bearer <token>`
   - **Response**：解析 Token 並回傳目前登入者之 `empId`, `name`, `deptId`, `deptName`, `title`。

3. **登出**：
   - 前端清除 Storage 即可；後端預留 `POST /api/auth/logout`。

### 2.3 前端驗證共用模組 (`scripts/auth.js`)
- **身分檢查守衛 (`checkAuth()`)**：進入受保護頁面（如 `index.html`）時，若 Token 不存在或已過期，自動轉向 `login.html`。
- **使用者狀態管理**：提供 `getUserInfo()` 取得當前使用者的 `empId`, `name`, `deptId`, `deptName`。
- **導覽列整合 (`renderNavbarUser()`)**：在頁面頂端右上角動態渲染：`👤 [員工姓名] (部門名稱 / DeptId)` 及 `[登出按鈕]`。
- **API 請求封裝 (`authFetch()`)**：發送請求時自動附加 `Authorization: Bearer <token>`。

---

## 3. 獨立登入頁面規格 (`login.html`)
- **視覺版型**：採用 Bootstrap 5 簡約卡片式設計，置中對齊。
- **欄位要素**：
  - 系統標題：跨廠人員調度與簽到系統 (CPDS)
  - 員工工號 (Input: `empId`)
  - 密碼 (Input: `password`)
  - 登入按鈕 (Submit Button)
  - 錯誤提醒 Alert（工號或密碼錯誤、帳號未授權等即時提示）
- **互動流程**：送出後透過 AJAX 呼叫 `/api/auth/login`，驗證成功後將 Token 與使用者資訊存入 `sessionStorage` 並跳轉至 `index.html`。

---

## 4. 主頁面上下分塊改版規格 (`index.html`)

### 4.1 頁面佈局 (上下分塊)
- **頂部導覽列 (Navbar)**：
  - 系統 Logo 與名稱
  - 右側顯示：`👤 [李奕諴] (A5-1廠 資訊部 / OU_A51_IT)` + `[登出按鈕]`
- **上半部：調度清單查詢與篩選工具列 (Filter & Query List)**：
  - **篩選條件卡片**：
    - 調度日期起日 (Date Input: `filterStartDate`)
    - 調度日期訖日 (Date Input: `filterEndDate`)
    - 所屬部門選單 (Select: `filterDept`，以 `DeptId` 為選項值，預設為「全部部門」或登入者所屬部門)
    - 關鍵字搜尋 (Input: `filterKeyword`，支援單號、備註或人員關鍵字)
    - 操作按鈕：`[ 🔍 查詢 ]`、`[ 🔄 重設 ]`
  - **調度單紀錄清單表格**：
    - 欄位：調度單號、調度日期、來源部門 (`DeptName`)、目的群組與人數、備註說明、狀態、操作。
    - *(本階段以前端介面展示與篩選過濾為主，後端正式持久化查詢 API 保留至下階段)*。
- **下半部：新增調度計畫表單 (Create Dispatch Plan)**：
  - 保留原有「人員跨廠支援調度單」建立流程。
  - **自動帶入所屬部門**：使用者登入後，**來源部門 (`DeptId`)** 自動帶入登入者之部門，並標註對應之 `DeptName`。
  - 挑選調派人員與支援分組後送出儲存。

---

## 5. 調度單後端查詢 API（階段劃分說明）
> [!NOTE]
> 依據需求確認，調度單後端查詢 API (`GET /api/dispatch/plans`) 與資料庫正式查詢結構**暫不於本階段施作，保留至下一階段再行決定**。
> 本階段專注於：
> 1. 人員登入模組 (`CustCPDSUser` 帳密驗證 + `vw_ActiveUserMainFunction` 部門代號 `DeptId` 綁定 + JWT 認證)。
> 2. `index.html` 上下分塊版面建置、上半部篩選工具列（日期起訖、部門選單、關鍵字）與下半部來源部門自動帶入。

---

## 6. 驗證與測試策略
1. **登入驗證測試**：
   - 驗證以 `CustCPDSUser` 帳號密碼登入，確認後端自 `[vw_ActiveUserMainFunction]` 正確取得 `organizationUnitID` (`DeptId`) 與 `organizationUnitName` (`DeptName`)。
   - 驗證未授權或無 Token 進入 `index.html` 時是否自動跳轉回 `login.html`。
2. **部門代號帶入測試**：
   - 登入後進入 `index.html`，檢查頂部導覽列是否正確顯示登入者姓名與部門代號/名稱。
   - 檢查下半部調度單建立表單之來源部門是否自動帶入登入者之 `DeptId`。
3. **篩選工具列測試**：
   - 測試上半部調度日期起日、訖日與部門選單（`DeptId`）之互動反應與重設功能。
