import { handleVerification } from './verify_keys.js';
import openai from './openai.mjs';

export async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search;

  const groqRoutePrefix = '/groq';

  try {
    // --- Groq API Proxy Logic ---
    if (pathname.startsWith(groqRoutePrefix)) {
      // 1. 支持多种API Key传递方式
      let selectedGroqKey = '';
      
      // 方式1: 从 x-groq-api-key header 获取
      const groqKeysRaw = request.headers.get('x-groq-api-key') || '';
      const groqKeys = groqKeysRaw.split(',').map(k => k.trim()).filter(k => k);
      
      // 方式2: 从 Authorization header 获取 (Sider 常用方式)
      const authHeader = request.headers.get('authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        const authKey = authHeader.substring(7).trim();
        if (authKey) {
          groqKeys.push(authKey);
        }
      }
      
      if (groqKeys.length === 0) {
        return new Response('No Groq API Key provided. Use x-groq-api-key header or Authorization: Bearer header', { status: 401 });
      }
      
      selectedGroqKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];

      // 2. 构建目标URL
      const groqApiPath = pathname.substring(groqRoutePrefix.length);
      const targetUrl = `https://api.groq.com${groqApiPath}${search}`;
      console.log(`[Groq Proxy] Forwarding to: ${targetUrl}`);

      // 3. 处理请求体
      const requestBody = await request.arrayBuffer();

      // 4. 构建新的headers
      const newHeaders = new Headers();
      for (const [key, value] of request.headers.entries()) {
        if (key.toLowerCase() !== 'x-groq-api-key' && 
            key.toLowerCase() !== 'authorization' &&
            key.toLowerCase() !== 'host' &&
            key.toLowerCase() !== 'origin' &&
            key.toLowerCase() !== 'referer') {
          newHeaders.set(key, value);
        }
      }
      newHeaders.set('Authorization', `Bearer ${selectedGroqKey}`);
      newHeaders.set('Content-Type', 'application/json');

      // 5. 转发请求
      const groqResponse = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: requestBody.byteLength > 0 ? requestBody : undefined,
      });

      // 6. 处理响应
      const responseHeaders = new Headers(groqResponse.headers);
      responseHeaders.delete('transfer-encoding');
      responseHeaders.delete('connection');
      responseHeaders.delete('keep-alive');
      responseHeaders.delete('content-encoding');
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-groq-api-key');

      return new Response(groqResponse.body, {
        status: groqResponse.status,
        headers: responseHeaders
      });
    }

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-groq-api-key, x-goog-api-key',
        },
      });
    }

    // --- 其他路由处理 ---
    if (pathname === '/' || pathname === '/index.html') {
      return new Response('Proxy is Running! More Details: https://github.com/tech-shrimp/gemini-balance-lite', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (pathname === '/verify' && request.method === 'POST') {
      return handleVerification(request);
    }

    // Handle OpenAI-compatible format requests (delegated)
    if (url.pathname.endsWith("/chat/completions") || 
        url.pathname.endsWith("/completions") || 
        url.pathname.endsWith("/embeddings") || 
        url.pathname.endsWith("/models")) {
      return openai.fetch(request);
    }
    
    // --- Gemini API Proxy Logic (同样支持Authorization header) ---
    const geminiTargetUrl = `https://generativelanguage.googleapis.com${pathname}${search}`;
    const geminiHeaders = new Headers();
    
    // 支持多种API Key传递方式
    let geminiApiKey = '';
    const geminiKeysRaw = request.headers.get('x-goog-api-key') || '';
    const geminiKeys = geminiKeysRaw.split(',').map(k => k.trim()).filter(k => k);
    
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const authKey = authHeader.substring(7).trim();
      if (authKey) {
        geminiKeys.push(authKey);
      }
    }
    
    if (geminiKeys.length > 0) {
      geminiApiKey = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];
      geminiHeaders.set('x-goog-api-key', geminiApiKey);
    }
    
    for (const [key, value] of request.headers.entries()) {
      if (key.trim().toLowerCase() === 'content-type') {
        geminiHeaders.set('Content-Type', value);
      }
    }

    console.log(`[Gemini Proxy] Forwarding to: ${geminiTargetUrl}`);
    const geminiResponse = await fetch(geminiTargetUrl, {
      method: request.method,
      headers: geminiHeaders,
      body: request.body
    });

    const geminiResponseHeaders = new Headers(geminiResponse.headers);
    geminiResponseHeaders.delete('transfer-encoding');
    geminiResponseHeaders.delete('connection');
    geminiResponseHeaders.delete('keep-alive');
    geminiResponseHeaders.delete('content-encoding');
    geminiResponseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(geminiResponse.body, {
      status: geminiResponse.status,
      headers: geminiResponseHeaders
    });

  } catch (err) {
    console.error(`[Request Error] Path: ${pathname}, Error:`, err);
    return new Response(`Internal Server Error: ${err.message || err}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}