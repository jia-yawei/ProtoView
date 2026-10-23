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

    const wsDirStrip = document.getElementById('workspace-dir-strip');
    const wsFolderName = document.getElementById('ws-folder-name');
    const wsStatusBadge = document.getElementById('ws-status-badge');
    const btnSetWorkspace = document.getElementById('btn-set-workspace');
    const btnSetWorkspaceText = document.getElementById('btn-set-workspace-text');
    const btnRefreshWorkspace = document.getElementById('btn-refresh-workspace');
    const btnDisconnectWorkspace = document.getElementById('btn-disconnect-workspace');
    const workspaceFolderInput = document.getElementById('workspace-folder-input');

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
        if (!wsDirStrip) return;
        if (connected) {
            wsDirStrip.classList.add('connected');
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
            wsDirStrip.classList.remove('connected');
            if (wsFolderName) {
                wsFolderName.textContent = '未关联本地目录 (当前仅保存在浏览器内部)';
                wsFolderName.title = '未关联本地工作目录';
            }
            if (wsStatusBadge) {
                wsStatusBadge.textContent = '浏览器内部';
            }
            if (btnSetWorkspaceText) {
                btnSetWorkspaceText.textContent = '设置工作目录';
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

    // ---------------------- 数据加载与渲染 ----------------------
    async function loadProtocols() {
        if (!protocolList) return;
        const protocols = await dbHelper.getAllProtocols();
        protocolList.innerHTML = '';
        
        if (!protocols || protocols.length === 0) {
            protocolList.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: var(--accent-color); margin-bottom: 0.8rem; display: block; opacity: 0.85;"></i>
                    <h3 style="font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.4rem;">暂无通信协议</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.2rem;">您可以点击右上角「+ 新建协议」，或点击上方「设置工作目录」直接关联电脑本地协议工程文件夹。</p>
                </div>
            `;
            return;
        }

        protocols.forEach(p => {
            const card = document.createElement('div');
            card.className = 'card glass-effect protocol-card';
            card.title = '点击直接进入协议编辑工作台';

            // 点击卡片直接进入协议编辑工作台 (排除底部按钮点击)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.protocol-actions') || e.target.closest('button')) {
                    return;
                }
                window.editProtocol(p.id);
            });

            if (p.type === 'ARINC429') {
                const wordCount = p.words ? p.words.length : 0;
                const modeName = p.mode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式';
                const deviceName = p.device || p.source || '未指定设备';
                const directionName = p.direction || 'Tx';
                const parityName = p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : '无校验');
                card.innerHTML = `
                    <div class="protocol-card-header">
                        <div class="protocol-card-title-wrap">
                            <i class="fa-solid fa-plane-departure proto-card-icon"></i>
                            <h3 class="protocol-card-title" title="${p.name}">${p.name}</h3>
                        </div>
                        <span class="protocol-type-badge">${modeName}</span>
                    </div>
                    <div class="protocol-stats">
                        ${p._fileName ? `<span class="pstat-item pstat-file" title="本地硬盘文件: ${p._fileName}"><i class="fa-solid fa-file-code"></i> ${p._fileName}</span>` : ''}
                        <span class="pstat-item"><i class="fa-solid fa-layer-group"></i> ${wordCount} 个字</span>
                        <span class="pstat-item"><i class="fa-solid fa-desktop"></i> ${deviceName}</span>
                        <span class="pstat-item"><i class="fa-solid fa-arrows-left-right"></i> ${directionName}</span>
                        <span class="pstat-item"><i class="fa-solid fa-clock"></i> ${p.period || 20}ms</span>
                        <span class="pstat-item"><i class="fa-solid fa-gauge-high"></i> ${p.speed || '100kbps'}</span>
                        <span class="pstat-item"><i class="fa-solid fa-shield-halved"></i> ${parityName}</span>
                    </div>
                    <p class="protocol-card-desc">
                        ${p.description || '机载 ARINC 429 航空总线通信协议'}
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
                            <i class="fa-solid fa-network-wired proto-card-icon"></i>
                            <h3 class="protocol-card-title" title="${p.name}">${p.name}</h3>
                        </div>
                        <span class="protocol-type-badge">${p.type}</span>
                    </div>
                    <div class="protocol-stats">
                        ${p._fileName ? `<span class="pstat-item pstat-file" title="本地硬盘文件: ${p._fileName}"><i class="fa-solid fa-file-code"></i> ${p._fileName}</span>` : ''}
                        <span class="pstat-item"><i class="fa-solid fa-layer-group"></i> ${p.frames ? p.frames.length : 0} 个报文</span>
                    </div>
                    <p class="protocol-card-desc">
                        ${p.description || '工业总线通信协议'}
                    </p>
                    <div class="protocol-actions">
                        <button type="button" class="btn btn-sm btn-proto-edit" onclick="window.editProtocol(${p.id})"><i class="fa-solid fa-pen-to-square"></i> 编辑</button>
                        <button type="button" class="btn btn-sm btn-proto-export" onclick="window.exportProtocolById(${p.id})" title="导出为电脑本地 .json 模板文件"><i class="fa-solid fa-download"></i> 导出</button>
                        <button type="button" class="btn btn-sm btn-proto-delete" onclick="window.deleteProtocol(${p.id})"><i class="fa-solid fa-trash"></i> 删除</button>
                    </div>
                `;
            }
            protocolList.appendChild(card);
        });
    }

    async function loadProtocolsForSelect() {
        const selectProtocolParse = document.getElementById('select-protocol-parse');
        if (!selectProtocolParse) return;
        const protocols = await dbHelper.getAllProtocols();
        selectProtocolParse.innerHTML = '<option value="">-- 请选择协议 --</option>';
        protocols.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `[${p.type}] ${p.name}`;
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

        const protocolData = { name, type, frames };
        if (id) protocolData.id = id;

        await dbHelper.saveProtocol(protocolData);
        protocolModal.classList.remove('active');
        loadProtocols();
        loadProtocolsForSelect(); // 刷新下拉框
    });

    // 全局函数挂载供内联 onclick 使用
    window.deleteProtocol = async (id) => {
        const proto = await dbHelper.getProtocol(id);
        const name = proto ? proto.name : '该协议';
        const isFromDisk = proto && proto._fileName && currentWorkspaceHandle;
        const confirmMsg = isFromDisk 
            ? `确定要删除协议「${name}」吗？\n\n【提示】由于已连接本地工作目录，此操作将同步永久删除您电脑硬盘上的物理文件「${proto._fileName}」！` 
            : `确定要删除协议「${name}」吗？`;

        if (confirm(confirmMsg)) {
            if (isFromDisk) {
                try {
                    await currentWorkspaceHandle.removeEntry(proto._fileName);
                } catch(e) {
                    console.warn("从本地工作目录删除物理文件失败:", e);
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
            toolbarProtoTitle.innerHTML = `<i class="fa-solid fa-plane-departure"></i> ${p.name || '429 协议'}`;
            toolbarProtoTitle.title = p.name || 'ARINC 429 协议';
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
    function openCreate429Modal(defaultName = '') {
        if (create429Name) create429Name.value = defaultName || '新建 ARINC 429 协议';
        if (create429Type) create429Type.value = 'ARINC429';
        if (create429Device) create429Device.value = '机载航电系统';
        if (create429Direction) create429Direction.value = 'Tx';
        if (create429Period) create429Period.value = 20;
        if (create429Speed) create429Speed.value = '100kbps';
        if (create429Parity) create429Parity.value = 'odd';
        if (create429Mode) create429Mode.value = 'classic';
        if (create429Desc) create429Desc.value = '';

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
        if (props429Device) props429Device.value = p.device || p.source || '机载航电系统';
        if (props429Direction) props429Direction.value = p.direction || 'Tx';
        if (props429Period) props429Period.value = p.period || 20;
        if (props429Speed) props429Speed.value = p.speed || '100kbps';
        if (props429Parity) props429Parity.value = p.parity || 'odd';
        if (props429Mode) props429Mode.value = p.mode || 'classic';
        if (props429Desc) props429Desc.value = p.description || '';
        if (propsSummaryWords) propsSummaryWords.textContent = (p.words ? p.words.length : 0) + ' 个';
        if (propsSummaryId) propsSummaryId.textContent = p.id ? `#${p.id}` : '(新)';

        if (arincPropsModal) arincPropsModal.classList.add('active');
    }
    window.openProps429Modal = openProps429Modal;

    // ----------------- 加载 ARINC 429 协议列表 -----------------
    async function loadArincProtocolsForSelect() {
        if (!arincProtocolSelect) return;
        const allProtocols = await dbHelper.getAllProtocols();
        const arincList = allProtocols.filter(p => p.type === 'ARINC429');

        arincProtocolSelect.innerHTML = '<option value="">-- 选择429协议 --</option>';
        arincList.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} (${p.words ? p.words.length : 0}个字)`;
            arincProtocolSelect.appendChild(opt);
        });

        if (currentArincProtocol && currentArincProtocol.id) {
            arincProtocolSelect.value = currentArincProtocol.id;
        } else if (arincList.length > 0) {
            await loadArincProtocolIntoEditor(arincList[0].id);
        } else {
            currentArincProtocol = null;
            updateToolbarProtocolInfo();
            renderArincWordsList();
            renderSelectedWordInspector();
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

        // 统一协议级字段划分模式与全局周期
        if (!currentArincProtocol.mode) {
            currentArincProtocol.mode = (currentArincProtocol.words && currentArincProtocol.words[0] && currentArincProtocol.words[0].editMode) || 'classic';
        }
        if (!currentArincProtocol.period) {
            currentArincProtocol.period = (currentArincProtocol.words && currentArincProtocol.words[0] && currentArincProtocol.words[0].period) || 20;
        }
        currentArincProtocol.words.forEach(w => {
            w.period = currentArincProtocol.period;
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
            if (newProto.words) {
                newProto.words.forEach(w => w.period = defaultPeriod);
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
                        ssmDict: { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" },
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

        // 统一所有标号字的划分模式、周期与方向为协议全局配置
        if (currentArincProtocol.words) {
            currentArincProtocol.words.forEach(w => {
                w.editMode = currentArincProtocol.mode;
                w.period = currentArincProtocol.period || 20;
                w.direction = currentArincProtocol.direction || 'Tx';
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

        const id = await dbHelper.saveProtocol(currentArincProtocol);
        currentArincProtocol.id = id;

        // 保存反馈
        if (btnArincSave) {
            const originalHTML = btnArincSave.innerHTML;
            if (syncedToDisk) {
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

    // ----------------- 渲染左侧标号字列表 (主要内容核心区) -----------------
    function renderArincWordsList() {
        if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) {
            arincWordsList.innerHTML = '<tr><td colspan="5" class="empty-state">暂无标号字，请点击右上角「+ 添加字」。</td></tr>';
            wordsCountBadge.textContent = '0';
            return;
        }

        wordsCountBadge.textContent = currentArincProtocol.words.length;

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
            filtered = filtered.filter(w => 
                (w.label && w.label.includes(q)) || 
                (w.name && w.name.toLowerCase().includes(q)) ||
                (w.source && w.source.toLowerCase().includes(q))
            );
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

            if (item.name) {
                tr.title = `${octalStr}₈: ${item.name}`;
            }

            tr.innerHTML = `
                <td class="col-idx" style="text-align:center;">#${fIdx + 1}</td>
                <td class="col-label">
                    <span class="octal-num">${octalStr}₈</span>
                    ${item.name ? `<span class="word-mini-name" title="${item.name}">${item.name}</span>` : ''}
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

    // 辅助：更新 SSM 选项列表 (两位: B30~B31)
    function updateSsmSelectOptions(word) {
        if (!word.ssmDict) {
            word.ssmDict = { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };
        }
        const curVal = word.ssm !== undefined ? word.ssm : 0;
        const selects = [wordSsm, bsWordSsm].filter(Boolean);
        selects.forEach(sel => {
            sel.innerHTML = '';
            const bitMap = { '0': '00', '1': '01', '2': '10', '3': '11' };
            Object.entries(word.ssmDict).forEach(([k, v]) => {
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

            // 只有 u16 才有字节序 (大端/小端)，bool 和 u8 不设置字节序
            let endianness = field.endianness;
            if (dataType !== 'u16') {
                endianness = 'none';
            } else if (endianness !== 'little') {
                endianness = 'big';
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
                keys.slice(0, 3).forEach(k => {
                    dictBadgesHTML += `<span class="dense-dict-tag" title="${k}: ${dict[k]}">${k}:${dict[k]}</span>`;
                });
                if (keys.length > 3) {
                    dictBadgesHTML += `<span class="dense-dict-tag">+${keys.length - 3}</span>`;
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
                            <option value="big" ${endianness === 'big' ? 'selected' : ''}>大端(MSB)</option>
                            <option value="little" ${endianness === 'little' ? 'selected' : ''}>小端(LSB)</option>
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
                        <input type="number" class="field-in-offset field-card-input" step="any" value="${(field.precision !== undefined && field.precision !== null && field.precision !== '') ? field.precision : ((field.offset !== undefined && field.offset !== null && field.offset !== '' && field.offset !== 0) ? field.offset : '')}" placeholder="空" title="精度 (即物理偏移量，未填写则留空)">
                    </div>

                    <div class="field-card-cell" style="width: 116px;">
                        <label class="field-card-label"><i class="fa-solid fa-gauge-high"></i> 范围(Min~Max)</label>
                        <div class="field-card-minmax">
                            <input type="number" class="field-in-min field-card-input" step="any" value="${(field.min !== undefined && field.min !== null) ? field.min : ''}" placeholder="Min">
                            <span>~</span>
                            <input type="number" class="field-in-max field-card-input" step="any" value="${(field.max !== undefined && field.max !== null) ? field.max : ''}" placeholder="Max">
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 52px;">
                        <label class="field-card-label"><i class="fa-solid fa-tag"></i> 单位</label>
                        <input type="text" class="field-in-unit field-card-input" value="${field.unit || ''}" placeholder="空" title="工程量单位 (默认空)">
                    </div>

                    <div class="field-card-cell field-card-cell-dict" style="width: 105px;">
                        <label class="field-card-label"><i class="fa-solid fa-book"></i> 状态字典</label>
                        <div class="field-card-dict-box">
                            <button type="button" class="dense-dict-btn btn-edit-field-dict" title="配置状态字典映射">
                                <i class="fa-solid fa-pen-to-square"></i> 配置
                            </button>
                            <div class="dense-dict-list">${dictBadgesHTML}</div>
                        </div>
                    </div>

                    <!-- 备注列：放到最后，默认也是空的 -->
                    <div class="field-card-cell field-card-cell-remark" style="flex: 1.2; min-width: 110px;">
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
                const precisionVal = inOffset.value.trim() !== '' ? (parseFloat(inOffset.value) || inOffset.value.trim()) : '';
                field.precision = precisionVal;
                field.offset = precisionVal;
                field.min = inMin.value.trim() !== '' ? (parseFloat(inMin.value) !== undefined && !isNaN(parseFloat(inMin.value)) ? parseFloat(inMin.value) : inMin.value.trim()) : '';
                field.max = inMax.value.trim() !== '' ? (parseFloat(inMax.value) !== undefined && !isNaN(parseFloat(inMax.value)) ? parseFloat(inMax.value) : inMax.value.trim()) : '';
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
                    const curC = parseInt(inBitCount.value) || 16;
                    inBitCount.max = '16';
                    inBitCount.disabled = false;
                    if (curC <= 1 || curC > 16) inBitCount.value = '16';
                    inEndian.disabled = false;
                    inEndian.style.opacity = '1';
                    inEndian.style.cursor = 'pointer';
                    inEndian.innerHTML = `
                        <option value="big" ${field.endianness === 'little' ? '' : 'selected'}>大端(MSB)</option>
                        <option value="little" ${field.endianness === 'little' ? 'selected' : ''}>小端(LSB)</option>
                    `;
                    field.endianness = inEndian.value;
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

                    // 命名与唯一标识符处理
                    let baseName = field.name || '字段';
                    const match = baseName.match(/^(.*?)_?副本(?:_?(\d+))?$/);
                    if (match) {
                        const root = match[1];
                        const num = match[2] ? parseInt(match[2]) + 1 : 2;
                        cloned.name = `${root}_副本_${num}`;
                    } else {
                        cloned.name = `${baseName}_副本`;
                    }
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
        const defaultLen = Math.min(16, Math.max(1, maxAvail > 0 ? maxAvail : 1));
        const defaultType = defaultLen > 8 ? 'u16' : (defaultLen === 1 ? 'bool' : 'u8');

        const newField = {
            key: `sig_${word.signals.length + 1}`,
            name: `字段_${word.signals.length + 1}`,
            dataType: defaultType,
            startBit: nextStartBit,
            bitCount: defaultLen,
            length: defaultLen,
            endianness: defaultType === 'u16' ? 'big' : 'none',
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
        if (!currentArincProtocol || !currentArincProtocol.words) return;
        const word = currentArincProtocol.words[currentWordIndex];
        if (!word) return;
        if (!word.ssmDict) {
            word.ssmDict = { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };
        }
        openDictModal(word, `SSM 状态矩阵字典 (B30~B31) [${word.name || word.label}]`, () => {
            updateSsmSelectOptions(word);
            updateCompactSim(word);
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

        // 智能计算未使用的标号
        const usedLabels = new Set(currentArincProtocol.words.map(w => w.label));
        let nextLabel = '205';
        for (let l = 200; l <= 377; l++) {
            const oct = l.toString();
            if (!usedLabels.has(oct) && !/[89]/.test(oct)) {
                nextLabel = oct;
                break;
            }
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
    }
    window.addWord = addWord;

    if (btnAddWord) {
        btnAddWord.addEventListener('click', addWord);
    }

    // 克隆字
    if (btnDuplicateWord) {
        btnDuplicateWord.addEventListener('click', () => {
            if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
            const cur = currentArincProtocol.words[currentWordIndex];
            const dup = JSON.parse(JSON.stringify(cur));
            dup.name = dup.name + '_副本';
            dup.key = (dup.key || 'word') + '_copy';
            currentArincProtocol.words.splice(currentWordIndex + 1, 0, dup);
            currentWordIndex++;
            renderArincWordsList();
            renderSelectedWordInspector();
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
                const device = (create429Device ? create429Device.value.trim() : '') || '机载航电系统';
                const direction = create429Direction ? create429Direction.value : 'Tx';
                const speed = create429Speed ? create429Speed.value : '100kbps';
                const parity = create429Parity ? create429Parity.value : 'odd';
                const mode = create429Mode ? create429Mode.value : 'classic';
                const desc = (create429Desc ? create429Desc.value.trim() : '') || '通信总线协议';

                if (protoType === 'CAN' || protoType === 'Serial') {
                    const newProto = {
                        name: name,
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
                ];

                const newProto = {
                    name: name,
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

    // ----------------- 导出 Markdown 表格 (AI 上位机开发专用) -----------------
    function openExportMdModal() {
        if (!currentArincProtocol) {
            alert('请先选择或创建一个 429 协议！');
            return;
        }
        const mdText = Arinc429Helper.generateMarkdownSpec(currentArincProtocol);
        if (exportMdCodeBlock) {
            exportMdCodeBlock.textContent = mdText;
        }
        if (arincExportMdModal) {
            arincExportMdModal.classList.add('active');
        }
    }
    window.openExportMdModal = openExportMdModal;

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

    // ----------------- 系统启动加载序列 -----------------
    async function initSystem() {
        try {
            if (window.dbHelper && window.dbHelper.initDemoData) {
                await window.dbHelper.initDemoData();
            }
        } catch (err) {
            console.warn("ProtoView: 演示数据初始化异常:", err);
        }

        try {
            await tryRestoreWorkspaceDirectory();
        } catch (err) {
            console.warn("ProtoView: 恢复本地工作目录异常:", err);
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
