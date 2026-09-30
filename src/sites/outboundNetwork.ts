export type SitesFetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class SitesOutboundError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function normalizedHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").split("%")[0].toLowerCase();
}

function ipv4Value(address: string): number | null {
  const parts = normalizedHostname(address).split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((result, part) => result * 256 + Number(part), 0) >>> 0;
}

function ipv6Value(address: string): bigint | null {
  let normalized = normalizedHostname(address);
  if (!normalized.includes(":")) return null;
  const dotted = normalized.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const embedded = ipv4Value(dotted[2]);
    if (embedded === null) return null;
    normalized = `${dotted[1]}${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[\da-f]{1,4}$/i.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const parts = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (parts.length !== 8) return null;
  return parts.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

function ipv4InCidr(address: number, base: number, prefix: number): boolean {
  const shift = 32 - prefix;
  return (address >>> shift) === (base >>> shift);
}

function ipv6InCidr(address: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return (address >> shift) === (base >> shift);
}

function isPublicIpAddress(hostname: string): boolean {
  const v4 = ipv4Value(hostname);
  if (v4 !== null) {
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([base, prefix]) => ipv4InCidr(v4, ipv4Value(base) as number, prefix));
  }

  const v6 = ipv6Value(hostname);
  if (v6 === null) return false;
  if ((v6 >> 32n) === 0xffffn) {
    const embedded = Number(v6 & 0xffff_ffffn);
    return isPublicIpAddress(`${embedded >>> 24}.${(embedded >>> 16) & 255}.${(embedded >>> 8) & 255}.${embedded & 255}`);
  }
  const value = (address: string) => ipv6Value(address) as bigint;
  const blocked: Array<[bigint, number]> = [
    [value("::"), 96], [value("64:ff9b::"), 96], [value("64:ff9b:1::"), 48], [value("100::"), 64],
    [value("2001::"), 32], [value("2001:2::"), 48], [value("2001:10::"), 28], [value("2001:20::"), 28],
    [value("2001:db8::"), 32], [value("2002::"), 16], [value("fc00::"), 7], [value("fe80::"), 10],
    [value("fec0::"), 10], [value("ff00::"), 8],
  ];
  return !blocked.some(([base, prefix]) => ipv6InCidr(v6, base, prefix));
}

const blockedHostnames = new Set([
  "instance-data",
  "instance-data.ec2.internal",
  "metadata.google.internal",
  "metadata.goog",
]);

export function publicHttpUrl(
  rawUrl: string,
  errorPrefix: string,
  invalidCode: string,
  unsafeCode: string,
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SitesOutboundError(`${errorPrefix} URL must be a valid public http/https URL`, 400, invalidCode);
  }
  const hostname = normalizedHostname(url.hostname);
  const isIpLiteral = ipv4Value(hostname) !== null || ipv6Value(hostname) !== null;
  const blockedName = !hostname
    || blockedHostnames.has(hostname)
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.endsWith(".home.arpa");
  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || blockedName
    || (isIpLiteral && !isPublicIpAddress(hostname))
  ) {
    throw new SitesOutboundError(`${errorPrefix} URL must be a public http/https URL`, 400, unsafeCode);
  }
  return url;
}

export interface RedirectFetchOptions {
  fetchImpl: SitesFetchLike;
  signal: AbortSignal;
  maxRedirects: number;
  requestInit: RequestInit;
  validateUrl: (url: string) => URL;
  tooManyRedirectsCode: string;
  invalidRedirectCode: string;
  label: string;
}

export async function fetchWithValidatedRedirects(
  initialUrl: URL,
  options: RedirectFetchOptions,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = initialUrl;
  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await options.fetchImpl(current, {
      ...options.requestInit,
      redirect: "manual",
      signal: options.signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }
    if (redirectCount >= options.maxRedirects) {
      await response.body?.cancel();
      throw new SitesOutboundError(
        `${options.label} redirected too many times`,
        502,
        options.tooManyRedirectsCode,
      );
    }
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) {
      throw new SitesOutboundError(
        `${options.label} redirect did not include a location`,
        502,
        options.invalidRedirectCode,
      );
    }
    current = options.validateUrl(new URL(location, current).toString());
  }
}
