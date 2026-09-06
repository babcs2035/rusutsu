"use client";

import {
  GuideDialog,
  type GuidePage,
  type GuideShortcut,
} from "./tutorial/GuideDialog";
import {
  DrawIllustration,
  InsertPointIllustration,
  MappingIllustration,
  MergeIllustration,
  MovePointIllustration,
  ReorderIllustration,
  SplitIllustration,
} from "./tutorial/illustrations";

const PAGES: GuidePage[] = [
  {
    id: "overview",
    title: "この画面ですること",
    lead: "スキー場のコースを地図の上に線で描き、名前と詳細を付けて保存します。上の帯にある 6 つの工程を、左から順に進めます。",
    points: [
      {
        label: "1. スキー場選択",
        text: "編集するスキー場を選びます。バッジで、確認済みデータやクローラーの有無が分かります。",
      },
      {
        label: "2. 所属確認・変更",
        text: "OpenStreetMap から取り込んだときだけ出ます。コースがどのスキー場のものかを確かめます。",
      },
      {
        label: "3. 線編集・分割・結合",
        text: "地図に線を描く、直す、分ける、つなぐ工程です。クローラーの取得結果との対応もここで見られます。",
      },
      {
        label: "4. 詳細編集",
        text: "難易度・斜度・圧雪・早朝／ナイターなどを入力します。まとめて入れることもできます。",
      },
      { label: "5. 確認・保存", text: "内容を確かめてファイルへ保存します。" },
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
        text: "「地図の操作を見る」「クローラーの営業情報」は、見出しをクリックすると開閉します。閉じておくとコース一覧が広く使えます。",
      },
      {
        label: "名前を地図に出す",
        text: "「名前を地図に表示」を押すと、線の上にコース名が出ます。どの線がどれか分からなくなったときに使ってください。",
      },
    ],
  },
  {
    id: "draw",
    title: "コースを描く",
    lead: "「新しいコースを追加」を押すと描画がはじまります。地図をクリックした順に点がつながって線になります。",
    illustration: <DrawIllustration />,
    points: [
      {
        label: "描く向き",
        text: "コースの上から下（滑る向き）へ打ってください。",
      },
      {
        label: "終わり方",
        text: "オレンジ色の終点をもう一度クリックするか、Esc キーで描画を終えます。",
      },
      {
        label: "打ち間違い",
        text: "「最後の点を取消」で 1 つずつ戻せます。",
      },
      {
        label: "既存ファイルから",
        text: "「ファイルを読み込む」で GeoJSON・KML・GPX・CSV を取り込めます。",
      },
    ],
  },
  {
    id: "edit",
    title: "描いた線を直す",
    lead: "線をクリックするとそのコースを選べます。少し離れたところを押しても、いちばん近い線が選ばれます。",
    illustration: <InsertPointIllustration />,
    points: [
      {
        label: "点を足す",
        text: "選んでいる赤い線の上をクリックすると、その位置に点が入ります。ダブルクリックは要りません。",
      },
      {
        label: "点を動かす",
        text: "赤い点をドラッグします。線の途中に出る青い点は、押すとそこに点が増えます。",
      },
      {
        label: "点を消す",
        text: "赤い点を右クリック、または点にカーソルを重ねて Backspace / Delete。",
      },
    ],
  },
  {
    id: "move",
    title: "点の移動と削除",
    lead: "位置がずれている線は、点をつまんで直します。動かす前の位置は破線で残るので、どれだけ動かしたか分かります。",
    illustration: <MovePointIllustration />,
    points: [
      { label: "移動", text: "赤い点をドラッグしている間、地図は動きません。" },
      {
        label: "削除",
        text: "右クリック、または点に重ねて Backspace / Delete キー。",
      },
      {
        label: "見やすくする",
        text: "右上のボタンで地理院地図・航空写真・OpenStreetMap・Google 衛星を切り替えられます。写真に切り替えるとコースの形が分かりやすくなります。",
      },
    ],
  },
  {
    id: "split",
    title: "コースを分ける",
    lead: "1 本のコースの途中で圧雪やナイターの条件が変わるときは、コース線編集の工程でコースを分けます。",
    illustration: <SplitIllustration />,
    points: [
      {
        label: "やり方",
        text: "一覧でコースを選び、その行の「分割」を押すと地図に紫の点が出ます。分けたい位置の点をクリックします。",
      },
      {
        label: "名前",
        text: "分けると「コース名_#上部」「コース名_#下部」のように自動で名前が付きます。",
      },
      {
        label: "戻す",
        text: "分けたものは同じ行の「分割を戻す」で 1 本に戻せます。",
      },
    ],
  },
  {
    id: "merge",
    title: "コースをつなぐ",
    lead: "別々に登録されている 2 本を 1 本にまとめられます。端どうしだけでなく、コースの途中どうしもつなげます。",
    illustration: <MergeIllustration />,
    points: [
      {
        label: "1本目を指す",
        text: "「コースを結合」を押し、1 本目のつなぎたい位置を地図でクリックします。端の近くを押すと、その端にぴったり吸い付きます。",
      },
      {
        label: "2本目を指す",
        text: "続けて 2 本目のつなぎたい位置をクリックします。交差しているところを押せば、途中どうしでつながります。",
      },
      {
        label: "残す側を選ぶ",
        text: "緑の線がつないだ結果、灰色の破線が切り落とされる側です。「始点側を残す / 終点側を残す」で切り替えて、緑の線が思った形になったら「この形で結合する」。",
      },
      {
        label: "名前と詳細",
        text: "結合後のコース名と、難易度などの詳細をどちらから引き継ぐかを選べます。",
      },
    ],
    note: "やめたいときは Esc キー、または「結合をやめる」。結合しても元のファイルはまだ書き換わりません。保存は最後の工程で行います。",
  },
  {
    id: "reorder",
    title: "並び順を整える",
    lead: "一覧の順番が、そのまま保存後のファイルのコース順になります。公式サイトの掲載順にそろえておくと、後の作業が楽になります。",
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
        text: "「並び替え画面」を押すと、クロール結果と今の順番を左右に並べた大きな画面が開きます。数が多いときはこちらが確実です。",
      },
      {
        label: "自動で合わせる",
        text: "対応付けが済んでいれば「クローラー取得順に並べる」で一気にそろえられます。",
      },
    ],
  },
  {
    id: "mapping",
    title: "クローラーの営業情報とつなぐ",
    lead: "公式サイトから自動取得した「今日の運行状況」を、描いたコース線に結び付けます。コース線編集の一覧でそのまま行えます（専用の工程はありません）。",
    illustration: <MappingIllustration />,
    points: [
      {
        label: "その場で対応付ける",
        text: "コース線編集の一覧が、左に地図のコース・右にクロール結果の 2 列になっています。右の欄で名前を選ぶと = でつながります。",
      },
      {
        label: "未対応",
        text: "どのコースにも結び付いていない取得結果は、一覧の下に「未対応」としてまとまります。左でコースを選んでから押すと対応します。",
      },
      {
        label: "まとめて付ける",
        text: "「自動で対応」を押すと、名前の一致から対応付けをやり直します。直したら「対応表を保存」で確定します。",
      },
      {
        label: "取得がない場合",
        text: "スキー場選択の画面で「取得結果なし」と出ているスキー場は、この工程を飛ばして構いません。",
      },
    ],
  },
  {
    id: "save",
    title: "詳細を入れて保存する",
    lead: "最後に、コースごとの難易度・滑走距離・斜度・圧雪・早朝／ナイター・画像・検索ワードを入れて保存します。",
    points: [
      {
        label: "まとめて入れる",
        text: "「早朝・ナイター・圧雪をまとめて設定」を開くと、3 項目を全コースへ一度に入れられます。入れたあとに 1 本ずつ直せば、その変更が残ります。",
      },
      {
        label: "必須の項目",
        text: "コース名・難易度・早朝・ナイター・検索ワードが空だと、確認画面へ進むときに知らせます。分からない項目は空のままでも進めます。",
      },
      {
        label: "保存先",
        text: "確認済みのデータは slope_before と slope_detail、OpenStreetMap 由来は slope_before_osm へ分けて保存されます。",
      },
      {
        label: "手元に残す",
        text: "GeoJSON・CSV・KML・GPX でダウンロードもできます。バックアップや外部ツール用です。",
      },
    ],
    note: "保存する前にファイルが誰かに書き換えられていた場合は、保存せずにエラーを出します。その場合はページを開き直してからやり直してください。",
  },
];

const SHORTCUTS: GuideShortcut[] = [
  { keys: "Esc", description: "描画・分割・結合をやめる" },
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

type TutorialOverlayProps = {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
};

export function TutorialOverlay({ open, onClose }: TutorialOverlayProps) {
  return (
    <GuideDialog
      open={open}
      onClose={onClose}
      title="コース編集のはじめかた"
      description="はじめての方はこのまま順に読んでください。あとから右上の「使い方」でいつでも開けます。"
      pages={PAGES}
      shortcuts={SHORTCUTS}
    />
  );
}
