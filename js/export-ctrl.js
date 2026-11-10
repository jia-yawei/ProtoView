/**
 * @file export-ctrl.js
 * @brief ProtoView 全局统一协议规格书与工程数据导出中心 (Universal Protocol Exporter)
 * 统一只读查阅模式与工作台编辑模式的导出交互体验：
 * 无论在何种视角，均可自由一键导出：
 * 1. 配置文件 (.json) - 完整工程定义与数据包，支持系统重新导入还原
 * 2. PDF 规格书 (PDF / 打印) - 航电与工业级交付卡片排版
 * 3. Markdown 规范 (.md) - GFM 标准技术说明书，支持下载与一键复制源码
 * 4. 独立 HTML 卡片 (.html) - 自包含离线网页，零依赖双击即览
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

    // 内部状态
    let currentExportProtocol = null;
    let currentExportMd = '';
    let currentExportHtml = '';
    let currentExportJson = '';

    // DOM 引用
    let exportModal;
    let exportModalProtoName, exportModalProtoBadge;
    let tabBtnPreview, tabBtnCode, tabBtnJson;
    let exportPreviewContainer, exportRenderedPreview;
    let exportCodeContainer, exportMdCodeBlock;
    let exportJsonContainer, exportJsonCodeBlock;
    let btnDownloadJson, btnPrintPreviewHtml, btnDownloadMd, btnCopyMd, btnDownloadHtmlSpec, btnCopyJson;

    function initDOMElements() {
        exportModal = document.getElementById('protocol-export-modal') || document.getElementById('arinc-export-md-modal');
        exportModalProtoName = document.getElementById('export-modal-proto-name');
        exportModalProtoBadge = document.getElementById('export-modal-proto-badge');

        tabBtnPreview = document.getElementById('tab-btn-export-view-preview');
        tabBtnCode = document.getElementById('tab-btn-export-view-code');
        tabBtnJson = document.getElementById('tab-btn-export-view-json');

        exportPreviewContainer = document.getElementById('export-preview-container');
        exportRenderedPreview = document.getElementById('export-rendered-preview');

        exportCodeContainer = document.getElementById('export-code-container');
        exportMdCodeBlock = document.getElementById('export-md-code-block');

        exportJsonContainer = document.getElementById('export-json-container');
        exportJsonCodeBlock = document.getElementById('export-json-code-block');

        btnDownloadJson = document.getElementById('btn-download-json');
        btnPrintPreviewHtml = document.getElementById('btn-print-preview-html');
        btnDownloadMd = document.getElementById('btn-download-md');
        btnCopyMd = document.getElementById('btn-copy-md');
        btnDownloadHtmlSpec = document.getElementById('btn-download-html-spec');
        btnCopyJson = document.getElementById('btn-copy-json');
    }

    /**
     * 为未知或通用协议 (如 CAN 或通用总线) 兜底生成 Markdown 与 HTML 规范
     */
    function generateGenericMarkdown(p) {
        let md = `# ${p.name || '通信协议'} ${p.product ? `[所属产品: ${p.product}]` : ''}\n\n`;
        md += `> 类型: ${p.type || 'Bus'} | 设备: ${p.device || p.source || '-'} | 周期: ${p.period || 20}ms\n\n`;
        if (p.description) md += `**协议说明**: ${p.description}\n\n`;

        const packets = p.packets || p.frames || [];
        if (packets.length === 0) {
            md += `> 暂无数据报文。\n\n`;
            return md;
        }

        packets.forEach((pkt, idx) => {
            md += `### ${idx + 1}. 报文/数据包: ${pkt.name || `报文 ${idx + 1}`}\n\n`;
            const items = pkt.words || pkt.fields || pkt.signals || [];
            if (items.length > 0) {
                md += `| 序号 | 字段/信号名称 | 编码/标识 | 类型 | 单位 | 说明 |\n`;
                md += `| :---: | :--- | :---: | :---: | :---: | :--- |\n`;
                items.forEach((it, iIdx) => {
                    md += `| ${iIdx + 1} | ${it.name || '未命名'} | ${it.label || it.key || it.offset || '-'} | ${it.dataType || '-'} | ${it.unit || '-'} | ${it.remark || '-'} |\n`;
                });
                md += `\n`;
            }
        });
        return md;
    }

    function generateGenericHtml(p, mdText) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${p.name || '通信协议'} - ICD 规格书</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; background: #f8fafc; color: #1e293b; }
    .container { max-width: 960px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .no-print { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; }
    th { background: #f1f5f9; }
    @media print { .no-print { display: none; } body { background: #fff; padding: 0; } .container { box-shadow: none; max-width: 100%; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="no-print">
      <span><strong>通信协议 ICD 规格书</strong></span>
      <button class="btn" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
    </div>
    <h1>${p.name || '通信协议'}</h1>
    <p>总线类型: <b>${p.type || '-'}</b> | 所属产品: <b>${p.product || '-'}</b> | 对端设备: <b>${p.device || '-'}</b></p>
    <hr>
    <div>
      ${mdText.replace(/\n/g, '<br>')}
    </div>
  </div>
</body>
</html>`;
    }

    /**
     * 核心统一导出弹窗呼出函数
     * 支持传入协议对象、协议 ID，或自动从当前活跃视图捕获
     */
    async function openProtocolExportModal(protoOrId) {
        initDOMElements();

        let p = null;
        if (protoOrId && typeof protoOrId === 'object' && protoOrId.name) {
            p = protoOrId;
        } else if (protoOrId !== undefined && protoOrId !== null && protoOrId !== '') {
            p = await (window.dbHelper ? window.dbHelper.getProtocol(protoOrId) : null);
        }

        // 若未指定，从当前活跃视图中智能获取活跃协议
        if (!p) {
            const viewerView = document.getElementById('protocol-viewer-view');
            const arincView = document.getElementById('arinc429-view');
            const serialView = document.getElementById('serial-view');

            if (viewerView && viewerView.classList.contains('active')) {
                if (ProtoView.Controllers.Viewer && ProtoView.Controllers.Viewer.getCurrentProtocol) {
                    p = ProtoView.Controllers.Viewer.getCurrentProtocol();
                }
            } else if (serialView && serialView.classList.contains('active')) {
                if (ProtoView.Controllers.Serial && ProtoView.Controllers.Serial.getCurrentProtocol) {
                    p = ProtoView.Controllers.Serial.getCurrentProtocol();
                }
            } else if (arincView && arincView.classList.contains('active')) {
                if (ProtoView.Controllers.Arinc && ProtoView.Controllers.Arinc.getCurrentProtocol) {
                    p = ProtoView.Controllers.Arinc.getCurrentProtocol();
                }
            }

            // 二次兜底
            if (!p && ProtoView.Controllers.Arinc && ProtoView.Controllers.Arinc.getCurrentProtocol) {
                p = ProtoView.Controllers.Arinc.getCurrentProtocol();
            }
            if (!p && ProtoView.Controllers.Serial && ProtoView.Controllers.Serial.getCurrentProtocol) {
                p = ProtoView.Controllers.Serial.getCurrentProtocol();
            }
            if (!p && ProtoView.Controllers.Viewer && ProtoView.Controllers.Viewer.getCurrentProtocol) {
                p = ProtoView.Controllers.Viewer.getCurrentProtocol();
            }
        }

        if (!p) {
            showToast('请先选择或创建一个通信协议', 'warning');
            return;
        }

        currentExportProtocol = p;

        // 生成各格式内容
        currentExportJson = JSON.stringify(p, null, 2);

        if (p.type === 'ARINC429' && typeof Arinc429Helper !== 'undefined') {
            currentExportMd = Arinc429Helper.generateMarkdownSpec(p);
            currentExportHtml = Arinc429Helper.generateHtmlSpec(p);
        } else if (p.type === 'Serial' && typeof SerialHelper !== 'undefined' && typeof SerialHelper.generateMarkdownSpec === 'function') {
            currentExportMd = SerialHelper.generateMarkdownSpec(p);
            currentExportHtml = SerialHelper.generateHtmlSpec(p);
        } else {
            currentExportMd = generateGenericMarkdown(p);
            currentExportHtml = generateGenericHtml(p, currentExportMd);
        }

        // 渲染弹窗头部元数据
        if (exportModalProtoName) {
            exportModalProtoName.textContent = p.name || '未命名协议';
            exportModalProtoName.title = p.name || '';
        }

        if (exportModalProtoBadge) {
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
            exportModalProtoBadge.textContent = typeLabel;
            exportModalProtoBadge.className = `viewer-type-pill ${isArinc ? 'pill-arinc' : (isSerial ? 'pill-serial' : 'pill-can')}`;
        }

        // 渲染预览内容
        if (exportRenderedPreview) {
            // 直接渲染规格说明书的可视化内容
            if (p.type === 'ARINC429') {
                const tablesHtml = currentExportMd
                    .replace(/^#\s+[^\n]+\n+/, '')
                    .replace(/###\s+[^\n]+/g, (m) => `<h3 style="margin: 1.5rem 0 0.8rem 0; font-size: 15px; color: #1e293b;">${m.replace(/###\s+/, '')}</h3>`)
                    .replace(/---/g, '<hr style="border:none; border-top:1px dashed #cbd5e1; margin: 2rem 0;">');

                exportRenderedPreview.innerHTML = `
                    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
                        <div>
                            <h2 style="margin:0; font-size: 20px; font-weight:bold; color:#0f172a;">${escapeHTML(p.name || 'ARINC 429 通信协议')}</h2>
                            <div style="font-size:12px; color:#64748b; margin-top:4px;">所属产品: ${escapeHTML(p.product || '-')} | 设备来源: ${escapeHTML(p.device || p.source || '-')} | 速率: ${escapeHTML(p.speed || '100kbps')}</div>
                        </div>
                        <div style="text-align:right; font-size:12px; color:#64748b;">
                            <div>符合标准: ARINC 429</div>
                            <div>数位格式: 32位 航电双列对照</div>
                        </div>
                    </div>
                    ${tablesHtml}
                `;
            } else if (p.type === 'Serial') {
                // 提取 HTML 中的主体容器内容以便预览
                const parser = new DOMParser();
                const doc = parser.parseFromString(currentExportHtml, 'text/html');
                const pageContainer = doc.querySelector('.page-container');
                if (pageContainer) {
                    const noPrint = pageContainer.querySelector('.no-print-bar');
                    if (noPrint) noPrint.remove();
                    exportRenderedPreview.innerHTML = pageContainer.innerHTML;
                } else {
                    exportRenderedPreview.innerHTML = `<pre style="white-space:pre-wrap;">${escapeHTML(currentExportMd)}</pre>`;
                }
            } else {
                exportRenderedPreview.innerHTML = `
                    <h2>${escapeHTML(p.name || '通信协议')}</h2>
                    <pre style="white-space:pre-wrap; font-size:13px; font-family:sans-serif;">${escapeHTML(currentExportMd)}</pre>
                `;
            }
        }

        if (exportMdCodeBlock) {
            exportMdCodeBlock.textContent = currentExportMd;
        }

        if (exportJsonCodeBlock) {
            exportJsonCodeBlock.textContent = currentExportJson;
        }

        // 默认显示规格书预览视图
        switchExportTab('preview');

        // 打开弹窗
        if (exportModal) {
            exportModal.classList.add('active');
        }
    }

    /**
     * 切换弹窗内预览标签页
     */
    function switchExportTab(tabName) {
        if (!tabBtnPreview || !tabBtnCode) return;

        tabBtnPreview.classList.remove('dense-btn-active');
        tabBtnCode.classList.remove('dense-btn-active');
        if (tabBtnJson) tabBtnJson.classList.remove('dense-btn-active');

        if (exportPreviewContainer) exportPreviewContainer.style.display = 'none';
        if (exportCodeContainer) exportCodeContainer.style.display = 'none';
        if (exportJsonContainer) exportJsonContainer.style.display = 'none';

        if (tabName === 'code') {
            tabBtnCode.classList.add('dense-btn-active');
            if (exportCodeContainer) exportCodeContainer.style.display = 'block';
        } else if (tabName === 'json') {
            if (tabBtnJson) tabBtnJson.classList.add('dense-btn-active');
            if (exportJsonContainer) exportJsonContainer.style.display = 'block';
        } else {
            tabBtnPreview.classList.add('dense-btn-active');
            if (exportPreviewContainer) exportPreviewContainer.style.display = 'block';
        }
    }

    /**
     * 执行打印或另存为 PDF
     */
    function doPrintOrSavePdf() {
        if (!currentExportProtocol || !currentExportHtml) {
            showToast('暂无有效的协议规格书可打印', 'warning');
            return;
        }

        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.open();
            printWin.document.write(currentExportHtml);
            printWin.document.close();
            printWin.focus();
            setTimeout(() => {
                printWin.print();
            }, 350);
        } else {
            // 被拦截回退
            window.print();
        }
    }

    /**
     * 执行下载 HTML 离线规格卡片
     */
    function doDownloadHtml() {
        if (!currentExportProtocol || !currentExportHtml) {
            showToast('暂无有效的协议规格书可导出', 'warning');
            return;
        }
        const safeName = (currentExportProtocol.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const fileName = `${safeName}_ICD规范卡片.html`;
        downloadFile(currentExportHtml, fileName, 'text/html;charset=utf-8');
        showToast(`已成功导出独立 HTML 规范卡片「${fileName}」`, 'success');
    }

    /**
     * 执行下载 Markdown 规范说明书
     */
    function doDownloadMd() {
        if (!currentExportProtocol || !currentExportMd) {
            showToast('暂无有效的协议规范可导出', 'warning');
            return;
        }
        const safeName = (currentExportProtocol.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const fileName = `${safeName}_ICD规范说明书.md`;
        downloadFile(currentExportMd, fileName, 'text/markdown;charset=utf-8');
        showToast(`已成功导出 Markdown 规范「${fileName}」`, 'success');
    }

    /**
     * 复制 Markdown 源码
     */
    function doCopyMd() {
        if (!currentExportMd) return;
        copyTextToClipboard(currentExportMd, () => {
            showToast('已复制 Markdown 规范全文至剪贴板', 'success');
        });
    }

    /**
     * 执行导出 JSON 配置文件 (用于备份与二次导入)
     */
    function doDownloadJson() {
        if (!currentExportProtocol) {
            showToast('暂无有效的协议配置可导出', 'warning');
            return;
        }
        const safeName = (currentExportProtocol.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const fileName = `${safeName}.json`;
        downloadFile(JSON.stringify(currentExportProtocol, null, 2), fileName, 'application/json');
        showToast(`已成功导出协议配置文件「${fileName}」`, 'success');
    }

    /**
     * 复制 JSON 源码
     */
    function doCopyJson() {
        if (!currentExportJson) return;
        copyTextToClipboard(currentExportJson, () => {
            showToast('已复制 JSON 配置全文至剪贴板', 'success');
        });
    }

    /**
     * 统一绑定导出中心事件
     */
    function bindExportEvents() {
        initDOMElements();

        // 标签切换
        if (tabBtnPreview) {
            tabBtnPreview.addEventListener('click', () => switchExportTab('preview'));
        }
        if (tabBtnCode) {
            tabBtnCode.addEventListener('click', () => switchExportTab('code'));
        }
        if (tabBtnJson) {
            tabBtnJson.addEventListener('click', () => switchExportTab('json'));
        }

        // 四大导出核心动作
        if (btnDownloadJson) {
            btnDownloadJson.addEventListener('click', doDownloadJson);
        }
        if (btnPrintPreviewHtml) {
            btnPrintPreviewHtml.addEventListener('click', doPrintOrSavePdf);
        }
        if (btnDownloadMd) {
            btnDownloadMd.addEventListener('click', doDownloadMd);
        }
        if (btnCopyMd) {
            btnCopyMd.addEventListener('click', doCopyMd);
        }
        if (btnDownloadHtmlSpec) {
            btnDownloadHtmlSpec.addEventListener('click', doDownloadHtml);
        }
        if (btnCopyJson) {
            btnCopyJson.addEventListener('click', doCopyJson);
        }

        // 统一为工作台及阅读模式工具栏的各导出按钮绑定同一触发入口
        const bindTrigger = (id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    openProtocolExportModal();
                });
            }
        };

        bindTrigger('btn-viewer-export');
        bindTrigger('btn-viewer-export-md');
        bindTrigger('btn-arinc-export');
        bindTrigger('btn-serial-export');
        bindTrigger('btn-serial-export-json');
    }

    // 控制器接口暴露
    const ExportController = {
        openProtocolExportModal,
        openExportModal: openProtocolExportModal,
        doPrintOrSavePdf,
        doDownloadHtml,
        doDownloadMd,
        doDownloadJson,
        switchExportTab,
        bindEvents: bindExportEvents
    };

    ProtoView.Controllers.Export = ExportController;
    global.ProtoView = ProtoView;

    // 全局兼容函数挂载
    global.openProtocolExportModal = openProtocolExportModal;
    global.openExportMdModal = openProtocolExportModal; // 兼容旧代码
    global.exportProtocolById = openProtocolExportModal; // 让卡片导出直接打开统一导出中心

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindExportEvents);
    } else {
        bindExportEvents();
    }

})(typeof window !== 'undefined' ? window : this);
