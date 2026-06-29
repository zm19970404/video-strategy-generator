/**
 * CDK 验证接口 — Vercel Serverless Function
 *
 * POST /api/validate-cdk  { cdk: "XXXX-XXXX-XXXX" }
 *
 * 逻辑:
 *  1. 检查 CDK 是否在有效列表中
 *  2. 检查该 CDK 是否已被其他 IP 使用
 *  3. 同一个 IP 可以多次使用同一个 CDK (设备重装等场景)
 *  4. CDK 通过后返回 token, 前端存 localStorage
 *
 * 存储: Vercel KV
 *  Key:  cdk:<code> → { ip, createdAt, token }
 *  Key:  ip:<ip>    → { lastAccess, activations }
 */

// ── 有效 CDK 列表 (从环境变量读取, 逗号分隔) ──────────────
function getValidCDKs() {
  const raw = process.env.CDK_LIST || '';
  return raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
}

// ── 生成 token ──────────────────────────────────────────
function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'cdk_' + result;
}

// ── 获取客户端 IP ──────────────────────────────────────
function getClientIP(request) {
  // Vercel 会把真实 IP 放在 x-forwarded-for 或 x-real-ip
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP.trim();
  return 'unknown';
}

// ── KV 读取辅助 ────────────────────────────────────────
async function kvGet(key) {
  try {
    const { kv } = await import('@vercel/kv');
    return await kv.get(key);
  } catch (e) {
    // KV 不可用时降级: 允许访问 (不阻塞用户)
    console.error('KV read error:', e.message);
    return null;
  }
}

async function kvSet(key, value) {
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, value);
    return true;
  } catch (e) {
    console.error('KV write error:', e.message);
    return false;
  }
}

// ── 主逻辑 ─────────────────────────────────────────────
export default async function handler(request) {
  // CORS
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
  try {
    body = await request.json();
  } catch {
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
    return new Response(JSON.stringify({ success: false, reason: 'server_not_configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 检查 CDK 是否在有效列表中
  if (!validList.includes(cdk)) {
    return new Response(JSON.stringify({ success: false, reason: 'invalid_cdk', hint: '请检查激活码是否正确' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const clientIP = getClientIP(request);

  // 检查该 CDK 是否已被使用
  const existing = await kvGet(`cdk:${cdk}`);
  if (existing) {
    // 已被使用 — 检查是否为同一 IP
    if (existing.ip !== clientIP && existing.ip !== 'unknown' && clientIP !== 'unknown') {
      return new Response(JSON.stringify({
        success: false,
        reason: 'already_used',
        hint: '该激活码已在其他设备上使用',
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    // 同一 IP — 允许复用, 返回已有 token
    return new Response(JSON.stringify({
      success: true,
      token: existing.token,
      reused: true,
      hint: '欢迎回来',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 首次使用 — 记录到 KV
  const token = generateToken();
  const record = {
    ip: clientIP,
    token,
    createdAt: new Date().toISOString(),
  };

  const saved = await kvSet(`cdk:${cdk}`, record);
  if (!saved) {
    // KV 挂了 — 降级允许访问
    return new Response(JSON.stringify({
      success: true,
      token,
      degraded: true,
      hint: '验证服务暂时降级，已放行',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    token,
    hint: '激活成功',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
