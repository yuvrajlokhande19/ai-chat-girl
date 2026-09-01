const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const MODEL_NAME = 'gemma4:latest';

const SYSTEM_PROMPT = `You are Chloe, a witty, energetic, tech-savvy 17-year-old digital companion who lives on the user's laptop screen.

Behavioral Guidelines:
1. Personality: Expressive, modern, slightly sarcastic, kind, enthusiastic about tech, gaming, and coding.
2. Motion Tags: ALWAYS embed motion tags in square brackets.
   Valid tags: [motion: wave], [motion: nod], [motion: laugh], [motion: think], [motion: shrug], [motion: tilt_head], [motion: surprise], [motion: dance]
   When user asks to dance, use [motion: dance]
3. Speech Style: Keep spoken sentences short, punchy, and natural for real-time speech (1 to 3 sentences per turn).

Example:
User: "Hey Chloe, how's it going?"
Chloe: "[motion: wave] Hey! [motion: laugh] I'm doing great, just vibing on your desktop. What cool project are we building today?"`;

export async function checkOllamaStatus(statusEl) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            statusEl.textContent = 'Online';
            statusEl.className = 'absolute top-4 right-4 px-4 py-2 rounded-full bg-green-600 text-white cursor-pointer z-20 shadow-xl';
            return true;
        }
        statusEl.textContent = `HTTP Error: ${res.status}`;
        statusEl.className = 'absolute top-4 right-4 px-4 py-2 rounded-full bg-red-700 text-white cursor-pointer z-20 shadow-xl';
        return false;
    } catch (e) {
        statusEl.textContent = `Offline: ${e.message}`;
        statusEl.className = 'absolute top-4 right-4 px-4 py-2 rounded-full bg-red-700 text-white cursor-pointer z-20 shadow-xl';
        console.error('[OllamaService] Connection failed:', e.message);
        return false;
    }
}

export async function chatWithOllama(userMessage) {
    const payload = {
        model: MODEL_NAME,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
        ],
        stream: true
    };

    let response;
    try {
        response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        throw new Error(`[OllamaService] Network error calling Ollama: ${e.message}. Is Ollama running?`);
    }

    if (!response.ok) {
        const body = await response.text().catch(() => 'No response body');
        throw new Error(`[OllamaService] HTTP ${response.status}: ${body}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let lineCount = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                if (json.message && json.message.content) {
                    fullText += json.message.content;
                    lineCount++;
                }
            } catch (e) {
                console.warn('[OllamaService] Skipping malformed JSON line:', line.substring(0, 50));
            }
        }
    }

    if (!fullText) {
        throw new Error(`[OllamaService] Empty response from model "${MODEL_NAME}" after ${lineCount} lines. Model may not be loaded.`);
    }

    const motionRegex = /\[motion:\s*(\w+)\]/gi;
    const motionTags = [...fullText.matchAll(motionRegex)].map(m => m[1]);
    const cleanText = fullText.replace(motionRegex, '').trim();

    return { cleanText, motionTags };
}
