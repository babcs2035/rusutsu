import { auth } from "@/auth";
import { publishReport, updateReport } from "@/features/community/actions";
import { handleReportSubmission } from "@/server/community/reportSubmission";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleReportSubmission(request, {
    publicOrigin: process.env.AUTH_URL,
    authenticate: async () => !!(await auth())?.user?.id,
    execute: (command, photos) =>
      command.operation === "publish"
        ? publishReport(command.input, photos)
        : updateReport(
            command.input.postId,
            command.input.version,
            command.input.report,
            photos,
            command.input.removePhotoIds,
          ),
  });
}
