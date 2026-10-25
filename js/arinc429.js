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
     * 生成符合航空工程 IC 接口卡片规范的标准独立 HTML 网页（支持离线浏览、浏览器另存、一键打印/导出PDF）
     */
    static generateHtmlSpec(protocol) {
        if (!protocol) return '<h3>无有效协议</h3>';
        const pName = protocol.name || 'ARINC 429 通信协议';
        const pDevice = protocol.device || protocol.source || '未指定设备';
        const mdContent = this.generateMarkdownSpec(protocol);

        // 提取 Markdown 中的 HTML 表格主体部分 (过滤掉前面的一级标题和分隔线)
        const tablesHtml = mdContent
            .replace(/^#\s+[^\n]+\n+/, '')
            .replace(/###\s+[^\n]+/g, '')
            .replace(/---/g, '');

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pName} - ARINC 429 接口控制卡片规范</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", sans-serif;
      margin: 0;
      padding: 20px;
      background: #f1f5f9;
      color: #0f172a;
    }
    .page-container {
      max-width: 960px;
      margin: 0 auto;
      background: #fff;
      padding: 24px 32px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border-radius: 8px;
    }
    .doc-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .doc-title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #0f172a;
    }
    .doc-meta {
      font-size: 12px;
      color: #475569;
    }
    .no-print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      background: #e2e8f0;
      padding: 10px 16px;
      border-radius: 6px;
    }
    .btn-action {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-action:hover {
      background: #1d4ed8;
    }
    
    /* 核心分页控制：每个字卡片必须独立成一页，绝不跨页 */
    .arinc-card-page-block {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin-bottom: 1.5rem;
    }
    .arinc-card-page-block:not(:first-child) {
      page-break-before: always !important;
      break-before: page !important;
    }
    
    table.arinc-spec-card-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 12px;
      border: 1.5px solid #000;
      color: #000;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    table.arinc-spec-card-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: middle;
      line-height: 1.35;
    }
    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .page-container {
        box-shadow: none;
        padding: 0;
        max-width: 100%;
        border-radius: 0;
      }
      .no-print-bar {
        display: none !important;
      }
      .doc-header {
        margin-bottom: 12px;
        page-break-after: avoid;
        break-after: avoid;
      }
      .arinc-card-page-block {
        margin-bottom: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="no-print-bar">
      <span><strong>航电接口卡片文档</strong> (源自 ProtoView 429 协议系统)</span>
      <button class="btn-action" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
    </div>
    <div class="doc-header">
      <div>
        <h1 class="doc-title">${pName}</h1>
        <div class="doc-meta" style="margin-top:4px;">设备来源: ${pDevice} | 生成日期: ${new Date().toLocaleDateString()}</div>
      </div>
      <div class="doc-meta" style="text-align: right;">
        <div>符合标准: ARINC 429</div>
        <div>数位格式: 32位 双列对照</div>
      </div>
    </div>
    <div class="doc-body">
      ${tablesHtml}
    </div>
  </div>
</body>
</html>`;
    }

    /**
     * 生成符合航空工程 IC 接口卡片规范的标准 Markdown / HTML 表格文档
     * 结构严格对应：
     * 1. 信号基本属性信息区（信号名称、规范号、信号类型、源、分布、符合标准、单位、信号范围、分辨率、信号格式、精度）
     * 2. 数据格式双列 1~32 数位分布表（左列 1~16 位，右列 17~32 位，精确到每一个数位的占用、字段名、保留与控制位说明）
     * 3. 附注说明区（离散状态编码映射、有效性标识、SSM 状态定义等）
     */
    static generateMarkdownSpec(protocol) {
        if (!protocol) return '# 无有效协议\n';
        const pName = protocol.name || 'ARINC 429 通信协议';
        const pDevice = protocol.device || protocol.source || '未指定设备';
        const pSpeed = protocol.speed || '100kbps';
        const pParity = protocol.parity === 'odd' ? 'PARITY (奇校验)' : (protocol.parity === 'even' ? 'PARITY (偶校验)' : 'PARITY (无校验)');
        const pMode = protocol.mode === 'bitstream' ? '自由 Bit 模式' : '经典航电模式';
        const words = protocol.words || [];

        let md = `# ${pName} - ARINC 429 总线IC接口卡片定义规范\n\n`;

        words.forEach((w, idx) => {
            const oct = (w.label || '000').toString().padStart(3, '0');
            const byteVal = this.octalToLabelByte(oct);
            const hex = '0x' + byteVal.toString(16).toUpperCase().padStart(2, '0');
            const fields = w.signals || [];
            const isBitstream = (protocol && protocol.mode === 'bitstream') || (w.editMode === 'bitstream');

            // 信号名称与规范号
            const signalName = w.name || `ARINC429 标号字 ${oct}`;
            const specNo = w.channel ? `${w.channel}-${oct}` : `${pDevice ? pDevice.split(' ')[0] : 'SYS'}-${oct}`;
            const sourceDevice = w.source || pDevice;
            const targetDistrib = `${sourceDevice}${w.channel ? ` (${w.channel})` : ''}`;

            // 提取主要物理量参数（优先取主要数值字段，若无则综合显示）
            let mainUnit = 'V';
            let mainRange = '0.0~55.0';
            let mainRes = '0.1';
            let mainPrec = '2%';
            let hasFoundMain = false;

            if (fields.length > 0) {
                // 查找非 bool 的数值型字段作为主展示参数
                const numField = fields.find(f => f.dataType === 'u16' || f.dataType === 'u8') || fields[0];
                if (numField) {
                    mainUnit = numField.unit || '-';
                    const minStr = (numField.min !== undefined && numField.min !== null && numField.min !== '') ? numField.min : '';
                    const maxStr = (numField.max !== undefined && numField.max !== null && numField.max !== '') ? numField.max : '';
                    mainRange = (minStr !== '' || maxStr !== '') ? `${minStr}~${maxStr}` : '-';
                    mainRes = (numField.resolution !== undefined && numField.resolution !== null && numField.resolution !== '') ? numField.resolution : '-';
                    mainPrec = (numField.precision !== undefined && numField.precision !== null && numField.precision !== '') ? numField.precision : '-';
                    hasFoundMain = true;
                }
            }
            if (!hasFoundMain) {
                mainUnit = '-';
                mainRange = '-';
                mainRes = '-';
                mainPrec = '-';
            }

            // 构建 1~32 位每个 bit 的归属说明与分组键 (用于跨行纵向合并)
            const bitMap = new Array(33).fill('');
            const bitGroup = new Array(33).fill('');

            // Bit 1~8: 标号
            for (let b = 1; b <= 8; b++) {
                bitMap[b] = `Label 标号位 (${oct}₈ / ${hex})`;
                bitGroup[b] = `__LABEL__`;
            }

            // 经典模式 Bit 9~10: SDI
            if (!isBitstream) {
                bitMap[9] = `SDI 识别码`;
                bitMap[10] = `SDI 识别码`;
                bitGroup[9] = `__SDI__`;
                bitGroup[10] = `__SDI__`;
            }

            // 映射具体配置的字段
            fields.forEach((f, fIndex) => {
                const s = Math.max(1, Math.min(32, Number(f.startBit || 1)));
                const len = Math.max(1, Number(f.bitCount || f.length || 1));
                const e = Math.min(32, s + len - 1);
                const fname = f.name || '未命名数据';
                const fieldDesc = fname; // 表格中已有左/右列明确数位信息，字段说明只显示字段名本身
                const gKey = `FIELD_${fIndex}_${s}_${e}`;
                for (let b = s; b <= e; b++) {
                    bitMap[b] = fieldDesc;
                    bitGroup[b] = gKey;
                }
            });

            // Bit 30~31: SSM
            bitMap[30] = 'SSM (有效性/符号状态矩阵)';
            bitMap[31] = 'SSM (有效性/符号状态矩阵)';
            bitGroup[30] = '__SSM__';
            bitGroup[31] = '__SSM__';

            // Bit 32: Parity
            bitMap[32] = pParity;
            bitGroup[32] = '__PARITY__';

            // 未分配位标记为保留（连续的未分配位作为一个保留块合并）
            let unassignedBlockIdx = 0;
            for (let b = 1; b <= 32; b++) {
                if (!bitMap[b]) {
                    if (b === 1 || bitGroup[b - 1] !== `__RESERVED_${unassignedBlockIdx}__`) {
                        unassignedBlockIdx++;
                    }
                    bitMap[b] = '保留 (Reserved)';
                    bitGroup[b] = `__RESERVED_${unassignedBlockIdx}__`;
                }
            }

            // 计算左列 (1~16) 与右列 (17~32) 的单元格合并跨度 (rowspan)
            // leftSpanInfo[row]: { render: boolean, rowspan: number, text: string }
            const leftSpanInfo = {};
            let lRow = 1;
            while (lRow <= 16) {
                const gKey = bitGroup[lRow];
                let span = 1;
                while (lRow + span <= 16 && bitGroup[lRow + span] === gKey) {
                    span++;
                }
                leftSpanInfo[lRow] = { render: true, rowspan: span, text: bitMap[lRow] };
                for (let k = 1; k < span; k++) {
                    leftSpanInfo[lRow + k] = { render: false };
                }
                lRow += span;
            }

            // rightSpanInfo[row]: 对应右列 17~32 位 (row 对应 1~16)
            const rightSpanInfo = {};
            let rRow = 1;
            while (rRow <= 16) {
                const bit = rRow + 16;
                const gKey = bitGroup[bit];
                let span = 1;
                while (rRow + span <= 16 && bitGroup[bit + span] === gKey) {
                    span++;
                }
                rightSpanInfo[rRow] = { render: true, rowspan: span, text: bitMap[bit] };
                for (let k = 1; k < span; k++) {
                    rightSpanInfo[rRow + k] = { render: false };
                }
                rRow += span;
            }

            // 备注说明整理 (包含字段备注、状态字典、SDI与SSM说明、字与协议备注)
            const remarks = [];

            // 1. 各字段填写的备注 (优先输出具体的工程备注)
            fields.forEach(f => {
                if (f.remark && f.remark.trim()) {
                    remarks.push(`${f.name}备注: ${f.remark.trim()}`);
                }
            });

            // 2. 字段状态字典说明 (智能合并：如果一个字中所有字段的状态字典都相同，则只显示一条统一的状态字典说明)
            const fieldsWithDict = fields.filter(f => f.dict && Object.keys(f.dict).length > 0);
            if (fieldsWithDict.length > 0) {
                // 检查是否所有带字典的字段字典内容完全相同，且是否所有字段均配置了该字典
                const firstDictEntries = Object.entries(fieldsWithDict[0].dict).sort(([a], [b]) => a.localeCompare(b));
                const firstDictStr = JSON.stringify(firstDictEntries);
                const allDictsIdentical = fieldsWithDict.every(f => {
                    const fEntries = Object.entries(f.dict).sort(([a], [b]) => a.localeCompare(b));
                    return JSON.stringify(fEntries) === firstDictStr;
                });

                // 如果字段都有字典且完全一致，或者字段多于1个且全部一致，直接输出统一定义
                if (allDictsIdentical && fieldsWithDict.length === fields.length) {
                    const dictDesc = firstDictEntries.map(([k, v]) => `${k}-${v}`).join(', ');
                    remarks.push(`状态定义: ${dictDesc}`);
                } else {
                    // 若存在不一致，或仅部分字段有字典，则按各自字段名称列出
                    fieldsWithDict.forEach(f => {
                        const entries = Object.entries(f.dict);
                        const dictDesc = entries.map(([k, v]) => `${k}-${v}`).join(', ');
                        remarks.push(`${f.name}状态定义: ${dictDesc}`);
                    });
                }
            }

            // 3. SDI 字典 (经典模式)
            if (!isBitstream && w.sdiDict && Object.keys(w.sdiDict).length > 0) {
                const sdiMap = { '0': '00', '1': '01', '2': '10', '3': '11' };
                const sdiStr = Object.entries(w.sdiDict).map(([k, v]) => `${sdiMap[k] || k}:${v}`).join(', ');
                remarks.push(`SDI 系统源标识: ${sdiStr}`);
            }

            // 4. SSM 有效性说明
            const globalSsmDict = (protocol && protocol.ssmDict) || w.ssmDict || { "0": "正常运算 (00)", "1": "无计算数据 (01)", "2": "功能测试 (10)", "3": "故障告警 (11)" };
            const ssmBitMap = { '0': '00', '1': '01', '2': '10', '3': '11' };
            const ssmDesc = Object.entries(globalSsmDict).map(([k, v]) => `${ssmBitMap[k] || k} ${v}`).join('; ');
            remarks.push(`SSM 有效性标识: ${ssmDesc}`);

            // 5. 数据字与协议整体备注
            if (w.remark && w.remark.trim() && !remarks.includes(`字备注: ${w.remark.trim()}`)) {
                remarks.push(`字备注: ${w.remark.trim()}`);
            }
            if (protocol.description && protocol.description.trim()) {
                remarks.push(`协议说明: ${protocol.description.trim()}`);
            }

            // 输出符合用户航空接口卡片标准的大表 (使用 HTML 格式在 Markdown 中渲染，支持完美的行列合并与精确布局，每个字卡片独立成页防跨页)
            md += `<div class="arinc-card-page-block" style="page-break-before: ${idx === 0 ? 'auto' : 'always'}; page-break-after: ${idx === words.length - 1 ? 'auto' : 'always'}; page-break-inside: avoid; break-before: ${idx === 0 ? 'auto' : 'page'}; break-after: ${idx === words.length - 1 ? 'auto' : 'page'}; break-inside: avoid; margin-bottom: 2rem;">\n\n`;
            md += `### ${idx + 1}. 接口控制卡片: ${signalName} (标号 ${oct}₈)\n\n`;
            md += `<table class="arinc-spec-card-table" style="width: 100%; border-collapse: collapse; margin-bottom: 0.8rem; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 13px; border: 1.5px solid #333; page-break-inside: avoid; break-inside: avoid;">\n`;
            md += `  <tbody>\n`;
            md += `    <tr style="border-bottom: 1px solid #333;">\n`;
            md += `      <td style="width: 12%; font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">信号名称</td>\n`;
            md += `      <td style="width: 45%; border: 1px solid #333; padding: 6px 10px;">${signalName}</td>\n`;
            md += `      <td style="width: 15%; font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">规范号</td>\n`;
            md += `      <td style="width: 28%; border: 1px solid #333; padding: 6px 10px;">${specNo}</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="border-bottom: 1px solid #333;">\n`;
            md += `      <td style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">信号类型</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;">32 位信号 (ARINC 429 ${pMode})</td>\n`;
            md += `      <td style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">源</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;">${sourceDevice}</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="border-bottom: 1px solid #333;">\n`;
            md += `      <td rowspan="4" style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center; vertical-align: middle;">信号内容</td>\n`;
            md += `      <td colspan="3" style="border: 1px solid #333; padding: 6px 10px;"><strong>分布：</strong> ${targetDistrib}</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="border-bottom: 1px solid #333;">\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;"><strong>符合标准：</strong> ARINC429</td>\n`;
            md += `      <td style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">单位</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;">${mainUnit}</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="border-bottom: 1px solid #333;">\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;"><strong>信号范围：</strong> ${mainRange}</td>\n`;
            md += `      <td style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">分辨率</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;">${mainRes}</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="border-bottom: 1px solid #333;">\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;"><strong>信号格式：</strong> 429 航电通信 (速率: ${pSpeed}, 周期: ${protocol.period || w.period || 20}ms)</td>\n`;
            md += `      <td style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 6px 10px; text-align: center;">精度</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 6px 10px;">${mainPrec}</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="background: #e2e8f0; font-weight: bold; text-align: center; border-bottom: 1.5px solid #333;">\n`;
            md += `      <td colspan="4" style="border: 1px solid #333; padding: 7px 10px; letter-spacing: 2px;">数 据 格 式</td>\n`;
            md += `    </tr>\n`;

            md += `    <tr style="background: #f1f5f9; font-weight: bold; text-align: center; border-bottom: 1px solid #333;">\n`;
            md += `      <td style="border: 1px solid #333; padding: 5px; width: 10%;">数位</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 5px; width: 40%;">说明</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 5px; width: 10%;">数位</td>\n`;
            md += `      <td style="border: 1px solid #333; padding: 5px; width: 40%;">说明</td>\n`;
            md += `    </tr>\n`;

            // 双列循环：左列 1~16 位，右列 17~32 位（支持同一个字段/说明纵向合并为一个单元格）
            for (let row = 1; row <= 16; row++) {
                const leftBit = row;
                const rightBit = row + 16;

                md += `    <tr style="border-bottom: 1px solid #e2e8f0;">\n`;
                // 左列数位
                md += `      <td style="border: 1px solid #333; padding: 4px; text-align: center; font-weight: 600;">${leftBit}</td>\n`;
                
                // 左列说明（纵向合并）
                const lSpan = leftSpanInfo[row];
                if (lSpan && lSpan.render) {
                    const rSpanAttr = lSpan.rowspan > 1 ? ` rowspan="${lSpan.rowspan}"` : '';
                    md += `      <td${rSpanAttr} style="border: 1px solid #333; padding: 5px 8px; vertical-align: middle;">${lSpan.text}</td>\n`;
                }

                // 右列数位
                md += `      <td style="border: 1px solid #333; padding: 4px; text-align: center; font-weight: 600;">${rightBit}</td>\n`;

                // 右列说明（纵向合并）
                const rSpan = rightSpanInfo[row];
                if (rSpan && rSpan.render) {
                    const rSpanAttr = rSpan.rowspan > 1 ? ` rowspan="${rSpan.rowspan}"` : '';
                    md += `      <td${rSpanAttr} style="border: 1px solid #333; padding: 5px 8px; vertical-align: middle;">${rSpan.text}</td>\n`;
                }

                md += `    </tr>\n`;
            }

            // 备注行 (原“附注”修改为“备注”，包含字段备注、字典与有效性定义)
            md += `    <tr style="border-top: 1.5px solid #333;">\n`;
            md += `      <td style="font-weight: bold; background: #f8fafc; border: 1px solid #333; padding: 8px 10px; text-align: center; vertical-align: top;">备注</td>\n`;
            md += `      <td colspan="3" style="border: 1px solid #333; padding: 8px 12px; line-height: 1.7;">\n`;
            if (remarks.length > 0) {
                remarks.forEach((rem, rIdx) => {
                    md += `        <div>${rIdx + 1}. ${rem}</div>\n`;
                });
            } else {
                md += `        <div>1. 无特殊备注说明</div>\n`;
            }
            md += `      </td>\n`;
            md += `    </tr>\n`;

            md += `  </tbody>\n`;
            md += `</table>\n\n`;
            md += `</div>\n\n`;
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
