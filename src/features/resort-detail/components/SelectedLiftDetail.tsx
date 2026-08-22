"use client";

import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
import {
  createElevationProfile,
  formatMeters,
  getLiftElevationDiff,
  normalizeIconSymbol,
} from "../utils/detailMetrics";
import { ElevationProfile } from "./ElevationProfile";
import { StatCard } from "./StatCard";
import { StatusSummary } from "./StatusRow";

export const SelectedLiftDetail = ({
  lift,
}: {
  lift: FinalizedLiftFeature;
}) => {
  const profilePoints = createElevationProfile(lift.coordinates);
  const statusSymbol = normalizeIconSymbol(lift.properties.status);
  const comments = [
    ...new Set(
      [lift.properties.latestNote, lift.properties.note]
        .filter((value): value is string => Boolean(value?.trim()))
        .map(value => value.trim()),
    ),
  ];

  return (
    <div className="flex flex-col gap-5">
      <StatusSummary
        statusKind="lift"
        statusSymbol={statusSymbol}
        extras={[
          { label: "種別", text: lift.properties.type ?? "リフト" },
          ...(lift.properties.speed
            ? [{ label: "速度", text: lift.properties.speed }]
            : []),
        ]}
      />

      {comments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500">コメント</p>
          <ul className="mt-1 flex flex-col gap-1">
            {comments.map(comment => (
              <li
                key={comment}
                className="text-sm leading-relaxed text-gray-800"
              >
                {comment}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ElevationProfile points={profilePoints} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {/* 距離は地図から算出した値ではなく、公表されている distance を使う */}
        <StatCard title="距離" value={formatMeters(lift.properties.distance)} />
        <StatCard
          title="標高差"
          value={formatMeters(getLiftElevationDiff(lift))}
        />
        <StatCard
          title="定員"
          value={
            lift.properties.capacity == null
              ? "--"
              : `${lift.properties.capacity}名`
          }
        />
        <StatCard title="フード" value={lift.properties.hood ?? "--"} />
        <StatCard title="山頂標高" value={formatMeters(lift.properties.top)} />
        <StatCard
          title="山麓標高"
          value={formatMeters(lift.properties.bottom)}
        />
      </div>
    </div>
  );
};
