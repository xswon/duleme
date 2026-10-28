import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFeedXml, type ParseFeedOptions } from "./rssParser";

const exec = promisify(execFile);
export const WEREAD_ACCOUNT_PATTERN = /^MP_WXS_[0-9]+$/;
export const wereadFeedUrl = (accountId: string): string => {
  if (!WEREAD_ACCOUNT_PATTERN.test(accountId)) throw new Error("Invalid WeRead account ID");
  return `weread:${accountId}`;
};

export interface WeReadSubscription {
  accountId: string;
  title: string;
  cover?: string;
}

export class WeReadBridgeError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

export type WeReadRunner = (args: string[], timeoutMs: number) => Promise<string>;

/** The CLI runs as the same OS user as the local-only Express app. No shell or caller-supplied paths. */
export const runWeReadCli: WeReadRunner = async (args, timeoutMs) => {
  try {
    const { stdout } = await exec("weread-omni", args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (error) {
    const value = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (value.code === "ENOENT") {
      throw new WeReadBridgeError(
        "本地未找到 weread-omni。当前试验版需要先安装并扫码登录 weread-omni。",
        "weread_cli_missing", 501,
      );
    }
    // Never expose upstream response bodies, credential files or tokens in UI errors.
    const diagnostic = [value.stdout, value.stderr].filter(Boolean).join(" ");
    if (/\-2041|human verification/i.test(diagnostic)) {
      throw new WeReadBridgeError("微信读书要求人工验证，请在官方客户端处理后重试。", "weread_challenge", 429);
    }
    if (/authentication|not logged in|credentials|login|401|\-2012/i.test(diagnostic)) {
      throw new WeReadBridgeError("微信读书登录已失效，请重新运行 weread-omni login。", "weread_login_required", 401);
    }
    throw new WeReadBridgeError("微信读书请求失败或超时，请稍后重试。", "weread_upstream_error", 502);
  }
};

function parseCliJson(output: string): Record<string, unknown> {
  if (!output.trim()) {
    throw new WeReadBridgeError("微信读书命令没有输出 JSON，请确认本机 CLI 登录状态。", "weread_empty_output", 502);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(output); } catch {
    // Never echo stdout: it might include upstream account data or session details.
    throw new WeReadBridgeError("微信读书命令没有返回标准 JSON。", "weread_non_json_output", 502);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WeReadBridgeError("微信读书返回的数据无效。", "weread_invalid_response", 502);
  }
  const data = parsed as Record<string, unknown>;
  if (typeof data.error === "string") {
    throw new WeReadBridgeError(
      data.errCode === -2041 ? "微信读书需要人工验证，请在官方客户端完成后重试。" : "微信读书接口返回错误，请检查登录状态。",
      data.errCode === -2041 ? "weread_challenge" : "weread_upstream_error",
      data.errCode === -2041 ? 429 : 502,
    );
  }
  return data;
}

export async function listWeReadSubscriptions(run: WeReadRunner = runWeReadCli): Promise<WeReadSubscription[]> {
  // Use the same invocation proven to work in the user's terminal. An explicit
  // --count may be handled differently by older published CLI versions.
  const output = parseCliJson(await run(["public-accounts", "subscriptions", "--json"], 30_000));
  if (!Array.isArray(output.accounts)) {
    throw new WeReadBridgeError("微信读书订阅列表格式无效。", "weread_invalid_response", 502);
  }
  return output.accounts.flatMap((item): WeReadSubscription[] => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    if (typeof data.accountId !== "string" || !WEREAD_ACCOUNT_PATTERN.test(data.accountId)
      || typeof data.title !== "string" || !data.title.trim()) return [];
    return [{
      accountId: data.accountId,
      title: data.title,
      ...(typeof data.cover === "string" && /^https?:\/\//.test(data.cover) ? { cover: data.cover } : {}),
    }];
  });
}

export async function fetchWeReadFeed(
  accountId: string,
  options: ParseFeedOptions = {},
  run: WeReadRunner = runWeReadCli,
) {
  const feedUrl = wereadFeedUrl(accountId);
  const directory = await mkdtemp(join(tmpdir(), "duleme-weread-"));
  const filename = join(directory, "feed.xml");
  try {
    // The feed generator resolves article bodies and writes a one-time XML snapshot.
    // This bridge invokes it on every refresh, not as a continuously running RSS service.
    const count = Math.max(1, Math.min(50, options.limit ?? 20));
    const output = parseCliJson(await run([
      "public-accounts", "feed", accountId,
      "--format", "rss", "--out", filename, "--limit", String(count), "--json",
    ], 120_000));
    if (output.format !== "rss" || typeof output.itemCount !== "number") {
      throw new WeReadBridgeError("微信读书 RSS 生成结果无效。", "weread_invalid_response", 502);
    }
    const xml = await readFile(filename, "utf8");
    if (Buffer.byteLength(xml) > 15 * 1024 * 1024) {
      throw new WeReadBridgeError("微信读书 RSS 超过大小限制。", "weread_feed_too_large", 413);
    }
    const parsed = parseFeedXml(xml, feedUrl, { ...options, strict: true });
    return {
      ...parsed,
      feedUrl,
      favicon: "",
      feedImage: parsed.feedImage,
      itemCount: parsed.items.length,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
