/**
 * Cloudflare Pages Functions - ProtoView 云端协议存储网关
 * 
 * 路由: /api/protocols
 * 绑定: Cloudflare KV 命名空间 (变量名: PROTOVIEW_KV)
 * 可选环境变量: WORKSPACE_TOKEN (全局访问口令)
 */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-workspace-token, x-workspace-id",
        "Content-Type": "application/json;charset=utf-8"
    };
}

function verifyAuth(request, env) {
    const serverToken = env.WORKSPACE_TOKEN;
    if (!serverToken) return true; // 未设密码则公开开放

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

    if (!verifyAuth(request, env)) {
        return new Response(JSON.stringify({ success: false, error: "云端工作台访问口令错误，请在设置中输入正确的口令。" }), {
            status: 401,
            headers
        });
    }

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare KV 尚未绑定。请前往 Cloudflare 控制台 -> Pages 项目 -> 设置 -> 函数 (Functions) -> KV 命名空间绑定 -> 变量名填 PROTOVIEW_KV。"
        }), {
            status: 503,
            headers
        });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "default").trim().toLowerCase();

    // 1. 读取单个具体协议详情
    if (key) {
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

    // 2. 列出当前工作空间的所有协议清单 (智能匹配工作空间，并自适应兜底容错)
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

            // 规则 1: 精确匹配工作空间前缀 ws:${targetWs}:proto:
            if (keyLower.startsWith(prefix)) {
                isMatch = true;
                if (!cleanName) cleanName = keyName.slice(prefix.length);
            }
            // 规则 2: 当空间名是 protoview_kv 或 default 时，自动双向兼容 ws:default:proto: 与 ws:protoview_kv:proto:
            else if ((targetWs === 'protoview_kv' || targetWs === 'default') && 
                     (keyLower.startsWith('ws:default:proto:') || keyLower.startsWith('ws:protoview_kv:proto:'))) {
                isMatch = true;
                if (!cleanName) cleanName = keyName.replace(/^ws:[^:]+:proto:/i, '');
            }
            // 规则 3: 匹配以 proto: 开头的旧格式或简短 Key
            else if (keyLower.startsWith('proto:')) {
                isMatch = true;
                if (!cleanName) cleanName = keyName.replace(/^proto:/i, '');
            }
            // 规则 4: 如果是在 Cloudflare 后台手动添加的无前缀 key (如 "RPDU1"、"xxx.json")
            else if (!keyLower.startsWith('ws:')) {
                isMatch = true;
                if (!cleanName) cleanName = keyName;
            }

            if (isMatch) {
                protocols.push({
                    _cloudKey: keyName,
                    name: cleanName || keyName,
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

        // 终极兜底：如果按空间名称过滤后为 0，但 KV 数据库里实际存有 Key，则直接将 KV 里的全部 Key 全部返回！
        if (protocols.length === 0 && allKeys.length > 0) {
            for (const k of allKeys) {
                const meta = k.metadata || {};
                protocols.push({
                    _cloudKey: k.name,
                    name: meta.name || k.name.replace(/^ws:[^:]+:proto:/i, '').replace(/^proto:/i, ''),
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
            count: protocols.length,
            totalKeysInKv: allKeys.length,
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

// POST: 保存/上传协议到云端工作台
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    if (!verifyAuth(request, env)) {
        return new Response(JSON.stringify({ success: false, error: "云端工作台访问口令错误" }), {
            status: 401,
            headers
        });
    }

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare KV 尚未绑定。请前往 Cloudflare 控制台绑定 PROTOVIEW_KV。"
        }), {
            status: 503,
            headers
        });
    }

    try {
        const body = await request.json();
        if (!body || !body.name) {
            return new Response(JSON.stringify({ success: false, error: "协议数据格式不正确，缺少名称" }), {
                status: 400,
                headers
            });
        }

        const url = new URL(request.url);
        const workspace = (url.searchParams.get("workspace") || request.headers.get("x-workspace-id") || "default").trim().toLowerCase();
        
        // 规范化 Key 名称
        const safeName = (body.name || 'protocol').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
        const key = body._cloudKey || `ws:${workspace}:proto:${safeName}`;

        body._cloudKey = key;
        body._cloudWorkspace = workspace;
        body._cloudUpdated = Date.now();

        // 提取精炼元数据（方便无需加载完整大 JSON 即可在卡片列表中秒开秒列出）
        const metadata = {
            name: body.name,
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

// DELETE: 从云端工作台删除协议
export async function onRequestDelete(context) {
    const { request, env } = context;
    const headers = corsHeaders();

    if (!verifyAuth(request, env)) {
        return new Response(JSON.stringify({ success: false, error: "云端工作台访问口令错误" }), {
            status: 401,
            headers
        });
    }

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({ success: false, error: "Cloudflare KV 尚未绑定" }), {
            status: 503,
            headers
        });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
        return new Response(JSON.stringify({ success: false, error: "缺少待删除的协议 key 参数" }), {
            status: 400,
            headers
        });
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

