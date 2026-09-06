import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  formerNamesSchema,
  nameRubySchema,
  readingRelationsSelect,
} from "./readingContract";

const text = z.string();
const optionalText = text.nullable();
const number = z.number();
const optionalNumber = number.nullable();
const strings = z.array(text);

// Public fields are explicit so adding a Prisma/admin column never publishes it.
const publicResortScalars = z.object({
  id: text,
  nameJa: text,
  nameEn: text,
  shortName: optionalText,
  nameRuby: nameRubySchema,
  formerNames: formerNamesSchema,
  prefecture: text,
  town: text,
  latitude: number,
  longitude: number,
  topElevation: number,
  baseElevation: number,
  verticalDrop: number,
  numberOfCourses: number,
  longestCourse: number,
  steepestSlope: optionalNumber,
  beginnersCoursesPercent: number,
  intermediateCoursesPercent: number,
  advancedCoursesPercent: number,
  courseImages: strings,
  typeNotPressed: optionalNumber,
  typePressed: optionalNumber,
  typeBump: optionalNumber,
  angleMax: optionalNumber,
  angleAvg: optionalNumber,
  numberOfLifts: number,
  ropeways: number,
  gondolas: number,
  quadLifts: number,
  tripleLifts: number,
  pairLifts: number,
  singleLifts: number,
  otherLifts: number,
  liftCapacity: optionalNumber,
  weekdayOpen: optionalText,
  weekdayClose: optionalText,
  weekendOpen: optionalText,
  weekendClose: optionalText,
  timesComment: optionalText,
  website: optionalText,
  skiersPercent: optionalNumber,
  snowboardersPercent: optionalNumber,
  sources: strings,
  descriptionShort: optionalText,
  descriptionLong: optionalText,
  outlineImages: strings,
  condition: optionalText,
  status: optionalText,
  review: optionalNumber,
  yukiMagiId: optionalText,
});
const course = z.object({
  id: text,
  skiResortId: text,
  name: text,
  snowboard: optionalText,
  difficulty: optionalText,
  distance: optionalNumber,
  angle: optionalNumber,
  note: optionalText,
});
const lift = z.object({
  id: text,
  skiResortId: text,
  name: text,
  type: optionalText,
  distance: optionalNumber,
  hood: optionalText,
});
const ticket = z.object({
  id: text,
  skiResortId: text,
  name: text,
  priceAdult: optionalNumber,
  priceChild: optionalNumber,
  priceOlderChild: optionalNumber,
  priceSenior: optionalNumber,
});
const yukiMagi = z.object({
  id: text,
  name: text,
  url: optionalText,
  tag: optionalText,
  benefit: optionalText,
  period: optionalText,
  exclusionDate: optionalText,
});
export const publicSkiResortSchema = publicResortScalars.extend({
  courses: z.array(course),
  lifts: z.array(lift),
  tickets: z.array(ticket),
  yukiMagi: yukiMagi.nullable(),
});

const selectShape = <T extends z.ZodRawShape>(shape: T) =>
  Object.fromEntries(Object.keys(shape).map(key => [key, true])) as {
    [K in keyof T]: true;
  };

/** The same allowlist shapes both the DB query and the remote API response. */
export const publicSkiResortSelect = {
  ...selectShape(publicResortScalars.shape),
  ...readingRelationsSelect,
  courses: { select: selectShape(course.shape) },
  lifts: { select: selectShape(lift.shape) },
  tickets: { select: selectShape(ticket.shape) },
  yukiMagi: { select: selectShape(yukiMagi.shape) },
} satisfies Prisma.SkiResortSelect;

export type PublicSkiResortRecord = z.infer<typeof publicSkiResortSchema>;
