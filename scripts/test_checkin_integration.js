/**
 * =========================================================================
 *  Task 6: 現場簽到系統端到端完整整合驗證 (E2E Integration Test)
 *  檔案: scripts/test_checkin_integration.js
 * =========================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createCheckinRouter } = require('../routes/checkin');

const JWT_SECRET = 'cpds_integration_test_secret_key_2026';

// 建立 Express 測試應用程式
const app = express();
app.use(express.json());

// 模擬 /api/auth 登入路由
app.post('/api/auth/login', (req, res) => {
    const { empId, password } = req.body;
    if (empId === 'JM30448' && password === '123') {
        const token = jwt.sign(
            { empId: 'JM30448', name: '李奕諴', deptId: 'JMB03' },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        return res.json({
            success: true,
            token,
            user: { empId: 'JM30448', name: '李奕諴', deptId: 'JMB03' }
        });
    }
    return res.status(401).json({
        success: false,
        message: '員工工號或密碼錯誤！'
    });
});

// 掛載現場簽到模組路由 (/api/checkin)
app.use('/api/checkin', createCheckinRouter({
    getDbPool: () => null, // 測試備援記憶體模式
    sql: null,
    JWT_SECRET
}));

async function runTests() {
    console.log('================================================================');
    console.log('  CPDS 現場簽到系統端到端整合驗證 (Task 6 E2E Verification)');
    console.log('================================================================\n');

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    console.log(`🚀 測試伺服器已啟動於 port: ${port}`);

    try {
        // 0. 驗證身分認證 (POST /api/auth/login)
        console.log('\n--- [Test 0] 驗證身分認證與 Token 核發 ---');
        const loginFail = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId: 'INVALID', password: 'wrong' })
        });
        assert.strictEqual(loginFail.status, 401, '無效帳密應被拒絕 401');

        const loginSuccess = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId: 'JM30448', password: '123' })
        });
        assert.strictEqual(loginSuccess.status, 200, '正確登入應回傳 200');
        const loginData = await loginSuccess.json();
        assert.strictEqual(loginData.success, true);
        assert.ok(loginData.token, '登入應回傳 JWT Token');
        const token = loginData.token;
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        console.log('✅ [PASS] 登入與 JWT Token 驗證成功');

        // 未帶 Token 存取簽到 API 應拒絕 401
        const unauthRes = await fetch(`${baseUrl}/api/checkin/records`);
        assert.strictEqual(unauthRes.status, 401, '未授權存取應回傳 401');
        console.log('✅ [PASS] 未授權拒絕機制正常 (401 Unauthorized)');

        // a. Query records with ?deptId=JMB03&dispatchDate=2026-10-21
        console.log('\n--- [Test a] 查詢簽到清單 (GET /records?deptId=JMB03&dispatchDate=2026-10-21) ---');
        const rA = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=2026-10-21`, {
            headers: authHeaders
        });
        assert.strictEqual(rA.status, 200);
        const dA = await rA.json();
        assert.strictEqual(dA.success, true);
        assert.strictEqual(dA.deptId, 'JMB03');
        assert.strictEqual(dA.dispatchDate, '2026-10-21');
        assert.ok(Array.isArray(dA.data) && dA.data.length >= 5, '清單應載入至少 5 筆預設資料');
        console.log(`✅ [PASS] 成功載入簽到清單，共 ${dA.data.length} 筆資料`);

        // b. URL parameter normalization (tests that YYYYMMDD and && format are parsed correctly)
        console.log('\n--- [Test b] URL 參數正規化驗證 (後端 YYYYMMDD 與 前端 && 容錯) ---');
        // b.1 後端 YYYYMMDD -> YYYY-MM-DD 自動正規化
        const rB1 = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=20261021`, {
            headers: authHeaders
        });
        const dB1 = await rB1.json();
        assert.strictEqual(dB1.success, true);
        assert.strictEqual(dB1.dispatchDate, '2026-10-21', '後端應將 20261021 正規化為 2026-10-21');
        console.log('✅ [PASS] 後端 YYYYMMDD 正規化為 YYYY-MM-DD 成功');

        // b.2 前端 checkin.html 內的 parseCheckinUrlParams 邏輯驗證
        const htmlContent = fs.readFileSync(path.join(__dirname, '../checkin.html'), 'utf8');
        const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>[\s\S]*?<\/body>/);
        assert.ok(scriptMatch, '應能從 checkin.html 讀取主腳本');

        function runFrontendUrlParser(searchStr) {
            const sandbox = {
                window: {},
                document: {},
                URLSearchParams: require('url').URLSearchParams,
                $: () => ({ ready: () => {}, text: () => {}, html: () => {}, focus: () => {}, on: () => {}, bootstrapTable: () => {} }),
                Date: Date,
                parseInt: parseInt,
                String: String
            };
            sandbox.window = sandbox;
            sandbox.window.location = { search: searchStr };
            sandbox.window.Auth = { getUser: () => ({ deptId: 'JMB03' }), requireAuth: () => true };

            vm.createContext(sandbox);
            vm.runInContext(scriptMatch[1], sandbox);
            return sandbox.window.parseCheckinUrlParams();
        }

        const parsed1 = runFrontendUrlParser('?deptId=JMB03&&DispatchDate=20261020');
        assert.strictEqual(parsed1.deptId, 'JMB03');
        assert.strictEqual(parsed1.dispatchDate, '2026-10-20');

        const parsed2 = runFrontendUrlParser('?deptId=JMB03&&&&dispatchDate=2026-10-25');
        assert.strictEqual(parsed2.deptId, 'JMB03');
        assert.strictEqual(parsed2.dispatchDate, '2026-10-25');
        console.log('✅ [PASS] 前端 URL 連續 && 及 YYYYMMDD / YYYY-MM-DD 參數解析正確');

        // c. Scan check-in on-time within window -> status becomes 1
        console.log('\n--- [Test c] 掃碼準時簽到 (POST /scan, 14:05 -> status = 1) ---');
        // JM10007 (調度時間 14:00~17:00)，14:05 在開始時間+10分鐘內
        const rC = await fetch(`${baseUrl}/api/checkin/scan`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10007',
                currentTime: '14:05'
            })
        });
        const dC = await rC.json();
        assert.strictEqual(rC.status, 200);
        assert.strictEqual(dC.success, true);
        assert.strictEqual(dC.status, 1, '準時簽到狀態應為 1');
        assert.strictEqual(dC.type, 'SUCCESS_ON_TIME');
        assert.strictEqual(dC.empId, 'JM10007');

        // 重新查詢確認資料庫/記憶體狀態已更新
        const rVerifyC = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=2026-10-21`, {
            headers: authHeaders
        });
        const dVerifyC = await rVerifyC.json();
        const empC = dVerifyC.data.find(r => r.id === 'JM10007');
        assert.strictEqual(String(empC.status), '1');
        assert.strictEqual(empC.time, '14:05');
        assert.strictEqual(empC.checkInMethod, 1);
        console.log('✅ [PASS] 掃碼準時簽到成功 (status = 1, checkInMethod = 1)');

        // d. Scan check-in outside window (early or late) -> rejected with 400
        console.log('\n--- [Test d] 調度時間外掃碼阻擋 (早於開始-10分鐘 或 晚於結束時間) ---');
        // d.1 提早超過10分鐘：JM10008 (14:00~17:00)，在 13:40 簽到 (窗口 13:50 開始)
        const rD1 = await fetch(`${baseUrl}/api/checkin/scan`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10008',
                currentTime: '13:40'
            })
        });
        const dD1 = await rD1.json();
        assert.strictEqual(rD1.status, 400, '提早超過10分鐘應回傳 400');
        assert.strictEqual(dD1.type, 'TIME_ERROR');
        assert.ok(dD1.message.includes('調度時間內'), '提示應告知應在調度時間內簽到');
        console.log('✅ [PASS] 提早超過10分鐘簽到成功阻擋 (HTTP 400 TIME_ERROR)');

        // d.2 超過結束時間：JM10008 (14:00~17:00)，在 17:15 簽到
        const rD2 = await fetch(`${baseUrl}/api/checkin/scan`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10008',
                currentTime: '17:15'
            })
        });
        const dD2 = await rD2.json();
        assert.strictEqual(rD2.status, 400, '超過結束時間簽到應回傳 400');
        assert.strictEqual(dD2.type, 'TIME_ERROR');
        console.log('✅ [PASS] 超過結束時間簽到成功阻擋 (HTTP 400 TIME_ERROR)');

        // e. Duplicate check-in -> rejected with 400
        console.log('\n--- [Test e] 重複掃碼簽到阻擋 (已簽到者再次刷卡) ---');
        const rE = await fetch(`${baseUrl}/api/checkin/scan`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10007',
                currentTime: '14:08'
            })
        });
        const dE = await rE.json();
        assert.strictEqual(rE.status, 400, '重複刷卡應回傳 400');
        assert.strictEqual(dE.type, 'DUPLICATE');
        assert.ok(dE.message.includes('重複掃描') || dE.message.includes('已略過'));
        console.log('✅ [PASS] 重複掃碼成功阻擋 (HTTP 400 DUPLICATE)');

        // f. Manager check-in -> status becomes 1 or 2 with method 2
        console.log('\n--- [Test f] 主管代簽 (POST /manager) ---');
        // 對 JM10008 (detailId: 104, startTime: 14:00) 於 14:20 代簽 (超過開始+10分鐘 -> 逾期簽到 status = 2)
        const rF = await fetch(`${baseUrl}/api/checkin/manager`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                detailId: 104,
                currentTime: '14:20'
            })
        });
        const dF = await rF.json();
        assert.strictEqual(rF.status, 200);
        assert.strictEqual(dF.success, true);
        assert.strictEqual(dF.status, 2, '超過開始+10分鐘代簽應為逾期簽到 (status = 2)');
        assert.strictEqual(dF.statusName, '逾期簽到');

        // 重新查詢確認 checkInMethod = 2
        const rVerifyF = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=2026-10-21`, {
            headers: authHeaders
        });
        const dVerifyF = await rVerifyF.json();
        const empF = dVerifyF.data.find(r => r.detailId === 104);
        assert.strictEqual(String(empF.status), '2');
        assert.strictEqual(empF.checkInMethod, 2, '主管代簽 checkInMethod 應為 2');
        console.log('✅ [PASS] 主管代簽成功 (status = 2, checkInMethod = 2)');

        // g. Mark abnormal -> status becomes 3
        console.log('\n--- [Test g] 標記異常 (POST /abnormal, action = MARK -> status = 3) ---');
        const rG = await fetch(`${baseUrl}/api/checkin/abnormal`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                detailId: 104,
                action: 'MARK',
                reason: '身體不適急診'
            })
        });
        const dG = await rG.json();
        assert.strictEqual(rG.status, 200);
        assert.strictEqual(dG.success, true);
        assert.strictEqual(dG.status, 3, '標記異常狀態應為 3');

        // 查詢確認狀態為 3 且異常原因已帶入
        const rVerifyG = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=2026-10-21`, {
            headers: authHeaders
        });
        const dVerifyG = await rVerifyG.json();
        const empG = dVerifyG.data.find(r => r.detailId === 104);
        assert.strictEqual(String(empG.status), '3');
        assert.strictEqual(empG.reasonText, '身體不適急診');
        console.log('✅ [PASS] 標記異常成功 (status = 3, reasonText 已更新)');

        // h. Save abnormal reasons -> abnormal reason updated
        console.log('\n--- [Test h] 批次儲存異常原因 (POST /abnormal-reasons) ---');
        const rH = await fetch(`${baseUrl}/api/checkin/abnormal-reasons`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                items: [
                    { detailId: 104, reason: '發燒送醫急診治療中' }
                ]
            })
        });
        const dH = await rH.json();
        assert.strictEqual(rH.status, 200);
        assert.strictEqual(dH.success, true);
        assert.strictEqual(dH.count, 1);

        // 查詢確認異常原因已變更為「發燒送醫急診治療中」
        const rVerifyH = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=2026-10-21`, {
            headers: authHeaders
        });
        const dVerifyH = await rVerifyH.json();
        const empH = dVerifyH.data.find(r => r.detailId === 104);
        assert.strictEqual(empH.reasonText, '發燒送醫急診治療中');
        console.log('✅ [PASS] 批次儲存異常原因成功 (reasonText 變更為 發燒送醫急診治療中)');

        // i. Restore abnormal -> status becomes 0
        console.log('\n--- [Test i] 復原異常為待簽到 (POST /abnormal, action = RESTORE -> status = 0) ---');
        const rI = await fetch(`${baseUrl}/api/checkin/abnormal`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                detailId: 104,
                action: 'RESTORE'
            })
        });
        const dI = await rI.json();
        assert.strictEqual(rI.status, 200);
        assert.strictEqual(dI.success, true);
        assert.strictEqual(dI.status, 0, '復原後狀態應為 0 (待簽到)');

        // 查詢確認狀態已回到 0 且 reasonText 清空
        const rVerifyI = await fetch(`${baseUrl}/api/checkin/records?deptId=JMB03&dispatchDate=2026-10-21`, {
            headers: authHeaders
        });
        const dVerifyI = await rVerifyI.json();
        const empI = dVerifyI.data.find(r => r.detailId === 104);
        assert.strictEqual(String(empI.status), '0');
        assert.strictEqual(empI.reasonText, '');
        console.log('✅ [PASS] 異常復原成功 (status = 0, reasonText 清空)');

        // j. Historical past date logic -> pending check-ins render as status 4 (已逾期)
        console.log('\n--- [Test j] 歷史過去日期與超時未簽到渲染 (status 4: 已逾期) ---');
        // 執行 checkin.html 內實際的 statusFormatter 與 isDatePast
        const sandboxJ = {
            window: {},
            document: {},
            URLSearchParams: require('url').URLSearchParams,
            $: () => ({ ready: () => {}, text: () => {}, html: () => {}, focus: () => {}, on: () => {}, bootstrapTable: () => {} }),
            Date: Date,
            parseInt: parseInt,
            String: String
        };
        sandboxJ.window = sandboxJ;
        vm.createContext(sandboxJ);
        vm.runInContext(scriptMatch[1], sandboxJ);

        // j.1 歷史單據 (例如 2020-01-01) 且 status = '0'
        sandboxJ.window.currentCheckinParams = { deptId: 'JMB03', dispatchDate: '2020-01-01' };
        const badgePast = sandboxJ.window.statusFormatter('0', { dispatchTime: '14:00~17:00' });
        assert.ok(badgePast.includes('已逾期'), '歷史單據待簽到應渲染為 已逾期');
        assert.ok(badgePast.includes('bg-danger'), '已逾期徽章應使用 bg-danger');
        console.log('✅ [PASS] 歷史單據待簽到人員動態渲染為「已逾期」(bg-danger)');

        // j.2 今日單據但超過結束時間 (如結束時間 12:00，當前時間 12:30)
        const todayObj = new Date();
        const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
        sandboxJ.window.currentCheckinParams = { deptId: 'JMB03', dispatchDate: todayStr };

        // 測試 isNotCheckedInExpired 函式
        const isExpired = sandboxJ.window.isNotCheckedInExpired('10:00~12:00', '12:30');
        assert.strictEqual(isExpired, true, '超過結束時間 12:00 (12:30) 應判定為過期');

        const isNotExpired = sandboxJ.window.isNotCheckedInExpired('14:00~17:00', '15:30');
        assert.strictEqual(isNotExpired, false, '在調度時間 14:00~17:00 內 (15:30) 不應為過期');
        console.log('✅ [PASS] 當日調度時間已過 (超時) 與 未過 邏輯判定正確');

        // j.3 五大狀態徽章顯示檢驗
        const badge0 = sandboxJ.window.statusFormatter('0', { dispatchTime: '23:00~23:59' });
        assert.ok(badge0.includes('待簽到') && badge0.includes('bg-secondary'));

        const badge1 = sandboxJ.window.statusFormatter('1', {});
        assert.ok(badge1.includes('已簽到') && badge1.includes('bg-success'));

        const badge2 = sandboxJ.window.statusFormatter('2', {});
        assert.ok(badge2.includes('逾期簽到') && badge2.includes('bg-warning'));

        const badge3 = sandboxJ.window.statusFormatter('3', {});
        assert.ok(badge3.includes('異常') && badge3.includes('bg-warning'));

        const badge4 = sandboxJ.window.statusFormatter('4', {});
        assert.ok(badge4.includes('已逾期') && badge4.includes('bg-danger'));
        console.log('✅ [PASS] 五大狀態 (0:待簽到, 1:已簽到, 2:逾期簽到, 3:異常, 4:已逾期) 徽章完整渲染驗證通過');

        console.log('\n================================================================');
        console.log('🎉 所有 E2E 系統整合測試項目 (a ~ j) 全部檢核通過！(ALL PASS)');
        console.log('================================================================\n');
    } finally {
        server.close();
    }
}

runTests().catch(err => {
    console.error('\n❌ 整合測試執行失敗:', err);
    process.exit(1);
});
