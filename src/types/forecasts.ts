export interface ForecastData {
  temperatures: {
    weeks: {
      max: number[];
      min: number[];
    };
  };
  snowfalls: {
    snowfall: number[];
    significantSnowfall: number[];
    significantRainfall: number[];
  };
  conditions: {
    bluebirdPowder: number[];
    powder: number[];
    bluebird: number[];
  };
}

export interface ForecastsT {
  meta: { date_start: string | Date };
  top: ForecastData;
  middle: ForecastData;
  bottom: ForecastData;
}
