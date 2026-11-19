/**
 * シーズン券・キッズパスなど、1つの券で複数のスキー場を滑れるサービス。
 * 対象スキー場一覧はクローラー（src/private/scripts/crawlPassPrograms.ts）が
 * pass_program_resorts へ取り込み、ホームの絞り込みに使う。並びは絞り込みのボタン順。
 */
export const PASS_PROGRAMS = [
  {
    id: "nsdKids",
    label: "NSDキッズ",
    name: "NSDキッズプログラム",
    url: "https://www.nippon-ski.jp/kids/",
  },
  {
    id: "macEarth",
    label: "マックアース",
    name: "マックアースジャパン共通シーズン券",
    url: "https://seasonpass.chubu-snow.com/mej/",
  },
  {
    id: "snowbirds",
    label: "スノーバーズ",
    name: "スノーバーズクラブ",
    url: "https://www.snowbirdsclub.net/",
  },
] as const;

export type PassProgram = (typeof PASS_PROGRAMS)[number];
export type PassProgramId = PassProgram["id"];

export const PASS_PROGRAM_IDS = PASS_PROGRAMS.map(
  program => program.id,
) as unknown as readonly [PassProgramId, ...PassProgramId[]];

export const isPassProgramId = (value: string): value is PassProgramId =>
  PASS_PROGRAMS.some(program => program.id === value);

/** 雪マジの紹介ページ（絞り込みのボタンから開く） */
export const YUKIMAJI_URL = "https://majibu.jp/pickup/yukimaji/index.html";
