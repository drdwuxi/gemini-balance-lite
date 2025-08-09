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
      // 1. Parse and select a Groq API Key
      const groqKeysRaw = request.headers.get('x-groq-api-key') || '';
      const groqKeys = groqKeysRaw.split(',').map(k => k.trim()).filter(k => k);
      if (groqKeys.length === 0) {
        return new Response('No Groq API Key provided in x-groq-api-key header', { status: 401 });
      }
      const selectedGroqKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];

      // 2. Construct the target Groq API URL
      const groqApiPath = pathname.substring(groqRoutePrefix.length);
      const targetUrl = `https://api.groq.com/openai/v1${groqApiPath}${search}`;
      console.log(`[Groq Proxy] Forwarding to: ${targetUrl}`);

      // 3. Buffer the request body to avoid stream consumption issues
      const requestBody = await request.arrayBuffer();

      // 4. Create new headers for the outgoing request
      const newHeaders = new Headers();
      // 复制必要的headers
      for (const [key, value] of request.headers.entries()) {
        if (key.toLowerCase() !== 'x-groq-api-key' && 
            key.toLowerCase() !== 'host' &&
            key.toLowerCase() !== 'origin' &&
            key.toLowerCase() !== 'referer') {
          newHeaders.set(key, value);
        }
      }
      newHeaders.set('Authorization', `Bearer ${selectedGroqKey}`);
      newHeaders.set('Content-Type', 'application/json');

      // 5. Forward the request to Groq
      const groqResponse = await fetch(targetUrl, {
        method: request.method,
        headers: newHeaders,
        body: requestBody.byteLength > 0 ? requestBody : undefined,
      });

      // 6. 处理响应headers
      const responseHeaders = new Headers(groqResponse.headers);
      responseHeaders.delete('transfer-encoding');
      responseHeaders.delete('connection');
      responseHeaders.delete('keep-alive');
      responseHeaders.delete('content-encoding');
      responseHeaders.set('Referrer-Policy', 'no-referrer');

      // 7. 返回响应
      return new Response(groqResponse.body, {
        status: groqResponse.status,
        headers: responseHeaders
      });
    }

    // Handle OpenAI-compatible format requests (delegated)
    if (url.pathname.endsWith("/chat/completions") || 
        url.pathname.endsWith("/completions") || 
        url.pathname.endsWith("/embeddings") || 
        url.pathname.endsWith("/models")) {
      return openai.fetch(request);
    }
    
    // --- Gemini API Proxy Logic ---
    const geminiTargetUrl = `https://generativelanguage.googleapis.com${pathname}${search}`;
    const geminiHeaders = new Headers();
    
    for (const [key, value] of request.headers.entries()) {
      if (key.trim().toLowerCase() === 'x-goog-api-key') {
        const apiKeys = value.split(',').map(k => k.trim()).filter(k => k);
        if (apiKeys.length > 0) {
          const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
          console.log(`[Gemini Proxy] Selected API Key: ${selectedKey}`);
          geminiHeaders.set('x-goog-api-key', selectedKey);
        }
      } else if (key.trim().toLowerCase() === 'content-type') {
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
    geminiResponseHeaders.set('Referrer-Policy', 'no-referrer');

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