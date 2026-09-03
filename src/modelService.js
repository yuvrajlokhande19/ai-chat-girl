// modelService.js — AI brain that powers Arohi.
// Supports two engines:
//   'gemini'  -> Google Gemini Interactions API (default, 2026)
//   'local'   -> Ollama (gemma4:latest / local model)
// You can switch at runtime via setModel(). main.js exposes this in the UI.

import CONFIG from './config.js';
import { SYSTEM_PROMPT } from './persona.js';

const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const OLLAMA_MODEL = 'gemma4:latest';
const GEMINI_MODEL = 'gemini-3.6-flash';

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

// Gemini Interactions API (the 2026 default interface; generateContent is legacy).
// Endpoint & payload follow: https://ai.google.dev/api/interactions-api
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
// Models verified available for the Arohi key: gemini-3.6-flash (confirmed 200).
const GEMINI_MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];

async function chatWithGemini(userMessage) {
  const key = CONFIG.GEMINI_API_KEY;
  if (!key || key.indexOf('YOUR_') === 0) {
    throw new Error('Gemini API key is not set. Switching to local model...');
  }

  let lastError = '';
  for (const modelName of GEMINI_MODEL_CANDIDATES) {
    const body = {
      model: modelName,
      input: userMessage,
      system_instruction: SYSTEM_PROMPT,
      store: false,
      generation_config: {
        thinking_level: 'low',
        temperature: 1.0,
        max_output_tokens: 360,
      },
    };
    // Google Search grounding is opt-in via config. On free tiers it 429s,
    // so it stays OFF by default to keep Gemini working for normal chat.
    if (CONFIG.GEMINI_GOOGLE_SEARCH) body.tools = [{ type: 'google_search' }];

    let res;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 40000);
      res = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
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
      // 404 / NOT_FOUND -> model unavailable -> try next candidate.
      // 401/403 -> bad key; 429 -> quota exhausted: both give up to local.
      if (res.status !== 404) {
        throw new Error('Gemini HTTP ' + res.status + (detail ? ' (' + detail + ')' : '') + '. Trying local...');
      }
      continue;
    }

    const data = await res.json();
    const fullText = extractInteractionText(data);
    if (fullText) return parseReply(fullText);
    lastError = 'empty response';
  }

  throw new Error('Gemini failed (' + lastError + '). Trying local model...');
}

// Pulls the final model text out of an Interactions API response.
// Response shape: { steps: [ { type:'model_output', content:[ { type:'text', text } ] } ] }
function extractInteractionText(data) {
  const steps = data && data.steps;
  if (!Array.isArray(steps)) return '';
  let out = '';
  for (const step of steps) {
    if (step && step.type === 'model_output' && Array.isArray(step.content)) {
      for (const block of step.content) {
        if (block && block.type === 'text' && block.text) out += block.text;
      }
    }
  }
  return out.trim();
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
