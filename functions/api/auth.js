/**
 * Cloudflare Pages Functions - ProtoView 用户认证与独立账号管理系统
 * 
 * 路由: /api/auth
 * 绑定: Cloudflare KV 命名空间 (变量名: PROTOVIEW_KV)
 * 功能:
 *   - POST ?action=register: 注册新用户并自动登录
 *   - POST ?action=login: 用户登录并返回 session token
 *   - GET  ?action=me: 验证并获取当前登录用户信息
 *   - POST ?action=logout: 退出登录并销毁 session
 */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-auth-token, x-workspace-token, x-workspace-id",
        "Content-Type": "application/json;charset=utf-8"
    };
}

async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders()
    });
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "me";

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare KV 尚未绑定 (PROTOVIEW_KV)。"
        }), { status: 503, headers });
    }

    if (action === "me") {
        const token = request.headers.get("x-auth-token") ||
                      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                      url.searchParams.get("token");

        if (!token) {
            return new Response(JSON.stringify({ success: false, error: "未提供登录凭证" }), {
                status: 401,
                headers
            });
        }

        try {
            const session = await kv.get("session:" + token, "json");
            if (!session || !session.username) {
                return new Response(JSON.stringify({ success: false, error: "登录已失效，请重新登录" }), {
                    status: 401,
                    headers
                });
            }

            return new Response(JSON.stringify({
                success: true,
                user: {
                    username: session.username,
                    displayName: session.displayName || session.username,
                    createdAt: session.createdAt
                }
            }), { status: 200, headers });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "查询用户状态失败: " + e.message }), {
                status: 500,
                headers
            });
        }
    }

    return new Response(JSON.stringify({ success: false, error: "未知操作" }), { status: 400, headers });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const url = new URL(request.url);

    const kv = env.PROTOVIEW_KV;
    if (!kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare KV 尚未绑定 (PROTOVIEW_KV)。请前往 Cloudflare Pages 控制台设置中绑定。"
        }), { status: 503, headers });
    }

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    const action = url.searchParams.get("action") || body.action;

    // 1. 用户注册
    if (action === "register") {
        const rawUsername = (body.username || "").trim();
        const rawPassword = (body.password || "").trim();
        const rawDisplayName = (body.displayName || "").trim();

        if (!rawUsername) {
            return new Response(JSON.stringify({ success: false, error: "用户名不能为空" }), {
                status: 400,
                headers
            });
        }

        const username = rawUsername.toLowerCase();

        // 用户名验证：允许 2~30 位字母、数字、下划线及中文
        if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,30}$/.test(username)) {
            return new Response(JSON.stringify({ success: false, error: "用户名格式不合法，仅支持2-30位字母、数字、下划线或中文" }), {
                status: 400,
                headers
            });
        }

        if (rawPassword.length < 6) {
            return new Response(JSON.stringify({ success: false, error: "密码长度不能少于 6 位" }), {
                status: 400,
                headers
            });
        }

        try {
            // 检查用户名是否已注册
            const existing = await kv.get("user:" + username, "json");
            if (existing) {
                return new Response(JSON.stringify({ success: false, error: "该用户名已被注册，请直接登录或换一个用户名" }), {
                    status: 409,
                    headers
                });
            }

            // 加盐哈希密码
            const salt = crypto.randomUUID();
            const passwordHash = await sha256(`${rawPassword}:${salt}`);

            const displayName = rawDisplayName || rawUsername;
            const newUser = {
                username,
                displayName,
                salt,
                passwordHash,
                createdAt: Date.now()
            };

            // 存储用户基本信息
            await kv.put("user:" + username, JSON.stringify(newUser));

            // 生成登录 token 并写入 session
            const token = crypto.randomUUID();
            const sessionData = {
                username,
                displayName,
                createdAt: Date.now()
            };
            // Session 30 天有效期 (以秒为单位)
            await kv.put("session:" + token, JSON.stringify(sessionData), {
                expirationTtl: 30 * 86400
            });

            return new Response(JSON.stringify({
                success: true,
                message: "注册成功！",
                token,
                user: {
                    username,
                    displayName
                }
            }), { status: 200, headers });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "注册失败: " + e.message }), {
                status: 500,
                headers
            });
        }
    }

    // 2. 用户登录
    if (action === "login") {
        const rawUsername = (body.username || "").trim();
        const rawPassword = (body.password || "").trim();

        if (!rawUsername || !rawPassword) {
            return new Response(JSON.stringify({ success: false, error: "请输入用户名和密码" }), {
                status: 400,
                headers
            });
        }

        const username = rawUsername.toLowerCase();

        try {
            const user = await kv.get("user:" + username, "json");
            if (!user) {
                return new Response(JSON.stringify({ success: false, error: "用户名不存在，请先注册" }), {
                    status: 404,
                    headers
                });
            }

            // 校验密码
            const inputHash = await sha256(`${rawPassword}:${user.salt}`);
            if (inputHash !== user.passwordHash) {
                return new Response(JSON.stringify({ success: false, error: "密码不正确，请重新输入" }), {
                    status: 401,
                    headers
                });
            }

            // 生成新 Session Token
            const token = crypto.randomUUID();
            const sessionData = {
                username: user.username,
                displayName: user.displayName || user.username,
                createdAt: Date.now()
            };
            await kv.put("session:" + token, JSON.stringify(sessionData), {
                expirationTtl: 30 * 86400
            });

            return new Response(JSON.stringify({
                success: true,
                message: "登录成功！",
                token,
                user: {
                    username: user.username,
                    displayName: user.displayName || user.username
                }
            }), { status: 200, headers });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "登录失败: " + e.message }), {
                status: 500,
                headers
            });
        }
    }

    // 3. 退出登录
    if (action === "logout") {
        const token = request.headers.get("x-auth-token") ||
                      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                      body.token;

        if (token) {
            try {
                await kv.delete("session:" + token);
            } catch (e) {}
        }

        return new Response(JSON.stringify({ success: true, message: "已退出登录" }), {
            status: 200,
            headers
        });
    }

    return new Response(JSON.stringify({ success: false, error: "不支持的请求操作" }), {
        status: 400,
        headers
    });
}
