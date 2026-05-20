import * as d3 from "d3";

// 全てのscrollContainerへの参照を保持する配列を定義
const scrollContainers = [];
let isSyncingScroll = false; // スクロールイベント相互反映中かを示すフラグ

export function weather(
  resorts,
  skiResortData,
  weatherData,
  parentId,
  shouldCompare,
) {
  const container = d3
    .select(`#${parentId}`)
    .append("div")
    .attr("class", "weather-container")
    .style("width", "100%");

  const sections = ["top", "mid", "bot"];

  const sectionDict = {
    top: { text: "山頂", height: 0 },
    mid: { text: "中腹", height: 0 },
    bot: { text: "山麓", height: 0 },
  };

  resorts.forEach(async (name, index) => {
    const resortContainer = container
      .append("div")
      .attr("class", "skiResortData-container-weather")
      .style("margin-bottom", "0px");
    // ドロップダウンとタイトル
    const dropdownGroup = resortContainer
      .append("div")
      .attr("class", "dropdown-group")
      .style("display", "flex")
      .style("flex-direction", "row")
      .style("align-items", "center")
      .style("gap", "5px");
    // スキー場名
    var h3 = dropdownGroup.append("h3").attr("class", "skiResortData-name");

    if (shouldCompare) {
      // スキー場の名前を表示
      const resort = skiResortData[index];
      const skiName = resort.name.ja;
      h3.style("width", "620px").text(skiName);
    }

    // ドロップダウンメニューの作成
    const dropdown = dropdownGroup
      .append("select")
      .attr("class", "skiResortData-dropdown")
      .style("width", "200px")
      .style("transition", "background-color 0.2s ease, border-color 0.2s ease")
      .on("change", function () {
        const selectedSection = d3.select(this).property("value");
        weatherDisplay(
          weatherData[index],
          name,
          selectedSection,
          fixedContainer,
          scrollContainer,
          false,
        );
      });

    sectionDict.top.height = skiResortData[index].courses.topElevation;
    sectionDict.bot.height = skiResortData[index].courses.baseElevation;
    sectionDict.mid.height = Math.round(
      (sectionDict.top.height + sectionDict.bot.height) / 2,
    );

    sections.forEach(section => {
      dropdown
        .append("option")
        .attr("value", section)
        .text(
          `${sectionDict[section].text} (標高${sectionDict[section].height}m)`,
        );
    });

    // デフォルトは "middle"
    dropdown.property("value", "mid");

    const mainContainer = resortContainer
      .append("div")
      .style("display", "flex")
      .style("overflow-x", "hidden");

    const fixedContainer = mainContainer
      .append("div")
      .attr("class", "fixed-container")
      .style("flex", "0 0 auto")
      .style("width", "40px")
      .style("position", "sticky")
      .style("left", "0")
      .style("z-index", "10");

    // 天気予報のコンテナ
    const scrollContainer = mainContainer
      .append("div")
      .attr("class", `weather-container-${name.replace(/\s+/g, "_")}`) //スキー場名の空白を_に置き換え
      .attr("margin", 0)
      .attr("padding", 0)
      .style("overflow-x", "auto") // 横スクロールを許可
      .style("white-space", "nowrap"); // 折り返し防止

    // scrollContainerを配列で管理
    scrollContainers.push(scrollContainer.node());
    // 他のスクロールコンテナと同期させるイベントリスナーを設定
    scrollContainer.on("scroll", function () {
      if (isSyncingScroll) return;
      isSyncingScroll = true;

      const scrollLeft = this.scrollLeft;
      scrollContainers.forEach(el => {
        if (el !== this) {
          el.scrollLeft = scrollLeft;
        }
      });
      isSyncingScroll = false;
    });

    weatherDisplay(
      weatherData[index],
      name,
      "mid",
      fixedContainer,
      scrollContainer,
      true,
    );
  });
}

function weatherDisplay(
  weatherData,
  _name,
  section,
  fixedContainer,
  scrollContainer,
  start,
) {
  if (!weatherData) {
    // console.log(`No weather data available for ${name}.`);
    fixedContainer.remove();
    scrollContainer.remove();
    return;
  }
  // 既存のSVG要素（以前のヒートマップ）を削除
  fixedContainer.select("svg").remove();
  scrollContainer.select("svg").remove();

  const skiResortData = weatherData;
  const winds = skiResortData[section].winds;
  const snows = skiResortData[section].snows;
  const temperatures = skiResortData[section].temperatures;
  const today = new Date(skiResortData.meta.date);
  const date = new Date(today);

  const _times = ["朝", "昼", "夜"];
  const days = ["日", "月", "火", "水", "木", "金", "土"];

  // SVGのサイズ
  const height = 190;
  const cellWidth = 40;
  const cellHeight = 50;
  const width = cellWidth * 36;

  // SVG要素の追加
  var svgFixed = fixedContainer
    .append("svg")
    .attr("width", cellWidth)
    .attr("height", height);
  var svgScroll = scrollContainer
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  if (start) {
    // 描画が終了した後、要素を取得
    const containerElement = scrollContainer.node();

    // requestAnimationFrameまたはsetTimeoutで実行遅延し、描画後に計算させる
    requestAnimationFrame(() => {
      containerElement.scrollLeft = containerElement.scrollWidth / 2;
    });
  }

  // グリッドレイアウト設定
  const _rows = 12; // 12日分
  const _cols = 3; // 朝, 昼, 夜

  // グリッド線を引く
  for (let i = 0; i <= 38; i++) {
    // 縦線
    if (i % 3 === 0) {
      svgScroll
        .append("line")
        .attr("x1", i * cellWidth)
        .attr("y1", 0)
        .attr("x2", i * cellWidth)
        .attr("y2", 40)
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1);

      const j = Math.floor(i / 3) - 6;
      date.setDate(today.getDate() + j);
      const day = date.getDate();
      const dayOfWeek = days[date.getDay()];

      svgScroll
        .append("text")
        .attr("x", (i + 1.5) * cellWidth)
        .attr("y", 20)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "17px")
        .text(`${day}(${dayOfWeek})`);

      svgScroll
        .append("text")
        .attr("x", (i + 0.5) * cellWidth)
        .attr("y", 45)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "17px")
        .text(`朝`);
    } else if (i % 3 === 1) {
      svgScroll
        .append("text")
        .attr("x", (i + 0.5) * cellWidth)
        .attr("y", 45)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "17px")
        .text(`昼`);
    } else {
      svgScroll
        .append("text")
        .attr("x", (i + 0.5) * cellWidth)
        .attr("y", 45)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "17px")
        .text(`夜`);
    }

    svgScroll
      .append("line")
      .attr("x1", i * cellWidth)
      .attr("y1", 25)
      .attr("x2", i * cellWidth)
      .attr("y2", height)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);
  }

  for (let j = 0; j <= 1; j++) {
    svgScroll
      .append("line")
      .attr("x1", 0)
      .attr("y1", j * 25)
      .attr("x2", width)
      .attr("y2", j * 25)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);
  }

  for (let j = 0; j <= 2; j++) {
    // 横線
    svgFixed
      .append("line")
      .attr("x1", 0)
      .attr("y1", j * cellHeight + 50)
      .attr("x2", width)
      .attr("y2", j * cellHeight + 50)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);
    // 横線
    svgScroll
      .append("line")
      .attr("x1", 0)
      .attr("y1", j * cellHeight + 50)
      .attr("x2", width)
      .attr("y2", j * cellHeight + 50)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);
  }

  const tempY = 190;
  svgFixed
    .append("line")
    .attr("x1", 0)
    .attr("y1", tempY)
    .attr("x2", width)
    .attr("y2", tempY)
    .attr("stroke", "#ccc")
    .attr("stroke-width", 1);
  svgScroll
    .append("line")
    .attr("x1", 0)
    .attr("y1", tempY)
    .attr("x2", width)
    .attr("y2", tempY)
    .attr("stroke", "#ccc")
    .attr("stroke-width", 1);

  svgFixed
    .append("text")
    .attr("x", 0.5 * cellWidth)
    .attr("y", tempY - 21)
    .attr("text-anchor", "middle") // 水平方向の中央揃え
    .attr("fill", "black") // テキストの色
    .attr("font-size", "16px")
    .text(`気温`);
  svgFixed
    .append("text")
    .attr("x", 0.5 * cellWidth)
    .attr("y", tempY - 4)
    .attr("text-anchor", "middle") // 水平方向の中央揃え
    .attr("fill", "black") // テキストの色
    .attr("font-size", "14px")
    .text(`℃`);

  winds.forEach((wind, i) => {
    // セルの座標
    const x = i * cellWidth;
    const y = 50;

    if (i === 1) {
      svgFixed
        .append("text")
        .attr("x", x - 0.5 * cellWidth)
        .attr("y", y + 24)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "16px")
        .text(`風`);
      svgFixed
        .append("text")
        .attr("x", x - 0.5 * cellWidth)
        .attr("y", y + 45)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "16px")
        .text(`m/s`);
    }

    const rotation = parseInt(wind.direction.match(/\d+/)[0], 10);
    const windSpeed = Math.ceil(wind.speed / 3.6);
    let color = "#ccc";
    let opacity = 0;
    if (windSpeed >= 15) {
      color = "#dc143c";
      opacity = 0.9;
    } else if (windSpeed >= 10) {
      color = "yellow";
      opacity = 0.9;
    } else if (windSpeed >= 6) {
      color = "#7cfc00";
      opacity = 0.9;
    }

    const arrowGroup = svgScroll
      .append("g")
      .attr(
        "transform",
        `translate(${x + cellWidth / 2}, ${y + cellHeight / 2})`,
      );
    // ○（円）を描画

    arrowGroup
      .append("rect")
      .attr("x", -cellWidth / 2 + 0.5)
      .attr("y", -cellHeight / 2 + 0.5)
      .attr("width", cellWidth - 1)
      .attr("height", cellHeight - 1) // 各マスの高さ
      .attr("fill", color) // 色を設定
      .attr("opacity", opacity); // 背景を少し透過
    arrowGroup
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 12) // 円の半径
      .attr("fill", "black"); // 円の背景色

    // 風速（数字）を表示
    arrowGroup
      .append("text")
      .attr("x", 0)
      .attr("y", 5.5) // 中央揃えのため微調整
      .attr("text-anchor", "middle") // 水平方向の中央揃え
      .attr("fill", "white") // テキストの色
      .attr("font-size", "15px")
      .text(windSpeed); // 風速を表示

    // 矢印（風向き）を描画
    arrowGroup
      .append("path")
      .attr(
        "d",
        "M 0 -10 L -3 -10 L -3 -14 L -8 -14 L 0 -20 L 8 -14 L 3 -14 L 3 -10 L 0 -10",
      ) // 矢印のパスデータ
      .attr("fill", "black")
      .attr("stroke", "black")
      .attr("stroke-width", 1)
      .attr("transform", `rotate(${rotation}, 0, 0)`);
  });

  snows.forEach((snow, i) => {
    const x = i * cellWidth;
    const snowDisplay = 4 * Math.sqrt(snow >= 35 ? 35 : snow);
    const y = 147 - snowDisplay;

    if (i === 1) {
      svgFixed
        .append("text")
        .attr("x", x - 0.5 * cellWidth)
        .attr("y", 122)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "16px")
        .text(`降雪`);
      svgFixed
        .append("text")
        .attr("x", x - 0.5 * cellWidth)
        .attr("y", 143)
        .attr("text-anchor", "middle") // 水平方向の中央揃え
        .attr("fill", "black") // テキストの色
        .attr("font-size", "15px")
        .text(`cm`);
    }

    svgScroll
      .append("rect")
      .attr("x", x + 3)
      .attr("y", y)
      .attr("width", cellWidth - 6)
      .attr("height", snowDisplay)
      .attr("fill", "hotpink");

    svgScroll
      .append("text")
      .attr("x", x + cellWidth / 2)
      .attr("y", y - 7)
      .attr("font-size", "18px")
      .attr("fill", "black")
      .attr("text-anchor", "middle")
      .text(`${snow}`);
  });
  temperatures.forEach((temperature, i) => {
    const x = i * cellWidth;
    const y = tempY;

    const colorScale = d3
      .scaleLinear()
      .domain([-12, 0, 12]) // ドメインを -12, 0, 12 に設定
      .range(["blue", "#fffaf0", "red"]);
    const color = colorScale(temperature);

    svgScroll
      .append("rect")
      .attr("x", x + 0.5)
      .attr("y", y - 39.5)
      .attr("width", cellWidth - 1)
      .attr("height", 39) // 各マスの高さ
      .attr("fill", color) // 色を設定
      .attr("opacity", 1.0);

    let textColor = "black";
    if (temperature <= -6 || temperature >= 6) {
      textColor = "white";
    }

    svgScroll
      .append("text")
      .attr("x", x + cellWidth / 2)
      .attr("y", y - 10)
      .attr("font-size", "19px")
      .attr("fill", textColor)
      .attr("text-anchor", "middle")
      .text(`${temperature}`);
  });
}
