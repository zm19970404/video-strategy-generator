/**
 * LLM 兜底 — 调用 DeepSeek API
 * POST /api/chat  { messages: [...], industry: "烧烤" }
 */
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const messages = body.messages || [];
  const industry = body.industry || '';
  if (!messages.length) {
    return new Response(JSON.stringify({ error: 'empty_messages' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ reply: '' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const systemMsg = `你是"行业百问"——抖音短视频拍摄策略顾问。风格:直白接地气，每句话都能落地。不说方法论术语。用户在做"${industry}"行业。根据对话历史理解他真正想问什么，给直接能用的建议+具体拍摄画面。不超过300字。结尾留一个引导他继续聊的问题。`;

  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 600,
        messages: [{ role: 'system', content: systemMsg }, ...messages.slice(-8)],
      }),
    });

    if (!resp.ok) {
      console.error('DeepSeek error:', resp.status);
      return new Response(JSON.stringify({ reply: '' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ reply: text }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    console.error('Chat error:', e.message);
    return new Response(JSON.stringify({ reply: '' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
