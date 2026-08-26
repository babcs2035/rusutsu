/**
 * コース・リフトの表示用データを、その場で組み立てる。
 *
 * これまでは combined_courses.py / combined_lifts.py が書き出した
 * resorts-finalized の GeoJSON を読んでいたが、表示のたびに
 * 元データ（*_before / *_10m / *_20m / latest_data）から組み直す形にした。
 * 中間ファイルの作り忘れで古い状況が出続けることがなくなる。
 *
 * 突き合わせの規則は 2 つの Python スクリプトに合わせてある。
 * 警告文もそのまま同じ文字列を出すので、scripts/validateResortMapData.ts で
 * これまでと同じ問題を拾える。
 */

export type MergeIssue = {
  level: "error" | "warn";
  message: string;
};

export type RawGeoFeature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
};

export type MergeResult = {
  features: RawGeoFeature[];
  issues: MergeIssue[];
};

const SPECIAL_PARTS = ["上部", "中部", "下部"] as const;
const VALID_SYMBOLS = new Set(["○", "△", "×"]);

/**
 * クローリング結果の名前を GeoJSON 側の書き方へ寄せる。
 * "白樺ゲレンデ上部" / "白樺ゲレンデ 上部" → "白樺ゲレンデ_#上部"
 */
export const normalizeCrawledName = (name: string): string => {
  if (name.includes("_")) return name;

  const text = name.replace(/　/gu, " ").trim();
  for (const part of SPECIAL_PARTS) {
    if (text.endsWith(` ${part}`)) {
      return `${text.slice(0, -(part.length + 1)).trim()}_#${part}`;
    }
  }
  for (const part of SPECIAL_PARTS) {
    if (text.endsWith(part)) {
      return `${text.slice(0, -part.length)}_#${part}`;
    }
  }
  return text;
};

/** "白樺ゲレンデ_上部" → "白樺ゲレンデ_#上部" */
export const addSectionMarker = (name: string): string =>
  name.replace(/_(?!#)/gu, "_#");

/** "白樺ゲレンデ_#上部" → "白樺ゲレンデ_上部"（*_before 側の書き方に戻す） */
export const stripSectionMarker = (name: string): string =>
  name.replace(/_#/gu, "_");

/** "スカイライン_尾根筋コース" → "スカイライン" */
export const canonicalBase = (name: string): string => name.split("_")[0] ?? "";

/** 区切りが 2 つ以上あるときだけ末尾の _数字 を落とす */
export const removeSuffixIndexIfMultiPart = (name: string): string =>
  (name.match(/_/gu)?.length ?? 0) >= 2 ? name.replace(/_\d+$/u, "") : name;

/**
 * 内部名を画面に出す名前へ整える。
 * "無名_連絡" → "連絡" / "ウスバ_下部" → "ウスバ下部" /
 * "スカイライン_尾根筋コース" → "スカイライン (尾根筋コース)"
 */
export const adjustCourseName = (name: string): string => {
  const parts = name.split("_");
  if (parts.length === 2) {
    const [base, suffix] = parts as [string, string];
    if (base === "無名") return /^\d+$/u.test(suffix) ? base : suffix;
    if (/^\d+$/u.test(suffix)) return name;
    if (suffix.startsWith("#")) return name;
    if (SPECIAL_PARTS.some(part => suffix.startsWith(part))) {
      return `${base}${suffix}`;
    }
    return `${base} (${suffix})`;
  }
  if (parts.length === 3) {
    const [base, mid, suffix] = parts as [string, string, string];
    return mid.startsWith("#")
      ? `${base}_${suffix}`
      : `${base}${mid}_${suffix}`;
  }
  return name;
};

/** Python の float() と同じ見え方にする（2013 → "2013.0"） */
const formatPythonFloat = (value: number) =>
  Number.isInteger(value) ? `${value}.0` : `${value}`;

/** Python の print と同じ見え方にする（未設定は None） */
const formatPythonValue = (value: unknown) =>
  value === undefined || value === null ? "None" : String(value);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getName = (item: Record<string, unknown>): string | null => {
  const name = item.name;
  return typeof name === "string" && name.length > 0 ? name : null;
};

/** 基本情報を名前で引けるようにする。*_before と *_detail のどちらでも同じ形 */
export const createBaseLookup = (items: Record<string, unknown>[]) => {
  const lookup = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const name = getName(item);
    if (name) lookup.set(name, item);
  }
  return lookup;
};

/**
 * 「〜コース」「〜リフト」の有無だけの違いは同じものとして扱う。
 * Excel が「ヤマバトコース」、地図が「ヤマバト」のような食い違いを吸収する。
 */
export const stripKindWord = (name: string) =>
  name.replace(/(コース|リフト)$/u, "").trim();

export type BaseNameIndex = {
  exact: Set<string>;
  /** 種別語を落とした形 → 元の名前 */
  stripped: Map<string, string>;
};

export const createBaseNameIndex = (names: Iterable<string>): BaseNameIndex => {
  const exact = new Set<string>();
  const stripped = new Map<string, string>();

  for (const name of names) {
    exact.add(name);
    const key = stripKindWord(name);
    if (key.length > 0 && !stripped.has(key)) stripped.set(key, name);
  }

  return { exact, stripped };
};

/**
 * 地図側の名前に対応する、基本情報側の名前を探す。
 *
 * まず書いてあるとおりに探し、見つからなければ種別語を落とした形で探す。
 * コースは区切りの書き方（_# の有無）とベース名の違いも見る。
 */
export const matchBaseName = (
  index: BaseNameIndex,
  name: string,
  kind: "course" | "lift",
): string | null => {
  const candidates =
    kind === "course"
      ? [name, stripSectionMarker(name), canonicalBase(name)]
      : [name];

  for (const candidate of candidates) {
    if (index.exact.has(candidate)) return candidate;
  }
  for (const candidate of candidates) {
    const matched = index.stripped.get(stripKindWord(candidate));
    if (matched) return matched;
  }
  return null;
};

const findBase = (
  lookup: Map<string, Record<string, unknown>>,
  index: BaseNameIndex,
  name: string,
  kind: "course" | "lift",
) => {
  const matched = matchBaseName(index, name, kind);
  return matched === null ? null : (lookup.get(matched) ?? null);
};

/**
 * 同じ画像が別のコースに割り当てられていないか調べる。
 * コースは「上部・下部」で分かれた同一コースなら同じ画像でよい。
 */
const collectDuplicateImageIssues = (
  lookup: Map<string, Record<string, unknown>>,
  allowSameCanonicalBase: boolean,
): MergeIssue[] => {
  const issues: MergeIssue[] = [];
  const seen = new Map<string, string>();

  for (const [name, item] of lookup) {
    const imageUrl = item.image;
    if (typeof imageUrl !== "string" || imageUrl.length === 0) continue;

    const previousName = seen.get(imageUrl);
    if (previousName === undefined) {
      seen.set(imageUrl, name);
      continue;
    }
    if (
      allowSameCanonicalBase &&
      canonicalBase(name) === canonicalBase(previousName)
    ) {
      continue;
    }
    issues.push({
      level: "error",
      message: `❌ Duplicate image URL '${imageUrl}' found in: '${previousName}' and '${name}'`,
    });
  }

  return issues;
};

const checkSymbolFields = (
  base: Record<string, unknown>,
  keys: readonly string[],
  sourceLabel: string,
  name: string,
): MergeIssue[] =>
  keys.flatMap<MergeIssue>(key => {
    const value = base[key];
    if (value === undefined || value === null || value === "") {
      return [
        {
          level: "error",
          message: `❌ '${key}' is empty in ${sourceLabel}: ${name}`,
        },
      ];
    }
    if (!VALID_SYMBOLS.has(String(value))) {
      return [
        {
          level: "error",
          message: `❌ Invalid value for '${key}' in ${sourceLabel}: ${name} → ${value}`,
        },
      ];
    }
    return [];
  });

/** latest_data の note は、基本情報側の note と区別するため latest_note に移す */
const renameStatusKeys = (status: Record<string, unknown>) => {
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(status)) {
    if (key === "name") continue;
    renamed[key === "note" ? "latest_note" : key] = value;
  }
  return renamed;
};

const withoutName = (base: Record<string, unknown>) => {
  const { name: _name, ...rest } = base;
  return rest;
};

export const mergeCourseFeatures = ({
  geometryFeatures,
  baseItems,
  statusItems,
  baseSourceLabel,
  hasStatusSource,
  validateBaseFields,
}: {
  /** slope_10m（無ければ slope_before）の線 */
  geometryFeatures: RawGeoFeature[];
  baseItems: Record<string, unknown>[];
  /** latest_data の courses */
  statusItems: Record<string, unknown>[];
  baseSourceLabel: string;
  hasStatusSource: boolean;
  /**
   * 基本情報が人手で整備済みのときだけ true。
   * OSM から取っただけの *_before に対して欠損を数え上げても意味がない。
   */
  validateBaseFields: boolean;
}): MergeResult => {
  const baseLookup = createBaseLookup(baseItems);
  const statusLookup = new Map<string, Record<string, unknown>>();
  for (const item of statusItems) {
    const name = getName(item);
    if (name) statusLookup.set(normalizeCrawledName(name), item);
  }

  const baseNameIndex = createBaseNameIndex(baseLookup.keys());
  const issues: MergeIssue[] = validateBaseFields
    ? collectDuplicateImageIssues(baseLookup, true)
    : [];
  const features: RawGeoFeature[] = [];

  for (const feature of geometryFeatures) {
    const normName = getName(feature.properties);
    if (!normName) {
      // 名前が無い線は突き合わせようがないので、そのまま通す
      features.push(feature);
      continue;
    }

    const base = findBase(baseLookup, baseNameIndex, normName, "course");
    if (!base && validateBaseFields) {
      issues.push({
        level: "warn",
        message: `⚠️ ${baseSourceLabel} not found: ${normName}`,
      });
    }

    const statusName = removeSuffixIndexIfMultiPart(normName);
    const status =
      statusLookup.get(statusName) ??
      statusLookup.get(canonicalBase(normName)) ??
      statusLookup.get(addSectionMarker(statusName)) ??
      null;
    if (!status && canonicalBase(normName) !== "無名" && hasStatusSource) {
      issues.push({
        level: "warn",
        message: `⚠️ Crawled data not found: ${normName}`,
      });
    }

    const properties: Record<string, unknown> = { ...feature.properties };
    properties.name = adjustCourseName(normName);
    // 同名の線をひとまとめに扱うため、元の内部名も残す
    properties.source_name = normName;

    if (base) {
      if (validateBaseFields) {
        issues.push(
          ...checkSymbolFields(
            base,
            ["piste", "snowboard"],
            baseSourceLabel,
            normName,
          ),
          // Python 版には無いが、動画検索に使うので欠けていたら知らせる
          ...checkRequiredFields(
            base,
            ["searchWord"],
            baseSourceLabel,
            normName,
          ),
        );
      }
      Object.assign(properties, withoutName(base));
    }
    if (status) Object.assign(properties, renameStatusKeys(status));

    features.push({
      type: "Feature",
      geometry: feature.geometry,
      properties,
    });
  }

  return { features, issues };
};

export const mergeLiftFeatures = ({
  geometryFeatures,
  baseItems,
  statusItems,
  baseSourceLabel,
  hasStatusSource,
  validateBaseFields,
}: {
  geometryFeatures: RawGeoFeature[];
  baseItems: Record<string, unknown>[];
  statusItems: Record<string, unknown>[];
  baseSourceLabel: string;
  hasStatusSource: boolean;
  validateBaseFields: boolean;
}): MergeResult => {
  const baseLookup = createBaseLookup(baseItems);
  const statusLookup = new Map<string, Record<string, unknown>>();
  for (const item of statusItems) {
    const name = getName(item);
    if (name) statusLookup.set(name, item);
  }

  const baseNameIndex = createBaseNameIndex(baseLookup.keys());
  const issues: MergeIssue[] = validateBaseFields
    ? collectDuplicateImageIssues(baseLookup, false)
    : [];
  const features: RawGeoFeature[] = [];

  for (const feature of geometryFeatures) {
    const name = getName(feature.properties);
    if (!name) {
      features.push(feature);
      continue;
    }

    const base = findBase(baseLookup, baseNameIndex, name, "lift");
    if (!base && validateBaseFields) {
      issues.push({
        level: "warn",
        message: `⚠️ ${baseSourceLabel} not found: ${name}`,
      });
    }

    const status = statusLookup.get(name) ?? null;
    if (!status && hasStatusSource) {
      issues.push({
        level: "warn",
        message: `⚠️ Crawled data not found: ${name}`,
      });
    }

    if (base && validateBaseFields) {
      issues.push(
        ...compareMeasurements(base, feature.properties, name),
        ...checkSymbolFields(
          base,
          ["hood", "footrest", "oilShield"],
          baseSourceLabel,
          name,
        ),
        ...checkRequiredFields(
          base,
          ["speed", "type", "capacity", "searchWord"],
          baseSourceLabel,
          name,
        ),
      );
    }

    const properties: Record<string, unknown> = { ...feature.properties };
    if (base) Object.assign(properties, withoutName(base));
    if (status) Object.assign(properties, renameStatusKeys(status));

    features.push({
      type: "Feature",
      geometry: feature.geometry,
      properties,
    });
  }

  return { features, issues };
};

const checkRequiredFields = (
  base: Record<string, unknown>,
  keys: readonly string[],
  sourceLabel: string,
  name: string,
): MergeIssue[] =>
  keys.flatMap<MergeIssue>(key => {
    const value = base[key];
    if (value === undefined || value === null || value === "") {
      return [
        {
          level: "error",
          message: `❌ '${key}' is empty in ${sourceLabel}: ${name}`,
        },
      ];
    }
    return [];
  });

/** 公表値と地図から測った値がかけ離れていないか見る */
const compareMeasurements = (
  base: Record<string, unknown>,
  mapProperties: Record<string, unknown>,
  name: string,
): MergeIssue[] => {
  const issues: MergeIssue[] = [];
  const checks = [
    {
      officialKey: "distance",
      mapKey: "slope_dist_map",
      label: "distances",
      mismatch: "Distance",
      ratio: 0.04,
      absolute: 30,
    },
    {
      officialKey: "vertical",
      mapKey: "elevation_diff_map",
      label: "verticals",
      mismatch: "Vertical",
      ratio: 0.04,
      absolute: 10,
    },
  ] as const;

  for (const check of checks) {
    const official = base[check.officialKey];
    const map = mapProperties[check.mapKey];
    if (official === "" || map === "") continue;

    const officialValue = toFiniteNumber(official);
    const mapValue = toFiniteNumber(map);
    if (officialValue === null || mapValue === null) {
      issues.push({
        level: "warn",
        message: `⚠️ Could not parse ${check.label} for '${name}': detail ${formatPythonValue(official)}, ${check.mapKey} ${formatPythonValue(map)}`,
      });
      continue;
    }

    const diff = Math.abs(officialValue - mapValue);
    if (diff / officialValue > check.ratio && diff > check.absolute) {
      issues.push({
        level: "warn",
        message: `⚠️ ${check.mismatch} mismatch for '${name}': official: ${formatPythonFloat(officialValue)}, map: ${formatPythonFloat(mapValue)}`,
      });
    }
  }

  return issues;
};
