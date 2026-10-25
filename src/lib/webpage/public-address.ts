import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

const DNS_TIMEOUT_MS = 3_000;
const IPV4_MAPPED_PREFIX = BigInt(0xffff);
const IPV4_MASK = BigInt("0xffffffff");
const GLOBAL_UNICAST_START = BigInt("0x20000000000000000000000000000000");
const GLOBAL_UNICAST_END = BigInt("0x40000000000000000000000000000000");
const DOCUMENTATION_START = BigInt("0x20010db8000000000000000000000000");
const DOCUMENTATION_END = BigInt("0x20010dc0000000000000000000000000");
const PROTOCOL_ASSIGNMENTS_START = BigInt("0x20010000000000000000000000000000");
const PROTOCOL_ASSIGNMENTS_END = BigInt("0x20010200000000000000000000000000");
const SIX_TO_FOUR_START = BigInt("0x20020000000000000000000000000000");
const SIX_TO_FOUR_END = BigInt("0x20030000000000000000000000000000");
const DOCUMENTATION_V2_START = BigInt("0x3fff0000000000000000000000000000");
const DOCUMENTATION_V2_END = BigInt("0x3fff1000000000000000000000000000");

export function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The saved URL is invalid.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error("Only public HTTP or HTTPS URLs without credentials can be indexed.");
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home.arpa")
  ) {
    throw new Error("Local and private network URLs cannot be indexed.");
  }

  url.hash = "";
  return url;
}

export async function resolvePublicAddresses(
  hostnameValue: string,
): Promise<ResolvedAddress[]> {
  const hostname = normalizeHostname(hostnameValue);
  const literalFamily = isIP(hostname);
  const records =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : await withTimeout(
          lookup(hostname, { all: true, verbatim: true }),
          DNS_TIMEOUT_MS,
        );

  if (records.length === 0 || records.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The URL resolves to a private or reserved network address.");
  }

  return records.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4) return false;
  const [first, second, third] = octets;

  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 &&
      ((second === 0 && (third === 0 || third === 2)) ||
        (second === 31 && third === 196) ||
        (second === 52 && third === 193) ||
        (second === 88 && third === 99) ||
        (second === 175 && third === 48) ||
        second === 168)) ||
    (first === 198 &&
      (second === 18 ||
        second === 19 ||
        (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return false;
  }

  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = parseIpv6(address);
  if (value === null) return false;

  const ipv4MappedPrefix = value >> BigInt(32);
  if (ipv4MappedPrefix === IPV4_MAPPED_PREFIX) {
    const ipv4 = Number(value & IPV4_MASK);
    return isPublicIpv4(
      `${(ipv4 >>> 24) & 255}.${(ipv4 >>> 16) & 255}.${(ipv4 >>> 8) & 255}.${ipv4 & 255}`,
    );
  }

  return (
    value >= GLOBAL_UNICAST_START &&
    value < GLOBAL_UNICAST_END &&
    !isBetween(value, DOCUMENTATION_START, DOCUMENTATION_END) &&
    !isBetween(value, PROTOCOL_ASSIGNMENTS_START, PROTOCOL_ASSIGNMENTS_END) &&
    !isBetween(value, SIX_TO_FOUR_START, SIX_TO_FOUR_END) &&
    !isBetween(value, DOCUMENTATION_V2_START, DOCUMENTATION_V2_END)
  );
}

function parseIpv6(address: string): bigint | null {
  const normalized = address.toLowerCase();
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  let value = normalized;

  if (ipv4Tail) {
    const family = isIP(ipv4Tail[1]);
    if (family !== 4) return null;
    const octets = ipv4Tail[1].split(".").map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    value = `${normalized.slice(0, -ipv4Tail[1].length)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const words = [...left, ...Array(missing).fill("0"), ...right];
  if (words.length !== 8 || words.some((word) => !/^[\da-f]{1,4}$/.test(word))) {
    return null;
  }
  return words.reduce(
    (result, word) => (result << BigInt(16)) | BigInt(`0x${word}`),
    BigInt(0),
  );
}

function isBetween(value: bigint, start: bigint, end: bigint): boolean {
  return value >= start && value < end;
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("DNS lookup timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
