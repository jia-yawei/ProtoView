/**
 * Cloudflare Pages Functions - ProtoView 用户认证与独立账号管理系统
 * 
 * 路由: /api/auth
 * 账号信息规范: 仅需用户名 (username) 与 密码 (password)
 * 存储支持:
 *   - 优先使用: Cloudflare D1 关系型数据库 (绑定变量名: DB 或 PROTOVIEW_DB)
 *   - 平滑回退: Cloudflare KV 命名空间 (绑定变量名: PROTOVIEW_KV)
 * 功能:
 *   - POST ?action=register: 仅需用户名与密码，自动注册并登录
 *   - POST ?action=login: 用户名密码登录并返回 session token
 *   - GET  ?action=me: 验证并获取当前登录账号
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

// 判定是否为管理员账号 (用户名 admin 或环境变量 ADMIN_USERNAME 所指定的用户)
function checkIsAdmin(username, env) {
    if (!username) return false;
    const u = username.toLowerCase();
    const envAdmin = (env?.ADMIN_USERNAME || env?.ADMIN_USER || "admin").toLowerCase();
    return u === "admin" || u === envAdmin;
}

// 自动初始化 D1 数据库表 (精简结构：仅用户名与密码哈希)
let d1TablesInitialized = false;
async function ensureD1Tables(db) {
    if (d1TablesInitialized) return;
    try {
        await db.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
        await db.prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`).run();
        try {
            await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)`).run();
            await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`).run();
        } catch (ie) {}
        d1TablesInitialized = true;
    } catch (e) {
        console.warn("D1 表结构自动检查提示:", e.message);
    }
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

    const db = env.DB || env.PROTOVIEW_DB;
    const kv = env.PROTOVIEW_KV;

    if (!db && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare D1 数据库 (变量名: DB) 或 KV 尚未绑定。请前往 Pages 设置 -> 函数中绑定。"
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

        // 1. 优先从 D1 关系型数据库查询
        if (db) {
            try {
                await ensureD1Tables(db);
                const now = Date.now();
                const sessionRow = await db.prepare(
                    `SELECT s.token, s.username, s.expires_at, u.created_at
                     FROM sessions s
                     JOIN users u ON s.username = u.username
                     WHERE s.token = ? AND s.expires_at > ?`
                ).bind(token, now).first();

                if (!sessionRow) {
                    return new Response(JSON.stringify({ success: false, error: "登录已失效，请重新登录" }), {
                        status: 401,
                        headers
                    });
                }

                return new Response(JSON.stringify({
                    success: true,
                    storage: "D1",
                    user: {
                        username: sessionRow.username,
                        createdAt: sessionRow.created_at,
                        isAdmin: checkIsAdmin(sessionRow.username, env)
                    }
                }), { status: 200, headers });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "D1 查询用户状态失败: " + e.message }), {
                    status: 500,
                    headers
                });
            }
        }

        // 2. 回退走 KV 查询
        if (kv) {
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
                    storage: "KV",
                    user: {
                        username: session.username,
                        createdAt: session.createdAt,
                        isAdmin: checkIsAdmin(session.username, env)
                    }
                }), { status: 200, headers });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "KV 查询用户状态失败: " + e.message }), {
                    status: 500,
                    headers
                });
            }
        }
    }

    return new Response(JSON.stringify({ success: false, error: "未知操作" }), { status: 400, headers });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const url = new URL(request.url);

    const db = env.DB || env.PROTOVIEW_DB;
    const kv = env.PROTOVIEW_KV;

    if (!db && !kv) {
        return new Response(JSON.stringify({
            success: false,
            error: "Cloudflare D1 数据库 (变量名: DB) 或 KV 尚未绑定。请前往 Pages 设置 -> 函数中绑定。"
        }), { status: 503, headers });
    }

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    const action = url.searchParams.get("action") || body.action;

    // 1. 用户注册 (仅需用户名与密码)
    if (action === "register") {
        const rawUsername = (body.username || "").trim();
        const rawPassword = (body.password || "").trim();

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

        const salt = crypto.randomUUID();
        const passwordHash = await sha256(`${rawPassword}:${salt}`);
        const token = crypto.randomUUID();
        const now = Date.now();
        const expiresAt = now + 30 * 86400 * 1000; // 30 天有效期

        // 方案 A: 存储至 Cloudflare D1
        if (db) {
            try {
                await ensureD1Tables(db);
                // 检查用户名是否已存在
                const existing = await db.prepare("SELECT username FROM users WHERE username = ?").bind(username).first();
                if (existing) {
                    return new Response(JSON.stringify({ success: false, error: "该用户名已被注册，请直接登录" }), {
                        status: 409,
                        headers
                    });
                }

                // 批量执行用户与会话写入
                await db.batch([
                    db.prepare(
                        "INSERT INTO users (username, salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
                    ).bind(username, salt, passwordHash, now, now),
                    db.prepare(
                        "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)"
                    ).bind(token, username, now, expiresAt)
                ]);

                return new Response(JSON.stringify({
                    success: true,
                    storage: "D1",
                    message: "注册成功！",
                    token,
                    user: {
                        username,
                        isAdmin: checkIsAdmin(username, env)
                    }
                }), { status: 200, headers });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "D1 注册失败: " + e.message }), {
                    status: 500,
                    headers
                });
            }
        }

        // 方案 B: 降级存储至 KV
        if (kv) {
            try {
                const existing = await kv.get("user:" + username, "json");
                if (existing) {
                    return new Response(JSON.stringify({ success: false, error: "该用户名已被注册，请直接登录" }), {
                        status: 409,
                        headers
                    });
                }

                const newUser = { username, salt, passwordHash, createdAt: now };
                await kv.put("user:" + username, JSON.stringify(newUser));
                await kv.put("session:" + token, JSON.stringify({ username, createdAt: now }), {
                    expirationTtl: 30 * 86400
                });

                return new Response(JSON.stringify({
                    success: true,
                    storage: "KV",
                    message: "注册成功！",
                    token,
                    user: {
                        username,
                        isAdmin: checkIsAdmin(username, env)
                    }
                }), { status: 200, headers });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "KV 注册失败: " + e.message }), {
                    status: 500,
                    headers
                });
            }
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
        const token = crypto.randomUUID();
        const now = Date.now();
        const expiresAt = now + 30 * 86400 * 1000;

        // 方案 A: 优先使用 D1 验证
        if (db) {
            try {
                await ensureD1Tables(db);
                const user = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
                if (!user) {
                    return new Response(JSON.stringify({ success: false, error: "用户名不存在，请先注册" }), {
                        status: 404,
                        headers
                    });
                }

                const inputHash = await sha256(`${rawPassword}:${user.salt}`);
                if (inputHash !== user.password_hash) {
                    return new Response(JSON.stringify({ success: false, error: "密码不正确，请重新输入" }), {
                        status: 401,
                        headers
                    });
                }

                // 写入有效登录会话
                await db.prepare(
                    "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)"
                ).bind(token, username, now, expiresAt).run();

                return new Response(JSON.stringify({
                    success: true,
                    storage: "D1",
                    message: "登录成功！",
                    token,
                    user: {
                        username: user.username,
                        createdAt: user.created_at,
                        isAdmin: checkIsAdmin(user.username, env)
                    }
                }), { status: 200, headers });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "D1 登录失败: " + e.message }), {
                    status: 500,
                    headers
                });
            }
        }

        // 方案 B: 降级走 KV 验证
        if (kv) {
            try {
                const user = await kv.get("user:" + username, "json");
                if (!user) {
                    return new Response(JSON.stringify({ success: false, error: "用户名不存在，请先注册" }), {
                        status: 404,
                        headers
                    });
                }

                const inputHash = await sha256(`${rawPassword}:${user.salt}`);
                if (inputHash !== user.passwordHash) {
                    return new Response(JSON.stringify({ success: false, error: "密码不正确，请重新输入" }), {
                        status: 401,
                        headers
                    });
                }

                await kv.put("session:" + token, JSON.stringify({
                    username: user.username,
                    createdAt: now
                }), { expirationTtl: 30 * 86400 });

                return new Response(JSON.stringify({
                    success: true,
                    storage: "KV",
                    message: "登录成功！",
                    token,
                    user: {
                        username: user.username,
                        createdAt: user.createdAt,
                        isAdmin: checkIsAdmin(user.username, env)
                    }
                }), { status: 200, headers });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "KV 登录失败: " + e.message }), {
                    status: 500,
                    headers
                });
            }
        }
    }

    // 3. 退出登录
    if (action === "logout") {
        const token = request.headers.get("x-auth-token") ||
                      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
                      body.token;

        if (token) {
            if (db) {
                try {
                    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
                } catch (e) {}
            }
            if (kv) {
                try {
                    await kv.delete("session:" + token);
                } catch (e) {}
            }
        }

        return new Response(JSON.stringify({ success: true, message: "已安全退出登录" }), {
            status: 200,
            headers
        });
    }

    return new Response(JSON.stringify({ success: false, error: "不支持的请求操作" }), {
        status: 400,
        headers
    });
}
