/**
 * serial.js - 串口通信协议核心助手 (UART / RS422 / RS485)
 * 工业与航电级字节时序流 (Byte Stream & Byte Span) 建模引擎
 * 支持连续字节排布、多字节字段跨度 (u16/i16/u32/f32 大小端)、Bit 位域细分、CRC 计算与上位机规范代码生成
 */

(function(global) {
    'use strict';

    // CRC-16 Modbus 查询表 (生成多项式 0xA001)
    const CRC16_MODBUS_TABLE = new Uint16Array([
        0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
        0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
        0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
        0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
        0xD801, 0x18C0, 0x1980, 0xD941, 0x1B00, 0xDBC1, 0xDA81, 0x1A40,
        0x1E00, 0xDEC1, 0xDF81, 0x1F40, 0xDD01, 0x1DC0, 0x1C80, 0xDC41,
        0x1400, 0xD4C1, 0xD581, 0x1540, 0xD701, 0x17C0, 0x1680, 0xD641,
        0xD201, 0x12C0, 0x1380, 0xD341, 0x1100, 0xD1C1, 0xD081, 0x1040,
        0xF001, 0x30C0, 0x3180, 0xF141, 0x3300, 0xF3C1, 0xF281, 0x3240,
        0x3600, 0xF6C1, 0xF781, 0x3740, 0xF501, 0x35C0, 0x3480, 0xF441,
        0x3C00, 0xFCC1, 0xFD81, 0x3D40, 0xFF01, 0x3FC0, 0x3E80, 0xFE41,
        0xFA01, 0x3AC0, 0x3B80, 0xFB41, 0x3900, 0xF9C1, 0xF881, 0x3840,
        0x2800, 0xE8C1, 0xE981, 0x2940, 0xEB01, 0x2BC0, 0x2A80, 0xEA41,
        0xEE01, 0x2EC0, 0x2F80, 0xEF41, 0x2D00, 0xEDC1, 0xEC81, 0x2C40,
        0xE401, 0x24C0, 0x2580, 0xE541, 0x2700, 0xE7C1, 0xE681, 0x2640,
        0x2200, 0xE2C1, 0xE381, 0x2340, 0xE101, 0x21C0, 0x2080, 0xE041,
        0xA001, 0x60C0, 0x6180, 0xA141, 0x6300, 0xA3C1, 0xA281, 0x6240,
        0x6600, 0xA6C1, 0xA781, 0x6740, 0xA501, 0x65C0, 0x6480, 0xA441,
        0x6C00, 0xACC1, 0xAD81, 0x6D40, 0xAF01, 0x6FC0, 0x6E80, 0xAE41,
        0xAA01, 0x6AC0, 0x6B80, 0xAB41, 0x6900, 0xA9C1, 0xA881, 0x6840,
        0x7800, 0xB8C1, 0xB981, 0x7940, 0xBB01, 0x7BC0, 0x7A80, 0xBA41,
        0xBE01, 0x7EC0, 0x7F80, 0xBF41, 0x7D00, 0xBDC1, 0xBC81, 0x7C40,
        0xB401, 0x74C0, 0x7580, 0xB541, 0x7700, 0xB7C1, 0xB681, 0x7640,
        0x7200, 0xB2C1, 0xB381, 0x7340, 0xB101, 0x71C0, 0x7080, 0xB041,
        0x5000, 0x90C1, 0x9181, 0x5140, 0x9301, 0x53C0, 0x5280, 0x9241,
        0x9601, 0x56C0, 0x5780, 0x9741, 0x5500, 0x95C1, 0x9481, 0x5440,
        0x9C01, 0x5CC0, 0x5D80, 0x9D41, 0x5F00, 0x9FC1, 0x9E81, 0x5E40,
        0x5A00, 0x9AC1, 0x9B81, 0x5B40, 0x9901, 0x59C0, 0x5880, 0x9841,
        0x8801, 0x48C0, 0x4980, 0x8941, 0x4B00, 0x8BC1, 0x8A81, 0x4A40,
        0x4E00, 0x8EC1, 0x8F81, 0x4F40, 0x8D01, 0x4DC0, 0x4C80, 0x8C41,
        0x4400, 0x84C1, 0x8581, 0x4540, 0x8701, 0x47C0, 0x4680, 0x8641,
        0x8201, 0x42C0, 0x4380, 0x8341, 0x4100, 0x81C1, 0x8081, 0x4040
    ]);

    // CRC-32 IEEE 802.3 查询表
    const CRC32_TABLE = (function() {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    const SerialHelper = {
        /**
         * 解析十六进制字符串为字节数组
         * 支持格式: "EB 90", "0xEB 0x90", "EB,90", "EB90"
         */
        parseHexBytes(hexStr) {
            if (!hexStr) return [];
            let clean = String(hexStr).replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
            if (clean.length % 2 !== 0) clean = '0' + clean;
            const bytes = [];
            for (let i = 0; i < clean.length; i += 2) {
                bytes.push(parseInt(clean.substr(i, 2), 16));
            }
            return bytes;
        },

        /**
         * 将字节数组格式化为大写空格分隔的 Hex 字符串
         */
        formatHexBytes(bytes, sep = ' ') {
            if (!bytes || !Array.isArray(bytes)) return '';
            return bytes.map(b => (b & 0xFF).toString(16).padStart(2, '0').toUpperCase()).join(sep);
        },

        /**
         * CRC-16 Modbus (返回 2 字节小端数组 [Low, High])
         */
        calcCRC16Modbus(bytes) {
            let crc = 0xFFFF;
            for (let i = 0; i < bytes.length; i++) {
                const idx = (crc ^ bytes[i]) & 0xFF;
                crc = (crc >>> 8) ^ CRC16_MODBUS_TABLE[idx];
            }
            return [crc & 0xFF, (crc >>> 8) & 0xFF];
        },

        /**
         * CRC-16 CCITT (返回 2 字节大端数组 [High, Low])
         */
        calcCRC16CCITT(bytes) {
            let crc = 0xFFFF;
            for (let i = 0; i < bytes.length; i++) {
                crc = ((crc << 8) & 0xFFFF) ^ CRC16_MODBUS_TABLE[((crc >>> 8) ^ bytes[i]) & 0xFF];
            }
            return [(crc >>> 8) & 0xFF, crc & 0xFF];
        },

        /**
         * 8位累加和校验 (返回 1 字节)
         */
        calcSum8(bytes) {
            let sum = 0;
            for (let i = 0; i < bytes.length; i++) {
                sum = (sum + bytes[i]) & 0xFF;
            }
            return [sum];
        },

        /**
         * 8位累加和取反校验 (返回 1 字节)
         */
        calcSum8Inv(bytes) {
            let sum = 0;
            for (let i = 0; i < bytes.length; i++) {
                sum = (sum + bytes[i]) & 0xFF;
            }
            return [(~sum) & 0xFF];
        },

        /**
         * 异或校验 XOR / BCC (返回 1 字节)
         */
        calcXOR(bytes) {
            let x = 0;
            for (let i = 0; i < bytes.length; i++) {
                x ^= bytes[i];
            }
            return [x & 0xFF];
        },

        /**
         * CRC-32 (返回 4 字节小端数组)
         */
        calcCRC32(bytes) {
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) {
                crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
            }
            crc = (crc ^ 0xFFFFFFFF) >>> 0;
            return [
                crc & 0xFF,
                (crc >>> 8) & 0xFF,
                (crc >>> 16) & 0xFF,
                (crc >>> 24) & 0xFF
            ];
        },

        /**
         * 统一根据校验类型计算校验码
         */
        calculateChecksum(bytes, type) {
            if (!type || type === 'none') return [];
            switch (type) {
                case 'crc16_modbus':
                    return this.calcCRC16Modbus(bytes);
                case 'crc16_ccitt':
                    return this.calcCRC16CCITT(bytes);
                case 'sum8':
                    return this.calcSum8(bytes);
                case 'sum8_inv':
                    return this.calcSum8Inv(bytes);
                case 'xor':
                    return this.calcXOR(bytes);
                case 'crc32':
                    return this.calcCRC32(bytes);
                default:
                    return [];
            }
        },

        /**
         * 获取字段数据类型所占用的默认字节数
         */
        getTypeByteCount(type) {
            switch (type) {
                case 'u8':
                case 'i8':
                case 'bool':
                    return 1;
                case 'u16':
                case 'i16':
                    return 2;
                case 'u32':
                case 'i32':
                case 'f32':
                    return 4;
                case 'hex':
                default:
                    return 1;
            }
        },

        /**
         * 格式化字段的字节跨度显示文本 (如: "Byte 0", "Byte 5~6 (2B)")
         */
        formatByteSpanText(offset, count) {
            const off = Number(offset) || 0;
            const cnt = Number(count) || 1;
            if (cnt <= 1) {
                return `Byte ${off}`;
            }
            return `Byte ${off}~${off + cnt - 1} (${cnt}B)`;
        },

        /**
         * 解析单字节内部位段表达式 (如 "bit0", "bit0-1", "bit0~7", "0-1", "0")
         * @param {string} rangeStr
         * @returns {{ start: number, end: number, count: number, mask: number, valid: boolean, text: string }}
         */
        parseBitRange(rangeStr) {
            if (!rangeStr) return { start: 0, end: 7, count: 8, mask: 0xFF, valid: true, text: 'bit0-7' };
            const str = String(rangeStr).trim().toLowerCase();
            const m = str.match(/^(?:bit)?\s*([0-7])\s*(?:[-~至到,]\s*(?:bit)?\s*([0-7]))?$/i);
            if (!m) {
                return { start: 0, end: 7, count: 8, mask: 0xFF, valid: false, text: str };
            }
            const b1 = parseInt(m[1], 10);
            const b2 = m[2] !== undefined ? parseInt(m[2], 10) : b1;
            const start = Math.min(b1, b2);
            const end = Math.max(b1, b2);
            const count = end - start + 1;
            const mask = ((1 << count) - 1);
            const text = (start === end) ? `bit${start}` : `bit${start}-${end}`;
            return { start, end, count, mask, valid: true, text };
        },

        /**
         * 自动顺序重排字段字节偏移 (消除空洞与重叠)
         */
        autoAssignByteOffsets(fields) {
            if (!fields || !Array.isArray(fields)) return 0;
            let currentOffset = 0;
            fields.forEach(f => {
                f.byteOffset = currentOffset;
                const count = Number(f.byteCount || this.getTypeByteCount(f.dataType));
                f.byteCount = count;
                currentOffset += count;
            });
            return currentOffset;
        },

        /**
         * 标准化数据包模型：保证 packet.fields 包含从 Byte 0 到帧尾完整的字节时序列表
         * (向下兼容旧格式，自动把外置的 header/addr/cmd/tail 汇入字段表)
         */
        normalizePacket(packet) {
            if (!packet) return null;
            if (!packet.fields) packet.fields = [];

            // 检查 fields 是否已经具备完整字节表结构 (是否有 0 偏移或 header 角色)
            const hasHeaderField = packet.fields.some(f => f.role === 'header' || f.byteOffset === 0);
            if (!hasHeaderField && (packet.headerHex || packet.cmd)) {
                // 旧结构迁移：按顺序拼接帧头、地址、CMD、长度、原载荷、校验、帧尾
                const newFields = [];
                let off = 0;

                // 1. 帧头
                const hBytes = this.parseHexBytes(packet.headerHex || 'EB 90');
                hBytes.forEach((b, idx) => {
                    newFields.push({
                        key: `header_${idx + 1}`,
                        name: `帧头第 ${idx + 1} 字节`,
                        role: 'header',
                        dataType: 'u8',
                        byteOffset: off++,
                        byteCount: 1,
                        endianness: 'none',
                        fixedHex: b.toString(16).padStart(2, '0').toUpperCase(),
                        defaultValue: b,
                        remark: '同步帧头'
                    });
                });

                // 2. 从机地址
                if (packet.useAddr !== false) {
                    const aBytes = this.parseHexBytes(packet.addrHex || '01');
                    newFields.push({
                        key: 'dev_addr',
                        name: '设备从机地址',
                        role: 'addr',
                        dataType: 'u8',
                        byteOffset: off++,
                        byteCount: 1,
                        endianness: 'none',
                        defaultValue: aBytes[0] || 1,
                        remark: '从机站号 (1~247)'
                    });
                }

                // 3. 命令功能码 CMD
                const cmdHex = (packet.cmd || '0x01').replace(/0x/i, '');
                newFields.push({
                    key: 'cmd_code',
                    name: '命令功能码 (CMD)',
                    role: 'cmd',
                    dataType: 'u8',
                    byteOffset: off++,
                    byteCount: 1,
                    endianness: 'none',
                    defaultValue: parseInt(cmdHex, 16) || 1,
                    remark: `功能码 0x${cmdHex.padStart(2, '0').toUpperCase()}`
                });

                // 4. 长度域
                const lenCnt = Number(packet.lengthBytes || 2);
                newFields.push({
                    key: 'payload_len',
                    name: '载荷长度域',
                    role: 'length',
                    dataType: lenCnt === 1 ? 'u8' : 'u16',
                    byteOffset: off,
                    byteCount: lenCnt,
                    endianness: packet.lengthEndian || 'little',
                    lengthMode: packet.lengthMode || 'payload',
                    defaultValue: packet.fields.length * 2,
                    remark: packet.lengthMode === 'total' ? '整包总字节数' : '有效数据载荷字节数'
                });
                off += lenCnt;

                // 5. 原载荷字段
                packet.fields.forEach(f => {
                    const cnt = Number(f.byteCount || this.getTypeByteCount(f.dataType));
                    const cloned = JSON.parse(JSON.stringify(f));
                    cloned.byteOffset = off;
                    cloned.byteCount = cnt;
                    if (!cloned.role) cloned.role = cloned.dataType === 'bool' || cloned.bitfields ? 'bitfield' : 'data';
                    newFields.push(cloned);
                    off += cnt;
                });

                // 6. 校验码
                if (packet.checksumType && packet.checksumType !== 'none') {
                    const isCrc32 = packet.checksumType === 'crc32';
                    const is16 = packet.checksumType.startsWith('crc16');
                    const cCnt = isCrc32 ? 4 : (is16 ? 2 : 1);
                    newFields.push({
                        key: 'checksum',
                        name: '数据校验码',
                        role: 'checksum',
                        dataType: isCrc32 ? 'u32' : (is16 ? 'u16' : 'u8'),
                        byteOffset: off,
                        byteCount: cCnt,
                        endianness: 'little',
                        checksumAlgo: packet.checksumType || 'crc16_modbus',
                        defaultValue: 0,
                        remark: '根据前序字节自动计算'
                    });
                    off += cCnt;
                }

                // 7. 帧尾
                if (packet.tailHex && packet.tailHex.trim()) {
                    const tBytes = this.parseHexBytes(packet.tailHex);
                    tBytes.forEach((b, idx) => {
                        newFields.push({
                            key: `frame_tail_${idx + 1}`,
                            name: `帧尾第 ${idx + 1} 字节`,
                            role: 'tail',
                            dataType: 'u8',
                            byteOffset: off++,
                            byteCount: 1,
                            endianness: 'none',
                            fixedHex: b.toString(16).padStart(2, '0').toUpperCase(),
                            defaultValue: b,
                            remark: '帧尾结束符'
                        });
                    });
                }

                packet.fields = newFields;
            }

            // 补充字段默认属性，确保鲁棒性
            packet.fields.forEach(f => {
                if (!f.role) f.role = 'data';
                if (!f.dataType) f.dataType = 'u8';
                if (!f.byteCount) f.byteCount = this.getTypeByteCount(f.dataType);
                if (!f.endianness) {
                    f.endianness = (f.byteCount > 1) ? 'little' : 'none';
                }

                // 规范化内部 signals 字段，确保与 429 起始位与占用长度标准完全一致
                if (f.signals && Array.isArray(f.signals)) {
                    f.signals.forEach(s => {
                        if (s.startBit === undefined || s.startBit === null || s.startBit === '') {
                            const parsed = this.parseBitRange(s.bitRange);
                            s.startBit = parsed.start;
                            s.bitCount = parsed.count;
                            s.length = parsed.count;
                            s.bitRange = parsed.text;
                        } else {
                            s.startBit = Math.max(0, Math.min(7, parseInt(s.startBit, 10) || 0));
                            s.bitCount = Math.max(1, Math.min(8, parseInt(s.bitCount || s.length, 10) || 1));
                            s.length = s.bitCount;
                            const end = s.startBit + s.bitCount - 1;
                            s.bitRange = `bit${s.startBit}${s.bitCount > 1 ? `-${end}` : ''}`;
                        }
                    });
                }
            });

            return packet;
        },

        /**
         * 计算整包总字节数
         */
        calcPacketTotalBytes(packet) {
            this.normalizePacket(packet);
            if (!packet || !packet.fields || packet.fields.length === 0) return 0;
            let total = 0;
            packet.fields.forEach(f => {
                const end = (Number(f.byteOffset) || 0) + (Number(f.byteCount) || 1);
                if (end > total) total = end;
            });
            return total;
        },

        /**
         * 根据字节表定义与各字段默认值生成完整仿真报文字节流
         */
        buildSimulatedPacket(packet) {
            this.normalizePacket(packet);
            if (!packet || !packet.fields || packet.fields.length === 0) {
                return { bytes: [], hexString: '', segments: [], totalBytes: 0, payloadBytes: 0 };
            }

            const totalBytes = this.calcPacketTotalBytes(packet);
            const buffer = new Uint8Array(totalBytes);
            const segments = [];

            // 第一阶段：填充固定头尾、地址、命令码、数据载荷与位域
            let payloadByteCount = 0;
            packet.fields.forEach(f => {
                const off = Number(f.byteOffset) || 0;
                const cnt = Number(f.byteCount) || 1;
                const endian = (f.endianness === 'big') ? false : true; // DataView 中 true 为小端 LE

                if (f.role === 'data' || f.role === 'bitfield') {
                    payloadByteCount += cnt;
                }

                if (off + cnt > totalBytes) return;
                const dv = new DataView(buffer.buffer, off, cnt);

                try {
                    switch (f.role) {
                        case 'header':
                        case 'tail':
                        case 'hex': {
                            const hexStr = f.fixedHex || (f.defaultValue !== undefined ? f.defaultValue.toString(16) : '00');
                            const bytes = this.parseHexBytes(hexStr);
                            for (let i = 0; i < Math.min(cnt, bytes.length); i++) {
                                buffer[off + i] = bytes[i];
                            }
                            break;
                        }
                        case 'addr':
                        case 'cmd': {
                            const num = Number(f.defaultValue !== undefined ? f.defaultValue : 1) & 0xFF;
                            buffer[off] = num;
                            break;
                        }
                        case 'bitfield': {
                            let bitmaskVal = 0;
                            if (f.bitfields && Array.isArray(f.bitfields) && f.bitfields.length > 0) {
                                f.bitfields.forEach(bf => {
                                    const bIdx = Number(bf.bit) || 0;
                                    const bitVal = (bf.defaultVal ? 1 : 0);
                                    bitmaskVal |= (bitVal << bIdx);
                                });
                            } else {
                                bitmaskVal = Number(f.defaultValue || 0);
                            }
                            if (cnt === 1) dv.setUint8(0, bitmaskVal & 0xFF);
                            else if (cnt === 2) dv.setUint16(0, bitmaskVal & 0xFFFF, endian);
                            break;
                        }
                        case 'data':
                        default: {
                            if (f.fixedHex !== undefined && f.fixedHex !== null && f.fixedHex !== '') {
                                const hBytes = this.parseHexBytes(f.fixedHex);
                                if (hBytes.length > 0) {
                                    buffer[off] = hBytes[0];
                                    break;
                                }
                            }
                            const rawEngVal = (f.defaultValue !== undefined && f.defaultValue !== '') ? Number(f.defaultValue) : 0;
                            const scale = (f.scale !== undefined && f.scale !== '') ? Number(f.scale) : 1;
                            const offset = (f.offset !== undefined && f.offset !== '') ? Number(f.offset) : 0;
                            let rawCode = rawEngVal;
                            if (!isNaN(scale) && scale !== 0) {
                                rawCode = (rawEngVal - offset) / scale;
                            }

                            switch (f.dataType) {
                                case 'u8': dv.setUint8(0, rawCode & 0xFF); break;
                                case 'i8': dv.setInt8(0, rawCode & 0xFF); break;
                                case 'u16': dv.setUint16(0, rawCode & 0xFFFF, endian); break;
                                case 'i16': dv.setInt16(0, rawCode & 0xFFFF, endian); break;
                                case 'u32': dv.setUint32(0, rawCode >>> 0, endian); break;
                                case 'i32': dv.setInt32(0, rawCode | 0, endian); break;
                                case 'f32': dv.setFloat32(0, rawCode, endian); break;
                                case 'bool': dv.setUint8(0, rawCode ? 1 : 0); break;
                                default: dv.setUint8(0, rawCode & 0xFF); break;
                            }
                            break;
                        }
                    }
                } catch (e) {
                    console.warn("SerialHelper: 字段填充异常:", f.name, e);
                }
            });

            // 第二阶段：回填长度域 (Length)
            packet.fields.forEach(f => {
                if (f.role === 'length') {
                    const off = Number(f.byteOffset) || 0;
                    const cnt = Number(f.byteCount) || 1;
                    const endian = (f.endianness === 'big') ? false : true;
                    const lenVal = (f.lengthMode === 'total') ? totalBytes : payloadByteCount;

                    const dv = new DataView(buffer.buffer, off, cnt);
                    if (cnt === 1) dv.setUint8(0, lenVal & 0xFF);
                    else if (cnt === 2) dv.setUint16(0, lenVal & 0xFFFF, endian);
                    else if (cnt === 4) dv.setUint32(0, lenVal >>> 0, endian);
                }
            });

            // 第三阶段：计算并填充校验码 (Checksum / CRC)
            packet.fields.forEach(f => {
                if (f.role === 'checksum') {
                    const off = Number(f.byteOffset) || 0;
                    const cnt = Number(f.byteCount) || 2;
                    const algo = f.checksumAlgo || 'crc16_modbus';
                    // 默认校验范围：从 Byte 0 到该校验码字段之前的全部字节
                    const checkTarget = buffer.slice(0, off);
                    const crcBytes = this.calculateChecksum(checkTarget, algo);

                    for (let i = 0; i < Math.min(cnt, crcBytes.length); i++) {
                        buffer[off + i] = crcBytes[i];
                    }
                }
            });

            // 构建切片段落用于彩色高亮条带渲染
            packet.fields.forEach((f, idx) => {
                const off = Number(f.byteOffset) || 0;
                const cnt = Number(f.byteCount) || 1;
                const slice = Array.from(buffer.slice(off, off + cnt));
                segments.push({
                    index: idx,
                    name: f.name || `字段_${idx + 1}`,
                    key: f.key,
                    role: f.role || 'data',
                    offset: off,
                    count: cnt,
                    spanText: this.formatByteSpanText(off, cnt),
                    hex: this.formatHexBytes(slice),
                    unit: f.unit || '',
                    dataType: f.dataType || 'u8'
                });
            });

            const hexString = this.formatHexBytes(Array.from(buffer));
            return {
                bytes: Array.from(buffer),
                hexString: hexString,
                segments: segments,
                totalBytes: totalBytes,
                payloadBytes: payloadByteCount
            };
        },

        /**
         * 反向解码 Hex 报文串，并精确提取各字节/字段的物理值与位域状态
         */
        decodePacket(hexStr, packet) {
            this.normalizePacket(packet);
            const bytes = this.parseHexBytes(hexStr);
            if (!bytes || bytes.length === 0) {
                return { success: false, error: '输入十六进制报文字符串为空或无效' };
            }

            const expectedTotal = this.calcPacketTotalBytes(packet);
            if (bytes.length < expectedTotal) {
                return { 
                    success: false, 
                    error: `报文长度不足：期望至少 ${expectedTotal} 字节，实际仅接收到 ${bytes.length} 字节`,
                    rawBytes: bytes
                };
            }

            const decodedFields = [];
            let checksumValid = true;
            let checksumFieldFound = false;

            packet.fields.forEach(f => {
                const off = Number(f.byteOffset) || 0;
                const cnt = Number(f.byteCount) || 1;
                const endian = (f.endianness === 'big') ? false : true;

                if (off + cnt > bytes.length) return;

                const rawSlice = bytes.slice(off, off + cnt);
                const rawHex = this.formatHexBytes(rawSlice);
                const dv = new DataView(new Uint8Array(rawSlice).buffer, 0, cnt);

                let rawVal = 0;
                let physVal = null;
                let formatted = '';
                let statusDesc = '';

                switch (f.role) {
                    case 'header':
                    case 'tail':
                    case 'hex': {
                        formatted = rawHex;
                        statusDesc = (f.fixedHex && rawHex.replace(/\s+/g, '').toUpperCase() === f.fixedHex.replace(/\s+/g, '').toUpperCase())
                            ? '符合特征' : '特征不匹配';
                        break;
                    }
                    case 'addr': {
                        rawVal = bytes[off];
                        formatted = `0x${rawVal.toString(16).padStart(2, '0').toUpperCase()} (${rawVal})`;
                        statusDesc = `从机站号 #${rawVal}`;
                        break;
                    }
                    case 'cmd': {
                        rawVal = bytes[off];
                        formatted = `0x${rawVal.toString(16).padStart(2, '0').toUpperCase()}`;
                        statusDesc = f.name;
                        break;
                    }
                    case 'length': {
                        if (cnt === 1) rawVal = dv.getUint8(0);
                        else if (cnt === 2) rawVal = dv.getUint16(0, endian);
                        else if (cnt === 4) rawVal = dv.getUint32(0, endian);
                        formatted = `${rawVal} 字节`;
                        statusDesc = f.lengthMode === 'total' ? '整包总长' : '载荷长度';
                        break;
                    }
                    case 'checksum': {
                        checksumFieldFound = true;
                        const algo = f.checksumAlgo || 'crc16_modbus';
                        const checkTarget = bytes.slice(0, off);
                        const expectedCrc = this.calculateChecksum(checkTarget, algo);
                        const actualCrc = rawSlice;

                        const isMatch = (expectedCrc.length === actualCrc.length) && expectedCrc.every((b, i) => b === actualCrc[i]);
                        checksumValid = isMatch;
                        formatted = rawHex;
                        statusDesc = isMatch ? '校验正确 (MATCH)' : `校验错误! (期望: ${this.formatHexBytes(expectedCrc)})`;
                        break;
                    }
                    case 'bitfield': {
                        if (cnt === 1) rawVal = dv.getUint8(0);
                        else if (cnt === 2) rawVal = dv.getUint16(0, endian);

                        const bitDetails = [];
                        if (f.bitfields && Array.isArray(f.bitfields)) {
                            f.bitfields.forEach(bf => {
                                const bIdx = Number(bf.bit) || 0;
                                const bitState = (rawVal >> bIdx) & 1;
                                const stateDesc = bitState ? (bf.desc1 || '1') : (bf.desc0 || '0');
                                bitDetails.push(`Bit${bIdx}[${bf.name}]: ${stateDesc}`);
                            });
                        }
                        formatted = `0x${rawVal.toString(16).padStart(cnt * 2, '0').toUpperCase()}`;
                        statusDesc = bitDetails.join('; ') || '8路开关量';
                        break;
                    }
                    case 'data':
                    default: {
                        switch (f.dataType) {
                            case 'u8': rawVal = dv.getUint8(0); break;
                            case 'i8': rawVal = dv.getInt8(0); break;
                            case 'u16': rawVal = dv.getUint16(0, endian); break;
                            case 'i16': rawVal = dv.getInt16(0, endian); break;
                            case 'u32': rawVal = dv.getUint32(0, endian); break;
                            case 'i32': rawVal = dv.getInt32(0, endian); break;
                            case 'f32': rawVal = dv.getFloat32(0, endian); break;
                            case 'bool': rawVal = dv.getUint8(0); break;
                            default: rawVal = dv.getUint8(0); break;
                        }

                        const scale = (f.scale !== undefined && f.scale !== '') ? Number(f.scale) : 1;
                        const offset = (f.offset !== undefined && f.offset !== '') ? Number(f.offset) : 0;
                        if (!isNaN(scale)) {
                            physVal = rawVal * scale + offset;
                            if (Number.isFinite(physVal) && !Number.isInteger(physVal)) {
                                physVal = parseFloat(physVal.toFixed(4));
                            }
                        } else {
                            physVal = rawVal;
                        }

                        formatted = `${physVal}`;
                        if (f.dict && f.dict[rawVal.toString()] !== undefined) {
                            statusDesc = f.dict[rawVal.toString()];
                        }
                        break;
                    }
                }

                decodedFields.push({
                    name: f.name,
                    key: f.key,
                    role: f.role,
                    byteOffset: off,
                    byteCount: cnt,
                    spanText: this.formatByteSpanText(off, cnt),
                    rawHex: rawHex,
                    rawVal: rawVal,
                    physical: physVal,
                    formatted: formatted,
                    unit: f.unit || '',
                    statusDesc: statusDesc,
                    remark: f.remark || ''
                });
            });

            return {
                success: true,
                totalBytes: bytes.length,
                payloadBytes: expectedTotal,
                checksumValid: checksumFieldFound ? checksumValid : true,
                fields: decodedFields
            };
        },

        /**
         * 预设高可用标准串口协议模板 (示范工业智能配电与传感器协议)
         */
        createDefaultSerialProtocol(name = '智能测控总线通信协议', targetProduct = '智能配电单元 RPDU', subtype = 'RS485') {
            return {
                name: name,
                product: targetProduct,
                type: 'Serial',
                subType: subtype,
                baudRate: 115200,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                device: '执行机构与传感器节点',
                direction: 'Tx/Rx',
                description: `工业与航电级串口总线规约 (${subtype} / 115200 bps / 8-N-1 / 紧凑时序流)`,
                packets: [
                    {
                        key: 'pkt_telemetry',
                        name: '遥测状态上报包',
                        cmd: '0x01',
                        direction: 'Tx',
                        period: 20,
                        fields: [
                            {
                                key: 'header_1',
                                name: '同步帧头 1',
                                byteOffset: 0,
                                byteCount: 1,
                                fixedHex: 'EB',
                                signals: [{ key: 'sig_hdr_1', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '同步帧头 1', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '固定帧头 0xEB' }]
                            },
                            {
                                key: 'header_2',
                                name: '同步帧头 2',
                                byteOffset: 1,
                                byteCount: 1,
                                fixedHex: '90',
                                signals: [{ key: 'sig_hdr_2', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '同步帧头 2', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '固定帧头 0x90' }]
                            },
                            {
                                key: 'dev_addr',
                                name: '从机设备地址',
                                byteOffset: 2,
                                byteCount: 1,
                                fixedHex: '01',
                                signals: [{ key: 'sig_addr', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '从机地址', dataType: 'u8', resolution: '', precision: '', min: '1', max: '247', unit: '', dict: {}, remark: '从机站号' }]
                            },
                            {
                                key: 'cmd_code',
                                name: '命令功能码 (CMD)',
                                byteOffset: 3,
                                byteCount: 1,
                                fixedHex: '01',
                                signals: [{ key: 'sig_cmd', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '功能码', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '0x01 遥测上报' }]
                            },
                            {
                                key: 'bus_volt_hi',
                                name: '母线电压高8位',
                                byteOffset: 4,
                                byteCount: 1,
                                fixedHex: '0A',
                                signals: [{ key: 'sig_volt_hi', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '母线电压高8位', dataType: 'u8', resolution: 0.1, precision: '', min: '0', max: '60.0', unit: 'V', dict: {}, remark: '物理电压高8位' }]
                            },
                            {
                                key: 'bus_volt_lo',
                                name: '母线电压低8位',
                                byteOffset: 5,
                                byteCount: 1,
                                fixedHex: '5B',
                                signals: [{ key: 'sig_volt_lo', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '母线电压低8位', dataType: 'u8', resolution: 0.1, precision: '', min: '0', max: '60.0', unit: 'V', dict: {}, remark: '物理电压低8位' }]
                            },
                            {
                                key: 'sys_status',
                                name: '系统运行状态字',
                                byteOffset: 6,
                                byteCount: 1,
                                fixedHex: '05',
                                signals: [
                                    { key: 'sig_st_0', startBit: 0, bitCount: 1, length: 1, bitRange: 'bit0', name: '主接触器通断', dataType: 'bool', dict: { '0': '断开 (OFF)', '1': '闭合 (ON)' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_1', startBit: 1, bitCount: 1, length: 1, bitRange: 'bit1', name: '预充回路状态', dataType: 'bool', dict: { '0': '未就绪', '1': '预充完成' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_2', startBit: 2, bitCount: 1, length: 1, bitRange: 'bit2', name: '母线过压告警', dataType: 'bool', dict: { '0': '正常', '1': '过压告警' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_3', startBit: 3, bitCount: 1, length: 1, bitRange: 'bit3', name: '母线过流告警', dataType: 'bool', dict: { '0': '正常', '1': '过流报警' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_4', startBit: 4, bitCount: 1, length: 1, bitRange: 'bit4', name: '绝缘监测状态', dataType: 'bool', dict: { '0': '绝缘良好', '1': '绝缘告警' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_5', startBit: 5, bitCount: 1, length: 1, bitRange: 'bit5', name: '急停开关状态', dataType: 'bool', dict: { '0': '正常释放', '1': '急停按下' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_6', startBit: 6, bitCount: 1, length: 1, bitRange: 'bit6', name: '就地/远程控制', dataType: 'bool', dict: { '0': '就地模式', '1': '远程上位机' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' },
                                    { key: 'sig_st_7', startBit: 7, bitCount: 1, length: 1, bitRange: 'bit7', name: '心跳翻转标志', dataType: 'bool', dict: { '0': '0', '1': '1' }, resolution: '', precision: '', min: '', max: '', unit: '', remark: '' }
                                ]
                            },
                            {
                                key: 'checksum',
                                name: '数据校验和 (Sum8)',
                                byteOffset: 7,
                                byteCount: 1,
                                fixedHex: '00',
                                signals: [{ key: 'sig_chk', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '累加和校验', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '8位累加和校验' }]
                            },
                            {
                                key: 'frame_tail',
                                name: '报文帧尾',
                                byteOffset: 8,
                                byteCount: 1,
                                fixedHex: '16',
                                signals: [{ key: 'sig_tail', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '报文帧尾', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '结束符 0x16' }]
                            }
                        ]
                    },
                    {
                        key: 'pkt_ctrl',
                        name: '配电控制下发包',
                        cmd: '0x02',
                        direction: 'Rx',
                        period: 100,
                        fields: [
                            {
                                key: 'header_1',
                                name: '同步帧头 1',
                                byteOffset: 0,
                                byteCount: 1,
                                fixedHex: 'EB',
                                signals: [{ key: 'sig_hdr_1', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '同步帧头 1', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '0xEB' }]
                            },
                            {
                                key: 'header_2',
                                name: '同步帧头 2',
                                byteOffset: 1,
                                byteCount: 1,
                                fixedHex: '90',
                                signals: [{ key: 'sig_hdr_2', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '同步帧头 2', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '0x90' }]
                            },
                            {
                                key: 'dev_addr',
                                name: '从机设备地址',
                                byteOffset: 2,
                                byteCount: 1,
                                fixedHex: '01',
                                signals: [{ key: 'sig_addr', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '从机地址', dataType: 'u8', resolution: '', precision: '', min: '1', max: '247', unit: '', dict: {}, remark: '0x01' }]
                            },
                            {
                                key: 'cmd_code',
                                name: '控制功能码 (CMD)',
                                byteOffset: 3,
                                byteCount: 1,
                                fixedHex: '02',
                                signals: [{ key: 'sig_cmd', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '功能码', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '0x02 配电控制' }]
                            },
                            {
                                key: 'target_channel',
                                name: '目标供电通道',
                                byteOffset: 4,
                                byteCount: 1,
                                fixedHex: '01',
                                signals: [{ key: 'sig_ch', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '通道号', dataType: 'u8', resolution: '', precision: '', min: '1', max: '8', unit: 'CH', dict: {}, remark: '通道编号 1~8' }]
                            },
                            {
                                key: 'action_cmd',
                                name: '动作指令代码',
                                byteOffset: 5,
                                byteCount: 1,
                                fixedHex: '01',
                                signals: [{
                                    key: 'sig_act',
                                    startBit: 0,
                                    bitCount: 8,
                                    length: 8,
                                    bitRange: 'bit0-7',
                                    name: '动作指令',
                                    dataType: 'u8',
                                    resolution: '',
                                    precision: '',
                                    min: '',
                                    max: '',
                                    unit: '',
                                    dict: { '0': '关断供电 (OFF)', '1': '接通供电 (ON)', '2': '故障复位 (RESET)' },
                                    remark: '0:关, 1:开, 2:复位'
                                }]
                            },
                            {
                                key: 'checksum',
                                name: '数据校验和 (Sum8)',
                                byteOffset: 6,
                                byteCount: 1,
                                fixedHex: '00',
                                signals: [{ key: 'sig_chk', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '校验和', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '8位累加和' }]
                            },
                            {
                                key: 'frame_tail',
                                name: '报文帧尾',
                                byteOffset: 7,
                                byteCount: 1,
                                fixedHex: '16',
                                signals: [{ key: 'sig_tail', startBit: 0, bitCount: 8, length: 8, bitRange: 'bit0-7', name: '帧尾', dataType: 'u8', resolution: '', precision: '', min: '', max: '', unit: '', dict: {}, remark: '结束符 0x16' }]
                            }
                        ]
                    }
                ]
            };
        },

        /**
         * 生成串口通信协议标准 Markdown 说明书
         */
        generateMarkdownSpec(protocol) {
            if (!protocol) return '# 无有效串口协议\n';
            const pName = protocol.name || '串口通信协议';
            const pProduct = protocol.product ? ` [所属产品: ${protocol.product}]` : '';
            const pSubtype = protocol.subType || 'RS485';
            const baud = protocol.baudRate || 115200;
            const parityMap = { 'odd': '奇校验 (Odd)', 'even': '偶校验 (Even)', 'none': '无校验 (None)' };
            const parityStr = parityMap[protocol.parity] || '无校验';
            const formatStr = `${protocol.dataBits || 8}-${(protocol.parity || 'none')[0].toUpperCase()}-${protocol.stopBits || 1}`;
            const dev = protocol.device || '传感器/执行器节点';
            const desc = protocol.description || '';

            let md = `# ${pName}${pProduct} - 串口通信规约与 ICD 接口定义\n\n`;
            md += `### 1. 通信总线物理层参数\n\n`;
            md += `| 接口总线类型 | 波特率 (Baud Rate) | 数据格式 (Data-Parity-Stop) | 默认周期 (Period) | 对端设备 / 节点 | 通信模式 |\n`;
            md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
            md += `| **${pSubtype}** | ${baud} bps | ${formatStr} (${parityStr}) | ${protocol.period || 20} ms | ${dev} | ${protocol.direction || 'Tx/Rx'} |\n\n`;
            if (desc) {
                md += `> **协议概述**: ${desc}\n\n`;
            }

            const packets = protocol.packets || [];
            if (packets.length === 0) {
                md += `> 当前协议尚未配置数据包。\n\n`;
                return md;
            }

            md += `### 2. 协议数据包时序与字节布局\n\n`;

            packets.forEach((pkt, pIdx) => {
                const totalBytes = this.calcPacketTotalBytes ? this.calcPacketTotalBytes(pkt) : (pkt.fields ? pkt.fields.length : 0);
                const isTx = (pkt.direction === 'Rx') ? 'Rx (接收)' : 'Tx (发送)';
                const pktPeriod = pkt.period !== undefined ? pkt.period : (protocol.period || 20);

                md += `#### 2.${pIdx + 1} 数据包: ${pkt.name || `数据包 ${pIdx + 1}`} (${isTx})\n\n`;
                md += `- **功能定义**: ${pkt.name || '未命名包'}\n`;
                if (pkt.cmd) md += `- **命令功能码 (CMD)**: \`${pkt.cmd}\`\n`;
                md += `- **传输方向**: ${isTx}\n`;
                md += `- **通信周期**: ${pktPeriod} ms\n`;
                md += `- **整包总长**: ${totalBytes} 字节 (Bytes)\n\n`;

                md += `| 字节偏移 (Offset) | 字段名称 | 默认 Hex | 数据类型 | 跨度 | 比例 (LSB) | 物理量程 | 单位 | 状态枚举 / 备注说明 |\n`;
                md += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

                const fields = pkt.fields || [];
                fields.forEach((f, fIdx) => {
                    const off = f.byteOffset !== undefined ? f.byteOffset : fIdx;
                    const cnt = f.byteCount || 1;
                    const spanText = cnt > 1 ? `Byte ${off}~${off + cnt - 1} (${cnt}B)` : `Byte ${off}`;
                    const defHex = f.fixedHex ? `0x${f.fixedHex}` : (f.defaultValue !== undefined ? `0x${Number(f.defaultValue).toString(16).padStart(cnt * 2, '0').toUpperCase()}` : '-');
                    const dType = f.dataType || 'u8';
                    const scale = f.scale !== undefined && f.scale !== '' ? f.scale : (f.resolution !== undefined ? f.resolution : 1.0);
                    const range = (f.min !== undefined && f.min !== '' && f.max !== undefined && f.max !== '') ? `${f.min} ~ ${f.max}` : '-';
                    const unit = f.unit || '-';

                    let dictOrRemark = [];
                    if (f.dict && typeof f.dict === 'object' && Object.keys(f.dict).length > 0) {
                        const dictStr = Object.entries(f.dict).map(([k, v]) => `${k}:${v}`).join('; ');
                        dictOrRemark.push(`枚举: [${dictStr}]`);
                    }
                    if (f.signals && Array.isArray(f.signals) && f.signals.length > 0) {
                        const bitDescs = f.signals.map(s => {
                            const dStr = (s.dict && Object.keys(s.dict).length > 0) ? ` (${Object.entries(s.dict).map(([k,v]) => `${k}:${v}`).join(',')})` : '';
                            return `${s.bitRange || `bit${s.startBit}`}: ${s.name || ''}${dStr}`;
                        }).join('; ');
                        if (bitDescs) dictOrRemark.push(`Bit细分: ${bitDescs}`);
                    }
                    if (f.remark) dictOrRemark.push(f.remark);
                    const descStr = dictOrRemark.join(' | ') || '-';

                    md += `| **${spanText}** | **${f.name || '未命名'}** | \`${defHex}\` | \`${dType}\` | ${cnt} Byte | ${scale} | ${range} | ${unit} | ${descStr} |\n`;
                });
                md += `\n---\n\n`;
            });

            return md;
        },

        /**
         * 生成串口通信协议标准可打印独立 HTML 说明书 (支持打印/PDF)
         */
        generateHtmlSpec(protocol) {
            if (!protocol) return '<h1>无有效协议</h1>';
            const pName = protocol.name || '串口通信协议';
            const pProduct = protocol.product ? ` [${protocol.product}]` : '';
            const pSubtype = protocol.subType || 'RS485';
            const baud = protocol.baudRate || 115200;
            const parityMap = { 'odd': '奇校验 (Odd)', 'even': '偶校验 (Even)', 'none': '无校验 (None)' };
            const parityStr = parityMap[protocol.parity] || '无校验';
            const formatStr = `${protocol.dataBits || 8}-${(protocol.parity || 'none')[0].toUpperCase()}-${protocol.stopBits || 1}`;
            const dev = protocol.device || '传感器/执行器节点';
            const packets = protocol.packets || [];

            let packetsHtml = '';
            packets.forEach((pkt, pIdx) => {
                const totalBytes = this.calcPacketTotalBytes ? this.calcPacketTotalBytes(pkt) : (pkt.fields ? pkt.fields.length : 0);
                const isTx = (pkt.direction === 'Rx') ? 'Rx (接收)' : 'Tx (发送)';
                const pktPeriod = pkt.period !== undefined ? pkt.period : (protocol.period || 20);

                let rowsHtml = '';
                const fields = pkt.fields || [];
                fields.forEach((f, fIdx) => {
                    const off = f.byteOffset !== undefined ? f.byteOffset : fIdx;
                    const cnt = f.byteCount || 1;
                    const spanText = cnt > 1 ? `Byte ${off}~${off + cnt - 1}` : `Byte ${off}`;
                    const defHex = f.fixedHex ? `0x${f.fixedHex}` : (f.defaultValue !== undefined ? `0x${Number(f.defaultValue).toString(16).padStart(cnt * 2, '0').toUpperCase()}` : '-');
                    const dType = f.dataType || 'u8';
                    const scale = f.scale !== undefined && f.scale !== '' ? f.scale : (f.resolution !== undefined ? f.resolution : 1.0);
                    const range = (f.min !== undefined && f.min !== '' && f.max !== undefined && f.max !== '') ? `${f.min} ~ ${f.max}` : '-';
                    const unit = f.unit || '-';

                    let noteHtml = [];
                    if (f.dict && typeof f.dict === 'object' && Object.keys(f.dict).length > 0) {
                        const dictStr = Object.entries(f.dict).map(([k, v]) => `<code>${k}</code>: ${v}`).join(', ');
                        noteHtml.push(`<div><b>状态字典:</b> ${dictStr}</div>`);
                    }
                    if (f.signals && Array.isArray(f.signals) && f.signals.length > 0) {
                        const bitStr = f.signals.map(s => {
                            const dStr = (s.dict && Object.keys(s.dict).length > 0) ? ` (${Object.entries(s.dict).map(([k,v]) => `${k}:${v}`).join(',')})` : '';
                            return `[${s.bitRange || `bit${s.startBit}`}] ${s.name || ''}${dStr}`;
                        }).join('; ');
                        noteHtml.push(`<div><b>位域开关:</b> ${bitStr}</div>`);
                    }
                    if (f.remark) noteHtml.push(`<div><b>备注:</b> ${f.remark}</div>`);

                    rowsHtml += `
                        <tr>
                            <td style="text-align:center; font-weight:700; background:#f8fafc;">${spanText}</td>
                            <td style="font-weight:600;">${f.name || '未命名'}</td>
                            <td style="text-align:center; font-family:monospace;">${defHex}</td>
                            <td style="text-align:center;"><code>${dType}</code></td>
                            <td style="text-align:center;">${scale}</td>
                            <td style="text-align:center;">${range}</td>
                            <td style="text-align:center;">${unit}</td>
                            <td style="font-size:11.5px;">${noteHtml.join('') || '-'}</td>
                        </tr>
                    `;
                });

                packetsHtml += `
                    <div class="packet-block" style="margin-bottom: 24px; page-break-inside: avoid; break-inside: avoid;">
                        <div class="packet-hdr" style="background: #0f172a; color:#fff; padding: 8px 12px; border-radius: 4px 4px 0 0; display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:14px; font-weight:bold;">第 ${pIdx + 1} 包：${pkt.name || '数据包'}</span>
                            <span style="font-size:12px; color:#cbd5e1;">方向: <b>${isTx}</b> · 周期: <b>${pktPeriod}ms</b> · 总长: <b>${totalBytes} Bytes</b> ${pkt.cmd ? `· CMD: <b>${pkt.cmd}</b>` : ''}</span>
                        </div>
                        <table style="width:100%; border-collapse:collapse; border:1px solid #cbd5e1; font-size:12.5px;">
                            <thead>
                                <tr style="background:#f1f5f9; text-align:center; font-weight:bold; border-bottom:1.5px solid #0f172a;">
                                    <th style="padding:6px; width:100px;">字节偏移</th>
                                    <th style="padding:6px;">字段名称</th>
                                    <th style="padding:6px; width:70px;">默认Hex</th>
                                    <th style="padding:6px; width:70px;">类型</th>
                                    <th style="padding:6px; width:70px;">比例(LSB)</th>
                                    <th style="padding:6px; width:90px;">有效量程</th>
                                    <th style="padding:6px; width:60px;">单位</th>
                                    <th style="padding:6px;">说明与字典</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${pName} - 串口通信协议规格书</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #1e293b; }
    .page-container { max-width: 1040px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .no-print-bar { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 10px 16px; border-radius: 6px; margin-bottom: 24px; border: 1px solid #e2e8f0; }
    .btn-action { background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; }
    .doc-header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .doc-title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; }
    .doc-meta { font-size: 12px; color: #64748b; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12.5px; }
    table td, table th { border: 1px solid #cbd5e1; padding: 6px 8px; }
    @media print {
      body { background: #fff; padding: 0; }
      .page-container { box-shadow: none; padding: 0; max-width: 100%; }
      .no-print-bar { display: none !important; }
      .packet-block { page-break-inside: avoid !important; break-inside: avoid !important; }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="no-print-bar">
      <span><strong>串口协议 ICD 规格说明书</strong> (源自 ProtoView 工业通信总线设计系统)</span>
      <button class="btn-action" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
    </div>
    <div class="doc-header">
      <div>
        <h1 class="doc-title">${pName}${pProduct}</h1>
        <div class="doc-meta">物理总线: <b>${pSubtype}</b> | 波特率: <b>${baud} bps</b> | 格式: <b>${formatStr}</b> (${parityStr}) | 对端: <b>${dev}</b></div>
      </div>
      <div class="doc-meta" style="text-align: right;">
        <div>规约体系: 串口时序字节流</div>
        <div>导出时间: ${new Date().toLocaleDateString()}</div>
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

    global.SerialHelper = SerialHelper;

})(typeof window !== 'undefined' ? window : this);
