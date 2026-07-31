/**
 * pageAssets.mjs
 *
 * 保存資料のうち、表示テキストだけでは足りない2点を補う。
 *
 * 1. 表のTSV化
 *    innerText が**復元不可能に壊す**のは表の行と列の対応だけである。
 *    実例（めがひら）: セル内の改行で
 *      9時間券  平日：6,300円
 *      土日：6,800円  4,300円
 *    のように、別の行・別の列の値が同じ行に見えてしまう。
 *    セル結合の解決は決定論的なコードの仕事なのでここで済ませる。
 *
 * 2. スクリーンショットのタイル分割
 *    モデルに渡す画像は長辺1568pxに縮小される。フルページは縦が数千pxに
 *    なるため（実測 1280x7785 → 329x2000）数字が判読できない。
 *    固定高さで分割すれば縮小がかからない。
 *
 *    DOM構造を一切見ないので、表・箇条書き・**バナー画像**・canvas・
 *    CSSで組まれたレイアウトに等しく効く。画像内の料金は visible-text.txt に
 *    現れないため（実例: めがひらのこどもデー ¥1,000 はテキストに0件）、
 *    タイルを見ること自体が取りこぼしの防止になる。
 */

/** タイルの高さ。1280px幅と合わせて長辺1568px未満に収める */
export const TILE_HEIGHT = 1400;
/** タイル境界で表の行が切れないよう重ねる高さ */
export const TILE_OVERLAP = 100;

/**
 * ページ内の全 <table> を rowspan/colspan 解決済みのグリッドにする。
 * page.evaluate() に渡してブラウザ内で実行する。
 */
export function extractTablesInPage() {
  const inlineText = (el) =>
    (el.innerText ?? el.textContent ?? "")
      .replace(/ /g, " ")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" / ")
      .replace(/\t/g, " ")
      .trim();

  /** 結合セルは占有する全マスに値を複製する（欠損を作らない） */
  const toGrid = (table) => {
    const grid = [];
    let merged = false;
    const put = (r, c, value) => {
      if (!grid[r]) grid[r] = [];
      grid[r][c] = value;
    };
    let rowIndex = 0;
    for (const tr of table.querySelectorAll("tr")) {
      let colIndex = 0;
      for (const cell of tr.children) {
        if (!/^(TD|TH)$/.test(cell.tagName)) continue;
        while (grid[rowIndex]?.[colIndex] !== undefined) colIndex++;
        const rowSpan = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);
        const colSpan = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
        if (rowSpan > 1 || colSpan > 1) merged = true;
        const value = inlineText(cell);
        for (let r = 0; r < rowSpan; r++) {
          for (let c = 0; c < colSpan; c++) put(rowIndex + r, colIndex + c, value);
        }
        colIndex += colSpan;
      }
      rowIndex++;
    }
    const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
    const rows = grid.map((row) => {
      const filled = [];
      for (let c = 0; c < columnCount; c++) filled.push(row[c] ?? "");
      return filled;
    });
    return { rows, columnCount, hasMergedCells: merged };
  };

  /** 何の表かを示す直前の見出し（誰の料金かの判定根拠になる） */
  const headingOf = (table) => {
    let node = table;
    for (let depth = 0; node && depth < 6; depth++) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          const text = inlineText(sibling);
          if (text) return text;
        }
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  };

  const results = [];
  for (const table of document.querySelectorAll("table")) {
    // 入れ子の表は外側の一部として既に含まれる
    if (table.parentElement?.closest("table")) continue;
    const { rows, columnCount, hasMergedCells } = toGrid(table);
    if (rows.length === 0 || columnCount === 0) continue;
    const caption = table.querySelector("caption");
    results.push({
      heading: headingOf(table),
      caption: caption ? inlineText(caption) : null,
      rows,
      rowCount: rows.length,
      columnCount,
      hasMergedCells,
    });
  }
  return results;
}

/** 表のTSVをMarkdownにまとめる */
export function renderTablesMarkdown(pageId, tables) {
  const lines = [`# 表: ${pageId}`, ""];
  if (tables.length === 0) {
    lines.push("このページに表はない。料金は visible-text.txt と");
    lines.push("screens/*.jpg（画像内の料金）で確認すること。");
    return `${lines.join("\n")}\n`;
  }
  lines.push("各表は rowspan / colspan を解決済みで、1セル=1値のTSVになっている。");
  lines.push("行と列の対応はここで確定しているので画像から読み直す必要はない。");
  lines.push("");
  for (const [i, table] of tables.entries()) {
    const id = `table-${String(i + 1).padStart(3, "0")}`;
    lines.push(`## ${id}${table.heading ? ` — ${table.heading}` : ""}`);
    const meta = [`${table.columnCount}列×${table.rowCount}行`];
    if (table.hasMergedCells) meta.push("セル結合あり（見出しを複製して展開）");
    if (table.caption) meta.push(`caption: ${table.caption}`);
    lines.push(meta.join(" / "));
    lines.push("");
    lines.push("```");
    lines.push(table.rows.map((row) => row.join("\t")).join("\n"));
    lines.push("```");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * JPEGのSOFマーカーから寸法を読む。
 * ページ高さの取得に scrollHeight を使うとレイアウト次第でビューポート高しか
 * 返らず（実測: 縦7785pxのページで900px）、タイルが1枚しか作られない。
 * 撮影済みフルページの実寸を使えばその取り違えが起きない。
 */
export function jpegSize(buffer) {
  let offset = 2; // SOI をスキップ
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0/1/2/3, SOF5-7, SOF9-11, SOF13-15（DHT/JPG/DACは除く）
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  throw new Error("JPEGの寸法を読めませんでした");
}

/** タイルの切り出し範囲を計算する */
export function tileRanges(pageHeight, tileHeight = TILE_HEIGHT, overlap = TILE_OVERLAP) {
  const ranges = [];
  const step = Math.max(1, tileHeight - overlap);
  for (let y = 0; y < pageHeight; y += step) {
    const height = Math.min(tileHeight, pageHeight - y);
    if (height <= 0) break;
    ranges.push({ y, height });
    if (y + height >= pageHeight) break;
  }
  return ranges;
}
