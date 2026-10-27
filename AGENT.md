# 跨廠人員調度與簽到系統 (CPDS)

這是一個用於規範各廠區間人員調度流程，建立「前日預排計畫」與「當日簽到點收」雙向核對機制的系統。
系統提供防呆排班檢核（避免人員重複調度）、防代簽作業（QR Code 掃描/核對），以及即時跨廠調度統計報表與資料匯出。

目前功能包含：

- **[T-1 前日] 跨廠人員調度計畫建立**：來源廠設定調度日期、選擇目的廠群組、挑選人員並即時進行衝突防呆
- **[T-0 當日] 人員簽到點收作業**：目的廠接收端進行到場人員掃碼/點名、處理異常狀態與臨時調派
- **[T-0 後] 調度簽到統計報表**：跨廠人員出勤與簽到現況即時統計、異常名單追蹤
- **報表匯出**：調度與簽到紀錄 Excel 匯出

---

## 專案結構

```text
CPDS/
│
├── index.html                           # [前端] 人員跨廠支援調度單 (建立調度計畫主畫面)
├── checkin.html                         # [前端] 當日人員簽到點收作業畫面 (規劃中)
├── report.html                          # [前端] 跨廠調度與簽到報表查詢畫面 (規劃中)
├── scripts/
│   ├── app.js                           # 前端共用函式、API 呼叫與 UI 互動邏輯
│   ├── checkin.js                       # 簽到點收作業邏輯
│   └── report.js                        # 報表篩選與 Excel 匯出邏輯
├── server.js                            # [後端] Node.js / Express API 伺服器
├── package.json                         # Node.js 專案設定與依賴套件
├── autorun.bat                          # Windows 啟動批次檔
├── db/
│   ├── schema.sql                       # 資料庫建表腳本 (DispatchPlan_Master / Detail)
│   └── seed.sql                         # 測試用種子資料
└── doc/
    └── 軟體功能規格書：跨廠人員調度與簽到系統.md  # 系統功能規格書
```

---

## 執行方式

### 1. 安裝依賴

進入專案目錄安裝必要之 Node.js 套件：

```bash
npm install
```

### 2. 啟動後端 API 伺服器

開發環境啟動：

```bash
npm run dev
```

正式環境啟動：

```bash
npm start
```

*預設使用 `nodemon server.js` 進行開發監聽，伺服器監聽於 `http://localhost:3000`。*

### 3. 開啟前端頁面

前端靜態頁面可直接由 Express 靜態託管，或透過本機 IIS / 靜態伺服器開啟：

- **調度計畫建立**：`/index.html`
- **當日簽到點收**：`/checkin.html`
- **調度報表查詢**：`/report.html`

若透過本機 IIS 或本機測試站台開啟，預設網址為：

- `http://localhost:8080/index.html`（或依照站台綁定 Port）

---

## IIS 部署設定

若部署於 Windows Server IIS，建議設定如下：

- **站台名稱**：`CPDS_Web`
- **實體路徑**：`D:\work\CPDS`
- **連接埠**：`8080` (或依廠區網段規範配置)
- **URL Rewrite**：後端 API 路由 (`/api/*`) 可透過 IIS Reverse Proxy 轉發至本機 Node.js 服務埠號 `3000`。

---

## 後端與資料庫設定

### 1. 後端環境

- **運行環境**：Node.js (LTS v18+ / v20+)
- **框架**：Express
- **資料存取套件**：`mssql` (SQL Server) 或 `tedious`

### 2. 資料庫連接設定

後端連線至 MS SQL Server，預設配置項目：

- **Server**：`192.168.0.212` (依環境設定)
- **Database**：`CPDS_DB`
- **監聽埠 (Port)**：`3000`
- **資料表結構**：
  - `DispatchPlan_Master`：記錄調度日期、來源廠、單據說明、建立人、建立時間。
  - `DispatchPlan_Detail`：記錄目的廠、派駐人員編號、姓名、任務用途、簽到狀態 (未到/已簽到/異常)、簽到時間、備註。

---

## 主要功能與 API 規範

### 1. 廠區與人員清單查詢

用於表單載入時取得廠區代碼以及來源廠人員清單。

- **取得廠區清單**：
  - `GET /api/plants`
  - 回傳：`[{ "id": "A5-1", "name": "A5-1廠" }, ...]`
- **取得廠區所屬人員清單**：
  - `GET /api/employees?plantId={plantId}`
  - 回傳：`[{ "empId": "JM30448", "name": "李奕諴", "dept": "資訊部" }, ...]`

### 2. 人員排班衝突防呆檢核 (情境 A5-1)

防呆機制：當來源廠挑選人員時，即時檢核該人員於「所選日期」是否已被排入其他調度計畫中。

- **檢查 API**：
  - `POST /api/dispatch/check-conflict`
  - 請求 Body：`{ "dispatchDate": "2026-10-13", "empIds": ["JM30448", "A0123"] }`
  - 回傳：衝突人員名單與已排定的目的廠。
- **UI 表現**：若已排定，該人員 Checkbox 自動設為 `disabled` 並標示「已排定至 X 廠」。

### 3. 調度計畫儲存與送出

由來源廠建立跨廠支援任務分組並一次性送出。

- **送出調度單 API**：
  - `POST /api/dispatch/plan`
  - 請求 Body：
    ```json
    {
      "DispatchDate": "2026-10-13",
      "SourcePlant": "A5-1",
      "Memo": "10月份產線跨廠支援調度",
      "Details": [
        {
          "targetPlantId": "B10-1",
          "purpose": "機台異常趕工支援",
          "employees": [
            { "empId": "A0123", "name": "王大明" }
          ]
        }
      ]
    }
    ```

### 4. 人員簽到點收作業 (情境 B10-1)

目的廠於當日進行到場人員確認與點名。

- **取得當日目的廠應到名單**：
  - `GET /api/dispatch/checkin-list?plantId={plantId}&date={date}`
- **人員簽到/刷碼 API**：
  - `POST /api/dispatch/checkin`
  - 支援 QR Code 掃描核身與人工點名狀態標註 (正常簽到、逾時未到、異常退回)。

### 5. 調度報表與 Excel 匯出

- **查詢調度統計報表**：
  - `GET /api/reports/dispatch-summary?dateFrom=...&dateTo=...`
- **匯出 Excel**：
  - `POST /api/export/excel`

---

## 相關文件

- 規格書：[軟體功能規格書：跨廠人員調度與簽到系統](file:///d:/work/PeopleInOutAdjust/%E8%BB%9F%E9%AB%94%E5%8A%9F%E8%83%BD%E8%A6%8F%E6%A0%BC%E6%9B%B8%EF%BC%9A%E8%B7%A8%E5%BB%A0%E4%BA%BA%E5%93%A1%E8%AA%BF%E5%BA%A6%E8%88%87%E7%B0%BD%E5%88%B0%E9%BB%9E%E6%94%B6%E7%B3%BB%E7%B5%B1%20f13e3ffed0268296a3b381691bf20618.md)
- 主畫面原形：[人員跨廠支援調度單 index.html](file:///d:/work/CPDS/index.html)

---

## 目前可再補強的地方

- [ ] **後端 API 服務建立**：建立 `server.js` 與 `package.json`，將目前 `index.html` 中的 mock 資料替換為真實 API。
- [ ] **簽到點收畫面實作**：補齊 `checkin.html` 之 UI 與 QR Code 掃描點收流程。
- [ ] **資料庫結構腳本**：撰寫 `DispatchPlan_Master` 與 `DispatchPlan_Detail` 的正式 SQL DDL。
- [ ] **環境變數抽離**：將資料庫連線資訊 (DB IP / 帳密) 與 API 埠號抽離至 `.env` 檔案。
- [ ] **身份驗證與廠區權限**：整合企業內部 SSO 或員工工號登入，預設自動帶入登入者所屬來源廠。
- [ ] **錯誤處理與防呆提醒**：強化網路異常、重複送出防護 (Debounce / Loading 狀態)。

---

## 備註

- 前端頁面目前使用 Bootstrap 5 與 Bootstrap Icons 樣式庫。
- 前端在獨立執行時可使用 Mock 模式測試流程，串接正式後端時將 `API_BASE_URL` 指向後端監聽位址 (如 `http://localhost:3000`)。
- 若部署至正式環境，跨來源請求 (CORS) 需於後端 Express 進行允許網段配置。
