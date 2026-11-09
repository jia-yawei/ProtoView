/**
 * Cloudflare Pages Functions - ProtoView 云端协议存储网关 (支持多用户隔离与鉴权)
 * 
 * 路由: /api/protocols
 * 绑定: Cloudflare KV 命名空间 (变量名: PROTOVIEW_KV)
 * 安全机制:
 *   - 自动解析 x-auth-token 关联当前登录用户
 *   - 严格按用户工作空间前缀隔离：ws:{username}:proto:{protocol_name}
 *   - 用户 A 无法查看、修改或删除用户 B 的任何协议数据
 */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-auth-token, x-workspace-token, x-workspace-id",
        "Content-Type": "application/json;charset=utf-8"
    };
}

// 验证会话 Token 并解析出登录用户
async function getAuthenticatedUser(request, env) {
    const token = request.headers.get("x-auth-token") ||
                  (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                  new URL(request.url).searchParams.get("authToken");
    if (!token) return null;

    const kv = env.PROTOVIEW_KV;
    if (!kv) return null;

    try {
        const session = await kv.get("session:" + token, "json");
        return session || null;
    } catch (e) {
        return null;
    }
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

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare KV 尚未绑定。请前往 Cloudflare 控制台 -> Pages 项目 -> 设置 -> 函数 -> 绑定 PROTOVIEW_KV 变量。"
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

        try {
            const data = await kv.get(key, "text");
            if (!data) {
                return new Response(JSON.stringify({ success: false, error: "未在云端找到该协议" }), {
                    status: 404,
                    headers
                });
            }
            return new Response(data, {
                status: 200,
                headers: { ...headers, "Content-Type": "application/json;charset=utf-8" }
            });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "读取协议失败: " + e.message }), {
                status: 500,
                headers
            });
        }
    }

    // 2. 列出当前账号/空间下的所有协议清单
    try {
        const listRes = await kv.list();
        const allKeys = listRes.keys || [];
        const protocols = [];
        const targetWs = (workspace || 'default').toLowerCase();
        const prefix = `ws:${targetWs}:proto:`;

        for (const k of allKeys) {
            const keyName = k.name;
            const meta = k.metadata || {};
            const keyLower = keyName.toLowerCase();
            
            let isMatch = false;
            let cleanName = meta.name;

            // 规则 1: 精确匹配用户工作空间前缀 ws:${targetWs}:proto:
            if (keyLower.startsWith(prefix)) {
                isMatch = true;
                if (!cleanName) cleanName = keyName.slice(prefix.length);
            }
            // 规则 2 (仅限未登录时的 default 空间兼容历史数据)
            else if (!authUser && (targetWs === 'default' || targetWs === 'protoview_kv')) {
                if (keyLower.startsWith('ws:default:proto:') || keyLower.startsWith('proto:')) {
                    isMatch = true;
                    if (!cleanName) cleanName = keyName.replace(/^ws:[^:]+:proto:/i, '').replace(/^proto:/i, '');
                }
            }

            if (isMatch) {
                protocols.push({
                    _cloudKey: keyName,
                    name: cleanName || keyName,
                    product: meta.product || '',
                    type: meta.type || 'ARINC429',
                    mode: meta.mode || 'classic',
                    device: meta.device || '',
                    direction: meta.direction || 'Tx',
                    period: meta.period || 20,
                    speed: meta.speed || '100kbps',
                    wordCount: meta.wordCount || 0,
                    updateTime: meta.updateTime || Date.now()
                });
            }
        }

        // 按更新时间降序排列
        protocols.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));

        return new Response(JSON.stringify({
            success: true,
            workspace: workspace,
            currentUser: authUser ? { username: authUser.username, displayName: authUser.displayName } : null,
            count: protocols.length,
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

// POST: 保存/上传协议到当前用户的云端工作空间
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare KV 尚未绑定 (PROTOVIEW_KV)。"
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
        body._cloudOwner = authUser ? (authUser.displayName || authUser.username) : workspace;
        body._cloudUpdated = Date.now();

        // 提取卡片快速列举所需的元数据
        const metadata = {
            name: body.name,
            product: body.product || '',
            type: body.type || 'ARINC429',
            mode: body.mode || 'classic',
            device: body.device || body.source || '',
            direction: body.direction || 'Tx',
            period: body.period || 20,
            speed: body.speed || '100kbps',
            wordCount: body.words ? body.words.length : (body.frames ? body.frames.length : 0),
            updateTime: body._cloudUpdated
        };

        // 存入 Cloudflare KV
        await kv.put(key, JSON.stringify(body), { metadata });

        return new Response(JSON.stringify({
            success: true,
            key: key,
            workspace: workspace,
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

// DELETE: 从云端工作台删除协议 (只能删除自己账号下的协议)
export async function onRequestDelete(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({ success: false, error: "Cloudflare KV 尚未绑定" }), {
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

    try {
        await kv.delete(key);
        return new Response(JSON.stringify({ success: true, deletedKey: key }), {
            status: 200,
            headers
        });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "从云端删除失败: " + e.message }), {
            status: 500,
            headers
        });
    }
}
