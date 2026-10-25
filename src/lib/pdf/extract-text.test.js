import { describe, expect, test } from "bun:test";
import { extractPdfPagesText } from "./extract-text.ts";

function createTextPdf(lines) {
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    ...lines.flatMap((line, index) => [
      index === 0 ? `(${line}) Tj` : `0 -20 Td (${line}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}

describe("PDF text extraction", () => {
  test("extracts selectable text and includes the PDF page number", async () => {
    const pages = await extractPdfPagesText(
      createTextPdf([
        "Example University",
        "Project: Embedding Calculator",
      ]),
    );

    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Page 1");
    expect(pages[0]).toContain("Example University");
    expect(pages[0]).toContain("Project: Embedding Calculator");
  });

  test("rejects malformed PDF content with an explicit error", async () => {
    await expect(
      extractPdfPagesText(new Uint8Array(Buffer.from("%PDF-1.4\ninvalid"))),
    ).rejects.toThrow();
  });
});
