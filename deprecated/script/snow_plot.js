import * as d3 from "d3";

export function snowPlot(name, snowDepthsData, parentId) {
  const container = d3
    .select(`#${parentId}`)
    .append("div")
    .attr("class", "dropdown-container-snow-depth-plot");

  var h3 = container
    .append("h3")
    .attr("class", "skiResortData-name")
    .style("width", "100px")
    .text("積雪の分布");

  const firstYear = snowDepthsData["firstYear"];
  // console.log("snowDepthData", snowDepthsData)
  const snowData = snowDepthsData["data"];

  const selectedDates = getDatesBetween(
    new Date(2024, 11, 1),
    new Date(2025, 3, 30),
  );

  const snowfallDataByDate = {};
  selectedDates.forEach(date => {
    const year = date.getFullYear();
    var month = date.getMonth(); // 1月は0, 2月は1, ... になる
    const day = date.getDate();

    const dateKey = `${month + 1}/${day}`;
    snowfallDataByDate[dateKey] = [];

    if (month == 11) month = 4; //snowDataは1,2,3,4,12月の積雪量が年ごとに格納されている

    for (let i = 0; i < year - firstYear; i++) {
      if (i == 0) {
        //firstYearでは12月からのみの記録を取る
        if (
          month == 4 &&
          snowData[i] &&
          snowData[i][month] &&
          day <= snowData[i][month].length
        ) {
          snowfallDataByDate[dateKey].push({
            snow: snowData[i][month][day - 1],
            year: i + firstYear,
          });
        }
      } else if (
        month <= 5 &&
        snowData[i] &&
        snowData[i][month] &&
        day <= snowData[i][month].length
      ) {
        snowfallDataByDate[dateKey].push({
          snow: snowData[i][month][day - 1],
          year: i + firstYear,
        });
      }
    }
  });

  const scrollContainer = container
    .append("div")
    .attr("class", `scroll-container`) //スキー場名の空白を_に置き換え
    .attr("margin", 0)
    .attr("padding", 0)
    .style("overflow-x", "auto") // 横スクロールを許可
    .style("white-space", "nowrap"); // 折り返し防止

  drawBoxPlot(snowfallDataByDate, createTooltip(container), scrollContainer);
}

const createTooltip = container => {
  const tooltip = container
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background", "white")
    .style("border", "1px solid black")
    .style("padding", "5px")
    .style("border-radius", "5px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  return tooltip;
};

function getDatesBetween(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

function drawBoxPlot(dataByDate, tooltip, scrollContainer) {
  scrollContainer.select("svg").remove();

  const margin = { top: 20, right: 40, bottom: 40, left: 40 };
  const width = 1300 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  // console.log("boxWidth", width)

  const svg = scrollContainer
    .append("svg")
    .attr("width", 1300)
    .attr("height", 400)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const dates = Object.keys(dataByDate);
  const x = d3
    .scaleBand()
    .range([0, width])
    .domain(dates)
    .paddingInner(0.3)
    .paddingOuter(0.2);

  const tickInterval = Math.ceil(dates.length / 20); // 10個程度のラベルを表示する
  const filteredDates = dates.filter((_, index) => index % tickInterval === 0);

  const xAxis = d3.axisBottom(x).tickValues(filteredDates);

  const y = d3
    .scaleLinear()
    .domain([
      0,
      d3.max(
        Object.values(dataByDate)
          .flat()
          .map(d => d.snow),
      ) + 10,
    ])
    .nice()
    .range([height, 0]);

  const yGrid = d3
    .axisLeft(y)
    .tickSize(-width) // グリッド線の長さを指定（グラフ全体の幅）
    .tickFormat("");

  svg.append("g").attr("transform", `translate(0,${height})`).call(xAxis);

  svg
    .append("g")
    .attr("transform", `translate(${width}, 0)`)
    .call(d3.axisRight(y));

  svg.append("g").call(d3.axisLeft(y));

  // グリッド線をまず追加する
  svg.append("g").attr("class", "y-grid").call(yGrid);

  const boxWidth = x.bandwidth();
  dates.forEach(date => {
    const snowData = dataByDate[date].map(d => d.snow);
    const min = d3.min(snowData);
    const max = d3.max(snowData);
    const minYear = dataByDate[date]
      .filter(d => d.snow === min)
      .map(d => d.year);
    const maxYear = dataByDate[date]
      .filter(d => d.snow === max)
      .map(d => d.year);

    const boxData = snowData.sort(d3.ascending);
    if (boxData.length === 0) return; // Skip if no data

    const q1 = d3.quantile(boxData, 0.25);
    const median = d3.quantile(boxData, 0.5);
    const q3 = d3.quantile(boxData, 0.75);

    // 次に、箱ひげ図を描画する
    svg
      .append("line")
      .attr("x1", x(date) + boxWidth / 2)
      .attr("x2", x(date) + boxWidth / 2)
      .attr("y1", y(min))
      .attr("y2", y(q1))
      .attr("stroke", "black");

    svg
      .append("line")
      .attr("x1", x(date) + boxWidth / 2)
      .attr("x2", x(date) + boxWidth / 2)
      .attr("y1", y(max))
      .attr("y2", y(q3))
      .attr("stroke", "black")
      .attr("stroke-width", 1);

    svg
      .append("rect")
      .attr("x", x(date))
      .attr("y", y(q3))
      .attr("height", y(q1) - y(q3))
      .attr("width", boxWidth)
      .attr("stroke", "transparent")
      .style("fill", "#66cdaa")
      .style("opacity", 0.95);

    svg
      .append("line")
      .attr("x1", x(date))
      .attr("x2", x(date) + boxWidth)
      .attr("y1", y(median))
      .attr("y2", y(median))
      .attr("stroke", "black")
      .attr("stroke-width", 2);

    // 最小値にホバー表示用の円を追加（青色）
    svg
      .append("circle")
      .attr("cx", x(date) + boxWidth / 2) // X位置はボックスの中心に設定
      .attr("cy", y(min))
      .attr("r", 4) // 半径を設定
      .style("fill", "rgb(70, 70, 255)") // 最小値を強調する色
      .attr("stroke", "transparent");
    //   .on("mouseover", function (event) {
    //     tooltip
    //       .style("opacity", 1)
    //       .html(`最小値<br>${min}cm (${minYear.join(", ")}年)`);
    //   })
    //   .on("mousemove", function (event) {
    //     tooltip
    //       .style("left", event.pageX + 10 + "px")
    //       .style("top", event.pageY + 10 + "px");
    //   })
    //   .on("mouseout", function () {
    //     tooltip.style("opacity", 0);
    //   });

    // 最大値にホバー表示用の円を追加（赤色）
    svg
      .append("circle")
      .attr("cx", x(date) + boxWidth / 2) // X位置はボックスの中心に設定
      .attr("cy", y(max))
      .attr("r", 4) // 半径を設定
      .style("fill", "rgb(255, 70, 70)") // 最大値を強調する色
      .attr("stroke", "transparent");
    //   .on("mouseover", function (event) {
    //     tooltip
    //       .style("opacity", 1)
    //       .html(`最大値<br>${max}cm (${maxYear.join(", ")}年)`);
    //   })
    //   .on("mousemove", function (event) {
    //     tooltip
    //       .style("left", event.pageX + 10 + "px")
    //       .style("top", event.pageY + 10 + "px");
    //   })
    //   .on("mouseout", function () {
    //     tooltip.style("opacity", 0);
    //   });
  });
}
