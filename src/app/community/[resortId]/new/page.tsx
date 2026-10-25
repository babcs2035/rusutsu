import { CommunityComposer } from "@/features/community/CommunityComposer";
export default async function NewCommunityPost({
  params,
  searchParams,
}: {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ resortId }, query] = await Promise.all([params, searchParams]);
  return <CommunityComposer resortId={resortId} postId={query.edit} />;
}
