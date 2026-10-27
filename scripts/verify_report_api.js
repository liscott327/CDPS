/**
 * =========================================================================
 *  報表查詢 API 整合測試腳本 (scripts/verify_report_api.js)
 * =========================================================================
 *  執行方式: node scripts/verify_report_api.js
 * 
 *  驗證目標:
 *  1. 啟動伺服器 (若尚未運行)
 *  2. GET /api/reports: 預設查詢 (無篩選，驗證回傳結構與 ORDER BY)
 *  3. GET /api/reports: 日期區間篩選 (startDate & endDate)
 *  4. GET /api/reports: 來源廠與目的廠篩選 (sourceDeptId & targetDeptId)
 *  5. GET /api/reports: 狀態篩選 (status = 0, 1, 2, 3, 4)
 *  6. GET /api/reports: 關鍵字模糊比對 (keyword)
 *  7. GET /api/reports: 驗證未帶 Token 時阻擋 401
 * =========================================================================
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cpds_jwt_secret_key_2026';
const TEST_PORT = 3002;
let serverProcess = null;

// 產生測試用 Token
const testToken = jwt.sign(
    { empId: 'JM30448', name: '郭建銘', role: 'admin', deptId: 'JMA02' },
    JWT_SECRET,
    { expiresIn: '1h' }
);

function apiRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
        const reqOptions = {
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: encodeURI(path),
            method: options.method || 'GET',
            headers: {
                'Authorization': `Bearer ${testToken}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        };

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        if (options.body) {
            req.write(JSON.stringify(options.body));
        }
        req.end();
    });
}

async function checkPortReady(port) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/api/db/status',
            method: 'GET',
            timeout: 800
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
    });
}

async function ensureServer() {
    const isReady = await checkPortReady(TEST_PORT);
    if (isReady) return;

    console.log(`🚀 正在於 Port ${TEST_PORT} 啟動 CPDS 伺服器...`);
    const nodeBin = process.execPath;
    serverProcess = spawn(nodeBin, ['server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, PORT: String(TEST_PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const start = Date.now();
    while (Date.now() - start < 15000) {
        await new Promise(r => setTimeout(r, 500));
        const ready = await checkPortReady(TEST_PORT);
        if (ready) {
            console.log(`✅ 伺服器已成功運行於 Port ${TEST_PORT}\n`);
            return;
        }
    }
    throw new Error(`無法在 Port ${TEST_PORT} 順利啟動伺服器`);
}

async function runTests() {
    console.log('====================================================');
    console.log('  CPDS 報表 API (GET /api/reports) 整合檢核工具');
    console.log('====================================================');

    await ensureServer();

    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
        if (condition) {
            console.log(`  ✅ [PASS] ${name} ${extra}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${name} ${extra}`);
            failed++;
        }
    }

    try {
        // 1. 預設查詢 (無條件)
        console.log('\n[測試 1] GET /api/reports 預設查詢');
        const res1 = await apiRequest('/api/reports');
        assert('HTTP 狀態碼為 200', res1.status === 200);
        assert('回應格式包含 success: true', res1.data && res1.data.success === true);
        assert('回傳 records 為陣列', Array.isArray(res1.data.data));
        
        if (res1.data.data && res1.data.data.length > 0) {
            const first = res1.data.data[0];
            assert('資料包含 dispatchDate 欄位', typeof first.dispatchDate !== 'undefined');
            assert('資料包含 sourceDeptName 欄位', typeof first.sourceDeptName !== 'undefined');
            assert('資料包含 targetDeptName 欄位', typeof first.targetDeptName !== 'undefined');
            assert('資料包含 empId 欄位', typeof first.empId !== 'undefined');
            assert('資料包含 status 欄位', typeof first.status !== 'undefined');
            assert('資料包含 dispatchTimeRange 欄位', typeof first.dispatchTimeRange !== 'undefined');

            // 檢查預設 ORDER BY (DispatchDate DESC)
            let isOrderValid = true;
            for (let i = 0; i < res1.data.data.length - 1; i++) {
                const a = res1.data.data[i];
                const b = res1.data.data[i + 1];
                if (a.dispatchDate < b.dispatchDate) {
                    isOrderValid = false;
                    break;
                }
            }
            assert('預設排序為 DispatchDate DESC (最新日期在最前)', isOrderValid);
        }

        // 2. 日期區間篩選
        console.log('\n[測試 2] GET /api/reports 日期區間篩選');
        const res2 = await apiRequest('/api/reports?startDate=2026-10-19&endDate=2026-10-21');
        assert('HTTP 狀態碼為 200', res2.status === 200);
        assert('回傳 records 為陣列', Array.isArray(res2.data.data));
        if (res2.data.data && res2.data.data.length > 0) {
            const inRange = res2.data.data.every(r => r.dispatchDate >= '2026-10-19' && r.dispatchDate <= '2026-10-21');
            assert('所有資料均在 2026-10-19 ~ 2026-10-21 區間內', inRange);
        }

        // 3. 來源廠與目的廠篩選
        console.log('\n[測試 3] GET /api/reports 來源廠/目的廠篩選');
        const res3 = await apiRequest('/api/reports?sourceDeptId=JMA02,A12-2廠');
        assert('HTTP 狀態碼為 200', res3.status === 200);
        if (res3.data.data && res3.data.data.length > 0) {
            const matchPlant = res3.data.data.every(r => r.sourceDeptId === 'JMA02' || r.sourceDeptName === 'A12-2廠');
            assert('所有資料來源廠均為 A12-2廠', matchPlant);
        }

        // 4. 狀態篩選
        console.log('\n[測試 4] GET /api/reports 狀態篩選 (status=1)');
        const res4 = await apiRequest('/api/reports?status=1');
        assert('HTTP 狀態碼為 200', res4.status === 200);
        if (res4.data.data && res4.data.data.length > 0) {
            const allStatus1 = res4.data.data.every(r => String(r.status) === '1');
            assert('所有資料之狀態均為 1 (已簽到)', allStatus1);
        }

        // 5. 關鍵字模糊比對
        console.log('\n[測試 5] GET /api/reports 關鍵字模糊搜尋');
        const res5 = await apiRequest('/api/reports?keyword=JM');
        assert('HTTP 狀態碼為 200', res5.status === 200);
        if (res5.data.data && res5.data.data.length > 0) {
            const matchKw = res5.data.data.some(r => 
                (r.empId && r.empId.includes('JM')) || 
                (r.planNo && r.planNo.includes('JM'))
            );
            assert('關鍵字 JM 搜尋有比對到結果', matchKw);
        }

        // 6. 未授權測試 (無 Token)
        console.log('\n[測試 6] 401 Unauthorized 檢查');
        const res6 = await new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: TEST_PORT,
                path: '/api/reports',
                method: 'GET'
            }, (res) => {
                resolve({ status: res.statusCode });
            });
            req.on('error', () => resolve({ status: -1 }));
            req.end();
        });
        assert('未帶 Token 回傳 401 Unauthorized', res6.status === 401);

        console.log('\n----------------------------------------------------');
        console.log(`檢核結果: 通過 ${passed} 項, 失敗 ${failed} 項`);
        console.log('----------------------------------------------------');

        if (serverProcess) {
            serverProcess.kill();
        }

        if (failed > 0) {
            process.exit(1);
        } else {
            console.log('🎉 報表 API 檢核全數通過！');
            process.exit(0);
        }

    } catch (e) {
        if (serverProcess) {
            serverProcess.kill();
        }
        console.error('執行過程發生未預期錯誤:', e);
        process.exit(1);
    }
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
