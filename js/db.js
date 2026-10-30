/**
 * db.js - 协议数据库助手
 * 具有全自动化 Dexie (IndexedDB) 与 LocalStorage 双引擎容灾保障
 * 在无网络、CDN 阻塞或 Dexie 不可用时自动降级为 LocalStorage，确保 100% 离线与本地可用
 */

// LocalStorage 键名配置
const LS_KEY_PROTOCOLS = 'protoview_protocols_data';
const LS_KEY_ID = 'protoview_protocols_next_id';
const LS_KEY_PRODUCTS = 'protoview_products_data';

let useDexie = false;
let db = null;

// 尝试初始化 Dexie (如果库存在)
try {
    if (typeof Dexie !== 'undefined') {
        db = new Dexie("ProtoViewDB");
        db.version(1).stores({
            protocols: '++id, name, type'
        });
        db.version(2).stores({
            protocols: '++id, name, type, product',
            products: '++id, &name'
        });
        useDexie = true;
        console.log("ProtoView: 已启用 Dexie (IndexedDB) 数据库引擎");
    } else {
        console.warn("ProtoView: 未检测到 Dexie.js，自动无缝切换到 LocalStorage 存储引擎");
    }
} catch (e) {
    console.warn("ProtoView: Dexie 初始化失败，自动降级为 LocalStorage:", e);
    useDexie = false;
}

// LocalStorage 辅助读写函数
function getLSProtocols() {
    try {
        const raw = localStorage.getItem(LS_KEY_PROTOCOLS);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("读取 LocalStorage 协议数据失败:", e);
        return [];
    }
}

function saveLSProtocols(list) {
    try {
        localStorage.setItem(LS_KEY_PROTOCOLS, JSON.stringify(list));
    } catch (e) {
        console.error("写入 LocalStorage 协议数据失败:", e);
    }
}

function getLSProducts() {
    try {
        const raw = localStorage.getItem(LS_KEY_PRODUCTS);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveLSProducts(list) {
    try {
        localStorage.setItem(LS_KEY_PRODUCTS, JSON.stringify(list));
    } catch (e) {}
}

function getNextLSId() {
    let nextId = parseInt(localStorage.getItem(LS_KEY_ID) || '1', 10);
    localStorage.setItem(LS_KEY_ID, (nextId + 1).toString());
    return nextId;
}

// 提供全局统一数据库接口
const dbHelper = {
    // 获取所有协议
    async getAllProtocols() {
        if (useDexie && db) {
            try {
                return await db.protocols.toArray();
            } catch (e) {
                console.warn("Dexie 查询协议失败，尝试 LocalStorage 回退:", e);
            }
        }
        return getLSProtocols();
    },

    // 根据 ID 获取协议
    async getProtocol(id) {
        const numId = Number(id);
        if (useDexie && db) {
            try {
                const res = await db.protocols.get(numId);
                if (res) return res;
            } catch (e) {
                console.warn("Dexie 根据ID查询失败:", e);
            }
        }
        const list = getLSProtocols();
        return list.find(p => p.id === numId) || null;
    },

    // 保存协议 (新建或更新)
    async saveProtocol(protocolData) {
        const data = JSON.parse(JSON.stringify(protocolData)); // 深拷贝解除外部引用
        if (useDexie && db) {
            try {
                if (data.id) {
                    data.id = Number(data.id);
                    await db.protocols.put(data);
                    return data.id;
                } else {
                    const newId = await db.protocols.add(data);
                    return Number(newId);
                }
            } catch (e) {
                console.warn("Dexie 保存失败，使用 LocalStorage 保存:", e);
            }
        }

        // LocalStorage 保存分支
        const list = getLSProtocols();
        if (data.id) {
            data.id = Number(data.id);
            const idx = list.findIndex(p => p.id === data.id);
            if (idx >= 0) {
                list[idx] = data;
            } else {
                list.push(data);
            }
            saveLSProtocols(list);
            return data.id;
        } else {
            data.id = getNextLSId();
            list.push(data);
            saveLSProtocols(list);
            return data.id;
        }
    },

    // 删除协议
    async deleteProtocol(id) {
        const numId = Number(id);
        if (useDexie && db) {
            try {
                await db.protocols.delete(numId);
                return;
            } catch (e) {
                console.warn("Dexie 删除协议失败:", e);
            }
        }
        let list = getLSProtocols();
        list = list.filter(p => p.id !== numId);
        saveLSProtocols(list);
    },

    // ---------------------- 产品管理接口 ----------------------
    // 获取所有独立产品清单
    async getAllProducts() {
        if (useDexie && db && db.products) {
            try {
                return await db.products.toArray();
            } catch(e) {
                console.warn("Dexie 读取产品列表失败:", e);
            }
        }
        return getLSProducts();
    },

    // 保存产品 (新建或更新)
    async saveProduct(product) {
        if (!product || !product.name) return;
        const name = product.name.trim();
        const item = {
            name: name,
            code: (product.code || '').trim(),
            desc: (product.desc || '').trim(),
            updateTime: Date.now()
        };

        if (useDexie && db && db.products) {
            try {
                const existing = await db.products.where('name').equals(name).first();
                if (existing) {
                    item.id = existing.id;
                    await db.products.put(item);
                } else {
                    await db.products.add(item);
                }
            } catch(e) {
                console.warn("Dexie 保存产品异常:", e);
            }
        }

        const list = getLSProducts();
        const idx = list.findIndex(p => p.name === name);
        if (idx >= 0) {
            list[idx] = { ...list[idx], ...item };
        } else {
            list.push(item);
        }
        saveLSProducts(list);
        return item;
    },

    // 删除产品
    async deleteProduct(name) {
        if (!name) return;
        const cleanName = name.trim();
        if (useDexie && db && db.products) {
            try {
                await db.products.where('name').equals(cleanName).delete();
            } catch(e) {
                console.warn("Dexie 删除产品异常:", e);
            }
        }
        let list = getLSProducts();
        list = list.filter(p => p.name !== cleanName);
        saveLSProducts(list);
    },

    // 重命名产品并级联更新名下所有协议
    async renameProduct(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        const cleanOld = oldName.trim();
        const cleanNew = newName.trim();

        // 1. 更新产品表
        if (useDexie && db && db.products) {
            try {
                const existing = await db.products.where('name').equals(cleanOld).first();
                if (existing) {
                    await db.products.delete(existing.id);
                    existing.name = cleanNew;
                    delete existing.id;
                    await db.products.add(existing);
                }
            } catch(e) {}
        }
        const prodList = getLSProducts();
        const pIdx = prodList.findIndex(p => p.name === cleanOld);
        if (pIdx >= 0) {
            prodList[pIdx].name = cleanNew;
            saveLSProducts(prodList);
        }

        // 2. 级联更新所有属于该产品的协议
        const allProtos = await this.getAllProtocols();
        for (const proto of allProtos) {
            if ((proto.product || '').trim() === cleanOld) {
                proto.product = cleanNew;
                await this.saveProtocol(proto);
            }
        }
    },

    // 检查并清理历史内置演示模板 (用户要求纯净工作台)
    async initDemoData() {
        try {
            const list = await this.getAllProtocols();
            if (list && list.length > 0) {
                for (const p of list) {
                    if (p.name && (p.name.includes("演示：BMS") || p.name.includes("民航客机 ADC") || p.id === 'tpl_adc')) {
                        console.log(`ProtoView: 清理历史内置演示模板 [${p.name}]...`);
                        await this.deleteProtocol(p.id);
                    }
                }
            }
        } catch (err) {
            console.warn("ProtoView: initDemoData 清理异常:", err);
        }
    }
};

// 挂载到全局
window.dbHelper = dbHelper;
