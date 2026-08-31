"use client";

import {
  GuideDialog,
  type GuidePage,
  type GuideShortcut,
} from "@/features/slope/components/tutorial/GuideDialog";
import {
  DrawIllustration,
  InsertPointIllustration,
  MappingIllustration,
  MidstationIllustration,
  MovePointIllustration,
  ReorderIllustration,
} from "@/features/slope/components/tutorial/illustrations";

const PAGES: GuidePage[] = [
  {
    id: "overview",
    title: "この画面ですること",
    lead: "スキー場のリフトを地図の上で正しい位置にそろえ、種類や輸送能力などの詳細を付けて保存します。上の帯にある 7 つの工程を、左から順に進めます。",
    points: [
      {
        label: "1. スキー場選択",
        text: "編集するスキー場を選びます。バッジで、リフトデータやクローラーの有無が分かります。",
      },
      {
        label: "2. 所属確認・変更",
        text: "隣接するスキー場のリフトが混ざっていないかを確かめます。",
      },
      {
        label: "3. 位置補正",
        text: "地図でリフトの線を直します。中間駅の配置と、クロール結果との対応付けもここで行います。",
      },
      {
        label: "4. 詳細情報",
        text: "リフト名・種類・速度・輸送能力などを入れます。",
      },
      {
        label: "5. 営業情報対応",
        text: "公式サイトから取ってきた名前と、リフトの線を対応付けます。",
      },
      {
        label: "6. 全体情報リンク",
        text: "公式サイトなどのリンクを整えます。",
      },
      { label: "7. 確認・保存", text: "内容を確かめてファイルへ保存します。" },
    ],
    note: "編集中の内容はこのブラウザに自動で下書き保存されます。途中で閉じても、同じスキー場を選び直せば続きから再開できます。",
  },
  {
    id: "layout",
    title: "画面の広さは自分で決められます",
    lead: "左が作業パネル、右が地図です。作業に合わせて、パネルの幅も中身の量も変えられます。",
    points: [
      {
        label: "幅を変える",
        text: "パネルと地図の境目をドラッグすると幅が変わります。ダブルクリックで元の幅へ戻ります。選んだ幅は次に開いたときも使われます。",
      },
      {
        label: "説明を畳む",
        text: "「地図の操作を見る」は見出しをクリックすると開閉します。閉じておくとリフト一覧が広く使えます。",
      },
      {
        label: "名前を地図に出す",
        text: "「名前を地図に表示」を押すと、線の上にリフト名が出ます。",
      },
    ],
  },
  {
    id: "select",
    title: "リフトを選んで直す",
    lead: "地図の線をクリックするとそのリフトを選べます。少し離れたところを押しても、いちばん近い線が選ばれます。",
    illustration: <InsertPointIllustration />,
    points: [
      {
        label: "点を足す",
        text: "選んでいる赤い線の上をクリックすると、その位置に点が入ります。ダブルクリックは要りません。",
      },
      {
        label: "点を動かす",
        text: "赤い点をドラッグします。動かす前の位置は破線で残ります。",
      },
      {
        label: "点を消す",
        text: "赤い点を右クリック、または点に重ねて Backspace / Delete。既存リフトは 2 点より少なくはできません。",
      },
      {
        label: "やり直す",
        text: "「位置変更を取り消す」で、読み込んだときの位置へ戻せます。",
      },
    ],
  },
  {
    id: "move",
    title: "位置合わせのコツ",
    lead: "航空写真に切り替えると、支柱の影や索道の筋が見えて位置を合わせやすくなります。",
    illustration: <MovePointIllustration />,
    points: [
      {
        label: "地図を切り替える",
        text: "右上のボタンで地理院地図・航空写真・OpenStreetMap・Google 衛星を切り替えられます。",
      },
      {
        label: "変更量を見る",
        text: "一覧の右側に「3 点を移動（最大 42m）」のように、どれだけ動かしたかが出ます。",
      },
      {
        label: "新規に描く",
        text: "「リフトを追加」を押すと、地図をクリックした順に点がつながります。Esc で描画終了。",
      },
    ],
  },
  {
    id: "midstation",
    title: "中間駅を置く",
    lead: "途中で降りられるリフトには、中間駅の位置を置いておきます。",
    illustration: <MidstationIllustration />,
    points: [
      {
        label: "置く",
        text: "リフトを選び「中間駅を追加」を押してから、線の途中をクリックします。",
      },
      { label: "動かす", text: "置いた緑の点はドラッグで動かせます。" },
      { label: "消す", text: "「中間駅を削除」で外せます。" },
    ],
  },
  {
    id: "draw",
    title: "リフトを新しく描く",
    lead: "lift_before に無いリフトは、地図の上に直接描けます。",
    illustration: <DrawIllustration />,
    points: [
      {
        label: "描く向き",
        text: "山麓（乗り場）から山頂（降り場）へ向かって打ってください。",
      },
      {
        label: "終わり方",
        text: "オレンジ色の終点をもう一度クリックするか、Esc キーで描画を終えます。",
      },
      {
        label: "消す",
        text: "描いた直後の新規リフトは「この新規リフトを削除」で消せます。",
      },
    ],
  },
  {
    id: "reorder",
    title: "並び順を整える",
    lead: "一覧の順番が、そのまま保存後のファイルのリフト順になります。",
    illustration: <ReorderIllustration />,
    points: [
      {
        label: "その場で動かす",
        text: "行の左端の記号をつまんで上下へドラッグします。一覧の端まで運ぶと自動でスクロールします。",
      },
      {
        label: "キーボードでも",
        text: "つまむ記号を Tab で選び、↑↓ キーで 1 つずつ動かせます。",
      },
      {
        label: "広い画面で",
        text: "「並び替え画面」を押すと、クロール結果と今の順番を左右に並べた大きな画面が開きます。",
      },
    ],
  },
  {
    id: "mapping",
    title: "クローラーの営業情報とつなぐ",
    lead: "公式サイトから自動取得した運行状況を、リフトの線に結び付けます。位置補正の一覧でそのまま行えます（専用の工程はありません）。",
    illustration: <MappingIllustration />,
    points: [
      {
        label: "その場で対応付ける",
        text: "位置補正の一覧が、左に地図のリフト・右にクロール結果の 2 列になっています。右の欄で名前を選ぶと = でつながります。",
      },
      {
        label: "未対応",
        text: "どのリフトにも結び付いていない取得結果は、一覧の下に「未対応」としてまとまります。左でリフトを選んでから押すと対応します。",
      },
      {
        label: "まとめて付ける",
        text: "「自動で対応」で名前の一致から付け直せます。直したら「対応表を保存」で確定します。",
      },
      {
        label: "取得がない場合",
        text: "スキー場選択の画面で「クローラーなし」と出ているスキー場は、対応付けは不要です。",
      },
    ],
  },
  {
    id: "save",
    title: "詳細を入れて保存する",
    lead: "リフト名・種類・速度・輸送能力・搬器数などを入れて、最後に保存します。",
    points: [
      {
        label: "lift_detail との結合",
        text: "名前が一致する既存の詳細情報は自動で読み込まれます。ずれている場合は手動で対応付けられます。",
      },
      {
        label: "確認済みにする",
        text: "確かめ終えたスキー場は「確認済みにする」を押しておくと、一覧でひと目で分かります。",
      },
      {
        label: "保存先",
        text: "lift_before・lift_detail・SkiResortLinks.json へ保存されます。",
      },
    ],
    note: "保存する前にファイルが誰かに書き換えられていた場合は、保存せずにエラーを出します。その場合はページを開き直してからやり直してください。",
  },
];

const SHORTCUTS: GuideShortcut[] = [
  { keys: "Esc", description: "描画・中間駅の配置をやめる" },
  {
    keys: "Backspace / Delete",
    description: "カーソルを重ねている点を消す（入力欄にいるときは効きません）",
  },
  { keys: "右クリック", description: "点を消す" },
  { keys: "← →", description: "この手引きのページを送る" },
  {
    keys: "↑ ↓",
    description: "並び替えの記号を選んでいるとき、行を上下に動かす",
  },
  { keys: "ドラッグ", description: "点の移動、行の並び替え、パネルの幅の変更" },
];

type LiftTutorialOverlayProps = {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
};

export function LiftTutorialOverlay({
  open,
  onClose,
}: LiftTutorialOverlayProps) {
  return (
    <GuideDialog
      open={open}
      onClose={onClose}
      title="リフト編集のはじめかた"
      description="はじめての方はこのまま順に読んでください。あとから右上の「使い方」でいつでも開けます。"
      pages={PAGES}
      shortcuts={SHORTCUTS}
    />
  );
}
