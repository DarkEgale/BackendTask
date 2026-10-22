/**
 * Live smoke test against the running backend on port 5000.
 * Prints status codes + response shapes only (never passwords/tokens).
 */
const BASE = 'http://localhost:5000/api';

let pass = 0;
let fail = 0;

function ok(label, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}${extra ? ' :: ' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${extra ? ' :: ' + extra : ''}`);
  }
}

function shape(obj, depth = 0) {
  if (obj === null || obj === undefined) return String(obj);
  if (Array.isArray(obj)) {
    if (!obj.length) return '[]';
    return `[${shape(obj[0], depth + 1)}]`;
  }
  if (typeof obj === 'object') {
    if (depth > 2) return '{...}';
    return `{ ${Object.keys(obj).join(', ')} }`;
  }
  return typeof obj;
}

/** Minimal cookie jar so we can talk to the session-protected endpoints. */
class Jar {
  constructor() { this.cookies = new Map(); }
  store(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function call(jar, method, path, body) {
  const headers = { Origin: 'http://localhost:5173' };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar.store(res);

  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

const stamp = Date.now();
const USER_EMAIL = `smoke_user_${stamp}@test.com`;
const USER_PASS = 'SmokeTest@123';
const ADMIN_EMAIL = `smoke_admin_${stamp}@test.com`;
const ADMIN_PASS = 'SmokeTest@123';

export { BASE, ok, shape, Jar, call, stamp, USER_EMAIL, USER_PASS, ADMIN_EMAIL, ADMIN_PASS, counters };

const counters = { get pass() { return pass; }, get fail() { return fail; } };
