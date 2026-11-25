/**
 * @file version-diff.js
 * @brief ProtoView 协议归档管理与两版协议对比引擎 (Archive & Protocol Diff)
 * @author DeepMind Pair Programming
 * 
 * 核心逻辑：
 * 1. 协议归档与升版规则：
 *    - 未归档协议：随时编辑保存，不必升版；点击「归档」直接归档为当前版本。
 *    - 已归档协议：若被修改后再次归档，必须升版（如 v1.0 -> v1.1）；日常编辑保存不必升版。
 * 2. 两版协议对比：
 *    - 极简清晰：在对比视图中选取任意两版协议，直接呈现两版之间的具体区别（自然语言变更摘要与字段对比表）。
 *    - 不设繁琐的基线、草稿、快照概念。
 */

(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};
    global.ProtoView = ProtoView;

    const escapeHTML = ProtoView.escapeHTML || global.escapeHTML || function(s) {
        if (!s) return '';
        return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[m]);
    };

    const showToast = ProtoView.showToast || global.showToast || function(msg, type) {
        if (ProtoView.Utils && ProtoView.Utils.showToast) ProtoView.Utils.showToast(msg, type);
        else console.log(`[Toast ${type || 'info'}]: ${msg}`);
    };

    // ========================================================
    // 1. ArchiveManager: 极简协议归档与版本管理
    // ========================================================
    const ArchiveManager = {
        // 确保协议具备归档与版本字段
        ensureProtocolVersion(proto) {
            if (!proto) return null;
            if (!proto.version) proto.version = 'v1.0';
            if (!Array.isArray(proto.archivedVersions)) {
                proto.archivedVersions = [];
                // 兼容旧数据的 versions 快照
                if (Array.isArray(proto.versions) && proto.versions.length > 0) {
                    proto.versions.forEach(v => {
                        if (v.snapshot) {
                            proto.archivedVersions.push({
                                version: v.version || 'v1.0',
                                archivedAt: v.createdAt || Date.now(),
                                comment: v.comment || '',
                                data: v.snapshot
                            });
                        }
                    });
                }
            }

            const hasArchiveRecord = (proto.archivedVersions.length > 0) || Boolean(proto.lastArchivedVersion);

            if (proto.isArchived === undefined) {
                // 若有归档快照或曾标记为 released，则视为已归档
                proto.isArchived = Boolean(proto.lifecycleStatus === 'released' || hasArchiveRecord);
            }

            if (hasArchiveRecord && !proto.lastArchivedVersion) {
                proto.lastArchivedVersion = (proto.archivedVersions[0] && proto.archivedVersions[0].version) || proto.version || 'v1.0';
            }

            if (proto.hasUnarchivedChanges === undefined) {
                // 如果曾归档过但当前 isArchived 为 false，说明已被修改且未归档
                proto.hasUnarchivedChanges = Boolean(hasArchiveRecord && !proto.isArchived);
            }

            return proto;
        },

        // 获取协议的版本展示与归档状态信息 (核心支撑方案一：动态变更标记)
        getVersionDisplayInfo(proto) {
            if (!proto) {
                return {
                    versionText: 'v1.0',
                    baseVersion: 'v1.0',
                    isArchived: false,
                    isModified: false,
                    hasArchiveRecord: false,
                    statusLabel: '未归档',
                    statusClass: 'not-archived',
                    versionPillClass: 'proto-version-pill',
                    tooltip: '未归档协议'
                };
            }
            this.ensureProtocolVersion(proto);

            const hasArchiveRecord = (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) || Boolean(proto.lastArchivedVersion);
            const lastVer = proto.lastArchivedVersion || (proto.archivedVersions && proto.archivedVersions[0] ? proto.archivedVersions[0].version : null);

            // Case 1：从未归档过 (版本号随意定义或为 v1.0，日常保存不强制升版)
            if (!hasArchiveRecord) {
                const curVer = proto.version || 'v1.0';
                return {
                    versionText: curVer,
                    baseVersion: curVer,
                    isArchived: false,
                    isModified: false,
                    hasArchiveRecord: false,
                    canArchive: true,
                    archiveBtnText: '归档',
                    archiveBtnIcon: 'fa-box-archive',
                    archiveBtnClass: 'dense-btn',
                    statusLabel: '未归档',
                    statusClass: 'not-archived',
                    versionPillClass: 'proto-version-pill',
                    tooltip: `当前协议尚未归档（版本 ${curVer}）：日常保存不强制升版，点击可直接归档`
                };
            }

            // Case 2 & 3：曾归档过，精准比对是否存在实质修改 (杜绝无改动时重复归档)
            const baseVer = lastVer || proto.version || 'v1.0';
            const hasRealChanges = this.hasChangesAgainstArchived(proto);

            if (hasRealChanges) {
                return {
                    versionText: `${baseVer} (修改中)`,
                    baseVersion: baseVer,
                    isArchived: false,
                    isModified: true,
                    hasArchiveRecord: true,
                    canArchive: true,
                    archiveBtnText: '升版归档',
                    archiveBtnIcon: 'fa-box-archive',
                    archiveBtnClass: 'dense-btn-primary',
                    statusLabel: '修改中',
                    statusClass: 'not-archived has-modifications',
                    versionPillClass: 'proto-version-pill is-modified',
                    tooltip: `基于已归档 ${baseVer} 的未归档工作副本：存在未归档修改，点击升版归档`
                };
            }

            // Case 3：正式生效版本 (已归档，且与最近归档快照完全一致，无任何实质变动)
            proto.isArchived = true;
            proto.hasUnarchivedChanges = false;
            const formalVer = proto.version || baseVer || 'v1.0';
            return {
                versionText: formalVer,
                baseVersion: formalVer,
                isArchived: true,
                isModified: false,
                hasArchiveRecord: true,
                canArchive: false,
                archiveBtnText: '已归档',
                archiveBtnIcon: 'fa-check',
                archiveBtnClass: 'dense-btn-disabled',
                statusLabel: '已归档',
                statusClass: 'is-archived',
                versionPillClass: 'proto-version-pill',
                tooltip: `当前协议已归档 [${formalVer}] 且未发生任何改动，无需重复归档`
            };
        },

        // 标记协议发生了修改 (归档过的协议若发生修改，状态转为“修改中”)
        markProtocolModified(proto) {
            if (!proto) return;
            this.ensureProtocolVersion(proto);
            const hasArchiveRecord = (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) || Boolean(proto.lastArchivedVersion);
            if (hasArchiveRecord) {
                if (!proto.lastArchivedVersion && proto.archivedVersions[0]) {
                    proto.lastArchivedVersion = proto.archivedVersions[0].version;
                }
                proto.isArchived = false;
                proto.hasUnarchivedChanges = true;
            }
        },

        // 判断协议是否已归档
        isArchived(proto) {
            return Boolean(proto && proto.isArchived && !proto.hasUnarchivedChanges);
        },

        // 检测协议相比于其最近一次归档快照是否存在实质性内容修改
        hasChangesAgainstArchived(proto) {
            if (!proto) return false;
            this.ensureProtocolVersion(proto);
            const hasArchiveRecord = (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) || Boolean(proto.lastArchivedVersion);
            // 若协议从未归档过，不存在任何历史归档基线可对比，返回 false (杜绝误判为存在“修改中副本”)
            if (!hasArchiveRecord) return false;

            // 如果当前处于正式归档且未被标记有未归档修改，直接返回 false (杜绝误报)
            if (proto.isArchived && !proto.hasUnarchivedChanges) {
                return false;
            }

            // 如果曾归档过，获取最近一次正式归档快照数据
            const archivedData = this.getLastArchivedData(proto);
            if (!archivedData) return false;

            // 提取纯净数据比对
            const curClean = this._extractCleanData(proto);
            const archClean = this._extractCleanData(archivedData);

            // 版本号统一占位，不将版本号自身差异视为协议通信内容改动
            const normCur = Object.assign({}, curClean, { version: '__NORM_VER__' });
            const normArch = Object.assign({}, archClean, { version: '__NORM_VER__' });

            try {
                if (typeof DiffEngine !== 'undefined' && DiffEngine.compareProtocols) {
                    const report = DiffEngine.compareProtocols(normArch, normCur);
                    const realDetails = (report.details || []).filter(d => d.prop !== '版本号');
                    return realDetails.length > 0;
                }
            } catch (e) {
                console.warn('比对协议变动异常:', e);
            }

            return false;
        },

        // 下一版本号推荐 (如 v1.0 -> v1.1)
        recommendNextVersion(ver) {
            const str = String(ver || 'v1.0').trim();
            const hasV = str.toLowerCase().startsWith('v');
            const clean = str.replace(/^[vV]/, '');
            const parts = clean.split('.').map(p => parseInt(p, 10) || 0);

            if (parts.length >= 2) {
                parts[parts.length - 1] += 1;
            } else if (parts.length === 1) {
                parts.push(1);
            } else {
                parts.push(1, 0);
            }
            return (hasV ? 'v' : 'v') + parts.join('.');
        },

        // 提取纯净协议数据用于归档保存与比对 (剔除不影响通信规范的所有时戳、状态与元数据)
        _extractCleanData(proto) {
            try {
                const copy = JSON.parse(JSON.stringify(proto));
                delete copy.archivedVersions;
                delete copy.versions;
                delete copy.hasUnarchivedChanges;
                delete copy.isArchived;
                delete copy.lastArchivedVersion;
                delete copy.lifecycleStatus;
                delete copy.updatedAt;
                delete copy.createdAt;
                delete copy._cloudUpdated;
                delete copy._cloudKey;
                delete copy._fromCloud;
                delete copy.author;
                delete copy.comment;
                return copy;
            } catch (e) {
                return Object.assign({}, proto);
            }
        },

        // 获取最近一次归档的快照数据
        getLastArchivedData(proto) {
            if (!proto) return null;
            this.ensureProtocolVersion(proto);
            if (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) {
                const rec = proto.archivedVersions[0];
                return rec ? (rec.data || rec) : null;
            }
            return null;
        },

        // 一键还原到最近一次归档版本 (放弃所有未归档修改)
        async revertToArchived(protoIdOrProto) {
            let proto = protoIdOrProto;
            if (typeof protoIdOrProto === 'string' || typeof protoIdOrProto === 'number') {
                if (window.dbHelper && typeof window.dbHelper.getProtocol === 'function') {
                    proto = await window.dbHelper.getProtocol(protoIdOrProto);
                }
            }
            if (!proto) {
                showToast('未找到协议数据', 'error');
                return false;
            }

            this.ensureProtocolVersion(proto);
            const archivedData = this.getLastArchivedData(proto);
            if (!archivedData) {
                showToast('当前协议暂无可还原的历史归档版本', 'warning');
                return false;
            }

            const baseVer = proto.lastArchivedVersion || (proto.archivedVersions[0] && proto.archivedVersions[0].version) || 'v1.0';
            const confirmed = await (ProtoView.showConfirm ? ProtoView.showConfirm({
                title: '放弃未归档修改并还原',
                icon: 'fa-rotate-left',
                type: 'danger',
                message: `确认放弃所有未归档修改，将通信协议「${proto.name}」还原到基准版本 [${baseVer}] 吗？`,
                detail: '此操作将撤销自上次归档以来的所有改动，恢复到最近一次正式归档的纯净基准。',
                confirmText: '确认还原',
                cancelText: '取消'
            }) : Promise.resolve(confirm(`确认放弃所有未归档修改，将通信协议「${proto.name}」还原到已归档版本 [${baseVer}] 吗？`)));
            if (!confirmed) return false;

            // 保留协议主键 ID 与归档历史
            const id = proto.id;
            const archivedVersions = proto.archivedVersions;
            const cloudKey = proto._cloudKey;

            const restored = JSON.parse(JSON.stringify(archivedData));
            Object.keys(proto).forEach(k => {
                if (k !== 'id' && k !== 'archivedVersions' && k !== '_cloudKey') {
                    delete proto[k];
                }
            });
            Object.assign(proto, restored);
            proto.id = id;
            proto.archivedVersions = archivedVersions;
            if (cloudKey) proto._cloudKey = cloudKey;
            proto.version = baseVer;
            proto.lastArchivedVersion = baseVer;
            proto.isArchived = true;
            proto.hasUnarchivedChanges = false;
            proto.lifecycleStatus = 'released';
            proto._cloudUpdated = Date.now();

            // 清理本地草稿
            if (ProtoView.DraftManager && typeof ProtoView.DraftManager.clearDraft === 'function') {
                ProtoView.DraftManager.clearDraft(proto);
            }

            await this.persistProtocol(proto);
            showToast(`已成功还原到已归档版本 [${baseVer}]！`, 'success');
            this.refreshActiveViews(proto);
            return true;
        },

        // 一键对比当前工作副本与已归档基准版本差异
        compareWithArchived(protoIdOrProto) {
            let proto = protoIdOrProto;
            if (proto && typeof proto === 'object') {
                openProtocolDiffModal(proto, null);
            } else if (protoIdOrProto) {
                openProtocolDiffModal(`cur_${protoIdOrProto}`, null);
            }
        },

        // 归档协议 (生成冻结快照，升版或建立首版)
        async archiveProtocol(proto, newVersion = null, commitComment = '') {
            if (!proto) return false;
            this.ensureProtocolVersion(proto);

            // 若指定了新版本号则更新版本号
            if (newVersion && newVersion.trim()) {
                proto.version = newVersion.trim();
            }

            const curUser = (ProtoView.Auth && ProtoView.Auth.getCurrentUser) ? ProtoView.Auth.getCurrentUser() : null;
            const authorName = curUser ? (curUser.name || curUser.username) : '工程师';
            const cleanData = this._extractCleanData(proto);

            // 自动比对生成变更摘要 (类似 git diff 摘要)
            let changesSummary = [];
            const prevRecord = (proto.archivedVersions && proto.archivedVersions.length > 0) ? proto.archivedVersions[0] : null;
            if (prevRecord && prevRecord.data && typeof DiffEngine !== 'undefined' && DiffEngine.compareProtocols) {
                try {
                    const rep = DiffEngine.compareProtocols(prevRecord.data, cleanData);
                    changesSummary = rep.summarySentences || [];
                } catch (e) {}
            }

            // 归档说明：若未指定则使用规范简洁的升版描述，杜绝文本叙述“什么变成了什么”
            const isFirstArchive = (!proto.archivedVersions || proto.archivedVersions.length === 0);
            const defaultComment = isFirstArchive ? `初始发布基准版本 [${proto.version}]` : `归档升级至版本 [${proto.version}]`;
            const finalComment = (commitComment && commitComment.trim()) ? commitComment.trim() : defaultComment;

            // 将当前状态深拷贝存入归档历史 (保持最新归档在最前)
            const archiveRecord = {
                version: proto.version,
                archivedAt: Date.now(),
                author: authorName,
                comment: finalComment,
                summary: [],
                data: cleanData
            };

            // 避免重复堆积同一版本的完全一致归档
            const existingIdx = proto.archivedVersions.findIndex(v => v.version === proto.version);
            if (existingIdx !== -1) {
                proto.archivedVersions[existingIdx] = archiveRecord;
            } else {
                proto.archivedVersions.unshift(archiveRecord);
            }

            // 归档状态纯净确立：已归档且无任何未归档改动
            proto.isArchived = true;
            proto.hasUnarchivedChanges = false;
            proto.lastArchivedVersion = proto.version;
            proto.lifecycleStatus = 'released';
            proto.updatedAt = new Date().toISOString();
            proto._cloudUpdated = Date.now();

            // 彻底清除未提交的本地草稿与防抖定时器，防止工作台重载脏草稿
            if (ProtoView.DraftManager && typeof ProtoView.DraftManager.clearDraft === 'function') {
                ProtoView.DraftManager.clearDraft(proto);
            }

            // 同步更新内存中活跃的工作台协议对象引用
            if (window.currentArincProtocol && String(window.currentArincProtocol.id) === String(proto.id)) {
                window.currentArincProtocol.version = proto.version;
                window.currentArincProtocol.lastArchivedVersion = proto.version;
                window.currentArincProtocol.isArchived = true;
                window.currentArincProtocol.hasUnarchivedChanges = false;
                window.currentArincProtocol.lifecycleStatus = 'released';
                window.currentArincProtocol.archivedVersions = proto.archivedVersions;
                window.currentArincProtocol.updatedAt = proto.updatedAt;
                window.currentArincProtocol._cloudUpdated = proto._cloudUpdated;
            }
            if (window.currentSerialProtocol && String(window.currentSerialProtocol.id) === String(proto.id)) {
                window.currentSerialProtocol.version = proto.version;
                window.currentSerialProtocol.lastArchivedVersion = proto.version;
                window.currentSerialProtocol.isArchived = true;
                window.currentSerialProtocol.hasUnarchivedChanges = false;
                window.currentSerialProtocol.lifecycleStatus = 'released';
                window.currentSerialProtocol.archivedVersions = proto.archivedVersions;
                window.currentSerialProtocol.updatedAt = proto.updatedAt;
                window.currentSerialProtocol._cloudUpdated = proto._cloudUpdated;
            }
            if (ProtoView.ActiveSession && typeof ProtoView.ActiveSession.set === 'function') {
                ProtoView.ActiveSession.set(proto);
            }
            if (ProtoView.VersionManager) {
                if (ProtoView.VersionManager.currentProto && String(ProtoView.VersionManager.currentProto.id) === String(proto.id)) {
                    ProtoView.VersionManager.currentProto = proto;
                }
            }

            // 隐藏工作台顶部草稿提示条
            const arincDraftBanner = document.getElementById('arinc-draft-banner');
            if (arincDraftBanner) arincDraftBanner.style.display = 'none';
            const serialDraftBanner = document.getElementById('serial-draft-banner');
            if (serialDraftBanner) serialDraftBanner.style.display = 'none';

            // 保存到数据库与云端
            await this.persistProtocol(proto);
            return true;
        },

        // 点击「归档」按钮的处理逻辑 (核心业务规则)
        async handleArchiveClick(protoIdOrProto) {
            let proto = protoIdOrProto;
            if (typeof protoIdOrProto === 'string' || typeof protoIdOrProto === 'number') {
                if (window.dbHelper && typeof window.dbHelper.getProtocol === 'function') {
                    proto = await window.dbHelper.getProtocol(protoIdOrProto);
                }
            }
            if (!proto) {
                showToast('未找到协议数据', 'error');
                return;
            }

            this.ensureProtocolVersion(proto);
            const hasArchiveRecord = (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) || Boolean(proto.lastArchivedVersion);

            // 规则 1：如果协议从未归档，直接归档为当前版本，不必升版！
            if (!hasArchiveRecord) {
                const curVer = proto.version || 'v1.0';
                const confirmed = await (ProtoView.showConfirm ? ProtoView.showConfirm({
                    title: '首次归档正式基准版本',
                    icon: 'fa-box-archive',
                    type: 'archive',
                    message: `确认将通信协议「${proto.name}」首次归档为正式版本 [${curVer}] 吗？`,
                    detail: '归档后，此版本将作为正式规范基准冻结保存。日常保存不会影响此基线；后续若作实质修改将自动标记为“修改中”，再次归档时系统将引导您规范升版。',
                    confirmText: `确认归档为 [${curVer}]`,
                    cancelText: '暂不归档'
                }) : Promise.resolve(confirm(`确认将通信协议「${proto.name}」首次归档为正式版本 [${curVer}] 吗？`)));

                if (confirmed) {
                    await this.archiveProtocol(proto, curVer);
                    showToast(`协议「${proto.name}」已成功首次归档为正式版本 [${proto.version}]！`, 'success');
                    this.refreshActiveViews(proto);
                }
                return;
            }

            // 规则 2：如果协议此前已归档，且未发生任何实质改动，严禁重复归档！
            if (!this.hasChangesAgainstArchived(proto)) {
                const baseVer = proto.lastArchivedVersion || (proto.archivedVersions && proto.archivedVersions[0] ? proto.archivedVersions[0].version : proto.version) || 'v1.0';
                showToast(`通信协议「${proto.name || '当前协议'}」当前已归档为正式版本 [${baseVer}]，且未发生任何改动，无需重复归档！`, 'warning');
                return false;
            }

            // 规则 3：如果协议此前已归档过且存在改动，再次归档必须升版！
            openProtocolArchiveModal(proto);
        },

        // 持久化协议并触发事件更新
        async persistProtocol(proto) {
            try {
                if (window.dbHelper && typeof window.dbHelper.saveProtocol === 'function') {
                    await window.dbHelper.saveProtocol(proto);
                }
                if (ProtoView.DraftManager && typeof ProtoView.DraftManager.saveProtocolDirectly === 'function') {
                    await ProtoView.DraftManager.saveProtocolDirectly(proto);
                }
                if (ProtoView.Events && typeof ProtoView.Events.emit === 'function') {
                    ProtoView.Events.emit('protocol:saved', proto);
                }
            } catch (e) {
                console.error("持久化协议失败:", e);
            }
        },

        // 刷新各个打开的工作台与列表
        refreshActiveViews(proto) {
            if (window.loadProtocols) window.loadProtocols();
            if (ProtoView.VersionManager) {
                ProtoView.VersionManager.currentProto = proto;
                const versionView = document.getElementById('protocol-version-view');
                if (versionView && versionView.classList.contains('active')) {
                    ProtoView.VersionManager.loadProtocol(proto);
                }
            }

            const arincView = document.getElementById('arinc429-view');
            if (arincView && arincView.classList.contains('active')) {
                if (window.loadArincProtocolIntoEditor) window.loadArincProtocolIntoEditor(proto.id || proto);
            }

            const serialView = document.getElementById('serial-view');
            if (serialView && serialView.classList.contains('active')) {
                if (window.loadSerialProtocolIntoEditor) window.loadSerialProtocolIntoEditor(proto.id || proto);
            }

            const viewerView = document.getElementById('protocol-viewer-view');
            if (viewerView && viewerView.classList.contains('active')) {
                if (window.openProtocolViewer) window.openProtocolViewer(proto.id || proto);
            }
        }
    };

    // ========================================================
    // ========================================================
    // 2. DiffEngine: 航空通信协议四层嵌套 Diff 差异对比引擎
    // 四层模型: 协议汇总 (summary) → 帧/Label级 (frames) → 信号级 (signals) → 属性级 (attributes)
    // ========================================================
    const DiffEngine = {
        /**
         * 对比两个协议对象并输出四层嵌套差异报告
         * @param {Object} protoA 基准协议 (Before)
         * @param {Object} protoB 对比协议 (After)
         */
        compareProtocols(protoA, protoB) {
            const pA = protoA || {};
            const pB = protoB || {};
            const isArinc = (pA.type === 'ARINC429') || (pB.type === 'ARINC429');

            const report = {
                // Tier 1: 协议汇总 (summary)
                summary: {
                    totalModifiedLabels: 0,
                    totalAddedLabels: 0,
                    totalDeletedLabels: 0,
                    totalUnchangedLabels: 0,
                    totalSignalsInvolved: 0,
                    totalSignalsAdded: 0,
                    totalSignalsDeleted: 0,
                    totalSignalsModified: 0,
                    totalSignalsSame: 0,
                    totalAttributeChanges: 0,
                    breakingChangesCount: 0,
                    nonBreakingChangesCount: 0,
                    summarySentences: []
                },
                packets: [],
                frames: [],
                details: [],
                summarySentences: []
            };

            // 1. 协议级基础元信息对比 (名称、速率、波特率、校验等)
            this._compareBasicMeta(pA, pB, report);

            // 2. 数据包与帧/Label/字节层级多级对比
            this._comparePacketsNested(pA, pB, isArinc, report);

            // 同步向后兼容的 summarySentences
            report.summarySentences = report.summary.summarySentences;

            return report;
        },

        // 基础元信息对比
        _compareBasicMeta(pA, pB, report) {
            if (pA.name && pB.name && pA.name !== pB.name) {
                const s = `协议名称由 “${pA.name}” 改为 “${pB.name}”`;
                report.summary.summarySentences.push(s);
                report.summary.totalAttributeChanges++;
                report.summary.nonBreakingChangesCount++;
                report.details.push({ target: '基本信息', prop: '协议名称', valA: pA.name, valB: pB.name, type: 'modified', impact: 'non_breaking' });
            }
            if (pA.version && pB.version && pA.version !== pB.version) {
                const s = `协议版本号由 ${pA.version} 变更为 ${pB.version}`;
                report.summary.summarySentences.push(s);
                report.summary.totalAttributeChanges++;
                report.summary.nonBreakingChangesCount++;
                report.details.push({ target: '基本信息', prop: '版本号', valA: pA.version, valB: pB.version, type: 'modified', impact: 'non_breaking' });
            }
            if (pA.speed && pB.speed && pA.speed !== pB.speed) {
                const s = `总线通信速率由 ${pA.speed} 改为 ${pB.speed}`;
                report.summary.summarySentences.push(s);
                report.summary.totalAttributeChanges++;
                report.summary.breakingChangesCount++;
                report.details.push({ target: '电气规范', prop: '通信速率', valA: pA.speed, valB: pB.speed, type: 'modified', impact: 'breaking' });
            }
            if (pA.baudRate && pB.baudRate && pA.baudRate !== pB.baudRate) {
                const s = `串口波特率由 ${pA.baudRate} bps 改为 ${pB.baudRate} bps`;
                report.summary.summarySentences.push(s);
                report.summary.totalAttributeChanges++;
                report.summary.breakingChangesCount++;
                report.details.push({ target: '电气规范', prop: '通信波特率', valA: `${pA.baudRate} bps`, valB: `${pB.baudRate} bps`, type: 'modified', impact: 'breaking' });
            }
            if (pA.parity && pB.parity && pA.parity !== pB.parity) {
                const s = `奇偶校验由 ${pA.parity} 改为 ${pB.parity}`;
                report.summary.summarySentences.push(s);
                report.summary.totalAttributeChanges++;
                report.summary.breakingChangesCount++;
                report.details.push({ target: '校验规范', prop: '奇偶校验', valA: pA.parity, valB: pB.parity, type: 'modified', impact: 'breaking' });
            }
        },

        // 统一提取并规范化数据包 (确保 packets 与 words/fields 100% 同步，杜绝解构不一致导致误报全量删除/破坏性变更)
        _getPackets(p) {
            if (!p) return [];
            const isArinc = (p.type === 'ARINC429');
            let pkts = [];
            if (Array.isArray(p.packets) && p.packets.length > 0) {
                pkts = p.packets.map((pkt) => {
                    const clonePkt = Object.assign({}, pkt);
                    if (isArinc) {
                        // 若包内 words 为空但协议根上存有 words，自动同步
                        if (!Array.isArray(clonePkt.words) || clonePkt.words.length === 0) {
                            if (p.packets.length === 1 && Array.isArray(p.words) && p.words.length > 0) {
                                clonePkt.words = p.words;
                            } else {
                                clonePkt.words = clonePkt.words || [];
                            }
                        }
                    } else {
                        // 串口/CAN 协议同理同步 fields
                        if (!Array.isArray(clonePkt.fields) || clonePkt.fields.length === 0) {
                            if (p.packets.length === 1 && Array.isArray(p.fields) && p.fields.length > 0) {
                                clonePkt.fields = p.fields;
                            } else {
                                clonePkt.fields = clonePkt.fields || [];
                            }
                        }
                    }
                    return clonePkt;
                });
            } else {
                pkts = [{
                    name: p.name || '默认数据包',
                    direction: p.direction || 'Tx',
                    period: p.period || 20,
                    words: p.words || [],
                    fields: p.fields || [],
                    frames: p.frames || []
                }];
            }
            return pkts;
        },

        // 计算数据包字节长度
        _calculateByteLength(pkt, protoType) {
            if (!pkt) return 0;
            if (pkt.fields && Array.isArray(pkt.fields) && pkt.fields.length > 0) {
                let maxByte = 0;
                pkt.fields.forEach((f, idx) => {
                    const offset = f.offset !== undefined ? Number(f.offset) : idx;
                    const len = Number(f.byteLength || f.length || 1);
                    if ((offset + len) > maxByte) maxByte = offset + len;
                });
                return maxByte || pkt.fields.length;
            }
            if (pkt.words && Array.isArray(pkt.words) && pkt.words.length > 0) {
                return pkt.words.length * 4;
            }
            if (pkt.frames && Array.isArray(pkt.frames) && pkt.frames.length > 0) {
                return pkt.frames.length * 8;
            }
            return 0;
        },

        // 嵌套数据包与帧/Label对比
        _comparePacketsNested(pA, pB, isArinc, report) {
            const pktsA = this._getPackets(pA);
            const pktsB = this._getPackets(pB);
            const maxLen = Math.max(pktsA.length, pktsB.length);

            for (let i = 0; i < maxLen; i++) {
                const pktA = pktsA[i] || null;
                const pktB = pktsB[i] || null;
                const pktName = (pktB && pktB.name) || (pktA && pktA.name) || `数据包 ${i + 1}`;

                const packetDiff = {
                    name: pktName,
                    status: (!pktA && pktB) ? 'added' : ((pktA && !pktB) ? 'deleted' : 'same'),
                    impact: (!pktA && pktB) ? 'non_breaking' : ((pktA && !pktB) ? 'breaking' : 'none'),
                    changes: [],
                    frames: []
                };

                if (!pktA && pktB) {
                    const s = `新增数据包“${pktName}”`;
                    report.summary.summarySentences.push(s);
                    report.summary.nonBreakingChangesCount++;
                    report.summary.totalAttributeChanges++;
                    report.details.push({ target: pktName, prop: '数据包定义', valA: '不存在', valB: '新增数据包', type: 'added', impact: 'non_breaking' });
                } else if (pktA && !pktB) {
                    const s = `删除数据包“${pktName}”`;
                    report.summary.summarySentences.push(s);
                    report.summary.breakingChangesCount++;
                    report.summary.totalAttributeChanges++;
                    report.details.push({ target: pktName, prop: '数据包定义', valA: '存在数据包', valB: '已删除', type: 'removed', impact: 'breaking' });
                } else {
                    // 方向对比
                    const dirA = (pktA.direction === 'Rx') ? 'Rx' : 'Tx';
                    const dirB = (pktB.direction === 'Rx') ? 'Rx' : 'Tx';
                    if (dirA !== dirB) {
                        const s = `“${pktName}”通信方向由【${dirA === 'Rx' ? '接收' : '发送'}】改为【${dirB === 'Rx' ? '接收' : '发送'}】`;
                        report.summary.summarySentences.push(s);
                        report.summary.breakingChangesCount++;
                        report.summary.totalAttributeChanges++;
                        packetDiff.changes.push({ prop: '通信方向', valA: dirA, valB: dirB, impact: 'breaking' });
                        report.details.push({ target: pktName, prop: '通信方向', valA: dirA, valB: dirB, type: 'modified', impact: 'breaking' });
                    }

                    // 周期对比
                    const perA = Number(pktA.period !== undefined && pktA.period !== null && pktA.period !== '' ? pktA.period : 20) || 20;
                    const perB = Number(pktB.period !== undefined && pktB.period !== null && pktB.period !== '' ? pktB.period : 20) || 20;
                    if (perA !== perB) {
                        const s = `“${pktName}”通信周期由 ${perA}ms 改为 ${perB}ms`;
                        report.summary.summarySentences.push(s);
                        report.summary.nonBreakingChangesCount++;
                        report.summary.totalAttributeChanges++;
                        packetDiff.changes.push({ prop: '通信周期', valA: `${perA}ms`, valB: `${perB}ms`, impact: 'non_breaking' });
                        report.details.push({ target: pktName, prop: '通讯周期', valA: `${perA}ms`, valB: `${perB}ms`, type: 'modified', impact: 'non_breaking' });
                    }
                }

                // Tier 2: 提取并对比帧/Label级 (frames)
                const itemsA = pktA ? (isArinc ? (pktA.words || []) : (pktA.fields || [])) : [];
                const itemsB = pktB ? (isArinc ? (pktB.words || []) : (pktB.fields || [])) : [];

                const frameDiffs = this._compareFrames(itemsA, itemsB, isArinc, pktName, report);
                packetDiff.frames = frameDiffs;
                report.packets.push(packetDiff);
                report.frames.push(...frameDiffs);
            }
        },

        // Tier 2: 帧/Label级对比
        _compareFrames(itemsA, itemsB, isArinc, pktName, report) {
            const frameDiffs = [];
            const getFrameKey = (it, idx) => {
                if (!it) return `idx_${idx}`;
                if (isArinc) {
                    const lbl = (it.label !== undefined && it.label !== null ? String(it.label).trim() : String(idx)).padStart(3, '0');
                    let sdiStr = '';
                    if (it.sdi !== undefined && it.sdi !== null && String(it.sdi).trim() !== '') {
                        const parsedSdi = parseInt(it.sdi, 10);
                        sdiStr = isNaN(parsedSdi) ? String(it.sdi).trim() : String(parsedSdi);
                    }
                    return sdiStr !== '' ? `${lbl}_sdi${sdiStr}` : lbl;
                }
                const offsetVal = (it.offset !== undefined && it.offset !== null && it.offset !== '') ? it.offset : (it.startByte !== undefined ? it.startByte : null);
                return offsetVal !== null ? `byte_${offsetVal}` : (it.key || `field_${idx}`);
            };

            const mapA = new Map();
            itemsA.forEach((it, idx) => mapA.set(getFrameKey(it, idx), it));

            const mapB = new Map();
            itemsB.forEach((it, idx) => mapB.set(getFrameKey(it, idx), it));

            const allKeys = [];
            itemsA.forEach((it, idx) => {
                const k = getFrameKey(it, idx);
                if (!allKeys.includes(k)) allKeys.push(k);
            });
            itemsB.forEach((it, idx) => {
                const k = getFrameKey(it, idx);
                if (!allKeys.includes(k)) allKeys.push(k);
            });

            allKeys.forEach(k => {
                const fA = mapA.get(k) || null;
                const fB = mapB.get(k) || null;

                const frameLabel = isArinc
                    ? `${((fB || fA).label || '000').toString().padStart(3, '0')}₈`
                    : `Byte ${(fB || fA).offset !== undefined ? (fB || fA).offset : ((fB || fA).key || '0')}`;
                const frameName = (fB && fB.name) || (fA && fA.name) || '未命名';

                const fDiff = {
                    key: k,
                    label: frameLabel,
                    name: frameName,
                    status: 'same',
                    impact: 'none',
                    isArinc,
                    baseWord: fA,
                    targetWord: fB,
                    wordChanges: [],
                    signals: [],
                    metrics: {
                        signalsInvolved: 0,
                        signalsAdded: 0,
                        signalsDeleted: 0,
                        signalsModified: 0,
                        signalsSame: 0,
                        attributeChanges: 0,
                        breaking: 0,
                        nonBreaking: 0
                    },
                    bitfield: null
                };

                if (!fA && fB) {
                    // 新增 Label/Byte (non_breaking)
                    fDiff.status = 'added';
                    fDiff.impact = 'non_breaking';
                    report.summary.totalAddedLabels++;

                    const s = `新增${isArinc ? '标号字' : '字节'} ${frameLabel} “${frameName}”`;
                    report.summary.summarySentences.push(s);
                    report.summary.totalAttributeChanges++;
                    report.summary.nonBreakingChangesCount++;
                    report.details.push({ target: `${frameLabel} (${frameName})`, prop: '标号字定义', valA: '未定义', valB: '新增标号字', type: 'added', impact: 'non_breaking' });

                    // 新增帧下全部信号均为 added
                    const sigsB = isArinc ? (fB.signals || []) : (fB.subFields || fB.signals || []);
                    sigsB.forEach(sB => {
                        const sDiff = this._createSingleSignalDiff(null, sB, 'added', isArinc);
                        fDiff.signals.push(sDiff);
                        fDiff.metrics.signalsAdded++;
                        fDiff.metrics.signalsInvolved++;
                        fDiff.metrics.attributeChanges += sDiff.changedAttrCount;
                        fDiff.metrics.nonBreaking += sDiff.nonBreakingCount;

                        report.summary.totalSignalsAdded++;
                        report.summary.totalSignalsInvolved++;
                        report.summary.totalAttributeChanges += sDiff.changedAttrCount;
                        report.summary.nonBreakingChangesCount += sDiff.nonBreakingCount;
                    });
                } else if (fA && !fB) {
                    // 删除 Label/Byte (breaking)
                    fDiff.status = 'deleted';
                    fDiff.impact = 'breaking';
                    report.summary.totalDeletedLabels++;

                    const s = `删除${isArinc ? '标号字' : '字节'} ${frameLabel} “${frameName}”`;
                    report.summary.summarySentences.push(s);
                    report.summary.totalAttributeChanges++;
                    report.summary.breakingChangesCount++;
                    report.details.push({ target: `${frameLabel} (${frameName})`, prop: '标号字定义', valA: '原存在', valB: '已删除', type: 'removed', impact: 'breaking' });

                    // 删除帧下全部信号均为 deleted
                    const sigsA = isArinc ? (fA.signals || []) : (fA.subFields || fA.signals || []);
                    sigsA.forEach(sA => {
                        const sDiff = this._createSingleSignalDiff(sA, null, 'deleted', isArinc);
                        fDiff.signals.push(sDiff);
                        fDiff.metrics.signalsDeleted++;
                        fDiff.metrics.signalsInvolved++;
                        fDiff.metrics.attributeChanges += sDiff.changedAttrCount;
                        fDiff.metrics.breaking += sDiff.breakingCount;

                        report.summary.totalSignalsDeleted++;
                        report.summary.totalSignalsInvolved++;
                        report.summary.totalAttributeChanges += sDiff.changedAttrCount;
                        report.summary.breakingChangesCount += sDiff.breakingCount;
                    });
                } else {
                    // 两侧均存在：对比 Label 自身属性与内部信号
                    const nameA = (fA.name || '').trim();
                    const nameB = (fB.name || '').trim();
                    if (nameA && nameB && nameA !== nameB) {
                        const s = `${isArinc ? '标号字' : '字节'} ${frameLabel} 名称由【${nameA}】改为【${nameB}】`;
                        report.summary.summarySentences.push(s);
                        report.summary.totalAttributeChanges++;
                        report.summary.nonBreakingChangesCount++;
                        fDiff.wordChanges.push({ prop: '名称', valA: nameA, valB: nameB, impact: 'non_breaking' });
                        fDiff.metrics.attributeChanges++;
                        fDiff.metrics.nonBreaking++;
                        report.details.push({ target: `${frameLabel}`, prop: '字名称', valA: nameA, valB: nameB, type: 'modified', impact: 'non_breaking', context: pktName });
                    }

                    // 对比通信方向
                    if (fA.direction && fB.direction && fA.direction !== fB.direction) {
                        const s = `${frameLabel} 方向由 ${fA.direction} 改为 ${fB.direction}`;
                        report.summary.summarySentences.push(s);
                        report.summary.totalAttributeChanges++;
                        report.summary.breakingChangesCount++;
                        fDiff.wordChanges.push({ prop: '方向', valA: fA.direction, valB: fB.direction, impact: 'breaking' });
                        fDiff.metrics.attributeChanges++;
                        fDiff.metrics.breaking++;
                        report.details.push({ target: `${frameLabel}`, prop: '传输方向', valA: fA.direction, valB: fB.direction, type: 'modified', impact: 'breaking' });
                    }

                    // 对比周期
                    if (fA.period !== undefined && fB.period !== undefined && fA.period !== fB.period) {
                        const s = `${frameLabel} 周期由 ${fA.period}ms 改为 ${fB.period}ms`;
                        report.summary.summarySentences.push(s);
                        report.summary.totalAttributeChanges++;
                        report.summary.nonBreakingChangesCount++;
                        fDiff.wordChanges.push({ prop: '周期', valA: `${fA.period}ms`, valB: `${fB.period}ms`, impact: 'non_breaking' });
                        fDiff.metrics.attributeChanges++;
                        fDiff.metrics.nonBreaking++;
                        report.details.push({ target: `${frameLabel}`, prop: '传输周期', valA: `${fA.period}ms`, valB: `${fB.period}ms`, type: 'modified', impact: 'non_breaking' });
                    }

                    // Tier 3: 信号级智能多优先级配对对比
                    const sigsA = isArinc ? (fA.signals || []) : (fA.subFields || fA.signals || []);
                    const sigsB = isArinc ? (fB.signals || []) : (fB.subFields || fB.signals || []);

                    const signalDiffs = this._compareSignalsNested(sigsA, sigsB, frameLabel, isArinc, report);
                    fDiff.signals = signalDiffs;

                    // 汇总本 Frame 下信号层指标
                    signalDiffs.forEach(sd => {
                        if (sd.status === 'added') {
                            fDiff.metrics.signalsAdded++;
                            fDiff.metrics.signalsInvolved++;
                        } else if (sd.status === 'deleted') {
                            fDiff.metrics.signalsDeleted++;
                            fDiff.metrics.signalsInvolved++;
                        } else if (sd.status === 'modified') {
                            fDiff.metrics.signalsModified++;
                            fDiff.metrics.signalsInvolved++;
                        } else {
                            fDiff.metrics.signalsSame++;
                        }
                        fDiff.metrics.attributeChanges += sd.changedAttrCount;
                        fDiff.metrics.breaking += sd.breakingCount;
                        fDiff.metrics.nonBreaking += sd.nonBreakingCount;
                    });

                    // 判定 Frame 最终变更状态与影响级别
                    const hasSignalChanges = fDiff.metrics.signalsInvolved > 0 || fDiff.metrics.attributeChanges > 0;
                    const hasWordChanges = fDiff.wordChanges.length > 0;

                    if (hasSignalChanges || hasWordChanges) {
                        fDiff.status = 'modified';
                        fDiff.impact = (fDiff.metrics.breaking > 0) ? 'breaking' : 'non_breaking';
                        report.summary.totalModifiedLabels++;
                    } else {
                        fDiff.status = 'same';
                        fDiff.impact = 'none';
                        report.summary.totalUnchangedLabels++;
                    }
                }

                // ARINC 429 专属：生成 32-bit 位域 Before / After 可视化映射条
                if (isArinc) {
                    fDiff.bitfield = this.generate32BitfieldDiff(fA, fB, fDiff.signals);
                }

                frameDiffs.push(fDiff);
            });

            return frameDiffs;
        },

        // Tier 3: 信号级智能多优先级配对与属性深度比对
        // 核心原则：先按 信号ID 或 信号名称 匹配；如果名称一样只是位段位置改变 (如 Bit 23 -> Bit 10)，只提示“位段偏移”，绝不误报“改名”！
        // 匹配优先级：
        // 优先级 1: 唯一 ID / key 匹配 (若两侧均存在非空有效 ID)
        // 优先级 2: 信号名称 (name) 优先匹配！(同名信号即使起始位从 Bit 23 移动到 Bit 10，也精准判定为同一个信号的位置偏移，不误报改名)
        // 优先级 3: 纯改名推断 (仅针对 ID 与 名称 均未匹配的孤立信号，若在同一位段 startBit + bitLength 相同，才推断为重命名)
        _compareSignalsNested(sigsA, sigsB, frameLabel, isArinc, report) {
            const remainingA = [...(sigsA || [])];
            const remainingB = [...(sigsB || [])];
            const paired = []; // { sA, sB, matchRule }

            const getBitInfo = (s) => {
                if (!s) return { start: 0, len: 1 };
                const start = parseInt(s.startBit !== undefined && s.startBit !== null ? s.startBit : (s.offset !== undefined ? s.offset : 0), 10) || 0;
                const len = parseInt(s.bitLength || s.bitCount || s.length || s.byteLength || 1, 10) || 1;
                return { start, len };
            };

            // -------------------------------------------------------------
            // 优先级 1：信号名称 (name) 优先精确匹配！
            // 核心原则：信号名称一致即为同一个物理量/状态信号；即使其起始位从 Bit 23 移动到 Bit 10，也是位段偏移，绝非删除/新增或改名！
            // -------------------------------------------------------------
            for (let i = remainingA.length - 1; i >= 0; i--) {
                const sA = remainingA[i];
                const nameA = (sA.name || '').trim();
                if (!nameA) continue;

                const bitA = getBitInfo(sA);

                // 在 remainingB 中寻找同名候选 (不区分大小写与首尾空格)
                const candidateIndices = [];
                remainingB.forEach((sB, bIdx) => {
                    const nameB = (sB.name || '').trim();
                    if (nameB && nameB.toLowerCase() === nameA.toLowerCase()) {
                        candidateIndices.push(bIdx);
                    }
                });

                if (candidateIndices.length > 0) {
                    // 若存在多个同名信号，优先配对起始位与位宽相同的
                    let bestBIdx = candidateIndices[0];
                    const exactPosIdx = candidateIndices.find(idx => {
                        const bitB = getBitInfo(remainingB[idx]);
                        return bitB.start === bitA.start && bitB.len === bitA.len;
                    });
                    if (exactPosIdx !== undefined) {
                        bestBIdx = exactPosIdx;
                    } else {
                        // 其次优先配对起始位相同的
                        const sameStartIdx = candidateIndices.find(idx => {
                            const bitB = getBitInfo(remainingB[idx]);
                            return bitB.start === bitA.start;
                        });
                        if (sameStartIdx !== undefined) {
                            bestBIdx = sameStartIdx;
                        }
                    }

                    paired.push({ sA, sB: remainingB[bestBIdx], matchRule: 'name' });
                    remainingA.splice(i, 1);
                    remainingB.splice(bestBIdx, 1);
                }
            }

            // -------------------------------------------------------------
            // 优先级 2：若名称未匹配，使用真正的非索引唯一 ID (如 uuid)
            // -------------------------------------------------------------
            for (let i = remainingA.length - 1; i >= 0; i--) {
                const sA = remainingA[i];
                const idA = ((sA.id !== undefined && sA.id !== null ? sA.id : '') + '').trim();
                // 排除自动生成的 sig_1, sig_2, field_0 等数组索引占位符
                if (idA && !idA.match(/^(sig|field)_\d+$/i)) {
                    const bIdx = remainingB.findIndex(sB => {
                        const idB = ((sB.id !== undefined && sB.id !== null ? sB.id : '') + '').trim();
                        return idB && idB === idA;
                    });
                    if (bIdx !== -1) {
                        paired.push({ sA, sB: remainingB[bIdx], matchRule: 'id' });
                        remainingA.splice(i, 1);
                        remainingB.splice(bIdx, 1);
                    }
                }
            }

            // -------------------------------------------------------------
            // 优先级 3：纯改名推断 (仅针对 ID 与 名称 均未匹配的孤立信号！)
            // 此时两侧信号名称不同，但若其占据完全相同的位段位置 (startBit + bitLength)，才推断为同一个位段上的信号重命名
            // -------------------------------------------------------------
            for (let i = remainingA.length - 1; i >= 0; i--) {
                const sA = remainingA[i];
                const bitA = getBitInfo(sA);

                const bIdx = remainingB.findIndex(sB => {
                    const bitB = getBitInfo(sB);
                    return bitA.start === bitB.start && bitA.len === bitB.len;
                });

                if (bIdx !== -1) {
                    paired.push({ sA, sB: remainingB[bIdx], matchRule: 'bit_position_rename' });
                    remainingA.splice(i, 1);
                    remainingB.splice(bIdx, 1);
                }
            }

            const signalDiffs = [];

            // 1. 配对成功的信号：进入属性层级 (Tier 4) 比对
            paired.forEach(({ sA, sB, matchRule }) => {
                const attrComparison = this._compareSignalAttributes(sA, sB, isArinc);
                const nameDisplay = sB.name || sA.name || '未命名信号';

                const sDiff = {
                    key: sB.id || sB.key || sA.id || sA.key || `sig_${sB.name || sA.name}`,
                    name: nameDisplay,
                    status: attrComparison.hasChange ? 'modified' : 'same',
                    impact: attrComparison.impact,
                    matchRule,
                    baseSignal: sA,
                    targetSignal: sB,
                    attributes: attrComparison.attrs,
                    changesList: attrComparison.changesList,
                    changedAttrCount: attrComparison.changesList.length,
                    breakingCount: attrComparison.breakingCount,
                    nonBreakingCount: attrComparison.nonBreakingCount
                };

                signalDiffs.push(sDiff);

                if (attrComparison.hasChange) {
                    report.summary.totalSignalsModified++;
                    report.summary.totalSignalsInvolved++;
                    report.summary.totalAttributeChanges += attrComparison.changesList.length;
                    report.summary.breakingChangesCount += attrComparison.breakingCount;
                    report.summary.nonBreakingChangesCount += attrComparison.nonBreakingCount;

                    attrComparison.changesList.forEach(c => {
                        const s = `“${frameLabel}”信号「${nameDisplay}」${c.prop}由【${c.before}】改为【${c.after}】`;
                        report.summary.summarySentences.push(s);
                        report.details.push({
                            target: `${frameLabel} > ${nameDisplay}`,
                            prop: c.prop,
                            valA: c.before,
                            valB: c.after,
                            type: 'modified',
                            impact: c.impact
                        });
                    });
                } else {
                    report.summary.totalSignalsSame++;
                }
            });

            // 2. 剩余在 B 中的未配对信号 -> 新增信号 (non_breaking)
            remainingB.forEach(sB => {
                const sDiff = this._createSingleSignalDiff(null, sB, 'added', isArinc);
                signalDiffs.push(sDiff);

                report.summary.totalSignalsAdded++;
                report.summary.totalSignalsInvolved++;
                report.summary.totalAttributeChanges += sDiff.changedAttrCount;
                report.summary.nonBreakingChangesCount += sDiff.nonBreakingCount;

                const startB = parseInt(sB.startBit !== undefined && sB.startBit !== null ? sB.startBit : 0, 10);
                const lenB = parseInt(sB.bitLength || sB.bitCount || sB.length || 1, 10) || 1;
                const posStr = isArinc
                    ? (lenB === 1 ? `Bit${startB}` : `B${startB}~B${startB + lenB - 1}`)
                    : `Byte ${startB}`;
                const s = `“${frameLabel}”新增信号「${sB.name || '未命名'}」 (${posStr}, ${sB.dataType || sB.type || 'BNR'})`;
                report.summary.summarySentences.push(s);
                report.details.push({
                    target: `${frameLabel} > ${sB.name || '未命名'}`,
                    prop: '信号新增',
                    valA: '未定义',
                    valB: '新增信号',
                    type: 'added',
                    impact: 'non_breaking'
                });
            });

            // 3. 剩余在 A 中的未配对信号 -> 删除信号 (breaking)
            remainingA.forEach(sA => {
                const sDiff = this._createSingleSignalDiff(sA, null, 'deleted', isArinc);
                signalDiffs.push(sDiff);

                report.summary.totalSignalsDeleted++;
                report.summary.totalSignalsInvolved++;
                report.summary.totalAttributeChanges += sDiff.changedAttrCount;
                report.summary.breakingChangesCount += sDiff.breakingCount;

                const startA = parseInt(sA.startBit !== undefined && sA.startBit !== null ? sA.startBit : 0, 10);
                const lenA = parseInt(sA.bitLength || sA.bitCount || sA.length || 1, 10) || 1;
                const posStr = isArinc
                    ? (lenA === 1 ? `Bit${startA}` : `B${startA}~B${startA + lenA - 1}`)
                    : `Byte ${startA}`;
                const s = `“${frameLabel}”删除信号「${sA.name || '未命名'}」 (${posStr})`;
                report.summary.summarySentences.push(s);
                report.details.push({
                    target: `${frameLabel} > ${sA.name || '未命名'}`,
                    prop: '信号删除',
                    valA: '原存在',
                    valB: '已删除',
                    type: 'removed',
                    impact: 'breaking'
                });
            });

            // 按起始位升序排序
            signalDiffs.sort((a, b) => {
                const bitA = parseInt((a.targetSignal || a.baseSignal || {}).startBit || 0, 10);
                const bitB = parseInt((b.targetSignal || b.baseSignal || {}).startBit || 0, 10);
                return bitA - bitB;
            });

            return signalDiffs;
        },

        // Tier 4: 属性级精细比对 (区分静态与变更属性，自动打标 breaking vs non_breaking)
        _compareSignalAttributes(sA, sB, isArinc) {
            const attrs = {};
            const changesList = [];
            let breakingCount = 0;
            let nonBreakingCount = 0;

            const recordAttr = (key, label, valA, valB, isBreaking = false, formatFn = null) => {
                const strA = (valA !== undefined && valA !== null) ? String(valA).trim() : '';
                const strB = (valB !== undefined && valB !== null) ? String(valB).trim() : '';
                const changed = (strA !== strB);

                if (changed) {
                    const impact = isBreaking ? 'breaking' : 'non_breaking';
                    if (isBreaking) breakingCount++;
                    else nonBreakingCount++;

                    const displayBefore = formatFn ? formatFn(valA) : (strA || '-');
                    const displayAfter = formatFn ? formatFn(valB) : (strB || '-');

                    attrs[key] = {
                        changed: true,
                        before: displayBefore,
                        after: displayAfter,
                        impact,
                        label
                    };
                    changesList.push({
                        key,
                        prop: label,
                        before: displayBefore,
                        after: displayAfter,
                        impact
                    });
                } else {
                    // 未变更属性：只存单值 changed: false
                    attrs[key] = {
                        changed: false,
                        value: formatFn ? formatFn(valA) : (strA || '-'),
                        label
                    };
                }
            };

            // 1. 信号名称 (修改名称 -> non_breaking)
            const nameA = (sA ? sA.name : '') || '';
            const nameB = (sB ? sB.name : '') || '';
            recordAttr('name', '信号名称', nameA, nameB, false);

            // 2. 起始位位置 (位段偏移 -> breaking)
            const startA = parseInt(sA && sA.startBit !== undefined && sA.startBit !== null ? sA.startBit : (sA && sA.offset !== undefined ? sA.offset : 0), 10) || 0;
            const startB = parseInt(sB && sB.startBit !== undefined && sB.startBit !== null ? sB.startBit : (sB && sB.offset !== undefined ? sB.offset : 0), 10) || 0;
            recordAttr('startBit', isArinc ? '起始位 (位段偏移)' : '起始字节偏移', startA, startB, true, v => isArinc ? `Bit ${v}` : `Byte ${v}`);

            // 3. 位占用宽度 (位段改变 -> breaking)
            const lenA = parseInt(sA && (sA.bitLength || sA.bitCount || sA.length || sA.byteLength || 1), 10) || 1;
            const lenB = parseInt(sB && (sB.bitLength || sB.bitCount || sB.length || sB.byteLength || 1), 10) || 1;
            recordAttr('bitLength', isArinc ? '占用位宽' : '字节长度', lenA, lenB, true, v => isArinc ? `${v} 位` : `${v} 字节`);

            // 4. 位段范围跨度 (单 bit 简化为 BitX，多 bit 呈现 B_start~B_end；仅用于卡片直观高亮展示，不重复累加属性变更计数)
            const formatBitSpan = (start, len) => {
                if (!isArinc) {
                    return len === 1 ? `Byte ${start}` : `Byte ${start}~${start + len - 1}`;
                }
                return len === 1 ? `Bit${start}` : `B${start}~B${start + len - 1}`;
            };
            const rangeA = formatBitSpan(startA, lenA);
            const rangeB = formatBitSpan(startB, lenB);
            attrs.bitRange = {
                changed: (rangeA !== rangeB),
                before: rangeA,
                after: rangeB,
                value: rangeA,
                impact: 'breaking',
                label: isArinc ? '位段范围' : '字节范围'
            };

            // 5. 数据类型 (数据类型改变 -> breaking, 大小写规范化)
            const typeA = String((sA && (sA.dataType || sA.type)) || 'BNR').trim().toUpperCase();
            const typeB = String((sB && (sB.dataType || sB.type)) || 'BNR').trim().toUpperCase();
            recordAttr('dataType', '数据类型', typeA, typeB, true);

            // 6. 分辨率 / 缩放系数 (scale / resolution 改变 -> breaking)
            const hasScaleA = sA && ((sA.resolution !== undefined && sA.resolution !== '' && sA.resolution !== null) || (sA.scale !== undefined && sA.scale !== '' && sA.scale !== null));
            const hasScaleB = sB && ((sB.resolution !== undefined && sB.resolution !== '' && sB.resolution !== null) || (sB.scale !== undefined && sB.scale !== '' && sB.scale !== null));
            if (hasScaleA || hasScaleB) {
                const parseScale = (s) => {
                    if (!s) return 1;
                    const raw = (s.resolution !== undefined && s.resolution !== '' && s.resolution !== null) ? s.resolution : (s.scale !== undefined ? s.scale : 1);
                    const num = parseFloat(raw);
                    return isNaN(num) ? 1 : num;
                };
                const scaleA = parseScale(sA);
                const scaleB = parseScale(sB);
                recordAttr('scale', '分辨率/比例', scaleA, scaleB, true);
            }

            // 7. 零点偏置 offset (仅在两侧至少一方明确配置了物理偏置时比对，避免默认空串误判为 0 引起假阳性变更)
            const hasOffA = sA && (sA.offset !== undefined && sA.offset !== null && String(sA.offset).trim() !== '');
            const hasOffB = sB && (sB.offset !== undefined && sB.offset !== null && String(sB.offset).trim() !== '');
            if (hasOffA || hasOffB) {
                const offA = hasOffA ? (parseFloat(sA.offset) || 0) : 0;
                const offB = hasOffB ? (parseFloat(sB.offset) || 0) : 0;
                recordAttr('offset', '零点偏置', offA, offB, true);
            }

            // 8. 物理单位 (修改单位 -> non_breaking)
            const uA = (sA && sA.unit ? String(sA.unit).trim() : '') || '-';
            const uB = (sB && sB.unit ? String(sB.unit).trim() : '') || '-';
            recordAttr('unit', '物理单位', uA, uB, false);

            // 9. 说明/备注 (修改备注 -> non_breaking)
            const descA = (sA && (sA.description || sA.remark || sA.comment) ? String(sA.description || sA.remark || sA.comment).trim() : '') || '';
            const descB = (sB && (sB.description || sB.remark || sB.comment) ? String(sB.description || sB.remark || sB.comment).trim() : '') || '';
            recordAttr('description', '说明备注', descA, descB, false);

            // 10. 枚举字典 (新增状态字典 -> non_breaking)
            const dA = (sA && sA.dict && typeof sA.dict === 'object') ? sA.dict : {};
            const dB = (sB && sB.dict && typeof sB.dict === 'object') ? sB.dict : {};
            const keysA = Object.keys(dA);
            const keysB = Object.keys(dB);
            let dictChanged = false;
            if (keysA.length !== keysB.length) {
                dictChanged = true;
            } else {
                for (const k of keysA) {
                    if (String(dA[k]).trim() !== String(dB[k]).trim()) { dictChanged = true; break; }
                }
            }
            if (dictChanged) {
                nonBreakingCount++;
                attrs.dict = {
                    changed: true,
                    before: `${keysA.length} 项`,
                    after: `${keysB.length} 项`,
                    impact: 'non_breaking',
                    label: '状态字典'
                };
                changesList.push({
                    key: 'dict',
                    prop: '状态字典',
                    before: `${keysA.length} 项定义`,
                    after: `${keysB.length} 项定义`,
                    impact: 'non_breaking'
                });
            } else {
                attrs.dict = {
                    changed: false,
                    value: keysA.length > 0 ? `${keysA.length} 项定义` : '无',
                    label: '状态字典'
                };
            }

            const hasChange = (changesList.length > 0);
            const impact = breakingCount > 0 ? 'breaking' : (nonBreakingCount > 0 ? 'non_breaking' : 'none');

            return {
                attrs,
                changesList,
                hasChange,
                breakingCount,
                nonBreakingCount,
                impact
            };
        },

        // 创建单侧信号 (用于新增或删除项)
        _createSingleSignalDiff(sA, sB, status, isArinc) {
            const isAdded = (status === 'added');
            const target = isAdded ? sB : sA;
            const impact = isAdded ? 'non_breaking' : 'breaking';
            const name = (target && target.name) || '未命名信号';
            const startBit = parseInt(target && target.startBit !== undefined ? target.startBit : (target && target.offset !== undefined ? target.offset : 0), 10) || 0;
            const bitLength = parseInt(target && (target.bitLength || target.bitCount || target.length || 1), 10) || 1;
            const dataType = String((target && (target.dataType || target.type)) || 'BNR').trim().toUpperCase();
            const unit = (target && target.unit ? String(target.unit).trim() : '') || '-';
            const rangeStr = isArinc
                ? (bitLength === 1 ? `Bit${startBit}` : `B${startBit}~B${startBit + bitLength - 1}`)
                : (bitLength === 1 ? `Byte ${startBit}` : `Byte ${startBit}~${startBit + bitLength - 1}`);

            const attrs = {
                name: { changed: true, before: isAdded ? '未定义' : name, after: isAdded ? name : '已删除', impact, label: '信号名称' },
                startBit: { changed: true, before: isAdded ? '-' : (isArinc ? `Bit ${startBit}` : `Byte ${startBit}`), after: isAdded ? (isArinc ? `Bit ${startBit}` : `Byte ${startBit}`) : '已释放', impact, label: isArinc ? '起始位' : '起始字节' },
                bitLength: { changed: true, before: isAdded ? '-' : (isArinc ? `${bitLength} 位` : `${bitLength} 字节`), after: isAdded ? (isArinc ? `${bitLength} 位` : `${bitLength} 字节`) : '-', impact, label: isArinc ? '占用位宽' : '字节长度' },
                bitRange: { changed: true, before: isAdded ? '-' : rangeStr, after: isAdded ? rangeStr : '已释放', impact, label: isArinc ? '位段范围' : '字节范围' },
                dataType: { changed: true, before: isAdded ? '-' : dataType, after: isAdded ? dataType : '-', impact, label: '数据类型' },
                unit: { changed: true, before: isAdded ? '-' : unit, after: isAdded ? unit : '-', impact, label: '物理单位' }
            };

            return {
                key: target.id || target.key || `sig_${name}_${startBit}`,
                name,
                status,
                impact,
                baseSignal: sA,
                targetSignal: sB,
                attributes: attrs,
                changesList: [
                    { prop: isAdded ? '新增信号' : '删除信号', before: isAdded ? '未定义' : name, after: isAdded ? name : '已删除', impact }
                ],
                changedAttrCount: 1,
                breakingCount: isAdded ? 0 : 1,
                nonBreakingCount: isAdded ? 1 : 0
            };
        },

        // ARINC 429 32-bit 位域 Before / After 映射条生成
        generate32BitfieldDiff(wA, wB, signalsDiff) {
            const beforeBits = [];
            const afterBits = [];

            const defaultRole = (b) => {
                if (b <= 8) return 'Label 标号';
                if (b === 9 || b === 10) return 'SDI';
                if (b >= 11 && b <= 29) return '数据位段';
                if (b === 30 || b === 31) return 'SSM';
                if (b === 32) return '奇偶校验 (P)';
                return '未定义';
            };

            for (let b = 1; b <= 32; b++) {
                beforeBits.push({
                    bit: b,
                    role: defaultRole(b),
                    status: b <= 8 ? 'fixed' : (b === 32 ? 'parity' : 'empty'),
                    signalName: b <= 8 ? 'Label 标号' : (b === 32 ? 'Parity' : ''),
                    impact: 'none'
                });
                afterBits.push({
                    bit: b,
                    role: defaultRole(b),
                    status: b <= 8 ? 'fixed' : (b === 32 ? 'parity' : 'empty'),
                    signalName: b <= 8 ? 'Label 标号' : (b === 32 ? 'Parity' : ''),
                    impact: 'none'
                });
            }

            // 将 signalsDiff 映射至 32 个格子
            (signalsDiff || []).forEach(sd => {
                if (sd.status === 'same') {
                    const s = sd.baseSignal || sd.targetSignal;
                    const start = parseInt(s.startBit, 10) || 11;
                    const len = parseInt(s.bitLength || s.bitCount || s.length || 1, 10) || 1;
                    for (let b = start; b < start + len && b <= 32; b++) {
                        if (b >= 1) {
                            beforeBits[b - 1] = { bit: b, role: '数据', status: 'same', signalName: s.name || sd.name, impact: 'none', range: `B${start}~B${start + len - 1}` };
                            afterBits[b - 1] = { bit: b, role: '数据', status: 'same', signalName: s.name || sd.name, impact: 'none', range: `B${start}~B${start + len - 1}` };
                        }
                    }
                } else if (sd.status === 'deleted') {
                    const s = sd.baseSignal;
                    if (s) {
                        const start = parseInt(s.startBit, 10) || 11;
                        const len = parseInt(s.bitLength || s.bitCount || s.length || 1, 10) || 1;
                        for (let b = start; b < start + len && b <= 32; b++) {
                            if (b >= 1) {
                                beforeBits[b - 1] = { bit: b, role: '数据', status: 'deleted', signalName: `${s.name || sd.name} (已释放/删除)`, impact: 'breaking', range: `B${start}~B${start + len - 1}` };
                            }
                        }
                    }
                } else if (sd.status === 'added') {
                    const s = sd.targetSignal;
                    if (s) {
                        const start = parseInt(s.startBit, 10) || 11;
                        const len = parseInt(s.bitLength || s.bitCount || s.length || 1, 10) || 1;
                        for (let b = start; b < start + len && b <= 32; b++) {
                            if (b >= 1) {
                                afterBits[b - 1] = { bit: b, role: '数据', status: 'added', signalName: `${s.name || sd.name} (新增占用)`, impact: 'non_breaking', range: `B${start}~B${start + len - 1}` };
                            }
                        }
                    }
                } else if (sd.status === 'modified') {
                    const sA = sd.baseSignal;
                    const sB = sd.targetSignal;
                    const startA = parseInt(sA ? sA.startBit : 0, 10) || 11;
                    const lenA = parseInt(sA ? (sA.bitLength || sA.bitCount || sA.length || 1) : 1, 10) || 1;
                    const startB = parseInt(sB ? sB.startBit : 0, 10) || 11;
                    const lenB = parseInt(sB ? (sB.bitLength || sB.bitCount || sB.length || 1) : 1, 10) || 1;
                    const isShifted = (startA !== startB || lenA !== lenB);
                    const modImpact = isShifted ? 'breaking' : sd.impact;

                    if (sA) {
                        for (let b = startA; b < startA + lenA && b <= 32; b++) {
                            if (b >= 1) {
                                beforeBits[b - 1] = { bit: b, role: '数据', status: 'modified', signalName: `${sA.name || sd.name} (改动前 B${startA}~B${startA + lenA - 1})`, impact: modImpact, range: `B${startA}~B${startA + lenA - 1}` };
                            }
                        }
                    }
                    if (sB) {
                        for (let b = startB; b < startB + lenB && b <= 32; b++) {
                            if (b >= 1) {
                                afterBits[b - 1] = { bit: b, role: '数据', status: 'modified', signalName: `${sB.name || sd.name} (改动后 B${startB}~B${startB + lenB - 1})`, impact: modImpact, range: `B${startB}~B${startB + lenB - 1}` };
                            }
                        }
                    }
                }
            });

            return { beforeBits, afterBits };
        }
    };


    // ========================================================
    // 3. UI 交互：升版归档弹窗与通信协议版本管理中心 (Git-like)
    // ========================================================

    // 打开已归档协议再次归档时的升版弹窗
    function openProtocolArchiveModal(proto) {
        if (!proto) return;
        ArchiveManager.ensureProtocolVersion(proto);

        const hasArchiveRecord = (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) || Boolean(proto.lastArchivedVersion);
        if (hasArchiveRecord && !ArchiveManager.hasChangesAgainstArchived(proto)) {
            const baseVer = proto.lastArchivedVersion || (proto.archivedVersions && proto.archivedVersions[0] ? proto.archivedVersions[0].version : proto.version) || 'v1.0';
            showToast(`通信协议「${proto.name || '当前协议'}」当前已归档为正式版本 [${baseVer}]，且未发生任何改动，无需重复归档！`, 'warning');
            return;
        }

        const modal = document.getElementById('protocol-archive-modal');
        if (!modal) return;

        const nameEl = document.getElementById('archive-modal-proto-name');
        if (nameEl) nameEl.textContent = proto.name || '通信协议';

        const baseVer = proto.lastArchivedVersion || (proto.archivedVersions && proto.archivedVersions[0] ? proto.archivedVersions[0].version : proto.version) || 'v1.0';
        const curVerEl = document.getElementById('archive-current-ver');
        if (curVerEl) curVerEl.textContent = baseVer;

        const nextVerInput = document.getElementById('archive-next-ver-input');
        if (nextVerInput) {
            nextVerInput.value = ArchiveManager.recommendNextVersion(baseVer);
        }

        const commentInput = document.getElementById('archive-comment-input');
        if (commentInput) {
            commentInput.value = '';
        }

        const form = document.getElementById('protocol-archive-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const newVer = nextVerInput ? nextVerInput.value.trim() : '';
            const comment = commentInput ? commentInput.value.trim() : '';
            if (!newVer) {
                showToast('请输入有效的版本号', 'warning');
                return;
            }
            if (newVer === baseVer) {
                showToast(`该协议已归档过 [${baseVer}]，修改后再次归档必须升版（不能使用原版本号）`, 'warning');
                return;
            }

            await ArchiveManager.archiveProtocol(proto, newVer, comment);
            modal.classList.remove('active');
            showToast(`协议已成功升版为 [${newVer}] 并完成归档！`, 'success');
            ArchiveManager.refreshActiveViews(proto);

            // 若版本管理中心正打开着，同步刷新其版本演进树
            const versionView = document.getElementById('protocol-version-view');
            if (versionView && versionView.classList.contains('active')) {
                VersionManager.loadProtocol(proto);
            }
        };

        modal.classList.add('active');
    }

    // ========================================================
    // 4. VersionManager: Git 风格通信协议版本管理中心引擎
    // ========================================================
    const VersionManager = {
        currentProto: null,
        historyNodes: [],
        selectedIndex: 0,
        activeTab: 'diff', // 'diff' | 'spec'
        allProtocols: [],
        pickerSearchQuery: '',
        pickerBusFilter: 'all',
        pickerMultiOnly: true,
        pickerEventsBound: false,

        // 代理 ArchiveManager 确保协议具备归档与版本字段
        ensureProtocolVersion(proto) {
            return ArchiveManager.ensureProtocolVersion(proto);
        },

        // 计算协议的版本演进状态 (支撑用户诉求：单版本协议过滤与提示)
        getProtocolVersionMeta(proto) {
            if (!proto) return { totalVersions: 0, archivedCount: 0, isModified: false, hasEvolution: false, isSingleVersion: true, badgeText: '无版本', badgeClass: 'vm-pill-single' };
            ArchiveManager.ensureProtocolVersion(proto);
            const archivedCount = Array.isArray(proto.archivedVersions) ? proto.archivedVersions.length : 0;
            const isModified = ArchiveManager.hasChangesAgainstArchived(proto);

            // 多版本演进条件：归档版本 > 1，或者已归档 1 次且当前产生了未归档修改副本
            const hasEvolution = (archivedCount > 1) || (archivedCount === 1 && isModified);
            const totalVersions = (archivedCount === 0 ? 1 : archivedCount) + (isModified && archivedCount > 0 ? 1 : 0);

            let badgeText = '';
            let badgeClass = '';
            if (archivedCount > 1) {
                badgeText = `${archivedCount} 个已归档版${isModified ? ' + 修改中' : ''}`;
                badgeClass = 'vm-pill-multi';
            } else if (archivedCount === 1 && isModified) {
                badgeText = `2 个版本 (修改中)`;
                badgeClass = 'vm-pill-modifying';
            } else if (archivedCount === 1) {
                badgeText = `1 个版本 (初始基准)`;
                badgeClass = 'vm-pill-single';
            } else {
                badgeText = `单版本 (未归档草稿)`;
                badgeClass = 'vm-pill-single';
            }

            return {
                totalVersions,
                archivedCount,
                isModified,
                hasEvolution,
                isSingleVersion: !hasEvolution,
                badgeText,
                badgeClass
            };
        },

        /**
         * 判定当前协议处于哪种版本管理状态 (用户核心诉求：极简四态前置决策机)
         * State A: 'UNARCHIVED' - 尚未进行正式归档（草稿态，暂未进行版本管理）
         * State B: 'SINGLE_INITIAL' - 已归档但仅有一版初始基准，且无未归档改动（无正式变更历程）
         * State C: 'UNARCHIVED_MODIFIED' - 已归档过，但当前有未归档修改（正在比对：最新正式归档 vs 当前工作副本）
         * State D: 'MULTI_EVOLUTION' - 具备多版正式归档演进（正常时间轴与任意两版对比）
         */
        determineProtocolVersionState(proto) {
            if (!proto) return 'UNARCHIVED';
            ArchiveManager.ensureProtocolVersion(proto);
            const archived = Array.isArray(proto.archivedVersions) ? proto.archivedVersions : [];
            const hasArchiveRecord = archived.length > 0 || Boolean(proto.lastArchivedVersion);

            // Case A: 从未归档 (新协议草稿)
            if (!hasArchiveRecord && !proto.isArchived) {
                return 'UNARCHIVED';
            }

            // 精准判定是否存在实质未归档改动
            const hasRealChanges = ArchiveManager.hasChangesAgainstArchived(proto);
            if (!hasRealChanges && proto.isArchived) {
                proto.hasUnarchivedChanges = false;
            }

            // Case C: 曾归档过，且当前存在未归档实质改动 (正在比对：最新正式归档 vs 当前工作副本)
            if (hasRealChanges) {
                return 'UNARCHIVED_MODIFIED';
            }

            // Case B: 仅归档了 1 版，且没有未归档修改 (初始单版本基准规范)
            if (archived.length <= 1) {
                return 'SINGLE_INITIAL';
            }

            // Case D: 有多版归档演进 (两版以上已归档快照)
            return 'MULTI_EVOLUTION';
        },

        // 渲染状态看板：State A (未归档草稿) 或 State B (初始单版本基准)
        renderStateBoard(state, proto) {
            const container = document.getElementById('vm-state-board-container');
            if (!container || !proto) return;

            const isArinc = proto.type === 'ARINC429';

            if (state === 'UNARCHIVED') {
                container.innerHTML = `
                    <div class="vm-state-board-wrap">
                        <div class="vm-state-board state-unarchived">
                            <div class="vm-sb-header">
                                <div class="vm-sb-icon-wrapper">
                                    <div class="vm-sb-icon-box unarchived">
                                        <i class="fa-solid fa-drafting-compass"></i>
                                    </div>
                                </div>
                                <div class="vm-sb-badge-pill unarchived">
                                    <i class="fa-solid fa-pen-nib"></i> 研制草拟阶段 · 自由编辑无约束
                                </div>
                                <h3 class="vm-sb-title">当前协议尚未归档，暂未建立版本基线</h3>
                                <p class="vm-sb-desc">
                                    通信协议在研制初期支持随时自由保存与修改，不受版本锁限制。待阶段性通信规范趋于稳定或具备提审交付条件时，在工作台中点击「归档」即可固化生成首个正式生效的基准规范版本 (如 v1.0)。
                                </p>
                            </div>

                            <div class="vm-sb-pipeline">
                                <div class="vm-sb-step-card">
                                    <div class="vm-sb-step-header">
                                        <span class="vm-sb-step-num">01</span>
                                        <i class="fa-solid fa-sliders vm-sb-step-icon"></i>
                                    </div>
                                    <div class="vm-sb-step-body">
                                        <h4 class="vm-sb-step-title">自由设计与调试</h4>
                                        <p class="vm-sb-step-desc">在编辑工作台中随时增删数据包、配置标号字与物理量信号字段，自动保存实时草稿。</p>
                                    </div>
                                    <div class="vm-sb-step-connector"><i class="fa-solid fa-chevron-right"></i></div>
                                </div>

                                <div class="vm-sb-step-card highlight">
                                    <div class="vm-sb-step-header">
                                        <span class="vm-sb-step-num">02</span>
                                        <i class="fa-solid fa-box-archive vm-sb-step-icon"></i>
                                    </div>
                                    <div class="vm-sb-step-body">
                                        <h4 class="vm-sb-step-title">首次归档生效</h4>
                                        <p class="vm-sb-step-desc">在工作台顶部点击「归档」按钮，冻结当前设计，建立首个不可变基准快照 (如 v1.0)。</p>
                                    </div>
                                    <div class="vm-sb-step-connector"><i class="fa-solid fa-chevron-right"></i></div>
                                </div>

                                <div class="vm-sb-step-card">
                                    <div class="vm-sb-step-header">
                                        <span class="vm-sb-step-num">03</span>
                                        <i class="fa-solid fa-code-compare vm-sb-step-icon"></i>
                                    </div>
                                    <div class="vm-sb-step-body">
                                        <h4 class="vm-sb-step-title">自动开启版本追踪</h4>
                                        <p class="vm-sb-step-desc">后续在此基准上的修改均由系统自动进行语义差异对比、变更追踪与受控升版。</p>
                                    </div>
                                </div>
                            </div>

                            <div class="vm-sb-actions">
                                <button type="button" class="btn btn-primary vm-sb-btn-main" id="btn-sb-goto-workbench">
                                    <i class="fa-solid fa-arrow-up-right-from-square"></i> 进入编辑工作台 (进行设计与归档)
                                </button>
                                <button type="button" class="btn btn-secondary vm-sb-btn-sub" id="btn-sb-goto-viewer">
                                    <i class="fa-solid fa-book-open"></i> 只读查阅协议规范
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                const btnWorkbench = document.getElementById('btn-sb-goto-workbench');
                if (btnWorkbench) {
                    btnWorkbench.onclick = () => {
                        if (isArinc) {
                            if (typeof window.openArincProtocol === 'function') window.openArincProtocol(proto);
                            else if (typeof window.switchToView === 'function') window.switchToView('arinc429-view');
                        } else {
                            if (typeof window.openSerialProtocol === 'function') window.openSerialProtocol(proto);
                            else if (typeof window.switchToView === 'function') window.switchToView('serial-view');
                        }
                    };
                }
                const btnViewer = document.getElementById('btn-sb-goto-viewer');
                if (btnViewer) {
                    btnViewer.onclick = () => {
                        if (typeof window.openProtocolViewer === 'function') window.openProtocolViewer(proto);
                        else if (typeof window.switchToView === 'function') window.switchToView('protocol-viewer-view');
                    };
                }
            } else if (state === 'SINGLE_INITIAL') {
                const curVer = proto.version || 'v1.0';
                container.innerHTML = `
                    <div class="vm-state-board-wrap">
                        <div class="vm-state-board state-single-initial">
                            <div class="vm-sb-header">
                                <div class="vm-sb-icon-wrapper">
                                    <div class="vm-sb-icon-box initial">
                                        <i class="fa-solid fa-circle-check"></i>
                                    </div>
                                </div>
                                <div class="vm-sb-badge-pill initial">
                                    <i class="fa-solid fa-shield-halved"></i> 初始基准规范 · 冻结正式生效
                                </div>
                                <h3 class="vm-sb-title">该协议当前为初始基准版本 [${escapeHTML(curVer)}]，暂无版本差异</h3>
                                <p class="vm-sb-desc">
                                    当前通信协议已作为初始规范基准完成归档，且目前尚未产生后续修改或版本演进。版本管理核心用于追踪不同版本或改动工作副本间的具体差异，当前暂无需对比的变更内容。
                                </p>
                            </div>

                            <div class="vm-sb-pipeline">
                                <div class="vm-sb-step-card">
                                    <div class="vm-sb-step-header">
                                        <span class="vm-sb-step-num">01</span>
                                        <i class="fa-solid fa-pen-ruler vm-sb-step-icon"></i>
                                    </div>
                                    <div class="vm-sb-step-body">
                                        <h4 class="vm-sb-step-title">按需修改协议</h4>
                                        <p class="vm-sb-step-desc">进入编辑工作台增删改数据包、标号字或调整物理量信号字段参数。</p>
                                    </div>
                                    <div class="vm-sb-step-connector"><i class="fa-solid fa-chevron-right"></i></div>
                                </div>

                                <div class="vm-sb-step-card">
                                    <div class="vm-sb-step-header">
                                        <span class="vm-sb-step-num">02</span>
                                        <i class="fa-solid fa-code-compare vm-sb-step-icon"></i>
                                    </div>
                                    <div class="vm-sb-step-body">
                                        <h4 class="vm-sb-step-title">即时差异对比</h4>
                                        <p class="vm-sb-step-desc">一旦产生改动，版本管理即刻生成工作副本与已归档基准的语义差异对比。</p>
                                    </div>
                                    <div class="vm-sb-step-connector"><i class="fa-solid fa-chevron-right"></i></div>
                                </div>

                                <div class="vm-sb-step-card highlight-initial">
                                    <div class="vm-sb-step-header">
                                        <span class="vm-sb-step-num">03</span>
                                        <i class="fa-solid fa-box-archive vm-sb-step-icon"></i>
                                    </div>
                                    <div class="vm-sb-step-body">
                                        <h4 class="vm-sb-step-title">受控升版归档</h4>
                                        <p class="vm-sb-step-desc">确认改动后正式升版归档（如升至 v1.1），自动建立不可变版本演进时间轴。</p>
                                    </div>
                                </div>
                            </div>

                            <div class="vm-sb-actions">
                                <button type="button" class="btn btn-primary vm-sb-btn-main" id="btn-sb-goto-workbench">
                                    <i class="fa-solid fa-pen-ruler"></i> 进入编辑工作台修改协议
                                </button>
                                <button type="button" class="btn btn-secondary vm-sb-btn-sub" id="btn-sb-goto-viewer">
                                    <i class="fa-solid fa-book-open"></i> 只读查阅规范规格书
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                const btnWorkbench = document.getElementById('btn-sb-goto-workbench');
                if (btnWorkbench) {
                    btnWorkbench.onclick = () => {
                        if (isArinc) {
                            if (typeof window.openArincProtocol === 'function') window.openArincProtocol(proto);
                            else if (typeof window.switchToView === 'function') window.switchToView('arinc429-view');
                        } else {
                            if (typeof window.openSerialProtocol === 'function') window.openSerialProtocol(proto);
                            else if (typeof window.switchToView === 'function') window.switchToView('serial-view');
                        }
                    };
                }
                const btnViewer = document.getElementById('btn-sb-goto-viewer');
                if (btnViewer) {
                    btnViewer.onclick = () => {
                        if (typeof window.openProtocolViewer === 'function') window.openProtocolViewer(proto);
                        else if (typeof window.switchToView === 'function') window.switchToView('protocol-viewer-view');
                    };
                }
            }
        },

        // 格式化时间与相对时间
        formatTime(ts) {
            if (!ts) return '-';
            const d = new Date(ts);
            if (isNaN(d.getTime())) return String(ts);
            const now = Date.now();
            const diffSec = Math.floor((now - d.getTime()) / 1000);
            if (diffSec < 60) return '刚刚';
            if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
            if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
            if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} 天前`;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },

        // 从协议中解构出 Git-like 完整时间轴节点
        buildHistoryNodes(proto) {
            if (!proto) return [];
            ArchiveManager.ensureProtocolVersion(proto);

            const nodes = [];
            const isModified = ArchiveManager.hasChangesAgainstArchived(proto);
            if (!isModified) {
                if (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) {
                    proto.isArchived = true;
                }
                proto.hasUnarchivedChanges = false;
            }
            const curUser = (ProtoView.Auth && ProtoView.Auth.getCurrentUser) ? ProtoView.Auth.getCurrentUser() : null;
            const currentAuthor = curUser ? (curUser.name || curUser.username) : '工程师';

            // 1. 如果存在未归档的修改中工作副本，构建 HEAD (Working Copy) 节点
            if (isModified) {
                const baseVer = proto.lastArchivedVersion || (proto.archivedVersions && proto.archivedVersions[0] ? proto.archivedVersions[0].version : 'v1.0');
                nodes.push({
                    id: `working_${proto.id || 'curr'}`,
                    version: `${baseVer} (修改中副本)`,
                    rawVersion: baseVer,
                    isWorkingCopy: true,
                    isBaseline: false,
                    isArchived: false,
                    author: currentAuthor,
                    timestamp: proto.updatedAt ? new Date(proto.updatedAt).getTime() : Date.now(),
                    comment: '包含尚未归档发布的本地最新修改（待升版归档）',
                    data: ArchiveManager._extractCleanData(proto),
                    summary: []
                });
            }

            // 2. 依次加载历史已归档版本节点 (从最新到最旧)
            if (Array.isArray(proto.archivedVersions) && proto.archivedVersions.length > 0) {
                proto.archivedVersions.forEach((av, idx) => {
                    const isLatestArchived = (idx === 0);
                    let cleanComment = av.comment || (isLatestArchived ? '当前正式基准版本' : '历史正式归档版本');
                    // 净化历史中存留的冗长自动生成文本描述 (如“协议版本号由 v1.1 变更为 v1.2; 标号字...”)
                    if (cleanComment && (cleanComment.includes('变更为') || cleanComment.includes('改为【') || cleanComment.includes('处变更'))) {
                        cleanComment = isLatestArchived ? `正式发布基准 [${av.version || proto.version}]` : `归档升级至版本 [${av.version || '历史版本'}]`;
                    }
                    nodes.push({
                        id: `archived_${proto.id || 'p'}_${idx}`,
                        archiveIndex: idx,
                        version: av.version || `v1.${proto.archivedVersions.length - idx}`,
                        rawVersion: av.version || 'v1.0',
                        isWorkingCopy: false,
                        isBaseline: isLatestArchived && !isModified,
                        isArchived: true,
                        author: av.author || (av.data && av.data.updatedBy) || '主控工程师',
                        timestamp: av.archivedAt || av.createdAt || Date.now(),
                        comment: cleanComment,
                        data: av.data || av,
                        summary: []
                    });
                });
            } else {
                // 若从未归档且无修改副本，构建唯一的初始基准版本
                if (nodes.length === 0) {
                    nodes.push({
                        id: `init_${proto.id || 'curr'}`,
                        version: proto.version || 'v1.0',
                        rawVersion: proto.version || 'v1.0',
                        isWorkingCopy: false,
                        isBaseline: true,
                        isArchived: false,
                        author: currentAuthor,
                        timestamp: proto.createdAt ? new Date(proto.createdAt).getTime() : Date.now(),
                        comment: '初始创建的规范基准版本',
                        data: ArchiveManager._extractCleanData(proto),
                        summary: []
                    });
                }
            }

            // 3. 计算每个版本与其前驱版本 (Parent) 之间的差异摘要 (基于四层嵌套 Diff 引擎统一统计口径)
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const parent = (i + 1 < nodes.length) ? nodes[i + 1] : null;
                if (parent && DiffEngine && DiffEngine.compareProtocols) {
                    try {
                        const rep = DiffEngine.compareProtocols(parent.data, node.data);
                        node.diffSummary = rep.summarySentences || [];
                        node.diffDetails = rep.details || [];
                        node.diffReport = rep;
                        const s = rep.summary || {};
                        node.modifiedLabels = (s.totalModifiedLabels || 0) + (s.totalAddedLabels || 0) + (s.totalDeletedLabels || 0);
                        node.involvedSignals = s.totalSignalsInvolved || 0;
                        node.attrChanges = s.totalAttributeChanges || 0;
                        node.breakingCount = s.breakingChangesCount || 0;
                        node.nonBreakingCount = s.nonBreakingChangesCount || 0;
                        node.diffCount = node.attrChanges;
                    } catch (e) {
                        node.diffSummary = [];
                        node.diffDetails = [];
                        node.diffCount = 0;
                        node.modifiedLabels = 0;
                        node.involvedSignals = 0;
                        node.attrChanges = 0;
                        node.breakingCount = 0;
                        node.nonBreakingCount = 0;
                    }
                } else {
                    node.diffSummary = ['初始版本，建立了通信规范基线'];
                    node.diffDetails = [];
                    node.diffCount = 0;
                    node.modifiedLabels = 0;
                    node.involvedSignals = 0;
                    node.attrChanges = 0;
                    node.breakingCount = 0;
                    node.nonBreakingCount = 0;
                }
            }

            return nodes;
        },

        // 打开通信协议版本管理中心 (一级主工作台视图，严格以具体协议为入口)
        async openView(protoIdOrProto = null, preferVersion = null) {
            // 记录当前活跃视图，供「返回」按钮精准退回上一级页面 (工作台 / 查阅 / 协议列表)
            const currentActiveView = document.querySelector('.view-section.active');
            if (currentActiveView && currentActiveView.id !== 'protocol-version-view') {
                this.returnViewId = currentActiveView.id;
            } else if (!this.returnViewId) {
                this.returnViewId = 'protocol-view';
            }

            // 1. 切换至 protocol-version-view 视图 (触发侧边栏自动收缩)
            if (typeof window.switchToView === 'function') {
                window.switchToView('protocol-version-view');
            }

            // 2. 加载系统中所有协议
            let all = [];
            try {
                if (window.dbHelper && typeof window.dbHelper.getAllProtocols === 'function') {
                    all = await window.dbHelper.getAllProtocols();
                }
            } catch (e) {
                console.warn('获取协议列表异常:', e);
            }

            // 3. 确认当前选中的目标协议 (严格保持最新内存态，杜绝陈旧快照)
            const activeWorkingProto = (window.currentArincProtocol && window.currentArincProtocol.id)
                ? window.currentArincProtocol
                : ((window.currentSerialProtocol && window.currentSerialProtocol.id)
                    ? window.currentSerialProtocol
                    : (window.currentViewerProtocol && window.currentViewerProtocol.id ? window.currentViewerProtocol : null));

            let targetId = null;
            if (protoIdOrProto) {
                targetId = (typeof protoIdOrProto === 'object') ? protoIdOrProto.id : protoIdOrProto;
            } else if (activeWorkingProto && activeWorkingProto.id) {
                targetId = activeWorkingProto.id;
            } else if (this.currentProto && this.currentProto.id) {
                targetId = this.currentProto.id;
            }

            let targetProto = null;
            if (targetId) {
                // 优先从活跃工作台协议获取最新内存态 (含未归档修改或刚归档的最新版本)
                if (activeWorkingProto && String(activeWorkingProto.id) === String(targetId)) {
                    targetProto = activeWorkingProto;
                } else {
                    targetProto = all.find(p => String(p.id) === String(targetId)) || null;
                }
            }

            // 若仍未定位到，回退选择当前工作台协议或协议列表首个
            if (!targetProto) {
                targetProto = activeWorkingProto || (protoIdOrProto && typeof protoIdOrProto === 'object' ? protoIdOrProto : null) || all[0];
            }

            if (!targetProto) {
                alert('请先选择或创建一个通信协议后再查看版本对比。');
                if (typeof window.switchToView === 'function') {
                    window.switchToView(this.returnViewId || 'protocol-view');
                }
                return;
            }

            // 将活跃协议数据同步回 all 列表
            if (targetProto && targetProto.id) {
                const existingIdx = all.findIndex(p => String(p.id) === String(targetProto.id));
                if (existingIdx !== -1) {
                    all[existingIdx] = targetProto;
                } else {
                    all.unshift(targetProto);
                }
            }
            this.allProtocols = all;
            this.currentProto = targetProto;

            // 4. 初始化顶栏与操作按钮
            this.initToolbarControls();

            // 5. 初始化左侧目录过滤控制与拖拽调整手柄
            this.initCatalogControls();
            this.initResizer();

            // 6. 载入目标协议与执行双栏 Diff
            this.loadProtocol(targetProto, preferVersion);
        },

        // 从视图路由切换时调用 (如左侧边栏导航点击)
        async initView() {
            const activeId = (window.currentArincProtocol && window.currentArincProtocol.id)
                || (window.currentSerialProtocol && window.currentSerialProtocol.id)
                || (this.currentProto && this.currentProto.id)
                || null;
            await this.openView(activeId);
        },

        // 向后兼容 openModal (直接平滑路由至主界面视图)
        async openModal(protoIdOrProto = null, preferVersion = null) {
            await this.openView(protoIdOrProto, preferVersion);
        },

        // 废弃旧全局协议选择器交互
        updatePickerTrigger() {},
        initProtocolPicker() {},
        openProtocolPicker() {},
        closeProtocolPicker() {},
        renderProtocolPickerList() {},

        // 初始化顶栏协议切换与快捷跳转按钮
        initToolbarControls() {
            // 顶栏「返回」按钮：精准退回上一级页面 (工作台 / 查阅 / 我的协议)
            const btnBack = document.getElementById('btn-vm-back');
            if (btnBack) {
                const returnId = this.returnViewId || 'protocol-view';
                let backLabel = '我的协议';
                let backTitle = '返回我的协议';
                if (returnId === 'arinc429-view' || returnId === 'serial-view' || returnId === 'can-view') {
                    backLabel = '工作台';
                    backTitle = '返回协议编辑工作台';
                } else if (returnId === 'protocol-viewer-view') {
                    backLabel = '查阅';
                    backTitle = '返回只读查阅模式';
                }
                btnBack.innerHTML = `<i class="fa-solid fa-arrow-left"></i> ${backLabel}`;
                btnBack.title = backTitle;
                btnBack.onclick = () => {
                    if (typeof window.switchToView === 'function') {
                        window.switchToView(returnId);
                    }
                };
            }

            // 顶栏「查阅模式」按钮
            const btnGotoViewer = document.getElementById('btn-vm-goto-viewer');
            if (btnGotoViewer) {
                btnGotoViewer.onclick = () => {
                    if (this.currentProto) {
                        if (typeof window.openProtocolViewer === 'function') {
                            window.openProtocolViewer(this.currentProto);
                        } else if (typeof window.switchToView === 'function') {
                            window.switchToView('protocol-viewer-view');
                        }
                    }
                };
            }

            // 顶栏「进入工作台」按钮 (主要操作入口，支持修改与升版归档)
            const btnGotoWorkbench = document.getElementById('btn-vm-goto-workbench');
            if (btnGotoWorkbench) {
                btnGotoWorkbench.onclick = () => {
                    if (!this.currentProto) return;
                    if (this.currentProto.type === 'ARINC429') {
                        if (typeof window.openArincProtocol === 'function') {
                            window.openArincProtocol(this.currentProto);
                        } else if (typeof window.switchToView === 'function') {
                            window.switchToView('arinc429-view');
                        }
                    } else if (this.currentProto.type === 'CAN') {
                        if (typeof window.loadCanProtocolIntoEditor === 'function') {
                            window.loadCanProtocolIntoEditor(this.currentProto.id || this.currentProto);
                        } else if (typeof window.switchToView === 'function') {
                            window.switchToView('can-view');
                        }
                    } else {
                        if (typeof window.openSerialProtocol === 'function') {
                            window.openSerialProtocol(this.currentProto);
                        } else if (typeof window.switchToView === 'function') {
                            window.switchToView('serial-view');
                        }
                    }
                };
            }

            // 顶栏「版本历程」按钮：点击呼出时间轴弹窗
            const btnOpenTimeline = document.getElementById('btn-vm-open-timeline');
            const timelineModal = document.getElementById('protocol-timeline-modal');
            const btnCloseModal = document.getElementById('btn-close-timeline-modal');
            const btnCloseFooter = document.getElementById('btn-close-timeline-footer');

            if (btnOpenTimeline && timelineModal) {
                btnOpenTimeline.onclick = () => {
                    this.renderTimeline();
                    timelineModal.style.display = 'flex';
                };
            }
            if (btnCloseModal && timelineModal) {
                btnCloseModal.onclick = () => {
                    timelineModal.style.display = 'none';
                };
            }
            if (btnCloseFooter && timelineModal) {
                btnCloseFooter.onclick = () => {
                    timelineModal.style.display = 'none';
                };
            }

            // 未归档提示条按钮交互
            const btnUwbWorkbench = document.getElementById('btn-uwb-workbench');
            if (btnUwbWorkbench) {
                btnUwbWorkbench.onclick = () => {
                    if (!this.currentProto) return;
                    if (this.currentProto.type === 'ARINC429') {
                        if (typeof window.openArincProtocol === 'function') window.openArincProtocol(this.currentProto);
                        else if (typeof window.switchToView === 'function') window.switchToView('arinc429-view');
                    } else {
                        if (typeof window.openSerialProtocol === 'function') window.openSerialProtocol(this.currentProto);
                        else if (typeof window.switchToView === 'function') window.switchToView('serial-view');
                    }
                };
            }

            const btnUwbRevert = document.getElementById('btn-uwb-revert');
            if (btnUwbRevert) {
                btnUwbRevert.onclick = async () => {
                    if (this.currentProto) {
                        const ok = await ArchiveManager.revertToArchived(this.currentProto);
                        if (ok) {
                            this.loadProtocol(this.currentProto);
                        }
                    }
                };
            }
        },

        // 初始化左侧目录控制条 (全部 vs 仅变化 切换胶囊与搜索过滤)
        initCatalogControls() {
            const btnAll = document.getElementById('btn-diff-filter-all');
            const btnChanged = document.getElementById('btn-diff-filter-changed');
            const searchInput = document.getElementById('vm-diff-label-search');
            const clearBtn = document.getElementById('btn-clear-diff-search');

            if (btnAll) {
                btnAll.onclick = () => {
                    this.activeDiffFilterMode = 'all';
                    btnAll.classList.add('active');
                    if (btnChanged) btnChanged.classList.remove('active');
                    this.renderDiffCatalog();
                };
            }
            if (btnChanged) {
                btnChanged.onclick = () => {
                    this.activeDiffFilterMode = 'changed';
                    btnChanged.classList.add('active');
                    if (btnAll) btnAll.classList.remove('active');
                    this.renderDiffCatalog();
                };
            }

            if (searchInput) {
                searchInput.oninput = (e) => {
                    this.activeDiffSearch = (e.target.value || '').trim();
                    if (clearBtn) clearBtn.style.display = this.activeDiffSearch ? 'inline-flex' : 'none';
                    this.renderDiffCatalog();
                };
            }

            if (clearBtn) {
                clearBtn.onclick = () => {
                    if (searchInput) searchInput.value = '';
                    this.activeDiffSearch = '';
                    clearBtn.style.display = 'none';
                    this.renderDiffCatalog();
                };
            }
        },

        // 载入协议数据并渲染
        loadProtocol(proto, preferVersion = null) {
            if (!proto) return;
            this.currentProto = proto;

            // 顶栏协议名称、总线类型与产品型号
            const nameEl = document.getElementById('vm-current-proto-name');
            if (nameEl) {
                nameEl.textContent = proto.name || '通信协议';
                nameEl.title = proto.name || '通信协议';
            }

            const badgeEl = document.getElementById('vm-current-proto-badge');
            if (badgeEl) {
                badgeEl.textContent = proto.type === 'ARINC429' ? 'ARINC 429' : (proto.type === 'Serial' ? (proto.subType || '串口通信') : proto.type);
            }

            const prodEl = document.getElementById('vm-current-proto-product');
            if (prodEl) {
                if (proto.product) {
                    prodEl.style.display = 'inline-flex';
                    prodEl.innerHTML = `<i class="fa-solid fa-cube"></i> ${proto.product}`;
                    prodEl.title = `所属产品: ${proto.product}`;
                } else {
                    prodEl.style.display = 'none';
                }
            }

            // 构建版本发展历程节点
            this.historyNodes = this.buildHistoryNodes(proto);

            // 预设过滤状态与选中
            this.activeDiffFilterMode = 'all';
            this.activeDiffSearch = '';
            this.activeSelectedLabelKey = null;

            const btnAll = document.getElementById('btn-diff-filter-all');
            const btnChanged = document.getElementById('btn-diff-filter-changed');
            if (btnAll) btnAll.classList.add('active');
            if (btnChanged) btnChanged.classList.remove('active');

            // 初始化顶栏版本选择下拉框
            this.setupDiffVersionSelectors(preferVersion);

            // 计算并渲染双栏对比
            this.calculateAndRenderDiff();
        },

        // 初始化顶栏对比基准 (Base) 与对比目标 (Target) 下拉选择器
        setupDiffVersionSelectors(preferVersion = null) {
            const baseSel = document.getElementById('vm-diff-base-select');
            const targetSel = document.getElementById('vm-diff-target-select');
            if (!baseSel || !targetSel) return;

            baseSel.innerHTML = '';
            targetSel.innerHTML = '';

            if (!this.historyNodes || this.historyNodes.length === 0) {
                const opt = document.createElement('option');
                opt.value = 'idx_0';
                opt.textContent = '当前协议 (v1.0)';
                baseSel.appendChild(opt);
                targetSel.appendChild(opt.cloneNode(true));
                return;
            }

            // 填充两边的 options (索引 0 为最新版本/工作副本，越往后越早)
            this.historyNodes.forEach((node, idx) => {
                const verStr = node.rawVersion || node.version;
                let labelText = '';
                if (node.isWorkingCopy) {
                    labelText = `工作副本 (${verStr} 最新)`;
                } else if (node.isBaseline) {
                    labelText = node.isArchived ? `${verStr} (正式基准)` : `${verStr} (初始基准)`;
                } else {
                    labelText = `${verStr} (已归档)`;
                }

                const optBase = document.createElement('option');
                optBase.value = `idx_${idx}`;
                optBase.textContent = labelText;
                baseSel.appendChild(optBase);

                const optTarget = document.createElement('option');
                optTarget.value = `idx_${idx}`;
                optTarget.textContent = labelText;
                targetSel.appendChild(optTarget);
            });

            // 默认基准 (Base) 与目标 (Target) 匹配：
            // Target 默认为 idx_0 (最新工作副本或最新正式版本)
            // Base 默认为 idx_1 (上一版本)，若无其他版本则同为 idx_0
            let defaultTargetIdx = 0;
            let defaultBaseIdx = (this.historyNodes.length > 1) ? 1 : 0;

            if (preferVersion) {
                const foundIdx = this.historyNodes.findIndex(n => n.rawVersion === preferVersion || n.version.includes(preferVersion));
                if (foundIdx !== -1) {
                    defaultTargetIdx = foundIdx;
                    defaultBaseIdx = (foundIdx + 1 < this.historyNodes.length) ? (foundIdx + 1) : (foundIdx > 0 ? 0 : 0);
                }
            }

            baseSel.value = `idx_${defaultBaseIdx}`;
            targetSel.value = `idx_${defaultTargetIdx}`;

            baseSel.onchange = () => {
                this.calculateAndRenderDiff();
            };
            targetSel.onchange = () => {
                this.calculateAndRenderDiff();
            };
        },

        // 执行全局语义 Diff 计算并刷新界面
        calculateAndRenderDiff() {
            const baseSel = document.getElementById('vm-diff-base-select');
            const targetSel = document.getElementById('vm-diff-target-select');

            let baseIdx = 0;
            let targetIdx = 0;

            if (baseSel && baseSel.value && baseSel.value.startsWith('idx_')) {
                baseIdx = parseInt(baseSel.value.replace('idx_', ''), 10) || 0;
            }
            if (targetSel && targetSel.value && targetSel.value.startsWith('idx_')) {
                targetIdx = parseInt(targetSel.value.replace('idx_', ''), 10) || 0;
            }

            const baseNode = this.historyNodes[baseIdx] || this.historyNodes[0] || { data: this.currentProto };
            const targetNode = this.historyNodes[targetIdx] || this.historyNodes[0] || { data: this.currentProto };

            this.selectedBaseNode = baseNode;
            this.selectedTargetNode = targetNode;

            const baseData = baseNode.data || this.currentProto || {};
            const targetData = targetNode.data || this.currentProto || {};

            // 更新未归档横幅 (若目标是修改中工作副本)
            const unarchivedBanner = document.getElementById('vm-unarchived-banner');
            if (unarchivedBanner) {
                if (targetNode.isWorkingCopy) {
                    unarchivedBanner.style.display = 'flex';
                    const uwbBase = document.getElementById('uwb-base-ver');
                    if (uwbBase) uwbBase.textContent = baseNode.rawVersion || baseNode.version;
                } else {
                    unarchivedBanner.style.display = 'none';
                }
            }

            // 更新双栏列头
            const dchBaseName = document.getElementById('dch-base-name');
            const dchBaseMeta = document.getElementById('dch-base-meta');
            const dchTargetName = document.getElementById('dch-target-name');
            const dchTargetMeta = document.getElementById('dch-target-meta');

            if (dchBaseName) {
                dchBaseName.textContent = `[${baseNode.rawVersion || baseNode.version}] ${(baseData && baseData.name) || '基准协议'}`;
            }
            if (dchBaseMeta) {
                const baseLabel = baseNode.isWorkingCopy ? '工作副本' : (baseNode.isBaseline ? (baseNode.isArchived ? '正式生效基准' : '初始基准') : '历史归档');
                dchBaseMeta.textContent = `时间: ${this.formatTime(baseNode.timestamp)} · ${baseLabel}`;
            }

            if (dchTargetName) {
                dchTargetName.textContent = `[${targetNode.rawVersion || targetNode.version}] ${(targetData && targetData.name) || '目标协议'}`;
            }
            if (dchTargetMeta) {
                const targetLabel = targetNode.isWorkingCopy ? '当前未归档工作副本' : (targetNode.isBaseline ? (targetNode.isArchived ? '当前正式基准' : '当前初始基准') : '已归档版本');
                dchTargetMeta.textContent = `时间: ${this.formatTime(targetNode.timestamp)} · ${targetLabel}`;
            }

            // 核心判定：是否为同一版本自身对比或当前仅有单版本基准
            const isSingleVersionOrIdentical = (baseIdx === targetIdx) || (!this.historyNodes || this.historyNodes.length <= 1);
            let diffReport;
            if (isSingleVersionOrIdentical) {
                // 两侧选定同一版本或当前仅有单版本基准：深度构建 100% 纯净且完全无差异的报告对象，杜绝任何历史残留假阳性
                diffReport = DiffEngine.compareProtocols(baseData, baseData);
                diffReport.summary.totalModifiedLabels = 0;
                diffReport.summary.totalAddedLabels = 0;
                diffReport.summary.totalDeletedLabels = 0;
                diffReport.summary.totalSignalsInvolved = 0;
                diffReport.summary.totalSignalsAdded = 0;
                diffReport.summary.totalSignalsDeleted = 0;
                diffReport.summary.totalSignalsModified = 0;
                diffReport.summary.totalAttributeChanges = 0;
                diffReport.summary.breakingChangesCount = 0;
                diffReport.summary.nonBreakingChangesCount = 0;
                diffReport.summary.summarySentences = [];
                diffReport.details = [];
                diffReport.summarySentences = [];
                (diffReport.packets || []).forEach(pkt => {
                    pkt.status = 'same';
                    pkt.impact = 'none';
                    pkt.changes = [];
                    (pkt.frames || []).forEach(f => {
                        f.status = 'same';
                        f.impact = 'none';
                        f.wordChanges = [];
                        f.metrics = {
                            signalsInvolved: 0,
                            signalsAdded: 0,
                            signalsDeleted: 0,
                            signalsModified: 0,
                            signalsSame: f.signals ? f.signals.length : 0,
                            attributeChanges: 0,
                            breaking: 0,
                            nonBreaking: 0
                        };
                        (f.signals || []).forEach(s => {
                            s.status = 'same';
                            s.impact = 'none';
                            s.changedAttrCount = 0;
                            s.breakingCount = 0;
                            s.nonBreakingCount = 0;
                            s.changesList = [];
                        });
                    });
                });
            } else {
                diffReport = DiffEngine.compareProtocols(baseData, targetData);
            }
            this.currentDiffReport = diffReport;

            // 更新顶部三维指标芯片：修改了 X 个 Label · 涉及 Y 个信号 · 共 Z 项属性变更 · W 破坏性 · K 兼容
            const summary = diffReport.summary || {};
            const totalModifiedLabels = (summary.totalModifiedLabels || 0) + (summary.totalAddedLabels || 0) + (summary.totalDeletedLabels || 0);

            const elLabels = document.getElementById('vdt-metric-labels');
            const elSignals = document.getElementById('vdt-metric-signals');
            const elAttrs = document.getElementById('vdt-metric-attrs');
            const elBreaking = document.getElementById('vdt-metric-breaking');
            const elCompatible = document.getElementById('vdt-metric-compatible');

            if (elLabels) elLabels.innerHTML = `<i class="fa-solid fa-layer-group"></i> <b>${totalModifiedLabels}</b> 个 Label`;
            if (elSignals) elSignals.innerHTML = `<i class="fa-solid fa-cube"></i> <b>${summary.totalSignalsInvolved || 0}</b> 个信号`;
            if (elAttrs) elAttrs.innerHTML = `<i class="fa-solid fa-list-check"></i> <b>${summary.totalAttributeChanges || 0}</b> 项属性变更`;
            if (elBreaking) elBreaking.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <b>${summary.breakingChangesCount || 0}</b> 破坏性`;
            if (elCompatible) elCompatible.innerHTML = `<i class="fa-solid fa-shield-halved"></i> <b>${summary.nonBreakingChangesCount || 0}</b> 兼容`;

            // 渲染左侧 Label 目录
            this.renderDiffCatalog();
        },

        // 渲染左侧 Label 目录导航与状态徽章
        renderDiffCatalog() {
            const listEl = document.getElementById('vm-diff-catalog-list');
            const badgeAll = document.getElementById('diff-filter-count-all');
            const badgeChanged = document.getElementById('diff-filter-count-changed');
            if (!listEl) return;

            listEl.innerHTML = '';

            if (!this.currentDiffReport || !this.currentDiffReport.packets) {
                listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary); font-size:12px;">暂无对比数据</div>';
                return;
            }

            // 扁平提取所有 frames (保留其所在的 packet 信息)
            const allFrames = [];
            this.currentDiffReport.packets.forEach(packet => {
                (packet.frames || []).forEach(frame => {
                    allFrames.push({
                        ...frame,
                        packetName: packet.name,
                        packetType: packet.type
                    });
                });
            });

            const totalCount = allFrames.length;
            const changedCount = allFrames.filter(f => f.status !== 'same').length;

            if (badgeAll) badgeAll.textContent = String(totalCount);
            if (badgeChanged) badgeChanged.textContent = String(changedCount);

            // 过滤模式
            let filtered = allFrames;
            if (this.activeDiffFilterMode === 'changed') {
                filtered = filtered.filter(f => f.status !== 'same');
            }
            if (this.activeDiffSearch) {
                const q = this.activeDiffSearch.toLowerCase();
                filtered = filtered.filter(f => {
                    const oct = (f.label || '').toLowerCase();
                    const nm = (f.name || '').toLowerCase();
                    return oct.includes(q) || nm.includes(q);
                });
            }

            if (filtered.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center; padding:30px 10px; color:var(--text-secondary); font-size:12px;">
                        <i class="fa-solid fa-filter" style="font-size:24px; opacity:0.4; margin-bottom:8px;"></i>
                        <div>无符合条件的标号字</div>
                        <div style="font-size:11px; margin-top:4px; opacity:0.8;">${this.activeDiffFilterMode === 'changed' ? '两个版本完全一致，无任何变更' : '未搜到匹配标号字'}</div>
                    </div>
                `;
                this.renderDualDeckForLabel(null);
                return;
            }

            // 选中项判定
            let activeKey = this.activeSelectedLabelKey;
            if (!activeKey || !filtered.some(f => f.key === activeKey)) {
                // 优先选中第一个有变动的，若全无变动则选列表中第 0 个
                const firstChanged = filtered.find(f => f.status !== 'same');
                activeKey = firstChanged ? firstChanged.key : filtered[0].key;
                this.activeSelectedLabelKey = activeKey;
            }

            // 渲染各条目
            filtered.forEach(f => {
                const item = document.createElement('div');
                const isActive = (f.key === activeKey);
                item.className = `vm-diff-catalog-item ${isActive ? 'active' : ''}`;
                item.setAttribute('data-frame-key', f.key);

                // 状态徽章：无变更保持灰色，有变更红/绿
                let badgeHtml = '';
                if (f.status === 'same') {
                    badgeHtml = '<span class="vdci-badge tag-unchanged">无变更</span>';
                } else if (f.status === 'added') {
                    badgeHtml = '<span class="vdci-badge tag-added"><i class="fa-solid fa-plus"></i> 新增</span>';
                } else if (f.status === 'deleted') {
                    badgeHtml = '<span class="vdci-badge tag-deleted"><i class="fa-solid fa-minus"></i> 已删</span>';
                } else if (f.status === 'modified') {
                    const modSigCount = (f.signals || []).filter(s => s.status !== 'same').length;
                    if (f.impact === 'breaking') {
                        badgeHtml = `<span class="vdci-badge tag-breaking" title="包含位段偏移、数据类型改变或删除信号"><i class="fa-solid fa-triangle-exclamation"></i> 破坏性 ${modSigCount > 0 ? `(${modSigCount})` : ''}</span>`;
                    } else {
                        badgeHtml = `<span class="vdci-badge tag-compatible" title="兼容变更"><i class="fa-solid fa-shield-halved"></i> 兼容 ${modSigCount > 0 ? `(${modSigCount})` : ''}</span>`;
                    }
                }

                item.innerHTML = `
                    <div class="vdci-left">
                        <span class="vdci-octal">${escapeHTML(f.label || '000₈')}</span>
                        <span class="vdci-name" title="${escapeHTML(f.name || '未命名')}">${escapeHTML(f.name || '未命名')}</span>
                    </div>
                    ${badgeHtml}
                `;

                item.onclick = () => {
                    this.activeSelectedLabelKey = f.key;
                    listEl.querySelectorAll('.vm-diff-catalog-item').forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    this.renderDualDeckForLabel(f.key);
                };

                listEl.appendChild(item);
            });

            // 渲染选中的双栏对照
            this.renderDualDeckForLabel(activeKey);
        },

        // 渲染右侧选定 Label 的左右双栏对照 (左列上一版 vs 右列当前版本)
        renderDualDeckForLabel(frameKey) {
            const deckBody = document.getElementById('vm-diff-deck-body');
            if (!deckBody) return;
            deckBody.innerHTML = '';

            if (!frameKey || !this.currentDiffReport) {
                deckBody.innerHTML = `
                    <div class="diff-empty-state">
                        <i class="fa-solid fa-code-compare" style="font-size:36px; opacity:0.35;"></i>
                        <div class="des-title">请从左侧选择标号字进行对比</div>
                        <div class="des-subtitle">选择任意标号字，在此查看上一版与当前版本的左右对照、32-Bit 位域图与字段定义。</div>
                    </div>
                `;
                return;
            }

            // 找到选中的 frameDiff
            let targetFrame = null;
            let targetPacket = null;
            for (const p of (this.currentDiffReport.packets || [])) {
                for (const f of (p.frames || [])) {
                    if (f.key === frameKey) {
                        targetFrame = f;
                        targetPacket = p;
                        break;
                    }
                }
                if (targetFrame) break;
            }

            if (!targetFrame) {
                deckBody.innerHTML = `
                    <div class="diff-empty-state">
                        <i class="fa-solid fa-circle-question" style="font-size:36px; opacity:0.35;"></i>
                        <div class="des-title">未找到选定的标号字</div>
                        <div class="des-subtitle">该标号字可能在筛选条件变更后不再可见。</div>
                    </div>
                `;
                return;
            }

            const isArinc = (this.currentProto && this.currentProto.type === 'ARINC429') || (targetPacket && targetPacket.type === 'ARINC429') || true;
            const { status, impact, baseWord, targetWord, label, name, bitfield, signals, wordChanges } = targetFrame;

            // ----------------------------------------------------
            // 模块 1：标号字摘要头 (Word Header Row) - 左右双栏并排
            // ----------------------------------------------------
            const renderSingleWordCard = (word, role, cardStatus) => {
                if (!word || cardStatus === 'ghost') {
                    return `
                        <div class="diff-word-card ghost-card">
                            <span><i class="fa-solid fa-ban"></i> ${role === 'base' ? '上一版本中未定义此标号字' : '当前版本中已删除此标号字'}</span>
                        </div>
                    `;
                }

                const octal = word.label || word.labelOctal || label || '000';
                const wordName = word.name || name || '未命名标号字';
                const period = word.period || (targetPacket ? targetPacket.period : '-') || '-';
                const dir = word.direction || (targetPacket ? targetPacket.direction : 'tx') || 'tx';
                const sdi = (word.sdi !== undefined && word.sdi !== null) ? word.sdi : '-';
                const ssm = (word.ssm !== undefined && word.ssm !== null) ? word.ssm : '-';
                const parity = word.parity || '奇校验';

                // 判断卡片变更类名：无变更保持灰色
                let cardClass = 'unchanged';
                if (cardStatus === 'breaking') cardClass = 'breaking';
                else if (cardStatus === 'compatible') cardClass = 'compatible';

                return `
                    <div class="diff-word-card ${cardClass}">
                        <div class="dwc-top">
                            <div class="dwc-title-box">
                                <span class="dwc-octal">${escapeHTML(octal)}₈</span>
                                <span class="dwc-name">${escapeHTML(wordName)}</span>
                            </div>
                            <span class="dense-dir-tag ${dir === 'rx' ? 'dir-rx' : 'dir-tx'}" style="font-size:10px; padding:1px 6px;">${dir === 'rx' ? '接收' : '发送'}</span>
                        </div>
                        <div class="dwc-meta-row">
                            <span class="dwc-prop-chip"><i class="fa-regular fa-clock"></i> 周期: <b>${escapeHTML(period)}</b></span>
                            <span class="dwc-prop-chip">SDI: <b>${escapeHTML(String(sdi))}</b></span>
                            <span class="dwc-prop-chip">SSM: <b>${escapeHTML(String(ssm))}</b></span>
                            <span class="dwc-prop-chip">校验: <b>${escapeHTML(parity)}</b></span>
                            <span class="dwc-prop-chip"><i class="fa-solid fa-cube"></i> 字段: <b>${(word.fields || word.signals || []).length} 个</b></span>
                        </div>
                    </div>
                `;
            };

            const baseCardStatus = (status === 'added') ? 'ghost' : (status === 'same' ? 'unchanged' : impact);
            const targetCardStatus = (status === 'deleted') ? 'ghost' : (status === 'same' ? 'unchanged' : impact);

            const headerRowHtml = `
                <div class="diff-dual-word-header-row">
                    ${renderSingleWordCard(baseWord, 'base', baseCardStatus)}
                    ${renderSingleWordCard(targetWord, 'target', targetCardStatus)}
                </div>
            `;

            // ----------------------------------------------------
            // 模块 2：32-Bit 位域对比区域 (Dual 32-Bit Section)
            // ----------------------------------------------------
            let bitfieldHtml = '';
            if (isArinc && bitfield && bitfield.beforeBits && bitfield.afterBits) {
                const render32Grid = (bits, isTarget) => {
                    return bits.map(b => {
                        let cellClass = 'bit-unchanged';
                        let tooltip = `B${b.bit}: ${b.signalName || b.role || '未分配'}`;

                        if (b.status === 'deleted') {
                            cellClass = 'bit-breaking';
                            tooltip = `[💥 释放/删除] B${b.bit}: ${b.signalName} (破坏性)`;
                        } else if (b.status === 'added') {
                            cellClass = 'bit-compatible';
                            tooltip = `[✅ 新增占用] B${b.bit}: ${b.signalName} (兼容)`;
                        } else if (b.status === 'modified') {
                            cellClass = (b.impact === 'breaking' || b.isBreaking) ? 'bit-breaking' : 'bit-compatible';
                            tooltip = `[⚡ 偏移/变更] B${b.bit}: ${b.signalName}`;
                        } else if (b.status === 'same') {
                            cellClass = 'bit-unchanged';
                            tooltip = `[无变更] B${b.bit}: ${b.signalName || '保持一致'}`;
                        }

                        return `<div class="diff-bit-cell ${cellClass}" title="${escapeHTML(tooltip)}"><span>${b.bit}</span></div>`;
                    }).join('');
                };

                bitfieldHtml = `
                    <div class="diff-dual-32bit-section">
                        <div class="diff-dual-32bit-head">
                            <span class="diff-dual-32bit-title"><i class="fa-solid fa-microchip" style="color:var(--accent-color);"></i> 32-Bit 传输位域对照 (B1~B32)</span>
                            <div class="diff-dual-32bit-legend">
                                <span class="diff-legend-item"><span class="legend-box" style="background:#f1f5f9; border:1px solid #cbd5e1;"></span>保持一致(灰色)</span>
                                <span class="diff-legend-item"><span class="legend-box" style="background:rgba(239,68,68,0.25); border:1px solid #ef4444;"></span>破坏性变更(红色)</span>
                                <span class="diff-legend-item"><span class="legend-box" style="background:rgba(16,185,129,0.25); border:1px solid #10b981;"></span>兼容变更(绿色)</span>
                            </div>
                        </div>
                        <div class="diff-dual-32bit-grid-row">
                            <div class="diff-single-32bit-panel">
                                <div class="diff-single-32bit-subhead">
                                    <span><i class="fa-solid fa-clock-rotate-left"></i> 上一版 32-Bit 拓扑 (Base)</span>
                                    <span>B32 ➔ B1</span>
                                </div>
                                <div class="diff-single-32bit-grid">
                                    ${render32Grid(bitfield.beforeBits, false)}
                                </div>
                            </div>
                            <div class="diff-single-32bit-panel">
                                <div class="diff-single-32bit-subhead">
                                    <span><i class="fa-solid fa-bullseye"></i> 当前版本 32-Bit 拓扑 (Target)</span>
                                    <span>B32 ➔ B1</span>
                                </div>
                                <div class="diff-single-32bit-grid">
                                    ${render32Grid(bitfield.afterBits, true)}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // ----------------------------------------------------
            // 模块 3：字段工程规格逐项对照 (Dual Signals Section)
            // ----------------------------------------------------
            const renderSignalCard = (sig, isGhost, ghostText, cardStatus, attrDiffs = {}, role = 'base', sigDiff = null) => {
                if (isGhost || !sig) {
                    return `
                        <div class="diff-signal-card sig-ghost">
                            <span><i class="fa-solid fa-ban"></i> ${escapeHTML(ghostText || '无此信号')}</span>
                        </div>
                    `;
                }

                const sName = sig.name || '未命名信号';
                const sType = sig.dataType || sig.type || 'BNR';
                const sUnit = (sig.unit !== undefined && sig.unit !== null && String(sig.unit).trim() !== '') ? String(sig.unit).trim() : '-';
                const sScale = (sig.resolution !== undefined && sig.resolution !== null && sig.resolution !== '') ? sig.resolution : (sig.scale !== undefined && sig.scale !== '' ? sig.scale : 1);
                const sOffset = (sig.offset !== undefined && sig.offset !== null && sig.offset !== '') ? sig.offset : 0;
                
                // 单 bit 字段直观标识为 Bit 9 / Bit 12；多 bit 字段标识为跨度 B_start~B_end
                const sStart = parseInt(sig.startBit !== undefined && sig.startBit !== null ? sig.startBit : (sig.bitStart !== undefined ? sig.bitStart : (sig.offset !== undefined ? sig.offset : 1)), 10);
                const startVal = isNaN(sStart) ? 1 : sStart;
                const sLen = parseInt(sig.bitLength !== undefined && sig.bitLength !== null ? sig.bitLength : (sig.bitCount !== undefined ? sig.bitCount : (sig.length || sig.byteLength || 1)), 10) || 1;
                const endVal = startVal + sLen - 1;
                const sRange = isArinc
                    ? (sLen === 1 ? `Bit ${startVal}` : `B${startVal}~B${endVal}`)
                    : (sLen === 1 ? `Byte ${startVal}` : `Byte ${startVal}~${endVal}`);
                const sRemark = sig.remark || '-';

                // 卡片样式：未变更保持平静浅灰色；变更时基准端(左)为平静中性深灰，目标端(右)为红/绿级别标记
                let cardClass = 'sig-unchanged';
                let tagBadge = '<span class="diff-impact-badge" style="background:rgba(148,163,184,0.15); color:#64748b; border:1px solid rgba(148,163,184,0.25);">未变更</span>';

                if (cardStatus === 'breaking') {
                    if (role === 'base') {
                        cardClass = 'sig-base-modified';
                        tagBadge = '<span class="diff-impact-badge" style="background:rgba(100,116,139,0.12); color:#475569; border:1px solid rgba(100,116,139,0.25);"><i class="fa-solid fa-clock-rotate-left"></i> 变更前基准</span>';
                    } else {
                        cardClass = 'sig-breaking';
                        tagBadge = '<span class="diff-impact-badge breaking"><i class="fa-solid fa-triangle-exclamation"></i> 破坏性变更</span>';
                    }
                } else if (cardStatus === 'compatible') {
                    if (role === 'base') {
                        cardClass = 'sig-base-modified';
                        tagBadge = '<span class="diff-impact-badge" style="background:rgba(100,116,139,0.12); color:#475569; border:1px solid rgba(100,116,139,0.25);"><i class="fa-solid fa-clock-rotate-left"></i> 变更前基准</span>';
                    } else {
                        cardClass = 'sig-compatible';
                        tagBadge = '<span class="diff-impact-badge non_breaking"><i class="fa-solid fa-shield-halved"></i> 兼容变更</span>';
                    }
                } else if (cardStatus === 'deleted') {
                    cardClass = 'sig-breaking';
                    tagBadge = '<span class="diff-impact-badge breaking"><i class="fa-solid fa-minus"></i> 已删除信号</span>';
                } else if (cardStatus === 'added') {
                    cardClass = 'sig-compatible';
                    tagBadge = '<span class="diff-impact-badge non_breaking"><i class="fa-solid fa-plus"></i> 新增信号</span>';
                }

                // 重点内容点亮判定 (Illuminate Changed Properties)
                const isBitChanged = Boolean(
                    (attrDiffs.bitRange && attrDiffs.bitRange.changed) ||
                    (attrDiffs.startBit && attrDiffs.startBit.changed) ||
                    (attrDiffs.bitLength && attrDiffs.bitLength.changed) ||
                    (attrDiffs.bits && attrDiffs.bits.changed)
                );
                const isTypeChanged = Boolean((attrDiffs.dataType && attrDiffs.dataType.changed) || (attrDiffs.type && attrDiffs.type.changed));
                const isUnitChanged = Boolean(attrDiffs.unit && attrDiffs.unit.changed);
                const isScaleChanged = Boolean((attrDiffs.scale && attrDiffs.scale.changed) || (attrDiffs.resolution && attrDiffs.resolution.changed));
                const isOffsetChanged = Boolean(attrDiffs.offset && attrDiffs.offset.changed);
                const isNameChanged = Boolean(attrDiffs.name && attrDiffs.name.changed);

                // 信号名称渲染 (若改名则高亮对比，未改名保持纯净主文字)
                let nameHtml = `<span class="dsc-name">${escapeHTML(sName)}</span>`;
                if (isNameChanged) {
                    if (role === 'target') {
                        nameHtml = `<span class="dsc-name" style="color:var(--text-primary); font-weight:700;">${escapeHTML(sName)}</span> <span class="lit-pill-tag" style="background:#f59e0b; color:#ffffff;">名称变更</span>`;
                    } else {
                        nameHtml = `<span class="dsc-name" style="color:var(--text-secondary); text-decoration:line-through; opacity:0.75;">${escapeHTML(sName)}</span> <span class="lit-pill-tag base-tag">原名称</span>`;
                    }
                }

                // 点亮位段药丸 (左侧点亮原位，右侧点亮新位)
                let rangePillHtml = '';
                if (isBitChanged) {
                    if (role === 'target') {
                        const litCls = (cardStatus === 'compatible') ? 'compatible' : 'breaking';
                        rangePillHtml = `<span class="dsc-range-pill lit-up ${litCls}" title="变更后新起始位段"><i class="fa-solid fa-bolt"></i> ${sRange} <span class="lit-pill-tag">偏移 ➔</span></span>`;
                    } else {
                        rangePillHtml = `<span class="dsc-range-pill lit-up base-highlight" title="变更前原起始位段"><i class="fa-solid fa-clock-rotate-left"></i> ${sRange} <span class="lit-pill-tag base-tag">原位</span></span>`;
                    }
                } else {
                    rangePillHtml = `<span class="dsc-range-pill">${sRange}</span>`;
                }

                // 点亮各属性药丸 (未变更保持冷静中性灰，有变更按破坏性/兼容性/基准重点点亮发光)
                const typePillHtml = isTypeChanged
                    ? (role === 'base'
                        ? `<span class="static-pill lit-up base-highlight"><i class="fa-solid fa-cube"></i> 类型: <b>${escapeHTML(sType)}</b> <span class="lit-pill-tag base-tag">原值</span></span>`
                        : `<span class="static-pill lit-up breaking"><i class="fa-solid fa-cube"></i> 类型: <b>${escapeHTML(sType)}</b> <span class="lit-pill-tag">新值</span></span>`)
                    : `<span class="static-pill">类型: <b>${escapeHTML(sType)}</b></span>`;

                const unitPillHtml = isUnitChanged
                    ? (role === 'base'
                        ? `<span class="static-pill lit-up base-highlight"><i class="fa-solid fa-tag"></i> 单位: <b>${escapeHTML(sUnit)}</b> <span class="lit-pill-tag base-tag">原值</span></span>`
                        : `<span class="static-pill lit-up compatible"><i class="fa-solid fa-tag"></i> 单位: <b>${escapeHTML(sUnit)}</b> <span class="lit-pill-tag">新值</span></span>`)
                    : `<span class="static-pill">单位: <b>${escapeHTML(sUnit)}</b></span>`;

                const scalePillHtml = isScaleChanged
                    ? (role === 'base'
                        ? `<span class="static-pill lit-up base-highlight"><i class="fa-solid fa-calculator"></i> 比例: <b>${escapeHTML(String(sScale))}</b> <span class="lit-pill-tag base-tag">原值</span></span>`
                        : `<span class="static-pill lit-up breaking"><i class="fa-solid fa-calculator"></i> 比例: <b>${escapeHTML(String(sScale))}</b> <span class="lit-pill-tag">新值</span></span>`)
                    : `<span class="static-pill">比例: <b>${escapeHTML(String(sScale))}</b></span>`;

                const offsetPillHtml = isOffsetChanged
                    ? (role === 'base'
                        ? `<span class="static-pill lit-up base-highlight"><i class="fa-solid fa-bullseye"></i> 偏置: <b>${escapeHTML(String(sOffset))}</b> <span class="lit-pill-tag base-tag">原值</span></span>`
                        : `<span class="static-pill lit-up breaking"><i class="fa-solid fa-bullseye"></i> 偏置: <b>${escapeHTML(String(sOffset))}</b> <span class="lit-pill-tag">新值</span></span>`)
                    : `<span class="static-pill">偏置: <b>${escapeHTML(String(sOffset))}</b></span>`;

                // 重点变更条 (Delta Strip inside Card)
                let deltaStripHtml = '';
                if (sigDiff && sigDiff.changesList && sigDiff.changesList.length > 0) {
                    if (role === 'target') {
                        const items = sigDiff.changesList.map(ch => {
                            const isBrk = ch.impact === 'breaking';
                            const icon = isBrk ? 'fa-triangle-exclamation' : 'fa-circle-check';
                            return `<span class="delta-strip-item ${isBrk ? 'item-breaking' : 'item-compatible'}"><i class="fa-solid ${icon}"></i> <b>${escapeHTML(ch.prop)}:</b> ${escapeHTML(ch.before)} ➔ <span class="delta-after-val">${escapeHTML(ch.after)}</span></span>`;
                        }).join('');
                        deltaStripHtml = `<div class="dsc-delta-strip target-strip">${items}</div>`;
                    } else {
                        const items = sigDiff.changesList.map(ch => {
                            return `<span class="delta-strip-item" style="color:#475569;"><i class="fa-solid fa-clock-rotate-left"></i> <b>${escapeHTML(ch.prop)}:</b> <span class="delta-before-val">${escapeHTML(ch.before)}</span></span>`;
                        }).join('');
                        deltaStripHtml = `<div class="dsc-delta-strip base-strip">${items}</div>`;
                    }
                } else if (cardStatus === 'added' && role === 'target') {
                    deltaStripHtml = '<div class="dsc-delta-strip added-strip"><i class="fa-solid fa-plus-circle"></i> <b>新增信号:</b> 首次在当前版本中定义此物理量/状态</div>';
                } else if (cardStatus === 'deleted' && role === 'base') {
                    deltaStripHtml = '<div class="dsc-delta-strip deleted-strip"><i class="fa-solid fa-minus-circle"></i> <b>已删除信号:</b> 在当前版本中此信号已被移除释放</div>';
                }

                return `
                    <div class="diff-signal-card ${cardClass}">
                        <div class="dflc-sc-header">
                            <div class="dflc-sc-title">
                                ${nameHtml}
                                ${rangePillHtml}
                            </div>
                            ${tagBadge}
                        </div>
                        ${deltaStripHtml}
                        <div class="dflc-static-row" style="margin-top:2px;">
                            ${typePillHtml}
                            ${unitPillHtml}
                            ${scalePillHtml}
                            ${offsetPillHtml}
                            ${sRemark !== '-' ? `<span class="static-pill">说明: <b>${escapeHTML(sRemark)}</b></span>` : ''}
                        </div>
                    </div>
                `;
            };

            let signalsRowsHtml = '';
            const sigDiffList = signals || [];

            if (sigDiffList.length === 0) {
                signalsRowsHtml = '<div style="text-align:center; padding:18px; color:var(--text-secondary); font-size:12px;">该标号字未定义任何信号</div>';
            } else {
                signalsRowsHtml = sigDiffList.map(sd => {
                    const sBase = sd.baseSignal;
                    const sTarget = sd.targetSignal;
                    const attrDiffs = sd.attributes || {};

                    let leftHtml = '';
                    let rightHtml = '';

                    if (sd.status === 'same') {
                        // 两版完全一致：左右均保持平静灰色
                        leftHtml = renderSignalCard(sBase, false, '', 'unchanged', attrDiffs, 'base', sd);
                        rightHtml = renderSignalCard(sTarget, false, '', 'unchanged', attrDiffs, 'target', sd);
                    } else if (sd.status === 'deleted') {
                        // 左版有，右版已删除
                        leftHtml = renderSignalCard(sBase, false, '', 'deleted', attrDiffs, 'base', sd);
                        rightHtml = renderSignalCard(null, true, '当前版本中已删除此信号', 'deleted', attrDiffs, 'target', sd);
                    } else if (sd.status === 'added') {
                        // 左版无，右版新增
                        leftHtml = renderSignalCard(null, true, '上一版本中未定义此信号', 'added', attrDiffs, 'base', sd);
                        rightHtml = renderSignalCard(sTarget, false, '', 'added', attrDiffs, 'target', sd);
                    } else {
                        // 发生变更 (破坏性 vs 兼容)
                        const cardStatus = (sd.impact === 'breaking') ? 'breaking' : 'compatible';
                        leftHtml = renderSignalCard(sBase, false, '', cardStatus, attrDiffs, 'base', sd);
                        rightHtml = renderSignalCard(sTarget, false, '', cardStatus, attrDiffs, 'target', sd);
                    }

                    return `
                        <div class="diff-signal-pair-row">
                            ${leftHtml}
                            ${rightHtml}
                        </div>
                    `;
                }).join('');
            }

            const signalsSectionHtml = `
                <div class="diff-dual-signals-section">
                    <div class="diff-signals-head">
                        <span><i class="fa-solid fa-table-list" style="color:var(--accent-color);"></i> 字段工程规格定义对照 (${sigDiffList.length} 处字段)</span>
                        <span style="font-size:11px; font-weight:normal; color:var(--text-secondary);">成对逐行对照 · 无变更项保持灰色 · 变更项根据级别着色</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${signalsRowsHtml}
                    </div>
                </div>
            `;

            // 组装到主区域
            deckBody.innerHTML = `
                ${headerRowHtml}
                ${bitfieldHtml}
                ${signalsSectionHtml}
            `;
        },

        // 渲染 Git 风格时间轴 (Timeline) - 在弹窗中展示
        renderTimeline() {
            const container = document.getElementById('vm-timeline-container');
            const countBadge = document.getElementById('vm-history-count');
            if (!container) return;

            container.innerHTML = '';
            if (countBadge) {
                countBadge.textContent = `共 ${this.historyNodes.length} 个版本`;
            }

            if (!this.historyNodes || this.historyNodes.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:2rem 1rem; color:var(--text-secondary); font-size:12px;">暂无版本历程</div>';
                return;
            }

            this.historyNodes.forEach((node, idx) => {
                const item = document.createElement('div');
                item.className = `vm-commit-node ${node.isWorkingCopy ? 'is-working-copy' : ''} ${node.isBaseline ? 'is-current-baseline' : ''}`;

                let pointIcon = '<i class="fa-solid fa-code-commit"></i>';
                if (node.isWorkingCopy) pointIcon = '<i class="fa-solid fa-pen-nib"></i>';
                else if (node.isBaseline) pointIcon = '<i class="fa-solid fa-check"></i>';
                else if (node.isArchived) pointIcon = '<i class="fa-solid fa-box-archive"></i>';

                let tagHtml = '';
                if (node.isWorkingCopy) {
                    tagHtml = '<span class="vm-tag-status vm-tag-working">工作副本</span>';
                } else if (node.isBaseline) {
                    tagHtml = '<span class="vm-tag-status vm-tag-baseline">正式生效</span>';
                } else {
                    tagHtml = '<span class="vm-tag-status vm-tag-archived">已归档</span>';
                }

                let diffStat = '初始基线';
                if (node.diffCount > 0) {
                    diffStat = `${node.modifiedLabels || 0} 帧 · ${node.involvedSignals || 0} 信号 (${node.attrChanges || 0} 项变更)`;
                }

                item.innerHTML = `
                    <div class="vm-node-point" title="${node.isWorkingCopy ? '当前编辑中工作副本' : '历史归档版本'}">
                        ${pointIcon}
                    </div>
                    <div class="vm-node-card">
                        <div class="vm-nc-top">
                            <div class="vm-nc-ver-badge">
                                <span class="proto-version-pill ${node.isWorkingCopy ? 'is-modified' : ''}">${escapeHTML(node.rawVersion || node.version)}</span>
                                ${tagHtml}
                            </div>
                            <span class="vm-nc-time">${this.formatTime(node.timestamp)}</span>
                        </div>
                        <div class="vm-nc-msg" title="${escapeHTML(node.comment)}">
                            ${escapeHTML(node.comment)}
                        </div>
                        <div class="vm-nc-meta">
                            <span class="vm-nc-author"><i class="fa-regular fa-user"></i> ${escapeHTML(node.author || '工程师')}</span>
                            <span class="vm-nc-diff-stat">${diffStat}</span>
                        </div>
                        <div style="display:flex; gap:6px; margin-top:6px; justify-content:flex-end;">
                            <button type="button" class="btn btn-xs btn-secondary btn-select-as-base" title="将此版本设置为对比基准"><i class="fa-solid fa-arrows-left-right"></i> 作为基准对比</button>
                            ${!node.isWorkingCopy ? `<button type="button" class="btn btn-xs btn-danger-outline btn-revert-node" title="将协议回滚到此历史版本"><i class="fa-solid fa-rotate-left"></i> 回滚到此版</button>` : ''}
                        </div>
                    </div>
                `;

                // 绑定“作为基准对比”
                const btnBase = item.querySelector('.btn-select-as-base');
                if (btnBase) {
                    btnBase.onclick = (e) => {
                        e.stopPropagation();
                        const baseSel = document.getElementById('vm-diff-base-select');
                        if (baseSel) {
                            baseSel.value = `idx_${idx}`;
                            this.calculateAndRenderDiff();
                        }
                        const modal = document.getElementById('protocol-timeline-modal');
                        if (modal) modal.style.display = 'none';
                        showToast(`已选择 [${node.rawVersion || node.version}] 作为对比基准`, 'info');
                    };
                }

                // 绑定“回滚到此版”
                const btnRevert = item.querySelector('.btn-revert-node');
                if (btnRevert) {
                    btnRevert.onclick = (e) => {
                        e.stopPropagation();
                        this.revertToNode(node);
                    };
                }

                container.appendChild(item);
            });
        },

        // 回滚到指定的版本节点
        async revertToNode(node) {
            if (!node || !node.data) {
                alert('无法还原：该历史快照数据丢失或损坏。');
                return;
            }

            const verStr = node.rawVersion || node.version;
            const confirmed = confirm(`【高危操作提示】\n确定要将协议一键还原回历史归档版本 [${verStr}] 吗？\n当前编辑工作区的改动将被覆盖并重置。`);
            if (!confirmed) return;

            const proto = this.currentProto;
            const restored = JSON.parse(JSON.stringify(node.data));

            const id = proto.id;
            const archivedVersions = proto.archivedVersions;
            const cloudKey = proto._cloudKey;

            Object.assign(proto, restored);
            proto.id = id;
            proto.archivedVersions = archivedVersions;
            if (cloudKey) proto._cloudKey = cloudKey;
            proto.version = verStr;
            proto.lastArchivedVersion = verStr;
            proto.isArchived = true;
            proto.hasUnarchivedChanges = false;
            proto.lifecycleStatus = 'released';
            proto._cloudUpdated = Date.now();

            if (ProtoView.DraftManager && typeof ProtoView.DraftManager.clearDraft === 'function') {
                ProtoView.DraftManager.clearDraft(proto);
            }

            await ArchiveManager.persistProtocol(proto);
            showToast(`已成功还原到历史版本 [${verStr}]！`, 'success');

            const modal = document.getElementById('protocol-timeline-modal');
            if (modal) modal.style.display = 'none';

            ArchiveManager.refreshActiveViews(proto);
            this.loadProtocol(proto, verStr);
        },

        // 初始化左右分栏手柄拖动 (调宽目录)
        initResizer() {
            const resizer = document.getElementById('vm-diff-catalog-resizer');
            const panel = document.getElementById('vm-diff-catalog-panel');
            if (!resizer || !panel || resizer._initialized) return;
            resizer._initialized = true;

            let isDragging = false;
            let startX = 0;
            let startWidth = 0;

            resizer.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startWidth = panel.getBoundingClientRect().width;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                resizer.classList.add('resizing');
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const newWidth = Math.max(220, Math.min(480, startWidth + (e.clientX - startX)));
                panel.style.width = `${newWidth}px`;
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    resizer.classList.remove('resizing');
                }
            });
        }
    };

    // ========================================================
    // 5. 全局挂载与公开方法暴露
    // ========================================================
    ProtoView.ArchiveManager = ArchiveManager;
    ProtoView.VersionManager = VersionManager; // 升级为全新版本管理引擎
    if (ProtoView.VersionManager) {
        ProtoView.VersionManager.ensureProtocolVersion = ArchiveManager.ensureProtocolVersion.bind(ArchiveManager);
    }
    ProtoView.DiffEngine = DiffEngine;

    // 打开通信协议版本管理中心 (一级主视图核心主入口)
    global.openProtocolVersionView = function(protoIdOrProto, targetVersion = null) {
        VersionManager.openView(protoIdOrProto, targetVersion);
    };

    // 打开通信协议版本管理中心 (向后完全兼容旧方法名)
    global.openProtocolVersionModal = function(protoIdOrProto, targetVersion = null) {
        VersionManager.openView(protoIdOrProto, targetVersion);
    };

    // 协议版本对比全面升级映射至版本管理中心 (向后 100% 兼容)
    global.openProtocolDiffModal = function(targetProtoA = null, targetProtoB = null) {
        VersionManager.openView(targetProtoA, targetProtoB);
    };

    global.handleProtocolArchive = function(proto) {
        ArchiveManager.handleArchiveClick(proto);
    };
    global.revertProtocolToArchived = function(proto) {
        ArchiveManager.revertToArchived(proto);
    };
    global.compareProtocolWithArchived = function(proto) {
        VersionManager.openModal(proto);
    };
    global.openProtocolArchiveModal = openProtocolArchiveModal;

    // 向后兼容旧方法名
    global.openProtocolSnapshotModal = function(proto) {
        ArchiveManager.handleArchiveClick(proto);
    };

})(window);
