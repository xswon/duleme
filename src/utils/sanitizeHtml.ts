/** Sanitize untrusted RSS/Markdown HTML before inserting it into the DOM. */
export function sanitizeHtml(html: string): string {
  if (typeof document === "undefined") return "";
  const template = document.createElement("template");
  template.innerHTML = html || "";
  const blocked = new Set(["script", "style", "iframe", "object", "embed", "form", "link", "meta"]);
  const elements = Array.from(template.content.querySelectorAll("*"));
  for (const element of elements) {
    if (blocked.has(element.tagName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || (name === "src" || name === "href" || name === "xlink:href") && /^(?:javascript|data|vbscript):/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}
