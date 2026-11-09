import { communityMapData } from "@/features/community/mapData";
import {
  analyzeTrack,
  type MatchingCourse,
  nearbyResortIds,
} from "@/features/ski-tracks/analyze";
import type { SkizParseResult } from "@/features/ski-tracks/parseSkiz";
import { getFinalizedResortMapData } from "@/lib/finalizedResortGeojson";
import { readSkiResortsForMap } from "@/lib/skiResortData";

export async function analyzeUpload(track: SkizParseResult) {
  const index = await readSkiResortsForMap();
  const ids = nearbyResortIds(track, index);
  const resorts = index.filter(resort => ids.includes(resort.id));
  const courses: MatchingCourse[] = [];
  // Sequential reads keep geometry loads bounded on the data API.
  for (const resort of resorts) {
    const map = await getFinalizedResortMapData(resort.id);
    const options = communityMapData(
      resort.nameJa,
      [resort.longitude, resort.latitude],
      map,
    );
    courses.push(
      ...options.courses.map(course => ({
        ...course,
        resortId: resort.id,
        resortName: resort.nameJa,
      })),
    );
  }
  return analyzeTrack(track, courses);
}
