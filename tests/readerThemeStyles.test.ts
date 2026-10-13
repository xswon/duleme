import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readerStyles = readFileSync(resolve(process.cwd(), "src/styles/prototype-reader.css"), "utf8");
const authoredTypographySelector =
  '#article-reader .article-copy :is([style*="font-size" i], [style*="font-family" i], [style*="line-height" i]):not(:is(h1, h2, h3, h4, h5, h6, pre, code, figcaption))';
const authoredTypographyRuleStart = readerStyles.indexOf(authoredTypographySelector);
const authoredTypographyRule = readerStyles.slice(
  authoredTypographyRuleStart,
  readerStyles.indexOf("}", authoredTypographyRuleStart),
);

describe("reader theme styles", () => {
  it("keeps authored inline colors from overriding the dark reading surface", () => {
    expect(readerStyles).toContain(
      'html[data-theme="dark"] #article-reader .article-copy [style*="color" i] { color: inherit !important; }',
    );
    expect(readerStyles).not.toMatch(/^\s*#article-reader \.article-copy \[style\*="color"[^\n]*color: inherit !important;/m);
  });

  it("lets the reader font, size and line-height win over authored inline typography", () => {
    expect(authoredTypographyRuleStart).toBeGreaterThanOrEqual(0);
    expect(authoredTypographyRule).toContain("font-family: inherit !important;");
    expect(authoredTypographyRule).toContain("font-size: inherit !important;");
    expect(authoredTypographyRule).toContain("line-height: inherit !important;");
    expect(readerStyles).not.toContain(`html[data-theme] ${authoredTypographySelector}`);
    expect(authoredTypographySelector).toContain(":not(:is(h1, h2, h3, h4, h5, h6, pre, code, figcaption))");
    expect(authoredTypographySelector.startsWith("#article-reader .article-copy ")).toBe(true);
  });
});
