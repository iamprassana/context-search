const MAX_CODE_CHUNK_CHARACTERS = 2_200;
const MAX_CODE_CHUNKS = 100;

type CodeBlock = {
  content: string;
  firstLine: number;
  lastLine: number;
};

type LexicalState = {
  braceDepth: number;
  quote: "'" | '"' | "`" | null;
  blockComment: boolean;
};

export function chunkCode(
  source: string,
  title: string,
  language: string,
): string[] {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const typeNames = findTypeNames(lines);
  const imports = findImports(lines);
  const blocks = splitCodeBlocks(lines, language);
  const chunks: string[] = [];
  let current: CodeBlock | undefined;

  const append = (block: CodeBlock) => {
    if (current && current.content.length + block.content.length + 1 <= MAX_CODE_CHUNK_CHARACTERS) {
      current = {
        content: `${current.content}\n${block.content}`,
        firstLine: current.firstLine,
        lastLine: block.lastLine,
      };
      return;
    }

    if (current) {
      chunks.push(formatChunk(current, title, language, typeNames, imports));
    }
    current = block;
  };

  for (const block of blocks) {
    if (block.content.length <= MAX_CODE_CHUNK_CHARACTERS) {
      append(block);
      continue;
    }

    if (current) {
      chunks.push(formatChunk(current, title, language, typeNames, imports));
      current = undefined;
    }
    chunks.push(
      ...splitOversizedBlock(block).map((part) =>
        formatChunk(part, title, language, typeNames, imports),
      ),
    );
  }

  if (current) {
    chunks.push(formatChunk(current, title, language, typeNames, imports));
  }
  if (chunks.length > MAX_CODE_CHUNKS) {
    throw new Error("This code resource is too long to index in one operation.");
  }
  return chunks;
}

function splitCodeBlocks(lines: string[], language: string): CodeBlock[] {
  const python = language.toLowerCase() === "python";
  const state: LexicalState = {
    braceDepth: 0,
    quote: null,
    blockComment: false,
  };
  const blocks: CodeBlock[] = [];
  let start = 0;
  let pythonClassActive = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const depth = state.braceDepth;
    const topLevelPythonDeclaration =
      python && !/^\s/.test(line) && /^(?:async\s+)?(?:def|class)\s+\w+/.test(line);
    if (topLevelPythonDeclaration) {
      pythonClassActive = /^class\s+\w+/.test(line);
    }
    const declarationDepth = python
      ? depth === 0 &&
        (!/^\s/.test(line) || (pythonClassActive && /^ {4}(?:async\s+)?def\s+/.test(line)))
      : depth <= 1;
    if (
      index > start &&
      declarationDepth &&
      isDeclaration(line, python, depth, pythonClassActive)
    ) {
      addBlock(blocks, lines, start, index - 1);
      start = index;
    }
    updateLexicalState(line, state, python);
  }

  addBlock(blocks, lines, start, lines.length - 1);
  return blocks;
}

function isDeclaration(
  line: string,
  python: boolean,
  braceDepth: number,
  pythonClassActive: boolean,
): boolean {
  if (python) {
    return (
      /^(?:async\s+)?(?:def|class)\s+\w+/.test(line) ||
      (pythonClassActive && /^ {4}(?:async\s+)?def\s+/.test(line))
    );
  }
  if (
    /^\s*(?:(?:export|default|declare|abstract|public|private|protected|static|async|final|virtual|inline|constexpr|extern|override|synchronized)\s+)*(?:function|class|interface|type|enum|struct|union|namespace|trait|impl|fn|func)\b/.test(
      line,
    )
  ) {
    return true;
  }
  if (
    /^\s*(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/.test(
      line,
    )
  ) {
    return true;
  }

  if (braceDepth > 1 || !line.trimEnd().endsWith("{")) return false;
  return (
    /^\s*(?:(?:public|private|protected|static|final|abstract|virtual|inline|constexpr|extern|async|override|synchronized)\s+)*(?:[\w:*&<>.?]+(?:\[\])?\s+)+[\w~]+\s*\([^;]*\)\s*(?:const\s*)?\{\s*$/.test(
      line,
    ) &&
    !/^\s*(?:if|for|while|switch|catch|return|new)\b/.test(line)
  );
}

function updateLexicalState(
  line: string,
  state: LexicalState,
  python: boolean,
): void {
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (state.blockComment) {
      if (character === "*" && next === "/") {
        state.blockComment = false;
        index += 1;
      }
      continue;
    }
    if (state.quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === state.quote) {
        state.quote = null;
      }
      continue;
    }
    if ((python && character === "#") || (character === "/" && next === "/")) {
      break;
    }
    if (character === "/" && next === "*") {
      state.blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      state.quote = character;
    } else if (character === "{") {
      state.braceDepth += 1;
    } else if (character === "}") {
      state.braceDepth = Math.max(0, state.braceDepth - 1);
    }
  }

  if (state.quote !== "`" && state.quote !== null) state.quote = null;
}

function addBlock(
  blocks: CodeBlock[],
  lines: string[],
  firstLine: number,
  lastLine: number,
): void {
  const content = lines
    .slice(firstLine, lastLine + 1)
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
  if (!content) return;
  blocks.push({ content, firstLine: firstLine + 1, lastLine: lastLine + 1 });
}

function splitOversizedBlock(block: CodeBlock): CodeBlock[] {
  const parts: CodeBlock[] = [];
  let content = "";
  let firstLine = block.firstLine;
  const lines = block.content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > MAX_CODE_CHUNK_CHARACTERS) {
      if (content) {
        parts.push({
          content,
          firstLine,
          lastLine: block.firstLine + index - 1,
        });
        content = "";
      }
      for (
        let offset = 0;
        offset < line.length;
        offset += MAX_CODE_CHUNK_CHARACTERS
      ) {
        parts.push({
          content: line.slice(offset, offset + MAX_CODE_CHUNK_CHARACTERS),
          firstLine: block.firstLine + index,
          lastLine: block.firstLine + index,
        });
      }
      firstLine = block.firstLine + index + 1;
      continue;
    }

    const next = content ? `${content}\n${line}` : line;
    if (next.length > MAX_CODE_CHUNK_CHARACTERS) {
      parts.push({
        content,
        firstLine,
        lastLine: block.firstLine + index - 1,
      });
      content = line;
      firstLine = block.firstLine + index;
    } else {
      content = next;
    }
  }

  if (content) {
    parts.push({
      content,
      firstLine,
      lastLine: block.lastLine,
    });
  }
  return parts;
}

function findTypeNames(lines: string[]): string {
  const names = lines.flatMap((line) => {
    const match = line.match(
      /^\s*(?:(?:export|default|abstract|public|private|protected)\s+)*(?:class|interface|struct|enum|trait)\s+(\w+)/,
    );
    return match ? [match[1]] : [];
  });
  return names.length > 0 ? names.join(", ").slice(0, 100) : "";
}

function findImports(lines: string[]): string {
  const imports = lines.filter((line) =>
    /^\s*(?:import\b|from\s+[\w.]+\s+import\b|#include\b|using\s+[\w:]+)/.test(
      line,
    ),
  );
  const context = imports.join("\n");
  return context.length <= 200 ? context : "";
}

function formatChunk(
  block: CodeBlock,
  title: string,
  language: string,
  typeNames: string,
  imports: string,
): string {
  const importContext =
    imports && !block.content.includes(imports) ? `Imports:\n${imports}` : "";
  return [
    `Title: ${title}`,
    "Type: code",
    `Language: ${language || "Other"}`,
    `Lines: ${block.firstLine}-${block.lastLine}`,
    typeNames ? `Types: ${typeNames}` : "",
    importContext,
    "",
    block.content,
  ]
    .filter(Boolean)
    .join("\n");
}
