import { findOperatingSummariesDirect } from "@/server/course-lift/summaryClient";
import {
  internalApiJson,
  requireInternalApiRequest,
} from "@/server/internalApiHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const error = requireInternalApiRequest(request, "admin-data");
  if (error) return error;
  return internalApiJson({ summaries: await findOperatingSummariesDirect() });
}
