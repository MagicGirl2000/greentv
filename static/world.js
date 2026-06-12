/* world.js — 绿太阳·维度世界（每个频道一个小世界，纯本地沙盒，不连接真实维度）
 * 三模式：建造(绿) / 自动(黄·AI按频道维度自动建城建国) / 战争(红·拆除→回收材料)。
 * 绿 = 再生与循环：拆除即回收，循环不息。维度越高越绿越省，回收越多。
 * 自动模式核心：按频道当前【维度/指数】选主题，程序化生成 道路+建筑+地标+树木+国旗 的小世界城市。
 * 物件带【用户名+建造时间】，永久保存在该频道的小世界(localStorage)。需 three.min.js(全局 THREE)。
 */
(function () {
  var W = { open: false };

  // 维度 → 主题(取自界域字典常用段)：名称、建筑色、最高层、地标、树色
  function realmStyle(dim) {
    var d = Math.round(dim || 3), o = ((d % 10) + 10) % 10;
    var M = {
      1: { n: "地狱", b: [0x7a2b2b, 0x5a1f1f], hi: 4, mk: "spire_dark", tree: 0x6b3b2b },
      2: { n: "鬼界/丧尸", b: [0x556b2f, 0x3f4f22], hi: 3, mk: "tower", tree: 0x4f5f2f },
      3: { n: "人间(均衡)", b: [0xbcae8e, 0x9fae8e, 0xd6cfa8], hi: 6, mk: "pagoda", tree: 0x3f8f3f },
      4: { n: "魔界", b: [0x5a2a7a, 0x3a1a5a, 0x7a3aa0], hi: 9, mk: "spire_dark", tree: 0x4a2a6a },
      5: { n: "机械生命", b: [0x8a99aa, 0x67788a, 0xaab4c0], hi: 8, mk: "tower_metal", tree: 0x7a8a7a },
      6: { n: "虚拟界", b: [0x2a7adf, 0x1e5fbf, 0x3aa0ff], hi: 7, mk: "dome", tree: 0x2aa0a0 },
      7: { n: "天使界", b: [0xfaf3d0, 0xe8e0b8, 0xffffff], hi: 7, mk: "spire_white", tree: 0x9fd3a0 },
      8: { n: "龙兽界", b: [0x8a5a2b, 0x6a431d, 0xb5651d], hi: 5, mk: "pyramid", tree: 0x5f7f2f },
      9: { n: "仙佛界", b: [0xffd700, 0xe0b000, 0xfff0a0], hi: 8, mk: "pagoda", tree: 0x6fae6f },
      0: { n: "外循环·大循环(人间)", b: [0x4f8f4f, 0x6fae6f, 0x8fce8f], hi: 6, mk: "pagoda", tree: 0x2f8f2f }
    };
    var s = M[d] || M[o] || M[3];
    // 高维更绿更清(主题微调)
    if (d >= 40) s = Object.assign({}, s, { mk: (d % 2 ? "pyramid" : "pagoda") });
    s.dim = d; s.greenish = Math.min(1, d / 60);
    return s;
  }
  function curChannel() {
    var id = (window.curId || "GREEN"), name = "综合", dim = 19;
    try {
      var d = window._lastData;
      if (window.curId && d) {
        var c = (d.channels || []).find(function (x) { return x.id === window.curId; });
        if (c) { name = c.name || c.id; dim = c.dim != null ? c.dim : dim; }
      } else if (d && d.green) { dim = d.green.dim != null ? d.green.dim : dim; }
    } catch (e) {}
    return { id: id, name: name, dim: dim };
  }
  function uname() {
    if (window.gtUser && window.gtUser()) return window.gtUser();       // 已登录 → 用账号用户名
    var u = localStorage.getItem("gt_world_user");
    if (!u) { u = (prompt("给维度开创者起个用户名（建议先登录/注册账号）：", "开创者") || "匿名").slice(0, 16); localStorage.setItem("gt_world_user", u); }
    return u;
  }
  function hex(c) { return "#" + ("000000" + (c >>> 0).toString(16)).slice(-6); }
  function pickc(a) { return a[Math.floor(Math.random() * a.length)]; }

  function openWorld() {
    if (W.open) return; W.open = true;
    var ch = curChannel(), st = realmStyle(ch.dim), user = uname();
    var costFactor = Math.max(0.2, 1 - (st.dim / 200));
    var econ = { funds: 200000, mat: 200000 };
    var pal = ["#eab308", "#3b82f6", "#22c55e", "#ef4444", "#f97316", "#86efac", "#1e3a8a", "#38bdf8", "#a855f7"];
    var sky = "#0a1a2a", land = hex(0x1f4d1f + (st.greenish * 0x103010 | 0)), sea = "#13406b",
        sunColor = st.dim >= 40 ? "#bfe8a0" : "#ffd24a", sunCount = 1, blockColor = "#22c55e";

    var ov = document.createElement("div"); ov.id = "worldOv";
    ov.style.cssText = "position:fixed;inset:0;z-index:100000;background:#000;font-family:'Microsoft YaHei',Arial,sans-serif";
    ov.innerHTML =
      '<canvas id="wcv" style="display:block;width:100%;height:100%"></canvas>' +
      '<div style="position:absolute;top:10px;left:12px;color:#cfe8ff;background:rgba(10,16,22,.8);padding:10px 13px;border-radius:10px;max-width:320px;font-size:13px;line-height:1.7">' +
      '<b style="color:#7fd1ff">🎮 维度世界</b> · ' + ch.name + '<br>维度/指数 <b>' + st.dim + '</b> ｜ <b style="color:#9be29b">' + st.n + '</b><br>' +
      '开创者 <b>' + user + '</b> ｜ 成本系数 ' + costFactor.toFixed(2) + '<br>' +
      '<span id="wecon">资金 ' + econ.funds + ' ｜ 材料 ' + econ.mat + '</span> ｜ <span id="wcnt">物件 0</span><br>' +
      '<span style="color:#22c55e;font-size:12px">🟢 绿=再生与循环：拆除即回收，循环不息。</span><br>' +
      '<span style="color:#8b97a6;font-size:11px">仅本地沙盒，不连真实维度。永久保存于本频道。</span></div>' +
      '<div style="position:absolute;top:10px;right:12px;display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
      '<div><button class="wm" data-m="build" style="background:#22c55e;color:#06210d">🟢 建造</button>' +
      '<button class="wm" data-m="auto" style="background:#eab308;color:#241c00">🟡 自动建城</button>' +
      '<button class="wm" data-m="war" style="background:#ef4444;color:#2a0707">🔴 战争</button></div>' +
      '<div style="background:rgba(10,16,22,.8);padding:8px 10px;border-radius:10px;font-size:12px;color:#cfe8ff">' +
      '太阳<input type="color" id="wsun" value="' + sunColor + '">×<select id="wsc"><option>1</option><option>2</option><option>3</option></select> ' +
      '天空<input type="color" id="wsky" value="' + sky + '">大地<input type="color" id="wland" value="' + land + '">海<input type="color" id="wsea" value="' + sea + '"><br>' +
      '方块色 ' + pal.map(function (c) { return '<span class="wpal" data-c="' + c + '" style="display:inline-block;width:16px;height:16px;border-radius:3px;background:' + c + ';cursor:pointer;vertical-align:middle;margin:1px;border:1px solid #0006"></span>'; }).join('') +
      '</div>' +
      '<button id="wreset" style="background:#5a4a2a;color:#fff">重铺城市规划</button>' +
      '<button id="wclose" style="background:#3a4555;color:#fff">✕ 退出</button>' +
      '<button id="wclear" style="background:#5a2a2a;color:#fff">清空本世界</button></div>' +
      '<div id="wtip" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);color:#cfe8ff;background:rgba(10,16,22,.85);padding:6px 12px;border-radius:8px;font-size:12px"></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll("button").forEach(function (b) { if (!b.style.padding) b.style.cssText += ";padding:7px 12px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold"; });

    var cv = document.getElementById("wcv");
    var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    var scene = new THREE.Scene(); scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 70, 280);
    var cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
    var amb = new THREE.AmbientLight(0xffffff, 0.6); scene.add(amb);
    var dir = new THREE.DirectionalLight(sunColor, 1.0); dir.position.set(40, 70, 30); scene.add(dir);
    var suns = [];
    function buildSuns() {
      suns.forEach(function (s) { scene.remove(s); }); suns = [];
      for (var i = 0; i < sunCount; i++) {
        var s = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 24), new THREE.MeshBasicMaterial({ color: sunColor }));
        s.position.set(-40 + i * 26, 60 - i * 8, -30 - i * 10); scene.add(s); suns.push(s);
      } dir.color.set(sunColor);
    }
    buildSuns();
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: land }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    var ocean = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: sea, transparent: true, opacity: 0.85 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.y = -1.4; scene.add(ocean);
    scene.add(new THREE.GridHelper(160, 40, 0x335533, 0x1e2e1e));

    // ---- 物件模型 ----
    var objs = [], SAVE = "gt_world_" + ch.id;
    var GBOX = new THREE.BoxGeometry(1, 1, 1), GCONE = new THREE.ConeGeometry(0.5, 1, 6), GCYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    function mkMesh(o) {
      var g = o.type === "cone" ? GCONE : o.type === "cyl" ? GCYL : GBOX;
      var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: o.color }));
      m.scale.set(o.w, o.h, o.d); m.position.set(o.x, o.y, o.z); if (o.ry) m.rotation.y = o.ry;
      m.userData = o; scene.add(m); objs.push(m); return m;
    }
    function showCnt() { document.getElementById("wcnt").textContent = "物件 " + objs.length; }
    function showEcon() { document.getElementById("wecon").textContent = "资金 " + (econ.funds | 0) + " ｜ 材料 " + (econ.mat | 0); }
    function save() { try { localStorage.setItem(SAVE, JSON.stringify(objs.map(function (m) { return m.userData; }))); } catch (e) {} }
    function load() { try { (JSON.parse(localStorage.getItem(SAVE) || "[]")).forEach(mkMesh); } catch (e) {} showCnt(); }
    function spend(n) { econ.funds -= n; econ.mat -= n; showEcon(); return econ.funds > 0; }
    load();

    // ---- 程序化城市规划(按维度主题) ----
    var plan = [], pi = 0;
    function genPlan() {
      plan = []; pi = 0;
      var R = 56, step = 8;
      // 道路网(灰/主题色细长条)
      for (var x = -R; x <= R; x += step) plan.push({ kind: "road", x: x, z: 0, w: 1.4, h: 0.2, d: R * 2 + 4, vert: true });
      for (var z = -R; z <= R; z += step) plan.push({ kind: "road", x: 0, z: z, w: R * 2 + 4, h: 0.2, d: 1.4, vert: false });
      // 街区建筑
      for (var bx = -R + 4; bx < R; bx += step) for (var bz = -R + 4; bz < R; bz += step) {
        if (Math.abs(bx) < 7 && Math.abs(bz) < 7) continue;                  // 给中心地标留位
        if (Math.random() < 0.22) { plan.push({ kind: "tree", x: bx + (Math.random() * 4 - 2), z: bz + (Math.random() * 4 - 2) }); continue; }
        var floors = 1 + Math.floor(Math.random() * st.hi);
        plan.push({ kind: "build", x: bx, z: bz, floors: floors, color: pickc(st.b) });
      }
      // 国家元素：国旗 + 围墙角楼
      plan.push({ kind: "flag", x: 0, z: -R + 2 });
      [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(function (c) { plan.push({ kind: "build", x: c[0], z: c[1], floors: st.hi, color: pickc(st.b) }); });
      // 中心地标
      plan.push({ kind: "landmark", x: 0, z: 0 });
      // 打乱建筑顺序(逐步生长观感)，道路先建
      var roads = plan.filter(function (p) { return p.kind === "road"; });
      var other = plan.filter(function (p) { return p.kind !== "road"; }).sort(function () { return Math.random() - 0.5; });
      plan = roads.concat(other);
    }
    function buildStep(p) {
      var u = user + "·AI", t = Date.now();
      if (p.kind === "road") { mkMesh({ type: "box", x: p.x, y: 0.1, z: p.z, w: p.w, h: p.h, d: p.d, color: 0x2b2f34, user: u, t: t }); spend(6 * costFactor); }
      else if (p.kind === "tree") {
        mkMesh({ type: "cyl", x: p.x, y: 1, z: p.z, w: 0.6, h: 2, d: 0.6, color: 0x6b4423, user: u, t: t });
        mkMesh({ type: "cone", x: p.x, y: 3.4, z: p.z, w: 3, h: 4, d: 3, color: st.tree, user: u, t: t }); spend(10 * costFactor);
      } else if (p.kind === "build") {
        var H = p.floors * 3; mkMesh({ type: "box", x: p.x, y: H / 2, z: p.z, w: 4.6, h: H, d: 4.6, color: p.color, user: u, t: t });
        if (p.floors > 2) mkMesh({ type: "box", x: p.x, y: H + 0.6, z: p.z, w: 1.2, h: 2.4, d: 1.2, color: 0x9aa, user: u, t: t });   // 顶塔
        spend((20 + p.floors * 6) * costFactor);
      } else if (p.kind === "flag") {
        mkMesh({ type: "cyl", x: p.x, y: 6, z: p.z, w: 0.4, h: 12, d: 0.4, color: 0xcccccc, user: u, t: t });
        mkMesh({ type: "box", x: p.x + 2.4, y: 10.5, z: p.z, w: 4, h: 2.6, d: 0.3, color: pickc(pal.map(function (c) { return parseInt(c.slice(1), 16); })), user: u, t: t }); spend(20);
      } else if (p.kind === "landmark") { buildLandmark(st.mk, p.x, p.z, u, t); spend(120 * costFactor); }
      showCnt();
    }
    function buildLandmark(mk, x, z, u, t) {
      if (mk === "pyramid") { for (var i = 0; i < 8; i++) mkMesh({ type: "box", x: x, y: i * 2 + 1, z: z, w: (9 - i) * 2.2, h: 2, d: (9 - i) * 2.2, color: 0xc2a76a, user: u, t: t }); }
      else if (mk === "pagoda") { for (var j = 0; j < 5; j++) { mkMesh({ type: "box", x: x, y: j * 5 + 2.5, z: z, w: 12 - j * 1.8, h: 4, d: 12 - j * 1.8, color: 0xb22222, user: u, t: t }); mkMesh({ type: "cone", x: x, y: j * 5 + 5.2, z: z, w: 14 - j * 1.8, h: 2.5, d: 14 - j * 1.8, color: 0xffd700, user: u, t: t }); } }
      else if (mk === "spire_dark") { mkMesh({ type: "cone", x: x, y: 16, z: z, w: 10, h: 34, d: 10, color: 0x3a1a5a, user: u, t: t }); }
      else if (mk === "spire_white") { mkMesh({ type: "cone", x: x, y: 16, z: z, w: 9, h: 34, d: 9, color: 0xfdfdf5, user: u, t: t }); }
      else if (mk === "tower_metal") { for (var k = 0; k < 6; k++) mkMesh({ type: "box", x: x, y: k * 5 + 2.5, z: z, w: 7 - k * 0.6, h: 5, d: 7 - k * 0.6, color: 0x9aa6b2, user: u, t: t }); }
      else if (mk === "dome") { mkMesh({ type: "box", x: x, y: 3, z: z, w: 18, h: 6, d: 18, color: 0x1e5fbf, user: u, t: t }); var dome = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16, 0, 6.3, 0, 1.6), new THREE.MeshLambertMaterial({ color: 0x3aa0ff })); dome.position.set(x, 6, z); dome.userData = { type: "dome", x: x, y: 6, z: z, w: 1, h: 1, d: 1, color: 0x3aa0ff, user: u, t: t }; scene.add(dome); objs.push(dome); }
      else { for (var n = 0; n < 10; n++) mkMesh({ type: "box", x: x, y: n * 3 + 1.5, z: z, w: 8 - n * 0.5, h: 3, d: 8 - n * 0.5, color: pickc(st.b), user: u, t: t }); }
    }

    // ---- 交互 ----
    var mode = "build", ray = new THREE.Raycaster(), m2 = new THREE.Vector2();
    ov.querySelectorAll(".wm").forEach(function (b) {
      b.onclick = function () {
        mode = b.dataset.m;
        if (mode === "auto" && pi >= plan.length) { genPlan(); }
        tip(mode === "build" ? "建造模式：点地面放方块" : mode === "auto" ? "🟡 自动建城：AI 按【" + st.n + "】主题建造道路/建筑/地标/国旗…" : "🔴 战争：点物件拆除→回收材料");
      };
    });
    ov.querySelectorAll(".wpal").forEach(function (s) { s.onclick = function () { blockColor = s.dataset.c; }; });
    function tip(t) { document.getElementById("wtip").textContent = t; }
    tip("先选「🟡 自动建城」看 AI 按本频道维度建世界，或「🟢 建造」自己造。拖动旋转·滚轮缩放");
    document.getElementById("wsun").oninput = function (e) { sunColor = e.target.value; buildSuns(); };
    document.getElementById("wsc").onchange = function (e) { sunCount = +e.target.value; buildSuns(); };
    document.getElementById("wsky").oninput = function (e) { sky = e.target.value; scene.background.set(sky); scene.fog.color.set(sky); };
    document.getElementById("wland").oninput = function (e) { ground.material.color.set(e.target.value); };
    document.getElementById("wsea").oninput = function (e) { ocean.material.color.set(e.target.value); };
    document.getElementById("wreset").onclick = function () { genPlan(); tip("已重铺城市规划，切到「自动建城」开始生长"); };
    document.getElementById("wclose").onclick = closeWorld;
    document.getElementById("wclear").onclick = function () { if (confirm("清空本频道世界？不可撤销。")) { objs.forEach(function (m) { scene.remove(m); }); objs = []; save(); showCnt(); } };

    function snap(v) { return Math.round(v / 2) * 2; }
    function pick(ev) {
      var r = cv.getBoundingClientRect();
      m2.x = ((ev.clientX - r.left) / r.width) * 2 - 1; m2.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(m2, cam);
      var hb = ray.intersectObjects(objs); if (hb.length) return { obj: hb[0].object };
      var hg = ray.intersectObject(ground); if (hg.length) return { ground: hg[0].point };
      return {};
    }
    var downXY = null;
    cv.addEventListener("pointerdown", function (e) { downXY = [e.clientX, e.clientY]; rot.active = true; rot.lx = e.clientX; rot.ly = e.clientY; });
    cv.addEventListener("pointerup", function (e) { rot.active = false; if (downXY && Math.abs(e.clientX - downXY[0]) < 5 && Math.abs(e.clientY - downXY[1]) < 5) clickAt(e); });
    function clickAt(e) {
      var p = pick(e);
      if (mode === "war" && p.obj) {
        var ref = Math.round(18 * (1.2 - costFactor)); econ.mat += ref; econ.funds += (ref * 0.5) | 0; showEcon();
        scene.remove(p.obj); objs.splice(objs.indexOf(p.obj), 1); save(); showCnt(); tip("♻ 回收再生：返还材料 " + ref + "（绿=循环不息）"); return;
      }
      if (mode !== "war" && p.obj) { var u = p.obj.userData; tip("🏷 " + (u.user || "?") + " · " + new Date(u.t).toLocaleString()); }
      if (p.ground) {
        var c = mode === "war" ? 0xef4444 : parseInt(blockColor.slice(1), 16);
        if (!spend(40 * costFactor)) { tip("资金/材料不足！可在战争模式拆除回收"); return; }
        mkMesh({ type: "box", x: snap(p.ground.x), y: 1, z: snap(p.ground.z), w: 2, h: 2, d: 2, color: c, user: user, t: Date.now() });
        save(); showCnt(); tip("🏷 " + user + " 建造于 " + new Date().toLocaleTimeString());
      }
    }

    // 自动建城心跳：每 100ms 建几步
    var beat = setInterval(function () {
      if (!W.open || mode !== "auto") return;
      if (pi >= plan.length) { if (!plan.length) genPlan(); else { tip("🏙 城市建成！共 " + objs.length + " 个物件。切「战争」可拆除回收。"); return; } }
      if (econ.funds <= 0) { tip("资金耗尽：切「战争」拆除回收材料，循环再建。"); return; }
      for (var k = 0; k < 3 && pi < plan.length; k++) { buildStep(plan[pi++]); }
      if (pi % 9 === 0) save();
    }, 100);

    // 轨道相机
    var rot = { active: false, lx: 0, ly: 0, theta: 0.9, phi: 0.85, r: 110 };
    cv.addEventListener("pointermove", function (e) { if (!rot.active) return; rot.theta -= (e.clientX - rot.lx) * 0.005; rot.phi -= (e.clientY - rot.ly) * 0.005; rot.phi = Math.max(0.12, Math.min(1.45, rot.phi)); rot.lx = e.clientX; rot.ly = e.clientY; });
    cv.addEventListener("wheel", function (e) { rot.r = Math.max(20, Math.min(320, rot.r + e.deltaY * 0.08)); e.preventDefault(); }, { passive: false });
    function onResize() { if (!W.open) return; renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    window.addEventListener("resize", onResize);
    var raf;
    function loop() { if (!W.open) return; cam.position.set(rot.r * Math.sin(rot.phi) * Math.sin(rot.theta), rot.r * Math.cos(rot.phi), rot.r * Math.sin(rot.phi) * Math.cos(rot.theta)); cam.lookAt(0, 4, 0); suns.forEach(function (s) { s.rotation.y += 0.002; }); renderer.render(scene, cam); raf = requestAnimationFrame(loop); }
    loop();
    function closeWorld() { save(); W.open = false; clearInterval(beat); cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); try { renderer.dispose(); } catch (e) {} var o = document.getElementById("worldOv"); if (o) o.remove(); }
    W.close = closeWorld;
  }
  window.openWorld = function () { if (typeof THREE === "undefined") { alert("3D 引擎加载中，请稍候再试。"); return; } openWorld(); };
})();
