/**
 * @file admin-ctrl.js
 * @brief ProtoView 后台系统监控与云端绑定管理中心
 *        (支持 D1 数据库直连诊断、一键建表、R2 对象存储、Cloudflare 官方 API 真实流量与请求爬取)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Controllers = ProtoView.Controllers || {};

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};

    const ADMIN_STORAGE_KEY = 'protoview_admin_secret';
    const CF_CONFIG_KEY = 'protoview_cf_config';

    // 内部状态
    let adminStatsData = null;
    let userFilterQuery = '';

    // DOM 元素引用
    let adminView, btnRefreshAdmin, btnCleanSessions, btnConfigAdminKey,
        btnOpenCfConfig, btnOpenCfGuide, btnRecheckBindings, btnOpenGuideInline,
        adminSearchUser, userTableBody, userCountBadge,
        statTotalUsers, statActiveSessions, statTotalProtocols, statStorageBytes,
        // 绑定诊断卡片
        bindingOverallPill,
        badgeD1Status, descD1Status, d1TablesIndicator, btnInitD1Schema, btnViewD1Sql,
        badgeR2Status, descR2Status, btnConfigR2Target,
        badgeCfApiStatus, descCfApiStatus, cfApiIndicator, btnManageCfApi,
        // 实时指标
        quotaTrafficUsed, quotaTrafficSourcePill,
        quotaRequestsCount, quotaRequests30d, quotaRequestsSourcePill, cfRealDataBadge,
        btnOpenCfApiModalTop,
        // 配额进度条
        quotaR2UsedText, quotaR2Bar, quotaR2Percent,
        quotaD1UsedText, quotaD1Bar, quotaD1Percent,
        // 弹窗与配置
        cfConfigModal, cfConfigForm, cfCfgToken, cfCfgAccountId, cfCfgR2Bucket, cfCfgZoneId, cfCfgTestStatus,
        btnTestCfToken, btnSaveCfCfg,
        cfGuideModal, btnCopyD1Sql, guideSqlPreview,
        adminKeyModal, adminKeyInput, btnSaveAdminKey;

    function getAdminKey() {
        return localStorage.getItem(ADMIN_STORAGE_KEY) || 'admin888';
    }

    function setAdminKey(key) {
        localStorage.setItem(ADMIN_STORAGE_KEY, key.trim());
    }

    function getCfConfig() {
        try {
            return JSON.parse(localStorage.getItem(CF_CONFIG_KEY) || '{}');
        } catch(e) {
            return {};
        }
    }

    function setCfConfig(cfg) {
        localStorage.setItem(CF_CONFIG_KEY, JSON.stringify(cfg || {}));
    }

    function getAdminHeaders() {
        const token = ProtoView.Auth && ProtoView.Auth.getToken ? ProtoView.Auth.getToken() : '';
        const cf = getCfConfig();
        const headers = {
            'x-admin-key': getAdminKey(),
            'x-auth-token': token
        };
        if (cf.cfApiToken) headers['x-cf-token'] = cf.cfApiToken;
        if (cf.cfAccountId) headers['x-cf-account-id'] = cf.cfAccountId;
        if (cf.cfZoneId) headers['x-cf-zone-id'] = cf.cfZoneId;
        if (cf.cfR2Bucket) headers['x-cf-r2-bucket'] = cf.cfR2Bucket;
        return headers;
    }

    function initDOMElements() {
        adminView = document.getElementById('admin-view');
        btnRefreshAdmin = document.getElementById('btn-refresh-admin');
        btnCleanSessions = document.getElementById('btn-clean-sessions');
        btnConfigAdminKey = document.getElementById('btn-config-admin-key');
        btnOpenCfConfig = document.getElementById('btn-open-cf-config');
        btnOpenCfGuide = document.getElementById('btn-open-cf-guide');

        // 绑定诊断
        bindingOverallPill = document.getElementById('binding-overall-pill');
        btnRecheckBindings = document.getElementById('btn-recheck-bindings');
        btnOpenGuideInline = document.getElementById('btn-open-guide-inline');

        badgeD1Status = document.getElementById('badge-d1-status');
        descD1Status = document.getElementById('desc-d1-status');
        d1TablesIndicator = document.getElementById('d1-tables-indicator');
        btnInitD1Schema = document.getElementById('btn-init-d1-schema');
        btnViewD1Sql = document.getElementById('btn-view-d1-sql');

        badgeR2Status = document.getElementById('badge-r2-status');
        descR2Status = document.getElementById('desc-r2-status');
        btnConfigR2Target = document.getElementById('btn-config-r2-target');

        badgeCfApiStatus = document.getElementById('badge-cf-api-status');
        descCfApiStatus = document.getElementById('desc-cf-api-status');
        cfApiIndicator = document.getElementById('cf-api-indicator');
        btnManageCfApi = document.getElementById('btn-manage-cf-api');

        // 实时流量与请求
        quotaTrafficUsed = document.getElementById('quota-traffic-used');
        quotaTrafficSourcePill = document.getElementById('quota-traffic-source-pill');
        quotaRequestsCount = document.getElementById('quota-requests-count');
        quotaRequests30d = document.getElementById('quota-requests-30d');
        quotaRequestsSourcePill = document.getElementById('quota-requests-source-pill');
        cfRealDataBadge = document.getElementById('cf-real-data-badge');
        btnOpenCfApiModalTop = document.getElementById('btn-open-cf-api-modal-top');

        // 注册用户表格与搜索
        adminSearchUser = document.getElementById('admin-search-user');
        userTableBody = document.getElementById('admin-users-tbody');
        userCountBadge = document.getElementById('admin-user-count-badge');

        // 核心 KPI 仪表卡
        statTotalUsers = document.getElementById('admin-stat-users');
        statActiveSessions = document.getElementById('admin-stat-sessions');
        statTotalProtocols = document.getElementById('admin-stat-protocols');
        statStorageBytes = document.getElementById('admin-stat-storage');

        // 额度进度条
        quotaR2UsedText = document.getElementById('quota-r2-used');
        quotaR2Bar = document.getElementById('quota-r2-bar');
        quotaR2Percent = document.getElementById('quota-r2-percent');

        quotaD1UsedText = document.getElementById('quota-d1-used');
        quotaD1Bar = document.getElementById('quota-d1-bar');
        quotaD1Percent = document.getElementById('quota-d1-percent');

        // 弹窗元素
        cfConfigModal = document.getElementById('cf-config-modal');
        cfConfigForm = document.getElementById('cf-config-form');
        cfCfgToken = document.getElementById('cf-cfg-token');
        cfCfgAccountId = document.getElementById('cf-cfg-account-id');
        cfCfgR2Bucket = document.getElementById('cf-cfg-r2-bucket');
        cfCfgZoneId = document.getElementById('cf-cfg-zone-id');
        cfCfgTestStatus = document.getElementById('cf-cfg-test-status');
        btnTestCfToken = document.getElementById('btn-test-cf-token');
        btnSaveCfCfg = document.getElementById('btn-save-cf-cfg');

        cfGuideModal = document.getElementById('cf-guide-modal');
        btnCopyD1Sql = document.getElementById('btn-copy-d1-sql');
        guideSqlPreview = document.getElementById('guide-sql-preview');

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
                renderBindingsStatus(data.bindings, data.quotaHealth);
                renderCloudflareLiveMetrics(data.quotaHealth && data.quotaHealth.workers);
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
            const r2Label = overview.storageEngine === 'R2' ? 'Cloudflare R2' : '本地/KV回退';
            const d1Label = overview.authEngine === 'D1' ? 'Cloudflare D1' : '本地/KV回退';
            engineBadge.innerHTML = `<i class="fa-solid fa-server"></i> 协议存储: <b>${r2Label}</b> · 账号库: <b>${d1Label}</b>`;
        }
    }

    // 渲染云端绑定状态 (D1, R2, CF API)
    function renderBindingsStatus(bindings, quotaHealth) {
        if (!bindings) return;

        let allHealthy = true;

        // 1. D1 数据库绑定状态诊断
        const d1 = bindings.d1 || {};
        if (d1.connected) {
            if (d1.ready) {
                if (badgeD1Status) {
                    badgeD1Status.className = 'binding-status-tag tag-healthy';
                    badgeD1Status.innerHTML = '<i class="fa-solid fa-circle-check"></i> 已连接 · 表就绪';
                }
                if (descD1Status) {
                    descD1Status.textContent = '已连接到 Cloudflare D1 关系型数据库，账号密码与会话表结构完整。';
                }
                if (d1TablesIndicator) {
                    d1TablesIndicator.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> users 和 sessions 表结构正常 (生产就绪)';
                }
                if (btnInitD1Schema) {
                    btnInitD1Schema.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 重建/校验数据表';
                    btnInitD1Schema.className = 'btn btn-secondary btn-xs';
                }
            } else {
                allHealthy = false;
                if (badgeD1Status) {
                    badgeD1Status.className = 'binding-status-tag tag-warning';
                    badgeD1Status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 已连接 · 需建表';
                }
                if (descD1Status) {
                    descD1Status.textContent = 'D1 数据库连接成功，但尚未初始化用户表结构。请点击下方一键初始化。';
                }
                if (d1TablesIndicator) {
                    d1TablesIndicator.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> 缺少 users 或 sessions 表，点击右侧一键初始化即可生成';
                }
                if (btnInitD1Schema) {
                    btnInitD1Schema.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 一键初始化数据表';
                    btnInitD1Schema.className = 'btn btn-primary-soft btn-xs';
                }
            }
        } else {
            allHealthy = false;
            if (badgeD1Status) {
                badgeD1Status.className = 'binding-status-tag tag-unconfigured';
                badgeD1Status.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 未检测到 D1 绑定';
            }
            if (descD1Status) {
                descD1Status.textContent = '请在 Cloudflare Pages 设置 -> 函数中绑定变量 DB，否则账号将存入临时降级存储。';
            }
            if (d1TablesIndicator) {
                d1TablesIndicator.innerHTML = '<i class="fa-solid fa-circle-info"></i> 在 Pages 后台绑定 DB 后，点击顶部向导可快速配置';
            }
        }

        // 2. R2 存储桶绑定状态诊断
        const r2 = bindings.r2 || {};
        if (r2.connected) {
            if (badgeR2Status) {
                badgeR2Status.className = 'binding-status-tag tag-healthy';
                badgeR2Status.innerHTML = '<i class="fa-solid fa-circle-check"></i> 已连接';
            }
            if (descR2Status) {
                descR2Status.textContent = '已挂载 PROTO_BUCKET 对象存储桶，无缝持久化大 JSON 航空通信协议，支持 500KB+ 单文件。';
            }
        } else {
            allHealthy = false;
            if (badgeR2Status) {
                badgeR2Status.className = 'binding-status-tag tag-warning';
                badgeR2Status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 未检测到 R2 绑定';
            }
            if (descR2Status) {
                descR2Status.textContent = '当前协议正通过降级引擎工作。请在 Pages 设置中绑定 PROTO_BUCKET 激活全量存储。';
            }
        }

        // 3. Cloudflare 官方 API 连线状态
        const cfApi = bindings.cfApi || {};
        if (cfApi.configured && cfApi.isLive) {
            if (badgeCfApiStatus) {
                badgeCfApiStatus.className = 'binding-status-tag tag-healthy';
                badgeCfApiStatus.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> 官方 API 直连';
            }
            if (descCfApiStatus) {
                descCfApiStatus.textContent = '成功连接 Cloudflare GraphQL Analytics 与 REST API，出站流量与请求次数已 100% 同步。';
            }
            if (cfApiIndicator) {
                cfApiIndicator.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> 官方遥测已激活 (账户: ${escapeHTML(cfApi.accountId || '已授权')})`;
            }
        } else if (cfApi.configured && !cfApi.isLive) {
            if (badgeCfApiStatus) {
                badgeCfApiStatus.className = 'binding-status-tag tag-warning';
                badgeCfApiStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> API 权限受限';
            }
            if (descCfApiStatus) {
                descCfApiStatus.textContent = '已配置 API Token，但暂未成功拉取到监控数据。请检查 Token 是否具备 Analytics 读权限。';
            }
            if (cfApiIndicator) {
                cfApiIndicator.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;"></i> 缺少 Account Analytics 权限或账户 ID 不匹配';
            }
        } else {
            if (badgeCfApiStatus) {
                badgeCfApiStatus.className = 'binding-status-tag tag-unconfigured';
                badgeCfApiStatus.innerHTML = '未配置官方 API';
            }
            if (descCfApiStatus) {
                descCfApiStatus.textContent = '直接抓取 Cloudflare 官方出站流量 (Bandwidth) 与真实 HTTP 请求次数。';
            }
            if (cfApiIndicator) {
                cfApiIndicator.innerHTML = '<i class="fa-solid fa-circle-info"></i> 配置 API Token 后与官方控制台数据 100% 一致';
            }
        }

        // 4. 总览指示药丸
        if (bindingOverallPill) {
            if (allHealthy && cfApi.isLive) {
                bindingOverallPill.textContent = '全套服务极佳';
                bindingOverallPill.className = 'quota-badge-pill healthy';
            } else if (d1.ready && r2.connected) {
                bindingOverallPill.textContent = '核心云端就绪';
                bindingOverallPill.className = 'quota-badge-pill healthy';
            } else if (d1.connected || r2.connected) {
                bindingOverallPill.textContent = '部分服务需建表/绑定';
                bindingOverallPill.className = 'quota-badge-pill warning';
            } else {
                bindingOverallPill.textContent = '待连接云端';
                bindingOverallPill.className = 'quota-badge-pill';
            }
        }
    }

    // 渲染 Cloudflare 官方 API 爬取的真实流量与请求数据
    function renderCloudflareLiveMetrics(workersQuota) {
        if (!workersQuota) return;

        // 1. 真实出站流量 (Bandwidth)
        if (quotaTrafficUsed) {
            if (workersQuota.isLive) {
                quotaTrafficUsed.textContent = `${formatBytes(workersQuota.realTrafficBytes || 0)} / 24小时`;
            } else {
                quotaTrafficUsed.textContent = `${formatBytes(workersQuota.realTrafficBytes || 0)} (估算)`;
            }
        }
        if (quotaTrafficSourcePill) {
            if (workersQuota.isLive) {
                quotaTrafficSourcePill.textContent = '官方实时采集';
                quotaTrafficSourcePill.className = 'quota-percent-pill healthy';
            } else {
                quotaTrafficSourcePill.textContent = '需配置官方 API';
                quotaTrafficSourcePill.className = 'quota-percent-pill';
            }
        }

        // 2. 真实 HTTP 请求量 (Requests)
        if (quotaRequestsCount) {
            const r24 = workersQuota.realRequests24h || 0;
            quotaRequestsCount.textContent = `${r24.toLocaleString()} 次 / 今日`;
        }
        if (quotaRequests30d) {
            const r30 = workersQuota.realRequests30d || workersQuota.realRequests24h || 0;
            quotaRequests30d.textContent = r30.toLocaleString();
        }
        if (quotaRequestsSourcePill) {
            if (workersQuota.isLive) {
                quotaRequestsSourcePill.innerHTML = '<i class="fa-solid fa-circle-check"></i> 官方实时';
                quotaRequestsSourcePill.className = 'quota-status-pill healthy';
            } else {
                quotaRequestsSourcePill.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> 自测估算';
                quotaRequestsSourcePill.className = 'quota-status-pill';
            }
        }

        if (cfRealDataBadge) {
            if (workersQuota.isLive) {
                cfRealDataBadge.textContent = '官方指标直连中';
                cfRealDataBadge.className = 'quota-badge-pill healthy';
            } else {
                cfRealDataBadge.textContent = '待配置官方采集';
                cfRealDataBadge.className = 'quota-badge-pill';
            }
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

    // 一键初始化 D1 数据表 (users 和 sessions)
    async function initD1Schema() {
        if (!confirm('【一键初始化 Cloudflare D1 数据表】\n\n系统将直接在您绑定的 D1 数据库中执行建表脚本：\n1. users 表 (账号与加盐密码哈希)\n2. sessions 表 (登录会话 Token)\n\n确定执行吗？')) {
            return;
        }

        if (btnInitD1Schema) {
            btnInitD1Schema.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 执行中...`;
            btnInitD1Schema.disabled = true;
        }

        try {
            const res = await fetch('/api/admin?action=init_d1_schema', {
                method: 'POST',
                headers: getAdminHeaders()
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(data.message || 'D1 数据表结构初始化成功！', 'success');
                loadAdminStats();
            } else {
                alert('初始化失败:\n\n' + ((data && data.error) || '未知异常，请检查 Cloudflare Pages 是否已绑定 DB 变量'));
            }
        } catch (e) {
            alert('请求异常: ' + e.message);
        } finally {
            if (btnInitD1Schema) {
                btnInitD1Schema.disabled = false;
            }
        }
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

    // 打开/关闭 Cloudflare 配置弹窗
    function openCfConfigModal() {
        initDOMElements();
        const cfg = getCfConfig();
        if (cfCfgToken) cfCfgToken.value = cfg.cfApiToken || '';
        if (cfCfgAccountId) cfCfgAccountId.value = cfg.cfAccountId || '';
        if (cfCfgR2Bucket) cfCfgR2Bucket.value = cfg.cfR2Bucket || 'protoview-bucket';
        if (cfCfgZoneId) cfCfgZoneId.value = cfg.cfZoneId || '';
        if (cfCfgTestStatus) cfCfgTestStatus.style.display = 'none';
        if (cfConfigModal) cfConfigModal.classList.add('active');
    }

    function closeCfConfigModal() {
        initDOMElements();
        if (cfConfigModal) cfConfigModal.classList.remove('active');
    }

    // 打开/关闭建表向导弹窗
    function openCfGuideModal() {
        initDOMElements();
        if (cfGuideModal) cfGuideModal.classList.add('active');
    }

    function closeCfGuideModal() {
        initDOMElements();
        if (cfGuideModal) cfGuideModal.classList.remove('active');
    }

    // 测试 Cloudflare 官方 API 连通性
    async function testCfApiToken() {
        initDOMElements();
        const token = (cfCfgToken ? cfCfgToken.value : '').trim();
        if (!token) {
            alert('请先输入 Cloudflare API Token！');
            return;
        }

        if (btnTestCfToken) {
            btnTestCfToken.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在测试...`;
            btnTestCfToken.disabled = true;
        }

        if (cfCfgTestStatus) {
            cfCfgTestStatus.style.display = 'block';
            cfCfgTestStatus.style.background = 'rgba(59, 130, 246, 0.1)';
            cfCfgTestStatus.style.color = 'var(--text-primary)';
            cfCfgTestStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在请求 Cloudflare 官方 API 验证令牌有效性...';
        }

        try {
            const res = await fetch('/api/admin?action=test_cf_api', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAdminHeaders()
                },
                body: JSON.stringify({ cfApiToken: token })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (cfCfgTestStatus) {
                    cfCfgTestStatus.style.background = 'rgba(16, 185, 129, 0.12)';
                    cfCfgTestStatus.style.color = '#10b981';
                    cfCfgTestStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> 令牌验证通过！有效状态: <b>${escapeHTML(data.result?.status || 'active')}</b>，可正常爬取 GraphQL 指标。`;
                }
            } else {
                if (cfCfgTestStatus) {
                    cfCfgTestStatus.style.background = 'rgba(239, 68, 68, 0.12)';
                    cfCfgTestStatus.style.color = '#ef4444';
                    cfCfgTestStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 验证失败: ${escapeHTML((data && data.error) || '口令无效')}`;
                }
            }
        } catch (e) {
            if (cfCfgTestStatus) {
                cfCfgTestStatus.style.background = 'rgba(239, 68, 68, 0.12)';
                cfCfgTestStatus.style.color = '#ef4444';
                cfCfgTestStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 测试异常: ${escapeHTML(e.message)}`;
            }
        } finally {
            if (btnTestCfToken) {
                btnTestCfToken.innerHTML = `<i class="fa-solid fa-bolt"></i> 测试连通性`;
                btnTestCfToken.disabled = false;
            }
        }
    }

    // 保存 Cloudflare API 凭证与云端绑定配置
    async function saveCfConfig() {
        initDOMElements();
        const token = (cfCfgToken ? cfCfgToken.value : '').trim();
        const accountId = (cfCfgAccountId ? cfCfgAccountId.value : '').trim();
        const r2Bucket = (cfCfgR2Bucket ? cfCfgR2Bucket.value : '').trim() || 'protoview-bucket';
        const zoneId = (cfCfgZoneId ? cfCfgZoneId.value : '').trim();

        if (!token) {
            alert('请输入 Cloudflare API Token！');
            return;
        }
        if (!accountId) {
            alert('请输入 Cloudflare Account ID！可在 Cloudflare 仪表盘任一页面右侧栏查看。');
            return;
        }

        const config = {
            cfApiToken: token,
            cfAccountId: accountId,
            cfR2Bucket: r2Bucket,
            cfZoneId: zoneId
        };

        // 1. 本地持久化
        setCfConfig(config);

        // 2. 远端持久化
        try {
            await fetch('/api/admin?action=save_cf_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAdminHeaders()
                },
                body: JSON.stringify(config)
            });
        } catch (e) {
            console.warn('持久化到 KV 失败(可能未配置 KV)，本地已保存:', e);
        }

        closeCfConfigModal();
        showToast('已保存 Cloudflare 配置，正在爬取最新官方流量与请求...', 'success');
        loadAdminStats();
    }

    // 复制 D1 SQL 脚本
    function copyD1Sql() {
        const text = (guideSqlPreview ? guideSqlPreview.innerText : '').trim();
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('已复制 D1 建表 SQL 脚本到剪贴板！', 'success');
            }).catch(() => {
                copyFallback(text);
            });
        } else {
            copyFallback(text);
        }
    }

    function copyFallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('已复制 D1 建表 SQL 脚本！', 'success');
        } catch (e) {
            alert('复制失败，请手动选择复制。');
        }
        document.body.removeChild(ta);
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

        if (btnRefreshAdmin) btnRefreshAdmin.addEventListener('click', loadAdminStats);
        if (btnRecheckBindings) btnRecheckBindings.addEventListener('click', loadAdminStats);
        if (btnCleanSessions) btnCleanSessions.addEventListener('click', cleanExpiredSessions);
        if (btnConfigAdminKey) btnConfigAdminKey.addEventListener('click', openAdminKeyModal);

        // 绑定向导与弹窗
        if (btnOpenCfConfig) btnOpenCfConfig.addEventListener('click', openCfConfigModal);
        if (btnManageCfApi) btnManageCfApi.addEventListener('click', openCfConfigModal);
        if (btnOpenCfApiModalTop) btnOpenCfApiModalTop.addEventListener('click', openCfConfigModal);
        if (btnConfigR2Target) btnConfigR2Target.addEventListener('click', openCfConfigModal);

        if (btnOpenCfGuide) btnOpenCfGuide.addEventListener('click', openCfGuideModal);
        if (btnOpenGuideInline) btnOpenGuideInline.addEventListener('click', openCfGuideModal);
        if (btnViewD1Sql) btnViewD1Sql.addEventListener('click', openCfGuideModal);

        // D1 一键建表
        if (btnInitD1Schema) btnInitD1Schema.addEventListener('click', initD1Schema);

        // API Token 测试与保存
        if (btnTestCfToken) btnTestCfToken.addEventListener('click', testCfApiToken);
        if (cfConfigForm) {
            cfConfigForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveCfConfig();
            });
        }

        // 复制 SQL
        if (btnCopyD1Sql) btnCopyD1Sql.addEventListener('click', copyD1Sql);

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
        initD1Schema,
        openCfConfigModal,
        closeCfConfigModal,
        openCfGuideModal,
        closeCfGuideModal,
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
