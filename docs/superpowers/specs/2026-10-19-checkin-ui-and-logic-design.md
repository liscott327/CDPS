# 現場簽到作業 (checkin.html) 畫面與功能重構設計規格書

- **日期**：2026-10-19
- **目標檔案**：`checkin.html`
- **狀態**：已批准 (Approved)

---

## 1. 背景與目標

原 `CPDS/checkin.html` 使用彈跳式視窗（Modal）進行掃描簽到，並在 Modal 內呈現已刷入員工清單。此設計導致現場作業人員在調派不熟悉時，必須在主畫面三張表格（已簽到、待簽到、異常標記）與掃描彈窗之間頻繁來回切換，確認哪些人員尚未簽到，嚴重影響現場動線流暢度。

本設計之核心目標為：
1. **單一頁面無跳窗整合**：將工號掃描輸入與即時掃描結果直接整合至頂部資訊列，徹底移除 Modal 彈窗與重新整理按鈕，達成一頁式連續掃描與點名核對。
2. **狀態定義重構與精準時間檢核**：重新定義「待簽到」、「已簽到」、「逾期簽到」、「已逾期」、「異常」等 5 種狀態，並依據調度開始/結束時間與刷卡時間落點，落實完整的五大情境自動判定與錯誤提示。
3. **待簽到動態逾期提示**：待簽到清單中若當前時間已超過該人員調度結束時間，狀態即時動態標記為「已逾期」。
4. **異常標記總儲存機制**：異常標記卡片提供標頭「儲存所有異常原因」按鈕，每列僅保留「復原」按鈕，提升資料批次維護體驗。

---

## 2. 畫面 UI 佈局調整

### 2.1 頂部資訊列與掃描區塊整合
- **位置**：頂部 `.alert.alert-primary` 藍底列。
- **移除項目**：
  - 移除「重新整理」按鈕 (`onclick="location.reload()"`)。
  - 移除「點擊開始掃描」按鈕 (`data-bs-target="#scanModal"`)。
  - 移除頁面底部原有的 `#scanModal` 彈窗 DOM 及相關 JS 初始化。
- **新增/重整佈局**：
  採用 Bootstrap Flex 排版（`d-flex flex-wrap align-items-center justify-content-between gap-3`）：
  - **左側：Title 與廠別資訊**
    - 保留：`現場簽到作業 | 2026/10/07 | A12-3廠`
  - **中間：工號輸入框**
    - 元素 ID：`#barcodeInput`
    - 樣式：緊鄰廠別右側，寬度約 240px~280px，搭配條碼/工號圖示。
    - 特性：
      - 頁面載入完成後自動聚焦 (`.focus()`)。
      - 監聽 `Enter` 鍵與條碼槍刷入事件，觸發簽到判定。
      - 每次判斷完畢後自動清空內容並重新聚焦，支援無間斷連續刷卡。
  - **右側：即時掃描結果回饋區**
    - 元素 ID：`#scanResultArea`
    - 樣式：佔據右側區域，以色彩鮮明的動態通知框/Badge 呈現。
    - 初始狀態：顯示灰白背景提示「<i class="bi bi-upc-scan me-1"></i>等待掃描簽到...」。
    - 掃描後動態切換色彩、圖示與文案（見第 4 節）。

### 2.2 異常標記區塊調整
- **標頭總儲存按鈕**：
  - 在「異常標記 (<span id="abnormal-count">X</span>人)」卡片標頭右側新增：
    `<button class="btn btn-sm btn-dark fw-semibold" id="btn-save-all-abnormal" onclick="saveAllAbnormal()"><i class="bi bi-save me-1"></i>儲存所有異常原因</button>`
- **表格列項目操作簡化**：
  - 原「送出」與「編輯」按鈕移除。
  - 每列僅保留「復原」按鈕 (`<button class="btn btn-outline-secondary btn-sm" onclick="restoreAbnormal(id)"><i class="bi bi-arrow-counterclockwise me-1"></i>復原</button>`)，點擊時將人員移回「待簽到」名單。
  - 異常原因欄位維持文字輸入框 (`<input type="text" class="form-control form-control-sm abnormal-reason-input" ...>`)，綁定輸入事件同步至資料物件。
  - 點擊標頭「儲存所有異常原因」時，彈出儲存成功提示。

---

## 3. 狀態定義與徽章規格

| 狀態名稱 | 狀態碼 (status) | 徽章樣式 (Badge) | 業務定義說明 |
| :--- | :---: | :--- | :--- |
| **待簽到** | `0` | `<span class="badge bg-secondary px-3 py-2"><i class="bi bi-hourglass-split me-1"></i>待簽到</span>` | 未到調度時間結束前未簽到者 |
| **已簽到** | `1` | `<span class="badge bg-success px-3 py-2"><i class="bi bi-check-lg me-1"></i>已簽到</span>` | 於調度時間開始前 10 分鐘 ~ 開始後 10 分鐘內簽到者 |
| **逾期簽到** | `2` | `<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-clock-history me-1"></i>逾期簽到</span>` | 超過調度時間開始 10 分鐘後至調度結束時間前簽到者 |
| **已逾期** | `4` (動態呈現) | `<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>` | 待簽到人員中，當前時間已超過該調度結束時間者（動態計算呈現） |
| **異常** | `3` | `<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>異常</span>` | 人員被手動移至異常標記並記錄異常說明者 |

---

## 4. 掃描驗證與時間判定邏輯

### 4.1 時間比對邏輯計算
設調度時間為 `T_start ~ T_end`（例如 `10:00 ~ 12:00`），簽到掃描當前時間為 `T_now`：
- **可簽到區間下限**：`T_window_start = T_start - 10 分鐘`（例：`09:50`）
- **準時簽到區間上限**：`T_on_time_limit = T_start + 10 分鐘`（例：`10:10`）
- **調度結束時間上限**：`T_end`（例：`12:00`）

### 4.2 五大掃描情境與呈現提示

| 序 | 情境條件 | 呈現提示文案 | 提示框外觀 | 處理動作 |
| :-: | :--- | :--- | :--- | :--- |
| 1 | 工號已存在於 `checkedInData`（已簽到清單） | `✓ 重複掃描 {工號} {姓名}，已略過` | `alert-info` 藍灰色 / 警告符號 | 不更新資料、略過 |
| 2 | 工號未存在於當日調度名單（待簽到、已簽到、異常皆無） | `✗ 發生錯誤，工號 {工號} 未於調度名單中` | `alert-danger` 紅色 / 叉叉符號 | 記錄錯誤，輸入框清空復位 |
| 3 | 工號在調度名單中，但 `T_now < T_window_start`（過早）或 `T_now > T_end`（已過結束時間） | `✗ 發生錯誤，{工號} {姓名}，應在 調度時間內 簽到` | `alert-danger` 紅色 / 叉叉符號 | 不執行簽到，保留於待簽到 |
| 4 | 工號在調度名單中，且 `T_window_start <= T_now <= T_on_time_limit`（前10分 ~ 後10分內） | `✓ 簽到成功 {工號} {姓名}、簽到時間 {HH:mm}` | `alert-success` 綠色 / 打勾符號 | 移至已簽到清單，狀態更新為 `1` (已簽到)，記錄簽到時間 |
| 5 | 工號在調度名單中，且 `T_on_time_limit < T_now <= T_end`（超過開始10分至結束前） | `✓ 逾期簽到成功 {工號} {姓名}、簽到時間 {HH:mm}` | `alert-warning` 橘黃色 / 時鐘符號 | 移至已簽到清單，狀態更新為 `2` (逾期簽到)，記錄簽到時間 |

---

## 5. 資料流與排序規則

1. **複合排序比較器 (`checkinComparator`)**：
   - 排序權重依序為：
     1. `dispatchTime`（調度時間，ASC）
     2. `dept`（來源廠，ASC）
     3. `id`（工號，ASC）
     4. `status` 權重（ASC: 0:待簽到 -> 1:已簽到 -> 2:逾期簽到 -> 3:異常）
2. **主管代簽 (`managerCheckIn(id)`)**：
   - 點擊主管代簽時，同樣套用當前時間判斷邏輯：
     - 若在準時區間，設定 status = `'1'`（已簽到）。
     - 若超過開始 10 分鐘，設定 status = `'2'`（逾期簽到）。
   - 移入已簽到清單並觸發重排與重新載入。
3. **異常復原 (`restoreAbnormal(id)`)**：
   - 將人員移回待簽到清單，狀態還原為 `'0'`（若當前已超過結束時間，顯示為「已逾期」）。
4. **即時計數同步**：
   - 每次資料變動自動調用 `updateCounters()`，動態更新各表格卡片 Header 的人數統計。
