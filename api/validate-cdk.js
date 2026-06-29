/**
 * CDK 验证 — 零外部依赖，瞬时响应
 */
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
      status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let cdk;
  try {
    const body = await request.json();
    cdk = (body.cdk || '').trim().toUpperCase();
  } catch {
    return new Response(JSON.stringify({ success: false, reason: 'invalid_json' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!cdk) {
    return new Response(JSON.stringify({ success: false, reason: 'empty_cdk' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const validList = (process.env.CDK_LIST || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  if (validList.length === 0) {
    return new Response(JSON.stringify({ success: false, reason: 'server_not_configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!validList.includes(cdk)) {
    return new Response(JSON.stringify({ success: false, reason: 'invalid_cdk', hint: '激活码无效' }), {
      status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return new Response(JSON.stringify({ success: true, token: 'cdk_' + Date.now(), hint: '激活成功' }), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
