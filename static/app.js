// app.js — 绿太阳指数：全球/各洲/各国指数 + 洲国分组频道 + 断连沉底 + 1s K线
let chart, curId = "GREEN", curTf = 60, curName = "绿太阳综合指数（全球）";  // 默认1分(采样15~18s，1秒周期会全是平白烛)

// 时间段(tf秒)→中文标签
const TF_LABEL = {
  1: "1秒", 10: "10秒", 30: "30秒", 60: "1分钟", 300: "5分钟", 900: "15分钟",
  3600: "1小时", 7200: "2小时", 10800: "3小时", 14400: "4小时", 43200: "12小时",
  86400: "1天", 259200: "3天", 604800: "1周", 1296000: "15天",
  2592000: "月线", 31536000: "年线",
};
const tfLabel = tf => TF_LABEL[tf] || (tf + "秒");
const pad2 = n => String(n).padStart(2, "0");
function fmtTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// 自定义常显 tooltip：时间段 / 开 / 最高维 / 最低维 / 收 / 涨跌 / 涨跌% / 振幅
function candleTooltip(data) {
  const k = data && data.current;
  if (!k || k.close == null) return [];
  const o = k.open, h = k.high, l = k.low, c = k.close;
  const chg = c - o, pct = o ? (chg / o * 100) : 0, amp = h - l;
  const GRN = "#2ebd6b", RED = "#e54a4a", GRY = "#cfd6df";
  const col = chg > 0 ? GRN : (chg < 0 ? RED : GRY);
  const t0 = k.timestamp, t1 = t0 + curTf * 1000;
  const sign = x => (x > 0 ? "+" : "");
  return [
    { title: "时间段", value: tfLabel(curTf) },
    { title: "起始", value: fmtTime(t0) },
    { title: "结束", value: fmtTime(t1) },
    { title: "开盘维", value: o.toFixed(2) },
    { title: "最高维", value: { text: h.toFixed(2), color: GRN } },
    { title: "最低维", value: { text: l.toFixed(2), color: RED } },
    { title: "收盘维", value: { text: c.toFixed(2), color: col } },
    { title: "涨跌", value: { text: sign(chg) + chg.toFixed(2) + " 维", color: col } },
    { title: "涨跌幅", value: { text: sign(pct) + pct.toFixed(2) + "%", color: col } },
    { title: "振幅", value: amp.toFixed(2) + " 维" },
  ];
}

function initChart() {
  chart = klinecharts.init("chart");
  chart.setStyles({
    grid: { horizontal: { color: "#1d2530" }, vertical: { color: "#1d2530" } },
    candle: {
      type: "candle_solid",
      bar: { upColor: "#2ebd6b", downColor: "#e54a4a", noChangeColor: "#e6e6e6",
             upBorderColor: "#2ebd6b", downBorderColor: "#e54a4a", noChangeBorderColor: "#e6e6e6",
             upWickColor: "#2ebd6b", downWickColor: "#e54a4a", noChangeWickColor: "#e6e6e6" },
      tooltip: { showRule: "always", showType: "standard", custom: candleTooltip },
      priceMark: { last: { upColor: "#2ebd6b", downColor: "#e54a4a", noChangeColor: "#e6e6e6" } },
    },
    xAxis: { axisLine: { color: "#2a3340" }, tickText: { color: "#8b97a6" } },
    yAxis: { axisLine: { color: "#2a3340" }, tickText: { color: "#8b97a6" } },
  });
  // 响应式：尺寸/横竖屏变化时让 K 线图重新适配容器
  let _rzt; window.addEventListener("resize", () => { clearTimeout(_rzt); _rzt = setTimeout(() => { try { chart && chart.resize && chart.resize(); } catch (e) {} }, 150); });
}

const toK = cs => cs.map(k => ({ timestamp: k.t * 1000, open: k.o, high: k.h, low: k.l, close: k.c, volume: 0 }));
const esc = s => (s || "").replace(/['"]/g, "");

let _seriesKey = "";          // 当前已加载的 series|tf，用于判断是否需要整图重置
async function loadSeries(reset = false) {
  try {
    const key = `${curId}|${curTf}`;
    const switched = key !== _seriesKey;        // 切了频道或周期 → 整图重置
    const d = await (await fetch(`/api/series?id=${curId}&tf=${curTf}`)).json();
    const ks = toK(d.candles);
    if (reset || switched || ks.length < 2) {
      chart.applyNewData(ks);                   // 切换：整图重置到该周期
      chart.scrollToRealTime && chart.scrollToRealTime();
      _seriesKey = key;
    } else if (ks.length) {
      chart.updateData(ks[ks.length - 1]);      // 刷新：只更新最后一根，不跳图
    }
    document.getElementById("curTitle").textContent = curName;
    updateTokenPanel();
    updateRealmIntro(d.candles && d.candles.length ? d.candles[d.candles.length - 1].c : null);
    if (d.candles.length) {
      const last = d.candles[d.candles.length - 1].c;
      const init = d.initial != null ? d.initial : last;
      const chg = (last - init).toFixed(2);
      const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#e6e6e6");
      document.getElementById("curMeta").innerHTML =
        `${t("now")} <b style="color:${col}">${last.toFixed(2)}${t("dim")}</b> ｜ ${t("init")} ${init.toFixed(2)} ｜ ${t("chg")} <b style="color:${col}">${chg > 0 ? "+" : ""}${chg}</b>`;
    }
  } catch (e) {}
}

function row(c) {
  const dim = c.dim != null ? c.dim : null;
  const init = c.initial != null ? c.initial : dim;
  const chg = (dim != null && init != null) ? (dim - init) : 0;
  const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#cfd6df");
  const sel = c.id === curId ? " sel" : "";
  const md = c.mode === "live" ? `<span class="live">${t("live")}</span>`
           : c.mode === "down" ? `<span class="down">${t("down")}</span>`
           : c.mode === "demo" ? `<span class="demo">${t("demo")}</span>` : '<span class="pend">…</span>';
  return `<div class="chan${sel}" data-id="${c.id}" data-name="${esc(c.name)}">
    <div class="cn">${c.name} ${md} <span data-tv="${c.id}" data-tvname="${esc(c.name)}" title="看电视" style="cursor:pointer;margin-left:3px">📺</span></div>
    <div class="cd" style="color:${col}">${dim != null ? dim.toFixed(1) : "--"}${t("dim")}
      <small>${dim != null ? (chg > 0 ? "+" : "") + chg.toFixed(1) : ""}</small></div>
    <div class="ct">${realmLabel(c.dim, c.name_realm)} ${(curLang === "zh" && c.tip) ? "· " + c.tip : ""}</div></div>`;
}

function idxRow(x, cls) {
  const sel = x.id === curId ? " sel" : "";
  if (x.dim == null) {                 // 无数据 → 显示断连(不隐藏，如中国未接入时)
    return `<div class="idx ${cls}${sel}" data-id="${x.id}" data-name="${esc(x.name)}">
      <span class="in">${idxLabel(x.name)}</span>
      <span class="iv" style="color:#7a8694">${t("down")}</span>
      <span class="ic"></span></div>`;
  }
  const init = x.initial != null ? x.initial : x.dim;
  const chg = (x.dim - init);
  const col = chg > 0 ? "#2ebd6b" : (chg < 0 ? "#e54a4a" : "#cfd6df");
  return `<div class="idx ${cls}${sel}" data-id="${x.id}" data-name="${esc(x.name)}">
    <span class="in">${idxLabel(x.name)}</span>
    <span class="iv" style="color:${col}">${x.dim.toFixed(2)} <small>${chg > 0 ? "+" : ""}${chg.toFixed(2)}</small></span>
    <span class="ic">${x.count != null ? x.count + t("units") : ""}</span></div>`;
}

let countryFilter = null;          // 世界地图选国筛选
async function loadChannels() {
  try {
    const d = await (await fetch("/api/channels")).json();
    window._lastData = d;            // 供世界地图用
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
        (realmLabel(g.dim, g.name_realm)) + (g.count ? ` ｜ ${t("cover")} ${g.count}/${d.total} ${t("units")}` : "");
      document.getElementById("giTip").textContent = t("advTip") + (g.tip || "");
    }
    // 侧栏
    let html = `<div class="hd">${t("sIdx")}</div>`;
    html += idxRow(d.green, "g");
    for (const x of d.continents) html += idxRow(x, "t");
    html += `<div class="hd">${t("sCidx")}</div>`;
    const countries = d.countries.slice().sort((a, b) => (a.dim == null) - (b.dim == null));  // 有数据在前，断连沉底
    for (const x of countries) html += idxRow(x, "c");
    // 频道：活跃(洲→国分组) + 断连沉底；世界地图选国后只看该国
    let chList = d.channels;
    if (countryFilter) chList = chList.filter(c => c.country === countryFilter);
    const active = chList.filter(c => c.mode !== "down");
    const down = chList.filter(c => c.mode === "down");
    html += `<div class="hd">${t("sCh")} · ${countryFilter ? countryFilter + " " + chList.length + " " + t("units") + " <a onclick=\"pickCountry(null)\" style=\"cursor:pointer;color:#7fd1ff\">[" + t("total") + "]</a>" : t("total") + " " + d.total + " " + t("units")}</div>`;
    let lc = null, lcty = null;
    for (const c of active) {
      if (c.continent !== lc) { html += `<div class="cgroup">🌐 ${ctry(c.continent)}</div>`; lc = c.continent; lcty = null; }
      if (c.country !== lcty) { html += `<div class="ctygroup">${ctry(c.country)}</div>`; lcty = c.country; }
      html += row(c);
    }
    if (down.length) {
      html += `<div class="cgroup downhd">${t("sDown")} ${down.length} ${t("units")}</div>`;
      for (const c of down) html += row(c);
    }
    document.getElementById("chanList").innerHTML = html;
  } catch (e) {}
}

function pick(id, name) {
  curId = id; curName = name;
  // 即时高亮选中，不整体重建侧栏
  document.querySelectorAll("#chanList .sel").forEach(e => e.classList.remove("sel"));
  try {
    const el = document.querySelector('#chanList [data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (el) el.classList.add("sel");
  } catch (e) {}
  loadSeries(true);                 // 立即切到该序列
}

document.getElementById("tfs").addEventListener("click", e => {
  if (e.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#tfs button").forEach(b => b.classList.remove("on"));
  e.target.classList.add("on");
  curTf = parseInt(e.target.dataset.tf); loadSeries();
});

async function openWeather() {
  let d;
  try { d = await (await fetch("/api/weather")).json(); }
  catch (e) { document.getElementById("modalBody").innerHTML = "<h2>🌦 降雨预测</h2><p>天气数据加载失败，请稍后重试。</p>"; document.getElementById("modal").style.display = "flex"; return; }
  const a = d.accuracy || {};
  const sigCls = d.signal ? "wsig-on" : "wsig-off";
  let h = `<h2>🌦 降雨预测 · 绿太阳天气系统</h2>`;
  h += `<p class="${sigCls}">${d.signal ? "🟢 降雨信号 已触发" : "⚪ 无降雨信号"} ｜ GreenIndex=${d.gi != null ? d.gi : "--"}（信号区间 ${d.gi_band}）｜ 中国今日平均降水概率 <b>${d.cn_today_prob != null ? d.cn_today_prob + "%" : "--"}</b></p>`;
  h += `<p class="wadvice">💡 ${d.advice || ""}</p>`;
  h += `<p class="wacc">📊 验证命中率：样本 ${a["样本天数"] || 0} 天 · 信号触发 ${a["信号触发天数"] || 0} 天 · 命中 ${a["信号命中天数"] || 0} 天 · <b>命中率 ${a["命中率%"] != null ? a["命中率%"] + "%" : "积累中"}</b> · 基准降雨率 ${a["基准降雨率%"] != null ? a["基准降雨率%"] + "%" : "--"}</p>`;
  const dates = (d.regions[0] && d.regions[0].dates) || [];
  h += `<div class="wtabwrap"><table class="wtab"><tr><th>地区</th>`;
  for (const dt of dates) h += `<th>${dt.slice(5)}</th>`;
  h += `</tr>`;
  for (const r of d.regions) {
    h += `<tr><td class="wreg">${r.cn ? "🇨🇳" : "🌍"} ${r.name}</td>`;
    for (let i = 0; i < r.prob.length; i++) {
      const p = r.prob[i] == null ? 0 : r.prob[i];
      const alpha = (p / 100 * 0.82 + 0.06).toFixed(2);
      h += `<td style="background:rgba(70,150,250,${alpha})">${p}%</td>`;
    }
    h += `</tr>`;
  }
  h += `</table></div>`;
  h += `<p class="wnote">🌍 其他地区(伦敦/纽约/东京/莫斯科/悉尼/香港)持续收集中，用于扩充验证样本。<br>${d.note || ""}</p>`;
  document.getElementById("modalBody").innerHTML = h;
  document.getElementById("modal").style.display = "flex";
}

async function openSatellite() {
  let d;
  try { d = await (await fetch("/api/satellite")).json(); }
  catch (e) { document.getElementById("modalBody").innerHTML = "<h2>🛰 卫星云图</h2><p>加载失败，请稍后重试。</p>"; document.getElementById("modal").style.display = "flex"; return; }
  const mr = d.match_rate || {};
  let h = `<h2>🛰 气象卫星云图 × GreenIndex 加密验证</h2>`;
  h += `<div class="satimgwrap"><img class="satimg" src="${d.img}" alt="中国区卫星云图"><div class="satcap">中国区真彩卫星云图 · ${d.date || ""}（云量按亮像素估计）</div></div>`;
  h += `<p class="wacc">☁ 当前云量 <b>${d.cloud_pct != null ? d.cloud_pct + "%" : "--"}</b>（阈值≥${50}%判多云）｜ 卫星降雨信号 <b>${d.cloud_signal ? "有" : "无"}</b><br>`;
  h += `🟢 GreenIndex=${d.gi != null ? d.gi : "--"} → 降雨信号 <b>${d.gi_signal ? "有" : "无"}</b> ｜ 一致性 <b class="${d.agree ? "wsig-on" : "wsig-off"}" style="padding:2px 6px">${d.agree ? "✓ 匹配" : "✗ 不匹配"}</b></p>`;
  h += `<p class="${mr.rate >= 50 ? "wsig-on" : "wsig-off"}">🔑 Token 成功匹配率：<b>${mr.rate != null ? mr.rate + "%" : "积累中"}</b>（${mr.matched || 0}/${mr.total || 0} 次一致）</p>`;
  h += `<div class="wtabwrap"><table class="wtab"><tr><th>时间</th><th>GI</th><th>云量</th><th>GI信号</th><th>卫星信号</th><th>结果</th><th>Token</th></tr>`;
  for (const t of (d.recent || [])) {
    const tm = new Date(t.ts * 1000).toLocaleTimeString();
    h += `<tr><td class="wreg">${tm}</td><td>${t.gi}</td><td>${t.cloud}%</td><td>${t.gi_sig ? "🌧" : "—"}</td><td>${t.cloud_sig ? "☁" : "—"}</td><td>${t.match ? "✓" : "✗"}</td><td style="font-family:monospace;font-size:10px">${t.token}</td></tr>`;
  }
  h += `</table></div>`;
  h += `<p class="wnote">${d.note || ""}</p>`;
  document.getElementById("modalBody").innerHTML = h;
  document.getElementById("modal").style.display = "flex";
}

async function openAnalysis() {
  let d;
  try { d = await (await fetch("/api/analysis")).json(); }
  catch (e) { document.getElementById("modalBody").innerHTML = "<h2>🌐 各地验证</h2><p>加载失败，请稍后重试。</p>"; document.getElementById("modal").style.display = "flex"; return; }
  const th = d.thresholds || {};
  const cell = s => s == null ? "—" : (s ? "🌧有" : "—无");
  let h = `<h2>🌐 各国（地区）指数 × 卫星云图 × 官方天气 · 加密验证</h2>`;
  h += `<p class="wacc">🔑 综合一致率（Token 验证）：<b class="${d.overall_rate >= 50 ? "wsig-on" : "wsig-off"}" style="padding:2px 6px">${d.overall_rate != null ? d.overall_rate + "%" : "积累中"}</b>（${d.overall_n || 0} 次有效比对）｜ 阈值：指数${th["指数区间"]} · 云量≥${th["云量%"]}% · 降水≥${th["降水mm"]}mm</p>`;
  h += `<div class="wtabwrap"><table class="wtab"><tr>`;
  ["地区", "日期", "指数", "云量%", "降水mm", "指数信号", "卫星", "官方天气", "一致", "正确率", "指数·云", "指数·雨", "Token"].forEach(t => h += `<th>${t}</th>`);
  h += `</tr>`;
  for (const r of (d.regions || [])) {
    const ok = r.match == null ? "" : (r.match ? "✓" : "✗");
    const okc = r.match == null ? "#8b97a6" : (r.match ? "#2ebd6b" : "#e54a4a");
    const hits = _tokenHits(r);
    const hc = _regionColor(r);
    // 官方天气=地面真值；指数错时区分浅绿(指数+卫星都错)与蓝(指数孤立错)
    const tag = hc === "#86efac" ? " <span title='指数+卫星一致但与官方天气相反 → 指数错(官方天气通常正确)' style='color:#86efac'>浅绿</span>"
              : hc === "#3b82f6" ? " <span title='卫星与官方天气一致、指数孤立错' style='color:#3b82f6'>蓝</span>"
              : hc === "#a855f7" ? " <span title='指数与官方天气一致 → 指数对' style='color:#a855f7'>紫</span>" : "";
    const wxTruth = (r.idx_sig != null && r.wx_sig != null && r.idx_sig !== r.wx_sig) ? " <span title='官方天气为准(地面真值)' style='color:#7fd1ff'>✔真值</span>" : "";
    h += `<tr${hc ? ` style="background:${hc}33"` : ""}><td class="wreg" style="${hc ? "color:" + hc + ";font-weight:bold" : ""}">${ctry(r.country)}${hits ? " ●" + hits : ""}</td><td>${(r.date || "").slice(5)}</td>` +
      `<td>${r.idx != null ? r.idx : "—"}</td><td>${r.cloud != null ? r.cloud : "—"}</td><td>${r.precip != null ? r.precip : "—"}</td>` +
      `<td>${cell(r.idx_sig)}${tag}</td><td>${cell(r.sat_sig)}</td><td>${cell(r.wx_sig)}${wxTruth}</td>` +
      `<td style="color:${okc};font-weight:bold">${ok}</td>` +
      `<td>${r.accuracy != null ? r.accuracy + "% <small>(" + r.n + ")</small>" : "—"}</td>` +
      `<td>${r.corr_idx_cloud != null ? r.corr_idx_cloud : "—"}</td><td>${r.corr_idx_precip != null ? r.corr_idx_precip : "—"}</td>` +
      `<td style="font-family:monospace;font-size:10px">${r.token}</td></tr>`;
  }
  h += `</table></div>`;
  h += `<p class="wnote"><b>以「官方天气API」为地面真值(通常正确)</b>：<span style="color:#a855f7">紫=指数与官方天气一致(指数对)</span>；<span style="color:#86efac">浅绿=指数+卫星一致但官方天气相反(明明有/无降水，指数错)</span>；<span style="color:#3b82f6">蓝=卫星与官方天气一致、指数孤立错</span>。「一致」✓/✗ 与正确率仅按 指数 vs 官方天气 计。Token=该日数据加密指纹。<br>「指数·云 / 指数·雨」=指数与云量/降水的相关系数（找规律）。${d.note || ""}</p>`;
  document.getElementById("modalBody").innerHTML = h;
  document.getElementById("modal").style.display = "flex";
}

// ——— 维度互联网 ———
async function openDimNet() {
  let d;
  try { d = await (await fetch("/api/dimnet")).json(); }
  catch (e) { document.getElementById("modalBody").innerHTML = "<h2>🕸 维度互联网</h2><p>加载失败，请稍后重试。</p>"; document.getElementById("modal").style.display = "flex"; return; }
  const byId = {}; (d.nodes || []).forEach(n => byId[n.id] = n);
  let h = `<h2>🕸 维度互联网</h2>`;
  h += `<p class="wnote" style="line-height:1.8">${d.rule || ""}<br>共 ${d.total} 个有数据频道，<b style="color:#2ebd6b">${d.eligible}</b> 个已达标（连涨≥${d.threshold}）可建连。${d.note || ""}</p>`;
  if (!(d.eligible_nodes || []).length) {
    h += `<p style="color:#ffce4d">当前暂无频道达到「连续 ${d.threshold} 个阳K线」。下面列出连涨势头最强的频道（蓄势中）：</p>`;
    h += `<div class="wtabwrap"><table class="wtab"><tr><th>频道</th><th>维度</th><th>奇偶</th><th>连涨K</th><th>状态</th></tr>`;
    (d.nodes || []).slice(0, 40).forEach(n => {
      h += `<tr><td class="wreg">${ctry ? n.name : n.name}</td><td>${n.dim}</td><td>${n.parity}</td><td><b>${n.streak}</b></td><td>${n.eligible ? "✅可建连" : (n.streak >= d.threshold - 3 ? "🔥蓄势" : "—")}</td></tr>`;
    });
    h += `</table></div>`;
  } else {
    h += `<p style="color:#2ebd6b">✅ 已达标频道及其可连接对象（同奇偶）：</p>`;
    h += `<div class="wtabwrap"><table class="wtab"><tr><th>频道</th><th>维度</th><th>奇偶</th><th>连涨K</th><th>可连接（同奇偶·达标）</th></tr>`;
    (d.eligible_nodes || []).forEach(n => {
      const conns = (n.connects || []).map(id => (byId[id] ? byId[id].name : id)).slice(0, 12).join("、") || "（暂无同奇偶达标频道）";
      h += `<tr><td class="wreg">${n.name}</td><td>${n.dim}</td><td><b style="color:${n.parity === "单" ? "#7fd1ff" : "#ffb3b3"}">${n.parity}</b></td><td><b>${n.streak}</b></td><td style="text-align:left">${conns}</td></tr>`;
    });
    h += `</table></div>`;
  }
  h += `<p class="wnote">规则取自界域字典：单数维度=单数界，双数维度实为「负」界，故单连单、双连双。连涨10根阳K=该频道「阳气充足」方可接入维度互联网。${d.note || ""}</p>`;
  document.getElementById("modalBody").innerHTML = h;
  document.getElementById("modal").style.display = "flex";
}

// ——— 世界地图 · 图形SVG选国 ———
let _isoZh = null, _mapSvg = null;
async function ensureMapAssets() {
  if (!_isoZh) { try { _isoZh = await (await fetch("iso_zh.json")).json(); } catch (e) { _isoZh = {}; } }
  if (_mapSvg === null) { try { _mapSvg = await (await fetch("world-map.svg")).text(); } catch (e) { _mapSvg = ""; } }
}
function _hitColor(h) { return h >= 3 ? "#a855f7" : h === 2 ? "#3b82f6" : h === 1 ? "#eab308" : null; }  // 3紫2蓝1黄
// Token命中 = 三信号(指数/官方天气/卫星)取得一致的那一拨个数(全一致=3，无关有无雨)
function _tokenHits(r) {
  const v = [r.idx_sig, r.sat_sig, r.wx_sig].filter(x => x != null);
  if (!v.length) return 0;
  const ones = v.filter(x => x === 1).length;
  return Math.max(ones, v.length - ones);
}
// 以【官方天气API】为地面真值(通常正确)。颜色：
//   紫=指数与官方天气一致(指数对) / 浅绿=指数+卫星一致但与官方天气相反(指数错,卫星也错) /
//   蓝=卫星与官方天气一致、指数是孤立错值(指数错) / null=无官方天气,无法判定
function _regionColor(r) {
  const i = r.idx_sig, w = r.wx_sig, s = r.sat_sig;
  if (i == null || w == null) return null;          // 缺指数或官方天气 → 无法判定
  if (i === w) return "#a855f7";                    // 紫=指数对(与官方天气一致)
  if (s != null && s === i) return "#86efac";       // 浅绿=指数+卫星一致但官方天气相反 → 指数错
  return "#3b82f6";                                 // 蓝=卫星与官方天气一致、指数孤立错
}

// ——— K线下方：当前国家的 降雨命中率 + 官方天气 + 卫星 + Token ———
let _anaCache = null, _anaCacheT = 0;
async function getAnalysis() {
  if (_anaCache && Date.now() - _anaCacheT < 30000) return _anaCache;
  try { _anaCache = await (await fetch("/api/analysis")).json(); _anaCacheT = Date.now(); } catch (e) { _anaCache = { regions: [] }; }
  return _anaCache;
}
function _curCountry() {
  if (curId.indexOf("IDXC_") === 0) return curId.slice(5);
  const c = ((window._lastData && window._lastData.channels) || []).find(x => x.id === curId);
  return c ? c.country : null;
}
let _realmCache = {};
async function updateRealmIntro(dim) {
  const el = document.getElementById("realmIntro");
  if (!el) return;
  if (dim == null) { el.style.display = "none"; return; }
  const k = Math.round(dim);
  try {
    let r = _realmCache[k];
    if (!r) { r = await (await fetch("/api/realm?dim=" + k)).json(); _realmCache[k] = r; }
    el.innerHTML = `<b style="color:#9be29b">📖 频道维度字典简介</b> · ${curName} · 维度 <b>${r.dim}</b><br>${r.intro || ""}`;
    el.style.borderLeftColor = r.dirty ? "#eab308" : "#2ebd6b";
    el.style.display = "block";
  } catch (e) { el.style.display = "none"; }
}
async function updateTokenPanel() {
  const el = document.getElementById("tokenPanel");
  if (!el) return;
  const country = _curCountry();
  if (!country) { el.innerHTML = ""; return; }
  const a = await getAnalysis();
  const r = (a.regions || []).find(x => x.country === country);
  if (!r) { el.innerHTML = `<span style="color:#8b97a6">${country} · 天气验证数据积累中…</span>`; return; }
  const hits = _tokenHits(r);
  const col = _regionColor(r) || "#3a4555";
  const ind = s => s == null ? "—" : (s ? "🌧" : "—");
  el.innerHTML = `<div style="border-left:5px solid ${col};padding:6px 11px;background:#0f1620;border-radius:6px;line-height:1.85">
    <b style="color:${col}">${country} · Token命中 ${hits}/3</b> <small>(<span style="color:#a855f7">3紫</span>/<span style="color:#3b82f6">2蓝</span>/<span style="color:#eab308">1黄</span>)</small>
    ｜ 降雨命中率 <b>${r.accuracy != null ? r.accuracy + "%" : "积累中"}</b> <small>(${r.n || 0}次)</small><br>
    指数降雨 <b>${ind(r.idx_sig)}</b> ｜ 官方天气 实际降水 <b>${r.precip != null ? r.precip + "mm" : "—"}</b> ${ind(r.wx_sig)} ｜ 卫星云量 <b>${r.cloud != null ? r.cloud + "%" : "—"}</b> ${ind(r.sat_sig)}
    ｜ <span style="font-family:monospace;font-size:11px">${r.token || ""}</span></div>`;
}
let mapMode = "country", _provGeo = null;
async function ensureProvGeo() {
  if (!_provGeo) { try { _provGeo = await (await fetch("provinces.json")).json(); } catch (e) { _provGeo = { provs: [] }; } }
  return _provGeo;
}
function setMapMode(m) { mapMode = m; drawMap(); }
async function openMap() {
  let h = `<h2>🗺 世界地图
    <select id="mapModeSel" onchange="setMapMode(this.value)" style="font-size:13px;margin:0 8px;background:#1b2330;color:#e6e6e6;border:1px solid #2a3340;border-radius:5px;padding:3px 6px">
      <option value="country">国家级</option>
      <option value="prov">省级 · 全球行政区</option>
    </select>
    <button onclick="toggleMapFull()" style="font-size:13px;padding:3px 10px;background:#3a6ea5;color:#fff;border:none;border-radius:5px;cursor:pointer">⛶ 全屏</button></h2>`;
  h += `<div id="mapWrap" style="width:100%;overflow:auto;background:#0a0f15;border-radius:8px;padding:6px;display:flex;align-items:center;justify-content:center;min-height:200px"><span style="color:#8b97a6">加载地图…</span></div>`;
  h += `<div id="mapLegend"></div>`;
  document.getElementById("modalBody").innerHTML = h;
  const box = document.querySelector("#modal .box"); if (box) { box.style.maxWidth = "96vw"; box.style.width = "96vw"; }
  document.getElementById("modal").style.display = "flex";
  const sel = document.getElementById("mapModeSel"); if (sel) sel.value = mapMode;
  await drawMap();
}
async function drawMap() {
  if (mapMode === "prov") return drawProvMap();
  return drawCountryMap();
}
// ——— 省级：全球行政区，绿=无频道，否则四色 ———
function _provPath(rings) {
  let d = "";
  for (const r of rings) { d += "M" + r.map((p, i) => (i ? "L" : "") + p[0] + " " + p[1]).join(" ") + "Z"; }
  return d;
}
async function drawProvMap() {
  await ensureMapAssets();   // 需要 _isoZh 做 省→国 映射
  const g = await ensureProvGeo();
  const pd = {};
  try { const a = await (await fetch("/api/analysis_prov")).json(); for (const r of (a.provinces || [])) pd[r.id] = r; } catch (e) {}
  // 国家级判定：无法定位到省的国家 → 整片国土按全国判定上色(判对全紫)
  const cByCn = {};
  try { const a = await (await fetch("/api/analysis")).json(); for (const r of (a.regions || [])) cByCn[r.country] = r; } catch (e) {}
  const d = window._lastData; const haveCh = {};
  if (d) for (const c of d.channels) haveCh[c.country] = (haveCh[c.country] || 0) + 1;
  const GREEN = "#1f7a44", GRAY = "#3a4555";
  let nProv = 0, nCtry = 0;
  const seenCtry = new Set();
  const W = g.w || 1000, H = g.h || 500;
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:74vh;background:#0a1622">`;
  for (const p of g.provs) {
    const nm = p.nl || p.n;
    const r = pd[p.id];                                  // ① 该省自有频道
    const iso2 = (p.id.split("-")[0] || "").toLowerCase();
    const cn = _isoZh[iso2];                              // 省→国(中文名)
    const cr = cn ? cByCn[cn] : null;                     // 该国全国判定
    let col, tip;
    if (r) {
      col = _regionColor(r) || GRAY;
      tip = `${nm} · 自有频道 · 指数 ${r.idx != null ? r.idx : "—"} ｜ 官方天气 ${r.precip != null ? r.precip + "mm" : "—"} ｜ 卫星 ${r.cloud != null ? r.cloud + "%" : "—"} ｜ 正确率 ${r.accuracy != null ? r.accuracy + "%" : "积累中"}`;
      nProv++;
    } else if (cr) {                                     // ② 回退全国判定(代表全国，整国同色)
      col = _regionColor(cr) || (haveCh[cn] ? GRAY : GREEN);
      if (!seenCtry.has(cn)) { seenCtry.add(cn); nCtry++; }
      tip = `${nm}（${cn}） · 单一/全国频道代表 · 全国指数 ${cr.idx != null ? cr.idx : "—"} ｜ 全国降水 ${cr.precip != null ? cr.precip + "mm" : "—"} ｜ 正确率 ${cr.accuracy != null ? cr.accuracy + "%" : "积累中"}`;
    } else if (cn && haveCh[cn]) {
      col = GRAY; tip = `${nm}（${cn}） · 有频道·数据积累中`;
    } else {
      col = GREEN; tip = `${nm}（${p.c}） · 无频道`;
    }
    s += `<path d="${_provPath(p.r)}" fill="${col}" stroke="#0a1622" stroke-width="0.3"><title>${tip}</title></path>`;
  }
  s += `</svg>`;
  document.getElementById("mapWrap").innerHTML = s;
  document.getElementById("mapLegend").innerHTML = `<div style="margin:8px 0;font-size:13px"><b style="color:#ffce4d">📍 全球省级行政区逐省判定</b>（共 ${g.provs.length} 区 ｜ ${nProv} 个省自有频道 ｜ ${nCtry} 国按全国判定整片上色）</div>
    <div class="wnote" style="line-height:1.8">
    · <span style="color:#1f7a44;font-weight:bold">绿=无任何频道</span>。灰=有频道·积累中。<br>
    · <b>频道归属地</b>：① 名字含城市名 → 该城市所在省；② 品牌频道(无地名) → <b>品牌总部所在地</b>，全国性广播品牌总部通常在<b>首都</b>，故归到首都所在省 vs 该省官方天气/卫星 逐省判定。<br>
    · <b>无任何频道的省 → 回退全国判定</b>：用全国指数 vs 全国官方天气，<b>判对则该国整片国土变紫</b>（不论降雨面积是 15% 还是其他比例，命中即 100% 紫）。<br>
    · 判定(官方天气API为地面真值,通常正确)：<span style="color:#a855f7">紫=指数与官方天气一致(对)</span>、<span style="color:#86efac">浅绿=指数+卫星一致但官方天气相反(明明有/无降水→指数错)</span>、<span style="color:#3b82f6">蓝=卫星与官方天气一致、指数孤立错</span>。<br>
    · <b>免责</b>：单一频道不足以代表全省/全国实况，仅娱乐参考。</div>`;
}
async function drawCountryMap() {
  await ensureMapAssets();
  const d = window._lastData;
  const haveCh = {}, haveLive = {};
  if (d) for (const c of d.channels) { haveCh[c.country] = (haveCh[c.country] || 0) + 1; if (c.mode === "live") haveLive[c.country] = (haveLive[c.country] || 0) + 1; }
  const colorMap = {};
  try {
    const a = await (await fetch("/api/analysis")).json();
    for (const r of (a.regions || [])) colorMap[r.country] = _regionColor(r);
  } catch (e) {}
  document.getElementById("mapWrap").innerHTML = _mapSvg || `<span style="color:#8b97a6">地图资源缺失</span>`;
  document.getElementById("mapLegend").innerHTML = `<div style="margin:8px 0;font-size:13px"><b style="color:#ffce4d">📍 已提供服务的国家/地区：</b>
    🇬🇧 英国·伦敦服务器 ⭐ ｜ 🇨🇳 中国·深圳数据中心 ⭐</div>
    <div class="wnote" style="line-height:1.8">
    <b>界面说明：</b><br>
    · <span style="color:#2ebd6b">绿=有直播</span>、<span style="background:#3a4555;color:#fff;padding:0 4px;border-radius:3px">灰=有台但全断连</span>、深灰=无台。<br>
    · 判定(官方天气API为地面真值)：<span style="color:#a855f7">紫=指数与官方天气一致(对)</span>、<span style="color:#86efac">浅绿=指数+卫星一致但官方天气相反(指数错)</span>、<span style="color:#3b82f6">蓝=卫星与官方天气一致、指数孤立错</span>。<br>
    · <b>⭐ 服务器节点</b>：<b>深圳数据中心</b>负责全球频道「视频+音频」维度分析(50台一组轮转采样)；<b>伦敦服务器</b>负责聚合数据、国际用户点播视频中转、网站直播。<br>
    · 点地图上的国家 → 左侧只看该国频道，可点 📺 看直播。<a onclick="pickCountry(null)" style="cursor:pointer;color:#7fd1ff">[显示全部]</a></div>`;
  const svg = document.querySelector("#mapWrap svg");
  if (svg) {
    svg.style.width = "100%"; svg.style.height = "auto"; svg.style.maxHeight = "74vh";
    const zhByIso = _isoZh;
    svg.querySelectorAll("[id]").forEach(el => {
      const cn = zhByIso[el.id.toLowerCase()];
      if (!cn) return;
      // 着色优先：Token色 > 有直播=绿 > 有台但全断连=灰 > 无台=深灰
      const col = colorMap[cn] || (haveLive[cn] ? "#2ebd6b" : (haveCh[cn] ? "#3a4555" : "#1a232e"));
      el.style.fill = col; el.style.stroke = "#0a0f15"; el.style.strokeWidth = "0.3";
      if (haveCh[cn]) el.style.cursor = "pointer";
      // 每国台数 tooltip
      let title = el.querySelector("title"); if (!title) { title = document.createElementNS("http://www.w3.org/2000/svg", "title"); el.appendChild(title); }
      title.textContent = cn + (haveCh[cn] ? ` · ${haveCh[cn]} 台(${haveLive[cn] || 0} 直播)` : " · 暂无频道") + (colorMap[cn] ? " · Token一致" : "");
    });
    // 服务器星星(深圳=中国cn，伦敦=英国gb)，用 getBBox 实际位置
    for (const [iso, label, rx, ry] of [["cn", "深圳", 0.82, 0.82], ["gb", "伦敦", 0.70, 0.90]]) {
      const el = svg.querySelector("#" + iso) || svg.querySelector('[id="' + iso + '"]');
      if (!el || !el.getBBox) continue;
      try {
        const b = el.getBBox(); const cx = b.x + b.width * rx, cy = b.y + b.height * ry;
        const star = document.createElementNS("http://www.w3.org/2000/svg", "text");
        star.setAttribute("x", cx); star.setAttribute("y", cy); star.setAttribute("text-anchor", "middle");
        star.setAttribute("font-size", "14"); star.setAttribute("fill", "#ffce4d"); star.style.pointerEvents = "none";
        star.textContent = "★";
        const lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lab.setAttribute("x", cx); lab.setAttribute("y", cy + 9); lab.setAttribute("text-anchor", "middle");
        lab.setAttribute("font-size", "7"); lab.setAttribute("fill", "#fff"); lab.style.pointerEvents = "none";
        lab.textContent = label;
        svg.appendChild(star); svg.appendChild(lab);
      } catch (e) {}
    }
    svg.addEventListener("click", e => { const t = e.target.closest("[id]"); if (!t) return; const cn = zhByIso[t.id.toLowerCase()]; if (cn && haveCh[cn]) pickCountry(cn); });
    svg.addEventListener("mouseover", e => { const t = e.target.closest("[id]"); if (t && zhByIso[t.id.toLowerCase()]) t.style.opacity = "0.7"; });
    svg.addEventListener("mouseout", e => { const t = e.target.closest("[id]"); if (t) t.style.opacity = "1"; });
  }
}
function pickCountry(name) {
  countryFilter = name || null;
  closeModal();
  loadChannels();
  setTimeout(() => { const e = document.getElementById("chanList"); if (e) e.scrollTop = 0; }, 250);   // 左栏跳到顶
}
function toggleMapFull() {
  const w = document.getElementById("mapWrap"); if (!w) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (w.requestFullscreen) w.requestFullscreen();
}
document.addEventListener("fullscreenchange", () => {
  const w = document.getElementById("mapWrap"); if (!w) return;
  const svg = w.querySelector("svg");
  if (document.fullscreenElement === w) { w.style.height = "100vh"; if (svg) svg.style.maxHeight = "98vh"; }
  else { w.style.height = ""; if (svg) svg.style.maxHeight = "74vh"; }
});

// ——— 多语言 i18n ———
const I18N = {
  zh: { rain: "🌦 降雨预测", sat: "🛰 卫星云图", ana: "🌐 各地验证", map: "🗺 世界地图", agr: "用户协议", dis: "免责声明", thx: "鸣谢", prot: "🛡 保护声明", world: "🎮 维度世界", advice: "实时建议加载中…", chans: "频道维度（点击看K线）", live: "直播", down: "断连", demo: "演示", sIdx: "📊 指数（点击看K线）", sCidx: "🌍 各国（地区）指数", sCh: "📺 频道", sDown: "🔴 断连", total: "共", units: "台", cover: "覆盖", advTip: "💡 综合建议：", now: "当前", init: "初始", chg: "涨跌", dim: "维" },
  en: { rain: "🌦 Rain", sat: "🛰 Satellite", ana: "🌐 Verify", map: "🗺 World Map", agr: "Terms", dis: "Disclaimer", thx: "Thanks", prot: "🛡 Protection", world: "🎮 Dim World", advice: "Loading…", chans: "Channels (click for chart)", live: "Live", down: "Offline", demo: "Demo", sIdx: "📊 Indices (click for chart)", sCidx: "🌍 Country/Region Indices", sCh: "📺 Channels", sDown: "🔴 Offline", total: "Total", units: "", cover: "covers", advTip: "💡 Advice: ", now: "Now", init: "Init", chg: "Chg", dim: "D" },
  es: { rain: "🌦 Lluvia", sat: "🛰 Satélite", ana: "🌐 Verificar", map: "🗺 Mapa Mundial", agr: "Términos", dis: "Aviso", thx: "Gracias", prot: "🛡 Protección", world: "🎮 Mundo Dim", advice: "Cargando…", chans: "Canales (clic para gráfico)", live: "En vivo", down: "Desconectado", demo: "Demo", sIdx: "📊 Índices (clic)", sCidx: "🌍 Índices por país/región", sCh: "📺 Canales", sDown: "🔴 Desconectado", total: "Total", units: "", cover: "cubre", advTip: "💡 Consejo: ", now: "Ahora", init: "Inicial", chg: "Cambio", dim: "D" },
  fr: { rain: "🌦 Pluie", sat: "🛰 Satellite", ana: "🌐 Vérifier", map: "🗺 Carte du Monde", agr: "Conditions", dis: "Avertissement", thx: "Merci", prot: "🛡 Protection", world: "🎮 Monde Dim", advice: "Chargement…", chans: "Chaînes (clic pour graphique)", live: "En direct", down: "Hors ligne", demo: "Démo", sIdx: "📊 Indices (clic)", sCidx: "🌍 Indices par pays/région", sCh: "📺 Chaînes", sDown: "🔴 Hors ligne", total: "Total", units: "", cover: "couvre", advTip: "💡 Conseil : ", now: "Actuel", init: "Init", chg: "Var", dim: "D" },
  de: { rain: "🌦 Regen", sat: "🛰 Satellit", ana: "🌐 Prüfen", map: "🗺 Weltkarte", agr: "Bedingungen", dis: "Haftung", thx: "Danke", prot: "🛡 Schutz", world: "🎮 Dim-Welt", advice: "Lädt…", chans: "Kanäle (Klick für Chart)", live: "Live", down: "Offline", demo: "Demo", sIdx: "📊 Indizes (Klick)", sCidx: "🌍 Länder-/Regionalindizes", sCh: "📺 Kanäle", sDown: "🔴 Offline", total: "Gesamt", units: "", cover: "deckt", advTip: "💡 Hinweis: ", now: "Jetzt", init: "Init", chg: "Änd", dim: "D" },
  ar: { rain: "🌦 المطر", sat: "🛰 قمر", ana: "🌐 تحقق", map: "🗺 خريطة العالم", agr: "الشروط", dis: "إخلاء", thx: "شكر", prot: "🛡 الحماية", world: "🎮 عالم البُعد", advice: "جارٍ التحميل…", chans: "القنوات (انقر للرسم)", live: "مباشر", down: "غير متصل", demo: "تجريبي", sIdx: "📊 المؤشرات (انقر)", sCidx: "🌍 مؤشرات الدول/المناطق", sCh: "📺 القنوات", sDown: "🔴 غير متصل", total: "المجموع", units: "", cover: "يغطي", advTip: "💡 نصيحة: ", now: "الآن", init: "بداية", chg: "تغير", dim: "" },
};
let curLang = "zh";
function t(k) { return (I18N[curLang] && I18N[curLang][k]) || I18N.zh[k] || k; }

// 界名→各语言「贴近生活」的日常词(中文保留原界名；外语按维度分档给通俗词)
const REALM_BANDS = [
  [13, { en: "Gloomy", es: "Sombrío", fr: "Sombre", de: "Düster", ar: "كئيب" }],
  [25, { en: "Heavy", es: "Pesado", fr: "Pesant", de: "Schwer", ar: "ثقيل" }],
  [38, { en: "Calm", es: "Tranquilo", fr: "Calme", de: "Ruhig", ar: "هادئ" }],
  [50, { en: "Bright", es: "Luminoso", fr: "Lumineux", de: "Hell", ar: "مشرق" }],
  [70, { en: "Lively", es: "Animado", fr: "Vif", de: "Lebhaft", ar: "نشيط" }],
  [9999, { en: "Free", es: "Libre", fr: "Libre", de: "Frei", ar: "حر" }],
];
function realmLabel(dim, name_realm) {
  if (curLang === "zh") return name_realm || "";
  if (dim == null) return "";
  for (const [hi, w] of REALM_BANDS) if (dim < hi) return w[curLang] || w.en;
  return "";
}
// 国名/洲名/「指数」翻译
const CONT_I18N = {
  "亚洲": { en: "Asia", es: "Asia", fr: "Asie", de: "Asien", ar: "آسيا" },
  "欧洲": { en: "Europe", es: "Europa", fr: "Europe", de: "Europa", ar: "أوروبا" },
  "非洲": { en: "Africa", es: "África", fr: "Afrique", de: "Afrika", ar: "أفريقيا" },
  "北美洲": { en: "N.America", es: "N.América", fr: "Am.Nord", de: "Nordamerika", ar: "أمريكا الشمالية" },
  "南美洲": { en: "S.America", es: "S.América", fr: "Am.Sud", de: "Südamerika", ar: "أمريكا الجنوبية" },
  "大洋洲": { en: "Oceania", es: "Oceanía", fr: "Océanie", de: "Ozeanien", ar: "أوقيانوسيا" },
  "其他": { en: "Other", es: "Otros", fr: "Autre", de: "Andere", ar: "أخرى" },
};
const IDXW = { zh: "指数", en: "Index", es: "Índice", fr: "Indice", de: "Index", ar: "مؤشر" };
let _ctryI18n = null;
fetch("countries_i18n.json").then(r => r.json()).then(j => { _ctryI18n = j; }).catch(() => {});
function ctry(zh) { if (curLang === "zh" || !zh) return zh; const m = (_ctryI18n && _ctryI18n[zh]) || CONT_I18N[zh]; return (m && m[curLang]) || zh; }
function idxLabel(name) { if (curLang === "zh") return name; const i = name.indexOf(" 指数"); return i > 0 ? ctry(name.slice(0, i)) + " " + (IDXW[curLang] || "Index") : name; }
const CR = {
  zh: { cr1: "英国伦敦 提供场地与互联网服务商 ｜ 中国 提供创意与技术支持 ｜ 3.4 小组 提供便利研究服务", cr2: "GitHub 作者 MagicGirl2000 创意 ｜", cr2b: "Claude Code CLI 终极技术支持", cr3: "全球提供电视频道视频/音频数据 ｜ 腾讯 提供可能的技术测试与上报 ｜ 阿里巴巴 提供基础服务器 ｜ Microsoft 提供基础操作系统服务 ｜ 北京奇虎 360 提供终极安全保护防火墙与涉密项目保护", cr4: "作者因 Amélie Poulain（2001）电影受到无限启发" },
  en: { cr1: "London UK: venue & ISP ｜ China: ideas & tech ｜ Team 3.4: research support", cr2: "GitHub author MagicGirl2000 ｜", cr2b: "Claude Code CLI · ultimate tech support", cr3: "Global TV video/audio data ｜ Tencent: testing & reporting ｜ Alibaba: servers ｜ Microsoft: OS ｜ Qihoo 360: security firewall & protection", cr4: "Inspired by the film Amélie Poulain (2001)" },
  es: { cr1: "Londres (RU): sede e ISP ｜ China: ideas y tecnología ｜ Equipo 3.4: investigación", cr2: "Autor de GitHub MagicGirl2000 ｜", cr2b: "Claude Code CLI · soporte técnico final", cr3: "Datos globales de TV ｜ Tencent: pruebas e informes ｜ Alibaba: servidores ｜ Microsoft: SO ｜ Qihoo 360: cortafuegos y protección", cr4: "Inspirado en la película Amélie Poulain (2001)" },
  fr: { cr1: "Londres (RU) : lieu et FAI ｜ Chine : idées et technique ｜ Équipe 3.4 : recherche", cr2: "Auteur GitHub MagicGirl2000 ｜", cr2b: "Claude Code CLI · support technique ultime", cr3: "Données TV mondiales ｜ Tencent : tests et rapports ｜ Alibaba : serveurs ｜ Microsoft : OS ｜ Qihoo 360 : pare-feu et protection", cr4: "Inspiré par le film Amélie Poulain (2001)" },
  de: { cr1: "London (UK): Standort & ISP ｜ China: Ideen & Technik ｜ Team 3.4: Forschung", cr2: "GitHub-Autor MagicGirl2000 ｜", cr2b: "Claude Code CLI · ultimative Tech-Unterstützung", cr3: "Globale TV-Daten ｜ Tencent: Tests & Berichte ｜ Alibaba: Server ｜ Microsoft: OS ｜ Qihoo 360: Firewall & Schutz", cr4: "Inspiriert vom Film Amélie Poulain (2001)" },
  ar: { cr1: "لندن (المملكة المتحدة): الموقع والإنترنت ｜ الصين: الأفكار والتقنية ｜ فريق 3.4: البحث", cr2: "مؤلف GitHub ‏MagicGirl2000 ｜", cr2b: "Claude Code CLI · دعم تقني نهائي", cr3: "بيانات تلفزيون عالمية ｜ Tencent: اختبار ｜ Alibaba: خوادم ｜ Microsoft: نظام التشغيل ｜ Qihoo 360: جدار حماية", cr4: "مستوحى من فيلم Amélie Poulain (2001)" },
};
function setLang(l) {
  curLang = I18N[l] ? l : "zh";
  const tt = Object.assign({}, I18N[curLang], CR[curLang] || {});
  document.querySelectorAll("[data-i18n]").forEach(e => { const k = e.dataset.i18n; if (tt[k]) e.textContent = tt[k]; });
  document.documentElement.dir = (curLang === "ar") ? "rtl" : "ltr";
  try { localStorage.setItem("greentv_lang", curLang); } catch (e) {}
  try { loadChannels(); } catch (e) {}    // 立即用新语言重渲染动态内容
}

// ——— 电视点播播放器(flv.js) ———
let _flv = null;
function closeFlv() { if (_flv) { try { _flv.destroy(); } catch (e) {} _flv = null; } }
function playChannel(id, name) {
  document.getElementById("tvTitle").textContent = "📺 " + (name || id);
  document.getElementById("tvNote").textContent = "点播中转：服务器按需拉取并转码直播。点开才占带宽，关闭即停。";
  document.getElementById("tvModal").style.display = "flex";
  const video = document.getElementById("tvVideo");
  closeFlv();
  if (window.flvjs && flvjs.isSupported()) {
    _flv = flvjs.createPlayer({ type: "flv", url: "/watch?ch=" + encodeURIComponent(id), isLive: true });
    _flv.on(flvjs.Events.ERROR, () => { document.getElementById("tvNote").textContent = "⚠ 该频道源本机读不到或格式不支持，换一个试试（纯大陆限定源需在深圳端看）。"; });
    _flv.attachMediaElement(video);
    _flv.load();
    video.play().catch(() => {});
  } else {
    document.getElementById("tvNote").textContent = "浏览器不支持 flv.js。";
  }
}
function closeTV() {
  closeFlv();
  const v = document.getElementById("tvVideo");
  try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
  document.getElementById("tvModal").style.display = "none";
}

initChart();
// 侧栏点击：事件委托。📺=看电视；其余=选频道看K线。刷新重建也不丢点击。
document.getElementById("chanList").addEventListener("click", e => {
  const tv = e.target.closest("[data-tv]");
  if (tv) { e.stopPropagation(); playChannel(tv.dataset.tv, tv.dataset.tvname); return; }
  const el = e.target.closest("[data-id]");
  if (el && el.dataset.id) pick(el.dataset.id, el.dataset.name || el.dataset.id);
});
loadChannels(); loadSeries(true);
setInterval(() => loadSeries(), 2000);    // 图表：2秒增量更新
setInterval(() => loadChannels(), 4000);  // 侧栏：4秒刷新
try { const _l = localStorage.getItem("greentv_lang") || "zh"; setLang(_l); const _s = document.querySelector("header select"); if (_s) _s.value = _l; } catch (e) {}
