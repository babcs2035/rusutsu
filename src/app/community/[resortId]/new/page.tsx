import { redirect } from "next/navigation";
import { communityComposerUrl } from "@/features/community/composerEvents";

export default async function NewCommunityPost({
  params,
  searchParams,
}: {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<{ edit?: string; courseId?: string; liftId?: string }>;
}) {
  const [{ resortId }, query] = await Promise.all([params, searchParams]);
  redirect(
    communityComposerUrl({
      resortId,
      postId: query.edit,
      target: query.courseId
        ? { kind: "COURSE", id: query.courseId }
        : query.liftId
          ? { kind: "LIFT", id: query.liftId }
          : undefined,
    }),
  );
}
