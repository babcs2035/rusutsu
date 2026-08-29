import { promises as fs } from "node:fs";
import process from "node:process";

const categories = [
  "beginner",
  "intermediate",
  "advanced",
  "moguls",
  "powder",
  "tree-run",
  "park",
];

const SCORES = ["◎", "○", "△"];
const SOURCE_KEYS = ["type", "url", "description", "quote"];
const SOURCE_TYPES = ["review", "official"];
const ARTICLE_CATEGORY_KEYS = [
  "score",
  "reason",
  "courses",
  "warn",
  "warnReason",
];
const ARTICLE_BULLET_KEYS = ["label", "text"];
const BULLET_LABELS = ["good", "bad", "description"];
const ARTICLE_COURSE_KEYS = ["name", "description"];
const ARTICLE_ROOT_KEYS = ["resortId", "full", ...categories];

const REASON_ITEMS = [2, 5];
const FULL_ITEMS = [3, 5];
const BULLET_TEXT_MIN = 15;
const BULLET_TEXT_MAX = 75;
const COURSE_DESC_MIN = 20;
const COURSE_DESC_MAX = 75;
const SENTENCE_MAX = 70;

// 調査側の事情を記事に書いていないか
const RESEARCH_TALK =
  /確認できま|確認できな|確認されて|情報が(?:不足|ありま|な)|判断できま|レビューが少な/;
// 件数・統計表現を記事に出していないか
const COUNT_TALK = /\d+件|\d+人|複数のレビュー|多数のレビュー|利用者の多くが/;
// 前の項目がないと意味が成立しない書き出し
const DEPENDENT_BULLET_LEAD =
  /^(そのため|したがって|一方|ただし|しかし|また|さらに|なお|もっとも|これにより|そこで|これ|それ|前者|後者)/;
// 調査や評判の話を斜面の事実として書き直せていない
const REVIEW_META = /(利用者|評価|評判|支持|好評|という声|報告|記録|実績)/;
// 判断材料を選ばず、エリアや設備を棚卸ししただけの表現
const VAGUE_OVERVIEW = /(さまざまな|多彩な|幅広いニーズ)/;
// 調査記録の名詞へ機械的な接尾語を付けた表現
const AWKWARD_NOUN = /(非圧雪部|小斜面|コブ発生箇所|初心者向け場所)/;
const POLITE_SENTENCE_END = /(です|ます|ません|ました|でした)。$/;
const LIST_MARKER = /(^|\n)\s*(?:[-*・]|\d+[.)])\s*/;
// labelの取り違えが明確な表現だけを警告する。descriptionは文脈依存なので機械判定しない。
const BAD_SIGNAL =
  /(ありません|出られません|続けられません|限られます|不足|閉鎖|混雑|未設置|荒れ(?!にく|ず|ませ|ない)|重くなり|はっきりしません)/;
const GOOD_SIGNAL =
  /(滑れます|練習できます|反復できます|狙えます|選べます|利用できます)/;

// ---- 文体lint ----
// AIは自分の文章の不自然さを自力で検知できないため、機械で指摘する。
const STYLE_RULES = [
  {
    id: "モノ主語",
    // 「評価が積み重なっています」など、モノを主語にして人間の動詞を使っている
    pattern:
      /(評価|声|報告|記録|実績|人気|支持)が[^。]{0,12}(積み重|定着|届い|残っ|集ま|揃っ|寄せられ|挙が|広がっ)/,
    hint: "斜面・雪・リフト・人を主語にして書き直す",
  },
  {
    id: "伝聞",
    pattern: /という(声|評価|報告|記録|意見|指摘)/,
    hint: "帰属表現をやめ、断定の強さで確信度を表す",
  },
  {
    id: "受動評価",
    pattern: /(評価|指摘|案内|紹介|注目)されて(い|お)/,
    hint: "受動態をやめて事実として書く",
  },
  {
    id: "定型結論",
    pattern:
      /(段階には届|広がりまでは|まで(?:は)?定着|として機能して|として挙げられて|物足りなさが残|理由がはっきり|選択肢と実績)/,
    hint: "調査側の言い回し。読者が体験する差に翻訳するか削る",
  },
  {
    id: "判定テンプレ",
    pattern: /判定は[◎○△]/,
    hint: "定型の判定文は書かない。1文目の結論でscoreの意味を伝える",
  },
  {
    id: "予告総括",
    pattern:
      /(特に評価が高いのは|重要なのは|注目すべきは|特筆すべきは|ポイントは)/,
    hint: "前置きを削っていきなり中身を書く",
  },
  {
    id: "ぼかし",
    pattern: /(場面もあり|することができ|といえるでしょう|傾向にあり)/,
    hint: "言い切る",
  },
  {
    id: "名詞述語",
    pattern: /(構成|作り|造り)です。/,
    hint: "中身のない名詞述語。動詞で締める",
  },
  {
    id: "修飾過多",
    // 「長い圧雪の急斜面」のように一つの名詞に修飾を重ねている
    pattern: /[一-龠ァ-ヴ][ぁ-ん]{0,2}い[一-龠ァ-ヴ]{2,}の[一-龠ァ-ヴ]{2,}/,
    hint: "修飾語を重ねない。落とせない条件は次の文に回す",
  },
  {
    id: "空語",
    pattern: /(魅力が満載|幅広いニーズ|バラエティ豊か|充実しています|多彩な)/,
    hint: "何が優れているのかを具体的に書く",
  },
  {
    id: "同義語並列",
    pattern:
      /(非圧雪やパウダー|パウダーや非圧雪|コブやモーグル|モーグルやコブ|ツリーランや林間|急斜面やスティープ)/,
    hint: "同じ意味の語を並べない。どちらか一方にする",
  },
];

// 箇条書きは抽象的な結論ではなく、具体物または具体的な条件を含むこと
const CONCRETE_NOUN =
  /斜面|バーン|コース|エリア|ゲレンデ|リフト|ゴンドラ|クワッド|雪|パウダー|コブ|モーグル|パーク|パイプ|ウェーブ|キッカー|ジブ|ツリーラン|林|森|ゾーン|圧雪|ライン|地形|山|沢|申請|受付|営業時間|混雑|混み合|競争|閉鎖|移動|運休|開設|整備|整地|滑走|幅|長さ|駐車場|バス|歩道|徒歩|そり|用具|坂|人工降雪機|圧雪車|アイテム|ウォール|レール|ボックス|雪質|積雪/;
// 判断材料の少なさに触れる表現（warn: true のカテゴリだけ許可）
const THIN_EVIDENCE =
  /(まだ多くありません|まだ少なめ|まだ少なく|はっきりしません|見えていません|分かりません|分かっていません)/;

// カテゴリ名から当然に導ける可能動作だけを記事へ書いていないか。
// 例: 「圧雪中斜面でカービングを反復できます」。
const GENERIC_CATEGORY_EXPERIENCE =
  /(?:圧雪|整地)[^。]{0,18}(?:緩斜面|中斜面|急斜面|バーン|コース)[^。]{0,18}(?:カービング|高速ターン|ショートターン|大回り|小回り|ターン|滑走|練習)[^。]{0,10}(?:できます|楽しめます)|(?:コブ斜面|コブライン|モーグルバーン)[^。]{0,18}(?:滑走|練習|反復)[^。]{0,8}(?:できます|楽しめます)|(?:非圧雪斜面|非圧雪コース)[^。]{0,18}(?:新雪|パウダー)[^。]{0,8}(?:狙えます|楽しめます)|(?:ツリーラン|樹林帯)[^。]{0,18}(?:樹林滑走|深雪|パウダー)[^。]{0,8}(?:練習できます|楽しめます)|パーク[^。]{0,18}(?:アイテム|キッカー|ジブ)[^。]{0,10}(?:利用できます|練習できます)/;

// 一般的な可能動作を、そのスキー場固有の差へ変える比較軸。
// 「幅広い」「圧雪が丁寧」だけでは平均的な同カテゴリとの差にならない。
const DECISION_DELTA =
  /一系統|実質一|一本|一つ|一か所|複数|選択肢|選び分け|集中|限ら|主力|中心|代替|長く続|上から下|山頂から麓|(?:斜面|コース|ライン)(?:が|は)?[^。]{0,4}長|短(?:い|く|め)|狭|全山|範囲|エリア間|横移動|歩き|スケーティング|乗り継ぎ|受付|申請|営業時間|午前|午後|朝一|朝だけ|終日|混雑|競争|待ち|開放|閉鎖|運休|圧雪頻度|圧雪運用|非圧雪(?:になる|へ変わ)|造成|積雪状況|降雪状況|日によ|シーズン|残り|荒れ|別ルート|周回|ライン数|規模|段階|上達|初めて|初滑り|覚えた|子ども|家族|向いて|適して|負担|体力/;

// 「長く丁寧に圧雪」は、斜面が長いのか圧雪期間が長いのか曖昧。
const AMBIGUOUS_LENGTH = /長く(?:丁寧|きれい|しっかり)に圧雪/;

// full / reason がコース紹介になっていないか。コース単体の等級・距離の紹介は courses の仕事。
const COURSE_CATALOG_SENTENCE =
  /(?:初級|中級|上級|初心者|中級者|上級者)(?:者)?(?:向け)?コースです。$|\d+(?:\.\d+)?\s*(?:km|m)の[^。]{0,20}コースです。$/;

// detail.courses[].name から、記事の full / reason で使ってはいけないコース名を取り出す。
// スキー場名・ゲレンデ名・エリア名は移動や混雑の説明に必要なので対象にしない。
const courseNameTokens = names => {
  const tokens = new Set();
  for (const name of names) {
    if (typeof name !== "string") continue;
    for (const part of [name, ...name.split(/[\s　]+/)]) {
      const token = part.trim();
      if (token.length >= 3 && /コース$/.test(token)) tokens.add(token);
    }
  }
  return tokens;
};

// reason が courses の説明を言い直しただけになっていないか（文字bigramの包含率）
const DUPLICATE_RATIO = 0.6;
const bigrams = value => {
  const body = value.replace(/[\s　。、「」『』（）()・]/g, "");
  const set = new Set();
  for (let index = 0; index + 1 < body.length; index += 1) {
    set.add(body.slice(index, index + 2));
  }
  return set;
};
const containmentRatio = (left, right) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / Math.min(a.size, b.size);
};
const isGenericCategoryClaim = value =>
  GENERIC_CATEGORY_EXPERIENCE.test(value) && !DECISION_DELTA.test(value);

if (process.argv[2] === "--self-test") {
  const rejected = [
    "圧雪中斜面ではルートを変えてショートターンを練習できます。",
    "丁寧に圧雪された中斜面でカービングを反復できます。",
    "長く丁寧に圧雪された急斜面で高速ターンを反復できます。",
    "締まった圧雪バーンでカービングを楽しめます。",
  ];
  const accepted = [
    "第4ゲレンデは幅が広い緩斜面で、短いリフトを使って繰り返し滑れます。",
    "圧雪された上級コースは、実質チャンピオンコース一本です。",
    "ラクラクコースは、初級者が滑れる長いコースです。",
    "豪円山から中の原へ移るには、歩くかスケーティングが必要です。",
  ];

  for (const value of rejected) {
    if (!isGenericCategoryClaim(value)) {
      throw new Error(`カテゴリ同義文を検出できません: ${value}`);
    }
  }
  for (const value of accepted) {
    if (isGenericCategoryClaim(value)) {
      throw new Error(`比較差のある文を誤検出しました: ${value}`);
    }
  }
  if (!AMBIGUOUS_LENGTH.test(rejected[2])) {
    throw new Error("曖昧な長さを検出できません");
  }
  const catalogSentences = [
    "天狗コースは、山頂から続く3.2kmの緩やかな初級コースです。",
    "パノラマコースは、林の中を通る中級コースです。",
    "ラクラクコースは3.5kmの長いコースです。",
  ];
  for (const value of catalogSentences) {
    if (!COURSE_CATALOG_SENTENCE.test(value)) {
      throw new Error(`コース紹介文を検出できません: ${value}`);
    }
  }
  const notCatalog = [
    "山頂からも、緩やかな林間コースを使えば初級者が麓まで下れます。",
    "圧雪された上級コースは1本だけです。",
    "団体講習の時間は、一の瀬と高天ヶ原の周辺が混み合います。",
  ];
  for (const value of notCatalog) {
    if (COURSE_CATALOG_SENTENCE.test(value)) {
      throw new Error(`コース紹介文を誤検出しました: ${value}`);
    }
  }

  const tokens = courseNameTokens([
    "一の瀬ファミリー 天狗コース",
    "一の瀬ファミリー 正面ゲレンデ下部",
    "西館山スキー場",
    "ジャイアントゲレンデ",
    "みずならコース",
    "高天ヶ原マンモス ゲレンデ左側コブ斜面",
  ]);
  for (const expected of ["天狗コース", "みずならコース"]) {
    if (!tokens.has(expected)) {
      throw new Error(`コース名を抽出できません: ${expected}`);
    }
  }
  for (const unexpected of [
    "西館山スキー場",
    "ジャイアントゲレンデ",
    "高天ヶ原マンモス",
    "一の瀬ファミリー 正面ゲレンデ下部",
  ]) {
    if (tokens.has(unexpected)) {
      throw new Error(`エリア名をコース名として扱っています: ${unexpected}`);
    }
  }

  const duplicated = containmentRatio(
    "天狗コースは、山頂から続く3.2kmの緩やかな初級コースです。",
    "山頂から正面下部まで続く、3.2kmの緩やかな初級コースです。",
  );
  if (duplicated < DUPLICATE_RATIO) {
    throw new Error(`courses重複を検出できません: ${duplicated.toFixed(2)}`);
  }
  const distinct = containmentRatio(
    "山頂からも、緩やかな林間コースを使えば初級者が麓まで下れます。",
    "山頂から正面下部まで続く3.2kmの林間コースで、斜度は終始緩やかです。",
  );
  if (distinct >= DUPLICATE_RATIO) {
    throw new Error(
      `別内容をcourses重複と誤検出しました: ${distinct.toFixed(2)}`,
    );
  }

  process.stdout.write("validator self-test: OK\n");
  process.exit(0);
}

// 反復チェックから除外する語（このドメインでは繰り返して当然）
const REPEAT_STOPWORDS = new Set([
  "コース",
  "エリア",
  "リフト",
  "ゲレンデ",
  "スキー",
  "スノーボード",
  "初心者",
  "中級者",
  "上級者",
  "初級者",
  "パウダー",
  "パーク",
  "コブ",
  "ツリーラン",
  "モーグル",
  "斜面",
  "圧雪",
  "非圧雪",
  "緩斜面",
  "中斜面",
  "急斜面",
  "ゴンドラ",
  "クワッド",
  "キッカー",
  "シーズン",
  "圧雪急斜面",
  "非圧雪エリア",
  "中級者向",
  "初心者向",
]);
// 単漢字の連呼（幅／雪 など）。ドメイン上避けにくいものは除外
const CHAR_REPEAT_STOPWORDS = new Set([
  ..."雪斜面者級上中初下山日人場内長高広滑分本回圧緩急",
]);

const [detailPath, articlePath] = process.argv.slice(2);
if (!detailPath || !articlePath) {
  throw new Error("detail.json と article.json のパスを指定してください。");
}

const detail = JSON.parse(await fs.readFile(detailPath, "utf8"));
const article = JSON.parse(await fs.readFile(articlePath, "utf8"));

const errors = [];
const warnings = [];
const splitSentences = value =>
  value
    .split(/(?<=。)/)
    .map(part => part.trim())
    .filter(Boolean);
const sentences = value => splitSentences(value).length;

// 文体lintを1フィールドに適用する
const lintStyle = (
  value,
  path,
  { maxSentence = SENTENCE_MAX, skip = [] } = {},
) => {
  for (const rule of STYLE_RULES) {
    if (skip.includes(rule.id)) continue;
    const hit = value.match(rule.pattern);
    if (hit) {
      warnings.push(`${path} [${rule.id}] 「${hit[0]}」→ ${rule.hint}`);
    }
  }

  for (const sentence of splitSentences(value)) {
    const body = sentence.replace(/\n/g, "");
    if (body.length > maxSentence) {
      warnings.push(
        `${path} [長文] ${body.length}字（上限${maxSentence}字）: ${body.slice(0, 24)}…`,
      );
    }
  }

  // 同じ語尾が4回以上続いていないか（敬体の単調さ）
  const endings = splitSentences(value).map(sentence => {
    const body = sentence.replace(/[。\n]/g, "");
    const matched = body.match(/(ません|ました|ます|でした|です)$/);
    return matched ? matched[1] : "他";
  });
  let run = 1;
  for (let index = 1; index <= endings.length; index += 1) {
    if (index < endings.length && endings[index] === endings[index - 1]) {
      run += 1;
      continue;
    }
    if (run >= 4 && endings[index - 1] !== "他") {
      warnings.push(
        `${path} [語尾連続] 「${endings[index - 1]}」で終わる文が${run}連続（体言止めを混ぜて崩す）`,
      );
    }
    run = 1;
  }

  const conjunctions =
    value.match(/(一方|ただし|しかし|とはいえ|もっとも)/g) ?? [];
  if (conjunctions.length > 1) {
    warnings.push(
      `${path} [逆接過多] ${conjunctions.length}回（1回まで）: ${conjunctions.join(" / ")}`,
    );
  }

  const words = value.match(/[一-龠々]{2,}|[ァ-ヴー]{2,}/g) ?? [];
  const wordCount = new Map();
  for (const word of words) {
    if (REPEAT_STOPWORDS.has(word)) continue;
    wordCount.set(word, (wordCount.get(word) ?? 0) + 1);
  }
  for (const [word, count] of wordCount) {
    if (count >= 3) {
      warnings.push(`${path} [反復] 「${word}」が${count}回`);
    }
  }

  const charCount = new Map();
  for (const char of value.match(/[一-龠]/g) ?? []) {
    if (CHAR_REPEAT_STOPWORDS.has(char)) continue;
    charCount.set(char, (charCount.get(char) ?? 0) + 1);
  }
  for (const [char, count] of charCount) {
    if (count >= 3) {
      warnings.push(`${path} [反復] 「${char}」が${count}回`);
    }
  }

  if (/^#|^-\s|^\*\s|^・|^\d+\.\s/m.test(value)) {
    warnings.push(`${path} [記号] 配列要素に箇条書き記号を含めない`);
  }
};

const validateBulletList = (
  value,
  path,
  {
    itemRange,
    allowThinEvidence = false,
    bannedCourseNames = new Set(),
    courseDescriptions = [],
  },
) => {
  if (!Array.isArray(value)) {
    errors.push(`${path} が辞書の配列ではありません`);
    return;
  }

  if (value.length < itemRange[0] || value.length > itemRange[1]) {
    warnings.push(
      `${path} が ${value.length}項目（規定 ${itemRange[0]}〜${itemRange[1]}項目）`,
    );
  }

  const seenTexts = new Set();
  value.forEach((item, index) => {
    const at = `${path}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${at} が辞書ではありません`);
      return;
    }

    for (const key of Object.keys(item)) {
      if (!ARTICLE_BULLET_KEYS.includes(key)) {
        errors.push(`${at}.${key} は許可されていないキーです`);
      }
    }

    const { label, text } = item;
    const labelAt = `${at}.label`;
    const textAt = `${at}.text`;

    if (!BULLET_LABELS.includes(label)) {
      errors.push(
        `${labelAt} が good / bad / description のいずれでもありません`,
      );
    }

    if (typeof text !== "string" || !text.trim()) {
      errors.push(`${textAt} が空でない文字列ではありません`);
      return;
    }
    if (text !== text.trim()) {
      warnings.push(`${textAt} の前後に空白があります`);
    }
    if (seenTexts.has(text)) {
      warnings.push(`${textAt} が同じ配列内で重複しています`);
    }
    seenTexts.add(text);

    if (text.length < BULLET_TEXT_MIN || text.length > BULLET_TEXT_MAX) {
      warnings.push(
        `${textAt} が ${text.length}字（規定 ${BULLET_TEXT_MIN}〜${BULLET_TEXT_MAX}字）`,
      );
    }
    if (sentences(text) !== 1 || !text.endsWith("。") || text.includes("\n")) {
      warnings.push(`${textAt} は改行を含まない独立した1文にする`);
    }
    if (!POLITE_SENTENCE_END.test(text)) {
      warnings.push(`${textAt} は敬体で句点まで書く`);
    }
    if (DEPENDENT_BULLET_LEAD.test(text)) {
      warnings.push(
        `${textAt} [前項依存] 前の項目を参照する書き出しを使わない`,
      );
    }
    if (RESEARCH_TALK.test(text)) {
      warnings.push(`${textAt} に調査側の事情を示す表現があります`);
    }
    if (COUNT_TALK.test(text)) {
      warnings.push(`${textAt} に件数・統計表現があります`);
    }
    if (REVIEW_META.test(text)) {
      warnings.push(`${textAt} [評判語] 斜面・雪・運用の事実に書き直す`);
    }
    if (VAGUE_OVERVIEW.test(text)) {
      warnings.push(`${textAt} [棚卸し] 来場判断を変える事実を1つだけ書く`);
    }
    if (AWKWARD_NOUN.test(text)) {
      warnings.push(`${textAt} [不自然語] スキーヤーが使う具体的な名詞に直す`);
    }
    if (/[◎○△]/.test(text)) {
      warnings.push(`${textAt} にscore記号があります`);
    }
    if (LIST_MARKER.test(text)) {
      warnings.push(`${textAt} に箇条書き記号を含めない`);
    }
    if (!CONCRETE_NOUN.test(text)) {
      warnings.push(`${textAt} に具体物または具体的な利用条件がありません`);
    }
    if (isGenericCategoryClaim(text)) {
      warnings.push(
        `${textAt} [カテゴリ同義文] 可能動作ではなく、量・長さ・選択肢・運用・移動の差を書く`,
      );
    }
    if (AMBIGUOUS_LENGTH.test(text)) {
      warnings.push(`${textAt} [曖昧な長さ] コース長か運用期間かを明示する`);
    }
    for (const courseName of bannedCourseNames) {
      if (text.includes(courseName)) {
        warnings.push(
          `${textAt} [コース名] 「${courseName}」は courses にだけ書く。ここは「何ができるか・何に困るか」を書く`,
        );
      }
    }
    if (COURSE_CATALOG_SENTENCE.test(text)) {
      warnings.push(
        `${textAt} [コース紹介] コース単体の等級・距離の紹介は courses に書く`,
      );
    }
    for (const description of courseDescriptions) {
      if (containmentRatio(text, description) >= DUPLICATE_RATIO) {
        warnings.push(
          `${textAt} [courses重複] courses の説明と同じ内容です: ${description.slice(0, 24)}…`,
        );
        break;
      }
    }
    if (THIN_EVIDENCE.test(text) && !allowThinEvidence) {
      warnings.push(
        `${textAt} に判断材料の少なさがあります（warn:trueだけ許可）`,
      );
    }
    if (label === "good" && BAD_SIGNAL.test(text)) {
      warnings.push(`${labelAt} [分類] 制約や不足をgoodにしていないか確認する`);
    }
    if (label === "bad" && GOOD_SIGNAL.test(text)) {
      warnings.push(
        `${labelAt} [分類] 滑走上の利点をbadにしていないか確認する`,
      );
    }
    lintStyle(text, textAt, {
      maxSentence: BULLET_TEXT_MAX,
    });
  });
};

const validateWarn = (value, path) => {
  if (typeof value.warn !== "boolean") {
    errors.push(`${path}.warn がbooleanではありません`);
    return;
  }
  if (
    value.warn &&
    !(typeof value.warnReason === "string" && value.warnReason)
  ) {
    errors.push(`${path}.warnReason が空です（warn:true なら理由が必要）`);
  }
  if (!value.warn && value.warnReason !== null) {
    errors.push(`${path}.warnReason が null ではありません（warn:false）`);
  }
};

const validateSources = (sources, path) => {
  if (!Array.isArray(sources)) {
    errors.push(`${path} が配列ではありません`);
    return;
  }
  sources.forEach((source, index) => {
    const at = `${path}[${index}]`;
    if (!source || typeof source !== "object") {
      errors.push(`${at} がオブジェクトではありません`);
      return;
    }
    for (const key of Object.keys(source)) {
      if (!SOURCE_KEYS.includes(key)) {
        errors.push(`${at}.${key} は許可されていないキーです`);
      }
    }
    if (!SOURCE_TYPES.includes(source.type)) {
      errors.push(`${at}.type が review / official ではありません`);
    }
    if (typeof source.url !== "string" || !source.url) {
      errors.push(`${at}.url が空です`);
    }
    if (typeof source.description !== "string" || !source.description) {
      errors.push(`${at}.description が空です`);
    }
    if (typeof source.quote !== "string") {
      errors.push(`${at}.quote が文字列ではありません`);
      return;
    }
    if (source.quote && source.quote === source.description) {
      errors.push(
        `${at}.quote が description と同一です（要約を引用欄に入れている）`,
      );
    }
    if (source.type === "review" && !source.quote) {
      warnings.push(`${at} は review ですが quote が空です`);
    }
  });
};

// ---- detail.json ----

if (typeof detail.resortId !== "string" || !detail.resortId) {
  errors.push("detail.resortId が空です");
}
if (
  typeof detail.research?.date !== "string" ||
  typeof detail.research?.note !== "string"
) {
  errors.push("detail.research.date / note が文字列ではありません");
}

const warnReasons = new Map();

for (const category of categories) {
  const target = detail[category];
  const at = `detail.${category}`;
  if (!target || typeof target !== "object") {
    errors.push(`${at} がありません`);
    continue;
  }

  if (!SCORES.includes(target.score)) {
    errors.push(`${at}.score が ◎ ○ △ のいずれかではありません（null は不可）`);
  }
  if (typeof target.reason !== "string" || !target.reason) {
    errors.push(`${at}.reason が空です`);
  }

  if (!Array.isArray(target.courses)) {
    errors.push(`${at}.courses が配列ではありません`);
  } else {
    target.courses.forEach((course, index) => {
      const courseAt = `${at}.courses[${index}]`;
      if (typeof course?.name !== "string" || !course.name) {
        errors.push(`${courseAt}.name が空です`);
      }
      if (typeof course?.description !== "string" || !course.description) {
        errors.push(`${courseAt}.description が空です`);
      }
      validateSources(course?.sources, `${courseAt}.sources`);
    });
  }

  validateSources(target.sources, `${at}.sources`);
  validateWarn(target, at);

  if (target.warn && typeof target.warnReason === "string") {
    const seen = warnReasons.get(target.warnReason) ?? [];
    seen.push(category);
    warnReasons.set(target.warnReason, seen);
  }
}

for (const [reason, used] of warnReasons) {
  if (used.length > 1) {
    warnings.push(
      `detail.warnReason が定型文になっています（${used.join(", ")} で同一）: ${reason.slice(0, 40)}`,
    );
  }
}

// ---- article.json ----

for (const key of Object.keys(article)) {
  if (!ARTICLE_ROOT_KEYS.includes(key)) {
    errors.push(`article.${key} は許可されていないキーです`);
  }
}

if (typeof article.resortId !== "string" || !article.resortId) {
  errors.push("article.resortId が空です");
}
if (detail.resortId !== article.resortId) {
  errors.push("detail.resortId と article.resortId が一致しません");
}
const allDetailCourseNames = courseNameTokens(
  categories.flatMap(category =>
    (detail[category]?.courses ?? []).map(course => course?.name),
  ),
);
const allArticleCourseDescriptions = categories.flatMap(category =>
  (Array.isArray(article[category]?.courses) ? article[category].courses : [])
    .map(course => course?.description)
    .filter(value => typeof value === "string"),
);

validateBulletList(article.full, "article.full", {
  itemRange: FULL_ITEMS,
  bannedCourseNames: allDetailCourseNames,
  courseDescriptions: allArticleCourseDescriptions,
});

for (const category of categories) {
  const target = article[category];
  const source = detail[category];
  const at = `article.${category}`;
  if (!target || typeof target !== "object") {
    errors.push(`${at} がありません`);
    continue;
  }

  for (const key of Object.keys(target)) {
    if (!ARTICLE_CATEGORY_KEYS.includes(key)) {
      errors.push(`${at}.${key} は article に持たせません`);
    }
  }

  if (!SCORES.includes(target.score)) {
    errors.push(`${at}.score が ◎ ○ △ のいずれかではありません（null は不可）`);
  } else if (source && target.score !== source.score) {
    errors.push(
      `${at}.score が detail と一致しません（detail: ${source.score} / article: ${target.score}）`,
    );
  }

  const knownCourseNames = new Set(
    (source?.courses ?? []).map(course => course.name),
  );
  validateBulletList(target.reason, `${at}.reason`, {
    itemRange: REASON_ITEMS,
    allowThinEvidence: target.warn === true,
    bannedCourseNames: courseNameTokens([...knownCourseNames]),
    courseDescriptions: (Array.isArray(target.courses) ? target.courses : [])
      .map(course => course?.description)
      .filter(value => typeof value === "string"),
  });

  if (!Array.isArray(target.courses)) {
    errors.push(`${at}.courses が配列ではありません`);
  } else {
    if ((source?.courses?.length ?? 0) > 0 && target.courses.length === 0) {
      warnings.push(`${at}.courses が空です（detail の代表コースを残す）`);
    }
    target.courses.forEach((course, index) => {
      const courseAt = `${at}.courses[${index}]`;
      for (const key of Object.keys(course ?? {})) {
        if (!ARTICLE_COURSE_KEYS.includes(key)) {
          errors.push(`${courseAt}.${key} は article に持たせません`);
        }
      }
      if (typeof course?.name !== "string" || !course.name) {
        errors.push(`${courseAt}.name が空です`);
      } else if (
        knownCourseNames.size > 0 &&
        !knownCourseNames.has(course.name)
      ) {
        errors.push(`${courseAt}.name が detail にありません: ${course.name}`);
      }
      if (typeof course?.description !== "string" || !course.description) {
        errors.push(`${courseAt}.description が空です`);
        return;
      }
      const length = course.description.length;
      if (length < COURSE_DESC_MIN || length > COURSE_DESC_MAX) {
        warnings.push(
          `${courseAt}.description が ${length}字（規定 ${COURSE_DESC_MIN}〜${COURSE_DESC_MAX}字）`,
        );
      }
      lintStyle(course.description, `${courseAt}.description`, {
        maxSentence: 60,
      });
      if (isGenericCategoryClaim(course.description)) {
        warnings.push(
          `${courseAt}.description [カテゴリ同義文] 可能動作ではなく、コース固有の規模・形・運用を書く`,
        );
      }
      if (AMBIGUOUS_LENGTH.test(course.description)) {
        warnings.push(
          `${courseAt}.description [曖昧な長さ] コース長か運用期間かを明示する`,
        );
      }
    });
  }

  validateWarn(target, at);
  if (source && target.warn !== source.warn) {
    errors.push(`${at}.warn が detail と一致しません`);
  }
  if (source && target.warnReason !== source.warnReason) {
    errors.push(`${at}.warnReason が detail と一致しません`);
  }
}

// ---- 出力 ----

if (warnings.length > 0) {
  process.stdout.write(`警告 ${warnings.length}件:\n`);
  for (const warning of warnings) process.stdout.write(`  - ${warning}\n`);
}

if (errors.length > 0) {
  throw new Error(
    `形式が不正です（${errors.length}件）:\n${errors.map(e => `  - ${e}`).join("\n")}`,
  );
}

process.stdout.write(
  warnings.length > 0
    ? "review JSON format: OK（警告あり）\n"
    : "review JSON format: OK\n",
);
