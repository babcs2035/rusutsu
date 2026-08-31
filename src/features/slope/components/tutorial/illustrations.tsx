"use client";

import type { ReactNode } from "react";

const COLOR = {
  active: "#E53E3E",
  inactive: "#3182CE",
  merge: "#0F9D58",
  split: "#805AD5",
  ghost: "#A0AEC0",
};

/** 図の枠。地図に見えるよう薄い格子を敷く */
function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 300 150"
      role="img"
      className="h-[150px] w-full rounded-md border bg-[#F7FAFC]"
    >
      <title>操作の図解</title>
      <defs>
        <pattern
          id="tutorial-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M20 0 L0 0 0 20"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="300" height="150" fill="url(#tutorial-grid)" />
      {children}
    </svg>
  );
}

/** 矢印つきのカーソル。位置を動かして操作を見せる */
function Cursor({
  values,
  keyTimes,
  dur = "4s",
}: {
  values: string;
  keyTimes?: string;
  dur?: string;
}) {
  return (
    <path
      d="M0 0 L0 13 L3.6 9.8 L6 15 L8.4 14 L6 9 L10.5 8.6 Z"
      fill="#1A202C"
      stroke="#FFFFFF"
      strokeWidth="1"
    >
      <animateTransform
        attributeName="transform"
        type="translate"
        values={values}
        keyTimes={keyTimes}
        dur={dur}
        repeatCount="indefinite"
      />
    </path>
  );
}

const Caption = ({ children }: { children: string }) => (
  <text x="150" y="142" fontSize="11" fill="#4A5568" textAnchor="middle">
    {children}
  </text>
);

const line = (points: string, color: string, width = 4) => (
  <polyline
    points={points}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const dot = (cx: number, cy: number, color: string, r = 5) => (
  <circle cx={cx} cy={cy} r={r} fill={color} stroke="#FFFFFF" strokeWidth="2" />
);

/** クリックしていって線を描く */
export function DrawIllustration() {
  const points = [
    [40, 118],
    [90, 92],
    [140, 72],
    [200, 48],
    [250, 32],
  ];
  return (
    <Frame>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={COLOR.active}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="260"
        strokeDashoffset="260"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="260;0;0"
          keyTimes="0;0.75;1"
          dur="4s"
          repeatCount="indefinite"
        />
      </polyline>
      {points.map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={index === points.length - 1 ? 6 : 5}
          fill={index === points.length - 1 ? "#DD6B20" : COLOR.active}
          stroke="#FFFFFF"
          strokeWidth="2"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            values="0;0;1;1"
            keyTimes={`0;${(index * 0.17).toFixed(2)};${(index * 0.17 + 0.02).toFixed(2)};1`}
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
      ))}
      <Cursor values="36,110; 86,84; 136,64; 196,40; 246,24; 246,24" />
      <Caption>
        始点から終点へ順にクリック。オレンジの終点をもう一度押すと終了
      </Caption>
    </Frame>
  );
}

/** 線の上をクリックして点を足す */
export function InsertPointIllustration() {
  return (
    <Frame>
      {line("40,110 120,80 200,60 260,40", COLOR.active)}
      {dot(40, 110, COLOR.active)}
      {dot(120, 80, COLOR.active)}
      {dot(200, 60, COLOR.active)}
      {dot(260, 40, COLOR.active)}
      <circle cx="160" cy="70" r="14" fill="none" stroke={COLOR.active}>
        <animate
          attributeName="r"
          values="6;20"
          dur="3.5s"
          begin="0.6s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.7;0"
          dur="3.5s"
          begin="0.6s"
          repeatCount="indefinite"
        />
      </circle>
      <circle
        cx="160"
        cy="70"
        r="5"
        fill={COLOR.active}
        fillOpacity="0.6"
        stroke="#FFFFFF"
        strokeWidth="2"
      >
        <animate
          attributeName="r"
          values="0;5;5;7;5"
          keyTimes="0;0.25;0.6;0.7;1"
          dur="3.5s"
          repeatCount="indefinite"
        />
      </circle>
      <Cursor
        values="110,66; 156,62; 156,62; 156,62"
        keyTimes="0;0.25;0.85;1"
        dur="3.5s"
      />
      <Caption>
        選んでいる赤い線の上をクリックすると、その場所に点が入ります
      </Caption>
    </Frame>
  );
}

/** 点をドラッグして動かす */
export function MovePointIllustration() {
  return (
    <Frame>
      {line("40,110 120,80 200,60 260,40", COLOR.ghost, 3)}
      <polyline
        fill="none"
        stroke={COLOR.active}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="40,110 120,80 200,60 260,40"
      >
        <animate
          attributeName="points"
          values="40,110 120,80 200,60 260,40; 40,110 120,40 200,60 260,40; 40,110 120,80 200,60 260,40"
          dur="3.5s"
          repeatCount="indefinite"
        />
      </polyline>
      {dot(40, 110, COLOR.active)}
      {dot(200, 60, COLOR.active)}
      {dot(260, 40, COLOR.active)}
      <circle
        cx="120"
        cy="80"
        r="6"
        fill={COLOR.active}
        stroke="#FFFFFF"
        strokeWidth="2"
      >
        <animate
          attributeName="cy"
          values="80;40;80"
          dur="3.5s"
          repeatCount="indefinite"
        />
      </circle>
      <Cursor values="116,76; 116,36; 116,76" dur="3.5s" />
      <Caption>
        赤い点はドラッグで移動。右クリックか Delete キーで削除できます
      </Caption>
    </Frame>
  );
}

/** 1 本を 2 本に分ける */
export function SplitIllustration() {
  return (
    <Frame>
      {line("40,110 100,90 150,75 210,55 265,40", COLOR.active)}
      <circle cx="150" cy="75" r="14" fill="none" stroke={COLOR.split}>
        <animate
          attributeName="r"
          values="8;22"
          dur="2.6s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.8;0"
          dur="2.6s"
          repeatCount="indefinite"
        />
      </circle>
      {dot(150, 75, COLOR.split, 7)}
      <text x="90" y="120" fontSize="11" fill={COLOR.split} textAnchor="middle">
        _#下部
      </text>
      <text x="225" y="34" fontSize="11" fill={COLOR.split} textAnchor="middle">
        _#上部
      </text>
      <Caption>紫の点をクリックすると、そこで 2 本に分かれます</Caption>
    </Frame>
  );
}

/** 2 本を 1 本につなぐ（途中どうしも可） */
export function MergeIllustration() {
  return (
    <Frame>
      <polyline
        points="150,60 210,45 265,35"
        fill="none"
        stroke={COLOR.ghost}
        strokeWidth="3"
        strokeDasharray="5 5"
      />
      <polyline
        points="150,105 100,120 45,128"
        fill="none"
        stroke={COLOR.ghost}
        strokeWidth="3"
        strokeDasharray="5 5"
      />
      {line("40,40 90,48 150,60", COLOR.inactive, 3)}
      {line("150,105 210,112 265,120", COLOR.inactive, 3)}
      <polyline
        points="40,40 90,48 150,60 150,105 210,112 265,120"
        fill="none"
        stroke={COLOR.merge}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="330"
        strokeDashoffset="330"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="330;0;0;330"
          keyTimes="0;0.5;0.85;1"
          dur="4.5s"
          repeatCount="indefinite"
        />
      </polyline>
      {dot(150, 60, COLOR.merge, 6)}
      {dot(150, 105, COLOR.merge, 6)}
      <text x="162" y="58" fontSize="12" fill={COLOR.merge}>
        1
      </text>
      <text x="162" y="110" fontSize="12" fill={COLOR.merge}>
        2
      </text>
      <Caption>
        つなぎたい位置を 2 本とも順にクリック。途中どうしでもつながります
      </Caption>
    </Frame>
  );
}

/** 一覧の並び替え */
export function ReorderIllustration() {
  return (
    <Frame>
      {[0, 1, 2, 3].map(index => (
        <g key={index}>
          <rect
            x="60"
            y={22 + index * 26}
            width="180"
            height="20"
            rx="4"
            fill="#FFFFFF"
            stroke="#CBD5E0"
          />
          <rect
            x="66"
            y={28 + index * 26}
            width="8"
            height="8"
            rx="1"
            fill="#A0AEC0"
          />
          <rect
            x="82"
            y={29 + index * 26}
            width={70 + index * 12}
            height="6"
            rx="3"
            fill="#E2E8F0"
          />
        </g>
      ))}
      <rect
        x="60"
        y="48"
        width="180"
        height="20"
        rx="4"
        fill="#EBF8FF"
        stroke="#3182CE"
        strokeWidth="2"
      >
        <animate
          attributeName="y"
          values="48;100;48"
          keyTimes="0;0.5;1"
          dur="3.6s"
          repeatCount="indefinite"
        />
      </rect>
      <rect x="66" y="54" width="8" height="8" rx="1" fill="#3182CE">
        <animate
          attributeName="y"
          values="54;106;54"
          keyTimes="0;0.5;1"
          dur="3.6s"
          repeatCount="indefinite"
        />
      </rect>
      <Caption>
        左端の記号をつまんで上下へ。端まで運ぶと自動でスクロールします
      </Caption>
    </Frame>
  );
}

/** クロール結果との突き合わせ */
export function MappingIllustration() {
  const pairs = [
    { label: "第1ゲレンデ", target: "メロディ", matched: true },
    { label: "第2ゲレンデ", target: "ジジ", matched: true },
    { label: "パノラマ", target: "未対応", matched: false },
  ];
  return (
    <Frame>
      <text x="70" y="20" fontSize="10" fill="#718096" textAnchor="middle">
        クロール結果
      </text>
      <text x="230" y="20" fontSize="10" fill="#718096" textAnchor="middle">
        コース線
      </text>
      {pairs.map((pair, index) => {
        const y = 32 + index * 30;
        return (
          <g key={pair.label}>
            <rect
              x="18"
              y={y}
              width="104"
              height="22"
              rx="4"
              fill="#FFFFFF"
              stroke={pair.matched ? "#9AE6B4" : "#FBD38D"}
            />
            <text
              x="70"
              y={y + 15}
              fontSize="10"
              fill="#2D3748"
              textAnchor="middle"
            >
              {pair.label}
            </text>
            <path
              d={`M126 ${y + 11} L174 ${y + 11}`}
              stroke={pair.matched ? "#38A169" : "#DD6B20"}
              strokeWidth="2"
              strokeDasharray={pair.matched ? undefined : "4 4"}
            />
            <rect
              x="178"
              y={y}
              width="104"
              height="22"
              rx="4"
              fill={pair.matched ? "#FFFFFF" : "none"}
              stroke={pair.matched ? "#9AE6B4" : "#FBD38D"}
              strokeDasharray={pair.matched ? undefined : "4 4"}
            />
            <text
              x="230"
              y={y + 15}
              fontSize="10"
              fill={pair.matched ? "#2D3748" : "#DD6B20"}
              textAnchor="middle"
            >
              {pair.target}
            </text>
          </g>
        );
      })}
      <Caption>公式サイトの名前と、描いたコース線を同じ行にそろえます</Caption>
    </Frame>
  );
}

/** 中間駅の置き方（リフト用） */
export function MidstationIllustration() {
  return (
    <Frame>
      {line("45,120 150,80 260,42", COLOR.active)}
      {dot(45, 120, COLOR.active)}
      {dot(260, 42, COLOR.active)}
      <circle cx="150" cy="80" r="14" fill="none" stroke="#2F855A">
        <animate
          attributeName="r"
          values="9;22"
          dur="2.8s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.8;0"
          dur="2.8s"
          repeatCount="indefinite"
        />
      </circle>
      {dot(150, 80, "#2F855A", 8)}
      <text x="150" y="62" fontSize="11" fill="#2F855A" textAnchor="middle">
        中間駅
      </text>
      <Caption>
        「中間駅を追加」を押してから、線の途中をクリックして置きます
      </Caption>
    </Frame>
  );
}
