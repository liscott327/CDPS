# 跨廠人員調度與簽到系統 (CPDS) - 導覽列擴充與獨立調度單頁面規格設計

- **建立日期**: 2026-10-14
- **狀態**: 已核准 (Approved)

## 1. 背景與目標

現行 CPDS 系統首頁 `index.html` 為「人員跨廠支援調度單」。為了區分不同業務情境（如「臨時」調度與「移轉」調度），需要在頂部導覽列提供更細緻的單據分類導航，並建立獨立的「臨時調度單」頁面與「移轉調度單」頁面，讓使用者能依據不同的調度型態分別管理與填寫。

## 2. 頁面導航架構設計

### 2.1 導覽列 (Navbar TabView) 規範

在系統所有主功能頁面（`index.html`、`temporay_dispatch.html`、`transfer.html`、`checkinlist.html`、`report.html`）的導覽列中，統一設置下列 5 個功能分頁，維持全站一致性導覽體驗：

| 順序 | 項目名稱 | 導向檔案 | 圖示 (Bootstrap Icons) | 說明 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **調度** | `index.html` | `bi-arrow-left-right` | 原人員跨廠支援調度首頁 |
| 2 | **臨時** | `temporay_dispatch.html` | `bi-clock-history` | 臨時調度單管理與新增 |
| 3 | **移轉** | `transfer.html` | `bi-arrow-repeat` | 移轉調度單管理與新增 |
| 4 | **簽到** | `checkinlist.html` | `bi-clipboard-check` | 支援人員現場簽到點收清單 |
| 5 | **報表** | `report.html` | `bi-file-earmark-bar-graph` | 調度統計與點名報表 |

### 2.2 導覽列 HTML 範本

```html
<ul class="navbar-nav navbar-nav-tabs me-auto ms-lg-4 mb-2 mb-lg-0">
    <li class="nav-item">
        <a class="nav-link {active} d-flex align-items-center" href="index.html"">
            <i class="bi bi-arrow-left-right me-1"></i>調度
        </a>
    </li>
    <li class="nav-item">
        <a class="nav-link {active} d-flex align-items-center" href="temporay_dispatch.html">
            <i class="bi bi-clock-history me-1"></i>臨時
        </a>
    </li>
    <li class="nav-item">
        <a class="nav-link {active} d-flex align-items-center" href="transfer.html">
            <i class="bi bi-arrow-repeat me-1"></i>移轉
        </a>
    </li>
    <li class="nav-item">
        <a class="nav-link {active} d-flex align-items-center" href="checkin.html">
            <i class="bi bi-clipboard-check me-1"></i>簽到
        </a>
    </li>
    <li class="nav-item">
        <a class="nav-link {active} d-flex align-items-center" href="report.html">
            <i class="bi bi-file-earmark-bar-graph me-1"></i>報表
        </a>
    </li>
</ul>
```

各頁面依據當前載入檔案對應的項目標註 `class="nav-link active ..."` 與 `aria-current="page"`。

## 3. 獨立頁面規格與文字調整

### 3.1 `temporay_dispatch.html`（臨時調度單）

以 `index.html` 為基底複製並調整：

- **HTML Title**: `<title>臨時調度單 - CPDS</title>`
- **導覽列啟用項**: 「臨時」標籤為 active。
- **查詢卡片標題**: `<i class="bi bi-funnel-fill text-primary me-2"></i>臨時調度清單查詢與篩選`
- **新增卡片標題**: `<i class="bi bi-plus-circle-fill text-success me-2"></i>新增臨時調度單`
- **送出按鈕**: `<i class="bi bi-send-fill me-1"></i> 儲存並送出臨時調度單`
- **相關表單與清單字眼**: 將「支援調度」或「人員跨廠支援調度」對應更換為「臨時調度」。

### 3.2 `transfer.html`（移轉調度單）

以 `index.html` 為基底複製並調整：

- **HTML Title**: `<title>移轉調度單 - CPDS</title>`
- **導覽列啟用項**: 「移轉」標籤為 active。
- **查詢卡片標題**: `<i class="bi bi-funnel-fill text-primary me-2"></i>移轉調度清單查詢與篩選`
- **新增卡片標題**: `<i class="bi bi-plus-circle-fill text-success me-2"></i>新增移轉調度單`
- **送出按鈕**: `<i class="bi bi-send-fill me-1"></i> 儲存並送出移轉調度單`
- **相關表單與清單字眼**: 將「支援調度」或「人員跨廠支援調度」對應更換為「移轉調度」。

### 3.3 現存頁面更新

- `index.html`: 導覽列加入「臨時」與「移轉」項目，「調度」維持 active。
- `checkinlist.html`: 導覽列加入「臨時」與「移轉」項目，「簽到」維持 active。
- `report.html`: 導覽列加入「臨時」與「移轉」項目，「報表」維持 active。

## 4. 驗證與測試計畫

1. **導航連結完整性驗證**：
   - 於 `index.html` 點擊「臨時」能成功跳轉至 `temporay_dispatch.html`。
   - 於 `index.html` 點擊「移轉」能成功跳轉至 `transfer.html`。
   - 於所有 5 個頁面之間互相切換，確認所有分頁連結均正常，無 404 情況。
2. **視覺與標註驗證**：
   - 進入各分頁時，Navbar 對應的分頁是否正確呈現 `active` 高亮效果。
   - `temporay_dispatch.html` 頁面上的標題、查詢表單、新增表單及按鈕文字是否皆正確改為「臨時調度」相關字眼。
   - `transfer.html` 頁面上的文字是否皆正確改為「移轉調度」相關字眼。
