# CPDS 導覽列擴充與獨立調度單頁面實作計畫 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CPDS 頂部導覽列新增「臨時」與「移轉」按鈕，由 `index.html` 複製並建立「臨時調度單 (`temporay_dispatch.html`)」與「移轉調度單 (`transfer.html`)」獨立頁面，並同步各功能頁之導覽連結。

**Architecture:**

- 前端使用 Bootstrap 5 TabView 導覽列結構，於導覽列中新增對應連結。
- 複製現有 `index.html` 並依據單據型態調整頁面標題、查詢表單卡片標題、新增表單卡片標題及送出按鈕文字。
- 同步更新 `checkinlist.html` 與 `report.html` 導覽列以維持全系統一致性。

**Tech Stack:** HTML5, Bootstrap 5, Bootstrap Icons, JavaScript, Node.js (用於驗證腳本)

## Global Constraints

- 導覽列順序必須固定為：調度 (`index.html`) → 臨時 (`temporay_dispatch.html`) → 移轉 (`transfer.html`) → 簽到 (`checkinlist.html`) → 報表 (`report.html`)。
- 臨時調度單檔案名稱必須為 `temporay_dispatch.html`。
- 移轉調度單檔案名稱必須為 `transfer.html`。
- 臨時頁面的所有主標題與按鈕描述必須改為「臨時調度單」相關字眼。
- 移轉頁面的所有主標題與按鈕描述必須改為「移轉調度單」相關字眼。

---

### Task 1: 更新 `index.html` 導覽列 (Navbar)

**Files:**

- Modify: `D:\work\CPDS\index.html:61-77`

- [ ] **Step 1: 修改 `index.html` 導覽列**
在 `index.html` 中的導覽列 `<ul class="navbar-nav navbar-nav-tabs ...">` 區塊，於「調度」與「簽到」之間插入「臨時」與「移轉」項目：

```html
            <!-- 功能選單項目 (調度 / 臨時 / 移轉 / 簽到 / 報表) -->
            <ul class="navbar-nav navbar-nav-tabs me-auto ms-lg-4 mb-2 mb-lg-0">
                <li class="nav-item">
                    <a class="nav-link active d-flex align-items-center" aria-current="page" href="index.html"">
                        <i class="bi bi-arrow-left-right me-1"></i>調度
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link d-flex align-items-center" href="temporay_dispatch.html">
                        <i class="bi bi-clock-history me-1"></i>臨時
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link d-flex align-items-center" href="transfer.html">
                        <i class="bi bi-arrow-repeat me-1"></i>移轉
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link d-flex align-items-center" href="checkin.html">
                        <i class="bi bi-clipboard-check me-1"></i>簽到
                    </a>
                </li>
                <li class="nav-item">
                    <a class="nav-link d-flex align-items-center" href="report.html">
                        <i class="bi bi-file-earmark-bar-graph me-1"></i>報表
                    </a>
                </li>
            </ul>
```

- [ ] **Step 2: 驗證 `index.html` 導覽列內容**
檢查檔案確認包含 `temporay_dispatch.html` 與 `transfer.html`。

---

### Task 2: 建立並客製化「臨時調度單 (`temporay_dispatch.html`)」

**Files:**

- Create: `D:\work\CPDS\temporay_dispatch.html`

- [ ] **Step 1: 複製 `index.html` 至 `temporay_dispatch.html`**
以 `index.html` 為基底建立 `temporay_dispatch.html`。

- [ ] **Step 2: 修改 `temporay_dispatch.html` 文字與導覽狀態**

1. `<title>人員跨廠支援調度單 - CPDS</title>` 改為 `<title>臨時調度單 - CPDS</title>`。
2. 導覽列中：
   - 「調度」項移除 `active` 與 `aria-current="page"`。
   - 「臨時」項加入 `active` 與 `aria-current="page"`。
3. 查詢卡片標題：
   - `<i class="bi bi-funnel-fill text-primary me-2"></i>支援調度清單查詢與篩選`
   - 改為 `<i class="bi bi-funnel-fill text-primary me-2"></i>臨時調度清單查詢與篩選`。
4. 新增卡片標題：
   - `<i class="bi bi-plus-circle-fill text-success me-2"></i>新增人員跨廠支援調度單`
   - 改為 `<i class="bi bi-plus-circle-fill text-success me-2"></i>新增臨時調度單`。
5. 送出按鈕：
   - `<i class="bi bi-send-fill me-1"></i> 儲存並送出調度單`
   - 改為 `<i class="bi bi-send-fill me-1"></i> 儲存並送出臨時調度單`。

- [ ] **Step 3: 驗證 `temporay_dispatch.html` 內容**
確認字眼替換無遺漏且導覽列 active 位於「臨時」。

---

### Task 3: 建立並客製化「移轉調度單 (`transfer.html`)」

**Files:**

- Create: `D:\work\CPDS\transfer.html`

- [ ] **Step 1: 複製 `index.html` 至 `transfer.html`**
以 `index.html` 為基底建立 `transfer.html`。

- [ ] **Step 2: 修改 `transfer.html` 文字與導覽狀態**

1. `<title>人員跨廠支援調度單 - CPDS</title>` 改為 `<title>移轉調度單 - CPDS</title>`。
2. 導覽列中：
   - 「調度」項移除 `active` 與 `aria-current="page"`。
   - 「移轉」項加入 `active` 與 `aria-current="page"`。
3. 查詢卡片標題：
   - 改為 `<i class="bi bi-funnel-fill text-primary me-2"></i>移轉調度清單查詢與篩選`。
4. 新增卡片標題：
   - 改為 `<i class="bi bi-plus-circle-fill text-success me-2"></i>新增移轉調度單`。
5. 送出按鈕：
   - 改為 `<i class="bi bi-send-fill me-1"></i> 儲存並送出移轉調度單`。

- [ ] **Step 3: 驗證 `transfer.html` 內容**
確認字眼替換無遺漏且導覽列 active 位於「移轉」。

---

### Task 4: 同步更新 `checkinlist.html` 與 `report.html` 導覽列

**Files:**

- Modify: `D:\work\CPDS\checkinlist.html:90-106`
- Modify: `D:\work\CPDS\report.html:60-78`

- [ ] **Step 1: 更新 `checkinlist.html` 導覽列**
插入「臨時」與「移轉」導覽項，維持「簽到」為 active。

- [ ] **Step 2: 更新 `report.html` 導覽列**
插入「臨時」與「移轉」導覽項，維持「報表」為 active。

---

### Task 5: 執行自動化檢核與全站導航連結驗證

**Files:**

- Create: `D:\work\CPDS\scripts\verify_nav.js`

- [ ] **Step 1: 編寫驗證腳本 `scripts/verify_nav.js`**
檢查五個檔案：

1. 是否均存在。
2. 是否導覽列皆含五個指定分頁連結（`index.html`、`temporay_dispatch.html`、`transfer.html`、`checkinlist.html`、`report.html`）。
3. 各頁面對應之 active 狀態是否正確。
4. `temporay_dispatch.html` 是否含「臨時調度單」關鍵字。
5. `transfer.html` 是否含「移轉調度單」關鍵字。

- [ ] **Step 2: 執行驗證腳本**
執行 `node scripts/verify_nav.js` 並驗證全部 PASS。
