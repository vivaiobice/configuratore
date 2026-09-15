function hex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function newResumeToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes);
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value ?? ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return hex(new Uint8Array(digest));
}

export function buildResumeUrl(baseUrl, publicCode, token) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('project', String(publicCode));
  url.searchParams.set('token', String(token));
  return url.toString();
}

export function parseResumeParams(value) {
  const url = value instanceof URL ? value : new URL(value);
  const publicCode = url.searchParams.get('project');
  const token = url.searchParams.get('token');
  return publicCode && token ? { publicCode, token } : null;
}
