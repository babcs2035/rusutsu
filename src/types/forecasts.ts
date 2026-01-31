export interface ForecastData {
  temperatures: {
    weeks: {
      max: number[][];
      min: number[][];
    };
  };
  snowfalls: {
    significantSnowfall: number[];
  };
}

export interface ForecastsT {
  meta: { date_start: string | Date };
  top: ForecastData;
  middle: ForecastData;
  bottom: ForecastData;
}
