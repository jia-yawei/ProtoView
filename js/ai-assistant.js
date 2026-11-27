/**
 * @file ai-assistant.js
 * @brief ProtoView AI 协议助手抽屉与大模型配置控制器
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    global.ProtoView = ProtoView;

    const STORAGE_KEY = 'protoview_ai_config';

    const PROVIDER_PRESETS = {
        custom: { label: '自定义 (OpenAI 兼容接口)', baseUrl: '', model: '' },
        openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        qwen: { label: '通义千问 (DashScope)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
        moonshot: { label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
        zhipu: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
        ollama: { label: 'Ollama (本地模型)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }
    };

    const DEFAULT_CONFIG = {
        preset: 'deepseek',
        baseUrl: '',
        apiKey: '',
        model: 'deepseek-chat',
        temperature: 0.3
    };

    let aiConfig = Object.assign({}, DEFAULT_CONFIG);
    let chatMessages = [];
    let pendingAttachment = null;
    let isConfigViewOpen = false;
    let isSending = false;

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]);
    };

    const showToast = ProtoView.showToast || global.showToast || function(msg, type) {
        if (ProtoView.Utils && ProtoView.Utils.showToast) ProtoView.Utils.showToast(msg, type);
    };

    function formatInlineMarkdown(escapedLine) {
        const inlineCodes = [];
        let out = escapedLine.replace(/`([^`]+)`/g, (_, code) => {
            const idx = inlineCodes.length;
            inlineCodes.push(`<code class="ai-md-code">${code}</code>`);
            return `\u0000IC${idx}\u0000`;
        });
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        out = out.replace(/\u0000IC(\d+)\u0000/g, (_, idx) => inlineCodes[Number(idx)] || '');
        return out;
    }

    function renderMarkdownToHTML(rawText) {
        if (!rawText) return '';

        // 1. 提取 protoview-action 结构化修改指令块
        const actionBlocks = [];
        let text = String(rawText).replace(/\r\n/g, '\n').replace(/```protoview-action\s*\n([\s\S]*?)```/g, (_, jsonBody) => {
            const idx = actionBlocks.length;
            actionBlocks.push(jsonBody.trim());
            return `\n\u0000ACT${idx}\u0000\n`;
        });

        // 2. 提取 fenced code blocks，避免内部符号被当作表格或列表处理
        const codeBlocks = [];
        text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
            const idx = codeBlocks.length;
            const langLabel = lang ? `<div class="ai-md-code-lang">${escapeHTML(lang)}</div>` : '';
            codeBlocks.push(`<div class="ai-md-pre-wrap">${langLabel}<pre class="ai-md-pre"><code>${escapeHTML(code.replace(/\n$/, ''))}</code></pre></div>`);
            return `\n\u0000CB${idx}\u0000\n`;
        });

        // 2. 整体转义剩余 HTML，防 XSS
        text = escapeHTML(text);

        const lines = text.split('\n');
        const htmlParts = [];
        let i = 0;

        const isTableSeparator = (line) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(line);
        const splitTableRow = (line) => {
            let trimmed = line.trim();
            if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
            if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
            return trimmed.split('|').map(c => c.trim());
        };

        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            // 代码块占位符
            const cbMatch = trimmed.match(/^\u0000CB(\d+)\u0000$/);
            if (cbMatch) {
                htmlParts.push(codeBlocks[Number(cbMatch[1])] || '');
                i++;
                continue;
            }

            // 协议修改指令卡片占位符
            const actMatch = trimmed.match(/^\u0000ACT(\d+)\u0000$/);
            if (actMatch) {
                const rawJson = actionBlocks[Number(actMatch[1])] || '';
                htmlParts.push(renderActionCardHTML(rawJson));
                i++;
                continue;
            }

            // 空行
            if (!trimmed) {
                i++;
                continue;
            }

            // GFM 表格：当前行含 | 且下一行是分隔线
            if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
                const headers = splitTableRow(line);
                i += 2; // 跳过表头与分隔线
                const rows = [];
                while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
                    rows.push(splitTableRow(lines[i]));
                    i++;
                }
                const thHtml = headers.map(h => `<th>${formatInlineMarkdown(h)}</th>`).join('');
                const bodyHtml = rows.map(r => {
                    const cells = headers.map((_, cIdx) => `<td>${formatInlineMarkdown(r[cIdx] !== undefined ? r[cIdx] : '')}</td>`).join('');
                    return `<tr>${cells}</tr>`;
                }).join('');
                htmlParts.push(`<div class="ai-md-table-wrap"><table class="ai-md-table"><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
                continue;
            }

            // 水平分割线
            if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
                htmlParts.push('<hr class="ai-md-hr">');
                i++;
                continue;
            }

            // 标题 (# ~ ####)
            const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
            if (hMatch) {
                const level = Math.min(4, hMatch[1].length + 1);
                htmlParts.push(`<h${level} class="ai-md-h">${formatInlineMarkdown(hMatch[2])}</h${level}>`);
                i++;
                continue;
            }

            // 引用块 (> ...)
            if (trimmed.startsWith('&gt; ')) {
                const quoteLines = [];
                while (i < lines.length && lines[i].trim().startsWith('&gt; ')) {
                    quoteLines.push(formatInlineMarkdown(lines[i].trim().slice(5)));
                    i++;
                }
                htmlParts.push(`<blockquote class="ai-md-quote">${quoteLines.join('<br>')}</blockquote>`);
                continue;
            }

            // 无序列表 (- / *)
            if (/^[-*]\s+/.test(trimmed)) {
                const items = [];
                while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
                    items.push(`<li>${formatInlineMarkdown(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`);
                    i++;
                }
                htmlParts.push(`<ul class="ai-md-list">${items.join('')}</ul>`);
                continue;
            }

            // 有序列表 (1. )
            if (/^\d+\.\s+/.test(trimmed)) {
                const items = [];
                while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
                    items.push(`<li>${formatInlineMarkdown(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`);
                    i++;
                }
                htmlParts.push(`<ol class="ai-md-list">${items.join('')}</ol>`);
                continue;
            }

            // 普通段落（合并连续非空普通行）
            const paraLines = [];
            while (
                i < lines.length &&
                lines[i].trim() !== '' &&
                !lines[i].trim().match(/^\u0000(CB|ACT)\d+\u0000$/) &&
                !lines[i].trim().match(/^(#{1,4})\s+/) &&
                !/^[-*]\s+/.test(lines[i].trim()) &&
                !/^\d+\.\s+/.test(lines[i].trim()) &&
                !lines[i].trim().startsWith('&gt; ') &&
                !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
            ) {
                paraLines.push(formatInlineMarkdown(lines[i]));
                i++;
            }
            if (paraLines.length > 0) {
                htmlParts.push(`<p class="ai-md-p">${paraLines.join('<br>')}</p>`);
            }
        }

        return htmlParts.join('');
    }

    function renderActionCardHTML(rawEscapedJson) {
        const unescaped = String(rawEscapedJson || '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        let parsed = null;
        try {
            parsed = JSON.parse(unescaped);
        } catch (e) {
            return `<div class="ai-action-card is-invalid"><i class="fa-solid fa-triangle-exclamation"></i> 协议修改指令格式解析失败</div>`;
        }
        const isCreate = parsed.action === 'create_protocol';
        const isDelete = parsed.action === 'delete_protocol';
        const actionType = isDelete ? '删除协议' : (isCreate ? '新建协议' : '修改协议');
        const targetName = parsed.protocolName || (parsed.patch && parsed.patch.name) || '当前协议';
        const summary = parsed.summary || (isDelete ? '将此协议移至回收站' : '应用 AI 生成的协议变更');
        const encoded = encodeURIComponent(JSON.stringify(parsed));
        const btnText = isDelete ? '<i class="fa-solid fa-trash-can"></i> 确认删除' : '<i class="fa-solid fa-check"></i> 应用此修改';

        return `
            <div class="ai-action-card ${isDelete ? 'is-danger-card' : ''}">
                <div class="ai-action-card-head">
                    <span class="ai-action-badge ${isDelete ? 'is-danger-badge' : ''}"><i class="fa-solid ${isDelete ? 'fa-trash-can' : 'fa-wand-magic-sparkles'}"></i> ${escapeHTML(actionType)}</span>
                    <span class="ai-action-target" title="${escapeHTML(targetName)}">${escapeHTML(targetName)}</span>
                </div>
                <div class="ai-action-summary">${escapeHTML(summary)}</div>
                <div class="ai-action-footer">
                    <button type="button" class="btn btn-primary btn-xs ai-apply-action-btn ${isDelete ? 'is-danger-btn' : ''}" data-action-payload="${encoded}">
                        ${btnText}
                    </button>
                </div>
            </div>
        `;
    }

    async function applyProtocolAction(payload, btnEl) {
        if (!payload || !window.dbHelper) return;
        try {
            if (payload.action === 'delete_protocol') {
                const all = await window.dbHelper.getAllProtocols();
                let target = null;
                if (payload.protocolId !== undefined && payload.protocolId !== null) {
                    target = all.find(p => String(p.id) === String(payload.protocolId));
                }
                if (!target && payload.protocolName) {
                    target = all.find(p => p.name === payload.protocolName);
                }
                if (!target) {
                    const active = getActiveProtocol();
                    if (active && active.id) {
                        target = all.find(p => String(p.id) === String(active.id)) || active;
                    }
                }
                if (!target) {
                    showToast('未找到要删除的目标协议（可能已被删除）', 'warning');
                    return;
                }

                if (typeof window.deleteProtocol === 'function') {
                    await window.deleteProtocol(target.id);
                    const afterAll = await window.dbHelper.getAllProtocols();
                    const stillExists = afterAll.some(p => String(p.id) === String(target.id));
                    if (stillExists) return; // 用户在二次确认框取消了删除
                } else {
                    await window.dbHelper.deleteProtocol(target.id);
                    if (window.loadProtocols) await window.loadProtocols();
                    showToast(`已删除协议「${target.name}」`, 'info');
                }

                if (btnEl) {
                    btnEl.disabled = true;
                    btnEl.classList.add('is-applied');
                    btnEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> 已删除';
                }
                return;
            } else if (payload.action === 'create_protocol') {
                const patch = payload.patch || payload.protocol || {};
                const newProto = Object.assign({
                    name: payload.protocolName || patch.name || 'AI新建协议',
                    type: patch.type || 'ARINC429',
                    product: patch.product || '',
                    device: patch.device || '机载系统',
                    period: patch.period || 20,
                    version: patch.version || 'v1.0',
                    isArchived: false,
                    packets: Array.isArray(patch.packets) ? patch.packets : []
                }, patch);
                delete newProto.id;
                const savedId = await window.dbHelper.saveProtocol(newProto);
                newProto.id = savedId || newProto.id;
                if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud) {
                    await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(newProto);
                }
                if (window.loadProtocols) await window.loadProtocols();
                showToast(`已成功创建协议「${newProto.name}」`, 'success');
            } else {
                const all = await window.dbHelper.getAllProtocols();
                let target = null;
                if (payload.protocolId !== undefined && payload.protocolId !== null) {
                    target = all.find(p => String(p.id) === String(payload.protocolId));
                }
                if (!target && payload.protocolName) {
                    target = all.find(p => p.name === payload.protocolName);
                }
                if (!target) {
                    const active = getActiveProtocol();
                    if (active && active.id) {
                        target = all.find(p => String(p.id) === String(active.id)) || active;
                    }
                }
                if (!target) {
                    showToast('未找到要修改的目标协议，请先打开该协议或在指令中指定名称', 'error');
                    return;
                }

                const patch = payload.patch || {};
                const updated = JSON.parse(JSON.stringify(target));
                Object.keys(patch).forEach(k => {
                    if (k !== 'id' && k !== 'archivedVersions') {
                        updated[k] = patch[k];
                    }
                });
                // 若修改了 packets 且只有单包，同步根级 words/fields/frames 保持兼容
                if (Array.isArray(updated.packets) && updated.packets.length > 0) {
                    const firstPkt = updated.packets[0];
                    if (updated.type === 'ARINC429' && Array.isArray(firstPkt.words)) {
                        updated.words = firstPkt.words;
                    } else if (Array.isArray(firstPkt.fields)) {
                        updated.fields = firstPkt.fields;
                    }
                    if (updated.type === 'CAN' && Array.isArray(firstPkt.frames)) {
                        updated.frames = firstPkt.frames;
                    }
                }
                updated.updatedAt = new Date().toISOString();
                updated._cloudUpdated = Date.now();

                if (ProtoView.ArchiveManager && typeof ProtoView.ArchiveManager.markProtocolModified === 'function') {
                    ProtoView.ArchiveManager.markProtocolModified(updated);
                }

                await window.dbHelper.saveProtocol(updated);
                if (ProtoView.WorkspaceSync && ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud) {
                    await ProtoView.WorkspaceSync.saveProtocolToWorkspaceAndCloud(updated);
                }

                if (ProtoView.ArchiveManager && typeof ProtoView.ArchiveManager.refreshActiveViews === 'function') {
                    ProtoView.ArchiveManager.refreshActiveViews(updated);
                } else if (window.loadProtocols) {
                    await window.loadProtocols();
                }

                showToast(`已将修改应用到协议「${updated.name}」`, 'success');
            }

            if (btnEl) {
                btnEl.disabled = true;
                btnEl.classList.add('is-applied');
                btnEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> 已应用';
            }
        } catch (err) {
            console.error('AI 应用协议修改失败:', err);
            showToast(`应用修改失败: ${err.message || err}`, 'error');
        }
    }

    function loadConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                aiConfig = Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
            }
        } catch (e) {
            console.warn('ProtoView AI: 加载大模型配置失败', e);
        }
        return aiConfig;
    }

    function saveConfig(newCfg) {
        aiConfig = Object.assign({}, aiConfig, newCfg);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(aiConfig));
        } catch (e) {
            console.error('ProtoView AI: 保存大模型配置失败', e);
        }
        updateModelStatusUI();
    }

    function isModelConfigured() {
        return Boolean(aiConfig.baseUrl && aiConfig.baseUrl.trim() && aiConfig.model && aiConfig.model.trim());
    }

    function buildChatEndpoint(baseUrl) {
        const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
        if (!clean) return '';
        if (clean.endsWith('/chat/completions')) return clean;
        return `${clean}/chat/completions`;
    }

    function buildModelsEndpoint(baseUrl) {
        const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
        if (!clean) return '';
        if (clean.endsWith('/models')) return clean;
        if (clean.endsWith('/chat/completions')) {
            return clean.replace(/\/chat\/completions$/, '/models');
        }
        return `${clean}/models`;
    }

    function updateModelStatusUI() {
        const statusDot = document.getElementById('sidebar-ai-status-dot');
        const statusPill = document.getElementById('ai-model-status-pill');
        const uncfgBanner = document.getElementById('ai-unconfigured-banner');
        const configured = isModelConfigured();

        if (statusDot) {
            statusDot.classList.toggle('is-configured', configured);
            statusDot.title = configured ? `已配置模型: ${aiConfig.model}` : '未配置大模型';
        }

        if (statusPill) {
            statusPill.classList.toggle('is-ready', configured);
            const led = '<span class="status-led"></span>';
            if (configured) {
                statusPill.innerHTML = `${led}<span>${escapeHTML(aiConfig.model)}</span>`;
                statusPill.title = `当前模型: ${aiConfig.model} (点击修改配置)`;
            } else {
                statusPill.innerHTML = `${led}<span>未配置模型 · 点击配置</span>`;
                statusPill.title = '点击配置大模型 URL 与密钥';
            }
        }

        if (uncfgBanner) {
            uncfgBanner.style.display = configured ? 'none' : 'flex';
        }
    }

    function populateConfigForm() {
        loadConfig();
        const selPreset = document.getElementById('ai-cfg-preset');
        const inpUrl = document.getElementById('ai-cfg-url');
        const inpKey = document.getElementById('ai-cfg-key');
        const inpModel = document.getElementById('ai-cfg-model');
        const inpTemp = document.getElementById('ai-cfg-temp');

        if (selPreset) selPreset.value = aiConfig.preset || 'custom';
        if (inpUrl) inpUrl.value = aiConfig.baseUrl || '';
        if (inpKey) inpKey.value = aiConfig.apiKey || '';
        if (inpModel) inpModel.value = aiConfig.model || '';
        if (inpTemp) inpTemp.value = aiConfig.temperature !== undefined ? aiConfig.temperature : 0.3;
    }

    function setConfigPanelOpen(open) {
        isConfigViewOpen = Boolean(open);
        const cfgPanel = document.getElementById('ai-config-panel');
        const chatBody = document.getElementById('ai-chat-body');
        const btnToggle = document.getElementById('btn-ai-toggle-config');

        if (cfgPanel) cfgPanel.classList.toggle('active', isConfigViewOpen);
        if (chatBody) chatBody.classList.toggle('hidden', isConfigViewOpen);
        if (btnToggle) btnToggle.classList.toggle('active', isConfigViewOpen);

        if (isConfigViewOpen) {
            populateConfigForm();
            const testRes = document.getElementById('ai-config-test-result');
            if (testRes) {
                testRes.className = 'ai-config-test-result';
                testRes.textContent = '';
            }
        }
    }

    function openDrawer(showConfig = false) {
        const drawer = document.getElementById('ai-assistant-drawer');
        const backdrop = document.getElementById('ai-drawer-backdrop');
        if (!drawer) return;
        loadConfig();
        updateModelStatusUI();
        drawer.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        setConfigPanelOpen(showConfig);
        if (!showConfig) {
            setTimeout(() => {
                const input = document.getElementById('ai-chat-input');
                if (input) input.focus();
            }, 180);
        }
    }

    function closeDrawer() {
        const drawer = document.getElementById('ai-assistant-drawer');
        const backdrop = document.getElementById('ai-drawer-backdrop');
        if (drawer) drawer.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    }

    function toggleDrawer() {
        const drawer = document.getElementById('ai-assistant-drawer');
        if (!drawer) return;
        if (drawer.classList.contains('active')) {
            closeDrawer();
        } else {
            openDrawer(false);
        }
    }

    function renderMessages() {
        const listEl = document.getElementById('ai-chat-messages');
        const welcomeEl = document.getElementById('ai-chat-welcome');
        if (!listEl) return;

        // 移除旧消息节点，保留 welcomeEl
        listEl.querySelectorAll('.ai-msg-row').forEach(el => el.remove());

        if (chatMessages.length === 0) {
            if (welcomeEl) welcomeEl.style.display = 'flex';
            return;
        }
        if (welcomeEl) welcomeEl.style.display = 'none';

        chatMessages.forEach(msg => {
            const row = document.createElement('div');
            row.className = `ai-msg-row ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`;

            const avatar = document.createElement('div');
            avatar.className = 'ai-msg-avatar';
            avatar.innerHTML = msg.role === 'user'
                ? '<i class="fa-solid fa-user"></i>'
                : '<i class="fa-solid fa-robot"></i>';

            const bubble = document.createElement('div');
            bubble.className = 'ai-msg-bubble';
            if (msg.attachmentName) {
                const tag = document.createElement('div');
                tag.className = 'ai-msg-attachment-tag';
                tag.innerHTML = `<i class="fa-solid fa-file-lines"></i> <span>${escapeHTML(msg.attachmentName)}</span>`;
                bubble.appendChild(tag);
            }
            const textNode = document.createElement('div');
            if (msg.role === 'assistant') {
                textNode.className = 'ai-md-body';
                textNode.innerHTML = renderMarkdownToHTML(msg.content || '');
            } else {
                textNode.textContent = msg.content || '';
            }
            bubble.appendChild(textNode);

            row.appendChild(avatar);
            row.appendChild(bubble);
            listEl.appendChild(row);
        });

        listEl.querySelectorAll('.ai-apply-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                try {
                    const raw = decodeURIComponent(btn.getAttribute('data-action-payload') || '');
                    const payload = JSON.parse(raw);
                    applyProtocolAction(payload, btn);
                } catch (e) {
                    showToast('解析修改指令失败', 'error');
                }
            });
        });

        listEl.scrollTop = listEl.scrollHeight;
    }

    async function fetchAvailableModels() {
        const inpUrl = document.getElementById('ai-cfg-url');
        const inpKey = document.getElementById('ai-cfg-key');
        const inpModel = document.getElementById('ai-cfg-model');
        const selModel = document.getElementById('ai-cfg-model-select');
        const btnFetch = document.getElementById('btn-ai-fetch-models');
        const resBox = document.getElementById('ai-config-test-result');

        const url = inpUrl ? inpUrl.value.trim() : '';
        const key = inpKey ? inpKey.value.trim() : '';

        if (!url) {
            if (resBox) {
                resBox.className = 'ai-config-test-result is-error';
                resBox.textContent = '请先填写 API Base URL 后再获取模型列表。';
            }
            return;
        }

        const endpoint = buildModelsEndpoint(url);
        if (resBox) {
            resBox.className = 'ai-config-test-result is-loading';
            resBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在获取可用模型列表...';
        }
        if (btnFetch) {
            btnFetch.disabled = true;
            btnFetch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 获取中';
        }

        try {
            const headers = {};
            if (key) headers['Authorization'] = `Bearer ${key}`;

            const resp = await fetch(endpoint, { method: 'GET', headers });
            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status} ${resp.statusText}${errText ? ` - ${errText.slice(0, 140)}` : ''}`);
            }

            const payload = await resp.json();
            let rawList = [];
            if (Array.isArray(payload && payload.data)) {
                rawList = payload.data.map(m => m && (m.id || m.name)).filter(Boolean);
            } else if (Array.isArray(payload && payload.models)) {
                rawList = payload.models.map(m => (typeof m === 'string' ? m : (m && (m.id || m.name)))).filter(Boolean);
            } else if (Array.isArray(payload)) {
                rawList = payload.map(m => (typeof m === 'string' ? m : (m && (m.id || m.name)))).filter(Boolean);
            }

            const models = Array.from(new Set(rawList)).sort((a, b) => a.localeCompare(b));
            if (models.length === 0) {
                throw new Error('接口返回成功，但未解析到可用模型列表');
            }

            if (selModel) {
                selModel.innerHTML = '';
                const placeholderOpt = document.createElement('option');
                placeholderOpt.value = '';
                placeholderOpt.textContent = `-- 请选择模型 (共 ${models.length} 个) --`;
                selModel.appendChild(placeholderOpt);

                models.forEach(mId => {
                    const opt = document.createElement('option');
                    opt.value = mId;
                    opt.textContent = mId;
                    selModel.appendChild(opt);
                });

                const curVal = inpModel ? inpModel.value.trim() : '';
                if (curVal && models.includes(curVal)) {
                    selModel.value = curVal;
                } else {
                    selModel.value = models[0];
                    if (inpModel) inpModel.value = models[0];
                }
                selModel.style.display = 'block';
            }

            if (resBox) {
                resBox.className = 'ai-config-test-result is-success';
                resBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> 已获取 <b>${models.length}</b> 个可用模型，可在下拉框中切换选择。`;
            }
        } catch (err) {
            if (resBox) {
                resBox.className = 'ai-config-test-result is-error';
                resBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 获取模型失败：${escapeHTML(err.message || '请检查 URL、密钥或跨域设置')}`;
            }
        } finally {
            if (btnFetch) {
                btnFetch.disabled = false;
                btnFetch.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> 获取模型';
            }
        }
    }

    async function testConnection() {
        const inpUrl = document.getElementById('ai-cfg-url');
        const inpKey = document.getElementById('ai-cfg-key');
        const inpModel = document.getElementById('ai-cfg-model');
        const resBox = document.getElementById('ai-config-test-result');
        const btnTest = document.getElementById('btn-ai-test-conn');

        const url = inpUrl ? inpUrl.value.trim() : '';
        const key = inpKey ? inpKey.value.trim() : '';
        const model = inpModel ? inpModel.value.trim() : '';

        if (!url || !model) {
            if (resBox) {
                resBox.className = 'ai-config-test-result is-error';
                resBox.textContent = '请先填写 API Base URL 和模型名称。';
            }
            return;
        }

        const endpoint = buildChatEndpoint(url);
        if (resBox) {
            resBox.className = 'ai-config-test-result is-loading';
            resBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在测试连接...';
        }
        if (btnTest) btnTest.disabled = true;

        const startedAt = Date.now();
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (key) headers['Authorization'] = `Bearer ${key}`;

            const resp = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 8,
                    temperature: 0
                })
            });

            const elapsed = Date.now() - startedAt;
            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status} ${resp.statusText}${errText ? ` - ${errText.slice(0, 160)}` : ''}`);
            }

            if (resBox) {
                resBox.className = 'ai-config-test-result is-success';
                resBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> 连接成功！模型 <b>${escapeHTML(model)}</b> 响应正常（耗时 ${elapsed} ms）。`;
            }
        } catch (err) {
            if (resBox) {
                resBox.className = 'ai-config-test-result is-error';
                resBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> 连接失败：${escapeHTML(err.message || '网络或跨域异常')}`;
            }
        } finally {
            if (btnTest) btnTest.disabled = false;
        }
    }

    function getActiveProtocol() {
        const viewerView = document.getElementById('protocol-viewer-view');
        const arincView = document.getElementById('arinc429-view');
        const serialView = document.getElementById('serial-view');
        const canView = document.getElementById('can-view');
        const ctrls = ProtoView.Controllers || {};

        if (viewerView && viewerView.classList.contains('active') && ctrls.Viewer && ctrls.Viewer.getCurrentProtocol) {
            return ctrls.Viewer.getCurrentProtocol();
        }
        if (arincView && arincView.classList.contains('active') && ctrls.Arinc && ctrls.Arinc.getCurrentProtocol) {
            return ctrls.Arinc.getCurrentProtocol();
        }
        if (serialView && serialView.classList.contains('active') && ctrls.Serial && ctrls.Serial.getCurrentProtocol) {
            return ctrls.Serial.getCurrentProtocol();
        }
        if (canView && canView.classList.contains('active') && ctrls.Can && ctrls.Can.getCurrentProtocol) {
            return ctrls.Can.getCurrentProtocol();
        }
        return null;
    }

    function compactProtocolDetail(proto) {
        if (!proto) return null;
        const copy = {
            id: proto.id,
            name: proto.name,
            type: proto.subType || proto.type,
            product: proto.product || '',
            device: proto.device || proto.source || '',
            version: proto.version || 'v1.0',
            isArchived: Boolean(proto.isArchived),
            period: proto.period,
            speed: proto.speed,
            baudRate: proto.baudRate,
            parity: proto.parity,
            description: proto.description || ''
        };
        if (Array.isArray(proto.packets) && proto.packets.length > 0) {
            copy.packets = proto.packets.map(pkt => ({
                name: pkt.name,
                direction: pkt.direction,
                period: pkt.period,
                canId: pkt.canId,
                words: pkt.words,
                fields: pkt.fields,
                bytes: pkt.bytes
            }));
        } else {
            if (Array.isArray(proto.words)) copy.words = proto.words;
            if (Array.isArray(proto.fields)) copy.fields = proto.fields;
            if (Array.isArray(proto.frames)) copy.frames = proto.frames;
        }
        return copy;
    }

    async function buildProtocolContext(userQuery) {
        const toggle = document.getElementById('ai-include-context-toggle');
        if (toggle && !toggle.checked) return '';

        const allProtocols = (window.dbHelper && typeof window.dbHelper.getAllProtocols === 'function')
            ? await window.dbHelper.getAllProtocols().catch(() => [])
            : [];
        const activeProto = getActiveProtocol();

        if ((!allProtocols || allProtocols.length === 0) && !activeProto) {
            return '\n\n【站内协议库状态】当前协议库为空，暂无任何通信协议。';
        }

        const sections = [];

        // 1. 全站协议目录摘要
        if (allProtocols && allProtocols.length > 0) {
            const summaryList = allProtocols.map((p, idx) => {
                const pktCount = Array.isArray(p.packets) ? p.packets.length : 1;
                const prodStr = p.product ? ` | 产品:${p.product}` : '';
                const verStr = p.version || 'v1.0';
                const arcStr = p.isArchived ? '已归档' : '未归档';
                return `${idx + 1}. [ID:${p.id}] [${p.subType || p.type}] ${p.name}${prodStr} | 版本:${verStr}(${arcStr}) | 对端:${p.device || p.source || '-'} | 周期:${p.period || '-'}ms | 数据包:${pktCount}`;
            });
            sections.push(`【站内协议库目录（共 ${allProtocols.length} 个协议）】\n${summaryList.join('\n')}`);
        }

        // 2. 收集需要注入详细字段结构的协议（当前打开的协议 + 用户提问中提及名称/产品的协议）
        const detailedProtos = [];
        const addedIds = new Set();
        const addDetail = (p, label) => {
            if (!p) return;
            const key = String(p.id || p.name);
            if (addedIds.has(key)) return;
            addedIds.add(key);
            const compact = compactProtocolDetail(p);
            let jsonStr = JSON.stringify(compact);
            if (jsonStr.length > 18000) {
                jsonStr = jsonStr.slice(0, 18000) + '... (内容过长已截断)';
            }
            detailedProtos.push(`【${label}: ${p.name}】\n${jsonStr}`);
        };

        if (activeProto) {
            addDetail(activeProto, '当前正在查看/编辑的协议详情');
        }

        const q = String(userQuery || '').toLowerCase();
        if (q && allProtocols && allProtocols.length > 0) {
            allProtocols.forEach(p => {
                const nameMatch = p.name && q.includes(p.name.toLowerCase());
                const prodMatch = p.product && q.includes(p.product.toLowerCase());
                if ((nameMatch || prodMatch) && detailedProtos.length < 4) {
                    addDetail(p, '匹配到的协议详情');
                }
            });
        }

        // 若用户未打开任何协议且未指名特定协议，但协议总数很少(<=2)，主动附上全部详情方便直接提问
        if (detailedProtos.length === 0 && allProtocols && allProtocols.length > 0 && allProtocols.length <= 2) {
            allProtocols.forEach(p => addDetail(p, '协议详情'));
        }

        if (detailedProtos.length > 0) {
            sections.push(detailedProtos.join('\n\n'));
        }

        return '\n\n' + sections.join('\n\n');
    }

    async function sendMessage(presetText = null) {
        if (isSending) return;
        const inputEl = document.getElementById('ai-chat-input');
        const sendBtn = document.getElementById('btn-ai-send');
        const text = (presetText !== null ? presetText : (inputEl ? inputEl.value : '')).trim();
        if (!text && !pendingAttachment) return;

        if (!isModelConfigured()) {
            showToast('请先配置大模型 URL 与密钥后再发起对话', 'warning');
            setConfigPanelOpen(true);
            return;
        }

        const userMsg = {
            role: 'user',
            content: text || `已附带文件：${pendingAttachment.name}`,
            attachmentName: pendingAttachment ? pendingAttachment.name : null
        };
        chatMessages.push(userMsg);

        if (inputEl && presetText === null) {
            inputEl.value = '';
            inputEl.style.height = 'auto';
        }
        clearAttachment();
        renderMessages();

        // 添加占位思考消息
        const thinkingMsg = { role: 'assistant', content: '正在思考...' };
        chatMessages.push(thinkingMsg);
        renderMessages();

        isSending = true;
        if (sendBtn) sendBtn.disabled = true;

        try {
            const endpoint = buildChatEndpoint(aiConfig.baseUrl);
            const headers = { 'Content-Type': 'application/json' };
            if (aiConfig.apiKey && aiConfig.apiKey.trim()) {
                headers['Authorization'] = `Bearer ${aiConfig.apiKey.trim()}`;
            }

            const protocolContext = await buildProtocolContext(text);
            const systemInstruction = [
                '你是 ProtoView 航空/工控通信总线协议管理平台的 AI 协议助手，擅长 ARINC 429、CAN 与串口协议的解析、校验与对比分析。',
                '请基于下方提供的站内协议库真实数据用简洁清晰的中文回答；在侧边栏展示表格时请尽量精简列数（建议不超过 4 列），避免过宽。',
                '当用户明确要求【修改协议】、【新增字段/报文】、【新建协议】或【删除协议】时，请在回复末尾额外输出一个如下格式的指令块，前端会渲染成确认按钮供用户一键生效：',
                '```protoview-action',
                '{"action":"update_protocol","protocolId":协议ID,"protocolName":"协议名称","summary":"简明变更说明","patch":{要更新的字段对象，如period、name、packets等}}',
                '```',
                '注意：修改 packets 时请保留原有未改动的数据包与字段结构，只做增量调整；若需新建协议可将 action 设为 "create_protocol"；若需删除协议可将 action 设为 "delete_protocol"（无需 patch，只需提供 protocolId、protocolName 和 summary）。'
            ].join('\n');

            const apiMessages = [
                {
                    role: 'system',
                    content: systemInstruction + protocolContext
                },
                ...chatMessages
                    .slice(0, -1)
                    .map(m => ({ role: m.role, content: m.content }))
            ];

            const resp = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: aiConfig.model,
                    messages: apiMessages,
                    temperature: Number(aiConfig.temperature) || 0.3
                })
            });

            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200) || resp.statusText}`);
            }

            const data = await resp.json();
            const reply = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
                ? data.choices[0].message.content
                : '模型未返回有效文本内容。';

            thinkingMsg.content = reply;
        } catch (err) {
            thinkingMsg.content = `请求失败：${err.message || '请检查模型 URL、密钥或跨域设置。'}`;
        } finally {
            isSending = false;
            if (sendBtn) sendBtn.disabled = false;
            renderMessages();
        }
    }

    function clearAttachment() {
        pendingAttachment = null;
        const preview = document.getElementById('ai-attachment-preview');
        const fileInput = document.getElementById('ai-doc-file-input');
        if (preview) {
            preview.innerHTML = '';
            preview.classList.remove('active');
        }
        if (fileInput) fileInput.value = '';
    }

    function attachFile(file) {
        if (!file) return;
        pendingAttachment = file;
        const preview = document.getElementById('ai-attachment-preview');
        if (!preview) return;
        preview.innerHTML = `
            <span class="ai-attach-chip">
                <i class="fa-solid fa-file-word"></i>
                <span>${escapeHTML(file.name)}</span>
                <button type="button" class="ai-attach-remove" id="btn-ai-remove-attach" title="移除附件">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </span>
        `;
        preview.classList.add('active');
        const rmBtn = document.getElementById('btn-ai-remove-attach');
        if (rmBtn) rmBtn.addEventListener('click', clearAttachment);
    }

    function bindEvents() {
        loadConfig();
        updateModelStatusUI();

        const btnSidebarOpen = document.getElementById('sidebar-tool-ai-chat');
        const btnClose = document.getElementById('btn-ai-close-drawer');
        const backdrop = document.getElementById('ai-drawer-backdrop');
        const btnToggleCfg = document.getElementById('btn-ai-toggle-config');
        const statusPill = document.getElementById('ai-model-status-pill');
        const btnGoConfig = document.getElementById('btn-ai-go-config');
        const btnClear = document.getElementById('btn-ai-clear-chat');

        if (btnSidebarOpen) btnSidebarOpen.addEventListener('click', toggleDrawer);
        if (btnClose) btnClose.addEventListener('click', closeDrawer);
        if (backdrop) backdrop.addEventListener('click', closeDrawer);
        if (btnToggleCfg) btnToggleCfg.addEventListener('click', () => setConfigPanelOpen(!isConfigViewOpen));
        if (statusPill) statusPill.addEventListener('click', () => setConfigPanelOpen(true));
        if (btnGoConfig) btnGoConfig.addEventListener('click', () => setConfigPanelOpen(true));

        if (btnClear) {
            btnClear.addEventListener('click', () => {
                chatMessages = [];
                renderMessages();
                showToast('已清空 AI 对话记录', 'info');
            });
        }

        // 配置面板联动
        const selPreset = document.getElementById('ai-cfg-preset');
        const inpUrl = document.getElementById('ai-cfg-url');
        const inpKey = document.getElementById('ai-cfg-key');
        const inpModel = document.getElementById('ai-cfg-model');
        const selModel = document.getElementById('ai-cfg-model-select');
        const btnFetchModels = document.getElementById('btn-ai-fetch-models');
        const inpTemp = document.getElementById('ai-cfg-temp');
        const btnToggleKeyVis = document.getElementById('btn-ai-toggle-key-vis');
        const btnTestConn = document.getElementById('btn-ai-test-conn');
        const btnCancelCfg = document.getElementById('btn-ai-cancel-config');
        const formCfg = document.getElementById('ai-config-form');

        if (btnFetchModels) btnFetchModels.addEventListener('click', fetchAvailableModels);
        if (selModel && inpModel) {
            selModel.addEventListener('change', () => {
                if (selModel.value) inpModel.value = selModel.value;
            });
        }

        if (selPreset) {
            selPreset.addEventListener('change', () => {
                const preset = PROVIDER_PRESETS[selPreset.value];
                if (!preset) return;
                if (preset.baseUrl && inpUrl) inpUrl.value = preset.baseUrl;
                if (preset.model && inpModel) inpModel.value = preset.model;
            });
        }

        if (btnToggleKeyVis && inpKey) {
            btnToggleKeyVis.addEventListener('click', () => {
                const isPwd = inpKey.type === 'password';
                inpKey.type = isPwd ? 'text' : 'password';
                btnToggleKeyVis.innerHTML = isPwd
                    ? '<i class="fa-solid fa-eye-slash"></i>'
                    : '<i class="fa-solid fa-eye"></i>';
            });
        }

        if (btnTestConn) btnTestConn.addEventListener('click', testConnection);
        if (btnCancelCfg) btnCancelCfg.addEventListener('click', () => setConfigPanelOpen(false));

        if (formCfg) {
            formCfg.addEventListener('submit', (e) => {
                e.preventDefault();
                saveConfig({
                    preset: selPreset ? selPreset.value : 'custom',
                    baseUrl: inpUrl ? inpUrl.value.trim() : '',
                    apiKey: inpKey ? inpKey.value.trim() : '',
                    model: inpModel ? inpModel.value.trim() : '',
                    temperature: inpTemp ? parseFloat(inpTemp.value) : 0.3
                });
                showToast('大模型配置已保存', 'success');
                setConfigPanelOpen(false);
            });
        }

        // 输入区事件
        const btnUploadDoc = document.getElementById('btn-ai-upload-doc');
        const fileInput = document.getElementById('ai-doc-file-input');
        const chatInput = document.getElementById('ai-chat-input');
        const btnSend = document.getElementById('btn-ai-send');

        if (btnUploadDoc && fileInput) {
            btnUploadDoc.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files[0]) {
                    attachFile(fileInput.files[0]);
                }
            });
        }

        if (chatInput) {
            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            });
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        if (btnSend) {
            btnSend.addEventListener('click', () => sendMessage());
        }

        // 快捷提问按钮
        document.querySelectorAll('.ai-quick-prompt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const promptText = btn.getAttribute('data-prompt') || btn.textContent.trim();
                sendMessage(promptText);
            });
        });

        // Esc 关闭抽屉
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const drawer = document.getElementById('ai-assistant-drawer');
                if (drawer && drawer.classList.contains('active')) {
                    closeDrawer();
                }
            }
        });
    }

    ProtoView.AIAssistant = {
        open: openDrawer,
        close: closeDrawer,
        toggle: toggleDrawer,
        getConfig: () => Object.assign({}, aiConfig),
        isConfigured: isModelConfigured
    };

    global.openAiAssistantDrawer = openDrawer;
    global.toggleAiAssistantDrawer = toggleDrawer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

})(typeof window !== 'undefined' ? window : this);
