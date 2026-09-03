// modelService.js — AI brain that powers Arohi.
// Supports two engines:
//   'gemini'  -> Google Gemini API (default)
//   'local'   -> Ollama (gemma-teenager / local model)
// You can switch at runtime via setModel(). main.js exposes this in the UI.

import CONFIG from './config.js';
import { SYSTEM_PROMPT } from './persona.js';

const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const OLLAMA_MODEL = 'gemma4:latest';
const GEMINI_MODEL = 'gemini-3.8-flash';

let currentModel = 'gemini';

export function setModel(m) { currentModel = (m === 'local' || m === 'gemini') ? m : 'gemini'; }
export function getModel() { return currentModel; }

export async function checkModelStatus(statusEl) {
  // Tell the UI whether the active engine is ready.
  if (currentModel === 'gemini') {
    if (CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.indexOf('YOUR_') !== 0) {
      return true; // key present; presence check only (don't burn quota)
    }
    return false;
  }
  // local / ollama
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Main entry point. Returns the model's reply (with motion/expression tags intact).
export async function chatWithAI(userMessage) {
  if (currentModel === 'gemini') {
    return chatWithGemini(userMessage);
  }
  return chatWithOllama(userMessage);
}

async function chatWithGemini(userMessage) {
  const key = CONFIG.GEMINI_API_KEY;
  if (!key || key.indexOf('YOUR_') === 0) {
    throw new Error('Gemini API key is not set. Switching to local model...');
  }

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 320,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  // Active Gemini 3-series models as of Sept 2026 (flash = fast, cheap, ideal
  // for conversational chat). Latest first.
  const modelCandidates = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

  let lastError = '';
  for (const modelName of modelCandidates) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent';
    let res;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 25000);
      res = await fetch(url + '?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
    } catch (e) {
      lastError = 'timeout/network: ' + e.message;
      continue;
    }

    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j.error && j.error.status; } catch (e) {}
      lastError = 'HTTP ' + res.status + (detail ? ' (' + detail + ')' : '');
      // 404 / NOT_FOUND -> try next model. 401/403/429 -> key problem, give up.
      if (res.status !== 404 && res.status !== 400) {
        throw new Error('Gemini HTTP ' + res.status + '. Trying local...');
      }
      continue;
    }

    const data = await res.json();
    let fullText = (data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts || [])
      .map((p) => (p.text || '')).join('');
    if (fullText) return parseReply(fullText);
    lastError = 'empty response';
  }

  throw new Error('Gemini failed (' + lastError + '). Trying local model...');
}

async function chatWithOllama(userMessage) {
  const payload = {
    model: OLLAMA_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    stream: true,
  };

  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error('Ollama network error: ' + e.message + '. Is Ollama running?');
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error('Ollama HTTP ' + response.status + ': ' + body);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message && json.message.content) fullText += json.message.content;
      } catch (e) { /* skip */ }
    }
  }

  if (!fullText) throw new Error('Ollama returned an empty response.');
  return parseReply(fullText);
}

// Strips motion tags out of the reply but keeps track of them, and pulls the
// leading *expression* marker out so the chat stays clean while main.js can
// still use it for face + gesture syncing.
function parseReply(text) {
  const motionRegex = /\[motion:\s*(\w+)\]/gi;
  const motionTags = [...text.matchAll(motionRegex)].map((m) => m[1]);
  let cleanText = text.replace(motionRegex, '').trim();
  const exprMatch = cleanText.match(/^(\s*\*[^*]+\*\s*)/);
  const expression = exprMatch ? exprMatch[1].trim() : '';
  if (exprMatch) cleanText = cleanText.replace(/^\s*\*[^*]+\*\s*/, '').trim();
  return { cleanText, motionTags, expression };
}
