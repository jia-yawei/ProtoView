/**
 * Cloudflare Pages Functions - ProtoView 产品型号与设备型号云端存储网关
 * 
 * 路由: /api/products
 * 存储引擎 (自动探测与三重冗余容灾):
 *   - 引擎 1 (主选): Cloudflare R2 对象存储 (PROTO_BUCKET / R2 / BUCKET 等)
 *   - 引擎 2 (主选/全自动回退): Cloudflare D1 关系数据库 (DB / D1)，无 R2 桶时依然 100% 自动持久化
 *   - 引擎 3 (边缘缓存容灾): Cloudflare KV (PROTOVIEW_KV / KV)
 * 功能:
 *   - 支持用户只创建产品/设备型号（无通信协议）时，依然完整同步并持久化到云端
 *   - 完整保留产品代号 (code)、全称 (name)、软件配置项 (softwareItems/CSCI) 及研制说明 (desc)
 *   - 物理多用户隔离：按当前登录账号专属存储 ws:{username}:meta:products / user_products 表
 */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-auth-token, x-workspace-token, x-workspace-id",
        "Content-Type": "application/json;charset=utf-8"
    };
}

// 自动探测 Cloudflare 环境中的 R2 存储桶、D1 数据库与 KV 命名空间
function getBindings(env) {
    if (!env) return { bucket: null, db: null, kv: null };

    let bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2 || env.R2 || env.BUCKET || env.R2_BUCKET || env.PROTO_R2 || env.PROTOVIEW_BUCKET || env.STORAGE || null;
    let db = env.DB || env.PROTOVIEW_DB || env.D1 || env.DATABASE || null;
    let kv = env.PROTOVIEW_KV || env.KV || null;

    if (!bucket || !db || !kv) {
        for (const k of Object.keys(env)) {
            const v = env[k];
            if (!v || typeof v !== 'object') continue;
            if (!bucket && typeof v.put === 'function' && typeof v.get === 'function' && typeof v.list === 'function' && typeof v.prepare !== 'function') {
                bucket = v;
            }
            if (!db && typeof v.prepare === 'function' && typeof v.batch === 'function') {
                db = v;
            }
            if (!kv && typeof v.get === 'function' && typeof v.put === 'function' && typeof v.list === 'function' && typeof v.prepare !== 'function') {
                if (v !== bucket) kv = v;
            }
        }
    }

    return { bucket, db, kv };
}

// 确保 D1 数据库具有 user_products 表
let d1ProductsTableReady = false;
async function ensureD1ProductsTable(db) {
    if (d1ProductsTableReady || !db) return;
    try {
        await db.prepare("CREATE TABLE IF NOT EXISTS user_products (username TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
        d1ProductsTableReady = true;
    } catch (e) {
        console.warn("D1 user_products 表初始化提示:", e.message);
    }
}

// 验证会话 Token 并解析出登录用户 (支持 D1 和 KV 双引擎鉴权)
async function getAuthenticatedUser(request, env) {
    const token = request.headers.get("x-auth-token") ||
                  (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                  new URL(request.url).searchParams.get("authToken");
    if (!token) return null;

    const { db, kv } = getBindings(env);

    if (db) {
        try {
            const now = Date.now();
            let row = await db.prepare("SELECT s.username, u.created_at FROM sessions s JOIN users u ON s.username = u.username WHERE s.token = ? AND s.expires_at > ?").bind(token, now).first();
            if (!row) {
                row = await db.prepare("SELECT username FROM sessions WHERE token = ? AND expires_at > ?").bind(token, now).first();
            }
            if (row && row.username) {
                return {
                    username: row.username,
                    createdAt: row.created_at || now
                };
            }
        } catch (e) {
            console.warn("D1 鉴权查询异常:", e.message);
        }
    }

    if (kv) {
        try {
            const session = await kv.get("session:" + token, "json");
            return session || null;
        } catch (e) {
            return null;
        }
    }

    return null;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders()
    });
}

// GET: 获取当前用户的所有产品型号列表
export async function onRequestGet(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const { bucket, db, kv } = getBindings(env);

    if (!bucket && !db && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare 存储服务 (D1 / R2 / KV) 尚未绑定。"
        }), { status: 503, headers });
    }

    if (db) {
        await ensureD1ProductsTable(db);
    }

    const authUser = await getAuthenticatedUser(request, env);
    const url = new URL(request.url);

    let workspace = "";
    if (authUser && authUser.username) {
        workspace = authUser.username.toLowerCase();
    } else {
        workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "").trim().toLowerCase();
        if (!workspace) {
            return new Response(JSON.stringify({ success: false, error: "请先登录账号后再读取云端产品列表" }), {
                status: 401,
                headers
            });
        }
    }

    const key = `ws:${workspace}:meta:products`;

    // 1. 优先从 R2 获取
    if (bucket) {
        try {
            const obj = await bucket.get(key);
            if (obj) {
                const text = await obj.text();
                const products = JSON.parse(text || "[]");
                return new Response(JSON.stringify({
                    success: true,
                    workspace: workspace,
                    storageEngine: "R2",
                    products: products
                }), { status: 200, headers });
            }
        } catch (e) {
            console.warn("R2 获取产品列表异常:", e.message);
        }
    }

    // 2. 从 D1 获取
    if (db) {
        try {
            const row = await db.prepare("SELECT data FROM user_products WHERE username = ?").bind(workspace).first();
            if (row && row.data) {
                const products = JSON.parse(row.data || "[]");
                return new Response(JSON.stringify({
                    success: true,
                    workspace: workspace,
                    storageEngine: "D1",
                    products: products
                }), { status: 200, headers });
            }
        } catch (e) {
            console.warn("D1 获取产品列表异常:", e.message);
        }
    }

    // 3. 回退从 KV 获取
    if (kv) {
        try {
            const data = await kv.get(key, "json");
            if (data) {
                return new Response(JSON.stringify({
                    success: true,
                    workspace: workspace,
                    storageEngine: "KV",
                    products: data || []
                }), { status: 200, headers });
            }
        } catch (e) {}
    }

    // 4. 若云端尚无产品数据，返回空列表
    return new Response(JSON.stringify({
        success: true,
        workspace: workspace,
        storageEngine: "none",
        products: []
    }), { status: 200, headers });
}

// POST: 保存/批量同步产品型号到云端
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const { bucket, db, kv } = getBindings(env);

    if (!bucket && !db && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare 存储服务 (D1 / R2 / KV) 尚未绑定。"
        }), { status: 503, headers });
    }

    if (db) {
        await ensureD1ProductsTable(db);
    }

    const authUser = await getAuthenticatedUser(request, env);
    const url = new URL(request.url);

    let workspace = "";
    if (authUser && authUser.username) {
        workspace = authUser.username.toLowerCase();
    } else {
        workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "").trim().toLowerCase();
        if (!workspace) {
            return new Response(JSON.stringify({ success: false, error: "请先登录账号后再保存产品信息到云端" }), {
                status: 401,
                headers
            });
        }
    }

    try {
        const body = await request.json();
        const key = `ws:${workspace}:meta:products`;

        let currentProducts = [];

        // 优先读取现有产品列表
        if (bucket) {
            try {
                const existingObj = await bucket.get(key);
                if (existingObj) {
                    const text = await existingObj.text();
                    currentProducts = JSON.parse(text || "[]");
                }
            } catch (e) {}
        }
        if (currentProducts.length === 0 && db) {
            try {
                const row = await db.prepare("SELECT data FROM user_products WHERE username = ?").bind(workspace).first();
                if (row && row.data) {
                    currentProducts = JSON.parse(row.data || "[]");
                }
            } catch (e) {}
        }
        if (currentProducts.length === 0 && kv) {
            try {
                const data = await kv.get(key, "json");
                if (data && Array.isArray(data)) currentProducts = data;
            } catch (e) {}
        }

        // 区分批量全量同步 vs 单个产品追加更新
        if (Array.isArray(body.products)) {
            currentProducts = body.products;
        } else if (body.product && body.product.name) {
            const p = body.product;
            const idx = currentProducts.findIndex(item => item.name === p.name || (p._oldName && item.name === p._oldName));
            if (idx >= 0) {
                currentProducts[idx] = { ...currentProducts[idx], ...p };
                delete currentProducts[idx]._oldName;
            } else {
                currentProducts.push(p);
            }
        } else if (body.name) {
            const idx = currentProducts.findIndex(item => item.name === body.name || (body._oldName && item.name === body._oldName));
            if (idx >= 0) {
                currentProducts[idx] = { ...currentProducts[idx], ...body };
                delete currentProducts[idx]._oldName;
            } else {
                currentProducts.push(body);
            }
        }

        const payloadStr = JSON.stringify(currentProducts);
        let primaryEngine = "none";

        // 1. 存入 R2
        if (bucket) {
            try {
                await bucket.put(key, payloadStr, {
                    httpMetadata: { contentType: "application/json;charset=utf-8" },
                    customMetadata: {
                        count: String(currentProducts.length),
                        updatedAt: String(Date.now())
                    }
                });
                primaryEngine = "R2";
            } catch (r2Err) {
                console.warn("R2 保存产品列表异常:", r2Err.message);
            }
        }

        // 2. 同步存入 D1
        if (db) {
            try {
                await db.prepare("INSERT OR REPLACE INTO user_products (username, data, updated_at) VALUES (?, ?, ?)").bind(workspace, payloadStr, Date.now()).run();
                if (primaryEngine === "none") primaryEngine = "D1";
            } catch (d1Err) {
                console.warn("D1 保存产品列表异常:", d1Err.message);
            }
        }

        // 3. 同步存入 KV
        if (kv) {
            try {
                await kv.put(key, payloadStr);
                if (primaryEngine === "none") primaryEngine = "KV";
            } catch (kvErr) {}
        }

        if (primaryEngine === "none") {
            return new Response(JSON.stringify({
                success: false,
                error: "云端存储写入失败：R2、D1 与 KV 均未成功保存产品型号。"
            }), { status: 500, headers });
        }

        return new Response(JSON.stringify({
            success: true,
            storageEngine: primaryEngine,
            workspace: workspace,
            count: currentProducts.length,
            products: currentProducts
        }), { status: 200, headers });

    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "保存产品型号失败: " + e.message }), {
            status: 500,
            headers
        });
    }
}

// DELETE: 从云端删除指定产品型号
export async function onRequestDelete(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const { bucket, db, kv } = getBindings(env);

    if (!bucket && !db && !kv) {
        return new Response(JSON.stringify({ success: false, error: "存储服务未绑定" }), { status: 503, headers });
    }

    const authUser = await getAuthenticatedUser(request, env);
    const url = new URL(request.url);

    let workspace = "";
    if (authUser && authUser.username) {
        workspace = authUser.username.toLowerCase();
    } else {
        workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "").trim().toLowerCase();
    }

    const productName = url.searchParams.get("name") || "";
    if (!productName) {
        return new Response(JSON.stringify({ success: false, error: "未指定待删除的产品型号名称" }), { status: 400, headers });
    }

    const key = `ws:${workspace}:meta:products`;
    let currentProducts = [];

    if (bucket) {
        try {
            const obj = await bucket.get(key);
            if (obj) currentProducts = JSON.parse((await obj.text()) || "[]");
        } catch (e) {}
    }
    if (currentProducts.length === 0 && db) {
        try {
            const row = await db.prepare("SELECT data FROM user_products WHERE username = ?").bind(workspace).first();
            if (row && row.data) currentProducts = JSON.parse(row.data || "[]");
        } catch (e) {}
    }
    if (currentProducts.length === 0 && kv) {
        try {
            currentProducts = (await kv.get(key, "json")) || [];
        } catch (e) {}
    }

    const filtered = currentProducts.filter(p => p.name !== productName);
    const payloadStr = JSON.stringify(filtered);

    if (bucket) {
        try {
            await bucket.put(key, payloadStr, {
                httpMetadata: { contentType: "application/json;charset=utf-8" },
                customMetadata: { count: String(filtered.length), updatedAt: String(Date.now()) }
            });
        } catch (e) {}
    }
    if (db) {
        try {
            await db.prepare("INSERT OR REPLACE INTO user_products (username, data, updated_at) VALUES (?, ?, ?)").bind(workspace, payloadStr, Date.now()).run();
        } catch (e) {}
    }
    if (kv) {
        try {
            await kv.put(key, payloadStr);
        } catch (e) {}
    }

    return new Response(JSON.stringify({
        success: true,
        workspace: workspace,
        deletedProduct: productName,
        count: filtered.length
    }), { status: 200, headers });
}
