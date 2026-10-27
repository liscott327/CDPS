# 現場簽到作業 (checkin.html) 異常原因紅框提示與移除操作欄位 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `checkin.html` 實作未填寫異常原因時紅框標示與儲存防呆阻擋，並徹底移除異常標記表格之「操作」欄位與「復原」按鈕。

**Architecture:** 
1. 調整 `abnormalReasonFormatter` 與 `onReasonTextInput`，當原因字串為空時自動附加上 Bootstrap 原生 `.is-invalid` 與 `.border-danger` 樣式；打字時即時更新紅框外觀。
2. 在 `saveAllAbnormal` 加入送出前的前端檢核，若有未填寫原因之欄位則標紅、聚焦並跳出 Toast 警示阻擋儲存。
3. 修改 `#abnormal-table` 的 columns 初始化陣列，移除 action 欄位與格式化器。

**Tech Stack:** HTML5, Bootstrap 5.3, Bootstrap Table 1.22, jQuery 3.7.

## Global Constraints
- 異常輸入框未填寫（空白或僅空格）時呈現紅色外框 (`is-invalid border-danger`)。
- 打字時動態響應：非空時立即移除紅框，清空時立即重現紅框。
- 儲存驗證：若有未填寫項，Toast 提示「請填寫所有人員的異常原因後再進行儲存！」，自動聚焦首個未填寫欄位，且不發送後端 API。
- 異常標記表格只保留 6 欄，移除「操作」欄位；待簽到表格操作不受影響。

---

### Task 1: 實作異常原因輸入框紅框標記與動態輸入監聽

**Files:**
- Modify: `checkin.html:433-455`

**Interfaces:**
- Produces: `abnormalReasonFormatter(value, row, index)` -> 回傳含有驗證 class 的 input html。
- Produces: `onReasonTextInput(inputEl, detailId)` -> 依輸入值即時切換 `is-invalid border-danger` class。

- [x] **Step 1: 修改 `abnormalReasonFormatter` 與 `onReasonTextInput`**

在 `checkin.html` 中更新 `abnormalReasonFormatter`，檢查 `reasonText` 是否為空，若是則附加 `is-invalid border-danger`；並在 `onReasonTextInput` 中依輸入內容動態增刪 class。

```javascript
        // 異常說明 Formatter (純單行文字輸入欄位)
        function abnormalReasonFormatter(value, row, index) {
            var reasonText = row.reasonText || row.reason || '';
            var detailId = row.detailId || row.id;
            var isInvalid = !reasonText || !reasonText.trim();
            var invalidClass = isInvalid ? ' is-invalid border-danger' : '';
            return '<div class="mx-auto" style="max-width: 380px;">' +
                '<input type="text" class="form-control form-control-sm abnormal-reason-input' + invalidClass + '" ' +
                'data-detail-id="' + escapeHtml(detailId) + '" ' +
                'placeholder="請輸入異常說明" value="' + escapeHtml(reasonText) + '" ' +
                'oninput="onReasonTextInput(this, \'' + detailId + '\')">' +
                '</div>';
        }

        // 異常說明文字輸入事件
        function onReasonTextInput(inputEl, detailId) {
            var item = abnormalData.find(function (d) { 
                return String(d.detailId) === String(detailId) || d.id === detailId; 
            });
            var val = $(inputEl).val();
            if (item) {
                item.reasonText = val;
                item.reason = val;
            }
            if (!val || !val.trim()) {
                $(inputEl).addClass('is-invalid border-danger');
            } else {
                $(inputEl).removeClass('is-invalid border-danger');
            }
        }
```

- [x] **Step 2: 驗證語法與函式行為**
執行 Node 檢查或單元驗證確保函式語法無誤。

---

### Task 2: 實作 `saveAllAbnormal` 儲存防呆阻擋邏輯

**Files:**
- Modify: `checkin.html:523-560`

**Interfaces:**
- Consumes: `#abnormal-table .abnormal-reason-input`
- Produces: `saveAllAbnormal()` -> 若有空白輸入框，標註紅框、Toast 提示並中斷，否則呼叫後端 API。

- [x] **Step 1: 修改 `saveAllAbnormal`**

在遍歷輸入框時加入防呆檢查：若有空白項目，設置 `hasEmpty = true` 並記錄 `firstEmptyInput`。若 `hasEmpty` 為 true，彈出 Toast 訊息「請填寫所有人員的異常原因後再進行儲存！」並 focus 首個欄位，return 退出。

```javascript
        // 儲存所有異常原因總按鈕事件
        async function saveAllAbnormal() {
            var hasEmpty = false;
            var firstEmptyInput = null;

            // 同步將表格內所有 input 的最新內容更新至記憶體模型，並檢核是否為空
            $('#abnormal-table .abnormal-reason-input').each(function () {
                var $input = $(this);
                var detailId = $input.attr('data-detail-id');
                var val = $input.val();
                var item = abnormalData.find(function (d) {
                    return String(d.detailId) === String(detailId) || d.id === detailId;
                });
                if (item) {
                    item.reasonText = val;
                    item.reason = val;
                }

                if (!val || !val.trim()) {
                    $input.addClass('is-invalid border-danger');
                    hasEmpty = true;
                    if (!firstEmptyInput) {
                        firstEmptyInput = $input;
                    }
                } else {
                    $input.removeClass('is-invalid border-danger');
                }
            });

            if (hasEmpty) {
                showToastMessage('請填寫所有人員的異常原因後再進行儲存！', 'danger');
                if (firstEmptyInput) {
                    firstEmptyInput.focus();
                }
                return;
            }

            var items = abnormalData
                .filter(function (d) { return d.detailId != null; })
                .map(function (d) {
                    return {
                        detailId: d.detailId,
                        reason: d.reasonText || d.reason || ''
                    };
                });

            if (items.length === 0) {
                showToastMessage('無需要儲存之項目', 'warning');
                $('#barcodeInput').focus();
                return;
            }

            try {
                var res = await Auth.authFetch('/api/checkin/abnormal-reasons', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: items })
                });

                var data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    data = { success: false, message: '伺服器回應格式錯誤' };
                }

                if (res.ok && data && data.success) {
                    showToastMessage(data.message || '已成功儲存所有異常原因記錄！', 'success');
                    var currentParams = window.currentCheckinParams || parseCheckinUrlParams();
                    await loadCheckinData(currentParams.deptId, currentParams.dispatchDate);
                } else {
                    showToastMessage((data && data.message) ? data.message : '儲存異常原因失敗', 'danger');
                }
            } catch (err) {
                console.error('[Checkin] 儲存異常原因失敗:', err);
                showToastMessage('儲存異常原因發生錯誤: ' + err.message, 'danger');
            } finally {
                $('#barcodeInput').focus();
            }
        }
```

---

### Task 3: 移除異常標記表格的「操作」欄位與「復原」按鈕

**Files:**
- Modify: `checkin.html:935-950`

**Interfaces:**
- Produces: `#abnormal-table` Bootstrap Table initialization with 6 columns.

- [x] **Step 1: 修改 `#abnormal-table` 初始化 columns**

從 `#abnormal-table` 的 columns 設定中移除 `{ field: 'action', title: '操作', formatter: abnormalActionFormatter, align: 'center' }`。

```javascript
            // 初始化異常標記表格
            $('#abnormal-table').bootstrapTable({
                data: abnormalData,
                classes: 'table table-borderless table-striped mb-0',
                columns: [
                    { field: 'dept', title: '來源廠', align: 'center' },
                    { field: 'id', title: '工號', align: 'center' },
                    { field: 'name', title: '姓名', align: 'center' },
                    { field: 'dispatchTime', title: '調度時間', formatter: dispatchTimeFormatter, align: 'center' },
                    { field: 'status', title: '狀態', formatter: statusFormatter, align: 'center' },
                    { field: 'reason', title: '異常說明', formatter: abnormalReasonFormatter, align: 'center' }
                ]
            });
```

---

### Task 4: 端對端驗證與檢視

**Files:**
- Test: `scripts/verify_checkin_abnormal.js`

- [x] **Step 1: 編寫驗證腳本確認 HTML 結構與邏輯相容性**
- [x] **Step 2: 執行驗證確認所有規則符合預期**
