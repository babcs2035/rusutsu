import * as d3 from "d3";

export function SnowDepths(
  resorts,
  skiResortsData,
  snowDepthsData,
  weeks,
  parentId,
  shouldCompare,
) {
  const container = d3
    .select(`#${parentId}`)
    .append("div")
    .attr("class", "snow-depths-container");

  resorts.forEach(async (name, index) => {
    const resortContainer = container
      .append("div")
      .attr("class", "resort-container-snow-depths")
      .style("margin-bottom", "20px")
      .style("display", "grid")
      .style("grid-template-columns", "200px auto");

    var h3 = resortContainer
      .append("h3")
      .attr("class", "skiResortData-name")
      .style("margin-bottom", "10px");

    if (shouldCompare) {
      // スキー場の名前を表示
      const resort = skiResortsData[index];
      const skiName = resort.name.ja;
      h3.text(skiName);
    } else {
      h3.text("平均積雪量");
    }

    // ヒートマップのコンテナ
    const heatmapContainer = resortContainer
      .append("div")
      .attr("class", `heatmap-container-${name.replace(/\s+/g, "_")}-snow-week`) //スキー場名の空白を_に置き換え
      .style("margin-bottom", "-30px")
      .attr("margin", 0)
      .attr("padding", 0);

    //週の値から月と週を取得
    const formattedWeeks = weeks.map(weekNumber => ({
      month: Math.floor((weekNumber - 1) / 4) + 1,
      week: ((weekNumber - 1) % 4) + 1,
      id: weekNumber,
    }));

    // グラフの大きさ、マージンを設定
    var margin = { top: 0, right: 25, bottom: 0, left: 25 };
    var width = 450 - margin.left - margin.right;
    var height = 105 - margin.top - margin.bottom;
    const showXAxis = index === resorts.length - 1;

    const center = height / 2;
    const snowDataMean = [];

    const skiData = snowDepthsData[index];
    const firstYear = skiData.firstYear;
    if (firstYear === 2023 || firstYear === 2024) {
      resortContainer.remove();
      return;
    }
    const snowData = skiData.data;

    const monthLengthList = [31, 28, 31, 30, 31];

    formattedWeeks.forEach(date => {
      var month = date.month;
      if (month === 12) month = 5;
      const snowDataList = [];
      const week = date.week;
      const id = date.id;
      // console.log("week", week)
      for (const [index, yearData] of snowData.entries()) {
        if ((index === 0) & (month !== 5)) {
          continue;
        }
        // console.log("yearData",yearData)
        // console.log("month", month)
        const data = yearData[month - 1];
        // console.log("data", data)
        const monthLength = monthLengthList[month - 1];
        for (let i = 7 * (week - 1); i < 7 * week; i++) {
          snowDataList.push(data[i]);
        }
        if (week === 4) {
          for (let i = 7 * week; i < monthLength; i++) {
            snowDataList.push(data[i]);
          }
        }
      }
      const sum = snowDataList.reduce(
        (accumulator, currentValue) => accumulator + currentValue,
        0,
      );
      const average = sum / snowDataList.length;

      snowDataMean.push({ id: id, value: Math.round(average) });
    });

    if (showXAxis) {
      margin.bottom = 100;
    }

    var svg = heatmapContainer
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Tooltip functions
    var mouseover = (_event, d) => {
      d3.selectAll(`[data-id='${d.id}']`)
        .style("stroke", "black")
        .each(function (d) {
          const elementClass = d3.select(this).attr("class");
          const parent = d3.select(`#${parentId}`);
          const bbox = this.getBoundingClientRect();
          const scrollTop =
            window.scrollY || document.documentElement.scrollTop; // 縦方向のスクロール量
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
            .style("font-size", "15px")
            .style("pointer-events", "none") // ツールチップのように操作を無効化
            .html(tooltipHtml); // 表示するテキスト
        });
    };
    var mousemove = () => {};
    var mouseleave = (_event, d) => {
      d3.selectAll(`[data-id='${d.id}']`).style("stroke", "none");

      d3.selectAll(".tooltip").remove();
    };

    const colorScale = d3
      .scaleLinear()
      .domain([0, 250])
      .range(["#fffaf0", "#006400"]);

    var x = d3.scaleBand().range([0, width]).domain(weeks).padding(0.05);

    if (showXAxis) {
      // X軸
      const xAxis = d3
        .axisBottom(x)
        .tickFormat((_d, i) => `${formattedWeeks[i].week}`) // 各週番号を表示
        .tickSize(0);
      svg
        .append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(xAxis)
        .attr("font-size", "18px")
        .select(".domain")
        .remove();

      const monthPositions = Array.from(
        new Set(formattedWeeks.map(d => d.month)),
      ) // 月のリスト
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
      .selectAll(".snow-depth-rect")
      .data(snowDataMean, d => d.id)
      .enter()
      .append("rect")
      .attr("class", "snow-depth-rect")
      .attr("x", d => x(d.id)) // 横方向の位置 (X軸スケール)
      .attr("y", center - 15) // 縦方向の固定位置（1行の場合）
      .attr("data-id", d => d.id)
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
  });
}
