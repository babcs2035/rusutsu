export type SnowDepthsT = {
  firstYear: number;
  data: number[][][];
};

export type SnowFallsT = {
  firstYear: number;
  data: number[][][];
};

export type WeathersT = {
  meta: {
    id: string;
    name: {
      ja: string;
      en: string;
    };
    date: string;
    source: string;
  };
  top: WeatherT;
  mid: WeatherT;
  bot: WeatherT;
};

export type WeatherT = {
  winds: {
    speed: number;
    direction: string;
  }[];
  snows: number[];
  temperatures: number[];
};
