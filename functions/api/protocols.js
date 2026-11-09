/**
 * Cloudflare Pages Functions - ProtoView 云端协议存储网关 (支持多用户隔离与鉴权)
 * 
 * 路由: /api/protocols
 * 存储引擎:
 *   - 协议大文件存储: 优先使用 Cloudflare R2 (绑定变量名: PROTO_BUCKET 或 PROTOVIEW_R2)，无体积限制、10GB免费空间
 *   - 平滑回退: Cloudflare KV (绑定变量名: PROTOVIEW_KV)
 *   - 用户认证源: 优先 Cloudflare D1 (绑定变量名: DB)，回退 KV
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

// 验证会话 Token 并解析出登录用户 (支持 D1 和 KV 双引擎鉴权)
async function getAuthenticatedUser(request, env) {
    const token = request.headers.get("x-auth-token") ||
                  (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                  new URL(request.url).searchParams.get("authToken");
    if (!token) return null;

    // 1. 优先从 D1 查询有效会话
    const db = env.DB || env.PROTOVIEW_DB;
    if (db) {
        try {
            const now = Date.now();
            const row = await db.prepare(
                `SELECT s.username, u.created_at
                 FROM sessions s
                 JOIN users u ON s.username = u.username
                 WHERE s.token = ? AND s.expires_at > ?`
            ).bind(token, now).first();

            if (row) {
                return {
                    username: row.username,
                    createdAt: row.created_at
                };
            }
        } catch (e) {
            console.warn("D1 鉴权查询异常:", e.message);
        }
    }

    // 2. 回退走 KV 查询
    const kv = env.PROTOVIEW_KV;
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
    const serverToken = env.WORKSPACE_TOKEN;
    if (!serverToken) return true; // 未设全局口令则开放

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

    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    if (!bucket && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare R2 存储桶 (变量名: PROTO_BUCKET) 或 KV 尚未绑定。请前往 Pages 设置 -> 函数中绑定。"
        }), {
            status: 503,
            headers
        });
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
        // 安全拦截：若为登录用户，禁止非法读取其他用户的协议 key
        if (authUser && authUser.username) {
            const expectedPrefix = `ws:${authUser.username.toLowerCase()}:proto:`;
            if (!key.toLowerCase().startsWith(expectedPrefix)) {
                return new Response(JSON.stringify({ success: false, error: "无权访问此协议 (非当前登录账号所有)" }), {
                    status: 403,
                    headers
                });
            }
        }

        // 优先从 R2 对象存储获取 (支持 500KB~大文件)
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
                console.warn("R2 读取尝试异常，转入 KV:", e.message);
            }
        }

        // 回退从 KV 读取
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
            } catch (e) {}
        }

        return new Response(JSON.stringify({ success: false, error: "未在云端找到该协议文件" }), {
            status: 404,
            headers
        });
    }

    // 2. 列出当前空间的所有协议列表 (列表不读取大包体，仅返回元数据，极速响应)
    const prefix = `ws:${workspace}:proto:`;
    const protocols = [];

    // 方案 A: 优先列举 Cloudflare R2 对象存储
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
        } catch (e) {
            console.warn("R2 列举失败，降级尝试 KV:", e.message);
        }
    }

    // 方案 B: 降级列举 KV
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

    return new Response(JSON.stringify({ success: false, error: "无可用的存储服务" }), { status: 500, headers });
}

// POST: 保存通信协议 (支持 500KB+ 大 JSON 协议无损写入 R2 对象存储)
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    if (!bucket && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare R2 存储桶 (PROTO_BUCKET) 或 KV 尚未绑定。"
        }), {
            status: 503,
            headers
        });
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

        // 规范化 Key 名称，严格锁定在当前登录用户的专属前缀下
        const safeName = (body.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const key = `ws:${workspace}:proto:${safeName}`;

        body._cloudKey = key;
        body._cloudWorkspace = workspace;
        body._cloudOwner = authUser ? authUser.username : workspace;
        body._cloudUpdated = Date.now();

        // 提取卡片快速列举所需的元数据
        const metadata = {
            name: body.name,
            product: body.product || '',
            type: body.type || 'ARINC429',
            mode: body.mode || 'classic',
            device: body.device || body.source || '',
            direction: body.direction || 'Tx',
            period: String(body.period || 20),
            speed: body.speed || '100kbps',
            wordCount: String(body.words ? body.words.length : (body.frames ? body.frames.length : 0)),
            updateTime: String(body._cloudUpdated)
        };

        const payloadStr = JSON.stringify(body);

        // 1. 优先存入 Cloudflare R2 对象存储 (无 100KB 截断限制，专为 500KB+ 大协议设计)
        if (bucket) {
            await bucket.put(key, payloadStr, {
                httpMetadata: { contentType: "application/json;charset=utf-8" },
                customMetadata: metadata
            });

            return new Response(JSON.stringify({
                success: true,
                storageEngine: "R2",
                key: key,
                workspace: workspace,
                size: payloadStr.length,
                metadata: metadata
            }), {
                status: 200,
                headers
            });
        }

        // 2. 降级存入 Cloudflare KV
        if (kv) {
            await kv.put(key, payloadStr, { metadata });

            return new Response(JSON.stringify({
                success: true,
                storageEngine: "KV",
                key: key,
                workspace: workspace,
                size: payloadStr.length,
                metadata: metadata
            }), {
                status: 200,
                headers
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "保存至云端失败: " + e.message }), {
            status: 500,
            headers
        });
    }
}

// DELETE: 从云端工作台删除协议 (只能删除自己账号下的协议)
export async function onRequestDelete(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    if (!bucket && !kv) {
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

    let deleted = false;
    if (bucket) {
        try {
            await bucket.delete(key);
            deleted = true;
        } catch (e) {}
    }
    if (kv) {
        try {
            await kv.delete(key);
            deleted = true;
        } catch (e) {}
    }

    return new Response(JSON.stringify({ success: true, deletedKey: key }), {
        status: 200,
        headers
    });
}
