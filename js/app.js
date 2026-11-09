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
        if (!themeToggle) return;

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            body.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        themeToggle.addEventListener('click', () => {
            if (body.hasAttribute('data-theme')) {
                body.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                body.setAttribute('data-theme', 'dark');
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

        // 点击遮罩关闭
        window.addEventListener('click', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
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
            }
        });
    }

    // ---------------------- 顶层应用启动加载序列 ----------------------
    async function initSystem() {
        initTheme();
        initSidebar();
        initGlobalModalsAndShortcuts();
        initViewRouter();

        // 1. 演示数据初始化
        try {
            if (window.dbHelper && window.dbHelper.initDemoData) {
                await window.dbHelper.initDemoData();
            }
        } catch (err) {
            console.warn("ProtoView: 演示数据初始化异常:", err);
        }

        // 2. 本地工作目录与云端同步初始化
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
