export type AmedasT = {
  amds_snowd: AmedasForecastT[];
  amds_snowf03h: AmedasForecastT[];
  amds_snowf06h: AmedasForecastT[];
  amds_snowf12h: AmedasForecastT[];
  amds_snowf24h: AmedasForecastT[];
  amds_snowf48h: AmedasForecastT[];
  amds_snowf72h: AmedasForecastT[];
};

export type AmedasForecastT = {
  code: number;
  location: number[];
  value: number;
};
