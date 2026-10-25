import "server-only";

const MODEL = "jina-embeddings-v5-omni-small";
const ENDPOINT = "https://api.jina.ai/v1/embeddings";
const EMBEDDING_DIMENSIONS = 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MULTIMODAL_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;
export const JINA_FILE_SIZE_LIMITS = {
  "application/pdf": 8_000_000,
  "image/jpeg": 5_000_000,
  "image/png": 5_000_000,
  "image/webp": 5_000_000,
} as const;

export type EmbeddingTask = "retrieval.query" | "retrieval.passage";
export type JinaFileMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

type EmbeddingResponse = {
  model?: unknown;
  data?: Array<{
    index?: unknown;
    embedding?: unknown;
  }>;
};

type JinaEmbeddingInput = string[] | { image: string } | { pdf: string };

export async function createEmbeddings(
  inputs: string[],
  task: EmbeddingTask,
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const apiKey = process.env.JINA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("JINA_API_KEY is not configured on the server.");
  }

  const embeddings: number[][] = [];
  for (let offset = 0; offset < inputs.length; offset += 32) {
    const batch = inputs.slice(offset, offset + 32);
    embeddings.push(
      ...(await createEmbeddingBatch(
        { input: batch, task },
        batch.length,
        apiKey,
        REQUEST_TIMEOUT_MS,
      )),
    );
  }
  return embeddings;
}

export async function createFileEmbedding(
  data: Uint8Array,
  mimeType: JinaFileMimeType,
): Promise<number[][]> {
  const maximumBytes = JINA_FILE_SIZE_LIMITS[mimeType];
  if (data.byteLength === 0 || data.byteLength > maximumBytes) {
    const limit = mimeType === "application/pdf" ? "8 MB" : "5 MB";
    throw new Error(`The ${mimeType} file must be non-empty and no larger than ${limit}.`);
  }

  const apiKey = process.env.JINA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("JINA_API_KEY is not configured on the server.");
  }

  const encoded = Buffer.from(data).toString("base64");
  const input =
    mimeType === "application/pdf"
      ? { pdf: encoded }
      : { image: encoded };

  const embeddings = await createEmbeddingBatch(
    { input, task: "retrieval.passage" },
    1,
    apiKey,
    MULTIMODAL_TIMEOUT_MS,
    mimeType === "application/pdf",
  );
  if (embeddings.length === 0) {
    throw new Error("Jina did not return a file embedding.");
  }
  return embeddings;
}

async function createEmbeddingBatch(
  requestBody: { input: JinaEmbeddingInput; task: EmbeddingTask },
  expectedCount: number,
  apiKey: string,
  timeoutMs: number,
  allowMultipleResults = false,
): Promise<number[][]> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          normalized: true,
          ...requestBody,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        lastError = new Error(
          `Jina embedding request failed with status ${response.status}.`,
        );
        if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }

      const payload: unknown = await response.json();
      return parseEmbeddings(payload, expectedCount, allowMultipleResults);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Jina embedding")) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith("Jina returned")) {
        throw error;
      }
      lastError =
        error instanceof Error
          ? error
          : new Error("Jina embedding request failed unexpectedly.");
      if (attempt === MAX_ATTEMPTS) break;
      await delay(250 * attempt);
    }
  }

  throw new Error(
    lastError?.name === "TimeoutError"
      ? "Jina embedding request timed out. Please try again."
      : "Jina embedding request failed. Please try again.",
  );
}

function parseEmbeddings(
  value: unknown,
  expectedCount: number,
  allowMultipleResults: boolean,
): number[][] {
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    !("model" in value)
  ) {
    throw new Error("Jina returned an invalid embedding response.");
  }

  const data = (value as EmbeddingResponse).data;
  const model = (value as EmbeddingResponse).model;
  if (model !== MODEL) {
    throw new Error("Jina returned embeddings from an unexpected model.");
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Jina returned no embeddings.");
  }
  if (!allowMultipleResults && data.length !== expectedCount) {
    throw new Error(
      `Jina returned ${data.length} embeddings; expected ${expectedCount}.`,
    );
  }
  if (allowMultipleResults && data.length > 100) {
    throw new Error(
      "Jina returned more than 100 PDF embeddings, exceeding the resource indexing limit.",
    );
  }
  const resultCount = allowMultipleResults ? data.length : expectedCount;

  const vectors = new Map<number, number[]>();
  for (const item of data) {
    if (
      !item ||
      typeof item.index !== "number" ||
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      item.index >= resultCount ||
      !isEmbeddingVector(item.embedding)
    ) {
      throw new Error("Jina returned an invalid embedding vector.");
    }

    if (vectors.has(item.index)) {
      throw new Error("Jina returned duplicate embedding indexes.");
    }
    vectors.set(item.index, item.embedding);
  }

  const orderedVectors: number[][] = [];
  for (let index = 0; index < resultCount; index += 1) {
    const vector = vectors.get(index);
    if (!vector) throw new Error("Jina returned incomplete embedding data.");
    orderedVectors.push(vector);
  }
  return orderedVectors;
}

function isEmbeddingVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EMBEDDING_DIMENSIONS &&
    value.every(
      (number): number is number =>
        typeof number === "number" && Number.isFinite(number),
    )
  );
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 1000);
  }
  return 250 * attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
