/**
 * ARINC 429 核心编解码与航电总线辅助库
 * 符合 ARINC Specification 429-18 航电标准
 */
class Arinc429Helper {
    /**
     * 将 3 位八进制字符串 (如 "203") 转换为 8 位整型数值 (如 0x83)
     */
    static octalToLabelByte(octalStr) {
        if (!octalStr) return 0;
        const clean = octalStr.toString().trim();
        const val = parseInt(clean, 8);
        return isNaN(val) ? 0 : (val & 0xFF);
    }

    /**
     * 将 8 位数值转换为 3 位标准八进制字符串 (如 0x83 -> "203")
     */
    static labelByteToOctal(byteVal) {
        const val = (byteVal || 0) & 0xFF;
        return val.toString(8).padStart(3, '0');
    }

    /**
     * 计算奇偶校验位 (Bit 32)
     */
    static calculateParity(word32, mode = 'odd') {
        if (mode === 'none') return 0;
        let count = 0;
        let temp = BigInt(word32) & 0x7FFFFFFFn;
        while (temp > 0n) {
            if (temp & 1n) count++;
            temp >>= 1n;
        }
        return mode === 'odd' ? (count % 2 === 0 ? 1 : 0) : (count % 2 === 1 ? 1 : 0);
    }

    /**
     * 校验 32 位字的奇偶性
     */
    static verifyParity(word32, mode = 'odd') {
        if (mode === 'none') return true;
        let count = 0;
        let temp = BigInt(word32) & 0xFFFFFFFFn;
        while (temp > 0n) {
            if (temp & 1n) count++;
            temp >>= 1n;
        }
        return mode === 'odd' ? (count % 2 === 1) : (count % 2 === 0);
    }

    /**
     * 从 32 位整型中提取指定位段 (1-based, 1~32)
     */
    static extractBitRange(word32, startBit, length) {
        const w = BigInt(word32) & 0xFFFFFFFFn;
        const shift = BigInt(startBit - 1);
        const mask = (1n << BigInt(length)) - 1n;
        return Number((w >> shift) & mask);
    }

    /**
     * 将数值设置到 32 位的指定位段中
     */
    static setBitRange(word32, startBit, length, value) {
        let w = BigInt(word32) & 0xFFFFFFFFn;
        const shift = BigInt(startBit - 1);
        const mask = (1n << BigInt(length)) - 1n;
        const clearMask = ~(mask << shift) & 0xFFFFFFFFn;
        w = (w & clearMask) | ((BigInt(value) & mask) << shift);
        return w & 0xFFFFFFFFn;
    }

    /**
     * 字节序反转 (多字节字段在大端 MSB 与小端 LSB 间转换)
     */
    static reverseByteOrder(val, bitCount) {
        if (bitCount <= 8) return val;
        const byteCount = Math.ceil(bitCount / 8);
        let reversed = 0;
        let v = Number(val);
        for (let i = 0; i < byteCount; i++) {
            const byte = (v >> (i * 8)) & 0xFF;
            reversed = (reversed << 8) | byte;
        }
        return reversed;
    }

    /**
     * 规范化字段位段 (自由Bit模式默认从Bit 9起始，支持依次根据前一个字段累加计算)
     */
    static recalculateBitStreamSpans(fields) {
        let currentBit = 9;
        return fields.map((f, idx) => {
            const count = Number(f.bitCount || f.length || 1);
            let start;
            if (idx === 0) {
                start = (f.startBit !== undefined && f.startBit !== null && f.startBit !== '') ? Number(f.startBit) : 9;
            } else {
                start = currentBit;
            }
            const end = start + count - 1;
            currentBit = end + 1;
            return {
                ...f,
                startBit: start,
                length: count,
                bitCount: count,
                endBit: end,
                endianness: f.endianness || 'big'
            };
        });
    }

    /**
     * 完整解码一个 32 位 ARINC 429 字
     */
    static decodeFullWord(hexOrWord, wordDefinition = {}) {
        let word32 = 0n;
        if (typeof hexOrWord === 'string') {
            const clean = hexOrWord.replace(/0x/gi, '').replace(/[^0-9A-Fa-f]/g, '');
            word32 = BigInt('0x' + clean);
        } else {
            word32 = BigInt(hexOrWord) & 0xFFFFFFFFn;
        }

        const labelByte = Number(word32 & 0xFFn);
        const labelOctal = this.labelByteToOctal(labelByte);
        const sdi = Number((word32 >> 8n) & 0x03n);
        const ssm = Number((word32 >> 29n) & 0x03n);
        const parityBit = Number((word32 >> 31n) & 0x01n);
        const parityMode = wordDefinition.parity || 'odd';
        const parityValid = this.verifyParity(word32, parityMode);
        const dataPayload = Number((word32 >> 10n) & 0x7FFFFn);

        const sdiDescriptions = (wordDefinition.sdiDict) || {
            0: '00 (所有系统)',
            1: '01 (系统1/左)',
            2: '10 (系统2/右)',
            3: '11 (系统3/备用)'
        };

        const ssmDescriptions = (wordDefinition.ssmDict) || {
            0: '00: 正常运算 (Normal)',
            1: '01: NCD (无计算数据)',
            2: '10: FT (功能测试)',
            3: '11: 故障告警 (Fail)'
        };

        // 解码字段
        const decodedFields = [];
        let fieldsList = wordDefinition.signals || wordDefinition.fields || [];

        // 如果是自由 bit 模式，先计算位段 (保持用户设定的起始位)
        if (wordDefinition.editMode === 'bitstream') {
            fieldsList = this.recalculateBitStreamSpans(fieldsList);
        }

        fieldsList.forEach(field => {
            const startBit = Number(field.startBit) || 1;
            const length = Number(field.bitCount || field.length || 1);
            const scale = parseFloat(field.resolution || field.scale) || 1.0;
            const offset = parseFloat(field.offset) || 0.0;
            const rawType = (field.dataType || '').toLowerCase();
            const dataType = (rawType === 'bool' || rawType === 'discrete') ? 'bool' : ((rawType === 'u8' || length <= 8) ? 'u8' : 'u16');
            const endianness = dataType === 'u16' ? (field.endianness || 'big') : 'none';
            let rawVal = this.extractBitRange(word32, startBit, length);

            if (dataType === 'u16' && endianness === 'little') {
                rawVal = this.reverseByteOrder(rawVal, length);
            }

            let physVal = dataType === 'bool' ? (rawVal !== 0 ? 1 : 0) : (rawVal * scale + offset);
            let displayVal = dataType === 'bool' ? (rawVal !== 0 ? 'true (1)' : 'false (0)') : physVal.toString();

            // 如果有数据字典映射
            if (field.dict && field.dict[rawVal] !== undefined) {
                displayVal = `${field.dict[rawVal]} (0x${rawVal.toString(16).toUpperCase()})`;
            } else if (dataType !== 'bool' && field.precision !== undefined && !isNaN(parseFloat(field.precision))) {
                const dec = Math.max(0, (field.precision.toString().split('.')[1] || '').length);
                displayVal = physVal.toFixed(dec);
            }

            decodedFields.push({
                key: field.key || field.name,
                name: field.name,
                dataType: dataType,
                startBit: startBit,
                length: length,
                bitCount: length,
                endianness: endianness,
                resolution: scale,
                precision: field.precision || '0.1',
                offset: offset,
                min: field.min !== undefined ? field.min : null,
                max: field.max !== undefined ? field.max : null,
                unit: field.unit || '',
                rawValue: rawVal,
                rawHex: '0x' + rawVal.toString(16).toUpperCase(),
                physicalValue: physVal,
                formatted: displayVal,
                dict: field.dict || {}
            });
        });

        const bin32Str = word32.toString(2).padStart(32, '0');
        const hexStr = '0x' + word32.toString(16).toUpperCase().padStart(8, '0');

        return {
            word32: Number(word32),
            hex: hexStr,
            binary: bin32Str,
            source: wordDefinition.source || '未知来源',
            label: {
                octal: labelOctal,
                byte: labelByte,
                hex: '0x' + labelByte.toString(16).toUpperCase().padStart(2, '0')
            },
            sdi: {
                value: sdi,
                desc: sdiDescriptions[sdi] || `SDI: ${sdi}`
            },
            ssm: {
                value: ssm,
                desc: ssmDescriptions[ssm] || `SSM: ${ssm}`
            },
            parity: {
                bit: parityBit,
                mode: parityMode,
                valid: parityValid
            },
            dataPayload: {
                raw: dataPayload,
                hex: '0x' + dataPayload.toString(16).toUpperCase()
            },
            signals: decodedFields,
            fields: decodedFields
        };
    }

    /**
     * 编码生成 32 位字
     */
    static encodeFullWord(params) {
        let w = 0n;
        const mode = params.editMode || 'classic';

        if (mode === 'classic') {
            // 经典模式：Label (1-8), SDI (9-10), Data (11-29), SSM (30-31), Parity (32)
            const labelByte = this.octalToLabelByte(params.labelOctal || '000');
            w = this.setBitRange(w, 1, 8, labelByte);

            const sdiVal = (Number(params.sdi) || 0) & 0x03;
            w = this.setBitRange(w, 9, 2, sdiVal);

            const fields = params.signalsConfig || [];
            const values = params.signalValues || {};

            fields.forEach(field => {
                const start = Number(field.startBit) || 11;
                const len = Number(field.bitCount || field.length) || 1;
                const userVal = values[field.name] !== undefined ? values[field.name] : (field.defaultValue || 0);
                const scale = parseFloat(field.resolution || field.scale) || 1.0;
                const offset = parseFloat(field.offset) || 0.0;
                const rawType = (field.dataType || '').toLowerCase();
                const dataType = (rawType === 'bool' || rawType === 'discrete') ? 'bool' : ((rawType === 'u8' || len <= 8) ? 'u8' : 'u16');
                const endianness = dataType === 'u16' ? (field.endianness || 'big') : 'none';
                let rawVal = (dataType === 'bool') ? (userVal ? 1 : 0) : Math.round((parseFloat(userVal) - offset) / scale);
                rawVal = Math.max(0, Math.min((1 << len) - 1, rawVal));
                if (dataType === 'u16' && endianness === 'little') {
                    rawVal = this.reverseByteOrder(rawVal, len);
                }
                w = this.setBitRange(w, start, len, rawVal);
            });

            const ssmVal = (Number(params.ssm) || 0) & 0x03;
            w = this.setBitRange(w, 30, 2, ssmVal);

            const pBit = this.calculateParity(w, params.parityMode || 'odd');
            w = this.setBitRange(w, 32, 1, pBit);
        } else {
            // 自由 Bit 模式：Label (1-8), 自由字段 (默认从9开始，位于9-29位), SSM (30-31), 校验 (32)
            const labelByte = this.octalToLabelByte(params.labelOctal || '000');
            w = this.setBitRange(w, 1, 8, labelByte);

            let fields = params.signalsConfig || [];
            fields = this.recalculateBitStreamSpans(fields);
            const values = params.signalValues || {};

            fields.forEach(field => {
                const start = Number(field.startBit) || 9;
                const len = Number(field.bitCount || field.length) || 1;
                if (start <= 32) {
                    const actualLen = Math.min(len, 32 - start + 1);
                    const userVal = values[field.name] !== undefined ? values[field.name] : (field.defaultValue || 0);
                    const scale = parseFloat(field.resolution || field.scale) || 1.0;
                    const offset = parseFloat(field.offset) || 0.0;
                    const rawType = (field.dataType || '').toLowerCase();
                    const dataType = (rawType === 'bool' || rawType === 'discrete') ? 'bool' : ((rawType === 'u8' || actualLen <= 8) ? 'u8' : 'u16');
                    const endianness = dataType === 'u16' ? (field.endianness || 'big') : 'none';
                    let rawVal = (dataType === 'bool') ? (userVal ? 1 : 0) : Math.round((parseFloat(userVal) - offset) / scale);
                    rawVal = Math.max(0, Math.min((1 << actualLen) - 1, rawVal));
                    if (dataType === 'u16' && endianness === 'little') {
                        rawVal = this.reverseByteOrder(rawVal, actualLen);
                    }
                    w = this.setBitRange(w, start, actualLen, rawVal);
                }
            });

            // SSM 也占用两个 bit (Bits 30-31)
            const ssmVal = (Number(params.ssm) || 0) & 0x03;
            w = this.setBitRange(w, 30, 2, ssmVal);

            // 校验位 (Bit 32)
            const pBit = this.calculateParity(w, params.parityMode || 'odd');
            w = this.setBitRange(w, 32, 1, pBit);
        }

        const hexStr = '0x' + w.toString(16).toUpperCase().padStart(8, '0');
        const binStr = w.toString(2).padStart(32, '0');

        return {
            word32: Number(w),
            hex: hexStr,
            binary: binStr
        };
    }

    /**
     * 生成面向 AI 开发上位机的标准 Markdown 协议表格规范
     * 每个数据字对应一张完整独立的字段映射表格
     */
    static generateMarkdownSpec(protocol) {
        if (!protocol) return '# 无有效协议\n';
        const pName = protocol.name || 'ARINC 429 通信协议';
        const pDevice = protocol.device || protocol.source || 'ADC (大气数据计算机)';
        const pSpeed = protocol.speed || '100kbps';
        const pParity = protocol.parity === 'odd' ? '奇校验 (Bit 32, Odd)' : (protocol.parity === 'even' ? '偶校验 (Bit 32, Even)' : '无校验');
        const pMode = protocol.mode === 'bitstream' ? '自由 Bit 流模式 (32位自定义)' : '经典航电模式 (有效载荷 Bits 11~29)';
        const pDir = protocol.direction || 'Tx';
        const words = protocol.words || [];

        let md = `# ${pName} - ARINC 429 通信协议表格规范\n\n`;
        md += `> **给 AI 的系统提示词 (Prompt Context)**：\n`;
        md += `> 本文档为航空电子设备 **ARINC 429 总线上位机通信协议规范**。请根据下方汇总表及**各数据字的详细字段分配表**，编写上位机软件总线通信解析、遥测监控界面或驱动程序（如 C#/WPF、C++/Qt、Python 等）。每个数据字均为 32 位（Bit 1~32），请严格按照表格中定义的**起始 Bit、占用位数、数据类型、字节序与分辨率**进行位提取与工程量转换。\n\n`;

        md += `## 一、协议全局参数\n\n`;
        md += `| 参数项 | 配置值 | 说明 |\n`;
        md += `| :--- | :--- | :--- |\n`;
        md += `| **协议名称** | ${pName} | 机载通信总线协议工程名称 |\n`;
        md += `| **总线类型** | ARINC 429 | 航电串行双绞线数字传输总线 |\n`;
        md += `| **对端设备** | ${pDevice} | 交互的目标机载设备系统 |\n`;
        md += `| **默认传输方向** | ${pDir === 'Tx' ? 'Tx (上位机发送/下行)' : 'Rx (上位机接收/上行)'} | 上位机通信方向 |\n`;
        md += `| **总线调度周期** | ${protocol.period || 20} ms | 协议全局统一总线调度发送周期 |\n`;
        md += `| **总线传输波特率** | ${pSpeed} | ${pSpeed === '100kbps' ? '高速模式 (100 kbps, 周期脉冲)' : '低速模式 (12.5 kbps)'} |\n`;
        md += `| **奇偶校验规则** | ${pParity} | ARINC 429 标准 Bit 32 奇偶性检查 |\n`;
        md += `| **字段划分模式** | ${pMode} | 数据字内部有效载荷的分配形式 |\n`;
        if (protocol.description) {
            md += `| **协议说明备注** | ${protocol.description} | 工程背景及技术说明 |\n`;
        }
        md += `| **数据字数量** | 共 ${words.length} 个标号字 | 协议中包含的全部数据字总数 |\n\n`;

        md += `## 二、标号字汇总列表 (全部数据字总览)\n\n`;
        md += `| 序号 | 标号 (八进制) | 标号 (十六进制) | 数据字名称 | 方向 | 调度模式 | 发送周期 | 字段数 |\n`;
        md += `| :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: |\n`;
        words.forEach((w, idx) => {
            const oct = (w.label || '000').toString().padStart(3, '0');
            const byteVal = this.octalToLabelByte(oct);
            const hex = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
            const sendModeStr = w.sendMode === 'event' ? '事件触发' : '周期发送';
            const sigCount = (w.signals || []).length;
            md += `| ${idx + 1} | \`${oct}₈\` | \`${hex}\` | **${w.name || '未命名'}** | ${w.direction || pDir} | ${sendModeStr} | ${protocol.period || w.period || 20} ms | ${sigCount} |\n`;
        });
        md += `\n`;

        md += `## 三、数据字详细定义与字段映射表\n\n`;
        words.forEach((w, idx) => {
            const oct = (w.label || '000').toString().padStart(3, '0');
            const byteVal = this.octalToLabelByte(oct);
            const hex = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
            const fields = w.signals || [];
            const sendModeStr = w.sendMode === 'event' ? '事件触发' : '周期发送';

            const isBitstream = (protocol && protocol.mode === 'bitstream') || (w.editMode === 'bitstream');
            let ssmDictStr = '';
            if (w.ssmDict && Object.keys(w.ssmDict).length > 0) {
                ssmDictStr = ' [' + Object.entries(w.ssmDict).map(([k, v]) => `${k}:${v}`).join(', ') + ']';
            }
            let sdiDictStr = '';
            if (!isBitstream && w.sdiDict && Object.keys(w.sdiDict).length > 0) {
                sdiDictStr = ' [' + Object.entries(w.sdiDict).map(([k, v]) => `${k}:${v}`).join(', ') + ']';
            }

            md += `### 数据字 #${idx + 1}：标号 ${oct}₈ (${hex}) - ${w.name || '未命名数据字'}\n\n`;
            md += `- **通信方向**: \`${w.direction || pDir}\`\n`;
            md += `- **调度属性**: 发送周期: \`${protocol.period || w.period || 20} ms\` (协议全局统一)\n`;
            if (isBitstream) {
                md += `- **总线标志位**: SSM 状态: \`${w.ssm !== undefined ? w.ssm : 0}\` (Bits 30~31)${ssmDictStr} | 校验: \`${pParity}\` (Bit 32)\n\n`;
            } else {
                md += `- **总线标志位**: SDI 识别码: \`${w.sdi !== undefined ? w.sdi : 0}\` (Bits 9~10)${sdiDictStr} | SSM 状态: \`${w.ssm !== undefined ? w.ssm : 0}\` (Bits 30~31)${ssmDictStr} | 校验: \`${pParity}\` (Bit 32)\n\n`;
            }

            if (fields.length === 0) {
                md += `> *说明：此数据字当前暂未划分具体字段*\n\n`;
            } else {
                md += `| 序号 | 字段名称 | 数据类型 | 起始Bit | 占用Bit | 位段范围 | 字节序 | 分辨率 | 精度 | 范围 | 单位 | 状态字典 / 编码含义 | 备注 |\n`;
                md += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |\n`;

                fields.forEach((f, fIdx) => {
                    const start = Number(f.startBit || 1);
                    const count = Number(f.bitCount || f.length || 1);
                    const end = start + count - 1;
                    const rangeStr = `B${start}${count > 1 ? `~B${end}` : ''}`;
                    
                    // 归一化类型 (严格限制为 bool / u8 / u16)
                    let rawType = (f.dataType || '').toLowerCase();
                    let dType = 'u16';
                    if (rawType === 'bool' || rawType === 'discrete') dType = 'bool';
                    else if (rawType === 'u8' || count <= 8) dType = 'u8';
                    else dType = 'u16';

                    // 字节序 (仅 u16 有字节序)
                    let endianStr = '-';
                    if (dType === 'u16') {
                        endianStr = (f.endianness === 'little') ? '小端(LSB)' : '大端(MSB)';
                    }

                    // 分辨率、精度、范围、单位、备注默认情况下都是空的 (未填写则显示 '-')
                    const resVal = (f.resolution !== undefined && f.resolution !== null && f.resolution !== '') ? f.resolution : '-';
                    const precVal = (f.precision !== undefined && f.precision !== null && f.precision !== '') ? f.precision : ((f.offset !== undefined && f.offset !== null && f.offset !== '') ? f.offset : '-');
                    const minStr = (f.min !== undefined && f.min !== null && f.min !== '') ? f.min : '';
                    const maxStr = (f.max !== undefined && f.max !== null && f.max !== '') ? f.max : '';
                    const rangeVal = (minStr !== '' || maxStr !== '') ? `${minStr} ~ ${maxStr}` : '-';
                    const unitStr = (f.unit !== undefined && f.unit !== null && f.unit !== '') ? f.unit : '-';
                    const remarkStr = (f.remark || f.desc || f.comment || '').trim() || '-';

                    // 状态字典映射
                    let dictStr = '-';
                    const dict = f.dict || {};
                    const dictEntries = Object.entries(dict);
                    if (dictEntries.length > 0) {
                        dictStr = dictEntries.map(([k, v]) => `\`${k}\`:${v}`).join('; ');
                    }

                    md += `| ${fIdx + 1} | **${f.name || '未命名'}** | \`${dType}\` | ${start} | ${count} | \`${rangeStr}\` | ${endianStr} | ${resVal} | ${precVal} | ${rangeVal} | ${unitStr} | ${dictStr} | ${remarkStr} |\n`;
                });
                md += `\n`;
            }

            md += `---\n\n`;
        });

        return md;
    }
}

/**
 * ARINC 429 上位机代码与规范生成器
 * 面向上位机软件架构设计 (C/C++ 驱动头文件、C# MVVM 遥测模型、Python 自动化测试脚本、标准 JSON 规范)
 */
class UpperComputerCodeGen {
    /**
     * 将字符串转换为合法的编程语言标识符 (英文字母、数字与下划线)
     */
    static toSafeIdentifier(str, fallback = 'item') {
        if (!str) return fallback;
        let clean = str.trim().replace(/[^a-zA-Z0-9_]/g, '_');
        if (/^[0-9]/.test(clean)) clean = '_' + clean;
        clean = clean.replace(/_+/g, '_').replace(/^_|_$/g, '');
        return clean || fallback;
    }

    /**
     * 转 PascalCase 帕斯卡命名 (如 baro_altitude -> BaroAltitude)
     */
    static toPascalCase(str, fallback = 'Item') {
        const id = this.toSafeIdentifier(str, fallback);
        return id.split('_')
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('') || fallback;
    }

    /**
     * 转 camelCase 驼峰命名 (如 baro_altitude -> baroAltitude)
     */
    static toCamelCase(str, fallback = 'item') {
        const pascal = this.toPascalCase(str, fallback);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }

    /**
     * 获取 C 语言数据类型 (严格对应 bool, u8 -> uint8_t, u16 -> uint16_t)
     */
    static getCType(field) {
        const type = (field.dataType || '').toLowerCase();
        if (type === 'bool' || type === 'discrete') return 'bool';
        if (type === 'u8' || type === 'uint8' || type === 'uint8_t') return 'uint8_t';
        if (type === 'u16' || type === 'uint16' || type === 'uint16_t') return 'uint16_t';
        const bits = Number(field.bitCount || field.length || 1);
        if (bits <= 1) return 'bool';
        if (bits <= 8) return 'uint8_t';
        return 'uint16_t';
    }

    /**
     * 获取 C# 语言数据类型 (严格对应 bool, u8 -> byte, u16 -> ushort)
     */
    static getCSharpType(field) {
        const type = (field.dataType || '').toLowerCase();
        if (type === 'bool' || type === 'discrete') return 'bool';
        if (type === 'u8' || type === 'uint8' || type === 'uint8_t') return 'byte';
        if (type === 'u16' || type === 'uint16' || type === 'uint16_t') return 'ushort';
        const bits = Number(field.bitCount || field.length || 1);
        if (bits <= 1) return 'bool';
        if (bits <= 8) return 'byte';
        return 'ushort';
    }

    /**
     * 1. 生成 C / C++ 驱动头文件 (.h)
     */
    static generateCHeader(protocol) {
        if (!protocol) return '/* 无有效协议 */';
        const pName = protocol.name || 'ARINC 429 协议';
        const pDevice = protocol.device || protocol.source || 'ADC';
        const pSpeed = protocol.speed || '100kbps';
        const pParity = protocol.parity || 'odd';
        const pMacroGuard = this.toSafeIdentifier(pName, 'ARINC429_PROTOCOL').toUpperCase() + '_H';
        const words = protocol.words || [];

        let out = `/**\n`;
        out += ` * @file arinc429_protocol.h\n`;
        out += ` * @brief ARINC 429 机载总线上位机通信驱动头文件\n`;
        out += ` * @protocol ${pName}\n`;
        out += ` * @device ${pDevice}\n`;
        out += ` * @speed ${pSpeed} | 奇偶校验: ${pParity}\n`;
        out += ` * @generated 自动生成于 ${new Date().toLocaleString()}\n`;
        out += ` */\n\n`;

        out += `#ifndef ${pMacroGuard}\n`;
        out += `#define ${pMacroGuard}\n\n`;
        out += `#include <stdint.h>\n`;
        out += `#include <stdbool.h>\n`;
        out += `#include <string.h>\n\n`;
        out += `#ifdef __cplusplus\nextern "C" {\n#endif\n\n`;

        out += `/* ==================== 1. 协议总线宏定义 ==================== */\n`;
        out += `#define ARINC_PROTOCOL_NAME   "${pName}"\n`;
        out += `#define ARINC_REMOTE_DEVICE   "${pDevice}"\n`;
        out += `#define ARINC_BUS_SPEED       "${pSpeed}"\n`;
        out += `#define ARINC_BUS_PERIOD_MS   ${protocol.period || 20}       /* 协议全局统一总线调度发送周期 (ms) */\n\n`;

        out += `/* ==================== 2. 标号字定义与调度定时 ==================== */\n`;
        words.forEach(w => {
            const octal = (w.label || '000').toString().padStart(3, '0');
            const byteVal = Arinc429Helper.octalToLabelByte(octal);
            const hex = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
            const key = w.key || this.toSafeIdentifier(w.name, `word_${octal}`);
            const upperKey = key.toUpperCase();
            const period = protocol.period || w.period || 20;
            const timeout = w.timeoutMs || (period * 3);

            out += `/* 标号字: ${w.name || key} (${octal}₈) */\n`;
            out += `#define ARINC_LABEL_${upperKey}         0${octal}    /* ${hex} (8-bit) */\n`;
            out += `#define ARINC_PERIOD_${upperKey}_MS     ARINC_BUS_PERIOD_MS      /* 发送/接收周期 (ms) */\n`;
            out += `#define ARINC_TIMEOUT_${upperKey}_MS    ${timeout}     /* 超时失联告警门限 (ms) */\n`;
            out += `#define ARINC_CHANNEL_${upperKey}       "${w.channel || 'CH1'}"\n\n`;
        });

        out += `/* ==================== 3. 遥测数据结构体定义 ==================== */\n`;
        words.forEach(w => {
            const octal = (w.label || '000').toString().padStart(3, '0');
            const key = w.key || this.toSafeIdentifier(w.name, `word_${octal}`);
            const pascal = this.toPascalCase(key);
            const fields = w.signals || [];

            out += `/**\n`;
            out += ` * @brief ${w.name || key} (${octal}₈) 遥测数据包\n`;
            out += ` * 调度模式: ${w.sendMode || 'cyclic'} | 通道: ${w.channel || 'CH1'} | 方向: ${w.direction || 'Tx'}\n`;
            out += ` */\n`;
            out += `typedef struct {\n`;
            fields.forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                const cType = this.getCType(f);
                const unitStr = f.unit ? ` [${f.unit}]` : '';
                const lsbStr = f.resolution !== undefined ? `LSB: ${f.resolution}` : 'LSB: 1.0';
                const rangeStr = (f.min !== undefined && f.max !== undefined && f.min !== null) ? `, Range: [${f.min}, ${f.max}]` : '';
                const remarkStr = f.remark ? ` - 备注: ${f.remark}` : '';
                out += `    ${cType.padEnd(10)} ${fKey.padEnd(20)}; /* ${f.name}${unitStr} (${lsbStr}${rangeStr})${remarkStr} */\n`;
            });
            out += `    uint8_t    sdi;                 /* SDI 识别码 (Bits 9~10) */\n`;
            out += `    uint8_t    ssm;                 /* SSM 状态矩阵 (Bits 30~31) */\n`;
            out += `    bool       parity_valid;        /* 奇偶校验有效性标志 (Bit 32) */\n`;
            out += `    uint32_t   raw_word32;          /* 原始 32-bit 航电字 */\n`;
            out += `} Arinc429_${pascal}_t;\n\n`;
        });

        out += `/* ==================== 4. 解码与编码内联函数 ==================== */\n`;
        words.forEach(w => {
            const octal = (w.label || '000').toString().padStart(3, '0');
            const byteVal = Arinc429Helper.octalToLabelByte(octal);
            const hex = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
            const key = w.key || this.toSafeIdentifier(w.name, `word_${octal}`);
            const pascal = this.toPascalCase(key);
            const fields = w.signals || [];

            // 解码函数
            out += `/**\n * @brief 解码 32 位原始字至 ${pascal} 结构体\n */\n`;
            out += `static inline bool Arinc429_Decode_${pascal}(uint32_t raw_word, Arinc429_${pascal}_t* out_data) {\n`;
            out += `    if (!out_data) return false;\n`;
            out += `    uint8_t label = (uint8_t)(raw_word & 0xFF);\n`;
            out += `    if (label != ${hex}) return false;\n`;
            out += `    out_data->raw_word32 = raw_word;\n`;
            out += `    out_data->sdi = (uint8_t)((raw_word >> 8) & 0x03);\n`;
            out += `    out_data->ssm = (uint8_t)((raw_word >> 29) & 0x03);\n`;
            out += `    out_data->parity_valid = true; /* 可调用 parity 检查 */\n`;

            fields.forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                const start = Number(f.startBit || 1);
                const count = Number(f.bitCount || f.length || 1);
                const shift = start - 1;
                const mask = count >= 32 ? '0xFFFFFFFFU' : `((1U << ${count}) - 1U)`;
                const scale = parseFloat(f.resolution || 1.0);
                const offset = parseFloat(f.offset || 0.0);
                const cType = this.getCType(f);

                out += `    /* 字段: ${f.name} (B${start}~B${start + count - 1}, ${f.dataType || cType}) */\n`;
                out += `    uint32_t raw_${fKey} = (raw_word >> ${shift}) & ${mask};\n`;
                if (f.dataType === 'u16' && f.endianness === 'little') {
                    out += `    /* u16 小端反转 (LSB) */\n`;
                    out += `    raw_${fKey} = ((raw_${fKey} & 0xFF) << 8) | ((raw_${fKey} >> 8) & 0xFF);\n`;
                }
                if (f.dataType === 'bool') {
                    out += `    out_data->${fKey} = (raw_${fKey} != 0);\n`;
                } else if (scale !== 1.0 || offset !== 0.0) {
                    out += `    out_data->${fKey} = (${cType})(raw_${fKey} * ${scale}f + ${offset}f);\n`;
                } else {
                    out += `    out_data->${fKey} = (${cType})raw_${fKey};\n`;
                }
            });

            out += `    return true;\n`;
            out += `}\n\n`;

            // 编码打包函数
            out += `/**\n * @brief 将 ${pascal} 结构体打包为 32 位 ARINC 429 原始字\n */\n`;
            out += `static inline uint32_t Arinc429_Encode_${pascal}(const Arinc429_${pascal}_t* in_data) {\n`;
            out += `    if (!in_data) return 0;\n`;
            out += `    uint32_t w = ${hex}; /* Label: ${octal}₈ */\n`;
            out += `    w |= ((uint32_t)(in_data->sdi & 0x03) << 8);\n`;
            out += `    w |= ((uint32_t)(in_data->ssm & 0x03) << 29);\n`;

            fields.forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                const start = Number(f.startBit || 1);
                const count = Number(f.bitCount || f.length || 1);
                const shift = start - 1;
                const mask = count >= 32 ? '0xFFFFFFFFU' : `((1U << ${count}) - 1U)`;
                const scale = parseFloat(f.resolution || 1.0);
                const offset = parseFloat(f.offset || 0.0);

                if (f.dataType === 'bool') {
                    out += `    uint32_t raw_${fKey} = (in_data->${fKey} ? 1U : 0U) & ${mask};\n`;
                } else if (f.dataType === 'u16' && f.endianness === 'little') {
                    out += `    uint32_t raw_${fKey} = (uint32_t)in_data->${fKey} & 0xFFFFU;\n`;
                    out += `    raw_${fKey} = (((raw_${fKey} & 0xFF) << 8) | ((raw_${fKey} >> 8) & 0xFF)) & ${mask};\n`;
                } else if (scale !== 1.0 || offset !== 0.0) {
                    out += `    uint32_t raw_${fKey} = (uint32_t)((in_data->${fKey} - ${offset}f) / ${scale}f) & ${mask};\n`;
                } else {
                    out += `    uint32_t raw_${fKey} = ((uint32_t)in_data->${fKey}) & ${mask};\n`;
                }
                out += `    w |= (raw_${fKey} << ${shift});\n`;
            });

            out += `    /* 计算奇偶校验位 (Bit 32) */\n`;
            out += `    uint32_t temp = w & 0x7FFFFFFFU, c = 0;\n`;
            out += `    while (temp) { c += (temp & 1); temp >>= 1; }\n`;
            out += `    if ((c % 2) == 0) w |= (1U << 31); /* 奇校验 */\n`;
            out += `    return w;\n`;
            out += `}\n\n`;
        });

        out += `#ifdef __cplusplus\n}\n#endif\n\n`;
        out += `#endif /* ${pMacroGuard} */\n`;
        return out;
    }

    /**
     * 2. 生成 C# MVVM 遥测模型 (.cs)
     */
    static generateCSharp(protocol) {
        if (!protocol) return '// 无有效协议';
        const pName = protocol.name || 'ARINC 429 协议';
        const pDevice = protocol.device || protocol.source || 'ADC';
        const words = protocol.words || [];

        let out = `// <auto-generated>\n`;
        out += `// ARINC 429 上位机 MVVM 遥测数据模型与编解码器\n`;
        out += `// 协议名称: ${pName}\n`;
        out += `// 目标设备: ${pDevice}\n`;
        out += `// 生成时间: ${new Date().toLocaleString()}\n`;
        out += `// </auto-generated>\n\n`;

        out += `using System;\n`;
        out += `using System.ComponentModel;\n`;
        out += `using System.Runtime.CompilerServices;\n\n`;
        out += `namespace Avionics.Arinc429\n{\n`;

        // 基础位操作工具类
        out += `    public static class ArincCodecHelper\n    {\n`;
        out += `        public static uint ExtractBits(uint word, int startBit, int length)\n        {\n`;
        out += `            uint mask = length >= 32 ? 0xFFFFFFFF : ((1u << length) - 1u);\n`;
        out += `            return (word >> (startBit - 1)) & mask;\n`;
        out += `        }\n\n`;
        out += `        public static uint SetBits(uint word, int startBit, int length, uint value)\n        {\n`;
        out += `            uint mask = length >= 32 ? 0xFFFFFFFF : ((1u << length) - 1u);\n`;
        out += `            uint clearMask = ~(mask << (startBit - 1));\n`;
        out += `            return (word & clearMask) | ((value & mask) << (startBit - 1));\n`;
        out += `        }\n\n`;
        out += `        public static bool CheckOddParity(uint word)\n        {\n`;
        out += `            uint count = 0, temp = word;\n`;
        out += `            while (temp > 0) { count += (temp & 1); temp >>= 1; }\n`;
        out += `            return (count % 2) == 1;\n`;
        out += `        }\n\n`;
        out += `        public static uint CalcOddParity(uint word)\n        {\n`;
        out += `            uint count = 0, temp = word & 0x7FFFFFFF;\n`;
        out += `            while (temp > 0) { count += (temp & 1); temp >>= 1; }\n`;
        out += `            return (count % 2 == 0) ? 1u : 0u;\n`;
        out += `        }\n`;
        out += `    }\n\n`;

        // 为每个字生成 MVVM Telemetry Model
        words.forEach(w => {
            const octal = (w.label || '000').toString().padStart(3, '0');
            const byteVal = Arinc429Helper.octalToLabelByte(octal);
            const hex = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
            const key = w.key || this.toSafeIdentifier(w.name, `word_${octal}`);
            const pascal = this.toPascalCase(key);
            const fields = w.signals || [];
            const period = protocol.period || w.period || 20;
            const timeout = w.timeoutMs || (period * 3);

            out += `    /// <summary>\n`;
            out += `    /// ${w.name || key} (Label: ${octal}₈)\n`;
            out += `    /// 周期: ${period}ms | 超时门限: ${timeout}ms | 调度模式: ${w.sendMode || 'cyclic'} | 通道: ${w.channel || 'CH1'}\n`;
            out += `    /// </summary>\n`;
            out += `    public class ${pascal}Telemetry : INotifyPropertyChanged\n    {\n`;
            out += `        public const string LabelOctal = "${octal}";\n`;
            out += `        public const byte LabelHex = ${hex};\n`;
            out += `        public const int PeriodMs = ${period};\n`;
            out += `        public const int TimeoutMs = ${timeout};\n`;
            out += `        public const string Channel = "${w.channel || 'CH1'}";\n`;
            out += `        public const string Direction = "${w.direction || 'Tx'}";\n`;
            out += `        public const string SendMode = "${w.sendMode || 'cyclic'}";\n\n`;

            // 私有字段与公开属性 (带 MVVM 通知)
            fields.forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                const propName = this.toPascalCase(fKey);
                const fieldName = '_' + this.toCamelCase(fKey);
                const csType = this.getCSharpType(f);
                const unitStr = f.unit ? ` (${f.unit})` : '';

                const remarkStr = f.remark ? ` | 备注: ${f.remark}` : '';
                out += `        private ${csType} ${fieldName};\n`;
                out += `        /// <summary>${f.name}${unitStr} (LSB: ${f.resolution || 1.0})${remarkStr}</summary>\n`;
                out += `        public ${csType} ${propName}\n        {\n`;
                out += `            get => ${fieldName};\n`;
                out += `            set { if (!Equals(${fieldName}, value)) { ${fieldName} = value; OnPropertyChanged(); } }\n`;
                out += `        }\n\n`;
            });

            // 状态属性
            out += `        private byte _sdi;\n        public byte Sdi { get => _sdi; set { _sdi = value; OnPropertyChanged(); } }\n\n`;
            out += `        private byte _ssm;\n        public byte Ssm { get => _ssm; set { _ssm = value; OnPropertyChanged(); } }\n\n`;
            out += `        private bool _isParityValid;\n        public bool IsParityValid { get => _isParityValid; set { _isParityValid = value; OnPropertyChanged(); } }\n\n`;
            out += `        private uint _rawWord;\n        public uint RawWord { get => _rawWord; set { _rawWord = value; OnPropertyChanged(); } }\n\n`;

            out += `        public event PropertyChangedEventHandler PropertyChanged;\n`;
            out += `        protected virtual void OnPropertyChanged([CallerMemberName] string propName = null) =>\n`;
            out += `            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propName));\n\n`;

            // 解码方法
            out += `        public static ${pascal}Telemetry Decode(uint raw)\n        {\n`;
            out += `            var model = new ${pascal}Telemetry { RawWord = raw };\n`;
            out += `            model.IsParityValid = ArincCodecHelper.CheckOddParity(raw);\n`;
            out += `            model.Sdi = (byte)ArincCodecHelper.ExtractBits(raw, 9, 2);\n`;
            out += `            model.Ssm = (byte)ArincCodecHelper.ExtractBits(raw, 30, 2);\n\n`;

            fields.forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                const propName = this.toPascalCase(fKey);
                const start = Number(f.startBit || 1);
                const count = Number(f.bitCount || f.length || 1);
                const scale = parseFloat(f.resolution || 1.0);
                const offset = parseFloat(f.offset || 0.0);
                const csType = this.getCSharpType(f);

                if (f.dataType === 'discrete' || f.dataType === 'bool') {
                    out += `            model.${propName} = ArincCodecHelper.ExtractBits(raw, ${start}, ${count}) != 0;\n`;
                } else if (f.dataType === 'u16' && f.endianness === 'little') {
                    out += `            uint raw_${fKey} = ArincCodecHelper.ExtractBits(raw, ${start}, ${count});\n`;
                    out += `            raw_${fKey} = ((raw_${fKey} & 0xFF) << 8) | ((raw_${fKey} >> 8) & 0xFF);\n`;
                    if (scale !== 1.0 || offset !== 0.0) {
                        out += `            model.${propName} = (ushort)(raw_${fKey} * ${scale} + ${offset});\n`;
                    } else {
                        out += `            model.${propName} = (ushort)raw_${fKey};\n`;
                    }
                } else if (scale !== 1.0 || offset !== 0.0) {
                    out += `            model.${propName} = (${csType})((ArincCodecHelper.ExtractBits(raw, ${start}, ${count}) * ${scale}) + ${offset});\n`;
                } else {
                    out += `            model.${propName} = (${csType})ArincCodecHelper.ExtractBits(raw, ${start}, ${count});\n`;
                }
            });

            out += `            return model;\n        }\n\n`;

            // 编码方法
            out += `        public uint Encode()\n        {\n`;
            out += `            uint w = ${hex};\n`;
            out += `            w = ArincCodecHelper.SetBits(w, 9, 2, Sdi);\n`;
            out += `            w = ArincCodecHelper.SetBits(w, 30, 2, Ssm);\n\n`;

            fields.forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                const propName = this.toPascalCase(fKey);
                const start = Number(f.startBit || 1);
                const count = Number(f.bitCount || f.length || 1);
                const scale = parseFloat(f.resolution || 1.0);
                const offset = parseFloat(f.offset || 0.0);

                if (f.dataType === 'discrete' || f.dataType === 'bool') {
                    out += `            w = ArincCodecHelper.SetBits(w, ${start}, ${count}, (uint)(${propName} ? 1 : 0));\n`;
                } else if (f.dataType === 'u16' && f.endianness === 'little') {
                    out += `            uint raw_${fKey} = (uint)${propName};\n`;
                    out += `            raw_${fKey} = ((raw_${fKey} & 0xFF) << 8) | ((raw_${fKey} >> 8) & 0xFF);\n`;
                    out += `            w = ArincCodecHelper.SetBits(w, ${start}, ${count}, raw_${fKey});\n`;
                } else if (scale !== 1.0 || offset !== 0.0) {
                    out += `            uint raw_${fKey} = (uint)Math.Round((${propName} - ${offset}) / ${scale});\n`;
                    out += `            w = ArincCodecHelper.SetBits(w, ${start}, ${count}, raw_${fKey});\n`;
                } else {
                    out += `            w = ArincCodecHelper.SetBits(w, ${start}, ${count}, (uint)${propName});\n`;
                }
            });

            out += `            uint pBit = ArincCodecHelper.CalcOddParity(w);\n`;
            out += `            w = ArincCodecHelper.SetBits(w, 32, 1, pBit);\n`;
            out += `            return w;\n        }\n`;

            out += `    }\n\n`;
        });

        out += `}\n`;
        return out;
    }

    /**
     * 3. 生成 Python 自动化测试脚本 (.py)
     */
    static generatePython(protocol) {
        if (!protocol) return '# 无有效协议';
        const pName = protocol.name || 'ARINC 429 协议';
        const pDevice = protocol.device || protocol.source || 'ADC';
        const words = protocol.words || [];

        let out = `"""\n`;
        out += `ARINC 429 上位机自动化测试与总线编解码驱动\n`;
        out += `协议名称: ${pName}\n`;
        out += `对端设备: ${pDevice}\n`;
        out += `生成时间: ${new Date().toLocaleString()}\n`;
        out += `"""\n\n`;

        out += `import struct\n`;
        out += `from typing import Dict, Any, Optional\n\n`;

        out += `class Arinc429Protocol:\n`;
        out += `    NAME = "${pName}"\n`;
        out += `    DEVICE = "${pDevice}"\n`;
        out += `    SPEED = "${protocol.speed || '100kbps'}"\n`;
        out += `    PARITY = "${protocol.parity || 'odd'}"\n`;
        out += `    PERIOD_MS = ${protocol.period || 20}\n\n`;

        out += `    # 标号字字典规范\n`;
        out += `    WORD_REGISTRY = {\n`;
        words.forEach(w => {
            const octal = (w.label || '000').toString().padStart(3, '0');
            const key = w.key || this.toSafeIdentifier(w.name, `word_${octal}`);
            out += `        "${octal}": {\n`;
            out += `            "key": "${key}",\n`;
            out += `            "name": "${w.name || key}",\n`;
            out += `            "period_ms": ${protocol.period || w.period || 20},\n`;
            out += `            "timeout_ms": ${w.timeoutMs || ((w.period || 20) * 3)},\n`;
            out += `            "channel": "${w.channel || 'CH1'}",\n`;
            out += `            "direction": "${w.direction || 'Tx'}",\n`;
            out += `            "send_mode": "${w.sendMode || 'cyclic'}",\n`;
            out += `            "fields": [\n`;
            (w.signals || []).forEach((f, fIdx) => {
                const fKey = f.key || this.toSafeIdentifier(f.name, `sig_${fIdx + 1}`);
                out += `                {\n`;
                out += `                    "key": "${fKey}",\n`;
                out += `                    "name": "${f.name}",\n`;
                out += `                    "data_type": "${f.dataType || 'u16'}",\n`;
                out += `                    "start_bit": ${f.startBit || 1},\n`;
                out += `                    "bit_count": ${f.bitCount || f.length || 1},\n`;
                out += `                    "endianness": "${f.dataType === 'u16' ? (f.endianness || 'big') : 'none'}",\n`;
                out += `                    "scale": ${f.resolution || 1.0},\n`;
                out += `                    "offset": ${f.offset || 0.0},\n`;
                out += `                    "unit": "${f.unit || ''}",\n`;
                out += `                    "min": ${f.min !== undefined && f.min !== null ? f.min : 'None'},\n`;
                out += `                    "max": ${f.max !== undefined && f.max !== null ? f.max : 'None'},\n`;
                out += `                    "remark": "${f.remark || ''}"\n`;
                out += `                },\n`;
            });
            out += `            ]\n`;
            out += `        },\n`;
        });
        out += `    }\n\n`;

        out += `    @staticmethod\n`;
        out += `    def extract_bits(word32: int, start_bit: int, bit_count: int) -> int:\n`;
        out += `        mask = (1 << bit_count) - 1\n`;
        out += `        return (word32 >> (start_bit - 1)) & mask\n\n`;

        out += `    @staticmethod\n`;
        out += `    def set_bits(word32: int, start_bit: int, bit_count: int, value: int) -> int:\n`;
        out += `        mask = (1 << bit_count) - 1\n`;
        out += `        clear_mask = ~(mask << (start_bit - 1)) & 0xFFFFFFFF\n`;
        out += `        return (word32 & clear_mask) | ((value & mask) << (start_bit - 1))\n\n`;

        out += `    @classmethod\n`;
        out += `    def decode(cls, raw_word32: int) -> Optional[Dict[str, Any]]:\n`;
        out += `        """解码 32 位 ARINC 429 数据字"""\n`;
        out += `        label_byte = raw_word32 & 0xFF\n`;
        out += `        label_octal = oct(label_byte)[2:].zfill(3)\n`;
        out += `        if label_octal not in cls.WORD_REGISTRY:\n`;
        out += `            return None\n\n`;
        out += `        w_spec = cls.WORD_REGISTRY[label_octal]\n`;
        out += `        result = {\n`;
        out += `            "label": label_octal,\n`;
        out += `            "key": w_spec["key"],\n`;
        out += `            "name": w_spec["name"],\n`;
        out += `            "sdi": cls.extract_bits(raw_word32, 9, 2),\n`;
        out += `            "ssm": cls.extract_bits(raw_word32, 30, 2),\n`;
        out += `            "fields": {}\n`;
        out += `        }\n`;
        out += `        for f in w_spec["fields"]:\n`;
        out += `            raw_val = cls.extract_bits(raw_word32, f["start_bit"], f["bit_count"])\n`;
        out += `            if f["data_type"] in ("discrete", "bool"):\n`;
        out += `                phys_val = bool(raw_val)\n`;
        out += `            else:\n`;
        out += `                if f.get("endianness") == "little" and f["data_type"] == "u16":\n`;
        out += `                    raw_val = ((raw_val & 0xFF) << 8) | ((raw_val >> 8) & 0xFF)\n`;
        out += `                phys_val = raw_val * f["scale"] + f["offset"]\n`;
        out += `            result["fields"][f["key"]] = phys_val\n`;
        out += `        return result\n\n`;

        out += `if __name__ == "__main__":\n`;
        out += `    print(f"=== 载入上位机 ARINC 429 协议驱动: {Arinc429Protocol.NAME} ===")\n`;
        if (words.length > 0) {
            const firstOctal = (words[0].label || '203').toString().padStart(3, '0');
            const byteVal = Arinc429Helper.octalToLabelByte(firstOctal);
            out += `    # 测试解码字 (Label: ${firstOctal}₈)\n`;
            out += `    test_word = 0x80000000 | (${byteVal}) | (1 << 8) | (28000 << 10)\n`;
            out += `    decoded = Arinc429Protocol.decode(test_word)\n`;
            out += `    print("解码测试结果:", decoded)\n`;
        }
        return out;
    }

    /**
     * 4. 生成上位机标准 JSON 规范 (.json)
     */
    static generateJsonSpec(protocol) {
        if (!protocol) return '{}';
        const spec = {
            schema: "arinc429-host-specification-v1",
            metadata: {
                protocolName: protocol.name || 'ARINC 429 通信协议',
                version: protocol.version || '1.0.0',
                targetDevice: protocol.device || protocol.source || 'ADC',
                defaultDirection: protocol.direction || 'Tx',
                busPeriodMs: protocol.period || 20,
                busSpeed: protocol.speed || '100kbps',
                parity: protocol.parity || 'odd',
                mode: protocol.mode || 'classic',
                description: protocol.description || '',
                exportTime: new Date().toISOString()
            },
            words: (protocol.words || []).map(w => {
                const octal = (w.label || '000').toString().padStart(3, '0');
                const byteVal = Arinc429Helper.octalToLabelByte(octal);
                const hexVal = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
                const key = w.key || this.toSafeIdentifier(w.name, `word_${octal}`);

                return {
                    labelOctal: octal,
                    labelHex: hexVal,
                    key: key,
                    name: w.name || key,
                    sourceDevice: w.source || protocol.device || 'ADC',
                    direction: w.direction || protocol.direction || 'Tx',
                    channel: w.channel || 'CH1',
                    scheduling: {
                        mode: w.sendMode || 'cyclic',
                        periodMs: protocol.period || w.period || 20,
                        timeoutMs: (protocol.period || w.period || 20) * 3
                    },
                    classicFrame: {
                        sdiDefault: w.sdi !== undefined ? w.sdi : 0,
                        ssmType: w.ssmType || 'BNR',
                        sdiDict: w.sdiDict || {},
                        ssmDict: w.ssmDict || {}
                    },
                    signals: (w.signals || []).map(f => {
                        const count = Number(f.bitCount || f.length || 1);
                        const start = Number(f.startBit || 1);
                        const rawT = (f.dataType || '').toLowerCase();
                        const normType = (rawT === 'bool' || rawT === 'discrete') ? 'bool' : ((rawT === 'u8' || count <= 8) ? 'u8' : 'u16');
                        return {
                            key: f.key || this.toSafeIdentifier(f.name, 'signal'),
                            name: f.name || '未命名信号',
                            dataType: normType,
                            bitSpan: {
                                startBit: start,
                                bitCount: count,
                                endBit: start + count - 1,
                                endianness: normType === 'u16' ? (f.endianness || 'big') : 'none'
                            },
                            conversion: {
                                resolution: parseFloat(f.resolution || 1.0),
                                offset: parseFloat(f.offset || 0.0),
                                unit: f.unit || '',
                                precision: f.precision || '0.1'
                            },
                            engineeringRange: {
                                min: (f.min !== '' && f.min !== undefined && f.min !== null) ? f.min : null,
                                max: (f.max !== '' && f.max !== undefined && f.max !== null) ? f.max : null,
                                defaultValue: f.defaultValue !== undefined ? f.defaultValue : 0
                            },
                            stateDictionary: f.dict || {},
                            remark: f.remark || ''
                        };
                    })
                };
            })
        };

        return JSON.stringify(spec, null, 2);
    }
}

// 导出至全局环境与 Arinc429Helper
Arinc429Helper.UpperComputerCodeGen = UpperComputerCodeGen;
if (typeof window !== 'undefined') {
    window.UpperComputerCodeGen = UpperComputerCodeGen;
}

/**
 * 航电标准预置协议模板库 (按需可为空，内置模板已按要求彻底清理)
 */
Arinc429Helper.STANDARD_TEMPLATES = [];
