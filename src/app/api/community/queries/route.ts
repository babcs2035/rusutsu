/** 投稿・本人情報の動的な読込を，更新操作と actor の指定から分離する． */
import { z } from "zod";
import { idSchema, observedOnSchema } from "@/features/community/contract";
import { getAccountDayReports } from "@/server/community/accountDayReports";
import * as queries from "@/server/community/queries";
import { feedInputSchema } from "@/server/community/remoteContract";
import { respondToPublicQuery } from "@/server/publicQueryHttp";

const schema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("feed"), input: feedInputSchema }),
  z.strictObject({ operation: z.literal("account") }),
  z.strictObject({
    operation: z.literal("myPosts"),
    cursor: idSchema.optional(),
  }),
  z.strictObject({ operation: z.literal("detail"), postId: idSchema }),
  z.strictObject({ operation: z.literal("notifications") }),
  z.strictObject({
    operation: z.literal("dayReports"),
    authorId: idSchema,
    observedOn: observedOnSchema,
  }),
  z.strictObject({
    operation: z.literal("dayMaps"),
    authorId: idSchema,
    observedOn: observedOnSchema,
  }),
  z.strictObject({
    operation: z.literal("composer"),
    postId: idSchema.optional(),
  }),
]);

/** service が session から本人を解決し，本文の userId を本人の指定に使わない． */
export async function POST(request: Request): Promise<Response> {
  return respondToPublicQuery<z.infer<typeof schema>, unknown>(
    request,
    schema,
    async command => {
      switch (command.operation) {
        case "feed":
          return queries.getCommunityFeed(command.input);
        case "account":
          return queries.getCommunityAccount();
        case "composer":
          return queries.getComposerSetup(command.postId);
        case "myPosts":
          return queries.getMyPosts(command.cursor);
        case "detail":
          return queries.getPostDetail(command.postId);
        case "notifications":
          return queries.getNotifications();
        case "dayReports":
          return queries.getDayReports(command.authorId, command.observedOn);
        case "dayMaps":
          return getAccountDayReports(command.authorId, command.observedOn);
      }
    },
  );
}
