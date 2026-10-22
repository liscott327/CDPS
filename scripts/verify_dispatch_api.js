/**
 * =========================================================================
 *  調度排程 API 整合測試腳本 (scripts/verify_dispatch_api.js)
 * =========================================================================
 *  執行方式: node scripts/verify_dispatch_api.js
 *  
 *  驗證目標:
 *  1. POST /api/auth/login: 使用 JM30448 / 123 登入取得 JWT Token
 *  2. POST /api/dispatch-plans: 建立 2026-11-01 調度單 (OU_A51_MFG -> JMB03, JM11504)
 *  3. POST /api/dispatch-plans: 同廠同日重覆建單防呆驗證 (預期 409 Conflict)
 *  4. POST /api/dispatch-plans: 同日跨廠調度同一同仁防呆驗證 (預期 400 Bad Request)
 *  5. GET /api/dispatch-plans: 清單查詢涵蓋 2026-11-01，驗證單據與總人數
 *  6. GET /api/dispatch-plans/:planNo: 單筆調度單明細與人員結構檢驗
 *  7. PUT /api/dispatch-plans/:planNo: 修改調度單用途與時段，驗證更新生效
 *  8. DELETE /api/dispatch-plans/:planNo: 軟刪除調度單 (PlanStatus = 0)
 *  9. 刪除後狀態檢驗: 清單不顯示已刪除單據，且 check-conflict 釋放該員額度
 * =========================================================================
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// 測試用伺服器配置
const DEFAULT_PORT = process.env.PORT || 3000;
const ALT_PORT = 3001;
let targetPort = DEFAULT_PORT;
let serverProcess = null;

// 測試資料常數
const TEST_DATE = '2026-11-01';
const TEST_SOURCE_DEPT = 'OU_A51_MFG';
const TEST_TARGET_DEPT = 'JMB03';
const TEST_CONFLICT_DEPT = 'JMB02';
const TEST_EMP_ID = 'JM11504';
const LOGIN_USER = 'JM30448';
const LOGIN_PASS = '123';

// 測試狀態追蹤
let authToken = '';
let createdPlanNo = '';
let createdCaseAPlanNo = '';
let testResults = [];

/**
 * 發送 HTTP 請求輔助函式
 */
function apiRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch (e) {
                    parsed = { raw: data };
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

/**
 * 檢查指定的 Port 是否已有伺服器在執行
 */
async function checkServerRunning(port) {
    try {
        const res = await apiRequest({
            hostname: '127.0.0.1',
            port: port,
            path: '/api/db/status',
            method: 'GET',
            timeout: 1000
        });
        return res.statusCode === 200;
    } catch (e) {
        return false;
    }
}

/**
 * 啟動測試用 Express 伺服器
 */
async function ensureServerRunning() {
    const isDefaultRunning = await checkServerRunning(DEFAULT_PORT);
    if (isDefaultRunning) {
        console.log(`📡 偵測到已有 CPDS 伺服器運行於 Port ${DEFAULT_PORT}，直接沿用。`);
        targetPort = DEFAULT_PORT;
        return;
    }

    console.log(`🚀 正在於 Port ${ALT_PORT} 啟動後端伺服器 (node server.js)...`);
    targetPort = ALT_PORT;

    serverProcess = spawn(process.execPath, ['server.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
            ...process.env,
            VOLTA_HOME: process.env.VOLTA_HOME || 'C:\\Users\\jm30448\\AppData\\Local\\Volta',
            PORT: String(ALT_PORT)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (d) => {
        const text = d.toString();
        if (text.includes('LocalDB 資料庫連線成功') || text.includes('CPDS 伺服器已啟動')) {
            process.stdout.write(`   [Server] ${text.trim()}\n`);
        }
    });

    serverProcess.stderr.on('data', (d) => {
        process.stderr.write(`   [Server Error] ${d.toString()}`);
    });

    // 等待伺服器就緒 (最多等待 15 秒)
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
        await new Promise(r => setTimeout(r, 600));
        const ready = await checkServerRunning(ALT_PORT);
        if (ready) {
            console.log(`✅ 伺服器已於 Port ${ALT_PORT} 成功就緒！\n`);
            return;
        }
    }

    throw new Error(`無法在 Port ${ALT_PORT} 順利啟動後端伺服器！`);
}

/**
 * 清理子行程
 */
function cleanupServer() {
    if (serverProcess) {
        console.log('\n🛑 正在關閉測試用伺服器...');
        try {
            serverProcess.kill('SIGINT');
            serverProcess.kill('SIGTERM');
        } catch (e) {}
        serverProcess = null;
    }
}

process.on('exit', cleanupServer);
process.on('SIGINT', () => { cleanupServer(); process.exit(1); });
process.on('SIGTERM', () => { cleanupServer(); process.exit(1); });

/**
 * 記錄測試結果
 */
function recordResult(name, passed, detail = '') {
    testResults.push({ name, passed, detail });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} ${name}${detail ? ` (${detail})` : ''}`);
    if (!passed) {
        console.error(`   詳細資訊: ${detail}`);
    }
}

/**
 * 主執行函式
 */
async function runVerification() {
    console.log('================================================================');
    console.log('  CPDS 調度排程模組 API 自動化整合測試');
    console.log('================================================================\n');

    try {
        await ensureServerRunning();

        // -------------------------------------------------------------
        // 前置作業：先清空或刪除既有的 2026-11-01 測試單據 (避免舊測試殘留)
        // -------------------------------------------------------------
        try {
            // 先嘗試用管理帳密登入獲取臨時 token 來清理
            const preLogin = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/auth/login',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, { empId: LOGIN_USER, password: LOGIN_PASS });

            if (preLogin.statusCode === 200 && preLogin.body.token) {
                const tempToken = preLogin.body.token;
                for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
                    const existingRes = await apiRequest({
                        hostname: '127.0.0.1',
                        port: targetPort,
                        path: `/api/dispatch-plans?startDate=${d}&endDate=${d}`,
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${tempToken}` }
                    });

                    if (existingRes.body && Array.isArray(existingRes.body.data)) {
                        for (const plan of existingRes.body.data) {
                            await apiRequest({
                                hostname: '127.0.0.1',
                                port: targetPort,
                                path: `/api/dispatch-plans/${plan.planNo}`,
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${tempToken}` }
                            });
                        }
                    }
                }
            }
        } catch (e) {
            // 前置清理忽略錯誤
        }

        // =============================================================
        // 1. POST /api/auth/login 登入驗證取得 JWT Bearer Token
        // =============================================================
        {
            const testName = '情境 1: 登入取得 JWT Bearer Token (POST /api/auth/login)';
            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/auth/login',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, { empId: LOGIN_USER, password: LOGIN_PASS });

            const passed = res.statusCode === 200 && res.body.success === true && typeof res.body.token === 'string';
            if (passed) {
                authToken = res.body.token;
                recordResult(testName, true, `取得 Token 長度: ${authToken.length}`);
            } else {
                recordResult(testName, false, `Status: ${res.statusCode}, Message: ${res.body.message}`);
                throw new Error('登入失敗，無法繼續執行後續測試');
            }
        }

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        };

        // =============================================================
        // 2. POST /api/dispatch-plans 建立調度單
        // =============================================================
        {
            const testName = '情境 2: 建立測試調度單 (POST /api/dispatch-plans)';
            const payload = {
                dispatchDate: TEST_DATE,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '17:00',
                        purpose: '測試支援',
                        employees: [
                            { empId: TEST_EMP_ID }
                        ]
                    }
                ]
            };

            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, payload);

            const passed = (res.statusCode === 200 || res.statusCode === 201) &&
                           res.body.success === true &&
                           typeof res.body.planNo === 'string' &&
                           res.body.planNo.startsWith(`DP${TEST_DATE.replace(/-/g, '')}-`);

            if (passed) {
                createdPlanNo = res.body.planNo;
                recordResult(testName, true, `成功產生單號: ${createdPlanNo}`);
            } else {
                recordResult(testName, false, `Status: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`);
                throw new Error('建立調度單失敗');
            }
        }

        // =============================================================
        // 3. 同日同來源廠重複建立防呆 (預期 409 Conflict)
        // =============================================================
        {
            const testName = '情境 3: 同廠同日重複建單防呆檢驗 (POST /api/dispatch-plans 重複)';
            const payload = {
                dispatchDate: TEST_DATE,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '09:00',
                        endTime: '18:00',
                        purpose: '重複建單測試',
                        employees: [
                            { empId: 'A0123' }
                        ]
                    }
                ]
            };

            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, payload);

            const passed = res.statusCode === 409 && res.body.success === false;
            recordResult(testName, passed, `Status: ${res.statusCode}, 提示: ${res.body.message}`);
        }

        // =============================================================
        // 4. 人員排定前跨廠衝突防呆 (預期 400 Bad Request)
        // =============================================================
        {
            const testName = '情境 4: 跨廠人員排定衝突檢驗 (POST /api/dispatch-plans 衝突)';
            // 另一來源廠 JMB02 嘗試調派已於 TEST_DATE 排定之 JM11504
            const payload = {
                dispatchDate: TEST_DATE,
                sourceDeptId: TEST_CONFLICT_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '12:00',
                        purpose: '衝突測試支援',
                        employees: [
                            { empId: TEST_EMP_ID }
                        ]
                    }
                ]
            };

            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, payload);

            const passed = res.statusCode === 400 &&
                           res.body.success === false &&
                           (res.body.message.includes('衝突') || res.body.message.includes('有效調派') || (Array.isArray(res.body.conflicts) && res.body.conflicts.length > 0));

            recordResult(testName, passed, `Status: ${res.statusCode}, 提示: ${res.body.message}`);
        }

        // =============================================================
        // 5. GET /api/dispatch-plans 查詢清單
        // =============================================================
        {
            const testName = '情境 5: 查詢調度單清單 (GET /api/dispatch-plans)';
            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans?startDate=${TEST_DATE}&endDate=${TEST_DATE}`,
                method: 'GET',
                headers: authHeaders
            });

            let passed = false;
            let detail = '';

            if (res.statusCode === 200 && res.body.success === true && Array.isArray(res.body.data)) {
                const found = res.body.data.find(p => p.planNo === createdPlanNo);
                if (found) {
                    const itemCount = Array.isArray(found.items) ? found.items.length : found.totalItemCount;
                    const empCount = found.totalEmpCount;
                    if (itemCount >= 1 && empCount === 1) {
                        passed = true;
                        detail = `找到單據 ${found.planNo}, 時段數: ${itemCount}, 人數: ${empCount}`;
                    } else {
                        detail = `單據欄位數值不符合預期: 時段數=${itemCount}, 人數=${empCount}`;
                    }
                } else {
                    detail = `清單中未找到建立之調度單: ${createdPlanNo}`;
                }
            } else {
                detail = `Status: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`;
            }

            recordResult(testName, passed, detail);
        }

        // =============================================================
        // 6. GET /api/dispatch-plans/:planNo 取得單筆完整明細
        // =============================================================
        {
            const testName = '情境 6: 查詢單筆調度單完整明細 (GET /api/dispatch-plans/:planNo)';
            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans/${createdPlanNo}`,
                method: 'GET',
                headers: authHeaders
            });

            let passed = false;
            let detail = '';

            if (res.statusCode === 200 && res.body.success === true && res.body.data) {
                const plan = res.body.data;
                const matchPlanNo = plan.planNo === createdPlanNo;
                const matchItem = plan.items && plan.items.length > 0 && plan.items[0].targetDeptId === TEST_TARGET_DEPT;
                const matchEmp = plan.items && plan.items[0].employees && plan.items[0].employees.some(e => e.empId === TEST_EMP_ID);

                if (matchPlanNo && matchItem && matchEmp) {
                    passed = true;
                    detail = `單號相符, 目的廠: ${plan.items[0].targetDeptId}, 人員: ${plan.items[0].employees[0].empId} (${plan.items[0].employees[0].name})`;
                } else {
                    detail = `明細資料比對不符: matchPlanNo=${matchPlanNo}, matchItem=${matchItem}, matchEmp=${matchEmp}`;
                }
            } else {
                detail = `Status: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`;
            }

            recordResult(testName, passed, detail);
        }

        // =============================================================
        // 7. PUT /api/dispatch-plans/:planNo 修改調度單
        // =============================================================
        {
            const testName = '情境 7: 修改調度單用途與時段 (PUT /api/dispatch-plans/:planNo)';
            const updatePayload = {
                dispatchDate: TEST_DATE,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:30',
                        endTime: '17:30',
                        purpose: '測試支援-已更新',
                        employees: [
                            { empId: TEST_EMP_ID }
                        ]
                    }
                ]
            };

            const putRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans/${createdPlanNo}`,
                method: 'PUT',
                headers: authHeaders
            }, updatePayload);

            let passed = false;
            let detail = '';

            if (putRes.statusCode === 200 && putRes.body.success === true) {
                // 再次查詢確認內容已改變
                const getRes = await apiRequest({
                    hostname: '127.0.0.1',
                    port: targetPort,
                    path: `/api/dispatch-plans/${createdPlanNo}`,
                    method: 'GET',
                    headers: authHeaders
                });

                if (getRes.statusCode === 200 && getRes.body.data && getRes.body.data.items) {
                    const item = getRes.body.data.items[0];
                    if (item.purpose === '測試支援-已更新' && item.startTime.startsWith('08:30') && item.endTime.startsWith('17:30')) {
                        passed = true;
                        detail = `用途更新為: "${item.purpose}", 時段: ${item.startTime}~${item.endTime}`;
                    } else {
                        detail = `資料未更新: purpose=${item.purpose}, time=${item.startTime}~${item.endTime}`;
                    }
                } else {
                    detail = `重新查詢明細失敗: Status=${getRes.statusCode}`;
                }
            } else {
                detail = `PUT Status: ${putRes.statusCode}, Body: ${JSON.stringify(putRes.body)}`;
            }

            recordResult(testName, passed, detail);
        }

        // =============================================================
        // 8. DELETE /api/dispatch-plans/:planNo 軟刪除調度單
        // =============================================================
        {
            const testName = '情境 8: 軟刪除調度單 (DELETE /api/dispatch-plans/:planNo)';
            const res = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans/${createdPlanNo}`,
                method: 'DELETE',
                headers: authHeaders
            });

            const passed = res.statusCode === 200 && res.body.success === true;
            recordResult(testName, passed, `Status: ${res.statusCode}, 訊息: ${res.body.message}`);
        }

        // =============================================================
        // 9. 驗證刪除後狀態 (清單不顯示 + 人員衝突額度釋放)
        // =============================================================
        {
            const testName = '情境 9: 驗證刪除後狀態 (清單不顯示 & 衝突額度釋出)';
            let checkListPassed = false;
            let checkConflictPassed = false;
            let detail = '';

            // 9a: 清單確認不再回傳已軟刪除的單據
            const listRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans?startDate=${TEST_DATE}&endDate=${TEST_DATE}`,
                method: 'GET',
                headers: authHeaders
            });

            if (listRes.statusCode === 200 && listRes.body.success === true) {
                const found = (listRes.body.data || []).find(p => p.planNo === createdPlanNo);
                checkListPassed = !found;
            }

            // 9b: 衝突檢驗確認 JM11504 於 2026-11-01 之額度已被釋放
            const conflictRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans/check-conflict',
                method: 'POST',
                headers: authHeaders
            }, {
                dispatchDate: TEST_DATE,
                empIds: [TEST_EMP_ID]
            });

            if (conflictRes.statusCode === 200 && conflictRes.body.success === true) {
                checkConflictPassed = Array.isArray(conflictRes.body.conflicts) && conflictRes.body.conflicts.length === 0;
            }

            const passed = checkListPassed && checkConflictPassed;
            detail = `清單已排除: ${checkListPassed ? '✔' : '✘'}, 人員衝突已完全釋放: ${checkConflictPassed ? '✔' : '✘'}`;
            recordResult(testName, passed, detail);
        }

        // =============================================================
        // 10. Case A: 同一人同日非重疊時段 (08:00~12:00 與 13:00~17:00) 建立調度單 -> 應成功儲存
        // =============================================================
        {
            const testName = '情境 10 (Case A): 同一人同日非重疊時段 (08:00~12:00 與 13:00~17:00) 應成功儲存';
            const dateA = '2026-11-02';
            
            // 10a. check-conflict 檢驗非重疊時段不應報衝突
            const checkConflictRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans/check-conflict',
                method: 'POST',
                headers: authHeaders
            }, {
                dispatchDate: dateA,
                startTime: '13:00',
                endTime: '17:00',
                empIds: [TEST_EMP_ID]
            });

            // 10b. 建立包含兩個非重疊時段之調度單 (同一人同一天)
            const payload = {
                dispatchDate: dateA,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '12:00',
                        purpose: '上午支援',
                        employees: [{ empId: TEST_EMP_ID }]
                    },
                    {
                        targetDeptId: TEST_CONFLICT_DEPT,
                        startTime: '13:00',
                        endTime: '17:00',
                        purpose: '下午支援',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };

            const createRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, payload);

            let caseAPlanNo = createRes.body.planNo;

            const passed = (createRes.statusCode === 200 || createRes.statusCode === 201) &&
                           createRes.body.success === true &&
                           checkConflictRes.statusCode === 200 &&
                           checkConflictRes.body.conflicts &&
                           checkConflictRes.body.conflicts.length === 0;

            recordResult(testName, passed, `Status: ${createRes.statusCode}, PlanNo: ${createRes.body.planNo || 'N/A'}, Message: ${createRes.body.message || ''}`);
            createdCaseAPlanNo = caseAPlanNo;
        }

        // =============================================================
        // 11. Case B: 同一人同日重疊時段 (08:00~12:00 與 10:00~14:00) -> 預期 400 Bad Request
        // =============================================================
        {
            const testName = '情境 11 (Case B): 同一人同日重疊時段 (08:00~12:00 與 10:00~14:00) 預期 400 Bad Request';
            const dateB = '2026-11-03';

            // 11a. 單內自我重疊比對：同一調度單內兩時段重疊且包含同一人
            const internalOverlapPayload = {
                dispatchDate: dateB,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '12:00',
                        purpose: '上午時段',
                        employees: [{ empId: TEST_EMP_ID }]
                    },
                    {
                        targetDeptId: TEST_CONFLICT_DEPT,
                        startTime: '10:00',
                        endTime: '14:00',
                        purpose: '重疊時段',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };

            const internalRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, internalOverlapPayload);

            // 11b. 跨單重疊衝突檢驗：針對 Case A (2026-11-02 已排 08:00~12:00 與 13:00~17:00)
            const checkOverlapRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans/check-conflict',
                method: 'POST',
                headers: authHeaders
            }, {
                dispatchDate: '2026-11-02',
                startTime: '10:00',
                endTime: '14:00',
                empIds: [TEST_EMP_ID]
            });

            // 11c. 跨單重疊建單：另一廠排定同人重疊時段
            const crossOverlapPayload = {
                dispatchDate: '2026-11-02',
                sourceDeptId: TEST_CONFLICT_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '10:00',
                        endTime: '14:00',
                        purpose: '跨單重疊支援',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };
            const crossRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, crossOverlapPayload);

            const internalPassed = internalRes.statusCode === 400 && internalRes.body.success === false;
            const checkConflictPassed = checkOverlapRes.statusCode === 200 &&
                                        Array.isArray(checkOverlapRes.body.conflicts) &&
                                        checkOverlapRes.body.conflicts.some(c => c.empId === TEST_EMP_ID);
            const crossPassed = crossRes.statusCode === 400 && crossRes.body.success === false;

            const passed = internalPassed && checkConflictPassed && crossPassed;
            recordResult(testName, passed, `單內自我重疊阻擋: ${internalPassed ? '✔' : '✘'}, 衝突API檢出: ${checkConflictPassed ? '✔' : '✘'}, 跨單重疊阻擋: ${crossPassed ? '✔' : '✘'}`);
        }

        // =============================================================
        // 12. Case C: 同一人同日相接時段 (08:00~12:00 與 12:00~16:00) -> 應成功儲存
        // =============================================================
        {
            const testName = '情境 12 (Case C): 同一人同日相接時段 (08:00~12:00 與 12:00~16:00) 應成功儲存';
            const dateC = '2026-11-04';

            const payload = {
                dispatchDate: dateC,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '12:00',
                        purpose: '時段一',
                        employees: [{ empId: TEST_EMP_ID }]
                    },
                    {
                        targetDeptId: TEST_CONFLICT_DEPT,
                        startTime: '12:00',
                        endTime: '16:00',
                        purpose: '相接時段二',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };

            const createRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, payload);

            // check-conflict 檢驗相接邊界時間不應報衝突
            const checkBoundaryRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans/check-conflict',
                method: 'POST',
                headers: authHeaders
            }, {
                dispatchDate: dateC,
                startTime: '16:00',
                endTime: '20:00',
                empIds: [TEST_EMP_ID]
            });

            const passed = (createRes.statusCode === 200 || createRes.statusCode === 201) &&
                           createRes.body.success === true &&
                           checkBoundaryRes.statusCode === 200 &&
                           Array.isArray(checkBoundaryRes.body.conflicts) &&
                           checkBoundaryRes.body.conflicts.length === 0;

            recordResult(testName, passed, `Status: ${createRes.statusCode}, PlanNo: ${createRes.body.planNo || 'N/A'}, 邊界時段無衝突: ${checkBoundaryRes.body.conflicts && checkBoundaryRes.body.conflicts.length === 0 ? '✔' : '✘'}`);
        }

        // =============================================================
        // 13. Case D: 異常狀態 (CheckInStatus = 3) 人員排入重疊時段 -> 預期 400 Bad Request
        // =============================================================
        {
            const testName = '情境 13 (Case D): 異常狀態 (CheckInStatus = 3) 人員排入重疊時段預期 400 Bad Request';
            const dateD = '2026-11-05';

            // 13a. 先建立調度單，包含人員處於異常狀態 (CheckInStatus = 3)
            const planPayload = {
                dispatchDate: dateD,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '12:00',
                        purpose: '異常狀態時段測試',
                        employees: [{ empId: TEST_EMP_ID, checkInStatus: 3 }]
                    }
                ]
            };

            const createRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, planPayload);

            // 13b. check-conflict 檢驗重疊時段 (10:00~14:00) 應視為佔用並回報衝突
            const conflictRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans/check-conflict',
                method: 'POST',
                headers: authHeaders
            }, {
                dispatchDate: dateD,
                startTime: '10:00',
                endTime: '14:00',
                empIds: [TEST_EMP_ID]
            });

            // 13c. 嘗試於另一調度單排入該同仁重疊時段 (10:00~14:00) -> 預期 400 Bad Request
            const overlapPayload = {
                dispatchDate: dateD,
                sourceDeptId: TEST_CONFLICT_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '10:00',
                        endTime: '14:00',
                        purpose: '嘗試排入已異常同仁之重疊時段',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };

            const overlapRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/api/dispatch-plans',
                method: 'POST',
                headers: authHeaders
            }, overlapPayload);

            const conflictDetected = conflictRes.statusCode === 200 &&
                                     Array.isArray(conflictRes.body.conflicts) &&
                                     conflictRes.body.conflicts.some(c => c.empId === TEST_EMP_ID);
            const blocked = overlapRes.statusCode === 400 && overlapRes.body.success === false;

            const passed = (createRes.statusCode === 200 || createRes.statusCode === 201) && conflictDetected && blocked;
            recordResult(testName, passed, `單據建立: ${createRes.statusCode}, 異常人員時段鎖定 (衝突檢核): ${conflictDetected ? '✔' : '✘'}, 跨單重疊阻擋 (HTTP 400): ${blocked ? '✔' : '✘'}`);
        }

        // =============================================================
        // 14. 修改調度單 (PUT /api/dispatch-plans/:planNo) 重疊防呆與合法更新
        // =============================================================
        if (createdCaseAPlanNo) {
            const testName = '情境 14: 修改調度單 (PUT) 單內自我重疊阻擋與合法時段更新';
            const dateA = '2026-11-02';

            // 14a. 嘗試將 Case A 調度單修改為同一人單內重疊時段 (08:00~12:00 與 10:00~14:00)
            const putOverlapPayload = {
                dispatchDate: dateA,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '12:00',
                        purpose: '更新重疊時段一',
                        employees: [{ empId: TEST_EMP_ID }]
                    },
                    {
                        targetDeptId: TEST_CONFLICT_DEPT,
                        startTime: '10:00',
                        endTime: '14:00',
                        purpose: '更新重疊時段二',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };

            const putOverlapRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans/${createdCaseAPlanNo}`,
                method: 'PUT',
                headers: authHeaders
            }, putOverlapPayload);

            // 14b. 修改為合法之相接多時段 (08:00~11:00 與 11:00~15:00)
            const putValidPayload = {
                dispatchDate: dateA,
                sourceDeptId: TEST_SOURCE_DEPT,
                items: [
                    {
                        targetDeptId: TEST_TARGET_DEPT,
                        startTime: '08:00',
                        endTime: '11:00',
                        purpose: '更新合法時段一',
                        employees: [{ empId: TEST_EMP_ID }]
                    },
                    {
                        targetDeptId: TEST_CONFLICT_DEPT,
                        startTime: '11:00',
                        endTime: '15:00',
                        purpose: '更新合法相接時段二',
                        employees: [{ empId: TEST_EMP_ID }]
                    }
                ]
            };

            const putValidRes = await apiRequest({
                hostname: '127.0.0.1',
                port: targetPort,
                path: `/api/dispatch-plans/${createdCaseAPlanNo}`,
                method: 'PUT',
                headers: authHeaders
            }, putValidPayload);

            const overlapBlocked = putOverlapRes.statusCode === 400 && putOverlapRes.body.success === false;
            const validSuccess = putValidRes.statusCode === 200 && putValidRes.body.success === true;

            const passed = overlapBlocked && validSuccess;
            recordResult(testName, passed, `PUT單內重疊阻擋: ${overlapBlocked ? '✔' : '✘'}, PUT相接合法更新: ${validSuccess ? '✔' : '✘'}`);
        }

    } catch (err) {
        console.error('\n💥 測試過程發生未捕捉例外:', err);
    } finally {
        cleanupServer();
    }

    // =============================================================
    // 輸出統計報表
    // =============================================================
    const total = testResults.length;
    const passedCount = testResults.filter(t => t.passed).length;
    const failedCount = total - passedCount;

    console.log('\n================================================================');
    console.log('  測試執行統計總結');
    console.log('================================================================');
    console.log(`  總測試項目數: ${total}`);
    console.log(`  成功項目數  : ${passedCount}`);
    console.log(`  失敗項目數  : ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0 || total < 14) {
        console.error('❌ 測試未完全通過！請檢查上述失敗項目。');
        process.exit(1);
    } else {
        console.log(`🎉 所有 ${total} 項情境測試均全部通過！(Exit Code: 0)`);
        process.exit(0);
    }
}

runVerification();
