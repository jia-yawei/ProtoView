/**
 * @file auth.js
 * @brief ProtoView 多用户账号认证与隔离控制模块 (Cloudflare KV 驱动)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Auth = ProtoView.Auth || {};

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};

    const AUTH_STORAGE_KEY_USER = 'protoview_auth_user';
    const AUTH_STORAGE_KEY_TOKEN = 'protoview_auth_token';

    // DOM 元素引用
    let authModal, authModalTitle, tabAuthLogin, tabAuthRegister,
        formAuthLogin, formAuthRegister,
        loginUsername, loginPassword, btnLoginSubmit,
        regUsername, regDisplayName, regPassword, regPasswordConfirm, btnRegisterSubmit,
        sidebarUserCard, sidebarUserAvatar, sidebarUserName, sidebarUserStatus, btnSidebarAuthAction,
        wsCloudUserBadge, btnWsCloudUserSwitch;

    function initDOMElements() {
        authModal = document.getElementById('auth-modal');
        authModalTitle = document.getElementById('auth-modal-title');
        tabAuthLogin = document.getElementById('tab-auth-login');
        tabAuthRegister = document.getElementById('tab-auth-register');
        formAuthLogin = document.getElementById('form-auth-login');
        formAuthRegister = document.getElementById('form-auth-register');

        loginUsername = document.getElementById('login-username');
        loginPassword = document.getElementById('login-password');
        btnLoginSubmit = document.getElementById('btn-login-submit');

        regUsername = document.getElementById('reg-username');
        regDisplayName = document.getElementById('reg-display-name');
        regPassword = document.getElementById('reg-password');
        regPasswordConfirm = document.getElementById('reg-password-confirm');
        btnRegisterSubmit = document.getElementById('btn-register-submit');

        sidebarUserCard = document.getElementById('sidebar-user-card');
        sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
        sidebarUserName = document.getElementById('sidebar-user-name');
        sidebarUserStatus = document.getElementById('sidebar-user-status');
        btnSidebarAuthAction = document.getElementById('btn-sidebar-auth-action');

        wsCloudUserBadge = document.getElementById('ws-cloud-user-badge');
        btnWsCloudUserSwitch = document.getElementById('btn-ws-cloud-user-switch');
    }

    // 获取当前登录用户
    function getCurrentUser() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY_USER);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function getToken() {
        return localStorage.getItem(AUTH_STORAGE_KEY_TOKEN) || '';
    }

    function isLoggedIn() {
        const u = getCurrentUser();
        const t = getToken();
        return !!(u && u.username && t);
    }

    // 保存登录状态
    function setAuthSession(user, token) {
        if (user && token) {
            localStorage.setItem(AUTH_STORAGE_KEY_USER, JSON.stringify(user));
            localStorage.setItem(AUTH_STORAGE_KEY_TOKEN, token);
            // 自动将当前工作空间名称锁定为当前账号的用户名
            localStorage.setItem('protoview_cloud_ws', user.username);
        } else {
            localStorage.removeItem(AUTH_STORAGE_KEY_USER);
            localStorage.removeItem(AUTH_STORAGE_KEY_TOKEN);
        }
        updateAuthUI();
    }

    // 更新各处界面上的登录用户标识
    function updateAuthUI() {
        initDOMElements();
        const user = getCurrentUser();

        // 1. 侧边栏底部用户卡片更新
        if (sidebarUserCard) {
            if (user) {
                sidebarUserCard.classList.add('logged-in');
                if (sidebarUserName) {
                    sidebarUserName.textContent = user.displayName || user.username;
                    sidebarUserName.title = `登录账号: ${user.username} (${user.displayName || '用户'})`;
                }
                if (sidebarUserStatus) {
                    sidebarUserStatus.innerHTML = `<i class="fa-solid fa-circle" style="color:#10b981; font-size:8px;"></i> <span>账号: ${escapeHTML(user.username)}</span>`;
                }
                if (btnSidebarAuthAction) {
                    btnSidebarAuthAction.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i> 退出`;
                    btnSidebarAuthAction.title = '退出当前登录账号';
                }
            } else {
                sidebarUserCard.classList.remove('logged-in');
                if (sidebarUserName) {
                    sidebarUserName.textContent = '访客未登录';
                    sidebarUserName.title = '点击登录或注册账号以使用云端独立空间';
                }
                if (sidebarUserStatus) {
                    sidebarUserStatus.innerHTML = `<i class="fa-solid fa-circle" style="color:var(--text-secondary); opacity:0.6; font-size:8px;"></i> <span>本地存储模式</span>`;
                }
                if (btnSidebarAuthAction) {
                    btnSidebarAuthAction.innerHTML = `<i class="fa-solid fa-user-plus"></i> 登录/注册`;
                    btnSidebarAuthAction.title = '登录或注册您的专属云端账号';
                }
            }
        }

        // 2. 云端工作台顶部条更新
        if (wsCloudUserBadge) {
            if (user) {
                wsCloudUserBadge.innerHTML = `<i class="fa-solid fa-user-shield" style="color:var(--accent-color);"></i> <b>${escapeHTML(user.displayName || user.username)}</b> <span style="opacity:0.75; font-size:11px;">(${escapeHTML(user.username)})</span>`;
                wsCloudUserBadge.title = `当前云端空间已严格绑定账号 [${user.username}]，其他用户无法查看或修改您的协议`;
            } else {
                wsCloudUserBadge.innerHTML = `<i class="fa-solid fa-user-xmark" style="color:#f59e0b;"></i> <span style="color:#f59e0b;">未登录账号 (公共空间)</span>`;
                wsCloudUserBadge.title = '建议点击右侧按钮登录专属账号，享受完全独立的数据隔离';
            }
        }

        // 3. 广播认证变更事件
        if (ProtoView.Events) {
            ProtoView.Events.emit('auth:changed', user);
        }
    }

    // 切换登录/注册 Tab
    function switchAuthTab(tab) {
        initDOMElements();
        const subtitleEl = document.getElementById('auth-modal-subtitle');
        if (tab === 'register') {
            if (tabAuthLogin) tabAuthLogin.classList.remove('active');
            if (tabAuthRegister) tabAuthRegister.classList.add('active');
            if (formAuthLogin) formAuthLogin.style.display = 'none';
            if (formAuthRegister) formAuthRegister.style.display = 'block';
            if (authModalTitle) authModalTitle.textContent = '注册专属云端账号';
            if (subtitleEl) subtitleEl.textContent = '注册后将自动为您开辟独立的云端协议库空间';
            setTimeout(() => { if (regUsername) regUsername.focus(); }, 100);
        } else {
            if (tabAuthRegister) tabAuthRegister.classList.remove('active');
            if (tabAuthLogin) tabAuthLogin.classList.add('active');
            if (formAuthRegister) formAuthRegister.style.display = 'none';
            if (formAuthLogin) formAuthLogin.style.display = 'block';
            if (authModalTitle) authModalTitle.textContent = '云端账号登录';
            if (subtitleEl) subtitleEl.textContent = '登录后协议将保存在您的独立云端空间，多人使用互不干扰';
            setTimeout(() => { if (loginUsername) loginUsername.focus(); }, 100);
        }
    }

    // 打开登录/注册弹窗
    function openAuthModal(defaultTab = 'login') {
        initDOMElements();
        if (!authModal) return;
        switchAuthTab(defaultTab);
        authModal.classList.add('active');
    }

    // 关闭弹窗
    function closeAuthModal() {
        initDOMElements();
        if (authModal) authModal.classList.remove('active');
    }

    // 登录请求
    async function handleLogin(username, password) {
        try {
            const res = await fetch('/api/auth?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=utf-8' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success) {
                setAuthSession(data.user, data.token);
                closeAuthModal();
                showToast(`欢迎回来，${data.user.displayName || data.user.username}！`, 'success');

                // 自动切换至云端工作模式并刷新该账号协议
                if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.setWorkspaceMode === 'function') {
                    ProtoView.WorkspaceSync.setWorkspaceMode('cloud', true);
                }
                return true;
            } else {
                const msg = (data && data.error) || '登录失败，请检查账号密码';
                alert(msg);
                return false;
            }
        } catch (e) {
            alert('连接认证服务异常: ' + e.message);
            return false;
        }
    }

    // 注册请求
    async function handleRegister(username, password, displayName) {
        try {
            const res = await fetch('/api/auth?action=register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=utf-8' },
                body: JSON.stringify({ username, password, displayName })
            });
            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success) {
                setAuthSession(data.user, data.token);
                closeAuthModal();
                showToast(`账号 [${data.user.username}] 注册成功并已自动登录！`, 'success');

                // 自动激活云端工作模式
                if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.setWorkspaceMode === 'function') {
                    ProtoView.WorkspaceSync.setWorkspaceMode('cloud', true);
                }
                return true;
            } else {
                const msg = (data && data.error) || '注册失败，请更换用户名重试';
                alert(msg);
                return false;
            }
        } catch (e) {
            alert('连接认证服务异常: ' + e.message);
            return false;
        }
    }

    // 退出登录
    async function handleLogout() {
        const u = getCurrentUser();
        const uName = u ? (u.displayName || u.username) : '用户';
        if (!confirm(`确定要退出账号「${uName}」吗？\n\n退出后，您可随时再次登录以同步您的私有云端协议。`)) {
            return;
        }

        const token = getToken();
        if (token) {
            try {
                fetch('/api/auth?action=logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json;charset=utf-8',
                        'x-auth-token': token
                    },
                    body: JSON.stringify({ token })
                }).catch(() => {});
            } catch (e) {}
        }

        setAuthSession(null, null);
        showToast('已安全退出登录', 'info');

        // 切换回本地模式并清空本地云端缓存
        if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.setWorkspaceMode === 'function') {
            ProtoView.WorkspaceSync.setWorkspaceMode('local', false);
        }
        if (window.loadProtocols) {
            window.loadProtocols();
        }
    }

    // 初始化时验证 Session 是否依然有效
    async function verifyExistingSession() {
        const token = getToken();
        if (!token) {
            updateAuthUI();
            return;
        }

        try {
            const res = await fetch('/api/auth?action=me', {
                method: 'GET',
                headers: { 'x-auth-token': token }
            });
            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success && data.user) {
                // Session 正常有效，刷新本地展示信息
                localStorage.setItem(AUTH_STORAGE_KEY_USER, JSON.stringify(data.user));
                localStorage.setItem('protoview_cloud_ws', data.user.username);
                updateAuthUI();
            } else if (res.status === 401) {
                // Token 已过期或已被销毁
                console.warn('ProtoView: 登录已失效，自动切换为访客');
                setAuthSession(null, null);
            }
        } catch (e) {
            // 本地离线或开发模式，保持原有 session 容错
            updateAuthUI();
        }
    }

    // 绑定事件
    function bindAuthEvents() {
        initDOMElements();

        // Tab 切换
        if (tabAuthLogin) {
            tabAuthLogin.addEventListener('click', () => switchAuthTab('login'));
        }
        if (tabAuthRegister) {
            tabAuthRegister.addEventListener('click', () => switchAuthTab('register'));
        }

        // 登录表单提交
        if (formAuthLogin) {
            formAuthLogin.addEventListener('submit', async (e) => {
                e.preventDefault();
                const u = (loginUsername ? loginUsername.value : '').trim();
                const p = (loginPassword ? loginPassword.value : '').trim();
                if (!u || !p) {
                    alert('请完整填写用户名和密码！');
                    return;
                }
                if (btnLoginSubmit) {
                    btnLoginSubmit.disabled = true;
                    btnLoginSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在登录...`;
                }
                const ok = await handleLogin(u, p);
                if (btnLoginSubmit) {
                    btnLoginSubmit.disabled = false;
                    btnLoginSubmit.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> 立即登录`;
                }
                if (ok && loginPassword) {
                    loginPassword.value = '';
                }
            });
        }

        // 注册表单提交
        if (formAuthRegister) {
            formAuthRegister.addEventListener('submit', async (e) => {
                e.preventDefault();
                const u = (regUsername ? regUsername.value : '').trim();
                const nick = (regDisplayName ? regDisplayName.value : '').trim();
                const p = (regPassword ? regPassword.value : '').trim();
                const pConfirm = (regPasswordConfirm ? regPasswordConfirm.value : '').trim();

                if (!u || !p) {
                    alert('请填写用户名与密码！');
                    return;
                }
                if (p.length < 6) {
                    alert('密码长度至少需要 6 个字符！');
                    return;
                }
                if (p !== pConfirm) {
                    alert('两次输入的密码不一致，请核对！');
                    return;
                }

                if (btnRegisterSubmit) {
                    btnRegisterSubmit.disabled = true;
                    btnRegisterSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在注册...`;
                }
                const ok = await handleRegister(u, p, nick);
                if (btnRegisterSubmit) {
                    btnRegisterSubmit.disabled = false;
                    btnRegisterSubmit.innerHTML = `<i class="fa-solid fa-user-check"></i> 立即注册并登录`;
                }
                if (ok) {
                    if (regPassword) regPassword.value = '';
                    if (regPasswordConfirm) regPasswordConfirm.value = '';
                }
            });
        }

        // 快捷切换至注册或登录的跳转文字链接
        document.querySelectorAll('.btn-switch-to-register').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                switchAuthTab('register');
            });
        });
        document.querySelectorAll('.btn-switch-to-login').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                switchAuthTab('login');
            });
        });

        // 侧边栏用户卡片点击动作
        if (btnSidebarAuthAction) {
            btnSidebarAuthAction.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isLoggedIn()) {
                    handleLogout();
                } else {
                    openAuthModal('login');
                }
            });
        }
        if (sidebarUserCard) {
            sidebarUserCard.addEventListener('click', () => {
                if (isLoggedIn()) {
                    if (confirm(`当前登录账号: ${getCurrentUser().displayName} (${getCurrentUser().username})\n\n需要切换账号吗？`)) {
                        openAuthModal('login');
                    }
                } else {
                    openAuthModal('login');
                }
            });
        }

        // 云端栏上的用户切换按钮
        if (btnWsCloudUserSwitch) {
            btnWsCloudUserSwitch.addEventListener('click', () => {
                openAuthModal(isLoggedIn() ? 'login' : 'register');
            });
        }

        // 初始更新界面
        updateAuthUI();
        verifyExistingSession();
    }

    // 挂载对外 API
    ProtoView.Auth = {
        getCurrentUser,
        getToken,
        isLoggedIn,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
        openAuthModal,
        closeAuthModal,
        switchAuthTab,
        updateAuthUI
    };
    global.ProtoView = ProtoView;

    // 全局函数便捷调用
    global.openAuthModal = openAuthModal;
    global.closeAuthModal = closeAuthModal;
    global.switchAuthTab = switchAuthTab;
    global.logoutUser = handleLogout;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindAuthEvents);
    } else {
        bindAuthEvents();
    }

})(typeof window !== 'undefined' ? window : this);
