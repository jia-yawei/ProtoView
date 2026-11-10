/**
 * @file viewer-ctrl.js
 * @brief ProtoView 协议只读查阅与规范速查中心控制器 (Protocol Viewer & ICD Reader)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Controllers = ProtoView.Controllers || {};

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};
    const downloadFile = ProtoView.downloadFile || global.downloadFile || function(){};
    const copyTextToClipboard = ProtoView.copyTextToClipboard || global.copyTextToClipboard || function(){};

    // 颜色调色板 (用于为不同字段生成高辨识度且美观的色彩标识)
    const FIELD_PALETTES = [
        { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#2563eb' },
        { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#059669' },
        { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#d97706' },
        { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#7c3aed' },
        { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' },
        { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#0891b2' },
        { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#4f46e5' },
        { bg: 'rgba(20, 184, 166, 0.15)', border: '#14b8a6', text: '#0d9488' }
    ];

    // 内部状态
    let currentProtocol = null;
    let currentPacketIndex = 0;
    let currentWordIndex = 0;
    let searchQuery = '';
    let layoutMode = 'single'; // 'single' (单字专注查阅) 或 'continuous' (长卷全文视图)
    let isViewerLoading = false;
    let viewerEventsBound = false;

    // DOM 元素引用
    let viewerSection;
    let btnViewerBack, viewerTitle, viewerProductBadge, viewerTypeBadge, btnViewerEditWorkbench;
    let viewerFieldSearch, btnClearViewerSearch, viewerMatchCount;
    let viewerPacketSelect, btnViewerLayoutSingle, btnViewerLayoutContinuous;
    let viewerWordsCatalog, viewerActiveWordHeader, viewerBitBarContainer, viewerReaderDeck;
    let viewerFieldsList, viewerSdiSsmCard, btnViewerExport, btnViewerExportMd, btnViewerPrint;

    function initDOMElements() {
        viewerSection = document.getElementById('protocol-viewer-view');
        btnViewerBack = document.getElementById('btn-viewer-back');
        viewerTitle = document.getElementById('viewer-proto-title');
        viewerProductBadge = document.getElementById('viewer-product-badge');
        viewerTypeBadge = document.getElementById('viewer-type-badge');
        btnViewerEditWorkbench = document.getElementById('btn-viewer-edit-workbench');

        viewerFieldSearch = document.getElementById('viewer-field-search');
        btnClearViewerSearch = document.getElementById('btn-clear-viewer-search');
        viewerMatchCount = document.getElementById('viewer-match-count');

        viewerPacketSelect = document.getElementById('viewer-packet-select');
        btnViewerLayoutSingle = document.getElementById('btn-viewer-layout-single');
        btnViewerLayoutContinuous = document.getElementById('btn-viewer-layout-continuous');

        viewerWordsCatalog = document.getElementById('viewer-words-catalog');
        viewerActiveWordHeader = document.getElementById('viewer-active-word-header');
        viewerBitBarContainer = document.getElementById('viewer-bit-bar-container');
        viewerReaderDeck = document.querySelector('.viewer-reader-deck');
        viewerFieldsList = document.getElementById('viewer-fields-list');
        viewerSdiSsmCard = document.getElementById('viewer-sdi-ssm-card');

        btnViewerExport = document.getElementById('btn-viewer-export');
        btnViewerExportMd = document.getElementById('btn-viewer-export-md');
        btnViewerPrint = document.getElementById('btn-viewer-print');
    }

    // 获取当前数据包
    function getCurrentPacket() {
        if (!currentProtocol) return null;
        if (!currentProtocol.packets || currentProtocol.packets.length === 0) {
            return {
                name: '默认数据包',
                direction: currentProtocol.direction || 'Tx',
                period: currentProtocol.period || 20,
                words: currentProtocol.words || [],
                fields: currentProtocol.fields || []
            };
        }
        if (currentPacketIndex >= currentProtocol.packets.length) {
            currentPacketIndex = 0;
        }
        return currentProtocol.packets[currentPacketIndex];
    }

    // 载入协议进入只读查阅模式 (秒级极速渲染与防重入保障)
    async function loadProtocolIntoViewer(protoOrId, targetWordIndex = 0, targetFieldIndex = null) {
        if (isViewerLoading) return;
        isViewerLoading = true;

        try {
            initDOMElements();

            let p = null;
            if (protoOrId && typeof protoOrId === 'object' && protoOrId.name) {
                p = protoOrId;
            } else if (protoOrId !== undefined && protoOrId !== null && protoOrId !== '') {
                // 1. 优先从内存当前工作台极速检索，无需等待数据库异步轮询
                if (ProtoView.Controllers && ProtoView.Controllers.Arinc) {
                    const cur = ProtoView.Controllers.Arinc.getCurrentProtocol();
                    if (cur && (cur.id === protoOrId || String(cur.id) === String(protoOrId))) {
                        p = cur;
                    }
                }
                if (!p && ProtoView.Controllers && ProtoView.Controllers.Serial) {
                    const cur = ProtoView.Controllers.Serial.getCurrentProtocol();
                    if (cur && (cur.id === protoOrId || String(cur.id) === String(protoOrId))) {
                        p = cur;
                    }
                }
                if (!p && currentProtocol && (currentProtocol.id === protoOrId || String(currentProtocol.id) === String(protoOrId))) {
                    p = currentProtocol;
                }
                // 2. 本地数据库回退
                if (!p && window.dbHelper) {
                    p = await window.dbHelper.getProtocol(protoOrId);
                }
            }

            // 若未指定或未找到，自动回退到当前工作台中已载入的协议
            if (!p) {
                if (ProtoView.Controllers && ProtoView.Controllers.Arinc && ProtoView.Controllers.Arinc.getCurrentProtocol) {
                    p = ProtoView.Controllers.Arinc.getCurrentProtocol();
                }
                if (!p && ProtoView.Controllers && ProtoView.Controllers.Serial && ProtoView.Controllers.Serial.getCurrentProtocol) {
                    p = ProtoView.Controllers.Serial.getCurrentProtocol();
                }
                if (!p && currentProtocol) {
                    p = currentProtocol;
                }
            }

            if (!p) {
                showToast('请先选择或创建一个通信协议', 'warning');
                return;
            }

            currentProtocol = p;
            currentPacketIndex = 0;
            currentWordIndex = targetWordIndex || 0;
            searchQuery = '';
            if (viewerFieldSearch) viewerFieldSearch.value = '';
            if (btnClearViewerSearch) btnClearViewerSearch.style.display = 'none';
            if (viewerMatchCount) viewerMatchCount.style.display = 'none';

            // 核心：立即切换界面到查阅模式视图 (如果已处于该视图，switchToView 内部已防护不会重复触发)
            if (typeof window.switchToView === 'function') {
                window.switchToView('protocol-viewer-view');
            }

            renderHeaderMeta();
            renderPacketSelector();
            renderWordsCatalog();
            renderActiveWordView();

            if (targetFieldIndex !== null) {
                scrollToField(targetFieldIndex);
            }
        } finally {
            isViewerLoading = false;
        }
    }

    // 渲染顶部协议元数据
    function renderHeaderMeta() {
        if (!currentProtocol) return;
        const p = currentProtocol;

        if (viewerTitle) {
            viewerTitle.textContent = p.name || '未命名协议';
            viewerTitle.title = p.name || '';
        }

        if (viewerProductBadge) {
            if (p.product && p.product.trim()) {
                viewerProductBadge.style.display = 'inline-flex';
                viewerProductBadge.innerHTML = `<i class="fa-solid fa-cube"></i> ${escapeHTML(p.product)}`;
            } else {
                viewerProductBadge.style.display = 'none';
            }
        }

        if (viewerTypeBadge) {
            const isArinc = p.type === 'ARINC429';
            const isSerial = p.type === 'Serial' || ['RS422', 'RS485', 'RS232', 'UART'].includes(p.type);
            let typeLabel = 'ARINC429';
            if (isArinc) {
                typeLabel = 'ARINC429';
            } else if (isSerial) {
                typeLabel = p.subType || (['RS422', 'RS485', 'RS232', 'UART'].includes(p.type) ? p.type : 'RS485');
            } else if (p.type === 'CAN') {
                typeLabel = 'CAN';
            }
            viewerTypeBadge.textContent = typeLabel;
            viewerTypeBadge.className = `viewer-type-pill ${isArinc ? 'pill-arinc' : (isSerial ? 'pill-serial' : 'pill-can')}`;
        }
    }

    // 渲染数据包切换下拉框
    function renderPacketSelector() {
        if (!viewerPacketSelect || !currentProtocol) return;
        viewerPacketSelect.innerHTML = '';

        const packets = currentProtocol.packets && currentProtocol.packets.length > 0
            ? currentProtocol.packets
            : [{ name: '默认数据包', direction: currentProtocol.direction || 'Tx', period: currentProtocol.period || 20 }];

        packets.forEach((pkt, idx) => {
            const opt = document.createElement('option');
            opt.value = idx.toString();
            const isRx = pkt.direction === 'Rx';
            const count = (pkt.words ? pkt.words.length : (pkt.fields ? pkt.fields.length : 0));
            const countUnit = currentProtocol.type === 'Serial' ? '字节' : '标号字';
            opt.textContent = pkt.name || `数据包 ${idx + 1}`;
            opt.title = `[${isRx ? 'Rx (收)' : 'Tx (发)'} ${pkt.period || 20}ms] ${pkt.name || `数据包 ${idx + 1}`} (${count} ${countUnit})`;
            if (idx === currentPacketIndex) opt.selected = true;
            viewerPacketSelect.appendChild(opt);
        });

        viewerPacketSelect.style.display = packets.length > 1 ? 'inline-block' : 'none';
    }

    // 渲染左侧导航目录 (ARINC 标号字列表 / 串口字节序列表)
    function renderWordsCatalog() {
        if (!viewerWordsCatalog || !currentProtocol) return;
        const pkt = getCurrentPacket();
        if (!pkt) return;

        const isArinc = currentProtocol.type === 'ARINC429';
        const items = isArinc ? (pkt.words || []) : (pkt.fields || []);

        viewerWordsCatalog.innerHTML = '';
        if (items.length === 0) {
            viewerWordsCatalog.innerHTML = `<div class="viewer-catalog-empty">当前数据包暂无${isArinc ? '标号字' : '字节'}</div>`;
            return;
        }

        let totalMatchedFields = 0;
        const query = searchQuery.toLowerCase().trim();
        const frag = document.createDocumentFragment();

        items.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = `viewer-catalog-item ${idx === currentWordIndex ? 'active' : ''}`;
            card.setAttribute('data-word-index', idx);

            let labelStr = '';
            let titleStr = '';
            let subInfoStr = '';
            let matchedInThisWord = 0;

            if (isArinc) {
                const octal = (item.label || '000').toString().padStart(3, '0');
                labelStr = `${octal}₈`;
                titleStr = item.name || '未命名标号字';
                const sigCount = item.signals ? item.signals.length : 0;
                subInfoStr = `${item.direction || pkt.direction || 'Tx'} · ${sigCount} 字段 · ${item.period || pkt.period || 20}ms`;

                // 搜索命中匹配检测 (仅匹配用户定义的名字、单位、备注、位段与字典)
                if (query) {
                    const matchLabel = octal.includes(query);
                    const matchName = (item.name || '').toLowerCase().includes(query);
                    if (matchLabel || matchName) matchedInThisWord++;

                    if (item.signals) {
                        item.signals.forEach(s => {
                            if (!s) return;
                            const mName = (s.name || '').toLowerCase().includes(query);
                            const mUnit = (s.unit || '').toLowerCase().includes(query);
                            const mRemark = (s.remark || '').toLowerCase().includes(query);
                            const mBit = `b${s.startBit}`.includes(query) || `b${(s.startBit || 1) + (s.bitCount || 1) - 1}`.includes(query);
                            let mDict = false;
                            if (s.dict && typeof s.dict === 'object') {
                                mDict = Object.values(s.dict).some(v => String(v).toLowerCase().includes(query));
                            }
                            if (mName || mUnit || mRemark || mBit || mDict) {
                                matchedInThisWord++;
                            }
                        });
                    }
                }
            } else {
                // Serial
                const offset = item.offset !== undefined ? item.offset : idx;
                labelStr = `Byte ${offset}`;
                titleStr = item.name || `字节 ${offset}`;
                const subSignals = item.signals ? item.signals.length : 1;
                subInfoStr = `${item.dataType || 'u8'} · ${subSignals} 字段 · ${item.length || 1}B`;

                if (query) {
                    const matchOffset = `byte ${offset}`.includes(query) || `${offset}` === query;
                    const matchName = (item.name || '').toLowerCase().includes(query);
                    if (matchOffset || matchName) matchedInThisWord++;
                }
            }

            totalMatchedFields += matchedInThisWord;
            const hasMatch = query && matchedInThisWord > 0;
            if (hasMatch) {
                card.classList.add('has-search-match');
            }

            card.innerHTML = `
                <div class="vci-top">
                    <span class="vci-label-chip">${escapeHTML(labelStr)}</span>
                    <span class="vci-name" title="${escapeHTML(titleStr)}">${escapeHTML(titleStr)}</span>
                    ${hasMatch ? `<span class="vci-match-pill" title="在该字内匹配到 ${matchedInThisWord} 处">${matchedInThisWord} 匹配</span>` : ''}
                </div>
                <div class="vci-sub">${escapeHTML(subInfoStr)}</div>
            `;

            frag.appendChild(card);
        });

        viewerWordsCatalog.appendChild(frag);

        // 更新搜索统计徽章
        if (viewerMatchCount) {
            if (query) {
                viewerMatchCount.style.display = 'inline-flex';
                viewerMatchCount.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> 匹配 <b>${totalMatchedFields}</b> 处`;
            } else {
                viewerMatchCount.style.display = 'none';
            }
        }
    }

    // 渲染右侧主体视窗 (当前选中的标号字/字节规格书)
    function renderActiveWordView() {
        const pkt = getCurrentPacket();
        if (!pkt || !currentProtocol) return;

        if (viewerReaderDeck) {
            viewerReaderDeck.scrollTop = 0;
        }
        if (viewerBitBarContainer) {
            viewerBitBarContainer.classList.remove('is-stuck');
        }

        const isArinc = currentProtocol.type === 'ARINC429';
        const items = isArinc ? (pkt.words || []) : (pkt.fields || []);
        if (items.length === 0 || currentWordIndex >= items.length) {
            if (viewerActiveWordHeader) viewerActiveWordHeader.innerHTML = '<h3>暂无数据</h3>';
            if (viewerBitBarContainer) viewerBitBarContainer.innerHTML = '';
            if (viewerFieldsList) viewerFieldsList.innerHTML = '';
            if (viewerSdiSsmCard) viewerSdiSsmCard.style.display = 'none';
            return;
        }

        const activeItem = items[currentWordIndex];

        if (isArinc) {
            renderArincWordView(activeItem, pkt);
        } else {
            renderSerialByteView(activeItem, pkt);
        }
    }

    // ----------------- ARINC 429 专用规格书渲染 -----------------
    function renderArincWordView(word, pkt) {
        const octal = (word.label || '000').toString().padStart(3, '0');
        const hex = '0x' + (Arinc429Helper ? Arinc429Helper.octalToLabelByte(octal).toString(16).toUpperCase().padStart(2, '0') : '00');
        const signals = word.signals || [];
        const isTx = (word.direction || pkt.direction || 'Tx') === 'Tx';

        // 1. 顶部字摘要卡片
        if (viewerActiveWordHeader) {
            viewerActiveWordHeader.innerHTML = `
                <div class="vwh-title-row">
                    <div class="vwh-title-left">
                        <span class="vwh-octal-badge">${octal}₈</span>
                        <h2 class="vwh-title" title="${escapeHTML(word.name || '未命名标号字')}">${escapeHTML(word.name || '未命名标号字')}</h2>
                        <span class="vwh-dir-chip ${isTx ? 'chip-tx' : 'chip-rx'}">${isTx ? 'Tx (发送)' : 'Rx (接收)'}</span>
                    </div>
                    <div class="vwh-meta-chips">
                        <span class="vwh-chip" title="16进制编码"><i class="fa-solid fa-hashtag"></i> ${hex}</span>
                        <span class="vwh-chip" title="刷新周期"><i class="fa-regular fa-clock"></i> ${word.period || pkt.period || 20}ms</span>
                        <span class="vwh-chip" title="字段总数"><i class="fa-solid fa-list-check"></i> ${signals.length} 个定义字段</span>
                        <span class="vwh-chip" title="所属系统/信道"><i class="fa-solid fa-tower-broadcast"></i> ${escapeHTML(word.source || 'CH1')}</span>
                    </div>
                </div>
            `;
        }

        // 2. 32 位位域全景拓扑图 (Interactive 32-Bit Map)
        renderArinc32BitBar(word, signals);

        // 3. 字段工程规格明细表 (Publication-grade Field Definition Cards)
        renderArincFieldsTable(signals);

        // 4. 彻底隐藏/不渲染用户协议未定义的外部编码规范卡片
        if (viewerSdiSsmCard) {
            viewerSdiSsmCard.style.display = 'none';
            viewerSdiSsmCard.innerHTML = '';
        }
    }

    // 渲染 ARINC 429 交互式 32 位位域拓扑图
    function renderArinc32BitBar(word, signals) {
        if (!viewerBitBarContainer) return;
        viewerBitBarContainer.innerHTML = '';

        // 建立 32 位占用分布映射表 (Bit 1 ~ 32)
        const bitMap = new Array(33).fill(null);

        // 基础航电结构位
        // B1~B8: Label
        for (let b = 1; b <= 8; b++) {
            bitMap[b] = { type: 'label', name: `Label (${word.label || '000'}₈)`, startBit: 1, endBit: 8 };
        }
        // B9~B10: SDI
        bitMap[9] = bitMap[10] = { type: 'sdi', name: 'SDI 设备标识码', startBit: 9, endBit: 10 };
        // B30~B31: SSM
        bitMap[30] = bitMap[31] = { type: 'ssm', name: 'SSM 状态符号矩阵', startBit: 30, endBit: 31 };
        // B32: Parity
        bitMap[32] = { type: 'parity', name: 'P 奇偶校验位 (奇校验)', startBit: 32, endBit: 32 };

        // 信号载荷位 (B9~B29 或 B11~B29)
        signals.forEach((sig, sIdx) => {
            const start = Number(sig.startBit || 1);
            const count = Number(sig.bitCount || sig.length || 1);
            const end = start + count - 1;
            const color = FIELD_PALETTES[sIdx % FIELD_PALETTES.length];

            for (let b = start; b <= end && b <= 32; b++) {
                bitMap[b] = {
                    type: 'signal',
                    signalIndex: sIdx,
                    name: sig.name || '未命名信号',
                    startBit: start,
                    endBit: end,
                    unit: sig.unit || '',
                    scale: sig.resolution || 1.0,
                    dataType: sig.dataType || 'BNR',
                    color: color
                };
            }
        });

        // 渲染 32 位柱状图 (从高位 Bit 32 至低位 Bit 1 排列，符合航电工程阅读习惯)
        const octal = (word.label || '000').toString().padStart(3, '0');
        const wordName = word.name || '未命名标号字';
        const barWrap = document.createElement('div');
        barWrap.className = 'viewer-bit-bar-deck';

        const barHeader = document.createElement('div');
        barHeader.className = 'viewer-bit-bar-top-hint';
        barHeader.innerHTML = `
            <div class="vbb-hint-left">
                <span class="vbb-word-badge" title="八进制标号">${octal}₈</span>
                <strong class="vbb-word-name" title="${escapeHTML(wordName)}">${escapeHTML(wordName)}</strong>
                <span class="vbb-title-divider">|</span>
                <span class="vbb-title-text"><i class="fa-solid fa-ruler-horizontal"></i> <b>32-Bit 传输位域全景映射</b></span>
            </div>
            <div class="vbb-hint-right">
                <button type="button" class="btn-vbb-scroll-top" title="回到当前标号字顶部" style="display:none;"><i class="fa-solid fa-arrow-up"></i> 回顶</button>
            </div>
        `;
        barWrap.appendChild(barHeader);

        const btnScrollTop = barHeader.querySelector('.btn-vbb-scroll-top');
        if (btnScrollTop) {
            btnScrollTop.addEventListener('click', (e) => {
                e.stopPropagation();
                if (viewerReaderDeck) {
                    viewerReaderDeck.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        const barTrack = document.createElement('div');
        barTrack.className = 'viewer-bit-bar-track';
        const trackFrag = document.createDocumentFragment();

        for (let b = 32; b >= 1; b--) {
            const info = bitMap[b];
            const cell = document.createElement('div');
            cell.className = 'viewer-bit-cell';
            cell.setAttribute('data-bit', b);

            let typeClass = 'bit-empty';
            let cellColorStyle = '';
            let titleText = `Bit ${b}: 未分配载荷`;

            if (info) {
                if (info.type === 'signal') {
                    typeClass = 'bit-signal';
                    cellColorStyle = `background: ${info.color.bg}; border-color: ${info.color.border}; color: ${info.color.text};`;
                    titleText = `Bit ${b} · 字段「${info.name}」\n占用跨度: B${info.startBit}~B${info.endBit} (${info.endBit - info.startBit + 1}位)`;
                    cell.setAttribute('data-signal-index', info.signalIndex);
                } else if (info.type === 'label') {
                    typeClass = 'bit-label';
                    titleText = `Bit ${b} · ${info.name}`;
                } else if (info.type === 'sdi') {
                    typeClass = 'bit-sdi';
                    titleText = `Bit ${b} · ${info.name}`;
                } else if (info.type === 'ssm') {
                    typeClass = 'bit-ssm';
                    titleText = `Bit ${b} · ${info.name}`;
                } else if (info.type === 'parity') {
                    typeClass = 'bit-parity';
                    titleText = `Bit ${b} · ${info.name}`;
                }
            }

            cell.className += ` ${typeClass}`;
            if (cellColorStyle) cell.style.cssText = cellColorStyle;
            cell.title = titleText;
            cell.innerHTML = `<span class="vbc-num">${b}</span>`;

            // 联动高亮与滚动定位
            cell.addEventListener('mouseenter', () => {
                if (info && info.type === 'signal' && info.signalIndex !== undefined) {
                    highlightFieldCard(info.signalIndex, false);
                }
            });

            cell.addEventListener('mouseleave', () => {
                unhighlightAllFieldCards();
            });

            cell.addEventListener('click', () => {
                if (info && info.type === 'signal' && info.signalIndex !== undefined) {
                    scrollToField(info.signalIndex);
                }
            });

            trackFrag.appendChild(cell);
        }

        barTrack.appendChild(trackFrag);
        barWrap.appendChild(barTrack);
        viewerBitBarContainer.appendChild(barWrap);
    }

    // 渲染 ARINC 429 字段工程规格明细表 (仅重点显示有数据的属性，绝不显示空白占位或未定义的编码规范/内部字段key)
    function renderArincFieldsTable(signals) {
        if (!viewerFieldsList) return;
        viewerFieldsList.innerHTML = '';

        if (!signals || signals.length === 0) {
            viewerFieldsList.innerHTML = `
                <div class="viewer-fields-empty">
                    <i class="fa-solid fa-circle-info"></i> 当前标号字尚未划分具体信号字段。
                    <button type="button" class="btn btn-sm btn-secondary" onclick="window.ProtoView && window.ProtoView.Controllers && window.ProtoView.Controllers.Viewer && window.ProtoView.Controllers.Viewer.switchToEditWorkbench();" style="margin-left: 8px;">
                        <i class="fa-solid fa-pen-ruler"></i> 进入工作台划分
                    </button>
                </div>
            `;
            return;
        }

        const query = searchQuery.toLowerCase().trim();
        const frag = document.createDocumentFragment();

        signals.forEach((sig, sIdx) => {
            const start = Number(sig.startBit || 1);
            const count = Number(sig.bitCount || sig.length || 1);
            const end = start + count - 1;
            const color = FIELD_PALETTES[sIdx % FIELD_PALETTES.length];

            // 搜索过滤与高亮判断 (仅匹配用户定义的名字、单位、备注与字典，绝不搜索隐藏的系统key)
            let isMatched = false;
            if (query) {
                const mName = (sig.name || '').toLowerCase().includes(query);
                const mUnit = (sig.unit || '').toLowerCase().includes(query);
                const mRemark = (sig.remark || '').toLowerCase().includes(query);
                const mBit = `b${start}`.includes(query) || `b${end}`.includes(query) || `${start}` === query || `${end}` === query;
                let mDict = false;
                if (sig.dict && typeof sig.dict === 'object') {
                    mDict = Object.values(sig.dict).some(v => String(v).toLowerCase().includes(query));
                }
                isMatched = mName || mUnit || mRemark || mBit || mDict;
            }

            const card = document.createElement('div');
            card.className = `viewer-field-card ${isMatched ? 'viewer-field-matched' : ''}`;
            card.id = `viewer-field-card-${sIdx}`;
            card.setAttribute('data-field-index', sIdx);

            // 1. 严格只收集用户真正有定义、有数据的工程属性
            const propItems = [];

            // 分辨率 / 精度 (优先看 precision，其次 resolution)
            const precisionVal = (sig.precision !== undefined && sig.precision !== null && String(sig.precision).trim() !== '') ? String(sig.precision).trim() : '';
            const resolutionVal = (sig.resolution !== undefined && sig.resolution !== null && String(sig.resolution).trim() !== '') ? String(sig.resolution).trim() : '';
            if (precisionVal) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">精度:</span><span class="vfc-prop-v">${escapeHTML(precisionVal)}</span></div>`);
            } else if (resolutionVal) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">分辨率 (LSB):</span><span class="vfc-prop-v">${escapeHTML(resolutionVal)}</span></div>`);
            }

            // 有效工程量程 (Min ~ Max)
            const minVal = (sig.min !== undefined && sig.min !== null && String(sig.min).trim() !== '') ? String(sig.min).trim() : '';
            const maxVal = (sig.max !== undefined && sig.max !== null && String(sig.max).trim() !== '') ? String(sig.max).trim() : '';
            if (minVal !== '' || maxVal !== '') {
                const rangeDisplay = (minVal !== '' && maxVal !== '') 
                    ? `${minVal} ~ ${maxVal}${sig.unit ? ' ' + sig.unit : ''}` 
                    : (minVal !== '' ? `≥ ${minVal}` : `≤ ${maxVal}`);
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">有效量程:</span><span class="vfc-prop-v">${escapeHTML(rangeDisplay)}</span></div>`);
            }

            // 零点偏移 (Offset) - 仅在非 0 且有效时显示
            if (sig.offset !== undefined && sig.offset !== null && String(sig.offset).trim() !== '' && Number(sig.offset) !== 0) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">零点偏移:</span><span class="vfc-prop-v">${escapeHTML(String(sig.offset))}</span></div>`);
            }

            // 默认值 (Default) - 仅在用户显式指定了且非 '-' 时显示
            if (sig.defaultValue !== undefined && sig.defaultValue !== null && String(sig.defaultValue).trim() !== '' && String(sig.defaultValue).trim() !== '-' && sig.defaultValue !== 0) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">默认值:</span><span class="vfc-prop-v">${escapeHTML(String(sig.defaultValue))}</span></div>`);
            }

            const propsHtml = propItems.length > 0 ? `<div class="vfc-props-grid">${propItems.join('')}</div>` : '';

            // 2. 数据字典 / 状态枚举 (如果定义了字典，作为核心重点高亮呈现)
            let dictHtml = '';
            if (sig.dict && typeof sig.dict === 'object' && Object.keys(sig.dict).length > 0) {
                dictHtml = `<div class="vfc-dict-deck">`;
                dictHtml += `<span class="vfc-dict-label"><i class="fa-solid fa-book-bookmark" style="color:var(--accent-color);"></i> 状态字典 / 枚举映射:</span>`;
                Object.entries(sig.dict).forEach(([k, val]) => {
                    dictHtml += `<span class="vfc-dict-pill"><code>${escapeHTML(k)}</code>: ${escapeHTML(String(val))}</span>`;
                });
                dictHtml += `</div>`;
            }

            // 3. 备注说明 / 工程说明 (如果存在，作为重点清晰展示)
            const remarkHtml = (sig.remark && String(sig.remark).trim()) ? `
                <div class="vfc-remark-box">
                    <i class="fa-solid fa-circle-info" style="color:var(--accent-color);"></i> <b>工程说明:</b> ${highlightText(sig.remark.trim(), query)}
                </div>
            ` : '';

            // 组装卡片：绝不显示 main_value 等技术内部 key，且无数据的内容绝不占用空间
            card.innerHTML = `
                <div class="vfc-header">
                    <div class="vfc-title-group">
                        <span class="vfc-bit-badge" style="background:${color.bg}; border-color:${color.border}; color:${color.text};">
                            B${start} ~ B${end} <small>(${count} Bits)</small>
                        </span>
                        <h4 class="vfc-name">${highlightText(sig.name || '未命名信号', query)}</h4>
                        <span class="vfc-datatype-pill">${escapeHTML(sig.dataType || 'BNR')}</span>
                        ${(sig.unit && String(sig.unit).trim()) ? `<span class="vfc-unit-pill">${escapeHTML(sig.unit.trim())}</span>` : ''}
                    </div>
                    <div class="vfc-actions">
                        <button type="button" class="btn-vfc-copy" data-copy="${escapeHTML(sig.name || '')}" title="复制信号名称"><i class="fa-regular fa-copy"></i> 复制名</button>
                    </div>
                </div>
                ${(propsHtml || dictHtml || remarkHtml) ? `
                    <div class="vfc-body">
                        ${propsHtml}
                        ${dictHtml}
                        ${remarkHtml}
                    </div>
                ` : ''}
            `;

            // 复制按钮事件
            const btnCopy = card.querySelector('.btn-vfc-copy');
            if (btnCopy) {
                btnCopy.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const text = btnCopy.getAttribute('data-copy');
                    copyTextToClipboard(text, () => {
                        showToast(`已复制字段名「${text}」`, 'success');
                    });
                });
            }

            // 鼠标悬停高亮顶部位图
            card.addEventListener('mouseenter', () => {
                highlightBitBarSegments(sIdx);
            });

            card.addEventListener('mouseleave', () => {
                unhighlightBitBarSegments();
            });

            frag.appendChild(card);
        });

        viewerFieldsList.appendChild(frag);
    }

    // 渲染串口整包字节流全景映射条
    function renderSerialBytePanoramaBar(pkt, activeIndex) {
        if (!viewerBitBarContainer || !pkt || !pkt.fields || pkt.fields.length === 0) {
            if (viewerBitBarContainer) viewerBitBarContainer.innerHTML = '';
            return;
        }
        viewerBitBarContainer.innerHTML = '';

        const barWrap = document.createElement('div');
        barWrap.className = 'viewer-bit-bar-deck';

        const barHeader = document.createElement('div');
        barHeader.className = 'viewer-bit-bar-top-hint';
        barHeader.innerHTML = `
            <div class="vbb-hint-left">
                <span class="vbb-word-badge" style="background:#f59e0b;"><i class="fa-solid fa-bolt"></i> ${escapeHTML(pkt.name || '数据包')}</span>
                <strong class="vbb-word-name">串行时序字节流全景映射</strong>
                <span class="vbb-title-divider">|</span>
                <span class="vbb-title-text"><i class="fa-solid fa-layer-group"></i> 共 ${pkt.fields.length} 个字段定义</span>
            </div>
            <div class="vbb-hint-right">
                <span class="vbb-bits-legend">点击字节块可快速切换查看各字节规格</span>
                <button type="button" class="btn-vbb-scroll-top" title="回到顶部" style="display:none;"><i class="fa-solid fa-arrow-up"></i> 回顶</button>
            </div>
        `;
        barWrap.appendChild(barHeader);

        const btnScrollTop = barHeader.querySelector('.btn-vbb-scroll-top');
        if (btnScrollTop) {
            btnScrollTop.addEventListener('click', (e) => {
                e.stopPropagation();
                if (viewerReaderDeck) {
                    viewerReaderDeck.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        const barTrack = document.createElement('div');
        barTrack.className = 'viewer-serial-timeline-track';
        barTrack.style.cssText = 'display: flex; gap: 4px; overflow-x: auto; padding: 4px 2px;';

        pkt.fields.forEach((f, idx) => {
            const off = f.byteOffset !== undefined ? f.byteOffset : idx;
            const cnt = f.byteCount || f.length || 1;
            const spanText = (typeof SerialHelper !== 'undefined') ? SerialHelper.formatByteSpanText(off, cnt) : `B${off}`;
            const isActive = idx === activeIndex;

            const cell = document.createElement('div');
            cell.className = `viewer-byte-cell ${isActive ? 'active' : ''}`;
            cell.style.cssText = `
                flex-shrink: 0; min-width: 64px; padding: 4px 8px; border-radius: 4px;
                border: 1.5px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'};
                background: ${isActive ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)'};
                cursor: pointer; text-align: center; transition: all 0.15s ease;
            `;
            cell.title = `点击切换至: ${spanText} [${f.name || '未命名'}]`;
            cell.innerHTML = `
                <div style="font-family:var(--font-mono, monospace); font-size:11px; font-weight:700; color:${isActive ? 'var(--accent-color)' : 'var(--text-primary)'};">${escapeHTML(spanText)}</div>
                <div style="font-size:10px; color:var(--text-secondary); max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(f.name || `字节 ${off}`)}</div>
            `;
            cell.addEventListener('click', () => {
                currentWordIndex = idx;
                document.querySelectorAll('.viewer-catalog-item').forEach(el => el.classList.remove('active'));
                const catItem = document.querySelector(`.viewer-catalog-item[data-word-index="${idx}"]`);
                if (catItem) catItem.classList.add('active');
                renderActiveWordView();
            });
            barTrack.appendChild(cell);
        });

        barWrap.appendChild(barTrack);
        viewerBitBarContainer.appendChild(barWrap);
    }

    // ----------------- 串口 (Serial) 专用规格书渲染 -----------------
    function renderSerialByteView(byteItem, pkt) {
        renderSerialBytePanoramaBar(pkt, currentWordIndex);
        if (viewerSdiSsmCard) viewerSdiSsmCard.style.display = 'none';

        const offset = byteItem.offset !== undefined ? byteItem.offset : currentWordIndex;
        if (viewerActiveWordHeader) {
            viewerActiveWordHeader.innerHTML = `
                <div class="vwh-title-row">
                    <div class="vwh-title-left">
                        <span class="vwh-octal-badge">Byte ${offset}</span>
                        <h2 class="vwh-title">${escapeHTML(byteItem.name || `字节 ${offset}`)}</h2>
                        <span class="vwh-dir-chip chip-tx">${pkt.direction || 'Tx'}</span>
                    </div>
                    <div class="vwh-meta-chips">
                        <span class="vwh-chip"><i class="fa-solid fa-arrows-left-right-to-line"></i> 偏移量: ${offset}</span>
                        <span class="vwh-chip"><i class="fa-solid fa-shapes"></i> 数据类型: ${escapeHTML(byteItem.dataType || 'u8')}</span>
                        <span class="vwh-chip"><i class="fa-solid fa-ruler"></i> 字节长度: ${byteItem.length || 1} Byte</span>
                    </div>
                </div>
            `;
        }

        // 渲染串口字段或位域 (仅展示有有效数据的字段属性)
        if (viewerFieldsList) {
            const propItems = [];
            if (byteItem.scale && byteItem.scale !== 1.0) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">比例系数:</span><span class="vfc-prop-v">${byteItem.scale}</span></div>`);
            }
            if (byteItem.min !== undefined && byteItem.max !== undefined && String(byteItem.min).trim() !== '' && String(byteItem.max).trim() !== '') {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">有效量程:</span><span class="vfc-prop-v">${byteItem.min} ~ ${byteItem.max}${byteItem.unit ? ' ' + byteItem.unit : ''}</span></div>`);
            }
            const propsHtml = propItems.length > 0 ? `<div class="vfc-props-grid">${propItems.join('')}</div>` : '';
            const remarkHtml = (byteItem.remark && String(byteItem.remark).trim()) ? `<div class="vfc-remark-box"><i class="fa-solid fa-circle-info" style="color:var(--accent-color);"></i> <b>工程说明:</b> ${escapeHTML(byteItem.remark.trim())}</div>` : '';

            viewerFieldsList.innerHTML = `
                <div class="viewer-field-card">
                    <div class="vfc-header">
                        <div class="vfc-title-group">
                            <span class="vfc-bit-badge">Offset: ${offset}</span>
                            <h4 class="vfc-name">${escapeHTML(byteItem.name || '未命名字节')}</h4>
                            <span class="vfc-datatype-pill">${escapeHTML(byteItem.dataType || 'u8')}</span>
                            ${byteItem.unit ? `<span class="vfc-unit-pill">${escapeHTML(byteItem.unit)}</span>` : ''}
                        </div>
                    </div>
                    ${(propsHtml || remarkHtml) ? `
                        <div class="vfc-body">
                            ${propsHtml}
                            ${remarkHtml}
                        </div>
                    ` : ''}
                </div>
            `;
        }
    }

    // ----------------- 交互与秒级查找定位辅助函数 -----------------

    // 平滑滚动并伴随荧光呼吸闪烁定位特定字段
    function scrollToField(fieldIndex) {
        setTimeout(() => {
            const card = document.getElementById(`viewer-field-card-${fieldIndex}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.remove('viewer-field-flash');
                void card.offsetWidth; // 触发 reflow
                card.classList.add('viewer-field-flash');
                setTimeout(() => {
                    card.classList.remove('viewer-field-flash');
                }, 1800);
            }
        }, 60);
    }

    // 高亮指定字段卡片 (悬浮位段条时)
    function highlightFieldCard(fieldIndex, doScroll = false) {
        unhighlightAllFieldCards();
        const card = document.getElementById(`viewer-field-card-${fieldIndex}`);
        if (card) {
            card.classList.add('viewer-field-hover-active');
            if (doScroll) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    function unhighlightAllFieldCards() {
        document.querySelectorAll('.viewer-field-card').forEach(el => {
            el.classList.remove('viewer-field-hover-active');
        });
    }

    // 高亮位图中的对应位段
    function highlightBitBarSegments(fieldIndex) {
        unhighlightBitBarSegments();
        document.querySelectorAll(`.viewer-bit-cell[data-signal-index="${fieldIndex}"]`).forEach(el => {
            el.classList.add('viewer-bit-highlight');
        });
    }

    function unhighlightBitBarSegments() {
        document.querySelectorAll('.viewer-bit-cell').forEach(el => {
            el.classList.remove('viewer-bit-highlight');
        });
    }

    // 文本关键字高亮
    function highlightText(text, q) {
        if (!q || !text) return escapeHTML(text || '');
        const escaped = escapeHTML(text);
        const qEscaped = escapeHTML(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${qEscaped})`, 'gi');
        return escaped.replace(regex, '<mark class="viewer-search-mark">$1</mark>');
    }

    // 一键切换至工作台编辑模式
    function switchToEditWorkbench() {
        if (!currentProtocol) return;
        if (typeof window.openProtocolWorkbench === 'function') {
            window.openProtocolWorkbench(currentProtocol.id);
        }
    }

    // 绑定事件 (仅初始化单次绑定，杜绝重复监听器导致的内存泄漏与滚动卡顿)
    function bindViewerEvents() {
        if (viewerEventsBound) return;
        initDOMElements();
        viewerEventsBound = true;

        // 返回协议列表
        if (btnViewerBack) {
            btnViewerBack.addEventListener('click', () => {
                if (typeof window.switchToView === 'function') {
                    window.switchToView('protocol-view');
                }
            });
        }

        // 一键进入编辑工作台
        if (btnViewerEditWorkbench) {
            btnViewerEditWorkbench.addEventListener('click', switchToEditWorkbench);
        }

        // 左侧标号字目录单次事件委托监听 (高速即时响应)
        if (viewerWordsCatalog) {
            viewerWordsCatalog.addEventListener('click', (e) => {
                const card = e.target.closest('.viewer-catalog-item');
                if (!card) return;
                const idx = parseInt(card.getAttribute('data-word-index'), 10);
                if (isNaN(idx)) return;
                currentWordIndex = idx;
                document.querySelectorAll('.viewer-catalog-item').forEach(el => el.classList.remove('active'));
                card.classList.add('active');
                renderActiveWordView();
            });
        }

        // 顶部全局即时搜索
        if (viewerFieldSearch) {
            viewerFieldSearch.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                if (btnClearViewerSearch) {
                    btnClearViewerSearch.style.display = searchQuery ? 'inline-flex' : 'none';
                }
                renderWordsCatalog();
                renderActiveWordView();

                // 若有搜索关键词且当前字无匹配项，自动跳转定位到第一个有匹配的字
                if (searchQuery) {
                    const firstMatchItem = document.querySelector('.viewer-catalog-item.has-search-match');
                    if (firstMatchItem) {
                        const idx = parseInt(firstMatchItem.getAttribute('data-word-index'), 10);
                        if (!isNaN(idx) && idx !== currentWordIndex) {
                            currentWordIndex = idx;
                            document.querySelectorAll('.viewer-catalog-item').forEach(el => el.classList.remove('active'));
                            firstMatchItem.classList.add('active');
                            renderActiveWordView();
                        }
                    }
                    // 自动聚焦定位第一个匹配字段
                    setTimeout(() => {
                        const firstMatchedCard = document.querySelector('.viewer-field-matched');
                        if (firstMatchedCard) {
                            firstMatchedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            firstMatchedCard.classList.add('viewer-field-flash');
                            setTimeout(() => firstMatchedCard.classList.remove('viewer-field-flash'), 1800);
                        }
                    }, 80);
                }
            });
        }

        if (btnClearViewerSearch) {
            btnClearViewerSearch.addEventListener('click', () => {
                if (viewerFieldSearch) viewerFieldSearch.value = '';
                searchQuery = '';
                btnClearViewerSearch.style.display = 'none';
                if (viewerMatchCount) viewerMatchCount.style.display = 'none';
                renderWordsCatalog();
                renderActiveWordView();
            });
        }

        // 数据包切换
        if (viewerPacketSelect) {
            viewerPacketSelect.addEventListener('change', (e) => {
                currentPacketIndex = parseInt(e.target.value, 10) || 0;
                currentWordIndex = 0;
                renderWordsCatalog();
                renderActiveWordView();
            });
        }

        // 统一协议导出 (呼出全局统一导出中心，支持 JSON、PDF、Markdown、HTML)
        if (btnViewerExport) {
            btnViewerExport.addEventListener('click', () => {
                if (typeof window.openProtocolExportModal === 'function') {
                    window.openProtocolExportModal(currentProtocol);
                }
            });
        }

        // 兼容旧按钮触发
        if (btnViewerExportMd) {
            btnViewerExportMd.addEventListener('click', () => {
                if (typeof window.openProtocolExportModal === 'function') {
                    window.openProtocolExportModal(currentProtocol);
                }
            });
        }

        if (btnViewerPrint) {
            btnViewerPrint.addEventListener('click', () => {
                if (typeof window.openProtocolExportModal === 'function') {
                    window.openProtocolExportModal(currentProtocol);
                }
            });
        }

        // 监听右侧主阅读视窗滚动，联动 32-Bit 位域全景映射浮动投影与快捷回顶按钮
        if (viewerReaderDeck) {
            viewerReaderDeck.addEventListener('scroll', () => {
                const isStuck = viewerReaderDeck.scrollTop > 40;
                if (viewerBitBarContainer) {
                    viewerBitBarContainer.classList.toggle('is-stuck', isStuck);
                    const btnTop = viewerBitBarContainer.querySelector('.btn-vbb-scroll-top');
                    if (btnTop) {
                        btnTop.style.display = isStuck ? 'inline-flex' : 'none';
                    }
                }
            }, { passive: true });
        }
    }

    // 控制器接口暴露
    const ViewerController = {
        loadProtocolIntoViewer,
        getCurrentProtocol: () => currentProtocol,
        switchToEditWorkbench,
        scrollToField,
        bindEvents: bindViewerEvents
    };

    ProtoView.Controllers.Viewer = ViewerController;
    global.ProtoView = ProtoView;
    global.openProtocolViewer = loadProtocolIntoViewer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindViewerEvents);
    } else {
        bindViewerEvents();
    }

})(typeof window !== 'undefined' ? window : this);
