/* auth.js — 绿太阳用户系统前端：邮箱验证码注册 / 登录 / 会话。
 * 会话 token 存 localStorage(gt_token)；登录后头部显示用户名；window.gtUser() 供其它模块(维度世界)取用户名。
 */
(function () {
  var TK = "gt_token";
  function tok() { return localStorage.getItem(TK) || ""; }
  function setTok(t) { if (t) localStorage.setItem(TK, t); else localStorage.removeItem(TK); }
  window._gtuser = null;
  window.gtUser = function () { return window._gtuser; };

  function api(path, body) {
    return fetch("/api/auth/" + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Auth": tok() },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json(); });
  }
  function setLink() {
    var a = document.getElementById("authLink"); if (!a) return;
    a.textContent = window._gtuser ? ("👤 " + window._gtuser) : "👤 登录/注册";
  }
  function refresh() {
    if (!tok()) { window._gtuser = null; setLink(); return; }
    api("me").then(function (r) { window._gtuser = r.user || null; setLink(); }).catch(function () {});
  }

  function ov(html) {
    var o = document.getElementById("authOv"); if (o) o.remove();
    o = document.createElement("div"); o.id = "authOv";
    o.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Microsoft YaHei',Arial,sans-serif";
    o.innerHTML = '<div style="max-width:380px;width:100%;background:#121a24;border:1px solid #243140;border-radius:14px;padding:22px 24px;color:#e6e6e6;line-height:1.7">' + html + '</div>';
    o.addEventListener("click", function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o); return o;
  }
  function inp(id, ph, type) { return '<input id="' + id + '" type="' + (type || "text") + '" placeholder="' + ph + '" style="width:100%;margin:5px 0;padding:9px 11px;background:#0a0f15;border:1px solid #2a3340;border-radius:8px;color:#e6e6e6;font-size:14px">'; }
  function btn(id, t, c) { return '<button id="' + id + '" style="padding:10px 18px;font-size:14px;background:' + (c || "#2ebd6b") + ';color:#fff;border:none;border-radius:8px;cursor:pointer">' + t + '</button>'; }

  function showAuth(tab) {
    if (window._gtuser) { return showAccount(); }
    tab = tab || "reg";
    var head = '<div style="display:flex;gap:10px;margin-bottom:12px">' +
      '<b id="tReg" style="cursor:pointer;color:' + (tab === "reg" ? "#2ebd6b" : "#8b97a6") + '">注册</b>' +
      '<b id="tLog" style="cursor:pointer;color:' + (tab === "log" ? "#2ebd6b" : "#8b97a6") + '">登录</b>' +
      '<span style="margin-left:auto;cursor:pointer;color:#8b97a6" id="aX">✕</span></div>';
    var body;
    if (tab === "reg") {
      body = '<h2 style="color:#2ebd6b;font-size:18px;margin:0 0 8px">注册绿太阳账号</h2>' +
        inp("rEmail", "邮箱（用于验证码）", "email") +
        '<div style="display:flex;gap:8px">' + inp("rCode", "邮箱验证码") + '<button id="rSend" style="white-space:nowrap;padding:0 12px;background:#3a6ea5;color:#fff;border:none;border-radius:8px;cursor:pointer">发送验证码</button></div>' +
        inp("rUser", "用户名（2-16字符）") + inp("rPw", "密码（至少6位）", "password") +
        '<div id="aMsg" style="color:#ffce4d;font-size:12px;min-height:16px;margin:6px 0"></div>' +
        '<div style="text-align:center">' + btn("rGo", "完成注册") + '</div>' +
        '<p style="color:#7f8c9b;font-size:11px;margin-top:8px">注册即同意本站用户协议与免责声明。本站为虚构演绎·仅供娱乐。</p>';
    } else {
      body = '<h2 style="color:#2ebd6b;font-size:18px;margin:0 0 8px">登录</h2>' +
        inp("lId", "用户名 或 邮箱") + inp("lPw", "密码", "password") +
        '<div id="aMsg" style="color:#ffce4d;font-size:12px;min-height:16px;margin:6px 0"></div>' +
        '<div style="text-align:center">' + btn("lGo", "登录") + '</div>';
    }
    var o = ov(head + body);
    var msg = function (t, ok) { var m = o.querySelector("#aMsg"); if (m) { m.textContent = t; m.style.color = ok ? "#2ebd6b" : "#ffce4d"; } };
    o.querySelector("#aX").onclick = function () { o.remove(); };
    o.querySelector("#tReg").onclick = function () { showAuth("reg"); };
    o.querySelector("#tLog").onclick = function () { showAuth("log"); };
    if (tab === "reg") {
      var sendBtn = o.querySelector("#rSend"); var cooldown = 0;
      sendBtn.onclick = function () {
        var em = o.querySelector("#rEmail").value;
        msg("发送中…");
        api("code", { email: em }).then(function (r) {
          msg(r.msg || (r.ok ? "已发送" : "失败"), r.ok);
          if (r.demo_code) o.querySelector("#rCode").value = r.demo_code;     // 演示模式自动填
          if (r.ok) { var n = 50; sendBtn.disabled = true; var iv = setInterval(function () { sendBtn.textContent = (--n) + "s"; if (n <= 0) { clearInterval(iv); sendBtn.disabled = false; sendBtn.textContent = "重发验证码"; } }, 1000); }
        });
      };
      o.querySelector("#rGo").onclick = function () {
        msg("提交中…");
        api("register", { username: o.querySelector("#rUser").value, email: o.querySelector("#rEmail").value, password: o.querySelector("#rPw").value, code: o.querySelector("#rCode").value })
          .then(function (r) { if (r.ok) { setTok(r.token); window._gtuser = r.user; setLink(); msg("注册成功！", true); setTimeout(function () { o.remove(); }, 700); } else msg(r.msg || "失败"); });
      };
    } else {
      o.querySelector("#lGo").onclick = function () {
        msg("登录中…");
        api("login", { login: o.querySelector("#lId").value, password: o.querySelector("#lPw").value })
          .then(function (r) { if (r.ok) { setTok(r.token); window._gtuser = r.user; setLink(); msg("登录成功！", true); setTimeout(function () { o.remove(); }, 600); } else msg(r.msg || "失败"); });
      };
    }
  }
  function showAccount() {
    var o = ov('<h2 style="color:#2ebd6b;font-size:18px;margin:0 0 8px">👤 ' + window._gtuser + '</h2>' +
      '<p style="color:#9fb3c8">已登录。你在「维度世界」建造的物件会标注此用户名。</p>' +
      '<div style="display:flex;gap:10px;margin-top:10px"><button id="aLogout" style="padding:9px 16px;background:#5a2a2a;color:#fff;border:none;border-radius:8px;cursor:pointer">退出登录</button>' +
      '<button id="aClose2" style="padding:9px 16px;background:#3a4555;color:#fff;border:none;border-radius:8px;cursor:pointer">关闭</button></div>');
    o.querySelector("#aClose2").onclick = function () { o.remove(); };
    o.querySelector("#aLogout").onclick = function () { api("logout", {}); setTok(""); window._gtuser = null; setLink(); o.remove(); };
  }
  window.openAuth = showAuth;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh); else refresh();
})();
