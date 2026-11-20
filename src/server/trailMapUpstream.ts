/** 公式マップの HTTP 接続先を DNS 解決時に検査し，接続と同じ IP に固定する． */
import { lookup } from "node:dns/promises";
import { get as httpGet, type IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";
import { BlockList, isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

const maxRedirects = 5;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const nonPublic = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  nonPublic.addSubnet(address, prefix);
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  nonPublic.addSubnet(address, prefix, "ipv6");
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");

/** DNS が返すプライベートアドレスや特殊用途の範囲への接続を許可しない． */
function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !nonPublic.check(address);
  return (
    family === 6 &&
    globalIPv6.check(address, "ipv6") &&
    !nonPublic.check(address, "ipv6")
  );
}

/** SNI と Host を保ちつつ，検証した DNS 結果だけをソケットへ渡す． */
function requestMap(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const get = url.protocol === "https:" ? httpsGet : httpGet;
    const request = get(
      url,
      {
        agent: false,
        signal,
        headers: { "User-Agent": "Mozilla/5.0" },
        lookup(hostname, options, callback) {
          void lookup(hostname, { all: true, family: options.family }).then(
            addresses => {
              const allowed = addresses.filter(({ address }) =>
                isPublicAddress(address),
              );
              if (!allowed.length) {
                callback(new Error("No public map address"), "", 0);
                return;
              }
              if (options.all) callback(null, allowed);
              else callback(null, allowed[0].address, allowed[0].family);
            },
            error => callback(error, "", 0),
          );
        },
      },
      resolve,
    );
    request.once("error", reject);
  });
}

/** redirect ごとに URL と接続 IP を再検査し，同一の期限を本文にも適用する． */
export async function fetchTrailMap(
  initial: URL,
  signal: AbortSignal,
): Promise<{
  status: number;
  contentType: string;
  length: number;
  body: ReadableStream<Uint8Array>;
}> {
  let url = initial;
  for (let step = 0; step <= maxRedirects; step++) {
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port)) ||
      (isIP(host) && !isPublicAddress(host))
    ) {
      throw new Error("Map destination is not allowed");
    }
    const response = await requestMap(url, signal);
    const status = response.statusCode ?? 502;
    if (redirectStatuses.has(status)) {
      response.destroy();
      if (!response.headers.location)
        throw new Error("Missing map redirect location");
      url = new URL(response.headers.location, url);
      continue;
    }
    const encoding = response.headers["content-encoding"]?.toLowerCase();
    const decoder =
      encoding === "gzip"
        ? createGunzip()
        : encoding === "br"
          ? createBrotliDecompress()
          : encoding === "deflate"
            ? createInflate()
            : undefined;
    if (encoding && encoding !== "identity" && !decoder) {
      response.destroy();
      throw new Error("Unsupported map encoding");
    }
    if (decoder) {
      response.once("error", error => decoder.destroy(error));
      decoder.once("close", () => response.destroy());
      response.pipe(decoder);
    }
    const source = decoder ?? response;
    const iterator: AsyncIterator<unknown> = source[Symbol.asyncIterator]();
    return {
      status,
      contentType: response.headers["content-type"] ?? "",
      length: Number(response.headers["content-length"] ?? 0),
      body: new ReadableStream<Uint8Array>({
        async pull(controller) {
          const chunk = await iterator.next();
          if (chunk.done) controller.close();
          else if (chunk.value instanceof Uint8Array)
            controller.enqueue(chunk.value);
          else throw new Error("Invalid map body");
        },
        cancel() {
          source.destroy();
        },
      }),
    };
  }
  throw new Error("Too many map redirects");
}
