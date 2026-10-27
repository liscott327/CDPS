// scripts/verify_checkin_logic.js
const assert = require('assert');

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return null;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function parseDispatchRange(rangeStr) {
    if (!rangeStr) return null;
    const parts = rangeStr.split('~');
    if (parts.length !== 2) return null;
    const start = parseTimeToMinutes(parts[0]);
    const end = parseTimeToMinutes(parts[1]);
    if (start === null || end === null) return null;
    return { start, end };
}

function evaluateCheckinStatus(targetId, currentTimeStr, checkedInData, notCheckedInData, abnormalData, dispatchDate, todayDateStr) {
    const today = todayDateStr || '2026-10-27';
    const date = dispatchDate || today;

    // 1. 檢查是否重複掃描 (已在已簽到清單)
    const checked = checkedInData.find(e => e.id === targetId || e.name === targetId);
    if (checked) {
        return {
            type: 'DUPLICATE',
            message: `重複掃描<br>${checked.id} ${checked.name}<br>已略過`,
            alertClass: 'alert-info'
        };
    }

    // 2. 檢查是否已標記異常
    const abnormal = abnormalData.find(e => e.id === targetId || e.name === targetId);
    if (abnormal) {
        return {
            type: 'ABNORMAL_RECORD',
            message: `發生錯誤<br>${abnormal.id} ${abnormal.name}<br>今日調度明細已標記異常`,
            alertClass: 'alert-danger'
        };
    }

    // 3. 尋找是否在待簽到清單
    const notChecked = notCheckedInData.find(e => e.id === targetId || e.name === targetId);
    if (!notChecked) {
        return {
            type: 'NOT_FOUND',
            message: `發生錯誤<br>工號 ${targetId}<br>未於調度名單中`,
            alertClass: 'alert-danger'
        };
    }

    const emp = notChecked;

    // 4. 嚴格校驗：必須為當日調度時間
    if (date !== today) {
        return {
            type: 'TIME_ERROR',
            emp: emp,
            message: `非簽到時間<br>${emp.id} ${emp.name}<br>非當日調度時間，不可簽到（調度日期: ${date}）`,
            alertClass: 'alert-danger'
        };
    }

    // 5. 嚴格校驗：比對調度時間 (開始後 ~ 結束前，無提早緩衝)
    const range = parseDispatchRange(emp.dispatchTime);
    const currentMin = parseTimeToMinutes(currentTimeStr);

    if (range && currentMin !== null) {
        const windowStart = range.start; // 嚴格鎖定：不提供提早緩衝
        const onTimeLimit = range.start + 10;
        const windowEnd = range.end;

        // 若提早 (未到開始時間)，或已超過結束時間
        if (currentMin < windowStart || currentMin > windowEnd) {
            return {
                type: 'TIME_ERROR',
                emp: emp,
                message: `非簽到時間<br>${emp.id} ${emp.name}<br>應於調度時間內簽到（今日時段: ${emp.dispatchTime}）`,
                alertClass: 'alert-danger'
            };
        }

        // 開始後10分內 -> 準時簽到
        if (currentMin <= onTimeLimit) {
            return {
                type: 'SUCCESS_ON_TIME',
                emp: emp,
                status: '1',
                message: `✓ 簽到成功<br>${emp.id} ${emp.name}<br>簽到時間 ${currentTimeStr}`,
                alertClass: 'alert-success'
            };
        } else {
            // 超過開始10分至結束前 -> 逾期簽到
            return {
                type: 'SUCCESS_LATE',
                emp: emp,
                status: '2',
                message: `✓ 逾期簽到成功<br>${emp.id} ${emp.name}<br>簽到時間 ${currentTimeStr}`,
                alertClass: 'alert-warning'
            };
        }
    }

    return {
        type: 'SUCCESS_ON_TIME',
        emp: emp,
        status: '1',
        message: `✓ 簽到成功<br>${emp.id} ${emp.name}<br>簽到時間 ${currentTimeStr}`,
        alertClass: 'alert-success'
    };
}

// 待簽到超時檢測 (動態判斷是否顯示為「已逾期」)
function isNotCheckedInExpired(dispatchTime, currentTimeStr) {
    const range = parseDispatchRange(dispatchTime);
    const currentMin = parseTimeToMinutes(currentTimeStr);
    if (!range || currentMin === null) return false;
    return currentMin > range.end;
}

// 測試案例
const mockChecked = [
    { id: "JM10001", name: "王小明", dept: "A12-2廠", dispatchTime: "10:00~11:00", time: "10:02", status: "1" }
];
const mockNotChecked = [
    { id: "JM10002", name: "李大華", dept: "A5-2廠", dispatchTime: "08:00~09:00", status: "0" },
    { id: "JM10007", name: "趙大成", dept: "A12-1廠", dispatchTime: "14:00~17:00", status: "0" }
];
const mockAbnormal = [];

// 1. 重複掃描
const r1 = evaluateCheckinStatus("JM10001", "10:05", mockChecked, mockNotChecked, mockAbnormal, "2026-10-27", "2026-10-27");
assert.strictEqual(r1.type, 'DUPLICATE');
assert.strictEqual(r1.alertClass, 'alert-info');

// 2. 未於調度名單中
const r2 = evaluateCheckinStatus("JM99999", "10:05", mockChecked, mockNotChecked, mockAbnormal, "2026-10-27", "2026-10-27");
assert.strictEqual(r2.type, 'NOT_FOUND');
assert.strictEqual(r2.alertClass, 'alert-danger');

// 3. 非當天調度 (調度日期 10/28，當天日期 10/27，時間 8:00) -> 報錯「非簽到時間」
const r3 = evaluateCheckinStatus("JM10002", "08:00", mockChecked, mockNotChecked, mockAbnormal, "2026-10-28", "2026-10-27");
assert.strictEqual(r3.type, 'TIME_ERROR');
assert.strictEqual(r3.message, '非簽到時間<br>JM10002 李大華<br>非當日調度時間，不可簽到（調度日期: 2026-10-28）');
assert.strictEqual(r3.alertClass, 'alert-danger');

// 4. 當天調度 08:00~09:00，當下時間 10/27 10:10 (已超過結束時間 09:00) -> 報錯「非簽到時間」
const r4 = evaluateCheckinStatus("JM10002", "10:10", mockChecked, mockNotChecked, mockAbnormal, "2026-10-27", "2026-10-27");
assert.strictEqual(r4.type, 'TIME_ERROR');
assert.strictEqual(r4.message, '非簽到時間<br>JM10002 李大華<br>應於調度時間內簽到（今日時段: 08:00~09:00）');
assert.strictEqual(r4.alertClass, 'alert-danger');

// 5. 當天調度 08:00~09:00，當下時間 07:55 (提早 5 分鐘，無提早緩衝) -> 報錯「非簽到時間」
const r5 = evaluateCheckinStatus("JM10002", "07:55", mockChecked, mockNotChecked, mockAbnormal, "2026-10-27", "2026-10-27");
assert.strictEqual(r5.type, 'TIME_ERROR');
assert.strictEqual(r5.message, '非簽到時間<br>JM10002 李大華<br>應於調度時間內簽到（今日時段: 08:00~09:00）');
assert.strictEqual(r5.alertClass, 'alert-danger');

// 6. 準時簽到 (08:00~09:00，08:05 來，開始後10分鐘內)
const r6 = evaluateCheckinStatus("JM10002", "08:05", mockChecked, mockNotChecked, mockAbnormal, "2026-10-27", "2026-10-27");
assert.strictEqual(r6.type, 'SUCCESS_ON_TIME');
assert.strictEqual(r6.status, '1');
assert.strictEqual(r6.alertClass, 'alert-success');

// 7. 逾期簽到 (08:00~09:00，08:30 來，超過開始10分鐘但未結束)
const r7 = evaluateCheckinStatus("JM10002", "08:30", mockChecked, mockNotChecked, mockAbnormal, "2026-10-27", "2026-10-27");
assert.strictEqual(r7.type, 'SUCCESS_LATE');
assert.strictEqual(r7.status, '2');
assert.strictEqual(r7.alertClass, 'alert-warning');

// 8. 待簽到逾期動態標記 (08:00~09:00，10:10 判定為已過結束時間)
assert.strictEqual(isNotCheckedInExpired("08:00~09:00", "10:10"), true);
assert.strictEqual(isNotCheckedInExpired("08:00~09:00", "08:50"), false);

console.log('All 8 checkin logic tests PASSED successfully!');
