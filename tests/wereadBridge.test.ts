import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import {
  fetchWeReadFeed, listWeReadSubscriptions, WeReadBridgeError, wereadFeedUrl,
  type WeReadRunner,
} from "../server/services/wereadBridge";

describe("local WeRead bridge", () => {
  it("allows only canonical subscribed-account IDs", () => {
    expect(wereadFeedUrl("MP_WXS_2396392481")).toBe("weread:MP_WXS_2396392481");
    expect(() => wereadFeedUrl("MP_WXS_1;touch /tmp/test")).toThrow("Invalid WeRead account ID");
    expect(() => wereadFeedUrl("https://example.com")).toThrow("Invalid WeRead account ID");
  });

  it("returns only validated subscription metadata", async () => {
    const run: WeReadRunner = async (args) => {
      expect(args).toEqual(["public-accounts", "subscriptions", "--json"]);
      return JSON.stringify({ accounts: [
        { accountId: "MP_WXS_2396392481", title: "刘润", cover: "http://wx.qlogo.cn/logo" },
        { accountId: "MP_WXS_1;bad", title: "invalid" },
        { accountId: "MP_WXS_2", title: "" },
      ] });
    };
    expect(await listWeReadSubscriptions(run)).toEqual([
      { accountId: "MP_WXS_2396392481", title: "刘润", cover: "http://wx.qlogo.cn/logo" },
    ]);
  });

  it("generates parsed articles without an externally accessible RSS service", async () => {
    const run: WeReadRunner = async (args) => {
      expect(args.slice(0, 3)).toEqual(["public-accounts", "feed", "MP_WXS_2396392481"]);
      const filename = args[args.indexOf("--out") + 1];
      await writeFile(filename, `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <title>刘润</title><link>https://weread.qq.com/</link>
      <item><guid>MP_WXS_2396392481_review1</guid><title>最新文章</title>
      <link>https://mp.weixin.qq.com/s/example</link><pubDate>Wed, 28 Oct 2026 08:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>正文</p>]]></content:encoded></item>
      </channel></rss>`, "utf8");
      return JSON.stringify({ format: "rss", itemCount: 1 });
    };
    const result = await fetchWeReadFeed("MP_WXS_2396392481", {}, run);
    expect(result.feedUrl).toBe("weread:MP_WXS_2396392481");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "MP_WXS_2396392481_review1", title: "最新文章", content: "<p>正文</p>",
    });
  });

  it("rejects bad CLI responses instead of silently importing an empty feed", async () => {
    const invalid: WeReadRunner = async () => "not json";
    await expect(listWeReadSubscriptions(invalid)).rejects.toMatchObject({ code: "weread_non_json_output" });
    const empty: WeReadRunner = async () => "";
    await expect(listWeReadSubscriptions(empty)).rejects.toMatchObject({ code: "weread_empty_output" });
    const blocked: WeReadRunner = async () => JSON.stringify({ error: "challenge", errCode: -2041 });
    await expect(listWeReadSubscriptions(blocked)).rejects.toMatchObject({ code: "weread_challenge" });
  });
});
