import { describe, expect, it } from "vitest";
import { publicHttpUrl, SitesOutboundError } from "../src/sites/outboundNetwork";

function expectUnsafe(url: string) {
  try {
    publicHttpUrl(url, "Target", "invalid", "unsafe");
    throw new Error(`Expected unsafe URL to be rejected: ${url}`);
  } catch (error) {
    expect(error).toBeInstanceOf(SitesOutboundError);
    expect((error as SitesOutboundError).code).toBe("unsafe");
  }
}

describe("Sites outbound URL policy", () => {
  it("blocks local, metadata, private, mapped-private, and credential-bearing targets", () => {
    [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "https://metadata.google.internal/",
      "https://service.internal/",
      "https://device.local/",
      "https://user:pass@example.com/",
    ].forEach(expectUnsafe);
  });

  it("accepts ordinary public HTTP(S) origins", () => {
    expect(publicHttpUrl("https://example.com/feed.xml", "Target", "invalid", "unsafe").href)
      .toBe("https://example.com/feed.xml");
    expect(publicHttpUrl("http://8.8.8.8/data", "Target", "invalid", "unsafe").href)
      .toBe("http://8.8.8.8/data");
  });
});
