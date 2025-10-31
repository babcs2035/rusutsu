export interface SkiAreaI {
  Id: number;
  UniqueName: string;
  NameJapanese: string;
  Name: string;
  PrefectureNameJapanese: string;
  TownNameJapanese: string;
  Location_Latitude: string;
  Location_Longitude: string;
  CourseMapLarge: string | null;
  CourseMapSmall: string | null;
  MaximumElevation: number;
  VerticalDifference: number;
  MinimumElevation: number;
  TotalSkiCourses: number;
  LongestCourse: number;
  steepestSlope: number;
  BeginnersCourses: number;
  IntermediateCourses: number;
  AdvancedCourses: number;
  TotalSkiLifts: number;
  RopeWays: number;
  Gondolas: number;
  QuadLifts: number;
  TripleLifts: number;
  PairLifts: number;
  SingleLifts: number;
  OtherLifts: number;
  SkiersPercent: number;
  SnowboardersPercent: number;
  WeekdayOpenTime: string;
  WeekdayCloseTime: string;
  WeekendOpenTime: string;
  WeekendCloseTime: string;
  OpeningTimeComments: string;
  WebUrl: string;
}

export interface SkiAreaTicketI {
  NameOfTicket: string;
  AdultTicket: string;
  ChildTicket: string;
  OlderChildTicket: string;
  SeniorTicket: string;
}
