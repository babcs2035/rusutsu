// スキー場1件の detail.json と article.json を検査する。
//
//   node check-review.mjs <reviews/<resortId> のディレクトリ> [--sync] [--print] [--merge <a.json> <b.json> ...]
//
//   --merge  調査担当の部分JSON（カテゴリ別）を1つの detail.json にまとめてから検査する
//   --print  article.json を画面と同じ並びで表示する（読み直し用）
//   --sync   article.json の score / warn / warnReason を detail.json から写してから検査する
//
// 「エラー」は形式・一致の誤りで、0件にする。
// 「確認」は機械では決められない点で、1件ずつ読んで、直すか、そのままでよい理由を持つ。
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const CATEGORIES = [
  "beginner",
  "intermediate",
  "advanced",
  "moguls",
  "powder",
  "tree-run",
  "park",
];
const SCORES = ["◎", "○", "△"];
const LABELS = ["description", "good", "bad"];
const HEADINGS = { description: null, good: "良い点", bad: "気になる点" };

const args = process.argv.slice(2);
const dir = args[0];
if (!dir || dir.startsWith("--")) {
  console.error(
    "usage: node check-review.mjs <reviewsディレクトリ> [--print] [--merge <部分JSON>...]",
  );
  process.exit(2);
}
const print = args.includes("--print");
const mergeIndex = args.indexOf("--merge");
const mergeInputs =
  mergeIndex >= 0
    ? args.slice(mergeIndex + 1).filter(arg => !arg.startsWith("--"))
    : [];
const resortId = path.basename(path.resolve(dir));
const detailPath = path.join(dir, "detail.json");
const articlePath = path.join(dir, "article.json");

const errors = [];
const notes = [];
const readJson = async file => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    errors.push(`${file}: JSONとして読めません（${error.message}）`);
    return null;
  }
};
const isObject = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value, keys) =>
  isObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => key in value);

// ---- 部分JSONの結合 ----
if (mergeInputs.length > 0) {
  const merged = { resortId, research: { date: "", note: "" } };
  const noteParts = [];
  for (const file of mergeInputs) {
    const part = await readJson(file);
    if (!part) {
      errors.push(`${file}: 部分JSONがありません`);
      continue;
    }
    if (part.research?.date) merged.research.date = part.research.date;
    if (part.research?.note) noteParts.push(part.research.note.trim());
    for (const category of CATEGORIES) {
      if (!(category in part)) continue;
      if (category in merged) {
        errors.push(`${file}: ${category} が複数の部分JSONにあります`);
      }
      merged[category] = part[category];
    }
  }
  merged.research.note = noteParts.join("\n");
  const ordered = {
    resortId: merged.resortId,
    research: merged.research,
    ...Object.fromEntries(
      CATEGORIES.filter(c => c in merged).map(c => [c, merged[c]]),
    ),
  };
  if (errors.length === 0) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(detailPath, `${JSON.stringify(ordered, null, 2)}\n`);
    console.log(`結合: ${detailPath}`);
  }
}

// ---- detail.json ----
const detail = await readJson(detailPath);
const checkSource = (source, at) => {
  if (!sameKeys(source, ["type", "url", "description", "quote"])) {
    errors.push(`${at}: キーは type / url / description / quote の4つ`);
    return;
  }
  if (!["review", "official"].includes(source.type)) {
    errors.push(`${at}.type は review か official`);
  }
  if (typeof source.url !== "string" || !/^https?:\/\//.test(source.url)) {
    errors.push(`${at}.url がURLではありません`);
  }
  if (typeof source.quote !== "string" || typeof source.description !== "string") {
    errors.push(`${at}: description と quote は文字列`);
  } else if (source.quote && source.quote === source.description) {
    errors.push(`${at}: quote に要約が入っています（description と同一）`);
  }
};
if (!detail) {
  errors.push(`${detailPath} がありません`);
} else {
  if (detail.resortId !== resortId) {
    errors.push(
      `detail.resortId「${detail.resortId}」がディレクトリ名「${resortId}」と違います`,
    );
  }
  if (!sameKeys(detail.research, ["date", "note"])) {
    errors.push("detail.research は date / note の2キー");
  }
  const extra = Object.keys(detail).filter(
    key => !["resortId", "research", ...CATEGORIES].includes(key),
  );
  if (extra.length) errors.push(`detail に独自キー: ${extra.join(", ")}`);
  const warnReasons = new Map();
  const reviewUrls = new Set();
  for (const category of CATEGORIES) {
    const entry = detail[category];
    const at = `detail.${category}`;
    if (
      !sameKeys(entry, [
        "score",
        "reason",
        "courses",
        "sources",
        "warn",
        "warnReason",
      ])
    ) {
      errors.push(
        `${at}: キーは score / reason / courses / sources / warn / warnReason`,
      );
      continue;
    }
    if (!SCORES.includes(entry.score)) errors.push(`${at}.score は ◎ ○ △`);
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      errors.push(`${at}.reason が空です`);
    } else if (entry.reason.length < 300) {
      notes.push(
        `${at}.reason が${entry.reason.length}字。調査記録として何人・何年・どの媒体か、なぜその評価かが入っているか`,
      );
    }
    if (typeof entry.warn !== "boolean") errors.push(`${at}.warn は boolean`);
    if (entry.warn ? !entry.warnReason?.trim?.() : entry.warnReason !== null) {
      errors.push(`${at}: warn と warnReason が対応していません`);
    }
    if (entry.warn && entry.warnReason) {
      if (warnReasons.has(entry.warnReason)) {
        errors.push(
          `${at}.warnReason が ${warnReasons.get(entry.warnReason)} と同文です`,
        );
      }
      warnReasons.set(entry.warnReason, category);
    }
    if (!Array.isArray(entry.sources) || !Array.isArray(entry.courses)) {
      errors.push(`${at}: sources と courses は配列`);
      continue;
    }
    entry.sources.forEach((s, i) => checkSource(s, `${at}.sources[${i}]`));
    entry.courses.forEach((course, i) => {
      const courseAt = `${at}.courses[${i}]`;
      if (!sameKeys(course, ["name", "description", "sources"])) {
        errors.push(`${courseAt}: キーは name / description / sources`);
        return;
      }
      if (!Array.isArray(course.sources)) {
        errors.push(`${courseAt}.sources は配列`);
        return;
      }
      course.sources.forEach((s, j) =>
        checkSource(s, `${courseAt}.sources[${j}]`),
      );
      if (!course.sources.some(s => s.type === "review")) {
        notes.push(
          `${courseAt}「${course.name}」に利用者の出典がありません。公式情報だけで選んでいないか`,
        );
      }
    });
    const all = [...entry.sources, ...entry.courses.flatMap(c => c.sources ?? [])];
    const reviews = all.filter(s => s.type === "review");
    for (const s of reviews) reviewUrls.add(s.url);
    if (entry.score !== "△" && reviews.length === 0) {
      notes.push(
        `${at}: ${entry.score} なのに利用者の出典がありません。公式情報だけで評価していないか`,
      );
    }
    if (entry.score === "◎" && new Set(reviews.map(s => s.url)).size < 2) {
      notes.push(`${at}: ◎ なのに利用者の出典が2件未満です`);
    }
  }
  console.log(`detail.json: 利用者の出典URL ${reviewUrls.size}件`);
}

// ---- article.json ----
const article = await readJson(articlePath);
if (args.includes("--sync") && article && detail) {
  for (const category of CATEGORIES) {
    if (!isObject(article[category]) || !isObject(detail[category])) continue;
    const { reason, courses } = article[category];
    const { score, warn, warnReason } = detail[category];
    article[category] = { score, reason, courses, warn, warnReason };
  }
  await fs.writeFile(articlePath, `${JSON.stringify(article, null, 2)}\n`);
}
const zenkaku = text => text.normalize("NFKC").replace(/[,，\s]/g, "");
const bigrams = text => {
  const body = text.replace(/[\s　。、「」『』（）()・：]/g, "");
  const set = new Set();
  for (let i = 0; i + 1 < body.length; i += 1) set.add(body.slice(i, i + 2));
  return set;
};
const overlap = (left, right) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size < 8 || b.size < 8) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

if (article && detail) {
  if (article.resortId !== resortId) {
    errors.push(`article.resortId がディレクトリ名「${resortId}」と違います`);
  }
  const extra = Object.keys(article).filter(
    key => !["resortId", "full", ...CATEGORIES].includes(key),
  );
  if (extra.length) errors.push(`article に独自キー: ${extra.join(", ")}`);

  const lines = []; // { at, text, group }
  const checkBullets = (list, at, min, max) => {
    if (!Array.isArray(list) || list.length === 0) {
      errors.push(`${at} は1項目以上の配列`);
      return;
    }
    if (list.length < min || list.length > max) {
      notes.push(`${at} が${list.length}項目（目安 ${min}〜${max}）`);
    }
    list.forEach((item, index) => {
      const itemAt = `${at}[${index}]`;
      if (!sameKeys(item, ["label", "text"]) || !LABELS.includes(item.label)) {
        errors.push(`${itemAt}: label（${LABELS.join(" / ")}）と text の2キー`);
        return;
      }
      if (typeof item.text !== "string" || !item.text.trim()) {
        errors.push(`${itemAt}.text が空です`);
        return;
      }
      lines.push({ at: itemAt, text: item.text, group: at });
    });
  };
  checkBullets(article.full, "full", 3, 5);
  if (Array.isArray(article.full) && article.full[0]?.label !== "description") {
    notes.push(
      "full の先頭が description ではありません。誰に向くスキー場かの一言から始める",
    );
  }

  const detailText = zenkaku(JSON.stringify(detail));
  for (const category of CATEGORIES) {
    const entry = article[category];
    const source = detail[category];
    if (
      !sameKeys(entry, ["score", "reason", "courses", "warn", "warnReason"])
    ) {
      errors.push(
        `article.${category}: キーは score / reason / courses / warn / warnReason`,
      );
      continue;
    }
    if (!source) continue;
    for (const key of ["score", "warn", "warnReason"]) {
      if (entry[key] !== source[key]) {
        errors.push(`article.${category}.${key} が detail.json と違います`);
      }
    }
    const max = entry.score === "△" ? 2 : 4;
    const min = entry.score === "△" ? 1 : 2;
    checkBullets(entry.reason, `${category}.reason`, min, max);
    if (!Array.isArray(entry.courses)) {
      errors.push(`article.${category}.courses は配列`);
      continue;
    }
    const allowed = new Set((source.courses ?? []).map(course => course.name));
    const used = new Set();
    entry.courses.forEach((course, index) => {
      const at = `${category}.courses[${index}]`;
      if (!sameKeys(course, ["name", "description"])) {
        errors.push(`${at}: キーは name / description`);
        return;
      }
      if (!allowed.has(course.name)) {
        errors.push(`${at}「${course.name}」が detail.json の courses にありません`);
      }
      used.add(course.name);
      lines.push({
        at,
        text: course.description,
        group: `${category}.courses`,
        course: true,
      });
    });
    for (const name of allowed) {
      if (!used.has(name)) {
        notes.push(`${category}.courses: detail.json の「${name}」を載せていません`);
      }
    }
  }

  // --- 1文ずつの検査 ---
  const NOTE_PATTERNS = [
    [
      /回せ|回し|回す|朝いち|朝イチ|ノートラック|食われ|食い荒ら|一枚バーン|攻め|飛ばせ|漕ぐ|漕い|滑り込|当たれ|当てら/,
      "内輪の言葉。その読み手が知っている言葉か",
    ],
    [
      /分かりません|分からない|確認でき|はっきりしません|情報が(?:少|な)|レビュー|口コミ|評価されて|という声|可能性(?:は|が)残/,
      "調査の事情。読み手の行動に直すか、書かない",
    ],
    [
      /わけではありません|とは限りません|とは言えません|なくはありません/,
      "遠回しな否定。何が起きるかを言い切る",
    ],
    [
      /(?:ことが|場合が|ときが)あり、[^。]*(?:ことが|場合が)あります/,
      "ぼかしの重なり",
    ],
    [
      /(?:満喫|充実|多彩|豊富|魅力|堪能|飽きずに|物足りな|思い切り|存分)/,
      "決まり文句。数字・名前・条件で言い直せるか",
    ],
    [/[◎○△]/, "評価記号を書かない"],
    [/^(?:また|一方|ただし|しかし|さらに|なお|そのため|これ|それ)/, "前の項目に頼る書き出し"],
  ];
  for (const line of lines) {
    const length = [...line.text].length;
    if (!/(?:です|ます|ません|ました|でした|ください)。$/.test(line.text)) {
      notes.push(`${line.at}: 敬体で句点まで書く「${line.text}」`);
    }
    if ((line.text.match(/。/g) ?? []).length > 1 || /\n/.test(line.text)) {
      notes.push(`${line.at}: 1項目1文にする「${line.text}」`);
    }
    if (length > 80) notes.push(`${line.at}: ${length}字。用件が2つ入っていないか`);
    for (const [pattern, hint] of NOTE_PATTERNS) {
      const hit = pattern.exec(line.text);
      if (hit) notes.push(`${line.at}: 「${hit[0]}」${hint}`);
    }
    // 数字は detail.json にあるものだけ（「1日」「1本」などの言い回しは除く）
    for (const match of zenkaku(line.text).matchAll(/\d+(?:\.\d+)?/g)) {
      const number = match[0];
      const after = zenkaku(line.text).slice(match.index + number.length)[0];
      if (number === "1" && /[日本人つ回度番]/.test(after ?? "")) continue;
      if (!detailText.includes(number)) {
        notes.push(
          `${line.at}: 数字「${number}」が detail.json にありません「${line.text}」`,
        );
      }
    }
  }

  // --- 欄をまたぐ重複 ---
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const ratio = overlap(lines[i].text, lines[j].text);
      if (ratio >= 0.6) {
        notes.push(
          `重複 ${Math.round(ratio * 100)}%: ${lines[i].at} と ${lines[j].at}\n    「${lines[i].text}」\n    「${lines[j].text}」`,
        );
      }
    }
  }

  // --- 文の形の偏り ---
  const bullets = lines.filter(line => !line.course);
  const tails = new Map();
  for (const line of bullets) {
    const tail = line.text.replace(/。$/, "").slice(-5);
    tails.set(tail, (tails.get(tail) ?? 0) + 1);
  }
  for (const [tail, count] of tails) {
    if (count >= 4) notes.push(`文末「…${tail}。」が${count}回。同じ形が続いていないか`);
  }
  const causal = bullets.filter(line => /(?:ため|ので)、/.test(line.text)).length;
  if (bullets.length >= 10 && causal / bullets.length > 0.6) {
    notes.push(
      `「〜ため、／〜ので、」でつなぐ項目が ${causal}/${bullets.length}。事実で言い切れる項目はないか`,
    );
  }

  if (print) {
    const show = points => {
      for (const label of LABELS) {
        const items = points.filter(point => point.label === label);
        if (!items.length) continue;
        if (HEADINGS[label]) console.log(`  【${HEADINGS[label]}】`);
        for (const item of items) console.log(`  ・${item.text}`);
      }
    };
    console.log(`\n===== ${resortId} =====`);
    if (Array.isArray(article.full)) show(article.full);
    for (const category of CATEGORIES) {
      const entry = article[category];
      if (!entry?.reason) continue;
      console.log(`\n■ ${category} ${entry.score}`);
      show(entry.reason);
      if (entry.courses?.length) console.log("  【代表的なコース】");
      for (const course of entry.courses ?? []) {
        console.log(`  ・${course.name}：${course.description}`);
      }
    }
    console.log("");
  }
} else if (!article) {
  console.log("article.json: まだありません（detail.json だけ検査）");
}

for (const note of notes) console.log(`確認: ${note}`);
for (const error of errors) console.log(`エラー: ${error}`);
console.log(`\nエラー ${errors.length}件 / 確認 ${notes.length}件`);
process.exit(errors.length > 0 ? 1 : 0);
