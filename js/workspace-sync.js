/**
 * @file workspace-sync.js
 * @brief ProtoView 云端原生存储与多端同步服务 (Cloudflare R2 + KV 驱动)
 * @author DeepMind Pair Programming
 */
(function(global) {
    'use strict';

    const ProtoView = global.ProtoView || {};

    // ----------------- 通用 Cloudflare API 请求封装 -----------------
    async function cloudApiCall(endpoint, method = 'GET', data = null) {
        const token = localStorage.getItem('protoview_auth_token') || '';
        const wsToken = localStorage.getItem('protoview_cloud_token') || '';
        const currentUserRaw = localStorage.getItem('protoview_auth_user');
        let username = '';
        try {
            if (currentUserRaw) {
                const u = JSON.parse(currentUserRaw);
                username = u ? u.username : '';
            }
        } catch(e) {}

        const headers = {
            'Content-Type': 'application/json;charset=utf-8'
        };
        if (token) headers['x-auth-token'] = token;
        if (wsToken) headers['x-workspace-token'] = wsToken;
        if (username) headers['x-workspace-id'] = username;

        const options = {
            method: method,
            headers: headers
        };
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const res = await fetch(endpoint, options);
            const json = await res.json().catch(() => null);
            return {
                ok: res.ok,
                status: res.status,
                data: json
            };
        } catch (e) {
            return {
                ok: false,
                status: 0,
                error: e.message
            };
        }
    }

    // ----------------- 云端协议与产品全量同步与刷新 -----------------
    async function syncCloudProtocols(notifyUser = false) {
        const token = localStorage.getItem('protoview_auth_token') || '';
        if (!token) {
            if (notifyUser) {
                alert('请先登录账号后再同步云端数据。');
            }
            return false;
        }

        // 核心隔离：首先清空本地缓存，保证新注册账号或切换账号后绝对无历史残留
        if (window.dbHelper) {
            await window.dbHelper.clearAllProtocols();
            await window.dbHelper.clearAllProducts();
        }

        let loadedCount = 0;
        let prodCount = 0;
        const errors = [];

        // 1. 独立同步云端保存的产品型号列表 (确保仅新建产品、没有协议时，产品数据绝不丢失)
        try {
            const prodRes = await cloudApiCall('/api/products', 'GET');
            if (prodRes.ok && prodRes.data && Array.isArray(prodRes.data.products)) {
                if (window.dbHelper) {
                    for (const p of prodRes.data.products) {
                        await window.dbHelper.saveProduct(p);
                        prodCount++;
                    }
                }
            } else if (!prodRes.ok) {
                errors.push(`产品同步异常: ${prodRes.data?.error || prodRes.error || `HTTP ${prodRes.status}`}`);
            }
        } catch (e) {
            errors.push(`产品同步异常: ${e.message}`);
        }

        // 2. 独立同步云端通信协议列表
        try {
            const res = await cloudApiCall('/api/protocols', 'GET');
            if (res.ok && res.data && res.data.success) {
                const list = res.data.protocols || [];
                if (window.dbHelper && list.length > 0) {
                    for (const item of list) {
                        if (item._cloudKey) {
                            const detailRes = await cloudApiCall(`/api/protocols?key=${encodeURIComponent(item._cloudKey)}`, 'GET');
                            if (detailRes.ok && detailRes.data) {
                                let proto = detailRes.data;
                                if (typeof proto === 'string') {
                                    try { proto = JSON.parse(proto); } catch(e) {}
                                }
                                if (proto && typeof proto === 'object') {
                                    proto._fromCloud = true;
                                    proto._cloudKey = item._cloudKey;
                                    if (!proto.name) proto.name = item.name || '未命名协议';
                                    if (!proto.type) proto.type = item.type || 'ARINC429';

                                    if (proto.product) {
                                        const existingP = await window.dbHelper.getProduct(proto.product);
                                        if (!existingP) {
                                            await window.dbHelper.saveProduct({ name: proto.product });
                                        }
                                    }
                                    await window.dbHelper.saveProtocol(proto);
                                    loadedCount++;
                                }
                            }
                        }
                    }
                }
            } else if (!res.ok) {
                errors.push(`协议同步异常: ${res.data?.error || res.error || `HTTP ${res.status}`}`);
            }
        } catch (e) {
            errors.push(`协议同步异常: ${e.message}`);
        }

        // 3. 无论拉取到多少，强制刷新界面
        if (window.refreshProductDatalist) await window.refreshProductDatalist();
        if (window.loadProtocols) await window.loadProtocols();
        if (window.loadArincProtocolsForSelect) await window.loadArincProtocolsForSelect();
        if (window.loadProtocolsForSelect) await window.loadProtocolsForSelect();

        if (notifyUser) {
            if (errors.length > 0 && prodCount === 0 && loadedCount === 0) {
                alert(`云端数据同步失败：\n${errors.join('\n')}\n\n请在管理员后台检查 Cloudflare 数据库/存储桶连接。`);
            } else if (loadedCount === 0 && prodCount === 0) {
                alert('云端同步完成：当前账号下暂无保存的产品型号与通信协议，已呈现纯净空白工作台。');
            } else {
                alert(`云端同步成功！已从 Cloudflare 云端拉取 ${prodCount} 个产品型号与 ${loadedCount} 份通信协议。数据已安全同步至当前设备。`);
            }
        }

        return errors.length === 0;
    }

    // ----------------- 保存协议至云端 (支持 R2 / D1 / KV 三引擎容灾) -----------------
    async function saveProtocolToWorkspaceAndCloud(proto) {
        if (!proto) return { ok: false, error: '协议对象为空' };
        try {
            const cloudRes = await cloudApiCall('/api/protocols', 'POST', proto);
            if (cloudRes.ok && cloudRes.data && cloudRes.data.success) {
                proto._cloudKey = cloudRes.data.key;
                proto._fromCloud = true;
                if (proto.id && window.dbHelper) {
                    await window.dbHelper.saveProtocol(proto);
                }
                return { ok: true, data: cloudRes.data };
            } else {
                const errMsg = cloudRes.data?.error || cloudRes.error || `HTTP ${cloudRes.status}`;
                console.error('保存至云端接口响应异常:', errMsg);
                return { ok: false, error: errMsg };
            }
        } catch (cloudErr) {
            console.error('ProtoView: 同步保存至云端失败:', cloudErr);
            return { ok: false, error: cloudErr.message };
        }
    }

    // ----------------- 从云端彻底删除物理协议 -----------------
    async function deleteProtocolFile(proto) {
        if (!proto) return { ok: false };
        const key = proto._cloudKey || (proto.key ? proto.key : null);
        if (key) {
            try {
                await cloudApiCall(`/api/protocols?key=${encodeURIComponent(key)}`, 'DELETE');
            } catch (cloudErr) {
                console.warn('ProtoView: 从云端删除协议失败:', cloudErr);
            }
        }
        if (proto.id && window.dbHelper) {
            await window.dbHelper.deleteProtocol(proto.id);
        }
        return { ok: true };
    }

    // ----------------- 同步全量产品型号到云端 (支持独立保存空产品) -----------------
    async function syncProductsToCloud() {
        if (!window.dbHelper) return { ok: false, error: '本地存储不可用' };
        try {
            const products = await window.dbHelper.getAllProducts();
            const res = await cloudApiCall('/api/products', 'POST', { products: products || [] });
            if (res.ok && res.data && res.data.success) {
                return { ok: true, data: res.data };
            } else {
                const errMsg = res.data?.error || res.error || `HTTP ${res.status}`;
                console.error('ProtoView: 同步产品型号到云端异常:', errMsg);
                return { ok: false, error: errMsg };
            }
        } catch (e) {
            console.error('ProtoView: 同步产品型号到云端异常:', e);
            return { ok: false, error: e.message };
        }
    }

    // ----------------- 从云端删除产品型号 -----------------
    async function deleteProductFromCloud(productName) {
        if (!productName) return;
        try {
            await cloudApiCall(`/api/products?name=${encodeURIComponent(productName)}`, 'DELETE');
        } catch (e) {
            console.warn('ProtoView: 从云端删除产品异常:', e);
        }
    }

    // ----------------- 初始化引导服务 -----------------
    async function initWorkspaceSync() {
        const btnCloudRefresh = document.getElementById('btn-cloud-refresh');
        if (btnCloudRefresh) {
            btnCloudRefresh.addEventListener('click', () => syncCloudProtocols(true));
        }

        // 若用户已处于登录状态，自动拉取当前账号在云端的协议
        const token = localStorage.getItem('protoview_auth_token') || '';
        if (token) {
            await syncCloudProtocols(false);
        }
    }

    // 组装并导出 WorkspaceSync 服务 (保持向后兼容)
    const WorkspaceSync = {
        init: initWorkspaceSync,
        getActiveMode: () => 'cloud',
        getWorkspaceMode: () => 'cloud',
        setWorkspaceMode: () => 'cloud',
        getCurrentHandle: () => null,
        getWorkspaceHandle: () => null,
        cloudApiCall,
        syncCloudProtocols,
        saveProtocolToWorkspaceAndCloud,
        saveProtocolToCloud: saveProtocolToWorkspaceAndCloud,
        deleteProtocolFile,
        deleteProtocolFromCloud: deleteProtocolFile,
        syncProductsToCloud,
        deleteProductFromCloud
    };

    ProtoView.WorkspaceSync = WorkspaceSync;
    global.ProtoView = ProtoView;

    // 向后兼容全局挂载
    global.cloudApiCall = cloudApiCall;
    global.syncCloudProtocols = syncCloudProtocols;
    global.saveProtocolToWorkspaceAndCloud = saveProtocolToWorkspaceAndCloud;

})(typeof window !== 'undefined' ? window : this);
