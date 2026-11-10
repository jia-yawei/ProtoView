/**
 * @file app.js
 * @brief ProtoView 应用启动引导入口 (Application Bootstrapper)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};

    // ---------------------- 主题切换管理 ----------------------
    function initTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        const body = document.body;
        const docEl = document.documentElement;
        if (!themeToggle) return;

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            body.setAttribute('data-theme', 'dark');
            docEl.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        themeToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isDark = body.hasAttribute('data-theme') || docEl.hasAttribute('data-theme');
            if (isDark) {
                body.removeAttribute('data-theme');
                docEl.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                body.setAttribute('data-theme', 'dark');
                docEl.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });
    }

    // ---------------------- 侧边栏折叠与展开 ----------------------
    function initSidebar() {
        const mainSidebar = document.getElementById('main-sidebar');
        const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        if (!mainSidebar) return;

        const savedSidebarCollapsed = localStorage.getItem('protoview_sidebar_collapsed');
        if (savedSidebarCollapsed === 'true') {
            mainSidebar.classList.add('collapsed');
        }

        if (btnToggleSidebar) {
            btnToggleSidebar.addEventListener('click', () => {
                mainSidebar.classList.toggle('collapsed');
                const isCollapsed = mainSidebar.classList.contains('collapsed');
                localStorage.setItem('protoview_sidebar_collapsed', isCollapsed ? 'true' : 'false');
            });
        }
    }

    // ---------------------- 全局弹窗关闭与快捷键 ----------------------
    function initGlobalModalsAndShortcuts() {
        // 通用关闭按钮
        document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) modal.classList.remove('active');
            });
        });

        // 点击遮罩关闭（严格防误触：必须按下与松开均在遮罩背景上，且无文本划选，避免选中文本拖到弹窗边缘时误关闭）
        let modalBackdropMouseDownTarget = null;

        window.addEventListener('mousedown', (e) => {
            modalBackdropMouseDownTarget = e.target;
        });

        window.addEventListener('click', (e) => {
            // 1. 若当前有文本正在被划选（如复制Token、SQL语句等），绝不关闭弹窗
            const selection = window.getSelection ? window.getSelection().toString() : '';
            if (selection && selection.length > 0) {
                modalBackdropMouseDownTarget = null;
                return;
            }

            // 2. 只有当鼠标按下的起始目标 (mousedown) 和最终点击目标 (click) 均严格是 .modal 遮罩背景自身时才关闭
            if (e.target && e.target.classList && e.target.classList.contains('modal')) {
                if (modalBackdropMouseDownTarget === e.target) {
                    e.target.classList.remove('active');
                }
            }
            modalBackdropMouseDownTarget = null;
        });

        // 按 ESC 关闭
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
            }
        });

        // Ctrl + S / Cmd + S 拦截与保存
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();

                const protoConfigModal = document.getElementById('protocol-config-modal');
                if (protoConfigModal && protoConfigModal.classList.contains('active')) {
                    const submitBtn = document.getElementById('btn-proto-form-submit');
                    if (submitBtn) submitBtn.click();
                    return;
                }

                const viewerView = document.getElementById('protocol-viewer-view');
                if (viewerView && viewerView.classList.contains('active')) {
                    if (ProtoView.Utils && ProtoView.Utils.showToast) {
                        ProtoView.Utils.showToast('当前处于只读查阅模式；若需修改协议，请点击右上角「进入编辑工作台」', 'info');
                    }
                    return;
                }

                const serialView = document.getElementById('serial-view');
                if (serialView && serialView.classList.contains('active')) {
                    if (typeof window.saveCurrentSerialProtocol === 'function') {
                        window.saveCurrentSerialProtocol();
                    }
                    return;
                }

                const arincView = document.getElementById('arinc429-view');
                if (arincView && arincView.classList.contains('active')) {
                    if (typeof window.saveCurrentArincProtocol === 'function') {
                        window.saveCurrentArincProtocol();
                    }
                    return;
                }

                if (typeof window.saveCurrentArincProtocol === 'function') {
                    window.saveCurrentArincProtocol();
                }
            }
        });
    }

    // ---------------------- 视图路由监听与联动 ----------------------
    function initViewRouter() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetViewId = item.getAttribute('data-view');
                if (typeof window.switchToView === 'function') {
                    window.switchToView(targetViewId);
                }
            });
        });

        // 订阅路由切换事件以联动各控制器
        ProtoView.Events.on('view:changed', (data) => {
            const viewId = typeof data === 'string' ? data : (data && data.viewId);
            const user = ProtoView.Auth && ProtoView.Auth.getCurrentUser ? ProtoView.Auth.getCurrentUser() : null;
            const isAdmin = user && (user.isAdmin || user.username.toLowerCase() === 'admin');

            // 权限分立：管理员账号无需通信协议管理，仅允许在 admin-view 工作
            if (isAdmin && viewId !== 'admin-view') {
                if (typeof window.switchToView === 'function') {
                    window.switchToView('admin-view');
                }
                return;
            }

            if (viewId === 'protocol-view') {
                if (typeof window.loadProtocols === 'function') window.loadProtocols();
            } else if (viewId === 'arinc429-view') {
                if (typeof window.loadArincProtocolsForSelect === 'function') window.loadArincProtocolsForSelect();
                if (typeof window.setMobileArincView === 'function' && window.innerWidth <= 768) {
                    window.setMobileArincView('words');
                }
            } else if (viewId === 'serial-view') {
                if (typeof window.ensureSerialProtocolLoaded === 'function') window.ensureSerialProtocolLoaded();
                if (typeof window.setMobileSerialView === 'function' && window.innerWidth <= 768) {
                    window.setMobileSerialView('packets');
                }
            } else if (viewId === 'admin-view') {
                if (!isAdmin) {
                    if (ProtoView.Utils && ProtoView.Utils.showToast) {
                        ProtoView.Utils.showToast('需要管理员账号权限 (admin) 才能访问管理后台', 'warning');
                    }
                    if (typeof window.switchToView === 'function') {
                        window.switchToView('protocol-view');
                    }
                    return;
                }
                if (typeof window.loadAdminStats === 'function') window.loadAdminStats();
            }
        });
    }

    // ---------------------- 顶层应用启动加载序列 ----------------------
    async function initSystem() {
        initTheme();
        initSidebar();
        initGlobalModalsAndShortcuts();
        initViewRouter();

        // 未登录状态：清空本地旧缓存以防泄露历史数据，登录前仅呈现登录准入门户
        const loggedIn = ProtoView.Auth && ProtoView.Auth.isLoggedIn ? ProtoView.Auth.isLoggedIn() : false;
        if (!loggedIn) {
            if (window.dbHelper) {
                await window.dbHelper.clearAllProtocols();
                await window.dbHelper.clearAllProducts();
            }
            return;
        }

        // 核心权限分支：管理员账号仅需管理后台，跳过所有通信协议初始化
        const currentUser = ProtoView.Auth && ProtoView.Auth.getCurrentUser ? ProtoView.Auth.getCurrentUser() : null;
        const isAdmin = currentUser && (currentUser.isAdmin || currentUser.username.toLowerCase() === 'admin');
        if (isAdmin) {
            if (window.dbHelper) {
                await window.dbHelper.clearAllProtocols();
                await window.dbHelper.clearAllProducts();
            }
            if (typeof window.switchToView === 'function') {
                window.switchToView('admin-view');
            }
            if (typeof window.loadAdminStats === 'function') {
                await window.loadAdminStats();
            }
            return;
        }

        // 1. 演示数据清理 (确保纯净工作台)
        try {
            if (window.dbHelper && window.dbHelper.initDemoData) {
                await window.dbHelper.initDemoData();
            }
        } catch (err) {
            console.warn("ProtoView: 演示数据清理异常:", err);
        }

        // 2. 云端协议同步初始化 (从 Cloudflare R2 / KV 拉取该用户协议)
        try {
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.init === 'function') {
                await ProtoView.WorkspaceSync.init();
            }
        } catch (wsErr) {
            console.warn("ProtoView: 初始化工作台异常:", wsErr);
        }

        // 3. 产品与协议列表加载
        try {
            if (typeof window.loadProtocols === 'function') await window.loadProtocols();
        } catch (err) {
            console.error("ProtoView: loadProtocols 失败:", err);
        }

        try {
            if (typeof window.loadProtocolsForSelect === 'function') await window.loadProtocolsForSelect();
        } catch (err) {
            console.error("ProtoView: loadProtocolsForSelect 失败:", err);
        }

        // 4. ARINC 429 工作台协议载入
        try {
            if (typeof window.loadArincProtocolsForSelect === 'function') await window.loadArincProtocolsForSelect();
        } catch (err) {
            console.error("ProtoView: loadArincProtocolsForSelect 失败:", err);
        }

        // 5. 串口工作台协议载入
        try {
            if (typeof window.ensureSerialProtocolLoaded === 'function') await window.ensureSerialProtocolLoaded();
        } catch (err) {
            console.error("ProtoView: ensureSerialProtocolLoaded 失败:", err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSystem);
    } else {
        initSystem();
    }

})(typeof window !== 'undefined' ? window : this);
