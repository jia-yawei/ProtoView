/**
 * @file core.js
 * @brief ProtoView 全局核心基础设施与微型事件总线
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};

    // 1. 安全字符串转义 (防 XSS)
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 2. 悬浮反馈 Toast 提示
    function showToast(message, type = 'success') {
        const existing = document.querySelectorAll('.pv-toast');
        existing.forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `pv-toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
        toast.innerHTML = `<i class="fa-solid ${icon}" style="color:${type === 'success' ? '#10b981' : 'var(--accent-color)'};"></i> <span>${escapeHTML(message)}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px) scale(0.95)';
            setTimeout(() => toast.remove(), 280);
        }, 2500);
    }

    // 3. 通用剪贴板复制辅助
    function copyTextToClipboard(text, onSuccess) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (onSuccess) onSuccess();
            }).catch(() => {
                fallbackCopy(text, onSuccess);
            });
        } else {
            fallbackCopy(text, onSuccess);
        }
    }

    function fallbackCopy(text, onSuccess) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error('无法复制文本', err);
        }
        document.body.removeChild(textarea);
    }

    // 4. 通用文件下载辅助
    function downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 5. 跨模块微型事件发布订阅器 (Pub/Sub)
    const eventHandlers = new Map();
    const Events = {
        on(event, handler) {
            if (!eventHandlers.has(event)) {
                eventHandlers.set(event, new Set());
            }
            eventHandlers.get(event).add(handler);
            return () => this.off(event, handler);
        },
        off(event, handler) {
            if (eventHandlers.has(event)) {
                eventHandlers.get(event).delete(handler);
            }
        },
        emit(event, payload) {
            if (eventHandlers.has(event)) {
                eventHandlers.get(event).forEach(handler => {
                    try {
                        handler(payload);
                    } catch (e) {
                        console.error(`ProtoView: 事件 [${event}] 处理异常:`, e);
                    }
                });
            }
        }
    };

    // 6. 全局视图路由切换
    function switchToView(viewId) {
        const currentActive = document.querySelector('.view-section.active');
        if (currentActive && currentActive.id === viewId) {
            return; // 已处于目标视图，避免重复重绘与事件风暴循环
        }

        const navItems = document.querySelectorAll('.nav-item');
        const viewSections = document.querySelectorAll('.view-section');

        navItems.forEach(nav => nav.classList.remove('active'));
        viewSections.forEach(section => section.classList.remove('active'));

        const navTarget = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (navTarget) {
            navTarget.classList.add('active');
        } else if (viewId === 'arinc429-view' || viewId === 'serial-view' || viewId === 'protocol-viewer-view') {
            const protoNav = document.querySelector(`.nav-item[data-view="protocol-view"]`);
            if (protoNav) protoNav.classList.add('active');
        }

        const sectionTarget = document.getElementById(viewId);
        if (sectionTarget) sectionTarget.classList.add('active');

        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            if (viewId === 'arinc429-view' || viewId === 'serial-view' || viewId === 'protocol-viewer-view') {
                mainContent.classList.add('dense-workbench-active');
            } else {
                mainContent.classList.remove('dense-workbench-active');
            }
        }

        // 发布视图切换事件 (同时传递 viewId 与载荷对象)
        Events.emit('view:changed', viewId);
    }

    // 组装挂载命名空间
    ProtoView.Utils = {
        escapeHTML,
        showToast,
        copyTextToClipboard,
        fallbackCopy,
        downloadFile
    };
    ProtoView.Events = Events;
    ProtoView.UI = {
        switchToView
    };
    ProtoView.Controllers = {};

    global.ProtoView = ProtoView;

    // 向后兼容全局函数 (让旧有 inline onclick 零成本直接可用)
    global.escapeHTML = escapeHTML;
    global.showToast = showToast;
    global.copyTextToClipboard = copyTextToClipboard;
    global.downloadFile = downloadFile;
    global.switchToView = switchToView;

})(typeof window !== 'undefined' ? window : this);
