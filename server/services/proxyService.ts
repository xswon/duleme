import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_PROXY_BYTES = 15 * 1024 * 1024;
export const MAX_AUDIO_PROXY_BYTES = 512 * 1024 * 1024;
export const EXTERNAL_FETCH_TIMEOUT_MS = 15_000;

function normalizedHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
}

/** Only globally routable addresses may be used by the outbound proxy. */
export function isPublicIpAddress(rawAddress: string): boolean {
  const address = normalizedHostname(rawAddress);
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b, c] = octets;
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (family !== 6) return false;
  if (address === "::" || address === "::1") return false;
  // Deprecated IPv4-compatible forms (for example ::127.0.0.1, normalized
  // by URL to ::7f00:1) must not bypass the IPv4 range checks.
  if (/^::(?:[0-9a-f]{1,4}:)?[0-9a-f]{1,4}$/i.test(address)) return false;
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPublicIpAddress(mapped[1]);
  const mappedHex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPublicIpAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return !(
    /^(?:fc|fd)/i.test(address) ||
    /^fe[89ab]/i.test(address) ||
    /^ff/i.test(address) ||
    /^fec/i.test(address) ||
    /^64:ff9b::/i.test(address) ||
    /^2001:db8(?::|$)/i.test(address)
  );
}

export function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    const host = normalizedHostname(url.hostname);
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    return isIP(host) ? isPublicIpAddress(host) : true;
  } catch { return false; }
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<void> {
  if (!isSafeExternalUrl(rawUrl)) throw new Error("Blocked unsafe external URL");
  const hostname = normalizedHostname(new URL(rawUrl).hostname);
  if (isIP(hostname)) return;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Blocked hostname resolving to a non-public address");
  }
}

export async function fetchSafeExternal(
  rawUrl: string,
  init: RequestInit = {},
  redirects = 3,
  maxBytes = MAX_PROXY_BYTES
): Promise<Response> {
  await assertSafeExternalUrl(rawUrl);
  // Callers that do not manage their own lifetime (RSS and metadata fetches)
  // still need a hard stop. Reuse the same signal for redirects so a redirect
  // chain cannot reset the timeout on every hop.
  const signal = init.signal || AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS);
  const requestInit = { ...init, signal };
  const response = await fetch(rawUrl, { ...requestInit, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    if (!redirects) throw new Error("Too many redirects");
    const location = response.headers.get("location");
    if (!location) throw new Error("Invalid redirect");
    await response.body?.cancel();
    return fetchSafeExternal(new URL(location, rawUrl).toString(), requestInit, redirects - 1, maxBytes);
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("External response too large");
  return response;
}

/** Read a response without ever buffering more than the configured limit. */
export async function readResponseBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("External response too large");
        throw new Error("External response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}
export function refererFor(url: string): string { if (/xyzcdn\\.net|xiaoyuzhoufm\\.com|xyzfm/.test(url)) return "https://www.xiaoyuzhoufm.com/"; if (url.includes("ximalaya.com")) return "https://www.ximalaya.com/"; if (url.includes("latepost.com")) return "https://www.latepost.com/"; if (/sspai\\.com/.test(url)) return "https://sspai.com/"; if (/36kr\\.com/.test(url)) return "https://36kr.com/"; if (/qpic\\.cn|weixin/.test(url)) return "https://mp.weixin.qq.com/"; return ""; }
