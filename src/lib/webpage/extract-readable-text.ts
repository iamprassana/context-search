import { parseHTML } from "linkedom";

const MAX_PAGE_TEXT_CHARACTERS = 300_000;
const IGNORED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "embed",
  "canvas",
  "form",
  "button",
]);
const BLOCK_TAGS = new Set([
  "article",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

export function extractReadableText(html: string): string {
  const { document } = parseHTML(html);
  const body = document.body;
  if (!body) throw new Error("The webpage has no readable HTML content.");

  const title = normalizeWhitespace(document.title ?? "");
  const content = document.querySelector("main, article") ?? body;
  const bodyText = collectText(content)
    .split("\n")
    .map(normalizeWhitespace)
    .filter(Boolean)
    .join("\n");
  if (!bodyText) {
    throw new Error("The webpage contains no readable text to index.");
  }
  const readableText = title ? `Page title: ${title}\n\n${bodyText}` : bodyText;
  if (readableText.length > MAX_PAGE_TEXT_CHARACTERS) {
    throw new Error("The webpage contains too much text to index.");
  }

  return readableText;
}

function collectText(node: Node): string {
  const output: string[] = [];
  const stack: Array<{ node: Node; closing: boolean; block: boolean }> = [
    { node, closing: false, block: false },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.closing) {
      if (current.block) output.push("\n");
      continue;
    }
    if (current.node.nodeType === 3) {
      output.push(current.node.textContent ?? "");
      continue;
    }
    if (current.node.nodeType === 1) {
      const element = current.node as Element;
      const tagName = element.tagName.toLowerCase();
      if (IGNORED_TAGS.has(tagName) || element.hasAttribute("hidden")) continue;
      const block = BLOCK_TAGS.has(tagName);
      if (block) output.push("\n");
      stack.push({ ...current, closing: true, block });
    }

    const children = Array.from(current.node.childNodes);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], closing: false, block: false });
    }
  }

  return output.join("");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
