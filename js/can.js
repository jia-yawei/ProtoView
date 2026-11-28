/**
 * @file can.js
 * @brief CAN 总线协议 (CAN 2.0A/B / CAN FD) 核心建模与编解码引擎
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const CanHelper = {
        /**
         * 厂家标准 32-bit CAN ID 拆解规格 (CAN_FRAME_ID_OBJ union)
         * 自定义 (8b) | RCI (2b) | 源ID (6b) | 指令类型 (8b) | 消息类型 (2b) | LCC (3b) | 保留 (3b)
         */
        CAN_ID_FIELDS: [
            { key: 'selfDefine', name: '自定义', ident: 'SelfDefine', startBit: 0, bitLength: 8, byteIdx: 0, bitInByte: '0~7', mask: 0xFF, shift: 0, max: 255, isHex: true, desc: '8位自定义字段 (位于 Byte 0)' },
            { key: 'rci', name: 'RCI', ident: 'Rci', startBit: 8, bitLength: 2, byteIdx: 1, bitInByte: '0~1', mask: 0x03, shift: 8, max: 3, isHex: false, desc: '2位RCI (位于 Byte 1[1:0])' },
            { key: 'sourceId', name: '源ID', ident: 'SourceId', startBit: 10, bitLength: 6, byteIdx: 1, bitInByte: '2~7', mask: 0x3F, shift: 10, max: 63, isHex: false, desc: '6位发送源节点ID (位于 Byte 1[7:2])' },
            { key: 'cmdType', name: '指令类型', ident: 'CmdType', startBit: 16, bitLength: 8, byteIdx: 2, bitInByte: '0~7', mask: 0xFF, shift: 16, max: 255, isHex: true, desc: '8位指令功能类型 (位于 Byte 2)' },
            { key: 'msgType', name: '消息类型', ident: 'MsgType', startBit: 24, bitLength: 2, byteIdx: 3, bitInByte: '0~1', mask: 0x03, shift: 24, max: 3, isHex: false, desc: '2位消息传输类型 (位于 Byte 3[1:0])' },
            { key: 'lcc', name: 'LCC', ident: 'Lcc', startBit: 26, bitLength: 3, byteIdx: 3, bitInByte: '2~4', mask: 0x07, shift: 26, max: 7, isHex: false, desc: '3位LCC控制码 (位于 Byte 3[4:2])' },
            { key: 'rsvd', name: '保留', ident: 'Rsvd', startBit: 29, bitLength: 3, byteIdx: 3, bitInByte: '5~7', mask: 0x07, shift: 29, max: 7, isHex: false, desc: '3位系统保留位 (位于 Byte 3[7:5], 默认0)' }
        ],

        /**
         * 解码 32 位 AllBits 为 7 个固定位域及 4 个字节 (Little-Endian)
         */
        decodeCanIdObj(allBitsVal) {
            let num = 0;
            if (typeof allBitsVal === 'string') {
                const clean = allBitsVal.trim();
                if (clean.toLowerCase().startsWith('0x')) {
                    num = parseInt(clean, 16) || 0;
                } else if (/^[0-9a-fA-F]+$/.test(clean) && clean.length > 4) {
                    num = parseInt(clean, 16) || 0;
                } else {
                    num = parseInt(clean, 10) || 0;
                }
            } else {
                num = Number(allBitsVal) || 0;
            }
            num = (num >>> 0); // 32位无符号整数

            const selfDefine = (num >>> 0) & 0xFF;
            const rci = (num >>> 8) & 0x03;
            const sourceId = (num >>> 10) & 0x3F;
            const cmdType = (num >>> 16) & 0xFF;
            const msgType = (num >>> 24) & 0x03;
            const lcc = (num >>> 26) & 0x07;
            const rsvd = (num >>> 29) & 0x07;

            const byte0 = selfDefine;
            const byte1 = (rci & 0x03) | ((sourceId & 0x3F) << 2);
            const byte2 = cmdType;
            const byte3 = (msgType & 0x03) | ((lcc & 0x07) << 2) | ((rsvd & 0x07) << 5);

            const hexStr = '0x' + num.toString(16).toUpperCase().padStart(8, '0');

            return {
                allBits: num,
                hex: hexStr,
                dec: num.toString(10),
                selfDefine,
                rci,
                sourceId,
                cmdType,
                msgType,
                lcc,
                rsvd,
                byte0,
                byte1,
                byte2,
                byte3,
                bytes: [byte0, byte1, byte2, byte3]
            };
        },

        /**
         * 将 7 个固定位域编码为 32 位 AllBits
         */
        encodeCanIdObj(fields = {}) {
            const parseVal = (v) => {
                if (typeof v === 'number') return v;
                if (!v) return 0;
                const s = String(v).trim();
                return s.toLowerCase().startsWith('0x') ? parseInt(s, 16) || 0 : parseInt(s, 10) || 0;
            };
            const selfDefine = parseVal(fields.selfDefine) & 0xFF;
            const rci = parseVal(fields.rci) & 0x03;
            const sourceId = parseVal(fields.sourceId) & 0x3F;
            const cmdType = parseVal(fields.cmdType) & 0xFF;
            const msgType = parseVal(fields.msgType) & 0x03;
            const lcc = parseVal(fields.lcc) & 0x07;
            const rsvd = parseVal(fields.rsvd) & 0x07;

            const num = ((selfDefine & 0xFF) >>> 0) |
                        (((rci & 0x03) << 8) >>> 0) |
                        (((sourceId & 0x3F) << 10) >>> 0) |
                        (((cmdType & 0xFF) << 16) >>> 0) |
                        (((msgType & 0x03) << 24) >>> 0) |
                        (((lcc & 0x07) << 26) >>> 0) |
                        (((rsvd & 0x07) << 29) >>> 0);

            const allBits = (num >>> 0);
            const hexStr = '0x' + allBits.toString(16).toUpperCase().padStart(8, '0');
            const byte0 = selfDefine;
            const byte1 = (rci & 0x03) | ((sourceId & 0x3F) << 2);
            const byte2 = cmdType;
            const byte3 = (msgType & 0x03) | ((lcc & 0x07) << 2) | ((rsvd & 0x07) << 5);

            return {
                allBits,
                hex: hexStr,
                dec: allBits.toString(10),
                selfDefine,
                rci,
                sourceId,
                cmdType,
                msgType,
                lcc,
                rsvd,
                byte0,
                byte1,
                byte2,
                byte3,
                bytes: [byte0, byte1, byte2, byte3],
                valueOf() { return this.allBits; }
            };
        },

        /**
         * 从 4 个字节直接组合编码为 32 位 AllBits 及对应位域
         */
        encodeCanIdFromBytes(b0 = 0, b1 = 0, b2 = 0, b3 = 0) {
            const byte0 = (parseInt(b0, 10) || 0) & 0xFF;
            const byte1 = (parseInt(b1, 10) || 0) & 0xFF;
            const byte2 = (parseInt(b2, 10) || 0) & 0xFF;
            const byte3 = (parseInt(b3, 10) || 0) & 0xFF;

            const num = ((byte0 & 0xFF) >>> 0) |
                        (((byte1 & 0xFF) << 8) >>> 0) |
                        (((byte2 & 0xFF) << 16) >>> 0) |
                        (((byte3 & 0xFF) << 24) >>> 0);

            return this.decodeCanIdObj(num);
        },

        /**
         * 计算信号所占用的全部 Bit 序号 (0 ~ 63)
         * @param {number} startBit 起始位 (Intel 为 LSB, Motorola 为 MSB)
         * @param {number} bitLength 信号位宽 (1 ~ 64)
         * @param {string} byteOrder 字节序 ('intel' / 'motorola')
         * @returns {number[]} 占用的位序号数组
         */
        getSignalOccupiedBits(startBit, bitLength, byteOrder = 'intel') {
            const bits = [];
            const len = parseInt(bitLength, 10) || 1;
            const start = parseInt(startBit, 10) || 0;
            if (len <= 0) return bits;

            if (byteOrder === 'motorola') {
                // 标准 Motorola (MSB 模式)：
                // 在当前字节内从 startBit 逐位递减到 bit 0，随后跨到下一字节的 bit 7 逐位递减
                let curBit = start;
                for (let i = 0; i < len; i++) {
                    if (curBit < 0 || curBit >= 64) break;
                    bits.push(curBit);
                    if (curBit % 8 === 0) {
                        // 到达当前字节的 Bit 0，跨到下一字节的 Bit 7
                        curBit += 15;
                    } else {
                        curBit -= 1;
                    }
                }
            } else {
                // Intel (小端 LSB 模式)：从 startBit 起线性递增
                for (let i = 0; i < len; i++) {
                    const b = start + i;
                    if (b >= 64) break;
                    bits.push(b);
                }
            }
            return bits;
        },

        /**
         * 校验当前报文内所有信号的位域冲突与越界
         * @param {Array} signals 信号列表
         * @param {number} dlc 数据长度 (字节数, 0~8 或 64)
         * @returns {Object} { bitOwners: Map, conflicts: Set, outOfBounds: Set }
         */
        validateSignals(signals, dlc = 8) {
            const maxBit = (parseInt(dlc, 10) || 8) * 8 - 1;
            const bitOwners = new Map(); // bitIndex -> [signalIndex]
            const conflicts = new Set();  // bitIndex
            const outOfBounds = new Set();// signalIndex

            if (!signals || !Array.isArray(signals)) {
                return { bitOwners, conflicts, outOfBounds };
            }

            signals.forEach((sig, sIdx) => {
                const bits = this.getSignalOccupiedBits(sig.startBit, sig.bitLength, sig.byteOrder || 'intel');
                let hasOOB = false;

                bits.forEach(b => {
                    if (b > maxBit) {
                        hasOOB = true;
                    }
                    if (!bitOwners.has(b)) {
                        bitOwners.set(b, []);
                    }
                    const owners = bitOwners.get(b);
                    owners.push(sIdx);
                    if (owners.length > 1) {
                        conflicts.add(b);
                    }
                });

                if (hasOOB) {
                    outOfBounds.add(sIdx);
                }
            });

            return { bitOwners, conflicts, outOfBounds };
        },

        /**
         * 从 8 字节数组中解码指定信号的物理值 (Physical = Raw * Factor + Offset)
         * @param {number[]} bytes 8 字节数组
         * @param {Object} sig 信号定义
         * @returns {number|string} 解码后的物理值
         */
        decodeSignalValue(bytes, sig) {
            if (!bytes || !bytes.length || !sig) return 0;
            const bits = this.getSignalOccupiedBits(sig.startBit, sig.bitLength, sig.byteOrder || 'intel');
            if (bits.length === 0) return 0;

            // 提取无符号整型原始值
            let rawUnsigned = 0n;
            if (sig.byteOrder === 'motorola') {
                // Motorola MSB: 第一个提取的位为最高有效位
                for (let i = 0; i < bits.length; i++) {
                    const bIdx = bits[i];
                    const byteIdx = Math.floor(bIdx / 8);
                    const bitInByte = bIdx % 8;
                    const val = (byteIdx < bytes.length) ? (bytes[byteIdx] >> bitInByte) & 1 : 0;
                    rawUnsigned = (rawUnsigned << 1n) | BigInt(val);
                }
            } else {
                // Intel LSB: 第一个提取的位为最低有效位
                for (let i = 0; i < bits.length; i++) {
                    const bIdx = bits[i];
                    const byteIdx = Math.floor(bIdx / 8);
                    const bitInByte = bIdx % 8;
                    const val = (byteIdx < bytes.length) ? (bytes[byteIdx] >> bitInByte) & 1 : 0;
                    rawUnsigned |= (BigInt(val) << BigInt(i));
                }
            }

            // 处理有符号数补码
            let raw = Number(rawUnsigned);
            const isSigned = String(sig.dataType || '').startsWith('i');
            if (isSigned && bits.length > 1) {
                const signBit = 1n << BigInt(bits.length - 1);
                if (rawUnsigned >= signBit) {
                    const mask = (1n << BigInt(bits.length)) - 1n;
                    raw = -Number(((~rawUnsigned) & mask) + 1n);
                }
            }

            if (sig.dataType === 'bool') {
                return raw ? 1 : 0;
            }

            // 线性转换公式: Physical = Raw * Factor + Offset
            const factor = parseFloat(sig.factor);
            const offset = parseFloat(sig.offset);
            const f = !isNaN(factor) ? factor : 1;
            const o = !isNaN(offset) ? offset : 0;

            let physical = raw * f + o;

            // 精度微调 (若有指定精度或浮点小数)
            if (f.toString().includes('.')) {
                const decPlaces = f.toString().split('.')[1].length;
                physical = parseFloat(physical.toFixed(Math.min(decPlaces, 4)));
            } else {
                physical = Math.round(physical * 10000) / 10000;
            }

            return physical;
        },

        /**
         * 解析 CAN ID (支持 16 进制 0x18F00100 与标准 10 进制，自动拆解 J1939 语义)
         * @param {string|number} idVal CAN 标识符输入
         * @param {boolean} isExtended 是否扩展帧 (29-bit)
         * @returns {Object} CAN ID 详情对象
         */
        parseCanId(idVal, isExtended = false) {
            let num = 0;
            if (typeof idVal === 'string') {
                const clean = idVal.trim();
                if (clean.toLowerCase().startsWith('0x')) {
                    num = parseInt(clean, 16) || 0;
                } else if (/^[0-9a-fA-F]+$/.test(clean) && clean.length > 4) {
                    num = parseInt(clean, 16) || 0;
                } else {
                    num = parseInt(clean, 10) || 0;
                }
            } else {
                num = Number(idVal) || 0;
            }

            const maxVal = isExtended ? 0x1FFFFFFF : 0x7FF;
            num = num & maxVal;

            const hexStr = '0x' + num.toString(16).toUpperCase().padStart(isExtended ? 8 : 3, '0');
            const decStr = num.toString(10);

            let j1939 = null;
            if (isExtended && num > 0x7FF) {
                // J1939 29-bit 格式拆解: Priority(3b) | Res(1b) | DP(1b) | PF(8b) | PS/DA(8b) | SA(8b)
                const priority = (num >> 26) & 0x07;
                const dp = (num >> 24) & 0x01;
                const pf = (num >> 16) & 0xFF;
                const ps = (num >> 8) & 0xFF;
                const sa = num & 0xFF;

                let pgn = (dp << 16) | (pf << 8);
                if (pf >= 240) {
                    // PDU2 格式 (广播 PGN): PGN = DP + PF + PS
                    pgn |= ps;
                }

                j1939 = {
                    priority,
                    pgn: '0x' + pgn.toString(16).toUpperCase(),
                    pgnDec: pgn,
                    sourceAddr: '0x' + sa.toString(16).toUpperCase().padStart(2, '0'),
                    destAddr: pf < 240 ? ('0x' + ps.toString(16).toUpperCase().padStart(2, '0')) : '广播(Global)'
                };
            }

            return {
                rawNum: num,
                hex: hexStr,
                dec: decStr,
                isExtended: !!isExtended,
                fields: this.decodeCanIdObj(num),
                j1939
            };
        },

        /**
         * 生成 CAN 总线协议标准 Markdown 说明书 (一包一页，紧凑表格，逐 Bit 详述)
         */
        generateMarkdownSpec(protocol) {
            if (!protocol) return '# 无有效 CAN 协议\n';
            const pName = protocol.name || 'CAN 通信协议';
            const pProduct = protocol.product ? ` [所属产品: ${protocol.product}]` : '';
            const pStd = protocol.canStandard || 'CAN2.0B';
            const baud = protocol.baudRate || 500000;
            const baudStr = baud >= 1000 ? `${baud / 1000} kbps` : `${baud} bps`;
            const dev = protocol.device || protocol.source || '未指定设备';
            const desc = protocol.description || '';

            let md = `# ${pName}${pProduct} - CAN 总线通信规约与 ICD 接口定义\n\n`;
            md += `> 总线: **CAN (${pStd})** | 波特率: **${baudStr}** | 默认周期: **${protocol.period || 50} ms** | 对端设备: **${dev}**\n\n`;
            if (desc) md += `> **协议概述**: ${desc}\n\n`;

            const packets = protocol.packets || [];
            if (packets.length === 0) {
                md += `> 当前协议尚未配置 CAN 数据包。\n\n`;
                return md;
            }

            packets.forEach((pkt, pIdx) => {
                const isTx = pkt.direction === 'Rx' ? 'Rx (接收)' : 'Tx (发送)';
                const pktPeriod = pkt.period !== undefined ? pkt.period : (protocol.period || 50);
                const canIdHex = pkt.canId || '0x18F00100';
                const idObj = this.decodeCanIdObj(canIdHex);
                const idFields = pkt.idFields || idObj;
                const bytes = pkt.bytes || [];

                md += `### ${pIdx + 1}. ${pkt.name || `数据包 ${pIdx + 1}`} (${canIdHex} · ${isTx} · ${pktPeriod}ms)\n\n`;

                // 1) CAN ID 一行横向表格
                md += `**CAN 帧 ID (${canIdHex})**\n\n`;
                md += `| SelfDefine (8b) | Rci (2b) | SourceId (6b) | CmdType (8b) | MsgType (2b) | Lcc (3b) | Rsvd (3b) |\n`;
                md += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
                const idCells = this.CAN_ID_FIELDS.map(meta => {
                    const val = idFields[meta.key] !== undefined ? idFields[meta.key] : idObj[meta.key];
                    const valStr = meta.isHex ? ('0x' + Number(val || 0).toString(16).toUpperCase().padStart(2, '0')) : String(val || 0);
                    return `\`${valStr}\``;
                });
                md += `| ${idCells.join(' | ')} |\n\n`;

                // 2) 逐 Bit 详细定义表
                md += `**数据载荷逐 Bit 详细定义 (Byte 0 ~ Byte 7)**\n\n`;
                md += `| 字节 | 字节名称 | Bit 位 | 字段名称 | 类型 | 分辨率 / 偏移 / 单位 | 详细用途与状态字典 |\n`;
                md += `| :---: | :--- | :---: | :--- | :---: | :---: | :--- |\n`;

                bytes.forEach((b, bIdx) => {
                    const off = b.byteOffset !== undefined ? b.byteOffset : bIdx;
                    const byteName = b.name || `Byte ${off}`;
                    const sigs = (b.signals || []).slice().sort((a, c) => (parseInt(a.startBit, 10) || 0) - (parseInt(c.startBit, 10) || 0));
                    const bitOwners = new Array(8).fill(null);
                    sigs.forEach(s => {
                        const sb = Math.max(0, Math.min(7, parseInt(s.startBit, 10) || 0));
                        const bl = Math.max(1, Math.min(8 - sb, parseInt(s.bitLength, 10) || 1));
                        for (let k = sb; k < sb + bl; k++) bitOwners[k] = s;
                    });

                    let cur = 0;
                    while (cur < 8) {
                        const owner = bitOwners[cur];
                        let end = cur;
                        while (end + 1 < 8 && bitOwners[end + 1] === owner) end++;
                        const bitLabel = end > cur ? `Bit ${cur}~${end}` : `Bit ${cur}`;
                        if (!owner) {
                            md += `| **Byte ${off}** | ${byteName} | ${bitLabel} | 保留 / 未使用 | - | - | 预留位 (默认置 0) |\n`;
                        } else {
                            const conv = `×${owner.factor !== undefined ? owner.factor : 1} + ${owner.offset !== undefined ? owner.offset : 0}${owner.unit ? ' ' + owner.unit : ''}`;
                            const dictObj = owner.dict || {};
                            const dictStr = Object.keys(dictObj).length > 0
                                ? `字典:[${Object.entries(dictObj).map(([k, v]) => `${k}:${v}`).join('; ')}]`
                                : '';
                            const noteStr = [owner.description || '', dictStr].filter(Boolean).join(' | ') || '-';
                            md += `| **Byte ${off}** | ${byteName} | ${bitLabel} | **${owner.name || '未命名'}** | \`${owner.dataType || 'u8'}\` | ${conv} | ${noteStr} |\n`;
                        }
                        cur = end + 1;
                    }
                });
                md += `\n---\n\n`;
            });

            return md;
        },

        /**
         * 生成 CAN 总线协议标准可打印独立 HTML 规格书 (一包一页、正式工程 Word 文档排版风格)
         */
        generateHtmlSpec(protocol) {
            if (!protocol) return '<h1>无有效协议</h1>';
            const pName = protocol.name || 'CAN 通信协议';
            const pProduct = protocol.product ? `${protocol.product}` : '';
            const pVer = protocol.version || 'v1.0';
            const pStd = protocol.canStandard || 'CAN2.0B';
            const baud = protocol.baudRate || 500000;
            const baudStr = baud >= 1000 ? `${baud / 1000} kbps` : `${baud} bps`;
            const dev = protocol.device || protocol.source || '未指定设备';
            const packets = Array.isArray(protocol.packets) ? protocol.packets : [];

            const esc = (s) => String(s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]);

            let packetsHtml = '';
            if (packets.length === 0) {
                packetsHtml = `<div style="padding:24px; text-align:center; border:1px dashed #cbd5e1; color:#64748b; font-size:13px;">当前 CAN 协议尚未配置数据包，请先进入工作台添加数据包与字节定义。</div>`;
            }
            packets.forEach((pkt, pIdx) => {
                const isTx = pkt.direction === 'Rx' ? '接收 (Rx)' : '发送 (Tx)';
                const pktPeriod = pkt.period !== undefined ? pkt.period : (protocol.period || 50);
                const canIdHex = pkt.canId || '0x18F00100';
                const idObj = this.decodeCanIdObj(canIdHex);
                const idFields = pkt.idFields || idObj;
                const bytes = pkt.bytes || [];

                // 1) CAN ID 单行横向表头与数值
                const idThHtml = this.CAN_ID_FIELDS.map(meta =>
                    `<th>${esc(meta.name)}<div class="th-sub">Bit ${meta.startBit}~${meta.startBit + meta.bitLength - 1} (${meta.bitLength}b)</div></th>`
                ).join('');
                const idTdHtml = this.CAN_ID_FIELDS.map(meta => {
                    const val = idFields[meta.key] !== undefined ? idFields[meta.key] : idObj[meta.key];
                    const valStr = meta.isHex ? ('0x' + Number(val || 0).toString(16).toUpperCase().padStart(2, '0')) : String(val || 0);
                    const fDict = (idFields.dicts && idFields.dicts[meta.key]) || {};
                    const dictMeaning = fDict[val] !== undefined ? fDict[val] : (fDict[valStr] !== undefined ? fDict[valStr] : '');
                    const comment = (idFields.comments && idFields.comments[meta.key]) || '';
                    const sub = dictMeaning || comment;
                    return `<td style="text-align:center;">
                        <div class="mono-val">${esc(valStr)}</div>
                        ${sub ? `<div class="td-sub">${esc(sub)}</div>` : ''}
                    </td>`;
                }).join('');

                // 2) 64-Bit 全景矩阵表 (Byte 0~7 × Bit 7~0)
                let matrixRowsHtml = '';
                // 3) 逐 Bit 详细定义表
                let bitDetailRowsHtml = '';

                bytes.forEach((b, bIdx) => {
                    const off = b.byteOffset !== undefined ? b.byteOffset : bIdx;
                    const byteName = b.name || `Byte ${off}`;
                    const sigs = (b.signals || []).slice().sort((a, c) => (parseInt(a.startBit, 10) || 0) - (parseInt(c.startBit, 10) || 0));

                    const bitOwners = new Array(8).fill(null);
                    sigs.forEach(s => {
                        const sb = Math.max(0, Math.min(7, parseInt(s.startBit, 10) || 0));
                        const bl = Math.max(1, Math.min(8 - sb, parseInt(s.bitLength, 10) || 1));
                        for (let k = sb; k < sb + bl; k++) bitOwners[k] = s;
                    });

                    // 矩阵行：Bit 7 -> Bit 0
                    let matrixCells = '';
                    let bCol = 7;
                    while (bCol >= 0) {
                        const owner = bitOwners[bCol];
                        let span = 1;
                        while (bCol - span >= 0 && bitOwners[bCol - span] === owner) span++;
                        if (!owner) {
                            matrixCells += `<td colspan="${span}" class="cell-reserved">保留</td>`;
                        } else {
                            matrixCells += `<td colspan="${span}" class="cell-signal">${esc(owner.name || owner.identifier || '字段')}</td>`;
                        }
                        bCol -= span;
                    }
                    matrixRowsHtml += `
                        <tr>
                            <td class="cell-byte-idx">Byte ${off}</td>
                            ${matrixCells}
                        </tr>
                    `;

                    // 逐 Bit 详表：从 Bit 0 到 Bit 7 按顺序拆分
                    const byteEntries = [];
                    let cur = 0;
                    while (cur < 8) {
                        const owner = bitOwners[cur];
                        let end = cur;
                        while (end + 1 < 8 && bitOwners[end + 1] === owner) end++;
                        byteEntries.push({ start: cur, end, owner });
                        cur = end + 1;
                    }

                    byteEntries.forEach((entry, eIdx) => {
                        const bitText = entry.end > entry.start ? `Bit ${entry.start}~${entry.end}` : `Bit ${entry.start}`;
                        const bitLen = entry.end - entry.start + 1;
                        if (!entry.owner) {
                            bitDetailRowsHtml += `
                                <tr class="row-reserved">
                                    ${eIdx === 0 ? `<td rowspan="${byteEntries.length}" class="cell-byte-idx">Byte ${off}</td>` : ''}
                                    ${eIdx === 0 ? `<td rowspan="${byteEntries.length}" class="cell-byte-name">${esc(byteName)}</td>` : ''}
                                    <td class="cell-bit-pos">${bitText} <span class="bit-len">(${bitLen}b)</span></td>
                                    <td class="text-muted">保留 / 未使用</td>
                                    <td style="text-align:center;" class="text-muted">-</td>
                                    <td style="text-align:center;" class="text-muted">-</td>
                                    <td class="text-muted">预留位，默认置 0</td>
                                </tr>
                            `;
                        } else {
                            const s = entry.owner;
                            const factor = s.factor !== undefined ? s.factor : 1;
                            const offset = s.offset !== undefined ? s.offset : 0;
                            const conv = `${factor}${offset ? (offset > 0 ? ` / +${offset}` : ` / ${offset}`) : ''}${s.unit ? ` (${s.unit})` : ''}`;
                            const dictObj = s.dict || {};
                            const dictStr = Object.keys(dictObj).length > 0
                                ? Object.entries(dictObj).map(([k, v]) => `${esc(k)}：${esc(v)}`).join('；')
                                : '';
                            const noteParts = [];
                            if (s.description) noteParts.push(esc(s.description));
                            if (dictStr) noteParts.push(`<b>状态定义：</b>${dictStr}`);

                            bitDetailRowsHtml += `
                                <tr>
                                    ${eIdx === 0 ? `<td rowspan="${byteEntries.length}" class="cell-byte-idx">Byte ${off}</td>` : ''}
                                    ${eIdx === 0 ? `<td rowspan="${byteEntries.length}" class="cell-byte-name">${esc(byteName)}</td>` : ''}
                                    <td class="cell-bit-pos"><b>${bitText}</b> <span class="bit-len">(${bitLen}b)</span></td>
                                    <td style="font-weight:600;">${esc(s.name || '未命名')}</td>
                                    <td style="text-align:center;">${esc(s.dataType || 'u8')}</td>
                                    <td style="text-align:center; font-family:Consolas,monospace;">${esc(conv)}</td>
                                    <td>${noteParts.join('<br>') || '-'}</td>
                                </tr>
                            `;
                        }
                    });
                });

                packetsHtml += `
                    <div class="packet-block can-packet-page">
                        <div class="sec-heading">
                            <span class="sec-title">2.${pIdx + 1} ${esc(pkt.name || `CAN 数据包 ${pIdx + 1}`)}</span>
                            <span class="sec-page-tag">报文 ${pIdx + 1} / ${packets.length}</span>
                        </div>

                        <table class="icd-table icd-meta-table">
                            <tbody>
                                <tr>
                                    <td class="meta-k">报文名称</td>
                                    <td class="meta-v"><b>${esc(pkt.name || 'CAN 数据包')}</b></td>
                                    <td class="meta-k">帧标识符 (CAN ID)</td>
                                    <td class="meta-v mono-val">${esc(canIdHex)}</td>
                                    <td class="meta-k">传输方向 / 周期</td>
                                    <td class="meta-v">${isTx} · ${pktPeriod} ms · ${pkt.dlc || bytes.length || 8} Bytes</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="table-caption">表 2.${pIdx + 1}-1　CAN 帧标识符 (CAN ID) 32 位结构体分配</div>
                        <table class="icd-table">
                            <thead>
                                <tr>${idThHtml}</tr>
                            </thead>
                            <tbody>
                                <tr>${idTdHtml}</tr>
                            </tbody>
                        </table>

                        <div class="table-caption">表 2.${pIdx + 1}-2　数据域 64-Bit 位分布总览表 (Byte 0 ~ Byte 7 · Bit 7 → Bit 0)</div>
                        <table class="icd-table icd-matrix-table">
                            <thead>
                                <tr>
                                    <th style="width:52px;">字节</th>
                                    <th>Bit 7</th><th>Bit 6</th><th>Bit 5</th><th>Bit 4</th>
                                    <th>Bit 3</th><th>Bit 2</th><th>Bit 1</th><th>Bit 0</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${matrixRowsHtml}
                            </tbody>
                        </table>

                        <div class="table-caption">表 2.${pIdx + 1}-3　数据域逐 Bit 详细定义与工程说明表</div>
                        <table class="icd-table">
                            <thead>
                                <tr>
                                    <th style="width:54px;">字节</th>
                                    <th style="width:88px;">字节名称</th>
                                    <th style="width:94px;">位段 (Bit)</th>
                                    <th style="width:130px;">信号名称</th>
                                    <th style="width:46px;">类型</th>
                                    <th style="width:92px;">分辨率/偏置(单位)</th>
                                    <th>功能说明与状态字典</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bitDetailRowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${esc(pName)} - CAN 总线通信协议规格书</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Microsoft YaHei", "PingFang SC", "SimSun", -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 20px;
      background: #e2e8f0;
      color: #111827;
    }
    .page-container {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      padding: 28px 34px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
    }
    .no-print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      padding: 8px 14px;
      border-radius: 4px;
      margin-bottom: 18px;
      border: 1px solid #cbd5e1;
      font-size: 12.5px;
    }
    .btn-action {
      background: #1e293b;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12.5px;
      font-weight: 600;
    }
    .btn-action:hover { background: #0f172a; }

    /* 正式文档抬头（Word 工程规范风格） */
    .doc-cover-header {
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .doc-top-meta {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #4b5563;
      margin-bottom: 6px;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 4px;
    }
    .doc-title {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin: 4px 0;
      text-align: center;
      letter-spacing: 0.5px;
    }
    .doc-subtitle-row {
      display: flex;
      justify-content: center;
      gap: 18px;
      font-size: 11.5px;
      color: #374151;
      margin-top: 4px;
    }

    /* 一包一页 */
    .can-packet-page {
      margin-bottom: 24px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .can-packet-page:not(:first-child) {
      page-break-before: always !important;
      break-before: page !important;
    }

    .sec-heading {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-left: 3.5px solid #1e293b;
      padding-left: 8px;
      margin: 6px 0 8px 0;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }
    .sec-title {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
    }
    .sec-page-tag {
      font-size: 11px;
      color: #6b7280;
    }

    .table-caption {
      font-size: 11.5px;
      font-weight: 700;
      color: #1f2937;
      margin: 8px 0 4px 0;
      text-align: left;
    }

    /* 正式工程表格：1.5px 外框 + 1px 细网格 */
    table.icd-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #1e293b;
      font-size: 11px;
      line-height: 1.35;
      margin-bottom: 6px;
    }
    table.icd-table th {
      background: #f3f4f6;
      color: #111827;
      font-weight: 700;
      text-align: center;
      border: 1px solid #9ca3af;
      border-bottom: 1.5px solid #1e293b;
      padding: 4px 5px;
    }
    table.icd-table td {
      border: 1px solid #9ca3af;
      padding: 3.5px 6px;
      vertical-align: middle;
      color: #111827;
    }
    .th-sub { font-weight: 400; font-size: 9.5px; color: #4b5563; margin-top: 1px; }
    .td-sub { font-size: 10px; color: #374151; margin-top: 1px; }
    .mono-val { font-family: Consolas, "Courier New", monospace; font-weight: 700; color: #111827; }

    .icd-meta-table td.meta-k {
      background: #f3f4f6;
      font-weight: 700;
      width: 110px;
      text-align: center;
      color: #1f2937;
    }
    .icd-meta-table td.meta-v {
      background: #ffffff;
    }

    .icd-matrix-table { table-layout: fixed; }
    .icd-matrix-table td.cell-signal {
      text-align: center;
      background: #ffffff;
      font-weight: 600;
      font-size: 10.5px;
    }
    .icd-matrix-table td.cell-reserved {
      text-align: center;
      background: #f9fafb;
      color: #9ca3af;
      font-size: 10px;
    }

    .cell-byte-idx {
      text-align: center;
      font-weight: 700;
      background: #f9fafb;
      white-space: nowrap;
    }
    .cell-byte-name { font-weight: 600; }
    .cell-bit-pos { text-align: center; font-family: Consolas, monospace; white-space: nowrap; }
    .bit-len { font-weight: 400; color: #6b7280; font-size: 10px; }
    .ident-sub { font-family: Consolas, monospace; font-size: 10px; color: #4b5563; font-weight: 400; }
    .row-reserved td { background: #fcfcfd; }
    .text-muted { color: #9ca3af; }

    @media print {
      body { background: #ffffff; padding: 0; }
      .page-container { box-shadow: none; padding: 0; max-width: 100%; }
      .no-print-bar { display: none !important; }
      .can-packet-page { margin-bottom: 0 !important; }
      .doc-cover-header { margin-bottom: 10px; page-break-after: avoid; break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="no-print-bar">
      <span><strong>CAN 总线通信接口控制文件 (ICD)</strong> — 正式打印排版视图</span>
      <button class="btn-action" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
    </div>
    <div class="doc-cover-header">
      <div class="doc-top-meta">
        <span>${pProduct ? `所属产品：${esc(pProduct)}` : '通信总线接口规范'}</span>
        <span>文档版本：${esc(pVer)}</span>
        <span>编制日期：${new Date().toLocaleDateString()}</span>
      </div>
      <h1 class="doc-title">${esc(pName)}</h1>
      <div class="doc-subtitle-row">
        <span><b>总线类型：</b>CAN (${esc(pStd)})</span>
        <span><b>通信速率：</b>${esc(baudStr)}</span>
        <span><b>默认周期：</b>${protocol.period || 50} ms</span>
        <span><b>对端系统：</b>${esc(dev)}</span>
      </div>
    </div>
    <div class="doc-body">
      ${packetsHtml}
    </div>
  </div>
</body>
</html>`;
        }
    };

    // 挂载到全局
    global.ProtoView = global.ProtoView || {};
    global.ProtoView.CanHelper = CanHelper;
    global.CanHelper = CanHelper;

})(typeof window !== 'undefined' ? window : this);
