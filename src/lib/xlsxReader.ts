import { inflateRawSync } from "node:zlib";

/**
 * xlsx から表を読むための最小限の実装。
 *
 * スキー場ごとの基本情報は Excel で管理されていて、それを表示のたびに読む。
 * 中間の JSON を挟むと更新のたびに変換を忘れる余地が生まれるので、
 * 直接読む。xlsx は XML を固めた ZIP なので、必要なところだけ取り出す。
 */

type ZipEntries = Map<string, Buffer>;

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;

/** ZIP の末尾にある目次（End Of Central Directory）を後ろから探す */
const findEndOfCentralDirectory = (buffer: Buffer): number => {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  return -1;
};

export const readZipEntries = (buffer: Buffer): ZipEntries => {
  const entries: ZipEntries = new Map();
  const endOffset = findEndOfCentralDirectory(buffer);
  if (endOffset < 0) return entries;

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) break;

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // ローカルヘッダ側の可変長は中央目次と違うことがあるので読み直す
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    try {
      entries.set(
        name,
        compressionMethod === 0 ? Buffer.from(raw) : inflateRawSync(raw),
      );
    } catch {
      // 読めない項目は飛ばす。必要なシートさえ取れればよい
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

const decodeXmlText = (text: string) =>
  text
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-fA-F]+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/gu, "&");

/** <si> ごとに <t> を連ねたものが 1 つの文字列 */
const parseSharedStrings = (xml: string): string[] =>
  [...xml.matchAll(/<si>([\s\S]*?)<\/si>/gu)].map(match =>
    [...(match[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)]
      .map(part => decodeXmlText(part[1] ?? ""))
      .join(""),
  );

/** "B12" → 1（0 始まりの列番号） */
export const parseColumnIndex = (reference: string): number => {
  const letters = reference.match(/^[A-Z]+/u)?.[0] ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
};

const parseSheetRows = (xml: string, sharedStrings: string[]): string[][] => {
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/gu)) {
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(
      /<c\s([^>]*)\/>|<c\s([^>]*)>([\s\S]*?)<\/c>/gu,
    )) {
      const attributes = cellMatch[1] ?? cellMatch[2] ?? "";
      const body = cellMatch[3] ?? "";
      const reference = attributes.match(/r="([A-Z]+\d+)"/u)?.[1];
      if (!reference) continue;

      const type = attributes.match(/t="([^"]+)"/u)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)]
          .map(part => decodeXmlText(part[1] ?? ""))
          .join("");
      } else {
        const raw = body.match(/<v>([\s\S]*?)<\/v>/u)?.[1] ?? "";
        value =
          type === "s"
            ? (sharedStrings[Number(raw)] ?? "")
            : decodeXmlText(raw);
      }

      const columnIndex = parseColumnIndex(reference);
      while (cells.length < columnIndex) cells.push("");
      cells[columnIndex] = value;
    }
    rows.push(cells);
  }

  return rows;
};

export type SheetRow = Record<string, string>;

/**
 * 1 行目を見出しとして、シートごとに { 見出し: 値 } の配列で返す。
 * 見出しが空の列と、値が全部空の行は落とす。
 */
export const readXlsxSheets = (buffer: Buffer): Map<string, SheetRow[]> => {
  const entries = readZipEntries(buffer);
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const sharedStrings = parseSharedStrings(
    entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "",
  );

  const sheetNames = [
    ...workbookXml.matchAll(/<sheet\s[^>]*name="([^"]*)"[^>]*\/>/gu),
  ].map(match => decodeXmlText(match[1] ?? ""));

  const sheets = new Map<string, SheetRow[]>();
  sheetNames.forEach((sheetName, index) => {
    const xml = entries
      .get(`xl/worksheets/sheet${index + 1}.xml`)
      ?.toString("utf8");
    if (!xml) return;

    const [headerRow, ...bodyRows] = parseSheetRows(xml, sharedStrings);
    if (!headerRow) return;

    const rows = bodyRows
      .map(cells => {
        const row: SheetRow = {};
        headerRow.forEach((header, columnIndex) => {
          if (!header) return;
          row[header] = cells[columnIndex] ?? "";
        });
        return row;
      })
      .filter(row => Object.values(row).some(value => value !== ""));

    sheets.set(sheetName, rows);
  });

  return sheets;
};
