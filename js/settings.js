/**
 * @file settings.js
 * @brief ProtoView 全局系统设置中心 (工程默认规则、字节序、命名规范、快捷键与云端同步)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Settings = ProtoView.Settings || {};

    const STORAGE_KEY = 'protoview_system_settings';

    // 全局默认工程规则配置令牌
    const DEFAULT_SETTINGS = {
        defaultEndianness: 'little',      // 'little' (Intel) | 'big' (Motorola)
        defaultPeriod: 20,                 // 基准周期 20ms
        defaultArincSpeed: '100kbps',      // 429 高速 100kbps | 低速 12.5kbps
        defaultArincParity: 'odd',         // 429 奇校验 odd | even | none
        defaultSerialBaud: '115200',       // 串口默认 115200 bps
        autoDraftInterval: 5,              // 草稿本地快照防丢间隔 (秒)
        namingTemplate: '{product}_{bus}_{type}通信协议', // 新建协议默认名称模板
        octalFormat: 'octal',              // 429 标号字格式: 'octal' (101₈) | 'octal_plain' | 'hex'
        signalCase: 'snake',               // 信号字段代码风格: 'snake' | 'camel' | 'upper_snake' | 'pascal'
        cloudSyncPolicy: 'auto'            // 云端写入策略: 'auto' | 'manual'
    };

    let currentSettings = Object.assign({}, DEFAULT_SETTINGS);

    // 加载配置
    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                currentSettings = Object.assign({}, DEFAULT_SETTINGS, parsed);
            } else {
                currentSettings = Object.assign({}, DEFAULT_SETTINGS);
            }
        } catch (e) {
            console.warn('ProtoView: 加载系统设置失败，使用默认值:', e);
            currentSettings = Object.assign({}, DEFAULT_SETTINGS);
        }
        return currentSettings;
    }

    // 保存配置
    function saveSettings(newSettings) {
        currentSettings = Object.assign({}, currentSettings, newSettings);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        } catch (e) {
            console.error('ProtoView: 保存系统设置异常:', e);
        }

        // 广播配置变更事件
        if (ProtoView.Events && typeof ProtoView.Events.emit === 'function') {
            ProtoView.Events.emit('settings:changed', currentSettings);
        }

        if (typeof global.showToast === 'function') {
            global.showToast('系统设置已更新并即时生效！', 'success');
        }
    }

    // 获取单项配置
    function getSetting(key, fallback = undefined) {
        if (currentSettings.hasOwnProperty(key)) {
            return currentSettings[key];
        }
        return fallback !== undefined ? fallback : DEFAULT_SETTINGS[key];
    }

    // 格式化命名预览
    function formatNamingPreview(tpl) {
        if (!tpl) tpl = DEFAULT_SETTINGS.namingTemplate;
        return tpl
            .replace(/\{product\}/gi, '配电盒')
            .replace(/\{bus\}/gi, 'ARINC429')
            .replace(/\{type\}/gi, '航电');
    }

    // 打开系统设置弹窗
    function openSettingsModal(defaultTab = 'rules') {
        const modal = document.getElementById('system-settings-modal');
        if (!modal) return;

        loadSettings();

        // 填充表单字段
        const selEndian = document.getElementById('setting-default-endianness');
        const inpPeriod = document.getElementById('setting-default-period');
        const selArincSpeed = document.getElementById('setting-default-arinc-speed');
        const selArincParity = document.getElementById('setting-default-arinc-parity');
        const selSerialBaud = document.getElementById('setting-default-serial-baud');
        const selAutoDraft = document.getElementById('setting-auto-draft-interval');
        const inpNamingTpl = document.getElementById('setting-naming-template');
        const selOctal = document.getElementById('setting-octal-format');
        const selSignalCase = document.getElementById('setting-signal-case');
        const selCloudSync = document.getElementById('setting-cloud-sync-policy');
        const inpWorkspace = document.getElementById('setting-workspace-name');

        if (selEndian) selEndian.value = currentSettings.defaultEndianness || 'little';
        if (inpPeriod) inpPeriod.value = currentSettings.defaultPeriod || 20;
        if (selArincSpeed) selArincSpeed.value = currentSettings.defaultArincSpeed || '100kbps';
        if (selArincParity) selArincParity.value = currentSettings.defaultArincParity || 'odd';
        if (selSerialBaud) selSerialBaud.value = String(currentSettings.defaultSerialBaud || '115200');
        if (selAutoDraft) selAutoDraft.value = String(currentSettings.autoDraftInterval !== undefined ? currentSettings.autoDraftInterval : 5);
        if (inpNamingTpl) inpNamingTpl.value = currentSettings.namingTemplate || DEFAULT_SETTINGS.namingTemplate;
        if (selOctal) selOctal.value = currentSettings.octalFormat || 'octal';
        if (selSignalCase) selSignalCase.value = currentSettings.signalCase || 'snake';
        if (selCloudSync) selCloudSync.value = currentSettings.cloudSyncPolicy || 'auto';

        // 当前工作空间显示
        if (inpWorkspace) {
            let ws = '本地优先工作区 (IndexedDB)';
            if (ProtoView.Auth && typeof ProtoView.Auth.getCurrentUser === 'function') {
                const u = ProtoView.Auth.getCurrentUser();
                if (u && u.username) {
                    ws = `云端账号空间: ${u.username}${u.isAdmin ? ' [管理员]' : ''}`;
                }
            }
            inpWorkspace.value = ws;
        }

        // 动态预览
        updateNamingPreview();

        // 激活目标 Tab
        switchSettingsTab(defaultTab);

        modal.classList.add('active');
    }

    // 关闭系统设置弹窗
    function closeSettingsModal() {
        const modal = document.getElementById('system-settings-modal');
        if (modal) modal.classList.remove('active');
    }

    // 切换设置分段 Tab
    function switchSettingsTab(tabName) {
        const tabs = document.querySelectorAll('.settings-tab-btn');
        tabs.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const panes = [
            { id: 'settings-pane-rules', tab: 'rules' },
            { id: 'settings-pane-naming', tab: 'naming' },
            { id: 'settings-pane-shortcuts', tab: 'shortcuts' },
            { id: 'settings-pane-cloud', tab: 'cloud' }
        ];

        panes.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                el.style.display = (item.tab === tabName) ? 'block' : 'none';
            }
        });
    }

    // 更新命名预览显示
    function updateNamingPreview() {
        const inp = document.getElementById('setting-naming-template');
        const preview = document.getElementById('naming-sample-preview');
        if (inp && preview) {
            preview.textContent = formatNamingPreview(inp.value.trim());
        }
    }

    // 导出全量协议及产品备份包
    async function exportAllProtocolsBackup() {
        try {
            const protocols = (window.dbHelper && typeof window.dbHelper.getAllProtocols === 'function') 
                ? await window.dbHelper.getAllProtocols() 
                : [];
            const products = (window.dbHelper && typeof window.dbHelper.getAllProducts === 'function')
                ? await window.dbHelper.getAllProducts()
                : [];
            const recycleBin = (window.dbHelper && typeof window.dbHelper.getRecycleBin === 'function')
                ? window.dbHelper.getRecycleBin()
                : [];

            const backup = {
                version: 'ProtoView_Backup_v2.0',
                exportedAt: new Date().toISOString(),
                protocolCount: protocols.length,
                productCount: products.length,
                recycleBinCount: recycleBin.length,
                protocols: protocols,
                products: products,
                recycleBin: recycleBin,
                settings: currentSettings
            };

            const jsonStr = JSON.stringify(backup, null, 2);
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const fileName = `ProtoView_FullBackup_${dateStr}.json`;

            if (ProtoView.Utils && typeof ProtoView.Utils.downloadFile === 'function') {
                ProtoView.Utils.downloadFile(jsonStr, fileName, 'application/json');
            } else {
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            if (typeof global.showToast === 'function') {
                global.showToast(`已成功导出包含 ${protocols.length} 个协议的全量备份包！`, 'success');
            }
        } catch (err) {
            console.error('导出全量备份失败:', err);
            alert('导出全量备份失败: ' + err.message);
        }
    }

    // 绑定设置事件与工程师高频快捷键
    function bindSettingsEvents() {
        // 侧边栏齿轮图标点击
        const btnSidebarSettings = document.getElementById('sidebar-settings-btn');
        if (btnSidebarSettings) {
            btnSidebarSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                openSettingsModal('rules');
            });
        }

        // 弹窗关闭与取消
        const btnClose = document.getElementById('btn-close-settings-modal');
        if (btnClose) btnClose.addEventListener('click', closeSettingsModal);

        const btnCancel = document.getElementById('btn-cancel-settings');
        if (btnCancel) btnCancel.addEventListener('click', closeSettingsModal);

        // Tab 切换按钮
        const tabBtns = document.querySelectorAll('.settings-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-tab') || 'rules';
                switchSettingsTab(tab);
            });
        });

        // 模板输入联动预览
        const inpNaming = document.getElementById('setting-naming-template');
        if (inpNaming) {
            inpNaming.addEventListener('input', updateNamingPreview);
        }

        // 保存设置
        const btnSave = document.getElementById('btn-save-settings');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                const selEndian = document.getElementById('setting-default-endianness');
                const inpPeriod = document.getElementById('setting-default-period');
                const selArincSpeed = document.getElementById('setting-default-arinc-speed');
                const selArincParity = document.getElementById('setting-default-arinc-parity');
                const selSerialBaud = document.getElementById('setting-default-serial-baud');
                const selAutoDraft = document.getElementById('setting-auto-draft-interval');
                const inpNamingTpl = document.getElementById('setting-naming-template');
                const selOctal = document.getElementById('setting-octal-format');
                const selSignalCase = document.getElementById('setting-signal-case');
                const selCloudSync = document.getElementById('setting-cloud-sync-policy');

                const newSettings = {
                    defaultEndianness: selEndian ? selEndian.value : 'little',
                    defaultPeriod: inpPeriod ? (parseInt(inpPeriod.value, 10) || 20) : 20,
                    defaultArincSpeed: selArincSpeed ? selArincSpeed.value : '100kbps',
                    defaultArincParity: selArincParity ? selArincParity.value : 'odd',
                    defaultSerialBaud: selSerialBaud ? selSerialBaud.value : '115200',
                    autoDraftInterval: selAutoDraft ? parseInt(selAutoDraft.value, 10) : 5,
                    namingTemplate: (inpNamingTpl ? inpNamingTpl.value.trim() : '') || DEFAULT_SETTINGS.namingTemplate,
                    octalFormat: selOctal ? selOctal.value : 'octal',
                    signalCase: selSignalCase ? selSignalCase.value : 'snake',
                    cloudSyncPolicy: selCloudSync ? selCloudSync.value : 'auto'
                };

                saveSettings(newSettings);
                closeSettingsModal();
            });
        }

        // 恢复默认设置
        const btnReset = document.getElementById('btn-reset-settings');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                let confirmed = false;
                if (ProtoView.Utils && typeof ProtoView.Utils.showConfirm === 'function') {
                    confirmed = await ProtoView.Utils.showConfirm({
                        title: '恢复默认设置',
                        icon: 'fa-rotate-left',
                        type: 'warning',
                        message: '确定要将全部工程规则恢复为系统初始默认值吗？',
                        detail: '包括默认字节序(小端)、调度周期(20ms)、标号格式等将恢复初始出厂设置。',
                        confirmText: '恢复默认',
                        cancelText: '取消'
                    });
                } else {
                    confirmed = confirm('确定要将所有设置恢复为默认值吗？');
                }
                if (!confirmed) return;

                saveSettings(DEFAULT_SETTINGS);
                openSettingsModal('rules');
            });
        }

        // 工程师高频全局快捷键监听
        window.addEventListener('keydown', (e) => {
            // 当处于 input/textarea 且正在打字时，不拦截通用按键（Ctrl+S 与 Esc 除外）
            const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);

            // 1. Ctrl + S (保存当前工作台协议草稿)
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                const activeView = document.querySelector('.view-section.active');
                if (activeView && activeView.id === 'arinc429-view') {
                    const saveBtn = document.getElementById('btn-save-arinc-protocol');
                    if (saveBtn) saveBtn.click();
                } else if (activeView && activeView.id === 'serial-view') {
                    const saveBtn = document.getElementById('btn-save-serial-protocol');
                    if (saveBtn) saveBtn.click();
                } else {
                    if (typeof global.showToast === 'function') {
                        global.showToast('当前不在编辑工作台中，无需手动保存', 'info');
                    }
                }
                return;
            }

            // 2. Ctrl + P (快速聚焦全局协议搜索框)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                const searchInp = document.getElementById('product-proto-search') || document.getElementById('sidebar-product-search');
                if (searchInp) {
                    if (typeof window.switchToView === 'function') window.switchToView('protocol-view');
                    searchInp.focus();
                    searchInp.select();
                }
                return;
            }

            // 3. Ctrl + B (展开/折叠左侧侧边栏)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                const btnToggle = document.getElementById('btn-toggle-sidebar');
                if (btnToggle) btnToggle.click();
                return;
            }

            // 4. Ctrl + E (快速呼出导出规格中心)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E') && !isTyping) {
                e.preventDefault();
                if (typeof window.openProtocolExportModal === 'function') {
                    window.openProtocolExportModal();
                }
                return;
            }

            // 5. Esc 键关闭设置模态弹窗
            if (e.key === 'Escape') {
                const settingsModal = document.getElementById('system-settings-modal');
                if (settingsModal && settingsModal.classList.contains('active')) {
                    e.preventDefault();
                    closeSettingsModal();
                }
            }
        });
    }

    // 挂载对外 API
    ProtoView.Settings = {
        load: loadSettings,
        save: saveSettings,
        get: getSetting,
        open: openSettingsModal,
        close: closeSettingsModal,
        exportBackup: exportAllProtocolsBackup,
        formatNamingPreview
    };

    global.ProtoView = ProtoView;
    global.openSettingsModal = openSettingsModal;
    global.closeSettingsModal = closeSettingsModal;
    global.exportAllProtocolsBackup = exportAllProtocolsBackup;

    // 自动自初始化
    loadSettings();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSettingsEvents);
    } else {
        bindSettingsEvents();
    }

})(typeof window !== 'undefined' ? window : this);
