/**
 * =========================================================================
 *  跨廠人員調度與簽到系統 (CPDS) - 前端原生 API Client (scripts/api.js)
 * =========================================================================
 *  特色：
 *  - 零外部依賴、同時相容瀏覽器全域環境 (window.API) 與 Node.js (CommonJS)
 *  - 自動注入 JWT Token (優先讀取 window.Auth.getToken()，備援 sessionStorage)
 *  - 自動序列化 JSON Request Body 並標註 Content-Type: application/json
 *  - 自動處理 HTTP 401：清除登入狀態並導回登入頁
 *  - 統一 Response 與錯誤處理 (非 2xx 或 success: false 拋出統一 Error 物件)
 *  - 快捷請求方法：API.get(url, params), API.post(url, body), API.put(url, body), API.delete(url)
 */

(function (root) {
    'use strict';

    /**
     * 安全取得 window 物件 (支援瀏覽器環境與 Node.js 模擬環境)
     */
    function getWindowObj() {
        if (typeof window !== 'undefined') return window;
        if (typeof globalThis !== 'undefined' && globalThis.window) return globalThis.window;
        if (typeof root !== 'undefined' && root.window) return root.window;
        return null;
    }

    /**
     * 安全取得 sessionStorage 物件
     */
    function getSessionStorageObj() {
        if (typeof sessionStorage !== 'undefined') return sessionStorage;
        const win = getWindowObj();
        if (win && win.sessionStorage) return win.sessionStorage;
        if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) return globalThis.sessionStorage;
        if (typeof root !== 'undefined' && root.sessionStorage) return root.sessionStorage;
        return null;
    }

    /**
     * 取得目前登入之 JWT Token
     * 1. 優先嘗試由 window.Auth.getToken() 取得
     * 2. 備援由 sessionStorage 取得 'cpds_auth_token'
     */
    function getToken() {
        try {
            const win = getWindowObj();
            if (win && win.Auth && typeof win.Auth.getToken === 'function') {
                const token = win.Auth.getToken();
                if (token) return token;
            }
        } catch (e) {
            // 忽略例外
        }

        try {
            const storage = getSessionStorageObj();
            if (storage && typeof storage.getItem === 'function') {
                const token = storage.getItem('cpds_auth_token');
                if (token) return token;
            }
        } catch (e) {
            // 忽略例外
        }

        return null;
    }

    /**
     * 處理 401 未授權狀況
     * 清除驗證資訊，並於瀏覽器環境提示使用者且轉導回 login.html
     */
    function handleUnauthorized() {
        const win = getWindowObj();
        const storage = getSessionStorageObj();

        // 1. 清除登入憑證
        try {
            if (win && win.Auth && typeof win.Auth.clearAuth === 'function') {
                win.Auth.clearAuth();
            } else if (storage && typeof storage.removeItem === 'function') {
                storage.removeItem('cpds_auth_token');
                storage.removeItem('cpds_auth_user');
            }
        } catch (e) {
            // 忽略例外
        }

        // 2. 瀏覽器環境轉導
        try {
            if (win && win.location) {
                if (typeof win.alert === 'function') {
                    win.alert('登入已逾時或憑證失效，請重新登入！');
                }
                if (typeof win.location.replace === 'function') {
                    win.location.replace('login.html');
                } else {
                    win.location.href = 'login.html';
                }
            }
        } catch (e) {
            // 忽略例外
        }
    }

    /**
     * 將 query params 物件格式化為 URL 查詢字串
     * 支援 string, number, boolean, 及陣列 (如 sourceDeptId: ['A', 'B'] -> sourceDeptId=A,B)
     */
    function buildUrlWithParams(url, params) {
        if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
            return url;
        }

        const searchParams = new URLSearchParams();

        for (const [key, val] of Object.entries(params)) {
            if (val === undefined || val === null || val === '') {
                continue;
            }

            if (Array.isArray(val)) {
                if (val.length > 0) {
                    searchParams.append(key, val.join(','));
                }
            } else {
                searchParams.append(key, String(val));
            }
        }

        const queryString = searchParams.toString();
        if (!queryString) {
            return url;
        }

        if (url.includes('?')) {
            return (url.endsWith('?') || url.endsWith('&'))
                ? `${url}${queryString}`
                : `${url}&${queryString}`;
        }
        return `${url}?${queryString}`;
    }

    /**
     * 主要 request 方法
     * @param {string} url 請求網址
     * @param {object} options fetch 選項 (method, headers, body, etc.)
     * @returns {Promise<any>} 解析後之 JSON 物件
     */
    async function request(url, options = {}) {
        const fetchImpl = options.fetch ||
                          (typeof root !== 'undefined' && root.fetch) ||
                          (typeof fetch !== 'undefined' ? fetch : null) ||
                          (typeof globalThis !== 'undefined' ? globalThis.fetch : null);

        if (typeof fetchImpl !== 'function') {
            throw new Error('[API] 目前環境無可用之 fetch 實作');
        }

        const headers = Object.assign({}, options.headers || {});

        // 1. 自動注入 Token (若呼叫方尚未指定 Authorization Header)
        const hasAuthHeader = Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
        if (!hasAuthHeader) {
            const token = getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        // 2. 處理 Request Body 與 Content-Type
        let reqBody = options.body;
        const hasContentType = Object.keys(headers).some(k => k.toLowerCase() === 'content-type');

        if (reqBody !== undefined && reqBody !== null) {
            const isObject = typeof reqBody === 'object';
            const isSpecialType = (typeof FormData !== 'undefined' && reqBody instanceof FormData) ||
                                  (typeof Blob !== 'undefined' && reqBody instanceof Blob) ||
                                  (typeof URLSearchParams !== 'undefined' && reqBody instanceof URLSearchParams) ||
                                  (typeof ArrayBuffer !== 'undefined' && reqBody instanceof ArrayBuffer);

            if (isObject && !isSpecialType) {
                if (!hasContentType) {
                    headers['Content-Type'] = 'application/json';
                }
                reqBody = JSON.stringify(reqBody);
            }
        }

        // 3. 設定 Accept Header 預設為 application/json
        const hasAccept = Object.keys(headers).some(k => k.toLowerCase() === 'accept');
        if (!hasAccept) {
            headers['Accept'] = 'application/json, text/plain, */*';
        }

        const reqOptions = {
            ...options,
            headers,
            body: reqBody
        };
        delete reqOptions.fetch;

        // 4. 發送請求
        const response = await fetchImpl(url, reqOptions);

        // 5. 攔截 401 狀態
        if (response.status === 401) {
            handleUnauthorized();
        }

        // 6. 解析回應資料 (相容 JSON 或純文字)
        let data = null;
        const rawText = await response.text();
        if (rawText && rawText.trim().length > 0) {
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                data = rawText;
            }
        }

        // 7. 統一錯誤處理：非 2xx 或 data.success === false
        if (!response.ok || (data && typeof data === 'object' && data.success === false)) {
            const errorMsg = (data && typeof data === 'object' && (data.message || data.error)) ||
                             (typeof data === 'string' && data) ||
                             response.statusText ||
                             `HTTP ${response.status}`;
            const err = new Error(errorMsg);
            err.status = response.status;
            err.data = data;
            err.response = response;
            throw err;
        }

        return data;
    }

    /**
     * 便捷方法：GET
     */
    function get(url, params = {}, options = {}) {
        const fullUrl = buildUrlWithParams(url, params);
        return request(fullUrl, { ...options, method: 'GET' });
    }

    /**
     * 便捷方法：POST
     */
    function post(url, body, options = {}) {
        return request(url, { ...options, method: 'POST', body });
    }

    /**
     * 便捷方法：PUT
     */
    function put(url, body, options = {}) {
        return request(url, { ...options, method: 'PUT', body });
    }

    /**
     * 便捷方法：DELETE
     */
    function del(url, options = {}) {
        return request(url, { ...options, method: 'DELETE' });
    }

    const API = {
        request,
        get,
        post,
        put,
        delete: del,
        del,
        getToken,
        handleUnauthorized,
        buildUrlWithParams
    };

    // 瀏覽器環境暴露至 window.API
    if (typeof window !== 'undefined') {
        window.API = API;
    }

    // Node.js CommonJS 環境匯出
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
