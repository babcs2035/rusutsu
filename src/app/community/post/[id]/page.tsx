"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deleteComment,
  deletePost,
  getPostDetail,
  reportCommunityContent,
  saveComment,
  setPostLike,
  updatePost,
} from "@/features/community/actions";
import type {
  PostDraft,
  PublicComment,
  PublicPost,
} from "@/features/community/contract";
import {
  COURSE_CONDITIONS,
  ITEM_TYPES,
  MOGUL_SNOW,
  SNOW_QUALITIES,
} from "@/features/community/contract";
import { withAnonymousCheck } from "@/features/corrections/anonymousCheck";

export default function CommunityPostDetail() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [history, setHistory] = useState<PublicPost[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentEditBody, setCommentEditBody] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const reload = () => {
    void getPostDetail(id).then(result => {
      if (!result.ok) return;
      setPost(result.data.post);
      setComments(result.data.comments);
      setHistory(result.data.history);
      setViewer(result.data.viewerId);
    });
  };
  useEffect(reload, [id]);
  if (!post) return <main className="p-4">投稿を読み込み中…</main>;
  const title =
    post.kind === "MOGUL"
      ? post.present
        ? "コブあり"
        : "コブなし"
      : post.kind === "ITEM"
        ? `${post.itemType} ${post.present ? "設置中" : "撤去済み"}`
        : "滑走レポート";
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link
        href={`/community/${encodeURIComponent(post.resortId)}`}
        className="text-sm underline"
      >
        ← 投稿一覧
      </Link>
      <article className="space-y-3 rounded-xl border p-4">
        <div className="flex justify-between">
          <h1 className="font-bold">{title}</h1>
          <time className="text-xs text-gray-500">{post.observedOn}</time>
        </div>
        <p className="text-sm">
          <Link className="underline" href={`/profile/${post.author.id}`}>
            {post.author.publicName}
          </Link>{" "}
          · {post.courseName ?? "スキー場全体"}{" "}
          {post.rating ? `· ★ ${post.rating}` : ""}
        </p>
        {post.body && (
          <p className="whitespace-pre-wrap text-sm">{post.body}</p>
        )}
        {post.snowQualities.length > 0 && (
          <p className="text-sm">{post.snowQualities.join("・")}</p>
        )}
        {post.conditions.length > 0 && (
          <p className="text-sm">{post.conditions.join("・")}</p>
        )}
        {post.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {post.photos.map(photo => (
              <Image
                key={photo.id}
                className="w-full rounded-lg object-cover"
                src={`/rusutsu/api/community/photos/${photo.id}`}
                alt="投稿写真"
                width={photo.width}
                height={photo.height}
                unoptimized
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() =>
              start(async () => {
                const result = await setPostLike(post.id, !post.liked);
                if (result.ok) reload();
                else setError(result.error);
              })
            }
          >
            {post.liked ? "♥" : "♡"} {post.likeCount}
          </button>
          {(post.kind === "MOGUL" || post.kind === "ITEM") && (
            <Link
              className="rounded border px-3 py-1.5 text-sm"
              href={`/community/${post.resortId}/new?parentId=${post.id}`}
            >
              状況を追加報告
            </Link>
          )}
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() => {
              const body = prompt("報告内容（任意）") ?? "";
              const reason = prompt(
                "理由を入力: 不適切な内容 / 迷惑行為 / 個人情報 / その他",
                "その他",
              );
              if (reason)
                void withAnonymousCheck(proof =>
                  reportCommunityContent(
                    "POST",
                    post.id,
                    ["不適切な内容", "迷惑行為", "個人情報", "その他"].includes(
                      reason,
                    )
                      ? reason
                      : "その他",
                    body,
                    proof,
                  ),
                );
            }}
          >
            報告する
          </button>
          {viewer === post.author.id && (
            <>
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm"
                onClick={() => setEditing(!editing)}
              >
                編集
              </button>
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm text-red-700"
                onClick={() => {
                  if (confirm("この投稿を削除しますか？"))
                    void deletePost(post.id, post.version).then(reload);
                }}
              >
                削除
              </button>
            </>
          )}
        </div>
        {editing && (
          <EditPost
            post={post}
            onDone={() => {
              setEditing(false);
              reload();
            }}
          />
        )}
      </article>
      {history.length > 1 && (
        <section className="space-y-2 rounded-xl border p-4">
          <h2 className="font-semibold">この場所の報告履歴</h2>
          {history.map(item => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"
            >
              <div>
                <b>
                  {item.kind === "MOGUL"
                    ? item.present
                      ? "コブあり"
                      : "コブなし"
                    : `${item.itemType ?? "アイテム"} ${item.present ? "設置中" : "撤去済み"}`}
                </b>
                <span className="ml-2 text-xs text-gray-500">
                  {item.author.publicName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <time className="text-xs text-gray-500">{item.observedOn}</time>
                <Link
                  className="text-xs underline"
                  href={`/community/post/${item.id}`}
                >
                  詳細
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">コメント ({comments.length})</h2>
        {comments.map(comment => (
          <div key={comment.id} className="rounded border p-3 text-sm">
            {editingComment === comment.id ? (
              <>
                <textarea
                  className="min-h-20 w-full rounded border p-2"
                  value={commentEditBody}
                  onChange={event => setCommentEditBody(event.target.value)}
                />
                <button
                  type="button"
                  className="mr-2 mt-2 rounded bg-sky-700 px-3 py-1 text-white"
                  onClick={() =>
                    start(async () => {
                      const result = await saveComment(
                        post.id,
                        commentEditBody,
                        crypto.randomUUID(),
                        comment.id,
                        comment.version,
                      );
                      if (result.ok) {
                        setEditingComment(null);
                        reload();
                      } else setError(result.error);
                    })
                  }
                >
                  変更を保存
                </button>
                <button
                  type="button"
                  className="mt-2 underline"
                  onClick={() => setEditingComment(null)}
                >
                  キャンセル
                </button>
              </>
            ) : (
              <p className="whitespace-pre-wrap">{comment.body}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              <Link
                className="underline"
                href={`/profile/${comment.author.id}`}
              >
                {comment.author.publicName}
              </Link>{" "}
              · {new Date(comment.createdAt).toLocaleString("ja-JP")}
            </p>
            {viewer === comment.author.id && (
              <>
                <button
                  type="button"
                  className="mt-1 text-xs underline"
                  onClick={() => {
                    setEditingComment(comment.id);
                    setCommentEditBody(comment.body);
                  }}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="ml-3 mt-1 text-xs text-red-700 underline"
                  onClick={() =>
                    void deleteComment(comment.id, comment.version).then(reload)
                  }
                >
                  削除
                </button>
              </>
            )}
            <button
              type="button"
              className="ml-3 text-xs underline"
              onClick={() => {
                const body = prompt("報告内容（任意）") ?? "";
                const reason = prompt(
                  "理由を入力: 不適切な内容 / 迷惑行為 / 個人情報 / その他",
                  "その他",
                );
                if (reason)
                  void withAnonymousCheck(proof =>
                    reportCommunityContent(
                      "COMMENT",
                      comment.id,
                      [
                        "不適切な内容",
                        "迷惑行為",
                        "個人情報",
                        "その他",
                      ].includes(reason)
                        ? reason
                        : "その他",
                      body,
                      proof,
                    ),
                  );
              }}
            >
              報告
            </button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={event => {
            event.preventDefault();
            if (!body.trim()) return;
            start(async () => {
              const result = await saveComment(
                post.id,
                body,
                crypto.randomUUID(),
              );
              if (result.ok) {
                setBody("");
                reload();
              } else setError(result.error);
            });
          }}
        >
          <input
            className="h-10 min-w-0 flex-1 rounded border px-3"
            value={body}
            onChange={event => setBody(event.target.value)}
            maxLength={2000}
            placeholder="コメントを書く"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-700 px-4 text-white"
          >
            送信
          </button>
        </form>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
    </main>
  );
}

function EditPost({ post, onDone }: { post: PublicPost; onDone: () => void }) {
  const [draft, setDraft] = useState<PostDraft>({
    kind: post.kind,
    courseId: post.courseId,
    observedOn: post.observedOn,
    body: post.body,
    snowQualities: post.snowQualities,
    conditions: post.conditions,
    crowding: post.crowding,
    rating: post.rating,
    latitude: post.latitude,
    longitude: post.longitude,
    present: post.present,
    itemType: post.itemType,
    size: post.size,
    parentId: post.parentId,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const updateDraft = (patch: Partial<PostDraft>) =>
    setDraft(current => ({ ...current, ...patch }));
  return (
    <div className="space-y-2">
      <textarea
        className="min-h-24 w-full rounded border p-2"
        value={draft.body}
        onChange={event => updateDraft({ body: event.target.value })}
      />
      <label className="block text-sm">
        現地確認日
        <input
          className="ml-2 h-9 rounded border px-2"
          type="date"
          value={draft.observedOn}
          onChange={event => updateDraft({ observedOn: event.target.value })}
        />
      </label>
      {post.kind === "REPORT" && (
        <>
          <ChoiceButtons
            title="雪質"
            options={SNOW_QUALITIES}
            selected={draft.snowQualities}
            onChange={snowQualities =>
              updateDraft({
                snowQualities: snowQualities as PostDraft["snowQualities"],
              })
            }
          />
          <ChoiceButtons
            title="コースの状態"
            options={COURSE_CONDITIONS}
            selected={draft.conditions}
            onChange={conditions =>
              updateDraft({ conditions: conditions as PostDraft["conditions"] })
            }
          />
          <label className="block text-sm">
            混雑{" "}
            <select
              className="h-9 rounded border px-2"
              value={draft.crowding ?? ""}
              onChange={event =>
                updateDraft({
                  crowding: (event.target.value ||
                    null) as PostDraft["crowding"],
                })
              }
            >
              <option value="">選択なし</option>
              <option>空いている</option>
              <option>普通</option>
              <option>混雑</option>
            </select>
          </label>
          <label className="block text-sm">
            評価{" "}
            <select
              className="h-9 rounded border px-2"
              value={draft.rating ?? ""}
              onChange={event =>
                updateDraft({
                  rating: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            >
              <option value="">評価なし</option>
              {[1, 2, 3, 4, 5].map(value => (
                <option key={value} value={value}>
                  {"★".repeat(value)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {post.kind === "MOGUL" && (
        <>
          <ChoiceButtons
            title="状態"
            options={["コブあり", "コブなし"]}
            selected={[draft.present ? "コブあり" : "コブなし"]}
            single
            onChange={value =>
              updateDraft({ present: value[0] === "コブあり" })
            }
          />
          <ChoiceButtons
            title="雪質"
            options={MOGUL_SNOW}
            selected={draft.snowQualities}
            onChange={snowQualities =>
              updateDraft({
                snowQualities: snowQualities as PostDraft["snowQualities"],
              })
            }
          />
        </>
      )}
      {post.kind === "ITEM" && (
        <>
          <ChoiceButtons
            title="状態"
            options={["設置中", "撤去済み"]}
            selected={[draft.present ? "設置中" : "撤去済み"]}
            single
            onChange={value => updateDraft({ present: value[0] === "設置中" })}
          />
          <label className="block text-sm">
            種類{" "}
            <select
              className="h-9 rounded border px-2"
              value={draft.itemType ?? ""}
              onChange={event =>
                updateDraft({
                  itemType: (event.target.value ||
                    null) as PostDraft["itemType"],
                })
              }
            >
              <option value="">選択してください</option>
              {ITEM_TYPES.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            サイズ{" "}
            <input
              className="h-9 rounded border px-2"
              value={draft.size ?? ""}
              onChange={event => updateDraft({ size: event.target.value })}
            />
          </label>
        </>
      )}
      <div className="space-y-1 text-xs">
        {post.photos.map(photo => (
          <label key={photo.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={removed.includes(photo.id)}
              onChange={event =>
                setRemoved(items =>
                  event.target.checked
                    ? [...items, photo.id]
                    : items.filter(id => id !== photo.id),
                )
              }
            />
            写真を削除
          </label>
        ))}
        <label className="block">
          写真を追加
          <input
            className="mt-1 block"
            type="file"
            accept="image/*"
            multiple
            onChange={event => {
              const selected = Array.from(event.target.files ?? []).slice(
                0,
                Math.max(0, 6 - post.photos.length + removed.length),
              );
              if (selected.some(file => file.size > 8 * 1024 * 1024)) {
                event.target.value = "";
                return;
              }
              setFiles(selected);
            }}
          />
        </label>
        <p className="text-gray-500">写真は合計6枚まで、1枚8MBまでです。</p>
      </div>
      <button
        type="button"
        disabled={busy}
        className="rounded bg-sky-700 px-3 py-1.5 text-white"
        onClick={() =>
          start(async () => {
            const result = await updatePost(
              post.id,
              post.version,
              draft,
              (() => {
                const data = new FormData();
                files.forEach(file => {
                  data.append("photo:0", file);
                });
                return data;
              })(),
              removed,
            );
            if (result.ok) onDone();
          })
        }
      >
        保存
      </button>
    </div>
  );
}

function ChoiceButtons({
  title,
  options,
  selected,
  onChange,
  single = false,
}: {
  title: string;
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
  single?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map(option => (
          <button
            type="button"
            key={option}
            aria-pressed={selected.includes(option)}
            className={`rounded-full border px-2 py-1 text-xs ${selected.includes(option) ? "border-sky-700 bg-sky-50" : ""}`}
            onClick={() =>
              onChange(
                single
                  ? [option]
                  : selected.includes(option)
                    ? selected.filter(value => value !== option)
                    : [...selected, option],
              )
            }
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
