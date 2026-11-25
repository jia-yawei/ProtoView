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
    function switchToView(viewId, force = false) {
        const currentActive = document.querySelector('.view-section.active');
        if (currentActive && currentActive.id === viewId) {
            return; // 已处于目标视图，避免重复重绘与事件风暴循环
        }

        if (!force && currentActive && (currentActive.id === 'arinc429-view' || currentActive.id === 'serial-view' || currentActive.id === 'can-view')) {
            if (ProtoView.DraftManager && ProtoView.DraftManager.hasUnsavedChanges()) {
                if (typeof ProtoView.confirmUnsavedNavigation === 'function') {
                    ProtoView.confirmUnsavedNavigation('离开当前编辑页面', () => {
                        switchToView(viewId, true);
                    });
                    return;
                }
            }
        }

        const navItems = document.querySelectorAll('.nav-item');
        const viewSections = document.querySelectorAll('.view-section');

        viewSections.forEach(section => section.classList.remove('active'));

        if (viewId === 'protocol-view') {
            const hasActiveBus = document.querySelector('.nav-item[data-view="protocol-view"].active');
            if (!hasActiveBus) {
                navItems.forEach(nav => nav.classList.remove('active'));
                const allNav = document.getElementById('nav-bus-all') || document.querySelector('.nav-item[data-view="protocol-view"]');
                if (allNav) allNav.classList.add('active');
            }
        } else if (viewId === 'admin-view') {
            navItems.forEach(nav => nav.classList.remove('active'));
            const adminNav = document.getElementById('nav-btn-admin');
            if (adminNav) adminNav.classList.add('active');
        } else if (viewId === 'protocol-version-view') {
            navItems.forEach(nav => nav.classList.remove('active'));
            const diffNav = document.getElementById('sidebar-tool-diff');
            if (diffNav) diffNav.classList.add('active');
        }

        const sectionTarget = document.getElementById(viewId);
        if (sectionTarget) sectionTarget.classList.add('active');

        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            if (viewId === 'arinc429-view' || viewId === 'serial-view' || viewId === 'can-view' || viewId === 'protocol-viewer-view' || viewId === 'protocol-version-view') {
                mainContent.classList.add('dense-workbench-active');
            } else {
                mainContent.classList.remove('dense-workbench-active');
            }
        }

        // ================= 侧边栏进入协议查阅详情页或版本管理主视图自动折叠与离开恢复 =================
        const mainSidebar = document.getElementById('main-sidebar');
        if (mainSidebar) {
            if (viewId === 'protocol-viewer-view' || viewId === 'protocol-version-view') {
                // 进入协议查阅详情页或版本管理主视图：自动收起为 Mini Sidebar 窄图标模式 (64px)，将横向宽度最大化释放给主工作区
                if (!mainSidebar.classList.contains('collapsed')) {
                    mainSidebar.classList.add('collapsed');
                    window._sidebarAutoCollapsedByViewer = true;
                }
            } else if (viewId === 'protocol-view') {
                // 返回主协议列表：若此前进入详情页或版本管理页时由系统自动折叠，则无缝恢复展开宽度
                if (window._sidebarAutoCollapsedByViewer) {
                    mainSidebar.classList.remove('collapsed');
                    window._sidebarAutoCollapsedByViewer = false;
                }
            }
        }

        // 刷新侧边栏活跃会话卡片
        if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.render === 'function') {
            ProtoView.ActiveSession.render();
        }

        // 发布视图切换事件 (同时传递 viewId 与载荷对象)
        Events.emit('view:changed', viewId);
    }

    /**
     * 7. 全局自定义确认弹窗 (Promise 异步化，彻底取代原生浏览器 confirm)
     * @param {Object} options 
     *   - title: 弹窗标题 (默认: '操作确认')
     *   - message: 主提示文案 (粗体核心提示)
     *   - detail: 补充详细说明或后果警告
     *   - icon: 图标类名 (如 'fa-box-archive', 'fa-triangle-exclamation')
     *   - type: 类型 ('primary' | 'warning' | 'danger' | 'archive')
     *   - confirmText: 确认按钮文字 (默认: '确定')
     *   - cancelText: 取消按钮文字 (默认: '取消')
     * @returns {Promise<boolean>}
     */
    function showConfirm(options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('global-confirm-modal');
            if (!modal) {
                // 兜底降级
                const nativeOk = window.confirm((options.message || '') + (options.detail ? ('\n\n' + options.detail) : ''));
                resolve(nativeOk);
                return;
            }

            const titleEl = document.getElementById('gcm-title');
            const messageEl = document.getElementById('gcm-message');
            const detailEl = document.getElementById('gcm-detail');
            const iconEl = document.getElementById('gcm-icon');
            const iconBox = document.getElementById('gcm-icon-box');
            const btnConfirm = document.getElementById('gcm-btn-confirm');
            const btnCancel = document.getElementById('gcm-btn-cancel');
            const btnClose = document.getElementById('gcm-btn-close');

            const type = options.type || 'primary';
            const title = options.title || '操作确认';
            const message = options.message || '请确认是否继续此操作？';
            const detail = options.detail || '';
            const confirmText = options.confirmText || '确定';
            const cancelText = options.cancelText || '取消';

            let iconClass = 'fa-circle-question';
            let themeColor = 'var(--accent-color)';
            let boxBg = 'rgba(59, 130, 246, 0.12)';
            let btnClass = 'btn btn-primary btn-sm';

            if (type === 'danger') {
                iconClass = options.icon || 'fa-triangle-exclamation';
                themeColor = '#ef4444';
                boxBg = 'rgba(239, 68, 68, 0.12)';
                btnClass = 'btn btn-danger btn-sm';
            } else if (type === 'warning') {
                iconClass = options.icon || 'fa-triangle-exclamation';
                themeColor = '#f59e0b';
                boxBg = 'rgba(245, 158, 11, 0.12)';
                btnClass = 'btn btn-primary btn-sm';
            } else if (type === 'archive') {
                iconClass = options.icon || 'fa-box-archive';
                themeColor = 'var(--accent-color)';
                boxBg = 'rgba(59, 130, 246, 0.15)';
                btnClass = 'btn btn-primary btn-sm';
            } else {
                iconClass = options.icon || 'fa-circle-info';
            }

            if (titleEl) titleEl.textContent = title;
            if (messageEl) messageEl.innerHTML = escapeHTML(message).replace(/\n/g, '<br>');
            if (detailEl) {
                if (detail) {
                    detailEl.innerHTML = escapeHTML(detail).replace(/\n/g, '<br>');
                    detailEl.style.display = 'block';
                } else {
                    detailEl.style.display = 'none';
                }
            }
            if (iconEl) iconEl.className = `fa-solid ${iconClass}`;
            if (iconBox) {
                iconBox.style.color = themeColor;
                iconBox.style.background = boxBg;
            }
            if (btnConfirm) {
                btnConfirm.className = btnClass;
                btnConfirm.textContent = confirmText;
            }
            if (btnCancel) {
                btnCancel.textContent = cancelText;
            }

            let isResolved = false;
            function cleanup(result) {
                if (isResolved) return;
                isResolved = true;
                modal.classList.remove('active');
                window.removeEventListener('keydown', handleKey);
                modal.removeEventListener('click', handleBackdropClick);
                if (btnConfirm) btnConfirm.onclick = null;
                if (btnCancel) btnCancel.onclick = null;
                if (btnClose) btnClose.onclick = null;
                resolve(result);
            }

            function handleKey(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    cleanup(true);
                }
            }

            function handleBackdropClick(e) {
                if (e.target === modal) {
                    cleanup(false);
                }
            }

            if (btnConfirm) btnConfirm.onclick = () => cleanup(true);
            if (btnCancel) btnCancel.onclick = () => cleanup(false);
            if (btnClose) btnClose.onclick = () => cleanup(false);

            modal.addEventListener('click', handleBackdropClick);
            window.addEventListener('keydown', handleKey);
            modal.classList.add('active');
        });
    }

    /**
     * 8. 全局自定义输入弹窗 (Promise 异步化，彻底取代原生浏览器 prompt)
     * @param {Object} options
     *   - title: 弹窗标题 (默认: '重命名')
     *   - label: 输入提示文案 (默认: '请输入新的名称：')
     *   - value: 初始默认值
     *   - placeholder: 输入框占位符
     *   - hint: 补充提示文案
     *   - icon: 图标类名 (默认: 'fa-pen-to-square')
     *   - confirmText: 确认按钮文字 (默认: '确定')
     *   - cancelText: 取消按钮文字 (默认: '取消')
     *   - allowEmpty: 是否允许提交空值 (默认: false)
     *   - emptyMessage: 空值时的提示文案
     * @returns {Promise<string|null>} 用户输入的文本，取消则返回 null
     */
    let activePromptCleanup = null;
    function showPrompt(options = {}) {
        if (typeof activePromptCleanup === 'function') {
            activePromptCleanup(null);
        }
        return new Promise((resolve) => {
            const modal = document.getElementById('global-prompt-modal');
            const input = document.getElementById('gpm-input');
            if (!modal || !input) {
                const nativeVal = window.prompt(options.label || options.title || '请输入：', options.value || '');
                resolve(nativeVal);
                return;
            }

            const titleEl = document.getElementById('gpm-title');
            const labelEl = document.getElementById('gpm-label');
            const hintEl = document.getElementById('gpm-hint');
            const errorEl = document.getElementById('gpm-error');
            const iconEl = document.getElementById('gpm-icon');
            const btnConfirm = document.getElementById('gpm-btn-confirm');
            const btnCancel = document.getElementById('gpm-btn-cancel');
            const btnClose = document.getElementById('gpm-btn-close');

            if (titleEl) titleEl.textContent = options.title || '重命名';
            if (labelEl) labelEl.textContent = options.label || '请输入新的名称：';
            if (iconEl) iconEl.className = `fa-solid ${options.icon || 'fa-pen-to-square'}`;
            if (btnConfirm) btnConfirm.textContent = options.confirmText || '确定';
            if (btnCancel) btnCancel.textContent = options.cancelText || '取消';

            if (hintEl) {
                if (options.hint) {
                    hintEl.textContent = options.hint;
                    hintEl.style.display = 'block';
                } else {
                    hintEl.style.display = 'none';
                }
            }
            if (errorEl) {
                errorEl.style.display = 'none';
                errorEl.textContent = '';
            }

            const initVal = options.value !== undefined && options.value !== null
                ? options.value
                : (options.defaultValue !== undefined && options.defaultValue !== null ? options.defaultValue : '');
            input.value = String(initVal);
            input.placeholder = options.placeholder || '请输入...';

            let isResolved = false;
            let backdropDownTarget = null;

            function cleanup(result) {
                if (isResolved) return;
                isResolved = true;
                activePromptCleanup = null;
                modal.classList.remove('active');
                window.removeEventListener('keydown', handleKey);
                modal.removeEventListener('mousedown', handleMouseDown);
                modal.removeEventListener('click', handleBackdropClick);
                input.removeEventListener('input', clearError);
                if (btnConfirm) btnConfirm.onclick = null;
                if (btnCancel) btnCancel.onclick = null;
                if (btnClose) btnClose.onclick = null;
                resolve(result);
            }
            activePromptCleanup = cleanup;

            function clearError() {
                if (errorEl) errorEl.style.display = 'none';
            }

            function submit() {
                const val = input.value.trim();
                if (!options.allowEmpty && !val) {
                    if (errorEl) {
                        errorEl.textContent = options.emptyMessage || '请输入有效内容，不能为空';
                        errorEl.style.display = 'block';
                    }
                    input.focus();
                    return;
                }
                cleanup(options.allowEmpty ? input.value : val);
            }

            function handleKey(e) {
                if (e.isComposing) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup(null);
                } else if (e.key === 'Enter' && document.activeElement === input) {
                    e.preventDefault();
                    submit();
                }
            }

            function handleMouseDown(e) {
                backdropDownTarget = e.target;
            }

            function handleBackdropClick(e) {
                const selection = window.getSelection ? window.getSelection().toString() : '';
                if (selection && selection.length > 0) {
                    backdropDownTarget = null;
                    return;
                }
                if (e.target === modal && backdropDownTarget === modal) {
                    cleanup(null);
                }
                backdropDownTarget = null;
            }

            input.addEventListener('input', clearError);
            if (btnConfirm) btnConfirm.onclick = submit;
            if (btnCancel) btnCancel.onclick = () => cleanup(null);
            if (btnClose) btnClose.onclick = () => cleanup(null);

            modal.addEventListener('mousedown', handleMouseDown);
            modal.addEventListener('click', handleBackdropClick);
            window.addEventListener('keydown', handleKey);
            modal.classList.add('active');

            setTimeout(() => {
                input.focus();
                input.select();
            }, 30);
        });
    }

    // 组装挂载命名空间
    ProtoView.Utils = {
        escapeHTML,
        showToast,
        showConfirm,
        showPrompt,
        copyTextToClipboard,
        fallbackCopy,
        downloadFile
    };
    ProtoView.Events = Events;
    ProtoView.UI = {
        switchToView
    };
    ProtoView.Controllers = {};
    ProtoView.showConfirm = showConfirm;
    ProtoView.showPrompt = showPrompt;

    global.ProtoView = ProtoView;

    // 向后兼容全局函数 (让旧有 inline onclick 零成本直接可用)
    global.escapeHTML = escapeHTML;
    global.showToast = showToast;
    global.showConfirmDialog = showConfirm;
    global.showPromptDialog = showPrompt;
    global.copyTextToClipboard = copyTextToClipboard;
    global.downloadFile = downloadFile;
    global.switchToView = switchToView;

})(typeof window !== 'undefined' ? window : this);
