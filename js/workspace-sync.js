/**
 * @file workspace-sync.js
 * @brief ProtoView 本地工作目录 (File System Access) 与 Cloudflare 云端同步服务
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    let currentWorkspaceHandle = null;
    let isSyncRunning = false;
    let currentSyncDirection = 'disk-to-cloud';

    // 默认工作模式 (在不支持本地文件夹 API 的移动设备如手机上自动优先启用云端工作台)
    const supportsLocalDir = ('showDirectoryPicker' in window);
    let activeWorkspaceMode = localStorage.getItem('protoview_ws_mode') || (supportsLocalDir ? 'local' : 'cloud');

    // ----------------- IndexedDB 用于持久化存储 DirectoryHandle -----------------
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

    // ----------------- 更新本地工作空间 UI 状态 -----------------
    function updateWorkspaceUI(connected, folderName = '', badgeText = '') {
        const wsLocalStrip = document.getElementById('workspace-local-strip');
        const wsFolderName = document.getElementById('ws-folder-name');
        const wsStatusBadge = document.getElementById('ws-status-badge');
        const btnSetWorkspaceText = document.getElementById('btn-set-workspace-text');
        const btnRefreshWorkspace = document.getElementById('btn-refresh-workspace');
        const btnDisconnectWorkspace = document.getElementById('btn-disconnect-workspace');

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

    // ----------------- 工作模式切换 (本地硬盘 vs Cloudflare 云端) -----------------
    function setWorkspaceMode(mode, autoSync = true) {
        activeWorkspaceMode = mode;
        localStorage.setItem('protoview_ws_mode', mode);

        const btnModeLocal = document.getElementById('btn-mode-local');
        const btnModeCloud = document.getElementById('btn-mode-cloud');
        const wsLocalStrip = document.getElementById('workspace-local-strip');
        const wsCloudStrip = document.getElementById('workspace-cloud-strip');

        if (mode === 'cloud') {
            if (btnModeLocal) btnModeLocal.classList.remove('active');
            if (btnModeCloud) btnModeCloud.classList.add('active');
            if (wsLocalStrip) wsLocalStrip.style.display = 'none';
            if (wsCloudStrip) wsCloudStrip.style.display = 'flex';

            // 检查当前是否已登录账号
            const isLoggedIn = (ProtoView.Auth && typeof ProtoView.Auth.isLoggedIn === 'function')
                ? ProtoView.Auth.isLoggedIn()
                : (!!localStorage.getItem('protoview_auth_token'));

            if (!isLoggedIn) {
                if (ProtoView.Auth && ProtoView.Auth.openAuthModal) {
                    ProtoView.Auth.openAuthModal('login');
                }
            } else if (autoSync) {
                syncCloudProtocols(false);
            }
        } else {
            if (btnModeCloud) btnModeCloud.classList.remove('active');
            if (btnModeLocal) btnModeLocal.classList.add('active');
            if (wsCloudStrip) wsCloudStrip.style.display = 'none';
            if (wsLocalStrip) wsLocalStrip.style.display = 'flex';
        }
    }

    // ----------------- Cloudflare API 调用封装 -----------------
    async function cloudApiCall(endpoint, method = 'GET', body = null) {
        const authToken = (ProtoView.Auth && typeof ProtoView.Auth.getToken === 'function')
            ? ProtoView.Auth.getToken()
            : (localStorage.getItem('protoview_auth_token') || '');
        const authUser = (ProtoView.Auth && typeof ProtoView.Auth.getCurrentUser === 'function')
            ? ProtoView.Auth.getCurrentUser()
            : null;

        const wsId = (authUser && authUser.username)
            ? authUser.username.trim().toLowerCase()
            : (localStorage.getItem('protoview_cloud_ws') || 'default').trim().toLowerCase();
        const token = (localStorage.getItem('protoview_cloud_token') || '').trim();

        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('workspace', wsId);
        if (token) url.searchParams.set('token', token);
        if (authToken) url.searchParams.set('authToken', authToken);

        const headers = {
            'x-workspace-id': wsId
        };
        if (token) headers['x-workspace-token'] = token;
        if (authToken) {
            headers['x-auth-token'] = authToken;
            headers['Authorization'] = `Bearer ${authToken}`;
        }
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

    // ----------------- 同步从 Cloudflare 云端拉取协议 -----------------
    async function syncCloudProtocols(notifyUser = false) {
        const wsCloudName = document.getElementById('ws-cloud-name');
        const wsCloudStatusBadge = document.getElementById('ws-cloud-status-badge');
        const authUser = (ProtoView.Auth && typeof ProtoView.Auth.getCurrentUser === 'function')
            ? ProtoView.Auth.getCurrentUser()
            : null;
        const wsId = authUser ? authUser.username : (localStorage.getItem('protoview_cloud_ws') || 'default');
        const displayName = authUser ? (authUser.displayName || authUser.username) : wsId;

        if (wsCloudName) wsCloudName.textContent = authUser ? `专属空间: [${displayName}] (同步中...)` : `工作空间: [${wsId}] (同步中...)`;
        if (wsCloudStatusBadge) {
            wsCloudStatusBadge.textContent = '☁️ 正在同步...';
            wsCloudStatusBadge.className = 'ws-status-badge ws-cloud-status';
        }

        const res = await cloudApiCall('/api/protocols', 'GET');

        if (res.ok && res.data && res.data.success) {
            const list = res.data.protocols || [];
            if (wsCloudName) {
                wsCloudName.textContent = authUser ? `专属空间: [${displayName}] (${list.length} 个协议)` : `工作空间: [${wsId}] (${list.length} 个协议)`;
            }
            if (wsCloudStatusBadge) {
                wsCloudStatusBadge.textContent = `☁️ 已同步 (${list.length})`;
                wsCloudStatusBadge.style.color = '#10b981';
                wsCloudStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            }

            let loadedCount = 0;
            if (window.dbHelper) {
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
            }

            if (window.loadProtocols) await window.loadProtocols();
            if (window.loadArincProtocolsForSelect) await window.loadArincProtocolsForSelect();

            if (notifyUser) {
                alert(`已成功同步 Cloudflare 云端工作台 [${wsId}]！\n\n共拉取并同步 ${loadedCount} 个通信协议。在手机或电脑任意一端修改并保存，另一端点击刷新即可立即看到最新数据！`);
            }
        } else {
            if (res.status === 503) {
                if (wsCloudStatusBadge) wsCloudStatusBadge.textContent = '⚠️ KV 待绑定';
                if (wsCloudName) wsCloudName.textContent = `工作空间: [${wsId}] (Cloudflare KV 命名空间尚未绑定)`;
                if (notifyUser) {
                    alert(`云端接口连接成功，但 Cloudflare KV 数据库尚未绑定！\n\n请前往 Cloudflare 仪表盘 -> 您的 Pages 项目 -> 设置 -> 函数 (Functions) -> 绑定 KV 命名空间（变量名填 PROTOVIEW_KV）。`);
                }
            } else if (res.status === 401) {
                if (wsCloudStatusBadge) wsCloudStatusBadge.textContent = '🔒 未登录账号';
                if (wsCloudName) wsCloudName.textContent = `云端空间: 请先登录或注册您的专属账号`;
                if (notifyUser) {
                    if (confirm(`访问云端协议需要登录专属账号。\n\n是否立即登录或注册新账号？`)) {
                        if (ProtoView.Auth && ProtoView.Auth.openAuthModal) {
                            ProtoView.Auth.openAuthModal('login');
                        }
                    }
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

    // ----------------- 本地全部协议一键上传至云端工作台 -----------------
    async function uploadAllLocalProtocolsToCloud() {
        if (!window.dbHelper) return;
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

    // ----------------- 本地工作目录操作 -----------------
    async function chooseWorkspaceDirectory() {
        const workspaceFolderInput = document.getElementById('workspace-folder-input');
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

    async function scanAndSyncWorkspaceFiles(dirHandle, notifyUser = false) {
        if (!dirHandle || !window.dbHelper) return;
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
            if (window.loadProtocols) await window.loadProtocols();
            if (window.loadArincProtocolsForSelect) await window.loadArincProtocolsForSelect();

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

    async function disconnectWorkspaceDirectory() {
        if (confirm("确定要断开本地工作目录关联吗？\n\n断开后，系统不会删除您电脑硬盘上的物理文件。")) {
            currentWorkspaceHandle = null;
            await clearStoredWorkspaceHandleFromDB();
            localStorage.removeItem('protoview_workspace_name');
            updateWorkspaceUI(false);
            if (window.loadProtocols) await window.loadProtocols();
        }
    }

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
                    const btnSetWorkspaceText = document.getElementById('btn-set-workspace-text');
                    if (btnSetWorkspaceText) btnSetWorkspaceText.textContent = '授权访问';
                }
            }
        } catch (e) {
            console.warn("恢复工作目录句柄失败:", e);
        }
    }

    // ----------------- 硬盘与云端协议同步中心 (Sync Hub) -----------------
    async function refreshSyncHubStatus() {
        const syncLocalName = document.getElementById('sync-local-name');
        const syncLocalCountBadge = document.getElementById('sync-local-count-badge');
        const syncBtnPickDir = document.getElementById('sync-btn-pick-dir');
        const syncCloudName = document.getElementById('sync-cloud-name');
        const syncCloudCountBadge = document.getElementById('sync-cloud-count-badge');

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

    function openSyncHubModal() {
        const syncHubModal = document.getElementById('sync-hub-modal');
        const syncProgressArea = document.getElementById('sync-progress-area');
        const syncMetricsGrid = document.getElementById('sync-metrics-grid');
        if (!syncHubModal) return;
        if (syncProgressArea) syncProgressArea.style.display = 'none';
        if (syncMetricsGrid) syncMetricsGrid.style.display = 'none';
        refreshSyncHubStatus();
        syncHubModal.classList.add('active');
    }

    function setSyncDirection(dir) {
        currentSyncDirection = dir;
        const syncDirCards = document.querySelectorAll('.sync-dir-card');
        const syncFlowArrow = document.getElementById('sync-flow-arrow');

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

    async function executeSyncDirection() {
        if (isSyncRunning) return;
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
        if (btnStartSyncExecute) {
            btnStartSyncExecute.disabled = true;
            btnStartSyncExecute.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 同步执行中...';
        }
        if (syncProgressArea) syncProgressArea.style.display = 'block';
        if (syncProgressBar) syncProgressBar.style.width = '5%';
        if (syncProgressStatus) syncProgressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在读取本地与云端两端协议索引...';
        if (syncMetricsGrid) syncMetricsGrid.style.display = 'grid';

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
            if (syncProgressStatus) syncProgressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在扫描本地硬盘目录中的 .json 协议文件...';
            const localProtocolsMap = new Map();
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

            if (syncProgressBar) syncProgressBar.style.width = '25%';

            if (syncProgressStatus) syncProgressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在从 Cloudflare 云端获取协议清单...';
            const cloudProtocolsMap = new Map();
            const cloudListRes = await cloudApiCall('/api/protocols', 'GET');
            if (cloudListRes.ok && cloudListRes.data && cloudListRes.data.success) {
                const cloudList = cloudListRes.data.protocols || [];
                let cIndex = 0;
                for (const item of cloudList) {
                    cIndex++;
                    if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在读取云端协议详情 (${cIndex}/${cloudList.length}): ${item.name}...`;
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

            if (syncProgressBar) syncProgressBar.style.width = '50%';

            if (currentSyncDirection === 'disk-to-cloud') {
                const total = localProtocolsMap.size;
                let current = 0;
                if (total === 0) {
                    if (syncProgressStatus) syncProgressStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;"></i> 本地硬盘目录中未找到任何 .json 协议文件！';
                } else {
                    for (const [key, localItem] of localProtocolsMap.entries()) {
                        current++;
                        const pct = 50 + Math.round((current / total) * 45);
                        if (syncProgressBar) syncProgressBar.style.width = `${pct}%`;
                        if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 正在上传 (${current}/${total}): ${localItem.fileName}...`;

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
                const total = cloudProtocolsMap.size;
                let current = 0;
                if (total === 0) {
                    if (syncProgressStatus) syncProgressStatus.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;"></i> 云端工作台中暂无协议数据！';
                } else {
                    for (const [key, cloudItem] of cloudProtocolsMap.entries()) {
                        current++;
                        const pct = 50 + Math.round((current / total) * 45);
                        if (syncProgressBar) syncProgressBar.style.width = `${pct}%`;
                        if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> 正在落盘 (${current}/${total}): ${cloudItem.proto.name || key}...`;

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
                const allKeys = new Set([...localProtocolsMap.keys(), ...cloudProtocolsMap.keys()]);
                const total = allKeys.size;
                let current = 0;

                for (const key of allKeys) {
                    current++;
                    const pct = 50 + Math.round((current / total) * 45);
                    if (syncProgressBar) syncProgressBar.style.width = `${pct}%`;

                    const localItem = localProtocolsMap.get(key);
                    const cloudItem = cloudProtocolsMap.get(key);

                    if (localItem && !cloudItem) {
                        if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 本地独有，上传至云端: ${localItem.fileName}...`;
                        const toUpload = JSON.parse(JSON.stringify(localItem.proto));
                        toUpload.updateTime = localItem.mtime || Date.now();
                        const res = await cloudApiCall('/api/protocols', 'POST', toUpload);
                        if (res.ok && res.data && res.data.success) uploadCount++; else failCount++;
                    } else if (!localItem && cloudItem) {
                        if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> 云端独有，下载落盘: ${cloudItem.proto.name || key}...`;
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
                        } catch(e) { failCount++; }
                    } else if (localItem && cloudItem) {
                        const diffMs = Math.abs(localItem.mtime - cloudItem.mtime);
                        if (diffMs < 2000) {
                            skipCount++;
                        } else if (localItem.mtime > cloudItem.mtime) {
                            if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 本地版本更新，同步到云端: ${localItem.fileName}...`;
                            const toUpload = JSON.parse(JSON.stringify(localItem.proto));
                            toUpload.updateTime = localItem.mtime;
                            const res = await cloudApiCall('/api/protocols', 'POST', toUpload);
                            if (res.ok && res.data && res.data.success) uploadCount++; else failCount++;
                        } else {
                            if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-hard-drive"></i> 云端版本更新，落盘覆盖本地: ${cloudItem.proto.name}...`;
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
                            } catch(e) { failCount++; }
                        }
                    }
                    updateMetricsUI();
                }
            }

            if (syncProgressBar) syncProgressBar.style.width = '100%';
            if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> 同步完成！共上传 ${uploadCount} 个，落盘 ${downloadCount} 个，保持最新 ${skipCount} 个。`;

            await scanAndSyncWorkspaceFiles(currentWorkspaceHandle, false);
            await syncCloudProtocols(false);
            if (window.loadProtocols) await window.loadProtocols();
            if (window.loadArincProtocolsForSelect) await window.loadArincProtocolsForSelect();
            await refreshSyncHubStatus();

        } catch (err) {
            console.error("同步执行异常:", err);
            if (syncProgressStatus) syncProgressStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> 同步中断: ${err.message}`;
            alert("同步执行发生异常: " + err.message);
        } finally {
            isSyncRunning = false;
            if (btnStartSyncExecute) {
                btnStartSyncExecute.disabled = false;
                btnStartSyncExecute.innerHTML = '<i class="fa-solid fa-play"></i> 重新同步';
            }
        }
    }

    // ----------------- 初始化 DOM 监听绑定 -----------------
    function initWorkspaceSyncUI() {
        const btnModeLocal = document.getElementById('btn-mode-local');
        const btnModeCloud = document.getElementById('btn-mode-cloud');
        const btnCloudRefresh = document.getElementById('btn-cloud-refresh');
        const btnCloudUploadAll = document.getElementById('btn-cloud-upload-all');
        const btnSetWorkspace = document.getElementById('btn-set-workspace');
        const btnRefreshWorkspace = document.getElementById('btn-refresh-workspace');
        const btnDisconnectWorkspace = document.getElementById('btn-disconnect-workspace');
        const workspaceFolderInput = document.getElementById('workspace-folder-input');
        const btnOpenSyncHubs = document.querySelectorAll('.btn-open-sync-hub');
        const syncDirCards = document.querySelectorAll('.sync-dir-card');
        const syncBtnPickDir = document.getElementById('sync-btn-pick-dir');
        const syncBtnRefreshCloud = document.getElementById('sync-btn-refresh-cloud');
        const btnStartSyncExecute = document.getElementById('btn-start-sync-execute');
        const btnCloudSettings = document.getElementById('btn-cloud-settings');
        const cloudSettingsModal = document.getElementById('cloud-settings-modal');
        const cloudSettingsForm = document.getElementById('cloud-settings-form');
        const cloudWsIdInput = document.getElementById('cloud-ws-id');
        const cloudWsTokenInput = document.getElementById('cloud-ws-token');
        const btnTestCloudConn = document.getElementById('btn-test-cloud-conn');
        const cloudConnStatus = document.getElementById('cloud-connection-status');

        if (btnModeLocal) btnModeLocal.addEventListener('click', () => setWorkspaceMode('local'));
        if (btnModeCloud) btnModeCloud.addEventListener('click', () => setWorkspaceMode('cloud', true));
        if (btnCloudRefresh) btnCloudRefresh.addEventListener('click', () => syncCloudProtocols(true));
        if (btnCloudUploadAll) {
            btnCloudUploadAll.addEventListener('click', () => {
                if (typeof openSyncHubModal === 'function') openSyncHubModal();
                else uploadAllLocalProtocolsToCloud();
            });
        }

        btnOpenSyncHubs.forEach(btn => btn.addEventListener('click', openSyncHubModal));

        if (syncBtnPickDir) {
            syncBtnPickDir.addEventListener('click', async () => {
                await chooseWorkspaceDirectory();
                await refreshSyncHubStatus();
            });
        }

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

        syncDirCards.forEach(card => {
            card.addEventListener('click', () => {
                const dir = card.getAttribute('data-dir');
                if (dir) setSyncDirection(dir);
            });
        });

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
            btnRefreshWorkspace.addEventListener('click', () => refreshWorkspaceDirectory());
        }

        if (btnDisconnectWorkspace) {
            btnDisconnectWorkspace.addEventListener('click', () => disconnectWorkspaceDirectory());
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
                if (window.dbHelper) {
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
                }
                updateWorkspaceUI(true, dirName, '本地导入');
                if (window.loadProtocols) await window.loadProtocols();
                if (window.loadArincProtocolsForSelect) await window.loadArincProtocolsForSelect();
                alert(`成功从文件夹「${dirName}」载入 ${count} 个协议文件！`);
                e.target.value = '';
            });
        }
    }

    // ----------------- 协议落盘写回与云端保存通用服务 -----------------
    async function saveProtocolToWorkspaceAndCloud(proto) {
        if (!proto) return;

        // 1. 本地硬盘工作目录落盘
        if (currentWorkspaceHandle) {
            try {
                let diskFileName = proto._fileName;
                if (!diskFileName) {
                    const safeName = (proto.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                    diskFileName = `${safeName}.json`;
                    proto._fileName = diskFileName;
                    proto._fromWorkspace = true;
                }
                const fileHandle = await currentWorkspaceHandle.getFileHandle(diskFileName, { create: true });
                const writable = await fileHandle.createWritable();
                const exportData = JSON.parse(JSON.stringify(proto));
                await writable.write(JSON.stringify(exportData, null, 2));
                await writable.close();
            } catch (diskErr) {
                console.warn("ProtoView: 同步写回本地工作目录失败:", diskErr);
            }
        }

        // 2. Cloudflare KV 云端存储推送
        if (activeWorkspaceMode === 'cloud' || proto._cloudKey) {
            try {
                const cloudRes = await cloudApiCall('/api/protocols', 'POST', proto);
                if (cloudRes.ok && cloudRes.data && cloudRes.data.success) {
                    proto._cloudKey = cloudRes.data.key;
                    proto._fromCloud = true;
                }
            } catch (cloudErr) {
                console.warn("ProtoView: 同步保存至云端失败:", cloudErr);
            }
        }
    }

    // ----------------- 删除本地与云端物理协议文件 -----------------
    async function deleteProtocolFile(proto) {
        if (!proto) return;

        // 本地工作目录物理文件删除
        if (currentWorkspaceHandle && proto._fileName) {
            try {
                await currentWorkspaceHandle.removeEntry(proto._fileName);
            } catch (diskErr) {
                console.warn("ProtoView: 从工作目录删除物理文件失败:", diskErr);
            }
        }

        // 云端 KV 删除
        if (proto._cloudKey) {
            try {
                await cloudApiCall(`/api/protocols?key=${encodeURIComponent(proto._cloudKey)}`, 'DELETE');
            } catch (cloudErr) {
                console.warn("ProtoView: 从云端删除协议失败:", cloudErr);
            }
        }
    }

    // ----------------- 初始化引导服务 -----------------
    async function initWorkspaceSync() {
        initWorkspaceSyncUI();
        setWorkspaceMode(activeWorkspaceMode, false);
        if (activeWorkspaceMode === 'cloud') {
            await syncCloudProtocols(false);
        } else {
            await tryRestoreWorkspaceDirectory();
        }
    }

    // 组装并导出 WorkspaceSync 服务
    const WorkspaceSync = {
        init: initWorkspaceSync,
        getCurrentHandle: () => currentWorkspaceHandle,
        getWorkspaceHandle: () => currentWorkspaceHandle,
        setCurrentHandle: (h) => { currentWorkspaceHandle = h; },
        getActiveMode: () => activeWorkspaceMode,
        getWorkspaceMode: () => activeWorkspaceMode,
        setWorkspaceMode,
        cloudApiCall,
        syncCloudProtocols,
        uploadAllLocalProtocolsToCloud,
        chooseWorkspaceDirectory,
        scanAndSyncWorkspaceFiles,
        refreshWorkspaceDirectory,
        disconnectWorkspaceDirectory,
        tryRestoreWorkspaceDirectory,
        refreshSyncHubStatus,
        openSyncHubModal,
        setSyncDirection,
        executeSyncDirection,
        updateWorkspaceUI,
        initWorkspaceSyncUI,
        saveProtocolToWorkspaceAndCloud,
        deleteProtocolFile
    };

    ProtoView.WorkspaceSync = WorkspaceSync;
    global.ProtoView = ProtoView;

    // 向后兼容全局挂载
    Object.defineProperty(global, 'currentWorkspaceHandle', {
        get: () => currentWorkspaceHandle,
        set: (val) => { currentWorkspaceHandle = val; },
        configurable: true
    });
    global.activeWorkspaceMode = activeWorkspaceMode;
    global.setWorkspaceMode = setWorkspaceMode;
    global.cloudApiCall = cloudApiCall;
    global.syncCloudProtocols = syncCloudProtocols;
    global.chooseWorkspaceDirectory = chooseWorkspaceDirectory;
    global.refreshWorkspaceDirectory = refreshWorkspaceDirectory;
    global.disconnectWorkspaceDirectory = disconnectWorkspaceDirectory;
    global.tryRestoreWorkspaceDirectory = tryRestoreWorkspaceDirectory;
    global.refreshSyncHubStatus = refreshSyncHubStatus;
    global.openSyncHubModal = openSyncHubModal;
    global.updateWorkspaceUI = updateWorkspaceUI;

})(typeof window !== 'undefined' ? window : this);
