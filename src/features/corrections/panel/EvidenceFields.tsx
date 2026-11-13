"use client";

import { Images, X } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/shared/components/FormParts";

export const MAX_EVIDENCE_PHOTOS = 3;
export const MAX_EVIDENCE_URLS = 3;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export type EvidencePhoto = { file: File; url: string };
export type Evidence = {
  photos: EvidencePhoto[];
  urls: string[];
  comment: string;
};
export const emptyEvidence = (): Evidence => ({
  photos: [],
  urls: [""],
  comment: "",
});
export const releaseEvidence = (evidence: Evidence) => {
  for (const photo of evidence.photos) URL.revokeObjectURL(photo.url);
};
/** 入力されたURLだけを取り出す。http(s) で始まらないものがあれば error に入れる */
export const evidenceUrls = (evidence: Evidence) => {
  const urls = evidence.urls.map(url => url.trim()).filter(Boolean);
  return {
    urls,
    error: urls.some(url => !/^https?:\/\/\S+$/.test(url))
      ? "参考URLは http:// か https:// から始めてください。"
      : null,
  };
};

/**
 * 修正の根拠（写真・参考URL・補足）。どれも任意で、送信の直前に入力する。
 * 写真は管理者だけが見る。
 */
export function EvidenceFields({
  value,
  onChange,
  onError,
  showComment = true,
}: {
  value: Evidence;
  onChange: (value: Evidence) => void;
  onError: (message: string) => void;
  /** 自由記述の画面では本文が補足を兼ねるので出さない */
  showComment?: boolean;
}) {
  const inputId = useId();
  const addPhotos = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    if (picked.some(file => file.size > MAX_PHOTO_BYTES)) {
      onError("写真は1枚8MB以下にしてください。");
      return;
    }
    if (value.photos.length + picked.length > MAX_EVIDENCE_PHOTOS) {
      onError(`写真は${MAX_EVIDENCE_PHOTOS}枚までです。`);
      return;
    }
    onError("");
    onChange({
      ...value,
      photos: [
        ...value.photos,
        ...picked.map(file => ({ file, url: URL.createObjectURL(file) })),
      ],
    });
  };
  // 入力済みの欄の下に、空の欄を1つだけ足す
  const urls =
    value.urls.every(url => url.trim()) && value.urls.length < MAX_EVIDENCE_URLS
      ? [...value.urls, ""]
      : value.urls;

  return (
    <div className="space-y-3">
      <Field label="写真">
        <div className="flex flex-wrap items-center gap-2">
          {value.photos.length < MAX_EVIDENCE_PHOTOS && (
            <Button
              type="button"
              variant="outline"
              className="h-16 w-16 flex-col gap-0 px-0 text-[11px] text-gray-600"
              onClick={() => document.getElementById(inputId)?.click()}
            >
              <Images className="size-5" />
              写真を選択
              <span className="text-[10px] leading-3 text-gray-400">
                {MAX_EVIDENCE_PHOTOS}枚まで
              </span>
            </Button>
          )}
          <input
            id={inputId}
            type="file"
            accept="image/*,image/heic,image/heif,.heic,.heif"
            multiple
            className="hidden"
            onChange={event => {
              addPhotos(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          {value.photos.map(photo => (
            <div key={photo.url} className="relative">
              {/* biome-ignore lint/performance/noImgElement: 端末内の写真のプレビューなので最適化を通さない */}
              <img
                src={photo.url}
                alt={photo.file.name}
                className="size-16 rounded-lg border border-gray-200 bg-gray-100 object-cover text-[10px] break-all text-gray-500"
              />
              <Button
                type="button"
                variant="ghost"
                aria-label="写真を削除"
                className="absolute -top-1.5 -right-1.5 size-5 min-w-5 rounded-full border border-gray-200 bg-white p-0 text-gray-600 shadow-sm hover:bg-gray-50"
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  onChange({
                    ...value,
                    photos: value.photos.filter(item => item !== photo),
                  });
                }}
              >
                <X size={12} strokeWidth={2.5} />
              </Button>
            </div>
          ))}
        </div>
      </Field>
      <Field label="参考URL">
        <div className="space-y-1.5">
          {urls.map((url, index) => (
            <Input
              // biome-ignore lint/suspicious/noArrayIndexKey: 並びが変わらない入力欄
              key={index}
              type="url"
              inputMode="url"
              aria-label={`参考URL ${index + 1}`}
              placeholder="https://"
              maxLength={2000}
              value={url}
              onChange={event =>
                onChange({
                  ...value,
                  urls: urls.map((item, position) =>
                    position === index ? event.target.value : item,
                  ),
                })
              }
            />
          ))}
        </div>
      </Field>
      {showComment && (
        <Field label="補足">
          <Textarea
            aria-label="補足"
            className="min-h-16 text-sm md:text-base"
            maxLength={5000}
            value={value.comment}
            onChange={event =>
              onChange({ ...value, comment: event.target.value })
            }
          />
        </Field>
      )}
    </div>
  );
}
