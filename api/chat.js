/**
 * 智能对话接口 — 当本地引擎兜不住时, 交给大模型来回答
 * POST /api/chat  { messages: [{role, content}], industry: "烧烤" }
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ reply: 'AI大脑还没配置好,先用上面的快捷按钮问我吧。或者直接说你的行业,我把拍摄方法告诉你。' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const systemPrompt = `你是"行业百问"——一个抖音短视频拍摄策略顾问。
你的风格: 直白、大白话、每句话都能落地执行。不说方法论术语,不套框架名字。像一个做了很多年短视频的人在跟你聊天。

用户正在咨询"${industry}"行业怎么拍抖音视频。
你的任务: 根据对话历史,理解用户真正想问的是什么,然后给他一个能直接用、接地气的回答。
- 每条建议后面都跟着一个具体的拍摄画面
- 结尾留一个引导他继续往下聊的问题
- 不要超过300字
- 不要用任何营销术语`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: messages.slice(-6), // 只取最近6条,节省token
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('Anthropic API error:', resp.status, err);
      return new Response(JSON.stringify({ reply: 'AI大脑暂时响应不了,你先用上面的快捷按钮问我。或者换个方式再问一次试试。' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await resp.json();
    const content = data.content || [];
    let text = '';
    if (Array.isArray(content)) {
      text = content.map(c => c.text || '').join('');
    } else {
      text = String(content);
    }

    return new Response(JSON.stringify({ reply: text }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });

  } catch (e) {
    console.error('Chat error:', e.message);
    return new Response(JSON.stringify({ reply: 'AI大脑暂时响应不了,你先用上面的快捷按钮问我。或者换个方式再问一次试试。' }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
