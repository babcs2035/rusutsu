export type CommentPart = { text: string; href?: string };

const GENERATED_LINK_RESORTS = new Set([
  "rusutsu-resort",
  "kiroro-snow-world",
  "norn-minakami",
  "cupid-valley",
  "winghills-shirotori-resort",
  "snow-cruise-onzes",
  "snow-cruise-onze",
  "dynaland",
  "sugadaira-kogen-snow-resort",
  "able-hakuba-goryu-47",
]);
/** 旧クローラーが付加していた案内文だけを除く。公式から取得したHTMLは保持する。 */
export function removeGeneratedCommentLinks(value: string, resortId: string) {
  if (!GENERATED_LINK_RESORTS.has(resortId)) return value;
  return value
    .replace(
      /(?:最新(?:の)?(?:ニュース|ブログ|お知らせ)は<a\b[^>]*>こちら|<a\b[^>]*>(?:最新(?:の)?(?:ニュース|お知らせ)はこちら(?:から)?|ニュースはこちらから|イベント情報はこちら))<\/a>(?:から)?[。.]?/gu,
      "",
    )
    .trim();
}

/** HTMLはDOMへ挿入せず、テキストとHTTP(S)リンクだけをReactで描画する。 */
export function parseCommentContent(
  html: string,
  document: Document,
  baseUrl?: string,
): CommentPart[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  const parts: CommentPart[] = [];
  const ignored = new Set([
    "SCRIPT",
    "STYLE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "MATH",
    "TEMPLATE",
    "NOSCRIPT",
  ]);
  const blocks = new Set([
    "P",
    "DIV",
    "LI",
    "TR",
    "H1",
    "H2",
    "H3",
    "H4",
    "SECTION",
  ]);
  const append = (text: string, href?: string) => {
    if (!text) return;
    const previous = parts.at(-1);
    if (previous && previous.href === href) previous.text += text;
    else parts.push({ text, ...(href ? { href } : {}) });
  };
  const visit = (node: Node, href?: string) => {
    if (node.nodeType === 3) {
      append(node.textContent ?? "", href);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (ignored.has(element.tagName)) return;
    if (element.tagName === "BR") {
      append("\n");
      return;
    }
    let link = href;
    if (element.tagName === "A") {
      link = undefined;
      const raw = element.getAttribute("href");
      if (raw) {
        try {
          const url = new URL(raw, baseUrl);
          if (
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          )
            link = url.href;
        } catch {
          /* Invalid links remain plain text. */
        }
      }
    }
    for (const child of element.childNodes) visit(child, link);
    if (blocks.has(element.tagName)) append("\n");
  };
  for (const child of template.content.childNodes) visit(child);
  return parts;
}
