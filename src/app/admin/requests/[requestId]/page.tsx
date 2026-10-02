import { RequestDetail } from "@/features/edit-requests/RequestDetail";
import { getEditRequest } from "@/server/edit-requests/repository";
export const dynamic = "force-dynamic";
export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const request = await getEditRequest(requestId);
  return (
    <RequestDetail key={`${request.id}:${request.version}`} request={request} />
  );
}
