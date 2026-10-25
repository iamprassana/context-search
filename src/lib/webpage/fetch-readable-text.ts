import "server-only";

import { isIP } from "node:net";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { extractReadableText } from "@/lib/webpage/extract-readable-text";
import {
  parseHttpUrl,
  resolvePublicAddresses,
  type ResolvedAddress,
} from "@/lib/webpage/public-address";

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 20_000;

type HtmlResponse = {
  status: number;
  location: string | null;
  contentType: string | null;
  contentEncoding: string | null;
  body: Buffer;
};

export async function fetchReadableWebpageText(value: string): Promise<string> {
  let target = parseHttpUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

  try {
    for (let redirect = 0; ; redirect += 1) {
      const addresses = await resolvePublicAddresses(target.hostname);
      const response = await requestHtml(target, addresses[0], controller.signal);

      if (isRedirect(response.status)) {
        if (!response.location || redirect >= MAX_REDIRECTS) {
          throw new Error("The webpage redirected too many times or omitted its destination.");
        }
        let nextTarget: URL;
        try {
          nextTarget = new URL(response.location, target);
        } catch {
          throw new Error("The webpage returned an invalid redirect destination.");
        }
        target = parseHttpUrl(nextTarget.href);
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`The webpage returned HTTP ${response.status}.`);
      }
      if (
        !response.contentType ||
        !/^text\/html(?:\s*;|$)|^application\/xhtml\+xml(?:\s*;|$)/i.test(
          response.contentType,
        )
      ) {
        throw new Error("The URL does not serve an HTML webpage.");
      }
      if (response.contentEncoding && response.contentEncoding !== "identity") {
        throw new Error("The webpage used an unsupported compressed response.");
      }

      try {
        return extractReadableText(response.body.toString("utf8"));
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Unable to extract readable webpage text.",
        );
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Fetching the webpage timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requestHtml(
  target: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
): Promise<HtmlResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    const hostname = target.hostname.replace(/^\[|\]$/g, "");
    const requestOptions = {
      hostname: address.address,
      family: address.family,
      port: target.port ? Number(target.port) : undefined,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      agent: false as const,
      signal,
      headers: {
        host: target.host,
        accept: "text/html,application/xhtml+xml",
        "accept-encoding": "identity",
        "user-agent": "ContextKeep/1.0 (+https://contextkeep.app)",
      },
    };

    const onResponse = (response: IncomingMessage) => {
      const status = response.statusCode ?? 0;
      const location = headerValue(response, "location");
      const contentType = headerValue(response, "content-type");
      const contentEncoding = headerValue(response, "content-encoding");

      if (isRedirect(status)) {
        response.resume();
        response.once("end", () =>
          finish(() =>
            resolve({
              status,
              location,
              contentType,
              contentEncoding,
              body: Buffer.alloc(0),
            }),
          ),
        );
        return;
      }

      const contentLength = Number(headerValue(response, "content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        response.destroy();
        finish(() =>
          reject(new Error("The webpage response is larger than the indexing limit.")),
        );
        return;
      }

      const parts: Buffer[] = [];
      let receivedBytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += part.byteLength;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          response.destroy();
          finish(() =>
            reject(new Error("The webpage response is larger than the indexing limit.")),
          );
          return;
        }
        parts.push(part);
      });
      response.once("error", (error) =>
        finish(() => reject(new Error(`Unable to read webpage response: ${error.message}`))),
      );
      response.once("end", () =>
        finish(() =>
          resolve({
            status,
            location,
            contentType,
            contentEncoding,
            body: Buffer.concat(parts),
          }),
        ),
      );
    };

    const request =
      target.protocol === "https:"
        ? https.request(
            {
              ...requestOptions,
              servername: isIP(hostname) ? undefined : hostname,
            },
            onResponse,
          )
        : http.request(requestOptions, onResponse);

    request.setTimeout(REQUEST_TIMEOUT_MS, () =>
      request.destroy(new Error("The webpage request timed out.")),
    );
    request.once("error", (error) =>
      finish(() =>
        reject(
          signal.aborted
            ? new Error("The webpage request timed out.")
            : new Error(`Unable to fetch webpage: ${error.message}`),
        ),
      ),
    );
    request.end();
  });
}

function headerValue(response: IncomingMessage, name: string): string | null {
  const value = response.headers[name];
  return typeof value === "string" ? value : null;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
