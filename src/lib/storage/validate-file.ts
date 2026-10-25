import "server-only";

export type VerifiedFileType = {
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  extension: "pdf" | "jpg" | "png" | "webp";
  resourceType: "PDF" | "Image";
};

export async function verifyUploadedFile(
  file: File,
  maxFileSizeBytes: number,
): Promise<VerifiedFileType> {
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > maxFileSizeBytes) {
    throw new Error(
      `Files must be ${formatMaxSize(maxFileSizeBytes)} or smaller.`,
    );
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = detectFileType(bytes);
  if (!type) {
    throw new Error("The file content is not a supported PDF, JPEG, PNG, or WebP.");
  }

  const filename = file.name.split(/[\\/]/).pop()?.trim() ?? "";
  const extension = filename.split(".").pop()?.toLowerCase();
  const extensionMatches =
    (type.mimeType === "application/pdf" && extension === "pdf") ||
    (type.mimeType === "image/jpeg" &&
      (extension === "jpg" || extension === "jpeg")) ||
    (type.mimeType === "image/png" && extension === "png") ||
    (type.mimeType === "image/webp" && extension === "webp");
  if (!extensionMatches) {
    throw new Error(
      "The file extension must match its content (PDF, JPG/JPEG, PNG, or WebP).",
    );
  }

  if (file.type && file.type !== type.mimeType) {
    throw new Error("The selected file's content type does not match its contents.");
  }

  return type;
}

function detectFileType(bytes: Uint8Array): VerifiedFileType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return {
      mimeType: "application/pdf",
      extension: "pdf",
      resourceType: "PDF",
    };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
      resourceType: "Image",
    };
  }
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
      resourceType: "Image",
    };
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return {
      mimeType: "image/webp",
      extension: "webp",
      resourceType: "Image",
    };
  }
  return null;
}

function startsWith(value: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => value[index] === byte);
}

function formatMaxSize(size: number): string {
  if (size < 1024) return `${size} B`;
  const megabytes = size / (1024 * 1024);
  return megabytes >= 1
    ? `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
    : `${Math.round(size / 1024)} KB`;
}
