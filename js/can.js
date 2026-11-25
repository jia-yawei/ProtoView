/**
 * @file can.js
 * @brief CAN 总线协议 (CAN 2.0A/B / CAN FD / Vector DBC 矩阵) 核心建模与编解码引擎
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
                // Vector DBC 标准 Motorola (MSB 模式)：
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
         * 生成符合工业标准的 Vector DBC 规范文本
         * @param {Object} proto CAN 通信协议对象
         * @returns {string} DBC 文件文本
         */
        generateDbc(proto) {
            if (!proto) return '';
            const frames = proto.frames || [];
            let out = [];

            out.push(`VERSION "ProtoView_1.0"`);
            out.push(`NS_ :`);
            out.push(`BS_:`);
            out.push(`BU_: Master Node`);
            out.push(``);

            frames.forEach(f => {
                const idInfo = this.parseCanId(f.canId, f.isExtended);
                // Vector DBC 中，扩展帧 ID 最高位需按规范打上标志位 0x80000000
                const dbcId = f.isExtended ? (idInfo.rawNum | 0x80000000) : idInfo.rawNum;
                const safeName = (f.name || 'Message').replace(/[^a-zA-Z0-9_]/g, '_');
                const dlc = parseInt(f.dlc, 10) || 8;
                const sender = f.direction === 'Rx' ? 'Node' : 'Master';

                out.push(`BO_ ${dbcId} ${safeName}: ${dlc} ${sender}`);

                const signals = f.signals || [];
                signals.forEach(s => {
                    const sName = (s.identifier || s.name || 'Signal').replace(/[^a-zA-Z0-9_]/g, '_');
                    const startBit = parseInt(s.startBit, 10) || 0;
                    const bitLen = parseInt(s.bitLength, 10) || 1;
                    const byteOrder = s.byteOrder === 'motorola' ? '0' : '1'; // 0 = Motorola, 1 = Intel
                    const sign = String(s.dataType || '').startsWith('i') ? '-' : '+';
                    const factor = s.factor !== undefined && s.factor !== '' ? s.factor : 1;
                    const offset = s.offset !== undefined && s.offset !== '' ? s.offset : 0;
                    const min = s.min !== undefined && s.min !== '' ? s.min : 0;
                    const max = s.max !== undefined && s.max !== '' ? s.max : 100;
                    const unit = s.unit || '';
                    const receiver = sender === 'Master' ? 'Node' : 'Master';

                    out.push(` SG_ ${sName} : ${startBit}|${bitLen}@${byteOrder}${sign} (${factor},${offset}) [${min}|${max}] "${unit}" ${receiver}`);
                });
                out.push(``);
            });

            // 补充枚举值注释 (VAL_)
            frames.forEach(f => {
                const idInfo = this.parseCanId(f.canId, f.isExtended);
                const dbcId = f.isExtended ? (idInfo.rawNum | 0x80000000) : idInfo.rawNum;
                (f.signals || []).forEach(s => {
                    if (s.enumDict && s.enumDict.length > 0) {
                        const sName = (s.identifier || s.name || 'Signal').replace(/[^a-zA-Z0-9_]/g, '_');
                        const pairs = s.enumDict.map(e => `${e.value} "${e.label || ''}"`).join(' ');
                        out.push(`VAL_ ${dbcId} ${sName} ${pairs} ;`);
                    }
                });
            });

            return out.join('\n');
        }
    };

    // 挂载到全局
    global.ProtoView = global.ProtoView || {};
    global.ProtoView.CanHelper = CanHelper;
    global.CanHelper = CanHelper;

})(typeof window !== 'undefined' ? window : this);
