"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
        {values.map((value, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 並び替えがなく末尾追加・任意削除のみのため
          <div key={index} className="flex gap-2 items-start">
            <div
              className={cn(
                "flex flex-col gap-2 flex-1",
                index > 0 && "md:flex-row",
              )}
            >
              <Input
                className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                placeholder="https://..."
                value={value.url}
                onChange={event =>
                  handleChangeAt(index, { url: event.target.value })
                }
              />
              <Input
                className="h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                placeholder="補足"
                value={value.description ?? ""}
                onChange={event =>
                  handleChangeAt(index, {
                    description: event.target.value || undefined,
                  })
                }
              />
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="flex-shrink-0 mt-2 md:mt-0"
              onClick={() => handleRemoveAt(index)}
            >
              削除
            </Button>
          </div>
        ))}
        <Button
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
    <div className="h-full min-h-0 flex justify-center overflow-y-auto bg-gray-50">
      <div className="flex flex-col w-[820px] max-w-full p-6 gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold font-[var(--font-heading)]">
              スキー場全体のリンク
            </h2>
            <p className="text-sm text-gray-600">
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
      </div>
    </div>
  );
}
