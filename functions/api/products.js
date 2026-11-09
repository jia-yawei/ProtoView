/**
 * Cloudflare Pages Functions - ProtoView 产品型号与设备型号云端存储网关
 * 
 * 路由: /api/products
 * 存储引擎:
 *   - 优先使用: Cloudflare R2 (绑定变量名: PROTO_BUCKET)
 *   - 平滑回退: Cloudflare KV (绑定变量名: PROTOVIEW_KV)
 *   - 身份鉴权: 优先 Cloudflare D1 (绑定变量名: DB)
 * 功能:
 *   - 支持用户只创建产品/设备型号（无通信协议）时，依然完整同步并持久化到云端
 *   - 完整保留产品代号 (code)、全称 (name)、软件配置项 (softwareItems/CSCI) 及研制说明 (desc)
 *   - 物理多用户隔离：按当前登录账号专属存储 ws:{username}:meta:products
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

    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    if (!bucket && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare 存储服务 (R2 / KV) 尚未绑定。"
        }), { status: 503, headers });
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
    let products = [];

    // 1. 优先从 R2 获取
    if (bucket) {
        try {
            const obj = await bucket.get(key);
            if (obj) {
                const text = await obj.text();
                products = JSON.parse(text || "[]");
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

    // 2. 回退从 KV 获取
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

    // 3. 若尚无产品数据，返回空列表
    return new Response(JSON.stringify({
        success: true,
        workspace: workspace,
        products: []
    }), { status: 200, headers });
}

// POST: 保存/批量同步产品型号到云端
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    if (!bucket && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare 存储服务 (R2 / KV) 尚未绑定。"
        }), { status: 503, headers });
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

    const key = `ws:${workspace}:meta:products`;

    try {
        const body = await request.json();
        let targetProducts = [];

        if (Array.isArray(body.products)) {
            // 全量数组同步
            targetProducts = body.products;
        } else if (body.product && body.product.name) {
            // 单个产品增量 Upsert
            let existing = [];
            if (bucket) {
                try {
                    const obj = await bucket.get(key);
                    if (obj) existing = JSON.parse(await obj.text() || "[]");
                } catch(e) {}
            } else if (kv) {
                try {
                    existing = await kv.get(key, "json") || [];
                } catch(e) {}
            }

            const pNew = body.product;
            const idx = existing.findIndex(p => (p.name || "").toLowerCase() === (pNew.name || "").toLowerCase());
            if (idx >= 0) {
                existing[idx] = Object.assign({}, existing[idx], pNew, { updatedAt: Date.now() });
            } else {
                existing.push(Object.assign({}, pNew, { createdAt: Date.now(), updatedAt: Date.now() }));
            }
            targetProducts = existing;
        } else {
            return new Response(JSON.stringify({ success: false, error: "无效的产品数据格式" }), { status: 400, headers });
        }

        const payloadStr = JSON.stringify(targetProducts);

        // 优先存 R2
        if (bucket) {
            await bucket.put(key, payloadStr, {
                httpMetadata: { contentType: "application/json;charset=utf-8" },
                customMetadata: {
                    workspace: workspace,
                    count: String(targetProducts.length),
                    updatedAt: String(Date.now())
                }
            });
        }

        // 同时写入 KV 双保险
        if (kv) {
            try {
                await kv.put(key, payloadStr);
            } catch(e) {}
        }

        return new Response(JSON.stringify({
            success: true,
            message: "产品型号已安全同步至云端",
            workspace: workspace,
            count: targetProducts.length,
            products: targetProducts
        }), { status: 200, headers });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "保存产品异常: " + e.message }), { status: 500, headers });
    }
}

// DELETE: 删除指定产品型号
export async function onRequestDelete(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    const authUser = await getAuthenticatedUser(request, env);
    const url = new URL(request.url);

    let workspace = "";
    if (authUser && authUser.username) {
        workspace = authUser.username.toLowerCase();
    } else {
        workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "").trim().toLowerCase();
        if (!workspace) {
            return new Response(JSON.stringify({ success: false, error: "未授权的操作" }), { status: 401, headers });
        }
    }

    const productName = url.searchParams.get("name");
    if (!productName) {
        return new Response(JSON.stringify({ success: false, error: "缺少产品名称参数" }), { status: 400, headers });
    }

    const key = `ws:${workspace}:meta:products`;

    try {
        let existing = [];
        if (bucket) {
            try {
                const obj = await bucket.get(key);
                if (obj) existing = JSON.parse(await obj.text() || "[]");
            } catch(e) {}
        } else if (kv) {
            try {
                existing = await kv.get(key, "json") || [];
            } catch(e) {}
        }

        const filtered = existing.filter(p => (p.name || "").toLowerCase() !== productName.toLowerCase());
        const payloadStr = JSON.stringify(filtered);

        if (bucket) {
            await bucket.put(key, payloadStr, {
                httpMetadata: { contentType: "application/json;charset=utf-8" },
                customMetadata: {
                    workspace: workspace,
                    count: String(filtered.length),
                    updatedAt: String(Date.now())
                }
            });
        }
        if (kv) {
            try {
                await kv.put(key, payloadStr);
            } catch(e) {}
        }

        return new Response(JSON.stringify({
            success: true,
            message: `产品 [${productName}] 已从云端移除`,
            remainingCount: filtered.length
        }), { status: 200, headers });
    } catch(e) {
        return new Response(JSON.stringify({ success: false, error: "删除产品异常: " + e.message }), { status: 500, headers });
    }
}
