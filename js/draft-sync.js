/**
 * @file draft-sync.js
 * @brief ProtoView 自动草稿持久化、撤销重做引擎、5态保存状态管理与云端冲突仲裁
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};

    // 辅助安全转义
    const escapeHTML = ProtoView.Utils && ProtoView.Utils.escapeHTML ? ProtoView.Utils.escapeHTML : function(s){ return s || ''; };

    // ========================================================
    // 1. 本地自动保存草稿管理器 (DraftManager)
    // 独立存储于专用 localStorage 命名空间，不受云端同步清空缓存影响
    // ========================================================
    const DRAFT_PREFIX = 'protoview_draft_';
    const ACTIVE_DRAFT_KEY = 'protoview_active_draft_info';

    let currentUnsavedDirty = false;
    let autoSaveTimer = null;

    function getDraftStorageKey(proto) {
        if (!proto) return null;
        const type = proto.type || 'ARINC429';
        const idPart = (proto.id !== undefined && proto.id !== null) ? `id_${proto.id}` : `name_${encodeURIComponent(proto.name || 'unnamed')}`;
        return `${DRAFT_PREFIX}${type}_${idPart}`;
    }

    const DraftManager = {
        /**
         * 检查当前是否有未保存的修改 (用于路由拦截与 beforeunload 告警)
         */
        hasUnsavedChanges() {
            return currentUnsavedDirty;
        },

        setUnsaved(dirty = true) {
            currentUnsavedDirty = !!dirty;
            if (ProtoView.Events) {
                ProtoView.Events.emit('editor:dirty_changed', { isDirty: currentUnsavedDirty });
            }
        },

        /**
         * 防抖自动保存草稿到本地 (默认 600ms 防抖)
         */
        scheduleAutoSave(proto, onSavedCallback) {
            if (!proto) return;
            this.setUnsaved(true);

            if (autoSaveTimer) {
                clearTimeout(autoSaveTimer);
            }

            autoSaveTimer = setTimeout(() => {
                const res = this.saveDraftNow(proto);
                if (res && onSavedCallback) {
                    onSavedCallback(res);
                }
            }, 600);
        },

        /**
         * 立即执行本地草稿保存
         */
        saveDraftNow(proto) {
            if (!proto) return null;
            const key = getDraftStorageKey(proto);
            if (!key) return null;

            try {
                const draftObj = {
                    key: key,
                    protoId: proto.id,
                    protoName: proto.name,
                    protoType: proto.type || 'ARINC429',
                    savedAt: Date.now(),
                    data: JSON.parse(JSON.stringify(proto))
                };
                localStorage.setItem(key, JSON.stringify(draftObj));
                localStorage.setItem(ACTIVE_DRAFT_KEY, JSON.stringify({
                    key: key,
                    protoId: proto.id,
                    protoName: proto.name,
                    protoType: proto.type || 'ARINC429',
                    savedAt: draftObj.savedAt
                }));
                return draftObj;
            } catch (e) {
                console.warn('ProtoView: 本地草稿保存异常 (存储超限或受限):', e);
                return null;
            }
        },

        /**
         * 读取指定协议的草稿 (若存在且有效)
         */
        getDraft(proto) {
            if (!proto) return null;
            const key = getDraftStorageKey(proto);
            if (!key) return null;
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const draftObj = JSON.parse(raw);
                if (draftObj && draftObj.data) {
                    return draftObj;
                }
            } catch (e) {}
            return null;
        },

        /**
         * 检查草稿是否显著新于数据库/云端持久化版本 (超过 1 秒判定为有未提交的新草稿)
         */
        isDraftNewer(draftObj, baseProto) {
            if (!draftObj || !draftObj.savedAt) return false;
            let baseTime = 0;
            if (baseProto) {
                if (baseProto._cloudUpdated) baseTime = Number(baseProto._cloudUpdated);
                else if (baseProto.updatedAt) baseTime = new Date(baseProto.updatedAt).getTime();
            }
            // 只要草稿保存时间大于原始持久化时间 + 1000ms，即存在较新草稿
            return draftObj.savedAt > (baseTime + 1000);
        },

        /**
         * 清理指定协议的草稿 (在用户成功点击「保存」或「放弃草稿」后触发)
         */
        clearDraft(proto) {
            if (autoSaveTimer) {
                clearTimeout(autoSaveTimer);
                autoSaveTimer = null;
            }
            if (!proto) return;
            const key = getDraftStorageKey(proto);
            if (key) {
                try {
                    localStorage.removeItem(key);
                    const activeRaw = localStorage.getItem(ACTIVE_DRAFT_KEY);
                    if (activeRaw) {
                        const act = JSON.parse(activeRaw);
                        if (act && act.key === key) {
                            localStorage.removeItem(ACTIVE_DRAFT_KEY);
                        }
                    }
                } catch(e) {}
            }
            this.setUnsaved(false);
        },

        /**
         * 格式化友好时间差 (如: 刚才 / 2分钟前 / 15:30)
         */
        formatRelativeTime(ts) {
            if (!ts) return '刚才';
            const diff = Math.floor((Date.now() - ts) / 1000);
            if (diff < 10) return '刚刚';
            if (diff < 60) return `${diff} 秒前`;
            if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
            const d = new Date(ts);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        }
    };

    // ========================================================
    // 2. 撤销 / 重做状态引擎 (UndoRedoManager)
    // 支持按协议编辑器独立实例化，支持最大 50 步栈深与快捷键联动
    // ========================================================
    function createUndoRedoManager(options = {}) {
        const maxDepth = options.maxDepth || 50;
        let undoStack = [];
        let redoStack = [];
        let listener = null;

        function notify() {
            if (typeof listener === 'function') {
                listener({
                    canUndo: undoStack.length > 0,
                    canRedo: redoStack.length > 0,
                    undoCount: undoStack.length,
                    redoCount: redoStack.length
                });
            }
        }

        return {
            setChangeListener(fn) {
                listener = fn;
                notify();
            },

            /**
             * 压入历史快照 (在用户发生删除、移动、字段修改前调用)
             */
            push(state, actionName = '操作') {
                if (!state) return;
                try {
                    const snapshot = JSON.stringify(state);
                    // 避免重复压入完全相同的状态
                    if (undoStack.length > 0 && undoStack[undoStack.length - 1].snapshot === snapshot) {
                        return;
                    }
                    undoStack.push({
                        snapshot: snapshot,
                        action: actionName,
                        timestamp: Date.now()
                    });
                    if (undoStack.length > maxDepth) {
                        undoStack.shift();
                    }
                    // 新操作清空重做栈
                    redoStack = [];
                    notify();
                } catch (e) {
                    console.warn('UndoRedo: 快照序列化失败:', e);
                }
            },

            /**
             * 撤销 (Ctrl+Z)
             */
            undo(currentState) {
                if (undoStack.length === 0) return null;
                try {
                    // 把当前状态压入重做栈
                    if (currentState) {
                        redoStack.push({
                            snapshot: JSON.stringify(currentState),
                            action: '当前状态',
                            timestamp: Date.now()
                        });
                        if (redoStack.length > maxDepth) redoStack.shift();
                    }
                    const item = undoStack.pop();
                    notify();
                    return JSON.parse(item.snapshot);
                } catch (e) {
                    console.error('Undo 失败:', e);
                    notify();
                    return null;
                }
            },

            /**
             * 重做 (Ctrl+Y / Ctrl+Shift+Z)
             */
            redo(currentState) {
                if (redoStack.length === 0) return null;
                try {
                    if (currentState) {
                        undoStack.push({
                            snapshot: JSON.stringify(currentState),
                            action: '恢复前状态',
                            timestamp: Date.now()
                        });
                        if (undoStack.length > maxDepth) undoStack.shift();
                    }
                    const item = redoStack.pop();
                    notify();
                    return JSON.parse(item.snapshot);
                } catch (e) {
                    console.error('Redo 失败:', e);
                    notify();
                    return null;
                }
            },

            canUndo() {
                return undoStack.length > 0;
            },

            canRedo() {
                return redoStack.length > 0;
            },

            reset() {
                undoStack = [];
                redoStack = [];
                notify();
            }
        };
    }

    // ========================================================
    // 3. 明确区分的 5 种保存与同步状态指示管理器 (SaveStatus)
    // 1: unsaved       - ⚠️ 未保存 (草稿已暂存)
    // 2: saved_local   - 💾 已保存本地
    // 3: pending_sync  - ⏳ 待同步至云端...
    // 4: cloud_synced  - ✓ 云端已同步
    // 5: sync_failed   - ❌ 同步失败 [重试]
    // ========================================================
    const SaveStatus = {
        STATUS: {
            UNSAVED: 'unsaved',
            SAVED_LOCAL: 'saved_local',
            PENDING_SYNC: 'pending_sync',
            CLOUD_SYNCED: 'cloud_synced',
            SYNC_FAILED: 'sync_failed'
        },

        /**
         * 渲染或更新页面顶部的状态徽章
         * @param {HTMLElement} badgeEl 徽章容器元素
         * @param {string} status 状态键名
         * @param {Object} options 附加配置 { onRetry, lastSavedTime, errorMsg }
         */
        renderBadge(badgeEl, status, options = {}) {
            if (!badgeEl) return;
            badgeEl.className = 'save-status-badge';
            badgeEl.onclick = null;

            let iconHtml = '';
            let labelText = '';
            let titleText = '';
            let statusClass = '';

            switch (status) {
                case 'unsaved':
                    statusClass = 'status-unsaved';
                    iconHtml = '<i class="fa-solid fa-pen-ruler"></i>';
                    labelText = '未保存 (草稿已暂存)';
                    titleText = '当前有未保存的本地修改，已自动在本地暂存草稿，刷新可恢复';
                    break;

                case 'saved_local':
                    statusClass = 'status-local';
                    iconHtml = '<i class="fa-solid fa-hard-drive"></i>';
                    labelText = '已保存本地';
                    titleText = '已持久化至浏览器本地数据库 (当前处于离线模式或未推送云端)';
                    break;

                case 'pending_sync':
                    statusClass = 'status-pending';
                    iconHtml = '<i class="fa-solid fa-arrows-rotate fa-spin"></i>';
                    labelText = '待同步至云端...';
                    titleText = '本地保存成功，正在同步推送到 Cloudflare 云端原生存储...';
                    break;

                case 'cloud_synced':
                    statusClass = 'status-synced';
                    iconHtml = '<i class="fa-solid fa-cloud-check"></i>';
                    labelText = '云端已同步';
                    const timeHint = options.lastSavedTime ? ` (${DraftManager.formatRelativeTime(options.lastSavedTime)})` : '';
                    titleText = `云端原生存储与本地 IndexedDB 完全一致${timeHint}`;
                    break;

                case 'sync_failed':
                    statusClass = 'status-failed';
                    iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>';
                    labelText = '同步失败';
                    titleText = `云端同步未成功: ${options.errorMsg || '网络不可达'}。点击立即重试`;
                    break;

                default:
                    statusClass = 'status-synced';
                    iconHtml = '<i class="fa-solid fa-cloud-check"></i>';
                    labelText = '云端已同步';
                    titleText = '数据同步正常';
            }

            badgeEl.classList.add(statusClass);
            badgeEl.title = titleText;

            if (status === 'sync_failed' && typeof options.onRetry === 'function') {
                badgeEl.innerHTML = `
                    <span class="ssb-icon">${iconHtml}</span>
                    <span class="ssb-text">${labelText}</span>
                    <button type="button" class="ssb-retry-btn" title="点击立即重新同步"><i class="fa-solid fa-rotate-right"></i> 重试</button>
                `;
                const retryBtn = badgeEl.querySelector('.ssb-retry-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        options.onRetry();
                    });
                }
                badgeEl.onclick = () => options.onRetry();
            } else {
                badgeEl.innerHTML = `
                    <span class="ssb-icon">${iconHtml}</span>
                    <span class="ssb-text">${labelText}</span>
                `;
            }
        }
    };

    // ========================================================
    // 4. 云端版本冲突仲裁管理器 (ConflictManager)
    // 当两台设备同时修改同一份协议时，拦截覆盖并提供三大策略
    // ========================================================
    const ConflictManager = {
        /**
         * 弹出冲突仲裁弹窗并等待用户选择策略
         * @returns {Promise<'overwrite'|'pull'|'copy'|'cancel'>}
         */
        resolve(localProto, conflictInfo = {}) {
            return new Promise((resolve) => {
                const modal = document.getElementById('protocol-conflict-modal');
                if (!modal) {
                    // 降级使用 confirm
                    const force = confirm(`【⚠️ 云端冲突】\n协议「${localProto.name}」在云端已被其他设备修改！\n\n点击“确定”强制覆盖云端；点击“取消”放弃本次修改以保护他人成果。`);
                    resolve(force ? 'overwrite' : 'pull');
                    return;
                }

                const nameEl = document.getElementById('conflict-proto-name');
                const localTimeEl = document.getElementById('conflict-local-time');
                const cloudTimeEl = document.getElementById('conflict-cloud-time');

                if (nameEl) nameEl.textContent = localProto.name || '通信协议';
                
                const localTs = localProto._cloudUpdated || localProto.updatedAt;
                if (localTimeEl) {
                    localTimeEl.textContent = localTs ? new Date(localTs).toLocaleString('zh-CN') : '本次会话打开时';
                }

                const cloudTs = conflictInfo.cloudUpdated;
                if (cloudTimeEl) {
                    cloudTimeEl.textContent = cloudTs ? new Date(Number(cloudTs)).toLocaleString('zh-CN') : '刚刚 (由其他设备修改)';
                }

                modal.classList.add('active');

                // 选项 1: 覆盖云端
                const btnOverwrite = document.getElementById('btn-conflict-overwrite');
                const btnPull = document.getElementById('btn-conflict-pull');
                const btnSaveCopy = document.getElementById('btn-conflict-save-copy');
                const closeBtns = modal.querySelectorAll('.close-modal, .close-modal-btn');

                function cleanup() {
                    modal.classList.remove('active');
                    if (btnOverwrite) btnOverwrite.onclick = null;
                    if (btnPull) btnPull.onclick = null;
                    if (btnSaveCopy) btnSaveCopy.onclick = null;
                    closeBtns.forEach(b => b.onclick = null);
                }

                if (btnOverwrite) {
                    btnOverwrite.onclick = () => {
                        cleanup();
                        resolve('overwrite');
                    };
                }

                if (btnPull) {
                    btnPull.onclick = () => {
                        cleanup();
                        resolve('pull');
                    };
                }

                if (btnSaveCopy) {
                    btnSaveCopy.onclick = () => {
                        cleanup();
                        resolve('copy');
                    };
                }

                closeBtns.forEach(b => {
                    b.onclick = () => {
                        cleanup();
                        resolve('cancel');
                    };
                });
            });
        }
    };

    // ========================================================
    // 5. 全局未保存离开页面与切换拦截 (NavigationGuard)
    // ========================================================
    window.addEventListener('beforeunload', (e) => {
        if (DraftManager.hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '当前有未保存的通信协议修改，确定要刷新或离开页面吗？';
            return e.returnValue;
        }
    });

    async function confirmUnsavedNavigation(actionDesc, onConfirm) {
        if (!DraftManager.hasUnsavedChanges()) {
            if (onConfirm) onConfirm();
            return;
        }
        let ok = false;
        if (ProtoView.showConfirm) {
            ok = await ProtoView.showConfirm({
                title: '未保存修改提醒',
                icon: 'fa-triangle-exclamation',
                type: 'warning',
                message: `当前正在编辑的协议有尚未保存的内容，确定要${actionDesc}吗？`,
                detail: '系统已在本地自动暂存为草稿，未保存的内容可在稍后重新打开该协议时恢复。',
                confirmText: '确定离开/切换',
                cancelText: '留在当前编辑'
            });
        } else {
            ok = confirm(`当前正在编辑的协议有尚未保存的内容（已自动在本地暂存为草稿）。\n\n确定要${actionDesc}吗？未保存的内容可在稍后重新打开该协议时恢复。`);
        }
        if (ok && onConfirm) {
            onConfirm();
        }
    }

    // 挂载至 ProtoView 命名空间
    ProtoView.DraftManager = DraftManager;
    ProtoView.UndoRedo = { create: createUndoRedoManager };
    ProtoView.SaveStatus = SaveStatus;
    ProtoView.ConflictManager = ConflictManager;
    ProtoView.confirmUnsavedNavigation = confirmUnsavedNavigation;

    global.ProtoView = ProtoView;

})(typeof window !== 'undefined' ? window : this);
