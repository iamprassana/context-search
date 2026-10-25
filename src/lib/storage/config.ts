export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
export const STORAGE_BUCKET = "contextkeep-files";

export function getMaxUploadSizeBytes(): number {
  const configured = process.env.NEXT_PUBLIC_CONTEXTKEEP_MAX_UPLOAD_SIZE_BYTES;
  if (!configured) return DEFAULT_MAX_UPLOAD_SIZE_BYTES;

  const value = Number(configured);
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_UPLOAD_SIZE_BYTES
  ) {
    throw new Error(
      `NEXT_PUBLIC_CONTEXTKEEP_MAX_UPLOAD_SIZE_BYTES must be a whole number between 1 and ${MAX_UPLOAD_SIZE_BYTES}.`,
    );
  }
  return value;
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size % 1024 === 0 ? 0 : 1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
