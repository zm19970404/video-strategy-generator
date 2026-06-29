/**
 * CDK 验证接口 — Vercel Serverless Function
 *
 * POST /api/validate-cdk  { cdk: "XXXX-XXXX-XXXX" }
 *
 * 存储: Upstash Redis
 *  Key:  cdk:<code> → JSON { ip, token, createdAt }
 */

// ── 有效 CDK 列表 ──────────────────────────────────────
function getValidCDKs() {
  const raw = process.env.CDK_LIST || '';
  return raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
}

// ── 生成 token ────────────────────────────────────────
function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'cdk_' + result;
}

// ── 获取客户端 IP ────────────────────────────────────
function getClientIP(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP.trim();
  return 'unknown';
}

// ── Redis 辅助 ────────────────────────────────────────
let _redis = null;
async function getRedis() {
  if (_redis) return _redis;
  try {
    const { Redis } = await import('@upstash/redis');
    _redis = Redis.fromEnv();
    return _redis;
  } catch (e) {
    console.error('Redis init error:', e.message);
    return null;
  }
}

async function redisGet(key) {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const raw = await redis.get(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error('Redis read error:', e.message);
    return null;
  }
}

async function redisSet(key, value) {
  try {
    const redis = await getRedis();
    if (!redis) return false;
    await redis.set(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Redis write error:', e.message);
    return false;
  }
}

// ── 主逻辑 ───────────────────────────────────────────
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, reason: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ success: false, reason: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const cdk = (body.cdk || '').trim().toUpperCase();
  if (!cdk) {
    return new Response(JSON.stringify({ success: false, reason: 'empty_cdk' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const validList = getValidCDKs();
  if (validList.length === 0) {
    return new Response(JSON.stringify({ success: false, reason: 'server_not_configured', hint: '服务端未配置激活码列表' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!validList.includes(cdk)) {
    return new Response(JSON.stringify({ success: false, reason: 'invalid_cdk', hint: '请检查激活码是否正确' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const clientIP = getClientIP(request);

  const existing = await redisGet(`cdk:${cdk}`);
  if (existing) {
    if (existing.ip !== clientIP && existing.ip !== 'unknown' && clientIP !== 'unknown') {
      return new Response(JSON.stringify({
        success: false, reason: 'already_used', hint: '该激活码已在其他设备上使用',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response(JSON.stringify({
      success: true, token: existing.token, reused: true, hint: '欢迎回来',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const token = generateToken();
  const record = { ip: clientIP, token, createdAt: new Date().toISOString() };
  const saved = await redisSet(`cdk:${cdk}`, record);

  if (!saved) {
    return new Response(JSON.stringify({
      success: true, token, degraded: true, hint: '验证服务暂时降级，已放行',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return new Response(JSON.stringify({
    success: true, token, hint: '激活成功',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
