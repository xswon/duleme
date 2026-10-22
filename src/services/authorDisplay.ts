/** RSS author fields sometimes contain the owner's contact address. Keep it out of reader UI. */
export function displayAuthor(author?: string, feedTitle?: string): string {
  const value = (author || "").trim();
  if (!value) return "";
  const withoutEmail = value
    .replace(/<?[\w.+-]+@[\w.-]+\.[a-z]{2,}>?/gi, " ")
    .replace(/^[\s·,;:()（）<>\[\]-]+|[\s·,;:()（）<>\[\]-]+$/g, "")
    .trim();
  const parenthetical = withoutEmail.match(/^[（(]([^()（）]+)[）)]$/)?.[1]?.trim();
  const label = parenthetical || withoutEmail;
  return label && label !== feedTitle ? label : "";
}
