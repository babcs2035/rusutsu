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

const [detailPath, articlePath] = process.argv.slice(2);
if (!detailPath || !articlePath) {
  throw new Error("detail.json と article.json のパスを指定してください。");
}

const detail = JSON.parse(await fs.readFile(detailPath, "utf8"));
const article = JSON.parse(await fs.readFile(articlePath, "utf8"));
const errors = [];

const validateWarning = (value, path) => {
  if (typeof value.warn !== "boolean") errors.push(`${path}.warn`);
  if (
    value.warn &&
    !(typeof value.warnReason === "string" && value.warnReason)
  ) {
    errors.push(`${path}.warnReason`);
  }
  if (!value.warn && value.warnReason !== null)
    errors.push(`${path}.warnReason`);
  if (!Array.isArray(value.sources)) errors.push(`${path}.sources`);
};

if (typeof detail.resortId !== "string" || !detail.resortId) {
  errors.push("detail.resortId");
}
if (
  typeof detail.research?.date !== "string" ||
  typeof detail.research?.note !== "string"
) {
  errors.push("detail.research");
}

for (const category of categories) {
  const detailCategory = detail[category];
  for (const key of ["good", "bad", "courses"]) {
    if (!Array.isArray(detailCategory?.[key])) {
      errors.push(`detail.${category}.${key}`);
      continue;
    }
    detailCategory[key].forEach((value, index) => {
      validateWarning(value, `detail.${category}.${key}[${index}]`);
    });
  }

  const articleCategory = article[category];
  if (
    articleCategory?.score !== null &&
    !["◎", "○", "△"].includes(articleCategory?.score)
  ) {
    errors.push(`article.${category}.score`);
  }
  if (typeof articleCategory?.good !== "string") {
    errors.push(`article.${category}.good`);
  }
  if (typeof articleCategory?.bad !== "string") {
    errors.push(`article.${category}.bad`);
  }
  if (!Array.isArray(articleCategory?.courses)) {
    errors.push(`article.${category}.courses`);
  } else {
    articleCategory.courses.forEach((course, index) => {
      if (
        typeof course?.name !== "string" ||
        typeof course?.description !== "string"
      ) {
        errors.push(`article.${category}.courses[${index}]`);
      }
    });
  }
}

if (typeof article.full !== "string") errors.push("article.full");
if (typeof article.resortId !== "string" || !article.resortId) {
  errors.push("article.resortId");
}
if (detail.resortId !== article.resortId) {
  errors.push("detail.resortId !== article.resortId");
}

if (errors.length > 0) {
  throw new Error(`形式が不正です:\n${errors.join("\n")}`);
}

process.stdout.write("review JSON format: OK\n");
