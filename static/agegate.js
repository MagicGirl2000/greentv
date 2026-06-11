/* agegate.js — 青少年防沉迷进入流程：地区识别 → 年龄声明 → 必看协议「视频」(计时逐页·不可快进)
 *  ├ 已满22：看完视频 → 下拉阅读协议到底 → 同意 → 进入（双重确认）
 *  └ 未满22：看完视频 → 11题考核(含真话陷阱·需≥95分=全对) → 通过进入 / 否则拒绝访问
 *  自我声明，仅按 IP 判地区，不采集任何身份证件信息。这是本站自设进入门禁。
 */
(function () {
  var MIN = 22, PASS = 95, KEY = "gt_entry_pass";
  var $ = function (h) { var d = document.createElement("div"); d.innerHTML = h; return d.firstElementChild; };
  function overlay(inner) {
    var o = document.getElementById("ageGate"); if (o) o.remove();
    o = document.createElement("div"); o.id = "ageGate";
    o.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0a0f15;color:#e6e6e6;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;font-family:'Microsoft YaHei',Arial,sans-serif";
    o.appendChild($(inner)); document.body.appendChild(o); return o;
  }
  function box(h) { return '<div style="max-width:680px;width:100%;background:#121a24;border:1px solid #243140;border-radius:14px;padding:24px 28px;line-height:1.85">' + h + '</div>'; }

  // ---- 协议「视频」幻灯片 ----
  var VID22 = [
    "🟢 欢迎。本站为<b>虚构演绎·仅供娱乐</b>的音视频检测演示。",
    "⚠ <b>严禁相信任何「维度 / 界域 / 绿太阳指数」信息</b>，结果不科学、可能完全错误。",
    "🚫 <b>本指数不可交易；私下涉赌属违法犯罪</b>，严禁任何下注、对赌行为。",
    "🌱 <b>防沉迷</b>：适度娱乐、注意休息、合理安排时间，切勿沉迷。",
    "©️ 音频字典版权属<b>中国网易公司</b>：严禁解码盗版或分发；如下载请于 <b>24 小时内删除</b>。",
    "🛡 本站受多重安全与法律保护监管；越界行为可被依法追究。",
    "✅ 进入需<b>年满 " + MIN + " 周岁</b>。接下来请观看<b>协议（二）</b>。"
  ];
  var VID_U = [
    "📚 这是<b>用户协议（二）</b>，请<b>认真观看学习</b>，稍后所有访客都需参加理解考核。",
    "⚠ <b>严禁相信「维度」信息</b>，所有结果均为虚构、可能完全错误。",
    "🚫 <b>严禁参与任何赌博</b>；私下涉赌属<b>违法犯罪</b>。",
    "🌱 <b>防沉迷</b>：每次适度、规律作息、多去户外、不要熬夜。",
    "©️ 音频字典版权属<b>中国网易公司</b>，严禁盗版/分发，下载须 <b>24 小时内删除</b>。",
    "🔞 进入本站须<b>年满 " + MIN + " 周岁</b>，并遵守上述全部条款。",
    "📝 接下来 <b>11 题考核（需 ≥" + PASS + " 分）</b>，认真观看才能答对！"
  ];

  function playVideo(slides, title, onDone) {
    var i = 0, per = 13, total = slides.length * per, t = 0, timer;
    overlay(box(
      '<h2 style="margin:0 0 4px;color:#ffce4d">🎬 ' + title + '</h2>' +
      '<div style="height:8px;background:#0a0f15;border-radius:6px;margin:8px 0 16px;overflow:hidden"><div id="vbar" style="height:100%;width:0;background:#2ebd6b;transition:width .9s linear"></div></div>' +
      '<div id="vslide" style="min-height:150px;font-size:20px;display:flex;align-items:center">…</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">' +
      '<span id="vtime" style="color:#7f8c9b;font-size:13px"></span>' +
      '<button id="vnext" disabled style="padding:11px 24px;font-size:15px;background:#2a3340;color:#7f8c9b;border:none;border-radius:9px;cursor:not-allowed">请看完（不可快进）</button>' +
      '</div>'));
    var sl = document.getElementById("vslide"), bar = document.getElementById("vbar"),
        tm = document.getElementById("vtime"), nx = document.getElementById("vnext");
    function show() { sl.innerHTML = slides[i]; }
    show();
    timer = setInterval(function () {
      t++;
      bar.style.width = Math.min(100, t / total * 100) + "%";
      tm.textContent = "协议播放 " + t + " / " + total + " 秒";
      var want = Math.min(slides.length - 1, Math.floor(t / per));
      if (want !== i) { i = want; show(); }
      if (t >= total) {
        clearInterval(timer);
        nx.disabled = false; nx.textContent = "我已看完 · 下一步 ▶";
        nx.style.cssText = "padding:11px 24px;font-size:15px;background:#2ebd6b;color:#fff;border:none;border-radius:9px;cursor:pointer";
        nx.onclick = onDone;
      }
    }, 1000);
  }

  // ---- 通过考核后：下拉阅读协议 → 双重确认 ----
  function agreeFinal() {
    var terms = VID22.concat(VID_U).map(function (s) { return "<p>" + s.replace(/<\/?b>/g, "") + "</p>"; }).join("") +
      "<p>本人确认已<b>年满 " + MIN + " 周岁</b>，已阅读并同意上述全部条款，承诺不沉迷、不涉赌、不盗版，仅作娱乐参考。</p>" +
      "<p style='color:#7f8c9b'>（请滑动到本段最底部，方可勾选同意。）</p>";
    overlay(box(
      '<h2 style="margin:0 0 8px;color:#ffce4d">📜 用户协议（需阅读到底）</h2>' +
      '<div id="tbox" style="height:240px;overflow:auto;background:#0a0f15;border:1px solid #243140;border-radius:8px;padding:12px 16px">' + terms + '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;margin:14px 0;color:#9fb3c8"><input type="checkbox" id="agck" disabled> 我已阅读到底并<b style="color:#e6e6e6">同意本协议</b>（满 ' + MIN + ' 周岁）</label>' +
      '<div style="text-align:center"><button id="agbtn" disabled style="padding:12px 28px;font-size:15px;background:#2a3340;color:#7f8c9b;border:none;border-radius:9px;cursor:not-allowed">同意并进入</button></div>'));
    var tb = document.getElementById("tbox"), ck = document.getElementById("agck"), btn = document.getElementById("agbtn");
    tb.addEventListener("scroll", function () {
      if (tb.scrollTop + tb.clientHeight >= tb.scrollHeight - 6) { ck.disabled = false; }
    });
    ck.addEventListener("change", function () {
      var ok = ck.checked;
      btn.disabled = !ok;
      btn.style.cssText = ok ? "padding:12px 28px;font-size:15px;background:#2ebd6b;color:#fff;border:none;border-radius:9px;cursor:pointer"
                             : "padding:12px 28px;font-size:15px;background:#2a3340;color:#7f8c9b;border:none;border-radius:9px;cursor:not-allowed";
    });
    btn.addEventListener("click", function () { if (ck.checked) pass(); });
  }

  // ---- 未满22：11题考核（含真话陷阱，需全对 ≥95）----
  var QUIZ = [
    { q: "本站的「维度 / 绿太阳指数」本质是？", o: ["真实可靠的投资指标", "虚构演绎、仅供娱乐", "官方天气预报", "可用于下注的盘口"], a: 1 },
    { q: "关于赌博，下列正确的是？", o: ["小额下注没关系", "私下涉赌属违法犯罪，严禁", "娱乐性对赌是合法的", "赢了就可以"], a: 1 },
    { q: "看到离谱的「维度」结果，应该？", o: ["相信并照着做决定", "当成真实预测", "不相信，仅当娱乐", "拿去和别人对赌"], a: 2 },
    { q: "音频字典的版权归属是？", o: ["本站作者", "中国网易公司", "没有版权、随便用", "谁下载归谁"], a: 1 },
    { q: "若下载了音频字典，应在多久内删除？", o: ["不用删除", "一周内", "24 小时内", "随意"], a: 2 },
    { q: "下列哪项是【正确】的防沉迷做法？", o: ["通宵使用也无妨", "适度娱乐、规律作息、不沉迷", "越久越好", "熬夜刷指数"], a: 1 },
    { q: "进入本站的最低年龄要求是？", o: ["16 周岁", "18 周岁", "22 周岁", "没有限制"], a: 2 },
    { q: "「既然我满了岁数，就能把指数用于真实下注」——这句话？", o: ["正确，可以下注", "错误，任何情况下都严禁涉赌", "看金额", "周末可以"], a: 1 },
    { q: "本站结果的科学性如何？", o: ["科学且准确", "不科学、可能完全错误", "经过官方认证", "可作现实决策依据"], a: 1 },
    { q: "用户协议要求你做什么？", o: ["无需阅读、直接同意", "认真阅读并遵守：不沉迷、不涉赌、不盗版", "随便看看就行", "同意后就可不遵守"], a: 1 },
    { q: "把本站音频字典转发给同学，是否可以？", o: ["可以，分享知识", "可以，反正免费", "不可以，严禁分发、涉版权侵权", "改个名就行"], a: 2 }
  ];
  function quiz() {
    var html = '<h2 style="margin:0 0 4px;color:#ffce4d">📝 协议理解考核（11题 · 需 ≥' + PASS + ' 分）</h2>' +
      '<p style="color:#7f8c9b;margin:0 0 12px">认真作答，含判断陷阱。未达 ' + PASS + ' 分将谢绝进入。</p>';
    QUIZ.forEach(function (it, qi) {
      html += '<div style="margin:0 0 14px"><div style="margin-bottom:6px"><b>' + (qi + 1) + '.</b> ' + it.q + '</div>';
      it.o.forEach(function (op, oi) {
        html += '<label style="display:block;padding:3px 0;color:#cfe8ff;cursor:pointer"><input type="radio" name="q' + qi + '" value="' + oi + '"> ' + op + '</label>';
      });
      html += '</div>';
    });
    html += '<div style="text-align:center;margin-top:8px"><button id="qsub" style="padding:12px 28px;font-size:15px;background:#3a6ea5;color:#fff;border:none;border-radius:9px;cursor:pointer">提交答卷</button></div><div id="qmsg" style="text-align:center;margin-top:10px;color:#ffce4d"></div>';
    var o = overlay('<div style="max-width:680px;width:100%;background:#121a24;border:1px solid #243140;border-radius:14px;padding:24px 28px;line-height:1.7;max-height:88vh;overflow:auto">' + html + '</div>');
    document.getElementById("qsub").addEventListener("click", function () {
      var correct = 0, unanswered = 0;
      QUIZ.forEach(function (it, qi) {
        var sel = o.querySelector('input[name="q' + qi + '"]:checked');
        if (!sel) unanswered++;
        else if (parseInt(sel.value, 10) === it.a) correct++;
      });
      if (unanswered) { document.getElementById("qmsg").textContent = "还有 " + unanswered + " 题未作答。"; return; }
      var score = Math.round(correct / QUIZ.length * 100);
      if (score >= PASS) { agreeFinal(); }
      else { deny("考核未通过：得分 " + score + " 分（满分 100，需 ≥" + PASS + "）。答对 " + correct + "/" + QUIZ.length + " 题。"); }
    });
  }

  function deny(reason) {
    document.documentElement.innerHTML =
      '<body style="margin:0;background:#0a0f15;color:#e6e6e6;font-family:Microsoft YaHei,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">' +
      '<div style="max-width:540px;padding:24px"><div style="font-size:54px">🌱</div>' +
      '<h2 style="color:#ffce4d">谢绝进入</h2>' +
      '<p style="line-height:1.9;color:#9fb3c8">' + (reason || "未满 " + MIN + " 周岁，禁止进入。") + '<br>为保护青少年健康成长，请多走出户外、规律作息。祝你拥有美好的一天！</p>' +
      '<button onclick="location.reload()" style="margin-top:8px;padding:10px 22px;background:#3a6ea5;color:#fff;border:none;border-radius:8px;cursor:pointer">重新观看学习</button></div></body>';
  }

  function pass() {
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
    var o = document.getElementById("ageGate"); if (o) o.remove();
    if (typeof showEntryWarning === "function") showEntryWarning();
  }

  function declare(info) {
    var country = (info && info.country) ? info.country : "您所在地区";
    overlay(box(
      '<h2 style="margin:0 0 6px;color:#ffce4d">🔞 进入须知 · 青少年防沉迷</h2>' +
      '<p style="color:#9fb3c8">检测到您来自 <b>' + country + '</b>。本站需<b>年满 ' + MIN + ' 周岁</b>。依据青少年保护与防沉迷要求，<b>所有访客均须完整观看两份用户协议（约 3 分钟）并通过理解考核（≥' + PASS + ' 分）</b>方可进入。<br><span style="font-size:12px;color:#7f8c9b">自我声明，仅按 IP 判地区，不采集任何身份证件信息。</span></p>' +
      '<div style="text-align:center;margin-top:16px">' +
      '<button id="agStart" style="padding:12px 28px;font-size:15px;background:#2ebd6b;color:#fff;border:none;border-radius:9px;cursor:pointer">开始观看协议（共两份）▶</button>' +
      '</div>'));
    document.getElementById("agStart").onclick = function () {
      playVideo(VID22, "用户协议（一 / 二） · 约90秒", function () {
        playVideo(VID_U, "用户协议（二 / 二） · 约90秒", quiz);
      });
    };
  }

  function init() {
    try { if (localStorage.getItem(KEY) === "1") { if (typeof showEntryWarning === "function") showEntryWarning(); return; } } catch (e) {}
    var done = function (info) { if (info && info.gate) declare(info); else if (typeof showEntryWarning === "function") showEntryWarning(); };
    fetch("/api/agecheck").then(function (r) { return r.json(); }).then(done).catch(function () { done({ gate: true }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
