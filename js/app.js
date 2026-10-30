document.addEventListener('DOMContentLoaded', async () => {
    // ---------------------- 核心状态与元素绑定 ----------------------
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    
    // 导航
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');

    // 协议管理 DOM
    const protocolList = document.getElementById('protocol-list');
    const btnCreateProtocol = document.getElementById('btn-create-protocol');
    const protocolModal = document.getElementById('protocol-modal');
    const closeModals = document.querySelectorAll('.close-modal, .close-modal-btn');
    const protocolForm = document.getElementById('protocol-form');
    const btnAddFrame = document.getElementById('btn-add-frame');
    const framesContainer = document.getElementById('frames-container');

    // 挂载到全局视图切换函数
    window.switchToView = switchToView;

    // ---------------------- 主题切换 ----------------------
    // 检查本地存储的主题
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

    // ---------------------- 侧边栏折叠与展开 ----------------------
    const mainSidebar = document.getElementById('main-sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

    // 恢复历史折叠偏好
    const savedSidebarCollapsed = localStorage.getItem('protoview_sidebar_collapsed');
    if (savedSidebarCollapsed === 'true' && mainSidebar) {
        mainSidebar.classList.add('collapsed');
    }

    if (btnToggleSidebar && mainSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            mainSidebar.classList.toggle('collapsed');
            const isCollapsed = mainSidebar.classList.contains('collapsed');
            localStorage.setItem('protoview_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        });
    }

    // ---------------------- 视图路由切换 ----------------------
    function switchToView(viewId) {
        navItems.forEach(nav => nav.classList.remove('active'));
        viewSections.forEach(section => section.classList.remove('active'));
        
        const navTarget = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (navTarget) {
            navTarget.classList.add('active');
        } else if (viewId === 'arinc429-view') {
            // ARINC 429 属于协议管理子模块，侧边栏保持高亮「协议管理」
            const protoNav = document.querySelector(`.nav-item[data-view="protocol-view"]`);
            if (protoNav) protoNav.classList.add('active');
        }

        const sectionTarget = document.getElementById(viewId);
        if (sectionTarget) sectionTarget.classList.add('active');

        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            if (viewId === 'arinc429-view') {
                mainContent.classList.add('dense-workbench-active');
            } else {
                mainContent.classList.remove('dense-workbench-active');
            }
        }

        if (viewId === 'protocol-view') {
            loadProtocols();
        } else if (viewId === 'arinc429-view') {
            loadArincProtocolsForSelect();
            if (typeof setMobileArincView === 'function' && window.innerWidth <= 768) {
                setMobileArincView('words');
            }
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetViewId = item.getAttribute('data-view');
            switchToView(targetViewId);
        });
    });

    // ---------------------- 本地工作目录关联与状态管理 ----------------------
    let currentWorkspaceHandle = null;

    const wsLocalStrip = document.getElementById('workspace-local-strip');
    const wsFolderName = document.getElementById('ws-folder-name');
    const wsStatusBadge = document.getElementById('ws-status-badge');
    const btnSetWorkspace = document.getElementById('btn-set-workspace');
    const btnSetWorkspaceText = document.getElementById('btn-set-workspace-text');
    const btnRefreshWorkspace = document.getElementById('btn-refresh-workspace');
    const btnDisconnectWorkspace = document.getElementById('btn-disconnect-workspace');
    const workspaceFolderInput = document.getElementById('workspace-folder-input');

    // ---------------------- Cloudflare 云端工作台与模式切换 ----------------------
    const btnModeLocal = document.getElementById('btn-mode-local');
    const btnModeCloud = document.getElementById('btn-mode-cloud');
    const wsCloudStrip = document.getElementById('workspace-cloud-strip');
    const wsCloudName = document.getElementById('ws-cloud-name');
    const wsCloudStatusBadge = document.getElementById('ws-cloud-status-badge');
    const btnCloudRefresh = document.getElementById('btn-cloud-refresh');
    const btnCloudUploadAll = document.getElementById('btn-cloud-upload-all');
    const btnCloudSettings = document.getElementById('btn-cloud-settings');
    const cloudSettingsModal = document.getElementById('cloud-settings-modal');
    const cloudSettingsForm = document.getElementById('cloud-settings-form');
    const cloudWsIdInput = document.getElementById('cloud-ws-id');
    const cloudWsTokenInput = document.getElementById('cloud-ws-token');
    const btnTestCloudConn = document.getElementById('btn-test-cloud-conn');
    const cloudConnStatus = document.getElementById('cloud-connection-status');

    // 默认工作模式 (在不支持本地文件夹API的移动设备如手机上自动优先启用云端工作台)
    const supportsLocalDir = ('showDirectoryPicker' in window);
    let activeWorkspaceMode = localStorage.getItem('protoview_ws_mode') || (supportsLocalDir ? 'local' : 'cloud');

    function setWorkspaceMode(mode, autoSync = true) {
        activeWorkspaceMode = mode;
        localStorage.setItem('protoview_ws_mode', mode);

        if (mode === 'cloud') {
            if (btnModeLocal) btnModeLocal.classList.remove('active');
            if (btnModeCloud) btnModeCloud.classList.add('active');
            if (wsLocalStrip) wsLocalStrip.style.display = 'none';
            if (wsCloudStrip) wsCloudStrip.style.display = 'flex';
            if (autoSync) syncCloudProtocols(false);
        } else {
            if (btnModeCloud) btnModeCloud.classList.remove('active');
            if (btnModeLocal) btnModeLocal.classList.add('active');
            if (wsCloudStrip) wsCloudStrip.style.display = 'none';
            if (wsLocalStrip) wsLocalStrip.style.display = 'flex';
        }
    }

    if (btnModeLocal) {
        btnModeLocal.addEventListener('click', () => setWorkspaceMode('local'));
    }
    if (btnModeCloud) {
        btnModeCloud.addEventListener('click', () => setWorkspaceMode('cloud', true));
    }

    // Cloudflare API 调用封装
    async function cloudApiCall(endpoint, method = 'GET', body = null) {
        const wsId = (localStorage.getItem('protoview_cloud_ws') || 'default').trim().toLowerCase();
        const token = (localStorage.getItem('protoview_cloud_token') || '').trim();

        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('workspace', wsId);
        if (token) url.searchParams.set('token', token);

        const headers = {
            'x-workspace-id': wsId
        };
        if (token) headers['x-workspace-token'] = token;
        if (body) headers['Content-Type'] = 'application/json;charset=utf-8';

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        try {
            const res = await fetch(url.toString(), options);
            const data = await res.json().catch(() => null);
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            return { ok: false, status: 0, error: err.message };
        }
    }

    // 同步从 Cloudflare 云端拉取协议
    async function syncCloudProtocols(notifyUser = false) {
        const wsId = localStorage.getItem('protoview_cloud_ws') || 'default';
        if (wsCloudName) wsCloudName.textContent = `工作空间: [${wsId}] (正在同步云端...)`;
        if (wsCloudStatusBadge) {
            wsCloudStatusBadge.textContent = '☁️ 正在同步...';
            wsCloudStatusBadge.className = 'ws-status-badge ws-cloud-status';
        }

        const res = await cloudApiCall('/api/protocols', 'GET');

        if (res.ok && res.data && res.data.success) {
            const list = res.data.protocols || [];
            if (wsCloudName) {
                wsCloudName.textContent = `工作空间: [${wsId}] (云端共有 ${list.length} 个协议)`;
            }
            if (wsCloudStatusBadge) {
                wsCloudStatusBadge.textContent = `☁️ 已同步 (${list.length})`;
                wsCloudStatusBadge.style.color = '#10b981';
                wsCloudStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            }

            // 将云端协议逐个拉取完整内容并存入本地 IndexedDB (支持离线极速秒开)
            let loadedCount = 0;
            for (const item of list) {
                if (item._cloudKey) {
                    const detailRes = await cloudApiCall(`/api/protocols?key=${encodeURIComponent(item._cloudKey)}`, 'GET');
                    if (detailRes.ok && detailRes.data) {
                        let proto = detailRes.data;
                        if (typeof proto === 'string') {
                            try { proto = JSON.parse(proto); } catch(e) {}
                        }
                        if (proto && typeof proto === 'object') {
                            proto._fromCloud = true;
                            proto._cloudKey = item._cloudKey;
                            proto._cloudWorkspace = wsId;
                            if (!proto.name) proto.name = item.name || '未命名协议';
                            if (!proto.type) proto.type = item.type || 'ARINC429';

                            const localAll = await dbHelper.getAllProtocols();
                            const existing = localAll.find(p => p._cloudKey === item._cloudKey || (p.name === proto.name && p.type === proto.type));
                            if (existing) {
                                proto.id = existing.id;
                            } else {
                                delete proto.id;
                            }
                            if (proto.product) {
                                await dbHelper.saveProduct({ name: proto.product });
                            }
                            await dbHelper.saveProtocol(proto);
                            loadedCount++;
                        }
                    }
                }
            }

            await loadProtocols();
            await loadArincProtocolsForSelect();

            if (notifyUser) {
                alert(`已成功同步 Cloudflare 云端工作台 [${wsId}]！\n\n共拉取并同步 ${loadedCount} 个通信协议。在手机或电脑任意一端修改并保存，另一端点击刷新即可立即看到最新数据！`);
            }
        } else {
            // 异常或本地离线模式处理
            if (res.status === 503) {
                if (wsCloudStatusBadge) wsCloudStatusBadge.textContent = '⚠️ KV 待绑定';
                if (wsCloudName) wsCloudName.textContent = `工作空间: [${wsId}] (Cloudflare KV 命名空间尚未绑定)`;
                if (notifyUser) {
                    alert(`云端接口连接成功，但 Cloudflare KV 数据库尚未绑定！\n\n请前往 Cloudflare 仪表盘 -> 您的 Pages 项目 -> 设置 -> 函数 (Functions) -> 绑定 KV 命名空间（变量名填 PROTOVIEW_KV）。`);
                }
            } else if (res.status === 401) {
                if (wsCloudStatusBadge) wsCloudStatusBadge.textContent = '🔒 口令错误';
                if (wsCloudName) wsCloudName.textContent = `工作空间: [${wsId}] (访问口令未授权)`;
                if (notifyUser) {
                    alert(`访问口令错误！请点击右侧「空间与口令」输入正确的访问口令。`);
                }
            } else {
                if (wsCloudStatusBadge) wsCloudStatusBadge.textContent = '💻 本地开发环境';
                if (wsCloudName) wsCloudName.textContent = `工作空间: [${wsId}] (本地预览模式，部署到 Cloudflare Pages 后将自动激活云端存储)`;
                if (notifyUser) {
                    alert(`检测到当前处于本地运行环境，/api/protocols 后端网关尚未运行。\n\n当您将代码部署到 Cloudflare Pages 后，该功能将自动激活为全球分布式云端数据库！当前数据已安全保存在本地浏览器中。`);
                }
            }
        }
    }

    // 本地全部协议一键上传至云端工作台
    async function uploadAllLocalProtocolsToCloud() {
        const localAll = await dbHelper.getAllProtocols();
        if (!localAll || localAll.length === 0) {
            alert("本地暂无任何协议可上传！");
            return;
        }

        const wsId = localStorage.getItem('protoview_cloud_ws') || 'default';
        if (!confirm(`确定要将本地所有 ${localAll.length} 个协议一键上传到 Cloudflare 云端工作空间 [${wsId}] 吗？\n\n上传后，手机打开该网页将立刻看到这些协议！`)) {
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const p of localAll) {
            const res = await cloudApiCall('/api/protocols', 'POST', p);
            if (res.ok && res.data && res.data.success) {
                p._fromCloud = true;
                p._cloudKey = res.data.key;
                p._cloudWorkspace = wsId;
                await dbHelper.saveProtocol(p);
                successCount++;
            } else {
                failCount++;
            }
        }

        if (successCount > 0) {
            alert(`上传成功！已将 ${successCount} 个协议同步到 Cloudflare 云端工作台！\n现在使用手机打开您的网址，即可查看这些协议。`);
            await syncCloudProtocols(false);
        } else {
            alert(`上传失败！请检查 Cloudflare KV 是否已正确绑定，或点击「空间与口令」测试网络连接。`);
        }
    }

    if (btnCloudRefresh) {
        btnCloudRefresh.addEventListener('click', () => syncCloudProtocols(true));
    }
    if (btnCloudUploadAll) {
        btnCloudUploadAll.addEventListener('click', () => {
            if (typeof openSyncHubModal === 'function') {
                openSyncHubModal();
            } else {
                uploadAllLocalProtocolsToCloud();
            }
        });
    }

    // ========================================================
    // 硬盘与云端协议同步中心 (Sync Hub Controller)
    // ========================================================
    const syncHubModal = document.getElementById('sync-hub-modal');
    const btnOpenSyncHubs = document.querySelectorAll('.btn-open-sync-hub');
    const syncDirCards = document.querySelectorAll('.sync-dir-card');
    const syncFlowArrow = document.getElementById('sync-flow-arrow');
    const syncLocalName = document.getElementById('sync-local-name');
    const syncLocalCountBadge = document.getElementById('sync-local-count-badge');
    const syncBtnPickDir = document.getElementById('sync-btn-pick-dir');
    const syncCloudName = document.getElementById('sync-cloud-name');
    const syncCloudCountBadge = document.getElementById('sync-cloud-count-badge');
    const syncBtnRefreshCloud = document.getElementById('sync-btn-refresh-cloud');
    const btnStartSyncExecute = document.getElementById('btn-start-sync-execute');
    const syncProgressArea = document.getElementById('sync-progress-area');
    const syncProgressBar = document.getElementById('sync-progress-bar');
    const syncProgressStatus = document.getElementById('sync-progress-status');
    const syncMetricsGrid = document.getElementById('sync-metrics-grid');
    const metricUpload = document.getElementById('metric-upload');
    const metricDownload = document.getElementById('metric-download');
    const metricSkip = document.getElementById('metric-skip');
    const metricFail = document.getElementById('metric-fail');
    const syncOptNewer = document.getElementById('sync-opt-newer');

    let currentSyncDirection = 'disk-to-cloud';
    let isSyncRunning = false;

    // 刷新两端状态（本地目录文件数与云端协议数）
    async function refreshSyncHubStatus() {
        // 1. 本地硬盘目录状态
        if (currentWorkspaceHandle) {
            try {
                let perm = await currentWorkspaceHandle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    let localCount = 0;
                    for await (const entry of currentWorkspaceHandle.values()) {
                        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
                            localCount++;
                        }
                    }
                    if (syncLocalName) syncLocalName.textContent = currentWorkspaceHandle.name;
                    if (syncLocalCountBadge) syncLocalCountBadge.textContent = `${localCount} 个协议文件`;
                    if (syncBtnPickDir) {
                        syncBtnPickDir.style.display = 'inline-flex';
                        syncBtnPickDir.innerHTML = '<i class="fa-solid fa-folder-open"></i> 更换目录';
                    }
                } else {
                    if (syncLocalName) syncLocalName.textContent = currentWorkspaceHandle.name + ' (待授权)';
                    if (syncLocalCountBadge) syncLocalCountBadge.textContent = '权限受限';
                    if (syncBtnPickDir) {
                        syncBtnPickDir.style.display = 'inline-flex';
                        syncBtnPickDir.innerHTML = '<i class="fa-solid fa-key"></i> 点击授权';
                    }
                }
            } catch (e) {
                if (syncLocalName) syncLocalName.textContent = currentWorkspaceHandle.name;
            }
        } else {
            if (syncLocalName) syncLocalName.textContent = '未关联电脑目录';
            if (syncLocalCountBadge) syncLocalCountBadge.textContent = '0 个文件';
            if (syncBtnPickDir) {
                syncBtnPickDir.style.display = 'inline-flex';
                syncBtnPickDir.innerHTML = '<i class="fa-solid fa-folder-open"></i> 选择目录';
            }
        }

        // 2. Cloudflare 云端状态
        const wsId = localStorage.getItem('protoview_cloud_ws') || 'default';
        if (syncCloudName) syncCloudName.textContent = `工作空间: [${wsId}]`;
        if (syncCloudCountBadge) syncCloudCountBadge.textContent = '正在获取...';

        try {
            const res = await cloudApiCall('/api/protocols', 'GET');
            if (res.ok && res.data && res.data.success) {
                const count = (res.data.protocols || []).length;
                if (syncCloudCountBadge) syncCloudCountBadge.textContent = `${count} 个云端协议`;
            } else if (res.status === 503) {
                if (syncCloudCountBadge) syncCloudCountBadge.textContent = '⚠️ KV待绑定';
            } else if (res.status === 401) {
                if (syncCloudCountBadge) syncCloudCountBadge.textContent = '🔒 口令错误';
            } else {
                if (syncCloudCountBadge) syncCloudCountBadge.textContent = '离线 / 本地模式';
            }
        } catch (e) {
            if (syncCloudCountBadge) syncCloudCountBadge.textContent = '连接异常';
        }
    }

    // 打开同步中心模态框
    function openSyncHubModal() {
        if (!syncHubModal) return;
        if (syncProgressArea) syncProgressArea.style.display = 'none';
        if (syncMetricsGrid) syncMetricsGrid.style.display = 'none';
        refreshSyncHubStatus();
        syncHubModal.classList.add('active');
    }

    // 绑定所有触发按钮
    btnOpenSyncHubs.forEach(btn => {
        btn.addEventListener('click', openSyncHubModal);
    });

    // 弹窗内快捷选择本地目录
    if (syncBtnPickDir) {
        syncBtnPickDir.addEventListener('click', async () => {
            await chooseWorkspaceDirectory();
            await refreshSyncHubStatus();
        });
    }

    // 弹窗内刷新云端状态
    if (syncBtnRefreshCloud) {
        syncBtnRefreshCloud.addEventListener('click', async () => {
            syncBtnRefreshCloud.disabled = true;
            syncBtnRefreshCloud.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            await refreshSyncHubStatus();
            setTimeout(() => {
                syncBtnRefreshCloud.disabled = false;
                syncBtnRefreshCloud.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 刷新';
            }, 500);
        });
    }

    // 切换同步方向卡片
    function setSyncDirection(dir) {
        currentSyncDirection = dir;
        syncDirCards.forEach(card => {
            const isMatch = (card.getAttribute('data-dir') === dir);
            card.classList.toggle('active', isMatch);
            const radioIcon = card.querySelector('.sync-dir-radio i');
            if (radioIcon) {
                radioIcon.className = isMatch ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle';
            }
            const input = card.querySelector('input[type="radio"]');
            if (input) input.checked = isMatch;
        });

        if (syncFlowArrow) {
            if (dir === 'disk-to-cloud') {
                syncFlowArrow.className = 'fa-solid fa-arrow-right';
                syncFlowArrow.style.color = '#10b981';
            } else if (dir === 'cloud-to-disk') {
                syncFlowArrow.className = 'fa-solid fa-arrow-left';
                syncFlowArrow.style.color = '#3b82f6';
            } else {
                syncFlowArrow.className = 'fa-solid fa-arrows-rotate';
                syncFlowArrow.style.color = '#a855f7';
            }
        }
    }

    syncDirCards.forEach(card => {
        card.addEventListener('click', () => {
            const dir = card.getAttribute('data-dir');
            if (dir) setSyncDirection(dir);
        });
    });

    // 执行同步主函数
    async function executeSyncDirection() {
        if (isSyncRunning) return;

        // 检查本地目录连接
        if (!currentWorkspaceHandle) {
            if (window.showDirectoryPicker) {
                const wantConnect = confirm("尚未关联电脑本地硬盘目录！\n\n是否立即选择您电脑上的协议文件夹作为工作目录？");
                if (wantConnect) {
                    await chooseWorkspaceDirectory();
                    await refreshSyncHubStatus();
                    if (!currentWorkspaceHandle) return;
                } else {
                    return;
                }
            } else {
                alert("当前环境不支持直接访问本地硬盘文件夹。\n\n在手机等设备上，您的协议已保存在云端。回到电脑浏览器打开网页，即可一键将云端协议同步到电脑本地硬盘！");
                return;
            }
        }

        // 校验权限
        try {
            let perm = await currentWorkspaceHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                perm = await currentWorkspaceHandle.requestPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    alert("未获得本地硬盘目录的写入授权，无法执行同步！");
                    return;
                }
            }
        } catch(e) {
            alert("本地目录访问权限检查异常: " + e.message);
            return;
        }

        isSyncRunning = true;
        btnStartSyncExecute.disabled = true;
        btnStartSyncExecute.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 同步执行中...';
        syncProgressArea.style.display = 'block';
        syncProgressBar.style.width = '5%';
        syncProgressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在读取本地与云端两端协议索引...';
        syncMetricsGrid.style.display = 'grid';

        let uploadCount = 0;
        let downloadCount = 0;
        let skipCount = 0;
        let failCount = 0;

        const updateMetricsUI = () => {
            if (metricUpload) metricUpload.textContent = uploadCount;
            if (metricDownload) metricDownload.textContent = downloadCount;
            if (metricSkip) metricSkip.textContent = skipCount;
            if (metricFail) metricFail.textContent = failCount;
        };
        updateMetricsUI();

        const onlyNewer = syncOptNewer ? syncOptNewer.checked : true;

        try {
            // 1. 扫描读取本地硬盘目录中的所有 .json 文件
            syncProgressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在扫描本地硬盘目录中的 .json 协议文件...';
            const localProtocolsMap = new Map(); // key -> { fileName, proto, mtime }
            for await (const entry of currentWorkspaceHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
                    try {
                        const file = await entry.getFile();
                        const text = await file.text();
                        const parsed = JSON.parse(text);
                        if (parsed && (parsed.words || parsed.frames || parsed.type || parsed.name)) {
                            parsed._fileName = entry.name;
                            const mtime = file.lastModified || parsed.updateTime || 0;
                            const matchKey = (parsed.name || entry.name.replace(/\.json$/i, '')).trim();
                            localProtocolsMap.set(matchKey, {
                                fileName: entry.name,
                                proto: parsed,
                                mtime: mtime
                            });
                        }
                    } catch(e) {
                        console.warn("读取本地文件失败:", entry.name, e);
                    }
                }
            }

            syncProgressBar.style.width = '25%';

            // 2. 读取 Cloudflare 云端工作空间协议清单与详情
            syncProgressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在从 Cloudflare 云端获取协议清单...';
            const cloudProtocolsMap = new Map(); // key -> { itemMeta, proto, mtime }
            const cloudListRes = await cloudApiCall('/api/protocols', 'GET');
            if (cloudListRes.ok && cloudListRes.data && cloudListRes.data.success) {
                const cloudList = cloudListRes.data.protocols || [];
                let cIndex = 0;
                for (const item of cloudList) {
                    cIndex++;
                    syncProgressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在读取云端协议详情 (${cIndex}/${cloudList.length}): ${item.name}...`;
                    if (item._cloudKey) {
                        const detailRes = await cloudApiCall(`/api/protocols?key=${encodeURIComponent(item._cloudKey)}`, 'GET');
                        if (detailRes.ok && detailRes.data) {
                            let proto = detailRes.data;
                            if (typeof proto === 'string') {
                                try { proto = JSON.parse(proto); } catch(e){}
                            }
                            if (proto && typeof proto === 'object') {
                                const mtime = proto.updateTime || proto._cloudUpdated || item.updateTime || 0;
                                const matchKey = (proto.name || item.name || '').trim();
                                cloudProtocolsMap.set(matchKey, {
                                    cloudKey: item._cloudKey,
                                    proto: proto,
                                    mtime: mtime
                                });
                            }
                        }
                    }
                }
            } else if (currentSyncDirection !== 'disk-to-cloud') {
                throw new Error(cloudListRes.data?.error || `无法连接云端工作空间 (状态: ${cloudListRes.status})`);
            }

            syncProgressBar.style.width = '50%';

            // 3. 按选定方向执行传输与写入
            if (currentSyncDirection === 'disk-to-cloud') {
                // 硬盘 ➔ 云端
                const total = localProtocolsMap.size;
                let current = 0;
                if (total === 0) {
                    syncProgressStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;"></i> 本地硬盘目录中未找到任何 .json 协议文件！';
                } else {
                    for (const [key, localItem] of localProtocolsMap.entries()) {
                        current++;
                        const pct = 50 + Math.round((current / total) * 45);
                        syncProgressBar.style.width = `${pct}%`;
                        syncProgressStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 正在上传 (${current}/${total}): ${localItem.fileName}...`;

                        const cloudItem = cloudProtocolsMap.get(key);
                        if (onlyNewer && cloudItem && cloudItem.mtime > localItem.mtime) {
                            skipCount++;
                        } else {
                            const toUpload = JSON.parse(JSON.stringify(localItem.proto));
                            toUpload.updateTime = localItem.mtime || Date.now();
                            const res = await cloudApiCall('/api/protocols', 'POST', toUpload);
                            if (res.ok && res.data && res.data.success) {
                                uploadCount++;
                            } else {
                                failCount++;
                            }
                        }
                        updateMetricsUI();
                    }
                }
            } else if (currentSyncDirection === 'cloud-to-disk') {
                // 云端 ➔ 硬盘
                const total = cloudProtocolsMap.size;
                let current = 0;
                if (total === 0) {
                    syncProgressStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;"></i> 云端工作台中暂无协议数据！';
                } else {
                    for (const [key, cloudItem] of cloudProtocolsMap.entries()) {
                        current++;
                        const pct = 50 + Math.round((current / total) * 45);
                        syncProgressBar.style.width = `${pct}%`;
                        syncProgressStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> 正在落盘 (${current}/${total}): ${cloudItem.proto.name || key}...`;

                        const localItem = localProtocolsMap.get(key);
                        if (onlyNewer && localItem && localItem.mtime > cloudItem.mtime) {
                            skipCount++;
                        } else {
                            try {
                                const protoToWrite = JSON.parse(JSON.stringify(cloudItem.proto));
                                delete protoToWrite.id;
                                const safeName = (protoToWrite.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                                const fileName = localItem ? localItem.fileName : `${safeName}.json`;
                                protoToWrite._fileName = fileName;
                                protoToWrite._fromWorkspace = true;

                                const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                                const writable = await fileHandle.createWritable();
                                await writable.write(JSON.stringify(protoToWrite, null, 2));
                                await writable.close();
                                downloadCount++;
                            } catch (writeErr) {
                                console.error("落盘文件失败:", key, writeErr);
                                failCount++;
                            }
                        }
                        updateMetricsUI();
                    }
                }
            } else {
                // 双向智能合并同步
                const allKeys = new Set([...localProtocolsMap.keys(), ...cloudProtocolsMap.keys()]);
                const total = allKeys.size;
                let current = 0;

                for (const key of allKeys) {
                    current++;
                    const pct = 50 + Math.round((current / total) * 45);
                    syncProgressBar.style.width = `${pct}%`;

                    const localItem = localProtocolsMap.get(key);
                    const cloudItem = cloudProtocolsMap.get(key);

                    if (localItem && !cloudItem) {
                        // 本地有，云端无 ➔ 上传
                        syncProgressStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 本地独有，上传至云端: ${localItem.fileName}...`;
                        const toUpload = JSON.parse(JSON.stringify(localItem.proto));
                        toUpload.updateTime = localItem.mtime || Date.now();
                        const res = await cloudApiCall('/api/protocols', 'POST', toUpload);
                        if (res.ok && res.data && res.data.success) {
                            uploadCount++;
                        } else {
                            failCount++;
                        }
                    } else if (!localItem && cloudItem) {
                        // 云端有，本地无 ➔ 下载落盘
                        syncProgressStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> 云端独有，下载落盘: ${cloudItem.proto.name || key}...`;
                        try {
                            const protoToWrite = JSON.parse(JSON.stringify(cloudItem.proto));
                            delete protoToWrite.id;
                            const safeName = (protoToWrite.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                            const fileName = `${safeName}.json`;
                            protoToWrite._fileName = fileName;
                            protoToWrite._fromWorkspace = true;

                            const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(JSON.stringify(protoToWrite, null, 2));
                            await writable.close();
                            downloadCount++;
                        } catch(e) {
                            failCount++;
                        }
                    } else if (localItem && cloudItem) {
                        // 两端均存在 ➔ 比较时间戳
                        const diffMs = Math.abs(localItem.mtime - cloudItem.mtime);
                        if (diffMs < 2000) {
                            skipCount++;
                        } else if (localItem.mtime > cloudItem.mtime) {
                            syncProgressStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 本地版本更新，同步到云端: ${localItem.fileName}...`;
                            const toUpload = JSON.parse(JSON.stringify(localItem.proto));
                            toUpload.updateTime = localItem.mtime;
                            const res = await cloudApiCall('/api/protocols', 'POST', toUpload);
                            if (res.ok && res.data && res.data.success) {
                                uploadCount++;
                            } else {
                                failCount++;
                            }
                        } else {
                            syncProgressStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> 云端版本更新，落盘覆盖本地: ${cloudItem.proto.name}...`;
                            try {
                                const protoToWrite = JSON.parse(JSON.stringify(cloudItem.proto));
                                delete protoToWrite.id;
                                const fileName = localItem.fileName;
                                protoToWrite._fileName = fileName;
                                protoToWrite._fromWorkspace = true;

                                const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                                const writable = await fileHandle.createWritable();
                                await writable.write(JSON.stringify(protoToWrite, null, 2));
                                await writable.close();
                                downloadCount++;
                            } catch(e) {
                                failCount++;
                            }
                        }
                    }
                    updateMetricsUI();
                }
            }

            syncProgressBar.style.width = '100%';
            syncProgressStatus.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> 同步完成！共上传 ${uploadCount} 个，落盘 ${downloadCount} 个，保持最新 ${skipCount} 个。`;

            // 4. 全局自动刷新
            await scanAndSyncWorkspaceFiles(currentWorkspaceHandle, false);
            await syncCloudProtocols(false);
            await loadProtocols();
            await loadArincProtocolsForSelect();
            await refreshSyncHubStatus();

        } catch (err) {
            console.error("同步执行异常:", err);
            syncProgressStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> 同步中断: ${err.message}`;
            alert("同步执行发生异常: " + err.message);
        } finally {
            isSyncRunning = false;
            btnStartSyncExecute.disabled = false;
            btnStartSyncExecute.innerHTML = '<i class="fa-solid fa-play"></i> 重新同步';
        }
    }

    if (btnStartSyncExecute) {
        btnStartSyncExecute.addEventListener('click', executeSyncDirection);
    }
    if (btnCloudSettings) {
        btnCloudSettings.addEventListener('click', () => {
            if (cloudWsIdInput) cloudWsIdInput.value = localStorage.getItem('protoview_cloud_ws') || 'default';
            if (cloudWsTokenInput) cloudWsTokenInput.value = localStorage.getItem('protoview_cloud_token') || '';
            if (cloudConnStatus) cloudConnStatus.style.display = 'none';
            if (cloudSettingsModal) cloudSettingsModal.classList.add('active');
        });
    }

    if (btnTestCloudConn) {
        btnTestCloudConn.addEventListener('click', async () => {
            if (cloudConnStatus) {
                cloudConnStatus.style.display = 'block';
                cloudConnStatus.style.padding = '10px 14px';
                cloudConnStatus.style.borderRadius = '6px';
                cloudConnStatus.style.fontSize = '12.5px';
                cloudConnStatus.style.border = '1px solid var(--border-color)';
                cloudConnStatus.style.background = 'rgba(0,0,0,0.03)';
                cloudConnStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在连接 Cloudflare 云端接口...';
                cloudConnStatus.style.color = 'var(--text-secondary)';
            }
            const res = await cloudApiCall('/api/protocols', 'GET');
            if (res.ok) {
                cloudConnStatus.innerHTML = `<i class="fa-solid fa-check" style="color:#10b981;"></i> 连接成功！云端 KV 数据库状态正常，当前空间协议数: <strong>${res.data?.count || 0}</strong>`;
                cloudConnStatus.style.color = '#10b981';
                cloudConnStatus.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                cloudConnStatus.style.background = 'rgba(16, 185, 129, 0.08)';
            } else if (res.status === 503) {
                cloudConnStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> 接口可连通，但 Cloudflare KV 尚未绑定 (请在 Pages 设置中绑定 PROTOVIEW_KV)`;
                cloudConnStatus.style.color = '#f59e0b';
                cloudConnStatus.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                cloudConnStatus.style.background = 'rgba(245, 158, 11, 0.08)';
            } else if (res.status === 401) {
                cloudConnStatus.innerHTML = `<i class="fa-solid fa-lock" style="color:#ef4444;"></i> 口令验证失败，请检查访问私密口令`;
                cloudConnStatus.style.color = '#ef4444';
                cloudConnStatus.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                cloudConnStatus.style.background = 'rgba(239, 68, 68, 0.08)';
            } else {
                cloudConnStatus.innerHTML = `<i class="fa-solid fa-info-circle" style="color:var(--text-secondary);"></i> 当前处于本地开发环境 (状态: ${res.status || '离线'})，推送到 Cloudflare 后将自动连通。`;
                cloudConnStatus.style.color = 'var(--text-secondary)';
                cloudConnStatus.style.borderColor = 'var(--border-color)';
                cloudConnStatus.style.background = 'rgba(0,0,0,0.03)';
            }
        });
    }

    if (cloudSettingsForm) {
        cloudSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const newWs = (cloudWsIdInput ? cloudWsIdInput.value.trim() : '') || 'default';
            const newToken = cloudWsTokenInput ? cloudWsTokenInput.value.trim() : '';

            localStorage.setItem('protoview_cloud_ws', newWs);
            localStorage.setItem('protoview_cloud_token', newToken);

            if (cloudSettingsModal) cloudSettingsModal.classList.remove('active');
            syncCloudProtocols(true);
        });
    }

    // IndexedDB 用于持久化存储 DirectoryHandle (浏览器原生跨刷新与重启保持句柄)
    function getWorkspaceHandleDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('ProtoViewWorkspaceDB', 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore('handles');
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveWorkspaceHandleToDB(handle) {
        try {
            const db = await getWorkspaceHandleDB();
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'activeWorkspace');
            return new Promise(r => { tx.oncomplete = r; });
        } catch (e) {
            console.warn("ProtoView: 保存工作目录句柄异常:", e);
        }
    }

    async function getStoredWorkspaceHandleFromDB() {
        try {
            const db = await getWorkspaceHandleDB();
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('activeWorkspace');
            return new Promise((resolve) => {
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async function clearStoredWorkspaceHandleFromDB() {
        try {
            const db = await getWorkspaceHandleDB();
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').delete('activeWorkspace');
            return new Promise(r => { tx.oncomplete = r; });
        } catch (e) {
            console.warn("ProtoView: 清理工作目录句柄异常:", e);
        }
    }

    function updateWorkspaceUI(connected, folderName = '', badgeText = '') {
        if (!wsLocalStrip) return;
        if (connected) {
            wsLocalStrip.classList.add('connected');
            if (wsFolderName) {
                wsFolderName.textContent = folderName || '本地工作目录';
                wsFolderName.title = `已关联本地硬盘目录: ${folderName}`;
            }
            if (wsStatusBadge) {
                wsStatusBadge.textContent = badgeText || '已连接本地目录';
            }
            if (btnSetWorkspaceText) {
                btnSetWorkspaceText.textContent = '更换目录';
            }
            if (btnRefreshWorkspace) btnRefreshWorkspace.style.display = 'inline-flex';
            if (btnDisconnectWorkspace) btnDisconnectWorkspace.style.display = 'inline-flex';
        } else {
            wsLocalStrip.classList.remove('connected');
            if (wsFolderName) {
                wsFolderName.textContent = '未关联本地目录 (当前仅保存在浏览器内部)';
                wsFolderName.title = '未关联本地工作目录';
            }
            if (wsStatusBadge) {
                wsStatusBadge.textContent = '浏览器内部';
            }
            if (btnSetWorkspaceText) {
                btnSetWorkspaceText.textContent = '设置本地目录';
            }
            if (btnRefreshWorkspace) btnRefreshWorkspace.style.display = 'none';
            if (btnDisconnectWorkspace) btnDisconnectWorkspace.style.display = 'none';
        }
    }

    // 选择本地工作目录
    async function chooseWorkspaceDirectory() {
        if (window.showDirectoryPicker) {
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                if (!dirHandle) return;
                currentWorkspaceHandle = dirHandle;
                await saveWorkspaceHandleToDB(dirHandle);
                localStorage.setItem('protoview_workspace_name', dirHandle.name);
                updateWorkspaceUI(true, dirHandle.name, '已连接本地目录');
                await scanAndSyncWorkspaceFiles(dirHandle, true);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("选择工作目录失败:", err);
                    alert("选择工作目录异常: " + err.message);
                }
            }
        } else if (workspaceFolderInput) {
            workspaceFolderInput.click();
        } else {
            alert("当前浏览器环境不支持文件夹读写 API，推荐使用 Chrome 或 Edge 浏览器以获得完整桌面软件体验。");
        }
    }

    // 扫描工作目录中的所有 .json 协议文件并同步入库
    async function scanAndSyncWorkspaceFiles(dirHandle, notifyUser = false) {
        if (!dirHandle) return;
        let loadedCount = 0;
        try {
            const existingProtocols = await dbHelper.getAllProtocols();
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
                    try {
                        const file = await entry.getFile();
                        const text = await file.text();
                        const parsed = JSON.parse(text);
                        if (parsed && (parsed.words || parsed.frames || parsed.type || parsed.name)) {
                            parsed._fileName = entry.name;
                            parsed._fromWorkspace = true;

                            const existing = existingProtocols.find(p => p._fileName === entry.name || (p.name === parsed.name && p.type === parsed.type));
                            if (existing) {
                                parsed.id = existing.id;
                            } else {
                                delete parsed.id;
                            }
                            if (parsed.product) {
                                await dbHelper.saveProduct({ name: parsed.product });
                            }
                            await dbHelper.saveProtocol(parsed);
                            loadedCount++;
                        }
                    } catch (fileErr) {
                        console.warn(`读取工作目录文件 [${entry.name}] 失败:`, fileErr);
                    }
                }
            }
            await loadProtocols();
            await loadArincProtocolsForSelect();

            if (notifyUser) {
                if (loadedCount > 0) {
                    alert(`已成功关联工作目录「${dirHandle.name}」！\n\n共自动扫描读取 ${loadedCount} 个协议文件，已展示在协议管理列表中。\n您在工作台中对协议所做的任何修改，点击「保存」时均会自动同步写回本地磁盘文件！`);
                } else {
                    alert(`已成功关联工作目录「${dirHandle.name}」！\n\n该目录下目前暂无 .json 协议文件。当您在系统中新建或编辑协议时，将自动为您在本地该文件夹中创建对应的 .json 文件。`);
                }
            }
        } catch (scanErr) {
            console.error("扫描工作目录异常:", scanErr);
        }
    }

    // 刷新工作目录
    async function refreshWorkspaceDirectory() {
        if (!currentWorkspaceHandle) return;
        try {
            let perm = await currentWorkspaceHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                perm = await currentWorkspaceHandle.requestPermission({ mode: 'readwrite' });
            }
            if (perm === 'granted') {
                await scanAndSyncWorkspaceFiles(currentWorkspaceHandle, true);
            } else {
                alert("未获取到工作目录访问授权，无法刷新！");
            }
        } catch (err) {
            console.error("刷新工作目录失败:", err);
            alert("刷新失败: " + err.message);
        }
    }

    // 断开工作目录
    async function disconnectWorkspaceDirectory() {
        if (confirm("确定要断开本地工作目录关联吗？\n\n断开后，系统不会删除您电脑硬盘上的物理文件。")) {
            currentWorkspaceHandle = null;
            await clearStoredWorkspaceHandleFromDB();
            localStorage.removeItem('protoview_workspace_name');
            updateWorkspaceUI(false);
            await loadProtocols();
        }
    }

    // 尝试在启动时自动恢复工作目录
    async function tryRestoreWorkspaceDirectory() {
        try {
            const storedHandle = await getStoredWorkspaceHandleFromDB();
            if (storedHandle) {
                const savedName = localStorage.getItem('protoview_workspace_name') || storedHandle.name;
                const perm = await storedHandle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    currentWorkspaceHandle = storedHandle;
                    updateWorkspaceUI(true, savedName, '已连接本地目录');
                    await scanAndSyncWorkspaceFiles(storedHandle, false);
                } else {
                    currentWorkspaceHandle = storedHandle;
                    updateWorkspaceUI(true, savedName, '待点击授权');
                    if (btnSetWorkspaceText) btnSetWorkspaceText.textContent = '授权访问';
                }
            }
        } catch (e) {
            console.warn("恢复工作目录句柄失败:", e);
        }
    }

    if (btnSetWorkspace) {
        btnSetWorkspace.addEventListener('click', async () => {
            if (currentWorkspaceHandle) {
                const perm = await currentWorkspaceHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    const req = await currentWorkspaceHandle.requestPermission({ mode: 'readwrite' });
                    if (req === 'granted') {
                        updateWorkspaceUI(true, currentWorkspaceHandle.name, '已连接本地目录');
                        await scanAndSyncWorkspaceFiles(currentWorkspaceHandle, true);
                        return;
                    }
                }
            }
            chooseWorkspaceDirectory();
        });
    }

    if (btnRefreshWorkspace) {
        btnRefreshWorkspace.addEventListener('click', () => {
            refreshWorkspaceDirectory();
        });
    }

    if (btnDisconnectWorkspace) {
        btnDisconnectWorkspace.addEventListener('click', () => {
            disconnectWorkspaceDirectory();
        });
    }

    if (workspaceFolderInput) {
        workspaceFolderInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json'));
            if (jsonFiles.length === 0) {
                alert("所选文件夹中未找到任何 .json 协议文件！");
                return;
            }
            let dirName = '本地文件夹';
            if (jsonFiles[0].webkitRelativePath) {
                dirName = jsonFiles[0].webkitRelativePath.split('/')[0];
            }
            let count = 0;
            const existingProtocols = await dbHelper.getAllProtocols();
            for (const file of jsonFiles) {
                try {
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    if (parsed && (parsed.words || parsed.frames || parsed.type || parsed.name)) {
                        parsed._fileName = file.name;
                        parsed._fromWorkspace = true;
                        const existing = existingProtocols.find(p => p._fileName === file.name || (p.name === parsed.name && p.type === parsed.type));
                        if (existing) {
                            parsed.id = existing.id;
                        } else {
                            delete parsed.id;
                        }
                        if (parsed.product) {
                            await dbHelper.saveProduct({ name: parsed.product });
                        }
                        await dbHelper.saveProtocol(parsed);
                        count++;
                    }
                } catch (err) {
                    console.warn("解析文件失败:", file.name, err);
                }
            }
            updateWorkspaceUI(true, dirName, '本地导入');
            await loadProtocols();
            await loadArincProtocolsForSelect();
            alert(`成功从文件夹「${dirName}」载入 ${count} 个协议文件！`);
            e.target.value = '';
        });
    }

    // ---------------------- 协议列表事件委托 ----------------------
    if (protocolList) {
        protocolList.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const id = Number(btn.getAttribute('data-id'));
            if (action === 'edit' && window.editProtocol) {
                window.editProtocol(id);
            } else if (action === 'props') {
                const p = await dbHelper.getProtocol(id);
                if (p && typeof openProps429Modal === 'function') {
                    openProps429Modal(p);
                }
            } else if (action === 'delete' && window.deleteProtocol) {
                window.deleteProtocol(id);
            }
        });
    }

    // ---------------------- 产品管理与视图过滤 DOM ----------------------
    const btnCreateProduct = document.getElementById('btn-create-product');
    const productManageModal = document.getElementById('product-manage-modal');
    const productManageForm = document.getElementById('product-manage-form');
    const productModalTitle = document.getElementById('product-modal-title');
    const productManageOriginalName = document.getElementById('product-manage-original-name');
    const productManageName = document.getElementById('product-manage-name');
    const productManageCode = document.getElementById('product-manage-code');
    const productManageDesc = document.getElementById('product-manage-desc');
    const productDatalist = document.getElementById('product-datalist');
    const productTabsContainer = document.getElementById('product-tabs-container');
    const productProtoSearch = document.getElementById('product-proto-search');
    const btnClearProductSearch = document.getElementById('btn-clear-product-search');

    const create429Product = document.getElementById('create-429-product');
    const props429Product = document.getElementById('props-429-product');
    const protocolProduct = document.getElementById('protocol-product');

    const btnToggleCollapseAll = document.getElementById('btn-toggle-collapse-all');
    const iconCollapseAll = document.getElementById('icon-collapse-all');
    const btnCollapseAllText = document.getElementById('btn-collapse-all-text');

    let activeProductFilter = 'all';
    let productSearchQuery = '';

    // 产品卡片折叠记忆 (保存在 localStorage)
    let collapsedProducts = new Set();
    try {
        const savedCollapsed = localStorage.getItem('protoview_collapsed_products');
        if (savedCollapsed) {
            collapsedProducts = new Set(JSON.parse(savedCollapsed));
        }
    } catch (e) {
        collapsedProducts = new Set();
    }

    function saveCollapsedProductsState() {
        try {
            localStorage.setItem('protoview_collapsed_products', JSON.stringify(Array.from(collapsedProducts)));
        } catch (e) {
            console.warn("保存产品折叠状态失败:", e);
        }
    }

    function updateCollapseAllButtonState() {
        if (!btnToggleCollapseAll || !btnCollapseAllText || !iconCollapseAll) return;
        const allCards = document.querySelectorAll('.product-group-card');
        if (allCards.length === 0) {
            btnToggleCollapseAll.style.display = 'none';
            return;
        }
        btnToggleCollapseAll.style.display = 'inline-flex';
        
        const collapsedCards = document.querySelectorAll('.product-group-card.is-collapsed');
        if (collapsedCards.length > 0 && collapsedCards.length === allCards.length) {
            btnCollapseAllText.textContent = '全部展开';
            iconCollapseAll.className = 'fa-solid fa-angles-down';
            btnToggleCollapseAll.title = '全部展开所有产品卡片';
        } else {
            btnCollapseAllText.textContent = '全部折叠';
            iconCollapseAll.className = 'fa-solid fa-angles-up';
            btnToggleCollapseAll.title = '全部折叠所有产品卡片以节省空间';
        }
    }

    if (btnToggleCollapseAll) {
        btnToggleCollapseAll.addEventListener('click', () => {
            const allCards = document.querySelectorAll('.product-group-card');
            const collapsedCards = document.querySelectorAll('.product-group-card.is-collapsed');
            const shouldCollapse = (collapsedCards.length < allCards.length);

            allCards.forEach(card => {
                const pName = card.getAttribute('data-product-name');
                if (shouldCollapse) {
                    card.classList.add('is-collapsed');
                    if (pName) collapsedProducts.add(pName);
                } else {
                    card.classList.remove('is-collapsed');
                    if (pName) collapsedProducts.delete(pName);
                }
            });
            saveCollapsedProductsState();
            updateCollapseAllButtonState();
        });
    }

    // 辅助转义函数
    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 刷新产品 datalist 自动联想数据
    async function refreshProductDatalist() {
        if (!productDatalist) return;
        const [products, protocols] = await Promise.all([
            dbHelper.getAllProducts(),
            dbHelper.getAllProtocols()
        ]);
        const set = new Set();
        (products || []).forEach(p => { if (p && p.name) set.add(p.name.trim()); });
        (protocols || []).forEach(p => { if (p && p.product) set.add(p.product.trim()); });

        productDatalist.innerHTML = '';
        set.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            productDatalist.appendChild(opt);
        });
    }

    // 打开新建/编辑产品弹窗
    function openProductModal(prod = null) {
        if (!productManageModal) return;
        if (prod) {
            if (productModalTitle) productModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color:var(--accent-color);"></i> 编辑产品型号 [${escapeHTML(prod.name)}]`;
            if (productManageOriginalName) productManageOriginalName.value = prod.name;
            if (productManageName) productManageName.value = prod.name;
            if (productManageCode) productManageCode.value = prod.code || '';
            if (productManageDesc) productManageDesc.value = prod.desc || '';
        } else {
            if (productModalTitle) productModalTitle.innerHTML = `<i class="fa-solid fa-cubes" style="color:var(--accent-color);"></i> 新建产品型号`;
            if (productManageOriginalName) productManageOriginalName.value = '';
            if (productManageName) productManageName.value = '';
            if (productManageCode) productManageCode.value = '';
            if (productManageDesc) productManageDesc.value = '';
        }
        productManageModal.classList.add('active');
        setTimeout(() => {
            if (productManageName) productManageName.focus();
        }, 150);
    }
    window.openProductModal = openProductModal;

    if (btnCreateProduct) {
        btnCreateProduct.addEventListener('click', () => openProductModal());
    }

    if (productManageForm) {
        productManageForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const originalName = (productManageOriginalName ? productManageOriginalName.value.trim() : '');
            const name = (productManageName ? productManageName.value.trim() : '');
            const code = (productManageCode ? productManageCode.value.trim() : '');
            const desc = (productManageDesc ? productManageDesc.value.trim() : '');

            if (!name) {
                alert("请输入产品名称！");
                return;
            }

            if (originalName && originalName !== name) {
                await dbHelper.renameProduct(originalName, name);
            }
            await dbHelper.saveProduct({ name, code, desc });

            if (productManageModal) productManageModal.classList.remove('active');
            await refreshProductDatalist();
            await loadProtocols();
        });
    }

    // 全局编辑产品函数
    window.editProductByName = async (productName) => {
        if (!productName) return;
        const products = await dbHelper.getAllProducts();
        const found = products.find(p => p.name === productName) || { name: productName };
        openProductModal(found);
    };

    // 全局删除产品函数 (名下协议解除归属，移入未分类，不丢失协议数据)
    window.deleteProductByName = async (productName) => {
        if (!productName) return;
        const allProtos = await dbHelper.getAllProtocols();
        const related = allProtos.filter(p => (p.product || '').trim() === productName);
        
        let msg = `确定要删除产品型号「${productName}」吗？`;
        if (related.length > 0) {
            msg += `\n\n【提示】检测到当前产品下有 ${related.length} 个通信协议。删除产品后，这些协议不会被删除，而是自动移入「未分类 / 通用协议」中。`;
        }

        if (confirm(msg)) {
            for (const proto of related) {
                proto.product = '';
                await dbHelper.saveProtocol(proto);
            }
            await dbHelper.deleteProduct(productName);
            if (activeProductFilter === productName) {
                activeProductFilter = 'all';
            }
            await refreshProductDatalist();
            await loadProtocols();
        }
    };

    // 搜索输入框与清空按钮事件
    if (productProtoSearch) {
        productProtoSearch.addEventListener('input', (e) => {
            productSearchQuery = e.target.value.trim().toLowerCase();
            if (btnClearProductSearch) {
                btnClearProductSearch.style.display = productSearchQuery ? 'flex' : 'none';
            }
            loadProtocols();
        });
    }

    if (btnClearProductSearch) {
        btnClearProductSearch.addEventListener('click', () => {
            if (productProtoSearch) {
                productProtoSearch.value = '';
                productSearchQuery = '';
                btnClearProductSearch.style.display = 'none';
                loadProtocols();
                productProtoSearch.focus();
            }
        });
    }

    function filterProtocolsBySearch(list, query) {
        if (!query) return list;
        const q = query.toLowerCase();
        return (list || []).filter(p => {
            if (!p) return false;
            if (p.name && p.name.toLowerCase().includes(q)) return true;
            if (p.device && p.device.toLowerCase().includes(q)) return true;
            if (p.source && p.source.toLowerCase().includes(q)) return true;
            if (p.description && p.description.toLowerCase().includes(q)) return true;
            if (p.type && p.type.toLowerCase().includes(q)) return true;
            if (p.product && p.product.toLowerCase().includes(q)) return true;
            if (p._fileName && p._fileName.toLowerCase().includes(q)) return true;
            if (p.words && p.words.some(w => (w.label && w.label.includes(q)) || (w.name && w.name.toLowerCase().includes(q)))) return true;
            return false;
        });
    }

    // 全局悬浮反馈提示 (Toast)
    function showToast(message, type = 'success') {
        const existing = document.querySelectorAll('.pv-toast');
        existing.forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `pv-toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
        toast.innerHTML = `<i class="fa-solid ${icon}" style="color:${type === 'success' ? '#10b981' : 'var(--accent-color)'};"></i> <span>${escapeHTML(message)}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px) scale(0.95)';
            setTimeout(() => toast.remove(), 280);
        }, 2500);
    }
    window.showToast = showToast;

    // 将协议移动到指定产品下 (支持拖拽归类)
    async function moveProtocolToProduct(protoId, targetProduct) {
        if (!protoId) return;
        const proto = await dbHelper.getProtocol(protoId);
        if (!proto) return;

        const cleanOldProduct = (proto.product || '').trim();
        const cleanNewProduct = (targetProduct || '').trim();

        if (cleanOldProduct === cleanNewProduct) {
            return;
        }

        proto.product = cleanNewProduct;
        await dbHelper.saveProtocol(proto);

        // 如果移入具体产品且尚未在产品表中注册，自动登记
        if (cleanNewProduct) {
            await dbHelper.saveProduct({ name: cleanNewProduct });
        }

        // 同步写回本地磁盘文件
        if (currentWorkspaceHandle && proto._fileName) {
            try {
                const fileHandle = await currentWorkspaceHandle.getFileHandle(proto._fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(proto, null, 2));
                await writable.close();
            } catch (diskErr) {
                console.warn("更新工作目录协议文件所属产品失败:", diskErr);
            }
        }

        // 同步推送至 Cloudflare 云端
        if (activeWorkspaceMode === 'cloud' || proto._cloudKey) {
            try {
                await cloudApiCall('/api/protocols', 'POST', proto);
            } catch (cloudErr) {
                console.warn("同步云端协议所属产品失败:", cloudErr);
            }
        }

        // 移入具体产品时自动展开该产品卡片，便于直观核对
        if (cleanNewProduct && collapsedProducts.has(cleanNewProduct)) {
            collapsedProducts.delete(cleanNewProduct);
            saveCollapsedProductsState();
        } else if (!cleanNewProduct && collapsedProducts.has('__uncategorized__')) {
            collapsedProducts.delete('__uncategorized__');
            saveCollapsedProductsState();
        }

        await refreshProductDatalist();
        await loadProtocols();

        const destName = cleanNewProduct ? `产品「${cleanNewProduct}」` : '「未分类 / 通用协议」';
        showToast(`已成功将协议「${proto.name}」移入 ${destName}！`, 'success');
    }
    window.moveProtocolToProduct = moveProtocolToProduct;

    function renderProductFilterTabs(productMap, groupMap, totalCount) {
        if (!productTabsContainer) return;
        productTabsContainer.innerHTML = '';

        // "全部产品" 胶囊标签
        const allPill = document.createElement('button');
        allPill.type = 'button';
        allPill.className = `product-tab-pill ${activeProductFilter === 'all' ? 'active' : ''}`;
        allPill.innerHTML = `<span>全部产品</span><span class="product-tab-count">${totalCount}</span>`;
        allPill.addEventListener('click', () => {
            activeProductFilter = 'all';
            loadProtocols();
        });
        productTabsContainer.appendChild(allPill);

        // 各产品胶囊标签 (支持拖拽放置)
        const sortedNames = Array.from(productMap.keys()).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        sortedNames.forEach(name => {
            const count = (groupMap.get(name) || []).length;
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `product-tab-pill ${activeProductFilter === name ? 'active' : ''}`;
            pill.setAttribute('data-tab-product', name);
            pill.title = `点击筛选；可将协议直接拖至此处移入「${escapeHTML(name)}」`;
            pill.innerHTML = `<span><i class="fa-solid fa-cube" style="font-size:11px; margin-right:2px; opacity:0.8;"></i> ${escapeHTML(name)}</span><span class="product-tab-count">${count}</span>`;
            
            pill.addEventListener('click', () => {
                activeProductFilter = name;
                loadProtocols();
            });

            // 拖拽至 Tab 放置支持
            pill.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                pill.classList.add('tab-drop-hover');
            });
            pill.addEventListener('dragleave', () => {
                pill.classList.remove('tab-drop-hover');
            });
            pill.addEventListener('drop', async (e) => {
                e.preventDefault();
                pill.classList.remove('tab-drop-hover');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, name);
                }
            });

            productTabsContainer.appendChild(pill);
        });

        // "未分类" 胶囊标签 (支持拖拽移除归属)
        const UNCATEGORIZED_KEY = '__uncategorized__';
        const uncatCount = (groupMap.get(UNCATEGORIZED_KEY) || []).length;
        if (uncatCount > 0) {
            const uncatPill = document.createElement('button');
            uncatPill.type = 'button';
            uncatPill.className = `product-tab-pill ${activeProductFilter === UNCATEGORIZED_KEY ? 'active' : ''}`;
            uncatPill.setAttribute('data-tab-product', UNCATEGORIZED_KEY);
            uncatPill.title = '点击筛选；可将协议拖至此处转为通用协议';
            uncatPill.innerHTML = `<span><i class="fa-solid fa-folder-tree" style="font-size:11px; margin-right:2px; opacity:0.8;"></i> 未分类</span><span class="product-tab-count">${uncatCount}</span>`;
            
            uncatPill.addEventListener('click', () => {
                activeProductFilter = UNCATEGORIZED_KEY;
                loadProtocols();
            });

            uncatPill.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                uncatPill.classList.add('tab-drop-hover');
            });
            uncatPill.addEventListener('dragleave', () => {
                uncatPill.classList.remove('tab-drop-hover');
            });
            uncatPill.addEventListener('drop', async (e) => {
                e.preventDefault();
                uncatPill.classList.remove('tab-drop-hover');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, '');
                }
            });

            productTabsContainer.appendChild(uncatPill);
        }
    }

    function createProtocolCardElement(p) {
        const card = document.createElement('div');
        card.className = 'card glass-effect protocol-card';
        card.title = '点击进入编辑；按住可拖动至任意产品卡片或上方产品标签进行归类';
        card.draggable = true;
        card.setAttribute('data-protocol-id', p.id);
        card.setAttribute('data-current-product', p.product || '');

        // 拖拽事件监听
        card.addEventListener('dragstart', (e) => {
            if (e.target.closest('.protocol-actions') || e.target.closest('button')) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', p.id.toString());
            window._draggingProtocol = { id: p.id, name: p.name, currentProduct: (p.product || '').trim() };
            card.classList.add('is-dragging');
            document.body.classList.add('protocol-dragging-active');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            document.body.classList.remove('protocol-dragging-active');
            window._draggingProtocol = null;
            document.querySelectorAll('.drop-target-hover').forEach(el => el.classList.remove('drop-target-hover'));
            document.querySelectorAll('.tab-drop-hover').forEach(el => el.classList.remove('tab-drop-hover'));
        });

        card.addEventListener('click', (e) => {
            if (e.target.closest('.protocol-actions') || e.target.closest('button')) {
                return;
            }
            window.editProtocol(p.id);
        });

        const productName = (p.product || '').trim();

        if (p.type === 'ARINC429') {
            const wordCount = p.words ? p.words.length : 0;
            const modeName = p.mode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式';
            const deviceName = p.device || p.source || '未指定设备';
            const directionName = p.direction || 'Tx';
            const parityName = p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : '无校验');

            card.innerHTML = `
                <div class="protocol-card-header">
                    <div class="protocol-card-title-wrap">
                        <span class="card-drag-handle" title="按住拖拽至上方产品标签或其它产品卡片进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <i class="fa-solid fa-plane-departure proto-card-icon"></i>
                        <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                    </div>
                    <span class="protocol-type-badge">${modeName}</span>
                </div>
                <div class="protocol-stats">
                    ${productName ? `<span class="pstat-item pstat-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    ${p._cloudKey ? `<span class="pstat-item pstat-cloud" title="Cloudflare 云端存储: ${escapeHTML(p._cloudKey)}"><i class="fa-solid fa-cloud"></i> 云端同步</span>` : ''}
                    ${p._fileName ? `<span class="pstat-item pstat-file" title="本地硬盘文件: ${escapeHTML(p._fileName)}"><i class="fa-solid fa-file-code"></i> ${escapeHTML(p._fileName)}</span>` : ''}
                    <span class="pstat-item"><i class="fa-solid fa-layer-group"></i> ${wordCount} 个字</span>
                    <span class="pstat-item"><i class="fa-solid fa-desktop"></i> ${escapeHTML(deviceName)}</span>
                    <span class="pstat-item"><i class="fa-solid fa-arrows-left-right"></i> ${directionName}</span>
                    <span class="pstat-item"><i class="fa-solid fa-clock"></i> ${p.period || 20}ms</span>
                    <span class="pstat-item"><i class="fa-solid fa-gauge-high"></i> ${p.speed || '100kbps'}</span>
                    <span class="pstat-item"><i class="fa-solid fa-shield-halved"></i> ${parityName}</span>
                </div>
                <p class="protocol-card-desc">
                    ${escapeHTML(p.description || '机载 ARINC 429 航空总线通信协议')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-edit" onclick="window.editProtocol(${p.id})"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-export" onclick="window.exportProtocolById(${p.id})" title="导出为电脑本地 .json 模板文件"><i class="fa-solid fa-download"></i> 导出</button>
                    <button type="button" class="btn btn-sm btn-proto-delete" onclick="window.deleteProtocol(${p.id})"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="protocol-card-header">
                    <div class="protocol-card-title-wrap">
                        <span class="card-drag-handle" title="按住拖拽至上方产品标签或其它产品卡片进行归类"><i class="fa-solid fa-grip-vertical"></i></span>
                        <i class="fa-solid fa-network-wired proto-card-icon"></i>
                        <h3 class="protocol-card-title" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h3>
                    </div>
                    <span class="protocol-type-badge">${p.type}</span>
                </div>
                <div class="protocol-stats">
                    ${productName ? `<span class="pstat-item pstat-product" title="所属产品: ${escapeHTML(productName)}"><i class="fa-solid fa-cube"></i> ${escapeHTML(productName)}</span>` : ''}
                    ${p._fileName ? `<span class="pstat-item pstat-file" title="本地硬盘文件: ${escapeHTML(p._fileName)}"><i class="fa-solid fa-file-code"></i> ${escapeHTML(p._fileName)}</span>` : ''}
                    <span class="pstat-item"><i class="fa-solid fa-layer-group"></i> ${p.frames ? p.frames.length : 0} 个报文</span>
                </div>
                <p class="protocol-card-desc">
                    ${escapeHTML(p.description || '工业总线通信协议')}
                </p>
                <div class="protocol-actions">
                    <button type="button" class="btn btn-sm btn-proto-edit" onclick="window.editProtocol(${p.id})"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
                    <button type="button" class="btn btn-sm btn-proto-export" onclick="window.exportProtocolById(${p.id})" title="导出为电脑本地 .json 模板文件"><i class="fa-solid fa-download"></i> 导出</button>
                    <button type="button" class="btn btn-sm btn-proto-delete" onclick="window.deleteProtocol(${p.id})"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
            `;
        }
        return card;
    }

    // ---------------------- 数据加载与渲染 (产品中心与协议分组) ----------------------
    async function loadProtocols() {
        if (!protocolList) return;
        const [protocols, products] = await Promise.all([
            dbHelper.getAllProtocols(),
            dbHelper.getAllProducts()
        ]);
        await refreshProductDatalist();

        // 建立已知产品映射字典: name -> productObj
        const productMap = new Map();
        (products || []).forEach(p => {
            if (p && p.name) {
                productMap.set(p.name.trim(), {
                    name: p.name.trim(),
                    code: p.code || '',
                    desc: p.desc || ''
                });
            }
        });

        // 将协议中出现的但尚未保存到 products 表的新产品也加入产品映射字典中
        (protocols || []).forEach(p => {
            const pName = (p.product || '').trim();
            if (pName && !productMap.has(pName)) {
                productMap.set(pName, {
                    name: pName,
                    code: '',
                    desc: ''
                });
            }
        });

        // 将协议按产品归类分组
        const UNCATEGORIZED_KEY = '__uncategorized__';
        const groupMap = new Map();

        // 先把所有已知产品都放进 groupMap (即使暂无协议，也建立空数组)
        for (const [prodName] of productMap) {
            groupMap.set(prodName, []);
        }
        groupMap.set(UNCATEGORIZED_KEY, []);

        (protocols || []).forEach(p => {
            const pName = (p.product || '').trim();
            if (pName) {
                if (!groupMap.has(pName)) groupMap.set(pName, []);
                groupMap.get(pName).push(p);
            } else {
                groupMap.get(UNCATEGORIZED_KEY).push(p);
            }
        });

        // 渲染产品筛选 Tabs
        renderProductFilterTabs(productMap, groupMap, protocols ? protocols.length : 0);

        // 如果全部为空
        if ((!protocols || protocols.length === 0) && productMap.size === 0) {
            protocolList.innerHTML = `
                <div class="empty-state" style="padding: 3.5rem 1.5rem; text-align: center; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-cubes" style="font-size: 2.5rem; color: var(--accent-color); margin-bottom: 0.8rem; display: block; opacity: 0.85;"></i>
                    <h3 style="font-size: 1.15rem; color: var(--text-primary); margin-bottom: 0.4rem;">暂无通信协议与产品</h3>
                    <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 1.2rem; max-width: 520px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                        在航电与工业系统中，协议通常归属于特定产品设备。您可以先点击「新建产品」再在其下录入协议，或直接点击「新建协议」随手创建。
                    </p>
                    <div style="display: inline-flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button type="button" class="btn btn-secondary" onclick="openProductModal()"><i class="fa-solid fa-cubes"></i> 新建产品型号</button>
                        <button type="button" class="btn btn-primary" onclick="openCreate429Modal()"><i class="fa-solid fa-plus"></i> 新建通信协议</button>
                    </div>
                </div>
            `;
            return;
        }

        protocolList.innerHTML = '';

        // 排序：先渲染有定义的产品，最后渲染未分类协议
        const sortedProductNames = Array.from(productMap.keys()).sort((a, b) => a.localeCompare(b, 'zh-CN'));
        const uncategorizedList = groupMap.get(UNCATEGORIZED_KEY) || [];
        const hasUncategorized = uncategorizedList.length > 0;

        let renderedGroupCount = 0;

        // 渲染具体产品卡片
        sortedProductNames.forEach(prodName => {
            if (activeProductFilter !== 'all' && activeProductFilter !== prodName) {
                return;
            }

            const prodInfo = productMap.get(prodName);
            const protoList = groupMap.get(prodName) || [];

            // 搜索过滤匹配判断
            const filteredProtos = filterProtocolsBySearch(protoList, productSearchQuery);
            const isProductSelfMatch = productSearchQuery && (
                prodName.toLowerCase().includes(productSearchQuery) ||
                (prodInfo.code && prodInfo.code.toLowerCase().includes(productSearchQuery)) ||
                (prodInfo.desc && prodInfo.desc.toLowerCase().includes(productSearchQuery))
            );

            if (productSearchQuery && !isProductSelfMatch && filteredProtos.length === 0) {
                return;
            }

            const protosToRender = isProductSelfMatch ? protoList : filteredProtos;

            const groupCard = document.createElement('div');
            groupCard.className = 'product-group-card';
            groupCard.setAttribute('data-product-name', prodName);

            // 折叠状态初始化 (搜索中有关键字匹配时自动展开便于浏览)
            const isCollapsed = collapsedProducts.has(prodName);
            if (isCollapsed && !productSearchQuery) {
                groupCard.classList.add('is-collapsed');
            }

            // 拖拽放置事件监听
            groupCard.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (window._draggingProtocol && window._draggingProtocol.currentProduct === prodName) {
                    return;
                }
                groupCard.classList.add('drop-target-hover');
            });

            groupCard.addEventListener('dragleave', (e) => {
                if (!groupCard.contains(e.relatedTarget)) {
                    groupCard.classList.remove('drop-target-hover');
                }
            });

            groupCard.addEventListener('drop', async (e) => {
                e.preventDefault();
                groupCard.classList.remove('drop-target-hover');
                document.body.classList.remove('protocol-dragging-active');
                const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                if (protoId) {
                    await moveProtocolToProduct(protoId, prodName);
                }
            });

            groupCard.innerHTML = `
                <div class="product-group-header">
                    <div class="product-group-left product-group-header-clickable" title="点击折叠或展开「${escapeHTML(prodName)}」的协议列表">
                        <button type="button" class="btn-product-collapse" title="折叠/展开此产品">
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                        <div class="product-group-icon">
                            <i class="fa-solid fa-cubes"></i>
                        </div>
                        <div class="product-group-meta">
                            <div class="product-group-title-row">
                                <h2 class="product-group-title">${escapeHTML(prodName)}</h2>
                                ${prodInfo.code ? `<span class="product-code-badge">${escapeHTML(prodInfo.code)}</span>` : ''}
                                <span class="product-proto-count-badge">${protoList.length} 包协议</span>
                                <span class="product-collapsed-tag"><i class="fa-solid fa-angles-down"></i> 已折叠 (点击展开)</span>
                                <span class="product-drop-indicator"><i class="fa-solid fa-arrow-down-to-bracket"></i> 释放移入此产品</span>
                            </div>
                            ${prodInfo.desc ? `<p class="product-group-desc" title="${escapeHTML(prodInfo.desc)}">${escapeHTML(prodInfo.desc)}</p>` : ''}
                        </div>
                    </div>
                    <div class="product-group-right">
                        <button type="button" class="btn-product-add-proto" title="在产品「${escapeHTML(prodName)}」下新建协议" onclick="openCreate429Modal('', '${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-plus"></i> 此产品下新建协议
                        </button>
                        <button type="button" class="btn-product-tool" title="编辑产品信息" onclick="window.editProductByName('${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn-product-tool danger" title="删除该产品" onclick="window.deleteProductByName('${escapeHTML(prodName)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="product-protocols-grid">
                    <!-- 协议卡片 -->
                </div>
            `;

            // 点击左侧标题栏区域折叠/展开
            const headerLeft = groupCard.querySelector('.product-group-left');
            if (headerLeft) {
                headerLeft.addEventListener('click', (e) => {
                    if (groupCard.classList.contains('is-collapsed')) {
                        groupCard.classList.remove('is-collapsed');
                        collapsedProducts.delete(prodName);
                    } else {
                        groupCard.classList.add('is-collapsed');
                        collapsedProducts.add(prodName);
                    }
                    saveCollapsedProductsState();
                    updateCollapseAllButtonState();
                });
            }

            const grid = groupCard.querySelector('.product-protocols-grid');
            if (protosToRender.length === 0) {
                grid.innerHTML = `
                    <div class="product-empty-protos" style="grid-column: 1 / -1;">
                        <i class="fa-solid fa-folder-open"></i>
                        <div>该产品下暂无协议。点击右上角「+ 此产品下新建协议」即可快速为此产品创建协议包。</div>
                    </div>
                `;
            } else {
                protosToRender.forEach(p => {
                    grid.appendChild(createProtocolCardElement(p));
                });
            }

            protocolList.appendChild(groupCard);
            renderedGroupCount++;
        });

        // 渲染未分类/通用协议分组
        if (hasUncategorized && (activeProductFilter === 'all' || activeProductFilter === UNCATEGORIZED_KEY)) {
            const filteredUncategorized = filterProtocolsBySearch(uncategorizedList, productSearchQuery);
            if (!productSearchQuery || filteredUncategorized.length > 0) {
                const groupCard = document.createElement('div');
                groupCard.className = 'product-group-card is-uncategorized';
                groupCard.setAttribute('data-product-name', '__uncategorized__');

                // 未分类折叠状态初始化
                const isUncatCollapsed = collapsedProducts.has('__uncategorized__');
                if (isUncatCollapsed && !productSearchQuery) {
                    groupCard.classList.add('is-collapsed');
                }

                groupCard.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (window._draggingProtocol && !window._draggingProtocol.currentProduct) {
                        return;
                    }
                    groupCard.classList.add('drop-target-hover');
                });

                groupCard.addEventListener('dragleave', (e) => {
                    if (!groupCard.contains(e.relatedTarget)) {
                        groupCard.classList.remove('drop-target-hover');
                    }
                });

                groupCard.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    groupCard.classList.remove('drop-target-hover');
                    document.body.classList.remove('protocol-dragging-active');
                    const protoId = Number(e.dataTransfer.getData('text/plain') || (window._draggingProtocol && window._draggingProtocol.id));
                    if (protoId) {
                        await moveProtocolToProduct(protoId, '');
                    }
                });

                groupCard.innerHTML = `
                    <div class="product-group-header">
                        <div class="product-group-left product-group-header-clickable" title="点击折叠或展开未分类协议列表">
                            <button type="button" class="btn-product-collapse" title="折叠/展开未分类协议">
                                <i class="fa-solid fa-chevron-down"></i>
                            </button>
                            <div class="product-group-icon">
                                <i class="fa-solid fa-folder-tree"></i>
                            </div>
                            <div class="product-group-meta">
                                <div class="product-group-title-row">
                                    <h2 class="product-group-title">未分类 / 通用协议</h2>
                                    <span class="product-proto-count-badge" style="background:rgba(100,116,139,0.15); color:#64748b;">${uncategorizedList.length} 包协议</span>
                                    <span class="product-collapsed-tag"><i class="fa-solid fa-angles-down"></i> 已折叠 (点击展开)</span>
                                    <span class="product-drop-indicator"><i class="fa-solid fa-arrow-down-to-bracket"></i> 释放转为未分类通用</span>
                                </div>
                                <p class="product-group-desc">未指定所属产品型号的通信协议，可直接将协议拖入此处解除产品归属，或拖动至上方产品。</p>
                            </div>
                        </div>
                        <div class="product-group-right">
                            <button type="button" class="btn-product-add-proto" style="background:rgba(100,116,139,0.12); color:#64748b; border-color:rgba(100,116,139,0.25);" onclick="openCreate429Modal('', '')">
                                <i class="fa-solid fa-plus"></i> 新建通用协议
                            </button>
                        </div>
                    </div>
                    <div class="product-protocols-grid"></div>
                `;
                // 点击未分类标题栏折叠/展开
                const uncatHeaderLeft = groupCard.querySelector('.product-group-left');
                if (uncatHeaderLeft) {
                    uncatHeaderLeft.addEventListener('click', () => {
                        if (groupCard.classList.contains('is-collapsed')) {
                            groupCard.classList.remove('is-collapsed');
                            collapsedProducts.delete('__uncategorized__');
                        } else {
                            groupCard.classList.add('is-collapsed');
                            collapsedProducts.add('__uncategorized__');
                        }
                        saveCollapsedProductsState();
                        updateCollapseAllButtonState();
                    });
                }

                const grid = groupCard.querySelector('.product-protocols-grid');
                filteredUncategorized.forEach(p => {
                    grid.appendChild(createProtocolCardElement(p));
                });
                protocolList.appendChild(groupCard);
                renderedGroupCount++;
            }
        }

        // 更新全部折叠/展开按钮状态
        updateCollapseAllButtonState();

        // 若筛选/搜索后无任何匹配结果
        if (renderedGroupCount === 0) {
            protocolList.innerHTML = `
                <div class="empty-state" style="padding: 3rem 1.5rem; text-align: center; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 0.6rem; display: block; opacity: 0.6;"></i>
                    <h3 style="font-size: 1.05rem; color: var(--text-primary); margin-bottom: 0.3rem;">未找到匹配的产品或协议</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">请尝试更换搜索关键字或切换产品标签。</p>
                </div>
            `;
        }
    }

    async function loadProtocolsForSelect() {
        const selectProtocolParse = document.getElementById('select-protocol-parse');
        if (!selectProtocolParse) return;
        const protocols = await dbHelper.getAllProtocols();
        selectProtocolParse.innerHTML = '<option value="">-- 请选择协议 --</option>';
        protocols.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            const prodPrefix = p.product ? `[${p.product}] ` : '';
            option.textContent = `[${p.type}] ${prodPrefix}${p.name}`;
            selectProtocolParse.appendChild(option);
        });
    }

    // ---------------------- 协议编辑器逻辑 ----------------------
    if (btnCreateProtocol) {
        btnCreateProtocol.addEventListener('click', () => {
            openCreate429Modal();
        });
    }

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.remove('active');
            } else {
                protocolModal.classList.remove('active');
                if (arincTemplatesModal) arincTemplatesModal.classList.remove('active');
            }
        });
    });

    // 点击遮罩背景或按 ESC 键关闭弹窗
    window.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        }
    });

    // 动态添加帧
    btnAddFrame.addEventListener('click', () => {
        const frameIdStr = 'frame_' + Date.now();
        const frameHTML = `
            <div class="frame-item" id="${frameIdStr}">
                <div class="frame-header">
                    <input type="text" class="frame-id-input" placeholder="ID (如 0x201)" required>
                    <input type="text" class="frame-name-input" placeholder="报文名称" required>
                    <button type="button" class="btn btn-secondary btn-sm btn-add-signal" data-target="${frameIdStr}">
                        <i class="fa-solid fa-plus"></i> 信号
                    </button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${frameIdStr}').remove()">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="signal-list"></div>
            </div>
        `;
        framesContainer.insertAdjacentHTML('beforeend', frameHTML);
    });

    // 事件委托：动态添加信号
    framesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-add-signal');
        if (btn) {
            const targetId = btn.getAttribute('data-target');
            const signalList = document.querySelector(`#${targetId} .signal-list`);
            const signalHTML = `
                <div class="signal-item">
                    <input type="text" placeholder="信号名" class="sig-name" required>
                    <input type="number" placeholder="起始位" class="sig-start" required min="0" title="Start Bit">
                    <input type="number" placeholder="长度(位)" class="sig-len" required min="1" title="Length">
                    <select class="sig-endian">
                        <option value="little">小端(Intel)</option>
                        <option value="big">大端(Motorola)</option>
                    </select>
                    <input type="number" placeholder="系数(Scale)" class="sig-scale" value="1" step="any" required>
                    <input type="number" placeholder="偏移(Offset)" class="sig-offset" value="0" step="any" required>
                    <input type="text" placeholder="单位(如 V)" class="sig-unit">
                    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
            signalList.insertAdjacentHTML('beforeend', signalHTML);
        }
    });

    // 保存协议
    protocolForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('protocol-id').value;
        const name = document.getElementById('protocol-name').value;
        const type = document.getElementById('protocol-type').value;

        if (type === 'ARINC429') {
            protocolModal.classList.remove('active');
            openCreate429Modal(name);
            return;
        }

        // 收集所有帧和信号
        const frames = [];
        const frameElements = framesContainer.querySelectorAll('.frame-item');
        frameElements.forEach(fEl => {
            const frameId = fEl.querySelector('.frame-id-input').value;
            const frameName = fEl.querySelector('.frame-name-input').value;
            const signals = [];
            
            const signalElements = fEl.querySelectorAll('.signal-item');
            signalElements.forEach(sEl => {
                signals.push({
                    name: sEl.querySelector('.sig-name').value,
                    startBit: Number(sEl.querySelector('.sig-start').value),
                    length: Number(sEl.querySelector('.sig-len').value),
                    endianness: sEl.querySelector('.sig-endian').value,
                    scale: Number(sEl.querySelector('.sig-scale').value),
                    offset: Number(sEl.querySelector('.sig-offset').value),
                    unit: sEl.querySelector('.sig-unit').value || ''
                });
            });

            frames.push({ frameId, frameName, signals });
        });

        const product = (protocolProduct ? protocolProduct.value.trim() : '');
        if (product) {
            await dbHelper.saveProduct({ name: product });
        }

        const protocolData = { name, type, product, frames };
        if (id) protocolData.id = id;

        await dbHelper.saveProtocol(protocolData);
        protocolModal.classList.remove('active');
        await refreshProductDatalist();
        loadProtocols();
        loadProtocolsForSelect(); // 刷新下拉框
    });

    // 全局函数挂载供内联 onclick 使用
    window.deleteProtocol = async (id) => {
        const proto = await dbHelper.getProtocol(id);
        const name = proto ? proto.name : '该协议';
        const isFromDisk = proto && proto._fileName && currentWorkspaceHandle;
        const isFromCloud = proto && (proto._cloudKey || activeWorkspaceMode === 'cloud');

        let confirmMsg = `确定要删除协议「${name}」吗？`;
        if (isFromDisk) {
            confirmMsg = `确定要删除协议「${name}」吗？\n\n【提示】由于已连接本地工作目录，此操作将同步永久删除您电脑硬盘上的物理文件「${proto._fileName}」！`;
        } else if (isFromCloud) {
            confirmMsg = `确定要删除协议「${name}」吗？\n\n【提示】由于当前处于云端工作台模式，此操作将同步从 Cloudflare 云端数据库中彻底删除！`;
        }

        if (confirm(confirmMsg)) {
            if (isFromDisk) {
                try {
                    await currentWorkspaceHandle.removeEntry(proto._fileName);
                } catch(e) {
                    console.warn("从本地工作目录删除物理文件失败:", e);
                }
            }
            if (isFromCloud && proto._cloudKey) {
                try {
                    await cloudApiCall(`/api/protocols?key=${encodeURIComponent(proto._cloudKey)}`, 'DELETE');
                } catch(e) {
                    console.warn("从云端删除协议失败:", e);
                }
            }
            await dbHelper.deleteProtocol(id);
            await loadProtocols();
            await loadArincProtocolsForSelect();
            if (currentArincProtocol && currentArincProtocol.id === Number(id)) {
                currentArincProtocol = null;
                await loadArincProtocolsForSelect();
            }
        }
    };

    window.editProtocol = async (id) => {
        const p = await dbHelper.getProtocol(id);
        if (!p) return;

        if (p.type === 'ARINC429') {
            switchToView('arinc429-view');
            await loadArincProtocolIntoEditor(p.id);
            return;
        }

        document.getElementById('protocol-id').value = p.id;
        document.getElementById('protocol-name').value = p.name;
        if (protocolProduct) protocolProduct.value = p.product || '';
        document.getElementById('protocol-type').value = p.type;
        document.getElementById('modal-title').textContent = '编辑协议';
        
        framesContainer.innerHTML = '';
        if (p.frames) {
            p.frames.forEach((f, index) => {
                const frameIdStr = 'frame_edit_' + index;
                let signalsHTML = '';
                if (f.signals) {
                    f.signals.forEach(s => {
                        signalsHTML += `
                            <div class="signal-item">
                                <input type="text" placeholder="信号名" class="sig-name" value="${s.name}" required>
                                <input type="number" placeholder="起始位" class="sig-start" value="${s.startBit}" required min="0">
                                <input type="number" placeholder="长度(位)" class="sig-len" value="${s.length}" required min="1">
                                <select class="sig-endian">
                                    <option value="little" ${s.endianness === 'little' ? 'selected' : ''}>小端</option>
                                    <option value="big" ${s.endianness === 'big' ? 'selected' : ''}>大端</option>
                                </select>
                                <input type="number" placeholder="系数" class="sig-scale" value="${s.scale}" step="any" required>
                                <input type="number" placeholder="偏移" class="sig-offset" value="${s.offset}" step="any" required>
                                <input type="text" placeholder="单位" class="sig-unit" value="${s.unit || ''}">
                                <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                        `;
                    });
                }

                const frameHTML = `
                    <div class="frame-item" id="${frameIdStr}">
                        <div class="frame-header">
                            <input type="text" class="frame-id-input" value="${f.frameId}" required>
                            <input type="text" class="frame-name-input" value="${f.frameName}" required>
                            <button type="button" class="btn btn-secondary btn-sm btn-add-signal" data-target="${frameIdStr}">
                                <i class="fa-solid fa-plus"></i> 信号
                            </button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${frameIdStr}').remove()">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                        <div class="signal-list">${signalsHTML}</div>
                    </div>
                `;
                framesContainer.insertAdjacentHTML('beforeend', frameHTML);
            });
        }

        protocolModal.classList.add('active');
    };

    // ========================================================
    // ARINC 429 专用航电工作台精简高效控制器 (ARINC 429 Controller)
    // ========================================================
    let currentArincProtocol = null;
    let currentWordIndex = 0;
    let wordFilter = 'all';
    let sourceFilter = 'all';
    let wordSearchQuery = '';
    let activeDictTarget = null; // 当前正在编辑字典的对象 { field, title, callback }

    // DOM 元素引用 - 紧凑工具栏 (精简纯净，无分散表单输入)
    const btnArincBack = document.getElementById('btn-arinc-back');
    const arincProtocolSelect = document.getElementById('arinc-protocol-select');
    const toolbarProtoTitle = document.getElementById('toolbar-proto-title');
    const badgeProtoMode = document.getElementById('badge-proto-mode');
    const badgeProtoPeriod = document.getElementById('badge-proto-period');
    const badgeProtoDevice = document.getElementById('badge-proto-device');
    const badgeProtoDir = document.getElementById('badge-proto-dir');
    const badgeProtoSpeed = document.getElementById('badge-proto-speed');
    const badgeProtoParity = document.getElementById('badge-proto-parity');
    const btnViewArincProps = document.getElementById('btn-view-arinc-props');

    const btnArincNew = document.getElementById('btn-arinc-new');
    const btnArincTemplates = document.getElementById('btn-arinc-templates');
    const btnArincImport = document.getElementById('btn-arinc-import');
    const arincFileInput = document.getElementById('arinc-file-input');
    const btnArincExport = document.getElementById('btn-arinc-export');
    const btnArincSave = document.getElementById('btn-arinc-save');

    // 弹窗引用：新建协议
    const arincCreateModal = document.getElementById('arinc-create-modal');
    const arincCreateForm = document.getElementById('arinc-create-form');
    const create429Name = document.getElementById('create-429-name');
    const create429Type = document.getElementById('create-429-type');
    const create429Device = document.getElementById('create-429-device');
    const create429Direction = document.getElementById('create-429-direction');
    const create429Period = document.getElementById('create-429-period');
    const create429Speed = document.getElementById('create-429-speed');
    const create429Parity = document.getElementById('create-429-parity');
    const create429Mode = document.getElementById('create-429-mode');
    const create429InitTemplate = document.getElementById('create-429-init-template');
    const create429Desc = document.getElementById('create-429-desc');

    // 弹窗引用：协议属性查看与编辑
    const arincPropsModal = document.getElementById('arinc-props-modal');
    const arincPropsForm = document.getElementById('arinc-props-form');
    const props429Id = document.getElementById('props-429-id');
    const props429Name = document.getElementById('props-429-name');
    const props429Device = document.getElementById('props-429-device');
    const props429Direction = document.getElementById('props-429-direction');
    const props429Period = document.getElementById('props-429-period');
    const props429Speed = document.getElementById('props-429-speed');
    const props429Parity = document.getElementById('props-429-parity');
    const props429Mode = document.getElementById('props-429-mode');
    const props429Desc = document.getElementById('props-429-desc');
    const propsSummaryWords = document.getElementById('props-summary-words');
    const propsSummaryId = document.getElementById('props-summary-id');

    // 标号字列表
    const arincWordsList = document.getElementById('arinc-words-list');
    const wordsCountBadge = document.getElementById('words-count-badge');
    const btnAddWord = document.getElementById('btn-add-word');
    const arincWordSearch = document.getElementById('arinc-word-search');
    const arincSourceFilter = document.getElementById('arinc-source-filter');
    const wordFilterButtons = document.querySelectorAll('#word-filter-buttons button');

    // 移动端视窗 Tab 切换 (标号字列表 vs 字段详情)
    const arincDenseWorkbench = document.getElementById('arinc-dense-workbench');
    const btnMobileTabWords = document.getElementById('btn-mobile-tab-words');
    const btnMobileTabDetail = document.getElementById('btn-mobile-tab-detail');
    const btnMobileBackWords = document.getElementById('btn-mobile-back-words');
    const mobileWordsCount = document.getElementById('mobile-words-count');
    const mobileActiveWordLabel = document.getElementById('mobile-active-word-label');

    function setMobileArincView(tab) {
        if (!arincDenseWorkbench) return;
        if (tab === 'detail') {
            arincDenseWorkbench.classList.remove('mobile-view-words');
            arincDenseWorkbench.classList.add('mobile-view-detail');
            if (btnMobileTabWords) btnMobileTabWords.classList.remove('active');
            if (btnMobileTabDetail) btnMobileTabDetail.classList.add('active');
        } else {
            arincDenseWorkbench.classList.remove('mobile-view-detail');
            arincDenseWorkbench.classList.add('mobile-view-words');
            if (btnMobileTabDetail) btnMobileTabDetail.classList.remove('active');
            if (btnMobileTabWords) btnMobileTabWords.classList.add('active');
        }
    }

    if (btnMobileTabWords) btnMobileTabWords.addEventListener('click', () => setMobileArincView('words'));
    if (btnMobileTabDetail) btnMobileTabDetail.addEventListener('click', () => setMobileArincView('detail'));
    if (btnMobileBackWords) btnMobileBackWords.addEventListener('click', () => setMobileArincView('words'));

    // 字详情与模式状态指示
    const detailLabelBadge = document.getElementById('detail-label-badge');
    const detailWordTitle = document.getElementById('detail-word-title');
    const detailSourceBadge = document.getElementById('detail-source-badge');
    const detailModeBadge = document.getElementById('detail-mode-badge');

    // 字基础属性 (含标号、名称、周期、调度及方向徽章)
    const wordLabelOctal = document.getElementById('word-label-octal');
    const labelConversionHelper = document.getElementById('label-conversion-helper');
    const wordName = document.getElementById('word-name');
    const wordPeriodBadge = document.getElementById('word-period-badge');
    const wordDirectionBadge = document.getElementById('word-direction-badge');
    const btnDuplicateWord = document.getElementById('btn-duplicate-word');
    const btnDeleteWord = document.getElementById('btn-delete-word');

    // Markdown 表格导出弹窗 (发给 AI 开发上位机专用)
    const btnArincExportMd = document.getElementById('btn-arinc-export-md');
    const arincExportMdModal = document.getElementById('arinc-export-md-modal');
    const exportMdCodeBlock = document.getElementById('export-md-code-block');
    const btnCopyMd = document.getElementById('btn-copy-md');
    const btnDownloadMd = document.getElementById('btn-download-md');
    const btnDownloadJson = document.getElementById('btn-download-json');
    const exportMdHint = document.getElementById('export-md-hint');

    // 经典模式结构栏
    const classicStructureContainer = document.getElementById('classic-structure-container');
    const classicLabelVal = document.getElementById('classic-label-val');
    const btnEditSdiDict = document.getElementById('btn-edit-sdi-dict');
    const wordSdi = document.getElementById('word-sdi');
    const classicDataVal = document.getElementById('classic-data-val');
    const btnEditSsmDict = document.getElementById('btn-edit-ssm-dict');
    const wordSsm = document.getElementById('word-ssm');
    const classicParityVal = document.getElementById('classic-parity-val');

    // 自由 Bit 流模式结构条
    const bitstreamStructureContainer = document.getElementById('bitstream-structure-container');
    const bsLabelVal = document.getElementById('bs-label-val');
    const bitstreamDataVal = document.getElementById('bitstream-data-val');
    const bsWordSsm = document.getElementById('bs-word-ssm');
    const btnEditBsSsmDict = document.getElementById('btn-edit-bs-ssm-dict');
    const bsParityVal = document.getElementById('bs-parity-val');

    // 具体字段卡片容器
    const fieldsTableDesc = document.getElementById('fields-table-desc');
    const btnAddField = document.getElementById('btn-add-field');
    const arincFieldsTbody = document.getElementById('arinc-fields-container') || document.getElementById('arinc-fields-tbody');

    // 字典编辑弹窗
    const dictEditorModal = document.getElementById('dict-editor-modal');
    const dictFieldTargetName = document.getElementById('dict-field-target-name');
    const dictItemsTbody = document.getElementById('dict-items-tbody');
    const btnAddDictRow = document.getElementById('btn-add-dict-row');
    const btnSaveDict = document.getElementById('btn-save-dict');
    const dictPresetButtons = document.querySelectorAll('.btn-dict-preset');

    // 紧凑仿真条
    const simHexOutput = document.getElementById('sim-hex-output');
    const btnCopyHex = document.getElementById('btn-copy-hex');
    const simBinaryOutput = document.getElementById('sim-binary-output');
    const simDecoderInput = document.getElementById('sim-decoder-input');
    const btnSimDecode = document.getElementById('btn-sim-decode');

    const arincTemplatesModal = document.getElementById('arinc-templates-modal');
    const templateCardsContainer = document.getElementById('template-cards-container');

    // ----------------- 更新顶部工具栏协议信息与属性徽章 -----------------
    function updateToolbarProtocolInfo() {
        if (!currentArincProtocol) {
            if (toolbarProtoTitle) {
                toolbarProtoTitle.innerHTML = `<i class="fa-solid fa-plane-departure"></i> 429 协议工作台`;
                toolbarProtoTitle.title = '未选择协议';
            }
            if (badgeProtoMode) badgeProtoMode.textContent = '无协议';
            if (badgeProtoPeriod) badgeProtoPeriod.innerHTML = `<i class="fa-solid fa-clock"></i> 周期: -`;
            if (badgeProtoDevice) badgeProtoDevice.textContent = '对端: -';
            if (badgeProtoDir) badgeProtoDir.textContent = '方向: -';
            if (badgeProtoSpeed) badgeProtoSpeed.textContent = '-';
            if (badgeProtoParity) badgeProtoParity.textContent = '-';
            return;
        }
        const p = currentArincProtocol;
        if (toolbarProtoTitle) {
            const prodTag = p.product ? `[${p.product}] ` : '';
            toolbarProtoTitle.innerHTML = `<i class="fa-solid fa-plane-departure"></i> ${escapeHTML(prodTag + (p.name || '429 协议'))}`;
            toolbarProtoTitle.title = (p.product ? `所属产品: ${p.product}\n` : '') + (p.name || 'ARINC 429 协议');
        }
        if (badgeProtoMode) {
            badgeProtoMode.textContent = p.mode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式';
        }
        if (badgeProtoPeriod) {
            badgeProtoPeriod.innerHTML = `<i class="fa-solid fa-clock"></i> 周期: ${p.period || 20}ms`;
        }
        if (badgeProtoDevice) {
            badgeProtoDevice.textContent = `对端: ${p.device || p.source || '未指定'}`;
        }
        if (badgeProtoDir) {
            badgeProtoDir.textContent = `方向: ${p.direction || 'Tx'}`;
        }
        if (badgeProtoSpeed) {
            badgeProtoSpeed.textContent = p.speed || '100kbps';
        }
        if (badgeProtoParity) {
            badgeProtoParity.textContent = p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : '无校验');
        }
    }

    // ----------------- 打开新建协议对话框 (统一配置名称、类型、对端、方向、速率、校验、划分模式等) -----------------
    function openCreate429Modal(defaultName = '', targetProduct = '') {
        if (create429Name) create429Name.value = defaultName || '新建 ARINC 429 协议';
        if (create429Product) create429Product.value = targetProduct || '';
        if (create429Type) create429Type.value = 'ARINC429';
        if (create429Device) create429Device.value = targetProduct ? `${targetProduct}系统` : '机载航电系统';
        if (create429Direction) create429Direction.value = 'Tx';
        if (create429Period) create429Period.value = 20;
        if (create429Speed) create429Speed.value = '100kbps';
        if (create429Parity) create429Parity.value = 'odd';
        if (create429Mode) create429Mode.value = 'classic';
        if (create429Desc) create429Desc.value = '';

        refreshProductDatalist();

        // 重置 ARINC 专有属性可见性
        const arincDivider = document.getElementById('create-429-divider-arinc');
        const arincOnlyGroups = [create429Period, create429Speed, create429Parity, create429Mode].map(el => el ? el.closest('.form-group') : null);
        arincOnlyGroups.forEach(grp => { if (grp) grp.style.display = ''; });
        if (arincDivider) arincDivider.style.display = '';

        if (arincCreateModal) arincCreateModal.classList.add('active');
    }
    window.openCreate429Modal = openCreate429Modal;
    window.openCreateProtocolModal = openCreate429Modal;

    if (create429Type) {
        create429Type.addEventListener('change', () => {
            const isArinc = create429Type.value === 'ARINC429';
            const arincDivider = document.getElementById('create-429-divider-arinc');
            const arincOnlyGroups = [create429Period, create429Speed, create429Parity, create429Mode].map(el => el ? el.closest('.form-group') : null);
            arincOnlyGroups.forEach(grp => {
                if (grp) grp.style.display = isArinc ? '' : 'none';
            });
            if (arincDivider) arincDivider.style.display = isArinc ? '' : 'none';
        });
    }

    // ----------------- 打开查看/编辑协议属性对话框 -----------------
    function openProps429Modal(protocol = null) {
        const p = protocol || currentArincProtocol;
        if (!p) {
            alert('请先选择或创建一个 429 协议！');
            return;
        }

        if (props429Id) props429Id.value = p.id || '';
        if (props429Name) props429Name.value = p.name || '';
        if (props429Product) props429Product.value = p.product || '';
        if (props429Device) props429Device.value = p.device || p.source || '机载航电系统';
        if (props429Direction) props429Direction.value = p.direction || 'Tx';
        if (props429Period) props429Period.value = p.period || 20;
        if (props429Speed) props429Speed.value = p.speed || '100kbps';
        if (props429Parity) props429Parity.value = p.parity || 'odd';
        if (props429Mode) props429Mode.value = p.mode || 'classic';
        if (props429Desc) props429Desc.value = p.description || '';
        if (propsSummaryWords) propsSummaryWords.textContent = (p.words ? p.words.length : 0) + ' 个';
        if (propsSummaryId) propsSummaryId.textContent = p.id ? `#${p.id}` : '(新)';

        refreshProductDatalist();

        if (arincPropsModal) arincPropsModal.classList.add('active');
    }
    window.openProps429Modal = openProps429Modal;

    // ----------------- 加载 ARINC 429 协议列表 -----------------
    async function loadArincProtocolsForSelect() {
        const allProtocols = await dbHelper.getAllProtocols();
        const arincList = allProtocols.filter(p => p.type === 'ARINC429');

        if (arincProtocolSelect) {
            arincProtocolSelect.innerHTML = '<option value="">-- 选择429协议 --</option>';
            arincList.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                const prodPrefix = p.product ? `[${p.product}] ` : '';
                opt.textContent = `${prodPrefix}${p.name} (${p.words ? p.words.length : 0}个字)`;
                arincProtocolSelect.appendChild(opt);
            });
            if (currentArincProtocol && currentArincProtocol.id) {
                arincProtocolSelect.value = currentArincProtocol.id;
            }
        }

        if (!currentArincProtocol || !currentArincProtocol.id) {
            if (arincList.length > 0) {
                await loadArincProtocolIntoEditor(arincList[0].id);
            } else {
                currentArincProtocol = null;
                updateToolbarProtocolInfo();
                renderArincWordsList();
                renderSelectedWordInspector();
            }
        }
    }

    // 载入指定 429 协议到工作台
    async function loadArincProtocolIntoEditor(id) {
        const p = await dbHelper.getProtocol(id);
        if (!p) return;

        currentArincProtocol = p;
        if (!currentArincProtocol.words) currentArincProtocol.words = [];
        currentWordIndex = 0;

        // 规范字段默认值为空，并清理历史演示模板残留的 mock 数据
        currentArincProtocol.words.forEach(w => {
            if (w.signals) {
                w.signals.forEach(s => {
                    if (s.remark === undefined) s.remark = '';
                    if ((s.name === '气压高度有效值' || (s.min === -1000 && s.max === 60000)) && (s.unit === 'ft' || s.offset === 0)) {
                        s.min = '';
                        s.max = '';
                        s.unit = '';
                        s.precision = '';
                        s.offset = '';
                        s.resolution = '';
                    }
                    if (s.offset === 0 && (s.precision === '' || s.precision === undefined || s.precision === null)) {
                        s.offset = '';
                    }
                });
            }
        });

        // 统一协议级字段划分模式与全局周期、SSM 字典
        if (!currentArincProtocol.mode) {
            currentArincProtocol.mode = (currentArincProtocol.words && currentArincProtocol.words[0] && currentArincProtocol.words[0].editMode) || 'classic';
        }
        if (!currentArincProtocol.period) {
            currentArincProtocol.period = (currentArincProtocol.words && currentArincProtocol.words[0] && currentArincProtocol.words[0].period) || 20;
        }
        if (!currentArincProtocol.ssmDict) {
            currentArincProtocol.ssmDict = (currentArincProtocol.words && currentArincProtocol.words[0] && currentArincProtocol.words[0].ssmDict) || {
                "0": "正常运算 (Normal)",
                "1": "无计算数据 (NCD)",
                "2": "功能测试 (FT)",
                "3": "故障告警 (Fail)"
            };
        }
        currentArincProtocol.words.forEach(w => {
            w.period = currentArincProtocol.period;
            w.ssmDict = currentArincProtocol.ssmDict;
        });

        if (arincProtocolSelect) arincProtocolSelect.value = p.id;

        updateToolbarProtocolInfo();
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
    }

    // 更新来源筛选下拉选项
    function updateSourceFilterOptions() {
        if (!arincSourceFilter || !currentArincProtocol || !currentArincProtocol.words) return;
        const sources = new Set();
        currentArincProtocol.words.forEach(w => {
            if (w.source && w.source.trim()) sources.add(w.source.trim());
        });

        const curVal = arincSourceFilter.value;
        arincSourceFilter.innerHTML = '<option value="all">所有来源系统</option>';
        sources.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            arincSourceFilter.appendChild(opt);
        });
        if (sources.has(curVal)) {
            arincSourceFilter.value = curVal;
        } else {
            arincSourceFilter.value = 'all';
            sourceFilter = 'all';
        }
    }

    // 新建 429 协议 (从自定义或默认空白生成)
    async function createNewArincProtocol(name, templateData = null) {
        let newProto;
        const defaultMode = (templateData && templateData.mode) || 'classic';
        const defaultPeriod = (templateData && templateData.period) || (templateData && templateData.words && templateData.words[0] && templateData.words[0].period) || 20;
        const defaultDevice = (templateData && templateData.device) || (currentArincProtocol && currentArincProtocol.device) || '机载航电系统';
        const defaultDirection = (templateData && templateData.direction) || (currentArincProtocol && currentArincProtocol.direction) || 'Tx';
        const defaultSsmDict = (templateData && templateData.ssmDict) || (currentArincProtocol && currentArincProtocol.ssmDict) || {
            "0": "正常运算 (Normal)",
            "1": "无计算数据 (NCD)",
            "2": "功能测试 (FT)",
            "3": "故障告警 (Fail)"
        };

        if (templateData && templateData.words && templateData.words.length > 0) {
            newProto = JSON.parse(JSON.stringify(templateData));
            delete newProto.id;
            newProto.name = name || templateData.name;
            newProto.device = templateData.device || defaultDevice;
            newProto.direction = templateData.direction || defaultDirection;
            newProto.period = defaultPeriod;
            newProto.speed = templateData.speed || '100kbps';
            newProto.parity = templateData.parity || 'odd';
            newProto.mode = templateData.mode || defaultMode;
            newProto.ssmDict = defaultSsmDict;
            if (newProto.words) {
                newProto.words.forEach(w => {
                    w.period = defaultPeriod;
                    w.ssmDict = defaultSsmDict;
                });
            }
        } else {
            newProto = {
                name: name || '新建 ARINC 429 协议',
                type: 'ARINC429',
                mode: defaultMode,
                period: defaultPeriod,
                device: defaultDevice,
                direction: defaultDirection,
                speed: '100kbps',
                parity: 'odd',
                ssmDict: defaultSsmDict,
                description: 'ARINC 429 机载航空通信总线协议',
                words: [
                    {
                        label: '001',
                        key: 'word_001',
                        name: '主遥测字',
                        source: defaultDevice,
                        editMode: defaultMode,
                        ssmType: 'BNR',
                        period: defaultPeriod,
                        timeoutMs: defaultPeriod * 3,
                        sendMode: 'cyclic',
                        direction: defaultDirection,
                        channel: 'CH1',
                        sdi: 0,
                        sdiDict: { "0": "全部系统 (All)", "1": "左侧系统 (Left)", "2": "右侧系统 (Right)", "3": "备用系统 (Aux)" },
                        ssmDict: defaultSsmDict,
                        signals: [
                            {
                                key: 'sig_main',
                                name: '主数值字段',
                                dataType: 'u16',
                                bitCount: 16,
                                startBit: defaultMode === 'bitstream' ? 9 : 11,
                                length: 16,
                                endianness: 'big',
                                resolution: '',
                                precision: '',
                                offset: '',
                                min: '',
                                max: '',
                                unit: '',
                                dict: {},
                                defaultValue: 0,
                                remark: ''
                            }
                        ]
                    }
                ]
            };
        }

        // 若已关联本地工作目录，直接在本地工作目录中创建物理 .json 文件
        if (currentWorkspaceHandle) {
            try {
                const safeName = (newProto.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                const fileName = `${safeName}.json`;
                newProto._fileName = fileName;
                newProto._fromWorkspace = true;
                const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(newProto, null, 2));
                await writable.close();
            } catch (diskErr) {
                console.warn("向工作目录写入新建协议文件失败:", diskErr);
            }
        }

        const id = await dbHelper.saveProtocol(newProto);
        newProto.id = id;
        currentArincProtocol = newProto;
        currentWordIndex = 0;

        await loadArincProtocolsForSelect();
        await loadProtocols();
        switchToView('arinc429-view');
        updateToolbarProtocolInfo();
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
    }

    // 保存当前 429 协议 (字与字段更改，若关联工作目录则直接同步写回磁盘文件)
    async function saveCurrentArincProtocol() {
        if (!currentArincProtocol) return;

        // 统一所有标号字的划分模式、周期、方向与全局 SSM 字典为协议全局配置
        if (!currentArincProtocol.ssmDict && currentArincProtocol.words && currentArincProtocol.words[0]) {
            currentArincProtocol.ssmDict = currentArincProtocol.words[0].ssmDict;
        }
        if (currentArincProtocol.words) {
            currentArincProtocol.words.forEach(w => {
                w.editMode = currentArincProtocol.mode;
                w.period = currentArincProtocol.period || 20;
                w.direction = currentArincProtocol.direction || 'Tx';
                if (currentArincProtocol.ssmDict) {
                    w.ssmDict = currentArincProtocol.ssmDict;
                }
            });
        }

        // 若关联了本地工作目录，确保有规范的文件名并同步写回硬盘文件
        let syncedToDisk = false;
        let diskFileName = currentArincProtocol._fileName;
        if (currentWorkspaceHandle) {
            try {
                if (!diskFileName) {
                    const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                    diskFileName = `${safeName}.json`;
                    currentArincProtocol._fileName = diskFileName;
                    currentArincProtocol._fromWorkspace = true;
                }
                const fileHandle = await currentWorkspaceHandle.getFileHandle(diskFileName, { create: true });
                const writable = await fileHandle.createWritable();
                const exportData = JSON.parse(JSON.stringify(currentArincProtocol));
                await writable.write(JSON.stringify(exportData, null, 2));
                await writable.close();
                syncedToDisk = true;
            } catch (diskErr) {
                console.warn("同步写回本地工作目录文件失败:", diskErr);
            }
        }

        // 若处于云端工作台模式，同步推送到 Cloudflare KV 云端
        let syncedToCloud = false;
        if (activeWorkspaceMode === 'cloud') {
            try {
                const cloudRes = await cloudApiCall('/api/protocols', 'POST', currentArincProtocol);
                if (cloudRes.ok && cloudRes.data && cloudRes.data.success) {
                    currentArincProtocol._cloudKey = cloudRes.data.key;
                    currentArincProtocol._fromCloud = true;
                    syncedToCloud = true;
                }
            } catch (cloudErr) {
                console.warn("同步保存到云端失败:", cloudErr);
            }
        }

        const id = await dbHelper.saveProtocol(currentArincProtocol);
        currentArincProtocol.id = id;

        // 保存反馈
        if (btnArincSave) {
            const originalHTML = btnArincSave.innerHTML;
            if (syncedToCloud) {
                btnArincSave.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 已同步云端!`;
                btnArincSave.title = `已同步保存到 Cloudflare 云端工作空间: ${currentArincProtocol._cloudKey || ''}`;
            } else if (syncedToDisk) {
                btnArincSave.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> 已同步本地文件!`;
                btnArincSave.title = `已同步保存到工作目录物理文件: ${diskFileName}`;
            } else {
                btnArincSave.innerHTML = '<i class="fa-solid fa-check"></i> 保存成功!';
                btnArincSave.title = '保存修改';
            }
            btnArincSave.style.backgroundColor = 'var(--success)';
            setTimeout(() => {
                btnArincSave.innerHTML = originalHTML;
                btnArincSave.style.backgroundColor = '';
            }, 1400);
        }

        updateToolbarProtocolInfo();
        await loadArincProtocolsForSelect();
        await loadProtocols();
        updateSourceFilterOptions();
        renderArincWordsList();
    }
    window.saveCurrentArincProtocol = saveCurrentArincProtocol;

    // 聚焦并红色高亮闪烁特定字段卡片
    function highlightAndScrollToField(fieldIndex) {
        setTimeout(() => {
            const card = document.getElementById(`field-card-${fieldIndex}`);
            if (card) {
                // 滚动至视野居中
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 添加红色闪烁动画类
                card.classList.remove('field-highlight-flash');
                void card.offsetWidth; // 触发 reflow 重新激活 CSS 关键帧动画
                card.classList.add('field-highlight-flash');
                setTimeout(() => {
                    card.classList.remove('field-highlight-flash');
                }, 1600);
            }
        }, 50);
    }
    window.highlightAndScrollToField = highlightAndScrollToField;

    // ----------------- 渲染左侧标号字列表 (主要内容核心区) -----------------
    function renderArincWordsList() {
        if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) {
            arincWordsList.innerHTML = '<tr><td colspan="5" class="empty-state">暂无标号字，请点击右上角「+ 添加字」。</td></tr>';
            wordsCountBadge.textContent = '0';
            if (mobileWordsCount) mobileWordsCount.textContent = '0';
            return;
        }

        wordsCountBadge.textContent = currentArincProtocol.words.length;
        if (mobileWordsCount) mobileWordsCount.textContent = currentArincProtocol.words.length;

        // 过滤
        let filtered = currentArincProtocol.words.map((w, idx) => ({ ...w, originalIndex: idx }));
        
        if (wordFilter !== 'all') {
            filtered = filtered.filter(w => w.direction === wordFilter);
        }

        if (sourceFilter !== 'all') {
            filtered = filtered.filter(w => (w.source || '').trim() === sourceFilter);
        }

        if (wordSearchQuery) {
            const q = wordSearchQuery.toLowerCase();
            filtered = filtered.filter(w => {
                // 1. 匹配标号 (八进制数字)
                const matchLabel = w.label && w.label.toLowerCase().includes(q);
                // 2. 匹配标号字名称
                const matchName = w.name && w.name.toLowerCase().includes(q);
                // 3. 匹配来源系统设备
                const matchSource = w.source && w.source.toLowerCase().includes(q);
                // 4. 匹配具体字段名称 (signals 内任意字段匹配)
                const matchField = w.signals && w.signals.some(s => s && s.name && s.name.toLowerCase().includes(q));

                return matchLabel || matchName || matchSource || matchField;
            });
        }

        arincWordsList.innerHTML = '';
        if (filtered.length === 0) {
            arincWordsList.innerHTML = '<tr><td colspan="5" class="empty-state">未找到匹配的 429 标号字</td></tr>';
            return;
        }

        filtered.forEach((item, fIdx) => {
            const tr = document.createElement('tr');
            tr.className = `dense-word-row ${item.originalIndex === currentWordIndex ? 'selected' : ''}`;

            const octalStr = (item.label || '000').toString().padStart(3, '0');
            const sigCount = (item.signals ? item.signals.length : 0);
            const dirClass = item.direction === 'Rx' ? 'dir-rx' : 'dir-tx';

            let matchedFieldHint = '';
            let firstMatchedFieldIndex = -1;
            if (wordSearchQuery && item.signals) {
                const q = wordSearchQuery.toLowerCase();
                const matchedFields = [];
                item.signals.forEach((s, sIdx) => {
                    if (s && s.name && s.name.toLowerCase().includes(q)) {
                        matchedFields.push(s);
                        if (firstMatchedFieldIndex === -1) firstMatchedFieldIndex = sIdx;
                    }
                });
                if (matchedFields.length > 0) {
                    matchedFieldHint = ` (匹配字段: ${matchedFields.map(s => s.name).join(', ')})`;
                }
            }

            if (item.name || matchedFieldHint) {
                tr.title = `${octalStr}₈: ${item.name || '未命名'}${matchedFieldHint}`;
            }

            tr.innerHTML = `
                <td class="col-idx" style="text-align:center;">#${fIdx + 1}</td>
                <td class="col-label">
                    <span class="octal-num">${octalStr}₈</span>
                    ${item.name ? `<span class="word-mini-name" title="${item.name}">${item.name}</span>` : ''}
                    ${firstMatchedFieldIndex !== -1 ? `<button type="button" class="word-search-match-btn btn-locate-matched-field" data-word-index="${item.originalIndex}" data-field-index="${firstMatchedFieldIndex}" title="点击直接定位并高亮闪烁该字段"><i class="fa-solid fa-magnifying-glass"></i></button>` : ''}
                </td>
                <td class="col-dir" style="text-align:center;">
                    <span class="dense-dir-tag ${dirClass}">${item.direction || 'Tx'}</span>
                </td>
                <td class="col-count" style="text-align:center;">
                    <span class="dense-count-pill">${sigCount}</span>
                </td>
                <td class="col-action" style="text-align:center;">
                    <button type="button" class="word-row-del-btn" title="删除标号字 [${octalStr}₈ ${item.name || ''}]" data-index="${item.originalIndex}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;

            // 点击放大镜按钮直接定位并红色闪烁字段
            const locateBtn = tr.querySelector('.btn-locate-matched-field');
            if (locateBtn) {
                locateBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止多余的行点击触发
                    currentWordIndex = item.originalIndex;
                    renderArincWordsList();
                    renderSelectedWordInspector();
                    if (window.innerWidth <= 768) {
                        setMobileArincView('detail');
                    }
                    highlightAndScrollToField(firstMatchedFieldIndex);
                });
            }

            // 每个字后方单独的删除按钮
            const delBtn = tr.querySelector('.word-row-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止触发行选中
                    const targetIdx = item.originalIndex;
                    const w = currentArincProtocol.words[targetIdx];
                    if (!w) return;
                    const targetName = w.name ? `「${w.name}」` : '';
                    if (confirm(`确定要删除标号字 [${w.label || '000'}₈] ${targetName} 吗？`)) {
                        currentArincProtocol.words.splice(targetIdx, 1);
                        if (currentWordIndex >= currentArincProtocol.words.length) {
                            currentWordIndex = Math.max(0, currentArincProtocol.words.length - 1);
                        }
                        updateSourceFilterOptions();
                        renderArincWordsList();
                        renderSelectedWordInspector();
                    }
                });
            }

            tr.addEventListener('click', () => {
                currentWordIndex = item.originalIndex;
                renderArincWordsList();
                renderSelectedWordInspector();
                if (window.innerWidth <= 768) {
                    setMobileArincView('detail');
                }
            });

            arincWordsList.appendChild(tr);
        });
    }

    // ----------------- 渲染右侧选中的数据字与具体字段编辑面板 -----------------
    function renderSelectedWordInspector() {
        if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) {
            document.getElementById('arinc-inspector-panel').style.opacity = '0.5';
            return;
        }

        document.getElementById('arinc-inspector-panel').style.opacity = '1';
        if (currentWordIndex >= currentArincProtocol.words.length) {
            currentWordIndex = currentArincProtocol.words.length - 1;
        }
        if (currentWordIndex < 0) currentWordIndex = 0;

        const word = currentArincProtocol.words[currentWordIndex];
        if (!word) return;

        // 默认模式
        if (!word.editMode) word.editMode = 'classic';
        if (!word.signals) word.signals = [];

        // 统一由协议级模式控制 (在定协议时设定，无需每个label重复选)
        const protoMode = (currentArincProtocol && currentArincProtocol.mode) || word.editMode || 'classic';
        word.editMode = protoMode;

        // 顶栏展示：八进制标号、数据字名称
        const octalClean = (word.label || '000').toString().padStart(3, '0');
        const byteVal = Arinc429Helper.octalToLabelByte(octalClean);
        const hexVal = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
        if (detailLabelBadge) detailLabelBadge.textContent = `${octalClean}₈`;
        if (detailWordTitle) detailWordTitle.textContent = word.name || '未命名数据字';
        if (mobileActiveWordLabel) mobileActiveWordLabel.textContent = `${octalClean}₈`;
        if (detailSourceBadge) detailSourceBadge.style.display = 'none';

        if (detailModeBadge) {
            detailModeBadge.textContent = protoMode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式';
        }

        // 结构条展示切换 (统一由协议级字段划分模式控制)
        if (protoMode === 'bitstream') {
            classicStructureContainer.style.display = 'none';
            bitstreamStructureContainer.style.display = 'flex';
            fieldsTableDesc.textContent = '自由 Bit 模式：数据段默认从 Bit 9 起分配 (Bits 9~29 共 21 位)，SSM 占用 2 位 (Bits 30~31)';
        } else {
            classicStructureContainer.style.display = 'flex';
            bitstreamStructureContainer.style.display = 'none';
            fieldsTableDesc.textContent = '经典航电模式：SDI 占用 2 位 (Bits 9~10)，在 19 位有效载荷 (Bits 11~29) 内划分字段';
        }

        // 标号与校验位
        if (classicLabelVal) classicLabelVal.textContent = `${octalClean}₈`;
        if (bsLabelVal) bsLabelVal.textContent = `${octalClean}₈`;
        const parityText = currentArincProtocol.parity === 'odd' ? '奇校验' : (currentArincProtocol.parity === 'even' ? '偶校验' : '无校验');
        if (classicParityVal) classicParityVal.textContent = parityText;
        if (bsParityVal) bsParityVal.textContent = parityText;

        // 填充属性行 (标号、字名称，以及只读的协议全局周期与协议方向)
        if (wordLabelOctal) wordLabelOctal.value = word.label || '000';
        if (wordName) wordName.value = word.name || '';

        // 周期 (协议统一通信调度周期，只读标签展示)
        const protoPeriod = (currentArincProtocol && currentArincProtocol.period) || word.period || 20;
        word.period = protoPeriod;
        if (wordPeriodBadge) {
            wordPeriodBadge.textContent = `${protoPeriod}ms`;
            wordPeriodBadge.title = `继承自协议全局周期: ${protoPeriod}ms (只读，点击修改协议周期)`;
        }

        // 调度 (固定周期调度)
        word.sendMode = 'cyclic';

        // 方向 (继承自协议属性，只读)
        const protoDir = (currentArincProtocol && currentArincProtocol.direction) || word.direction || 'Tx';
        word.direction = protoDir;
        if (wordDirectionBadge) {
            wordDirectionBadge.textContent = protoDir === 'Rx' ? 'Rx (收)' : 'Tx (发)';
            wordDirectionBadge.className = `dense-readonly-tag dense-dir-tag ${protoDir === 'Rx' ? 'dir-rx' : 'dir-tx'}`;
            wordDirectionBadge.title = `继承自协议配置: ${protoDir} (只读)`;
        }

        // 换算提示
        labelConversionHelper.textContent = `Hex:${hexVal}`;
        labelConversionHelper.title = `十进制数值: ${byteVal}`;

        // 更新 SDI 与 SSM (占用 2 位: B30~B31，支持下拉与字典配置)
        updateSdiSelectOptions(word);
        updateSsmSelectOptions(word);

        // 渲染具体字段表格与数据字典
        renderFieldsTable(word);

        // 更新紧凑仿真条
        updateCompactSim(word);
    }

    // 辅助：更新 SDI 选项列表
    function updateSdiSelectOptions(word) {
        if (!wordSdi) return;
        if (!word.sdiDict) {
            word.sdiDict = { "0": "全部系统 (All)", "1": "系统 1 (左侧)", "2": "系统 2 (右侧)", "3": "系统 3 (备用)" };
        }
        wordSdi.innerHTML = '';
        const bitMap = { '0': '00', '1': '01', '2': '10', '3': '11' };
        Object.entries(word.sdiDict).forEach(([k, v]) => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = `${bitMap[k] || k}: ${v}`;
            wordSdi.appendChild(opt);
        });
        wordSdi.value = word.sdi !== undefined ? word.sdi : 0;
    }

    // 辅助：更新 SSM 选项列表 (两位: B30~B31，继承自协议全局 SSM 字典)
    function updateSsmSelectOptions(word) {
        const globalSsmDict = (currentArincProtocol && currentArincProtocol.ssmDict) || word.ssmDict || { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };
        word.ssmDict = globalSsmDict;
        if (currentArincProtocol) currentArincProtocol.ssmDict = globalSsmDict;

        const curVal = word.ssm !== undefined ? word.ssm : 0;
        const selects = [wordSsm, bsWordSsm].filter(Boolean);
        selects.forEach(sel => {
            sel.innerHTML = '';
            const bitMap = { '0': '00', '1': '01', '2': '10', '3': '11' };
            Object.entries(globalSsmDict).forEach(([k, v]) => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = `${bitMap[k] || k}: ${v}`;
                sel.appendChild(opt);
            });
            sel.value = curVal;
        });
    }

    // 更新字段分配统计指示器 (自由模式: B9~B29 共21位; 经典模式: B11~B29 共19位)
    function updateFieldsAllocationSummary(word) {
        if (!word) return;
        const fields = word.signals || [];
        const isBitstream = (currentArincProtocol && currentArincProtocol.mode === 'bitstream') || (word.editMode === 'bitstream');

        let payloadBits = 0;
        fields.forEach(f => payloadBits += Number(f.bitCount || f.length || 1));

        if (isBitstream) {
            if (bitstreamDataVal) {
                bitstreamDataVal.textContent = `已分配: ${payloadBits} / 21 位`;
                bitstreamDataVal.style.color = payloadBits > 21 ? '#ef4444' : 'var(--text-primary)';
            }
        } else {
            if (classicDataVal) {
                classicDataVal.textContent = `已分配: ${payloadBits} / 19 位`;
                classicDataVal.style.color = payloadBits > 19 ? '#ef4444' : 'var(--text-primary)';
            }
        }
    }

    // ----------------- 渲染具体字段卡片与数据字典 -----------------
    function renderFieldsTable(word) {
        if (!arincFieldsTbody) return;
        arincFieldsTbody.innerHTML = '';

        let fields = word.signals || [];
        const isBitstream = (currentArincProtocol && currentArincProtocol.mode === 'bitstream') || (word.editMode === 'bitstream');

        // 自由 Bit 模式规范化：第 1 个字段默认起始 Bit 为 9，后面依次根据前面的字段计算
        if (isBitstream && fields.length > 0) {
            fields.forEach((f, idx) => {
                if (idx === 0) {
                    if (f.startBit === undefined || f.startBit === null || f.startBit === '') {
                        f.startBit = 9;
                    } else {
                        f.startBit = Number(f.startBit) || 9;
                    }
                } else {
                    const prev = fields[idx - 1];
                    f.startBit = (Number(prev.startBit) || 9) + (Number(prev.bitCount || prev.length) || 1);
                }
            });
        }

        // 更新分配统计
        updateFieldsAllocationSummary(word);

        if (fields.length === 0) {
            arincFieldsTbody.innerHTML = `
                <div class="field-card-empty-state">
                    <i class="fa-solid fa-layer-group" style="font-size: 28px; margin-bottom: 10px; display: block; color: var(--accent-color); opacity: 0.6;"></i>
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">当前数据字暂无字段</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">点击右上角「+ 添加字段卡片」为该标号字划分具体的数据段。</div>
                    <button type="button" class="dense-btn dense-btn-primary" onclick="window.addField ? window.addField() : null">
                        <i class="fa-solid fa-plus"></i> 立即添加字段卡片
                    </button>
                </div>
            `;
            return;
        }

        fields.forEach((field, fIdx) => {
            const card = document.createElement('div');
            card.className = 'dense-field-card';
            card.id = `field-card-${fIdx}`;
            card.setAttribute('data-field-index', fIdx);
            card.setAttribute('data-field-name', field.name || '');

            const bitCount = Number(field.bitCount || field.length || 1);
            let startBit;
            if (isBitstream) {
                if (fIdx === 0) {
                    startBit = Number(field.startBit !== undefined && field.startBit !== null && field.startBit !== '' ? field.startBit : 9);
                } else {
                    const prev = fields[fIdx - 1];
                    startBit = (Number(prev.startBit) || 9) + (Number(prev.bitCount || prev.length) || 1);
                }
            } else {
                startBit = Number(field.startBit !== undefined && field.startBit !== null && field.startBit !== '' ? field.startBit : 11);
            }
            field.startBit = startBit;
            field.bitCount = bitCount;
            field.length = bitCount;

            // 归一化上位机数据类型：严格限制为 bool / u8 / u16
            let rawType = (field.dataType || '').toLowerCase();
            let dataType = 'u16';
            if (rawType === 'bool' || rawType === 'discrete') {
                dataType = 'bool';
            } else if (rawType === 'u8' || rawType === 'uint8' || rawType === 'uint8_t' || (rawType === 'enum' && bitCount <= 8)) {
                dataType = 'u8';
            } else if (rawType === 'u16' || rawType === 'uint16' || rawType === 'uint16_t') {
                dataType = 'u16';
            } else {
                if (bitCount <= 1) {
                    dataType = 'bool';
                } else if (bitCount <= 8) {
                    dataType = 'u8';
                } else {
                    dataType = 'u16';
                }
            }
            field.dataType = dataType;

            // 只有 u16 才有字节序 (大端/小端)，默认小端(LSB)，bool 和 u8 不设置字节序
            let endianness = field.endianness;
            if (dataType !== 'u16') {
                endianness = 'none';
            } else if (endianness !== 'big') {
                endianness = 'little';
            }
            field.endianness = endianness;

            if (!field.key) {
                field.key = (typeof UpperComputerCodeGen !== 'undefined' ? UpperComputerCodeGen.toSafeIdentifier(field.name, `sig_${fIdx + 1}`) : `sig_${fIdx + 1}`);
            }

            const endBit = startBit + bitCount - 1;
            const isOverflow = endBit > 29;

            // 字典标签渲染
            let dictBadgesHTML = '';
            const dict = field.dict || {};
            const keys = Object.keys(dict);
            if (keys.length > 0) {
                keys.slice(0, 5).forEach(k => {
                    dictBadgesHTML += `<span class="dense-dict-tag" title="${k}: ${dict[k]}">${k}:${dict[k]}</span>`;
                });
                if (keys.length > 5) {
                    dictBadgesHTML += `<span class="dense-dict-tag" title="还有 ${keys.length - 5} 项">+${keys.length - 5}</span>`;
                }
            } else {
                dictBadgesHTML = '<span class="dense-dict-empty">未配置字典</span>';
            }

            card.innerHTML = `
                <div class="field-card-header">
                    <div class="field-card-header-left">
                        <span class="field-card-idx">#${fIdx + 1}</span>
                        <div class="field-card-name-wrap">
                            <i class="fa-solid fa-tag field-card-name-icon"></i>
                            <input type="text" class="field-in-name field-card-name-input" value="${field.name || ''}" placeholder="字段中文名称 (例如: 接触器通断状态)" title="输入字段名称">
                        </div>
                        <div class="field-card-header-dict">
                            <button type="button" class="dense-dict-btn btn-edit-field-dict" title="配置状态字典映射">
                                <i class="fa-solid fa-book"></i> 状态字典
                            </button>
                            <div class="dense-dict-list">${dictBadgesHTML}</div>
                        </div>
                    </div>
                    <div class="field-card-header-right">
                        <span class="dense-bit-span ${isOverflow ? 'dense-bit-span-overflow' : ''}" id="span-range-${fIdx}" title="${isOverflow ? '警告：有效数据位段超出 B29 (B30~B31 为 SSM, B32 为校验)' : '位段范围'}">
                            <i class="fa-solid fa-barcode"></i> B${startBit}${bitCount > 1 ? `~B${endBit}` : ''} (${bitCount}b)
                        </span>
                        <button type="button" class="dense-clone-btn btn-clone-field" title="克隆当前字段 (新字段属性与此字段保持一致)">
                            <i class="fa-solid fa-copy"></i> 克隆
                        </button>
                        <button type="button" class="dense-del-btn btn-del-field" title="删除该字段卡片">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <!-- 紧凑单行/双行属性流：严格约束各输入框宽度，最大化节省卡片空间 -->
                <div class="field-card-props-flow">
                    <div class="field-card-cell" style="width: 76px;">
                        <label class="field-card-label"><i class="fa-solid fa-cube"></i> 类型</label>
                        <select class="field-in-type field-card-select" title="数据类型 (bool / u8 / u16)">
                            <option value="bool" ${dataType === 'bool' ? 'selected' : ''}>bool</option>
                            <option value="u8" ${dataType === 'u8' ? 'selected' : ''}>u8</option>
                            <option value="u16" ${dataType === 'u16' ? 'selected' : ''}>u16</option>
                        </select>
                    </div>

                    <div class="field-card-cell" style="width: 56px;">
                        <label class="field-card-label"><i class="fa-solid fa-play"></i> 起始</label>
                        <div class="field-card-input-wrap">
                            <input type="number" class="field-in-start field-card-input" min="1" max="32" value="${startBit}" ${(isBitstream && fIdx > 0) ? 'readonly style="background-color: var(--bg-hover); opacity: 0.85; cursor: default;" title="自由Bit模式：由上一字段自动顺延计算"' : ''}>
                            <span class="field-card-addon">位</span>
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 56px;">
                        <label class="field-card-label"><i class="fa-solid fa-ruler-horizontal"></i> 占用</label>
                        <div class="field-card-input-wrap">
                            <input type="number" class="field-in-bitcount field-card-input" min="1" max="${dataType === 'bool' ? 1 : (dataType === 'u8' ? 8 : 16)}" value="${dataType === 'bool' ? 1 : bitCount}" ${dataType === 'bool' ? 'disabled' : ''}>
                            <span class="field-card-addon">b</span>
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 86px;">
                        <label class="field-card-label"><i class="fa-solid fa-arrows-left-right"></i> 字节序</label>
                        ${dataType === 'u16' ? `
                        <select class="field-in-endian field-card-select" title="字节序定义 (仅 u16 支持大端/小端)">
                            <option value="little" ${endianness === 'little' ? 'selected' : ''}>小端(LSB)</option>
                            <option value="big" ${endianness === 'big' ? 'selected' : ''}>大端(MSB)</option>
                        </select>
                        ` : `
                        <select class="field-in-endian field-card-select" disabled title="只有 u16 类型才支持配置字节序" style="opacity: 0.45; cursor: not-allowed;">
                            <option value="none">- 无 -</option>
                        </select>
                        `}
                    </div>

                    <div class="field-card-cell" style="width: 66px;">
                        <label class="field-card-label"><i class="fa-solid fa-calculator"></i> 分辨率</label>
                        <input type="number" class="field-in-res field-card-input" step="any" value="${(field.resolution !== undefined && field.resolution !== null) ? field.resolution : ''}" placeholder="空" title="分辨率 / 缩放因子 (未填写则留空)">
                    </div>

                    <div class="field-card-cell" style="width: 66px;">
                        <label class="field-card-label"><i class="fa-solid fa-bullseye"></i> 精度</label>
                        <input type="text" class="field-in-offset field-card-input" value="${(field.precision !== undefined && field.precision !== null && field.precision !== '') ? field.precision : ((field.offset !== undefined && field.offset !== null && field.offset !== '' && field.offset !== 0) ? field.offset : '')}" placeholder="空" title="精度 (支持输入小数、百分比如 %，未填写则留空)">
                    </div>

                    <div class="field-card-cell" style="width: 135px;">
                        <label class="field-card-label"><i class="fa-solid fa-gauge-high"></i> 范围(Min~Max)</label>
                        <div class="field-card-minmax">
                            <input type="text" class="field-in-min field-card-input" value="${(field.min !== undefined && field.min !== null) ? field.min : ''}" placeholder="Min" title="最小值 (支持小数如 0.0)">
                            <span>~</span>
                            <input type="text" class="field-in-max field-card-input" value="${(field.max !== undefined && field.max !== null) ? field.max : ''}" placeholder="Max" title="最大值 (支持小数如 55.0)">
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 52px;">
                        <label class="field-card-label"><i class="fa-solid fa-tag"></i> 单位</label>
                        <input type="text" class="field-in-unit field-card-input" value="${field.unit || ''}" placeholder="空" title="工程量单位 (默认空)">
                    </div>

                    <div class="field-card-cell field-card-cell-remark">
                        <label class="field-card-label"><i class="fa-solid fa-note-sticky"></i> 备注</label>
                        <input type="text" class="field-in-remark field-card-input" value="${field.remark || ''}" placeholder="空" title="字段备注说明 (默认空)">
                    </div>
                </div>
            `;

            // 行内输入实时保存联动
            const inName = card.querySelector('.field-in-name');
            const inType = card.querySelector('.field-in-type');
            const inStart = card.querySelector('.field-in-start');
            const inBitCount = card.querySelector('.field-in-bitcount');
            const inEndian = card.querySelector('.field-in-endian');
            const inRes = card.querySelector('.field-in-res');
            const inOffset = card.querySelector('.field-in-offset');
            const inMin = card.querySelector('.field-in-min');
            const inMax = card.querySelector('.field-in-max');
            const inUnit = card.querySelector('.field-in-unit');
            const inRemark = card.querySelector('.field-in-remark');
            const rangeSpan = card.querySelector(`#span-range-${fIdx}`);

            const onCardChange = () => {
                field.name = inName.value;
                if (!field.key || field.key.startsWith('sig_')) {
                    field.key = (typeof UpperComputerCodeGen !== 'undefined' ? UpperComputerCodeGen.toSafeIdentifier(field.name, `sig_${fIdx + 1}`) : `sig_${fIdx + 1}`);
                }
                const currentType = inType.value;
                field.dataType = currentType;

                let newStart = (isBitstream && fIdx > 0)
                    ? (Number(fields[fIdx - 1].startBit || 9) + Number(fields[fIdx - 1].bitCount || 1))
                    : Math.max(1, Math.min(32, parseInt(inStart.value) || (isBitstream ? 9 : 11)));

                let newCount = parseInt(inBitCount.value) || 1;
                if (currentType === 'bool') {
                    newCount = 1;
                    inBitCount.value = '1';
                } else if (currentType === 'u8') {
                    newCount = Math.max(1, Math.min(8, newCount));
                    inBitCount.value = newCount;
                } else {
                    newCount = Math.max(1, Math.min(16, newCount));
                    inBitCount.value = newCount;
                }

                field.startBit = newStart;
                field.bitCount = newCount;
                field.length = newCount;
                field.endianness = (currentType === 'u16') ? inEndian.value : 'none';

                // 分辨率、精度、范围、单位、备注默认情况下都是空的 (未填写则留空字符串)
                field.resolution = inRes.value.trim() !== '' ? (parseFloat(inRes.value) || inRes.value.trim()) : '';
                field.scale = field.resolution;
                const precisionRaw = inOffset.value.trim();
                const precisionVal = precisionRaw !== '' ? (!isNaN(Number(precisionRaw)) ? parseFloat(precisionRaw) : precisionRaw) : '';
                field.precision = precisionVal;
                field.offset = precisionVal;
                const minRaw = inMin.value.trim();
                field.min = minRaw !== '' ? (!isNaN(Number(minRaw)) ? minRaw : minRaw) : '';
                const maxRaw = inMax.value.trim();
                field.max = maxRaw !== '' ? (!isNaN(Number(maxRaw)) ? maxRaw : maxRaw) : '';
                field.unit = inUnit.value;
                field.remark = inRemark ? inRemark.value : '';

                const curEnd = newStart + newCount - 1;
                rangeSpan.innerHTML = `<i class="fa-solid fa-barcode"></i> B${newStart}${newCount > 1 ? `~B${curEnd}` : ''} (${newCount} bit)`;
                if (curEnd > 29) {
                    rangeSpan.classList.add('dense-bit-span-overflow');
                    rangeSpan.title = '警告：位段超过有效数据区 (B9~B29)，B30~B31 为 SSM, B32 为校验！';
                } else {
                    rangeSpan.classList.remove('dense-bit-span-overflow');
                    rangeSpan.title = '位段范围';
                }

                // 自由 Bit 模式联动：后续字段依次根据前一个字段累加计算起始 bit
                if (isBitstream) {
                    for (let j = fIdx + 1; j < fields.length; j++) {
                        const prevF = fields[j - 1];
                        const nextStart = Number(prevF.startBit || 9) + Number(prevF.bitCount || 1);
                        fields[j].startBit = nextStart;

                        const nextCard = arincFieldsTbody.children[j];
                        if (nextCard) {
                            const nextStartIn = nextCard.querySelector('.field-in-start');
                            if (nextStartIn) nextStartIn.value = nextStart;
                            const nextCount = Number(fields[j].bitCount || 1);
                            const nextEnd = nextStart + nextCount - 1;
                            const nextRangeSpan = nextCard.querySelector(`#span-range-${j}`);
                            if (nextRangeSpan) {
                                nextRangeSpan.innerHTML = `<i class="fa-solid fa-barcode"></i> B${nextStart}${nextCount > 1 ? `~B${nextEnd}` : ''} (${nextCount} bit)`;
                                if (nextEnd > 29) {
                                    nextRangeSpan.classList.add('dense-bit-span-overflow');
                                    nextRangeSpan.title = '警告：位段超过有效数据区 (B9~B29)，B30~B31 为 SSM, B32 为校验！';
                                } else {
                                    nextRangeSpan.classList.remove('dense-bit-span-overflow');
                                    nextRangeSpan.title = '位段范围';
                                }
                            }
                        }
                    }
                }

                updateFieldsAllocationSummary(word);
                updateCompactSim(word);
            };

            // 数据类型切换联动：控制占用 Bit 范围与字节序可用性
            inType.addEventListener('change', () => {
                const selType = inType.value;
                if (selType === 'bool') {
                    inBitCount.value = '1';
                    inBitCount.max = '1';
                    inBitCount.disabled = true;
                    inEndian.disabled = true;
                    inEndian.style.opacity = '0.45';
                    inEndian.style.cursor = 'not-allowed';
                    inEndian.innerHTML = '<option value="none">- 无 -</option>';
                    inEndian.value = 'none';
                    field.endianness = 'none';
                } else if (selType === 'u8') {
                    const curC = parseInt(inBitCount.value) || 8;
                    inBitCount.max = '8';
                    inBitCount.disabled = false;
                    if (curC > 8 || curC < 1) inBitCount.value = '8';
                    inEndian.disabled = true;
                    inEndian.style.opacity = '0.45';
                    inEndian.style.cursor = 'not-allowed';
                    inEndian.innerHTML = '<option value="none">- 无 -</option>';
                    inEndian.value = 'none';
                    field.endianness = 'none';
                } else { // u16
                    inBitCount.max = '16';
                    inBitCount.disabled = false;
                    inBitCount.value = '16';
                    inEndian.disabled = false;
                    inEndian.style.opacity = '1';
                    inEndian.style.cursor = 'pointer';
                    const targetEndian = (field.endianness === 'big') ? 'big' : 'little';
                    inEndian.innerHTML = `
                        <option value="little" ${targetEndian === 'little' ? 'selected' : ''}>小端(LSB)</option>
                        <option value="big" ${targetEndian === 'big' ? 'selected' : ''}>大端(MSB)</option>
                    `;
                    inEndian.value = targetEndian;
                    field.endianness = targetEndian;
                }
                onCardChange();
            });

            inName.addEventListener('input', onCardChange);
            inStart.addEventListener('input', onCardChange);
            inBitCount.addEventListener('input', onCardChange);
            inEndian.addEventListener('change', onCardChange);
            inRes.addEventListener('input', onCardChange);
            inOffset.addEventListener('input', onCardChange);
            inMin.addEventListener('input', onCardChange);
            inMax.addEventListener('input', onCardChange);
            inUnit.addEventListener('input', onCardChange);
            if (inRemark) inRemark.addEventListener('input', onCardChange);

            // 点击配置字典按钮
            card.querySelector('.btn-edit-field-dict').addEventListener('click', () => {
                openDictModal(field, `字段 [${field.name || '未命名字段'}]`, () => {
                    renderFieldsTable(word);
                    updateCompactSim(word);
                });
            });

            // 克隆字段 (生成一个属性完全一致的新字段)
            const btnClone = card.querySelector('.btn-clone-field');
            if (btnClone) {
                btnClone.addEventListener('click', () => {
                    const cloned = JSON.parse(JSON.stringify(field));

                    // 保持原字段名称，不添加“副本”后缀
                    cloned.name = field.name || '字段';
                    cloned.key = `sig_${Date.now().toString().slice(-6)}`;

                    // 插入到当前字段正后方
                    word.signals.splice(fIdx + 1, 0, cloned);

                    // 起始位重算联动
                    if (isBitstream && word.signals.length > 0) {
                        word.signals.forEach((s, idx) => {
                            if (idx === 0) {
                                s.startBit = Number(s.startBit) || 9;
                            } else {
                                const prev = word.signals[idx - 1];
                                s.startBit = (Number(prev.startBit) || 9) + (Number(prev.bitCount || prev.length) || 1);
                            }
                        });
                    } else if (!isBitstream) {
                        cloned.startBit = Math.min(29, (Number(field.startBit) || 11) + (Number(field.bitCount || field.length) || 1));
                    }

                    renderFieldsTable(word);
                    updateCompactSim(word);
                    renderArincWordsList();
                });
            }

            // 删除字段
            card.querySelector('.btn-del-field').addEventListener('click', () => {
                word.signals.splice(fIdx, 1);
                if (isBitstream && word.signals.length > 0) {
                    word.signals.forEach((s, idx) => {
                        if (idx === 0) {
                            s.startBit = Number(s.startBit) || 9;
                        } else {
                            const prev = word.signals[idx - 1];
                            s.startBit = (Number(prev.startBit) || 9) + (Number(prev.bitCount || prev.length) || 1);
                        }
                    });
                }
                renderFieldsTable(word);
                updateCompactSim(word);
                renderArincWordsList();
            });

            arincFieldsTbody.appendChild(card);
        });
    }

    // 添加具体字段 (自由bit模式下默认从9起依次累加，默认物理量为空)
    let lastAddFieldTime = 0;
    function addField() {
        const now = Date.now();
        if (now - lastAddFieldTime < 200) return; // 200ms 防重复触发
        lastAddFieldTime = now;

        if (!currentArincProtocol) return;
        if (!currentArincProtocol.words || currentArincProtocol.words.length === 0) {
            if (btnAddWord) {
                btnAddWord.click();
            }
            if (!currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
        }
        const word = currentArincProtocol.words[currentWordIndex];
        if (!word) return;
        if (!word.signals) word.signals = [];

        const isBitstream = (currentArincProtocol && currentArincProtocol.mode === 'bitstream') || (word.editMode === 'bitstream');
        const defaultStart = isBitstream ? 9 : 11;
        const maxPayloadBit = 29;

        let nextStartBit = defaultStart;
        if (word.signals.length > 0) {
            if (isBitstream) {
                // 自由 Bit 模式：依次根据前一个字段累加计算
                const lastField = word.signals[word.signals.length - 1];
                const lastStart = Number(lastField.startBit !== undefined && lastField.startBit !== null ? lastField.startBit : 9);
                const lastCount = Number(lastField.bitCount || lastField.length || 1);
                nextStartBit = lastStart + lastCount;
            } else {
                let maxEnd = 0;
                word.signals.forEach(s => {
                    const sEnd = (Number(s.startBit) || defaultStart) + (Number(s.bitCount || s.length) || 1) - 1;
                    if (sEnd > maxEnd) maxEnd = sEnd;
                });
                nextStartBit = maxEnd < maxPayloadBit ? maxEnd + 1 : defaultStart;
            }
        } else {
            nextStartBit = defaultStart;
        }

        const maxAvail = Math.max(1, maxPayloadBit - nextStartBit + 1);
        const defaultLen = maxAvail >= 16 ? 16 : Math.max(1, maxAvail);
        const defaultType = defaultLen >= 16 ? 'u16' : (defaultLen === 1 ? 'bool' : 'u8');

        const newField = {
            key: `sig_${word.signals.length + 1}`,
            name: `字段_${word.signals.length + 1}`,
            dataType: defaultType,
            startBit: nextStartBit,
            bitCount: defaultType === 'u16' ? 16 : defaultLen,
            length: defaultType === 'u16' ? 16 : defaultLen,
            endianness: defaultType === 'u16' ? 'little' : 'none',
            resolution: '',
            precision: '',
            offset: '',
            min: '',
            max: '',
            unit: '',
            dict: {},
            defaultValue: 0,
            remark: ''
        };
        word.signals.push(newField);

        renderFieldsTable(word);
        updateCompactSim(word);
        renderArincWordsList();
    }
    window.addField = addField;

    // ----------------- 数据字典弹窗编辑器 -----------------
    function openDictModal(targetObj, title, onApplyCallback, dictProp = 'dict') {
        activeDictTarget = {
            target: targetObj,
            dictProp: dictProp,
            callback: onApplyCallback
        };

        dictFieldTargetName.textContent = title;
        renderDictItemsTable(targetObj[dictProp] || {});
        dictEditorModal.classList.add('active');
    }

    function renderDictItemsTable(dictObj) {
        dictItemsTbody.innerHTML = '';
        const entries = Object.entries(dictObj);

        if (entries.length === 0) {
            // 默认添加一行空行
            addDictRow('', '');
            return;
        }

        entries.forEach(([k, v]) => {
            addDictRow(k, v);
        });
    }

    function addDictRow(key = '', val = '') {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="dict-item-key" value="${key}" placeholder="编码(如0,1)"></td>
            <td><input type="text" class="dict-item-val" value="${val}" placeholder="含义描述(如有效/正常)"></td>
            <td style="text-align:center;">
                <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()" style="padding:0.2rem 0.4rem;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </td>
        `;
        dictItemsTbody.appendChild(tr);
    }

    // 保存并应用字典
    if (btnSaveDict) {
        btnSaveDict.addEventListener('click', () => {
            if (!activeDictTarget) return;

            const newDict = {};
            const rows = dictItemsTbody.querySelectorAll('tr');
            rows.forEach(r => {
                const k = r.querySelector('.dict-item-key').value.trim();
                const v = r.querySelector('.dict-item-val').value.trim();
                if (k !== '') {
                    newDict[k] = v;
                }
            });

            const prop = activeDictTarget.dictProp || 'dict';
            activeDictTarget.target[prop] = newDict;
            if (activeDictTarget.callback) activeDictTarget.callback();
            dictEditorModal.classList.remove('active');
        });
    }

    if (btnAddDictRow) {
        btnAddDictRow.addEventListener('click', () => addDictRow('', ''));
    }

    // 字典预设快捷按钮
    if (dictPresetButtons) {
        dictPresetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-preset');
                let dictData = {};
                if (preset === 'valid_invalid') {
                    dictData = { "0": "正常有效 (Valid)", "1": "故障失效 (Invalid)" };
                } else if (preset === 'on_off') {
                    dictData = { "0": "关闭 (OFF)", "1": "开启 (ON)" };
                } else if (preset === 'normal_warn') {
                    dictData = { "0": "正常 (Normal)", "1": "告警 (Warning)" };
                } else if (preset === 'four_states') {
                    dictData = { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };
                }
                renderDictItemsTable(dictData);
            });
        });
    }

    // SDI & SSM 字典配置按钮
    if (btnEditSdiDict) {
        btnEditSdiDict.addEventListener('click', () => {
            if (!currentArincProtocol || !currentArincProtocol.words) return;
            const word = currentArincProtocol.words[currentWordIndex];
            if (!word) return;
            if (!word.sdiDict) {
                word.sdiDict = { "0": "全部系统 (All)", "1": "系统 1 (左侧)", "2": "系统 2 (右侧)", "3": "系统 3 (备用)" };
            }
            openDictModal(word, `SDI 识别码字典 (B9~B10) [${word.name || word.label}]`, () => {
                updateSdiSelectOptions(word);
                updateCompactSim(word);
            }, 'sdiDict');
        });
    }

    const onEditSsmDict = () => {
        if (!currentArincProtocol) return;
        if (!currentArincProtocol.ssmDict) {
            currentArincProtocol.ssmDict = (currentArincProtocol.words && currentArincProtocol.words[0] && currentArincProtocol.words[0].ssmDict) || {
                "0": "正常运算 (Normal)",
                "1": "无计算数据 (NCD)",
                "2": "功能测试 (FT)",
                "3": "故障告警 (Fail)"
            };
        }
        openDictModal(currentArincProtocol, `SSM 状态矩阵字典 (B30~B31) [协议全局生效]`, () => {
            // 同步到协议下的所有数据字
            if (currentArincProtocol.words) {
                currentArincProtocol.words.forEach(w => {
                    w.ssmDict = currentArincProtocol.ssmDict;
                });
            }
            const word = currentArincProtocol.words ? currentArincProtocol.words[currentWordIndex] : null;
            if (word) {
                updateSsmSelectOptions(word);
                updateCompactSim(word);
            }
        }, 'ssmDict');
    };

    if (btnEditSsmDict) btnEditSsmDict.addEventListener('click', onEditSsmDict);
    if (btnEditBsSsmDict) btnEditBsSsmDict.addEventListener('click', onEditSsmDict);

    // ----------------- 紧凑型实时仿真条 -----------------
    function updateCompactSim(word) {
        const encoded = Arinc429Helper.encodeFullWord({
            labelOctal: word.label || '000',
            editMode: word.editMode || 'classic',
            sdi: word.sdi || 0,
            ssm: word.ssm !== undefined ? word.ssm : 0,
            signalsConfig: word.signals || [],
            signalValues: {},
            parityMode: currentArincProtocol ? currentArincProtocol.parity : 'odd'
        });

        simHexOutput.textContent = encoded.hex;
        simBinaryOutput.textContent = encoded.binary.replace(/(.{4})/g, '$1 ').trim();
    }

    // 复制 Hex
    if (btnCopyHex) {
        btnCopyHex.addEventListener('click', () => {
            const hexText = simHexOutput ? simHexOutput.textContent : '';
            const showSuccess = () => {
                const orig = btnCopyHex.innerHTML;
                btnCopyHex.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i>';
                setTimeout(() => btnCopyHex.innerHTML = orig, 1000);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(hexText).then(showSuccess).catch(() => {
                    fallbackCopy(hexText, showSuccess);
                });
            } else {
                fallbackCopy(hexText, showSuccess);
            }
        });
    }

    function fallbackCopy(text, cb) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (cb) cb();
        } catch(e) {}
    }

    // 快速解码测试
    if (btnSimDecode) {
        btnSimDecode.addEventListener('click', () => {
            const raw = simDecoderInput.value.trim().replace(/0x/gi, '');
            if (raw.length !== 8) {
                alert("请输入 8 位 16 进制字符 (32 位 ARINC 字)！");
                return;
            }
            const word = (currentArincProtocol && currentArincProtocol.words) ? currentArincProtocol.words[currentWordIndex] : {};
            const res = Arinc429Helper.decodeFullWord(raw, word);

            let msg = `【解码结果】\n标号: ${res.label.octal}₈ (${res.label.hex})\n奇偶校验: ${res.parity.valid ? '正确 (Pass)' : '错误 (Fail)'}\nSSM: ${res.ssm.desc}\nSDI: ${res.sdi.desc}\n\n【字段解析】:\n`;
            res.signals.forEach(s => {
                msg += `• ${s.name}: ${s.formatted} ${s.unit} (Raw: ${s.rawHex})\n`;
            });
            alert(msg);
        });
    }


    // ----------------- 事件监听绑定 -----------------
    if (btnAddField) {
        btnAddField.addEventListener('click', addField);
    }

    // 添加数据字
    let lastAddWordTime = 0;
    function addWord() {
        const now = Date.now();
        if (now - lastAddWordTime < 200) return; // 200ms 防重复触发
        lastAddWordTime = now;

        if (!currentArincProtocol) return;
        if (!currentArincProtocol.words) currentArincProtocol.words = [];

        // 智能计算未使用的标号 (从当前选中的字或最后一个字标号 +1 开始自增)
        const usedLabels = new Set(currentArincProtocol.words.map(w => (w.label || '').toString().padStart(3, '0')));
        let startDec = 1;
        if (currentArincProtocol.words.length > 0) {
            const anchorWord = currentArincProtocol.words[currentWordIndex] || currentArincProtocol.words[currentArincProtocol.words.length - 1];
            const octStr = (anchorWord.label || '001').toString().padStart(3, '0');
            const d = parseInt(octStr, 8);
            if (!isNaN(d)) startDec = d + 1;
        }

        let nextLabel = '';
        for (let dec = startDec; dec <= 255; dec++) {
            const octStr = dec.toString(8).padStart(3, '0');
            if (!usedLabels.has(octStr)) {
                nextLabel = octStr;
                break;
            }
        }
        if (!nextLabel) {
            for (let dec = 1; dec <= 255; dec++) {
                const octStr = dec.toString(8).padStart(3, '0');
                if (!usedLabels.has(octStr)) {
                    nextLabel = octStr;
                    break;
                }
            }
        }
        if (!nextLabel) {
            nextLabel = (startDec).toString(8).padStart(3, '0');
        }

        const curMode = (currentArincProtocol && currentArincProtocol.mode) || 'classic';
        const newWord = {
            label: nextLabel,
            key: `word_${nextLabel}`,
            name: `数据字_${nextLabel}`,
            source: (currentArincProtocol && (currentArincProtocol.device || currentArincProtocol.source)) || '机载航电系统',
            editMode: curMode,
            ssm: 0,
            ssmType: 'BNR',
            period: (currentArincProtocol && currentArincProtocol.period) || 20,
            timeoutMs: ((currentArincProtocol && currentArincProtocol.period) || 20) * 3,
            sendMode: 'cyclic',
            direction: (currentArincProtocol && currentArincProtocol.direction) || 'Tx',
            channel: 'CH1',
            sdi: 0,
            sdiDict: { "0": "全部系统 (All)", "1": "系统 1 (左侧)", "2": "系统 2 (右侧)", "3": "系统 3 (备用)" },
            ssmDict: { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" },
            signals: [
                {
                    key: 'main_value',
                    name: '主数值字段',
                    dataType: 'u16',
                    bitCount: 16,
                    startBit: curMode === 'bitstream' ? 9 : 11,
                    length: 16,
                    endianness: 'big',
                    resolution: '',
                    precision: '',
                    offset: '',
                    min: '',
                    max: '',
                    unit: '',
                    dict: {},
                    defaultValue: 0,
                    remark: ''
                }
            ]
        };

        currentArincProtocol.words.push(newWord);
        currentWordIndex = currentArincProtocol.words.length - 1;
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
        if (window.innerWidth <= 768) {
            setMobileArincView('detail');
        }
    }
    window.addWord = addWord;

    if (btnAddWord) {
        btnAddWord.addEventListener('click', addWord);
    }

    // 克隆字 (标号自动加 1，按八进制自增并跳过冲突标号)
    if (btnDuplicateWord) {
        btnDuplicateWord.addEventListener('click', () => {
            if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
            const cur = currentArincProtocol.words[currentWordIndex];
            const dup = JSON.parse(JSON.stringify(cur));

            // 计算所有已使用的八进制标号集合
            const usedLabels = new Set(currentArincProtocol.words.map(w => (w.label || '').toString().padStart(3, '0')));
            
            // 当前标号转为十进制数值，然后尝试 +1 递增（逢 8 进位）
            const curOctalStr = (cur.label || '001').toString().padStart(3, '0');
            let curDecVal = parseInt(curOctalStr, 8);
            if (isNaN(curDecVal)) curDecVal = 1;

            let nextOctalStr = '';
            // 从当前标号 + 1 开始寻找下一个合法的未被占用的八进制标号 (000 ~ 377)
            for (let dec = curDecVal + 1; dec <= 255; dec++) {
                const octStr = dec.toString(8).padStart(3, '0');
                if (!usedLabels.has(octStr)) {
                    nextOctalStr = octStr;
                    break;
                }
            }
            // 如果往后已达上限 377，则从 001 开始往前查找可用标号
            if (!nextOctalStr) {
                for (let dec = 1; dec <= 255; dec++) {
                    const octStr = dec.toString(8).padStart(3, '0');
                    if (!usedLabels.has(octStr)) {
                        nextOctalStr = octStr;
                        break;
                    }
                }
            }
            if (!nextOctalStr) {
                nextOctalStr = (curDecVal + 1).toString(8).padStart(3, '0');
            }

            dup.label = nextOctalStr;
            dup.name = cur.name || '数据字';
            dup.key = `word_${nextOctalStr}`;
            currentArincProtocol.words.splice(currentWordIndex + 1, 0, dup);
            currentWordIndex++;
            renderArincWordsList();
            renderSelectedWordInspector();
            if (window.innerWidth <= 768) {
                setMobileArincView('detail');
            }
        });
    }

    // 删除字
    if (btnDeleteWord) {
        btnDeleteWord.addEventListener('click', () => {
            if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
            if (confirm(`确定要删除标号字 [${currentArincProtocol.words[currentWordIndex].label} ${currentArincProtocol.words[currentWordIndex].name}] 吗？`)) {
                currentArincProtocol.words.splice(currentWordIndex, 1);
                if (currentWordIndex >= currentArincProtocol.words.length) {
                    currentWordIndex = Math.max(0, currentArincProtocol.words.length - 1);
                }
                updateSourceFilterOptions();
                renderArincWordsList();
                renderSelectedWordInspector();
            }
        });
    }

    // 字属性表单联动 (标号、字名称、周期联动只读超时)
    if (wordLabelOctal) {
        wordLabelOctal.addEventListener('input', (e) => {
            let val = e.target.value.replace(/[^0-7]/g, '').slice(0, 3);
            e.target.value = val;
            if (currentArincProtocol && currentArincProtocol.words && currentArincProtocol.words[currentWordIndex]) {
                currentArincProtocol.words[currentWordIndex].label = val;
                const byteVal = Arinc429Helper.octalToLabelByte(val);
                const hexVal = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
                if (labelConversionHelper) {
                    labelConversionHelper.textContent = `Hex:${hexVal}`;
                    labelConversionHelper.title = `十进制数值: ${byteVal}`;
                }
                if (classicLabelVal) classicLabelVal.textContent = `${val}₈`;
                if (detailLabelBadge) detailLabelBadge.textContent = `${val}₈`;
                renderArincWordsList();
                updateCompactSim(currentArincProtocol.words[currentWordIndex]);
            }
        });
    }

    if (wordName) {
        wordName.addEventListener('input', (e) => {
            if (currentArincProtocol && currentArincProtocol.words && currentArincProtocol.words[currentWordIndex]) {
                currentArincProtocol.words[currentWordIndex].name = e.target.value;
                if (detailWordTitle) detailWordTitle.textContent = e.target.value || '未命名数据字';
                renderArincWordsList();
            }
        });
    }

    if (badgeProtoPeriod) {
        badgeProtoPeriod.addEventListener('click', () => {
            openProps429Modal();
            setTimeout(() => { if (props429Period) props429Period.focus(); }, 150);
        });
    }

    if (wordPeriodBadge) {
        wordPeriodBadge.addEventListener('click', () => {
            openProps429Modal();
            setTimeout(() => { if (props429Period) props429Period.focus(); }, 150);
        });
    }

    if (wordSdi) {
        wordSdi.addEventListener('change', (e) => {
            if (currentArincProtocol && currentArincProtocol.words && currentArincProtocol.words[currentWordIndex]) {
                currentArincProtocol.words[currentWordIndex].sdi = Number(e.target.value);
                updateCompactSim(currentArincProtocol.words[currentWordIndex]);
            }
        });
    }

    const onSsmChange = (e) => {
        if (currentArincProtocol && currentArincProtocol.words && currentArincProtocol.words[currentWordIndex]) {
            const val = Number(e.target.value);
            currentArincProtocol.words[currentWordIndex].ssm = val;
            if (wordSsm) wordSsm.value = val;
            if (bsWordSsm) bsWordSsm.value = val;
            updateCompactSim(currentArincProtocol.words[currentWordIndex]);
        }
    };
    if (wordSsm) wordSsm.addEventListener('change', onSsmChange);
    if (bsWordSsm) bsWordSsm.addEventListener('change', onSsmChange);

    // 搜索与来源过滤
    if (arincWordSearch) {
        arincWordSearch.addEventListener('input', (e) => {
            wordSearchQuery = e.target.value.trim();
            renderArincWordsList();
        });
    }

    if (arincSourceFilter) {
        arincSourceFilter.addEventListener('change', (e) => {
            sourceFilter = e.target.value;
            renderArincWordsList();
        });
    }

    if (wordFilterButtons) {
        wordFilterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                wordFilterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                wordFilter = btn.getAttribute('data-filter');
                renderArincWordsList();
            });
        });
    }

    // 协议切换与顶部按钮
    if (btnArincBack) {
        btnArincBack.addEventListener('click', () => {
            switchToView('protocol-view');
        });
    }

    if (btnArincNew) {
        btnArincNew.addEventListener('click', () => {
            openCreate429Modal();
        });
    }

    // 查看或修改协议属性 (弹出属性对话框)
    if (btnViewArincProps) {
        btnViewArincProps.addEventListener('click', () => {
            openProps429Modal();
        });
    }

    if (arincProtocolSelect) {
        arincProtocolSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                loadArincProtocolIntoEditor(Number(e.target.value));
            }
        });
    }

    // ----------------- 新建协议表单提交 -----------------
    if (arincCreateForm) {
        arincCreateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const protoType = (create429Type ? create429Type.value : 'ARINC429') || 'ARINC429';
                const name = (create429Name ? create429Name.value.trim() : '') || '新建通信协议';
                const product = (create429Product ? create429Product.value.trim() : '');
                if (product) {
                    await dbHelper.saveProduct({ name: product });
                }
                const device = (create429Device ? create429Device.value.trim() : '') || (product ? `${product}系统` : '机载航电系统');
                const direction = create429Direction ? create429Direction.value : 'Tx';
                const speed = create429Speed ? create429Speed.value : '100kbps';
                const parity = create429Parity ? create429Parity.value : 'odd';
                const mode = create429Mode ? create429Mode.value : 'classic';
                const desc = (create429Desc ? create429Desc.value.trim() : '') || '通信总线协议';

                if (protoType === 'CAN' || protoType === 'Serial') {
                    const newProto = {
                        name: name,
                        product: product,
                        type: protoType,
                        device: device,
                        direction: direction,
                        speed: speed,
                        description: desc,
                        frames: [
                            {
                                frameId: protoType === 'CAN' ? '0x18F00100' : '0xAA55',
                                frameName: '默认通信报文',
                                signals: [
                                    { name: '通道状态', startBit: 0, length: 8, endianness: 'little', scale: 1, offset: 0, unit: '' }
                                ]
                            }
                        ]
                    };

                    // 若关联工作目录，同步生成本地硬盘文件
                    if (currentWorkspaceHandle) {
                        try {
                            const safeName = (newProto.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                            const fileName = `${safeName}.json`;
                            newProto._fileName = fileName;
                            newProto._fromWorkspace = true;
                            const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(JSON.stringify(newProto, null, 2));
                            await writable.close();
                        } catch (diskErr) {
                            console.warn("向工作目录写入新建协议文件失败:", diskErr);
                        }
                    }

                    const id = await dbHelper.saveProtocol(newProto);
                    newProto.id = id;
                    if (arincCreateModal) arincCreateModal.classList.remove('active');
                    await loadProtocols();
                    await loadProtocolsForSelect();
                    switchToView('protocol-view');
                    return;
                }

                const period = parseInt(create429Period ? create429Period.value : 20) || 20;

                const words = [
                    {
                        label: '001',
                        key: 'word_001',
                        name: '主遥测字',
                        source: device,
                        editMode: mode,
                        ssmType: 'BNR',
                        period: period,
                        timeoutMs: period * 3,
                        sendMode: 'cyclic',
                        direction: direction,
                        channel: 'CH1',
                        sdi: 0,
                        sdiDict: { "0": "全部系统 (All)", "1": "左侧系统 (Left)", "2": "右侧系统 (Right)", "3": "备用系统 (Aux)" },
                        ssmDict: { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" },
                        signals: [
                            {
                                key: 'main_value',
                                name: '主数值字段',
                                dataType: 'u16',
                                bitCount: 16,
                                startBit: mode === 'bitstream' ? 9 : 11,
                                length: 16,
                                endianness: 'little',
                                resolution: '',
                                precision: '',
                                offset: '',
                                min: '',
                                max: '',
                                unit: '',
                                dict: {},
                                defaultValue: 0,
                                remark: ''
                            }
                        ]
                    }
                ];

                const newProto = {
                    name: name,
                    product: product,
                    type: 'ARINC429',
                    mode: mode,
                    period: period,
                    device: device,
                    source: device,
                    direction: direction,
                    speed: speed,
                    parity: parity,
                    description: desc,
                    words: words
                };

                // 若已关联本地工作目录，直接在本地工作目录中创建物理 .json 文件
                if (currentWorkspaceHandle) {
                    try {
                        const safeName = (newProto.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                        const fileName = `${safeName}.json`;
                        newProto._fileName = fileName;
                        newProto._fromWorkspace = true;
                        const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(newProto, null, 2));
                        await writable.close();
                    } catch (diskErr) {
                        console.warn("向工作目录写入新建协议文件失败:", diskErr);
                    }
                }

                // 若处于云端工作台模式，同步写入 Cloudflare 云端
                if (activeWorkspaceMode === 'cloud') {
                    try {
                        const cloudRes = await cloudApiCall('/api/protocols', 'POST', newProto);
                        if (cloudRes.ok && cloudRes.data && cloudRes.data.success) {
                            newProto._cloudKey = cloudRes.data.key;
                            newProto._fromCloud = true;
                        }
                    } catch (cloudErr) {
                        console.warn("向云端写入新建协议失败:", cloudErr);
                    }
                }

                const id = await dbHelper.saveProtocol(newProto);
                newProto.id = id;
                currentArincProtocol = newProto;
                currentWordIndex = 0;

                if (arincCreateModal) arincCreateModal.classList.remove('active');

                switchToView('arinc429-view');
                await loadArincProtocolsForSelect();
                await loadProtocols();
                await loadArincProtocolIntoEditor(id);
            } catch (err) {
                console.error("创建协议失败:", err);
                alert("创建协议异常: " + err.message);
            }
        });
    }

    // ----------------- 协议属性修改表单提交 -----------------
    if (arincPropsForm) {
        arincPropsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const targetId = Number(props429Id ? props429Id.value : 0);
                let targetProto = currentArincProtocol;
                if (targetId && (!currentArincProtocol || currentArincProtocol.id !== targetId)) {
                    targetProto = await dbHelper.getProtocol(targetId);
                }
                if (!targetProto) return;

                targetProto.name = (props429Name ? props429Name.value.trim() : '') || '未命名429协议';
                const newProduct = (props429Product ? props429Product.value.trim() : '');
                targetProto.product = newProduct;
                if (newProduct) {
                    await dbHelper.saveProduct({ name: newProduct });
                }
                targetProto.device = props429Device ? props429Device.value.trim() : '';
                targetProto.source = targetProto.device;
                targetProto.direction = props429Direction ? props429Direction.value : 'Tx';
                targetProto.speed = props429Speed ? props429Speed.value : '100kbps';
                targetProto.parity = props429Parity ? props429Parity.value : 'odd';
                targetProto.mode = props429Mode ? props429Mode.value : 'classic';
                const newPeriod = parseInt(props429Period ? props429Period.value : 20) || 20;
                targetProto.period = newPeriod;
                targetProto.description = props429Desc ? props429Desc.value.trim() : '';

                // 统一子字的划分模式、全局周期与方向
                if (targetProto.words) {
                    targetProto.words.forEach(w => {
                        w.editMode = targetProto.mode;
                        w.period = newPeriod;
                        w.direction = targetProto.direction;
                    });
                }

                const savedId = await dbHelper.saveProtocol(targetProto);
                targetProto.id = savedId;

                if (currentArincProtocol && currentArincProtocol.id === savedId) {
                    currentArincProtocol = targetProto;
                    updateToolbarProtocolInfo();
                    renderArincWordsList();
                    renderSelectedWordInspector();
                }

                if (arincPropsModal) arincPropsModal.classList.remove('active');

                await refreshProductDatalist();
                await loadArincProtocolsForSelect();
                await loadProtocols();
            } catch (err) {
                console.error("保存协议属性失败:", err);
                alert("保存协议属性异常: " + err.message);
            }
        });
    }

    if (btnArincImport) {
        btnArincImport.addEventListener('click', () => arincFileInput.click());
    }

    if (arincFileInput) {
        arincFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                importArincJson(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    if (btnArincSave) {
        btnArincSave.addEventListener('click', saveCurrentArincProtocol);
    }

    // 导入 / 导出 JSON (将协议作为模板文件直接保存在本地电脑硬盘，永久不丢失)
    function exportArincJson(silent = false) {
        if (!currentArincProtocol) {
            alert("暂无正在编辑的协议可导出！");
            return;
        }

        // 导出前先同步当前正在编辑的词条属性
        if (currentArincProtocol.words && currentArincProtocol.words[currentWordIndex]) {
            const curW = currentArincProtocol.words[currentWordIndex];
            if (wordLabelOctal && wordLabelOctal.value) curW.label = wordLabelOctal.value.trim();
            if (wordName && wordName.value !== undefined) curW.name = wordName.value.trim();
        }

        // 统一所有标号字的全局划分模式、全局周期与全局方向
        if (currentArincProtocol.words) {
            currentArincProtocol.words.forEach(w => {
                w.editMode = currentArincProtocol.mode || 'classic';
                w.period = currentArincProtocol.period || 20;
                w.direction = currentArincProtocol.direction || 'Tx';
            });
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentArincProtocol, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const fileName = `${safeName}.json`;
        dlAnchor.setAttribute("download", fileName);
        dlAnchor.click();

        if (!silent) {
            setTimeout(() => {
                alert(`已将协议模板「${fileName}」导出并下载到您的电脑本地！\n\n该文件永久保存在电脑硬盘中，不受任何浏览器缓存清理影响。下次需要时，直接点击顶部「导入模板」或在模板库中选择该文件即可完整还原！`);
            }, 100);
        }
    }
    window.exportArincJson = exportArincJson;

    // 根据指定协议ID直接导出本地文件
    window.exportProtocolById = async function(id) {
        const proto = await dbHelper.getProtocol(id);
        if (!proto) {
            alert("未找到该协议！");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(proto, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        const fileName = (proto.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_') + '.json';
        dlAnchor.setAttribute("download", fileName);
        dlAnchor.click();
        setTimeout(() => {
            alert(`协议「${proto.name}」已成功保存到您的电脑下载文件夹！\n\n文件不受浏览器清理影响，随时可通过「从电脑导入协议」载入。`);
        }, 100);
    };

    function importArincJson(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (!imported.words || !Array.isArray(imported.words)) {
                    alert("导入失败：所选文件不符合 ARINC 429 协议结构规范！");
                    return;
                }
                imported.type = 'ARINC429';
                if (!imported.mode) {
                    imported.mode = (imported.words && imported.words[0] && imported.words[0].editMode) || 'classic';
                }
                delete imported.id;

                // 若已连接工作目录，同步将导入的文件写入工作目录
                if (currentWorkspaceHandle) {
                    try {
                        const safeName = (imported.name || 'imported_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                        const fileName = file.name || `${safeName}.json`;
                        imported._fileName = fileName;
                        imported._fromWorkspace = true;
                        const fileHandle = await currentWorkspaceHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(JSON.stringify(imported, null, 2));
                        await writable.close();
                    } catch (e) {
                        console.warn("向工作目录写入导入协议失败:", e);
                    }
                }

                if (imported.product) {
                    await dbHelper.saveProduct({ name: imported.product });
                }

                const id = await dbHelper.saveProtocol(imported);
                imported.id = id;
                currentArincProtocol = imported;
                currentWordIndex = 0;
                switchToView('arinc429-view');
                updateToolbarProtocolInfo();
                await loadArincProtocolsForSelect();
                await loadProtocolsForSelect();
                await loadProtocols();
                updateSourceFilterOptions();
                renderArincWordsList();
                renderSelectedWordInspector();

                // 关闭模板库弹窗（如果当前是打开状态）
                if (arincTemplatesModal && arincTemplatesModal.classList.contains('active')) {
                    arincTemplatesModal.classList.remove('active');
                }

                alert(`成功从电脑载入 ARINC 429 协议「${imported.name}」，包含 ${imported.words.length} 个标号字！`);
            } catch (err) {
                alert("JSON 解析失败: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ----------------- 导出 Markdown / HTML 航电 IC 接口卡片规范 -----------------
    const tabBtnExportPreview = document.getElementById('tab-btn-export-view-preview');
    const tabBtnExportCode = document.getElementById('tab-btn-export-view-code');
    const exportPreviewContainer = document.getElementById('export-preview-container');
    const exportCodeContainer = document.getElementById('export-code-container');
    const exportRenderedPreview = document.getElementById('export-rendered-preview');
    const btnPrintPreviewHtml = document.getElementById('btn-print-preview-html');
    const btnDownloadHtmlSpec = document.getElementById('btn-download-html-spec');

    function openExportMdModal() {
        if (!currentArincProtocol) {
            alert('请先选择或创建一个 429 协议！');
            return;
        }
        const mdText = Arinc429Helper.generateMarkdownSpec(currentArincProtocol);
        if (exportMdCodeBlock) {
            exportMdCodeBlock.textContent = mdText;
        }

        // 渲染可视化预览
        if (exportRenderedPreview) {
            // 提取其中的 HTML 表格渲染
            const tablesHtml = mdText
                .replace(/^#\s+[^\n]+\n+/, '')
                .replace(/###\s+[^\n]+/g, (m) => `<h3 style="margin: 1.5rem 0 0.8rem 0; font-size: 15px; color: #1e293b;">${m.replace(/###\s+/, '')}</h3>`)
                .replace(/---/g, '<hr style="border:none; border-top:1px dashed #cbd5e1; margin: 2rem 0;">');
            
            exportRenderedPreview.innerHTML = `
                <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <h2 style="margin:0; font-size: 20px; font-weight:bold; color:#0f172a;">${currentArincProtocol.name || 'ARINC 429 通信协议'}</h2>
                        <div style="font-size:12px; color:#64748b; margin-top:4px;">设备来源: ${currentArincProtocol.device || currentArincProtocol.source || '-'} | 速率: ${currentArincProtocol.speed || '100kbps'}</div>
                    </div>
                    <div style="text-align:right; font-size:12px; color:#64748b;">
                        <div>符合标准: ARINC 429</div>
                        <div>数位格式: 32位 航电双列对照</div>
                    </div>
                </div>
                ${tablesHtml}
            `;
        }

        // 默认激活可视化视图
        if (tabBtnExportPreview && tabBtnExportCode && exportPreviewContainer && exportCodeContainer) {
            tabBtnExportPreview.classList.add('dense-btn-active');
            tabBtnExportCode.classList.remove('dense-btn-active');
            exportPreviewContainer.style.display = 'block';
            exportCodeContainer.style.display = 'none';
        }

        if (arincExportMdModal) {
            arincExportMdModal.classList.add('active');
        }
    }
    window.openExportMdModal = openExportMdModal;

    // 视图切换
    if (tabBtnExportPreview) {
        tabBtnExportPreview.addEventListener('click', () => {
            tabBtnExportPreview.classList.add('dense-btn-active');
            if (tabBtnExportCode) tabBtnExportCode.classList.remove('dense-btn-active');
            if (exportPreviewContainer) exportPreviewContainer.style.display = 'block';
            if (exportCodeContainer) exportCodeContainer.style.display = 'none';
        });
    }

    if (tabBtnExportCode) {
        tabBtnExportCode.addEventListener('click', () => {
            tabBtnExportCode.classList.add('dense-btn-active');
            if (tabBtnExportPreview) tabBtnExportPreview.classList.remove('dense-btn-active');
            if (exportPreviewContainer) exportPreviewContainer.style.display = 'none';
            if (exportCodeContainer) exportCodeContainer.style.display = 'block';
        });
    }

    // 打印 / 另存为 PDF
    if (btnPrintPreviewHtml) {
        btnPrintPreviewHtml.addEventListener('click', () => {
            if (!currentArincProtocol) return;
            const fullHtml = Arinc429Helper.generateHtmlSpec(currentArincProtocol);
            const printWin = window.open('', '_blank');
            if (printWin) {
                printWin.document.open();
                printWin.document.write(fullHtml);
                printWin.document.close();
                printWin.focus();
                setTimeout(() => {
                    printWin.print();
                }, 300);
            } else {
                alert("弹窗被浏览器拦截，请允许本页面的弹出窗口以进行打印预览。");
            }
        });
    }

    // 下载独立 HTML 卡片
    if (btnDownloadHtmlSpec) {
        btnDownloadHtmlSpec.addEventListener('click', () => {
            if (!currentArincProtocol) return;
            const fullHtml = Arinc429Helper.generateHtmlSpec(currentArincProtocol);
            const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
            const fileName = `${safeName}_接口卡片.html`;
            const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            const dl = document.createElement('a');
            dl.href = URL.createObjectURL(blob);
            dl.download = fileName;
            dl.click();
            URL.revokeObjectURL(dl.href);
        });
    }

    if (btnArincExportMd) {
        btnArincExportMd.addEventListener('click', openExportMdModal);
    }

    if (btnArincExport) {
        btnArincExport.addEventListener('click', () => exportArincJson());
    }

    // 一键复制 Markdown 到剪贴板
    if (btnCopyMd) {
        btnCopyMd.addEventListener('click', () => {
            if (!currentArincProtocol || !exportMdCodeBlock) return;
            const text = exportMdCodeBlock.textContent;
            const showSuccess = () => {
                const orig = btnCopyMd.innerHTML;
                btnCopyMd.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i> 已复制 Markdown!';
                setTimeout(() => btnCopyMd.innerHTML = orig, 1500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(showSuccess).catch(() => fallbackCopy(text, showSuccess));
            } else {
                fallbackCopy(text, showSuccess);
            }
        });
    }

    // 下载 .md 文件
    if (btnDownloadMd) {
        btnDownloadMd.addEventListener('click', () => {
            if (!currentArincProtocol || !exportMdCodeBlock) return;
            const text = exportMdCodeBlock.textContent;
            const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
            const fileName = `${safeName}_上位机协议规范.md`;
            const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
            const dl = document.createElement('a');
            dl.href = URL.createObjectURL(blob);
            dl.download = fileName;
            dl.click();
            URL.revokeObjectURL(dl.href);
        });
    }

    // 备份导出 JSON 文件
    if (btnDownloadJson) {
        btnDownloadJson.addEventListener('click', exportArincJson);
    }

    // ----------------- ARINC 429 协议工程健康度与逻辑一致性检查诊断器 -----------------
    const btnArincCheck = document.getElementById('btn-arinc-check');
    const arincCheckModal = document.getElementById('arinc-check-modal');
    const checkResultsContainer = document.getElementById('check-results-container');
    const btnRecheckProtocol = document.getElementById('btn-recheck-protocol');
    const checkSummaryHint = document.getElementById('check-summary-hint');

    function runProtocolHealthCheck() {
        if (!currentArincProtocol) {
            alert('请先选择或创建一个 429 协议！');
            return;
        }

        const issues = []; // { level: 'error'|'warning'|'info', title: string, desc: string, wordLabel?: string }
        const p = currentArincProtocol;
        const words = p.words || [];

        if (words.length === 0) {
            issues.push({
                level: 'warning',
                title: '协议为空',
                desc: '当前协议下暂无任何标号字，请在左侧点击「+ 添加字」开始划分协议。'
            });
        }

        // 1. 检查标号字是否合法、八进制格式、以及是否有重复 Label
        const labelMap = new Map(); // label -> [wordIndex]
        words.forEach((w, wIdx) => {
            const rawLabel = (w.label || '').toString().trim();
            // 校验八进制
            if (!rawLabel) {
                issues.push({
                    level: 'error',
                    title: `标号字缺失 Label`,
                    desc: `第 ${wIdx + 1} 个字「${w.name || '未命名'}」未填写八进制标号。`,
                    wordIndex: wIdx
                });
            } else if (!/^[0-7]{1,3}$/.test(rawLabel)) {
                issues.push({
                    level: 'error',
                    title: `标号非合法八进制数: [${rawLabel}]`,
                    desc: `字「${w.name || ''}」的标号为「${rawLabel}」，ARINC 429 标号必须为 000~377 的八进制数字 (不能包含 8 或 9)。`,
                    wordIndex: wIdx
                });
            } else {
                const octPadded = rawLabel.padStart(3, '0');
                if (!labelMap.has(octPadded)) {
                    labelMap.set(octPadded, []);
                }
                labelMap.get(octPadded).push({ index: wIdx, word: w });
            }
        });

        // 重复 Label 报错
        labelMap.forEach((occurrences, oct) => {
            if (occurrences.length > 1) {
                const names = occurrences.map(o => `第${o.index + 1}个字「${o.word.name || '未命名'}」`).join('、');
                issues.push({
                    level: 'error',
                    title: `重复的标号 Label [${oct}₈]`,
                    desc: `检测到 ${occurrences.length} 个数据字共用了同一个 Label [${oct}₈] (${names})。在同一总线上会导致接收方数据冲撞。`,
                    wordIndex: occurrences[0].index
                });
            }
        });

        // 2. 检查各字内部字段重名、Bit 重叠与超出 32 位限制
        const isReservedFieldName = (name) => {
            if (!name) return false;
            const clean = name.trim().toLowerCase();
            return clean === '预留' || clean === '保留' || clean === 'reserved' || clean.startsWith('预留') || clean.startsWith('保留') || clean.startsWith('reserved');
        };

        words.forEach((w, wIdx) => {
            const oct = (w.label || '000').toString().padStart(3, '0');
            const wName = w.name || `标号字_${oct}`;
            const fields = w.signals || [];
            const isBitstream = (p.mode === 'bitstream') || (w.editMode === 'bitstream');
            const maxPayloadBit = 29; // B30~B31 为 SSM, B32 为校验
            const minAllowedStart = isBitstream ? 9 : 11; // 经典模式 1~8:Label, 9~10:SDI

            if (fields.length === 0) {
                issues.push({
                    level: 'warning',
                    title: `字 [${oct}₈] 未划分任何字段`,
                    desc: `数据字 [${oct}₈ ${wName}] 没有任何信号字段卡片。`,
                    wordIndex: wIdx
                });
            }

            // 字内部重名检查 (仅排查同一个字内同名字段，避免生成代码变量名冲突；不同字复用同名字段属于标准航电设计，不报警)
            const localNameSet = new Set();
            // Bit 占用排查 (1~32)
            const bitOwners = new Array(33).fill(null);

            fields.forEach((f, fIdx) => {
                const fName = (f.name || '').trim();
                const fStart = Number(f.startBit || 1);
                const fCount = Number(f.bitCount || f.length || 1);
                const fEnd = fStart + fCount - 1;

                if (!fName) {
                    issues.push({
                        level: 'warning',
                        title: `[${oct}₈] 存在未命名字段`,
                        desc: `数据字 [${oct}₈ ${wName}] 的第 ${fIdx + 1} 个字段名称为空。`,
                        wordIndex: wIdx
                    });
                } else {
                    // 同一个字内部重名检查 (保留/预留字段允许字内重复划分)
                    if (localNameSet.has(fName) && !isReservedFieldName(fName)) {
                        issues.push({
                            level: 'error',
                            title: `[${oct}₈] 字内字段名重复: "${fName}"`,
                            desc: `数据字 [${oct}₈ ${wName}] 内部定义了多个同名为「${fName}」的字段，会导致上位机代码变量命名冲突。`,
                            wordIndex: wIdx
                        });
                    }
                    localNameSet.add(fName);
                }

                // 位段越界与重叠检查
                if (fStart < minAllowedStart) {
                    issues.push({
                        level: 'error',
                        title: `[${oct}₈] 字段起始位冲突: "${fName}" (起始于 B${fStart})`,
                        desc: isBitstream
                            ? `自由 Bit 模式下 Bit 1~8 为 Label 标号位，数据字段必须从 Bit 9 或之后开始。`
                            : `经典航电模式下 Bit 1~8 为 Label，Bit 9~10 为 SDI，数据字段必须从 Bit 11 或之后开始。`,
                        wordIndex: wIdx
                    });
                }

                if (fEnd > maxPayloadBit) {
                    issues.push({
                        level: 'error',
                        title: `[${oct}₈] 字段越界覆盖控制位: "${fName}" (B${fStart}~B${fEnd})`,
                        desc: `字段「${fName}」结束位达到 B${fEnd}。ARINC 429 协议规定 Bit 30~31 为 SSM 状态矩阵，Bit 32 为奇偶校验位，数据区最大只支持到 Bit 29。`,
                        wordIndex: wIdx
                    });
                }

                // 字段重叠检测
                for (let b = fStart; b <= Math.min(32, fEnd); b++) {
                    if (bitOwners[b] !== null) {
                        issues.push({
                            level: 'error',
                            title: `[${oct}₈] 位段重叠冲突: Bit ${b}`,
                            desc: `数据字 [${oct}₈ ${wName}] 中的字段「${fName}」与字段「${bitOwners[b]}」在 Bit ${b} 处发生重叠冲突！`,
                            wordIndex: wIdx
                        });
                        break;
                    }
                    bitOwners[b] = fName || `字段#${fIdx + 1}`;
                }

                // 范围倒置检查 (min > max)
                const minVal = (f.min !== undefined && f.min !== null && f.min !== '') ? Number(f.min) : null;
                const maxVal = (f.max !== undefined && f.max !== null && f.max !== '') ? Number(f.max) : null;
                if (minVal !== null && maxVal !== null && !isNaN(minVal) && !isNaN(maxVal)) {
                    if (minVal > maxVal) {
                        issues.push({
                            level: 'error',
                            title: `[${oct}₈] 范围大小颠倒: "${fName}" (${minVal} ~ ${maxVal})`,
                            desc: `数据字 [${oct}₈ ${wName}] 的字段「${fName}」最小值 (${minVal}) 大于最大值 (${maxVal})。`,
                            wordIndex: wIdx
                        });
                    }
                }
            });
        });

        // 渲染检查结果卡片
        renderCheckResults(issues);

        if (arincCheckModal) {
            arincCheckModal.classList.add('active');
        }
    }
    window.runProtocolHealthCheck = runProtocolHealthCheck;

    function renderCheckResults(issues) {
        if (!checkResultsContainer) return;
        checkResultsContainer.innerHTML = '';

        const errorCount = issues.filter(i => i.level === 'error').length;
        const warnCount = issues.filter(i => i.level === 'warning').length;
        const infoCount = issues.filter(i => i.level === 'info').length;

        // 顶部统计条
        const summaryCard = document.createElement('div');
        summaryCard.className = `check-card ${errorCount > 0 ? 'card-error' : (warnCount > 0 ? 'card-warning' : 'card-success')}`;
        summaryCard.style.padding = '14px 18px';
        summaryCard.style.marginBottom = '14px';

        let summaryIcon = errorCount > 0 ? 'fa-circle-xmark' : (warnCount > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check');
        let summaryTitle = errorCount > 0 
            ? `发现 ${errorCount} 处工程严重错误，${warnCount} 处逻辑异常提示` 
            : (warnCount > 0 ? `未发现致命错误，但有 ${warnCount} 处逻辑警告提示` : '协议结构非常完美，未检测到任何冲突或逻辑异常！');

        summaryCard.innerHTML = `
            <div class="check-card-header">
                <div class="check-card-title" style="font-size: 15px;">
                    <i class="fa-solid ${summaryIcon}"></i> ${summaryTitle}
                </div>
                <div style="display:flex; gap:6px;">
                    <span class="check-tag check-tag-error"><i class="fa-solid fa-xmark"></i> 错误: ${errorCount}</span>
                    <span class="check-tag check-tag-warning"><i class="fa-solid fa-triangle-exclamation"></i> 警告: ${warnCount}</span>
                    <span class="check-tag check-tag-info"><i class="fa-solid fa-circle-info"></i> 提示: ${infoCount}</span>
                </div>
            </div>
            <div class="check-card-desc" style="color: var(--text-secondary); margin-top: 4px;">
                ${errorCount > 0 ? '建议优先修复下方的标号重复、位段越界或命名冲突，以免导致上位机通信或数据解码异常。' : '协议已满足 ARINC 429 总线规约与上位机代码生成标准要求。'}
            </div>
        `;
        checkResultsContainer.appendChild(summaryCard);

        if (issues.length === 0) {
            const allGoodCard = document.createElement('div');
            allGoodCard.className = 'check-card card-success';
            allGoodCard.innerHTML = `
                <div class="check-card-header">
                    <div class="check-card-title"><i class="fa-solid fa-shield-halved"></i> 所有健康度规则校验通过</div>
                </div>
                <div class="check-card-desc">
                    ✓ 所有标号字均为合法八进制格式且完全无重复 Label<br>
                    ✓ 各数据字内部字段名称无重叠，位段 (Bits) 严格约束在有效数据载荷区 (B9~B29)<br>
                    ✓ 信号范围数值逻辑正常，未出现倒置或离群突变
                </div>
            `;
            checkResultsContainer.appendChild(allGoodCard);
            return;
        }

        // 按照 error -> warning -> info 顺序排序输出
        const sorted = [...issues].sort((a, b) => {
            const order = { error: 0, warning: 1, info: 2 };
            return order[a.level] - order[b.level];
        });

        sorted.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = `check-card card-${item.level}`;

            let icon = item.level === 'error' ? 'fa-circle-xmark' : (item.level === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info');
            let levelLabel = item.level === 'error' ? '严重错误' : (item.level === 'warning' ? '逻辑警告' : '工程提示');

            card.innerHTML = `
                <div class="check-card-header">
                    <div class="check-card-title">
                        <i class="fa-solid ${icon}"></i> #${idx + 1}. ${item.title}
                    </div>
                    <div>
                        <span class="check-tag check-tag-${item.level}">${levelLabel}</span>
                    </div>
                </div>
                <div class="check-card-desc">
                    ${item.desc}
                </div>
            `;
            checkResultsContainer.appendChild(card);
        });
    }

    if (btnArincCheck) {
        btnArincCheck.addEventListener('click', runProtocolHealthCheck);
    }

    if (btnRecheckProtocol) {
        btnRecheckProtocol.addEventListener('click', runProtocolHealthCheck);
    }

    // ----------------- 全局快捷键绑定 (Ctrl + S / Cmd + S 拦截与保存) -----------------
    window.addEventListener('keydown', (e) => {
        // 判断是否按下了 Ctrl+S 或 Cmd+S (Mac)
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault(); // 阻止浏览器弹出原生的“另存为网页”窗口

            // 如果当前在 429 协议属性弹窗中，触发表单提交保存属性
            if (arincPropsModal && arincPropsModal.classList.contains('active')) {
                const savePropsBtn = document.getElementById('btn-save-props-submit');
                if (savePropsBtn) savePropsBtn.click();
                return;
            }

            // 如果当前在新建协议弹窗中，触发表单提交创建
            if (arincCreateModal && arincCreateModal.classList.contains('active')) {
                const saveCreateBtn = document.getElementById('btn-confirm-create-429');
                if (saveCreateBtn) saveCreateBtn.click();
                return;
            }

            // 如果在通用协议弹窗中
            if (protocolModal && protocolModal.classList.contains('active')) {
                const saveGenBtn = protocolModal.querySelector('button[type="submit"]');
                if (saveGenBtn) saveGenBtn.click();
                return;
            }

            // 如果在 ARINC 429 编辑工作台中，执行保存协议操作
            const arincView = document.getElementById('arinc429-view');
            if (arincView && arincView.classList.contains('active')) {
                if (currentArincProtocol) {
                    saveCurrentArincProtocol();
                }
                return;
            }

            // 如果在其他页面，有保存按钮则优先触发
            if (btnArincSave && currentArincProtocol) {
                saveCurrentArincProtocol();
            }
        }
    });

    // ----------------- 标号字列表侧边栏宽度鼠标拖拽调整 -----------------
    const workbenchResizer = document.getElementById('workbench-resizer');
    const arincWordsPanel = document.getElementById('arinc-words-panel');

    // 恢复历史记忆的面板宽度
    const savedWordsPanelWidth = localStorage.getItem('protoview_words_panel_width');
    if (savedWordsPanelWidth && arincWordsPanel) {
        const parsedW = parseInt(savedWordsPanelWidth, 10);
        if (parsedW >= 200 && parsedW <= 700) {
            arincWordsPanel.style.width = `${parsedW}px`;
        }
    }

    if (workbenchResizer && arincWordsPanel) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 340;

        workbenchResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = arincWordsPanel.getBoundingClientRect().width;

            workbenchResizer.classList.add('resizing');
            document.body.classList.add('resizing-active');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const deltaX = e.clientX - startX;
            let newWidth = startWidth + deltaX;

            // 限制拖拽最小 200px，最大 700px
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 700) newWidth = 700;

            arincWordsPanel.style.width = `${newWidth}px`;
        });

        window.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            workbenchResizer.classList.remove('resizing');
            document.body.classList.remove('resizing-active');

            const finalWidth = parseInt(arincWordsPanel.style.width, 10);
            if (!isNaN(finalWidth)) {
                localStorage.setItem('protoview_words_panel_width', finalWidth.toString());
            }
        });
    }

    // ----------------- 系统启动加载序列 -----------------
    async function initSystem() {
        try {
            if (window.dbHelper && window.dbHelper.initDemoData) {
                await window.dbHelper.initDemoData();
            }
        } catch (err) {
            console.warn("ProtoView: 演示数据初始化异常:", err);
        }

        // 初始化工作台模式 (本地硬盘目录 vs Cloudflare 云端工作台)
        try {
            setWorkspaceMode(activeWorkspaceMode, false);
            if (activeWorkspaceMode === 'cloud') {
                await syncCloudProtocols(false);
            } else {
                await tryRestoreWorkspaceDirectory();
            }
        } catch (wsErr) {
            console.warn("ProtoView: 初始化工作台异常:", wsErr);
        }

        try {
            await loadProtocols();
        } catch (err) {
            console.error("ProtoView: loadProtocols 失败:", err);
        }

        try {
            await loadProtocolsForSelect();
        } catch (err) {
            console.error("ProtoView: loadProtocolsForSelect 失败:", err);
        }

        try {
            await loadArincProtocolsForSelect();
        } catch (err) {
            console.error("ProtoView: loadArincProtocolsForSelect 失败:", err);
        }
    }

    // 立即执行启动加载序列
    initSystem();
});
