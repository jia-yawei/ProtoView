class ProtocolParser {
    /**
     * 将输入的 Hex 字符串转换为字节数组
     * @param {string} hexString 
     * @returns {Uint8Array}
     */
    static hexToBytes(hexString) {
        const cleanHex = hexString.replace(/[^0-9A-Fa-f]/g, '');
        const bytes = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < cleanHex.length; i += 2) {
            bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * 从字节数组中提取指定位宽的数据（处理跨字节边界）
     * 这是一个简化的提取逻辑，假设数据最大为 32 位以适应 JavaScript 的位运算
     */
    static extractBits(bytes, startBit, length, endianness) {
        // 计算起始字节和结束字节
        const startByte = Math.floor(startBit / 8);
        const endByte = Math.floor((startBit + length - 1) / 8);
        
        if (startByte >= bytes.length) return 0; // 越界

        let rawValue = 0n; // 使用 BigInt 避免溢出
        let bitOffset = 0n;

        if (endianness === 'little') {
            // 小端模式 (Intel)：低字节在低地址
            for (let i = startByte; i <= endByte && i < bytes.length; i++) {
                rawValue |= (BigInt(bytes[i]) << bitOffset);
                bitOffset += 8n;
            }
        } else {
            // 大端模式 (Motorola)：高字节在低地址
            for (let i = endByte; i >= startByte && i < bytes.length; i--) {
                rawValue |= (BigInt(bytes[i]) << bitOffset);
                bitOffset += 8n;
            }
        }

        // 提取具体的位
        const localStartBit = BigInt(startBit % 8);
        rawValue = rawValue >> localStartBit;
        const mask = (1n << BigInt(length)) - 1n;
        rawValue = rawValue & mask;

        return Number(rawValue); // 转回普通 Number 进行后续浮点运算
    }

    /**
     * 应用比例和偏移量计算物理值
     */
    static calculatePhysicalValue(rawValue, scale, offset) {
        return (rawValue * parseFloat(scale)) + parseFloat(offset);
    }

    /**
     * 主解析入口
     * 自动识别 ARINC 429 协议或 CAN/串口协议
     * @param {string} text 包含 Hex 的原文
     * @param {Object} protocol 协议对象
     */
    static parse(text, protocol) {
        if (protocol.type === 'ARINC429') {
            return this.parseArinc429(text, protocol);
        }

        const results = [];
        if (!protocol.frames || !Array.isArray(protocol.frames)) return results;
        
        // 为了宽容匹配，去掉 0x 前缀和多余空格，并转换为大写
        const normalize = (str) => str.replace(/0[xX]/g, '').replace(/\s+/g, '').toUpperCase();
        const normalizedText = normalize(text);

        for (const frame of protocol.frames) {
            const frameId = normalize(frame.frameId);
            
            // 策略 1: 寻找明文的 ID (例如输入中带有 "18F00100")
            // 我们在原始文本或规范化文本中查找它
            let index = normalizedText.indexOf(frameId);
            
            if (index !== -1) {
                // 找到了 ID，假设其后的字符是数据负载（取接下来的 16 个字符，即 8 字节，或者更多）
                // 实际 CAN 数据通常是 8 字节 (16 个 hex 字符)
                const payloadHex = normalizedText.substring(index + frameId.length, index + frameId.length + 16);
                
                if (payloadHex.length > 0) {
                    const bytes = this.hexToBytes(payloadHex);
                    
                    for (const signal of frame.signals) {
                        const raw = this.extractBits(bytes, Number(signal.startBit), Number(signal.length), signal.endianness);
                        const phys = this.calculatePhysicalValue(raw, signal.scale, signal.offset);
                        
                        results.push({
                            frameName: frame.frameName,
                            signalName: signal.name,
                            physicalValue: phys.toFixed(2), // 保留两位小数
                            unit: signal.unit,
                            rawValue: '0x' + raw.toString(16).toUpperCase()
                        });
                    }
                }
            } else {
                // 策略 2: 如果找不到对应的 Frame ID，且用户只输入了纯数据（例如 8 字节）
                // 并且该协议只有一个帧，或者用户指定的协议就是当前解析的，我们可以尝试强制按此帧解析。
                // 这种情况下，默认将前 N 个字节作为有效载荷。
                const bytes = this.hexToBytes(normalizedText);
                if (bytes.length >= 2) { // 至少有一些数据
                    for (const signal of frame.signals) {
                        const raw = this.extractBits(bytes, Number(signal.startBit), Number(signal.length), signal.endianness);
                        const phys = this.calculatePhysicalValue(raw, signal.scale, signal.offset);
                        
                        results.push({
                            frameName: frame.frameName + " (强制解析)",
                            signalName: signal.name,
                            physicalValue: phys.toFixed(2),
                            unit: signal.unit,
                            rawValue: '0x' + raw.toString(16).toUpperCase()
                        });
                    }
                }
            }
        }

        return results;
    }

    /**
     * ARINC 429 专用多字解析引擎
     * @param {string} text 用户输入的包含一个或多个 32 位 Hex 字的文本
     * @param {Object} protocol ARINC 429 协议定义
     */
    static parseArinc429(text, protocol) {
        const results = [];
        if (!protocol.words || !Array.isArray(protocol.words)) return results;

        // 提取输入中的所有 32 位 (8 位 Hex) 字
        // 支持 "0x83A41220", "83A41220", 或者每 4 字节空格分隔的数据
        const cleanWords = [];
        const rawTokens = text.trim().split(/[\s,;\n\r]+/);

        for (const token of rawTokens) {
            const cleanToken = token.replace(/0x/gi, '').replace(/[^0-9A-Fa-f]/g, '');
            if (cleanToken.length === 8) {
                cleanWords.push(cleanToken);
            }
        }

        // 如果没有按 8 位 hex 匹配到，尝试整体去掉所有非 hex 字符后按每 8 字符切片
        if (cleanWords.length === 0) {
            const allHex = text.replace(/0x/gi, '').replace(/[^0-9A-Fa-f]/g, '');
            for (let i = 0; i + 8 <= allHex.length; i += 8) {
                cleanWords.push(allHex.substr(i, 8));
            }
        }

        if (cleanWords.length === 0) return results;

        // 对每一个 32 位 ARINC 字进行解析
        for (const hexStr of cleanWords) {
            const word32 = BigInt('0x' + hexStr) & 0xFFFFFFFFn;
            const labelByte = Number(word32 & 0xFFn);
            const labelOctal = Arinc429Helper.labelByteToOctal(labelByte);

            // 寻找匹配标号的字定义
            let matchedWord = protocol.words.find(w => {
                const wOctal = w.label.toString().padStart(3, '0');
                return wOctal === labelOctal || Arinc429Helper.octalToLabelByte(w.label) === labelByte;
            });

            // 如果找不到匹配且只有一个字定义，尝试按此定义解析
            if (!matchedWord && protocol.words.length === 1) {
                matchedWord = protocol.words[0];
            }

            if (matchedWord) {
                const decoded = Arinc429Helper.decodeFullWord(hexStr, matchedWord);
                const parityStatus = decoded.parity.valid ? '校验通过' : '奇偶校验错误!';
                const wordTitle = `${matchedWord.name} [标号: ${decoded.label.octal}₈]`;

                if (decoded.signals && decoded.signals.length > 0) {
                    for (const sig of decoded.signals) {
                        results.push({
                            frameName: wordTitle,
                            signalName: sig.name,
                            physicalValue: sig.formatted,
                            unit: sig.unit || '',
                            rawValue: `${sig.rawHex} (字: ${decoded.hex}, ${parityStatus}, ${decoded.ssm.desc})`
                        });
                    }
                } else {
                    // 没有配置独立信号，展示字概览
                    results.push({
                        frameName: wordTitle,
                        signalName: '32位数据负载',
                        physicalValue: decoded.dataPayload.hex,
                        unit: 'Hex',
                        rawValue: `${decoded.hex} (SSM: ${decoded.ssm.desc}, SDI: ${decoded.sdi.desc}, ${parityStatus})`
                    });
                }
            } else {
                // 未匹配到具体标号，解析基础 ARINC 429 结构展示
                const decoded = Arinc429Helper.decodeFullWord(hexStr, { ssmType: 'BNR', parity: protocol.parity || 'odd' });
                results.push({
                    frameName: `未定义字 (Label ${decoded.label.octal}₈ / 0x${decoded.label.byte.toString(16).toUpperCase()})`,
                    signalName: '原始数据载荷',
                    physicalValue: decoded.dataPayload.hex,
                    unit: 'Raw',
                    rawValue: `${decoded.hex} (SSM: ${decoded.ssm.desc}, SDI: ${decoded.sdi.desc}, 校验: ${decoded.parity.valid ? 'OK' : 'FAIL'})`
                });
            }
        }

        return results;
    }
}
