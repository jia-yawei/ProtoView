/**
 * @file serial-ctrl.js
 * @brief ProtoView 串口通信协议 (UART / RS422 / RS485) 字节时序流工作台控制器
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Controllers = ProtoView.Controllers || {};

    // 辅助工具引用
    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};
    const downloadFile = ProtoView.downloadFile || global.downloadFile || function(){};
    const copyTextToClipboard = ProtoView.copyTextToClipboard || global.copyTextToClipboard || function(){};

    // 状态定义
    let currentSerialProtocol = null;
    let currentSerialPacketIndex = 0;
    let currentSerialFieldIndex = 0;
    let serialByteFilter = 'all';
    let serialByteSearchQuery = '';

    // DOM 元素引用
    let btnSerialBack, serialToolbarProtoTitle, badgeSerialBaud, badgeSerialParity,
        serialPacketSelectWrap, serialPacketSelect, btnRenameSerialPacket,
        btnMenuRenameSerialPacket, serialPacketRenameBox, serialPacketRenameInput,
        btnSerialPacketRenameConfirm, btnSerialPacketRenameCancel,
        btnAddSerialPacket, btnMenuAddSerialPacket, btnDuplicateSerialPacket, btnDeleteSerialPacket, btnViewSerialProps,
        btnSerialExportJson, btnSerialSave;

    // 撤销/重做、5态保存状态与草稿横幅
    let btnSerialUndo, btnSerialRedo, serialSyncStatusBadge, serialDraftBanner,
        btnSerialDraftDiscard, btnSerialDraftSave;
    let serialUndoRedo = null;

    let serialTimelineTotalBadge, serialPacketName, serialPacketCmd,
        serialPacketDirection, serialPacketPeriodItem, serialPacketPeriod, serialByteTimeline;

    let serialDenseWorkbench, btnSerialMobileTabPackets, btnSerialMobileTabDetail,
        btnSerialMobileBackPackets, mobileSerialPacketsCount, mobileActivePacketCmd;

    let serialPacketsPanel, serialBytesCountBadge, badgeSerialPacketsCount, btnSerialAutoOffsets,
        btnAddSerialByte, serialByteSearch, serialByteFilterButtons, btnMoveByteUp, btnMoveByteDown,
        serialBytesList, serialWorkbenchResizer;

    let inspectorByteSpanVal, serialFieldName, serialFieldKey,
        serialPropFixedHex, btnSerialFieldMoveUp, btnSerialFieldMoveDown,
        btnCloneSerialByte, btnDeleteSerialByte;

    let serialFieldsContainer, btnAddSerialField, btnPresetSerialBits;

    function initDOMElements() {
        btnSerialBack = document.getElementById('btn-serial-back');
        serialToolbarProtoTitle = document.getElementById('serial-toolbar-proto-title');
        badgeSerialBaud = document.getElementById('badge-serial-baud');
        badgeSerialParity = document.getElementById('badge-serial-parity');
        serialPacketSelectWrap = document.getElementById('serial-packet-select-wrap');
        serialPacketSelect = document.getElementById('serial-packet-select');
        btnRenameSerialPacket = document.getElementById('btn-rename-serial-packet');
        btnMenuRenameSerialPacket = document.getElementById('btn-menu-rename-serial-packet');
        serialPacketRenameBox = document.getElementById('serial-packet-rename-box');
        serialPacketRenameInput = document.getElementById('serial-packet-rename-input');
        btnSerialPacketRenameConfirm = document.getElementById('btn-serial-packet-rename-confirm');
        btnSerialPacketRenameCancel = document.getElementById('btn-serial-packet-rename-cancel');
        btnAddSerialPacket = document.getElementById('btn-add-serial-packet');
        btnMenuAddSerialPacket = document.getElementById('btn-menu-add-serial-packet');
        btnDuplicateSerialPacket = document.getElementById('btn-duplicate-serial-packet');
        btnDeleteSerialPacket = document.getElementById('btn-delete-serial-packet');
        btnViewSerialProps = document.getElementById('btn-view-serial-props');
        btnSerialExportJson = document.getElementById('btn-serial-export') || document.getElementById('btn-serial-export-json');
        btnSerialSave = document.getElementById('btn-serial-save');

        btnSerialUndo = document.getElementById('btn-serial-undo');
        btnSerialRedo = document.getElementById('btn-serial-redo');
        serialSyncStatusBadge = document.getElementById('serial-sync-status-badge');
        serialDraftBanner = document.getElementById('serial-draft-banner');
        btnSerialDraftDiscard = document.getElementById('btn-serial-draft-discard');
        btnSerialDraftSave = document.getElementById('btn-serial-draft-save');

        if (!serialUndoRedo && ProtoView.UndoRedo) {
            serialUndoRedo = ProtoView.UndoRedo.create({ maxDepth: 50 });
            serialUndoRedo.setChangeListener(({ canUndo, canRedo }) => {
                if (btnSerialUndo) btnSerialUndo.disabled = !canUndo;
                if (btnSerialRedo) btnSerialRedo.disabled = !canRedo;
            });
        }

        serialTimelineTotalBadge = document.getElementById('serial-timeline-total-badge');
        serialPacketName = document.getElementById('serial-packet-name');
        serialPacketCmd = document.getElementById('serial-packet-cmd');
        serialPacketDirection = document.getElementById('serial-packet-direction');
        serialPacketPeriodItem = document.getElementById('serial-packet-period-item');
        serialPacketPeriod = document.getElementById('serial-packet-period');
        serialByteTimeline = document.getElementById('serial-byte-timeline');

        serialDenseWorkbench = document.getElementById('serial-dense-workbench');
        btnSerialMobileTabPackets = document.getElementById('btn-serial-mobile-tab-packets');
        btnSerialMobileTabDetail = document.getElementById('btn-serial-mobile-tab-detail');
        btnSerialMobileBackPackets = document.getElementById('btn-serial-mobile-back-packets');
        mobileSerialPacketsCount = document.getElementById('mobile-serial-packets-count');
        mobileActivePacketCmd = document.getElementById('mobile-active-packet-cmd');

        serialPacketsPanel = document.getElementById('serial-packets-panel');
        serialBytesCountBadge = document.getElementById('serial-bytes-count-badge');
        badgeSerialPacketsCount = serialBytesCountBadge;
        btnSerialAutoOffsets = document.getElementById('btn-serial-auto-offsets');
        btnAddSerialByte = document.getElementById('btn-add-serial-byte');
        serialByteSearch = document.getElementById('serial-byte-search');
        btnMoveByteUp = document.getElementById('btn-move-byte-up');
        btnMoveByteDown = document.getElementById('btn-move-byte-down');
        serialByteFilterButtons = document.querySelectorAll('#serial-byte-filter-buttons button');
        serialBytesList = document.getElementById('serial-bytes-list');
        serialWorkbenchResizer = document.getElementById('serial-workbench-resizer');

        inspectorByteSpanVal = document.getElementById('inspector-byte-span-val');
        serialFieldName = document.getElementById('serial-field-name');
        serialFieldKey = document.getElementById('serial-field-key');
        serialPropFixedHex = document.getElementById('serial-prop-fixed-hex');
        btnSerialFieldMoveUp = document.getElementById('btn-serial-field-move-up');
        btnSerialFieldMoveDown = document.getElementById('btn-serial-field-move-down');
        btnCloneSerialByte = document.getElementById('btn-clone-serial-byte');
        btnDeleteSerialByte = document.getElementById('btn-delete-serial-byte');

        serialFieldsContainer = document.getElementById('serial-fields-container');
        btnAddSerialField = document.getElementById('btn-add-serial-field');
        btnPresetSerialBits = document.getElementById('btn-preset-serial-bits');
    }

    // 撤销/重做与自动草稿辅助函数
    function captureSerialMutation(actionName = '编辑') {
        if (serialUndoRedo && currentSerialProtocol) {
            serialUndoRedo.push(currentSerialProtocol, actionName);
        }
        if (ProtoView.ArchiveManager && currentSerialProtocol) {
            ProtoView.ArchiveManager.markProtocolModified(currentSerialProtocol);
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        }
        triggerSerialDraftSave();
    }

    function triggerSerialDraftSave() {
        if (!currentSerialProtocol) return;
        if (ProtoView.SaveStatus && serialSyncStatusBadge) {
            ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, 'unsaved');
        }
        if (ProtoView.DraftManager) {
            ProtoView.DraftManager.scheduleAutoSave(currentSerialProtocol, (draft) => {
                if (serialDraftBanner) serialDraftBanner.style.display = 'flex';
                const timeEl = document.getElementById('serial-draft-time');
                if (timeEl) timeEl.textContent = '刚刚';
            });
        }
    }

    function performSerialUndo() {
        if (!serialUndoRedo || !currentSerialProtocol) return;
        const restored = serialUndoRedo.undo(currentSerialProtocol);
        if (restored) {
            currentSerialProtocol = restored;
            getCurrentSerialPacket();
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
            renderSerialByteTimeline();
            renderSerialBytesList();
            renderSelectedSerialFieldInspector();
            triggerSerialDraftSave();
            showToast('已撤销操作 (Undo)', 'info');
        }
    }

    function performSerialRedo() {
        if (!serialUndoRedo || !currentSerialProtocol) return;
        const restored = serialUndoRedo.redo(currentSerialProtocol);
        if (restored) {
            currentSerialProtocol = restored;
            getCurrentSerialPacket();
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
            renderSerialByteTimeline();
            renderSerialBytesList();
            renderSelectedSerialFieldInspector();
            triggerSerialDraftSave();
            showToast('已重做操作 (Redo)', 'info');
        }
    }

    // 辅助：安全获取当前选中的数据包
    function getCurrentSerialPacket() {
        if (!currentSerialProtocol || !currentSerialProtocol.packets || currentSerialProtocol.packets.length === 0) {
            return null;
        }
        if (currentSerialPacketIndex < 0 || currentSerialPacketIndex >= currentSerialProtocol.packets.length) {
            currentSerialPacketIndex = 0;
        }
        const pkt = currentSerialProtocol.packets[currentSerialPacketIndex];
        if (typeof SerialHelper !== 'undefined') {
            SerialHelper.normalizePacket(pkt);
        }
        return pkt;
    }

    // 辅助：安全获取当前选中的字节字段
    function getCurrentSerialField() {
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields || pkt.fields.length === 0) return null;
        if (currentSerialFieldIndex < 0 || currentSerialFieldIndex >= pkt.fields.length) {
            currentSerialFieldIndex = 0;
        }
        return pkt.fields[currentSerialFieldIndex];
    }

    // 更新顶部工具栏串口协议信息 (精简显示：仅协议名称，去除重复的产品前缀与冗余徽章)
    function updateSerialToolbarProtocolInfo() {
        if (!currentSerialProtocol) {
            if (serialToolbarProtoTitle) serialToolbarProtoTitle.innerHTML = `<i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> 串口协议工作台`;
            if (badgeSerialBaud) badgeSerialBaud.innerHTML = `<i class="fa-solid fa-gauge-high"></i> - bps`;
            if (badgeSerialParity) badgeSerialParity.textContent = '无校验';
            if (serialPacketSelect) serialPacketSelect.innerHTML = '<option value="">(无数据包)</option>';
            return;
        }

        const p = currentSerialProtocol;
        window.currentSerialProtocol = currentSerialProtocol;

        if (ProtoView.ArchiveManager) {
            ProtoView.ArchiveManager.ensureProtocolVersion(p);
        } else if (ProtoView.VersionManager) {
            ProtoView.VersionManager.ensureProtocolVersion(p);
        }
        const verInfo = ProtoView.ArchiveManager
            ? ProtoView.ArchiveManager.getVersionDisplayInfo(p)
            : { versionText: p.version || 'v1.0', baseVersion: p.version || 'v1.0', isArchived: Boolean(p.isArchived), isModified: false, statusLabel: p.isArchived ? '已归档' : '未归档', statusClass: p.isArchived ? 'is-archived' : 'not-archived', versionPillClass: 'proto-version-pill', tooltip: '' };

        const serialVerPill = document.getElementById('serial-ver-pill');
        const serialArchiveBadge = document.getElementById('serial-archive-badge');
        if (serialVerPill) {
            serialVerPill.textContent = verInfo.versionText;
            serialVerPill.className = verInfo.versionPillClass;
            serialVerPill.title = '点击打开协议版本管理中心与版本发展历程';
            serialVerPill.onclick = () => {
                if (window.openProtocolVersionModal) window.openProtocolVersionModal(p);
                else if (window.openProtocolDiffModal) window.openProtocolDiffModal(p);
            };
        }
        if (serialArchiveBadge) {
            serialArchiveBadge.className = `proto-archive-badge ${verInfo.statusClass}`;
            serialArchiveBadge.innerHTML = `<i class="fa-solid ${verInfo.isArchived ? 'fa-box-archive' : (verInfo.isModified ? 'fa-pen-to-square' : 'fa-folder-open')}"></i> ${verInfo.statusLabel}`;
            serialArchiveBadge.title = verInfo.tooltip;
            serialArchiveBadge.onclick = () => {
                if (window.handleProtocolArchive) window.handleProtocolArchive(p);
            };
        }

        const btnSerialArchive = document.getElementById('btn-serial-archive');
        if (btnSerialArchive) {
            btnSerialArchive.className = `dense-btn ${verInfo.archiveBtnClass || ''}`;
            btnSerialArchive.disabled = !verInfo.canArchive;
            btnSerialArchive.style.opacity = verInfo.canArchive ? '1' : '0.65';
            btnSerialArchive.style.cursor = verInfo.canArchive ? 'pointer' : 'not-allowed';
            btnSerialArchive.title = verInfo.canArchive ? (verInfo.isModified ? '协议发生修改：点击升版归档' : '首次归档当前协议为正式基准') : '当前协议已归档且无改动，无需重复归档';
            btnSerialArchive.innerHTML = `<i class="fa-solid ${verInfo.archiveBtnIcon}" style="color:${verInfo.canArchive ? (verInfo.isModified ? 'var(--accent-color)' : '#059669') : 'var(--success)'};"></i> <span>${verInfo.archiveBtnText}</span>`;
            btnSerialArchive.onclick = () => {
                if (window.handleProtocolArchive && p) window.handleProtocolArchive(p);
            };
        }

        if (serialToolbarProtoTitle) {
            serialToolbarProtoTitle.innerHTML = `<i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> ${escapeHTML(p.name || '串口协议')}`;
            serialToolbarProtoTitle.title = (p.product ? `所属产品: ${p.product}\n` : '') + `协议名称: ${p.name || '串口协议'}\n接口类型: ${p.subType || 'RS485'}\n波特率: ${p.baudRate || 115200} bps | 校验: ${p.parity || 'none'}\n方向: ${p.direction || 'Tx'} | 周期: ${p.period || 20}ms`;
        }

        if (badgeSerialBaud) {
            badgeSerialBaud.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${p.baudRate || 115200} bps`;
        }
        if (badgeSerialParity) {
            const parityMap = { 'odd': '奇校验', 'even': '偶校验', 'none': '无校验' };
            badgeSerialParity.textContent = parityMap[p.parity] || '无校验';
        }

        // 下拉包选项
        if (serialPacketSelect) {
            const packets = p.packets || [];
            serialPacketSelect.innerHTML = '';
            packets.forEach((pkt, idx) => {
                const opt = document.createElement('option');
                opt.value = idx.toString();
                const isRx = pkt.direction === 'Rx';
                const pktPeriod = pkt.period !== undefined ? pkt.period : (p.period || 20);
                const periodText = isRx ? '' : ` ${pktPeriod}ms`;
                opt.textContent = pkt.name || '未命名数据包';
                opt.title = `[${isRx ? '接收' : '发送'}${periodText}] ${pkt.name || '未命名数据包'}`;
                if (idx === currentSerialPacketIndex) {
                    opt.selected = true;
                }
                serialPacketSelect.appendChild(opt);
            });
        }
    }

    // 载入指定串口协议到工作台 (自动检测并提示恢复本地草稿)
    async function loadSerialProtocolIntoEditor(id) {
        initDOMElements();
        const p = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!p) return;

        // 检查是否存在更新的本地草稿
        let isUsingDraft = false;
        let draftObj = null;
        if (ProtoView.DraftManager) {
            draftObj = ProtoView.DraftManager.getDraft(p);
            if (draftObj && ProtoView.DraftManager.isDraftNewer(draftObj, p)) {
                currentSerialProtocol = draftObj.data;
                isUsingDraft = true;
            } else {
                currentSerialProtocol = p;
            }
        } else {
            currentSerialProtocol = p;
        }

        if (!isUsingDraft && ProtoView.ArchiveManager) {
            ProtoView.ArchiveManager.ensureProtocolVersion(currentSerialProtocol);
            if (!ProtoView.ArchiveManager.hasChangesAgainstArchived(currentSerialProtocol)) {
                currentSerialProtocol.isArchived = true;
                currentSerialProtocol.hasUnarchivedChanges = false;
                if (ProtoView.DraftManager) ProtoView.DraftManager.clearDraft(currentSerialProtocol);
            }
        }

        if (!currentSerialProtocol.packets || !Array.isArray(currentSerialProtocol.packets) || currentSerialProtocol.packets.length === 0) {
            currentSerialProtocol.packets = [
                {
                    key: 'pkt_1',
                    name: '数据包 1',
                    cmd: '0x01',
                    direction: currentSerialProtocol.direction || 'Tx',
                    fields: []
                }
            ];
        }

        if (typeof SerialHelper !== 'undefined') {
            currentSerialProtocol.packets.forEach(pkt => SerialHelper.normalizePacket(pkt));
        }

        if (currentSerialPacketIndex >= currentSerialProtocol.packets.length) {
            currentSerialPacketIndex = 0;
        }
        currentSerialFieldIndex = 0;

        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();

        // 联动草稿横幅提示与 5 态保存状态指示徽章
        if (serialDraftBanner) {
            if (isUsingDraft) {
                serialDraftBanner.style.display = 'flex';
                const timeEl = document.getElementById('serial-draft-time');
                if (timeEl && draftObj) {
                    timeEl.textContent = ProtoView.DraftManager.formatRelativeTime(draftObj.savedAt);
                }
            } else {
                serialDraftBanner.style.display = 'none';
            }
        }

        if (ProtoView.SaveStatus && serialSyncStatusBadge) {
            if (isUsingDraft) {
                ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, 'unsaved');
                if (ProtoView.DraftManager) ProtoView.DraftManager.setUnsaved(true);
            } else {
                const initialStatus = p._fromCloud ? 'cloud_synced' : 'saved_local';
                ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, initialStatus, { lastSavedTime: p._cloudUpdated });
                if (ProtoView.DraftManager) ProtoView.DraftManager.setUnsaved(false);
            }
        }

        if (serialUndoRedo) {
            serialUndoRedo.reset();
        }
    }

    // 聚焦并红色高亮闪烁特定字段卡片
    function highlightAndScrollToSerialField(fieldIndex) {
        setTimeout(() => {
            const card = document.getElementById(`serial-field-card-${fieldIndex}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.remove('field-highlight-flash');
                void card.offsetWidth;
                card.classList.add('field-highlight-flash');
                setTimeout(() => {
                    card.classList.remove('field-highlight-flash');
                }, 1600);
            }
        }, 50);
    }

    // 同步顶部数据包属性与色块时序
    function renderSerialByteTimeline() {
        const pkt = getCurrentSerialPacket();
        if (!pkt) return;

        if (serialPacketName && document.activeElement !== serialPacketName) {
            serialPacketName.value = pkt.name || '';
        }
        const isTx = pkt.direction !== 'Rx';
        if (serialPacketDirection) {
            serialPacketDirection.value = isTx ? 'Tx' : 'Rx';
        }
        if (!serialPacketPeriodItem) {
            serialPacketPeriodItem = document.getElementById('serial-packet-period-item');
        }
        if (serialPacketPeriodItem) {
            serialPacketPeriodItem.style.display = isTx ? 'flex' : 'none';
        }
        if (serialPacketPeriod && document.activeElement !== serialPacketPeriod) {
            serialPacketPeriod.value = pkt.period !== undefined ? pkt.period : ((currentSerialProtocol && currentSerialProtocol.period) || 20);
        }

        const totalBytes = (typeof SerialHelper !== 'undefined') ? SerialHelper.calcPacketTotalBytes(pkt) : (pkt.fields ? pkt.fields.length : 0);
        const fCount = pkt.fields ? pkt.fields.length : 0;
        if (serialBytesCountBadge) {
            serialBytesCountBadge.textContent = fCount;
        }
        if (mobileSerialPacketsCount) {
            mobileSerialPacketsCount.textContent = fCount;
        }

        if (!serialByteTimeline) return;
        if (!pkt.fields || pkt.fields.length === 0) {
            serialByteTimeline.innerHTML = '<span style="color:var(--text-secondary); font-size:12px; padding:6px 12px;">当前数据包暂无字节定义，请在左侧表格添加字节。</span>';
            if (serialTimelineTotalBadge) serialTimelineTotalBadge.textContent = '整包: 0 字节';
            return;
        }

        if (serialTimelineTotalBadge) {
            serialTimelineTotalBadge.textContent = `整包: ${totalBytes} 字节`;
        }

        serialByteTimeline.innerHTML = '';
        pkt.fields.forEach((f, idx) => {
            const off = Number(f.byteOffset) || 0;
            const cnt = Number(f.byteCount) || 1;
            const spanText = (typeof SerialHelper !== 'undefined') ? SerialHelper.formatByteSpanText(off, cnt) : `B${off}`;

            const block = document.createElement('div');
            let roleClass = 'seg-data';
            switch (f.role) {
                case 'header': roleClass = 'seg-header'; break;
                case 'addr': roleClass = 'seg-addr'; break;
                case 'cmd': roleClass = 'seg-cmd'; break;
                case 'length': roleClass = 'seg-len'; break;
                case 'checksum': roleClass = 'seg-crc'; break;
                case 'tail': roleClass = 'seg-tail'; break;
                case 'bitfield': roleClass = 'seg-bitfield'; break;
                case 'reserved': roleClass = 'seg-reserved'; break;
                default: roleClass = 'seg-data'; break;
            }

            block.className = `serial-timeline-block ${roleClass} ${idx === currentSerialFieldIndex ? 'active' : ''}`;
            block.title = `${spanText} | ${f.name || f.key || '字段'} (${f.dataType || 'u8'})\n点击快速定位选中`;

            block.innerHTML = `
                <span class="tblk-byte">${escapeHTML(spanText)}</span>
                <span class="tblk-name">${escapeHTML(f.name || f.key || '未命名')}</span>
            `;

            block.addEventListener('click', () => {
                currentSerialFieldIndex = idx;
                renderSerialByteTimeline();
                renderSerialBytesList();
                renderSelectedSerialFieldInspector();
                const activeTr = serialBytesList ? serialBytesList.querySelector('.dense-word-row.selected') : null;
                if (activeTr) {
                    activeTr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                if (window.innerWidth <= 768) {
                    setMobileSerialView('detail');
                }
            });

            serialByteTimeline.appendChild(block);
        });
    }

    // 渲染左侧单字节序清单表格 (4 列对齐 429：序号, 名称, 字段数, 操作)
    function renderSerialBytesList() {
        if (!serialBytesList) return;
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields || pkt.fields.length === 0) {
            serialBytesList.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state" style="padding: 26px 12px; text-align: center;">
                        <i class="fa-solid fa-cube" style="font-size: 24px; color: var(--accent-color); opacity: 0.5; margin-bottom: 8px; display: block;"></i>
                        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">当前数据包暂无字节定义</div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 12px;">每个单字节可包含一个或多个位段字段 (如 bit0, bit0-1 等)</div>
                        <button type="button" class="dense-btn dense-btn-primary dense-btn-xs" onclick="window.addSerialByte && window.addSerialByte();">
                            <i class="fa-solid fa-plus"></i> 点击添加第 1 个字节
                        </button>
                    </td>
                </tr>
            `;
            if (serialBytesCountBadge) serialBytesCountBadge.textContent = '0';
            if (mobileSerialPacketsCount) mobileSerialPacketsCount.textContent = '0';
            return;
        }

        const fields = pkt.fields;
        if (serialBytesCountBadge) serialBytesCountBadge.textContent = fields.length;
        if (mobileSerialPacketsCount) mobileSerialPacketsCount.textContent = fields.length;

        let filtered = fields.map((f, idx) => ({ ...f, originalIndex: idx }));
        if (serialByteFilter !== 'all') {
            if (serialByteFilter === 'data') {
                filtered = filtered.filter(f => !f.signals || f.signals.length <= 1);
            } else if (serialByteFilter === 'bitfield') {
                filtered = filtered.filter(f => (f.signals && f.signals.length > 1) || (f.signals && f.signals.some(s => s.dataType === 'bool')));
            } else if (serialByteFilter === 'proto') {
                filtered = filtered.filter(f => (f.name && (f.name.includes('头') || f.name.includes('尾') || f.name.includes('校验') || f.name.includes('地址') || f.name.includes('CMD'))));
            }
        }

        if (serialByteSearchQuery) {
            const q = serialByteSearchQuery.toLowerCase();
            filtered = filtered.filter(f => {
                const matchName = f.name && f.name.toLowerCase().includes(q);
                const matchKey = f.key && f.key.toLowerCase().includes(q);
                const matchOff = String(f.byteOffset).includes(q);
                const matchSig = f.signals && f.signals.some(s => (s.name && s.name.toLowerCase().includes(q)) || (s.bitRange && s.bitRange.toLowerCase().includes(q)));
                return matchName || matchKey || matchOff || matchSig;
            });
        }

        serialBytesList.innerHTML = '';
        if (filtered.length === 0) {
            serialBytesList.innerHTML = '<tr><td colspan="4" class="empty-state">未找到匹配的字节</td></tr>';
            return;
        }

        filtered.forEach((item, fIdx) => {
            const tr = document.createElement('tr');
            tr.className = `dense-word-row ${item.originalIndex === currentSerialFieldIndex ? 'selected' : ''}`;

            const off = Number(item.byteOffset) || 0;
            const spanText = `Byte ${off}`;
            const sigCount = (item.signals ? item.signals.length : 0);

            let matchedFieldHint = '';
            let firstMatchedFieldIndex = -1;
            if (serialByteSearchQuery && item.signals) {
                const q = serialByteSearchQuery.toLowerCase();
                const matchedFields = [];
                item.signals.forEach((s, sIdx) => {
                    if (s && ((s.name && s.name.toLowerCase().includes(q)) || (s.bitRange && s.bitRange.toLowerCase().includes(q)))) {
                        matchedFields.push(s);
                        if (firstMatchedFieldIndex === -1) firstMatchedFieldIndex = sIdx;
                    }
                });
                if (matchedFields.length > 0) {
                    matchedFieldHint = ` (匹配字段: ${matchedFields.map(s => s.name || s.bitRange).join(', ')})`;
                }
            }

            if (item.name || matchedFieldHint) {
                tr.title = `Byte ${off}: ${item.name || '未命名'}${matchedFieldHint}`;
            }

            tr.innerHTML = `
                <td class="col-idx" style="text-align:center;">#${fIdx + 1}</td>
                <td class="col-label">
                    <span class="octal-num" style="background: rgba(234, 88, 12, 0.12); color: #ea580c; border: 1px solid rgba(234, 88, 12, 0.25); border-radius: 3px; padding: 1px 4px; font-size: 11px;">${escapeHTML(spanText)}</span>
                    <span class="word-mini-name" title="${escapeHTML(item.name || item.key || '未命名')}">${escapeHTML(item.name || item.key || '未命名')}</span>
                    ${firstMatchedFieldIndex !== -1 ? `<button type="button" class="word-search-match-btn btn-locate-matched-field" data-byte-index="${item.originalIndex}" data-field-index="${firstMatchedFieldIndex}" title="点击直接定位并高亮闪烁该字段"><i class="fa-solid fa-magnifying-glass"></i></button>` : ''}
                </td>
                <td class="col-count" style="text-align:center;">
                    <span class="dense-count-pill">${sigCount}</span>
                </td>
                <td class="col-action" style="text-align:center;">
                    <button type="button" class="btn-del-serial-byte word-row-del-btn" data-idx="${item.originalIndex}" title="删除此字节 [Byte ${off} ${escapeHTML(item.name || '')}]">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;

            const locateBtn = tr.querySelector('.btn-locate-matched-field');
            if (locateBtn) {
                locateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentSerialFieldIndex = item.originalIndex;
                    renderSerialBytesList();
                    renderSerialByteTimeline();
                    renderSelectedSerialFieldInspector();
                    if (window.innerWidth <= 768) {
                        setMobileSerialView('detail');
                    }
                    highlightAndScrollToSerialField(firstMatchedFieldIndex);
                });
            }

            tr.addEventListener('click', (e) => {
                if (e.target.closest('.btn-del-serial-byte') || e.target.closest('.btn-locate-matched-field')) return;
                currentSerialFieldIndex = item.originalIndex;
                renderSerialBytesList();
                renderSerialByteTimeline();
                renderSelectedSerialFieldInspector();
                if (window.innerWidth <= 768) {
                    setMobileSerialView('detail');
                }
            });

            const delBtn = tr.querySelector('.btn-del-serial-byte');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteSerialField(item.originalIndex);
                });
            }

            serialBytesList.appendChild(tr);
        });
    }

    // 渲染右侧选中的单字节详细配置
    function renderSelectedSerialFieldInspector() {
        const pkt = getCurrentSerialPacket();
        const field = getCurrentSerialField();

        if (!pkt || !field) {
            if (inspectorByteSpanVal) inspectorByteSpanVal.textContent = '未选择';
            if (serialFieldName) serialFieldName.value = '';
            if (serialFieldKey) serialFieldKey.value = '';
            if (serialPropFixedHex) serialPropFixedHex.value = '00';
            if (serialFieldsContainer) serialFieldsContainer.innerHTML = '';
            return;
        }

        const off = Number(field.byteOffset) || 0;
        const byteLabel = `Byte ${off}`;

        if (inspectorByteSpanVal) inspectorByteSpanVal.textContent = byteLabel;
        if (mobileActivePacketCmd) mobileActivePacketCmd.textContent = byteLabel;

        if (serialFieldName) serialFieldName.value = field.name || '';
        if (serialFieldKey) serialFieldKey.value = field.key || '';
        if (serialPropFixedHex) {
            serialPropFixedHex.value = (field.fixedHex !== undefined && field.fixedHex !== null && field.fixedHex !== '') 
                ? String(field.fixedHex).padStart(2, '0').slice(-2).toUpperCase() 
                : (field.defaultValue !== undefined ? Number(field.defaultValue).toString(16).padStart(2, '0').toUpperCase() : '00');
        }

        // 规范化 signals 列表
        if (!field.signals || !Array.isArray(field.signals) || field.signals.length === 0) {
            if (field.bitfields && Array.isArray(field.bitfields) && field.bitfields.length > 0) {
                field.signals = field.bitfields.map((bf, idx) => ({
                    key: `${field.key || 'sig'}_b${bf.bit !== undefined ? bf.bit : idx}`,
                    name: bf.name || `信号 Bit ${bf.bit}`,
                    bitRange: `bit${bf.bit !== undefined ? bf.bit : idx}`,
                    dataType: 'bool',
                    dict: { "0": bf.desc0 || '关 / 正常', "1": bf.desc1 || '开 / 告警' },
                    resolution: '',
                    precision: '',
                    min: '',
                    max: '',
                    unit: '',
                    remark: ''
                }));
            } else {
                field.signals = [
                    {
                        key: field.key || `sig_${off}`,
                        name: field.name || `字节_${off}数据`,
                        bitRange: 'bit0-7',
                        dataType: (field.dataType === 'bool' ? 'bool' : (field.dataType === 'u16' ? 'u16' : 'u8')),
                        dict: field.dict || {},
                        resolution: (field.scale !== undefined && field.scale !== 1 && field.scale !== null) ? field.scale : '',
                        precision: (field.offset !== undefined && field.offset !== 0 && field.offset !== null) ? field.offset : '',
                        min: field.min || '',
                        max: field.max || '',
                        unit: field.unit || '',
                        remark: field.remark || ''
                    }
                ];
            }
        }

        renderSerialFieldCards(field);
    }

    // 辅助解析字段位段起始位与长度
    function parseBitRangeHelper(sig) {
        const curType = (sig.dataType || '').toLowerCase();
        const maxBits = (curType === 'u16') ? 16 : 8;
        if (sig.startBit !== undefined && sig.startBit !== null && sig.startBit !== '') {
            const s = Math.max(0, Math.min(7, parseInt(sig.startBit, 10) || 0));
            const cnt = Math.max(1, Math.min(maxBits, parseInt(sig.bitCount || sig.length, 10) || 1));
            return { startBit: s, bitCount: cnt };
        }
        const r = String(sig.bitRange || '');
        const m = r.match(/^(?:bit)?\s*([0-7])(?:\s*[-~至到,]\s*(?:bit)?\s*(\d+))?$/i);
        if (m) {
            const s = parseInt(m[1], 10);
            const e = m[2] !== undefined ? parseInt(m[2], 10) : s;
            const start = Math.min(s, e);
            const count = Math.min(maxBits, Math.max(s, e) - start + 1);
            return { startBit: start, bitCount: count };
        }
        return { startBit: 0, bitCount: (curType === 'bool' ? 1 : (curType === 'u16' ? 16 : 8)) };
    }

    // 渲染单字节内部的字段卡片列表 (与429保持一致：起始位与占用长度，克隆/新建自动计算)
    function renderSerialFieldCards(field) {
        if (!serialFieldsContainer) return;
        serialFieldsContainer.innerHTML = '';

        if (!field.signals || field.signals.length === 0) {
            serialFieldsContainer.innerHTML = `
                <div class="field-card-empty-state">
                    <i class="fa-solid fa-layer-group" style="font-size: 28px; margin-bottom: 10px; display: block; color: var(--accent-color); opacity: 0.6;"></i>
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">当前单字节暂无字段卡片</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">点击右上角「+ 添加字段卡片」划分字段，或点击「预设 8 Bits」快速填充 8 个开关位。</div>
                    <button type="button" class="dense-btn dense-btn-primary" onclick="if(window.addSerialFieldCard){window.addSerialFieldCard();}">
                        <i class="fa-solid fa-plus"></i> 立即添加字段卡片
                    </button>
                </div>
            `;
            return;
        }

        field.signals.forEach((sig, sIdx) => {
            const card = document.createElement('div');
            card.className = 'dense-field-card';
            card.id = `serial-field-card-${sIdx}`;
            card.setAttribute('data-sig-index', sIdx);

            let curType = (sig.dataType || '').toLowerCase();
            if (curType !== 'bool') {
                curType = 'u8';
            }

            const parsed = parseBitRangeHelper(sig);
            let startBit = parsed.startBit;
            let bitCount = parsed.bitCount;
            if (curType === 'bool') {
                bitCount = 1;
            } else if (bitCount > 8) {
                bitCount = 8;
            }

            // 核心：第2个及以后的字段，自动顺延上一字段的 (起始位 + 占用位数)
            if (sIdx > 0) {
                const prevSig = field.signals[sIdx - 1];
                const prevStart = Number(prevSig.startBit !== undefined && prevSig.startBit !== null ? prevSig.startBit : 0);
                const prevCount = Number(prevSig.bitCount || prevSig.length || 1);
                startBit = prevStart + prevCount;
            }

            sig.startBit = startBit;
            sig.bitCount = bitCount;
            sig.length = bitCount;
            sig.dataType = curType;
            sig.endianness = 'none';

            const endBit = startBit + bitCount - 1;
            const isOverflow = endBit > 7;
            sig.bitRange = `bit${startBit}${bitCount > 1 ? `-${endBit}` : ''}`;

            let dictBadgesHTML = '';
            const dict = sig.dict || {};
            const keys = Object.keys(dict);
            if (keys.length > 0) {
                keys.slice(0, 5).forEach(k => {
                    dictBadgesHTML += `<span class="dense-dict-tag" title="${escapeHTML(k)}: ${escapeHTML(dict[k])}">${escapeHTML(k)}:${escapeHTML(dict[k])}</span>`;
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
                        <span class="field-card-idx">#${sIdx + 1}</span>
                        <div class="field-card-name-wrap">
                            <i class="fa-solid fa-tag field-card-name-icon"></i>
                            <input type="text" class="field-in-name field-card-name-input" value="${escapeHTML(sig.name || '')}" placeholder="字段名称 (例如: 接触器状态 / 母线电压高8位)" title="输入字段名称">
                        </div>
                        <div class="field-card-header-dict">
                            <button type="button" class="dense-dict-btn btn-edit-field-dict" title="配置状态字典映射">
                                <i class="fa-solid fa-book"></i> 状态字典
                            </button>
                            <div class="dense-dict-list">${dictBadgesHTML}</div>
                        </div>
                    </div>
                    <div class="field-card-header-right">
                        <span class="dense-bit-span ${isOverflow ? 'dense-bit-span-overflow' : ''}" id="serial-bit-badge-${sIdx}" title="${isOverflow ? '警告：位段超出单字节 8 位 (bit0~bit7)' : '位段范围'}">
                            <i class="fa-solid fa-sliders"></i> bit${startBit}${bitCount > 1 ? `~bit${endBit}` : ''} (${bitCount}b)
                        </span>
                        <button type="button" class="dense-clone-btn btn-clone-serial-sig" title="克隆当前字段 (自动顺延计算下一起始位)">
                            <i class="fa-solid fa-copy"></i> 克隆
                        </button>
                        <button type="button" class="dense-del-btn btn-del-serial-sig" title="删除该字段卡片">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <div class="field-card-props-flow">
                    <div class="field-card-cell" style="width: 76px;">
                        <label class="field-card-label"><i class="fa-solid fa-cube"></i> 类型</label>
                        <select class="field-in-type field-card-select" title="数据类型 (bool / u8)">
                            <option value="bool" ${curType === 'bool' ? 'selected' : ''}>bool</option>
                            <option value="u8" ${curType === 'u8' ? 'selected' : ''}>u8</option>
                        </select>
                    </div>

                    <div class="field-card-cell" style="width: 56px;">
                        <label class="field-card-label"><i class="fa-solid fa-play"></i> 起始</label>
                        <div class="field-card-input-wrap">
                            <input type="number" class="field-in-start field-card-input" min="0" max="7" value="${startBit}" ${sIdx > 0 ? 'readonly style="background-color: var(--bg-hover); opacity: 0.85; cursor: default;" title="自动计算：由上一字段起始位与占用长度顺延计算 (bit' + startBit + ')"' : 'title="在当前单字节中的起始位 (bit0~bit7)"'}>
                            <span class="field-card-addon">位</span>
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 56px;">
                        <label class="field-card-label"><i class="fa-solid fa-ruler-horizontal"></i> 占用</label>
                        <div class="field-card-input-wrap">
                            <input type="number" class="field-in-bitcount field-card-input" min="1" max="${curType === 'bool' ? 1 : 8}" value="${curType === 'bool' ? 1 : bitCount}" ${curType === 'bool' ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''} title="占用的位数 (bool: 1位, u8: 1~8位)">
                            <span class="field-card-addon">b</span>
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 86px;">
                        <label class="field-card-label"><i class="fa-solid fa-arrows-left-right"></i> 字节序</label>
                        <select class="field-in-endian field-card-select" disabled title="8位及以内单字节字段无需配置字节序" style="opacity: 0.45; cursor: not-allowed;">
                            <option value="none">- 无 -</option>
                        </select>
                    </div>

                    <div class="field-card-cell" style="width: 66px;">
                        <label class="field-card-label"><i class="fa-solid fa-calculator"></i> 分辨率</label>
                        <input type="number" class="field-in-res field-card-input" step="any" value="${(sig.resolution !== undefined && sig.resolution !== null) ? sig.resolution : ((sig.scale !== undefined && sig.scale !== 1 && sig.scale !== null) ? sig.scale : '')}" placeholder="空" title="分辨率 / 缩放因子 Scale (未填写则留空)">
                    </div>

                    <div class="field-card-cell" style="width: 66px;">
                        <label class="field-card-label"><i class="fa-solid fa-bullseye"></i> 精度</label>
                        <input type="text" class="field-in-offset field-card-input" value="${(sig.precision !== undefined && sig.precision !== null && sig.precision !== '') ? sig.precision : ((sig.offset !== undefined && sig.offset !== null && sig.offset !== '' && sig.offset !== 0) ? sig.offset : '')}" placeholder="空" title="精度 / 偏置 Offset (支持小数或文本，未填写则留空)">
                    </div>

                    <div class="field-card-cell" style="width: 135px;">
                        <label class="field-card-label"><i class="fa-solid fa-gauge-high"></i> 范围(Min~Max)</label>
                        <div class="field-card-minmax">
                            <input type="text" class="field-in-min field-card-input" value="${(sig.min !== undefined && sig.min !== null) ? sig.min : ''}" placeholder="Min" title="最小值">
                            <span>~</span>
                            <input type="text" class="field-in-max field-card-input" value="${(sig.max !== undefined && sig.max !== null) ? sig.max : ''}" placeholder="Max" title="最大值">
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 55px;">
                        <label class="field-card-label"><i class="fa-solid fa-tag"></i> 单位</label>
                        <input type="text" class="field-in-unit field-card-input" value="${escapeHTML(sig.unit || '')}" placeholder="空" title="工程量单位 (如 V, A, ℃, 默认空)">
                    </div>

                    <div class="field-card-cell field-card-cell-remark">
                        <label class="field-card-label"><i class="fa-solid fa-note-sticky"></i> 备注</label>
                        <input type="text" class="field-in-remark field-card-input" value="${escapeHTML(sig.remark || '')}" placeholder="空" title="字段备注说明 (默认空)">
                    </div>
                </div>
            `;

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
            const bitBadge = card.querySelector(`#serial-bit-badge-${sIdx}`);

            const onCardChange = () => {
                sig.name = inName.value.trim();
                const currentType = inType.value;
                sig.dataType = currentType;

                let sBit = parseInt(inStart.value, 10);
                if (isNaN(sBit) || sBit < 0) sBit = 0;
                if (sBit > 7) sBit = 7;
                if (sIdx === 0) inStart.value = sBit;

                let bCount = parseInt(inBitCount.value, 10);
                if (isNaN(bCount) || bCount < 1) bCount = 1;
                const maxBits = (currentType === 'bool' ? 1 : 8);
                if (bCount > maxBits) bCount = maxBits;
                inBitCount.value = bCount;

                sig.startBit = sBit;
                sig.bitCount = bCount;
                sig.length = bCount;
                sig.endianness = 'none';

                const eBit = sBit + bCount - 1;
                sig.bitRange = `bit${sBit}${bCount > 1 ? `-${eBit}` : ''}`;

                sig.resolution = inRes.value.trim() !== '' ? (parseFloat(inRes.value) || inRes.value.trim()) : '';
                sig.scale = sig.resolution !== '' ? sig.resolution : 1;
                const precRaw = inOffset.value.trim();
                sig.precision = precRaw !== '' ? (!isNaN(Number(precRaw)) ? parseFloat(precRaw) : precRaw) : '';
                sig.offset = sig.precision !== '' ? sig.precision : 0;
                sig.min = inMin.value.trim();
                sig.max = inMax.value.trim();
                sig.unit = inUnit.value.trim();
                sig.remark = inRemark ? inRemark.value.trim() : '';

                if (bitBadge) {
                    const over = eBit > 7;
                    bitBadge.className = `dense-bit-span ${over ? 'dense-bit-span-overflow' : ''}`;
                    bitBadge.title = over ? '警告：位段超出单字节 8 位 (bit0~bit7)' : '位段范围';
                    bitBadge.innerHTML = `<i class="fa-solid fa-sliders"></i> bit${sBit}${bCount > 1 ? `~bit${eBit}` : ''} (${bCount}b)`;
                }

                // 核心：像 429 自由 Bit 模式一样，向后级联自动计算后续所有字段的起始位
                for (let j = sIdx + 1; j < field.signals.length; j++) {
                    const prevF = field.signals[j - 1];
                    const nextStart = Number(prevF.startBit !== undefined ? prevF.startBit : 0) + Number(prevF.bitCount || prevF.length || 1);
                    field.signals[j].startBit = nextStart;
                    const nextCount = Number(field.signals[j].bitCount || field.signals[j].length || 1);
                    const nextEnd = nextStart + nextCount - 1;
                    field.signals[j].bitRange = `bit${nextStart}${nextCount > 1 ? `-${nextEnd}` : ''}`;

                    const nextCard = document.getElementById(`serial-field-card-${j}`);
                    if (nextCard) {
                        const nextStartIn = nextCard.querySelector('.field-in-start');
                        if (nextStartIn) {
                            nextStartIn.value = nextStart;
                            nextStartIn.title = `自动计算：由上一字段起始位与占用长度顺延计算 (bit${nextStart})`;
                        }
                        const nextBitBadge = nextCard.querySelector(`#serial-bit-badge-${j}`);
                        if (nextBitBadge) {
                            const over = nextEnd > 7;
                            nextBitBadge.className = `dense-bit-span ${over ? 'dense-bit-span-overflow' : ''}`;
                            nextBitBadge.title = over ? '警告：位段超出单字节 8 位 (bit0~bit7)' : '位段范围';
                            nextBitBadge.innerHTML = `<i class="fa-solid fa-sliders"></i> bit${nextStart}${nextCount > 1 ? `~bit${nextEnd}` : ''} (${nextCount}b)`;
                        }
                    }
                }

                renderSerialBytesList();
                triggerSerialDraftSave();
            };

            const onFieldPropCommit = (propName) => {
                captureSerialMutation(`修改${propName || '字段属性'}`);
                triggerSerialDraftSave();
            };

            inType.addEventListener('change', () => {
                const selType = inType.value;
                if (selType === 'bool') {
                    inBitCount.value = '1';
                    inBitCount.max = '1';
                    inBitCount.disabled = true;
                    inBitCount.style.opacity = '0.6';
                    inBitCount.style.cursor = 'not-allowed';
                } else {
                    const curC = parseInt(inBitCount.value, 10) || 8;
                    inBitCount.max = '8';
                    inBitCount.disabled = false;
                    inBitCount.style.opacity = '1';
                    inBitCount.style.cursor = 'auto';
                    if (curC > 8 || curC < 1) inBitCount.value = '8';
                }
                if (inEndian) {
                    inEndian.disabled = true;
                    inEndian.style.opacity = '0.45';
                    inEndian.style.cursor = 'not-allowed';
                    inEndian.innerHTML = '<option value="none">- 无 -</option>';
                    inEndian.value = 'none';
                }
                sig.endianness = 'none';
                onCardChange();
                onFieldPropCommit('类型');
            });

            if (inEndian) {
                inEndian.addEventListener('change', () => {
                    sig.endianness = inEndian.value;
                    onFieldPropCommit('字节序');
                });
            }
            inStart.addEventListener('input', onCardChange);
            inStart.addEventListener('change', () => onFieldPropCommit('起始位'));
            inBitCount.addEventListener('input', onCardChange);
            inBitCount.addEventListener('change', () => onFieldPropCommit('位长度'));
            inRes.addEventListener('input', onCardChange);
            inRes.addEventListener('change', () => onFieldPropCommit('分辨率'));
            inOffset.addEventListener('input', onCardChange);
            inOffset.addEventListener('change', () => onFieldPropCommit('精度'));
            inMin.addEventListener('input', onCardChange);
            inMin.addEventListener('change', () => onFieldPropCommit('量程'));
            inMax.addEventListener('input', onCardChange);
            inMax.addEventListener('change', () => onFieldPropCommit('量程'));
            inUnit.addEventListener('input', onCardChange);
            inUnit.addEventListener('change', () => onFieldPropCommit('单位'));
            if (inRemark) {
                inRemark.addEventListener('input', onCardChange);
                inRemark.addEventListener('change', () => onFieldPropCommit('备注'));
            }

            const btnDict = card.querySelector('.btn-edit-field-dict');
            if (btnDict) {
                btnDict.addEventListener('click', () => {
                    if (typeof window.openDictModal === 'function') {
                        window.openDictModal(sig, `字段 [${sig.name || sig.bitRange || '未命名字段'}]`, () => {
                            captureSerialMutation('修改字段字典');
                            renderSerialFieldCards(field);
                            renderSerialBytesList();
                            triggerSerialDraftSave();
                        });
                    }
                });
            }

            const btnClone = card.querySelector('.btn-clone-serial-sig');
            if (btnClone) {
                btnClone.addEventListener('click', () => {
                    const curStart = Number(sig.startBit !== undefined ? sig.startBit : 0);
                    let curCount = Number(sig.bitCount || sig.length || 1);

                    // 若当前整个单字节只有一个 8 位字段，克隆代表用户希望拆解子字段，自动将首字段置为 1 位开关
                    const isSingle8Bit = sIdx === 0 && field.signals.length === 1 && curCount === 8 && curStart === 0;

                    let totalAlloc = 0;
                    field.signals.forEach(s => totalAlloc += Number(s.bitCount || s.length || 1));
                    if (totalAlloc >= 8 && !isSingle8Bit) {
                        showToast('当前单字节已占满 8 位 (bit0~bit7)，无法继续克隆新字段！', 'warning');
                        return;
                    }

                    if (isSingle8Bit) {
                        sig.bitCount = 1;
                        sig.length = 1;
                        sig.dataType = 'bool';
                        sig.bitRange = 'bit0';
                        curCount = 1;
                    }

                    const nextStart = curStart + curCount;
                    if (nextStart >= 8) {
                        showToast('当前单字节剩余空间不足 (起始位最多为 7)，无法继续克隆！', 'warning');
                        return;
                    }

                    captureSerialMutation('克隆字段卡片');
                    const cloned = JSON.parse(JSON.stringify(sig));
                    cloned.name = sig.name ? `${sig.name}_副本` : '新字段';
                    cloned.key = `sig_${Date.now().toString().slice(-6)}`;
                    cloned.startBit = nextStart;
                    if (cloned.dataType === 'bool') {
                        cloned.bitCount = 1;
                        cloned.length = 1;
                    } else if (cloned.dataType === 'u8') {
                        cloned.bitCount = Math.max(1, Math.min(curCount, 8 - nextStart));
                        cloned.length = cloned.bitCount;
                    }
                    const endB = cloned.startBit + cloned.bitCount - 1;
                    cloned.bitRange = `bit${cloned.startBit}${cloned.bitCount > 1 ? `-${endB}` : ''}`;

                    field.signals.splice(sIdx + 1, 0, cloned);

                    // 级联顺延对后续所有字段重新计算起始位
                    field.signals.forEach((s, idx) => {
                        if (idx === 0) {
                            s.startBit = Number(s.startBit !== undefined ? s.startBit : 0);
                        } else {
                            const prev = field.signals[idx - 1];
                            s.startBit = Number(prev.startBit !== undefined ? prev.startBit : 0) + Number(prev.bitCount || prev.length || 1);
                        }
                        const count = Number(s.bitCount || s.length || 1);
                        const eb = s.startBit + count - 1;
                        s.bitRange = `bit${s.startBit}${count > 1 ? `-${eb}` : ''}`;
                    });

                    renderSerialFieldCards(field);
                    renderSerialBytesList();
                    triggerSerialDraftSave();
                    showToast(`已克隆字段「${cloned.name}」(自动顺延起始位: bit${cloned.startBit})`, 'success');
                });
            }

            const btnDel = card.querySelector('.btn-del-serial-sig');
            if (btnDel) {
                btnDel.addEventListener('click', () => {
                    captureSerialMutation('删除字段卡片');
                    field.signals.splice(sIdx, 1);
                    if (field.signals.length > 0) {
                        field.signals.forEach((s, idx) => {
                            if (idx === 0) {
                                s.startBit = Number(s.startBit !== undefined ? s.startBit : 0);
                            } else {
                                const prev = field.signals[idx - 1];
                                s.startBit = Number(prev.startBit !== undefined ? prev.startBit : 0) + Number(prev.bitCount || prev.length || 1);
                            }
                            const count = Number(s.bitCount || s.length || 1);
                            const eb = s.startBit + count - 1;
                            s.bitRange = `bit${s.startBit}${count > 1 ? `-${eb}` : ''}`;
                        });
                    }
                    renderSerialFieldCards(field);
                    renderSerialBytesList();
                    triggerSerialDraftSave();
                    showToast('已删除字段卡片', 'info');
                });
            }

            serialFieldsContainer.appendChild(card);
        });
    }

    // 添加字段卡片与预设 8 Bits (自动计算下一个起始位置)
    function addSerialFieldCard() {
        const field = getCurrentSerialField();
        if (!field) {
            alert('请先在左侧列表中选中一个单字节！');
            return;
        }
        if (!field.signals) field.signals = [];

        // 检查当前字节是否已占满 8 位 (bit0~bit7)
        let totalAlloc = 0;
        field.signals.forEach(s => totalAlloc += Number(s.bitCount || s.length || 1));
        const isSingle8Bit = field.signals.length === 1 && (Number(field.signals[0].bitCount || field.signals[0].length) === 8 || field.signals[0].bitRange === 'bit0-7') && Number(field.signals[0].startBit || 0) === 0;

        if (totalAlloc >= 8 && !isSingle8Bit) {
            showToast('当前单字节已占满 8 位 (bit0~bit7)，无法继续添加字段！', 'warning');
            return;
        }

        let nextStart = 0;
        let defaultCount = 1;
        if (field.signals.length > 0) {
            const lastSig = field.signals[field.signals.length - 1];
            // 若原先是单个 8 位字段，拆解为开关位
            if (isSingle8Bit) {
                lastSig.bitCount = 1;
                lastSig.length = 1;
                lastSig.dataType = 'bool';
                lastSig.bitRange = 'bit0';
            }
            const lastStart = Number(lastSig.startBit !== undefined ? lastSig.startBit : 0);
            const lastCount = Number(lastSig.bitCount || lastSig.length || 1);
            nextStart = lastStart + lastCount;
            if (nextStart >= 8) {
                showToast('当前单字节已占满 8 位 (bit0~bit7)，无法继续添加字段！', 'warning');
                return;
            }
            defaultCount = Math.min(1, 8 - nextStart);
        }

        captureSerialMutation('添加字段卡片');

        const count = field.signals.length;
        const newSig = {
            key: `sig_${Date.now().toString().slice(-6)}`,
            name: `字段_${count + 1}`,
            startBit: nextStart,
            bitCount: defaultCount,
            length: defaultCount,
            bitRange: `bit${nextStart}${defaultCount > 1 ? `-${nextStart + defaultCount - 1}` : ''}`,
            dataType: defaultCount === 1 ? 'bool' : 'u8',
            resolution: '',
            precision: '',
            min: '',
            max: '',
            unit: '',
            dict: {},
            remark: ''
        };
        field.signals.push(newSig);
        renderSerialFieldCards(field);
        renderSerialBytesList();
        triggerSerialDraftSave();
        showToast(`已添加新字段卡片 (自动计算起始位: bit${nextStart})！`, 'success');
    }

    function presetSerial8Bits() {
        const field = getCurrentSerialField();
        if (!field) {
            alert('请先在左侧列表中选中一个单字节！');
            return;
        }
        captureSerialMutation('预设8Bits');
        const presets = [
            { key: 'bit_0', startBit: 0, bitCount: 1, length: 1, bitRange: 'bit0', name: '电源使能状态', dataType: 'bool', dict: { "0": "关断", "1": "开启" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_1', startBit: 1, bitCount: 1, length: 1, bitRange: 'bit1', name: '工作运行准备', dataType: 'bool', dict: { "0": "未就绪", "1": "就绪" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_2', startBit: 2, bitCount: 1, length: 1, bitRange: 'bit2', name: '主备通道切换', dataType: 'bool', dict: { "0": "主路A", "1": "备用B" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_3', startBit: 3, bitCount: 1, length: 1, bitRange: 'bit3', name: '自检BIT状态', dataType: 'bool', dict: { "0": "正常", "1": "故障" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_4', startBit: 4, bitCount: 1, length: 1, bitRange: 'bit4', name: '过流报警标志', dataType: 'bool', dict: { "0": "正常", "1": "告警" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_5', startBit: 5, bitCount: 1, length: 1, bitRange: 'bit5', name: '过温报警标志', dataType: 'bool', dict: { "0": "正常", "1": "告警" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_6', startBit: 6, bitCount: 1, length: 1, bitRange: 'bit6', name: '链路通信心跳', dataType: 'bool', dict: { "0": "离线", "1": "在线" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
            { key: 'bit_7', startBit: 7, bitCount: 1, length: 1, bitRange: 'bit7', name: '紧急刹车标志', dataType: 'bool', dict: { "0": "释放", "1": "制动" }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' }
        ];
        field.signals = presets;
        renderSerialFieldCards(field);
        renderSerialBytesList();
        triggerSerialDraftSave();
        showToast('已为当前字节填充 8 个独立 Bit (bit0 ~ bit7) 状态开关卡片！', 'success');
    }

    // 单字节操作：顺排偏移、添加字节、克隆、删除、移动
    function autoAssignSerialOffsets() {
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields || pkt.fields.length === 0) return;
        captureSerialMutation('重排字节偏移');
        pkt.fields.forEach((f, idx) => {
            f.byteOffset = idx;
            f.byteCount = 1;
        });
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        triggerSerialDraftSave();
        showToast('已按照列表当前顺序顺排字节序号 (从 Byte 0 连续排布)！', 'success');
    }

    async function addSerialByte() {
        try {
            if (!currentSerialProtocol) {
                const all = await (window.dbHelper ? window.dbHelper.getAllProtocols() : []);
                const sp = all.find(p => p.type === 'Serial');
                if (sp) {
                    await loadSerialProtocolIntoEditor(sp.id);
                } else {
                    alert('请先在「协议列表」中选择或新建一个串口通信协议！');
                    return;
                }
            }

            let pkt = getCurrentSerialPacket();
            if (!pkt) {
                if (currentSerialProtocol) {
                    if (!currentSerialProtocol.packets) currentSerialProtocol.packets = [];
                    pkt = {
                        key: 'pkt_1',
                        name: '默认数据包',
                        cmd: '0x01',
                        direction: 'Tx',
                        period: 20,
                        fields: []
                    };
                    currentSerialProtocol.packets.push(pkt);
                    currentSerialPacketIndex = 0;
                } else {
                    alert('请先选择或新建一个串口通信协议！');
                    return;
                }
            }

            captureSerialMutation('添加字节');

            if (!pkt.fields) pkt.fields = [];

            let nextOff = 0;
            if (pkt.fields.length > 0) {
                const last = pkt.fields[pkt.fields.length - 1];
                nextOff = (Number(last.byteOffset) || 0) + 1;
            }

            const newByte = {
                key: `byte_${nextOff}`,
                name: `字节_${nextOff}`,
                byteOffset: nextOff,
                byteCount: 1,
                fixedHex: '00',
                signals: [
                    {
                        key: `sig_${nextOff}_1`,
                        name: `字节_${nextOff}数据`,
                        startBit: 0,
                        bitCount: 8,
                        length: 8,
                        bitRange: 'bit0-7',
                        dataType: 'u8',
                        resolution: '',
                        precision: '',
                        min: '',
                        max: '',
                        unit: '',
                        dict: {},
                        remark: ''
                    }
                ]
            };

            pkt.fields.push(newByte);
            currentSerialFieldIndex = pkt.fields.length - 1;

            serialByteFilter = 'all';
            serialByteSearchQuery = '';
            if (serialByteSearch) serialByteSearch.value = '';
            if (serialByteFilterButtons) {
                serialByteFilterButtons.forEach(b => {
                    b.classList.toggle('active', (b.getAttribute('data-filter') || 'all') === 'all');
                });
            }

            renderSerialByteTimeline();
            renderSerialBytesList();
            renderSelectedSerialFieldInspector();
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
            triggerSerialDraftSave();

            setTimeout(() => {
                const activeTr = serialBytesList ? serialBytesList.querySelector('.dense-word-row.selected') : null;
                if (activeTr) {
                    activeTr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 60);

            if (serialFieldName) {
                serialFieldName.focus();
                serialFieldName.select();
            }
            showToast(`已成功添加「Byte ${nextOff}」(${newByte.name})！`, 'success');
        } catch (err) {
            console.error("添加字节异常:", err);
            alert("添加字节异常: " + err.message);
        }
    }

    function cloneSerialByte() {
        const pkt = getCurrentSerialPacket();
        const field = getCurrentSerialField();
        if (!pkt || !field) return;

        captureSerialMutation('克隆字节');

        const cloned = JSON.parse(JSON.stringify(field));
        cloned.name = `${field.name || '字节'}_副本`;
        cloned.key = `byte_${Date.now().toString().slice(-4)}`;
        cloned.byteOffset = (Number(field.byteOffset) || 0) + 1;

        pkt.fields.splice(currentSerialFieldIndex + 1, 0, cloned);
        currentSerialFieldIndex = currentSerialFieldIndex + 1;

        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        triggerSerialDraftSave();
        showToast(`已成功克隆字节「${cloned.name}」`, 'success');
    }

    async function deleteSerialField(idx) {
        const targetIdx = (idx !== undefined && idx !== null) ? Number(idx) : currentSerialFieldIndex;
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields || pkt.fields.length === 0) return;

        const f = pkt.fields[targetIdx];
        if (!f) return;

        const ok = await (ProtoView.showConfirm ? ProtoView.showConfirm({
            title: '删除字节确认',
            icon: 'fa-trash-can',
            type: 'danger',
            message: `确定要删除字节「${f.name || `Byte ${f.byteOffset}`}」吗？`,
            detail: '删除后，该单字节及其包含的所有位段字段定义都将被移除。',
            confirmText: '确认删除',
            cancelText: '取消'
        }) : Promise.resolve(confirm(`确定要删除字节「${f.name || `Byte ${f.byteOffset}`}」吗？`)));
        if (!ok) return;

        captureSerialMutation('删除字节');

        pkt.fields.splice(targetIdx, 1);
        if (currentSerialFieldIndex >= pkt.fields.length) {
            currentSerialFieldIndex = Math.max(0, pkt.fields.length - 1);
        }

        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        triggerSerialDraftSave();
        showToast('字节已删除', 'info');
    }

    function moveSerialField(delta) {
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields) return;
        const newIdx = currentSerialFieldIndex + delta;
        if (newIdx < 0 || newIdx >= pkt.fields.length) return;

        captureSerialMutation('移动字节');

        const tmp = pkt.fields[currentSerialFieldIndex];
        pkt.fields[currentSerialFieldIndex] = pkt.fields[newIdx];
        pkt.fields[newIdx] = tmp;
        currentSerialFieldIndex = newIdx;

        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        triggerSerialDraftSave();

        setTimeout(() => {
            const activeTr = serialBytesList ? serialBytesList.querySelector('.dense-word-row.selected') : null;
            if (activeTr) {
                activeTr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);
    }

    // 数据包操作：切换、添加、克隆、删除
    function addSerialPacket() {
        if (!currentSerialProtocol) return;
        if (typeof finishRenameSerialPacket === 'function') finishRenameSerialPacket(false);
        captureSerialMutation('添加数据包');
        if (!currentSerialProtocol.packets) currentSerialProtocol.packets = [];

        const count = currentSerialProtocol.packets.length;
        const nextCmdDec = count + 1;
        const nextCmdHex = '0x' + nextCmdDec.toString(16).padStart(2, '0').toUpperCase();

        const newPkt = {
            key: `pkt_${nextCmdDec}`,
            name: `数据包_${nextCmdDec}`,
            cmd: nextCmdHex,
            direction: 'Tx',
            period: 20,
            fields: []
        };

        currentSerialProtocol.packets.push(newPkt);
        currentSerialPacketIndex = currentSerialProtocol.packets.length - 1;
        currentSerialFieldIndex = 0;

        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        triggerSerialDraftSave();
        showToast(`已新建数据包「${newPkt.name}」`, 'success');
    }

    function duplicateCurrentSerialPacket() {
        if (!currentSerialProtocol || !currentSerialProtocol.packets || !currentSerialProtocol.packets[currentSerialPacketIndex]) return;

        captureSerialMutation('克隆数据包');

        const src = currentSerialProtocol.packets[currentSerialPacketIndex];
        const cloned = JSON.parse(JSON.stringify(src));

        let currentDec = parseInt((cloned.cmd || '0x01').replace(/0x/i, ''), 16);
        if (isNaN(currentDec)) currentDec = currentSerialProtocol.packets.length;
        const nextCmdHex = '0x' + (currentDec + 1).toString(16).padStart(2, '0').toUpperCase();

        cloned.name = `${src.name || '数据包'}_副本`;
        cloned.cmd = nextCmdHex;
        cloned.key = `pkt_${Date.now().toString().slice(-4)}`;

        currentSerialProtocol.packets.splice(currentSerialPacketIndex + 1, 0, cloned);
        currentSerialPacketIndex = currentSerialPacketIndex + 1;
        currentSerialFieldIndex = 0;

        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        triggerSerialDraftSave();
        showToast(`已成功克隆数据包「${cloned.name}」`, 'success');
    }

    async function deleteCurrentSerialPacket() {
        if (!currentSerialProtocol || !currentSerialProtocol.packets) return;
        if (currentSerialProtocol.packets.length <= 1) {
            showToast('协议至少需要保留一个数据包，不能删除！', 'warning');
            return;
        }

        const pkt = currentSerialProtocol.packets[currentSerialPacketIndex];
        const ok = await (ProtoView.showConfirm ? ProtoView.showConfirm({
            title: '删除数据包确认',
            icon: 'fa-trash-can',
            type: 'danger',
            message: `确定要删除当前数据包「${pkt.name || pkt.cmd}」吗？`,
            detail: '删除后，该数据包内部包含的所有字节与位段字段定义都将被彻底移除。',
            confirmText: '确认删除',
            cancelText: '取消'
        }) : Promise.resolve(confirm(`确定要删除当前数据包「${pkt.name || pkt.cmd}」吗？`)));
        if (!ok) return;

        captureSerialMutation('删除数据包');

        currentSerialProtocol.packets.splice(currentSerialPacketIndex, 1);
        if (currentSerialPacketIndex >= currentSerialProtocol.packets.length) {
            currentSerialPacketIndex = currentSerialProtocol.packets.length - 1;
        }
        currentSerialFieldIndex = 0;

        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        triggerSerialDraftSave();
        showToast('数据包已删除', 'info');
    }

    // 修改串口数据包名称 (系统统一自定义输入弹窗)
    async function renameCurrentSerialPacket() {
        const activePkt = getCurrentSerialPacket();
        if (!activePkt) return;
        const oldName = activePkt.name || `数据包 ${currentSerialPacketIndex + 1}`;
        const newName = await (ProtoView.showPrompt ? ProtoView.showPrompt({
            title: '修改串口数据包名称',
            label: '请输入新的数据包名称：',
            defaultValue: oldName,
            placeholder: '如: 心跳遥测数据包',
            confirmText: '保存名称',
            cancelText: '取消'
        }) : Promise.resolve(prompt('请输入数据包名称：', oldName)));
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        captureSerialMutation('重命名数据包');
        activePkt.name = trimmed;
        if (serialPacketName) serialPacketName.value = trimmed;
        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }
        updateSerialToolbarProtocolInfo();
        triggerSerialDraftSave();
        showToast(`已将数据包重命名为「${trimmed}」`, 'success');
    }

    // 向后兼容保留方法名
    function startRenameSerialPacket() {
        renameCurrentSerialPacket();
    }
    function finishRenameSerialPacket() {}

    // 确保当前有串口协议处于载入状态
    async function ensureSerialProtocolLoaded() {
        initDOMElements();
        if (currentSerialProtocol && currentSerialProtocol.packets && currentSerialProtocol.packets.length > 0) {
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
            renderSerialByteTimeline();
            renderSerialBytesList();
            renderSelectedSerialFieldInspector();
            return;
        }

        const all = await (window.dbHelper ? window.dbHelper.getAllProtocols() : []);
        const serialProto = all.find(p => p.type === 'Serial');
        if (serialProto) {
            await loadSerialProtocolIntoEditor(serialProto.id);
        } else {
            currentSerialProtocol = null;
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
            renderSerialByteTimeline();
            renderSerialBytesList();
            renderSelectedSerialFieldInspector();
        }
    }

    // 保存当前串口协议 (支持 5 态状态提示、并发冲突仲裁与重试)
    async function saveCurrentSerialProtocol(forceOverwrite = false) {
        if (!currentSerialProtocol) return;

        if (ProtoView.SaveStatus && serialSyncStatusBadge) {
            ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, 'pending_sync');
        }

        if (ProtoView.ArchiveManager && currentSerialProtocol) {
            // 保存动作仅为数据持久化，不应盲目将已归档无修改的协议改为“修改中”
            if (!ProtoView.ArchiveManager.hasChangesAgainstArchived(currentSerialProtocol)) {
                currentSerialProtocol.isArchived = true;
                currentSerialProtocol.hasUnarchivedChanges = false;
            }
        }

        // 同步当前包的修改
        const activePkt = getCurrentSerialPacket();
        if (activePkt && serialPacketName) {
            activePkt.name = serialPacketName.value.trim() || activePkt.name;
        }

        currentSerialProtocol.updatedAt = new Date().toISOString();

        // 1. 本地数据库先行保存
        const id = await window.dbHelper.saveProtocol(currentSerialProtocol);
        currentSerialProtocol.id = id;

        // 2. 云端原生同步
        let cloudRes = { ok: true };
        if (ProtoView.WorkspaceSync) {
            cloudRes = await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(currentSerialProtocol, {
                expectedUpdated: currentSerialProtocol._cloudUpdated || 0,
                force: forceOverwrite
            });
        }

        // 3. 处理两台设备同时修改引起的云端并发冲突
        if (cloudRes.conflict) {
            if (ProtoView.ConflictManager) {
                const choice = await ProtoView.ConflictManager.resolve(currentSerialProtocol, cloudRes);
                if (choice === 'overwrite') {
                    return await saveCurrentSerialProtocol(true);
                } else if (choice === 'pull') {
                    if (ProtoView.DraftManager) ProtoView.DraftManager.clearDraft(currentSerialProtocol);
                    await ProtoView.WorkspaceSync.syncCloudProtocols(false);
                    await loadSerialProtocolIntoEditor(currentSerialProtocol.id);
                    showToast('已拉取云端最新版本并重载至工作台', 'info');
                    return;
                } else if (choice === 'copy') {
                    const copyProto = JSON.parse(JSON.stringify(currentSerialProtocol));
                    delete copyProto.id;
                    delete copyProto._cloudKey;
                    copyProto.name = `${currentSerialProtocol.name}_本地副本`;
                    const newId = await window.dbHelper.saveProtocol(copyProto);
                    if (ProtoView.DraftManager) ProtoView.DraftManager.clearDraft(currentSerialProtocol);
                    await loadSerialProtocolIntoEditor(newId);
                    await saveCurrentSerialProtocol(false);
                    showToast(`已将本地修改另存为新协议「${copyProto.name}」`, 'success');
                    return;
                } else {
                    if (ProtoView.SaveStatus && serialSyncStatusBadge) {
                        ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, 'saved_local');
                    }
                    return;
                }
            }
        }

        // 4. 同步成功或失败状态反馈
        if (cloudRes.ok) {
            if (ProtoView.SaveStatus && serialSyncStatusBadge) {
                ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, cloudRes.isLocal ? 'saved_local' : 'cloud_synced', {
                    lastSavedTime: Date.now()
                });
            }
            if (ProtoView.DraftManager) {
                ProtoView.DraftManager.clearDraft(currentSerialProtocol);
            }
            if (serialDraftBanner) serialDraftBanner.style.display = 'none';

            if (btnSerialSave) {
                const origHTML = btnSerialSave.innerHTML;
                btnSerialSave.innerHTML = `<i class="fa-solid fa-check"></i> ` + (cloudRes.isLocal ? '本地已保存!' : '云端已同步!');
                btnSerialSave.style.backgroundColor = 'var(--success)';
                setTimeout(() => {
                    btnSerialSave.innerHTML = origHTML;
                    btnSerialSave.style.backgroundColor = '';
                }, 1600);
            }
        } else {
            if (ProtoView.SaveStatus && serialSyncStatusBadge) {
                ProtoView.SaveStatus.renderBadge(serialSyncStatusBadge, 'sync_failed', {
                    errorMsg: cloudRes.error,
                    onRetry: () => saveCurrentSerialProtocol(forceOverwrite)
                });
            }
            if (btnSerialSave) {
                const origHTML = btnSerialSave.innerHTML;
                btnSerialSave.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 仅本地保存`;
                btnSerialSave.style.backgroundColor = 'var(--warning)';
                setTimeout(() => {
                    btnSerialSave.innerHTML = origHTML;
                    btnSerialSave.style.backgroundColor = '';
                }, 1800);
            }
            showToast(`本地已保存，但云端同步未成功: ${cloudRes.error} (支持点击状态栏重试)`, 'warning');
        }

        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
        if (typeof window.loadProtocols === 'function') {
            await window.loadProtocols();
        }
    }

    function setMobileSerialView(tab) {
        if (!serialDenseWorkbench) return;
        if (tab === 'detail') {
            serialDenseWorkbench.classList.remove('mobile-view-words');
            serialDenseWorkbench.classList.add('mobile-view-detail');
            if (btnSerialMobileTabPackets) btnSerialMobileTabPackets.classList.remove('active');
            if (btnSerialMobileTabDetail) btnSerialMobileTabDetail.classList.add('active');
        } else {
            serialDenseWorkbench.classList.remove('mobile-view-detail');
            serialDenseWorkbench.classList.add('mobile-view-words');
            if (btnSerialMobileTabDetail) btnSerialMobileTabDetail.classList.remove('active');
            if (btnSerialMobileTabPackets) btnSerialMobileTabPackets.classList.add('active');
        }
    }

    // 绑定所有事件监听
    function bindSerialEvents() {
        initDOMElements();

        if (btnSerialMobileTabPackets) btnSerialMobileTabPackets.addEventListener('click', () => setMobileSerialView('packets'));
        if (btnSerialMobileTabDetail) btnSerialMobileTabDetail.addEventListener('click', () => setMobileSerialView('detail'));
        if (btnSerialMobileBackPackets) btnSerialMobileBackPackets.addEventListener('click', () => setMobileSerialView('packets'));

        if (btnSerialUndo) {
            btnSerialUndo.addEventListener('click', performSerialUndo);
        }
        if (btnSerialRedo) {
            btnSerialRedo.addEventListener('click', performSerialRedo);
        }

        if (btnSerialDraftDiscard) {
            btnSerialDraftDiscard.addEventListener('click', async () => {
                if (!currentSerialProtocol) return;
                const ok = await (ProtoView.showConfirm ? ProtoView.showConfirm({
                    title: '放弃未保存草稿',
                    icon: 'fa-rotate-left',
                    type: 'warning',
                    message: '确定要放弃本地自动保存的草稿吗？',
                    detail: '将重新加载数据库已保存的干净版本，本次会话的所有未保存编辑将被放弃。',
                    confirmText: '确认放弃草稿',
                    cancelText: '保留草稿'
                }) : Promise.resolve(confirm('确定要放弃本地自动保存的草稿吗？将重新加载数据库已保存的版本。')));

                if (ok) {
                    if (ProtoView.DraftManager) {
                        ProtoView.DraftManager.clearDraft(currentSerialProtocol);
                    }
                    if (serialDraftBanner) serialDraftBanner.style.display = 'none';
                    if (currentSerialProtocol.id) {
                        await loadSerialProtocolIntoEditor(currentSerialProtocol.id);
                    }
                    showToast('已放弃本地草稿，恢复至数据库版本', 'info');
                }
            });
        }
        if (btnSerialDraftSave) {
            btnSerialDraftSave.addEventListener('click', () => {
                saveCurrentSerialProtocol();
            });
        }

        if (btnSerialBack) {
            btnSerialBack.addEventListener('click', () => {
                if (typeof window.switchToView === 'function') window.switchToView('protocol-view');
            });
        }

        if (btnViewSerialProps) {
            btnViewSerialProps.addEventListener('click', () => {
                if (typeof window.openProtocolPropsModal === 'function') window.openProtocolPropsModal(currentSerialProtocol);
            });
        }

        if (badgeSerialBaud) {
            badgeSerialBaud.addEventListener('click', () => {
                if (typeof window.openProtocolPropsModal === 'function') window.openProtocolPropsModal(currentSerialProtocol);
            });
        }

        if (badgeSerialParity) {
            badgeSerialParity.addEventListener('click', () => {
                if (typeof window.openProtocolPropsModal === 'function') window.openProtocolPropsModal(currentSerialProtocol);
            });
        }

        if (btnSerialSave) {
            btnSerialSave.addEventListener('click', saveCurrentSerialProtocol);
        }

        const btnSerialSwitchViewer = document.getElementById('btn-serial-switch-viewer');
        if (btnSerialSwitchViewer) {
            btnSerialSwitchViewer.addEventListener('click', () => {
                if (typeof window.openProtocolViewer === 'function') {
                    window.openProtocolViewer(currentSerialProtocol);
                }
            });
        }

        if (serialPacketSelect) {
            serialPacketSelect.addEventListener('change', (e) => {
                currentSerialPacketIndex = parseInt(e.target.value, 10) || 0;
                currentSerialFieldIndex = 0;
                renderSerialByteTimeline();
                renderSerialBytesList();
                renderSelectedSerialFieldInspector();
                if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
                    ProtoView.ActiveSession.set(currentSerialProtocol);
                }
                updateSerialToolbarProtocolInfo();
            });
        }

        if (btnRenameSerialPacket) {
            btnRenameSerialPacket.addEventListener('click', renameCurrentSerialPacket);
        }

        if (btnMenuRenameSerialPacket) {
            btnMenuRenameSerialPacket.addEventListener('click', () => {
                const moreDropdown = document.getElementById('serial-more-dropdown');
                if (moreDropdown) moreDropdown.classList.remove('active');
                renameCurrentSerialPacket();
            });
        }

        if (btnAddSerialPacket) {
            btnAddSerialPacket.addEventListener('click', addSerialPacket);
        }

        if (btnMenuAddSerialPacket) {
            btnMenuAddSerialPacket.addEventListener('click', () => {
                const moreDropdown = document.getElementById('serial-more-dropdown');
                if (moreDropdown) moreDropdown.classList.remove('active');
                addSerialPacket();
            });
        }

        if (btnDuplicateSerialPacket) {
            btnDuplicateSerialPacket.addEventListener('click', duplicateCurrentSerialPacket);
        }

        if (btnDeleteSerialPacket) {
            btnDeleteSerialPacket.addEventListener('click', deleteCurrentSerialPacket);
        }

        if (serialPacketName) {
            serialPacketName.addEventListener('input', (e) => {
                const pkt = getCurrentSerialPacket();
                if (!pkt) return;
                pkt.name = e.target.value.trim();
                if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
                triggerSerialDraftSave();
            });
            serialPacketName.addEventListener('change', () => {
                captureSerialMutation('修改数据包名称');
                triggerSerialDraftSave();
            });
        }

        if (serialPacketDirection) {
            serialPacketDirection.addEventListener('change', (e) => {
                const pkt = getCurrentSerialPacket();
                if (!pkt) return;
                captureSerialMutation('更改数据包方向');
                const newDir = e.target.value === 'Rx' ? 'Rx' : 'Tx';
                pkt.direction = newDir;
                if (!serialPacketPeriodItem) serialPacketPeriodItem = document.getElementById('serial-packet-period-item');
                if (serialPacketPeriodItem) {
                    serialPacketPeriodItem.style.display = (newDir === 'Tx') ? 'flex' : 'none';
                }
                if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
                renderSerialByteTimeline();
                triggerSerialDraftSave();
            });
        }

        if (serialPacketPeriod) {
            serialPacketPeriod.addEventListener('input', (e) => {
                const pkt = getCurrentSerialPacket();
                if (!pkt) return;
                pkt.period = Number(e.target.value) || 20;
                if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
            ProtoView.ActiveSession.set(currentSerialProtocol);
        }

        updateSerialToolbarProtocolInfo();
                triggerSerialDraftSave();
            });
            serialPacketPeriod.addEventListener('change', () => {
                captureSerialMutation('修改数据包周期');
                triggerSerialDraftSave();
            });
        }

        if (btnSerialAutoOffsets) {
            btnSerialAutoOffsets.onclick = (e) => {
                if (e) e.preventDefault();
                autoAssignSerialOffsets();
            };
        }

        if (btnAddSerialByte) {
            btnAddSerialByte.onclick = (e) => {
                if (e) e.preventDefault();
                addSerialByte();
            };
        }

        if (serialByteSearch) {
            serialByteSearch.addEventListener('input', (e) => {
                serialByteSearchQuery = e.target.value.trim();
                renderSerialBytesList();
            });
        }

        if (btnMoveByteUp) {
            btnMoveByteUp.onclick = (e) => {
                if (e) e.preventDefault();
                moveSerialField(-1);
            };
        }

        if (btnMoveByteDown) {
            btnMoveByteDown.onclick = (e) => {
                if (e) e.preventDefault();
                moveSerialField(1);
            };
        }

        if (serialByteFilterButtons) {
            serialByteFilterButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    serialByteFilterButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    serialByteFilter = btn.getAttribute('data-filter') || 'all';
                    renderSerialBytesList();
                });
            });
        }

        if (serialFieldName) {
            serialFieldName.addEventListener('input', (e) => {
                const field = getCurrentSerialField();
                if (!field) return;
                field.name = e.target.value.trim();
                renderSerialByteTimeline();
                renderSerialBytesList();
                triggerSerialDraftSave();
            });
            serialFieldName.addEventListener('change', () => {
                captureSerialMutation('修改字节名称');
                triggerSerialDraftSave();
            });
        }

        if (serialFieldKey) {
            serialFieldKey.addEventListener('input', (e) => {
                const field = getCurrentSerialField();
                if (!field) return;
                field.key = e.target.value.trim();
                renderSerialBytesList();
                triggerSerialDraftSave();
            });
            serialFieldKey.addEventListener('change', () => {
                captureSerialMutation('修改字节标识');
                triggerSerialDraftSave();
            });
        }

        if (btnSerialFieldMoveUp) {
            btnSerialFieldMoveUp.onclick = (e) => {
                if (e) e.preventDefault();
                moveSerialField(-1);
            };
        }

        if (btnSerialFieldMoveDown) {
            btnSerialFieldMoveDown.onclick = (e) => {
                if (e) e.preventDefault();
                moveSerialField(1);
            };
        }

        if (btnCloneSerialByte) {
            btnCloneSerialByte.onclick = (e) => {
                if (e) e.preventDefault();
                cloneSerialByte();
            };
        }

        if (btnDeleteSerialByte) {
            btnDeleteSerialByte.onclick = (e) => {
                if (e) e.preventDefault();
                deleteSerialField(currentSerialFieldIndex);
            };
        }

        if (serialPropFixedHex) {
            serialPropFixedHex.addEventListener('input', (e) => {
                const field = getCurrentSerialField();
                if (!field) return;
                field.fixedHex = e.target.value.trim().toUpperCase();
                renderSerialBytesList();
                triggerSerialDraftSave();
            });
            serialPropFixedHex.addEventListener('change', () => {
                captureSerialMutation('修改默认Hex');
                triggerSerialDraftSave();
            });
        }

        if (btnAddSerialField) {
            btnAddSerialField.onclick = (e) => {
                if (e) e.preventDefault();
                addSerialFieldCard();
            };
        }

        if (btnPresetSerialBits) {
            btnPresetSerialBits.onclick = (e) => {
                if (e) e.preventDefault();
                presetSerial8Bits();
            };
        }

        if (btnSerialExportJson) {
            btnSerialExportJson.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.openProtocolExportModal) {
                    window.openProtocolExportModal(currentSerialProtocol);
                } else if (currentSerialProtocol) {
                    const safeName = (currentSerialProtocol.name || 'serial_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                    const jsonStr = JSON.stringify(currentSerialProtocol, null, 2);
                    downloadFile(jsonStr, `${safeName}.json`, 'application/json');
                }
            });
        }

        // 串口面板拖拽调整宽度
        if (serialWorkbenchResizer && serialPacketsPanel) {
            let isResizingSerial = false;
            let startX = 0;
            let startWidth = 350;

            const savedW = localStorage.getItem('protoview_serial_packets_panel_width');
            if (savedW) {
                const parsedW = parseInt(savedW, 10);
                if (parsedW >= 200 && parsedW <= 700) {
                    serialPacketsPanel.style.width = `${parsedW}px`;
                }
            }

            serialWorkbenchResizer.addEventListener('mousedown', (e) => {
                isResizingSerial = true;
                startX = e.clientX;
                startWidth = serialPacketsPanel.getBoundingClientRect().width;
                serialWorkbenchResizer.classList.add('resizing');
                document.body.classList.add('resizing-active');
                e.preventDefault();
            });

            window.addEventListener('mousemove', (e) => {
                if (!isResizingSerial) return;
                const deltaX = e.clientX - startX;
                let newWidth = startWidth + deltaX;
                if (newWidth < 200) newWidth = 200;
                if (newWidth > 700) newWidth = 700;
                serialPacketsPanel.style.width = `${newWidth}px`;
            });

            window.addEventListener('mouseup', () => {
                if (!isResizingSerial) return;
                isResizingSerial = false;
                serialWorkbenchResizer.classList.remove('resizing');
                document.body.classList.remove('resizing-active');
                const finalWidth = parseInt(serialPacketsPanel.style.width, 10);
                if (!isNaN(finalWidth)) {
                    localStorage.setItem('protoview_serial_packets_panel_width', finalWidth.toString());
                }
            });
        }
    }

    // 控制器对象定义
    const SerialController = {
        getCurrentProtocol: () => currentSerialProtocol,
        setCurrentProtocol: (p) => { currentSerialProtocol = p; },
        loadSerialProtocolIntoEditor,
        renderSerialByteTimeline,
        renderSerialBytesList,
        renderSelectedSerialFieldInspector,
        renderSerialFieldCards,
        addSerialByte,
        addSerialFieldCard,
        presetSerial8Bits,
        autoAssignSerialOffsets,
        cloneSerialByte,
        deleteSerialField,
        moveSerialField,
        moveSerialByte: moveSerialField,
        addSerialPacket,
        duplicateCurrentSerialPacket,
        deleteCurrentSerialPacket,
        startRenameSerialPacket,
        finishRenameSerialPacket,
        ensureSerialProtocolLoaded,
        saveCurrentSerialProtocol,
        updateSerialToolbarProtocolInfo,
        setMobileSerialView,
        undo: performSerialUndo,
        redo: performSerialRedo,
        bindEvents: bindSerialEvents
    };

    ProtoView.Controllers.Serial = SerialController;
    global.ProtoView = ProtoView;

    // 向后兼容挂载到 window
    global.loadSerialProtocolIntoEditor = loadSerialProtocolIntoEditor;
    global.performSerialUndo = performSerialUndo;
    global.performSerialRedo = performSerialRedo;
    global.renderSerialByteTimeline = renderSerialByteTimeline;
    global.renderSerialBytesList = renderSerialBytesList;
    global.renderSelectedSerialFieldInspector = renderSelectedSerialFieldInspector;
    global.renderSerialFieldCards = renderSerialFieldCards;
    global.addSerialByte = addSerialByte;
    global.addSerialFieldCard = addSerialFieldCard;
    global.addSerialBitfieldSignal = addSerialFieldCard;
    global.presetSerial8Bits = presetSerial8Bits;
    global.presetAllBits = presetSerial8Bits;
    global.autoAssignSerialOffsets = autoAssignSerialOffsets;
    global.cloneSerialByte = cloneSerialByte;
    global.deleteSerialField = deleteSerialField;
    global.moveSerialField = moveSerialField;
    global.moveSerialByte = moveSerialField;
    global.addSerialPacket = addSerialPacket;
    global.duplicateCurrentSerialPacket = duplicateCurrentSerialPacket;
    global.deleteCurrentSerialPacket = deleteCurrentSerialPacket;
    global.renameCurrentSerialPacket = renameCurrentSerialPacket;
    global.startRenameSerialPacket = startRenameSerialPacket;
    global.finishRenameSerialPacket = finishRenameSerialPacket;
    global.ensureSerialProtocolLoaded = ensureSerialProtocolLoaded;
    global.saveCurrentSerialProtocol = saveCurrentSerialProtocol;
    global.setMobileSerialView = setMobileSerialView;

    // DOM 就绪后自动绑定事件
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSerialEvents);
    } else {
        bindSerialEvents();
    }

})(typeof window !== 'undefined' ? window : this);

