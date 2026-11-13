import { ENTRY_KINDS, type PublicPost } from "./contract";

/** 1人が1日（滑走日）に投稿したレポートをまとめたページ。basePath は付けない。 */
export const dayReportsPath = (
  authorId: string,
  observedOn: string,
  postId?: string,
) =>
  `/community/day/${encodeURIComponent(authorId)}/${observedOn}${postId ? `?post=${encodeURIComponent(postId)}` : ""}`;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/** 滑走日（YYYY-MM-DD）を「2026/11/13(金)」のように書く。 */
export function formatObservedOn(observedOn: string, withYear = true) {
  const [year, month, day] = observedOn.split("-").map(Number);
  const weekday =
    WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${withYear ? `${year}/` : ""}${month}/${day}(${weekday})`;
}

/** 投稿の多い順のスキー場。同数なら最初に滑った順。 */
export function dayResorts(
  posts: Pick<PublicPost, "resortId" | "resortName">[],
) {
  const resorts = new Map<
    string,
    { id: string; name: string; count: number }
  >();
  for (const post of posts) {
    const resort = resorts.get(post.resortId);
    if (resort) resort.count++;
    else
      resorts.set(post.resortId, {
        id: post.resortId,
        name: post.resortName,
        count: 1,
      });
  }
  return [...resorts.values()].sort((a, b) => b.count - a.count);
}

/** 「コース3件・リフト1件」。本文は入れない（SNS側に残っても困らない内容だけにする）。 */
export function dayKindSummary(posts: Pick<PublicPost, "entries">[]) {
  const counts = new Map<keyof typeof ENTRY_KINDS, number>();
  for (const post of posts) {
    const kind = post.entries[0]?.kind;
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return (Object.keys(ENTRY_KINDS) as (keyof typeof ENTRY_KINDS)[])
    .filter(kind => counts.has(kind))
    .map(kind => `${ENTRY_KINDS[kind]}${counts.get(kind)}件`)
    .join("・");
}

/** 共有の見出し。「ルスツリゾートの現地レポート 11/13(金)」。 */
export function dayShareTitle(
  posts: Pick<PublicPost, "resortId" | "resortName">[],
  observedOn: string,
) {
  const resorts = dayResorts(posts);
  const names =
    resorts.length > 2
      ? `${resorts[0].name}ほか${resorts.length - 1}か所`
      : resorts.map(resort => resort.name).join("・");
  return `${names}の現地レポート ${formatObservedOn(observedOn, false)}`;
}

/** SNSへ渡す文。URLは別に渡す。 */
export const dayShareText = (
  posts: Pick<PublicPost, "resortId" | "resortName" | "entries">[],
  observedOn: string,
) => `${dayShareTitle(posts, observedOn)}（${dayKindSummary(posts)}）`;

/** 共有先ごとの投稿画面。 */
export function shareTargets(url: string, text: string) {
  const encodedUrl = encodeURIComponent(url);
  return [
    {
      id: "x",
      label: "X",
      href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodedUrl}`,
    },
    {
      id: "line",
      label: "LINE",
      href: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}&text=${encodeURIComponent(text)}`,
    },
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
  ] as const;
}

/** 一覧の1行に出す要約。選んだ値を並べ、自由記述があれば最後に添える。 */
export function entrySummary(entry: PublicPost["entries"][number]) {
  return [
    entry.status,
    ...entry.snowQualities,
    entry.crowding,
    entry.waitMinutes != null ? `待ち約${entry.waitMinutes}分` : null,
    entry.liftSpeedLevel ? `速度${entry.liftSpeedLevel}` : null,
    entry.depth ? `深さ${entry.depth}` : null,
    entry.size,
    entry.body.replace(/\s+/g, " ").trim(),
  ]
    .filter(Boolean)
    .join("・");
}
