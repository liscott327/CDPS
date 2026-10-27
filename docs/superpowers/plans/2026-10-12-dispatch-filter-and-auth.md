# 支援調度篩選與人員登入模組 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 CPDS 人員登入驗證模組（資料表 `CustCPDSUser` + 檢視表 `vw_ActiveUserMainFunction` 帶入部門代號 `DeptId`、獨立登入頁面 `login.html`、前端驗證守衛 `scripts/auth.js`）以及改版主頁面 `index.html` 實現上下分塊版面（上半部支援調度日期區間與部門篩選工具列、下半部自動鎖定並帶入登入者所屬部門）。

**Architecture:** 前端採用獨立 `login.html` 配合共用 `scripts/auth.js` 實現 JWT 儲存與路由守護；後端基於 Express 與 `mssql` 連線，透過 `POST /api/auth/login` 驗證 `CustCPDSUser` 帳密並查詢 `[BPMTEST].[dbo].[vw_ActiveUserMainFunction]` 獲取 `organizationUnitID` (`DeptId`) 與 `organizationUnitName` (`DeptName`)，簽發 JWT Token；`index.html` 重構為上下分塊版面，整合頂部身分欄、上半部篩選工具列與下半部調度單部門自動帶入。

**Tech Stack:** Node.js, Express, `mssql`, `jsonwebtoken`, Bootstrap 5, Bootstrap Icons, Vanilla JS, HTML5

## Global Constraints

- 不進行廠區代碼前綴提取，直接將 `organizationUnitID` 對應為 `DeptId`，`organizationUnitName` 對應為 `DeptName`。
- 後端調度單持久化查詢 API (`GET /api/dispatch/plans`) 與資料庫查詢本階段暫不實作，保留至下階段。
- 未登入進入受保護頁面（如 `index.html`）必須自動導向至 `login.html`。
- 登入成功後，`index.html` 下半部來源部門 (`sourceDept`) 必須自動鎖定為登入者的 `DeptId`。

---

### Task 1: 專案設定與後端身分驗證伺服器 (`server.js`)

**Files:**
- Modify: `package.json`
- Create: `server.js`

**Interfaces:**
- Produces:
  - `POST /api/auth/login` (Body: `{ empId, password }` -> `{ success, token, user: { empId, name, deptId, deptName, title } }`)
  - `GET /api/auth/me` (Header: `Authorization: Bearer <token>` -> `{ success, user }`)
  - Static file hosting for root directory

- [ ] **Step 1: 更新 package.json 確保 jsonwebtoken 依賴**

在 `package.json` 中加入 `"jsonwebtoken"` 依賴項。

- [ ] **Step 2: 建立 `server.js` 實作資料庫連線與驗證 API**

實作 Express 伺服器，設定 CORS、靜態目錄託管、資料庫連線池（支援從環境變數或預設配置讀取，若 DB 無法連線提供開發環境 fallback/mock 驗證以確保前端可順利開發測試），以及 `/api/auth/login` 與 `/api/auth/me` 路由。

```javascript
// server.js 核心登入邏輯片段
app.post('/api/auth/login', async (req, res) => {
    const { empId, password } = req.body;
    if (!empId || !password) {
        return res.status(400).json({ success: false, message: '請輸入員工工號與密碼' });
    }
    // 1. 查詢 CustCPDSUser
    // 2. 查詢 [BPMTEST].[dbo].[vw_ActiveUserMainFunction] 取得 organizationUnitID, organizationUnitName, functionDefinitionName
    // 3. 簽發 JWT Token
    // 4. 回傳 token 與 user
});
```

- [ ] **Step 3: 驗證後端啟動與 API 路由**

以 `node server.js` 啟動並使用 PowerShell `Invoke-RestMethod` 測試 `/api/auth/login`，確認正確回傳或適當錯誤處理。

---

### Task 2: 前端身分驗證守門員模組 (`scripts/auth.js`)

**Files:**
- Create: `scripts/auth.js`

**Interfaces:**
- Produces:
  - `Auth.getToken(): string | null`
  - `Auth.getUser(): object | null`
  - `Auth.setAuth(token, user): void`
  - `Auth.clearAuth(): void`
  - `Auth.requireAuth(redirectUrl): boolean`
  - `Auth.renderNavbarUser(containerSelector): void`
  - `Auth.logout(): void`

- [ ] **Step 1: 建立 `scripts/auth.js` 模組**

封裝 `sessionStorage` 存取、登入狀態檢核與跳轉邏輯、頂部使用者資訊條渲染（呈現姓名、部門代號/名稱與登出按鈕）。

- [ ] **Step 2: 驗證 `scripts/auth.js` 邏輯**

確認 `requireAuth()` 在無 Token 時正確執行跳轉，有 Token 時能解析出 `deptId` 與 `deptName`。

---

### Task 3: 獨立登入頁面實作 (`login.html`)

**Files:**
- Create: `login.html`

**Interfaces:**
- Consumes:
  - `POST /api/auth/login`
  - `scripts/auth.js` (`Auth.setAuth`)

- [ ] **Step 1: 建立 `login.html` 畫面**

使用 Bootstrap 5 構建具美感的卡片式登入畫面，包含系統名稱、工號輸入框 (`empId`)、密碼輸入框 (`password`)、登入按鈕與錯誤提示 Alert。

- [ ] **Step 2: 綁定 AJAX 登入事件**

點擊登入時呼叫 `/api/auth/login`，成功後寫入 Auth 狀態並跳轉至 `index.html`；失敗時顯示錯誤原因。

- [ ] **Step 3: 測試登入頁面流程**

開啟瀏覽器或呼叫測試，驗證帳密輸入驗證與跳轉流程。

---

### Task 4: 改版 `index.html` 上下分塊版面與篩選工具列

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes:
  - `scripts/auth.js` (`Auth.requireAuth`, `Auth.getUser`, `Auth.renderNavbarUser`)
- Produces:
  - Upper section: 篩選工具列（`filterStartDate`, `filterEndDate`, `filterDept` 以 `DeptId` 為選項值, `filterKeyword`, 查詢/重設按鈕）及調度單紀錄表格。
  - Lower section: 調度單建立表單，來源部門（`sourceDept`）自動鎖定並帶入登入者之 `DeptId`。

- [ ] **Step 1: 引入 `scripts/auth.js` 並執行身分檢查**

頁面頂部載入 `auth.js`，並於 `DOMContentLoaded` 執行 `Auth.requireAuth('login.html')`。

- [ ] **Step 2: 建立頂部 Navbar 與上半部篩選卡片**

在 `index.html` 頂端新增導覽列，並於原表單上方建立上半部卡片：
- 調度日期區間（起日～訖日）
- 所屬部門選單（以 `DeptId` 為值）
- 關鍵字搜尋輸入框
- 查詢與重設按鈕
- 調度紀錄清單表格（展示單號、調度日期、來源部門 `DeptName`、目的部門/廠區、人數、狀態、操作）

- [ ] **Step 3: 下半部調度表單改動（改為部門代號連動）**

將原來的「來源廠 (`sourcePlant`)」改為「來源部門 (`sourceDept`)」，在登入後自動帶入登入者之 `DeptId` 與 `DeptName`，並將輸入框設為唯讀/鎖定。

- [ ] **Step 4: 實作上半部篩選互動邏輯**

點擊「查詢」時，依所選日期區間、部門 (`DeptId`)、關鍵字對表格資料進行過濾；點擊「重設」恢復預設值。

---

### Task 5: 整合端到端測試與驗證

- [ ] **Step 1: 啟動伺服器服務**
- [ ] **Step 2: 測試未登入進入 `index.html` 是否自動重導向到 `login.html`**
- [ ] **Step 3: 測試於 `login.html` 輸入工號與密碼完成登入並導向 `index.html`**
- [ ] **Step 4: 檢查 `index.html` 頂部是否正確顯示當前使用者姓名與所屬部門 (`DeptId` / `DeptName`)**
- [ ] **Step 5: 檢查下半部調度表單是否自動鎖定登入者來源部門**
- [ ] **Step 6: 測試上半部篩選工具列（日期區間、部門下拉、關鍵字過濾與重設）功能正常**
