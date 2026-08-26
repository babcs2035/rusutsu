export interface WeatherData {
  winds: { speed: number; direction: string }[];
  snows: number[];
  temperatures: number[];
}

export interface WeathersT {
  meta: { date: string | Date };
  top: WeatherData;
  mid: WeatherData;
  bot: WeatherData;
}
