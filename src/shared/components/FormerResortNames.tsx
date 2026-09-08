import { Fragment } from "react";
import { RubyText } from "@/shared/components/RubyText";
import type { ResortFormerName } from "@/shared/types/resortReading";

export function FormerResortNames({ names }: { names: ResortFormerName[] }) {
  return names.map((name, index) => (
    <Fragment key={name.name}>
      {index > 0 && "、"}
      <RubyText
        segments={
          name.nameRuby ??
          (name.reading ? [{ text: name.name, ruby: name.reading }] : null)
        }
        fallback={name.name}
      />
    </Fragment>
  ));
}
