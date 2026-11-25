/**
 * @file can-ctrl.js
 * @brief ProtoView CAN 总线协议 (CAN 2.0A/B & CAN FD / DBC 矩阵) 工作台交互控制器
 * @author DeepMind Pair Programming
 * 
 * 核心架构规范：
 * 1. 一个 ID 占据一包 CAN 协议：协议按数据包 (Packet) 组织，每个包代表一个独立的 CAN ID (32位 AllBits 与 7个结构体位域字段)。
 * 2. 左侧为当前数据包的 8 字节清单 (Byte 0 ~ Byte 7)。
 * 3. 右侧上半部呈现当前包的 CAN ID 结构体 (CAN_FRAME_ID_OBJ 联合体 7 个位域)，
 *    下半部呈现当前选中的单字节字段卡片编辑器 (位域划分 0~7，严格满 8 位禁止新增与克隆)。
 * 4. 底部呈现 12 字节全包实时仿真与解码 (前 4 字节 CAN ID + 后 8 字节数据位)。
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    ProtoView.Controllers = ProtoView.Controllers || {};

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s){ return s || ''; };
    const showToast = ProtoView.showToast || global.showToast || function(){};
    const downloadFile = ProtoView.downloadFile || global.downloadFile || function(){};
    const copyTextToClipboard = ProtoView.copyTextToClipboard || global.copyTextToClipboard || function(){};

    // 状态管理
    let currentCanProtocol = null;
    let currentCanPacketIndex = 0; // 当前选中的 CAN 数据包索引 (每一个包对应一个 CAN ID)
    let currentCanByteIndex = 0;   // 当前选中的数据字节索引 (Byte 0 ~ Byte 7)
    let selectedSignalIndex = -1;  // 当前选中的信号卡片索引
    let canByteSearchQuery = '';   // 字节列表搜索关键词
    let simBytes = [0x00, 0x01, 0xF0, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // 12 字节全包 (前4字节 CAN ID + 后8字节数据)

    // 历史栈 (撤销/重做)
    const canHistoryStack = [];
    let canHistoryIndex = -1;
    const MAX_HISTORY = 30;

    function pushCanHistory(desc = '变更') {
        if (!currentCanProtocol) return;
        if (canHistoryIndex < canHistoryStack.length - 1) {
            canHistoryStack.splice(canHistoryIndex + 1);
        }
        canHistoryStack.push({
            data: JSON.parse(JSON.stringify(currentCanProtocol)),
            desc
        });
        if (canHistoryStack.length > MAX_HISTORY) {
            canHistoryStack.shift();
        }
        canHistoryIndex = canHistoryStack.length - 1;
        updateUndoRedoUI();
    }

    function performCanUndo() {
        if (canHistoryIndex > 0) {
            canHistoryIndex--;
            currentCanProtocol = JSON.parse(JSON.stringify(canHistoryStack[canHistoryIndex].data));
            renderAllCanUI();
            updateUndoRedoUI();
            showToast(`已撤销: ${canHistoryStack[canHistoryIndex + 1].desc}`, 'info');
        }
    }

    function performCanRedo() {
        if (canHistoryIndex < canHistoryStack.length - 1) {
            canHistoryIndex++;
            currentCanProtocol = JSON.parse(JSON.stringify(canHistoryStack[canHistoryIndex].data));
            renderAllCanUI();
            updateUndoRedoUI();
            showToast(`已重做: ${canHistoryStack[canHistoryIndex].desc}`, 'info');
        }
    }

    function updateUndoRedoUI() {
        const btnUndo = document.getElementById('btn-can-undo');
        const btnRedo = document.getElementById('btn-can-redo');
        if (btnUndo) btnUndo.disabled = (canHistoryIndex <= 0);
        if (btnRedo) btnRedo.disabled = (canHistoryIndex >= canHistoryStack.length - 1);
    }

    // 确保数据包包含完整的 7 个 CAN ID 结构体位域字段 (CAN_FRAME_ID_OBJ union)
    function ensurePacketIdFields(pkt) {
        if (!pkt) return null;
        if (!pkt.idFields || typeof pkt.idFields !== 'object') {
            const idInfo = ProtoView.CanHelper ? ProtoView.CanHelper.decodeCanIdObj(pkt.canId || '0x18F00100') : {
                selfDefine: 0, rci: 1, sourceId: 0, cmdType: 0xF0, msgType: 0, lcc: 6, rsvd: 0,
                allBits: 0x18F00100, hex: '0x18F00100', dec: '418382080', bytes: [0, 1, 0xF0, 0x18]
            };
            pkt.idFields = {
                selfDefine: idInfo.selfDefine,
                rci: idInfo.rci,
                sourceId: idInfo.sourceId,
                cmdType: idInfo.cmdType,
                msgType: idInfo.msgType,
                lcc: idInfo.lcc,
                rsvd: idInfo.rsvd,
                comments: (pkt.idFields && pkt.idFields.comments) || {},
                dicts: (pkt.idFields && pkt.idFields.dicts) || {}
            };
            pkt.canId = idInfo.hex;
        }
        return pkt.idFields;
    }

    // 同步生成兼顾兼容性的 frames 数组 (供外部 DBC 导出、規格书导出等消费)
    function syncPacketFrames(pkt) {
        if (!pkt) return;
        const allSignals = [];
        (pkt.bytes || []).forEach(b => {
            const bOff = Number(b.byteOffset) || 0;
            (b.signals || []).forEach(s => {
                const sCopy = JSON.parse(JSON.stringify(s));
                const localStart = Number(sCopy.startBit) || 0;
                sCopy.startBit = (bOff * 8) + localStart;
                sCopy.byteOffset = bOff;
                allSignals.push(sCopy);
            });
        });
        pkt.frames = [
            {
                id: (pkt.key || 'pkt') + '_frame',
                canId: pkt.canId || '0x18F00100',
                name: pkt.name || 'CAN 数据包',
                dlc: (pkt.bytes ? pkt.bytes.length : 8),
                direction: pkt.direction || 'Tx',
                period: pkt.period || 50,
                idFields: pkt.idFields,
                signals: allSignals
            }
        ];
        if (currentCanProtocol) {
            currentCanProtocol.frames = pkt.frames;
        }
    }

    // 获取当前活动数据包 (一个 ID 占据一包 CAN 协议，左侧为该包的 8 个数据字节)
    function getCurrentCanPacket() {
        if (!currentCanProtocol) return null;
        if (!currentCanProtocol.packets || !Array.isArray(currentCanProtocol.packets) || currentCanProtocol.packets.length === 0) {
            currentCanProtocol.packets = [
                {
                    key: 'pkt_1',
                    name: currentCanProtocol.name || '默认 CAN 数据包',
                    canId: '0x18F00100',
                    direction: currentCanProtocol.direction || 'Tx',
                    period: currentCanProtocol.period || 50,
                    dlc: 8,
                    bytes: []
                }
            ];
        }

        if (currentCanPacketIndex < 0 || currentCanPacketIndex >= currentCanProtocol.packets.length) {
            currentCanPacketIndex = 0;
        }
        const pkt = currentCanProtocol.packets[currentCanPacketIndex];

        // 规范化包属性
        pkt.canId = pkt.canId || '0x18F00100';
        pkt.dlc = pkt.dlc || 8;
        ensurePacketIdFields(pkt);

        // 规范化 8 个数据字节 (Byte 0 ~ Byte 7)
        if (!Array.isArray(pkt.bytes) || pkt.bytes.length === 0) {
            pkt.bytes = [];
            for (let b = 0; b < 8; b++) {
                pkt.bytes.push({
                    byteOffset: b,
                    name: `Byte ${b}`,
                    signals: []
                });
            }

            // 若历史数据存在于 pkt.frames 中，迁移至对应的 Byte 0 ~ 7
            if (pkt.frames && Array.isArray(pkt.frames) && pkt.frames[0] && Array.isArray(pkt.frames[0].signals)) {
                pkt.frames[0].signals.forEach(s => {
                    const rawStart = Number(s.startBit) || 0;
                    const bIdx = Math.min(7, Math.max(0, Math.floor(rawStart / 8)));
                    const localStart = rawStart % 8;
                    const sCopy = JSON.parse(JSON.stringify(s));
                    sCopy.startBit = Math.min(7, localStart);
                    sCopy.bitLength = Math.max(1, Math.min(8 - sCopy.startBit, parseInt(sCopy.bitLength, 10) || 1));
                    if (sCopy.dataType !== 'bool') sCopy.dataType = 'u8';
                    pkt.bytes[bIdx].signals.push(sCopy);
                });
            }
        }

        // 确保补齐至少 8 字节
        while (pkt.bytes.length < 8) {
            const b = pkt.bytes.length;
            pkt.bytes.push({
                byteOffset: b,
                name: `Byte ${b}`,
                signals: []
            });
        }

        pkt.fields = pkt.bytes;
        syncPacketFrames(pkt);
        return pkt;
    }

    // 获取当前活动数据字节 (0 ~ 7)
    function getCurrentCanByte() {
        const pkt = getCurrentCanPacket();
        if (!pkt || !pkt.bytes || pkt.bytes.length === 0) return null;
        if (currentCanByteIndex < 0 || currentCanByteIndex >= pkt.bytes.length) {
            currentCanByteIndex = 0;
        }
        return pkt.bytes[currentCanByteIndex];
    }

    // 向后兼容桩：获取当前报文 (指向当前包生成的单帧包装对象)
    function getCurrentFrame() {
        const pkt = getCurrentCanPacket();
        return (pkt && pkt.frames && pkt.frames[0]) ? pkt.frames[0] : null;
    }

    // 加载协议至 CAN 工作台
    async function loadCanProtocolIntoEditor(idOrProto) {
        let p = idOrProto;
        if (typeof idOrProto === 'number' || typeof idOrProto === 'string') {
            p = await (window.dbHelper ? window.dbHelper.getProtocol(idOrProto) : null);
        }
        if (!p) {
            showToast('未找到该 CAN 通信协议数据！', 'error');
            return;
        }

        currentCanProtocol = JSON.parse(JSON.stringify(p));

        // 规范结构初始化
        if (!currentCanProtocol.packets || !Array.isArray(currentCanProtocol.packets) || currentCanProtocol.packets.length === 0) {
            currentCanProtocol.packets = [
                {
                    key: 'pkt_1',
                    name: currentCanProtocol.name || '发动机状态与转速包',
                    canId: '0x18F00100',
                    direction: currentCanProtocol.direction || 'Tx',
                    period: currentCanProtocol.period || 50,
                    dlc: 8,
                    bytes: [
                        {
                            byteOffset: 0,
                            name: '转速低字节',
                            signals: [
                                {
                                    id: 'sig_1',
                                    name: '发动机实时转速低位',
                                    identifier: 'EngineSpeedLow',
                                    startBit: 0,
                                    bitLength: 8,
                                    byteOrder: 'intel',
                                    dataType: 'u8',
                                    factor: 1,
                                    offset: 0,
                                    unit: 'rpm',
                                    min: 0,
                                    max: 255,
                                    description: '转速低 8 位',
                                    dict: {},
                                    enumDict: []
                                }
                            ]
                        },
                        {
                            byteOffset: 1,
                            name: '转速高字节',
                            signals: [
                                {
                                    id: 'sig_2',
                                    name: '发动机实时转速高位',
                                    identifier: 'EngineSpeedHigh',
                                    startBit: 0,
                                    bitLength: 8,
                                    byteOrder: 'intel',
                                    dataType: 'u8',
                                    factor: 1,
                                    offset: 0,
                                    unit: 'rpm',
                                    min: 0,
                                    max: 255,
                                    description: '转速高 8 位',
                                    dict: {},
                                    enumDict: []
                                }
                            ]
                        },
                        {
                            byteOffset: 2,
                            name: '负荷与告警',
                            signals: [
                                {
                                    id: 'sig_3',
                                    name: '发动机负荷率',
                                    identifier: 'EngineLoad',
                                    startBit: 0,
                                    bitLength: 7,
                                    byteOrder: 'intel',
                                    dataType: 'u8',
                                    factor: 1,
                                    offset: 0,
                                    unit: '%',
                                    min: 0,
                                    max: 100,
                                    description: '发动机当前负荷百分比',
                                    dict: {},
                                    enumDict: []
                                },
                                {
                                    id: 'sig_4',
                                    name: '过热告警',
                                    identifier: 'OverheatAlarm',
                                    startBit: 7,
                                    bitLength: 1,
                                    byteOrder: 'intel',
                                    dataType: 'bool',
                                    factor: 1,
                                    offset: 0,
                                    unit: '',
                                    min: 0,
                                    max: 1,
                                    description: '0:正常, 1:过热告警',
                                    dict: { '0': '正常', '1': '告警' },
                                    enumDict: [
                                        { value: '0', label: '正常' },
                                        { value: '1', label: '高温告警' }
                                    ]
                                }
                            ]
                        },
                        { byteOffset: 3, name: 'Byte 3', signals: [] },
                        { byteOffset: 4, name: 'Byte 4', signals: [] },
                        { byteOffset: 5, name: 'Byte 5', signals: [] },
                        { byteOffset: 6, name: 'Byte 6', signals: [] },
                        { byteOffset: 7, name: 'Byte 7', signals: [] }
                    ]
                }
            ];
        }

        currentCanPacketIndex = 0;
        currentCanByteIndex = 0;
        selectedSignalIndex = -1;
        simBytes = [0x00, 0x01, 0xF0, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

        // 重置撤销历史
        canHistoryStack.length = 0;
        canHistoryIndex = -1;
        pushCanHistory('载入协议');

        renderAllCanUI();
        if (typeof window.switchToView === 'function') {
            window.switchToView('can-view');
        }
    }

    // 全量刷新界面
    function renderAllCanUI() {
        renderToolbarInfo();
        renderBytesList();
        renderByteDetail();
    }

    // 渲染顶栏协议基础信息与数据包工具栏
    function renderToolbarInfo() {
        if (!currentCanProtocol) return;
        const titleEl = document.getElementById('can-toolbar-proto-title');
        if (titleEl) {
            titleEl.innerHTML = `<i class="fa-solid fa-network-wired" style="color:#10b981;"></i> ${escapeHTML(currentCanProtocol.name || 'CAN 协议')}`;
            titleEl.title = (currentCanProtocol.product ? `所属产品: ${currentCanProtocol.product}\n` : '') + `协议名称: ${currentCanProtocol.name || 'CAN 协议'}\n标准规范: ${currentCanProtocol.canStandard || 'CAN2.0B'}\n波特率: ${(currentCanProtocol.baudRate || 500000) / 1000}kbps`;
        }

        const verPill = document.getElementById('can-ver-pill');
        if (verPill) {
            verPill.textContent = currentCanProtocol.version || 'v1.0';
        }

        const arcBadge = document.getElementById('can-archive-badge');
        if (arcBadge) {
            const isArchived = Boolean(currentCanProtocol.isArchived);
            arcBadge.textContent = isArchived ? '已归档' : '未归档';
            arcBadge.className = `proto-archive-badge ${isArchived ? 'is-archived' : 'not-archived'}`;
        }

        updateCanPacketToolbar();
    }

    function updateCanPacketToolbar() {
        if (!currentCanProtocol) return;
        const pkt = getCurrentCanPacket();
        const packets = currentCanProtocol.packets || [];
        const select = document.getElementById('can-packet-select') || document.getElementById('can-frame-select');
        if (select) {
            select.innerHTML = '';
            packets.forEach((p, idx) => {
                const opt = document.createElement('option');
                opt.value = idx.toString();
                const isRx = p.direction === 'Rx';
                const pktPeriod = p.period !== undefined ? p.period : (currentCanProtocol.period || 50);
                const periodText = isRx ? '' : ` ${pktPeriod}ms`;
                const canIdStr = p.canId || '0x18F00100';
                const pktName = (p.name && p.name.trim()) ? p.name.trim() : `数据包 ${idx + 1}`;
                opt.textContent = `[${canIdStr}] ${pktName}`;
                opt.title = `[${isRx ? '接收' : '发送'}${periodText}] CAN ID: ${canIdStr} - ${pktName}`;
                if (idx === currentCanPacketIndex) opt.selected = true;
                select.appendChild(opt);
            });
            if (packets.length === 0) {
                const opt = document.createElement('option');
                opt.value = '0';
                opt.textContent = '默认数据包';
                opt.selected = true;
                select.appendChild(opt);
            }
        }

        if (pkt) {
            const isTx = pkt.direction !== 'Rx';
            const dirSelect = document.getElementById('can-packet-direction') || document.getElementById('can-frame-direction');
            if (dirSelect) {
                dirSelect.value = isTx ? 'Tx' : 'Rx';
            }
            const periodItem = document.getElementById('can-packet-period-item') || document.getElementById('can-frame-period-item');
            if (periodItem) {
                periodItem.style.display = isTx ? 'inline-flex' : 'none';
            }
            const periodInput = document.getElementById('can-packet-period') || document.getElementById('can-frame-period');
            if (periodInput && document.activeElement !== periodInput) {
                periodInput.value = pkt.period !== undefined ? pkt.period : (currentCanProtocol.period || 50);
            }
        }
    }

    // 渲染左侧字节清单 (4 列：序号、字节名称、字段数、操作)
    function renderBytesList() {
        const listEl = document.getElementById('can-frames-list');
        const countBadge = document.getElementById('can-frames-count-badge');
        const mobileCount = document.getElementById('mobile-can-frames-count');
        if (!listEl || !currentCanProtocol) return;

        const pkt = getCurrentCanPacket();
        if (!pkt) return;
        const bytes = pkt.bytes || [];

        if (countBadge) countBadge.textContent = bytes.length;
        if (mobileCount) mobileCount.textContent = bytes.length;

        const q = (canByteSearchQuery || '').toLowerCase().trim();
        const filtered = bytes.map((b, idx) => ({ b, idx })).filter(({ b }) => {
            if (!q) return true;
            const matchName = b.name && b.name.toLowerCase().includes(q);
            const matchOffset = `byte ${b.byteOffset}`.includes(q) || `b${b.byteOffset}`.includes(q);
            const matchSig = b.signals && b.signals.some(s => 
                (s.name && s.name.toLowerCase().includes(q)) || 
                (s.identifier && s.identifier.toLowerCase().includes(q))
            );
            return matchName || matchOffset || matchSig;
        });

        if (filtered.length === 0) {
            listEl.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary); font-size:12px;">无匹配的字节</td></tr>`;
            return;
        }

        listEl.innerHTML = filtered.map(({ b, idx }) => {
            const isActive = idx === currentCanByteIndex;
            const off = Number(b.byteOffset !== undefined ? b.byteOffset : idx);
            const byteLabel = `Byte ${off}`;
            const byteName = (b.name && b.name.trim() && b.name.trim() !== byteLabel) ? b.name.trim() : '';
            const sigCount = (b.signals ? b.signals.length : 0);

            return `
                <tr class="dense-word-row ${isActive ? 'selected' : ''}" onclick="window.selectCanByte(${idx});" style="cursor:pointer;" title="Byte ${off}: ${escapeHTML(b.name || '')} (${sigCount}个字段)">
                    <td class="col-idx" style="text-align:center; width:36px; font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-secondary);">
                        #${idx + 1}
                    </td>
                    <td class="col-label" style="padding: 0 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <span class="octal-num" style="background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.28); border-radius: 3px; padding: 1px 4px; font-size: 11px;">${byteLabel}</span>
                        ${byteName ? `<span class="word-mini-name" title="${escapeHTML(byteName)}" style="font-weight:600; font-size:12px; color:var(--text-primary); margin-left:4px;">${escapeHTML(byteName)}</span>` : ''}
                    </td>
                    <td class="col-count" style="text-align:center; width:52px;">
                        <span class="dense-count-pill" style="min-width:22px; padding:1px 6px;">${sigCount}</span>
                    </td>
                    <td class="col-action" style="text-align:center; width:36px;" onclick="event.stopPropagation();">
                        <button type="button" class="word-row-del-btn" title="清空该字节位域字段 [Byte ${off}]" onclick="window.clearCanByte(${idx});">
                            <i class="fa-solid fa-broom"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // 选中指定字节索引
    function selectCanByte(idx) {
        const pkt = getCurrentCanPacket();
        if (!pkt || !pkt.bytes || idx < 0 || idx >= pkt.bytes.length) return;
        currentCanByteIndex = idx;
        selectedSignalIndex = -1;
        renderBytesList();
        renderByteDetail();

        const activeIdEl = document.getElementById('mobile-active-can-frame-id');
        if (activeIdEl) {
            activeIdEl.textContent = `Byte ${idx}`;
        }
    }

    // 渲染右栏：选中的单字节配置与当前包 CAN ID 结构
    function renderByteDetail() {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;
        const currentByte = getCurrentCanByte();
        if (!currentByte) return;

        const idFields = ensurePacketIdFields(pkt);
        const encodeRes = ProtoView.CanHelper ? ProtoView.CanHelper.encodeCanIdObj(idFields) : { allBits: 0x18F00100 };
        const allBits = (encodeRes && encodeRes.allBits !== undefined) ? encodeRes.allBits : ((encodeRes >>> 0) || 0x18F00100);
        const b0 = allBits & 0xFF;
        const b1 = (allBits >> 8) & 0xFF;
        const b2 = (allBits >> 16) & 0xFF;
        const b3 = (allBits >>> 24) & 0xFF;

        // 同步仿真前 4 字节为 CAN ID
        simBytes[0] = b0;
        simBytes[1] = b1;
        simBytes[2] = b2;
        simBytes[3] = b3;

        const hexStr = '0x' + (allBits >>> 0).toString(16).padStart(8, '0').toUpperCase();
        pkt.canId = hexStr;

        // 顶栏主 CAN ID 醒目卡片 (32 位 AllBits 十六进制)
        const topIdInput = document.getElementById('can-frame-id-input');
        if (topIdInput && document.activeElement !== topIdInput) {
            topIdInput.value = hexStr;
        }
        const idValEl = document.getElementById('can-frame-id-val');
        if (idValEl) idValEl.textContent = hexStr;

        // 数据包名称
        const nameInput = document.getElementById('can-frame-name-input');
        if (nameInput && document.activeElement !== nameInput) {
            nameInput.value = pkt.name || '';
        }

        // 计算当前字节内已分配的位数 (最多 8 位)
        const signals = currentByte.signals || [];
        const allocBits = signals.reduce((sum, s) => sum + (parseInt(s.bitLength || 1, 10) || 1), 0);

        // 渲染 Part 1: CAN ID 结构体定义面板 (7个位域字段严格按照 tagCAN_FRAME_ID_OBJ 排列)
        renderCanIdCompactPanel(pkt, idFields, allBits);

        // 渲染 Part 2: 当前选中字节的字段卡片列表
        renderCurrentByteSignals(currentByte, allocBits);

        // 渲染仿真底栏 (12 字节全包)
        renderSimulationBar();
    }

    // 渲染 Part 1: CAN ID 结构体定义面板
    function renderCanIdCompactPanel(pkt, idFields, allBits) {
        const hexStr = '0x' + (allBits >>> 0).toString(16).padStart(8, '0').toUpperCase();

        const hexDirectInput = document.getElementById('can-id-direct-hex');
        if (hexDirectInput && document.activeElement !== hexDirectInput) {
            hexDirectInput.value = hexStr;
        }

        // 7 个结构体字段数值填充
        const sSelf = document.getElementById('struct-val-selfDefine');
        const sRci = document.getElementById('struct-val-rci');
        const sSource = document.getElementById('struct-val-sourceId');
        const sCmd = document.getElementById('struct-val-cmdType');
        const sMsg = document.getElementById('struct-val-msgType');
        const sLcc = document.getElementById('struct-val-lcc');
        const sRsvd = document.getElementById('struct-val-rsvd');

        if (sSelf && document.activeElement !== sSelf) {
            sSelf.value = '0x' + (idFields.selfDefine || 0).toString(16).padStart(2, '0').toUpperCase();
        }
        if (sRci && document.activeElement !== sRci) {
            sRci.value = (idFields.rci !== undefined ? idFields.rci : 0).toString(10);
        }
        if (sSource && document.activeElement !== sSource) {
            sSource.value = (idFields.sourceId !== undefined ? idFields.sourceId : 0).toString(10);
        }
        if (sCmd && document.activeElement !== sCmd) {
            sCmd.value = '0x' + (idFields.cmdType || 0).toString(16).padStart(2, '0').toUpperCase();
        }
        if (sMsg && document.activeElement !== sMsg) {
            sMsg.value = (idFields.msgType !== undefined ? idFields.msgType : 0).toString(10);
        }
        if (sLcc && document.activeElement !== sLcc) {
            sLcc.value = (idFields.lcc !== undefined ? idFields.lcc : 0).toString(10);
        }
        if (sRsvd && document.activeElement !== sRsvd) {
            sRsvd.value = (idFields.rsvd !== undefined ? idFields.rsvd : 0).toString(10);
        }

        // 渲染各个结构体字段的状态字典释义
        const dicts = idFields.dicts || {};
        const comments = idFields.comments || {};
        const fieldKeys = ['selfDefine', 'rci', 'sourceId', 'cmdType', 'msgType', 'lcc', 'rsvd'];
        fieldKeys.forEach(k => {
            const previewEl = document.getElementById(`struct-dict-preview-${k}`);
            if (previewEl) {
                const curVal = idFields[k] !== undefined ? idFields[k] : 0;
                const fDict = dicts[k] || {};
                let desc = '';
                if (fDict[curVal] !== undefined) {
                    desc = fDict[curVal];
                } else if (fDict['0x' + curVal.toString(16).toUpperCase()] !== undefined) {
                    desc = fDict['0x' + curVal.toString(16).toUpperCase()];
                } else if (comments[k]) {
                    desc = comments[k];
                }
                previewEl.textContent = desc;
                previewEl.title = desc ? `字典释义: ${desc}` : '';
            }
        });
    }

    // 渲染 Part 2: 当前选中字节的字段卡片列表
    function renderCurrentByteSignals(currentByte, allocBits) {
        const titleEl = document.getElementById('can-active-byte-title');
        const nameInput = document.getElementById('can-byte-name-input');
        const allocPill = document.getElementById('can-active-byte-alloc');
        const container = document.getElementById('can-data-fields-list');

        if (titleEl) {
            titleEl.textContent = `Byte ${currentCanByteIndex} 字段列表`;
        }
        if (nameInput && document.activeElement !== nameInput) {
            nameInput.value = currentByte.name || '';
        }
        if (allocPill) {
            allocPill.textContent = `已占用: ${allocBits} / 8 Bits`;
            allocPill.style.color = allocBits >= 8 ? '#dc2626' : 'var(--text-secondary)';
        }
        if (!container) return;

        const signals = currentByte.signals || [];
        if (signals.length === 0) {
            container.innerHTML = `
                <div class="can-fields-empty-card" style="padding: 28px 16px; text-align: center; border: 1px dashed var(--border-color); border-radius: 6px; background: var(--bg-secondary);">
                    <i class="fa-solid fa-cube" style="font-size:24px; opacity:0.4; margin-bottom:8px; display:block; color:var(--accent-color);"></i>
                    <div style="font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:4px;">当前 Byte ${currentCanByteIndex} 暂无位域字段</div>
                    <div style="font-size:11.5px; color:var(--text-secondary); margin-bottom:12px;">单字节可包含 1 到 8 个位段 (如 bit0, bit0~bit1 等)</div>
                    <button type="button" class="dense-btn dense-btn-primary dense-btn-xs" onclick="window.addCanSignal && window.addCanSignal();">
                        <i class="fa-solid fa-plus"></i> 添加第 1 个字段
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = signals.map((sig, sIdx) => {
            const colorIdx = sIdx % 8;
            const startBit = Math.max(0, Math.min(7, sig.startBit !== undefined ? sig.startBit : 0));
            
            // 数据类型严格限定为 bool / u8
            let curType = sig.dataType || 'u8';
            if (curType !== 'bool') {
                curType = 'u8';
            }
            const maxBits = (curType === 'bool' ? 1 : Math.max(1, 8 - startBit));
            let bitLength = sig.bitLength !== undefined ? sig.bitLength : (curType === 'bool' ? 1 : maxBits);
            if (curType === 'bool') bitLength = 1;
            else bitLength = Math.max(1, Math.min(maxBits, bitLength));

            const endBit = startBit + bitLength - 1;
            const isActive = sIdx === selectedSignalIndex;

            // 状态字典摘要
            let dict = sig.dict || {};
            if (Object.keys(dict).length === 0 && Array.isArray(sig.enumDict)) {
                sig.enumDict.forEach(item => {
                    if (item.value !== undefined) dict[item.value] = item.label;
                    else if (item.val !== undefined) dict[item.val] = item.label;
                });
                sig.dict = dict;
            }
            const dictCount = Object.keys(dict).length;
            const dictLabel = dictCount > 0 ? `已配 ${dictCount} 项` : '未配置字典';

            return `
                <div class="can-signal-card ${isActive ? 'active' : ''}" data-signal-index="${sIdx}">
                    <div class="can-sig-header">
                        <div class="can-sig-header-left">
                            <span class="can-sig-badge sig-color-${colorIdx}">#${sIdx + 1}</span>
                            <i class="fa-solid fa-tag" style="font-size:11px; color:var(--accent-color); opacity:0.8;"></i>
                            <input type="text" class="can-sig-name-input" value="${escapeHTML(sig.name || '')}" placeholder="字段名称 (如: 转速低8位 / 故障标志)" onchange="window.updateCanSignalProp(${sIdx}, 'name', this.value);">
                            <button type="button" class="dense-dict-btn" onclick="window.openCanSignalDictModal(${sIdx});" title="配置状态枚举字典">
                                <i class="fa-solid fa-book-bookmark"></i> 状态字典 <span class="can-dict-tag-summary">${dictLabel}</span>
                            </button>
                            <span class="can-sig-span-pill" title="跨越的数据位范围：Byte ${currentCanByteIndex} · Bit ${startBit}${bitLength > 1 ? `~${endBit}` : ''} (${bitLength}b)">
                                Byte ${currentCanByteIndex} · Bit ${startBit}${bitLength > 1 ? `~${endBit}` : ''} (${bitLength}b)
                            </span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button type="button" class="dense-clone-btn" onclick="window.duplicateCanSignal(${sIdx});" title="克隆此字段并顺排起始位">
                                <i class="fa-solid fa-copy"></i> 克隆
                            </button>
                            <button type="button" class="dense-del-btn" onclick="window.deleteCanSignal(${sIdx});" title="删除此字段">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>

                    <!-- 属性流式网格：严格限定每字节最多 8 位，起始位最多为 7 -->
                    <div class="can-sig-props-flow field-card-props-flow">
                        <div class="field-card-cell can-cell" style="width:76px;">
                            <label class="field-card-label"><i class="fa-solid fa-cube"></i> 类型</label>
                            <select class="can-select field-card-select" onchange="window.updateCanSignalProp(${sIdx}, 'dataType', this.value);" title="数据类型 (bool / u8)">
                                <option value="bool" ${curType === 'bool' ? 'selected' : ''}>bool</option>
                                <option value="u8" ${curType === 'u8' ? 'selected' : ''}>u8</option>
                            </select>
                        </div>
                        <div class="field-card-cell can-cell" style="width:62px;">
                            <label class="field-card-label"><i class="fa-solid fa-play"></i> 起始位</label>
                            <div class="field-card-input-wrap">
                                <input type="number" class="can-input field-card-input" min="0" max="7" value="${startBit}" title="起始位 (0 ~ 7)" onchange="window.updateCanSignalProp(${sIdx}, 'startBit', this.value);">
                            </div>
                        </div>
                        <div class="field-card-cell can-cell" style="width:62px;">
                            <label class="field-card-label"><i class="fa-solid fa-ruler-horizontal"></i> 位长度</label>
                            <div class="field-card-input-wrap">
                                <input type="number" class="can-input field-card-input" min="1" max="${maxBits}" value="${bitLength}" ${curType === 'bool' ? 'disabled' : ''} title="位宽 (最多 ${maxBits} 位)" onchange="window.updateCanSignalProp(${sIdx}, 'bitLength', this.value);">
                            </div>
                        </div>
                        <div class="field-card-cell can-cell" style="width:110px;">
                            <label class="field-card-label"><i class="fa-solid fa-code"></i> DBC标识符</label>
                            <div class="field-card-input-wrap">
                                <input type="text" class="can-input field-card-input" value="${escapeHTML(sig.identifier || '')}" placeholder="英文标识符" title="DBC 唯一标识符" onchange="window.updateCanSignalProp(${sIdx}, 'identifier', this.value);">
                            </div>
                        </div>
                        <div class="field-card-cell can-cell" style="width:68px;">
                            <label class="field-card-label"><i class="fa-solid fa-scale-balanced"></i> 分辨率</label>
                            <div class="field-card-input-wrap">
                                <input type="number" step="any" class="can-input field-card-input" value="${sig.factor !== undefined ? sig.factor : 1}" title="转换系数 / 分辨率 (物理值 = 原始值 * 分辨率 + 偏移量)" onchange="window.updateCanSignalProp(${sIdx}, 'factor', this.value);">
                            </div>
                        </div>
                        <div class="field-card-cell can-cell" style="width:62px;">
                            <label class="field-card-label"><i class="fa-solid fa-plus-minus"></i> 偏移量</label>
                            <div class="field-card-input-wrap">
                                <input type="number" step="any" class="can-input field-card-input" value="${sig.offset !== undefined ? sig.offset : 0}" title="物理偏移量" onchange="window.updateCanSignalProp(${sIdx}, 'offset', this.value);">
                            </div>
                        </div>
                        <div class="field-card-cell can-cell" style="width:58px;">
                            <label class="field-card-label"><i class="fa-solid fa-tag"></i> 单位</label>
                            <div class="field-card-input-wrap">
                                <input type="text" class="can-input field-card-input" value="${escapeHTML(sig.unit || '')}" placeholder="如 rpm" title="工程物理量单位" onchange="window.updateCanSignalProp(${sIdx}, 'unit', this.value);">
                            </div>
                        </div>
                        <div class="field-card-cell can-cell flex-1" style="min-width:130px;">
                            <label class="field-card-label"><i class="fa-solid fa-comment-dots"></i> 描述说明</label>
                            <div class="field-card-input-wrap">
                                <input type="text" class="can-input field-card-input" value="${escapeHTML(sig.description || '')}" placeholder="工程功能释义..." title="信号功能说明" onchange="window.updateCanSignalProp(${sIdx}, 'description', this.value);">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 用户在右侧修改当前字节的别名/备注
    function updateCanByteName(newName) {
        const currentByte = getCurrentCanByte();
        if (!currentByte) return;
        currentByte.name = (newName || '').trim();
        pushCanHistory('修改字节名称');
        renderBytesList();
    }

    // 用户直接输入整帧 Hex ID (如 0x18F00100)
    function updateCanIdFromFullHex(hexStr) {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;

        let clean = (hexStr || '').trim();
        let num = 0;
        if (clean.toLowerCase().startsWith('0x')) {
            num = parseInt(clean, 16) || 0;
        } else if (/^[0-9a-fA-F]+$/.test(clean)) {
            num = parseInt(clean, 16) || 0;
        } else {
            num = parseInt(clean, 10) || 0;
        }
        num = (num >>> 0);

        const decoded = ProtoView.CanHelper ? ProtoView.CanHelper.decodeCanIdObj(num) : null;
        if (!decoded) return;

        const idFields = ensurePacketIdFields(pkt);
        idFields.selfDefine = decoded.selfDefine;
        idFields.rci = decoded.rci;
        idFields.sourceId = decoded.sourceId;
        idFields.cmdType = decoded.cmdType;
        idFields.msgType = decoded.msgType;
        idFields.lcc = decoded.lcc;
        idFields.rsvd = decoded.rsvd;

        pkt.canId = decoded.hex;
        simBytes[0] = decoded.bytes[0];
        simBytes[1] = decoded.bytes[1];
        simBytes[2] = decoded.bytes[2];
        simBytes[3] = decoded.bytes[3];

        pushCanHistory('修改 CAN ID');
        renderToolbarInfo();
        renderByteDetail();
    }

    // 用户修改 7 个位域之一的数值 (按照厂标 tagCAN_FRAME_ID_OBJ 联合体位域规则)
    function updateCanIdFieldVal(fieldKey, valStr) {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;

        const idFields = ensurePacketIdFields(pkt);
        const fMeta = ProtoView.CanHelper ? ProtoView.CanHelper.CAN_ID_FIELDS.find(item => item.key === fieldKey) : null;
        if (!fMeta) return;

        let clean = (valStr || '').trim();
        let num;
        if (clean.toLowerCase().startsWith('0x')) {
            num = parseInt(clean, 16);
        } else if (/^[0-9a-fA-F]+$/.test(clean) && (fMeta.isHex || /[a-fA-F]/.test(clean))) {
            num = parseInt(clean, 16);
        } else {
            num = parseInt(clean, 10);
        }
        if (isNaN(num)) num = 0;
        const maxVal = fMeta.max !== undefined ? fMeta.max : fMeta.mask;
        num = Math.max(0, Math.min(maxVal, num));

        idFields[fieldKey] = num;
        const encodeRes = ProtoView.CanHelper ? ProtoView.CanHelper.encodeCanIdObj(idFields) : null;
        const newAllBits = encodeRes ? encodeRes.allBits : 0;
        const decoded = ProtoView.CanHelper ? ProtoView.CanHelper.decodeCanIdObj(newAllBits) : null;

        if (decoded) {
            pkt.canId = decoded.hex;
            simBytes[0] = decoded.bytes[0];
            simBytes[1] = decoded.bytes[1];
            simBytes[2] = decoded.bytes[2];
            simBytes[3] = decoded.bytes[3];
        }

        pushCanHistory(`修改 ID 字段 ${fMeta.name}`);
        renderToolbarInfo();
        renderByteDetail();
    }

    // 用户修改 7 个位域之一的备注说明
    function updateCanIdFieldComment(fieldKey, comment) {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;

        const idFields = ensurePacketIdFields(pkt);
        if (!idFields.comments) idFields.comments = {};
        idFields.comments[fieldKey] = (comment || '').trim();
        pushCanHistory('修改 ID 位域说明');
    }

    // 修改当前字节内某个信号的属性 (严格限定每字节最多8位，起始位最多为7)
    function updateCanSignalProp(sigIndex, propKey, val) {
        const currentByte = getCurrentCanByte();
        if (!currentByte || !currentByte.signals || !currentByte.signals[sigIndex]) return;

        const sig = currentByte.signals[sigIndex];
        const curStart = Math.max(0, Math.min(7, sig.startBit !== undefined ? sig.startBit : 0));

        if (propKey === 'startBit') {
            const num = Math.max(0, Math.min(7, parseInt(val, 10) || 0));
            sig.startBit = num;
            const maxLen = (sig.dataType === 'bool' ? 1 : (8 - num));
            sig.bitLength = Math.max(1, Math.min(maxLen, sig.bitLength || 1));
        } else if (propKey === 'bitLength') {
            const num = parseInt(val, 10) || 1;
            const maxLen = (sig.dataType === 'bool' ? 1 : Math.max(1, 8 - curStart));
            sig.bitLength = Math.max(1, Math.min(maxLen, num));
        } else if (propKey === 'dataType') {
            sig.dataType = (val === 'bool') ? 'bool' : 'u8';
            if (val === 'bool') {
                sig.bitLength = 1;
            } else {
                const maxLen = Math.max(1, 8 - curStart);
                sig.bitLength = Math.max(1, Math.min(maxLen, sig.bitLength || 8));
            }
        } else if (propKey === 'factor' || propKey === 'offset') {
            sig[propKey] = parseFloat(val) || 0;
        } else {
            sig[propKey] = val;
        }

        if (propKey === 'name' && !sig.identifier) {
            sig.identifier = val.replace(/[^a-zA-Z0-9_]/g, '_');
        }

        const pkt = getCurrentCanPacket();
        syncPacketFrames(pkt);
        pushCanHistory(`修改字段 ${propKey}`);
        renderByteDetail();
    }

    // 为当前字节添加新数据位字段 (严格限定每字节最多8位，起始位最多为7)
    function addCanSignal() {
        const currentByte = getCurrentCanByte();
        if (!currentByte) return;
        currentByte.signals = currentByte.signals || [];

        // 检查当前字节是否已占满 8 位
        const allocBits = currentByte.signals.reduce((sum, s) => sum + (parseInt(s.bitLength || 1, 10) || 1), 0);
        if (allocBits >= 8) {
            showToast(`当前字节 (Byte ${currentCanByteIndex}) 8 个 Bit 已全部占满，无法继续添加字段！`, 'warning');
            return;
        }

        const newStartBit = Math.min(7, allocBits);
        const remainBits = 8 - newStartBit;
        const defaultLen = remainBits === 1 ? 1 : remainBits;

        const newSig = {
            id: `sig_${Date.now()}`,
            name: `字段_${currentByte.signals.length + 1}`,
            identifier: `Field_${currentCanByteIndex}_${currentByte.signals.length + 1}`,
            startBit: newStartBit,
            bitLength: defaultLen,
            byteOrder: 'intel',
            dataType: defaultLen === 1 ? 'bool' : 'u8',
            factor: 1,
            offset: 0,
            unit: '',
            min: 0,
            max: defaultLen === 1 ? 1 : 255,
            description: '',
            dict: {},
            enumDict: []
        };

        currentByte.signals.push(newSig);
        selectedSignalIndex = currentByte.signals.length - 1;

        const pkt = getCurrentCanPacket();
        syncPacketFrames(pkt);
        pushCanHistory('添加数据字段');
        renderBytesList();
        renderByteDetail();
        showToast(`已在 Byte ${currentCanByteIndex} 添加新字段「${newSig.name}」(起始: bit${newStartBit})`, 'success');
    }

    // 克隆数据位字段 (严格限定每字节最多8位，满8位禁止克隆)
    function duplicateCanSignal(sigIndex) {
        const currentByte = getCurrentCanByte();
        if (!currentByte || !currentByte.signals || !currentByte.signals[sigIndex]) return;

        const allocBits = currentByte.signals.reduce((sum, s) => sum + (parseInt(s.bitLength || 1, 10) || 1), 0);
        if (allocBits >= 8) {
            showToast(`当前字节已占满 8 位 (bit0~bit7)，无法继续克隆字段！`, 'warning');
            return;
        }

        const src = currentByte.signals[sigIndex];
        const srcStart = Math.max(0, Math.min(7, src.startBit !== undefined ? src.startBit : 0));
        const srcLen = parseInt(src.bitLength, 10) || 1;
        const nextStart = srcStart + srcLen;

        if (nextStart >= 8) {
            showToast(`当前字节剩余空间不足 (起始位最多为 7)，无法继续克隆！`, 'warning');
            return;
        }

        const copy = JSON.parse(JSON.stringify(src));
        copy.id = `sig_${Date.now()}`;
        copy.name = `${copy.name}_副本`;
        copy.identifier = `${copy.identifier}_Copy`;
        copy.startBit = nextStart;
        const remain = 8 - nextStart;
        if (copy.dataType === 'bool') {
            copy.bitLength = 1;
        } else {
            copy.bitLength = Math.max(1, Math.min(parseInt(copy.bitLength, 10) || 1, remain));
        }

        currentByte.signals.splice(sigIndex + 1, 0, copy);
        selectedSignalIndex = sigIndex + 1;

        const pkt = getCurrentCanPacket();
        syncPacketFrames(pkt);
        pushCanHistory('克隆数据字段');
        renderBytesList();
        renderByteDetail();
        showToast(`已在 Byte ${currentCanByteIndex} 克隆字段「${copy.name}」(起始: bit${nextStart})`, 'success');
    }

    // 删除数据位字段
    function deleteCanSignal(sigIndex) {
        const currentByte = getCurrentCanByte();
        if (!currentByte || !currentByte.signals || !currentByte.signals[sigIndex]) return;

        const name = currentByte.signals[sigIndex].name || '该字段';
        currentByte.signals.splice(sigIndex, 1);
        selectedSignalIndex = -1;

        const pkt = getCurrentCanPacket();
        syncPacketFrames(pkt);
        pushCanHistory('删除数据字段');
        renderBytesList();
        renderByteDetail();
        showToast(`已删除数据字段「${name}」`, 'info');
    }

    // 清空指定字节中的所有字段
    function clearCanByte(byteIdx) {
        const pkt = getCurrentCanPacket();
        if (!pkt || !pkt.bytes || !pkt.bytes[byteIdx]) return;
        const b = pkt.bytes[byteIdx];
        if (!b.signals || b.signals.length === 0) {
            showToast(`Byte ${byteIdx} 本身已无字段`, 'info');
            return;
        }
        b.signals = [];
        syncPacketFrames(pkt);
        pushCanHistory(`清空 Byte ${byteIdx}`);
        renderBytesList();
        renderByteDetail();
        showToast(`已清空 Byte ${byteIdx} 的所有字段`, 'info');
    }

    // 添加新字节 (最多 8 字节，标准 CAN 2.0 为 8 字节)
    function addCanByte() {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;
        pkt.bytes = pkt.bytes || [];
        if (pkt.bytes.length >= 8) {
            showToast('标准 CAN 2.0 数据载荷最大为 8 字节 (Byte 0 ~ Byte 7)！', 'info');
            return;
        }
        const nextIdx = pkt.bytes.length;
        pkt.bytes.push({
            byteOffset: nextIdx,
            name: `Byte ${nextIdx}`,
            signals: []
        });
        currentCanByteIndex = nextIdx;
        syncPacketFrames(pkt);
        pushCanHistory('添加字节');
        renderBytesList();
        renderByteDetail();
        showToast(`已添加 Byte ${nextIdx}`, 'success');
    }

    // 渲染 12 字节全包实时仿真底栏与物理值即时解码 (前4字节 CAN ID + 后8字节数据载荷)
    function renderSimulationBar() {
        const container = document.getElementById('can-sim-bytes-row') || document.getElementById('can-sim-bytes-container');
        const decodeContainer = document.getElementById('can-sim-decode-flow') || document.getElementById('can-sim-decode-container');
        if (!container || !decodeContainer) return;

        const pkt = getCurrentCanPacket();
        if (!pkt) return;

        while (simBytes.length < 12) simBytes.push(0);

        // 渲染 12 个字节 Hex 块 (B0~B3: ID, B4~B11: 数据)
        let bytesHtml = '';
        for (let i = 0; i < 12; i++) {
            const byteVal = simBytes[i] || 0;
            const hex = byteVal.toString(16).padStart(2, '0').toUpperCase();
            const isId = i < 4;
            const label = isId ? `ID-B${i}` : `D-B${i - 4}`;
            const title = isId 
                ? `Byte ${i}: 固定 CAN ID 位 (全包第 ${i} 字节)` 
                : `Byte ${i}: 数据位载荷 (全包第 ${i} 字节，数据段 Byte ${i - 4})`;

            bytesHtml += `
                <div class="can-sim-byte-chip ${isId ? 'id-byte' : 'data-byte'}" title="${title}">
                    <span class="csb-idx">${label}</span>
                    <input type="text" class="csb-input mono-input" 
                           maxlength="2" 
                           value="${hex}" 
                           title="修改十六进制值并实时联动解析"
                           onchange="window.updateCanSimByte(${i}, this.value);">
                </div>
            `;
        }
        container.innerHTML = bytesHtml;

        // 实时解码全包信息：CAN ID 位域 + 数据位字段
        const allBits = ProtoView.CanHelper ? ProtoView.CanHelper.encodeCanIdFromBytes(simBytes[0], simBytes[1], simBytes[2], simBytes[3]) : 0;
        const idObj = ProtoView.CanHelper ? ProtoView.CanHelper.decodeCanIdObj(allBits) : null;

        let decodeHtml = '';

        // 1. CAN ID 7 个位域解析标签
        if (idObj) {
            decodeHtml += `
                <div class="can-decode-item id-item" title="固定 CAN ID: 0x${idObj.hex}">
                    <span class="can-decode-sig-badge" style="background:#059669; color:#fff;">CAN ID</span>
                    <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700; color:#059669;">${idObj.hex}</span>
                </div>
                <div class="can-decode-item id-item" title="指令类型 (CmdType)">
                    <span style="font-size:11px; color:var(--text-secondary);">CmdType:</span>
                    <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700;">0x${idObj.cmdType.toString(16).toUpperCase()}</span>
                </div>
                <div class="can-decode-item id-item" title="源节点 (SourceId)">
                    <span style="font-size:11px; color:var(--text-secondary);">SourceId:</span>
                    <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700;">${idObj.sourceId}</span>
                </div>
                <div class="can-decode-item id-item" title="RCI (2b)">
                    <span style="font-size:11px; color:var(--text-secondary);">RCI:</span>
                    <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700;">${idObj.rci}</span>
                </div>
                <div class="can-decode-item id-item" title="消息类型 (MsgType)">
                    <span style="font-size:11px; color:var(--text-secondary);">MsgType:</span>
                    <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700;">${idObj.msgType}</span>
                </div>
                <div class="can-decode-item id-item" title="LCC (3b)">
                    <span style="font-size:11px; color:var(--text-secondary);">LCC:</span>
                    <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700;">${idObj.lcc}</span>
                </div>
            `;
        }

        // 2. 数据载荷 (后 8 字节: simBytes[4..11]) 字段物理值解码
        const dataBytes = simBytes.slice(4, 12);
        const allSignals = [];
        (pkt.bytes || []).forEach(b => {
            (b.signals || []).forEach(s => {
                allSignals.push({ ...s, byteOffset: b.byteOffset });
            });
        });

        if (allSignals.length === 0) {
            decodeHtml += `<span style="font-size:11px; color:var(--text-secondary); font-style:italic;">暂无数据字段定义</span>`;
        } else {
            allSignals.forEach((sig, sIdx) => {
                const colorIdx = sIdx % 8;
                const bVal = dataBytes[sig.byteOffset] || 0;
                const mask = ((1 << (sig.bitLength || 1)) - 1);
                const rawVal = (bVal >> (sig.startBit || 0)) & mask;
                const physVal = (rawVal * (sig.factor !== undefined ? sig.factor : 1)) + (sig.offset || 0);
                const unit = sig.unit ? ` ${escapeHTML(sig.unit)}` : '';
                let displayVal = `${physVal}${unit}`;

                // 检查字典映射
                const dict = sig.dict || {};
                if (dict[rawVal] !== undefined) {
                    displayVal = `${physVal} (${dict[rawVal]})`;
                } else if (Array.isArray(sig.enumDict) && sig.enumDict.length > 0) {
                    const match = sig.enumDict.find(item => String(item.value) === String(rawVal) || String(item.val) === String(rawVal));
                    if (match) displayVal = `${physVal} (${match.label})`;
                }

                decodeHtml += `
                    <div class="can-decode-item" title="Byte ${sig.byteOffset} · ${escapeHTML(sig.name)}: 物理值 = Raw(${rawVal}) * ${sig.factor||1} + ${sig.offset||0}">
                        <span class="can-decode-sig-badge sig-color-${colorIdx}">B${sig.byteOffset}</span>
                        <span style="font-weight:600; font-size:11.5px;">${escapeHTML(sig.name)}:</span>
                        <span class="cdi-val" style="font-family:'JetBrains Mono',monospace; font-weight:700; color:var(--accent-color); font-size:12px;">${escapeHTML(displayVal)}</span>
                    </div>
                `;
            });
        }

        decodeContainer.innerHTML = decodeHtml;
    }

    // 用户在 12 字节仿真底栏修改单字节十六进制
    function updateCanSimByte(byteIdx, hexVal) {
        let clean = (hexVal || '').replace(/[^0-9a-fA-F]/g, '');
        if (!clean) clean = '00';
        const val = parseInt(clean, 16) & 0xFF;
        simBytes[byteIdx] = val;

        const pkt = getCurrentCanPacket();
        if (pkt && byteIdx < 4) {
            // 前 4 字节修改自动同步到 CAN ID 位域
            const allBits = ProtoView.CanHelper ? ProtoView.CanHelper.encodeCanIdFromBytes(simBytes[0], simBytes[1], simBytes[2], simBytes[3]) : 0;
            const decoded = ProtoView.CanHelper ? ProtoView.CanHelper.decodeCanIdObj(allBits) : null;
            if (decoded) {
                const idFields = ensurePacketIdFields(pkt);
                idFields.selfDefine = decoded.selfDefine;
                idFields.rci = decoded.rci;
                idFields.sourceId = decoded.sourceId;
                idFields.cmdType = decoded.cmdType;
                idFields.msgType = decoded.msgType;
                idFields.lcc = decoded.lcc;
                idFields.rsvd = decoded.rsvd;
                pkt.canId = decoded.hex;

                const topIdInput = document.getElementById('can-frame-id-input');
                if (topIdInput) topIdInput.value = decoded.hex;
                const idValEl = document.getElementById('can-frame-id-val');
                if (idValEl) idValEl.textContent = decoded.hex;

                renderCanIdCompactPanel(pkt, idFields, decoded.allBits);
            }
        }

        renderSimulationBar();
    }

    // 随机生成 12 字节测试载荷数据
    function randomizeCanSim() {
        for (let i = 0; i < 12; i++) {
            simBytes[i] = Math.floor(Math.random() * 256);
        }
        const pkt = getCurrentCanPacket();
        if (pkt) {
            const allBits = ProtoView.CanHelper ? ProtoView.CanHelper.encodeCanIdFromBytes(simBytes[0], simBytes[1], simBytes[2], simBytes[3]) : 0;
            const decoded = ProtoView.CanHelper ? ProtoView.CanHelper.decodeCanIdObj(allBits) : null;
            if (decoded) {
                const idFields = ensurePacketIdFields(pkt);
                idFields.selfDefine = decoded.selfDefine;
                idFields.rci = decoded.rci;
                idFields.sourceId = decoded.sourceId;
                idFields.cmdType = decoded.cmdType;
                idFields.msgType = decoded.msgType;
                idFields.lcc = decoded.lcc;
                idFields.rsvd = decoded.rsvd;
                pkt.canId = decoded.hex;
            }
        }
        renderByteDetail();
        showToast('已随机生成 12 字节全包测试数据', 'info');
    }

    // 重置 12 字节模拟载荷 (CAN ID 恢复预设，数据位全置 0)
    function resetCanSim() {
        const pkt = getCurrentCanPacket();
        if (pkt) {
            const idFields = ensurePacketIdFields(pkt);
            const allBits = ProtoView.CanHelper ? ProtoView.CanHelper.encodeCanIdObj(idFields) : 0x18F00100;
            simBytes[0] = allBits & 0xFF;
            simBytes[1] = (allBits >> 8) & 0xFF;
            simBytes[2] = (allBits >> 16) & 0xFF;
            simBytes[3] = (allBits >>> 24) & 0xFF;
        } else {
            simBytes[0] = 0; simBytes[1] = 0; simBytes[2] = 0; simBytes[3] = 0;
        }
        for (let i = 4; i < 12; i++) {
            simBytes[i] = 0;
        }
        renderSimulationBar();
        showToast('已重置 12 字节全包数据', 'info');
    }

    // 复制 12 字节十六进制
    function copyCanHex() {
        while (simBytes.length < 12) simBytes.push(0);
        const hexStr = simBytes.map(b => (b || 0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
        copyTextToClipboard(hexStr);
        showToast(`已复制 12 字节 Hex: ${hexStr}`, 'info');
    }

    // 通用状态字典弹窗逻辑 (复用系统通用的 #dict-editor-modal)
    function openUniversalDictModal(dictObj, title, onSaveCallback) {
        const modal = document.getElementById('dict-editor-modal');
        const targetName = document.getElementById('dict-field-target-name');
        const tbody = document.getElementById('dict-items-tbody');
        const btnSave = document.getElementById('btn-save-dict');
        const btnAddRow = document.getElementById('btn-add-dict-row');
        if (!modal || !tbody) return;

        if (targetName) targetName.textContent = title;
        tbody.innerHTML = '';

        const entries = Object.entries(dictObj || {});
        if (entries.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td><input type="text" class="dict-item-key" value="0" placeholder="原始值 (如 0)"></td>
                    <td><input type="text" class="dict-item-val" value="" placeholder="含义描述 (如 正常)"></td>
                    <td style="text-align:center;"><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();" style="padding:0.2rem 0.4rem;"><i class="fa-solid fa-xmark"></i></button></td>
                </tr>
            `;
        } else {
            entries.forEach(([k, v]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="text" class="dict-item-key" value="${escapeHTML(k)}" placeholder="原始值 (如 0)"></td>
                    <td><input type="text" class="dict-item-val" value="${escapeHTML(v)}" placeholder="含义描述 (如 正常)"></td>
                    <td style="text-align:center;"><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();" style="padding:0.2rem 0.4rem;"><i class="fa-solid fa-xmark"></i></button></td>
                `;
                tbody.appendChild(tr);
            });
        }

        if (btnSave) {
            btnSave.onclick = () => {
                const newDict = {};
                tbody.querySelectorAll('tr').forEach(r => {
                    const k = r.querySelector('.dict-item-key').value.trim();
                    const v = r.querySelector('.dict-item-val').value.trim();
                    if (k !== '') newDict[k] = v;
                });
                if (onSaveCallback) onSaveCallback(newDict);
                modal.classList.remove('active');
            };
        }

        if (btnAddRow) {
            btnAddRow.onclick = () => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="text" class="dict-item-key" value="" placeholder="原始值 (如 1)"></td>
                    <td><input type="text" class="dict-item-val" value="" placeholder="含义描述 (如 故障)"></td>
                    <td style="text-align:center;"><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();" style="padding:0.2rem 0.4rem;"><i class="fa-solid fa-xmark"></i></button></td>
                `;
                tbody.appendChild(tr);
            };
        }

        modal.classList.add('active');
    }

    // 打开 CAN ID 某位域的字典编辑弹窗
    function openCanIdFieldDictModal(fieldKey) {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;
        const idFields = ensurePacketIdFields(pkt);
        if (!idFields.dicts) idFields.dicts = {};
        const fMeta = ProtoView.CanHelper ? ProtoView.CanHelper.CAN_ID_FIELDS.find(item => item.key === fieldKey) : null;
        const title = fMeta ? fMeta.name : fieldKey;

        openUniversalDictModal(idFields.dicts[fieldKey] || {}, `CAN ID 位域 [${title}]`, (newDict) => {
            idFields.dicts[fieldKey] = newDict;
            pushCanHistory(`修改 ID 位域 [${title}] 字典`);
            renderByteDetail();
            showToast(`已更新「${title}」状态字典`, 'success');
        });
    }

    // 打开数据位字段的字典编辑弹窗
    function openCanSignalDictModal(sigIndex) {
        const currentByte = getCurrentCanByte();
        if (!currentByte || !currentByte.signals || !currentByte.signals[sigIndex]) return;
        const sig = currentByte.signals[sigIndex];
        let dict = sig.dict || {};
        if (Object.keys(dict).length === 0 && Array.isArray(sig.enumDict)) {
            sig.enumDict.forEach(item => {
                if (item.value !== undefined) dict[item.value] = item.label;
                else if (item.val !== undefined) dict[item.val] = item.label;
            });
        }

        openUniversalDictModal(dict, `数据位字段 [${sig.name || '未命名字段'}]`, (newDict) => {
            sig.dict = newDict;
            sig.enumDict = Object.entries(newDict).map(([value, label]) => ({ value, label }));
            const pkt = getCurrentCanPacket();
            syncPacketFrames(pkt);
            pushCanHistory(`修改数据字段 [${sig.name}] 字典`);
            renderByteDetail();
            showToast(`已更新「${sig.name}」状态字典`, 'success');
        });
    }

    // 数据包选择与管理 (一个 ID 占据一包 CAN 协议)
    function selectCanPacket(idx) {
        if (!currentCanProtocol || !currentCanProtocol.packets) return;
        if (!currentCanProtocol.packets[idx]) return;
        currentCanPacketIndex = idx;
        currentCanByteIndex = 0;
        selectedSignalIndex = -1;
        renderAllCanUI();
    }

    // 添加新 CAN 数据包 (分配新 CAN ID)
    function addCanPacket() {
        if (!currentCanProtocol) return;
        if (!currentCanProtocol.packets) {
            getCurrentCanPacket();
        }
        const nextNum = currentCanProtocol.packets.length + 1;
        const newCanId = '0x' + (0x18F00100 + nextNum * 0x10).toString(16).toUpperCase();
        const newPkt = {
            key: `pkt_${Date.now()}`,
            name: `CAN数据包_${nextNum}`,
            canId: newCanId,
            direction: 'Tx',
            period: 50,
            dlc: 8,
            bytes: []
        };
        for (let b = 0; b < 8; b++) {
            newPkt.bytes.push({
                byteOffset: b,
                name: `Byte ${b}`,
                signals: []
            });
        }

        currentCanProtocol.packets.push(newPkt);
        currentCanPacketIndex = currentCanProtocol.packets.length - 1;
        currentCanByteIndex = 0;
        selectedSignalIndex = -1;
        pushCanHistory('添加数据包');
        renderAllCanUI();
        showToast(`已创建 CAN 数据包「${newPkt.name}」(ID: ${newCanId})`, 'success');
    }

    // 重命名当前数据包 (采用系统统一定制输入弹窗，取代浏览器原生 prompt)
    async function renameCurrentCanPacket() {
        const pkt = getCurrentCanPacket();
        if (!pkt) return;
        const oldName = pkt.name || `CAN数据包_${currentCanPacketIndex + 1}`;
        const newName = await (ProtoView.showPrompt ? ProtoView.showPrompt({
            title: '修改 CAN 数据包名称',
            label: '请输入新的数据包名称：',
            defaultValue: oldName,
            placeholder: '如: 发动机状态与转速包',
            hint: `当前包 CAN ID: ${pkt.canId || '0x18F00100'}`,
            confirmText: '保存名称',
            cancelText: '取消'
        }) : Promise.resolve(prompt('请输入新的数据包名称:', oldName)));
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        pkt.name = trimmed;
        syncPacketFrames(pkt);
        pushCanHistory('重命名数据包');
        renderToolbarInfo();
        renderByteDetail();
        showToast(`已重命名数据包为「${pkt.name}」`, 'success');
    }

    // 克隆当前数据包
    function duplicateCurrentCanPacket() {
        const pkt = getCurrentCanPacket();
        if (!pkt || !currentCanProtocol) return;
        const copy = JSON.parse(JSON.stringify(pkt));
        copy.key = `pkt_${Date.now()}`;
        copy.name = `${copy.name}_副本`;

        // CAN ID 自动自增 0x10
        let curIdNum = 0x18F00100;
        if (copy.canId) {
            curIdNum = parseInt(copy.canId.replace(/^0x/i, ''), 16) || 0x18F00100;
        }
        copy.canId = '0x' + ((curIdNum + 0x10) >>> 0).toString(16).toUpperCase();
        delete copy.idFields; // 重新根据新 ID 解码
        ensurePacketIdFields(copy);

        currentCanProtocol.packets.splice(currentCanPacketIndex + 1, 0, copy);
        currentCanPacketIndex++;
        currentCanByteIndex = 0;
        selectedSignalIndex = -1;
        pushCanHistory('克隆数据包');
        renderAllCanUI();
        showToast(`已克隆数据包「${copy.name}」(新ID: ${copy.canId})`, 'success');
    }

    // 删除当前数据包
    async function deleteCurrentCanPacket() {
        if (!currentCanProtocol || !currentCanProtocol.packets) return;
        if (currentCanProtocol.packets.length <= 1) {
            showToast('协议至少需保留 1 个 CAN 数据包！', 'warning');
            return;
        }
        const name = currentCanProtocol.packets[currentCanPacketIndex].name || '该数据包';
        const ok = await (ProtoView.showConfirm ? ProtoView.showConfirm({
            title: '删除数据包确认',
            icon: 'fa-trash-can',
            type: 'danger',
            message: `确定要删除数据包「${name}」及其下的所有字节定义吗？`,
            detail: '删除后，该数据包及对应的 CAN ID 与字节字段定义将被移除。',
            confirmText: '确认删除',
            cancelText: '取消'
        }) : Promise.resolve(confirm(`确定要删除数据包「${name}」及其下的所有字节定义吗？`)));
        if (!ok) return;
        currentCanProtocol.packets.splice(currentCanPacketIndex, 1);
        if (currentCanPacketIndex >= currentCanProtocol.packets.length) {
            currentCanPacketIndex = currentCanProtocol.packets.length - 1;
        }
        currentCanByteIndex = 0;
        selectedSignalIndex = -1;
        pushCanHistory('删除数据包');
        renderAllCanUI();
        showToast(`已删除数据包「${name}」`, 'info');
    }

    // 保存当前 CAN 协议
    async function saveCurrentCanProtocol() {
        if (!currentCanProtocol) return;
        try {
            if (ProtoView.ArchiveManager) {
                ProtoView.ArchiveManager.markProtocolModified(currentCanProtocol);
            }
            if (window.dbHelper && typeof window.dbHelper.saveProtocol === 'function') {
                await window.dbHelper.saveProtocol(currentCanProtocol);
            }
            if (ProtoView.WorkspaceSync && typeof ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud === 'function') {
                await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(currentCanProtocol);
            }

            if (typeof window.loadProtocols === 'function') {
                await window.loadProtocols();
            }

            renderToolbarInfo();
            showToast(`已成功保存 CAN 通信协议「${currentCanProtocol.name}」！`, 'success');
        } catch (err) {
            console.error('保存 CAN 协议异常:', err);
            showToast(`保存 CAN 协议失败: ${err.message || err}`, 'error');
        }
    }

    // 导出 Vector DBC 文件
    function exportCanDbc() {
        if (!currentCanProtocol) return;
        const dbcText = ProtoView.CanHelper ? ProtoView.CanHelper.generateDbc(currentCanProtocol) : '';
        const safeName = (currentCanProtocol.name || 'CAN_Protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        downloadFile(dbcText, `${safeName}.dbc`, 'text/plain;charset=utf-8');
        showToast(`已成功导出 Vector DBC 文件「${safeName}.dbc」！`, 'success');
    }

    // 绑定 DOM 事件
    function bindCanEvents() {
        // 返回按钮
        const btnBack = document.getElementById('btn-can-back');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                if (typeof window.switchToView === 'function') {
                    window.switchToView('protocol-view');
                }
            });
        }

        // 顶栏数据包下拉切换
        const packetSelect = document.getElementById('can-packet-select');
        if (packetSelect) {
            packetSelect.addEventListener('change', (e) => {
                selectCanPacket(parseInt(e.target.value, 10) || 0);
            });
        }
        const btnAddPacket = document.getElementById('btn-add-can-packet');
        if (btnAddPacket) {
            btnAddPacket.addEventListener('click', addCanPacket);
        }
        const btnMenuAddPacket = document.getElementById('btn-menu-add-can-packet');
        if (btnMenuAddPacket) {
            btnMenuAddPacket.addEventListener('click', addCanPacket);
        }
        const btnRenamePacket = document.getElementById('btn-rename-can-packet');
        if (btnRenamePacket) {
            btnRenamePacket.addEventListener('click', renameCurrentCanPacket);
        }
        const btnMenuRenamePacket = document.getElementById('btn-menu-rename-can-packet');
        if (btnMenuRenamePacket) {
            btnMenuRenamePacket.addEventListener('click', renameCurrentCanPacket);
        }
        const btnDuplicatePacket = document.getElementById('btn-duplicate-can-packet');
        if (btnDuplicatePacket) {
            btnDuplicatePacket.addEventListener('click', duplicateCurrentCanPacket);
        }
        const btnDeletePacket = document.getElementById('btn-delete-can-packet');
        if (btnDeletePacket) {
            btnDeletePacket.addEventListener('click', deleteCurrentCanPacket);
        }
        const packetDir = document.getElementById('can-packet-direction');
        if (packetDir) {
            packetDir.addEventListener('change', (e) => {
                const pkt = getCurrentCanPacket();
                if (pkt) {
                    pkt.direction = e.target.value;
                    syncPacketFrames(pkt);
                    pushCanHistory('修改数据包方向');
                    showToast(`已将数据包传输方向设为「${pkt.direction === 'Tx' ? '发送' : '接收'}」`, 'info');
                }
            });
        }
        const packetPeriod = document.getElementById('can-packet-period');
        if (packetPeriod) {
            packetPeriod.addEventListener('change', (e) => {
                const pkt = getCurrentCanPacket();
                if (pkt) {
                    pkt.period = parseInt(e.target.value, 10) || 50;
                    syncPacketFrames(pkt);
                    pushCanHistory('修改数据包周期');
                }
            });
        }

        // 字节列表搜索框
        const searchInput = document.getElementById('can-frame-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                canByteSearchQuery = e.target.value;
                renderBytesList();
            });
        }

        // 数据包名称输入
        const nameInput = document.getElementById('can-frame-name-input');
        if (nameInput) {
            nameInput.addEventListener('change', (e) => {
                const pkt = getCurrentCanPacket();
                if (pkt) {
                    pkt.name = (e.target.value || '').trim() || '未命名数据包';
                    syncPacketFrames(pkt);
                    pushCanHistory('修改数据包名称');
                    renderToolbarInfo();
                }
            });
        }

        // 顶栏 32 位 AllBits 输入
        const topIdInput = document.getElementById('can-frame-id-input');
        if (topIdInput) {
            topIdInput.addEventListener('change', (e) => {
                updateCanIdFromFullHex(e.target.value);
            });
        }

        // 联合体面板 32 位 Hex 直接输入
        const directHexInput = document.getElementById('can-id-direct-hex');
        if (directHexInput) {
            directHexInput.addEventListener('change', (e) => {
                updateCanIdFromFullHex(e.target.value);
            });
        }

        // 仿真底栏按钮
        const btnRandom = document.getElementById('btn-can-sim-randomize');
        if (btnRandom) btnRandom.addEventListener('click', randomizeCanSim);
        const btnReset = document.getElementById('btn-can-sim-reset');
        if (btnReset) btnReset.addEventListener('click', resetCanSim);
        const btnCopyHex = document.getElementById('btn-can-sim-copy-hex');
        if (btnCopyHex) btnCopyHex.addEventListener('click', copyCanHex);

        // 撤销 / 重做
        const btnUndo = document.getElementById('btn-can-undo');
        if (btnUndo) btnUndo.addEventListener('click', performCanUndo);
        const btnRedo = document.getElementById('btn-can-redo');
        if (btnRedo) btnRedo.addEventListener('click', performCanRedo);

        // 左右分栏拖拽调整手柄
        const resizer = document.getElementById('can-workbench-resizer');
        const framesPanel = document.getElementById('can-frames-panel');
        if (resizer && framesPanel) {
            let isResizing = false;
            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            });
            window.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                const containerRect = framesPanel.parentElement.getBoundingClientRect();
                const newWidth = Math.max(200, Math.min(500, e.clientX - containerRect.left));
                framesPanel.style.width = `${newWidth}px`;
            });
            window.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });
        }

        // 移动端 Tab 切换
        const btnTabFrames = document.getElementById('btn-can-mobile-tab-frames');
        const btnTabDetail = document.getElementById('btn-can-mobile-tab-detail');
        if (btnTabFrames) {
            btnTabFrames.addEventListener('click', () => setMobileCanView('words'));
        }
        if (btnTabDetail) {
            btnTabDetail.addEventListener('click', () => setMobileCanView('detail'));
        }
        const btnMobileBack = document.getElementById('btn-can-mobile-back-frames');
        if (btnMobileBack && btnTabFrames) {
            btnMobileBack.addEventListener('click', () => {
                btnTabFrames.click();
            });
        }
    }

    // 确保当前有 CAN 协议处于载入状态
    async function ensureCanProtocolLoaded() {
        if (currentCanProtocol && currentCanProtocol.packets && currentCanProtocol.packets.length > 0) {
            renderAllCanUI();
            return;
        }
        const all = await (window.dbHelper ? window.dbHelper.getAllProtocols() : []);
        const canProto = all.find(p => p.type === 'CAN');
        if (canProto) {
            await loadCanProtocolIntoEditor(canProto.id);
        } else {
            renderAllCanUI();
        }
    }

    // 移动端视窗切换
    function setMobileCanView(tab) {
        const denseWorkbench = document.getElementById('can-dense-workbench');
        const btnTabFrames = document.getElementById('btn-can-mobile-tab-frames');
        const btnTabDetail = document.getElementById('btn-can-mobile-tab-detail');
        if (!denseWorkbench) return;
        if (tab === 'detail') {
            denseWorkbench.classList.remove('mobile-view-words');
            denseWorkbench.classList.add('mobile-view-detail');
            if (btnTabFrames) btnTabFrames.classList.remove('active');
            if (btnTabDetail) btnTabDetail.classList.add('active');
        } else {
            denseWorkbench.classList.remove('mobile-view-detail');
            denseWorkbench.classList.add('mobile-view-words');
            if (btnTabDetail) btnTabDetail.classList.remove('active');
            if (btnTabFrames) btnTabFrames.classList.add('active');
        }
    }

    // 控制器暴露
    const CanController = {
        getCurrentProtocol: () => currentCanProtocol,
        getCurrentPacket: getCurrentCanPacket,
        getCurrentByte: getCurrentCanByte,
        getCurrentFrame,
        loadCanProtocolIntoEditor,
        ensureCanProtocolLoaded,
        setMobileCanView,
        saveCurrentCanProtocol,
        performCanUndo,
        performCanRedo,
        selectCanPacket,
        addCanPacket,
        renameCurrentCanPacket,
        duplicateCurrentCanPacket,
        deleteCurrentCanPacket,
        selectCanByte,
        addCanByte,
        clearCanByte,
        updateCanByteName,
        addCanSignal,
        duplicateCanSignal,
        deleteCanSignal,
        updateCanSignalProp,
        updateCanSimByte,
        updateCanIdFieldVal,
        updateCanIdFieldComment,
        updateCanIdFromFullHex,
        openCanIdFieldDictModal,
        openCanSignalDictModal,
        exportCanDbc,
        copyCanHex,
        bindEvents: bindCanEvents
    };

    ProtoView.Controllers.Can = CanController;
    global.ProtoView = ProtoView;

    // 挂载全局方法方便 HTML 与调试调用
    global.loadCanProtocolIntoEditor = loadCanProtocolIntoEditor;
    global.ensureCanProtocolLoaded = ensureCanProtocolLoaded;
    global.setMobileCanView = setMobileCanView;
    global.saveCurrentCanProtocol = saveCurrentCanProtocol;
    global.performCanUndo = performCanUndo;
    global.performCanRedo = performCanRedo;
    global.selectCanPacket = selectCanPacket;
    global.addCanPacket = addCanPacket;
    global.renameCurrentCanPacket = renameCurrentCanPacket;
    global.duplicateCurrentCanPacket = duplicateCurrentCanPacket;
    global.cloneCanPacket = duplicateCurrentCanPacket;
    global.deleteCurrentCanPacket = deleteCurrentCanPacket;
    
    // 字节清单与详情交互
    global.selectCanByte = selectCanByte;
    global.selectCanFrame = selectCanByte; // 向后兼容别名
    global.addCanByte = addCanByte;
    global.clearCanByte = clearCanByte;
    global.updateCanByteName = updateCanByteName;
    global.addCanFrameCard = addCanByte;  // 向后兼容别名

    // 字段交互
    global.addCanSignal = addCanSignal;
    global.addCanSignalCard = addCanSignal;
    global.duplicateCanSignal = duplicateCanSignal;
    global.deleteCanSignal = deleteCanSignal;
    global.updateCanSignalProp = updateCanSignalProp;

    // CAN ID 交互
    global.updateCanIdFromFullHex = updateCanIdFromFullHex;
    global.updateCanIdFieldVal = updateCanIdFieldVal;
    global.updateCanIdFieldComment = updateCanIdFieldComment;
    global.openCanIdFieldDictModal = openCanIdFieldDictModal;
    global.openCanSignalDictModal = openCanSignalDictModal;

    // 仿真与导出
    global.updateCanSimByte = updateCanSimByte;
    global.randomizeCanSim = randomizeCanSim;
    global.resetCanSim = resetCanSim;
    global.copyCanHex = copyCanHex;
    global.exportCanDbc = exportCanDbc;
    global.exportCanDbcFile = exportCanDbc;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindCanEvents);
    } else {
        bindCanEvents();
    }

})(typeof window !== 'undefined' ? window : this);
