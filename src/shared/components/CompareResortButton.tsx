"use client";

import { Check, Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Button>, "children"> & {
  isSelected: boolean;
  resortName: string;
};

export const CompareResortButton = ({
  isSelected,
  resortName,
  className,
  variant = isSelected ? "default" : "outline",
  ...props
}: Props) => (
  <Button
    {...props}
    type="button"
    variant={variant}
    className={cn("shrink-0 gap-1 whitespace-nowrap font-semibold", className)}
    aria-pressed={isSelected}
    aria-label={`${resortName}を${isSelected ? "比較から外す" : "比較に追加"}`}
  >
    {isSelected ? (
      <Check className="size-3.5" strokeWidth={2.5} />
    ) : (
      <Plus className="size-3.5" strokeWidth={2.5} />
    )}
    <span>{isSelected ? "比較中" : "比較"}</span>
  </Button>
);
