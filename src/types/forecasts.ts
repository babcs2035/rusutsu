export type ForecastsT = {
  meta: {
    id: string;
    name: {
      ja: string;
      en: string;
    };
    date_start: string;
    date_end: string;
  };
  top: ForecastT;
  middle: ForecastT;
  bottom: ForecastT;
};

export type ForecastT = {
  conditions: {
    bluebirdPowder: number[];
    powder: number[];
    bluebird: number[];
  };
  snowfalls: {
    snowfall: number[];
    significantSnowfall: number[];
    significantRainfall: number[];
  };
  temperatures: {
    all: {
      min: number[];
      max: number[];
    };
    weeks: {
      min: number[][];
      max: number[][];
    };
  };
};
