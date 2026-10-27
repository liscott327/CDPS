const assert = require('assert');

// Simulate the frontend logic from checkin.html
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

function simulateFrontendCheck(val, currentTimeStr, dispatchDate, checkedInData, notCheckedInData, abnormalData) {
    var valUpper = val.toUpperCase();
    var isEmpMatch = function (e) {
        return (e.id && e.id.toUpperCase() === valUpper) || (e.name && e.name === val);
    };

    var empNotChecked = notCheckedInData.filter(isEmpMatch);
    var empChecked = checkedInData.filter(isEmpMatch);
    var empAbnormal = abnormalData.filter(isEmpMatch);
    var allEmpRecords = empNotChecked.concat(empChecked, empAbnormal);

    if (allEmpRecords.length === 0) {
        return { action: 'BLOCK', type: 'NOT_FOUND' };
    }

    var nowMinutes = parseTimeToMinutes(currentTimeStr);
    var isSlotActive = function (e) {
        var range = parseDispatchRange(e.dispatchTime);
        return range && nowMinutes >= range.start && nowMinutes <= range.end;
    };

    var activeNotChecked = empNotChecked.filter(isSlotActive);
    var activeChecked = empChecked.filter(isSlotActive);
    var activeAbnormal = empAbnormal.filter(isSlotActive);
    var activeTotalCount = activeNotChecked.length + activeChecked.length + activeAbnormal.length;

    if (activeTotalCount === 0) {
        return { action: 'BLOCK', type: 'TIME_ERROR' };
    }

    if (activeNotChecked.length === 0) {
        if (activeAbnormal.length > 0) {
            return { action: 'BLOCK', type: 'ABNORMAL_RECORD' };
        }
        if (activeChecked.length > 0) {
            return { action: 'BLOCK', type: 'DUPLICATE' };
        }
    }

    return { action: 'PROCEED_API', targetSlot: activeNotChecked[0] };
}

console.log('Testing Multi-Slot Checkin Frontend Logic...');

// Initial state: JM10020 has Slot A (08:00~12:00) and Slot B (13:00~17:00)
var checkedInData = [
    { id: 'JM10020', name: '王大同', dispatchTime: '08:00~12:00', status: '1' }
];
var notCheckedInData = [
    { id: 'JM10020', name: '王大同', dispatchTime: '13:00~17:00', status: '0' }
];
var abnormalData = [];

// Test 1: Scan at 08:30 (during Slot A) -> Should be DUPLICATE because Slot A is already checked in
var r1 = simulateFrontendCheck('JM10020', '08:30', '2026-10-27', checkedInData, notCheckedInData, abnormalData);
assert.strictEqual(r1.action, 'BLOCK');
assert.strictEqual(r1.type, 'DUPLICATE', 'Slot A already checked in should block as DUPLICATE');
console.log('✅ Test 1: 08:30 Slot A 重複掃描阻擋成功 (DUPLICATE)');

// Test 2: Scan at 12:30 (between Slot A and Slot B) -> Should be TIME_ERROR
var r2 = simulateFrontendCheck('JM10020', '12:30', '2026-10-27', checkedInData, notCheckedInData, abnormalData);
assert.strictEqual(r2.action, 'BLOCK');
assert.strictEqual(r2.type, 'TIME_ERROR', '12:30 between slots should block as TIME_ERROR');
console.log('✅ Test 2: 12:30 非時段區間阻擋成功 (TIME_ERROR)');

// Test 3: Scan at 13:05 (during Slot B) -> Should NOT be blocked as DUPLICATE! Must PROCEED_API for Slot B!
var r3 = simulateFrontendCheck('JM10020', '13:05', '2026-10-27', checkedInData, notCheckedInData, abnormalData);
assert.strictEqual(r3.action, 'PROCEED_API', 'Slot B is not checked in, must NOT be blocked as duplicate!');
assert.strictEqual(r3.targetSlot.dispatchTime, '13:00~17:00');
console.log('✅ Test 3: 13:05 Slot B 順利放行呼叫 API 簽到 (不再被 Slot A 誤判為重複)');

// Simulate Slot B check-in completed
checkedInData.push({ id: 'JM10020', name: '王大同', dispatchTime: '13:00~17:00', status: '1' });
notCheckedInData = [];

// Test 4: Scan again at 13:10 (during Slot B) -> Now Slot B is checked in, should be DUPLICATE!
var r4 = simulateFrontendCheck('JM10020', '13:10', '2026-10-27', checkedInData, notCheckedInData, abnormalData);
assert.strictEqual(r4.action, 'BLOCK');
assert.strictEqual(r4.type, 'DUPLICATE', 'Slot B already checked in should now block as DUPLICATE');
console.log('✅ Test 4: 13:10 Slot B 二次刷卡嚴格比對為重複 (DUPLICATE)');

console.log('\n🎉 All Multi-Slot Checkin tests PASSED!');
