import { CommunityPhotoGallery } from "@/features/community/CommunityPhotoGallery";

export const dynamic = "force-dynamic";

export default async function CommunityPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<{ courseId?: string }>;
}) {
  const { resortId } = await params;
  const { courseId } = await searchParams;
  return <CommunityPhotoGallery resortId={resortId} courseId={courseId} />;
}
