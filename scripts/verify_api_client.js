/**
 * =========================================================================
 *  驗證腳本：測試前端原生 API Client (scripts/api.js)
 * =========================================================================
 */

const assert = require('assert');
const path = require('path');

// 載入被測試模組
const API = require('./api');

// 測試狀態追蹤
let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
    totalTests++;
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(() => {
                passedTests++;
                console.log(`  [PASS] Test ${totalTests}: ${testName}`);
            }).catch(err => {
                console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
                console.error(`         ${err.message}`);
                throw err;
            });
        } else {
            passedTests++;
            console.log(`  [PASS] Test ${totalTests}: ${testName}`);
        }
    } catch (err) {
        console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
        console.error(`         ${err.message}`);
        throw err;
    }
}

// 建立 Mock Fetch 回應輔助函式
function createMockResponse({ status = 200, statusText = 'OK', body = {}, text = null, headers = {} }) {
    const rawText = text !== null ? text : JSON.stringify(body);
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        headers: {
            get: (key) => headers[key.toLowerCase()] || null
        },
        async text() {
            return rawText;
        },
        async json() {
            return JSON.parse(rawText);
        }
    };
}

async function runAllTests() {
    console.log('================================================================');
    console.log('  開始執行 scripts/api.js 模組驗證測試');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // 1. 介面完整性檢查
    // -------------------------------------------------------------
    runTest('API 物件包含所有必要函式介面', () => {
        assert.strictEqual(typeof API.request, 'function');
        assert.strictEqual(typeof API.get, 'function');
        assert.strictEqual(typeof API.post, 'function');
        assert.strictEqual(typeof API.put, 'function');
        assert.strictEqual(typeof API.delete, 'function');
        assert.strictEqual(typeof API.buildUrlWithParams, 'function');
    });

    // -------------------------------------------------------------
    // 2. Query Parameter 序列化與陣列支援測試
    // -------------------------------------------------------------
    runTest('buildUrlWithParams 正確處理字串、數值、空值與陣列格式', () => {
        const url1 = API.buildUrlWithParams('/api/plans', {
            date: '2026-10-20',
            sourceDeptId: ['OU_A', 'OU_B'],
            emptyVal: '',
            nullVal: null,
            undefVal: undefined,
            page: 1
        });
        assert.strictEqual(url1, '/api/plans?date=2026-10-20&sourceDeptId=OU_A%2COU_B&page=1');

        // 既有 QueryString 附加
        const url2 = API.buildUrlWithParams('/api/plans?existing=true', { keyword: 'TEST' });
        assert.strictEqual(url2, '/api/plans?existing=true&keyword=TEST');

        const url3 = API.buildUrlWithParams('/api/plans?', { keyword: 'TEST' });
        assert.strictEqual(url3, '/api/plans?keyword=TEST');
    });

    // -------------------------------------------------------------
    // 3. GET 請求測試
    // -------------------------------------------------------------
    await runTest('API.get 能正確組裝網址並發送 GET 請求', async () => {
        let capturedUrl = null;
        let capturedOptions = null;

        const mockFetch = async (url, opts) => {
            capturedUrl = url;
            capturedOptions = opts;
            return createMockResponse({
                status: 200,
                body: { success: true, data: [{ id: 101, name: 'Plan A' }] }
            });
        };

        const res = await API.get('/api/dispatch-plans', { sourceDeptId: ['OU1', 'OU2'] }, { fetch: mockFetch });

        assert.strictEqual(capturedUrl, '/api/dispatch-plans?sourceDeptId=OU1%2COU2');
        assert.strictEqual(capturedOptions.method, 'GET');
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data.length, 1);
        assert.strictEqual(res.data[0].id, 101);
    });

    // -------------------------------------------------------------
    // 4. POST 請求測試：自動 JSON 序列化與 Content-Type
    // -------------------------------------------------------------
    await runTest('API.post 自動序列化 Body 為 JSON 且設置 Content-Type: application/json', async () => {
        let capturedUrl = null;
        let capturedOptions = null;

        const mockFetch = async (url, opts) => {
            capturedUrl = url;
            capturedOptions = opts;
            return createMockResponse({
                status: 201,
                body: { success: true, data: { planNo: 'DP-20261020-001' } }
            });
        };

        const payload = {
            dispatchDate: '2026-10-21',
            sourceDeptId: 'OU_A51_IT',
            items: []
        };

        const res = await API.post('/api/dispatch-plans', payload, { fetch: mockFetch });

        assert.strictEqual(capturedUrl, '/api/dispatch-plans');
        assert.strictEqual(capturedOptions.method, 'POST');
        assert.strictEqual(capturedOptions.headers['Content-Type'], 'application/json');
        assert.strictEqual(capturedOptions.body, JSON.stringify(payload));
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.data.planNo, 'DP-20261020-001');
    });

    // -------------------------------------------------------------
    // 5. PUT 與 DELETE 請求測試
    // -------------------------------------------------------------
    await runTest('API.put 與 API.delete 正確設定 HTTP Method', async () => {
        let putCaptured = null;
        let delCaptured = null;

        const putFetch = async (url, opts) => {
            putCaptured = { url, opts };
            return createMockResponse({ status: 200, body: { success: true } });
        };
        const delFetch = async (url, opts) => {
            delCaptured = { url, opts };
            return createMockResponse({ status: 200, body: { success: true } });
        };

        await API.put('/api/dispatch-plans/DP-001', { note: 'updated' }, { fetch: putFetch });
        assert.strictEqual(putCaptured.url, '/api/dispatch-plans/DP-001');
        assert.strictEqual(putCaptured.opts.method, 'PUT');
        assert.strictEqual(putCaptured.opts.body, JSON.stringify({ note: 'updated' }));

        await API.delete('/api/dispatch-plans/DP-001', { fetch: delFetch });
        assert.strictEqual(delCaptured.url, '/api/dispatch-plans/DP-001');
        assert.strictEqual(delCaptured.opts.method, 'DELETE');
    });

    // -------------------------------------------------------------
    // 6. Token 自動注入測試 (window.Auth 優先，sessionStorage 備援)
    // -------------------------------------------------------------
    await runTest('自動注入 Authorization: Bearer <token> (支援 window.Auth 與 sessionStorage)', async () => {
        let capturedOpts = null;
        const mockFetch = async (url, opts) => {
            capturedOpts = opts;
            return createMockResponse({ status: 200, body: { success: true } });
        };

        // 模擬 window.Auth.getToken
        global.window = {
            Auth: {
                getToken: () => 'AUTH_TOKEN_FROM_AUTH_OBJ'
            }
        };

        await API.get('/api/test', {}, { fetch: mockFetch });
        assert.strictEqual(capturedOpts.headers['Authorization'], 'Bearer AUTH_TOKEN_FROM_AUTH_OBJ');

        // 模擬 window.Auth 回傳空，改由 sessionStorage 備援
        delete global.window.Auth;
        global.sessionStorage = {
            getItem: (k) => (k === 'cpds_auth_token' ? 'TOKEN_FROM_SESSION_STORAGE' : null),
            removeItem: () => {}
        };

        await API.get('/api/test', {}, { fetch: mockFetch });
        assert.strictEqual(capturedOpts.headers['Authorization'], 'Bearer TOKEN_FROM_SESSION_STORAGE');

        // 呼叫方若已手動指定 Authorization，不應被覆寫
        await API.get('/api/test', {}, {
            headers: { 'Authorization': 'Bearer CUSTOM_OVERRIDE' },
            fetch: mockFetch
        });
        assert.strictEqual(capturedOpts.headers['Authorization'], 'Bearer CUSTOM_OVERRIDE');

        // 清理環境
        delete global.sessionStorage;
        delete global.window;
    });

    // -------------------------------------------------------------
    // 7. 401 Interceptor 攔截與跳轉測試
    // -------------------------------------------------------------
    await runTest('401 攔截器自動清空 Auth 憑證，並執行 alert 與跳轉至 login.html', async () => {
        let clearAuthCalled = false;
        let alertMessage = null;
        let redirectedUrl = null;

        // 模擬瀏覽器環境
        global.window = {
            Auth: {
                getToken: () => 'EXPIRED_TOKEN',
                clearAuth: () => { clearAuthCalled = true; }
            },
            alert: (msg) => { alertMessage = msg; },
            location: {
                replace: (url) => { redirectedUrl = url; }
            }
        };

        const mockFetch = async () => {
            return createMockResponse({
                status: 401,
                statusText: 'Unauthorized',
                body: { success: false, message: 'JWT token expired' }
            });
        };

        let thrownError = null;
        try {
            await API.get('/api/protected', {}, { fetch: mockFetch });
        } catch (err) {
            thrownError = err;
        }

        assert(thrownError !== null, '401 應拋出 Error 物件');
        assert.strictEqual(thrownError.status, 401);
        assert.strictEqual(thrownError.message, 'JWT token expired');
        assert.strictEqual(clearAuthCalled, true, 'window.Auth.clearAuth 必須被呼叫');
        assert.strictEqual(alertMessage, '登入已逾時或憑證失效，請重新登入！', '必須彈出逾時提示');
        assert.strictEqual(redirectedUrl, 'login.html', '必須導向 login.html');

        delete global.window;
    });

    // -------------------------------------------------------------
    // 8. 錯誤統一處理測試：HTTP 400 / 500 與業務錯誤 success: false
    // -------------------------------------------------------------
    await runTest('錯誤統一包裝：非 2xx 或 success: false 正確附加 err.status 與 err.data 並拋出', async () => {
        // Case A: HTTP 400 帶 message
        const mockFetch400 = async () => createMockResponse({
            status: 400,
            statusText: 'Bad Request',
            body: { success: false, message: '缺少必填欄位: dispatchDate' }
        });

        try {
            await API.post('/api/plans', {}, { fetch: mockFetch400 });
            assert.fail('400 請求應拋出例外');
        } catch (err) {
            assert.strictEqual(err.status, 400);
            assert.strictEqual(err.message, '缺少必填欄位: dispatchDate');
            assert.strictEqual(err.data.success, false);
        }

        // Case B: HTTP 200 但業務邏輯失敗 (success: false)
        const mockFetch200BizFail = async () => createMockResponse({
            status: 200,
            statusText: 'OK',
            body: { success: false, message: '同一廠區與日期已存在調度單' }
        });

        try {
            await API.post('/api/plans', {}, { fetch: mockFetch200BizFail });
            assert.fail('success: false 應拋出例外');
        } catch (err) {
            assert.strictEqual(err.status, 200);
            assert.strictEqual(err.message, '同一廠區與日期已存在調度單');
            assert.strictEqual(err.data.success, false);
        }

        // Case C: HTTP 500 回傳非 JSON 格式 (如 HTML 錯誤頁)
        const mockFetch500Html = async () => createMockResponse({
            status: 500,
            statusText: 'Internal Server Error',
            text: '<h1>500 Internal Server Error</h1>'
        });

        try {
            await API.get('/api/crash', {}, { fetch: mockFetch500Html });
            assert.fail('500 請求應拋出例外');
        } catch (err) {
            assert.strictEqual(err.status, 500);
            assert.strictEqual(err.message, '<h1>500 Internal Server Error</h1>');
            assert.strictEqual(err.data, '<h1>500 Internal Server Error</h1>');
        }
    });

    // -------------------------------------------------------------
    // 9. 特殊回應情境測試：204 No Content 與非包裹 JSON 回應
    // -------------------------------------------------------------
    await runTest('支援 HTTP 204 No Content 空內容與標準 RESTful 陣列回應', async () => {
        // Case A: 204 No Content
        const mockFetch204 = async () => createMockResponse({
            status: 204,
            statusText: 'No Content',
            text: ''
        });
        const res204 = await API.delete('/api/items/99', { fetch: mockFetch204 });
        assert.strictEqual(res204, null, '204 應回傳 null 且不拋錯');

        // Case B: 標準 Array 回應 (無 success: true 包裹)
        const mockFetchArray = async () => createMockResponse({
            status: 200,
            body: [{ id: 1 }, { id: 2 }]
        });
        const resArray = await API.get('/api/raw-items', {}, { fetch: mockFetchArray });
        assert.strictEqual(Array.isArray(resArray), true);
        assert.strictEqual(resArray.length, 2);
    });

    console.log('\n================================================================');
    console.log(`  驗證完成: 全部 ${passedTests}/${totalTests} 項測試成功通過！`);
    console.log('================================================================\n');
}

runAllTests().catch((e) => {
    console.error('測試失敗:', e);
    process.exit(1);
});
