import { AccountCommunityPage } from "@/features/community/AccountCommunityPage";
import { getMyPosts } from "@/server/community/queries";

/** 本人の投稿の先頭ページを読み，以降のページは操作に応じて取得する． */
export default async function AccountPostsPage(): Promise<React.ReactElement> {
  const initialPosts = await getMyPosts().catch((error: unknown) => {
    console.warn("Could not load the initial posts", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return undefined;
  });
  return (
    <AccountCommunityPage initialView="posts" initialPosts={initialPosts} />
  );
}
