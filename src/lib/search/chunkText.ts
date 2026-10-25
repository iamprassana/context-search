const MAX_CHUNK_CHARACTERS = 3000;

export function chunkText(value: string): string[] {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of normalized.split(/(?<=\n)\s*(?=\S)/)) {
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length <= MAX_CHUNK_CHARACTERS) {
      current = next;
      continue;
    }

    if (current.trim()) chunks.push(current.trim());
    current = "";

    if (paragraph.length <= MAX_CHUNK_CHARACTERS) {
      current = paragraph;
      continue;
    }

    for (
      let offset = 0;
      offset < paragraph.length;
      offset += MAX_CHUNK_CHARACTERS
    ) {
      const part = paragraph.slice(offset, offset + MAX_CHUNK_CHARACTERS);
      if (part.trim()) chunks.push(part.trim());
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
