import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../src/utils/sanitizeHtml";

describe("sanitizeHtml", () => {
  it("removes executable elements and event handlers", () => {
    const html = sanitizeHtml('<p onclick="alert(1)">ok</p><script>alert(2)</script><img src="javascript:alert(3)">');
    expect(html).toContain("<p>ok</p>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });
});
