/**
 * @file arinc-ctrl.js
 * @brief ProtoView ARINC 429 专用航电工作台精简高效控制器
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
    const fallbackCopy = ProtoView.fallbackCopy || global.fallbackCopy || function(text, cb) {
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
    };

    // 状态定义
    let currentArincProtocol = null;
    let currentArincPacketIndex = 0; // 当前选中的 429 数据包索引
    let currentWordIndex = 0;
    let wordFilter = 'all';
    let sourceFilter = 'all';
    let wordSearchQuery = '';
    let activeDictTarget = null; // 当前正在编辑字典的对象 { target, dictProp, callback }

    // DOM 元素引用
    let btnArincBack, arincProtocolSelect, toolbarProtoTitle, badgeProtoMode,
        badgeProtoPeriod, badgeProtoDevice, badgeProtoDir, badgeProtoSpeed,
        badgeProtoParity, btnViewArincProps, btnArincNew, btnArincTemplates,
        btnArincImport, arincFileInput, btnArincExport, btnArincSave;

    // 429 多数据包工具栏引用 (对齐串口：支持多包切换、添加、克隆、删除、方向、周期、包名)
    let arincPacketSelect, btnAddArincPacket, btnDuplicateArincPacket,
        btnDeleteArincPacket, arincPacketDirection, arincPacketPeriodItem,
        arincPacketPeriod, arincPacketName;

    let arincCreateModal, arincCreateForm, create429Name, create429Type,
        create429Device, create429Direction, create429Period, create429Speed,
        create429Parity, create429Mode, create429Desc, create429Product;

    let arincPropsModal, arincPropsForm, props429Id, props429Name,
        props429Device, props429Direction, props429Period, props429Speed,
        props429Parity, props429Mode, props429Desc, props429Product,
        propsSummaryWords, propsSummaryId;

    let arincWordsList, wordsCountBadge, btnAddWord, arincWordSearch,
        arincSourceFilter, wordFilterButtons, btnMoveWordUp, btnMoveWordDown;

    let arincDenseWorkbench, btnMobileTabWords, btnMobileTabDetail,
        btnMobileBackWords, mobileWordsCount, mobileActiveWordLabel;

    let detailLabelBadge, detailWordTitle, detailSourceBadge, detailModeBadge;

    let wordLabelOctal, labelConversionHelper, wordName, wordPeriodBadge,
        wordDirectionBadge, btnDuplicateWord, btnDeleteWord;

    let btnArincExportMd, arincExportMdModal, exportMdCodeBlock,
        btnCopyMd, btnDownloadMd, btnDownloadJson, exportMdHint;

    let classicStructureContainer, classicLabelVal, btnEditSdiDict,
        wordSdi, classicDataVal, btnEditSsmDict, wordSsm, classicParityVal;

    let bitstreamStructureContainer, bsLabelVal, bitstreamDataVal,
        bsWordSsm, btnEditBsSsmDict, bsParityVal;

    let fieldsTableDesc, btnAddField, arincFieldsTbody;

    let dictEditorModal, dictFieldTargetName, dictItemsTbody,
        btnAddDictRow, btnSaveDict, dictPresetButtons;

    let simHexOutput, btnCopyHex, simBinaryOutput, simDecoderInput, btnSimDecode;
    let arincTemplatesModal, templateCardsContainer;

    let tabBtnExportPreview, tabBtnExportCode, exportPreviewContainer,
        exportCodeContainer, exportRenderedPreview, btnPrintPreviewHtml, btnDownloadHtmlSpec;

    let btnArincCheck, arincCheckModal, checkResultsContainer,
        btnRecheckProtocol, checkSummaryHint;

    let workbenchResizer, arincWordsPanel;

    function initDOMElements() {
        btnArincBack = document.getElementById('btn-arinc-back');
        arincProtocolSelect = document.getElementById('arinc-protocol-select');
        toolbarProtoTitle = document.getElementById('toolbar-proto-title');
        badgeProtoMode = document.getElementById('badge-proto-mode');
        badgeProtoPeriod = document.getElementById('badge-proto-period');
        badgeProtoDevice = document.getElementById('badge-proto-device');
        badgeProtoDir = document.getElementById('badge-proto-dir');
        badgeProtoSpeed = document.getElementById('badge-proto-speed');
        badgeProtoParity = document.getElementById('badge-proto-parity');
        btnViewArincProps = document.getElementById('btn-view-arinc-props');

        btnArincNew = document.getElementById('btn-arinc-new');
        btnArincTemplates = document.getElementById('btn-arinc-templates');
        btnArincImport = document.getElementById('btn-arinc-import');
        arincFileInput = document.getElementById('arinc-file-input');
        btnArincExport = document.getElementById('btn-arinc-export');
        btnArincSave = document.getElementById('btn-arinc-save');

        // 429 多数据包工具栏元素
        arincPacketSelect = document.getElementById('arinc-packet-select');
        btnAddArincPacket = document.getElementById('btn-add-arinc-packet');
        btnDuplicateArincPacket = document.getElementById('btn-duplicate-arinc-packet');
        btnDeleteArincPacket = document.getElementById('btn-delete-arinc-packet');
        arincPacketDirection = document.getElementById('arinc-packet-direction');
        arincPacketPeriodItem = document.getElementById('arinc-packet-period-item');
        arincPacketPeriod = document.getElementById('arinc-packet-period');
        arincPacketName = document.getElementById('arinc-packet-name');

        arincCreateModal = document.getElementById('arinc-create-modal');
        arincCreateForm = document.getElementById('arinc-create-form');
        create429Name = document.getElementById('create-429-name');
        create429Type = document.getElementById('create-429-type');
        create429Device = document.getElementById('create-429-device');
        create429Direction = document.getElementById('create-429-direction');
        create429Period = document.getElementById('create-429-period');
        create429Speed = document.getElementById('create-429-speed');
        create429Parity = document.getElementById('create-429-parity');
        create429Mode = document.getElementById('create-429-mode');
        create429Desc = document.getElementById('create-429-desc');
        create429Product = document.getElementById('create-429-product');

        arincPropsModal = document.getElementById('arinc-props-modal');
        arincPropsForm = document.getElementById('arinc-props-form');
        props429Id = document.getElementById('props-429-id');
        props429Name = document.getElementById('props-429-name');
        props429Device = document.getElementById('props-429-device');
        props429Direction = document.getElementById('props-429-direction');
        props429Period = document.getElementById('props-429-period');
        props429Speed = document.getElementById('props-429-speed');
        props429Parity = document.getElementById('props-429-parity');
        props429Mode = document.getElementById('props-429-mode');
        props429Desc = document.getElementById('props-429-desc');
        props429Product = document.getElementById('props-429-product');
        propsSummaryWords = document.getElementById('props-summary-words');
        propsSummaryId = document.getElementById('props-summary-id');

        arincWordsList = document.getElementById('arinc-words-list');
        wordsCountBadge = document.getElementById('words-count-badge');
        btnAddWord = document.getElementById('btn-add-word');
        arincWordSearch = document.getElementById('arinc-word-search');
        arincSourceFilter = document.getElementById('arinc-source-filter');
        btnMoveWordUp = document.getElementById('btn-move-word-up');
        btnMoveWordDown = document.getElementById('btn-move-word-down');
        wordFilterButtons = document.querySelectorAll('#word-filter-buttons button');

        arincDenseWorkbench = document.getElementById('arinc-dense-workbench');
        btnMobileTabWords = document.getElementById('btn-mobile-tab-words');
        btnMobileTabDetail = document.getElementById('btn-mobile-tab-detail');
        btnMobileBackWords = document.getElementById('btn-mobile-back-words');
        mobileWordsCount = document.getElementById('mobile-words-count');
        mobileActiveWordLabel = document.getElementById('mobile-active-word-label');

        detailLabelBadge = document.getElementById('detail-label-badge');
        detailWordTitle = document.getElementById('detail-word-title');
        detailSourceBadge = document.getElementById('detail-source-badge');
        detailModeBadge = document.getElementById('detail-mode-badge');

        wordLabelOctal = document.getElementById('word-label-octal');
        labelConversionHelper = document.getElementById('label-conversion-helper');
        wordName = document.getElementById('word-name');
        wordPeriodBadge = document.getElementById('word-period-badge');
        wordDirectionBadge = document.getElementById('word-direction-badge');
        btnDuplicateWord = document.getElementById('btn-duplicate-word');
        btnDeleteWord = document.getElementById('btn-delete-word');

        btnArincExportMd = document.getElementById('btn-arinc-export-md');
        arincExportMdModal = document.getElementById('arinc-export-md-modal');
        exportMdCodeBlock = document.getElementById('export-md-code-block');
        btnCopyMd = document.getElementById('btn-copy-md');
        btnDownloadMd = document.getElementById('btn-download-md');
        btnDownloadJson = document.getElementById('btn-download-json');
        exportMdHint = document.getElementById('export-md-hint');

        classicStructureContainer = document.getElementById('classic-structure-container');
        classicLabelVal = document.getElementById('classic-label-val');
        btnEditSdiDict = document.getElementById('btn-edit-sdi-dict');
        wordSdi = document.getElementById('word-sdi');
        classicDataVal = document.getElementById('classic-data-val');
        btnEditSsmDict = document.getElementById('btn-edit-ssm-dict');
        wordSsm = document.getElementById('word-ssm');
        classicParityVal = document.getElementById('classic-parity-val');

        bitstreamStructureContainer = document.getElementById('bitstream-structure-container');
        bsLabelVal = document.getElementById('bs-label-val');
        bitstreamDataVal = document.getElementById('bitstream-data-val');
        bsWordSsm = document.getElementById('bs-word-ssm');
        btnEditBsSsmDict = document.getElementById('btn-edit-bs-ssm-dict');
        bsParityVal = document.getElementById('bs-parity-val');

        fieldsTableDesc = document.getElementById('fields-table-desc');
        btnAddField = document.getElementById('btn-add-field');
        arincFieldsTbody = document.getElementById('arinc-fields-container') || document.getElementById('arinc-fields-tbody');

        dictEditorModal = document.getElementById('dict-editor-modal');
        dictFieldTargetName = document.getElementById('dict-field-target-name');
        dictItemsTbody = document.getElementById('dict-items-tbody');
        btnAddDictRow = document.getElementById('btn-add-dict-row');
        btnSaveDict = document.getElementById('btn-save-dict');
        dictPresetButtons = document.querySelectorAll('.btn-dict-preset');

        simHexOutput = document.getElementById('sim-hex-output');
        btnCopyHex = document.getElementById('btn-copy-hex');
        simBinaryOutput = document.getElementById('sim-binary-output');
        simDecoderInput = document.getElementById('sim-decoder-input');
        btnSimDecode = document.getElementById('btn-sim-decode');

        arincTemplatesModal = document.getElementById('arinc-templates-modal');
        templateCardsContainer = document.getElementById('template-cards-container');

        tabBtnExportPreview = document.getElementById('tab-btn-export-view-preview');
        tabBtnExportCode = document.getElementById('tab-btn-export-view-code');
        exportPreviewContainer = document.getElementById('export-preview-container');
        exportCodeContainer = document.getElementById('export-code-container');
        exportRenderedPreview = document.getElementById('export-rendered-preview');
        btnPrintPreviewHtml = document.getElementById('btn-print-preview-html');
        btnDownloadHtmlSpec = document.getElementById('btn-download-html-spec');

        btnArincCheck = document.getElementById('btn-arinc-check');
        arincCheckModal = document.getElementById('arinc-check-modal');
        checkResultsContainer = document.getElementById('check-results-container');
        btnRecheckProtocol = document.getElementById('btn-recheck-protocol');
        checkSummaryHint = document.getElementById('check-summary-hint');

        workbenchResizer = document.getElementById('workbench-resizer');
        arincWordsPanel = document.getElementById('arinc-words-panel');
    }

    // 移动端视窗 Tab 切换
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

    // ----------------- 429 数据包管理与辅助方法 -----------------
    // 辅助：安全获取当前选中的 429 数据包 (保证向后兼容老旧没有 packets 的协议结构)
    function getCurrentArincPacket() {
        if (!currentArincProtocol) return null;
        if (!currentArincProtocol.packets || !Array.isArray(currentArincProtocol.packets) || currentArincProtocol.packets.length === 0) {
            const initialDir = currentArincProtocol.direction === 'Rx' ? 'Rx' : 'Tx';
            const initialWords = currentArincProtocol.words || [];
            initialWords.forEach(w => w.direction = initialDir);
            currentArincProtocol.packets = [
                {
                    key: 'pkt_1',
                    name: '数据包 1',
                    direction: initialDir,
                    words: initialWords
                }
            ];
        }

        // 规范化包内属性 (方向严格单向 Tx 或 Rx，绝不共存；标号字继承该包方向)
        currentArincProtocol.packets.forEach((pkt, idx) => {
            if (!pkt.key) pkt.key = `pkt_${idx + 1}`;
            if (!pkt.name) pkt.name = `数据包 ${idx + 1}`;
            if (pkt.direction !== 'Rx' && pkt.direction !== 'Tx') pkt.direction = 'Tx';
            if (pkt.period === undefined || pkt.period === null) {
                pkt.period = currentArincProtocol.period || 20;
            }
            if (!pkt.words || !Array.isArray(pkt.words)) pkt.words = [];
            pkt.words.forEach(w => {
                w.direction = pkt.direction;
                w.period = pkt.period;
            });
        });

        if (currentArincPacketIndex < 0 || currentArincPacketIndex >= currentArincProtocol.packets.length) {
            currentArincPacketIndex = 0;
        }

        const pkt = currentArincProtocol.packets[currentArincPacketIndex];
        // 关键向后兼容：保持 currentArincProtocol.words 引用指向当前活动包的 words
        currentArincProtocol.words = pkt.words;
        return pkt;
    }

    // 同步顶部 429 数据包切换器与属性条
    function updateArincPacketToolbar() {
        if (!currentArincProtocol) return;
        const packets = currentArincProtocol.packets || [];
        if (arincPacketSelect) {
            arincPacketSelect.innerHTML = '';
            packets.forEach((pkt, idx) => {
                const opt = document.createElement('option');
                opt.value = idx.toString();
                const isRx = pkt.direction === 'Rx';
                const pktPeriod = pkt.period !== undefined ? pkt.period : (currentArincProtocol.period || 20);
                const periodText = isRx ? '' : ` ${pktPeriod}ms`;
                opt.textContent = `[${isRx ? 'Rx' : 'Tx'}${periodText}] ${pkt.name || '未命名数据包'} (${pkt.words ? pkt.words.length : 0}个字)`;
                if (idx === currentArincPacketIndex) {
                    opt.selected = true;
                }
                arincPacketSelect.appendChild(opt);
            });
        }

        const activePkt = getCurrentArincPacket();
        if (activePkt) {
            const isTx = activePkt.direction !== 'Rx';
            if (arincPacketDirection) {
                arincPacketDirection.value = isTx ? 'Tx' : 'Rx';
            }
            if (arincPacketName && document.activeElement !== arincPacketName) {
                arincPacketName.value = activePkt.name || '';
            }
            if (!arincPacketPeriodItem) {
                arincPacketPeriodItem = document.getElementById('arinc-packet-period-item');
            }
            if (arincPacketPeriodItem) {
                arincPacketPeriodItem.style.display = isTx ? 'flex' : 'none';
            }
            if (arincPacketPeriod && document.activeElement !== arincPacketPeriod) {
                arincPacketPeriod.value = activePkt.period !== undefined ? activePkt.period : (currentArincProtocol.period || 20);
            }
        }
    }

    // 添加新的 429 数据包
    function addArincPacket() {
        if (!currentArincProtocol) return;
        if (!currentArincProtocol.packets) currentArincProtocol.packets = [];
        const newIdx = currentArincProtocol.packets.length + 1;
        const newPkt = {
            key: `pkt_${Date.now()}`,
            name: `数据包 ${newIdx}`,
            direction: 'Tx',
            period: currentArincProtocol.period || 20,
            words: []
        };
        currentArincProtocol.packets.push(newPkt);
        currentArincPacketIndex = currentArincProtocol.packets.length - 1;
        currentWordIndex = 0;
        currentArincProtocol.words = newPkt.words;
        updateArincPacketToolbar();
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
        showToast(`已创建新 429 数据包「${newPkt.name}」`, 'success');
    }

    // 克隆当前 429 数据包
    function duplicateCurrentArincPacket() {
        const cur = getCurrentArincPacket();
        if (!cur) return;
        const clonePkt = JSON.parse(JSON.stringify(cur));
        clonePkt.key = `pkt_${Date.now()}`;
        clonePkt.name = `${cur.name || '数据包'} (副本)`;
        currentArincProtocol.packets.push(clonePkt);
        currentArincPacketIndex = currentArincProtocol.packets.length - 1;
        currentWordIndex = 0;
        currentArincProtocol.words = clonePkt.words;
        updateArincPacketToolbar();
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
        showToast(`已克隆数据包为「${clonePkt.name}」`, 'success');
    }

    // 删除当前 429 数据包
    function deleteCurrentArincPacket() {
        if (!currentArincProtocol || !currentArincProtocol.packets) return;
        if (currentArincProtocol.packets.length <= 1) {
            showToast('当前协议至少需要保留一个数据包，不能删除！', 'warning');
            return;
        }
        const cur = getCurrentArincPacket();
        if (!confirm(`确定要删除当前 429 数据包「${cur.name || '未命名'}」及其下的所有标号字吗？`)) {
            return;
        }
        currentArincProtocol.packets.splice(currentArincPacketIndex, 1);
        if (currentArincPacketIndex >= currentArincProtocol.packets.length) {
            currentArincPacketIndex = currentArincProtocol.packets.length - 1;
        }
        currentWordIndex = 0;
        currentArincProtocol.words = getCurrentArincPacket().words;
        updateArincPacketToolbar();
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
        showToast('已成功删除该数据包', 'info');
    }

    // ----------------- 更新顶部工具栏协议信息与属性徽章 (精简显示：与串口对齐) -----------------
    function updateToolbarProtocolInfo() {
        if (!currentArincProtocol) {
            if (toolbarProtoTitle) {
                toolbarProtoTitle.innerHTML = `<i class="fa-solid fa-plane-departure" style="color:var(--accent-color);"></i> 429 协议工作台`;
                toolbarProtoTitle.title = '未选择协议';
            }
            if (arincPacketSelect) arincPacketSelect.innerHTML = '<option value="">(无数据包)</option>';
            if (badgeProtoMode) badgeProtoMode.textContent = '无协议';
            if (badgeProtoPeriod) badgeProtoPeriod.innerHTML = `<i class="fa-solid fa-clock"></i> 周期: -`;
            if (badgeProtoDevice) badgeProtoDevice.textContent = '对端: -';
            if (badgeProtoDir) badgeProtoDir.textContent = '方向: -';
            if (badgeProtoSpeed) badgeProtoSpeed.innerHTML = `<i class="fa-solid fa-gauge-high"></i> 100kbps`;
            if (badgeProtoParity) badgeProtoParity.textContent = '奇校验';
            return;
        }
        const p = currentArincProtocol;
        if (toolbarProtoTitle) {
            // 精简显示：仅展示协议名称，去除冗余前缀
            toolbarProtoTitle.innerHTML = `<i class="fa-solid fa-plane-departure" style="color:var(--accent-color);"></i> ${escapeHTML(p.name || '429 协议')}`;
            toolbarProtoTitle.title = (p.product ? `所属产品: ${p.product}\n` : '') + `协议名称: ${p.name || 'ARINC 429 协议'}\n标准规范: ${p.subType || 'ARINC429 (HB6096)'}\n划分架构: ${p.mode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式'}\n速率: ${p.speed || '100kbps'} | 校验: ${p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : '无校验')}\n周期: ${p.period || 20}ms | 方向: ${p.direction || 'Tx'}`;
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
            badgeProtoSpeed.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${escapeHTML(p.speed || '100kbps')}`;
        }
        if (badgeProtoParity) {
            badgeProtoParity.textContent = p.parity === 'odd' ? '奇校验' : (p.parity === 'even' ? '偶校验' : '无校验');
        }

        updateArincPacketToolbar();
    }

    // ----------------- 载入 ARINC 429 协议列表 -----------------
    async function loadArincProtocolsForSelect() {
        initDOMElements();
        const allProtocols = await (window.dbHelper ? window.dbHelper.getAllProtocols() : []);
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
        initDOMElements();
        const p = await (window.dbHelper ? window.dbHelper.getProtocol(id) : null);
        if (!p) return;

        currentArincProtocol = p;
        if (!currentArincProtocol.words) currentArincProtocol.words = [];
        
        // 自动适配多数据包架构
        currentArincPacketIndex = 0;
        getCurrentArincPacket(); // 规范化 packets 并挂载当前包 words 到 currentArincProtocol.words
        currentWordIndex = 0;

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

    // 保存当前 429 协议
    async function saveCurrentArincProtocol() {
        if (!currentArincProtocol) return;

        // 同步当前包的修改
        const activePkt = getCurrentArincPacket();
        if (activePkt) {
            activePkt.words = currentArincProtocol.words;
        }

        if (!currentArincProtocol.ssmDict && currentArincProtocol.words && currentArincProtocol.words[0]) {
            currentArincProtocol.ssmDict = currentArincProtocol.words[0].ssmDict;
        }

        // 规范化所有包内的标号字 (严格遵循该包单向传输原则，要么 Tx 要么 Rx，绝不共存)
        if (currentArincProtocol.packets) {
            currentArincProtocol.packets.forEach(pkt => {
                const dir = pkt.direction === 'Rx' ? 'Rx' : 'Tx';
                if (pkt.words) {
                    pkt.words.forEach(w => {
                        w.editMode = currentArincProtocol.mode || 'classic';
                        w.period = currentArincProtocol.period || 20;
                        w.direction = dir;
                        if (currentArincProtocol.ssmDict) {
                            w.ssmDict = currentArincProtocol.ssmDict;
                        }
                    });
                }
            });
        }

        // 保存至本地磁盘和云端
        let cloudRes = { ok: true };
        if (ProtoView.WorkspaceSync) {
            cloudRes = await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(currentArincProtocol);
        }

        const id = await window.dbHelper.saveProtocol(currentArincProtocol);
        currentArincProtocol.id = id;

        if (btnArincSave) {
            const originalHTML = btnArincSave.innerHTML;
            if (cloudRes.ok) {
                btnArincSave.innerHTML = '<i class="fa-solid fa-check"></i> 云端已同步!';
                btnArincSave.style.backgroundColor = 'var(--success)';
            } else {
                btnArincSave.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 仅本地保存';
                btnArincSave.style.backgroundColor = 'var(--warning)';
                showToast(`本地已保存，但云端同步失败: ${cloudRes.error}`, 'warning');
            }
            setTimeout(() => {
                btnArincSave.innerHTML = originalHTML;
                btnArincSave.style.backgroundColor = '';
            }, 1800);
        }

        updateToolbarProtocolInfo();
        await loadArincProtocolsForSelect();
        if (typeof window.loadProtocols === 'function') {
            await window.loadProtocols();
        }
        updateSourceFilterOptions();
        renderArincWordsList();
    }

    // 聚焦并红色高亮闪烁特定字段卡片
    function highlightAndScrollToField(fieldIndex) {
        setTimeout(() => {
            const card = document.getElementById(`field-card-${fieldIndex}`);
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

    // ----------------- 渲染左侧标号字列表 -----------------
    function renderArincWordsList() {
        if (!arincWordsList) return;
        if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) {
            arincWordsList.innerHTML = '<tr><td colspan="5" class="empty-state">暂无标号字，请点击右上角「+ 添加字」。</td></tr>';
            if (wordsCountBadge) wordsCountBadge.textContent = '0';
            if (mobileWordsCount) mobileWordsCount.textContent = '0';
            return;
        }

        if (wordsCountBadge) wordsCountBadge.textContent = currentArincProtocol.words.length;
        if (mobileWordsCount) mobileWordsCount.textContent = currentArincProtocol.words.length;

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
                const matchLabel = w.label && w.label.toLowerCase().includes(q);
                const matchName = w.name && w.name.toLowerCase().includes(q);
                const matchSource = w.source && w.source.toLowerCase().includes(q);
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

            const locateBtn = tr.querySelector('.btn-locate-matched-field');
            if (locateBtn) {
                locateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentWordIndex = item.originalIndex;
                    renderArincWordsList();
                    renderSelectedWordInspector();
                    if (window.innerWidth <= 768) {
                        setMobileArincView('detail');
                    }
                    highlightAndScrollToField(firstMatchedFieldIndex);
                });
            }

            const delBtn = tr.querySelector('.word-row-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
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
                        updateArincPacketToolbar();
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

    // 上移 / 下移标号字位置
    function moveArincWord(delta) {
        if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
        const words = currentArincProtocol.words;
        const newIdx = currentWordIndex + delta;
        if (newIdx < 0 || newIdx >= words.length) return;

        const tmp = words[currentWordIndex];
        words[currentWordIndex] = words[newIdx];
        words[newIdx] = tmp;
        currentWordIndex = newIdx;

        const pkt = getCurrentArincPacket();
        if (pkt) {
            pkt.words = words;
        }

        renderArincWordsList();
        renderSelectedWordInspector();

        setTimeout(() => {
            const rows = arincWordsList ? arincWordsList.querySelectorAll('tr') : [];
            if (rows[newIdx]) {
                rows[newIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);
    }

    // ----------------- 渲染右侧选中的数据字与具体字段编辑面板 -----------------
    function renderSelectedWordInspector() {
        const inspectorPanel = document.getElementById('arinc-inspector-panel');
        if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) {
            if (inspectorPanel) inspectorPanel.style.opacity = '0.5';
            return;
        }

        if (inspectorPanel) inspectorPanel.style.opacity = '1';
        if (currentWordIndex >= currentArincProtocol.words.length) {
            currentWordIndex = currentArincProtocol.words.length - 1;
        }
        if (currentWordIndex < 0) currentWordIndex = 0;

        const word = currentArincProtocol.words[currentWordIndex];
        if (!word) return;

        if (!word.editMode) word.editMode = 'classic';
        if (!word.signals) word.signals = [];

        const protoMode = (currentArincProtocol && currentArincProtocol.mode) || word.editMode || 'classic';
        word.editMode = protoMode;

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

        if (protoMode === 'bitstream') {
            if (classicStructureContainer) classicStructureContainer.style.display = 'none';
            if (bitstreamStructureContainer) bitstreamStructureContainer.style.display = 'flex';
            if (fieldsTableDesc) fieldsTableDesc.textContent = '自由 Bit 模式：数据段默认从 Bit 9 起分配 (Bits 9~29 共 21 位)，SSM 占用 2 位 (Bits 30~31)';
        } else {
            if (classicStructureContainer) classicStructureContainer.style.display = 'flex';
            if (bitstreamStructureContainer) bitstreamStructureContainer.style.display = 'none';
            if (fieldsTableDesc) fieldsTableDesc.textContent = '经典航电模式：SDI 占用 2 位 (Bits 9~10)，在 19 位有效载荷 (Bits 11~29) 内划分字段';
        }

        if (classicLabelVal) classicLabelVal.textContent = `${octalClean}₈`;
        if (bsLabelVal) bsLabelVal.textContent = `${octalClean}₈`;
        const parityText = currentArincProtocol.parity === 'odd' ? '奇校验' : (currentArincProtocol.parity === 'even' ? '偶校验' : '无校验');
        if (classicParityVal) classicParityVal.textContent = parityText;
        if (bsParityVal) bsParityVal.textContent = parityText;

        if (wordLabelOctal) wordLabelOctal.value = word.label || '000';
        if (wordName) wordName.value = word.name || '';

        const curPkt = getCurrentArincPacket();
        const protoDir = (curPkt && curPkt.direction) || (currentArincProtocol && currentArincProtocol.direction) || word.direction || 'Tx';
        const isTx = protoDir !== 'Rx';
        word.direction = protoDir;
        if (wordDirectionBadge) {
            wordDirectionBadge.textContent = isTx ? 'Tx (发)' : 'Rx (收)';
            wordDirectionBadge.className = `dense-readonly-tag dense-dir-tag ${isTx ? 'dir-tx' : 'dir-rx'}`;
            wordDirectionBadge.title = `继承自当前数据包方向: ${protoDir} (只读)`;
        }

        const pktPeriod = (curPkt && curPkt.period !== undefined) ? curPkt.period : ((currentArincProtocol && currentArincProtocol.period) || word.period || 20);
        word.period = pktPeriod;
        const wordPeriodContainer = document.getElementById('word-period-container');
        if (wordPeriodContainer) {
            wordPeriodContainer.style.display = isTx ? 'flex' : 'none';
        }
        if (wordPeriodBadge) {
            wordPeriodBadge.textContent = `${pktPeriod}ms`;
            wordPeriodBadge.title = `继承自当前数据包发送周期: ${pktPeriod}ms`;
        }

        word.sendMode = 'cyclic';

        if (labelConversionHelper) {
            labelConversionHelper.textContent = `Hex:${hexVal}`;
            labelConversionHelper.title = `十进制数值: ${byteVal}`;
        }

        updateSdiSelectOptions(word);
        updateSsmSelectOptions(word);
        renderFieldsTable(word);
        updateCompactSim(word);
    }

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

        updateFieldsAllocationSummary(word);

        if (fields.length === 0) {
            arincFieldsTbody.innerHTML = `
                <div class="field-card-empty-state">
                    <i class="fa-solid fa-layer-group" style="font-size: 28px; margin-bottom: 10px; display: block; color: var(--accent-color); opacity: 0.6;"></i>
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">当前数据字暂无字段</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">点击右上角「+ 添加字段卡片」为该标号字划分具体的数据段。</div>
                    <button type="button" class="dense-btn dense-btn-primary" onclick="if(window.addField){window.addField();}">
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
                } else {
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

            card.querySelector('.btn-edit-field-dict').addEventListener('click', () => {
                openDictModal(field, `字段 [${field.name || '未命名字段'}]`, () => {
                    renderFieldsTable(word);
                    updateCompactSim(word);
                });
            });

            const btnClone = card.querySelector('.btn-clone-field');
            if (btnClone) {
                btnClone.addEventListener('click', () => {
                    const cloned = JSON.parse(JSON.stringify(field));
                    cloned.name = field.name || '字段';
                    cloned.key = `sig_${Date.now().toString().slice(-6)}`;
                    word.signals.splice(fIdx + 1, 0, cloned);

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

    // 添加具体字段
    let lastAddFieldTime = 0;
    function addField() {
        const now = Date.now();
        if (now - lastAddFieldTime < 200) return;
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

    // ----------------- 通用数据字典弹窗编辑器 -----------------
    function openDictModal(targetObj, title, onApplyCallback, dictProp = 'dict') {
        initDOMElements();
        activeDictTarget = {
            target: targetObj,
            dictProp: dictProp,
            callback: onApplyCallback
        };

        if (dictFieldTargetName) dictFieldTargetName.textContent = title;
        renderDictItemsTable(targetObj[dictProp] || {});
        if (dictEditorModal) dictEditorModal.classList.add('active');
    }

    function renderDictItemsTable(dictObj) {
        if (!dictItemsTbody) return;
        dictItemsTbody.innerHTML = '';
        const entries = Object.entries(dictObj);

        if (entries.length === 0) {
            addDictRow('', '');
            return;
        }

        entries.forEach(([k, v]) => {
            addDictRow(k, v);
        });
    }

    function addDictRow(key = '', val = '') {
        if (!dictItemsTbody) return;
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

    // ----------------- 紧凑型实时仿真条 -----------------
    function updateCompactSim(word) {
        if (!simHexOutput || !simBinaryOutput) return;
        if (typeof Arinc429Helper === 'undefined') return;

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

    // 添加数据字
    let lastAddWordTime = 0;
    function addWord() {
        const now = Date.now();
        if (now - lastAddWordTime < 200) return;
        lastAddWordTime = now;

        if (!currentArincProtocol) return;
        if (!currentArincProtocol.words) currentArincProtocol.words = [];

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
        const curPkt = getCurrentArincPacket();
        const pktDir = curPkt ? curPkt.direction : ((currentArincProtocol && currentArincProtocol.direction) || 'Tx');

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
            direction: pktDir,
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
        updateArincPacketToolbar();
        updateSourceFilterOptions();
        renderArincWordsList();
        renderSelectedWordInspector();
        if (window.innerWidth <= 768) {
            setMobileArincView('detail');
        }
    }

    // 导出 Markdown / HTML 航电规范
    function openExportMdModal() {
        if (!currentArincProtocol) {
            alert('请先选择或创建一个 429 协议！');
            return;
        }
        if (typeof Arinc429Helper === 'undefined') return;

        const mdText = Arinc429Helper.generateMarkdownSpec(currentArincProtocol);
        if (exportMdCodeBlock) {
            exportMdCodeBlock.textContent = mdText;
        }

        if (exportRenderedPreview) {
            const tablesHtml = mdText
                .replace(/^#\s+[^\n]+\n+/, '')
                .replace(/###\s+[^\n]+/g, (m) => `<h3 style="margin: 1.5rem 0 0.8rem 0; font-size: 15px; color: #1e293b;">${m.replace(/###\s+/, '')}</h3>`)
                .replace(/---/g, '<hr style="border:none; border-top:1px dashed #cbd5e1; margin: 2rem 0;">');
            
            exportRenderedPreview.innerHTML = `
                <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <h2 style="margin:0; font-size: 20px; font-weight:bold; color:#0f172a;">${escapeHTML(currentArincProtocol.name || 'ARINC 429 通信协议')}</h2>
                        <div style="font-size:12px; color:#64748b; margin-top:4px;">设备来源: ${escapeHTML(currentArincProtocol.device || currentArincProtocol.source || '-')} | 速率: ${escapeHTML(currentArincProtocol.speed || '100kbps')}</div>
                    </div>
                    <div style="text-align:right; font-size:12px; color:#64748b;">
                        <div>符合标准: ARINC 429</div>
                        <div>数位格式: 32位 航电双列对照</div>
                    </div>
                </div>
                ${tablesHtml}
            `;
        }

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

    // 导出本地 JSON 模板文件
    function exportArincJson(silent = false) {
        if (!currentArincProtocol) {
            alert("暂无正在编辑的协议可导出！");
            return;
        }

        const activePkt = getCurrentArincPacket();
        if (activePkt) {
            activePkt.words = currentArincProtocol.words;
        }

        if (currentArincProtocol.words && currentArincProtocol.words[currentWordIndex]) {
            const curW = currentArincProtocol.words[currentWordIndex];
            if (wordLabelOctal && wordLabelOctal.value) curW.label = wordLabelOctal.value.trim();
            if (wordName && wordName.value !== undefined) curW.name = wordName.value.trim();
        }

        if (currentArincProtocol.packets) {
            currentArincProtocol.packets.forEach(pkt => {
                const dir = pkt.direction === 'Rx' ? 'Rx' : 'Tx';
                if (pkt.words) {
                    pkt.words.forEach(w => {
                        w.editMode = currentArincProtocol.mode || 'classic';
                        w.period = currentArincProtocol.period || 20;
                        w.direction = dir;
                    });
                }
            });
        }

        const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const fileName = `${safeName}.json`;
        downloadFile(JSON.stringify(currentArincProtocol, null, 2), fileName, 'application/json');

        if (!silent) {
            setTimeout(() => {
                alert(`已将协议模板「${fileName}」导出并下载到您的电脑本地！\n\n该文件永久保存在电脑硬盘中，不受任何浏览器缓存清理影响。下次需要时，直接点击顶部「导入模板」或在模板库中选择该文件即可完整还原！`);
            }, 100);
        }
    }

    // 导入 JSON 协议文件 (支持云端自动持久化与多类型兼容)
    function importArincJson(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (!parsed || (!parsed.words && !parsed.packets && !parsed.frames)) {
                    alert("导入失败：该文件不是有效的协议 JSON 格式！");
                    return;
                }
                const name = parsed.name || file.name.replace(/\.[^/.]+$/, "");
                delete parsed.id;
                parsed.name = name;

                // 1. 若导入协议包含产品归属，同时在本地及云端注册该产品型号
                if (parsed.product && window.dbHelper) {
                    await window.dbHelper.saveProduct({ name: parsed.product });
                    if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.syncProductsToCloud) {
                        await ProtoView.WorkspaceSync.syncProductsToCloud();
                    }
                }

                if (parsed.type === 'Serial') {
                    let cloudRes = { ok: true };
                    if (ProtoView.WorkspaceSync) {
                        cloudRes = await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(parsed);
                    }
                    const newId = await window.dbHelper.saveProtocol(parsed);
                    if (typeof window.loadProtocols === 'function') await window.loadProtocols();
                    if (typeof window.switchToView === 'function') window.switchToView('serial-view');
                    if (typeof window.loadSerialProtocolIntoEditor === 'function') {
                        await window.loadSerialProtocolIntoEditor(newId);
                    }
                    if (cloudRes.ok) {
                        showToast(`成功导入串口通信协议「${name}」并同步至云端！`, 'success');
                    } else {
                        alert(`【提示】协议「${name}」已在本地工作台成功打开，但同步至云端受阻：\n${cloudRes.error}\n\n请在管理后台检查数据库/存储绑定。`);
                    }
                    return;
                }

                if (!parsed.packets || !Array.isArray(parsed.packets) || parsed.packets.length === 0) {
                    const initialDir = parsed.direction === 'Rx' ? 'Rx' : 'Tx';
                    const initialWords = parsed.words || [];
                    initialWords.forEach(w => w.direction = initialDir);
                    parsed.packets = [
                        {
                            key: 'pkt_1',
                            name: '数据包 1',
                            direction: initialDir,
                            words: initialWords
                        }
                    ];
                }

                let cloudRes = { ok: true };
                if (ProtoView.WorkspaceSync) {
                    cloudRes = await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(parsed);
                }
                const newId = await window.dbHelper.saveProtocol(parsed);
                parsed.id = newId;
                currentArincProtocol = parsed;
                currentWordIndex = 0;

                await loadArincProtocolsForSelect();
                if (typeof window.loadProtocols === 'function') await window.loadProtocols();
                await loadArincProtocolIntoEditor(newId);
                const totalWords = parsed.packets.reduce((sum, pkt) => sum + (pkt.words ? pkt.words.length : 0), 0);
                if (cloudRes.ok) {
                    showToast(`成功导入 429 协议「${name}」并同步至云端！包含 ${parsed.packets.length} 个数据包，共 ${totalWords} 个标号字。`, 'success');
                } else {
                    alert(`【提示】协议「${name}」已在本地工作台成功打开，但同步至云端受阻：\n${cloudRes.error}\n\n请在系统管理后台检查云端数据库/存储桶连接。`);
                }
            } catch (err) {
                alert("解析 JSON 失败: " + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ----------------- ARINC 429 协议工程健康度诊断器 -----------------
    function runProtocolHealthCheck() {
        if (!currentArincProtocol) {
            alert('请先选择或创建一个 429 协议！');
            return;
        }

        const issues = [];
        const p = currentArincProtocol;
        const words = p.words || [];

        if (words.length === 0) {
            issues.push({
                level: 'warning',
                title: '协议为空',
                desc: '当前协议下暂无任何标号字，请在左侧点击「+ 添加字」开始划分协议。'
            });
        }

        const labelMap = new Map();
        words.forEach((w, wIdx) => {
            const rawLabel = (w.label || '').toString().trim();
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
            const maxPayloadBit = 29;
            const minAllowedStart = isBitstream ? 9 : 11;

            if (fields.length === 0) {
                issues.push({
                    level: 'warning',
                    title: `字 [${oct}₈] 未划分任何字段`,
                    desc: `数据字 [${oct}₈ ${wName}] 没有任何信号字段卡片。`,
                    wordIndex: wIdx
                });
            }

            const localNameSet = new Set();
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

        renderCheckResults(issues);

        if (arincCheckModal) {
            arincCheckModal.classList.add('active');
        }
    }

    function renderCheckResults(issues) {
        if (!checkResultsContainer) return;
        checkResultsContainer.innerHTML = '';

        const errorCount = issues.filter(i => i.level === 'error').length;
        const warnCount = issues.filter(i => i.level === 'warning').length;
        const infoCount = issues.filter(i => i.level === 'info').length;

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

    // 绑定 ARINC 429 工作台事件
    function bindArincEvents() {
        initDOMElements();

        if (btnMobileTabWords) btnMobileTabWords.addEventListener('click', () => setMobileArincView('words'));
        if (btnMobileTabDetail) btnMobileTabDetail.addEventListener('click', () => setMobileArincView('detail'));
        if (btnMobileBackWords) btnMobileBackWords.addEventListener('click', () => setMobileArincView('words'));

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
                if (typeof window.openProtocolPropsModal === 'function') window.openProtocolPropsModal();
            });
        }

        if (wordPeriodBadge) {
            wordPeriodBadge.addEventListener('click', () => {
                if (typeof window.openProtocolPropsModal === 'function') window.openProtocolPropsModal();
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

        if (arincWordSearch) {
            arincWordSearch.addEventListener('input', (e) => {
                wordSearchQuery = e.target.value.trim();
                renderArincWordsList();
            });
        }

        if (btnMoveWordUp) {
            btnMoveWordUp.onclick = (e) => {
                if (e) e.preventDefault();
                moveArincWord(-1);
            };
        }

        if (btnMoveWordDown) {
            btnMoveWordDown.onclick = (e) => {
                if (e) e.preventDefault();
                moveArincWord(1);
            };
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

        if (btnArincBack) {
            btnArincBack.addEventListener('click', () => {
                if (typeof window.switchToView === 'function') window.switchToView('protocol-view');
            });
        }

        if (btnArincNew) {
            btnArincNew.addEventListener('click', () => {
                if (typeof window.openCreate429Modal === 'function') window.openCreate429Modal();
            });
        }

        if (btnViewArincProps) {
            btnViewArincProps.addEventListener('click', () => {
                if (typeof window.openProtocolPropsModal === 'function') window.openProtocolPropsModal();
            });
        }

        if (arincProtocolSelect) {
            arincProtocolSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    loadArincProtocolIntoEditor(Number(e.target.value));
                }
            });
        }

        // 429 多数据包工具栏事件监听
        if (arincPacketSelect) {
            arincPacketSelect.addEventListener('change', (e) => {
                const newIdx = parseInt(e.target.value, 10);
                if (!isNaN(newIdx) && currentArincProtocol && currentArincProtocol.packets && currentArincProtocol.packets[newIdx]) {
                    currentArincPacketIndex = newIdx;
                    currentWordIndex = 0;
                    currentArincProtocol.words = getCurrentArincPacket().words;
                    updateArincPacketToolbar();
                    updateSourceFilterOptions();
                    renderArincWordsList();
                    renderSelectedWordInspector();
                }
            });
        }

        if (btnAddArincPacket) {
            btnAddArincPacket.addEventListener('click', addArincPacket);
        }

        if (btnDuplicateArincPacket) {
            btnDuplicateArincPacket.addEventListener('click', duplicateCurrentArincPacket);
        }

        if (btnDeleteArincPacket) {
            btnDeleteArincPacket.addEventListener('click', deleteCurrentArincPacket);
        }

        if (arincPacketDirection) {
            arincPacketDirection.addEventListener('change', (e) => {
                const pkt = getCurrentArincPacket();
                if (!pkt) return;
                const newDir = e.target.value === 'Rx' ? 'Rx' : 'Tx';
                pkt.direction = newDir;
                // 一包协议要么是发送要么是接收，绝不共存：包内标号字严格继承该方向
                if (pkt.words) {
                    pkt.words.forEach(w => {
                        w.direction = newDir;
                    });
                }
                if (!arincPacketPeriodItem) arincPacketPeriodItem = document.getElementById('arinc-packet-period-item');
                if (arincPacketPeriodItem) {
                    arincPacketPeriodItem.style.display = (newDir === 'Tx') ? 'flex' : 'none';
                }
                const wordDirBadge = document.getElementById('word-direction-badge');
                if (wordDirBadge) {
                    wordDirBadge.textContent = newDir === 'Tx' ? 'Tx (发)' : 'Rx (收)';
                    wordDirBadge.className = `dense-readonly-tag dense-dir-tag ${newDir === 'Tx' ? 'dir-tx' : 'dir-rx'}`;
                }
                const wordPeriodContainer = document.getElementById('word-period-container');
                if (wordPeriodContainer) {
                    wordPeriodContainer.style.display = (newDir === 'Tx') ? 'flex' : 'none';
                }
                updateArincPacketToolbar();
                renderArincWordsList();
            });
        }

        if (arincPacketPeriod) {
            arincPacketPeriod.addEventListener('input', (e) => {
                const pkt = getCurrentArincPacket();
                if (!pkt) return;
                pkt.period = Number(e.target.value) || 20;
                if (pkt.words) {
                    pkt.words.forEach(w => {
                        w.period = pkt.period;
                    });
                }
                updateArincPacketToolbar();
                const wordPeriodBadge = document.getElementById('word-period-badge');
                if (wordPeriodBadge) {
                    wordPeriodBadge.textContent = `${pkt.period}ms`;
                }
            });
        }

        if (arincPacketName) {
            arincPacketName.addEventListener('input', (e) => {
                const pkt = getCurrentArincPacket();
                if (!pkt) return;
                pkt.name = e.target.value.trim();
                if (arincPacketSelect && arincPacketSelect.options[currentArincPacketIndex]) {
                    const isRx = pkt.direction === 'Rx';
                    const pktPeriod = pkt.period !== undefined ? pkt.period : (currentArincProtocol ? currentArincProtocol.period : 20);
                    const periodText = isRx ? '' : ` ${pktPeriod}ms`;
                    arincPacketSelect.options[currentArincPacketIndex].textContent = `[${isRx ? 'Rx' : 'Tx'}${periodText}] ${pkt.name || '未命名数据包'} (${pkt.words ? pkt.words.length : 0}个字)`;
                }
            });
        }

        if (btnAddWord) {
            btnAddWord.addEventListener('click', addWord);
        }

        if (btnDuplicateWord) {
            btnDuplicateWord.addEventListener('click', () => {
                if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
                const cur = currentArincProtocol.words[currentWordIndex];
                const dup = JSON.parse(JSON.stringify(cur));

                const usedLabels = new Set(currentArincProtocol.words.map(w => (w.label || '').toString().padStart(3, '0')));
                const curOctalStr = (cur.label || '001').toString().padStart(3, '0');
                let curDecVal = parseInt(curOctalStr, 8);
                if (isNaN(curDecVal)) curDecVal = 1;

                let nextOctalStr = '';
                for (let dec = curDecVal + 1; dec <= 255; dec++) {
                    const octStr = dec.toString(8).padStart(3, '0');
                    if (!usedLabels.has(octStr)) {
                        nextOctalStr = octStr;
                        break;
                    }
                }
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

                const curPkt = getCurrentArincPacket();
                dup.direction = curPkt ? curPkt.direction : (cur.direction || 'Tx');
                dup.label = nextOctalStr;
                dup.name = cur.name || '数据字';
                dup.key = `word_${nextOctalStr}`;
                currentArincProtocol.words.splice(currentWordIndex + 1, 0, dup);
                currentWordIndex++;
                updateArincPacketToolbar();
                renderArincWordsList();
                renderSelectedWordInspector();
                if (window.innerWidth <= 768) {
                    setMobileArincView('detail');
                }
            });
        }

        if (btnDeleteWord) {
            btnDeleteWord.addEventListener('click', () => {
                if (!currentArincProtocol || !currentArincProtocol.words || currentArincProtocol.words.length === 0) return;
                if (confirm(`确定要删除标号字 [${currentArincProtocol.words[currentWordIndex].label} ${currentArincProtocol.words[currentWordIndex].name}] 吗？`)) {
                    currentArincProtocol.words.splice(currentWordIndex, 1);
                    if (currentWordIndex >= currentArincProtocol.words.length) {
                        currentWordIndex = Math.max(0, currentArincProtocol.words.length - 1);
                    }
                    updateSourceFilterOptions();
                    updateArincPacketToolbar();
                    renderArincWordsList();
                    renderSelectedWordInspector();
                }
            });
        }

        if (btnAddField) {
            btnAddField.addEventListener('click', addField);
        }

        if (btnSaveDict) {
            btnSaveDict.addEventListener('click', () => {
                if (!activeDictTarget) return;

                const newDict = {};
                const rows = dictItemsTbody ? dictItemsTbody.querySelectorAll('tr') : [];
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
                if (dictEditorModal) dictEditorModal.classList.remove('active');
            });
        }

        if (btnAddDictRow) {
            btnAddDictRow.addEventListener('click', () => addDictRow('', ''));
        }

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

        if (btnCopyHex) {
            btnCopyHex.addEventListener('click', () => {
                const hexText = simHexOutput ? simHexOutput.textContent : '';
                const showSuccess = () => {
                    const orig = btnCopyHex.innerHTML;
                    btnCopyHex.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i>';
                    setTimeout(() => btnCopyHex.innerHTML = orig, 1000);
                };
                copyTextToClipboard(hexText, showSuccess);
            });
        }

        if (btnSimDecode) {
            btnSimDecode.addEventListener('click', () => {
                const raw = simDecoderInput ? simDecoderInput.value.trim().replace(/0x/gi, '') : '';
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

        if (btnArincImport) {
            btnArincImport.addEventListener('click', () => arincFileInput && arincFileInput.click());
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
                    setTimeout(() => printWin.print(), 300);
                } else {
                    alert("弹窗被浏览器拦截，请允许本页面的弹出窗口以进行打印预览。");
                }
            });
        }

        if (btnDownloadHtmlSpec) {
            btnDownloadHtmlSpec.addEventListener('click', () => {
                if (!currentArincProtocol) return;
                const fullHtml = Arinc429Helper.generateHtmlSpec(currentArincProtocol);
                const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                downloadFile(fullHtml, `${safeName}_接口卡片.html`, 'text/html;charset=utf-8');
            });
        }

        if (btnArincExportMd) {
            btnArincExportMd.addEventListener('click', openExportMdModal);
        }

        if (btnArincExport) {
            btnArincExport.addEventListener('click', () => exportArincJson());
        }

        if (btnCopyMd) {
            btnCopyMd.addEventListener('click', () => {
                if (!currentArincProtocol || !exportMdCodeBlock) return;
                const text = exportMdCodeBlock.textContent;
                const showSuccess = () => {
                    const orig = btnCopyMd.innerHTML;
                    btnCopyMd.innerHTML = '<i class="fa-solid fa-check" style="color:#10b981;"></i> 已复制 Markdown!';
                    setTimeout(() => btnCopyMd.innerHTML = orig, 1500);
                };
                copyTextToClipboard(text, showSuccess);
            });
        }

        if (btnDownloadMd) {
            btnDownloadMd.addEventListener('click', () => {
                if (!currentArincProtocol || !exportMdCodeBlock) return;
                const text = exportMdCodeBlock.textContent;
                const safeName = (currentArincProtocol.name || 'arinc429_protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                downloadFile(text, `${safeName}_上位机协议规范.md`, 'text/markdown;charset=utf-8');
            });
        }

        if (btnDownloadJson) {
            btnDownloadJson.addEventListener('click', () => exportArincJson());
        }

        if (btnArincCheck) {
            btnArincCheck.addEventListener('click', runProtocolHealthCheck);
        }

        if (btnRecheckProtocol) {
            btnRecheckProtocol.addEventListener('click', runProtocolHealthCheck);
        }

        // 面板鼠标拖拽调宽
        if (workbenchResizer && arincWordsPanel) {
            let isResizing = false;
            let startX = 0;
            let startWidth = 340;

            const savedWordsPanelWidth = localStorage.getItem('protoview_words_panel_width');
            if (savedWordsPanelWidth) {
                const parsedW = parseInt(savedWordsPanelWidth, 10);
                if (parsedW >= 200 && parsedW <= 700) {
                    arincWordsPanel.style.width = `${parsedW}px`;
                }
            }

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
    }

    // 控制器对象定义
    const ArincController = {
        getCurrentProtocol: () => currentArincProtocol,
        setCurrentProtocol: (p) => { currentArincProtocol = p; },
        loadArincProtocolsForSelect,
        loadArincProtocolIntoEditor,
        saveCurrentArincProtocol,
        renderArincWordsList,
        renderSelectedWordInspector,
        renderFieldsTable,
        updateToolbarProtocolInfo,
        addWord,
        moveArincWord,
        addField,
        getCurrentArincPacket,
        updateArincPacketToolbar,
        addArincPacket,
        duplicateCurrentArincPacket,
        deleteCurrentArincPacket,
        openDictModal,
        openExportMdModal,
        exportArincJson,
        importArincJson,
        runProtocolHealthCheck,
        setMobileArincView,
        bindEvents: bindArincEvents
    };

    ProtoView.Controllers.Arinc = ArincController;
    global.ProtoView = ProtoView;

    // 向后兼容挂载到 window
    global.openDictModal = openDictModal;
    global.loadArincProtocolsForSelect = loadArincProtocolsForSelect;
    global.loadArincProtocolIntoEditor = loadArincProtocolIntoEditor;
    global.saveCurrentArincProtocol = saveCurrentArincProtocol;
    global.renderArincWordsList = renderArincWordsList;
    global.renderSelectedWordInspector = renderSelectedWordInspector;
    global.renderFieldsTable = renderFieldsTable;
    global.addWord = addWord;
    global.moveArincWord = moveArincWord;
    global.moveWord = moveArincWord;
    global.addField = addField;
    global.getCurrentArincPacket = getCurrentArincPacket;
    global.updateArincPacketToolbar = updateArincPacketToolbar;
    global.addArincPacket = addArincPacket;
    global.duplicateCurrentArincPacket = duplicateCurrentArincPacket;
    global.deleteCurrentArincPacket = deleteCurrentArincPacket;
    global.openExportMdModal = openExportMdModal;
    global.exportArincJson = exportArincJson;
    global.importArincJson = importArincJson;
    global.runProtocolHealthCheck = runProtocolHealthCheck;
    global.setMobileArincView = setMobileArincView;
    global.highlightAndScrollToField = highlightAndScrollToField;

    // DOM 就绪后自动绑定事件
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindArincEvents);
    } else {
        bindArincEvents();
    }

})(typeof window !== 'undefined' ? window : this);

