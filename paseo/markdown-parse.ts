// Pure Markdown parser (no React Native imports) so it stays unit-testable.
export type Inline =
  | { t: "text"; text: string }
  | { t: "b"; inner: string }
  | { t: "i"; inner: string }
  | { t: "s"; inner: string }
  | { t: "code"; text: string }
  | { t: "link"; text: string; url: string };

export type ListItem = { indent: number; marker: string; text: string };

export type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "code"; lang: string; text: string }
  | { t: "ul"; items: ListItem[] }
  | { t: "ol"; items: ListItem[] }
  | { t: "quote"; text: string }
  | { t: "hr" }
  | { t: "table"; head: string[]; rows: string[][] };

const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/[^)\s]+|mailto:[^)\s]+)\))/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  INLINE_PATTERN.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_PATTERN.exec(src)) !== null) {
    if (m.index > last) out.push({ t: "text", text: src.slice(last, m.index) });
    const token = m[0];
    if (token.slice(0, 2) === "**") out.push({ t: "b", inner: token.slice(2, -2) });
    else if (token.slice(0, 2) === "__") out.push({ t: "b", inner: token.slice(2, -2) });
    else if (token.slice(0, 2) === "~~") out.push({ t: "s", inner: token.slice(2, -2) });
    else if (token.charAt(0) === "`") out.push({ t: "code", text: token.slice(1, -1) });
    else if (token.charAt(0) === "[") {
      const sep = token.lastIndexOf("](");
      out.push({ t: "link", text: token.slice(1, sep), url: token.slice(sep + 2, -1) });
    }
    else if (token.charAt(0) === "*") out.push({ t: "i", inner: token.slice(1, -1) });
    else out.push({ t: "i", inner: token.slice(1, -1) });
    last = m.index + token.length;
  }
  if (last < src.length) out.push({ t: "text", text: src.slice(last) });
  return out;
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isDelimiter(line: string): boolean {
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  // Strip zero-width characters that break marker detection and render as gaps.
  const lines = src.replace(/[\u200b-\u200f\ufeff]/g, "").replace(/\r\n?/g, "\n").split("\n");
  const para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ t: "p", text: para.join("\n") });
      para.length = 0;
    }
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      flush();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].slice(0, 3) !== "```") {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ t: "code", lang: fence[1], text: body.join("\n") });
      continue;
    }
    if (/^\s*$/.test(line)) {
      flush();
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ t: "h", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ t: "quote", text: quote.join("\n") });
      continue;
    }
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      flush();
      const marker = listMatch[2];
      const isOrdered = marker !== "-" && marker !== "*" && marker !== "+";
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        const sameKind = isOrdered
          ? m[2] !== "-" && m[2] !== "*" && m[2] !== "+"
          : m[2] === "-" || m[2] === "*" || m[2] === "+";
        if (!sameKind) break;
        items.push({ indent: Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2)), marker: m[2], text: m[3] });
        i += 1;
      }
      blocks.push(isOrdered ? { t: "ol", items } : { t: "ul", items });
      continue;
    }
    if (line.indexOf("|") >= 0 && i + 1 < lines.length && isDelimiter(lines[i + 1])) {
      flush();
      const head = splitCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim() !== "") {
        rows.push(splitCells(lines[i]));
        i += 1;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }
    para.push(line);
    i += 1;
  }
  flush();
  return blocks;
}
