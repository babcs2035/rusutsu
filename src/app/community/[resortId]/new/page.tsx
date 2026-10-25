import { CommunityComposer } from "@/features/community/CommunityComposer";
export default async function NewCommunityPost({
  params,
}: {
  params: Promise<{ resortId: string }>;
}) {
  const { resortId } = await params;
  return <CommunityComposer resortId={resortId} />;
}
