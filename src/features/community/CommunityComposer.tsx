"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCommunityAccount,
  getCommunityCourses,
  getPostDetail,
  publishPosts,
  saveCommunityProfile,
  startCommunityLogin,
} from "@/features/community/actions";
import {
  type CommunityAccount,
  type CourseOption,
  ITEM_TYPES,
  MOGUL_SNOW,
  type PostDraft,
  SNOW_QUALITIES,
} from "@/features/community/contract";
import { CommunityPinMap } from "./CommunityPinMap";
import { parseExifGpsJpeg } from "./exifGps";
import { nearestCourseId } from "./location";

type Entry = { key: string; draft: PostDraft; files: File[] };
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
const blank = (kind: PostDraft["kind"]): Entry => ({
  key: crypto.randomUUID(),
  draft: {
    kind,
    courseId: null,
    observedOn: today(),
    body: "",
    snowQualities: [],
    conditions: [],
    crowding: null,
    rating: null,
    latitude: null,
    longitude: null,
    present: kind === "MOGUL" ? true : null,
    itemType: null,
    size: null,
    parentId: null,
  },
  files: [],
});

export function CommunityComposer({ resortId }: { resortId: string }) {
  const [account, setAccount] = useState<CommunityAccount | null>(null);
  const [courses, setCourses] = useState<
    Array<CourseOption & { lines?: number[][][] }>
  >([]);
  const [center, setCenter] = useState<[number, number]>([141.0, 43.0]);
  const [mode, setMode] = useState<"GOOGLE" | "NICKNAME" | "ANONYMOUS">(
    "ANONYMOUS",
  );
  const [nickname, setNickname] = useState("");
  const [step, setStep] = useState<
    "loading" | "profile" | "edit" | "review" | "done"
  >("loading");
  const [entries, setEntries] = useState<Entry[]>([blank("REPORT")]);
  const [index, setIndex] = useState(0);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const current = entries[index] ?? blank("REPORT");
  useEffect(() => {
    let active = true;
    void Promise.all([
      getCommunityAccount(),
      getCommunityCourses(resortId),
    ]).then(async ([a, c]) => {
      if (!active) return;
      if (a.ok && a.data) {
        setAccount(a.data);
        setMode(a.data.nameMode ?? "ANONYMOUS");
        setNickname(a.data.publicName ?? "");
        setStep(a.data.publicName ? "edit" : "profile");
      } else {
        void startCommunityLogin(
          `/rusutsu/community/${encodeURIComponent(resortId)}/new`,
        );
        return;
      }
      if (c.ok) {
        setCourses(c.data.courses);
        setCenter(c.data.center);
      }
      const parentId = new URLSearchParams(window.location.search).get(
        "parentId",
      );
      const initialCourseId = new URLSearchParams(window.location.search).get(
        "courseId",
      );
      if (
        !parentId &&
        initialCourseId &&
        c.ok &&
        c.data.courses.some(course => course.id === initialCourseId)
      ) {
        setEntries(all =>
          all.map((entry, entryIndex) =>
            entryIndex === 0
              ? {
                  ...entry,
                  draft: { ...entry.draft, courseId: initialCourseId },
                }
              : entry,
          ),
        );
      }
      if (parentId) {
        const parent = await getPostDetail(parentId);
        if (
          parent.ok &&
          parent.data.post.resortId === resortId &&
          parent.data.post.kind !== "REPORT"
        ) {
          const post = parent.data.post;
          const rootPost = parent.data.history.find(
            historyPost => !historyPost.parentId,
          );
          setEntries([
            {
              key: crypto.randomUUID(),
              draft: {
                ...blank(post.kind).draft,
                courseId: post.courseId,
                latitude: post.latitude,
                longitude: post.longitude,
                parentId: rootPost?.id ?? post.parentId ?? post.id,
                present: !post.present,
                itemType: post.itemType,
              },
              files: [],
            },
          ]);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [resortId]);
  const nearestCourse = (lng: number, lat: number) => {
    return nearestCourseId([lng, lat], courses);
  };
  const updateDraft = (patch: Partial<PostDraft>) =>
    setEntries(all =>
      all.map((entry, i) =>
        i === index ? { ...entry, draft: { ...entry.draft, ...patch } } : entry,
      ),
    );
  const addEntry = () => {
    setEntries(all => [...all, blank("REPORT")]);
    setIndex(entries.length);
    setStep("edit");
  };
  const addDetailEntry = (source: Entry, kind: "MOGUL" | "ITEM") => {
    const entry = blank(kind);
    entry.draft = {
      ...entry.draft,
      courseId: source.draft.courseId,
      observedOn: source.draft.observedOn,
      latitude: null,
      longitude: null,
      present: true,
      itemType: null,
    };
    entry.files = [...source.files];
    setEntries(all => [...all, entry]);
    setIndex(entries.length);
    setStep("edit");
  };
  const updateKind = (kind: PostDraft["kind"]) =>
    updateDraft({
      ...blank(kind).draft,
      courseId: current.draft.courseId,
      observedOn: current.draft.observedOn,
    });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, 6);
    const oversized = selected.find(file => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setError("写真は1枚8MB以下にしてください。");
      return;
    }
    const exif = await readExifGps(selected[0]).catch(() => null);
    setEntries(all =>
      all.map((entry, i) =>
        i === index
          ? {
              ...entry,
              files: [...entry.files, ...selected].slice(0, 6),
              draft:
                exif && !current.draft.parentId
                  ? {
                      ...entry.draft,
                      longitude: exif[0],
                      latitude: exif[1],
                      courseId: nearestCourse(exif[0], exif[1]),
                    }
                  : entry.draft,
            }
          : entry,
      ),
    );
    setError("");
  };
  const submit = () => {
    const form = new FormData();
    entries.forEach((entry, i) => {
      entry.files.forEach(file => {
        form.append(`photo:${i}`, file);
      });
    });
    startTransition(async () => {
      const result = await publishPosts(
        {
          resortId,
          entries: entries.map(entry => entry.draft),
          idempotencyKey: idempotencyKey.current,
        },
        form,
      );
      if (!result.ok) {
        setError(result.error);
        setStep("edit");
        return;
      }
      idempotencyKey.current = crypto.randomUUID();
      setStep("done");
    });
  };
  if (step === "loading")
    return <p className="p-4 text-sm text-gray-500">投稿の準備中…</p>;
  if (step === "profile")
    return (
      <main className="mx-auto max-w-lg space-y-4 p-4">
        <Link
          className="text-sm underline"
          href={`/community/${encodeURIComponent(resortId)}`}
        >
          ← 投稿一覧
        </Link>
        <h1 className="text-xl font-bold">公開名を設定</h1>
        <p className="text-sm text-gray-600">
          投稿に表示する名前を選んでください。Googleアカウントの名前は、選択した場合だけ公開されます。
        </p>
        {(
          [
            ["GOOGLE", "Googleアカウントと同じ名前"],
            ["NICKNAME", "ニックネーム"],
            ["ANONYMOUS", "匿名"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 rounded border p-3"
          >
            <input
              type="radio"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
        {mode === "NICKNAME" && (
          <input
            className="h-10 w-full rounded border px-3"
            maxLength={40}
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="ニックネーム"
          />
        )}
        <Button
          disabled={busy || (mode === "NICKNAME" && !nickname.trim())}
          onClick={() =>
            startTransition(async () => {
              const r = await saveCommunityProfile(mode, nickname);
              if (r.ok) {
                setAccount(r.data);
                setStep("edit");
              } else setError(r.error);
            })
          }
        >
          保存して投稿へ
        </Button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </main>
    );
  if (step === "done")
    return (
      <main className="mx-auto max-w-lg space-y-4 p-4">
        <h1 className="text-xl font-bold">投稿しました</h1>
        <p>投稿は公開されました。</p>
        <Link
          className="text-sky-800 underline"
          href={`/community/${encodeURIComponent(resortId)}`}
        >
          みんなの投稿へ
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-10">
      <div className="flex items-center justify-between">
        <Link
          className="text-sm underline"
          href={`/community/${encodeURIComponent(resortId)}`}
        >
          ← 投稿一覧
        </Link>
        <span className="text-xs text-gray-500">
          公開名: {account?.publicName}
        </span>
      </div>
      <h1 className="text-xl font-bold">滑走レポート・コブ・パークを投稿</h1>
      {step === "edit" && (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {entries.map((entry, i) => (
              <button
                type="button"
                key={entry.key}
                className={`rounded-full border px-3 py-1 text-sm whitespace-nowrap ${i === index ? "bg-sky-700 text-white" : ""}`}
                onClick={() => setIndex(i)}
              >
                {entry.draft.courseId
                  ? (courses.find(c => c.id === entry.draft.courseId)?.name ??
                    `投稿 ${i + 1}`)
                  : `投稿 ${i + 1}`}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border px-3 py-1 text-sm whitespace-nowrap"
              onClick={addEntry}
            >
              ＋別のコース
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                投稿の種類
                <Select
                  value={current.draft.kind}
                  items={[
                    { value: "REPORT", label: "滑走レポート" },
                    { value: "MOGUL", label: "コブ" },
                    { value: "ITEM", label: "パーク" },
                  ]}
                  disabled={Boolean(current.draft.parentId)}
                  onValueChange={value =>
                    updateKind(value as PostDraft["kind"])
                  }
                >
                  <SelectTrigger
                    aria-label="投稿の種類"
                    className="mt-1 h-10 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REPORT">滑走レポート</SelectItem>
                    <SelectItem value="MOGUL">コブ</SelectItem>
                    <SelectItem value="ITEM">パーク</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {current.draft.kind !== "REPORT" && (
                <>
                  <div className="h-56 overflow-hidden rounded-lg border">
                    <CommunityPinMap
                      center={center}
                      interactive={!current.draft.parentId}
                      coordinates={
                        current.draft.longitude != null &&
                        current.draft.latitude != null
                          ? [current.draft.longitude, current.draft.latitude]
                          : null
                      }
                      onChange={(lng, lat) =>
                        updateDraft({
                          longitude: lng,
                          latitude: lat,
                          courseId: nearestCourse(lng, lat),
                        })
                      }
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    地図をタップして場所を指定。写真のGPS位置を読み取れた場合はピンに反映します。
                  </p>
                </>
              )}
              <label className="block text-sm font-medium">
                対象コース
                <Select
                  value={current.draft.courseId ?? ""}
                  items={[
                    {
                      value: "",
                      label:
                        current.draft.kind === "REPORT"
                          ? "スキー場全体"
                          : "コース指定なし",
                    },
                    ...courses.map(course => ({
                      value: course.id,
                      label: course.name,
                    })),
                  ]}
                  disabled={Boolean(current.draft.parentId)}
                  onValueChange={value =>
                    updateDraft({ courseId: value || null })
                  }
                >
                  <SelectTrigger
                    aria-label="対象コース"
                    className="mt-1 h-10 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      {current.draft.kind === "REPORT"
                        ? "スキー場全体"
                        : "コース指定なし"}
                    </SelectItem>
                    {courses.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block text-sm font-medium">
                現地確認日
                <input
                  type="date"
                  max={today()}
                  className="mt-1 h-10 w-full rounded border px-2"
                  value={current.draft.observedOn}
                  onChange={e => updateDraft({ observedOn: e.target.value })}
                />
              </label>
              {current.draft.kind === "REPORT" ? (
                <>
                  <ChoiceGroup
                    title="雪質"
                    options={SNOW_QUALITIES}
                    selected={current.draft.snowQualities}
                    onChange={values =>
                      updateDraft({
                        snowQualities: values as PostDraft["snowQualities"],
                      })
                    }
                  />
                  <ChoiceGroup
                    title="コースの状態"
                    options={[
                      "荒れている",
                      "雪が薄い",
                      "コブあり",
                      "アイテムあり",
                    ]}
                    selected={current.draft.conditions}
                    onChange={values =>
                      updateDraft({
                        conditions: values as PostDraft["conditions"],
                      })
                    }
                  />
                  {current.draft.conditions.includes("コブあり") && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addDetailEntry(current, "MOGUL")}
                    >
                      コブの詳細投稿を追加
                    </Button>
                  )}
                  {current.draft.conditions.includes("アイテムあり") && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => addDetailEntry(current, "ITEM")}
                    >
                      アイテムの詳細投稿を追加
                    </Button>
                  )}
                  <label className="block text-sm">
                    混雑状況
                    <Select
                      value={current.draft.crowding ?? ""}
                      items={[
                        { value: "", label: "選択なし" },
                        { value: "空いている", label: "空いている" },
                        { value: "普通", label: "普通" },
                        { value: "混雑", label: "混雑" },
                      ]}
                      onValueChange={value =>
                        updateDraft({
                          crowding: (value || null) as PostDraft["crowding"],
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label="混雑状況"
                        className="mt-1 h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">選択なし</SelectItem>
                        <SelectItem value="空いている">空いている</SelectItem>
                        <SelectItem value="普通">普通</SelectItem>
                        <SelectItem value="混雑">混雑</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block text-sm">
                    評価
                    <Select
                      value={current.draft.rating?.toString() ?? ""}
                      items={[
                        { value: "", label: "評価なし" },
                        ...[1, 2, 3, 4, 5].map(n => ({
                          value: String(n),
                          label: "★".repeat(n),
                        })),
                      ]}
                      onValueChange={value =>
                        updateDraft({
                          rating: value ? Number(value) : null,
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label="評価"
                        className="mt-1 h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">評価なし</SelectItem>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>
                            {"★".repeat(n)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </>
              ) : (
                <>
                  <ChoiceGroup
                    title="状態"
                    options={
                      current.draft.kind === "MOGUL"
                        ? ["コブあり", "コブなし"]
                        : ["設置中", "撤去済み"]
                    }
                    selected={
                      current.draft.present
                        ? [
                            current.draft.kind === "MOGUL"
                              ? "コブあり"
                              : "設置中",
                          ]
                        : [
                            current.draft.kind === "MOGUL"
                              ? "コブなし"
                              : "撤去済み",
                          ]
                    }
                    onChange={v =>
                      updateDraft({
                        present:
                          v[0] ===
                          (current.draft.kind === "MOGUL"
                            ? "コブあり"
                            : "設置中"),
                      })
                    }
                    single
                  />
                  {current.draft.kind === "MOGUL" ? (
                    <ChoiceGroup
                      title="コブの雪質"
                      options={MOGUL_SNOW}
                      selected={current.draft.snowQualities}
                      onChange={v =>
                        updateDraft({
                          snowQualities: v as PostDraft["snowQualities"],
                        })
                      }
                    />
                  ) : (
                    <>
                      <label className="block text-sm">
                        種類
                        <Select
                          value={current.draft.itemType ?? ""}
                          items={[
                            { value: "", label: "種類を選択" },
                            ...ITEM_TYPES.map(itemType => ({
                              value: itemType,
                              label: itemType,
                            })),
                          ]}
                          disabled={Boolean(current.draft.parentId)}
                          onValueChange={value =>
                            updateDraft({
                              itemType: value as PostDraft["itemType"],
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label="アイテムの種類"
                            className="mt-1 h-10 w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">種類を選択</SelectItem>
                            {ITEM_TYPES.map(t => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="block text-sm">
                        サイズ（任意）
                        <input
                          className="mt-1 h-10 w-full rounded border px-2"
                          value={current.draft.size ?? ""}
                          onChange={e => updateDraft({ size: e.target.value })}
                          placeholder="例: 5mキッカー"
                        />
                      </label>
                    </>
                  )}
                </>
              )}
              <label className="block text-sm">
                コメント・感想
                <input
                  className="mt-1 h-10 w-full rounded border px-3"
                  value={current.draft.body}
                  onChange={e => updateDraft({ body: e.target.value })}
                  maxLength={4000}
                />
              </label>
              <label className="block text-sm">
                写真（最大6枚、各8MBまで）
                <input
                  className="mt-1 block w-full text-sm"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => void upload(e.target.files)}
                />
              </label>
              <p className="text-xs text-gray-500">
                投稿した写真はこのサイト内でのみ表示します。サイト外で二次利用しません。
              </p>
              {current.files.length > 0 && (
                <p className="text-xs text-gray-600">
                  選択中: {current.files.map(f => f.name).join("、")}
                </p>
              )}
            </div>
            <div className="space-y-3">
              <h2 className="font-semibold">確認</h2>
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                {current.draft.kind !== "REPORT" &&
                  current.draft.latitude != null && (
                    <p>
                      位置: {current.draft.latitude.toFixed(5)},{" "}
                      {current.draft.longitude?.toFixed(5)}
                    </p>
                  )}
                <p>
                  コース:{" "}
                  {courses.find(c => c.id === current.draft.courseId)?.name ??
                    "スキー場全体 / 指定なし"}
                </p>
                <p>確認日: {current.draft.observedOn}</p>
                <p>写真: {current.files.length}枚</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep("review")}>
              この投稿の入力を確定
            </Button>
            {entries.length > 1 && (
              <Button
                variant="outline"
                onClick={() => {
                  setEntries(all => all.filter((_, i) => i !== index));
                  if (index >= entries.length - 1)
                    setIndex(Math.max(0, index - 1));
                }}
              >
                この投稿を削除
              </Button>
            )}
          </div>
        </>
      )}
      {step === "review" && (
        <>
          <h2 className="font-semibold">送信内容を確認</h2>
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.key} className="rounded border p-3 text-sm">
                <b>
                  {e.draft.kind === "REPORT"
                    ? "滑走レポート"
                    : e.draft.kind === "MOGUL"
                      ? "コブ"
                      : "パーク"}{" "}
                  ·{" "}
                  {courses.find(c => c.id === e.draft.courseId)?.name ??
                    "スキー場全体 / コース指定なし"}
                </b>
                <p>
                  {e.draft.observedOn} · {e.draft.body}
                </p>
                <p>{e.files.length}枚の写真</p>
                {e.draft.kind === "REPORT" &&
                  e.draft.conditions.includes("コブあり") && (
                    <Button
                      className="mt-2"
                      type="button"
                      variant="outline"
                      onClick={() => addDetailEntry(e, "MOGUL")}
                    >
                      コブの詳細投稿を追加
                    </Button>
                  )}
                {e.draft.kind === "REPORT" &&
                  e.draft.conditions.includes("アイテムあり") && (
                    <Button
                      className="mt-2"
                      type="button"
                      variant="outline"
                      onClick={() => addDetailEntry(e, "ITEM")}
                    >
                      アイテムの詳細投稿を追加
                    </Button>
                  )}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={addEntry}>
            別のコースも投稿
          </Button>
          <p className="text-xs text-gray-600">
            投稿は公開後にAIの安全確認を行います。問題が見つかった投稿は一時非表示となり、管理者が確認します。投稿写真はサイト内で表示する目的だけに利用し、SNS転載・広告素材・外部提供は行いません。
          </p>
          <Button disabled={busy} onClick={submit}>
            {busy ? "送信中…" : "まとめて投稿"}
          </Button>
          <Button variant="outline" onClick={() => setStep("edit")}>
            戻って編集
          </Button>
        </>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </main>
  );
}

function ChoiceGroup({
  title,
  options,
  selected,
  onChange,
  single = false,
}: {
  title: string;
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => {
          const active = selected.includes(option);
          return (
            <button
              type="button"
              key={option}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-xs ${active ? "border-sky-700 bg-sky-50 text-sky-900" : ""}`}
              onClick={() =>
                onChange(
                  single
                    ? active
                      ? []
                      : [option]
                    : active
                      ? selected.filter(v => v !== option)
                      : [...selected, option],
                )
              }
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

async function readExifGps(file: File): Promise<[number, number] | null> {
  if (
    !file.type.toLowerCase().includes("jpeg") &&
    !file.name.toLowerCase().endsWith(".jpg") &&
    !file.name.toLowerCase().endsWith(".jpeg")
  )
    return null;
  return parseExifGpsJpeg(await file.arrayBuffer());
}
