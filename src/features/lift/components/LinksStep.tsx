"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditorStepContent } from "@/shared/components/resort-editor/EditorStepContent";
import { SortableLinkList } from "@/shared/components/resort-editor/SortableLinkList";
import { RESORT_LINK_KEYS, RESORT_LINK_LABELS } from "../constants";
import type { ResortLink, ResortLinks, ResortOption } from "../types";

type LinksStepProps = {
  resort: ResortOption;
  links: ResortLinks;
  setLinks: (links: ResortLinks) => void;
  onProceed: () => void;
  onBack: () => void;
};

type LinkListFieldProps = {
  label: string;
  values: ResortLink[];
  onChange: (values: ResortLink[]) => void;
};

export const LinkListField = ({
  label,
  values = [],
  onChange,
}: LinkListFieldProps) => {
  const handleChangeAt = (index: number, value: Partial<ResortLink>) => {
    onChange(
      values.map((current, i) =>
        i === index ? { ...current, ...value } : current,
      ),
    );
  };
  const handleRemoveAt = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };
  const handleAdd = () => onChange([...values, { url: "" }]);

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        <SortableLinkList label={label} values={values} onChange={onChange}>
          {(value, index, handle) => (
            <div className="flex min-w-0 flex-wrap gap-2 items-start">
              <div className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-2 md:basis-0">
                <Input
                  className="h-11 sm:h-9 min-w-0 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label={`${label} URL ${index + 1}`}
                  placeholder="https://..."
                  value={value.url}
                  onChange={event =>
                    handleChangeAt(index, { url: event.target.value })
                  }
                />
                <Input
                  className="h-11 sm:h-9 min-w-0 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                  aria-label={`${label} 補足 ${index + 1}`}
                  placeholder="補足"
                  value={value.description ?? ""}
                  onChange={event =>
                    handleChangeAt(index, {
                      description: event.target.value || undefined,
                    })
                  }
                />
              </div>
              {handle}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-9 flex-shrink-0"
                onClick={() => handleRemoveAt(index)}
              >
                削除
              </Button>
            </div>
          )}
        </SortableLinkList>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="self-start"
          onClick={handleAdd}
        >
          + {label}を追加
        </Button>
      </div>
    </div>
  );
};

export function LinksStep({
  resort,
  links,
  setLinks,
  onProceed,
  onBack,
}: LinksStepProps) {
  return (
    <EditorStepContent>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h2 className="text-lg font-bold font-[var(--font-heading)]">
            スキー場全体のリンク
          </h2>
          <p className="break-words text-sm text-gray-600">
            {resort.nameJa ? `${resort.nameJa}（${resort.id}）` : resort.id}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onBack}>
          詳細情報へ戻る
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {RESORT_LINK_KEYS.map(key => (
              <LinkListField
                key={key}
                label={RESORT_LINK_LABELS[key]}
                values={links[key] ?? []}
                onChange={values => setLinks({ ...links, [key]: values })}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 pb-6">
        <Button variant="default" onClick={onProceed}>
          次へ（確認・保存）
        </Button>
        <Button variant="outline" onClick={onBack}>
          戻る
        </Button>
      </div>
    </EditorStepContent>
  );
}
