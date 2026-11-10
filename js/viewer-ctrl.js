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

    // DOM 元素引用
    let viewerSection;
    let btnViewerBack, viewerTitle, viewerProductBadge, viewerTypeBadge, btnViewerEditWorkbench;
    let viewerFieldSearch, btnClearViewerSearch, viewerMatchCount;
    let viewerPacketSelect, btnViewerLayoutSingle, btnViewerLayoutContinuous;
    let viewerWordsCatalog, viewerActiveWordHeader, viewerBitBarContainer;
    let viewerFieldsList, viewerSdiSsmCard, btnViewerExportMd, btnViewerPrint;

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
        viewerFieldsList = document.getElementById('viewer-fields-list');
        viewerSdiSsmCard = document.getElementById('viewer-sdi-ssm-card');

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

    // 载入协议进入只读查阅模式
    async function loadProtocolIntoViewer(id, targetWordIndex = 0, targetFieldIndex = null) {
        initDOMElements();
        const p = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!p) {
            showToast('未找到指定通信协议', 'warning');
            return;
        }

        currentProtocol = p;
        currentPacketIndex = 0;
        currentWordIndex = targetWordIndex || 0;
        searchQuery = '';
        if (viewerFieldSearch) viewerFieldSearch.value = '';
        if (btnClearViewerSearch) btnClearViewerSearch.style.display = 'none';
        if (viewerMatchCount) viewerMatchCount.style.display = 'none';

        renderHeaderMeta();
        renderPacketSelector();
        renderWordsCatalog();
        renderActiveWordView();

        if (targetFieldIndex !== null) {
            scrollToField(targetFieldIndex);
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
            const isSerial = p.type === 'Serial';
            const typeLabel = isArinc ? (p.subType || 'ARINC 429') : (isSerial ? (p.subType || 'Serial RS485') : (p.type || 'Bus'));
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
            opt.textContent = `[${isRx ? 'Rx' : 'Tx'} ${pkt.period || 20}ms] ${pkt.name || `数据包 ${idx + 1}`} (${count} ${countUnit})`;
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

                // 搜索命中匹配检测
                if (query) {
                    const matchLabel = octal.includes(query);
                    const matchName = (item.name || '').toLowerCase().includes(query);
                    if (matchLabel || matchName) matchedInThisWord++;

                    if (item.signals) {
                        item.signals.forEach(s => {
                            if (!s) return;
                            const mName = (s.name || '').toLowerCase().includes(query);
                            const mKey = (s.key || '').toLowerCase().includes(query);
                            const mUnit = (s.unit || '').toLowerCase().includes(query);
                            const mRemark = (s.remark || '').toLowerCase().includes(query);
                            const mBit = `b${s.startBit}`.includes(query) || `b${(s.startBit || 1) + (s.bitCount || 1) - 1}`.includes(query);
                            let mDict = false;
                            if (s.dict && typeof s.dict === 'object') {
                                mDict = Object.values(s.dict).some(v => String(v).toLowerCase().includes(query));
                            }
                            if (mName || mKey || mUnit || mRemark || mBit || mDict) {
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

            card.addEventListener('click', () => {
                currentWordIndex = idx;
                document.querySelectorAll('.viewer-catalog-item').forEach(el => el.classList.remove('active'));
                card.classList.add('active');
                renderActiveWordView();
            });

            viewerWordsCatalog.appendChild(card);
        });

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

        // 4. SDI / SSM 常驻速查参考卡片
        renderArincSdiSsmCard(word);
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
        const barWrap = document.createElement('div');
        barWrap.className = 'viewer-bit-bar-deck';

        const barHeader = document.createElement('div');
        barHeader.className = 'viewer-bit-bar-top-hint';
        barHeader.innerHTML = `
            <span><i class="fa-solid fa-ruler-horizontal"></i> <b>32-Bit 传输位域全景映射</b> (B32 奇校验 · B30~B31 SSM · B11~B29 数据有效载荷 · B9~B10 SDI · B1~B8 标号)</span>
            <span style="font-size:11px; color:var(--text-secondary);">鼠标悬浮或点击位段可快速穿梭至下方字段定义</span>
        `;
        barWrap.appendChild(barHeader);

        const barTrack = document.createElement('div');
        barTrack.className = 'viewer-bit-bar-track';

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
                    titleText = `Bit ${b} · 字段「${info.name}」\n占用跨度: B${info.startBit}~B${info.endBit} (${info.endBit - info.startBit + 1}位)\n类型: ${info.dataType} | 精度: ${info.scale} ${info.unit}`;
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

            barTrack.appendChild(cell);
        }

        barWrap.appendChild(barTrack);
        viewerBitBarContainer.appendChild(barWrap);
    }

    // 渲染 ARINC 429 字段工程规格明细表
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

        signals.forEach((sig, sIdx) => {
            const start = Number(sig.startBit || 1);
            const count = Number(sig.bitCount || sig.length || 1);
            const end = start + count - 1;
            const color = FIELD_PALETTES[sIdx % FIELD_PALETTES.length];

            // 搜索过滤与高亮判断
            let isMatched = false;
            if (query) {
                const mName = (sig.name || '').toLowerCase().includes(query);
                const mKey = (sig.key || '').toLowerCase().includes(query);
                const mUnit = (sig.unit || '').toLowerCase().includes(query);
                const mRemark = (sig.remark || '').toLowerCase().includes(query);
                const mBit = `b${start}`.includes(query) || `b${end}`.includes(query) || `${start}` === query || `${end}` === query;
                let mDict = false;
                if (sig.dict && typeof sig.dict === 'object') {
                    mDict = Object.values(sig.dict).some(v => String(v).toLowerCase().includes(query));
                }
                isMatched = mName || mKey || mUnit || mRemark || mBit || mDict;
            }

            const card = document.createElement('div');
            card.className = `viewer-field-card ${isMatched ? 'viewer-field-matched' : ''}`;
            card.id = `viewer-field-card-${sIdx}`;
            card.setAttribute('data-field-index', sIdx);

            // 字典状态枚举 Pill 生成
            let dictHtml = '';
            if (sig.dict && typeof sig.dict === 'object' && Object.keys(sig.dict).length > 0) {
                dictHtml = `<div class="vfc-dict-deck">`;
                dictHtml += `<span class="vfc-dict-label"><i class="fa-solid fa-book-bookmark"></i> 状态枚举字典:</span>`;
                Object.entries(sig.dict).forEach(([k, val]) => {
                    dictHtml += `<span class="vfc-dict-pill"><code>${escapeHTML(k)}</code>: ${escapeHTML(String(val))}</span>`;
                });
                dictHtml += `</div>`;
            }

            // 有效范围与默认值
            let rangeStr = '-';
            if (sig.min !== undefined && sig.min !== '' && sig.max !== undefined && sig.max !== '') {
                rangeStr = `${sig.min} ~ ${sig.max} ${sig.unit || ''}`;
            }

            card.innerHTML = `
                <div class="vfc-header">
                    <div class="vfc-title-group">
                        <span class="vfc-bit-badge" style="background:${color.bg}; border-color:${color.border}; color:${color.text};">
                            B${start} ~ B${end} <small>(${count} Bits)</small>
                        </span>
                        <h4 class="vfc-name">${highlightText(sig.name || '未命名信号', query)}</h4>
                        ${sig.key ? `<span class="vfc-key"><code>${escapeHTML(sig.key)}</code></span>` : ''}
                        <span class="vfc-datatype-pill">${escapeHTML(sig.dataType || 'BNR')}</span>
                        ${sig.unit ? `<span class="vfc-unit-pill">${escapeHTML(sig.unit)}</span>` : ''}
                    </div>
                    <div class="vfc-actions">
                        <button type="button" class="btn-vfc-copy" data-copy="${escapeHTML(sig.name || '')}" title="复制信号名称"><i class="fa-regular fa-copy"></i> 复制名</button>
                    </div>
                </div>

                <div class="vfc-body">
                    <div class="vfc-props-grid">
                        <div class="vfc-prop-item">
                            <span class="vfc-prop-k">分辨率 (LSB):</span>
                            <span class="vfc-prop-v">${sig.resolution !== undefined ? sig.resolution : 1.0}</span>
                        </div>
                        <div class="vfc-prop-item">
                            <span class="vfc-prop-k">零点偏移 (Offset):</span>
                            <span class="vfc-prop-v">${sig.offset !== undefined && sig.offset !== '' ? sig.offset : 0.0}</span>
                        </div>
                        <div class="vfc-prop-item">
                            <span class="vfc-prop-k">工程量程 (Min~Max):</span>
                            <span class="vfc-prop-v">${rangeStr}</span>
                        </div>
                        <div class="vfc-prop-item">
                            <span class="vfc-prop-k">默认值 (Default):</span>
                            <span class="vfc-prop-v">${sig.defaultValue !== undefined ? sig.defaultValue : (sig.defaultVal !== undefined ? sig.defaultVal : '-')}</span>
                        </div>
                    </div>

                    ${dictHtml}

                    ${sig.remark ? `
                        <div class="vfc-remark-box">
                            <i class="fa-solid fa-circle-info"></i> <b>工程说明:</b> ${highlightText(sig.remark, query)}
                        </div>
                    ` : ''}
                </div>
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

            viewerFieldsList.appendChild(card);
        });
    }

    // 渲染 ARINC 429 SDI / SSM 常驻速查参考卡片
    function renderArincSdiSsmCard(word) {
        if (!viewerSdiSsmCard) return;
        viewerSdiSsmCard.style.display = 'block';

        const sdiDict = word.sdiDict || { "0": "全部系统 (All)", "1": "系统 1 (左侧)", "2": "系统 2 (右侧)", "3": "系统 3 (备用)" };
        const ssmDict = word.ssmDict || (currentProtocol && currentProtocol.ssmDict) || { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };

        let sdiItemsHtml = '';
        Object.entries(sdiDict).forEach(([k, v]) => {
            sdiItemsHtml += `<div class="vref-row"><code>${k.padStart(2, '0')}b</code>: ${escapeHTML(String(v))}</div>`;
        });

        let ssmItemsHtml = '';
        Object.entries(ssmDict).forEach(([k, v]) => {
            ssmItemsHtml += `<div class="vref-row"><code>${k.padStart(2, '0')}b</code>: ${escapeHTML(String(v))}</div>`;
        });

        viewerSdiSsmCard.innerHTML = `
            <div class="vref-header">
                <i class="fa-solid fa-microchip" style="color:var(--accent-color);"></i>
                <span>航电标准控制域编码规范 (B9~B10 SDI · B30~B31 SSM)</span>
            </div>
            <div class="vref-body">
                <div class="vref-col">
                    <h5 class="vref-col-title"><i class="fa-solid fa-network-wired"></i> SDI 设备识别源 (B9~B10)</h5>
                    ${sdiItemsHtml}
                </div>
                <div class="vref-col">
                    <h5 class="vref-col-title"><i class="fa-solid fa-shield-halved"></i> SSM 状态符号矩阵 (B30~B31)</h5>
                    ${ssmItemsHtml}
                </div>
            </div>
        `;
    }

    // ----------------- 串口 (Serial) 专用规格书渲染 -----------------
    function renderSerialByteView(byteItem, pkt) {
        if (viewerBitBarContainer) viewerBitBarContainer.innerHTML = '';
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

        // 渲染串口字段或位域
        if (viewerFieldsList) {
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
                    <div class="vfc-body">
                        <div class="vfc-props-grid">
                            <div class="vfc-prop-item">
                                <span class="vfc-prop-k">比例系数:</span>
                                <span class="vfc-prop-v">${byteItem.scale || 1.0}</span>
                            </div>
                            <div class="vfc-prop-item">
                                <span class="vfc-prop-k">物理单位:</span>
                                <span class="vfc-prop-v">${byteItem.unit || '-'}</span>
                            </div>
                            <div class="vfc-prop-item">
                                <span class="vfc-prop-k">有效量程:</span>
                                <span class="vfc-prop-v">${(byteItem.min !== undefined && byteItem.max !== undefined) ? `${byteItem.min} ~ ${byteItem.max}` : '-'}</span>
                            </div>
                        </div>
                        ${byteItem.remark ? `<div class="vfc-remark-box"><i class="fa-solid fa-circle-info"></i> ${escapeHTML(byteItem.remark)}</div>` : ''}
                    </div>
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

    // 绑定事件
    function bindViewerEvents() {
        initDOMElements();

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

        // 导出规范 Markdown
        if (btnViewerExportMd) {
            btnViewerExportMd.addEventListener('click', () => {
                if (!currentProtocol) return;
                let mdText = '';
                if (currentProtocol.type === 'ARINC429' && typeof Arinc429Helper !== 'undefined') {
                    mdText = Arinc429Helper.generateMarkdownSpec(currentProtocol);
                } else if (currentProtocol.type === 'Serial' && typeof SerialHelper !== 'undefined') {
                    mdText = SerialHelper.generateMarkdownSpec(currentProtocol);
                } else {
                    mdText = `# ${currentProtocol.name}\n\n${currentProtocol.description || ''}`;
                }
                const safeName = (currentProtocol.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                downloadFile(mdText, `${safeName}_ICD规范说明书.md`, 'text/markdown;charset=utf-8');
                showToast('已导出 Markdown 规范说明书', 'success');
            });
        }

        // 打印 / 导出 PDF 接口卡片
        if (btnViewerPrint) {
            btnViewerPrint.addEventListener('click', () => {
                if (!currentProtocol) return;
                let fullHtml = '';
                if (currentProtocol.type === 'ARINC429' && typeof Arinc429Helper !== 'undefined') {
                    fullHtml = Arinc429Helper.generateHtmlSpec(currentProtocol);
                } else {
                    window.print();
                    return;
                }
                const printWin = window.open('', '_blank');
                if (printWin) {
                    printWin.document.open();
                    printWin.document.write(fullHtml);
                    printWin.document.close();
                    printWin.focus();
                    setTimeout(() => printWin.print(), 300);
                } else {
                    window.print();
                }
            });
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
