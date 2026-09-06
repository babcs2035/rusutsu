import { createHash } from "node:crypto";
import {
  reviewContentSchema,
  reviewPublicationSchema,
} from "./publicationContract";
import type { ReviewDataDocumentClient } from "./reviewFiles";

export async function prepareReviewPublication(
  client: ReviewDataDocumentClient,
  raw: unknown,
) {
  const content = reviewContentSchema.parse(raw);
  const files = await Promise.all(
    (["detail", "article"] as const).map(async kind => {
      const key = `reviews/${content.resortId}/${kind}.json`;
      const current = await client.getDataDocument(key);
      const next = `${JSON.stringify(content[kind], null, 2)}\n`;
      return {
        kind,
        key,
        previousHash: current?.hash ?? null,
        status: !current
          ? "新規"
          : current.content === next
            ? "変更なし"
            : "更新",
        previousContent: current?.content ?? null,
        content: next,
      };
    }),
  );
  return {
    publication: {
      content,
      expectedHashes: {
        detail: files[0].previousHash,
        article: files[1].previousHash,
      },
    },
    files,
  };
}

export async function publishReview(
  client: ReviewDataDocumentClient,
  raw: unknown,
) {
  const { content, expectedHashes } = reviewPublicationSchema.parse(raw);
  // Two documents in one transaction; no partial review is published on conflict.
  return client.writeDataDocuments(
    (["detail", "article"] as const).map(kind => ({
      key: `reviews/${content.resortId}/${kind}.json`,
      content: `${JSON.stringify(content[kind], null, 2)}\n`,
      mediaType: "application/json",
      expectedHash: expectedHashes[kind],
    })),
  );
}

export const reviewContentHash = (raw: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(reviewContentSchema.parse(raw)))
    .digest("hex");
