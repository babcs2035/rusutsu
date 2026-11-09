"use client";

import { ArrowLeft, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import type { SavedSkiTrack, TrackCourse } from "./contract";

const endpoint = "/rusutsu/api/ski-tracks";
const km = (meters: number) => `${(meters / 1000).toFixed(1)} km`;
const duration = (seconds: number) => `${Math.round(seconds / 60)} 分`;
const date = (value: string | number, timeOnly = false) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    ...(timeOnly
      ? { hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "numeric", day: "numeric" }),
  }).format(new Date(value));

async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "履歴を読み込めませんでした。");
  return result as T;
}

function CourseRanking({ courses }: { courses: TrackCourse[] }) {
  const sorted = [...courses].sort(
    (a, b) => b.passes - a.passes || b.distance - a.distance,
  );
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">よく滑るコース（推定）</h3>
      {sorted.length ? (
        <ol className="divide-y rounded-lg border px-3">
          {sorted.map((course, index) => (
            <li key={course.id} className="flex items-center gap-2 py-2">
              <span className="w-4 shrink-0 text-xs text-gray-500">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">{course.name}</p>
                <p className="break-words text-xs text-gray-500">
                  {course.resortName}
                </p>
                <div
                  className="mt-1 h-1 rounded bg-gray-100"
                  aria-hidden="true"
                >
                  <div
                    className="h-1 rounded bg-sky-600"
                    style={{
                      width: `${(course.passes / sorted[0].passes) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <p className="font-semibold">{course.passes} 回</p>
                <p className="text-xs text-gray-500">{km(course.distance)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-600">
          コースを特定できる区間がありません。地図未整備・GPSの誤差・隣接コースなどが考えられます。
        </p>
      )}
      <p className="text-xs leading-relaxed text-gray-500">
        回数は1本の滑走中に同じコースを100m以上通った回数です。全コースの完走本数ではありません。隣接する線を区別できない区間は集計しません。
      </p>
    </section>
  );
}

export function SkiTracksHistory() {
  const [tracks, setTracks] = useState<SavedSkiTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadFailed(false);
    setError("");
    try {
      const result = await callApi<{ tracks: SavedSkiTrack[] }>(endpoint);
      if (mounted.current && id === requestId.current) setTracks(result.tracks);
    } catch (error) {
      if (mounted.current && id === requestId.current) {
        setLoadFailed(true);
        setError(
          error instanceof Error
            ? error.message
            : "履歴を読み込めませんでした。",
        );
      }
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestId.current++;
    };
  }, [load]);

  async function upload(file: File) {
    setError("");
    setNotice("");
    if (
      !file.name.toLowerCase().endsWith(".skiz") ||
      !file.size ||
      file.size > 20 * 1024 * 1024
    ) {
      setError("20MB以下のSkiTracksの.skizファイルを選んでください。");
      return;
    }
    setBusy(true);
    try {
      const result = await callApi<{
        track: SavedSkiTrack;
        duplicate: boolean;
      }>(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Ski-Tracks-Request": "1",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!mounted.current) return;
      setTracks(previous =>
        [
          result.track,
          ...previous.filter(track => track.id !== result.track.id),
        ].sort(
          (a, b) => Date.parse(b.analysis.start) - Date.parse(a.analysis.start),
        ),
      );
      setSelectedId(result.track.id);
      setNotice(
        result.duplicate
          ? "このファイルはすでに取り込まれています。"
          : "滑走履歴を保存しました。",
      );
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "アップロードできませんでした。",
        );
    } finally {
      if (mounted.current) setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(`${endpoint}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "X-Ski-Tracks-Request": "1" },
      });
      if (!mounted.current) return;
      setTracks(previous => previous.filter(track => track.id !== id));
      setSelectedId(null);
      setDeleting(null);
      setNotice("履歴を削除しました。");
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error ? error.message : "削除できませんでした。",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const selected = tracks.find(track => track.id === selectedId);
  const courseTotals = new Map<string, TrackCourse>();
  for (const track of tracks) {
    for (const course of track.analysis.courses) {
      const previous = courseTotals.get(course.id);
      courseTotals.set(course.id, {
        ...course,
        passes: course.passes + (previous?.passes ?? 0),
        distance: course.distance + (previous?.distance ?? 0),
      });
    }
  }
  return (
    <div className="space-y-4 text-sm">
      <section className="space-y-2">
        <p className="text-sm leading-relaxed text-gray-600">
          SkiTracksから共有・書き出した.skizファイルで、滑走記録とコースの利用傾向を確認できます。
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">
            .skiz・1ファイル20MBまで
          </span>
          <Button
            variant="outline"
            disabled={loading || busy || loadFailed}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" />
            {busy ? "処理中…" : "ファイルを選択"}
          </Button>
          <Input
            ref={fileInput}
            type="file"
            accept=".skiz"
            className="hidden"
            aria-label="SkiTracksファイル"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </div>
        <p className="text-xs leading-relaxed text-gray-500">
          履歴は自分だけに表示されます。集計結果をアカウントに保存し、元ファイルと生のGPS座標は保存しません。日時は日本時間です。
        </p>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-sky-800">
          {notice}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs text-gray-600">
          処理が終わるまでお待ちください。
        </p>
      )}
      {loading ? (
        <LoadingSpinner
          className="h-40 rounded-lg [&_svg]:size-6 [&_p]:text-sm"
          text="滑走履歴を読み込み中…"
        />
      ) : loadFailed ? (
        <Button variant="outline" onClick={() => void load()}>
          再読み込み
        </Button>
      ) : selected ? (
        <>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedId(null);
                setDeleting(null);
                setNotice("");
              }}
            >
              <ArrowLeft />
              履歴一覧
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label="この履歴を削除"
              onClick={() => setDeleting(selected.id)}
            >
              <Trash2 />
              削除
            </Button>
          </div>
          <section className="space-y-2">
            <div>
              <h3 className="text-base font-semibold">
                {date(selected.analysis.start)}
              </h3>
              <p className="break-words text-sm">
                {selected.analysis.declaredResort ?? selected.analysis.name}
              </p>
              <p className="text-xs text-gray-500">
                {date(selected.analysis.start, true)}〜
                {date(selected.analysis.finish, true)}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-x-2 gap-y-3 rounded-lg bg-gray-50 p-3">
              {[
                ["滑走本数", `${selected.analysis.runs} 本`],
                ["滑走距離", km(selected.analysis.distance)],
                [
                  "累積標高差",
                  `${Math.round(selected.analysis.vertical).toLocaleString()} m`,
                ],
                ["滑走時間", duration(selected.analysis.skiSeconds)],
                ["リフト", `${selected.analysis.lifts} 回`],
                ["最高速度", `${selected.analysis.maxSpeed.toFixed(1)} km/h`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-gray-500">
              距離・標高差は滑走区間のみ。最高速度はGPS計測値です。
            </p>
          </section>
          {deleting === selected.id && (
            <div className="space-y-2 rounded-lg border border-red-200 p-3">
              <p>この滑走履歴を削除しますか？</p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDeleting(null)}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove(selected.id)}
                >
                  削除する
                </Button>
              </div>
            </div>
          )}
          <CourseRanking courses={selected.analysis.courses} />
          <p className="text-xs leading-relaxed text-gray-500">
            GPS区間の照合率{" "}
            {selected.analysis.gpsDistance
              ? Math.round(
                  (selected.analysis.matchedDistance /
                    selected.analysis.gpsDistance) *
                    100,
                )
              : 0}
            %（照合距離 {km(selected.analysis.matchedDistance)} /
            有効なGPS滑走距離 {km(selected.analysis.gpsDistance)}
            ）。地図の中心線とGPSの位置からの推定です。
          </p>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">滑走ごとの記録</h3>
            <ol className="divide-y">
              {selected.analysis.segments.map((segment, index) => (
                <li
                  key={`${segment.start}-${segment.sequence}`}
                  className="py-2"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {index + 1}本目{" "}
                      <span className="text-xs font-normal text-gray-500">
                        {date(segment.start, true)}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums">
                      {km(segment.distance)} · {Math.round(segment.vertical)} m↓
                    </span>
                  </div>
                  <p className="break-words text-xs text-gray-600">
                    {segment.courses.length
                      ? segment.courses.join(" → ")
                      : "コース未特定"}
                  </p>
                </li>
              ))}
            </ol>
          </section>
          <p className="break-all text-xs text-gray-400">{selected.fileName}</p>
        </>
      ) : tracks.length ? (
        <>
          <div className="flex items-baseline justify-between border-t pt-3">
            <h3 className="text-sm font-semibold">滑走履歴</h3>
            <span className="text-xs text-gray-500">
              {tracks.length}件 ·{" "}
              {tracks.reduce((sum, track) => sum + track.analysis.runs, 0)}本 ·{" "}
              {km(
                tracks.reduce((sum, track) => sum + track.analysis.distance, 0),
              )}
            </span>
          </div>
          <div className="space-y-2">
            {tracks.map(track => (
              <Button
                key={track.id}
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal py-2 text-left"
                onClick={() => {
                  setSelectedId(track.id);
                  setNotice("");
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {date(track.analysis.start)}
                  </p>
                  <p className="break-words text-xs font-normal text-gray-600">
                    {track.analysis.declaredResort ?? track.analysis.name}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs tabular-nums">
                  {track.analysis.runs}本<br />
                  {km(track.analysis.distance)}
                </span>
              </Button>
            ))}
          </div>
          <CourseRanking courses={[...courseTotals.values()]} />
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-gray-600">
          まだ滑走履歴がありません。最初の.skizファイルを選択してください。
        </div>
      )}
    </div>
  );
}
