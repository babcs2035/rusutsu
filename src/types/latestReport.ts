export type LatestReportT = {
  id: string;
  datetime: string;
  snowfall: number;
  temperature: {
    base: number;
    top: number;
  };
  overview: string;
  precipitation: string;
  wind: string;
  visibility: string;
};
