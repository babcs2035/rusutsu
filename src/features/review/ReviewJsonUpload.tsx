"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { previewReviewUpload, publishReviewUpload } from "./publicationActions";

type Preview = Extract<
  Awaited<ReturnType<typeof previewReviewUpload>>,
  { ok: true }
>["preview"];
export function ReviewJsonUpload({
  currentFiles = [],
}: {
  currentFiles?: Array<{ key: string; content: string }>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function readFiles(files: FileList | null) {
    setPreview(null);
    setMessage("");
    if (!files) return;
    const selected = [...files];
    const detailFile = selected.find(file => file.name === "detail.json");
    const articleFile = selected.find(file => file.name === "article.json");
    if (selected.length !== 2 || !detailFile || !articleFile) {
      setMessage(
        "同じスキー場のdetail.jsonとarticle.jsonを2つまとめて選択してください。",
      );
      return;
    }
    if (selected.some(file => file.size > 2 * 1024 * 1024)) {
      setMessage("各ファイルは2 MiB以内にしてください。");
      return;
    }
    setBusy(true);
    try {
      const detail = JSON.parse(await detailFile.text());
      const article = JSON.parse(await articleFile.text());
      const result = await previewReviewUpload({
        resortId: detail?.resortId,
        detail,
        article,
      });
      if (result.ok) setPreview(result.preview);
      else setMessage(result.error);
    } catch {
      setMessage("読み込めませんでした。JSONの形式と接続を確認してください。");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await publishReviewUpload(preview.publication);
      if (result.ok) {
        setMessage("2つのJSONを保存しました。レビュー編集画面で確認できます。");
        setPreview(null);
      } else setMessage(result.error);
    } catch {
      setMessage(
        "保存結果を確認できませんでした。管理画面で内容を確認してからやり直してください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {currentFiles.map(file => (
        <details key={file.key} className="rounded border p-3">
          <summary>現在の内容: {file.key}</summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
            {file.content}
          </pre>
        </details>
      ))}
      <p>
        detail.jsonとarticle.jsonをまとめて選択します。選んだだけでは保存されません。保存先は、この管理画面の接続先です。本番APIに接続したローカル画面からも本番へ反映されます。
      </p>
      <label className="block space-y-2">
        <span className="font-semibold">レビューJSON（2ファイル）</span>
        <input
          type="file"
          multiple
          accept=".json,application/json"
          disabled={busy}
          onChange={event => {
            void readFiles(event.target.files);
            event.target.value = "";
          }}
          className="block"
        />
      </label>
      {busy && <p role="status">処理中…</p>}
      {message && (
        <p role="status" className="whitespace-pre-wrap">
          {message}
        </p>
      )}
      {preview && (
        <>
          <h2 className="font-bold">
            対象: {preview.publication.content.resortId}
          </h2>
          {preview.files.map(file => (
            <details key={file.key} className="rounded border p-3">
              <summary>
                {file.kind}.json — {file.status}（クリックで保存前後を確認）
              </summary>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3>現在の内容</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                    {file.previousContent ?? "未登録"}
                  </pre>
                </div>
                <div>
                  <h3>保存する内容</h3>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                    {file.content}
                  </pre>
                </div>
              </div>
            </details>
          ))}
          <Button
            onClick={() => void save()}
            disabled={
              busy || preview.files.every(file => file.status === "変更なし")
            }
          >
            確認した2ファイルを保存する
          </Button>
        </>
      )}
    </div>
  );
}
