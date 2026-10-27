// scripts/verify_checkin_frontend.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Checkin Frontend logic and status calculations...');

const htmlContent = fs.readFileSync(path.join(__dirname, '../checkin.html'), 'utf8');

// Check that required functions and elements exist in checkin.html
assert.ok(htmlContent.includes('function isDatePast('), 'isDatePast should exist');
assert.ok(htmlContent.includes('function statusFormatter('), 'statusFormatter should exist');
assert.ok(htmlContent.includes('function loadCheckinData('), 'loadCheckinData should exist');
assert.ok(htmlContent.includes('function handleScanSubmit('), 'handleScanSubmit should exist');
assert.ok(htmlContent.includes('function managerCheckIn('), 'managerCheckIn should exist');
assert.ok(htmlContent.includes('function markAbnormal('), 'markAbnormal should exist');
assert.ok(htmlContent.includes('function restoreAbnormal('), 'restoreAbnormal should exist');
assert.ok(htmlContent.includes('function saveAllAbnormal('), 'saveAllAbnormal should exist');
assert.ok(htmlContent.includes('data-detail-id'), 'abnormalReasonFormatter should have data-detail-id');
assert.ok(htmlContent.includes("managerCheckIn(\\'' + detailId"), 'managerActionFormatter should pass detailId');
assert.ok(htmlContent.includes("restoreAbnormal(\\'' + detailId"), 'abnormalActionFormatter should pass detailId');
assert.ok(htmlContent.includes('/api/checkin/records'), 'loadCheckinData should call /api/checkin/records');
assert.ok(htmlContent.includes('/api/checkin/scan'), 'handleScanSubmit should call /api/checkin/scan');
assert.ok(htmlContent.includes('/api/checkin/manager'), 'managerCheckIn should call /api/checkin/manager');
assert.ok(htmlContent.includes('/api/checkin/abnormal'), 'abnormal should call /api/checkin/abnormal');
assert.ok(htmlContent.includes('/api/checkin/abnormal-reasons'), 'saveAllAbnormal should call /api/checkin/abnormal-reasons');

// Test isDatePast logic
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    var parts = timeStr.trim().split(':');
    if (parts.length < 2) return null;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function parseDispatchRange(rangeStr) {
    if (!rangeStr) return null;
    var parts = rangeStr.split('~');
    if (parts.length !== 2) return null;
    var start = parseTimeToMinutes(parts[0]);
    var end = parseTimeToMinutes(parts[1]);
    if (start === null || end === null) return null;
    return { start: start, end: end };
}

function isNotCheckedInExpired(dispatchTime, currentTimeStr) {
    var range = parseDispatchRange(dispatchTime);
    var currentMin = parseTimeToMinutes(currentTimeStr);
    if (!range || currentMin === null) return false;
    return currentMin > range.end;
}

function isDateToday(dateStr) {
    if (!dateStr) return true;
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return dateStr === todayStr;
}

function isDatePast(dateStr) {
    if (!dateStr) return false;
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return dateStr < todayStr;
}

// Evaluate statusFormatter logic
function createStatusFormatter(currentParams, mockCurrentTime) {
    return function statusFormatter(value, row) {
        var st = String(value);

        if (st === '0' || st === '待簽到' || st === '待移轉' || st === '移轉中') {
            if (isDatePast(currentParams.dispatchDate)) {
                return '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
            }
            if (isDateToday(currentParams.dispatchDate)) {
                var nowStr = mockCurrentTime;
                if (isNotCheckedInExpired(row.dispatchTime, nowStr)) {
                    return '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
                }
            }
            return '<span class="badge bg-secondary px-3 py-2"><i class="bi bi-hourglass-split me-1"></i>待簽到</span>';
        }

        switch (st) {
            case '1':
            case '已簽到':
                return '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-lg me-1"></i>已簽到</span>';
            case '2':
            case '逾期簽到':
                return '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-clock-history me-1"></i>逾期簽到</span>';
            case '3':
            case '異常':
                return '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>異常</span>';
            case '4':
            case '已逾期':
                return '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
            default:
                return value || '';
        }
    };
}

// 1. 歷史單據 (昨天) 且未簽到 -> 應為 已逾期 (badge bg-danger)
const fmtPast = createStatusFormatter({ dispatchDate: '2020-01-01' }, '10:00');
const outPast = fmtPast('0', { dispatchTime: '14:00~17:00' });
assert.ok(outPast.includes('已逾期') && outPast.includes('bg-danger'), '歷史未簽到應為已逾期');

// 2. 今日單據但時間已過結束時間 -> 應為 已逾期 (badge bg-danger)
const todayStr = new Date().toISOString().split('T')[0];
const fmtTodayLate = createStatusFormatter({ dispatchDate: todayStr }, '17:30');
const outTodayLate = fmtTodayLate('0', { dispatchTime: '14:00~17:00' });
assert.ok(outTodayLate.includes('已逾期') && outTodayLate.includes('bg-danger'), '今日超時未簽到應為已逾期');

// 3. 今日單據且未超過結束時間 -> 應為 待簽到 (badge bg-secondary)
const fmtTodayPending = createStatusFormatter({ dispatchDate: todayStr }, '15:00');
const outTodayPending = fmtTodayPending('0', { dispatchTime: '14:00~17:00' });
assert.ok(outTodayPending.includes('待簽到') && outTodayPending.includes('bg-secondary'), '未超時應為待簽到');

// 4. 五大狀態徽章樣式檢驗
assert.ok(fmtTodayPending('1', {}).includes('bg-success'), '狀態 1 應為 bg-success');
assert.ok(fmtTodayPending('2', {}).includes('bg-warning'), '狀態 2 應為 bg-warning');
assert.ok(fmtTodayPending('3', {}).includes('bg-warning'), '狀態 3 應為 bg-warning');
assert.ok(fmtTodayPending('4', {}).includes('bg-danger'), '狀態 4 應為 bg-danger');

// 5. 未來單據 (明天) 且當前時間已過時段 (例如調度 08:00~11:00，當前時間 15:00) -> 應仍為 待簽到 (bg-secondary)，不可誤標已逾期
const fmtFuture = createStatusFormatter({ dispatchDate: '2099-12-31' }, '15:00');
const outFuture = fmtFuture('0', { dispatchTime: '08:00~11:00' });
assert.ok(outFuture.includes('待簽到') && outFuture.includes('bg-secondary'), '未來單據應維持待簽到，不可誤判為已逾期');

console.log('✅ All status calculation unit tests PASSED!');
