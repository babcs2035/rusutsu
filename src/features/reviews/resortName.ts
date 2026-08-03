const REVIEW_RESORT_NAME_OVERRIDES: Record<string, string> = {
  "shiga-kogen-central": "志賀高原中央エリア",
  "shiga-kogen-yokoteyama-shibutoge": "志賀高原 横手山・渋峠スキー場",
};

export const getReviewResortName = (
  resortId: string,
  databaseName: string | undefined,
) => databaseName?.trim() || REVIEW_RESORT_NAME_OVERRIDES[resortId] || resortId;
