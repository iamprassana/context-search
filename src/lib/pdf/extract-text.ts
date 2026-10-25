import {
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

const MAX_PDF_PAGES = 200;
const MAX_EXTRACTED_CHARACTERS = 250_000;

type PdfJsGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: typeof WorkerMessageHandler;
  };
};

export async function extractPdfPagesText(
  data: Uint8Array,
): Promise<string[]> {
  if (
    data.byteLength < 8 ||
    Buffer.from(data.subarray(0, 5)).toString("ascii") !== "%PDF-"
  ) {
    throw new Error("The stored PDF has an invalid file signature.");
  }

  let destroyDocument: (() => Promise<void>) | undefined;
  try {
    const pdfjsGlobal = globalThis as PdfJsGlobal;
    pdfjsGlobal.pdfjsWorker ??= { WorkerMessageHandler };

    const loadingTask = getDocument({
      data: data.slice(),
      useSystemFonts: true,
      isEvalSupported: false,
      stopAtErrors: true,
      disableAutoFetch: true,
    });
    const document = await loadingTask.promise;
    destroyDocument = () => document.destroy();

    if (document.numPages === 0) {
      throw new Error("The PDF does not contain any pages.");
    }
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(
        `PDFs must contain ${MAX_PDF_PAGES} pages or fewer for text indexing.`,
      );
    }

    const pages: string[] = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = "";

      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        if (
          currentLine &&
          !/\s$/.test(currentLine) &&
          !/^[,.;:!?)}\]]/.test(item.str)
        ) {
          currentLine += " ";
        }
        currentLine += item.str;
        if (item.hasEOL) {
          appendLine(lines, currentLine);
          currentLine = "";
        }
      }
      appendLine(lines, currentLine);

      const pageText = lines.join("\n").trim();
      if (!pageText) continue;
      const pageContent = `Page ${pageNumber}\n${pageText}`;
      totalCharacters += pageContent.length;
      if (totalCharacters > MAX_EXTRACTED_CHARACTERS) {
        throw new Error(
          "The PDF contains too much selectable text to index in one operation.",
        );
      }
      pages.push(pageContent);
    }

    return pages;
  } catch (error) {
    if (
      error instanceof Error &&
      /password|encrypted/i.test(`${error.name} ${error.message}`)
    ) {
      throw new Error("This PDF is encrypted or password-protected.");
    }
    throw error;
  } finally {
    await destroyDocument?.();
  }
}

function isTextItem(
  item: unknown,
): item is { str: string; hasEOL: boolean } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "hasEOL" in item &&
    typeof item.hasEOL === "boolean"
  );
}

function appendLine(lines: string[], line: string): void {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (normalized) lines.push(normalized);
}
