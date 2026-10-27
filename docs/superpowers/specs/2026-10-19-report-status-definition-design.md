# CPDS 報表狀態定義與逾期簽到機制設計規格書

## 1. 概述
本文件針對 CPDS 系統之報表查詢畫面 (`CPDS/report.html`) 進行狀態定義重構與畫面功能調整：
1. **新增「逾期簽到」狀態**：簽到時間超過調度起始時間 10 分鐘以上才簽到者。
2. **重新定義「已逾期」狀態**：超過調度起始時間後超過 10 分鐘仍未到者。
3. **報表多維度篩選、表格呈現、排序與匯出同步升級**。

---

## 2. 狀態模型與規格定義 (Status Model)

| 狀態代碼 | 狀態名稱 | 定義條件 | 徽章樣式 (Badge) |
|---|---|---|---|
| `0` | **待簽到** | 尚未簽到，且當前時間未超過調度起始時間 + 10 分鐘 | `<span class="badge bg-secondary badge-status"><i class="bi bi-hourglass-split me-1"></i>待簽到</span>` |
| `1` | **已簽到** | 有簽到時間，且 $\text{簽到時間} \le \text{起始時間} + 10 \text{ 分鐘}$ | `<span class="badge bg-success badge-status"><i class="bi bi-check-circle me-1"></i>已簽到</span>` |
| `2` | **逾期簽到** | 有簽到時間，且 $\text{簽到時間} > \text{起始時間} + 10 \text{ 分鐘}$ | `<span class="badge bg-warning text-dark badge-status"><i class="bi bi-clock-history me-1"></i>逾期簽到</span>` |
| `3` | **異常** | 人員體溫異常、未報到失聯請假等經確認人標註為異常 | `<span class="badge bg-warning text-dark badge-status"><i class="bi bi-exclamation-triangle-fill me-1"></i>異常</span>` |
| `4` | **已逾期** | 尚未簽到，且當前時間已超過調度起始時間 + 10 分鐘仍未到者 | `<span class="badge bg-danger badge-status"><i class="bi bi-x-circle me-1"></i>已逾期</span>` |

---

## 3. 核心演算法邏輯 (`resolveRecordStatus`)

### 3.1 簽到是否逾期判定 (`isCheckinOverdue`)
- 輸入：`checkinTime` (例如 `"10:15"`), `dispatchTimeRange` (例如 `"10:00~11:30"`)
- 計算：
  - 取出 `dispatchTimeRange` 起始時間轉為分鐘數：`startMinutes`
  - 取出 `checkinTime` 轉為分鐘數：`checkinMinutes`
  - 若 $\text{checkinMinutes} > \text{startMinutes} + 10$，回傳 `true`；否則回傳 `false`。

### 3.2 未簽到是否逾期判定 (`isNotCheckedInOverdue`)
- 輸入：`dispatchDate` (例如 `"2026-10-15"`), `dispatchTimeRange` (例如 `"10:00~11:30"`)
- 計算：
  - 取出起始時間並將 `dispatchDate` 與起始時間組合為時間物件：
    $$\text{startDateTime} = \text{new Date(`${formattedDate}T${startTime}:00`)}$$
  - 計算逾期基準點：
    $$\text{overdueThreshold} = \text{new Date(startDateTime.getTime() + 10 * 60 * 1000)}$$
  - 比對當前時間：若 $\text{new Date()} > \text{overdueThreshold}$，回傳 `true`（已逾期）；否則回傳 `false`。

### 3.3 狀態解析函式 (`resolveRecordStatus(record)`)
1. 若 `String(record.status) === '3'` 或 `record.status === 'Anomaly'`，回傳 `'3'`。
2. 若 `record.checkinTime` 存在：
   - 呼叫 `isCheckinOverdue(record.checkinTime, record.dispatchTimeRange)`：
     - 若為 `true` $\rightarrow$ 回傳 `'2'`（逾期簽到）。
     - 若為 `false` $\rightarrow$ 回傳 `'1'`（已簽到）。
3. 若 `record.checkinTime` 不存在：
   - 呼叫 `isNotCheckedInOverdue(record.dispatchDate, record.dispatchTimeRange)`：
     - 若為 `true` $\rightarrow$ 回傳 `'4'`（已逾期）。
     - 若為 `false` $\rightarrow$ 回傳 `'0'`（待簽到）。

---

## 4. 畫面元件與連動更新 (UI Integration)

1. **多維度篩選選單 (`#filterStatus`)**：
   ```html
   <select class="form-select" id="filterStatus" multiple="multiple" data-placeholder="請選擇狀態...">
     <option value="0">待簽到</option>
     <option value="1">已簽到</option>
     <option value="2">逾期簽到</option>
     <option value="4">已逾期</option>
     <option value="3">異常</option>
   </select>
   ```
2. **狀態徽章渲染 (`getStatusBadge`)**：
   - 支援 `'0'`, `'1'`, `'2'`, `'3'`, `'4'` 與中文字串別名對應。
3. **排序器權重 (`statusSorter` & `multiColumnComparator`)**：
   - 權重配置：`'0': 0, '1': 1, '2': 2, '4': 3, '3': 4`。
4. **CSV 匯出對應 (`exportToCSV`)**：
   - 新增 `'2': '逾期簽到'`, `'4': '已逾期'`。
5. **假資料更新 (`generateDemoRecords`)**：
   - 更新 LocalStorage 快取版本金鑰至 `'cross_plant_dispatch_records_v6'`。
   - 確保 Demo 資料涵蓋待簽到、已簽到、逾期簽到、已逾期、異常等 5 種狀態。
