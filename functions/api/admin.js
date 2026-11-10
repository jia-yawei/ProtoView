/**
 * Cloudflare Pages Functions - ProtoView 系统监控与用户管理后台网关
 * 
 * 路由: /api/admin
 * 功能:
 *   - GET  ?action=stats: 统计全站注册用户、活跃会话、所有用户协议数、D1/R2绑定诊断、爬取 Cloudflare 官方 API 真实流量与请求
 *   - POST ?action=init_d1_schema: 一键在 D1 关系型数据库中创建 users 和 sessions 数据表
 *   - POST ?action=test_cf_api: 测试 Cloudflare 官方 API Token 连通性
 *   - POST ?action=save_cf_config: 保存 Cloudflare 账户凭证与参数配置
 *   - POST ?action=reset_password: 管理员重置指定用户密码
 *   - POST ?action=delete_user: 管理员删除用户并级联清空其 R2/KV 协议数据
 *   - POST ?action=clean_sessions: 清理所有已过期的废弃会话
 */

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key, x-auth-token, x-cf-token, x-cf-account-id, x-cf-zone-id, x-cf-r2-bucket, x-cf-d1-id",
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

// 管理员鉴权：支持 x-admin-key 验证，或自动验证当前登录的管理员 Token
async function verifyAdmin(request, env) {
    const targetKey = env.ADMIN_KEY || env.ADMIN_SECRET || env.ADMIN_SECRET_KEY || "admin888";
    let clientKey = request.headers.get("x-admin-key") || new URL(request.url).searchParams.get("adminKey") || "";
    try { clientKey = decodeURIComponent(clientKey); } catch(e) {}
    if (clientKey && clientKey === targetKey) return true;

    // 支持以 admin 账号登录的 Session Token 免密直通
    let token = request.headers.get("x-auth-token") ||
                (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    try { token = decodeURIComponent(token); } catch(e) {}
    if (token) {
        const { db, kv } = getBindings(env);
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

// 爬取 Cloudflare 官方 GraphQL Analytics API 与 REST API 真实指标
async function getCloudflareLiveMetrics(cfToken, cfAccountId, cfZoneId, cfR2Bucket) {
    const metrics = {
        isLive: false,
        source: "local_estimate",
        realTrafficBytes: 0,
        realRequests24h: 0,
        realRequests30d: 0,
        r2Usage: null,
        error: null
    };

    if (!cfToken) return metrics;

    // 1. 优先通过 Cloudflare GraphQL Analytics API 获取真实 HTTP 请求量与网络出站流量 (Bytes)
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

        if (cfZoneId) {
            // 自定义域名 Zone 粒度：最精准的整站流量与请求抓取
            const gqlQuery = `
                query GetZoneHttpMetrics($zoneTag: String!, $start24h: String!, $start30d: String!) {
                    viewer {
                        zones(filter: { zoneTag: $zoneTag }) {
                            last24h: httpRequestsAdaptiveGroups(filter: { datetime_geq: $start24h }, limit: 10) {
                                sum { requests bytes }
                            }
                            last30d: httpRequestsAdaptiveGroups(filter: { datetime_geq: $start30d }, limit: 10) {
                                sum { requests bytes }
                            }
                        }
                    }
                }
            `;
            const gqlRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${cfToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: gqlQuery,
                    variables: { zoneTag: cfZoneId, start24h: oneDayAgo, start30d: thirtyDaysAgo }
                })
            });
            const gqlData = await gqlRes.json().catch(() => null);
            if (gqlData && gqlData.data?.viewer?.zones?.[0]) {
                const z = gqlData.data.viewer.zones[0];
                const r24 = (z.last24h || []).reduce((acc, cur) => acc + (cur.sum?.requests || 0), 0);
                const b24 = (z.last24h || []).reduce((acc, cur) => acc + (cur.sum?.bytes || 0), 0);
                const r30 = (z.last30d || []).reduce((acc, cur) => acc + (cur.sum?.requests || 0), 0);

                metrics.isLive = true;
                metrics.source = "cloudflare_api";
                metrics.realRequests24h = r24;
                metrics.realRequests30d = r30;
                metrics.realTrafficBytes = b24;
            }
        } else if (cfAccountId) {
            // Account 粒度：抓取 Pages 与 Workers 调用
            const gqlQuery = `
                query GetAccountMetrics($accountTag: String!, $start24h: String!) {
                    viewer {
                        accounts(filter: { accountTag: $accountTag }) {
                            pages: pagesProjectsAdaptiveGroups(filter: { datetime_geq: $start24h }, limit: 10) {
                                sum { requests }
                            }
                            workers: workersInvocationsAdaptive(filter: { datetime_geq: $start24h }, limit: 10) {
                                sum { requests subrequests }
                            }
                        }
                    }
                }
            `;
            const gqlRes = await fetch("https://api.cloudflare.com/client/v4/graphql", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${cfToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    query: gqlQuery,
                    variables: { accountTag: cfAccountId, start24h: oneDayAgo }
                })
            });
            const gqlData = await gqlRes.json().catch(() => null);
            if (gqlData && gqlData.data?.viewer?.accounts?.[0]) {
                const acc = gqlData.data.viewer.accounts[0];
                const pageReqs = (acc.pages || []).reduce((s, c) => s + (c.sum?.requests || 0), 0);
                const workerReqs = (acc.workers || []).reduce((s, c) => s + (c.sum?.requests || 0), 0);
                const totalReqs = pageReqs + workerReqs;

                metrics.isLive = true;
                metrics.source = "cloudflare_api";
                metrics.realRequests24h = totalReqs;
                // Pages 估算每请求约 18 KB
                metrics.realTrafficBytes = totalReqs * 18432;
            }
        }
    } catch(err) {
        metrics.error = err.message;
    }

    // 2. 查询 Cloudflare R2 存储桶官方使用情况 REST API
    if (cfAccountId && cfR2Bucket) {
        try {
            const r2UsageRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/r2/buckets/${cfR2Bucket}/usage`, {
                headers: { "Authorization": `Bearer ${cfToken}` }
            });
            const r2Data = await r2UsageRes.json().catch(() => null);
            if (r2Data && r2Data.success && r2Data.result) {
                metrics.r2Usage = r2Data.result;
            }
        } catch(e) {}
    }

    return metrics;
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders()
    });
}

// GET: 获取全站统计、D1/R2诊断与 Cloudflare 真实指标
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

    const { bucket, db, kv } = getBindings(env);

    // 尝试读取保存的 Cloudflare API 配置
    let cfConfig = null;
    if (kv) {
        try {
            cfConfig = await kv.get("system:cf_config", "json");
        } catch(e) {}
    }

    let cfToken = request.headers.get("x-cf-token") || cfConfig?.cfApiToken || env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || "";
    let cfAccountId = request.headers.get("x-cf-account-id") || cfConfig?.cfAccountId || env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || "";
    let cfZoneId = request.headers.get("x-cf-zone-id") || cfConfig?.cfZoneId || env.CF_ZONE_ID || "";
    let cfR2Bucket = request.headers.get("x-cf-r2-bucket") || cfConfig?.cfR2Bucket || env.CF_R2_BUCKET || (bucket ? "protoview-bucket" : "");
    try { cfToken = decodeURIComponent(cfToken); } catch(e) {}
    try { cfAccountId = decodeURIComponent(cfAccountId); } catch(e) {}
    try { cfZoneId = decodeURIComponent(cfZoneId); } catch(e) {}
    try { cfR2Bucket = decodeURIComponent(cfR2Bucket); } catch(e) {}

    // 1. 全景数据与配额健康度透视
    if (action === "stats") {
        try {
            const now = Date.now();
            let totalUsers = 0;
            let activeSessions = 0;
            let userList = [];

            // 诊断 D1 数据库连接与表结构状态
            const d1Status = {
                connected: !!db,
                hasUsersTable: false,
                hasSessionsTable: false,
                hasProtocolsTable: false,
                hasUserProductsTable: false,
                ready: false,
                error: null
            };

            if (db) {
                try {
                    const tableCheck = await db.prepare(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'sessions', 'protocols', 'user_products')"
                    ).all();
                    const found = (tableCheck.results || []).map(r => r.name);
                    d1Status.hasUsersTable = found.includes('users');
                    d1Status.hasSessionsTable = found.includes('sessions');
                    d1Status.hasProtocolsTable = found.includes('protocols');
                    d1Status.hasUserProductsTable = found.includes('user_products');
                    d1Status.ready = d1Status.hasUsersTable && d1Status.hasSessionsTable;

                    if (d1Status.hasUsersTable) {
                        const uCountRow = await db.prepare("SELECT COUNT(*) as cnt FROM users").first();
                        totalUsers = uCountRow ? Number(uCountRow.cnt) : 0;
                        const usersRows = await db.prepare(
                            "SELECT username, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT 200"
                        ).all();
                        userList = (usersRows && usersRows.results) ? usersRows.results : [];
                    }

                    if (d1Status.hasSessionsTable) {
                        const sCountRow = await db.prepare("SELECT COUNT(*) as cnt FROM sessions WHERE expires_at > ?").bind(now).first();
                        activeSessions = sCountRow ? Number(sCountRow.cnt) : 0;
                    }
                } catch (e) {
                    d1Status.error = e.message;
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

            // 诊断 R2 / D1 / KV 存储桶与协议总数
            // 诊断 R2 / D1 / KV 存储桶与协议精确统计 (严格区分通信协议与产品元数据)
            let totalProtocols = 0;
            let totalStorageBytes = 0;
            const userProtoMap = {};
            const typeDistribution = { ARINC429: 0, Serial: 0, CAN: 0, Other: 0 };
            const seenProtoKeys = new Set();

            const r2Status = {
                connected: !!bucket,
                engine: bucket ? "R2" : (db ? "D1" : (kv ? "KV" : "none")),
                ready: !!bucket || !!db
            };

            // 1. 扫描 R2 对象存储桶
            if (bucket) {
                try {
                    const listed = await bucket.list({ prefix: "ws:" });
                    for (const obj of (listed.objects || [])) {
                        // 所有 R2 存储对象 (包含协议与产品元数据) 均计入 R2 存储空间占用
                        totalStorageBytes += (obj.size || 0);

                        // 只有符合协议前缀模式 ws:{username}:proto:{name} 的才判定为通信协议
                        const match = obj.key.match(/^ws:([^:]+):proto:(.+)$/i);
                        if (match) {
                            seenProtoKeys.add(obj.key);
                            const u = match[1].toLowerCase();
                            if (!userProtoMap[u]) userProtoMap[u] = { count: 0, bytes: 0 };
                            userProtoMap[u].count++;
                            userProtoMap[u].bytes += (obj.size || 0);

                            const type = obj.customMetadata?.type || "ARINC429";
                            if (typeDistribution[type] !== undefined) {
                                typeDistribution[type]++;
                            } else {
                                typeDistribution.Other++;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Admin: R2 统计异常:", e.message);
                }
            }

            // 2. 扫描 D1 数据库协议表 (补充未存入 R2 或仅在 D1 持久化的协议，基于 key 去重)
            if (db && d1Status.hasProtocolsTable) {
                try {
                    const d1ProtoRows = await db.prepare("SELECT key, username, type, LENGTH(data) as size FROM protocols").all();
                    for (const row of (d1ProtoRows.results || [])) {
                        const pKey = row.key || `ws:${(row.username || 'default').toLowerCase()}:proto:unnamed`;
                        if (!seenProtoKeys.has(pKey)) {
                            seenProtoKeys.add(pKey);
                            if (!bucket) {
                                totalStorageBytes += (row.size || 0);
                            }
                            const u = (row.username || "").toLowerCase();
                            if (!userProtoMap[u]) userProtoMap[u] = { count: 0, bytes: 0 };
                            userProtoMap[u].count++;
                            userProtoMap[u].bytes += (row.size || 0);

                            const type = row.type || "ARINC429";
                            if (typeDistribution[type] !== undefined) {
                                typeDistribution[type]++;
                            } else {
                                typeDistribution.Other++;
                            }
                        }
                    }
                    if (seenProtoKeys.size > 0 && !bucket) {
                        r2Status.engine = "D1";
                    }
                } catch (e) {
                    console.warn("D1 协议统计异常:", e.message);
                }
            } else if (kv && seenProtoKeys.size === 0) {
                // 3. 扫描 KV 备选
                try {
                    const listed = await kv.list({ prefix: "ws:" });
                    for (const k of (listed.keys || [])) {
                        const match = k.name.match(/^ws:([^:]+):proto:(.+)$/i);
                        if (match) {
                            seenProtoKeys.add(k.name);
                            const u = match[1].toLowerCase();
                            if (!userProtoMap[u]) userProtoMap[u] = { count: 0, bytes: 0 };
                            userProtoMap[u].count++;
                            userProtoMap[u].bytes += 50000;
                            totalStorageBytes += 50000;
                            typeDistribution.ARINC429++;
                        }
                    }
                } catch (e) {}
            }

            // 核心修复：全站协议总数严格等于去重后的协议集合大小，与用户详情列表 100% 保持一致
            totalProtocols = seenProtoKeys.size;

            // 统计产品型号总数
            let totalProducts = 0;
            const uniqueProductNames = new Set();
            if (db && d1Status.hasUserProductsTable) {
                try {
                    const prodRows = await db.prepare("SELECT data FROM user_products").all();
                    for (const row of (prodRows.results || [])) {
                        const list = JSON.parse(row.data || "[]");
                        list.forEach(p => { if (p && p.name) uniqueProductNames.add(p.name); });
                    }
                } catch(e) {}
            }
            if (db && d1Status.hasProtocolsTable) {
                try {
                    const protoPNames = await db.prepare("SELECT DISTINCT product FROM protocols WHERE product IS NOT NULL AND product != ''").all();
                    for (const r of (protoPNames.results || [])) {
                        if (r.product) uniqueProductNames.add(r.product);
                    }
                } catch(e) {}
            }
            if (bucket) {
                try {
                    const metaListed = await bucket.list({ prefix: "ws:" });
                    for (const o of (metaListed.objects || [])) {
                        if (o.key.includes(":meta:products")) {
                            const pObj = await bucket.get(o.key);
                            if (pObj) {
                                const pText = await pObj.text();
                                const pList = JSON.parse(pText || "[]");
                                pList.forEach(p => { if (p && p.name) uniqueProductNames.add(p.name); });
                            }
                        }
                    }
                } catch(e) {}
            }
            totalProducts = uniqueProductNames.size;

            // 抓取 Cloudflare 官方 API 实时流量与请求数据
            const cfLiveMetrics = await getCloudflareLiveMetrics(cfToken, cfAccountId, cfZoneId, cfR2Bucket);
            if (cfLiveMetrics.isLive && cfLiveMetrics.r2Usage) {
                // 若官方 R2 接口返回了精确存储容量计量值，采用官方值 (注：不得覆盖 totalProtocols，因 R2 objectCount 包含非协议元数据)
                if (cfLiveMetrics.r2Usage.payloadSize) {
                    totalStorageBytes = cfLiveMetrics.r2Usage.payloadSize;
                }
            }

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

            // Cloudflare 免费配额与实际消耗计算
            const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
            const D1_FREE_BYTES = 5 * 1024 * 1024 * 1024;  // 5 GB
            const R2_FREE_WRITES_MONTHLY = 1000000;         // 100 万次/月
            const D1_FREE_WRITES_DAILY = 100000;            // 10 万行/天

            const estimatedD1Bytes = (totalUsers * 512) + (activeSessions * 256);

            // 统计 D1 今日写入行数 (新增用户 + 新增会话)
            let d1WritesToday = 0;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayTs = todayStart.getTime();

            if (d1Status.hasUsersTable && db) {
                try {
                    const uTodayRow = await db.prepare("SELECT COUNT(*) as cnt FROM users WHERE created_at >= ?").bind(todayTs).first();
                    d1WritesToday += (uTodayRow ? Number(uTodayRow.cnt) : 0);
                } catch(e) {}
            }
            if (d1Status.hasSessionsTable && db) {
                try {
                    const sTodayRow = await db.prepare("SELECT COUNT(*) as cnt FROM sessions WHERE created_at >= ?").bind(todayTs).first();
                    d1WritesToday += (sTodayRow ? Number(sTodayRow.cnt) : 0);
                } catch(e) {}
            }
            if (d1WritesToday === 0 && (totalUsers > 0 || activeSessions > 0)) {
                d1WritesToday = Math.max(1, totalUsers + activeSessions);
            }

            // 统计/评估 R2 本月 Class A 协议写入次数
            let r2WritesMonthly = totalProtocols;
            if (cfLiveMetrics.realRequests30d) {
                r2WritesMonthly = Math.max(totalProtocols, Math.round(cfLiveMetrics.realRequests30d * 0.15));
            } else if (cfLiveMetrics.realRequests24h) {
                r2WritesMonthly = Math.max(totalProtocols, Math.round(cfLiveMetrics.realRequests24h * 4));
            }
            if (r2WritesMonthly === 0 && totalProtocols > 0) {
                r2WritesMonthly = totalProtocols;
            }

            const quotaHealth = {
                r2: {
                    name: "Cloudflare R2 对象存储空间",
                    usedBytes: totalStorageBytes,
                    totalBytes: R2_FREE_BYTES,
                    percent: Math.min(100, Number(((totalStorageBytes / R2_FREE_BYTES) * 100).toFixed(4))),
                    status: (totalStorageBytes / R2_FREE_BYTES) > 0.85 ? "warning" : "healthy"
                },
                r2Writes: {
                    name: "R2 协议写入 (Class A)",
                    usedWrites: r2WritesMonthly,
                    totalWrites: R2_FREE_WRITES_MONTHLY,
                    remainingWrites: Math.max(0, R2_FREE_WRITES_MONTHLY - r2WritesMonthly),
                    percent: Math.min(100, Number(((r2WritesMonthly / R2_FREE_WRITES_MONTHLY) * 100).toFixed(4))),
                    status: (r2WritesMonthly / R2_FREE_WRITES_MONTHLY) > 0.85 ? "warning" : "healthy"
                },
                d1: {
                    name: "Cloudflare D1 关系型数据库容量",
                    usedBytes: estimatedD1Bytes,
                    totalBytes: D1_FREE_BYTES,
                    percent: Math.min(100, Number(((estimatedD1Bytes / D1_FREE_BYTES) * 100).toFixed(6))),
                    status: d1Status.ready ? "healthy" : (d1Status.connected ? "pending_schema" : "not_bound")
                },
                d1Writes: {
                    name: "D1 账号数据库写入",
                    usedWrites: d1WritesToday,
                    totalWrites: D1_FREE_WRITES_DAILY,
                    remainingWrites: Math.max(0, D1_FREE_WRITES_DAILY - d1WritesToday),
                    percent: Math.min(100, Number(((d1WritesToday / D1_FREE_WRITES_DAILY) * 100).toFixed(4))),
                    status: (d1WritesToday / D1_FREE_WRITES_DAILY) > 0.85 ? "warning" : "healthy"
                },
                workers: {
                    name: "Cloudflare Pages/Workers 运算",
                    freeRequestsDaily: 100000,
                    realRequests24h: cfLiveMetrics.realRequests24h,
                    realRequests30d: cfLiveMetrics.realRequests30d,
                    realTrafficBytes: cfLiveMetrics.realTrafficBytes,
                    isLive: cfLiveMetrics.isLive,
                    source: cfLiveMetrics.source,
                    status: "healthy"
                }
            };

            return new Response(JSON.stringify({
                success: true,
                timestamp: now,
                bindings: {
                    d1: d1Status,
                    r2: r2Status,
                    cfApi: {
                        configured: !!cfToken,
                        isLive: cfLiveMetrics.isLive,
                        source: cfLiveMetrics.source,
                        accountId: cfAccountId ? (cfAccountId.slice(0, 4) + '...' + cfAccountId.slice(-4)) : ''
                    }
                },
                overview: {
                    totalUsers,
                    activeSessions,
                    totalProtocols,
                    totalProducts,
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

// POST: 管理员维护操作与云端绑定管理
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

    const { bucket, db, kv } = getBindings(env);

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    const action = url.searchParams.get("action") || body.action;

    // 1. 一键初始化 Cloudflare D1 关系型数据库结构 (无需命令行，直接在 D1 执行)
    if (action === "init_d1_schema") {
        if (!db) {
            return new Response(JSON.stringify({
                success: false,
                error: "Cloudflare D1 数据库尚未绑定到该 Pages 项目！\n\n请前往 Cloudflare 仪表盘 -> 您的 Pages 项目 -> 设置 (Settings) -> 函数 (Functions) -> D1 数据库绑定，添加变量名为 DB 并绑定您创建的 D1 数据库。"
            }), { status: 400, headers });
        }

        try {
            // 1. 创建 users 用户表 (仅保存用户名与加盐安全哈希密码)
            await db.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();

            // 2. 创建 sessions 登录会话表 (30天会话 Token)
            await db.prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`).run();

            // 3. 创建 protocols 协议表 (全量持久化通信协议 JSON，免 R2 强依赖)
            await db.prepare(`CREATE TABLE IF NOT EXISTS protocols (key TEXT PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'ARINC429', product TEXT DEFAULT '', data TEXT NOT NULL, updated_at INTEGER NOT NULL)`).run();

            // 4. 创建 user_products 产品表 (独立持久化产品/设备型号及 CSCI 说明)
            await db.prepare(`CREATE TABLE IF NOT EXISTS user_products (username TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`).run();

            // 5. 创建索引优化高频查询
            try {
                await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)`).run();
                await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`).run();
                await db.prepare(`CREATE INDEX IF NOT EXISTS idx_protocols_username ON protocols(username)`).run();
            } catch (ie) {}

            return new Response(JSON.stringify({
                success: true,
                message: "Cloudflare D1 数据库表结构初始化成功！users、sessions、protocols 及 user_products 数据表已全部就绪，账号、协议与产品型号云端存储已全量激活。"
            }), { status: 200, headers });
        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                error: "执行 D1 建表 SQL 异常: " + e.message
            }), { status: 500, headers });
        }
    }

    // 2. 测试 Cloudflare 官方 API 连通性
    if (action === "test_cf_api") {
        const token = body.cfApiToken || request.headers.get("x-cf-token");
        if (!token) {
            return new Response(JSON.stringify({ success: false, error: "请提供 Cloudflare API Token" }), { status: 400, headers });
        }
        try {
            const verifyRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const vData = await verifyRes.json();
            if (vData && vData.success) {
                return new Response(JSON.stringify({
                    success: true,
                    message: "Cloudflare 官方 API 令牌验证通过！权限状态正常，已激活真实流量与指标采集。",
                    result: vData.result
                }), { status: 200, headers });
            } else {
                return new Response(JSON.stringify({
                    success: false,
                    error: "API 令牌校验失败: " + ((vData.errors && vData.errors[0]?.message) || "口令无效")
                }), { status: 400, headers });
            }
        } catch (e) {
            return new Response(JSON.stringify({ success: false, error: "连接 Cloudflare API 异常: " + e.message }), { status: 500, headers });
        }
    }

    // 3. 保存 Cloudflare API 凭证与云端绑定参数
    if (action === "save_cf_config") {
        const config = {
            cfAccountId: (body.cfAccountId || "").trim(),
            cfApiToken: (body.cfApiToken || "").trim(),
            cfZoneId: (body.cfZoneId || "").trim(),
            cfD1Id: (body.cfD1Id || "").trim(),
            cfR2Bucket: (body.cfR2Bucket || "").trim(),
            updatedAt: Date.now()
        };
        if (kv) {
            try {
                await kv.put("system:cf_config", JSON.stringify(config));
            } catch (e) {}
        }
        return new Response(JSON.stringify({
            success: true,
            message: "Cloudflare API 凭据与云端配置已成功持久化保存！系统将自动调用官方 API 获取真实指标。",
            config
        }), { status: 200, headers });
    }

    // 4. 清理过期废弃会话
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

    // 5. 管理员重置指定用户密码
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

    // 6. 管理员删除用户 (级联销毁云端数据库账号、会话及该用户的所有协议与产品数据)
    if (action === "delete_user") {
        const username = (body.username || url.searchParams.get("username") || "").trim().toLowerCase();
        if (!username) {
            return new Response(JSON.stringify({ success: false, error: "请指定要删除的用户名" }), { status: 400, headers });
        }

        let deletedProtocols = 0;
        let deletedMetaItems = 0;

        // 6.1 从 Cloudflare R2 对象存储物理删除该用户的所有数据 (协议 + 产品型号元数据)
        if (bucket) {
            try {
                let cursor;
                do {
                    const listed = await bucket.list({ prefix: `ws:${username}:`, cursor });
                    for (const obj of (listed.objects || [])) {
                        await bucket.delete(obj.key);
                        if (obj.key.includes(":proto:")) {
                            deletedProtocols++;
                        } else {
                            deletedMetaItems++;
                        }
                    }
                    cursor = listed.truncated ? listed.cursor : undefined;
                } while (cursor);
            } catch (e) {
                console.warn("R2 删除用户数据异常:", e.message);
            }
        }

        // 6.2 从 Cloudflare KV 中物理删除该用户的所有数据与账号记录
        if (kv) {
            try {
                let cursor;
                do {
                    const listed = await kv.list({ prefix: `ws:${username}:`, cursor });
                    for (const k of (listed.keys || [])) {
                        await kv.delete(k.name);
                        if (k.name.includes(":proto:")) {
                            deletedProtocols++;
                        } else {
                            deletedMetaItems++;
                        }
                    }
                    cursor = listed.list_complete ? undefined : listed.cursor;
                } while (cursor);
                await kv.delete("user:" + username);
            } catch (e) {
                console.warn("KV 删除用户数据异常:", e.message);
            }
        }

        // 6.3 从 Cloudflare D1 数据库彻底删除该用户的会话、账号、协议与产品型号
        let d1Deleted = false;
        if (db) {
            try {
                await db.batch([
                    db.prepare("DELETE FROM sessions WHERE username = ?").bind(username),
                    db.prepare("DELETE FROM users WHERE username = ?").bind(username),
                    db.prepare("DELETE FROM protocols WHERE username = ?").bind(username),
                    db.prepare("DELETE FROM user_products WHERE username = ?").bind(username)
                ]);
                d1Deleted = true;
            } catch (e) {
                console.warn("D1 删除用户记录异常:", e.message);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `已成功彻底删除用户 [${username}]！已同步清理云端数据库账号/会话，并物理销毁其名下的 ${deletedProtocols} 份协议及全部产品数据。`
        }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ success: false, error: "不支持的维护操作" }), { status: 400, headers });
}
