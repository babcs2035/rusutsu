export type TrackCourse = {
  id: string;
  resortId: string;
  resortName: string;
  name: string;
  passes: number;
  distance: number;
};

export type TrackAnalysis = {
  version: 1;
  name: string;
  declaredResort: string | null;
  start: string;
  finish: string;
  runs: number;
  lifts: number;
  distance: number;
  vertical: number;
  skiSeconds: number;
  liftSeconds: number;
  maxSpeed: number;
  gpsDistance: number;
  matchedDistance: number;
  courses: TrackCourse[];
  segments: {
    sequence: number;
    start: number;
    end: number;
    distance: number;
    vertical: number;
    courses: string[];
  }[];
};

export type SavedSkiTrack = {
  id: string;
  fileName: string;
  importedAt: string;
  analysis: TrackAnalysis;
};
