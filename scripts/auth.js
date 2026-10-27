/**
 * =========================================================================
 *  CPDS 前端身分驗證守門員模組 (scripts/auth.js)
 * =========================================================================
 */

const Auth = {
    TOKEN_KEY: 'cpds_auth_token',
    USER_KEY: 'cpds_auth_user',

    /**
     * 取得目前存放之 JWT Token
     */
    getToken() {
        return sessionStorage.getItem(this.TOKEN_KEY);
    },

    /**
     * 取得目前登入者資訊
     * 回傳格式：{ empId, name, deptId, deptName, title }
     */
    getUser() {
        const raw = sessionStorage.getItem(this.USER_KEY);
        try {
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * 儲存登入憑證與使用者資訊
     */
    setAuth(token, user) {
        sessionStorage.setItem(this.TOKEN_KEY, token);
        sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    /**
     * 清除驗證資訊
     */
    clearAuth() {
        sessionStorage.removeItem(this.TOKEN_KEY);
        sessionStorage.removeItem(this.USER_KEY);
    },

    /**
     * 檢查是否已登入；若未登入則自動轉導至登入頁
     * @param {string} redirectUrl 登入頁路徑 (預設 login.html)
     * @returns {boolean} 是否已通過驗證
     */
    requireAuth(redirectUrl = 'login.html') {
        const token = this.getToken();
        const user = this.getUser();

        if (!token || !user) {
            this.clearAuth();
            window.location.replace(redirectUrl);
            return false;
        }
        return true;
    },

    /**
     * 執行登出並跳轉至登入頁
     */
    logout() {
        this.clearAuth();
        window.location.replace('login.html');
    },

    /**
     * 在頁面頂端導覽列渲染使用者資訊與登出按鈕
     * @param {string} containerSelector 容器選擇器 (例如 #navbarUserArea)
     */
    renderNavbarUser(containerSelector = '#navbarUserArea') {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const user = this.getUser();
        if (!user) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <span class="badge bg-light text-dark border px-3 py-2 shadow-sm d-flex align-items-center">
                    <i class="bi bi-person-circle text-primary me-2 fs-6"></i>
                    <strong class="me-1">[${user.empId}] ${user.name}</strong>
                    <span class="text-muted ms-1 small">(${user.deptName || user.deptId})</span>
                </span>
                <button type="button" class="btn btn-sm btn-outline-danger" id="btnLogout" title="登出系統">
                    <i class="bi bi-box-arrow-right"></i> 登出
                </button>
            </div>
        `;

        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => {
                if (confirm('確定要登出系統嗎？')) {
                    this.logout();
                }
            });
        }
    },

    /**
     * 封裝帶有 Authorization Header 的 fetch
     */
    async authFetch(url, options = {}) {
        const token = this.getToken();
        const headers = Object.assign({}, options.headers || {}, {
            'Authorization': token ? `Bearer ${token}` : ''
        });
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            this.logout();
        }
        return res;
    }
};

// 若全域環境需要直接使用
window.Auth = Auth;
