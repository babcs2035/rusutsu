import * as d3 from "d3";

// ドロップダウン付きの分布図描画関数
// resorts: スキー場名の配列
// weeks: 表示したい週のリスト (例: [1,2,3,4,5, ...])
export async function drawDistribution(
  name,
  skiResortData,
  weeks,
  parentId,
  forecastsData,
) {
  const container = d3
    .select(`#${parentId}`)
    .append("div")
    .attr("class", "dropdown-container-temp-plot");

  const sections = ["top", "middle", "bottom"];
  const sectionDict = {
    top: { text: "山頂", height: 0 },
    middle: { text: "中腹", height: 0 },
    bottom: { text: "山麓", height: 0 },
  };

  // const file = `${basePath}Forecasts.json`;

  const resortContainer = container
    .append("div")
    .attr("class", "skiResortData-container-temp-plot")
    .style("margin-bottom", "20px");

  // ドロップダウンとタイトル
  const dropdownGroup = resortContainer
    .append("div")
    .attr("class", "dropdown-group")
    .style("display", "flex")
    .style("flex-direction", "row")
    .style("align-items", "center")
    .style("gap", "5px");

  // スキー場名
  dropdownGroup
    .append("h3")
    .attr("class", "skiResortData-name")
    .style("width", "100px")
    .text("気温の分布");

  // await d3.json(file).then((data) => {
  // 	const skiResortData = data.find((entry) => entry.meta.id === name);
  // 	const skiName = skiResortData.meta.name.ja;
  // 	h3.text(skiName);
  // });

  // ドロップダウンメニューの作成
  const dropdown = dropdownGroup
    .append("select")
    .attr("class", "skiResortData-dropdown")
    .style("width", "200px")
    .style("transition", "background-color 0.2s ease, border-color 0.2s ease")
    .on("change", function () {
      const selectedSection = d3.select(this).property("value");
      temperatureDistribution(
        forecastsData,
        name,
        weeks,
        selectedSection,
        chartContainer,
      );
    });

  sectionDict.top.height = skiResortData.courses.topElevation;
  sectionDict.bottom.height = skiResortData.courses.baseElevation;
  sectionDict.middle.height = Math.round(
    (sectionDict.top.height + sectionDict.bottom.height) / 2,
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
  dropdown.property("value", "middle");

  const chartContainer = resortContainer
    .append("div")
    .attr("class", `chart-container-${name.replace(/\s+/g, "_")}`);

  // 初期描画
  temperatureDistribution(forecastsData, name, weeks, "middle", chartContainer);
}

function temperatureDistribution(
  forecastsData,
  name,
  weeks,
  section,
  container,
) {
  // 以前のSVGを削除
  container.select("svg").remove();

  //週の値から月と週を取得
  const formattedWeeks = weeks.map(weekNumber => ({
    month: Math.floor((weekNumber - 1) / 4) + 1,
    week: ((weekNumber - 1) % 4) + 1,
    id: weekNumber,
  }));

  // グラフ領域設定
  const margin = { top: 20, right: 30, bottom: 100, left: 50 };
  const width = 600 - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  // JSON読み込み
  // d3.json(jsonFile).then((jsonData) => {
  const skiResortData = forecastsData.find(entry => entry.meta.id === name);

  const values = skiResortData[section].temperatures.weeks.max;

  //weeksに該当する要素のみ抽出
  var filteredData = [];
  weeks.forEach(key => {
    values[key - 1].forEach(value => {
      filteredData.push({ week: key, value: value });
    });
  });

  // pointCountsを計算（同一week-value組み合わせの頻度）
  const pointCounts = {};
  filteredData.forEach(d => {
    const key = `${d.week}-${d.value}`;
    pointCounts[key] = (pointCounts[key] || 0) + 1;
  });

  // SVG設定
  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  var x = d3.scaleBand().range([0, width]).domain(weeks).padding(0.05);

  const y = d3
    .scaleLinear()
    .domain([
      d3.min(filteredData, d => d.value) - 5,
      d3.max(filteredData, d => d.value) + 5,
    ])
    .range([height, 0]);

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

  svg.append("g").call(d3.axisLeft(y));

  svg
    .selectAll(".dot")
    .data(filteredData)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.week) + x.bandwidth() / 2)
    .attr("cy", d => y(d.value))
    .attr("r", d => {
      const count = pointCounts[`${d.week}-${d.value}`] || 0; // pointCountsがundefinedの場合は0
      return count > 0 ? 1.5 * Math.log(count + 2) : 0;
    })
    .attr("fill", d => (d.value >= 0 ? "rgb(255, 70, 70)" : "rgb(70, 70, 255)"))
    .style("opacity", 0.8);

  //x軸の描画
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

  // **月の境界線を計算**
  const monthBoundaries = formattedWeeks
    .filter((week, i, arr) => i > 0 && week.month !== arr[i - 1].month) // 境界を特定
    .map(week => x(week.id)); // 境界位置を取得

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
