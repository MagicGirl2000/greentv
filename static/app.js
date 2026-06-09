// app.js — 绿太阳指数：全球/各洲/各国指数 + 洲国分组频道 + 断连沉底 + 1s K线
let chart, curId = "GREEN", curTf = 1, curName = "绿太阳综合指数（全球）";

function initChart() {
  chart = klinecharts.init("chart");
  chart.setStyles({
    grid: { horizontal: { color: "#1d2530" }, vertical: { color: "#1d2530" } },
    candle: {
      type: "candle_solid",
      bar: { upColor: "#2ebd6b", downColor: "#e54a4a", noChangeColor: "#e6e6e6",
             upBorderColor: "#2ebd6b", downBorderColor: "#e54a4a", noChangeBorderColor: "#e6e6e6",
             upWickColor: "#2ebd6b", downWickColor: "#e54a4a", noChangeWickColor: "#e6e6e6" },
      tooltip: { labels: ["时间:", "开:", "高:", "低:", "维度:", ""] },
      priceMark: { last: { upColor: "#2ebd6b", downColor: "#e54a4a", noChangeColor: "#e6e6e6" } },
    },
    xAxis: { axisLine: { color: "#2a3340" }, tickText: { color: "#8b97a6" } },
    yAxis: { axisLine: { color: "#2a3340" }, tickText: { color: "#8b97a6" } },
  });
}

const toK = cs => cs.map(k => ({ timestamp: k.t * 1000, open: k.o, high: k.h, low: k.l, close: k.c, volume: 0 }));
const esc = s => (s || "").replace(/'/g, "");

async function loadSeries() {
  try {
    const d = await (await fetch(`/api/series?id=${curId}&tf=${curTf}`)).json();
    chart.applyNewData(toK(d.candles));
    document.getElementById("curTitle").textContent = curName;
    if (d.candles.length) {
      const last = d.candles[d.candles.length - 1].c;
      const init = d.initial != null ? d.initial : last;
      const chg = (last - init).toFixed(2);
      const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#e6e6e6");
      document.getElementById("curMeta").innerHTML =
        `当前 <b style="color:${col}">${last.toFixed(2)}维</b> ｜ 初始 ${init.toFixed(2)} ｜ 涨跌 <b style="color:${col}">${chg > 0 ? "+" : ""}${chg}</b>`;
    }
  } catch (e) {}
}

function row(c) {
  const dim = c.dim != null ? c.dim : null;
  const init = c.initial != null ? c.initial : dim;
  const chg = (dim != null && init != null) ? (dim - init) : 0;
  const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#cfd6df");
  const sel = c.id === curId ? " sel" : "";
  const md = c.mode === "live" ? '<span class="live">直播</span>'
           : c.mode === "down" ? '<span class="down">断连</span>'
           : c.mode === "demo" ? '<span class="demo">演示</span>' : '<span class="pend">…</span>';
  return `<div class="chan${sel}" onclick="pick('${c.id}','${esc(c.name)}')">
    <div class="cn">${c.name} ${md}</div>
    <div class="cd" style="color:${col}">${dim != null ? dim.toFixed(1) : "--"}维
      <small>${dim != null ? (chg > 0 ? "+" : "") + chg.toFixed(1) : ""}</small></div>
    <div class="ct">${c.name_realm || ""} ${c.tip ? "· " + c.tip : ""}</div></div>`;
}

function idxRow(x, cls) {
  if (x.dim == null) return "";
  const init = x.initial != null ? x.initial : x.dim;
  const chg = (x.dim - init);
  const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#cfd6df");
  const sel = x.id === curId ? " sel" : "";
  return `<div class="idx ${cls}${sel}" onclick="pick('${x.id}','${esc(x.name)}')">
    <span class="in">${x.name}</span>
    <span class="iv" style="color:${col}">${x.dim.toFixed(2)} <small>${chg > 0 ? "+" : ""}${chg.toFixed(2)}</small></span>
    <span class="ic">${x.count != null ? x.count + "台" : ""}</span></div>`;
}

async function loadChannels() {
  try {
    const d = await (await fetch("/api/channels")).json();
    // 头部全球指数
    const g = d.green;
    if (g && g.dim != null) {
      const init = g.initial != null ? g.initial : g.dim;
      const chg = (g.dim - init).toFixed(2);
      const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#e6e6e6");
      document.getElementById("giVal").textContent = g.dim.toFixed(2);
      document.getElementById("giVal").style.color = col;
      const el = document.getElementById("giChg");
      el.textContent = `${chg > 0 ? "▲+" : (chg < 0 ? "▼" : "■")}${chg}（初始${init.toFixed(2)}）`;
      el.style.color = col;
      document.getElementById("giName").textContent =
        (g.name_realm || "") + (g.count ? ` ｜ 覆盖 ${g.count}/${d.total} 台` : "");
      document.getElementById("giTip").textContent = "💡 综合建议：" + (g.tip || "");
    }
    // 侧栏
    let html = '<div class="hd">📊 指数（点击看K线）</div>';
    html += idxRow(d.green, "g");
    for (const x of d.continents) html += idxRow(x, "t");
    html += '<div class="hd">🌍 各国指数</div>';
    for (const x of d.countries) html += idxRow(x, "c");
    // 频道：活跃(洲→国分组) + 断连沉底
    const active = d.channels.filter(c => c.mode !== "down");
    const down = d.channels.filter(c => c.mode === "down");
    html += `<div class="hd">📺 频道 · 共 ${d.total} 台</div>`;
    let lc = null, lcty = null;
    for (const c of active) {
      if (c.continent !== lc) { html += `<div class="cgroup">🌐 ${c.continent}</div>`; lc = c.continent; lcty = null; }
      if (c.country !== lcty) { html += `<div class="ctygroup">${c.country}</div>`; lcty = c.country; }
      html += row(c);
    }
    if (down.length) {
      html += `<div class="cgroup downhd">🔴 断连 ${down.length} 台（不计入指数）</div>`;
      for (const c of down) html += row(c);
    }
    document.getElementById("chanList").innerHTML = html;
  } catch (e) {}
}

function pick(id, name) { curId = id; curName = name; loadSeries(); loadChannels(); }

document.getElementById("tfs").addEventListener("click", e => {
  if (e.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#tfs button").forEach(b => b.classList.remove("on"));
  e.target.classList.add("on");
  curTf = parseInt(e.target.dataset.tf); loadSeries();
});

initChart();
loadChannels(); loadSeries();
setInterval(() => { loadChannels(); loadSeries(); }, 2000);
