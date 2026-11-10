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
        const isTx = (word.direction || pkt.direction || (currentProtocol && currentProtocol.direction) || 'Tx') === 'Tx';

        // 协议级与字级控制域参数 (奇偶校验、SDI、SSM 为协议与标号字层级，非具体字段属性)
        const protoMode = (currentProtocol && currentProtocol.mode) || word.editMode || 'classic';
        const isBitstream = protoMode === 'bitstream';
        const parityMode = word.parity || (currentProtocol && currentProtocol.parity) || 'odd';
        const parityLabel = parityMode === 'odd' ? '奇校验 (Odd)' : (parityMode === 'even' ? '偶校验 (Even)' : '无校验 (None)');

        // SDI (仅经典航电模式下分配 B9~B10)
        const hasSdi = !isBitstream;
        const sdiVal = word.sdi !== undefined ? String(word.sdi) : '0';
        const sdiDict = word.sdiDict || (currentProtocol && currentProtocol.sdiDict) || { "0": "全部系统 (All)", "1": "系统 1 (左侧)", "2": "系统 2 (右侧)", "3": "系统 3 (备用)" };
        const bitMapStr = { '0': '00', '1': '01', '2': '10', '3': '11' };
        const sdiCode = bitMapStr[sdiVal] || '00';
        const sdiDesc = sdiDict[sdiVal] || `模式 ${sdiVal}`;

        // SSM (状态符号矩阵 B30~B31)
        const ssmVal = word.ssm !== undefined ? String(word.ssm) : '0';
        const ssmDict = (currentProtocol && currentProtocol.ssmDict) || word.ssmDict || { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };
        const ssmCode = bitMapStr[ssmVal] || '00';
        const ssmDesc = ssmDict[ssmVal] || `状态 ${ssmVal}`;

        // 1. 顶部字摘要卡片 + 协议传输控制域规范
        if (viewerActiveWordHeader) {
            viewerActiveWordHeader.innerHTML = `
                <div class="vwh-title-row">
                    <div class="vwh-title-left">
                        <span class="vwh-octal-badge" title="ARINC 429 八进制标号 (B1~B8)">${octal}₈</span>
                        <h2 class="vwh-title" title="${escapeHTML(word.name || '未命名标号字')}">${escapeHTML(word.name || '未命名标号字')}</h2>
                        <span class="vwh-dir-chip ${isTx ? 'chip-tx' : 'chip-rx'}">${isTx ? 'Tx (发送)' : 'Rx (接收)'}</span>
                        <span class="vwh-mode-chip" title="协议模式">${isBitstream ? '自由 Bit 模式' : '经典航电模式'}</span>
                    </div>
                    <div class="vwh-meta-chips">
                        <span class="vwh-chip" title="16进制标号编码"><i class="fa-solid fa-hashtag"></i> Hex: ${hex}</span>
                        <span class="vwh-chip" title="刷新周期"><i class="fa-regular fa-clock"></i> ${word.period || pkt.period || 20}ms</span>
                        <span class="vwh-chip" title="当前字定义的载荷字段数"><i class="fa-solid fa-list-check"></i> ${signals.length} 个字段</span>
                        <span class="vwh-chip" title="所属系统/信道"><i class="fa-solid fa-tower-broadcast"></i> ${escapeHTML(word.source || 'CH1')}</span>
                    </div>
                </div>

                <!-- 航电协议控制域传输规范 (属于协议整体与字级的规范，非个别字段属性) -->
                <div class="vwh-protocol-strip">
                    <div class="vwh-proto-strip-head">
                        <i class="fa-solid fa-satellite-dish" style="color:var(--accent-color);"></i>
                        <span class="vwh-proto-strip-title">429 协议传输控制域规范</span>
                    </div>
                    <div class="vwh-proto-items">
                        <!-- 1. 奇偶校验 -->
                        <div class="vwh-proto-card proto-card-parity" title="奇偶校验位 (Bit 32)">
                            <span class="vpc-tag"><i class="fa-solid fa-shield-halved"></i> 校验 (Bit 32):</span>
                            <strong class="vpc-val">${parityLabel}</strong>
                        </div>

                        <!-- 2. SDI (源/目标识别) -->
                        ${hasSdi ? `
                        <div class="vwh-proto-card proto-card-sdi" title="SDI 系统设备识别 (Bits 9~10)">
                            <span class="vpc-tag"><i class="fa-solid fa-diagram-project"></i> SDI (Bits 9~10):</span>
                            <strong class="vpc-val"><code>${sdiCode}b</code> ${escapeHTML(sdiDesc)}</strong>
                        </div>
                        ` : `
                        <div class="vwh-proto-card proto-card-sdi" title="自由 Bit 流模式不启用独立 SDI">
                            <span class="vpc-tag"><i class="fa-solid fa-diagram-project"></i> SDI:</span>
                            <span class="vpc-val" style="color:var(--text-secondary);">自由Bit流模式 (无独立SDI)</span>
                        </div>
                        `}

                        <!-- 3. SSM (状态符号矩阵) -->
                        <div class="vwh-proto-card proto-card-ssm" title="SSM 状态符号矩阵 (Bits 30~31)">
                            <div class="vpc-row-top">
                                <span class="vpc-tag"><i class="fa-solid fa-heart-pulse"></i> SSM (Bits 30~31):</span>
                                <strong class="vpc-val"><code>${ssmCode}b</code> ${escapeHTML(ssmDesc)}</strong>
                            </div>
                            <div class="vpc-ssm-dict" title="协议全局 SSM 状态符号矩阵定义">
                                ${Object.entries(ssmDict).map(([k, v]) => `
                                    <span class="vpc-ssm-pill ${k === ssmVal ? 'active-ssm' : ''}">
                                        <code>${bitMapStr[k] || k}b</code>: ${escapeHTML(v)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 2. 32 位位域全景拓扑图 (Interactive 32-Bit Map)
        renderArinc32BitBar(word, signals);

        // 3. 字段工程规格明细表 (双列网格排布，两个字段占一行，仅展示配置过的属性)
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

        const protoMode = (currentProtocol && currentProtocol.mode) || word.editMode || 'classic';
        const isBitstream = protoMode === 'bitstream';
        const parityMode = word.parity || (currentProtocol && currentProtocol.parity) || 'odd';
        const parityLabel = parityMode === 'odd' ? '奇校验' : (parityMode === 'even' ? '偶校验' : '无校验');

        // B9~B10: SDI (仅经典航电模式存在)
        if (!isBitstream) {
            const sdiVal = word.sdi !== undefined ? String(word.sdi) : '0';
            const sdiDict = word.sdiDict || (currentProtocol && currentProtocol.sdiDict) || { "0": "全部系统 (All)", "1": "系统 1 (左侧)", "2": "系统 2 (右侧)", "3": "系统 3 (备用)" };
            const bitMapStr = { '0': '00', '1': '01', '2': '10', '3': '11' };
            const sdiDesc = sdiDict[sdiVal] || `模式 ${sdiVal}`;
            bitMap[9] = bitMap[10] = { type: 'sdi', name: `SDI: ${bitMapStr[sdiVal] || '00'}b (${sdiDesc})`, startBit: 9, endBit: 10 };
        }

        // B30~B31: SSM
        const ssmVal = word.ssm !== undefined ? String(word.ssm) : '0';
        const ssmDict = (currentProtocol && currentProtocol.ssmDict) || word.ssmDict || { "0": "正常运算 (Normal)", "1": "无计算数据 (NCD)", "2": "功能测试 (FT)", "3": "故障告警 (Fail)" };
        const bitMapStr = { '0': '00', '1': '01', '2': '10', '3': '11' };
        const ssmDesc = ssmDict[ssmVal] || `状态 ${ssmVal}`;
        bitMap[30] = bitMap[31] = { type: 'ssm', name: `SSM: ${bitMapStr[ssmVal] || '00'}b (${ssmDesc})`, startBit: 30, endBit: 31 };

        // B32: Parity
        bitMap[32] = { type: 'parity', name: `P 校验位: Bit 32 (${parityLabel})`, startBit: 32, endBit: 32 };

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

    // 渲染 ARINC 429 字段工程规格明细表 (双列网格排布：两个字段占一行，仅重点显示有数据的属性，绝不显示空白占位或未定义的编码规范/内部字段key)
    function renderArincFieldsTable(signals) {
        if (!viewerFieldsList) return;
        viewerFieldsList.innerHTML = '';

        if (!signals || signals.length === 0) {
            viewerFieldsList.innerHTML = `
                <div class="viewer-fields-empty" style="grid-column: 1 / -1;">
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

            // 严格只收集编辑界面中真正有配置、有值的属性，未配置或没有值的绝不显示
            const propItems = [];

            // 1. 分辨率
            const resVal = (sig.resolution !== undefined && sig.resolution !== null && String(sig.resolution).trim() !== '') ? String(sig.resolution).trim() : '';
            if (resVal) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">分辨率:</span><span class="vfc-prop-v">${escapeHTML(resVal)}</span></div>`);
            }

            // 2. 精度
            const precVal = (sig.precision !== undefined && sig.precision !== null && String(sig.precision).trim() !== '') ? String(sig.precision).trim() : '';
            if (precVal) {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">精度:</span><span class="vfc-prop-v">${escapeHTML(precVal)}</span></div>`);
            }

            // 3. 有效量程 (Min ~ Max)
            const minVal = (sig.min !== undefined && sig.min !== null && String(sig.min).trim() !== '') ? String(sig.min).trim() : '';
            const maxVal = (sig.max !== undefined && sig.max !== null && String(sig.max).trim() !== '') ? String(sig.max).trim() : '';
            if (minVal !== '' && maxVal !== '') {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">${escapeHTML(minVal)} ~ ${escapeHTML(maxVal)}${sig.unit ? ' ' + escapeHTML(sig.unit.trim()) : ''}</span></div>`);
            } else if (minVal !== '') {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">≥ ${escapeHTML(minVal)}${sig.unit ? ' ' + escapeHTML(sig.unit.trim()) : ''}</span></div>`);
            } else if (maxVal !== '') {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">≤ ${escapeHTML(maxVal)}${sig.unit ? ' ' + escapeHTML(sig.unit.trim()) : ''}</span></div>`);
            }

            // 4. 字节序 (仅在 u16 且有具体配置时显示)
            if (sig.dataType === 'u16' && sig.endianness && sig.endianness !== 'none') {
                propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">字节序:</span><span class="vfc-prop-v">${sig.endianness === 'little' ? '小端 (LSB)' : '大端 (MSB)'}</span></div>`);
            }

            const propsHtml = propItems.length > 0 ? `<div class="vfc-props-grid">${propItems.join('')}</div>` : '';

            // 5. 数据字典 / 状态枚举 (如果定义了字典，作为核心重点高亮呈现)
            let dictHtml = '';
            if (sig.dict && typeof sig.dict === 'object' && Object.keys(sig.dict).length > 0) {
                dictHtml = `<div class="vfc-dict-deck">`;
                dictHtml += `<span class="vfc-dict-label"><i class="fa-solid fa-book-bookmark" style="color:var(--accent-color);"></i> 状态字典:</span>`;
                Object.entries(sig.dict).forEach(([k, val]) => {
                    dictHtml += `<span class="vfc-dict-pill"><code>${escapeHTML(k)}</code>: ${escapeHTML(String(val))}</span>`;
                });
                dictHtml += `</div>`;
            }

            // 6. 备注说明 / 工程说明 (如果存在，作为重点清晰展示)
            const remarkHtml = (sig.remark && String(sig.remark).trim()) ? `
                <div class="vfc-remark-box">
                    <i class="fa-solid fa-circle-info" style="color:var(--accent-color);"></i> <b>说明:</b> ${highlightText(sig.remark.trim(), query)}
                </div>
            ` : '';

            // 组装卡片：双列排布，彻底移除无意义的复制按钮，不显示未配置的虚假属性
            card.innerHTML = `
                <div class="vfc-header">
                    <div class="vfc-title-group">
                        <span class="vfc-bit-badge" style="background:${color.bg}; border-color:${color.border}; color:${color.text};">
                            B${start} ~ B${end} <small>(${count}b)</small>
                        </span>
                        <h4 class="vfc-name">${highlightText(sig.name || '未命名信号', query)}</h4>
                        <span class="vfc-datatype-pill">${escapeHTML(sig.dataType || 'u8')}</span>
                        ${(sig.unit && String(sig.unit).trim()) ? `<span class="vfc-unit-pill">${escapeHTML(sig.unit.trim())}</span>` : ''}
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

        const offset = byteItem.byteOffset !== undefined ? byteItem.byteOffset : (byteItem.offset !== undefined ? byteItem.offset : currentWordIndex);
        const subSignals = byteItem.signals || [];
        const isTx = (pkt.direction || (currentProtocol && currentProtocol.direction) || 'Tx') === 'Tx';

        if (viewerActiveWordHeader) {
            viewerActiveWordHeader.innerHTML = `
                <div class="vwh-title-row">
                    <div class="vwh-title-left">
                        <span class="vwh-octal-badge" style="background:#ea580c;">Byte ${offset}</span>
                        <h2 class="vwh-title">${escapeHTML(byteItem.name || `字节 ${offset}`)}</h2>
                        <span class="vwh-dir-chip ${isTx ? 'chip-tx' : 'chip-rx'}">${isTx ? 'Tx (发送)' : 'Rx (接收)'}</span>
                    </div>
                    <div class="vwh-meta-chips">
                        <span class="vwh-chip"><i class="fa-solid fa-arrows-left-right-to-line"></i> 偏移量: ${offset}</span>
                        <span class="vwh-chip"><i class="fa-solid fa-shapes"></i> 默认类型: ${escapeHTML(byteItem.dataType || 'u8')}</span>
                        <span class="vwh-chip"><i class="fa-solid fa-list-check"></i> 字段数: ${subSignals.length > 0 ? subSignals.length : 1} 个</span>
                        <span class="vwh-chip"><i class="fa-regular fa-clock"></i> 周期: ${pkt.period || (currentProtocol && currentProtocol.period) || 20}ms</span>
                    </div>
                </div>

                <!-- 串口通信参数条 (属于协议整体的传输规范) -->
                <div class="vwh-protocol-strip">
                    <div class="vwh-proto-strip-head">
                        <i class="fa-solid fa-bolt" style="color:#f59e0b;"></i>
                        <span class="vwh-proto-strip-title">串口通信物理电气参数</span>
                    </div>
                    <div class="vwh-proto-items">
                        <div class="vwh-proto-card" title="总线物理接口类型">
                            <span class="vpc-tag"><i class="fa-solid fa-microchip"></i> 接口类型:</span>
                            <strong class="vpc-val">${escapeHTML((currentProtocol && currentProtocol.type) || 'RS422')}</strong>
                        </div>
                        <div class="vwh-proto-card" title="通信波特率">
                            <span class="vpc-tag"><i class="fa-solid fa-gauge"></i> 波特率:</span>
                            <strong class="vpc-val">${escapeHTML(String((currentProtocol && currentProtocol.baudRate) || (currentProtocol && currentProtocol.baud) || '115200'))} bps</strong>
                        </div>
                        <div class="vwh-proto-card" title="奇偶校验位">
                            <span class="vpc-tag"><i class="fa-solid fa-shield-halved"></i> 校验:</span>
                            <strong class="vpc-val">${(currentProtocol && currentProtocol.parity === 'odd') ? '奇校验 (Odd)' : ((currentProtocol && currentProtocol.parity === 'even') ? '偶校验 (Even)' : '无校验 (None)')}</strong>
                        </div>
                    </div>
                </div>
            `;
        }

        // 渲染单字节内字段卡片 (双列排布，无复制按钮，仅有配置的属性)
        if (viewerFieldsList) {
            viewerFieldsList.innerHTML = '';
            const frag = document.createDocumentFragment();

            if (subSignals.length > 0) {
                subSignals.forEach((sig, sIdx) => {
                    const start = sig.startBit !== undefined ? sig.startBit : 0;
                    const count = sig.bitCount !== undefined ? sig.bitCount : (sig.length || 8);
                    const end = start + count - 1;
                    const color = FIELD_PALETTES[sIdx % FIELD_PALETTES.length];

                    const propItems = [];
                    const resVal = (sig.resolution !== undefined && sig.resolution !== null && String(sig.resolution).trim() !== '') ? String(sig.resolution).trim() : '';
                    if (resVal) {
                        propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">分辨率:</span><span class="vfc-prop-v">${escapeHTML(resVal)}</span></div>`);
                    }
                    const precVal = (sig.precision !== undefined && sig.precision !== null && String(sig.precision).trim() !== '') ? String(sig.precision).trim() : '';
                    if (precVal) {
                        propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">精度:</span><span class="vfc-prop-v">${escapeHTML(precVal)}</span></div>`);
                    }
                    const minVal = (sig.min !== undefined && sig.min !== null && String(sig.min).trim() !== '') ? String(sig.min).trim() : '';
                    const maxVal = (sig.max !== undefined && sig.max !== null && String(sig.max).trim() !== '') ? String(sig.max).trim() : '';
                    if (minVal !== '' && maxVal !== '') {
                        propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">${escapeHTML(minVal)} ~ ${escapeHTML(maxVal)}${sig.unit ? ' ' + escapeHTML(sig.unit.trim()) : ''}</span></div>`);
                    } else if (minVal !== '') {
                        propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">≥ ${escapeHTML(minVal)}${sig.unit ? ' ' + escapeHTML(sig.unit.trim()) : ''}</span></div>`);
                    } else if (maxVal !== '') {
                        propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">≤ ${escapeHTML(maxVal)}${sig.unit ? ' ' + escapeHTML(sig.unit.trim()) : ''}</span></div>`);
                    }

                    const propsHtml = propItems.length > 0 ? `<div class="vfc-props-grid">${propItems.join('')}</div>` : '';

                    let dictHtml = '';
                    if (sig.dict && typeof sig.dict === 'object' && Object.keys(sig.dict).length > 0) {
                        dictHtml = `<div class="vfc-dict-deck"><span class="vfc-dict-label"><i class="fa-solid fa-book-bookmark" style="color:var(--accent-color);"></i> 状态字典:</span>`;
                        Object.entries(sig.dict).forEach(([k, val]) => {
                            dictHtml += `<span class="vfc-dict-pill"><code>${escapeHTML(k)}</code>: ${escapeHTML(String(val))}</span>`;
                        });
                        dictHtml += `</div>`;
                    }

                    const remarkHtml = (sig.remark && String(sig.remark).trim()) ? `<div class="vfc-remark-box"><i class="fa-solid fa-circle-info" style="color:var(--accent-color);"></i> <b>说明:</b> ${escapeHTML(sig.remark.trim())}</div>` : '';

                    const card = document.createElement('div');
                    card.className = 'viewer-field-card';
                    card.id = `viewer-field-card-${sIdx}`;
                    card.innerHTML = `
                        <div class="vfc-header">
                            <div class="vfc-title-group">
                                <span class="vfc-bit-badge" style="background:${color.bg}; border-color:${color.border}; color:${color.text};">
                                    bit${start}${count > 1 ? `~bit${end}` : ''} <small>(${count}b)</small>
                                </span>
                                <h4 class="vfc-name">${escapeHTML(sig.name || `字段 ${sIdx + 1}`)}</h4>
                                <span class="vfc-datatype-pill">${escapeHTML(sig.dataType || 'u8')}</span>
                                ${sig.unit ? `<span class="vfc-unit-pill">${escapeHTML(sig.unit.trim())}</span>` : ''}
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
                    frag.appendChild(card);
                });
            } else {
                // 单字节自身作为字段卡片
                const propItems = [];
                const resVal = (byteItem.resolution !== undefined && byteItem.resolution !== null && String(byteItem.resolution).trim() !== '') ? String(byteItem.resolution).trim() : '';
                if (resVal) {
                    propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">分辨率:</span><span class="vfc-prop-v">${escapeHTML(resVal)}</span></div>`);
                }
                const precVal = (byteItem.precision !== undefined && byteItem.precision !== null && String(byteItem.precision).trim() !== '') ? String(byteItem.precision).trim() : '';
                if (precVal) {
                    propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">精度:</span><span class="vfc-prop-v">${escapeHTML(precVal)}</span></div>`);
                }
                const minVal = (byteItem.min !== undefined && byteItem.min !== null && String(byteItem.min).trim() !== '') ? String(byteItem.min).trim() : '';
                const maxVal = (byteItem.max !== undefined && byteItem.max !== null && String(byteItem.max).trim() !== '') ? String(byteItem.max).trim() : '';
                if (minVal !== '' && maxVal !== '') {
                    propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">${escapeHTML(minVal)} ~ ${escapeHTML(maxVal)}${byteItem.unit ? ' ' + escapeHTML(byteItem.unit.trim()) : ''}</span></div>`);
                } else if (minVal !== '') {
                    propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">≥ ${escapeHTML(minVal)}${byteItem.unit ? ' ' + escapeHTML(byteItem.unit.trim()) : ''}</span></div>`);
                } else if (maxVal !== '') {
                    propItems.push(`<div class="vfc-prop-item"><span class="vfc-prop-k">范围:</span><span class="vfc-prop-v">≤ ${escapeHTML(maxVal)}${byteItem.unit ? ' ' + escapeHTML(byteItem.unit.trim()) : ''}</span></div>`);
                }

                const propsHtml = propItems.length > 0 ? `<div class="vfc-props-grid">${propItems.join('')}</div>` : '';
                const remarkHtml = (byteItem.remark && String(byteItem.remark).trim()) ? `<div class="vfc-remark-box"><i class="fa-solid fa-circle-info" style="color:var(--accent-color);"></i> <b>说明:</b> ${escapeHTML(byteItem.remark.trim())}</div>` : '';

                const card = document.createElement('div');
                card.className = 'viewer-field-card';
                card.innerHTML = `
                    <div class="vfc-header">
                        <div class="vfc-title-group">
                            <span class="vfc-bit-badge">Offset: ${offset}</span>
                            <h4 class="vfc-name">${escapeHTML(byteItem.name || `字节 ${offset}`)}</h4>
                            <span class="vfc-datatype-pill">${escapeHTML(byteItem.dataType || 'u8')}</span>
                            ${byteItem.unit ? `<span class="vfc-unit-pill">${escapeHTML(byteItem.unit.trim())}</span>` : ''}
                        </div>
                    </div>
                    ${(propsHtml || remarkHtml) ? `
                        <div class="vfc-body">
                            ${propsHtml}
                            ${remarkHtml}
                        </div>
                    ` : ''}
                `;
                frag.appendChild(card);
            }

            viewerFieldsList.appendChild(frag);
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
