/**
 * @file admin-ctrl.js
 * @brief ProtoView 后台系统监控与用户管理控制器 (Cloudflare 配额 & 用户数据仪表盘)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Controllers = ProtoView.Controllers || {};

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};

    const ADMIN_STORAGE_KEY = 'protoview_admin_secret';

    // 内部状态
    let adminStatsData = null;
    let userFilterQuery = '';

    // DOM 元素引用
    let adminView, btnRefreshAdmin, btnCleanSessions, btnConfigAdminKey,
        adminSearchUser, userTableBody, userCountBadge,
        statTotalUsers, statActiveSessions, statTotalProtocols, statStorageBytes,
        quotaR2UsedText, quotaR2Bar, quotaR2Percent,
        quotaD1UsedText, quotaD1Bar, quotaD1Percent,
        quotaWorkersRequestsText,
        adminKeyModal, adminKeyInput, btnSaveAdminKey;

    function getAdminKey() {
        return localStorage.getItem(ADMIN_STORAGE_KEY) || 'admin888';
    }

    function setAdminKey(key) {
        localStorage.setItem(ADMIN_STORAGE_KEY, key.trim());
    }

    function getAdminHeaders() {
        const token = ProtoView.Auth && ProtoView.Auth.getToken ? ProtoView.Auth.getToken() : '';
        return {
            'x-admin-key': getAdminKey(),
            'x-auth-token': token
        };
    }

    function initDOMElements() {
        adminView = document.getElementById('admin-view');
        btnRefreshAdmin = document.getElementById('btn-refresh-admin');
        btnCleanSessions = document.getElementById('btn-clean-sessions');
        btnConfigAdminKey = document.getElementById('btn-config-admin-key');

        adminSearchUser = document.getElementById('admin-search-user');
        userTableBody = document.getElementById('admin-users-tbody');
        userCountBadge = document.getElementById('admin-user-count-badge');

        statTotalUsers = document.getElementById('admin-stat-users');
        statActiveSessions = document.getElementById('admin-stat-sessions');
        statTotalProtocols = document.getElementById('admin-stat-protocols');
        statStorageBytes = document.getElementById('admin-stat-storage');

        quotaR2UsedText = document.getElementById('quota-r2-used');
        quotaR2Bar = document.getElementById('quota-r2-bar');
        quotaR2Percent = document.getElementById('quota-r2-percent');

        quotaD1UsedText = document.getElementById('quota-d1-used');
        quotaD1Bar = document.getElementById('quota-d1-bar');
        quotaD1Percent = document.getElementById('quota-d1-percent');

        quotaWorkersRequestsText = document.getElementById('quota-workers-requests');

        adminKeyModal = document.getElementById('admin-key-modal');
        adminKeyInput = document.getElementById('admin-key-input');
        btnSaveAdminKey = document.getElementById('btn-save-admin-key');
    }

    // 格式化字节大小
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 格式化时间戳
    function formatDate(ts) {
        if (!ts) return '-';
        const d = new Date(Number(ts));
        if (isNaN(d.getTime())) return '-';
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${Y}-${M}-${D} ${h}:${m}`;
    }

    // 从后端拉取系统与配额数据
    async function loadAdminStats() {
        initDOMElements();
        if (!adminView) return;

        // 权限校验：仅管理员可访问
        const currentUser = ProtoView.Auth && ProtoView.Auth.getCurrentUser ? ProtoView.Auth.getCurrentUser() : null;
        const isAdmin = currentUser && (currentUser.isAdmin || currentUser.username.toLowerCase() === 'admin');
        if (!isAdmin) {
            showToast('仅管理员账号 (admin) 可访问后台管理中心', 'warning');
            if (typeof window.switchToView === 'function') {
                window.switchToView('protocol-view');
            }
            return;
        }

        if (btnRefreshAdmin) {
            btnRefreshAdmin.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> 正在读取...`;
            btnRefreshAdmin.disabled = true;
        }

        try {
            const res = await fetch(`/api/admin?action=stats`, {
                headers: getAdminHeaders()
            });

            if (res.status === 401) {
                showToast('后台管理口令错误，请点击右上角重设口令', 'warning');
                openAdminKeyModal();
                return;
            }

            const data = await res.json();
            if (data && data.success) {
                adminStatsData = data;
                renderOverviewKPIs(data.overview);
                renderQuotaHealth(data.quotaHealth);
                renderUsersTable(data.users);
            } else {
                showToast((data && data.error) || '读取系统数据失败', 'error');
            }
        } catch (e) {
            showToast('请求监控服务异常: ' + e.message, 'error');
        } finally {
            if (btnRefreshAdmin) {
                btnRefreshAdmin.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> 刷新数据`;
                btnRefreshAdmin.disabled = false;
            }
        }
    }

    // 渲染顶部 4 个核心 KPI 仪表卡
    function renderOverviewKPIs(overview) {
        if (!overview) return;
        if (statTotalUsers) statTotalUsers.textContent = overview.totalUsers || 0;
        if (statActiveSessions) statActiveSessions.textContent = overview.activeSessions || 0;
        if (statTotalProtocols) statTotalProtocols.textContent = overview.totalProtocols || 0;
        if (statStorageBytes) statStorageBytes.textContent = formatBytes(overview.totalStorageBytes || 0);

        // 引擎指示徽章
        const engineBadge = document.getElementById('admin-engine-badge');
        if (engineBadge) {
            engineBadge.innerHTML = `<i class="fa-solid fa-server"></i> 存储: <b>${overview.storageEngine || 'R2'}</b> · 数据库: <b>${overview.authEngine || 'D1'}</b>`;
        }
    }

    // 渲染 Cloudflare 官方免费额度健康条
    function renderQuotaHealth(quota) {
        if (!quota) return;

        // 1. R2 存储进度条 (10 GB)
        if (quota.r2) {
            const usedStr = formatBytes(quota.r2.usedBytes || 0);
            const totalStr = formatBytes(quota.r2.totalBytes || 10737418240);
            const pct = Math.min(100, quota.r2.percent || 0.01);

            if (quotaR2UsedText) quotaR2UsedText.textContent = `${usedStr} / ${totalStr}`;
            if (quotaR2Percent) quotaR2Percent.textContent = `${pct < 0.01 ? '<0.01' : pct.toFixed(2)}%`;
            if (quotaR2Bar) {
                quotaR2Bar.style.width = `${Math.max(1, pct)}%`;
                quotaR2Bar.className = `quota-progress-bar-fill ${pct > 85 ? 'danger' : (pct > 70 ? 'warning' : 'healthy')}`;
            }
        }

        // 2. D1 数据库进度条 (5 GB)
        if (quota.d1) {
            const usedStr = formatBytes(quota.d1.usedBytes || 0);
            const totalStr = formatBytes(quota.d1.totalBytes || 5368709120);
            const pct = Math.min(100, quota.d1.percent || 0.001);

            if (quotaD1UsedText) quotaD1UsedText.textContent = `${usedStr} / ${totalStr}`;
            if (quotaD1Percent) quotaD1Percent.textContent = `${pct < 0.01 ? '<0.01' : pct.toFixed(3)}%`;
            if (quotaD1Bar) {
                quotaD1Bar.style.width = `${Math.max(1, pct)}%`;
                quotaD1Bar.className = `quota-progress-bar-fill ${pct > 85 ? 'danger' : 'healthy'}`;
            }
        }
    }

    // 渲染用户列表与管理表格
    function renderUsersTable(users) {
        if (!userTableBody) return;
        userTableBody.innerHTML = '';

        const list = users || (adminStatsData && adminStatsData.users) || [];
        const query = userFilterQuery.trim().toLowerCase();

        const filtered = list.filter(u => {
            if (!query) return true;
            return u.username.toLowerCase().includes(query);
        });

        if (userCountBadge) {
            userCountBadge.textContent = filtered.length;
        }

        if (filtered.length === 0) {
            userTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="admin-table-empty">
                        <i class="fa-solid fa-users-slash"></i>
                        <p>${query ? '没有找到匹配的用户账号' : '暂无用户注册数据'}</p>
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach((u, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: center; color: var(--text-secondary);">${index + 1}</td>
                <td>
                    <div class="admin-user-cell">
                        <div class="admin-user-avatar"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <span class="admin-user-name">${escapeHTML(u.username)}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="admin-badge-count"><i class="fa-solid fa-file-code"></i> ${u.protocolCount || 0} 份协议</span>
                    <span class="admin-badge-size">${formatBytes(u.storageBytes || 0)}</span>
                </td>
                <td style="color: var(--text-secondary); font-size: 12px;">${formatDate(u.createdAt)}</td>
                <td style="text-align: right;">
                    <div class="admin-row-actions">
                        <button type="button" class="btn btn-secondary btn-xs" onclick="window.adminResetPassword('${escapeHTML(u.username)}')" title="重置该用户登录密码">
                            <i class="fa-solid fa-key"></i> 改密
                        </button>
                        <button type="button" class="btn btn-danger-outline btn-xs" onclick="window.adminDeleteUser('${escapeHTML(u.username)}')" title="删除该用户及其所有协议数据">
                            <i class="fa-solid fa-trash"></i> 删除
                        </button>
                    </div>
                </td>
            `;
            userTableBody.appendChild(tr);
        });
    }

    // 重置用户密码
    async function adminResetPassword(username) {
        const newPwd = prompt(`请输入用户 [${username}] 的新登录密码 (至少 6 位):`);
        if (!newPwd) return;
        if (newPwd.trim().length < 6) {
            alert('密码长度至少需要 6 个字符！');
            return;
        }

        try {
            const res = await fetch('/api/admin?action=reset_password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAdminHeaders()
                },
                body: JSON.stringify({ username, newPassword: newPwd.trim() })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(data.message || `用户 [${username}] 密码已成功重置！`, 'success');
            } else {
                alert((data && data.error) || '重置密码失败');
            }
        } catch (e) {
            alert('操作异常: ' + e.message);
        }
    }

    // 删除用户
    async function adminDeleteUser(username) {
        if (!confirm(`【危险警告】\n\n确定要永久注销并删除用户 [${username}] 吗？\n该用户在 Cloudflare 存储的所有通信协议文件都将被一并销毁且无法恢复！`)) {
            return;
        }

        try {
            const res = await fetch(`/api/admin?action=delete_user&username=${encodeURIComponent(username)}`, {
                method: 'POST',
                headers: getAdminHeaders()
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(data.message || `用户 [${username}] 已删除！`, 'success');
                loadAdminStats();
            } else {
                alert((data && data.error) || '删除用户失败');
            }
        } catch (e) {
            alert('操作异常: ' + e.message);
        }
    }

    // 清理废弃过期会话
    async function cleanExpiredSessions() {
        if (!confirm('确定要一键清理 D1 数据库中已过期的废弃登录会话吗？')) return;
        try {
            const res = await fetch('/api/admin?action=clean_sessions', {
                method: 'POST',
                headers: getAdminHeaders()
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(data.message || '清理完成', 'success');
                loadAdminStats();
            } else {
                alert((data && data.error) || '清理失败');
            }
        } catch (e) {
            alert('操作异常: ' + e.message);
        }
    }

    // 打开管理员口令设置弹窗
    function openAdminKeyModal() {
        initDOMElements();
        if (adminKeyInput) adminKeyInput.value = getAdminKey();
        if (adminKeyModal) adminKeyModal.classList.add('active');
    }

    function closeAdminKeyModal() {
        initDOMElements();
        if (adminKeyModal) adminKeyModal.classList.remove('active');
    }

    function bindEvents() {
        initDOMElements();

        if (btnRefreshAdmin) {
            btnRefreshAdmin.addEventListener('click', loadAdminStats);
        }

        if (btnCleanSessions) {
            btnCleanSessions.addEventListener('click', cleanExpiredSessions);
        }

        if (btnConfigAdminKey) {
            btnConfigAdminKey.addEventListener('click', openAdminKeyModal);
        }

        if (btnSaveAdminKey) {
            btnSaveAdminKey.addEventListener('click', () => {
                const val = (adminKeyInput ? adminKeyInput.value : '').trim();
                setAdminKey(val || 'admin888');
                closeAdminKeyModal();
                showToast('已更新后台管理访问密钥！', 'success');
                loadAdminStats();
            });
        }

        if (adminSearchUser) {
            adminSearchUser.addEventListener('input', (e) => {
                userFilterQuery = e.target.value;
                renderUsersTable();
            });
        }

        // 监听视图切换至 admin-view
        if (ProtoView.Events) {
            ProtoView.Events.on('view:changed', (viewId) => {
                if (viewId === 'admin-view') {
                    loadAdminStats();
                }
            });
        }
    }

    // 挂载对外 API
    ProtoView.Controllers.Admin = {
        loadAdminStats,
        adminResetPassword,
        adminDeleteUser,
        cleanExpiredSessions,
        openAdminKeyModal,
        closeAdminKeyModal
    };

    global.adminResetPassword = adminResetPassword;
    global.adminDeleteUser = adminDeleteUser;
    global.loadAdminStats = loadAdminStats;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

})(typeof window !== 'undefined' ? window : this);
