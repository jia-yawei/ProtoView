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
        sidebarUserCard, sidebarUserAvatar, sidebarUserName, sidebarUserStatus, btnSidebarAuthAction;

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
        regPassword = document.getElementById('reg-password');
        regPasswordConfirm = document.getElementById('reg-password-confirm');
        btnRegisterSubmit = document.getElementById('btn-register-submit');

        sidebarUserCard = document.getElementById('sidebar-user-card');
        sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
        sidebarUserName = document.getElementById('sidebar-user-name');
        sidebarUserStatus = document.getElementById('sidebar-user-status');
        btnSidebarAuthAction = document.getElementById('btn-sidebar-auth-action');
    }

    // 检测是否处于本地离线开发调试环境 (localhost / 127.0.0.1 / file://)
    function isLocalDevEnv() {
        const host = window.location.hostname || '';
        const proto = window.location.protocol || '';
        return (
            proto === 'file:' ||
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host.endsWith('.local') ||
            host.endsWith('.test') ||
            host.endsWith('.internal') ||
            host === ''
        );
    }

    // 辅助：根据角色跳转主视图
    function redirectToMainView(user) {
        const isAdmin = user && (user.isAdmin || user.username.toLowerCase() === 'admin');
        if (isAdmin) {
            if (typeof window.switchToView === 'function') {
                window.switchToView('admin-view');
            }
            if (typeof window.loadAdminStats === 'function') {
                window.loadAdminStats();
            }
        } else {
            if (typeof window.switchToView === 'function') {
                window.switchToView('protocol-view');
            }
        }
    }

    // 本地离线开发环境 Mock 认证 (免推 Cloudflare 调试核心)
    async function doLocalDevLogin(username) {
        const u = (username && String(username).trim()) ? String(username).trim() : 'dev';
        const isAdmin = u.toLowerCase() === 'admin';
        const localUser = {
            username: u,
            displayName: u,
            isAdmin: isAdmin,
            isLocalDev: true
        };
        const localToken = 'local_dev_token_' + Date.now();
        setAuthSession(localUser, localToken);
        closeAuthModal();
        showToast(`已进入本地开发调试模式 (当前账号: ${localUser.username}${isAdmin ? ' [管理员]' : ''})`, 'success');

        redirectToMainView(localUser);

        // 本地离线环境：直接激活本地 IndexedDB 协议与产品库
        if (typeof window.refreshProductDatalist === 'function') await window.refreshProductDatalist();
        if (typeof window.loadProtocols === 'function') await window.loadProtocols();
        if (typeof window.loadProtocolsForSelect === 'function') await window.loadProtocolsForSelect();
        if (typeof window.loadArincProtocolsForSelect === 'function') await window.loadArincProtocolsForSelect();
        if (typeof window.ensureSerialProtocolLoaded === 'function') await window.ensureSerialProtocolLoaded();
        return true;
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
            document.documentElement.classList.add('is-authenticated');
            const isAdmin = user && (user.isAdmin || user.username.toLowerCase() === 'admin');
            if (isAdmin) {
                document.documentElement.classList.add('is-admin');
            } else {
                document.documentElement.classList.remove('is-admin');
            }
        } else {
            localStorage.removeItem(AUTH_STORAGE_KEY_USER);
            localStorage.removeItem(AUTH_STORAGE_KEY_TOKEN);
            document.documentElement.classList.remove('is-authenticated');
            document.documentElement.classList.remove('is-admin');
        }
        updateAuthUI();
    }

    // 更新各处界面上的登录用户标识
    function updateAuthUI() {
        initDOMElements();
        const user = getCurrentUser();
        const loggedIn = isLoggedIn();
        const isAdmin = loggedIn && user && (user.isAdmin || user.username.toLowerCase() === 'admin');

        // 本地环境提示条自适应显隐
        const localBanner = document.getElementById('portal-local-dev-banner');
        if (localBanner) {
            localBanner.style.display = (!loggedIn && isLocalDevEnv()) ? 'block' : 'none';
        }

        // 同步根节点已登录状态类名 (控制全屏登录页 vs 主应用工作台显示)
        if (loggedIn) {
            document.documentElement.classList.add('is-authenticated');
            if (isAdmin) {
                document.documentElement.classList.add('is-admin');
            } else {
                document.documentElement.classList.remove('is-admin');
            }
        } else {
            document.documentElement.classList.remove('is-authenticated');
            document.documentElement.classList.remove('is-admin');
        }

        // 核心角色隔离策略：
        // 管理员账号：无需通信协议管理，仅展示系统管理后台
        // 普通工程师：展示通信协议管理，彻底隐藏管理后台入口
        const navBtnAdmin = document.getElementById('nav-btn-admin');

        if (isAdmin) {
            document.documentElement.classList.add('is-admin');
            if (navBtnAdmin) {
                navBtnAdmin.classList.add('active');
            }
            // 确保移除其他非后台导航项的激活态
            document.querySelectorAll('#sidebar-nav-menu .nav-item').forEach(b => {
                if (b !== navBtnAdmin) b.classList.remove('active');
            });

            // 管理员直接置身管理后台
            if (typeof window.switchToView === 'function') {
                const adminView = document.getElementById('admin-view');
                if (!adminView || !adminView.classList.contains('active')) {
                    window.switchToView('admin-view');
                }
            }
            if (typeof window.loadAdminStats === 'function') {
                window.loadAdminStats();
            }
        } else {
            document.documentElement.classList.remove('is-admin');
            if (navBtnAdmin) {
                navBtnAdmin.classList.remove('active');
            }
            // 普通用户若停留在 admin-view，自动切回协议库
            if (typeof window.switchToView === 'function') {
                const adminView = document.getElementById('admin-view');
                if (adminView && adminView.classList.contains('active')) {
                    window.switchToView('protocol-view');
                }
            }
        }

        // 1. 侧边栏底部用户卡片更新
        if (sidebarUserCard) {
            if (user) {
                sidebarUserCard.classList.add('logged-in');
                const displayName = (user.displayName || user.username || '').trim();
                if (sidebarUserName) {
                    sidebarUserName.textContent = displayName || user.username;
                    sidebarUserName.title = `当前登录账号: ${user.username} ${isAdmin ? '(系统管理员)' : ''}`;
                }
                if (sidebarUserAvatar) {
                    const char = (displayName || user.username || 'U').charAt(0).toUpperCase();
                    sidebarUserAvatar.innerHTML = `
                        <span class="avatar-char">${escapeHTML(char)}</span>
                    `;
                    if (isAdmin) {
                        sidebarUserAvatar.classList.add('avatar-admin');
                    } else {
                        sidebarUserAvatar.classList.remove('avatar-admin');
                    }
                }
                if (sidebarUserStatus) {
                    const isLocal = (user && user.isLocalDev) || isLocalDevEnv();
                    sidebarUserStatus.innerHTML = isAdmin 
                        ? `<i class="fa-solid fa-crown" style="color:#f59e0b; font-size:10px;"></i> <span style="color:#f59e0b; font-weight:600;">系统管理员</span>`
                        : `<i class="fa-solid fa-cloud" style="color:#10b981; font-size:9px;"></i> <span style="color:var(--text-secondary);">${isLocal ? '本地调试模式' : '云端 · 已连接'}</span>`;
                }
                if (btnSidebarAuthAction) {
                    btnSidebarAuthAction.innerHTML = `<i class="fa-solid fa-right-from-bracket"></i>`;
                    btnSidebarAuthAction.title = '退出登录';
                }
            } else {
                sidebarUserCard.classList.remove('logged-in');
                if (sidebarUserName) {
                    sidebarUserName.textContent = '本地工作区';
                    sidebarUserName.title = '单机/本地优先模式 (数据存放在当前浏览器 IndexedDB)';
                }
                if (sidebarUserAvatar) {
                    sidebarUserAvatar.innerHTML = `<i class="fa-solid fa-laptop-code"></i>`;
                    sidebarUserAvatar.classList.remove('avatar-admin');
                }
                if (sidebarUserStatus) {
                    sidebarUserStatus.innerHTML = `<i class="fa-solid fa-database" style="color:#10b981; font-size:9px;"></i> <span>本地存储就绪</span>`;
                }
                if (btnSidebarAuthAction) {
                    btnSidebarAuthAction.innerHTML = `<i class="fa-solid fa-arrow-right-to-bracket"></i>`;
                    btnSidebarAuthAction.title = '登录云端账号';
                }
            }
        }

        // 2. 广播认证变更事件
        if (ProtoView.Events) {
            ProtoView.Events.emit('auth:changed', user);
        }
    }

    // 辅助：在登录门户中展示与清除错误提示
    function showPortalLoginError(msg) {
        const el = document.getElementById('portal-login-error');
        if (el) {
            if (msg) {
                el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHTML(msg)}`;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
                el.innerHTML = '';
            }
        } else if (msg) {
            alert(msg);
        }
    }

    function showPortalRegError(msg) {
        const el = document.getElementById('portal-reg-error');
        if (el) {
            if (msg) {
                el.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHTML(msg)}`;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
                el.innerHTML = '';
            }
        } else if (msg) {
            alert(msg);
        }
    }

    // 切换登录/注册 Tab
    function switchAuthTab(tab) {
        initDOMElements();
        showPortalLoginError('');
        showPortalRegError('');
        if (tab === 'register') {
            if (tabAuthLogin) tabAuthLogin.classList.remove('active');
            if (tabAuthRegister) tabAuthRegister.classList.add('active');
            if (formAuthLogin) formAuthLogin.style.display = 'none';
            if (formAuthRegister) formAuthRegister.style.display = 'flex';
            setTimeout(() => { if (regUsername) regUsername.focus(); }, 100);
        } else {
            if (tabAuthRegister) tabAuthRegister.classList.remove('active');
            if (tabAuthLogin) tabAuthLogin.classList.add('active');
            if (formAuthRegister) formAuthRegister.style.display = 'none';
            if (formAuthLogin) formAuthLogin.style.display = 'flex';
            setTimeout(() => { if (loginUsername) loginUsername.focus(); }, 100);
        }
    }

    // 打开登录/注册弹窗或展示准入门户
    function openAuthModal(defaultTab = 'login') {
        initDOMElements();
        if (authModal) {
            switchAuthTab(defaultTab);
            authModal.classList.add('active');
        } else {
            // 如无模态弹窗，直接复位认证状态呈现全屏准入门户
            switchAuthTab(defaultTab);
            setAuthSession(null, null);
        }
    }

    // 关闭弹窗
    function closeAuthModal() {
        initDOMElements();
        if (authModal) authModal.classList.remove('active');
    }

    // 登录请求
    async function handleLogin(username, password) {
        const isLocal = isLocalDevEnv();
        showPortalLoginError('');
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
                showToast(`欢迎回来，${data.user.username}！`, 'success');
                redirectToMainView(data.user);

                // 所有账号登录后，从云端拉取该账号专属的产品与通信协议
                if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.syncCloudProtocols === 'function') {
                    await ProtoView.WorkspaceSync.syncCloudProtocols(false);
                }
                return true;
            } else {
                // 如果处于本地开发环境且接口返回 404 或不可用，自动降级为本地离线开发模式
                if (isLocal && (res.status === 404 || !res.ok)) {
                    return doLocalDevLogin(username);
                }
                // 核心用户规范：若登录未注册的账号、密码不匹配或鉴权失败，统一明确提示「用户名或密码错误」
                let msg = '用户名或密码错误';
                if (data && data.error) {
                    // 过滤掉内部云基础设施未绑定等技术报错，统一归一化为标准的「用户名或密码错误」
                    if (data.error.includes('未找到') || data.error.includes('不存在') || data.error.includes('未注册') || data.error.includes('尚未绑定') || data.error.includes('404')) {
                        msg = '用户名或密码错误';
                    } else {
                        msg = data.error;
                    }
                }
                showPortalLoginError(msg);
                return false;
            }
        } catch (e) {
            // 本地静态服务器 (如 Live Server, python http) 无法处理 /api 请求时的优雅降级
            if (isLocal) {
                return doLocalDevLogin(username);
            }
            showPortalLoginError('用户名或密码错误');
            return false;
        }
    }

    // 注册请求 (仅需用户名与密码)
    async function handleRegister(username, password) {
        const isLocal = isLocalDevEnv();
        showPortalRegError('');
        try {
            const res = await fetch('/api/auth?action=register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=utf-8' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success) {
                setAuthSession(data.user, data.token);
                closeAuthModal();
                showToast(`账号 [${data.user.username}] 注册成功并已自动登录！`, 'success');
                redirectToMainView(data.user);

                if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.syncCloudProtocols === 'function') {
                    await ProtoView.WorkspaceSync.syncCloudProtocols(false);
                }
                return true;
            } else {
                if (isLocal && (res.status === 404 || !res.ok)) {
                    return doLocalDevLogin(username);
                }
                let msg = (data && data.error) ? data.error : '注册失败，请更换用户名重试';
                if (!data && res.status === 404) {
                    msg = '云端注册服务暂时不可用，请稍后重试。';
                }
                showPortalRegError(msg);
                return false;
            }
        } catch (e) {
            if (isLocal) {
                return doLocalDevLogin(username);
            }
            showPortalRegError('注册服务连接异常，请检查网络或稍后重试');
            return false;
        }
    }

    function safeHeaderValue(val) {
        if (val === null || val === undefined) return '';
        const str = String(val).trim();
        if (!str) return '';
        return /^[\x20-\x7E]*$/.test(str) ? str : encodeURIComponent(str);
    }

    // 退出登录
    async function handleLogout() {
        const u = getCurrentUser();
        const uName = u ? u.username : '用户';
        
        let confirmed = false;
        if (ProtoView.Utils && typeof ProtoView.Utils.showConfirm === 'function') {
            confirmed = await ProtoView.Utils.showConfirm({
                title: '退出登录',
                message: `确定要退出当前账号「${uName}」吗？`,
                detail: '退出后将返回系统登录准入门户，您可以随时重新登录或切换账号。',
                confirmText: '退出登录',
                cancelText: '取消',
                type: 'warning'
            });
        } else {
            confirmed = confirm(`确定要退出账号「${uName}」吗？\n\n退出后将返回系统登录界面。`);
        }
        if (!confirmed) return;

        const token = getToken();
        if (token && !token.startsWith('local_dev_token_')) {
            try {
                fetch('/api/auth?action=logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json;charset=utf-8',
                        'x-auth-token': safeHeaderValue(token)
                    },
                    body: JSON.stringify({ token })
                }).catch(() => {});
            } catch (e) {}
        }

        setAuthSession(null, null);
        const isLocal = isLocalDevEnv();
        // 关键防护：在本地离线环境下，退出登录不要清空本地 IndexedDB 协议与产品！
        if (!isLocal && window.dbHelper) {
            await window.dbHelper.clearAllProtocols();
            await window.dbHelper.clearAllProducts();
        }
        if (typeof window.loadProtocols === 'function') {
            await window.loadProtocols();
        }
        showToast('已安全退出登录，请重新登录', 'info');

        // 确保视图复位至协议库
        if (typeof window.switchToView === 'function') {
            window.switchToView('protocol-view');
        }
    }

    // 初始化时验证 Session 是否依然有效
    async function verifyExistingSession() {
        const token = getToken();
        if (!token) {
            updateAuthUI();
            return;
        }

        const isLocal = isLocalDevEnv();

        // 关键防护 1: 若当前处于本地离线环境，且有本地开发者 Token，保持本地 Session
        if (isLocal && token.startsWith('local_dev_token_')) {
            const u = getCurrentUser();
            if (u && u.username) {
                updateAuthUI();
                return;
            }
        }

        // 关键防护 2: 若当前处于非本地生产环境 (如 Cloudflare)，但本地存储却残留了本地开发 mock token，必须立即抹除！
        if (!isLocal && token.startsWith('local_dev_token_')) {
            console.warn('ProtoView: 生产环境检测到残留的本地开发 Token，重置为未登录状态');
            setAuthSession(null, null);
            return;
        }

        // 3. 向云端验证 Token
        try {
            const res = await fetch('/api/auth?action=me', {
                method: 'GET',
                headers: { 'x-auth-token': safeHeaderValue(token) }
            });
            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success && data.user) {
                // Session 正常有效，刷新本地展示信息
                localStorage.setItem(AUTH_STORAGE_KEY_USER, JSON.stringify(data.user));
                localStorage.setItem('protoview_cloud_ws', data.user.username);
                updateAuthUI();
            } else {
                // Token 已失效、不存在或云端鉴权失败，立即清空重置为未登录状态，展示登录门户
                console.warn('ProtoView: 云端会话校验未通过，重置为未登录状态:', res.status, data);
                setAuthSession(null, null);
            }
        } catch (e) {
            console.warn('ProtoView: 校验云端会话网络异常:', e);
            if (!isLocal) {
                // 生产环境网络连不上且无法验证时，重置会话以防死锁展示空白页
                setAuthSession(null, null);
            } else {
                updateAuthUI();
            }
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
                const ok = await handleRegister(u, p);
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

        // 侧边栏快捷云端数据同步按钮
        const btnSidebarQuickSync = document.getElementById('sidebar-quick-sync-btn');
        if (btnSidebarQuickSync) {
            btnSidebarQuickSync.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (btnSidebarQuickSync.classList.contains('is-syncing')) return;
                btnSidebarQuickSync.classList.add('is-syncing');
                try {
                    if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.syncCloudProtocols === 'function') {
                        await ProtoView.WorkspaceSync.syncCloudProtocols(true);
                    } else {
                        showToast('正在从本地数据库加载...', 'info');
                    }
                } catch (err) {
                    console.error('云端同步异常:', err);
                } finally {
                    setTimeout(() => {
                        btnSidebarQuickSync.classList.remove('is-syncing');
                    }, 600);
                }
            });
        }

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
            sidebarUserCard.addEventListener('click', async (e) => {
                // 若点击目标或其祖先为同步、系统设置、主题切换按钮或退出按钮，则不触发账号切换弹窗
                if (e.target && (e.target.closest('#theme-toggle') || e.target.closest('#btn-sidebar-auth-action') || e.target.closest('#sidebar-quick-sync-btn') || e.target.closest('#sidebar-settings-btn'))) {
                    return;
                }
                if (isLoggedIn()) {
                    const u = getCurrentUser();
                    const name = u ? (u.displayName || u.username) : '';
                    let confirmed = false;
                    if (ProtoView.Utils && typeof ProtoView.Utils.showConfirm === 'function') {
                        confirmed = await ProtoView.Utils.showConfirm({
                            title: '切换账号',
                            message: `当前已登录账号: 「${name}」`,
                            detail: '切换账号需要先退出当前账号并返回登录准入门户，是否继续？',
                            confirmText: '切换账号',
                            cancelText: '取消',
                            type: 'info'
                        });
                    } else {
                        confirmed = confirm(`当前登录账号: ${name}\n\n需要切换账号吗？`);
                    }
                    if (confirmed) {
                        handleLogout();
                    }
                } else {
                    openAuthModal('login');
                }
            });
        }

        // 自动探测并清理之前表单原生提交残留于地址栏的参数 (杜绝明文密码泄露在地址栏)
        try {
            const sp = new URLSearchParams(window.location.search);
            if (sp.has('username')) {
                const u = sp.get('username');
                if (loginUsername && u && !loginUsername.value) loginUsername.value = u;
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }
        } catch (e) {}


        // 登录门户右上角主题切换
        const portalThemeToggle = document.getElementById('portal-theme-toggle');
        if (portalThemeToggle) {
            portalThemeToggle.addEventListener('click', () => {
                const isDark = document.body.hasAttribute('data-theme') || document.documentElement.hasAttribute('data-theme');
                if (isDark) {
                    document.body.removeAttribute('data-theme');
                    document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('theme', 'light');
                    portalThemeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
                } else {
                    document.body.setAttribute('data-theme', 'dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('theme', 'dark');
                    portalThemeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
                }
            });
        }

        // 本地开发环境快捷免密秒进按钮
        const btnQuickDev = document.getElementById('btn-quick-dev-login');
        if (btnQuickDev) {
            btnQuickDev.addEventListener('click', (e) => {
                e.preventDefault();
                doLocalDevLogin('dev');
            });
        }

        // 初始更新界面
        updateAuthUI();
        verifyExistingSession();
    }

    // 挂载对外 API
    ProtoView.Auth = {
        isLocalDevEnv,
        doLocalDevLogin,
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
    ProtoView.isLocalDevEnv = isLocalDevEnv;
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
