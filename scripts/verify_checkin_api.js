// scripts/verify_checkin_api.js
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createCheckinRouter } = require('../routes/checkin');

const app = express();
app.use(express.json());

const JWT_SECRET = 'test_secret_key';
const token = jwt.sign({ empId: 'TEST01', name: '測試員', deptId: 'JMB03' }, JWT_SECRET);

app.use('/api/checkin', createCheckinRouter({
    getDbPool: () => null, // 測試備援模式
    sql: null,
    JWT_SECRET
}));

const server = app.listen(0, async () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/checkin`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    try {
        console.log('Testing Checkin APIs...');

        // 1. GET /records
        const r1 = await fetch(`${baseUrl}/records?deptId=JMB03&dispatchDate=2026-10-21`, { headers });
        const d1 = await r1.json();
        assert.strictEqual(d1.success, true);
        assert.ok(Array.isArray(d1.data));
        console.log('✅ GET /records OK, count =', d1.data.length);

        // 2. POST /scan - 準時 (14:05)
        const r2 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10007',
                currentTime: '14:05'
            })
        });
        const d2 = await r2.json();
        assert.strictEqual(d2.success, true);
        assert.strictEqual(d2.status, 1);
        console.log('✅ POST /scan 準時簽到 OK (status = 1)');

        // 3. POST /scan - 重複簽到
        const r3 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10007',
                currentTime: '14:08'
            })
        });
        assert.strictEqual(r3.status, 400);
        console.log('✅ POST /scan 重複簽到阻擋 OK');

        // 4. POST /scan - 提早 (應阻擋，嚴格限制時段開始後)
        const r4 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10008',
                currentTime: '13:55'
            })
        });
        assert.strictEqual(r4.status, 400);
        console.log('✅ POST /scan 提早簽到阻擋 OK (13:55 早於 14:00)');

        // -----------------------------------------------------------------
        // 多時段智慧匹配與嚴格時段邊界測試 (JM10020: 08:00~12:00, 13:00~17:00)
        // -----------------------------------------------------------------
        console.log('\n--- 測試多時段智慧匹配與嚴格時間檢驗 ---');

        // Case 2: Scan at 07:55 (before 08:00 start) -> TIME_ERROR failure (cannot check in early)
        const rCase2 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10020',
                currentTime: '07:55'
            })
        });
        const dCase2 = await rCase2.json();
        assert.strictEqual(rCase2.status, 400, '07:55 應回傳 400 錯誤');
        assert.strictEqual(dCase2.type, 'TIME_ERROR', '應回傳 TIME_ERROR');
        assert.ok(dCase2.message.includes('今日時段'), '錯誤訊息應提示今日時段');
        console.log('✅ Case 2: 07:55 早於時段阻擋成功 (TIME_ERROR)');

        // Case 3: Scan at 08:05 -> Matches 08:00~12:00, status = 1 (on-time)
        const rCase3 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10020',
                currentTime: '08:05'
            })
        });
        const dCase3 = await rCase3.json();
        assert.strictEqual(rCase3.status, 200, '08:05 應簽到成功');
        assert.strictEqual(dCase3.success, true);
        assert.strictEqual(dCase3.status, 1, '08:05 應為準時簽到 (status = 1)');
        console.log('✅ Case 3: 08:05 命中 08:00~12:00 準時簽到成功 (status = 1)');

        // Case 5: Scan at 12:15 (between slots: 08:00~12:00 已過, 13:00~17:00 未到) -> TIME_ERROR failure
        const rCase5 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10020',
                currentTime: '12:15'
            })
        });
        const dCase5 = await rCase5.json();
        assert.strictEqual(rCase5.status, 400, '12:15 應回傳 400 錯誤');
        assert.strictEqual(dCase5.type, 'TIME_ERROR', '應回傳 TIME_ERROR');
        assert.ok(dCase5.message.includes('08:00~12:00') && dCase5.message.includes('13:00~17:00'), '錯誤訊息應列出今日所有排定時段');
        console.log('✅ Case 5: 12:15 時段間隔阻擋成功 (提示所有今日時段)');

        // Case 4: Scan at 13:20 -> Matches 13:00~17:00, status = 2 (late)
        const rCase4 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10020',
                currentTime: '13:20'
            })
        });
        const dCase4 = await rCase4.json();
        assert.strictEqual(rCase4.status, 200, '13:20 應簽到成功');
        assert.strictEqual(dCase4.success, true);
        assert.strictEqual(dCase4.status, 2, '13:20 應為逾期簽到 (status = 2)');
        console.log('✅ Case 4: 13:20 命中 13:00~17:00 逾期簽到成功 (status = 2)');

        // Case 6: Duplicate scan in slot 2 (13:25) -> DUPLICATE failure
        const rCase6 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10020',
                currentTime: '13:25'
            })
        });
        const dCase6 = await rCase6.json();
        assert.strictEqual(rCase6.status, 400, '時段二重複掃描應阻擋');
        assert.strictEqual(dCase6.type, 'DUPLICATE');
        console.log('✅ Case 6: 時段二重複掃描阻擋 OK (DUPLICATE)');

        // 5. POST /manager - 主管代簽逾期 (14:15)
        const r5 = await fetch(`${baseUrl}/manager`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                detailId: 104,
                currentTime: '14:15'
            })
        });
        const d5 = await r5.json();
        assert.strictEqual(d5.success, true);
        assert.strictEqual(d5.status, 2);
        console.log('✅ POST /manager 主管代簽逾期 OK (status = 2)');

        // 5-1. POST /manager-checkin - 支援別名與 empId 智慧匹配
        const r5_1 = await fetch(`${baseUrl}/manager-checkin`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                empId: 'JM10008',
                currentTime: '14:05'
            })
        });
        const d5_1 = await r5_1.json();
        assert.strictEqual(d5_1.success, true);
        assert.strictEqual(d5_1.status, 1);
        console.log('✅ POST /manager-checkin 依 empId 主管代簽準時 OK (status = 1)');

        // 6. POST /abnormal - 標記異常
        const r6 = await fetch(`${baseUrl}/abnormal`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                detailId: 104,
                action: 'MARK',
                reason: '身體不適'
            })
        });
        const d6 = await r6.json();
        assert.strictEqual(d6.status, 3);
        console.log('✅ POST /abnormal 標記異常 OK (status = 3)');

        // 7. POST /abnormal-reasons - 儲存所有異常原因
        const r7 = await fetch(`${baseUrl}/abnormal-reasons`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                items: [{ detailId: 104, reason: '緊急送醫' }]
            })
        });
        const d7 = await r7.json();
        assert.strictEqual(d7.success, true);
        console.log('✅ POST /abnormal-reasons OK');

        console.log('🎉 All Checkin API tests PASSED!');
    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exitCode = 1;
    } finally {
        server.close();
    }
});
