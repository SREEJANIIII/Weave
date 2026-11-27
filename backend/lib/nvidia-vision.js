// NVIDIA vision helper for appliance documents. Image input is verified before any
// image-bearing request is sent: catalog metadata is used when available, otherwise a
// tiny probe image is submitted. A model without image support produces a clear error,
// never a silent text-only substitute.
export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const BASE_URL = (process.env.NVIDIA_NIM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
export const VISION_MODEL = process.env.NVIDIA_VISION_MODEL || process.env.NVIDIA_MODEL || process.env.WEAVE_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b';

// A small generated image with visible text. Blank/tiny images are rejected by the
// provider's media screening, so the probe must look like a genuine document image.
async function probeImageUrl() {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('OK', 28, 78);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

const verified = new Map();

export class VisionUnsupportedError extends Error {
  constructor(model, detail = '') {
    super(`The configured NVIDIA model ${model} does not accept image input.${detail ? ` ${detail}` : ' Set NVIDIA_VISION_MODEL to a vision-capable model.'}`);
    this.name = 'VisionUnsupportedError';
  }
}

function apiKey() {
  return String(process.env.NVIDIA_API_KEY || '').trim();
}

async function request(url, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const key = apiKey();
  if (!key) throw new Error('NVIDIA_API_KEY is required for document extraction. Set it in backend/.env.');
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(Number(process.env.NVIDIA_REQUEST_TIMEOUT_MS) || 60_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text for error reporting.
  }
  if (!res.ok) {
    const detail = json?.error?.message || json?.detail || json?.message || text.slice(0, 240);
    const error = new Error(detail || `NVIDIA returned HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

function explicitModalities(entry) {
  const raw = entry?.input_modalities ?? entry?.modalities?.input ?? entry?.input_modalities_supported;
  return Array.isArray(raw) ? raw.map((x) => String(x).toLowerCase()) : null;
}

/** Returns { supported, model, method }. Re-checks after an API key or model change. */
export async function verifyImageInput({ model = VISION_MODEL, fetchImpl = fetch, force = false } = {}) {
  const key = `${BASE_URL}|${model}|${apiKey().slice(0, 12)}`;
  if (!force && verified.has(key)) return verified.get(key);
  if (!/^[\w.\-/]+$/.test(model)) throw new Error(`Invalid NVIDIA model id: ${model}`);

  let entry = null;
  try {
    entry = await request(`${BASE_URL}/models/${model}`, { fetchImpl });
  } catch (error) {
    if (error.status === 404) throw new Error(`NVIDIA model ${model} was not found. Set NVIDIA_VISION_MODEL to an available model.`);
    throw error;
  }
  const modalities = explicitModalities(entry);
  if (modalities && !modalities.some((x) => x.includes('image') || x.includes('vision'))) {
    throw new VisionUnsupportedError(model, `The catalog lists input modalities: ${modalities.join(', ')}.`);
  }
  if (modalities) {
    const result = { supported: true, model, method: 'catalog' };
    verified.set(key, result);
    return result;
  }

  // The hosted catalog does not publish modalities for every model: probe with a real image.
  const probeUrl = await probeImageUrl();
  try {
    await request(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      fetchImpl,
      body: {
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }, { type: 'image_url', image_url: { url: probeUrl } }] }],
        max_tokens: 16,
        temperature: 0,
      },
    });
  } catch (error) {
    if (/image|vision|multimodal|media|unsupported|does not support/i.test(error.message)) throw new VisionUnsupportedError(model, error.message);
    throw error;
  }
  const result = { supported: true, model, method: 'probe' };
  verified.set(key, result);
  return result;
}

/** Robust JSON extraction from a model response (possibly fenced or preceded by prose). */
export function parseJsonObject(text) {
  if (!text) return null;
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? String(text);
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(fenced.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function chat(body, fetchImpl) {
  const budget = Number(process.env.NVIDIA_VISION_MAX_TOKENS) || 8192;
  let lastReasoning = '';
  // Reasoning models can spend their whole budget before emitting the JSON answer.
  // Retry once with a larger budget rather than inventing a result.
  for (const max_tokens of [budget, budget * 2]) {
    const json = await request(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      fetchImpl,
      body: { model: VISION_MODEL, temperature: 0.1, max_tokens, ...body },
    });
    const message = json?.choices?.[0]?.message ?? {};
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (content) return content;
    lastReasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content.slice(-160) : '';
  }
  throw new Error(`NVIDIA returned no answer${lastReasoning ? ` (reasoning ended with: ${lastReasoning})` : ''}. Raise NVIDIA_VISION_MAX_TOKENS if the model keeps spending its budget reasoning.`);
}

/** Text-only extraction. Does not require image support. */
export async function extractFromText(prompt, text, fetchImpl = fetch) {
  const content = await chat({ messages: [{ role: 'user', content: `${prompt}\n\nDOCUMENT TEXT:\n${text}` }] }, fetchImpl);
  const parsed = parseJsonObject(content);
  if (!parsed) throw new Error('NVIDIA did not return valid JSON for this document.');
  return parsed;
}

/** Image-bearing extraction. The capability check runs first and cannot be bypassed. */
export async function extractFromImages(prompt, images, fetchImpl = fetch) {
  await verifyImageInput({ fetchImpl });
  const contentParts = [{ type: 'text', text: prompt }];
  for (const image of images) {
    contentParts.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${Buffer.from(image.buffer).toString('base64')}` } });
  }
  const content = await chat({ messages: [{ role: 'user', content: contentParts }] }, fetchImpl);
  const parsed = parseJsonObject(content);
  if (!parsed) throw new Error('NVIDIA did not return valid JSON for this document.');
  return { ...parsed, images_analysed: images.length };
}
