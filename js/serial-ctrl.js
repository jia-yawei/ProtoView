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
        serialPacketSelect,
        btnAddSerialPacket, btnDuplicateSerialPacket, btnDeleteSerialPacket, btnViewSerialProps,
        btnSerialExportJson, btnSerialSave;

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
        serialPacketSelect = document.getElementById('serial-packet-select');
        btnAddSerialPacket = document.getElementById('btn-add-serial-packet');
        btnDuplicateSerialPacket = document.getElementById('btn-duplicate-serial-packet');
        btnDeleteSerialPacket = document.getElementById('btn-delete-serial-packet');
        btnViewSerialProps = document.getElementById('btn-view-serial-props');
        btnSerialExportJson = document.getElementById('btn-serial-export-json');
        btnSerialSave = document.getElementById('btn-serial-save');

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
                opt.textContent = `[${isRx ? 'Rx' : 'Tx'}${periodText}] ${pkt.name || '未命名数据包'}`;
                if (idx === currentSerialPacketIndex) {
                    opt.selected = true;
                }
                serialPacketSelect.appendChild(opt);
            });
        }
    }

    // 载入指定串口协议到工作台
    async function loadSerialProtocolIntoEditor(id) {
        initDOMElements();
        const p = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!p) return;

        currentSerialProtocol = p;
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

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
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
                        dataType: (field.dataType === 'i8' ? 'i8' : (field.dataType === 'bool' ? 'bool' : 'u8')),
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
        if (sig.startBit !== undefined && sig.startBit !== null && sig.startBit !== '') {
            const s = Math.max(0, Math.min(7, parseInt(sig.startBit, 10) || 0));
            const cnt = Math.max(1, Math.min(8, parseInt(sig.bitCount || sig.length, 10) || 1));
            return { startBit: s, bitCount: cnt };
        }
        const r = String(sig.bitRange || '');
        const m = r.match(/^(?:bit)?\s*([0-7])(?:\s*[-~至到,]\s*(?:bit)?\s*([0-7]))?$/i);
        if (m) {
            const s = parseInt(m[1], 10);
            const e = m[2] !== undefined ? parseInt(m[2], 10) : s;
            const start = Math.min(s, e);
            const count = Math.max(s, e) - start + 1;
            return { startBit: start, bitCount: count };
        }
        return { startBit: 0, bitCount: 8 };
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

            const parsed = parseBitRangeHelper(sig);
            let startBit = parsed.startBit;
            let bitCount = parsed.bitCount;
            sig.startBit = startBit;
            sig.bitCount = bitCount;
            sig.length = bitCount;

            let curType = (sig.dataType || '').toLowerCase();
            if (curType !== 'i8' && curType !== 'bool') {
                curType = 'u8';
            }
            if (curType === 'bool') {
                bitCount = 1;
                sig.bitCount = 1;
                sig.length = 1;
            }
            sig.dataType = curType;

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
                    <div class="field-card-cell" style="width: 84px;">
                        <label class="field-card-label"><i class="fa-solid fa-cube"></i> 类型</label>
                        <select class="field-in-type field-card-select" title="数据类型 (u8 / i8 / bool)">
                            <option value="u8" ${curType === 'u8' ? 'selected' : ''}>u8 (无符号)</option>
                            <option value="i8" ${curType === 'i8' ? 'selected' : ''}>i8 (有符号)</option>
                            <option value="bool" ${curType === 'bool' ? 'selected' : ''}>bool (开关)</option>
                        </select>
                    </div>

                    <div class="field-card-cell" style="width: 56px;">
                        <label class="field-card-label"><i class="fa-solid fa-play"></i> 起始</label>
                        <div class="field-card-input-wrap">
                            <input type="number" class="field-in-start field-card-input" min="0" max="7" value="${startBit}" title="在当前单字节中的起始位 (bit0~bit7)">
                            <span class="field-card-addon">位</span>
                        </div>
                    </div>

                    <div class="field-card-cell" style="width: 56px;">
                        <label class="field-card-label"><i class="fa-solid fa-ruler-horizontal"></i> 占用</label>
                        <div class="field-card-input-wrap">
                            <input type="number" class="field-in-bitcount field-card-input" min="1" max="${curType === 'bool' ? 1 : 8}" value="${curType === 'bool' ? 1 : bitCount}" ${curType === 'bool' ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''} title="占用的位数 (1~8位)">
                            <span class="field-card-addon">b</span>
                        </div>
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
            const inRes = card.querySelector('.field-in-res');
            const inOffset = card.querySelector('.field-in-offset');
            const inMin = card.querySelector('.field-in-min');
            const inMax = card.querySelector('.field-in-max');
            const inUnit = card.querySelector('.field-in-unit');
            const inRemark = card.querySelector('.field-in-remark');
            const bitBadge = card.querySelector(`#serial-bit-badge-${sIdx}`);

            const onCardChange = () => {
                sig.name = inName.value.trim();
                sig.dataType = inType.value;

                if (sig.dataType === 'bool') {
                    inBitCount.value = 1;
                    inBitCount.disabled = true;
                    inBitCount.style.opacity = '0.6';
                    inBitCount.style.cursor = 'not-allowed';
                } else {
                    inBitCount.disabled = false;
                    inBitCount.style.opacity = '1';
                    inBitCount.style.cursor = 'auto';
                }

                let sBit = parseInt(inStart.value, 10);
                if (isNaN(sBit) || sBit < 0) sBit = 0;
                if (sBit > 7) sBit = 7;
                inStart.value = sBit;

                let bCount = parseInt(inBitCount.value, 10);
                if (isNaN(bCount) || bCount < 1) bCount = 1;
                if (bCount > 8) bCount = 8;
                inBitCount.value = bCount;

                sig.startBit = sBit;
                sig.bitCount = bCount;
                sig.length = bCount;
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
                renderSerialBytesList();
            };

            inName.addEventListener('input', onCardChange);
            inType.addEventListener('change', onCardChange);
            inStart.addEventListener('input', onCardChange);
            inBitCount.addEventListener('input', onCardChange);
            inRes.addEventListener('input', onCardChange);
            inOffset.addEventListener('input', onCardChange);
            inMin.addEventListener('input', onCardChange);
            inMax.addEventListener('input', onCardChange);
            inUnit.addEventListener('input', onCardChange);
            if (inRemark) inRemark.addEventListener('input', onCardChange);

            const btnDict = card.querySelector('.btn-edit-field-dict');
            if (btnDict) {
                btnDict.addEventListener('click', () => {
                    if (typeof window.openDictModal === 'function') {
                        window.openDictModal(sig, `字段 [${sig.name || sig.bitRange || '未命名字段'}]`, () => {
                            renderSerialFieldCards(field);
                            renderSerialBytesList();
                        });
                    }
                });
            }

            const btnClone = card.querySelector('.btn-clone-serial-sig');
            if (btnClone) {
                btnClone.addEventListener('click', () => {
                    const cloned = JSON.parse(JSON.stringify(sig));
                    cloned.name = sig.name ? `${sig.name}_副本` : '新字段';
                    cloned.key = `sig_${Date.now().toString().slice(-6)}`;

                    // 核心：自动计算下一个起始位置与长度 (起始位 = 当前起始 + 占用长度)
                    const curStart = Number(sig.startBit) || 0;
                    const curCount = Number(sig.bitCount || sig.length) || 1;
                    const nextStart = curStart + curCount;
                    if (nextStart <= 7) {
                        cloned.startBit = nextStart;
                        cloned.bitCount = Math.min(curCount, 8 - nextStart);
                    } else {
                        cloned.startBit = 0;
                        cloned.bitCount = curCount;
                    }
                    cloned.length = cloned.bitCount;
                    const endB = cloned.startBit + cloned.bitCount - 1;
                    cloned.bitRange = `bit${cloned.startBit}${cloned.bitCount > 1 ? `-${endB}` : ''}`;

                    field.signals.splice(sIdx + 1, 0, cloned);
                    renderSerialFieldCards(field);
                    renderSerialBytesList();
                    showToast(`已克隆字段「${cloned.name}」(自动顺延起始位: bit${cloned.startBit})`, 'success');
                });
            }

            const btnDel = card.querySelector('.btn-del-serial-sig');
            if (btnDel) {
                btnDel.addEventListener('click', () => {
                    field.signals.splice(sIdx, 1);
                    renderSerialFieldCards(field);
                    renderSerialBytesList();
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

        let nextStart = 0;
        let defaultCount = 8;
        if (field.signals.length > 0) {
            const lastSig = field.signals[field.signals.length - 1];
            const parsed = parseBitRangeHelper(lastSig);
            nextStart = parsed.startBit + parsed.bitCount;
            if (nextStart > 7) {
                nextStart = 0;
                defaultCount = 1;
            } else {
                defaultCount = Math.min(1, 8 - nextStart);
            }
        }
        const endB = nextStart + defaultCount - 1;
        const count = field.signals.length;

        const newSig = {
            key: `field_${count + 1}`,
            name: `字段_${count + 1}`,
            startBit: nextStart,
            bitCount: defaultCount,
            length: defaultCount,
            bitRange: `bit${nextStart}${defaultCount > 1 ? `-${endB}` : ''}`,
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
        showToast(`已添加新字段卡片 (自动计算起始位: bit${nextStart})！`, 'success');
    }

    function presetSerial8Bits() {
        const field = getCurrentSerialField();
        if (!field) {
            alert('请先在左侧列表中选中一个单字节！');
            return;
        }
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
        showToast('已为当前字节填充 8 个独立 Bit (bit0 ~ bit7) 状态开关卡片！', 'success');
    }

    // 单字节操作：顺排偏移、添加字节、克隆、删除、移动
    function autoAssignSerialOffsets() {
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields || pkt.fields.length === 0) return;
        pkt.fields.forEach((f, idx) => {
            f.byteOffset = idx;
            f.byteCount = 1;
        });
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        updateSerialToolbarProtocolInfo();
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
            updateSerialToolbarProtocolInfo();

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

        const cloned = JSON.parse(JSON.stringify(field));
        cloned.name = `${field.name || '字节'}_副本`;
        cloned.key = `byte_${Date.now().toString().slice(-4)}`;
        cloned.byteOffset = (Number(field.byteOffset) || 0) + 1;

        pkt.fields.splice(currentSerialFieldIndex + 1, 0, cloned);
        currentSerialFieldIndex = currentSerialFieldIndex + 1;

        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        updateSerialToolbarProtocolInfo();
        showToast(`已成功克隆字节「${cloned.name}」`, 'success');
    }

    function deleteSerialField(idx) {
        const targetIdx = (idx !== undefined && idx !== null) ? Number(idx) : currentSerialFieldIndex;
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields || pkt.fields.length === 0) return;

        const f = pkt.fields[targetIdx];
        if (!f) return;
        if (!confirm(`确定要删除字节「${f.name || `Byte ${f.byteOffset}`}」吗？`)) return;

        pkt.fields.splice(targetIdx, 1);
        if (currentSerialFieldIndex >= pkt.fields.length) {
            currentSerialFieldIndex = Math.max(0, pkt.fields.length - 1);
        }

        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        updateSerialToolbarProtocolInfo();
        showToast('字节已删除', 'info');
    }

    function moveSerialField(delta) {
        const pkt = getCurrentSerialPacket();
        if (!pkt || !pkt.fields) return;
        const newIdx = currentSerialFieldIndex + delta;
        if (newIdx < 0 || newIdx >= pkt.fields.length) return;

        const tmp = pkt.fields[currentSerialFieldIndex];
        pkt.fields[currentSerialFieldIndex] = pkt.fields[newIdx];
        pkt.fields[newIdx] = tmp;
        currentSerialFieldIndex = newIdx;

        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();

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

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        showToast(`已新建数据包「${newPkt.name}」`, 'success');
    }

    function duplicateCurrentSerialPacket() {
        if (!currentSerialProtocol || !currentSerialProtocol.packets || !currentSerialProtocol.packets[currentSerialPacketIndex]) return;

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

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        showToast(`已成功克隆数据包「${cloned.name}」`, 'success');
    }

    function deleteCurrentSerialPacket() {
        if (!currentSerialProtocol || !currentSerialProtocol.packets) return;
        if (currentSerialProtocol.packets.length <= 1) {
            alert('协议至少需要保留一个数据包！');
            return;
        }

        const pkt = currentSerialProtocol.packets[currentSerialPacketIndex];
        if (!confirm(`确定要删除当前数据包「${pkt.name || pkt.cmd}」吗？`)) return;

        currentSerialProtocol.packets.splice(currentSerialPacketIndex, 1);
        if (currentSerialPacketIndex >= currentSerialProtocol.packets.length) {
            currentSerialPacketIndex = currentSerialProtocol.packets.length - 1;
        }
        currentSerialFieldIndex = 0;

        updateSerialToolbarProtocolInfo();
        renderSerialByteTimeline();
        renderSerialBytesList();
        renderSelectedSerialFieldInspector();
        showToast('数据包已删除', 'info');
    }

    // 确保当前有串口协议处于载入状态
    async function ensureSerialProtocolLoaded() {
        initDOMElements();
        if (currentSerialProtocol && currentSerialProtocol.packets && currentSerialProtocol.packets.length > 0) {
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
            updateSerialToolbarProtocolInfo();
            renderSerialByteTimeline();
            renderSerialBytesList();
            renderSelectedSerialFieldInspector();
        }
    }

    // 保存当前串口协议
    async function saveCurrentSerialProtocol() {
        if (!currentSerialProtocol) return;

        currentSerialProtocol.updatedAt = new Date().toISOString();

        // 本地工作目录与云端同步处理
        let cloudRes = { ok: true };
        if (ProtoView.WorkspaceSync) {
            cloudRes = await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(currentSerialProtocol);
        }

        const id = await window.dbHelper.saveProtocol(currentSerialProtocol);
        currentSerialProtocol.id = id;

        if (btnSerialSave) {
            const origHTML = btnSerialSave.innerHTML;
            if (cloudRes.ok) {
                btnSerialSave.innerHTML = `<i class="fa-solid fa-check"></i> 云端已同步!`;
                btnSerialSave.style.backgroundColor = 'var(--success)';
            } else {
                btnSerialSave.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 仅本地保存`;
                btnSerialSave.style.backgroundColor = 'var(--warning)';
                showToast(`本地已保存，但云端同步失败: ${cloudRes.error}`, 'warning');
            }
            setTimeout(() => {
                btnSerialSave.innerHTML = origHTML;
                btnSerialSave.style.backgroundColor = '';
            }, 1800);
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

        if (serialPacketSelect) {
            serialPacketSelect.addEventListener('change', (e) => {
                currentSerialPacketIndex = parseInt(e.target.value, 10) || 0;
                currentSerialFieldIndex = 0;
                renderSerialByteTimeline();
                renderSerialBytesList();
                renderSelectedSerialFieldInspector();
                updateSerialToolbarProtocolInfo();
            });
        }

        if (btnAddSerialPacket) {
            btnAddSerialPacket.addEventListener('click', addSerialPacket);
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
                updateSerialToolbarProtocolInfo();
            });
        }

        if (serialPacketDirection) {
            serialPacketDirection.addEventListener('change', (e) => {
                const pkt = getCurrentSerialPacket();
                if (!pkt) return;
                const newDir = e.target.value === 'Rx' ? 'Rx' : 'Tx';
                pkt.direction = newDir;
                if (!serialPacketPeriodItem) serialPacketPeriodItem = document.getElementById('serial-packet-period-item');
                if (serialPacketPeriodItem) {
                    serialPacketPeriodItem.style.display = (newDir === 'Tx') ? 'flex' : 'none';
                }
                updateSerialToolbarProtocolInfo();
                renderSerialByteTimeline();
            });
        }

        if (serialPacketPeriod) {
            serialPacketPeriod.addEventListener('input', (e) => {
                const pkt = getCurrentSerialPacket();
                if (!pkt) return;
                pkt.period = Number(e.target.value) || 20;
                updateSerialToolbarProtocolInfo();
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
            });
        }

        if (serialFieldKey) {
            serialFieldKey.addEventListener('input', (e) => {
                const field = getCurrentSerialField();
                if (!field) return;
                field.key = e.target.value.trim();
                renderSerialBytesList();
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
            btnSerialExportJson.addEventListener('click', () => {
                if (!currentSerialProtocol) return;
                const safeName = (currentSerialProtocol.name || 'serial_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                const jsonStr = JSON.stringify(currentSerialProtocol, null, 2);
                downloadFile(jsonStr, `${safeName}.json`, 'application/json');
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
        ensureSerialProtocolLoaded,
        saveCurrentSerialProtocol,
        updateSerialToolbarProtocolInfo,
        setMobileSerialView,
        bindEvents: bindSerialEvents
    };

    ProtoView.Controllers.Serial = SerialController;
    global.ProtoView = ProtoView;

    // 向后兼容挂载到 window
    global.loadSerialProtocolIntoEditor = loadSerialProtocolIntoEditor;
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

