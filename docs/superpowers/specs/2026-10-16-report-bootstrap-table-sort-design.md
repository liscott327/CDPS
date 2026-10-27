# report.html 表格欄位排序功能設計規格 (Bootstrap-Table)

## 1. 概述
本規格針對 CPDS 系統中的 `report.html` 報表查詢頁面進行重構，引進官方 Bootstrap-Table (CDN) 套件，將「跨廠調派明細總表」的全部 9 個欄位改為可點擊排序（支援升冪 / 降冪切換），並保持既有的多維度條件篩選、欄位自訂徽章渲染以及 CSV 匯出功能。

---

## 2. 外部依賴 (CDN)
在 `report.html` 中引入以下資源：
- **CSS**:
  - `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css` (既有)
  - `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.min.css` (既有)
  - `https://cdn.jsdelivr.net/npm/bootstrap-table@1.24.1/dist/bootstrap-table.min.css` (新增)
- **JavaScript**:
  - `https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js` (新增，Bootstrap-Table 依賴)
  - `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js` (既有)
  - `https://cdn.jsdelivr.net/npm/bootstrap-table@1.24.1/dist/bootstrap-table.min.js` (新增)
  - `https://cdn.jsdelivr.net/npm/bootstrap-table@1.24.1/dist/locale/bootstrap-table-zh-TW.min.js` (新增)

---

## 3. 表格欄位配置與排序規則

所有欄位均設置 `data-sortable="true"`。

| 欄位順序 | 欄位名稱 | `data-field` | 寬度 / 樣式 | 排序與格式化說明 (Formatter & Sorter) |
|---|---|---|---|---|
| 1 | 調派日期 | `dispatchDate` | `min-width: 110px` | 依照 YYYY-MM-DD 字串排序，粗體顯示 (`<span class="fw-bold">`) |
| 2 | 來源廠 → 目的廠 | `route` | `min-width: 160px` | 資料物件附加 `route = r.fromPlant + ' → ' + r.toPlant`；排序依此路徑字串；渲染來源廠與目的廠徽章 |
| 3 | 工號 | `empId` | `min-width: 90px` | 依工號英數排序，維持等寬字型 (`font-monospace text-secondary`) |
| 4 | 姓名 | `empName` | `min-width: 90px` | 依姓名文字排序，粗體顯示 (`fw-bold`) |
| 5 | 狀態 | `status` | `min-width: 100px` | 自訂排序器（按 0:待簽到、1:已簽到、2:已逾期、3:異常 代碼權重排序）；渲染 `getStatusBadge()` 徽章 |
| 6 | 調度時間起訖 | `dispatchTimeRange` | `min-width: 140px` | 依時間字串起訖排序（例：`10:00~11:30`），無值顯示 `-` |
| 7 | 簽到時間 | `checkinTime` | `min-width: 100px` | 自訂排序（空值置於末端，有效時間依時間先後排序）；以 `formatCheckinTime()` 格式化為 `HH:mm` |
| 8 | 確認人 | `receiverName` | `min-width: 110px` | 依確認人姓名排序，無值顯示 `-` |
| 9 | 備註與異常註記 | `anomalyNote` | 自適應 | 依字串長度與內容排序；無備註顯示 `-`，異常顯示紅色備註標籤 (`badge-anomaly-note`) |

---

## 4. 業務邏輯與流程設計

### 4.1 表格初始化與語系
- 於 DOMContentLoaded 或頁面載入時，針對 `#reportTable` 初始化 Bootstrap-Table。
- 啟用繁體中文語系 (zh-TW)，包含「沒有找到符合的記錄」等文字。

### 4.2 資料處理與狀態重算 (`getProcessedRecords`)
- 每次獲取資料時，先透過 `resolveRecordStatus(record)` 動態確認即時狀態（簽到超過 10 分鐘自動為已逾期 2）。
- 補齊每一筆紀錄的 `route` 欄位供路徑排序。

### 4.3 篩選與動態重載 (`applyReportFilters`)
- 讀取調派日期（起/迄）、來源廠、目的廠、狀態之篩選值。
- 過濾出符合的紀錄陣列後，呼叫 `$('#reportTable').bootstrapTable('load', filteredRecords)`。
- 即時更新查詢結果筆數統計：`共查詢到 X 筆資料 (總庫存 Y 筆)`。

### 4.4 匯出 CSV (`exportToCSV`)
- 讀取當前 Bootstrap-Table 排序/篩選後的資料集（所見即所得）。
- 包含 UTF-8 BOM 避免 Excel 開啟時中文亂碼。

---

## 5. 驗證標準
1. 表格所有 9 個欄位的表頭均顯示排序箭頭/游標手勢，點擊後可在升冪 (ASC) 與降冪 (DESC) 之間切換。
2. 日期、時間、工號、廠區路徑、狀態均能正確排序。
3. 搭配上方 5 個篩選條件時，篩選出的資料依然可隨時點擊欄位排序，不受影響。
4. 清空條件與匯出 Excel (CSV) 功能正常運作。
