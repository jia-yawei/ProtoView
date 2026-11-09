/**
 * Cloudflare Pages Functions - ProtoView 系统监控与用户管理后台网关
 * 
 * 路由: /api/admin
 * 功能:
 *   - GET  ?action=stats: 统计全站注册用户、活跃会话、所有用户协议数、R2/D1/KV 免费配额消耗估算
 *   - POST ?action=reset_password: 管理员重置指定用户密码
 *   - POST ?action=delete_user: 管理员删除用户并级联清空其 R2/KV 协议数据
 *   - POST ?action=clean_sessions: 清理所有已过期的废弃会话
 */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key, x-auth-token",
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

// 管理员鉴权：支持 x-admin-key 验证，或自动验证当前登录的管理员 Token
async function verifyAdmin(request, env) {
    const targetKey = env.ADMIN_KEY || env.ADMIN_SECRET || env.ADMIN_SECRET_KEY || "admin888";
    const clientKey = request.headers.get("x-admin-key") || new URL(request.url).searchParams.get("adminKey");
    if (clientKey && clientKey === targetKey) return true;

    // 支持以 admin 账号登录的 Session Token 免密直通
    const token = request.headers.get("x-auth-token") ||
                  (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token) {
        const db = env.DB || env.PROTOVIEW_DB;
        const now = Date.now();
        const adminName = (env.ADMIN_USERNAME || "admin").toLowerCase();
        if (db) {
            try {
                const sRow = await db.prepare("SELECT username FROM sessions WHERE token = ? AND expires_at > ?").bind(token, now).first();
                if (sRow && (sRow.username.toLowerCase() === "admin" || sRow.username.toLowerCase() === adminName)) {
                    return true;
                }
            } catch (e) {}
        }
        const kv = env.PROTOVIEW_KV;
        if (kv) {
            try {
                const session = await kv.get("session:" + token, "json");
                if (session && session.username && (session.username.toLowerCase() === "admin" || session.username.toLowerCase() === adminName)) {
                    return true;
                }
            } catch (e) {}
        }
    }
    return false;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders()
    });
}

// GET: 获取全站统计与配额数据
export async function onRequestGet(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "stats";

    if (!await verifyAdmin(request, env)) {
        return new Response(JSON.stringify({ success: false, error: "管理员身份验证失败，请提供正确的后台管理密钥" }), {
            status: 401,
            headers
        });
    }

    const db = env.DB || env.PROTOVIEW_DB;
    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    // 1. 全景数据与配额健康度透视
    if (action === "stats") {
        try {
            const now = Date.now();
            let totalUsers = 0;
            let activeSessions = 0;
            let userList = [];

            // A. 查询 D1 数据库
            if (db) {
                try {
                    const uCountRow = await db.prepare("SELECT COUNT(*) as cnt FROM users").first();
                    totalUsers = uCountRow ? Number(uCountRow.cnt) : 0;

                    const sCountRow = await db.prepare("SELECT COUNT(*) as cnt FROM sessions WHERE expires_at > ?").bind(now).first();
                    activeSessions = sCountRow ? Number(sCountRow.cnt) : 0;

                    const usersRows = await db.prepare(
                        "SELECT username, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 200"
                    ).all();
                    userList = (usersRows && usersRows.results) ? usersRows.results : [];
                } catch (e) {
                    console.warn("Admin: D1 统计异常:", e.message);
                }
            } else if (kv) {
                // 回退走 KV 列举
                try {
                    const uKeys = await kv.list({ prefix: "user:" });
                    totalUsers = (uKeys.keys || []).length;
                    for (const k of (uKeys.keys || [])) {
                        const uName = k.name.replace("user:", "");
                        userList.push({ username: uName, created_at: k.metadata?.createdAt || now });
                    }
                } catch (e) {}
            }

            // B. 查询 R2 或 KV 中的协议总数与存储占用
            let totalProtocols = 0;
            let totalStorageBytes = 0;
            const userProtoMap = {};
            const typeDistribution = { ARINC429: 0, Serial: 0, CAN: 0, Other: 0 };

            if (bucket) {
                try {
                    const listed = await bucket.list({ prefix: "ws:" });
                    for (const obj of (listed.objects || [])) {
                        totalProtocols++;
                        totalStorageBytes += (obj.size || 0);

                        // 解析所属用户名: ws:{username}:proto:...
                        const match = obj.key.match(/^ws:([^:]+):proto:/i);
                        if (match) {
                            const u = match[1].toLowerCase();
                            if (!userProtoMap[u]) userProtoMap[u] = { count: 0, bytes: 0 };
                            userProtoMap[u].count++;
                            userProtoMap[u].bytes += (obj.size || 0);
                        }

                        // 协议类型统计
                        const type = obj.customMetadata?.type || "ARINC429";
                        if (typeDistribution[type] !== undefined) {
                            typeDistribution[type]++;
                        } else {
                            typeDistribution.Other++;
                        }
                    }
                } catch (e) {
                    console.warn("Admin: R2 统计异常:", e.message);
                }
            } else if (kv) {
                try {
                    const listed = await kv.list({ prefix: "ws:" });
                    totalProtocols = (listed.keys || []).length;
                    for (const k of (listed.keys || [])) {
                        const match = k.name.match(/^ws:([^:]+):proto:/i);
                        if (match) {
                            const u = match[1].toLowerCase();
                            if (!userProtoMap[u]) userProtoMap[u] = { count: 0, bytes: 0 };
                            userProtoMap[u].count++;
                            userProtoMap[u].bytes += 50000; // 估算 50KB/协议
                        }
                    }
                    totalStorageBytes = totalProtocols * 50000;
                } catch (e) {}
            }

            // 组合每个用户的详细统计
            const enrichedUsers = userList.map(u => {
                const uName = u.username.toLowerCase();
                const pInfo = userProtoMap[uName] || { count: 0, bytes: 0 };
                return {
                    username: u.username,
                    createdAt: u.created_at,
                    protocolCount: pInfo.count,
                    storageBytes: pInfo.bytes
                };
            });

            // C. Cloudflare 官方免费额度与消耗百分比计算
            const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
            const D1_FREE_BYTES = 5 * 1024 * 1024 * 1024;  // 5 GB
            const estimatedD1Bytes = (totalUsers * 512) + (activeSessions * 256);

            const quotaHealth = {
                r2: {
                    name: "Cloudflare R2 对象存储",
                    usedBytes: totalStorageBytes,
                    totalBytes: R2_FREE_BYTES,
                    percent: Math.min(100, Number(((totalStorageBytes / R2_FREE_BYTES) * 100).toFixed(4))),
                    freeWritesMonthly: 1000000,
                    freeReadsMonthly: 10000000,
                    status: (totalStorageBytes / R2_FREE_BYTES) > 0.85 ? "warning" : "healthy"
                },
                d1: {
                    name: "Cloudflare D1 关系型数据库",
                    usedBytes: estimatedD1Bytes,
                    totalBytes: D1_FREE_BYTES,
                    percent: Math.min(100, Number(((estimatedD1Bytes / D1_FREE_BYTES) * 100).toFixed(6))),
                    freeWritesDaily: 100000,
                    freeReadsDaily: 5000000,
                    status: "healthy"
                },
                workers: {
                    name: "Cloudflare Pages/Workers 运算",
                    freeRequestsDaily: 100000,
                    status: "healthy"
                }
            };

            return new Response(JSON.stringify({
                success: true,
                timestamp: now,
                overview: {
                    totalUsers,
                    activeSessions,
                    totalProtocols,
                    totalStorageBytes,
                    typeDistribution,
                    storageEngine: bucket ? "R2" : "KV",
                    authEngine: db ? "D1" : "KV"
                },
                quotaHealth,
                users: enrichedUsers
            }), {
                status: 200,
                headers
            });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "生成统计失败: " + e.message }), {
                status: 500,
                headers
            });
        }
    }

    return new Response(JSON.stringify({ success: false, error: "未知操作" }), { status: 400, headers });
}

// POST: 管理员维护操作 (重置密码、删除用户、清理废弃会话)
export async function onRequestPost(context) {
    const { request, env } = context;
    const headers = corsHeaders();
    const url = new URL(request.url);

    if (!await verifyAdmin(request, env)) {
        return new Response(JSON.stringify({ success: false, error: "未授权的后台管理操作" }), {
            status: 401,
            headers
        });
    }

    const db = env.DB || env.PROTOVIEW_DB;
    const bucket = env.PROTO_BUCKET || env.PROTOVIEW_R2;
    const kv = env.PROTOVIEW_KV;

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    const action = url.searchParams.get("action") || body.action;

    // 1. 清理过期废弃会话
    if (action === "clean_sessions") {
        let deletedCount = 0;
        const now = Date.now();
        if (db) {
            try {
                const res = await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
                deletedCount = res.meta?.changes || 0;
            } catch (e) {}
        }
        return new Response(JSON.stringify({
            success: true,
            message: `成功清理 ${deletedCount} 个已过期的废弃会话！`
        }), { status: 200, headers });
    }

    // 2. 管理员重置指定用户密码
    if (action === "reset_password") {
        const username = (body.username || "").trim().toLowerCase();
        const newPassword = (body.newPassword || "").trim();

        if (!username || !newPassword || newPassword.length < 6) {
            return new Response(JSON.stringify({ success: false, error: "请提供正确的用户名和不少于6位的新密码" }), {
                status: 400,
                headers
            });
        }

        const salt = crypto.randomUUID();
        const passwordHash = await sha256(`${newPassword}:${salt}`);
        const now = Date.now();

        if (db) {
            try {
                const res = await db.prepare(
                    "UPDATE users SET salt = ?, password_hash = ?, updated_at = ? WHERE username = ?"
                ).bind(salt, passwordHash, now, username).run();

                if (res.meta?.changes === 0) {
                    return new Response(JSON.stringify({ success: false, error: "未找到该用户" }), { status: 404, headers });
                }
                // 注销该用户现有的全部会话，强制重新登录
                await db.prepare("DELETE FROM sessions WHERE username = ?").bind(username).run();

                return new Response(JSON.stringify({ success: true, message: `已成功重置用户 [${username}] 的登录密码！` }), {
                    status: 200,
                    headers
                });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, error: "D1 更新密码失败: " + e.message }), { status: 500, headers });
            }
        } else if (kv) {
            try {
                const user = await kv.get("user:" + username, "json");
                if (!user) {
                    return new Response(JSON.stringify({ success: false, error: "未找到该用户" }), { status: 404, headers });
                }
                user.salt = salt;
                user.passwordHash = passwordHash;
                await kv.put("user:" + username, JSON.stringify(user));
                return new Response(JSON.stringify({ success: true, message: `已成功重置用户 [${username}] 的登录密码！` }), {
                    status: 200,
                    headers
                });
            } catch (e) {}
        }
    }

    // 3. 管理员删除用户 (并彻底销毁其名下的全部协议)
    if (action === "delete_user") {
        const username = (body.username || url.searchParams.get("username") || "").trim().toLowerCase();
        if (!username) {
            return new Response(JSON.stringify({ success: false, error: "请指定要删除的用户名" }), { status: 400, headers });
        }

        let deletedProtocols = 0;

        // A. 删除 R2 中的所有协议文件
        if (bucket) {
            try {
                const prefix = `ws:${username}:proto:`;
                const listed = await bucket.list({ prefix });
                for (const obj of (listed.objects || [])) {
                    await bucket.delete(obj.key);
                    deletedProtocols++;
                }
            } catch (e) {}
        }

        // B. 删除 KV 中的协议和用户
        if (kv) {
            try {
                const prefix = `ws:${username}:proto:`;
                const listed = await kv.list({ prefix });
                for (const k of (listed.keys || [])) {
                    await kv.delete(k.name);
                    deletedProtocols++;
                }
                await kv.delete("user:" + username);
            } catch (e) {}
        }

        // C. 删除 D1 中的用户和会话
        if (db) {
            try {
                await db.batch([
                    db.prepare("DELETE FROM sessions WHERE username = ?").bind(username),
                    db.prepare("DELETE FROM users WHERE username = ?").bind(username)
                ]);
            } catch (e) {}
        }

        return new Response(JSON.stringify({
            success: true,
            message: `已成功删除用户 [${username}] 及其名下的 ${deletedProtocols} 份协议数据！`
        }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ success: false, error: "不支持的维护操作" }), { status: 400, headers });
}
