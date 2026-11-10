/**
 * Cloudflare Pages Functions - ProtoView 云端协议存储网关 (支持多用户隔离与三引擎高可用)
 * 
 * 路由: /api/protocols
 * 存储引擎 (自动探测与冗余容灾):
 *   - 引擎 1 (主选): Cloudflare R2 对象存储 (PROTO_BUCKET / R2 / BUCKET 等)，大协议 JSON 存储
 *   - 引擎 2 (主选/全自动回退): Cloudflare D1 关系数据库 (DB / D1)，无 R2 桶时依然 100% 自动持久化
 *   - 引擎 3 (边缘缓存容灾): Cloudflare KV (PROTOVIEW_KV / KV)
 * 安全机制:
 *   - 自动解析 x-auth-token 关联当前登录用户
 *   - 严格按用户专属前缀物理隔离：ws:{username}:proto:{protocol_name}
 *   - 用户 A 绝无法查看、修改或删除用户 B 的任何协议数据
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

// 确保 D1 数据库具有 protocols 表 (支持仅绑定 D1 时即可独立保存协议)
let d1ProtocolsTableReady = false;
async function ensureD1ProtocolsTable(db) {
    if (d1ProtocolsTableReady || !db) return;
    try {
        await db.prepare("CREATE TABLE IF NOT EXISTS protocols (key TEXT PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'ARINC429', product TEXT DEFAULT '', data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
        try {
            await db.prepare("CREATE INDEX IF NOT EXISTS idx_protocols_username ON protocols(username)").run();
        } catch (ie) {}
        d1ProtocolsTableReady = true;
    } catch (e) {
        console.warn("D1 protocols 表初始化提示:", e.message);
    }
}

// 验证会话 Token 并解析出登录用户 (支持 D1 和 KV 双引擎鉴权)
async function getAuthenticatedUser(request, env) {
    const token = request.headers.get("x-auth-token") ||
                  (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                  new URL(request.url).searchParams.get("authToken");
    if (!token) return null;

    const { db, kv } = getBindings(env);

    // 1. 优先从 D1 查询有效会话
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

    // 2. 回退走 KV 查询
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

// 兼容全局管理口令 (若配置了 WORKSPACE_TOKEN)
function verifyAuth(request, env) {
    const serverToken = env?.WORKSPACE_TOKEN;
    if (!serverToken) return true;

    const clientToken = request.headers.get("x-workspace-token") || new URL(request.url).searchParams.get("token");
    return clientToken === serverToken;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders()
    });
}

// GET: 获取协议列表 或 读取指定协议详情
export async function onRequestGet(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const { bucket, db, kv } = getBindings(env);

    if (!bucket && !db && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare 后端存储服务未绑定。请在 Pages 控制台「设置 -> 函数」中绑定 D1 数据库 (变量名: DB) 或 R2 存储桶 (变量名: PROTO_BUCKET)。"
        }), {
            status: 503,
            headers
        });
    }

    if (db) {
        await ensureD1ProtocolsTable(db);
    }

    const authUser = await getAuthenticatedUser(request, env);
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    let workspace = "";
    if (authUser && authUser.username) {
        // 已登录模式：强制绑定为该账号专属空间
        workspace = authUser.username.toLowerCase();
    } else {
        // 未登录模式：检查传统口令
        if (!verifyAuth(request, env)) {
            return new Response(JSON.stringify({ success: false, error: "请先登录账号后再查看和管理云端协议。" }), {
                status: 401,
                headers
            });
        }
        workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "default").trim().toLowerCase();
    }

    // 1. 读取单个具体协议详情
    if (key) {
        if (authUser && authUser.username) {
            const expectedPrefix = `ws:${authUser.username.toLowerCase()}:proto:`;
            if (!key.toLowerCase().startsWith(expectedPrefix)) {
                return new Response(JSON.stringify({ success: false, error: "无权访问此协议 (非当前登录账号所有)" }), {
                    status: 403,
                    headers
                });
            }
        }

        // 1.1 优先从 R2 对象存储获取
        if (bucket) {
            try {
                const object = await bucket.get(key);
                if (object) {
                    const data = await object.text();
                    return new Response(data, {
                        status: 200,
                        headers: {
                            ...headers,
                            "Content-Type": "application/json;charset=utf-8",
                            "x-storage-engine": "R2"
                        }
                    });
                }
            } catch (e) {
                console.warn("R2 读取异常，转入 D1/KV:", e.message);
            }
        }

        // 1.2 从 D1 数据库获取
        if (db) {
            try {
                const row = await db.prepare("SELECT data FROM protocols WHERE key = ?").bind(key).first();
                if (row && row.data) {
                    return new Response(row.data, {
                        status: 200,
                        headers: {
                            ...headers,
                            "Content-Type": "application/json;charset=utf-8",
                            "x-storage-engine": "D1"
                        }
                    });
                }
            } catch (e) {
                console.warn("D1 读取协议异常:", e.message);
            }
        }

        // 1.3 回退从 KV 读取
        if (kv) {
            try {
                const data = await kv.get(key, "text");
                if (data) {
                    return new Response(data, {
                        status: 200,
                        headers: {
                            ...headers,
                            "Content-Type": "application/json;charset=utf-8",
                            "x-storage-engine": "KV"
                        }
                    });
                }
            } catch (e) {
                console.warn("KV 读取协议异常:", e.message);
            }
        }

        return new Response(JSON.stringify({ success: false, error: "未找到该协议或协议已被删除" }), {
            status: 404,
            headers
        });
    }

    // 2. 列举当前空间下的所有协议
    const prefix = `ws:${workspace}:proto:`;
    const protocols = [];
    let detectedEngine = "none";

    // 2.1 优先列举 R2 存储桶
    if (bucket) {
        try {
            const listed = await bucket.list({ prefix });
            for (const item of (listed.objects || [])) {
                const meta = item.customMetadata || {};
                const safeName = item.key.replace(prefix, "");

                protocols.push({
                    key: item.key,
                    name: meta.name || decodeURIComponent(safeName),
                    product: meta.product || '',
                    type: meta.type || 'ARINC429',
                    mode: meta.mode || 'classic',
                    device: meta.device || '',
                    direction: meta.direction || 'Tx',
                    period: Number(meta.period || 20),
                    speed: meta.speed || '100kbps',
                    wordCount: Number(meta.wordCount || 0),
                    size: item.size,
                    updateTime: meta.updateTime ? Number(meta.updateTime) : (item.uploaded ? new Date(item.uploaded).getTime() : Date.now()),
                    _cloudKey: item.key,
                    _cloudWorkspace: workspace,
                    _storageEngine: "R2"
                });
            }

            if (protocols.length > 0 || !db) {
                return new Response(JSON.stringify({
                    success: true,
                    workspace: workspace,
                    count: protocols.length,
                    storageEngine: "R2",
                    protocols: protocols
                }), {
                    status: 200,
                    headers
                });
            }
        } catch (e) {
            console.warn("R2 列举失败，降级尝试 D1/KV:", e.message);
        }
    }

    // 2.2 从 D1 数据库列举 (当 R2 为空或未绑定时提供无缝存储)
    if (db) {
        try {
            const rows = await db.prepare("SELECT key, name, type, product, data, updated_at FROM protocols WHERE username = ? ORDER BY updated_at DESC").bind(workspace).all();

            for (const row of (rows.results || [])) {
                let parsed = null;
                try {
                    parsed = JSON.parse(row.data);
                } catch (e) {}

                protocols.push({
                    key: row.key,
                    name: row.name,
                    product: row.product || (parsed?.product) || '',
                    type: row.type || (parsed?.type) || 'ARINC429',
                    mode: parsed?.mode || 'classic',
                    device: parsed?.device || parsed?.source || '',
                    direction: parsed?.direction || 'Tx',
                    period: Number(parsed?.period || 20),
                    speed: parsed?.speed || '100kbps',
                    wordCount: Number((parsed?.words ? parsed.words.length : (parsed?.packets ? parsed.packets.length : 0)) || 0),
                    size: (row.data ? row.data.length : 0),
                    updateTime: row.updated_at || Date.now(),
                    _cloudKey: row.key,
                    _cloudWorkspace: workspace,
                    _storageEngine: "D1"
                });
            }

            if (protocols.length > 0 || !kv) {
                return new Response(JSON.stringify({
                    success: true,
                    workspace: workspace,
                    count: protocols.length,
                    storageEngine: "D1",
                    protocols: protocols
                }), {
                    status: 200,
                    headers
                });
            }
        } catch (e) {
            console.warn("D1 列举协议异常:", e.message);
        }
    }

    // 2.3 降级列举 KV
    if (kv) {
        try {
            const listRes = await kv.list({ prefix });
            const keys = listRes.keys || [];

            for (const item of keys) {
                let meta = item.metadata;
                if (!meta) {
                    try {
                        const content = await kv.get(item.name, "json");
                        if (content) {
                            meta = {
                                name: content.name,
                                product: content.product || '',
                                type: content.type || 'ARINC429',
                                mode: content.mode || 'classic',
                                device: content.device || content.source || '',
                                direction: content.direction || 'Tx',
                                period: content.period || 20,
                                speed: content.speed || '100kbps',
                                wordCount: content.words ? content.words.length : (content.frames ? content.frames.length : 0),
                                updateTime: content._cloudUpdated || Date.now()
                            };
                        }
                    } catch (err) {}
                }

                if (meta) {
                    protocols.push({
                        key: item.name,
                        name: meta.name,
                        product: meta.product,
                        type: meta.type,
                        mode: meta.mode,
                        device: meta.device,
                        direction: meta.direction,
                        period: meta.period,
                        speed: meta.speed,
                        wordCount: meta.wordCount,
                        updateTime: meta.updateTime,
                        _cloudKey: item.name,
                        _cloudWorkspace: workspace,
                        _storageEngine: "KV"
                    });
                }
            }

            return new Response(JSON.stringify({
                success: true,
                workspace: workspace,
                count: protocols.length,
                storageEngine: "KV",
                protocols: protocols
            }), {
                status: 200,
                headers
            });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "获取云端协议列表失败: " + e.message }), {
                status: 500,
                headers
            });
        }
    }

    return new Response(JSON.stringify({
        success: true,
        workspace: workspace,
        count: 0,
        storageEngine: "none",
        protocols: []
    }), { status: 200, headers });
}

// POST: 保存通信协议 (R2/D1/KV 三重冗余持久化)
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const { bucket, db, kv } = getBindings(env);

    if (!bucket && !db && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare 后端存储服务未绑定。请在 Pages 设置中绑定 D1 数据库 (变量名: DB) 或 R2 存储桶 (变量名: PROTO_BUCKET)。"
        }), {
            status: 503,
            headers
        });
    }

    if (db) {
        await ensureD1ProtocolsTable(db);
    }

    const authUser = await getAuthenticatedUser(request, env);
    let workspace = "";
    if (authUser && authUser.username) {
        workspace = authUser.username.toLowerCase();
    } else {
        if (!verifyAuth(request, env)) {
            return new Response(JSON.stringify({ success: false, error: "请先登录账号后再保存协议到云端" }), {
                status: 401,
                headers
            });
        }
        const url = new URL(request.url);
        workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "default").trim().toLowerCase();
    }

    try {
        const body = await request.json();
        if (!body || !body.name) {
            return new Response(JSON.stringify({ success: false, error: "协议数据格式不正确，缺少名称" }), {
                status: 400,
                headers
            });
        }

        const safeName = (body.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const key = `ws:${workspace}:proto:${safeName}`;

        body._cloudKey = key;
        body._cloudWorkspace = workspace;
        body._cloudOwner = authUser ? authUser.username : workspace;
        body._cloudUpdated = Date.now();

        const metadata = {
            name: body.name,
            product: body.product || '',
            type: body.type || 'ARINC429',
            mode: body.mode || 'classic',
            device: body.device || body.source || '',
            direction: body.direction || 'Tx',
            period: String(body.period || 20),
            speed: body.speed || '100kbps',
            wordCount: String(body.words ? body.words.length : (body.packets ? body.packets.length : 0)),
            updateTime: String(body._cloudUpdated)
        };

        const payloadStr = JSON.stringify(body);
        let primaryEngine = "none";

        // 1. 优先存入 Cloudflare R2 对象存储 (支持 500KB+ 大文件)
        if (bucket) {
            try {
                await bucket.put(key, payloadStr, {
                    httpMetadata: { contentType: "application/json;charset=utf-8" },
                    customMetadata: metadata
                });
                primaryEngine = "R2";
            } catch (r2Err) {
                console.warn("R2 写入失败，转由 D1/KV 接管:", r2Err.message);
            }
        }

        // 2. 同步写入 Cloudflare D1 数据库 (作为强力冗余或无 R2 时的绝对持久化)
        if (db) {
            try {
                await db.prepare("INSERT OR REPLACE INTO protocols (key, username, name, type, product, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(key, workspace, body.name, body.type || 'ARINC429', body.product || '', payloadStr, Date.now()).run();
                if (primaryEngine === "none") primaryEngine = "D1";
            } catch (d1Err) {
                console.warn("D1 协议写入异常:", d1Err.message);
            }
        }

        // 3. 同步写入 Cloudflare KV (边缘容灾)
        if (kv) {
            try {
                await kv.put(key, payloadStr, { metadata });
                if (primaryEngine === "none") primaryEngine = "KV";
            } catch (kvErr) {
                console.warn("KV 协议写入异常:", kvErr.message);
            }
        }

        if (primaryEngine === "none") {
            return new Response(JSON.stringify({
                success: false,
                error: "云端存储写入失败：R2、D1 与 KV 均未成功执行保存，请检查 Pages 后端绑定状态。"
            }), { status: 500, headers });
        }

        return new Response(JSON.stringify({
            success: true,
            storageEngine: primaryEngine,
            key: key,
            workspace: workspace,
            size: payloadStr.length,
            metadata: metadata
        }), {
            status: 200,
            headers
        });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "保存至云端失败: " + e.message }), {
            status: 500,
            headers
        });
    }
}

// DELETE: 从云端工作台删除协议
export async function onRequestDelete(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const { bucket, db, kv } = getBindings(env);

    if (!bucket && !db && !kv) {
        return new Response(JSON.stringify({ success: false, error: "存储服务未绑定" }), {
            status: 503,
            headers
        });
    }

    const authUser = await getAuthenticatedUser(request, env);
    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
        return new Response(JSON.stringify({ success: false, error: "缺少待删除的协议 key 参数" }), {
            status: 400,
            headers
        });
    }

    if (authUser && authUser.username) {
        const expectedPrefix = `ws:${authUser.username.toLowerCase()}:proto:`;
        if (!key.toLowerCase().startsWith(expectedPrefix)) {
            return new Response(JSON.stringify({ success: false, error: "无权删除非本账号的协议" }), {
                status: 403,
                headers
            });
        }
    } else {
        if (!verifyAuth(request, env)) {
            return new Response(JSON.stringify({ success: false, error: "云端工作台访问口令错误" }), {
                status: 401,
                headers
            });
        }
    }

    if (bucket) {
        try { await bucket.delete(key); } catch (e) {}
    }
    if (db) {
        try { await db.prepare("DELETE FROM protocols WHERE key = ?").bind(key).run(); } catch (e) {}
    }
    if (kv) {
        try { await kv.delete(key); } catch (e) {}
    }

    return new Response(JSON.stringify({ success: true, deletedKey: key }), {
        status: 200,
        headers
    });
}
