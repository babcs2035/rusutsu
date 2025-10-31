import fs from "node:fs";
import { tqdm } from "ts-tqdm";
import type { SkiAreaI, SkiAreaTicketI } from "@/interfaces/SkiArea";
import type { SkiAreaT } from "@/types";
import { fetchAsync } from "./fetch";

const outlines = await fetchAsync({
  url: "https://www.snowjapan.com/rest-api/skiarea/list/All",
  options: {
    method: "POST",
  },
});

const skiAreas: SkiAreaT[] = [];
for (const outline of tqdm(outlines)) {
  const uniqueName = outline.UniqueName;

  const details: SkiAreaI = await fetchAsync({
    url: `https://www.snowjapan.com/rest-api/skiarea/${uniqueName}`,
    options: {
      method: "POST",
    },
  });
  const tickets: SkiAreaTicketI[] = await fetchAsync({
    url: `https://www.snowjapan.com/rest-api/skiarea/ticket/list/${uniqueName}`,
    options: {
      method: "POST",
    },
  });

  skiAreas.push({
    id: uniqueName,
    name: {
      ja: details.NameJapanese,
      en: details.Name,
    },
    location: {
      prefecture: details.PrefectureNameJapanese,
      town: details.TownNameJapanese,
      latitude: Number(details.Location_Latitude),
      longitude: Number(details.Location_Longitude),
    },
    courses: {
      image: `https://www.snowjapan.com${String(details.CourseMapLarge || details.CourseMapSmall).slice(1)}`,
      topElevation: details.MaximumElevation,
      vertical: details.VerticalDifference,
      baseElevation: details.MinimumElevation,
      numberOfCourses: details.TotalSkiCourses,
      longestCourse: details.LongestCourse,
      steepestSlope: details.steepestSlope,
      beginnersCoursesPercent: details.BeginnersCourses,
      intermediateCoursesPercent: details.IntermediateCourses,
      advancedCoursesPercent: details.AdvancedCourses,
    },
    lifts: {
      numberOfLifts: details.TotalSkiLifts,
      ropeways: details.RopeWays,
      gondolas: details.Gondolas,
      quadLifts: details.QuadLifts,
      tripleLifts: details.TripleLifts,
      pairLifts: details.PairLifts,
      singleLifts: details.SingleLifts,
      otherLifts: details.OtherLifts,
    },
    tickets: [
      ...tickets.map((ticket: SkiAreaTicketI) => ({
        name: ticket.NameOfTicket,
        prices: {
          adult: Number(ticket.AdultTicket?.replaceAll(",", "")),
          child: Number(ticket.ChildTicket?.replaceAll(",", "")),
          olderChild: Number(ticket.OlderChildTicket?.replaceAll(",", "")),
          senior: Number(ticket.SeniorTicket?.replaceAll(",", "")),
        },
      })),
    ],
    times: {
      weekday: {
        open: details.WeekdayOpenTime,
        close: details.WeekdayCloseTime,
      },
      weekend: {
        open: details.WeekendOpenTime,
        close: details.WeekendCloseTime,
      },
      comment: details.OpeningTimeComments,
    },
    others: {
      website: details.WebUrl,
      skiersPercent: details.SkiersPercent,
      snowboardersPercent: details.SnowboardersPercent,
    },
    source: `https://www.snowjapan.com/japan-ski-resorts/${details.PrefectureNameJapanese}/${details.TownNameJapanese}/${uniqueName}`,
  });
}
console.log(`\nFound ${skiAreas.length} ski areas`);
fs.writeFileSync("../data/SkiAreas.json", JSON.stringify(skiAreas, null, 0));
