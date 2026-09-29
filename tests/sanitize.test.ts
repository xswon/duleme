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

  it("blocks SVG, MathML, embedded documents, forms, inline style and srcdoc", () => {
    const html = sanitizeHtml([
      '<svg><a xlink:href="javascript:alert(1)">x</a></svg>',
      '<math><mi xlink:href="data:text/html,x">x</mi></math>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<form action="https://evil.example"><input name="secret"></form>',
      '<p style="background:url(javascript:alert(1))">safe text</p>',
    ].join(""));
    expect(html).not.toMatch(/svg|math|iframe|srcdoc|form|input|style=|xlink/i);
    expect(html).toContain("safe text");
  });

  it("removes dangerous URL schemes while preserving safe article links and images", () => {
    const html = sanitizeHtml([
      '<a href="javascript:alert(1)">bad</a>',
      '<a href="data:text/html,<script>alert(1)</script>">bad2</a>',
      '<a href="https://example.com/story">story</a>',
      '<img src="https://example.com/image.jpg" alt="cover">',
    ].join(""));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a"));
    expect(links[0].hasAttribute("href")).toBe(false);
    expect(links[1].hasAttribute("href")).toBe(false);
    expect(links[2].getAttribute("href")).toBe("https://example.com/story");
    expect(links[2].getAttribute("target")).toBe("_blank");
    expect(links[2].getAttribute("rel")).toBe("noopener noreferrer");
    expect(doc.querySelector("img")?.getAttribute("src")).toBe("https://example.com/image.jpg");
  });

  it("handles malformed nested markup without reintroducing active content", () => {
    const html = sanitizeHtml('<p><b>hello<svg><g/onload=alert(1)//<p>world</p><a href="vbscript:alert(1)">x</a>');
    expect(html).toContain("hello");
    expect(html).toContain("world");
    expect(html).not.toMatch(/onload|vbscript|svg/i);
  });

  it("keeps semantic rich-text elements used by RSS and generated summaries", () => {
    const html = sanitizeHtml('<h2>Heading</h2><blockquote><strong>Point</strong></blockquote><ol start="3"><li>Item</li></ol><table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>');
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h2")?.textContent).toBe("Heading");
    expect(doc.querySelector("blockquote strong")?.textContent).toBe("Point");
    expect(doc.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(doc.querySelector("td")?.getAttribute("colspan")).toBe("2");
  });
});
