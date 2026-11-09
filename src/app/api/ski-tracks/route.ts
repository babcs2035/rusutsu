import { auth } from "@/auth";
import { handleSkiTracks } from "@/server/ski-tracks/handler";

export const runtime = "nodejs";

const handle = (request: Request) =>
  handleSkiTracks(request, async () => (await auth())?.user?.id ?? null);

export { handle as GET, handle as POST, handle as DELETE };
