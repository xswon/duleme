import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
  "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "h1",
  "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "mark", "ol", "p",
  "pre", "q", "s", "small", "span", "strong", "sub", "summary", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const ALLOWED_ATTR = [
  "alt", "aria-label", "colspan", "height", "href", "lang", "rel", "rowspan",
  "src", "start", "target", "title", "width",
];

function normalizeLinks(root: DocumentFragment) {
  for (const anchor of Array.from(root.querySelectorAll("a"))) {
    const href = anchor.getAttribute("href")?.trim() || "";
    if (!href) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      continue;
    }
    if (/^https?:/i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    } else {
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
    }
  }
}

/** Sanitize untrusted RSS/Markdown HTML before inserting it into the DOM. */
export function sanitizeHtml(html: string): string {
  if (typeof document === "undefined") return "";
  const sanitized = DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["svg", "math", "iframe", "object", "embed", "form", "style", "link", "meta", "template"],
    FORBID_ATTR: ["style", "srcdoc", "xlink:href"],
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized;
  normalizeLinks(template.content);
  return template.innerHTML;
}
