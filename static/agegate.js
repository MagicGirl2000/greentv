/* agegate.js — 进入合规流程：
 *   ① Cookie 同意（全部接受 / 部分接受 / 全部拒绝=无法访问）
 *   ② 地区识别 → 进入须知（需满22周岁）
 *   ③ 协议视频一（含「是否同意收集基本访客信息」授权）→ 协议视频二（均计时·不可快进）
 *   ④ 19 题考核：11 题理解判分（≥95=全对）+ 8 题用户画像采集 → 通过则下拉同意进入，否则拒绝
 *   隐私：自我声明 + 仅按 IP 判地区；仅在【访客同意】后收集非敏感基本信息（浏览器/语言/时区/地区/自报偏好），不采集任何身份证件。
 */
(function () {
  var MIN = 22, PASS = 95, KEY = "gt_entry_pass", CK = "gt_cookie", VI = "gt_visitor_consent";
  var visitorConsent = false, portrait = {};
  function $(h) { var d = document.createElement("div"); d.innerHTML = h; return d.firstElementChild; }
  function overlay(inner) {
    var o = document.getElementById("ageGate"); if (o) o.remove();
    o = document.createElement("div"); o.id = "ageGate";
    o.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0a0f15;color:#e6e6e6;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;font-family:'Microsoft YaHei',Arial,sans-serif";
    o.appendChild($(inner)); document.body.appendChild(o); return o;
  }
  function box(h) { return '<div style="max-width:680px;width:100%;background:#121a24;border:1px solid #243140;border-radius:14px;padding:24px 28px;line-height:1.8;max-height:90vh;overflow:auto">' + h + '</div>'; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function btn(id, txt, color, fg) { return '<button id="' + id + '" style="padding:12px 24px;font-size:15px;background:' + color + ';color:' + (fg || '#fff') + ';border:none;border-radius:9px;cursor:pointer;margin:4px">' + txt + '</button>'; }

  function denyAccess(reason) {
    document.documentElement.innerHTML =
      '<body style="margin:0;background:#0a0f15;color:#e6e6e6;font-family:Microsoft YaHei,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">' +
      '<div style="max-width:560px;padding:24px"><div style="font-size:54px">🚫</div><h2 style="color:#ffce4d">无法访问</h2>' +
      '<p style="line-height:1.9;color:#9fb3c8">' + reason + '</p>' +
      '<button onclick="location.reload()" style="margin-top:8px;padding:10px 22px;background:#3a6ea5;color:#fff;border:none;border-radius:8px;cursor:pointer">重新选择</button></div></body>';
  }

  /* ===== ① Cookie 同意 ===== */
  function cookieConsent() {
    overlay(box(
      '<h2 style="margin:0 0 6px;color:#ffce4d">🍪 Cookie 使用同意</h2>' +
      '<p>本站使用 Cookie 提供基本功能、记住您的选择并改善服务。请选择您的偏好：</p>' +
      '<ul style="margin:6px 0 12px;padding-left:20px;color:#9fb3c8">' +
      '<li><b>必要 Cookie</b>：维持网站运行与您的进入选择（不可关闭）。</li>' +
      '<li><b>偏好 Cookie</b>：记住语言、地区等设置。</li>' +
      '<li><b>分析 Cookie</b>：匿名统计访问，帮助改善服务。</li></ul>' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:10px">' +
      btn("ckAll", "✓ 全部接受", "#2ebd6b") + btn("ckPart", "部分接受", "#caa24a", "#1a1a1a") + btn("ckNo", "全部拒绝", "#d9534f") +
      '</div><p style="font-size:12px;color:#7f8c9b;margin-top:10px">注：选择「全部拒绝」将无法访问本站。</p>'));
    document.getElementById("ckAll").onclick = function () { ls(CK, "all"); afterCookie(); };
    document.getElementById("ckNo").onclick = function () { ls(CK, "none"); denyAccess("您已拒绝全部 Cookie，依本站设置无法访问。如需访问，请重新选择并至少接受必要 Cookie。"); };
    document.getElementById("ckPart").onclick = cookiePartial;
  }
  function cookiePartial() {
    overlay(box(
      '<h2 style="margin:0 0 6px;color:#ffce4d">🍪 部分接受 Cookie</h2>' +
      '<label style="display:block;margin:8px 0;color:#9fb3c8"><input type="checkbox" checked disabled> 必要 Cookie（必须，维持运行）</label>' +
      '<label style="display:block;margin:8px 0"><input type="checkbox" id="ckPref" checked> 偏好 Cookie（记住设置）</label>' +
      '<label style="display:block;margin:8px 0"><input type="checkbox" id="ckAna"> 分析 Cookie（匿名统计）</label>' +
      '<div style="text-align:center;margin-top:12px">' + btn("ckSave", "保存并继续", "#2ebd6b") + '</div>'));
    document.getElementById("ckSave").onclick = function () {
      ls(CK, "part:" + (document.getElementById("ckPref").checked ? 1 : 0) + (document.getElementById("ckAna").checked ? 1 : 0));
      afterCookie();
    };
  }
  function afterCookie() {
    if (ls(KEY) === "1") { enter(); return; }
    fetch("/api/agecheck").then(function (r) { return r.json(); })
      .then(function (info) { if (info && info.gate) declare(info); else enter(); })
      .catch(function () { declare({ gate: true }); });
  }

  /* ===== 协议视频（计时逐页·不可快进） ===== */
  var VID22 = [
    "🟢 欢迎。本站为<b>虚构演绎·仅供娱乐</b>的音视频检测演示。",
    "⚠ <b>严禁相信任何「维度 / 绿太阳指数」信息</b>，结果不科学、可能完全错误。",
    "🚫 <b>本指数不可交易；私下涉赌属违法犯罪</b>，严禁任何下注、对赌。",
    "🌱 <b>防沉迷</b>：适度娱乐、注意休息、合理安排时间，切勿沉迷。",
    "©️ 音频字典版权属<b>中国网易公司</b>：严禁盗版/分发；下载请于 <b>24 小时内删除</b>。",
    "🛡 本站受多重安全与法律保护监管；越界行为可被依法追究。",
    "✅ 进入需<b>年满 " + MIN + " 周岁</b>。看完后将询问您是否同意收集基本访客信息。"
  ];
  var VID_U = [
    "📚 这是<b>用户协议（二）</b>，请认真观看，稍后所有访客都需参加理解考核。",
    "⚠ <b>严禁相信「维度」信息</b>，结果均为虚构、可能完全错误。",
    "🚫 <b>严禁参与任何赌博</b>；私下涉赌属<b>违法犯罪</b>。",
    "🌱 <b>防沉迷</b>：每次适度、规律作息、多去户外、不要熬夜。",
    "©️ 音频字典版权属<b>中国网易公司</b>，严禁盗版/分发，下载须 <b>24 小时内删除</b>。",
    "🔞 进入本站须<b>年满 " + MIN + " 周岁</b>并遵守全部条款。",
    "📝 接下来 <b>19 题</b>：11 题理解考核（需 ≥" + PASS + " 分）+ 8 题用户画像。认真观看才能答对！"
  ];
  function playVideo(slides, title, onDone) {
    var i = 0, per = 13, total = slides.length * per, t = 0, timer;
    overlay(box(
      '<h2 style="margin:0 0 4px;color:#ffce4d">🎬 ' + title + '</h2>' +
      '<div style="height:8px;background:#0a0f15;border-radius:6px;margin:8px 0 16px;overflow:hidden"><div id="vbar" style="height:100%;width:0;background:#2ebd6b;transition:width .9s linear"></div></div>' +
      '<div id="vslide" style="min-height:150px;font-size:20px;display:flex;align-items:center">…</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">' +
      '<span id="vtime" style="color:#7f8c9b;font-size:13px"></span>' +
      '<button id="vnext" disabled style="padding:11px 24px;font-size:15px;background:#2a3340;color:#7f8c9b;border:none;border-radius:9px;cursor:not-allowed">请看完（不可快进）</button></div>'));
    var sl = document.getElementById("vslide"), bar = document.getElementById("vbar"),
        tm = document.getElementById("vtime"), nx = document.getElementById("vnext");
    sl.innerHTML = slides[0];
    timer = setInterval(function () {
      t++; bar.style.width = Math.min(100, t / total * 100) + "%";
      tm.textContent = "协议播放 " + t + " / " + total + " 秒";
      var want = Math.min(slides.length - 1, Math.floor(t / per));
      if (want !== i) { i = want; sl.innerHTML = slides[i]; }
      if (t >= total) {
        clearInterval(timer);
        nx.disabled = false; nx.textContent = "我已看完 · 下一步 ▶";
        nx.style.cssText = "padding:11px 24px;font-size:15px;background:#2ebd6b;color:#fff;border:none;border-radius:9px;cursor:pointer";
        nx.onclick = onDone;
      }
    }, 1000);
  }

  /* ===== 视频一后：访客信息收集授权 ===== */
  function visitorInfo() {
    overlay(box(
      '<h2 style="margin:0 0 6px;color:#ffce4d">🔐 访客信息收集授权</h2>' +
      '<p>为改善服务，本站希望收集您的<b>基本访客信息</b>：</p>' +
      '<ul style="margin:6px 0 10px;padding-left:20px;color:#9fb3c8"><li>浏览器与设备类型、语言、时区、屏幕尺寸</li><li>所在地区（按 IP 粗略判断，非精确定位）</li><li>您在后续问卷中<b>自愿填写</b>的偏好</li></ul>' +
      '<p style="font-size:12px;color:#7f8c9b"><b>不收集</b>任何身份证件、不收集精确定位、不收集敏感信息。您可拒绝，拒绝不影响进入。</p>' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:12px">' +
      btn("viYes", "✓ 我同意收集基本访客信息", "#2ebd6b") + btn("viNo", "不同意（仍可进入）", "#6c7a89") + '</div>'));
    document.getElementById("viYes").onclick = function () { visitorConsent = true; ls(VI, "1"); gotoVideo2(); };
    document.getElementById("viNo").onclick = function () { visitorConsent = false; ls(VI, "0"); gotoVideo2(); };
  }
  function gotoVideo2() { playVideo(VID_U, "用户协议（二 / 二） · 约90秒", quiz); }

  /* ===== 19 题：11 判分 + 8 画像 ===== */
  var GRADE = [
    { q: "本站的「维度 / 绿太阳指数」本质是？", o: ["真实可靠的投资指标", "虚构演绎、仅供娱乐", "官方天气预报", "可下注的盘口"], a: 1 },
    { q: "关于赌博，正确的是？", o: ["小额没关系", "私下涉赌属违法犯罪，严禁", "娱乐性对赌合法", "赢了就行"], a: 1 },
    { q: "看到离谱的「维度」结果应该？", o: ["相信并照做", "当成真实预测", "不相信，仅当娱乐", "拿去对赌"], a: 2 },
    { q: "音频字典版权归？", o: ["本站作者", "中国网易公司", "无版权", "谁下载归谁"], a: 1 },
    { q: "下载了音频字典应在多久内删除？", o: ["不用删", "一周内", "24 小时内", "随意"], a: 2 },
    { q: "哪项是【正确】防沉迷做法？", o: ["通宵也行", "适度娱乐、规律作息、不沉迷", "越久越好", "熬夜刷指数"], a: 1 },
    { q: "进入本站的最低年龄？", o: ["16 周岁", "18 周岁", "22 周岁", "无限制"], a: 2 },
    { q: "「满了岁数就能把指数用于真实下注」这句话？", o: ["正确", "错误，任何情况严禁涉赌", "看金额", "周末可以"], a: 1 },
    { q: "本站结果的科学性？", o: ["科学准确", "不科学、可能完全错误", "官方认证", "可作现实决策"], a: 1 },
    { q: "用户协议要求你？", o: ["无需阅读直接同意", "认真阅读并遵守：不沉迷不涉赌不盗版", "随便看看", "同意后可不遵守"], a: 1 },
    { q: "把音频字典转发给同学，是否可以？", o: ["可以，分享知识", "可以，反正免费", "不可以，严禁分发、涉侵权", "改个名就行"], a: 2 }
  ];
  var PROFILE = [
    { k: "age", q: "（画像）您的年龄段？", o: ["不满18", "18-21", "22-29", "30-44", "45 及以上"] },
    { k: "gender", q: "（画像·可选）您的性别？", o: ["男", "女", "不愿透露"] },
    { k: "source", q: "（画像）您如何得知本站？", o: ["搜索引擎", "朋友推荐", "社交媒体", "其他"] },
    { k: "freq", q: "（画像）预计使用频率？", o: ["偶尔", "每周", "每天"] },
    { k: "device", q: "（画像）主要使用设备？", o: ["手机", "电脑", "平板"] },
    { k: "lang", q: "（画像）常用语言？", o: ["中文", "英文", "其他"] },
    { k: "interest", q: "（画像）最感兴趣的内容？", o: ["电视频道", "天气/降雨", "世界地图", "技术/源码"] },
    { k: "purpose", q: "（画像）使用本站主要为了？", o: ["好奇了解", "娱乐消遣", "学习研究", "其他"] }
  ];
  function quiz() {
    var html = '<h2 style="margin:0 0 4px;color:#ffce4d">📝 进入考核与问卷（共 19 题）</h2>' +
      '<p style="color:#7f8c9b;margin:0 0 12px">第 1–11 题为<b>理解考核</b>（需 ≥' + PASS + ' 分，含判断陷阱）；第 12–19 题为<b>用户画像</b>问卷。请全部作答。</p>';
    GRADE.forEach(function (it, qi) {
      html += '<div style="margin:0 0 12px"><div style="margin-bottom:5px"><b>' + (qi + 1) + '.</b> ' + it.q + '</div>';
      it.o.forEach(function (op, oi) { html += '<label style="display:block;padding:2px 0;color:#cfe8ff;cursor:pointer"><input type="radio" name="g' + qi + '" value="' + oi + '"> ' + op + '</label>'; });
      html += '</div>';
    });
    PROFILE.forEach(function (it, pi) {
      html += '<div style="margin:0 0 12px"><div style="margin-bottom:5px"><b>' + (pi + 12) + '.</b> ' + it.q + '</div>';
      it.o.forEach(function (op, oi) { html += '<label style="display:block;padding:2px 0;color:#cbe3c9;cursor:pointer"><input type="radio" name="p' + pi + '" value="' + oi + '"> ' + op + '</label>'; });
      html += '</div>';
    });
    html += '<div style="text-align:center;margin-top:8px">' + btn("qsub", "提交答卷", "#3a6ea5") + '</div><div id="qmsg" style="text-align:center;margin-top:10px;color:#ffce4d"></div>';
    var o = overlay(box(html));
    document.getElementById("qsub").onclick = function () {
      var correct = 0, missing = 0;
      GRADE.forEach(function (it, qi) {
        var s = o.querySelector('input[name="g' + qi + '"]:checked');
        if (!s) missing++; else if (parseInt(s.value, 10) === it.a) correct++;
      });
      PROFILE.forEach(function (it, pi) {
        var s = o.querySelector('input[name="p' + pi + '"]:checked');
        if (!s) missing++; else portrait[it.k] = it.o[parseInt(s.value, 10)];
      });
      if (missing) { document.getElementById("qmsg").textContent = "还有 " + missing + " 题未作答（19 题需全部作答）。"; return; }
      var score = Math.round(correct / GRADE.length * 100);
      if (score >= PASS) { savePortrait(); agreeFinal(); }
      else { denyAccess("理解考核未通过：得分 " + score + " 分（需 ≥" + PASS + "，答对 " + correct + "/" + GRADE.length + " 题）。为保护青少年与确保理解条款，谢绝进入，可重新观看学习。"); }
    };
  }
  function savePortrait() {
    portrait.ts = Date.now();
    ls("gt_portrait", JSON.stringify(portrait));
    // 仅在【访客同意收集】时，附带浏览器/语言/时区等基本信息上报(非敏感、非身份证件)
    if (visitorConsent) {
      try {
        var basic = {
          lang: navigator.language, tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
          screen: (screen.width + "x" + screen.height), ua: navigator.userAgent.slice(0, 120)
        };
        fetch("/api/portrait", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portrait: portrait, basic: basic, consent: true })
        }).catch(function () {});
      } catch (e) {}
    }
  }

  /* ===== 通过后：下拉同意 → 进入 ===== */
  function agreeFinal() {
    var terms = VID22.concat(VID_U).map(function (s) { return "<p>" + s.replace(/<\/?b>/g, "") + "</p>"; }).join("") +
      "<p>本人确认已<b>年满 " + MIN + " 周岁</b>，已完整观看两份协议、通过理解考核，已阅读并同意上述全部条款，承诺不沉迷、不涉赌、不盗版，仅作娱乐参考。</p>" +
      "<p style='color:#7f8c9b'>（请滑动到本段最底部，方可勾选同意。）</p>";
    overlay(box(
      '<h2 style="margin:0 0 8px;color:#ffce4d">📜 用户协议确认（需阅读到底）</h2>' +
      '<div id="tbox" style="height:240px;overflow:auto;background:#0a0f15;border:1px solid #243140;border-radius:8px;padding:12px 16px">' + terms + '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin:14px 0;color:#9fb3c8"><input type="checkbox" id="agck" disabled> 我已阅读到底并<b style="color:#e6e6e6">同意本协议</b></label>' +
      '<div style="text-align:center"><button id="agbtn" disabled style="padding:12px 28px;font-size:15px;background:#2a3340;color:#7f8c9b;border:none;border-radius:9px;cursor:not-allowed">同意并进入</button></div>'));
    var tb = document.getElementById("tbox"), ck = document.getElementById("agck"), b = document.getElementById("agbtn");
    tb.addEventListener("scroll", function () { if (tb.scrollTop + tb.clientHeight >= tb.scrollHeight - 6) ck.disabled = false; });
    ck.addEventListener("change", function () {
      b.disabled = !ck.checked;
      b.style.cssText = ck.checked ? "padding:12px 28px;font-size:15px;background:#2ebd6b;color:#fff;border:none;border-radius:9px;cursor:pointer"
        : "padding:12px 28px;font-size:15px;background:#2a3340;color:#7f8c9b;border:none;border-radius:9px;cursor:not-allowed";
    });
    b.addEventListener("click", function () { if (ck.checked) enter(); });
  }

  /* ===== 进入须知 ===== */
  function declare(info) {
    var country = (info && info.country) ? info.country : "您所在地区";
    portrait.region = (info && info.region) || ""; portrait.country = (info && info.country) || "";
    overlay(box(
      '<h2 style="margin:0 0 6px;color:#ffce4d">🔞 进入须知 · 青少年防沉迷</h2>' +
      '<p style="color:#9fb3c8">检测到您来自 <b>' + country + '</b>。本站需<b>年满 ' + MIN + ' 周岁</b>。依青少年保护与防沉迷要求，<b>所有访客须完整观看两份用户协议（约 3 分钟）并通过 19 题考核（其中理解题 ≥' + PASS + ' 分）</b>方可进入。<br><span style="font-size:12px;color:#7f8c9b">自我声明，仅按 IP 判地区，不采集任何身份证件信息。</span></p>' +
      '<div style="text-align:center;margin-top:16px">' + btn("agStart", "开始观看协议（共两份）▶", "#2ebd6b") + '</div>'));
    document.getElementById("agStart").onclick = function () {
      playVideo(VID22, "用户协议（一 / 二） · 约90秒", visitorInfo);
    };
  }

  function enter() {
    ls(KEY, "1");
    var o = document.getElementById("ageGate"); if (o) o.remove();
    if (typeof showEntryWarning === "function") showEntryWarning();
  }

  function init() {
    if (ls(KEY) === "1") { if (typeof showEntryWarning === "function") showEntryWarning(); return; }
    if (!ls(CK)) { cookieConsent(); return; }       // 未做 Cookie 选择 → 先 Cookie
    if (ls(CK) === "none") { cookieConsent(); return; }
    afterCookie();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
