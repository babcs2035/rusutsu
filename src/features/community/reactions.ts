import {
  EXISTENCE_REACTIONS,
  type PostReaction,
  type ReactionKind,
} from "./contract";

/**
 * 押した瞬間の見た目。サーバーの応答が届いたら、その内容で置き換える。
 * 「まだあった」と「なかった」は片方だけ残す。
 */
export function applyReaction(
  reactions: PostReaction[],
  kind: ReactionKind,
  active: boolean,
  now = new Date(),
): PostReaction[] {
  const exclusive = EXISTENCE_REACTIONS.includes(kind);
  return reactions.map(reaction => {
    if (reaction.kind === kind) {
      if (reaction.mine === active) return reaction;
      return {
        ...reaction,
        mine: active,
        count: Math.max(0, reaction.count + (active ? 1 : -1)),
        latestAt: active ? now.toISOString() : reaction.latestAt,
      };
    }
    if (
      active &&
      exclusive &&
      EXISTENCE_REACTIONS.includes(reaction.kind) &&
      reaction.mine
    )
      return {
        ...reaction,
        mine: false,
        count: Math.max(0, reaction.count - 1),
      };
    return reaction;
  });
}

/** 「まだあった／なかった」のうち、いちばん新しい確認。 */
export function latestExistence(reactions: PostReaction[]) {
  let latest: { kind: ReactionKind; at: string } | null = null;
  for (const reaction of reactions) {
    if (
      !EXISTENCE_REACTIONS.includes(reaction.kind) ||
      !reaction.count ||
      !reaction.latestAt
    )
      continue;
    if (!latest || reaction.latestAt > latest.at)
      latest = { kind: reaction.kind, at: reaction.latestAt };
  }
  return latest;
}

/** 日本時間の「月/日」。 */
export const formatMonthDay = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
