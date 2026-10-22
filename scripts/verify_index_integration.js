/**
 * =========================================================================
 *  Task 5 前端 index.html 整合檢核腳本 (scripts/verify_index_integration.js)
 * =========================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEST_PORT = 3002;
let serverProc = null;

async function run() {
    console.log('================================================================');
    console.log('  Task 5 前端 index.html 與 API 整合檢核');
    console.log('================================================================\n');

    // 1. 檢驗 index.html 檔案結構與關鍵元件
    console.log('📌 [檢核 1] 檢驗 index.html 關鍵依賴與腳本標籤...');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    const checks = [
        { desc: '包含 scripts/auth.js 引用', pass: html.includes('<script src="scripts/auth.js"></script>') },
        { desc: '包含 scripts/api.js 引用', pass: html.includes('<script src="scripts/api.js"></script>') },
        { desc: '包含 navbarUserArea 容器', pass: html.includes('id="navbarUserArea"') },
        { desc: '包含 Auth.requireAuth 認證檢核', pass: html.includes('Auth.requireAuth(') },
        { desc: '包含 Auth.renderNavbarUser 導覽列使用者資訊掛載', pass: html.includes('Auth.renderNavbarUser(') },
        { desc: '包含 API.get(\'/api/departments\') 動態組織載入', pass: html.includes("API.get('/api/departments')") },
        { desc: '包含 API.get(\'/api/dispatch-plans\') 調度單主清單查詢', pass: html.includes("API.get('/api/dispatch-plans'") },
        { desc: '包含 API.post(\'/api/dispatch-plans\') 新增調度單儲存', pass: html.includes("API.post('/api/dispatch-plans', payload)") },
        { desc: '包含 API.put(\'/api/dispatch-plans/\') 修改調度單更新', pass: html.includes("API.put('/api/dispatch-plans/' + editingPlanId") },
        { desc: '包含 API.delete(\'/api/dispatch-plans/\') 刪除調度單', pass: html.includes("API.delete('/api/dispatch-plans/' + planNo)") },
        { desc: '包含 API.post(\'/api/dispatch-plans/check-conflict\') 衝突防呆檢核', pass: html.includes("API.post('/api/dispatch-plans/check-conflict'") },
        { desc: '包含 API.post(\'/api/employees\') 員工資料動態載入', pass: html.includes("API.post('/api/employees'") },
        // Task 4: 前端時段即時聯動與防呆檢核
        { desc: '包含 isTimeOverlap 時段重疊判定函式', pass: html.includes('function isTimeOverlap(') || html.includes('isTimeOverlap =') },
        { desc: '包含 debounce 防抖函式以支援時間輸入即時聯動', pass: html.includes('debounce(') || html.includes('debounce =') },
        { 
            desc: 'renderPersonnelChecklist 傳遞 startTime 與 endTime 至 check-conflict', 
            pass: (() => {
                const m = html.match(/async\s+function\s+renderPersonnelChecklist[\s\S]*?API\.post\(\s*['"]\/api\/dispatch-plans\/check-conflict['"]\s*,\s*\{([\s\S]*?)\}\s*\)/);
                return m && m[1].includes('startTime') && m[1].includes('endTime');
            })()
        },
        { desc: '包含非重疊時段同仁之提示 badge (今日已排與 bi-clock-history)', pass: html.includes('今日已排') && html.includes('bi-clock-history') },
        { desc: '包含時段衝突同仁之鎖定 badge (已被排定至與 bi-lock-fill)', pass: html.includes('已被排定至') && html.includes('bi-lock-fill') },
        { desc: 'btnAddSubItem 包含前端明細時段重疊防呆檢驗', pass: /#btnAddSubItem[\s\S]*?isTimeOverlap[\s\S]*?currentSubItems/.test(html) },
        { desc: 'btnUpdateSubItem 包含前端明細時段重疊防呆檢驗', pass: /#btnUpdateSubItem[\s\S]*?isTimeOverlap[\s\S]*?currentSubItems/.test(html) }
    ];

    let allChecksPassed = true;
    for (const c of checks) {
        if (c.pass) {
            console.log(`  ✅ [PASS] ${c.desc}`);
        } else {
            console.error(`  ❌ [FAIL] ${c.desc}`);
            allChecksPassed = false;
        }
    }

    if (!allChecksPassed) {
        console.error('\n❌ index.html 代碼靜態檢核未通過！');
        process.exit(1);
    }
    console.log('🎉 index.html 靜態結構與 API 串接語法檢核完全正確！\n');

    // 1b. 驗證 isTimeOverlap 及前端衝突防呆運算邏輯
    console.log('📌 [檢核 1b] 驗證 isTimeOverlap 及前端防呆演算邏輯...');
    const vm = require('vm');
    const scriptMatches = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
    let mainScript = '';
    for (const sm of scriptMatches) {
        if (sm.includes('renderPersonnelChecklist')) {
            mainScript = sm.replace(/<\/?script>/g, '');
            break;
        }
    }

    const normMatch = mainScript.match(/function\s+normalizeTime[\s\S]*?\n        \}/);
    const overlapMatch = mainScript.match(/function\s+isTimeOverlap[\s\S]*?\n        \}/);
    const dedupMatch = mainScript.match(/function\s+deduplicateEmployees[\s\S]*?\n        \}/);
    if (!normMatch || !overlapMatch || !dedupMatch) {
        console.error('❌ 未在 index.html 找到 normalizeTime、isTimeOverlap 或 deduplicateEmployees 實作！');
        process.exit(1);
    }

    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`
        ${normMatch[0]}
        ${overlapMatch[0]}
        ${dedupMatch[0]}
        globalThis.isTimeOverlap = isTimeOverlap;
        globalThis.deduplicateEmployees = deduplicateEmployees;
    `, sandbox);

    const { isTimeOverlap, deduplicateEmployees } = sandbox;
    if (isTimeOverlap('08:00', '12:00', '13:00', '17:00') !== false) {
        throw new Error('isTimeOverlap 失敗: 08:00~12:00 與 13:00~17:00 應為 false');
    }
    if (isTimeOverlap('08:00', '12:00', '12:00', '17:00') !== false) {
        throw new Error('isTimeOverlap 失敗: 08:00~12:00 與 12:00~17:00 邊界相接應為 false');
    }
    if (isTimeOverlap('08:00', '12:00', '10:00', '14:00') !== true) {
        throw new Error('isTimeOverlap 失敗: 08:00~12:00 與 10:00~14:00 應為 true');
    }
    if (isTimeOverlap('08:00', '17:00', '09:00', '12:00') !== true) {
        throw new Error('isTimeOverlap 失敗: 08:00~17:00 與 09:00~12:00 包含關係應為 true');
    }

    // 驗證同一時段重複同仁去重 (如鍾佩伶 JM10494 重複出現多次應合併為 1 筆)
    const dupTestInput = [
        { id: 'JM10005', name: '陳玉香' },
        { id: 'JM10494', name: '鍾佩伶' },
        { id: 'JM10494', name: '鍾佩伶' },
        { id: 'JM10494', name: '鍾佩伶' },
        { id: 'JM10528', name: '汪雪梅' }
    ];
    const dedupResult = deduplicateEmployees(dupTestInput);
    if (dedupResult.length !== 3 || dedupResult.filter(e => e.id === 'JM10494').length !== 1) {
        throw new Error(`deduplicateEmployees 失敗: 預期 3 筆且 JM10494 僅 1 筆，實際長度 ${dedupResult.length}`);
    }
    console.log('  ✅ isTimeOverlap 演算法與 deduplicateEmployees 同仁去重檢核全部正確！\n');

    // 2. 啟動伺服器進行即時 API 聯調驗證
    console.log(`🚀 [檢核 2] 於 Port ${TEST_PORT} 啟動後端伺服器 (node server.js)...`);
    serverProc = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: TEST_PORT },
        stdio: 'pipe'
    });

    await new Promise((resolve) => {
        serverProc.stdout.on('data', (d) => {
            const str = d.toString();
            if (str.includes(`http://localhost:${TEST_PORT}`)) {
                resolve();
            }
        });
        setTimeout(resolve, 3000);
    });
    console.log(`✅ 後端伺服器就緒！\n`);

    const api = async (method, pathUrl, body = null, token = null) => {
        const url = `http://localhost:${TEST_PORT}${pathUrl}`;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = text; }
        return { status: res.status, data: json };
    };

    try {
        // 2.1 登入
        console.log('🔑 [檢核 3] 執行登入取得 Token (POST /api/auth/login)...');
        const loginRes = await api('POST', '/api/auth/login', { empId: 'JM30448', password: '123' });
        if (loginRes.status !== 200 || !loginRes.data.token) {
            throw new Error(`登入失敗: ${JSON.stringify(loginRes.data)}`);
        }
        const token = loginRes.data.token;
        console.log(`  ✅ 登入成功，取得 Token！\n`);

        // 2.2 取得部門清單
        console.log('🏢 [檢核 4] 載入部門下拉資料 (GET /api/departments)...');
        const deptRes = await api('GET', '/api/departments', null, token);
        if (deptRes.status !== 200 || !deptRes.data.success) {
            throw new Error(`取得部門失敗: ${JSON.stringify(deptRes.data)}`);
        }
        console.log(`  ✅ 成功取得 ${deptRes.data.data.length} 個部門廠別選項！\n`);

        // 2.3 查詢員工
        console.log('👤 [檢核 5] 載入部門人員清單 (POST /api/employees)...');
        const empRes = await api('POST', '/api/employees', { Department: 'OU_A51_MFG' }, token);
        if (empRes.status !== 200 || !Array.isArray(empRes.data)) {
            throw new Error(`取得人員失敗: ${JSON.stringify(empRes.data)}`);
        }
        console.log(`  ✅ 成功取得 ${empRes.data.length} 位人員資料！\n`);

        // 2.4 新增調度單
        const testDate = '2026-11-20';
        console.log(`📝 [檢核 6] 模擬前端送出儲存調度單 (POST /api/dispatch-plans)...`);
        const createRes = await api('POST', '/api/dispatch-plans', {
            dispatchDate: testDate,
            sourceDeptId: 'OU_A51_MFG',
            items: [
                {
                    seq: 1,
                    targetDeptId: 'JMB03',
                    startTime: '08:30',
                    endTime: '17:30',
                    purpose: '前端畫面整合測試',
                    employees: [{ empId: 'JM11504', name: '沈佳承' }]
                }
            ]
        }, token);

        if (createRes.status !== 200 || !createRes.data.success) {
            throw new Error(`新增調度單失敗: ${JSON.stringify(createRes.data)}`);
        }
        const planNo = createRes.data.planNo;
        console.log(`  ✅ 調度單建立成功，單號：${planNo}\n`);

        // 2.5 驗證排程人員衝突檢驗 (支援時段重疊比對)
        console.log(`⚠️ [檢核 7] 模擬人員衝突檢核 (POST /api/dispatch-plans/check-conflict)...`);
        
        // 7a: 重疊時段檢核 (09:00~12:00 重疊 08:30~17:30) -> 應回報衝突
        const conflictRes = await api('POST', '/api/dispatch-plans/check-conflict', {
            dispatchDate: testDate,
            startTime: '09:00',
            endTime: '12:00',
            empIds: ['JM11504']
        }, token);

        if (conflictRes.status !== 200 || !conflictRes.data.conflicts || conflictRes.data.conflicts.length === 0) {
            throw new Error(`衝突檢驗未能識別重疊時段已排程人員: ${JSON.stringify(conflictRes.data)}`);
        }
        console.log(`  ✅ 重疊時段衝突檢驗成功識別出 JM11504 已被調派至 ${conflictRes.data.conflicts[0].targetDeptName} (${conflictRes.data.conflicts[0].startTime}~${conflictRes.data.conflicts[0].endTime})！`);

        // 7b: 非重疊時段檢核 (18:00~20:00 與 08:30~17:30 不重疊) -> 應無衝突
        const nonOverlapRes = await api('POST', '/api/dispatch-plans/check-conflict', {
            dispatchDate: testDate,
            startTime: '18:00',
            endTime: '20:00',
            empIds: ['JM11504']
        }, token);

        if (nonOverlapRes.status !== 200 || !nonOverlapRes.data.conflicts || nonOverlapRes.data.conflicts.length !== 0) {
            throw new Error(`非重疊時段不應回報衝突，但收到: ${JSON.stringify(nonOverlapRes.data)}`);
        }
        console.log(`  ✅ 非重疊時段 (18:00~20:00) 檢驗正確回傳無衝突！`);

        // 7c: 邊界相接時段檢核 (17:30~20:00 與 08:30~17:30 邊界相接) -> 應無衝突
        const boundaryRes = await api('POST', '/api/dispatch-plans/check-conflict', {
            dispatchDate: testDate,
            startTime: '17:30',
            endTime: '20:00',
            empIds: ['JM11504']
        }, token);

        if (boundaryRes.status !== 200 || !boundaryRes.data.conflicts || boundaryRes.data.conflicts.length !== 0) {
            throw new Error(`邊界相接時段 (17:30) 不應回報衝突，但收到: ${JSON.stringify(boundaryRes.data)}`);
        }
        console.log(`  ✅ 邊界相接時段 (17:30~20:00) 檢驗正確判定合法無衝突！\n`);

        // 2.6 驗證清單查詢
        console.log(`📋 [檢核 8] 模擬前端查詢調度清單 (GET /api/dispatch-plans)...`);
        const listRes = await api('GET', `/api/dispatch-plans?startDate=${testDate}&endDate=${testDate}`, null, token);
        if (listRes.status !== 200 || !Array.isArray(listRes.data.data)) {
            throw new Error(`查詢清單失敗: ${JSON.stringify(listRes.data)}`);
        }
        const foundPlan = listRes.data.data.find(p => p.planNo === planNo);
        if (!foundPlan) {
            throw new Error(`清單中未找到建立的單據 ${planNo}`);
        }
        console.log(`  ✅ 清單成功查詢到單據 ${planNo}，時段數：${foundPlan.items.length}\n`);

        // 2.7 驗證點選修改載入
        console.log(`🔍 [檢核 9] 模擬點選「修改」取得單筆明細 (GET /api/dispatch-plans/${planNo})...`);
        const getSingleRes = await api('GET', `/api/dispatch-plans/${planNo}`, null, token);
        if (getSingleRes.status !== 200 || getSingleRes.data.data.planNo !== planNo) {
            throw new Error(`載入單筆資料失敗: ${JSON.stringify(getSingleRes.data)}`);
        }
        console.log(`  ✅ 成功載入單筆資料，準備回填編輯器！\n`);

        // 2.8 驗證修改更新儲存
        console.log(`💾 [檢核 10] 模擬編輯後更新儲存 (PUT /api/dispatch-plans/${planNo})...`);
        const updateRes = await api('PUT', `/api/dispatch-plans/${planNo}`, {
            dispatchDate: testDate,
            sourceDeptId: 'OU_A51_MFG',
            items: [
                {
                    seq: 1,
                    targetDeptId: 'JMB03',
                    startTime: '09:00',
                    endTime: '18:00',
                    purpose: '前端畫面修改測試-已更新',
                    employees: [{ empId: 'JM11504', name: '沈佳承' }]
                }
            ]
        }, token);
        if (updateRes.status !== 200 || !updateRes.data.success) {
            throw new Error(`更新調度單失敗: ${JSON.stringify(updateRes.data)}`);
        }
        console.log(`  ✅ 調度單更新成功！\n`);

        // 2.9 驗證點選刪除單據
        console.log(`🗑️ [檢核 11] 模擬點選「刪除」單據 (DELETE /api/dispatch-plans/${planNo})...`);
        const deleteRes = await api('DELETE', `/api/dispatch-plans/${planNo}`, null, token);
        if (deleteRes.status !== 200 || !deleteRes.data.success) {
            throw new Error(`刪除調度單失敗: ${JSON.stringify(deleteRes.data)}`);
        }
        console.log(`  ✅ 調度單刪除成功！\n`);

        console.log('================================================================');
        console.log('🎉 Task 5 前端 index.html 畫面改造與 API 串接檢核全部通過！');
        console.log('================================================================');

    } finally {
        if (serverProc) {
            serverProc.kill();
        }
    }
}

run().catch((err) => {
    console.error('❌ 檢核流程發生錯誤:', err);
    if (serverProc) serverProc.kill();
    process.exit(1);
});
