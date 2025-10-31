import * as d3 from "d3";

// ドロップダウンの生成とイベントリスナーの追加
export async function snowDaysPerWeek(
  resorts,
  skiResortData,
  weeks,
  parentId,
  shouldCompare,
  forecastsData,
) {
  const container = d3
    .select(`#${parentId}`)
    .append("div")
    .attr("class", "dropdown-container-snow-week");

  const sections = ["top", "middle", "bottom"];

  // const file = `${basePath}Forecasts.json`;

  const sectionDict = {
    top: { text: "山頂", height: 0 },
    middle: { text: "中腹", height: 0 },
    bottom: { text: "山麓", height: 0 },
  };

  // const data = await d3.json(file);
  const validResorts = resorts.filter(name => {
    const resortEntry = forecastsData.find(entry => entry.meta.id === name);
    return resortEntry !== undefined; // データがあるもののみ残す
  });

  validResorts.forEach(async (name, index) => {
    const resortContainer = container
      .append("div")
      .attr("class", "skiResortData-container-snow-week")
      .style("margin-bottom", "0px")
      .style("display", "grid")
      .style("grid-template-columns", "200px auto");
    //スキー場名とドロップダウンの列幅: 200px, ヒートマップの列幅: Auto

    // 名前とドロップダウンを縦に並べるコンテナ
    const dropdownGroup = resortContainer
      .append("div")
      .attr("class", "dropdown-group")
      .style("display", "flex")
      .style("flex-direction", "column")
      .style("gap", "0px");

    // スキー場の名前を表示
    var h3 = dropdownGroup
      .append("h3")
      .attr("class", "skiResortData-name")
      .style("margin-bottom", "10px");

    var showXAxis = false;
    if (shouldCompare) {
      const skiResortData = forecastsData.find(entry => entry.meta.id === name);
      const skiName = skiResortData.meta.name.ja;
      h3.text(skiName);
      showXAxis = index === validResorts.length - 1;
    } else {
      h3.text("降雪量5cm以上の日数");
      showXAxis = false;
    }

    // ヒートマップのコンテナ
    const heatmapContainer = resortContainer
      .append("div")
      .attr("class", `heatmap-container-${name.replace(/\s+/g, "_")}-snow-week`) //スキー場名の空白を_に置き換え
      .style("margin-top", "-4px")
      .style("margin-bottom", "-15px")
      .attr("margin", 0)
      .attr("padding", 0);

    // ドロップダウンメニューの作成
    const dropdown = dropdownGroup
      .append("select")
      .attr("class", "skiResortData-dropdown")
      .style("width", "100%")
      .style("transition", "background-color 0.2s ease, border-color 0.2s ease")
      .on("change", function () {
        // 選択された値を取得
        const selectedSection = d3.select(this).property("value");

        // ヒートマップを更新
        snowFallWeekHeatmap(
          forecastsData,
          name,
          weeks,
          selectedSection,
          showXAxis,
          initialDropdownHeight,
          heatmapContainer,
          parentId,
          shouldCompare,
        );
      });

    sectionDict.top.height = skiResortData[index].courses.topElevation;
    sectionDict.bottom.height = skiResortData[index].courses.baseElevation;
    sectionDict.middle.height = Math.round(
      (sectionDict.top.height + sectionDict.bottom.height) / 2,
    );

    sections.forEach(section => {
      dropdown
        .append("option")
        .attr("value", section)
        .text(
          `${sectionDict[section]["text"]} (標高${sectionDict[section]["height"]}m)`,
        );
    });

    // デフォルト選択とヒートマップの初期描画
    dropdown.property("value", "middle");
    const initialDropdownHeight = 107;

    snowFallWeekHeatmap(
      forecastsData,
      name,
      weeks,
      "middle",
      showXAxis,
      initialDropdownHeight,
      heatmapContainer,
      parentId,
      shouldCompare,
    );
  });
}

function snowFallWeekHeatmap(
  forecastsData,
  name,
  weeks,
  section,
  showXAxis,
  dropdownHeight,
  container,
  parentId,
  shouldCompare,
) {
  // 既存のSVG要素（以前のヒートマップ）を削除
  container.select("svg").remove();

  // グラフの大きさ、マージンを設定
  var margin = { top: 0, right: 25, bottom: 0, left: 25 };
  var width = 450 - margin.left - margin.right;
  var height = dropdownHeight - margin.top - margin.bottom;

  const center = height / 2;

  //週の値から月と週を取得
  const formattedWeeks = weeks.map(weekNumber => ({
    month: Math.floor((weekNumber - 1) / 4) + 1,
    week: ((weekNumber - 1) % 4) + 1,
    id: weekNumber,
  }));

  if (showXAxis) {
    margin.bottom = 100;
  }

  // SVG要素の追加
  var svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  // Tooltip functions
  var mouseover = function (event, d) {
    d3.selectAll(`[data-id='${d.id}']`)
      .style("stroke", "black")
      .each(function (d) {
        const elementClass = d3.select(this).attr("class");
        const parent = d3.select(`#${parentId}`); // divをbodyに追加する
        const bbox = this.getBoundingClientRect();
        // console.log("bbox", bbox);
        const scrollTop = window.scrollY || document.documentElement.scrollTop; //縦方向のスクロール量
        const scrollLeft =
          window.scrollX || document.documentElement.scrollLeft; // 横方向のスクロール量
        const parentBbox = document
          .getElementById(parentId)
          .getBoundingClientRect();
        let tooltipHtml;
        if (elementClass.includes("snow-week-rect")) {
          tooltipHtml = `
                        ${formattedWeeks.find(week => week.id === d.id)?.month}月
                        ${formattedWeeks.find(week => week.id === d.id)?.week}週目 
                        <b>${((d.value * 7) / 100).toFixed(1)}日</b>
                    `;
        } else if (elementClass.includes("temperature-rect")) {
          tooltipHtml = `
                        ${formattedWeeks.find(week => week.id === d.id)?.month}月
                        ${formattedWeeks.find(week => week.id === d.id)?.week}週目 
                        <b>${d.value}℃</b>
                    `;
        } else if (elementClass.includes("snow-depth-rect")) {
          tooltipHtml = `
						${formattedWeeks.find(week => week.id === d.id)?.month}月
						${formattedWeeks.find(week => week.id === d.id)?.week}週目 
						<b>${d.value}cm</b>
					`;
        }
        var top = bbox.top + scrollTop - parentBbox.top - 35;
        var left = bbox.right + scrollLeft - parentBbox.left - 70;
        if (shouldCompare) {
          top += 305;
          left += 80;
        }
        parent
          .append("div")
          .attr("class", "tooltip")
          .style("position", "absolute")
          .style("top", `${top}px`) // 選択した要素の右上
          .style("left", `${left}px`)
          .style("background-color", "lightgrey")
          .style("padding", "5px")
          .style("border-radius", "5px")
          .style("pointer-events", "none") // ツールチップのように操作を無効化
          .html(tooltipHtml); // 表示するテキスト
      });
  };
  var mousemove = function () {};

  var mouseleave = function (event, d) {
    d3.selectAll(`[data-id='${d.id}']`).style("stroke", "none");

    d3.selectAll(".tooltip").remove();
  };

  // Read the data
  const skiResortData = forecastsData.find(entry => entry.meta.id === name);

  const colorScale = d3
    .scaleLinear()
    .domain([0, 100])
    .range(["#fffaf0", "#4b0082"]);

  const weatherData = skiResortData[section]["snowfalls"][
    "significantSnowfall"
  ].map((value, index) => ({
    id: index + 1, // 1から始まるID
    value: value, // 元のデータ
  }));

  const filteredData = weatherData
    .filter(data => weeks.includes(data.id))
    .sort((a, b) => weeks.indexOf(a.id) - weeks.indexOf(b.id));

  var x = d3.scaleBand().range([0, width]).domain(weeks).padding(0.05);

  if (showXAxis) {
    // X軸
    const xAxis = d3
      .axisBottom(x)
      .tickFormat((d, i) => `${formattedWeeks[i].week}`) // 各週番号を表示
      .tickSize(0);
    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(xAxis)
      .attr("font-size", "18px")
      .select(".domain")
      .remove();

    const monthPositions = Array.from(new Set(formattedWeeks.map(d => d.month))) // 月のリスト
      .map(month => {
        const monthWeeks = formattedWeeks.filter(d => d.month === month);
        const firstWeek = monthWeeks[0].id; // 月の最初の週
        const lastWeek = monthWeeks[monthWeeks.length - 1].id; // 月の最後の週
        return {
          month: month,
          position: (x(firstWeek) + x(lastWeek) + x.bandwidth()) / 2, // 中央の位置
        };
      });

    // 週の枠を描画
    svg
      .selectAll(".week-box")
      .data(formattedWeeks)
      .enter()
      .append("rect")
      .attr("class", "week-box")
      .attr("x", d => x(d.id)) // 各週のx位置
      .attr("y", height) // 枠のY位置
      .attr("width", x.bandwidth()) // 各週の幅
      .attr("height", 20) // 枠の高さ
      .attr("fill", "none") // 中を透明にする
      .attr("stroke", "black") // 枠線を黒に設定
      .attr("stroke-width", 0.5); // 枠線の幅

    // 月ラベルを描画
    svg
      .selectAll(".month-label")
      .data(monthPositions)
      .enter()
      .append("text")
      .attr("class", "month-label")
      .attr("x", d => d.position)
      .attr("y", height + 40) // X軸下に表示
      .attr("text-anchor", "middle")
      .text(d => d.month)
      .attr("font-size", "20px");

    // 月ラベルを四角で囲む
    svg
      .selectAll(".month-box")
      .data(monthPositions)
      .enter()
      .append("rect")
      .attr("class", "month-box")
      .attr("x", d => {
        const monthWeeks = formattedWeeks.filter(f => f.month === d.month);
        const firstWeek = monthWeeks[0].id; // 月の最初の週
        return x(firstWeek); // 最初の週の位置
      })
      .attr("y", height + 20) // 枠のY位置
      .attr("width", d => {
        const monthWeeks = formattedWeeks.filter(f => f.month === d.month);
        const firstWeek = monthWeeks[0].id;
        const lastWeek = monthWeeks[monthWeeks.length - 1].id;
        return x(lastWeek) + x.bandwidth() - x(firstWeek); // 月全体の幅
      })
      .attr("height", 25) // 枠の高さ
      .attr("fill", "none") // 中を透明にする
      .attr("stroke", "black") // 枠線を青に設定
      .attr("stroke-width", 0.5); // 枠線の幅
  }

  // **月の境界線を計算**
  const monthBoundaries = formattedWeeks
    .filter((week, i, arr) => i > 0 && week.month !== arr[i - 1].month) // 境界を特定
    .map(week => x(week.id)); // 境界位置を取得

  svg
    .selectAll(".snow-week-rect")
    .data(filteredData, function (d) {
      return d.id;
    })
    .enter()
    .append("rect")
    .attr("class", "snow-week-rect")
    .attr("x", d => x(d.id)) // 横方向の位置 (X軸スケール)
    .attr("y", center - 15) // 縦方向の固定位置（1行の場合）
    .attr("data-id", function (d) {
      return d.id;
    })
    .attr("width", x.bandwidth()) // 矩形の幅 (X軸のバンド幅)
    .attr("height", 30) // 矩形の高さ（例: 50px）
    .attr("fill", d => colorScale(d.value)) // 値に基づいて色を設定
    .style("stroke-width", 2)
    .style("stroke", "none")
    .on("mouseover", mouseover)
    .on("mousemove", mousemove)
    .on("mouseleave", mouseleave);

  // **月の境界に線を描画**
  svg
    .selectAll(".month-boundary")
    .data(monthBoundaries)
    .enter()
    .append("line")
    .attr("class", "month-boundary")
    .attr("x1", d => d - 0.5)
    .attr("x2", d => d - 0.5)
    .attr("y1", 0)
    .attr("y2", height) // X軸を含める場合
    .attr("stroke", "black")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "null"); // 破線
  // });
}
