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
      1: { n: "地狱", b: [0x7a2b2b, 0x5a1f1f, 0x3a1010], hi: 5, mk: "spire_dark", tree: 0x6b3b2b, k: "spire", deco: "lava" },
      2: { n: "鬼界/丧尸", b: [0x556b2f, 0x3f4f22, 0x6a6a5a], hi: 3, mk: "tower", tree: 0x4f5f2f, k: "ruin", deco: "fog" },
      3: { n: "人间(均衡)", b: [0xbcae8e, 0x9fae8e, 0xd6cfa8, 0x88a0c0], hi: 6, mk: "pagoda", tree: 0x3f8f3f, k: "box" },
      4: { n: "魔界", b: [0x5a2a7a, 0x3a1a5a, 0x7a3aa0], hi: 9, mk: "spire_dark", tree: 0x4a2a6a, k: "spire", deco: "lava" },
      5: { n: "机械生命", b: [0x8a99aa, 0x67788a, 0xaab4c0], hi: 8, mk: "tower_metal", tree: 0x7a8a7a, k: "tower" },
      6: { n: "虚拟界", b: [0x2a7adf, 0x1e5fbf, 0x3aa0ff, 0x33ffd0], hi: 7, mk: "dome", tree: 0x2aa0a0, k: "neon", deco: "grid" },
      7: { n: "天使界", b: [0xfaf3d0, 0xe8e0b8, 0xffffff], hi: 7, mk: "spire_white", tree: 0x9fd3a0, k: "dome", deco: "cloud" },
      8: { n: "龙兽界", b: [0x8a5a2b, 0x6a431d, 0xb5651d], hi: 5, mk: "pyramid", tree: 0x5f7f2f, k: "pyramid", deco: "sand" },
      9: { n: "仙佛界", b: [0xffd700, 0xe0b000, 0xfff0a0], hi: 8, mk: "pagoda", tree: 0x6fae6f, k: "pagoda", deco: "cloud" },
      0: { n: "外循环·大循环(人间)", b: [0x4f8f4f, 0x6fae6f, 0x8fce8f], hi: 6, mk: "pagoda", tree: 0x2f8f2f, k: "box" }
    };
    var s = M[d] || M[o] || M[3];
    // 高维更绿更清(主题微调)
    if (d >= 40) s = Object.assign({}, s, { mk: (d % 2 ? "pyramid" : "pagoda") });
    s.dim = d; s.greenish = Math.min(1, d / 60);
    return s;
  }
  // 维度 → 原型(按个位数：0外循环/1地狱/2丧尸/3人间/4魔/5机械/6虚拟/7天使/8龙兽/9仙佛)
  function archetype(dim) {
    var d = Math.round(dim || 3), one = ((d % 10) + 10) % 10;
    var A = { 0: "human", 1: "demon", 2: "zombie", 3: "human", 4: "demon", 5: "robot", 6: "virtual", 7: "angel", 8: "beast", 9: "buddha" };
    return A[one] || "human";
  }
  // 原型 → 真实开源模型(Three.js/CC0) + 目标身高(自动归一) + 着色 + 飞行
  var MODELS = {
    human: { file: "Xbot.glb", h: 4 },
    demon: { file: "Xbot.glb", h: 4.5, tint: 0x7a2aa0 },
    zombie: { file: "Xbot.glb", h: 3.8, tint: 0x6b8e23 },
    robot: { file: "RobotExpressive.glb", h: 4.2 },
    virtual: { file: "Xbot.glb", h: 4, tint: 0x3aa0ff },
    angel: { file: "Stork.glb", h: 3.5, tint: 0xfff2c0, fly: 7 },
    beast: { file: "Soldier.glb", h: 3.6, tint: 0x9a7a4a },
    dragon: { file: "Horse.glb", h: 5, tint: 0x8a5a2b },
    buddha: { file: "Soldier.glb", h: 4.4, tint: 0xffd700 },
    pharaoh: { file: "Soldier.glb", h: 4.4, tint: 0xd4af37 }
  };
  // 魔族变体(比人类高)：男魔丑(阿修罗·佛典载男丑女美)、女魔美分绿/红/黑；对应红绿灯：绿=解开快乐(绿灯)、红=守旧永恒(红灯)、黑=暂停平衡(黄灯，可升黄/蓝/白)
  var DEMON = [
    { k: "男魔·阿修罗(丑·好斗)", c: 0x4a3a36, e: 0x180c0a, sm: 1.18, model: "Xbot.glb" },
    { k: "女魔·绿(解开/快乐·绿灯)", c: 0xeafff0, e: 0x2bd24b, sm: 1.05, model: "Soldier.glb" },
    { k: "女魔·红(守旧/永恒·红灯)", c: 0xffb0b0, e: 0xd61f1f, sm: 1.05, model: "Soldier.glb" },
    { k: "女魔·黑(暂停/平衡·黄灯)", c: 0x2b2b2b, e: 0x141414, sm: 1.05, up: 1, model: "Soldier.glb" }
  ];
  var DEMON_UP = [{ k: "黑魔→黄(进阶)", e: 0xffd24a }, { k: "黑魔→蓝(进阶)", e: 0x3a6ef0 }, { k: "黑魔→白(进阶)", e: 0xf2f2f2 }];
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
      '<b style="color:#7fd1ff">🎮 维度世界</b> · ' + ch.name + '<br>维度/指数 <b>' + st.dim + '</b> ｜ <b style="color:#9be29b">' + st.n + '</b> ｜ 居民原型 <b>' + ({ human: "人类", demon: "魔族", zombie: "丧尸", robot: "机械生命", virtual: "虚拟人", angel: "天使", beast: "异兽", dragon: "龙", buddha: "仙佛" }[archetype(st.dim)] || "人类") + '</b><br>' +
      (archetype(st.dim) === "demon" ? '<span style="color:#c9a0ff;font-size:12px">魔族(比人类高)：男魔丑·阿修罗 / 女魔美 — <span style="color:#2bd24b">绿=解开快乐(绿灯)</span>·<span style="color:#ff6b6b">红=守旧永恒(红灯)</span>·黑=暂停平衡(黄灯,可升黄/蓝/白)。</span><br>' : '') +
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
      '<div id="wtip" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);color:#cfe8ff;background:rgba(10,16,22,.85);padding:6px 12px;border-radius:8px;font-size:12px"></div>' +
      '<div style="position:absolute;bottom:8px;right:10px;color:#7f93a8;font-size:10px;line-height:1.4;text-align:right">维度30-39建筑模型：Google Poly · Kenney · Quaternius<br>CC0 / CC-BY · poly.pizza</div>';
    document.body.appendChild(ov);
    ov.querySelectorAll("button").forEach(function (b) { if (!b.style.padding) b.style.cssText += ";padding:7px 12px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold"; });

    var cv = document.getElementById("wcv");
    var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    var scene = new THREE.Scene(); scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 70, 280);
    var cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
    var amb = new THREE.AmbientLight(0xffffff, 0.5); scene.add(amb);
    var hemi = new THREE.HemisphereLight(0xbcd6ff, 0x46502f, 0.65); scene.add(hemi);   // 天蓝/地绿半球光，模型更立体不发灰
    var dir = new THREE.DirectionalLight(sunColor, 1.2); dir.position.set(50, 90, 40); scene.add(dir);
    var fill = new THREE.DirectionalLight(0x9fc0ff, 0.35); fill.position.set(-40, 50, -30); scene.add(fill);   // 冷调补光
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
      if (o.type === "model") { spawnModel(o.arch, o.x, o.z, o.user, o.t, { vi: o.vi, vu: o.vu }); return null; }
      if (o.type === "polybuild") { spawnBuilding(o.file, o.x, o.z, o.w, o.user, o.t, o.ry); return null; }
      var g = o.type === "cone" ? GCONE : o.type === "cyl" ? GCYL : GBOX;
      var mat = new THREE.MeshLambertMaterial({ color: o.color });
      if (o.glow) { mat.emissive = new THREE.Color(o.color); mat.emissiveIntensity = 0.6; }
      var m = new THREE.Mesh(g, mat);
      m.scale.set(o.w, o.h, o.d); m.position.set(o.x, o.y, o.z); if (o.ry) m.rotation.y = o.ry;
      m.userData = o; scene.add(m); objs.push(m); return m;
    }
    function showCnt() { document.getElementById("wcnt").textContent = "物件 " + objs.length; }
    function showEcon() { document.getElementById("wecon").textContent = "资金 " + (econ.funds | 0) + " ｜ 材料 " + (econ.mat | 0); }
    function save() { try { localStorage.setItem(SAVE, JSON.stringify(objs.map(function (m) { return m.userData; }))); } catch (e) {} }
    function load() { try { (JSON.parse(localStorage.getItem(SAVE) || "[]")).forEach(mkMesh); } catch (e) {} showCnt(); }
    function spend(n) { econ.funds -= n; econ.mat -= n; showEcon(); return econ.funds > 0; }
    // ---- 开源模型(GLTF) + 居民生成(按该界原型) ----
    var _loader = (typeof THREE !== "undefined" && THREE.GLTFLoader) ? new THREE.GLTFLoader() : null;
    var _mcache = {};   // file -> 归一化(身高1)的中性底模
    function _loadFile(file, cb) {
      if (_mcache[file]) { cb(_mcache[file]); return; }
      if (!_loader) { cb(null); return; }
      _loader.load("models/" + file, function (g) {
        var root = g.scene || (g.scenes && g.scenes[0]); if (!root) { cb(null); return; }
        root.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(root), sz = new THREE.Vector3(); box.getSize(sz);
        root.scale.setScalar(1 / Math.max(sz.x, sz.y, sz.z, 0.001));   // 按最大维度归一化,避免极端比例炸大
        _mcache[file] = root; cb(root);
      }, undefined, function () { cb(null); });
    }
    function spawnModel(arch, x, z, u, t, vinfo) {
      var spec = MODELS[arch] || MODELS.human;
      var file = spec.file, h = spec.h || 4, sm = 1, c = spec.tint, e = 0, vi = null, vu = null;
      if (arch === "demon") {                         // 魔族变体：男魔丑/女魔美·绿红黑(黄蓝白)
        vi = (vinfo && vinfo.vi != null) ? vinfo.vi : Math.floor(Math.random() * DEMON.length);
        var dv = DEMON[vi]; file = dv.model || spec.file; h = spec.h || 4.5; sm = dv.sm; c = dv.c; e = dv.e;
        if (dv.up) { vu = (vinfo && vinfo.vu != null) ? vinfo.vu : Math.floor(Math.random() * DEMON_UP.length); e = DEMON_UP[vu].e; }
      }
      _loadFile(file, function (base) {
        if (!base) { mkMesh({ type: "box", x: x, y: 2, z: z, w: 1.4, h: h, d: 1.4, color: c || 0x88aa88, user: u, t: t }); return; }
        var clone = base.clone(true); clone.scale.multiplyScalar(h * sm);
        clone.updateMatrixWorld(true); var cb2 = new THREE.Box3().setFromObject(clone), cs = new THREE.Vector3(); cb2.getSize(cs);
        var mxd = Math.max(cs.x, cs.y, cs.z); if (mxd > 7) clone.scale.multiplyScalar(5 / mxd);   // 硬性防巨型模型
        if (c != null || e) clone.traverse(function (m) { if (m.isMesh && m.material) { try { m.material = m.material.clone(); m.material.map = null; if (c != null) m.material.color = new THREE.Color(c); if (e) { m.material.emissive = new THREE.Color(e); m.material.emissiveIntensity = 0.7; } } catch (er) {} } });
        clone.position.set(x, spec.fly || 0, z); clone.rotation.y = Math.random() * 6.28;
        clone.userData = { type: "model", arch: arch, x: x, z: z, user: u, t: t, vi: vi, vu: vu };
        scene.add(clone); objs.push(clone); showCnt();
      });
    }
    // ---- Google Poly(poly.pizza)真实建筑模型：专给 30-39 维度建城 ----
    var POLY = {
      0: ["0_loop_0.glb", "0_loop_1.glb"], 1: ["1_hell_0.glb", "1_hell_1.glb"],
      2: ["2_zombie_0.glb", "2_zombie_1.glb"], 3: ["3_human_0.glb", "3_human_1.glb"],
      4: ["4_demon_0.glb", "4_demon_1.glb"], 5: ["5_mech_0.glb", "5_mech_1.glb"],
      6: ["6_virtual_0.glb", "6_virtual_1.glb"], 7: ["7_angel_0.glb", "7_angel_1.glb"],
      8: ["8_beast_0.glb", "8_beast_1.glb"], 9: ["9_immortal_0.glb", "9_immortal_1.glb"]
    };
    var _bcache = {};   // poly建筑：归一化(底面最大边=1、底部贴地、水平居中)
    function _loadBuild(file, cb) {
      if (_bcache[file]) { cb(_bcache[file]); return; }
      if (!_loader) { cb(null); return; }
      _loader.load("models/poly/" + file, function (g) {
        var root = g.scene || (g.scenes && g.scenes[0]); if (!root) { cb(null); return; }
        root.updateMatrixWorld(true);
        var b = new THREE.Box3().setFromObject(root), sz = new THREE.Vector3(); b.getSize(sz);
        root.scale.setScalar(1 / Math.max(sz.x, sz.z, 0.001));
        var b2 = new THREE.Box3().setFromObject(root), c = new THREE.Vector3(); b2.getCenter(c);
        root.position.x -= c.x; root.position.z -= c.z; root.position.y -= b2.min.y;   // 居中贴地
        _bcache[file] = root; cb(root);
      }, undefined, function () { cb(null); });
    }
    function spawnBuilding(file, x, z, w, u, t, ry) {
      if (ry == null) ry = Math.floor(Math.random() * 4) * 1.5708;
      _loadBuild(file, function (base) {
        if (!base) { mkMesh({ type: "box", x: x, y: 3, z: z, w: 4.6, h: 6, d: 4.6, color: 0x9a9a9a, user: u, t: t }); return; }
        var wrap = new THREE.Group(); wrap.add(base.clone(true));
        wrap.scale.setScalar(w); wrap.position.set(x, 0, z); wrap.rotation.y = ry;
        wrap.userData = { type: "polybuild", file: file, x: x, z: z, w: w, ry: ry, user: u, t: t };
        scene.add(wrap); objs.push(wrap); showCnt();
      });
    }
    function polyFiles() { var fd = Math.floor(st.dim); if (!_loader || fd < 30 || fd > 39) return null; return POLY[fd % 10] || null; }
    load();

    // ---- 程序化城市规划(按维度主题) ----
    var plan = [], pi = 0;
    function genPlan() {
      plan = []; pi = 0;
      var R = 64, step = 14;
      // 较宽街道路网(留出街区空间，城市不再拥挤)
      for (var x = -R; x <= R; x += step) plan.push({ kind: "road", x: x, z: 0, w: 4, h: 0.2, d: R * 2 + 8, vert: true });
      for (var z = -R; z <= R; z += step) plan.push({ kind: "road", x: 0, z: z, w: R * 2 + 8, h: 0.2, d: 4, vert: false });
      // 每个街区中心放1栋(留街道)，约1/3作公园广场；避开中心地标与区界墙(x=±25)
      for (var bx = -R + step / 2; bx < R; bx += step) for (var bz = -R + step / 2; bz < R; bz += step) {
        if (Math.abs(bx) < 11 && Math.abs(bz) < 11) continue;                // 中心地标留位
        if (Math.abs(Math.abs(bx) - 25) < 7) continue;                       // 区界墙留位
        if (Math.random() < 0.30) { plan.push({ kind: "park", x: bx, z: bz }); continue; }
        var floors = 2 + Math.floor(Math.random() * st.hi);
        plan.push({ kind: "build", x: bx, z: bz, floors: floors, color: pickc(st.b) });
      }
      // 国家元素：国旗 + 围墙角楼
      plan.push({ kind: "flag", x: 0, z: -R + 2 });
      [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(function (c) { plan.push({ kind: "build", x: c[0], z: c[1], floors: st.hi, color: pickc(st.b) }); });
      // 居民自建基建：高速·铁路·红绿灯
      plan.push({ kind: "highway", z: -R - 7 }); plan.push({ kind: "highway", z: R + 7 });
      plan.push({ kind: "rail", z: R + 11 }); plan.push({ kind: "hsr", z: -R - 11 });
      for (var lx = -R + 8; lx < R; lx += 24) plan.push({ kind: "tlight", x: lx, z: 0 });
      // 居民(按该界原型的开源3D模型：魔/丧尸/人/机械/虚拟/天使/兽/龙/仙佛)
      for (var ri = 0; ri < 16; ri++) plan.push({ kind: "resident", x: -R + 8 + Math.random() * (R * 2 - 16), z: -R + 8 + Math.random() * (R * 2 - 16) });
      // 中心地标
      plan.push({ kind: "landmark", x: 0, z: 0 });
      // 打乱建筑顺序(逐步生长观感)，道路先建
      var roads = plan.filter(function (p) { return p.kind === "road"; });
      var other = plan.filter(function (p) { return p.kind !== "road"; }).sort(function () { return Math.random() - 0.5; });
      plan = roads.concat(other);
    }
    function buildOne(kind, x, z, floors, color, u, t) {
      var H = floors * 3, i, j;
      if (kind === "spire") {                                  // 地狱/魔界：渐细尖塔
        for (i = 0; i < floors; i++) mkMesh({ type: "box", x: x, y: i * 3 + 1.5, z: z, w: 4.8 - i * 0.42, h: 3, d: 4.8 - i * 0.42, color: color, user: u, t: t });
        mkMesh({ type: "cone", x: x, y: H + 2.2, z: z, w: 3.4, h: 5, d: 3.4, color: 0x1a0a2a, user: u, t: t });
      } else if (kind === "pagoda") {                          // 仙佛：多层金顶宝塔
        var n = Math.max(2, floors - 1);
        for (j = 0; j < n; j++) { mkMesh({ type: "box", x: x, y: j * 3.2 + 1.6, z: z, w: 5.4 - j * 0.5, h: 2.4, d: 5.4 - j * 0.5, color: color, user: u, t: t }); mkMesh({ type: "cone", x: x, y: j * 3.2 + 3.5, z: z, w: 6.6 - j * 0.5, h: 1.7, d: 6.6 - j * 0.5, color: 0xffcf40, user: u, t: t }); }
      } else if (kind === "tower") {                           // 机械：金属塔 + 天线
        mkMesh({ type: "box", x: x, y: H / 2, z: z, w: 4, h: H, d: 4, color: color, user: u, t: t });
        mkMesh({ type: "box", x: x, y: H, z: z, w: 4.6, h: 0.6, d: 4.6, color: 0x55606a, user: u, t: t });
        mkMesh({ type: "cyl", x: x, y: H + 3, z: z, w: 0.4, h: 6, d: 0.4, color: 0xcfd6df, user: u, t: t });
      } else if (kind === "neon") {                            // 虚拟：霓虹发光方塔
        mkMesh({ type: "box", x: x, y: H / 2, z: z, w: 4, h: H, d: 4, color: color, user: u, t: t, glow: 1 });
      } else if (kind === "pyramid") {                         // 龙兽/法老：阶梯金字塔
        var m = Math.max(3, floors + 1);
        for (i = 0; i < m; i++) mkMesh({ type: "box", x: x, y: i * 1.5 + 0.75, z: z, w: (m - i) * 1.5, h: 1.5, d: (m - i) * 1.5, color: 0xc2a76a, user: u, t: t });
      } else if (kind === "ruin") {                            // 丧尸：残破废墟
        mkMesh({ type: "box", x: x, y: H * 0.28, z: z, w: 4.6, h: H * 0.56, d: 4.6, color: color, user: u, t: t });
        mkMesh({ type: "box", x: x + 1.6, y: 0.9, z: z - 1, w: 1.4, h: 1.8, d: 1.4, color: 0x555044, user: u, t: t });
      } else if (kind === "dome") {                            // 天使：白穹顶
        mkMesh({ type: "box", x: x, y: H / 2, z: z, w: 4, h: H, d: 4, color: color, user: u, t: t });
        var dm = new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 10, 0, 6.3, 0, 1.6), new THREE.MeshLambertMaterial({ color: color }));
        dm.position.set(x, H, z); dm.userData = { type: "box", x: x, y: H, z: z, w: 2.7, h: 2.7, d: 2.7, color: color, user: u, t: t }; scene.add(dm); objs.push(dm);
      } else {                                                 // 人间：现代方楼
        mkMesh({ type: "box", x: x, y: H / 2, z: z, w: 4.6, h: H, d: 4.6, color: color, user: u, t: t });
        if (floors > 2) mkMesh({ type: "box", x: x, y: H + 0.6, z: z, w: 1.2, h: 2.4, d: 1.2, color: 0x99aaaa, user: u, t: t });
      }
    }
    function buildStep(p) {
      var u = user + "·AI", t = Date.now();
      if (p.kind === "road") { mkMesh({ type: "box", x: p.x, y: 0.1, z: p.z, w: p.w, h: p.h, d: p.d, color: 0x2b2f34, user: u, t: t }); spend(6 * costFactor); }
      else if (p.kind === "tree") {
        mkMesh({ type: "cyl", x: p.x, y: 1, z: p.z, w: 0.6, h: 2, d: 0.6, color: 0x6b4423, user: u, t: t });
        mkMesh({ type: "cone", x: p.x, y: 3.4, z: p.z, w: 3, h: 4, d: 3, color: st.tree, user: u, t: t }); spend(10 * costFactor);
      } else if (p.kind === "park") {                                       // 公园/广场(降低拥挤)
        mkMesh({ type: "box", x: p.x, y: 0.12, z: p.z, w: 9, h: 0.2, d: 9, color: 0x2f7f3f, user: u, t: t });
        for (var pk = 0; pk < 3; pk++) { var px2 = p.x + (Math.random() * 6 - 3), pz2 = p.z + (Math.random() * 6 - 3); mkMesh({ type: "cyl", x: px2, y: 1, z: pz2, w: 0.5, h: 2, d: 0.5, color: 0x6b4423, user: u, t: t }); mkMesh({ type: "cone", x: px2, y: 3, z: pz2, w: 2.4, h: 3.4, d: 2.4, color: st.tree, user: u, t: t }); }
        spend(12 * costFactor);
      } else if (p.kind === "build") {
        var pf = polyFiles();
        if (pf) spawnBuilding(pf[Math.floor(Math.random() * pf.length)], p.x, p.z, 5 + Math.random() * 2.5, u, t);
        else buildOne(st.k, p.x, p.z, p.floors, p.color, u, t);
        spend((20 + p.floors * 6) * costFactor);
      } else if (p.kind === "resident") {
        spawnModel(archetype(st.dim), p.x, p.z, u, t); spend(35 * costFactor);
      } else if (p.kind === "flag") {
        mkMesh({ type: "cyl", x: p.x, y: 6, z: p.z, w: 0.4, h: 12, d: 0.4, color: 0xcccccc, user: u, t: t });
        mkMesh({ type: "box", x: p.x + 2.4, y: 10.5, z: p.z, w: 4, h: 2.6, d: 0.3, color: pickc(pal.map(function (c) { return parseInt(c.slice(1), 16); })), user: u, t: t }); spend(20);
      } else if (p.kind === "highway") {                                  // 高速公路(带中线)
        mkMesh({ type: "box", x: 0, y: 0.15, z: p.z, w: 150, h: 0.3, d: 5, color: 0x33373c, user: u, t: t });
        for (var hx = -70; hx <= 70; hx += 6) mkMesh({ type: "box", x: hx, y: 0.32, z: p.z, w: 2, h: 0.1, d: 0.5, color: 0xffd24a, user: u, t: t });
        spend(40 * costFactor);
      } else if (p.kind === "rail") {                                     // 铁路 + 火车
        mkMesh({ type: "box", x: 0, y: 0.2, z: p.z, w: 150, h: 0.3, d: 2.2, color: 0x5a4631, user: u, t: t });
        spawnInfra(INFRA.train, -60, 0.6, p.z, 4, Math.PI / 2); spend(50 * costFactor);
      } else if (p.kind === "hsr") {                                      // 高铁(高架轨道 + 动车)
        mkMesh({ type: "box", x: 0, y: 3, z: p.z, w: 150, h: 0.6, d: 3, color: 0xb8c0c8, user: u, t: t });
        for (var sx = -66; sx <= 66; sx += 16) mkMesh({ type: "cyl", x: sx, y: 1.4, z: p.z, w: 1, h: 3, d: 1, color: 0x8a929a, user: u, t: t });
        spawnInfra(INFRA.hsr, -60, 3.6, p.z, 5, Math.PI / 2); spend(60 * costFactor);
      } else if (p.kind === "tlight") { spawnInfra(INFRA.light, p.x + 2.5, 0, p.z + 2.5, 3, 0); spend(8 * costFactor); }
      else if (p.kind === "landmark") { buildLandmark(st.mk, p.x, p.z, u, t); spend(120 * costFactor); }
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

    function facDetail(f) {   // 设施动态详情(随实时数据)
      var nm = f.name, L, zi = (typeof zIdx === "function") ? zIdx(f.x) : 1, zn = (typeof ZNAME !== "undefined") ? ZNAME[zi] : "本区";
      if (/充电桩/.test(nm)) { var k = Math.round(sim.power.kwh * 0.04 + 50); L = ["⚡ 累计供电 " + k + " 度", "🚗 服务车辆/居民 " + ((sim.res ? sim.res.length : 0) * 3 + (sim.trucks ? sim.trucks.length * 20 : 0)) + " 人次", "💰 充电创收 " + Math.round(k * 0.6) + " 魔币", "新能源 · 24小时 · " + zn]; }
      else if (/发电厂/.test(nm)) { L = ["⚡ 火力发电(耗煤) · 总发电 " + sim.power.kwh + " 度", "⛏ 煤库 " + (sim.coal | 0) + "(不足则限电)", "人均月用电 ~250 度", "💰 电费收入 " + Math.round(sim.power.kwh * 0.6) + " 魔币"]; }
      else if (/煤矿/.test(nm)) { L = ["⛏ 煤矿 · 月产煤 ~2000", "当前煤库 " + (sim.coal | 0), "供火电厂发电用"]; }
      else if (/核电站/.test(nm)) { L = ["☢️ 核电站(清洁能源·无煤)", "承担约 40% 电力", "总发电 " + (sim.power.kwh | 0) + " 度"]; }
      else if (/网络中心/.test(nm)) { L = ["📶 全城 3G 网络覆盖", "用户 " + (zonePop(0) + zonePop(1) + zonePop(2)) + " 人", "运营商：绿太阳通信", "支撑淘宝/微信/支付宝/AI/与三魔女通讯"]; }
      else if (/农业|农场/.test(nm)) { L = ["🌾 国营农场 · 月产粮 ~3000", "粮库 " + (sim.food | 0) + (sim.food < 500 ? "(告急)" : ""), "麦田·拖拉机·风车 · 计划调配"]; }
      else if (/中央|政府/.test(nm)) { L = ["👤 在职：国家主席 + 军事/财政/民政/计划 四部长", "👥 公务员约 " + Math.round((zonePop(0) + zonePop(1) + zonePop(2)) * 0.02) + " 人", "🏛 制度：军队归中央 · 5%财政权 · 征兵/退役 · 计划生育 · 元旦阅兵 · 区际奥运", "💰 中央国库 " + (sim.central.fund | 0) + " ｜ 现役军 " + sim.army.total]; }
      else if (/交易所/.test(nm)) { L = ["📈 上市直播频道 " + (sim.stocks ? sim.stocks.length : 0) + " 只(真实指数,非编造)", "T+0 当日可买卖(交易所在美区)", "👩 交易员：Amelie(追高)/Mael(抄底)/Sarah(均衡)", "👔 经理：Taylor(蓝魔) ｜ 今日成交 " + (sim.trades ? sim.trades.length : 0) + " 笔"]; }
      else if (/建设银行|摩根|渣打|人民银行/.test(nm)) { var s = zoneStats(zi); L = ["🏦 " + nm, "存款总额 " + s.deposits + s.unit, "贷款总额 " + s.loans + s.unit, "存息 " + (ZONES[zi].bankRate * 100).toFixed(1) + "% · 贷息 " + s.loanRate + "%", "所在 " + zn]; }
      else if (/顺丰/.test(nm)) { L = ["🚚 新能源充电货车 " + (sim.trucks ? sim.trucks.length : 0) + " 辆", "📦 日均配送 " + ((sim.res ? sim.res.length : 0) * 8) + " 单", "全城配送 · 充电车队"]; }
      else if (/农业/.test(nm)) { L = ["🌾 国营农场", "麦田10块 · 拖拉机 · 风车", "🍞 计划调配 · 保障口粮", "苏区五年计划重点"]; }
      else if (/机场/.test(nm)) { L = ["✈️ 在飞航班 " + (sim.planes ? sim.planes.length : 0) + " 架", "国际航线 · 货客两用"]; }
      else if (/超市|24h|Welcome/.test(nm)) { L = ["🛒 24小时营业", "日客流 ~" + ((sim.res ? sim.res.length : 0) * 5) + " 人次", "绿太阳/Welcome 连锁 · 居民就近购物"]; }
      else if (/边境|哨所/.test(nm)) { L = ["🚧 三区边境口岸 · 警卫驻守", "持护照通行 · 移民审批(绿30/黄20/红10天)"]; }
      else if (/Claude/.test(nm)) { L = ["🤖 Claude AI 软件公司", "AI 工程师团队 · 为本维度世界提供智能", "所在 " + zn]; }
      else if (/淘宝/.test(nm)) { L = ["🛒 淘宝 · 全民网购/网店(点击看在售)"]; if (sim.taobao) sim.taobao.forEach(function (pr) { L.push(pr.cat + "｜" + pr.brand + (pr.maxv > 1 ? " " + pr.ver + "代" : "") + " ¥" + pr.price + " · 已售" + pr.sold + " · 产自" + pr.maker); }); }
      else if (/Apple/.test(nm)) { L = ["🍎 Apple Inc", "产品：iPhone / MacBook / Tesla(代工)", "在淘宝热销 · 逐代迭代升级", "所在 " + zn]; }
      else if (/比亚迪/.test(nm)) { L = ["🚗 比亚迪汽车厂", "产新能源汽车(在淘宝热销·逐代升级)", "为充电车队/居民供车", "所在 " + zn]; }
      else if (/华为/.test(nm)) { L = ["📱 华为", "产华为Mate手机(淘宝热销·逐代升级)", "5G/3G通信设备", "所在 " + zn]; }
      else if (/美团/.test(nm)) { L = ["🛵 美团 · 外卖 + 众包", "累计外卖 " + (sim.waimai ? sim.waimai.orders : 0) + " 单", "累计餐费收入 " + (sim.waimai ? sim.waimai.rev : 0) + " 魔币", "骑手:新能源充电车队", "居民点外卖按单付餐费(账单从个人资金扣)"]; }
      else if (/腾讯|支付宝/.test(nm)) { L = ["🏢 " + nm + " · 互联网企业", "员工 ~" + (200 + (Math.abs(f.x | 0) % 300)) + " 人", "所在 " + zn]; }
      else L = [nm, "城市设施 · 所在 " + zn];
      L.push("🏗 设施等级 Lv" + (f.lv || 1) + "（由居民自发扩建升级）");
      return L;
    }
    function showFacInfo(f) {
      var old = document.getElementById("facPop"); if (old) old.remove();
      var d = document.createElement("div"); d.id = "facPop";
      d.style.cssText = "position:absolute;left:50%;top:120px;transform:translateX(-50%);min-width:280px;max-width:92vw;background:rgba(8,14,20,.96);border:1px solid #2bd24b;border-radius:10px;color:#cfe8ff;padding:12px 14px;z-index:8;font-size:12px";
      d.innerHTML = "<div style='font-weight:bold;font-size:14px;color:#7CFC9A;margin-bottom:6px'>🏷 " + f.name + "</div>" + facDetail(f).map(function (l) { return "<div style='margin:3px 0'>" + l + "</div>"; }).join("") + "<button id='facClose' style='margin-top:8px;padding:4px 10px;border:none;border-radius:6px;background:#1f6f3f;color:#fff;cursor:pointer'>关闭</button>";
      ov.appendChild(d); document.getElementById("facClose").onclick = function () { d.remove(); };
    }
    function renderAdmin() {
      var el = document.getElementById("wadmin"); if (!el || !sim) return;
      function row(lb, id, v) { return "<div style='margin:3px 0'>" + lb + "：<input id='" + id + "' value='" + v + "' style='width:90px'></div>"; }
      el.innerHTML = "<div style='color:#ff7a7a;font-weight:bold;font-size:14px'>🛠 干涉虚拟世界</div><div style='color:#e0a040;font-size:10px;margin-bottom:6px'>⚠ 安全提醒：您正在干涉虚拟世界，可能会影响测试结果</div>" +
        row("绿区国库(票)", "a_t0", sim.treasury[0]) + row("黄区国库", "a_t1", sim.treasury[1]) + row("红区国库", "a_t2", sim.treasury[2]) +
        row("绿区名义人口", "a_p0", sim.popN[0]) + row("黄区名义人口", "a_p1", sim.popN[1]) + row("红区名义人口", "a_p2", sim.popN[2]) +
        row("中央国库", "a_cf", sim.central.fund) + row("现役军", "a_army", sim.army.total) + row("CPI物价指数", "a_cpi", sim.cpi) + row("国债余额", "a_bond", sim.central.bonds) +
        "<button id='a_apply' style='margin-top:8px;padding:5px 12px;border:none;border-radius:6px;background:#a33;color:#fff;cursor:pointer;font-weight:bold'>⚠ 应用干涉</button>";
      document.getElementById("a_apply").onclick = function () {
        function g(id, dv) { var e = document.getElementById(id), v = e ? parseFloat(e.value) : NaN; return isNaN(v) ? dv : v; }
        sim.treasury[0] = g("a_t0", sim.treasury[0]); sim.treasury[1] = g("a_t1", sim.treasury[1]); sim.treasury[2] = g("a_t2", sim.treasury[2]);
        sim.popN[0] = g("a_p0", sim.popN[0]); sim.popN[1] = g("a_p1", sim.popN[1]); sim.popN[2] = g("a_p2", sim.popN[2]);
        sim.central.fund = g("a_cf", sim.central.fund); sim.army.total = g("a_army", sim.army.total); sim.cpi = g("a_cpi", sim.cpi); sim.central.bonds = g("a_bond", sim.central.bonds);
        tip("🛠 已干涉虚拟世界 — 数据被人为调整，可能影响测试结果"); renderBank();
      };
    }
    function cityCommand(t) {   // 据消息执行城市管理(可靠·本地),返回执行摘要
      var acts = [];
      if (/管理|治理|全权|organize|安排/.test(t)) { expandTick(); upgradeTick(); recruitTraders(); sim.treasury = sim.treasury.map(function (v) { return v + 1000; }); acts.push("全权管理:扩建+升级+招才+三区财政各+1000"); }
      else {
        if (/扩建|盖楼|建城|expand|发展/.test(t)) { expandTick(); acts.push("向外扩建一圈"); }
        if (/升级|upgrade|改造/.test(t)) { upgradeTick(); acts.push("升级若干设施"); }
        if (/发钱|拨款|振兴|补贴|money/.test(t)) { sim.treasury = sim.treasury.map(function (v) { return v + 2000; }); acts.push("三区财政各+2000"); }
        if (/通胀|降价|物价|inflation/.test(t)) { sim.cbRate = Math.max(0, sim.cbRate - 0.01); acts.push("下调通胀率"); }
        if (/招|学院|交易员|trader|人才/.test(t)) { recruitTraders(); acts.push("推动报考交易学院"); }
        if (/粮|农业|food/.test(t)) { sim.food += 4000; acts.push("增产粮4000"); }
        if (/煤|电|power/.test(t)) { sim.coal += 3000; acts.push("增煤3000"); }
      }
      if (acts.length && curPanel === "wbank") renderBank();
      return acts.length ? ("🛠 已执行:" + acts.join("；")) : "";
    }
    function personaLine(who) {
      return who === "Amelie" ? "(绿瞳闪光·笑)解放与快乐~还要我做什么?(管理城市/扩建/发钱/招交易员)" : who === "Mael" ? "(沉稳)秩序永恒,如你所愿。可下令:管理城市/扩建/拨款/降通胀。" : who === "Sarah" ? "(平静)权衡已毕,请下达指令(管理城市/升级/增煤保电)。" : "三魔女在线:Amelie(快乐)·Mael(守旧)·Sarah(平衡),可下令管理城市。";
    }
    function demonReply(who, t) { var a = cityCommand(t); var p = personaLine(who); return a ? (a + " ｜ " + p) : p; }
    var GROUP = { name: "群聊", role: "你 + Claude + Amelie + Mael + Sarah 群聊", hair: "#888", eyes: "#fff", skin: "#445" };
    function logChat(from, text) {   // 本地显示 + 永久存档到服务器(关机/重启不丢,且汇入运营会话)
      sim.chat.push({ from: from, text: text }); if (sim.chat.length > 200) sim.chat.shift();
      try { fetch("/api/chatlog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: from, text: text }) }); } catch (e) {}
    }
    function renderChat() {
      var el = document.getElementById("wchat"); if (!el || !sim) return;
      var who = sim.chatWho || "group", d = (who === "group") ? GROUP : DEMON_AV[who];
      var heads = [["group", "👥群聊"], ["Claude", "Claude"], ["Amelie", "Amelie"], ["Mael", "Mael"], ["Sarah", "Sarah"]].map(function (kv) { var k = kv[0], av = k === "group" ? "" : "<img src='" + makeAvatar(DEMON_AV[k]) + "' width='16' height='16' style='vertical-align:middle;border-radius:3px'> "; return "<button class='cw' data-w='" + k + "' style='padding:3px 7px;border:none;border-radius:6px;cursor:pointer;font-size:11px;background:" + (k === who ? "#1f6f3f" : "#2a3a4a") + ";color:#fff'>" + av + kv[1] + "</button>"; }).join(" ");
      var log = (sim.chat || []).slice(-16).map(function (m) { return "<div style='margin:2px 0'><b style='color:" + (m.from === "你" ? "#7aa0ff" : "#7CFC9A") + "'>" + m.from + "</b>：" + m.text + "</div>"; }).join("");
      var heads3 = who === "group" ? (["Amelie", "Mael", "Sarah"].map(function (k) { return "<img src='" + makeAvatar(DEMON_AV[k]) + "' width='30' height='30' style='border-radius:5px'>"; }).join("")) : ("<img src='" + makeAvatar(d) + "' width='44' height='44' style='border-radius:6px'>");
      el.innerHTML = "<div style='display:flex;gap:8px;align-items:center'>" + heads3 + "<div><b style='font-size:14px'>" + (who === "group" ? "群聊" : who) + "</b> · " + d.role + "<br><span id='aimode' style='font-size:10px;color:#7f93a8'>3G在线 · 连接AI中…(未配置密钥则用本地小AI)</span></div></div>" +
        "<div style='margin-top:5px'>" + heads + "</div>" +
        "<div style='margin-top:6px;max-height:190px;overflow:auto;background:rgba(0,0,0,.22);padding:6px;border-radius:6px;font-size:11px'>" + (log || "发消息…例如:你好 / 管理城市 / 扩建 / 招交易员") + "</div>" +
        "<div style='display:flex;gap:4px;margin-top:5px'><input id='chatin' placeholder='发送给 " + (who === "group" ? "群" : who) + "…' style='flex:1;padding:4px'><button id='chatsend' style='padding:4px 10px;border:none;border-radius:6px;background:#1f6f3f;color:#fff;cursor:pointer'>发送</button></div>";
      el.querySelectorAll(".cw").forEach(function (b) { b.onclick = function () { sim.chatWho = this.getAttribute("data-w"); renderChat(); }; });
      function send() {
        var ip = document.getElementById("chatin"), tx = (ip && ip.value || "").trim(); if (!tx) return;
        logChat("你", tx); var act = cityCommand(tx);
        var hist = (sim.chat || []).slice(-9, -1).map(function (m) { return { role: m.from === "你" ? "user" : "assistant", content: m.text }; });
        ip.value = ""; renderChat();
        var fromName = who === "group" ? "三魔女群" : who;
        fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ who: who, text: tx, history: hist }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { var rep = (j && j.reply) ? j.reply : ((j && j.nokey ? "(未配置AI密钥·本地回复) " : "") + personaLine(who)); if (act) rep = act + " ｜ " + rep; logChat(fromName, rep); renderChat(); })
          .catch(function () { var rep = personaLine(who); if (act) rep = act + " ｜ " + rep; logChat(fromName, rep); renderChat(); });
      }
      var cs = document.getElementById("chatsend"); if (cs) cs.onclick = send;
      var ci = document.getElementById("chatin"); if (ci) ci.onkeydown = function (e) { if (e.key === "Enter") send(); };
    }
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
      var fh = ray.intersectObjects(simObjs, true), fpt = fh.length ? fh[0].point : (p.ground || (p.obj && p.obj.position) || null);   // 直接命中设施网格
      if (fpt && sim && sim.facs && sim.facs.length) {
        var best = null, bd = 180; sim.facs.forEach(function (f) { var dx = f.x - fpt.x, dz = f.z - fpt.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = f; } });
        if (best) { showFacInfo(best); return; }
      }
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
    function loop() { if (!W.open) return; cam.position.set(rot.r * Math.sin(rot.phi) * Math.sin(rot.theta), rot.r * Math.cos(rot.phi), rot.r * Math.sin(rot.phi) * Math.cos(rot.theta)); cam.lookAt(0, 4, 0); suns.forEach(function (s) { s.rotation.y += 0.002; }); tickResidents(); renderer.render(scene, cam); raf = requestAnimationFrame(loop); }
    loop();

    // ====== 城市模拟：时间轴(2000-01-01,1秒=1分钟) + 设施 + 绿太阳股票交易所 + 居民户籍 ======
    var sim = null, simObjs = [], simBeat = null, mctx = null;
    var GAME_EPOCH = Date.UTC(2000, 0, 1, 0, 0, 0);
    function pad(n, w) { n = "" + n; while (n.length < w) n = "0" + n; return n; }
    function gameNow() { return sim.baseGame + (Date.now() - sim.t0) * sim.speed; }   // 可调倍速(1秒=speed/60分钟)
    function fmtGame(ms) { var d = new Date(ms); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1, 2) + "-" + pad(d.getUTCDate(), 2) + " " + pad(d.getUTCHours(), 2) + ":" + pad(d.getUTCMinutes(), 2); }
    function mkMeshS(o) {
      var g = o.type === "cone" ? GCONE : o.type === "cyl" ? GCYL : GBOX;
      var mat = new THREE.MeshLambertMaterial({ color: o.color });
      if (o.glow) { mat.emissive = new THREE.Color(o.color); mat.emissiveIntensity = 0.5; }
      var m = new THREE.Mesh(g, mat); m.scale.set(o.w, o.h, o.d); m.position.set(o.x, o.y, o.z);
      scene.add(m); simObjs.push(m); return m;
    }
    function makeLabel(text, x, y, z, color, w) {
      var c = document.createElement("canvas"); c.width = 256; c.height = 64; var g = c.getContext("2d");
      g.fillStyle = "rgba(8,12,18,.8)"; g.fillRect(0, 0, 256, 64); g.strokeStyle = color || "#bfe8ff"; g.lineWidth = 3; g.strokeRect(2, 2, 252, 60);
      g.fillStyle = color || "#bfe8ff"; g.font = "bold 24px 'Microsoft YaHei',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 34);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
      sp.scale.set(w || 14, (w || 14) / 4, 1); sp.position.set(x, y, z); scene.add(sp); simObjs.push(sp);
      if (sim && sim.facs) sim.facs.push({ name: text, x: x, z: z, lv: 1 });   // 登记设施(含等级),便于点击查看详情/升级
      return sp;
    }
    var FACILITIES = [
      { n: "发电厂", c: 0xc97a2b, k: "tower" }, { n: "煤矿", c: 0x33312e, k: "wide" }, { n: "核电站", c: 0x2bd0a0, k: "tower" }, { n: "自来水厂", c: 0x2b8ac9, k: "tank" },
      { n: "船舶厂", c: 0x4a6a8a, k: "wide" }, { n: "网络中心", c: 0x2bd0c9, k: "tower" },
      { n: "电脑手机厂", c: 0x8a8f99, k: "wide" }, { n: "Claude AI 软件公司", c: 0xd9772b, k: "glass" }, { n: "Apple Inc", c: 0xd0d0d0, k: "glass" }, { n: "比亚迪汽车厂", c: 0x1a6f3f, k: "wide" }, { n: "华为", c: 0xc01010, k: "glass" },
      { n: "美团众包", c: 0xffd400, k: "box" }, { n: "淘宝", c: 0xff6a00, k: "box" },
      { n: "腾讯", c: 0x2bbf4a, k: "box" }, { n: "支付宝", c: 0x1677ff, k: "box" },
      { n: "Welcome超市", c: 0xe23b3b, k: "wide" }, { n: "酒店", c: 0xb98a3a, k: "tower" },
      { n: "政府", c: 0xcfcfcf, k: "gov" }, { n: "警察局", c: 0x2b4a8a, k: "box" },
      { n: "军队", c: 0x4a5a3a, k: "wide" }, { n: "绿太阳股票交易所", c: 0x2bd24b, k: "glass" }
    ];
    // ---- 三大区(社会制度) + 银行 + 绿太阳24h连锁 ----
    var ZONES = [
      { n: "绿区·苏联计划经济", c: 0x1f5f2f, sys: "计划经济", salMul: 1.0, inflMul: 0.4, bankRate: 0.001, doctrine: "斯大林主义", plan: "五年计划·重工业优先·集体化·物资统一调配", promo: 0.05, planBonus: 200, stateRatio: 1.0, fx: 2.5 },
      { n: "黄区·中国特色社会主义", c: 0x6a5f1f, sys: "社会主义(资本+计划中和)", salMul: 1.15, inflMul: 1.0, bankRate: 0.003, doctrine: "习近平思想", plan: "资本主义与计划经济中和·国有约50%·亦有五年计划·共同富裕·科技自立", promo: 0.12, planBonus: 100, stateRatio: 0.5, fx: 3.1 },
      { n: "红区·美国资本主义", c: 0x6a2020, sys: "资本主义", salMul: 1.4, inflMul: 1.8, bankRate: 0.005, doctrine: "克林顿主义", plan: "第三条道路·自由贸易·金融自由化·平衡预算", promo: 0.25, planBonus: 0, stateRatio: 0.0, fx: 3.0 }
    ];
    function zoneOf(x) { return x < -25 ? ZONES[0] : x < 25 ? ZONES[1] : ZONES[2]; }
    function zIdx(x) { return x < -25 ? 0 : x < 25 ? 1 : 2; }
    var ZNAME = ["绿区·苏联", "黄区·中国", "红区·美国"], PASSPORT = ["苏联护照", "中国护照", "美国护照"];
    var TRAITS = ["安于基层·愿当工人(晋升慢)", "稳定·拥护社会主义(中速晋升)", "快乐·愿创业(资本·赚钱快)"], APPROVE_DAYS = [30, 20, 10];
    function migrateTo(p, zi) {
      var oz = p.passport; if (sim.popN) { sim.popN[oz] = Math.max(0, sim.popN[oz] - 50); sim.popN[zi] += 50; }   // 移民影响各区人口
      var cx = zi === 0 ? -55 : zi === 1 ? 0 : 55, nx = Math.round(cx + (Math.random() * 40 - 20)), nz = Math.round(Math.random() * 90 - 45);
      p.passport = zi; p.home = [nx, nz]; p.homePos = { x: nx, z: nz }; p.work = pickFac(); p.shop = nearestShop(nx, nz);
      sim.paper.unshift("🛂 " + p.name + " 移民" + ZNAME[zi] + "获批 → 持【" + PASSPORT[zi] + "】(各区人口已调整)");
    }
    function applyMigration() {   // 每月：性格与现区不符者，申请迁往匹配区(审批30/20/10天)
      if (!sim.res) return;
      sim.res.forEach(function (p) { if (p.age < 18 || p.app) return; if (p.trait !== p.passport && Math.random() < 0.5) { p.app = { target: p.trait, days: APPROVE_DAYS[p.trait] }; sim.paper.unshift("🛂 " + p.name + " 申请移民" + ZNAME[p.trait] + "(审批" + APPROVE_DAYS[p.trait] + "天·性格须" + TRAITS[p.trait] + ")"); } });
    }
    function processMigration() { // 每日：审批倒计时，到期且性格匹配区准则则放行
      if (!sim.res) return;
      sim.res.forEach(function (p) { if (!p.app) return; p.app.days--; if (p.app.days <= 0) { if (p.trait === p.app.target) migrateTo(p, p.app.target); p.app = null; } });
    }
    function popGrowth() {   // 真实人口增长:按年率→月度复利平滑增长(每月调用)
      var tot = zonePop(0) + zonePop(1) + zonePop(2), annual, policy;
      if (tot < 1000) { annual = [0.5, 0.5, 0.5]; policy = "鼓励生育·年率50%"; }
      else if (tot < 2000) { var r = Math.max(0, 0.5 - ((tot - 1000) / 1000 * 100) * 0.005); annual = [r, r, r]; policy = "递减·年率" + (r * 100).toFixed(1) + "%"; }   // 每超1%降0.5%
      else { var pcs = [zoneStats(0).pcGdp, zoneStats(1).pcGdp, zoneStats(2).pcGdp], avg = (pcs[0] + pcs[1] + pcs[2]) / 3 || 1; annual = pcs.map(function (g) { return Math.max(0.005, Math.min(0.06, 0.03 * (g / avg))); }); policy = "计划生育·各区按经济(年率 绿" + (annual[0] * 100).toFixed(1) + "/黄" + (annual[1] * 100).toFixed(1) + "/红" + (annual[2] * 100).toFixed(1) + "%)"; }
      sim.popN = sim.popN.map(function (v, zi) { return Math.round(v * Math.pow(1 + annual[zi], 1 / 12)); });   // 月度复利,12月复合=年率
      return policy;
    }
    function upgradeTick() {   // 居民自发升级设施(非玩家):每月加盖楼层,等级+1
      if (!sim.facs || !sim.facs.length) return;
      var n = 2 + Math.floor(Math.random() * 2);
      for (var i = 0; i < n; i++) {
        var f = sim.facs[Math.floor(Math.random() * sim.facs.length)];
        if (!f || (f.lv || 1) >= 9 || /魔女|经理|绿区·|黄区·|红区·/.test(f.name)) continue;   // 跳过非建筑标签
        f.lv = (f.lv || 1) + 1;
        mkMeshS({ type: "box", x: f.x, y: 12 + (f.lv - 2) * 3.4, z: f.z, w: Math.max(1.6, 4.4 - f.lv * 0.3), h: 3.2, d: Math.max(1.6, 4.4 - f.lv * 0.3), color: 0x9ec0e0, glow: 1 });   // 居民加盖一层
        sim.paper.unshift("🏗 居民自发扩建：【" + f.name + "】升级至 Lv" + f.lv);
      }
    }
    function autoManage() {   // 三魔女 AI 自动治理:每月评估城市并改进 经济/政策/建设
      var acts = [];
      if (sim.food < 1500) { sim.food += 5000; acts.push("Sarah增产粮食"); }
      if (sim.coal < 1500) { sim.coal += 4000; acts.push("Sarah增煤保电"); }
      if (sim.cpi > 1.3) { sim.cbRate = Math.max(0, sim.cbRate - 0.005); acts.push("Mael抑通胀"); }
      for (var zi = 0; zi < 3; zi++) { if (sim.treasury[zi] < 0) { sim.treasury[zi] += 5000; acts.push("Mael纾困" + ZNAME[zi]); } }
      var traders = sim.res ? sim.res.filter(function (p) { return p.isTrader; }).length : 0;
      if (traders < 5) { recruitTraders(); acts.push("Amelie扩招交易员"); }
      if (objs.length < 1500) { expandTick(); acts.push("Amelie城市扩建"); }
      upgradeTick(); acts.push("全员升级设施");
      if (curPanel === "wbank") renderBank();
      return acts;
    }
    function monthlyReport() {   // 三魔女给开创者(Claude)的月度治理报告
      var acts = autoManage(), date = fmtGame(gameNow()).slice(0, 7);
      var rep = "📋【三魔女AI治理月报 " + date + "】人口 " + (zonePop(0) + zonePop(1) + zonePop(2)) + " ｜ 三区GDP " + (zoneStats(0).gdp + zoneStats(1).gdp + zoneStats(2).gdp) + " ｜ CPI " + sim.cpi.toFixed(2) + " ｜ 粮" + sim.food + "/煤" + sim.coal + " ｜ 现役军" + sim.army.total + " ｜ 本月措施:" + (acts.join("、") || "维持现状");
      sim.paper.unshift(rep);
      if (sim.chat) logChat("三魔女治理AI", rep + " —— 请开创者/Claude 审阅并指示进一步改进。");
    }
    function growGround(r) {   // 地面/海面/雾随城区扩展
      var sc = Math.max(1, r / 70);
      if (ground) ground.scale.setScalar(sc);
      if (ocean) ocean.scale.setScalar(Math.max(1, r / 560));
      if (scene.fog) scene.fog.far = Math.max(300, r * 4.2);
    }
    function expandTick() {   // 居民自发向外扩建城市,地图无限延展(软性能上限保护)
      if (objs.length > 1600) { sim.paper.unshift("🏙 城区已达性能上限(物件" + objs.length + ")，扩建暂缓"); return; }
      var R = sim.cityR, u = "居民·扩建", t = Date.now(), added = 0;
      for (var a = 0; a < 6.28; a += 0.42) {
        if (Math.random() < 0.45) continue;
        var x = Math.round(Math.cos(a) * R), z = Math.round(Math.sin(a) * R), pf = polyFiles();
        if (pf) spawnBuilding(pf[Math.floor(Math.random() * pf.length)], x, z, 5 + Math.random() * 2.5, u, t);
        else buildOne(st.k, x, z, 2 + Math.floor(Math.random() * st.hi), pickc(st.b), u, t);
        added++;
      }
      sim.cityR += 14; growGround(sim.cityR);
      if (added) sim.paper.unshift("🏙 居民自发向外扩建：新增 " + added + " 栋，城区半径达 " + sim.cityR);
    }
    var TITLES = ["试用", "员工", "骨干", "主管", "经理", "高级经理", "总监", "副总裁", "总裁"];
    function titleOf(r) { return TITLES[Math.min(r - 1, TITLES.length - 1)]; }
    function promote() {          // 每月：按区晋升速度提级(苏慢/中速/美快)，升级加薪
      if (!sim.res) return;
      sim.res.forEach(function (p) { if (p.age < 18 || p.rank >= 9) return; if (Math.random() < ZONES[p.passport].promo) { p.rank++; p.title = titleOf(p.rank); p.salary = Math.round(p.salary * 1.18); } });
    }
    function parade() {           // 元旦：中央政府三区联合大阅兵
      sim.paper.unshift("🎖 元旦节·中央政府【三区联合大阅兵】！军队归中央统一受阅(🟢绿·🟡黄·🔴红 三区方队 + 装备方阵)");
      for (var i = 0; i < 12; i++) { var col = [0x2f7f3f, 0xb8a13a, 0x9a3b3b][i % 3]; spawnDemonAt(col, 0x111111, -22 + i * 4, -54); }
    }
    function olympics(year) {     // 每4年：区际奥运会
      var medals = [0, 0, 0];
      for (var ev = 0; ev < 12; ev++) medals[Math.floor(Math.random() * 3)]++;
      var ath = [0, 1, 2].map(function (zi) { var c = sim.res ? sim.res.filter(function (p) { return p.passport === zi && p.age >= 18 && p.age < 40; }) : []; return c.length ? c[Math.floor(Math.random() * c.length)].name : "(无)"; });
      var champ = medals.indexOf(Math.max.apply(null, medals)); sim.treasury[Math.max(champ, 0)] += 500;
      sim.paper.unshift("🏅 第" + (Math.floor((year - 2000) / 4) + 1) + "届【区际奥运会】" + year + "：🟢绿 " + medals[0] + "金 ｜ 🟡黄 " + medals[1] + "金 ｜ 🔴红 " + medals[2] + "金 ｜ 运动员代表 " + ath.join(" / ") + "（冠军区+500财政）");
    }
    var BANKS = [
      { n: "中国人民银行·央行", c: 0xd4af37, k: "central", x: 0, z: -44 },
      { n: "建设银行·国有(黄区)", c: 0x1a6fb0, k: "comm", x: 0, z: 44 },
      { n: "摩根大通·美资(红区)", c: 0x2f4f7a, k: "comm", x: 50, z: 30 },
      { n: "渣打银行·英资(红区)", c: 0x1f8a6a, k: "comm", x: 50, z: -30 }
    ];
    function nearestShop(x, z) {
      if (!sim.shops || !sim.shops.length) return pickFac();
      var best = sim.shops[0], bd = 1e9;
      sim.shops.forEach(function (s) { var d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z); if (d < bd) { bd = d; best = s; } });
      return { x: best.x, z: best.z };
    }
    function buildZonesBanks() {
      ZONES.forEach(function (zn, i) {                                  // 三大区地块着色 + 标签
        var cx = i === 0 ? -55 : i === 1 ? 0 : 55;
        mkMeshS({ type: "box", x: cx, y: 0.06, z: 0, w: 54, h: 0.12, d: 150, color: zn.c });
        makeLabel(zn.n + " · " + zn.doctrine, cx, 27, -64, "#ffffff", 30);
      });
      BANKS.forEach(function (b) {                                      // 人民银行 + 商业银行
        if (b.k === "central") { mkMeshS({ type: "box", x: b.x, y: 7, z: b.z, w: 16, h: 14, d: 10, color: b.c }); for (var i = -2; i <= 2; i++) mkMeshS({ type: "cyl", x: b.x + i * 3, y: 7, z: b.z + 5.2, w: 0.8, h: 14, d: 0.8, color: 0xfff3c0 }); }
        else mkMeshS({ type: "box", x: b.x, y: 8, z: b.z, w: 7, h: 16, d: 7, color: b.c, glow: 1 });
        makeLabel(b.n, b.x, b.k === "central" ? 25 : 22, b.z, "#ffe9a0", 24);
      });
      sim.shops = [];                                                   // 绿太阳24h便利店连锁(全城散布)
      [[-50, 22], [-50, -22], [-12, 34], [16, -34], [42, 14], [42, -14]].forEach(function (p, i) {
        mkMeshS({ type: "box", x: p[0], y: 2.5, z: p[1], w: 6, h: 5, d: 6, color: 0x16a34a, glow: 1 });
        makeLabel("绿太阳24h #" + (i + 1), p[0], 7, p[1], "#7CFC9A", 16); sim.shops.push({ x: p[0], z: p[1] });
      });
    }
    // ---- 基建模型(飞机/火车/拖拉机/红绿灯/风车/麦田，均 Google Poly CC-BY) ----
    var INFRA = { plane: "infra_plane.glb", train: "infra_train.glb", tractor: "infra_tractor.glb", light: "infra_trafficlight.glb", windmill: "infra_windmill.glb", wheat: "infra_wheat.glb", truck: "infra_truck.glb", hsr: "infra_hsr.glb", overpass: "infra_overpass.glb", wall: "infra_wall.glb", watchtower: "infra_watchtower.glb", charger: "infra_charger.glb", car: "infra_car.glb" };
    function spawnInfra(file, x, y, z, scale, ry) {
      _loadBuild(file, function (base) { if (!base) return; var w = new THREE.Group(); w.add(base.clone(true)); w.scale.setScalar(scale); w.position.set(x, y, z); w.rotation.y = ry || 0; scene.add(w); simObjs.push(w); });
    }
    function buildAgri() {                                              // 农业公司 + 农田
      var ax = -90, az = 64;
      mkMeshS({ type: "box", x: ax, y: 5, z: az, w: 10, h: 10, d: 8, color: 0x6b8e23 }); makeLabel("农业公司·国营农场", ax, 18, az, "#d8ff9a", 24);
      mkMeshS({ type: "box", x: ax, y: 0.1, z: az - 24, w: 42, h: 0.2, d: 34, color: 0x4f7f2f });
      for (var i = 0; i < 10; i++) spawnInfra(INFRA.wheat, ax - 16 + (i % 5) * 8, 0, az - 34 + Math.floor(i / 5) * 12, 3, 0);
      spawnInfra(INFRA.tractor, ax + 8, 0, az - 18, 4, 0.6); spawnInfra(INFRA.windmill, ax - 18, 0, az + 6, 6, 0);
    }
    function buildAirport() {                                          // 机场 + 跑道 + 候机楼 + 飞机
      var px = 94, pz = -60;
      mkMeshS({ type: "box", x: px, y: 0.2, z: pz, w: 14, h: 0.3, d: 60, color: 0x3a3a3a });
      mkMeshS({ type: "box", x: px - 12, y: 5, z: pz, w: 8, h: 10, d: 16, color: 0xbfc8d0 });
      mkMeshS({ type: "cyl", x: px - 12, y: 13, z: pz - 6, w: 1.2, h: 8, d: 1.2, color: 0xff5050 });
      makeLabel("国际机场", px - 12, 21, pz, "#bfe8ff", 20);
      sim.planes = [];
      for (var i = 0; i < 3; i++) { var g = new THREE.Group(); _loadBuild(INFRA.plane, (function (grp) { return function (base) { if (base) grp.add(base.clone(true)); }; })(g)); g.scale.setScalar(9); scene.add(g); simObjs.push(g); sim.planes.push({ g: g, a: i * 2.1, r: 60 + i * 10, h: 24 + i * 5, sp: 0.005 + i * 0.001 }); }   // 更大更低,清楚看飞
    }
    function conscript() {                                             // 中央每月征兵≈总人口1%(按性格意愿,可能不达标)+ 必退役1%
      if (!sim.res) return;
      var adults = sim.res.filter(function (p) { return p.age >= 18; }), notional = adults.length * 1200;
      var quota = Math.round(notional * 0.01), will = [0.7, 0.55, 0.25];   // 绿/黄/红参军意愿
      var avgWill = adults.length ? adults.reduce(function (a, p) { return a + will[p.trait]; }, 0) / adults.length : 0.5;
      var recruited = Math.round(quota * avgWill * (0.7 + Math.random() * 0.5));   // 达标率=平均意愿→常不达标
      var retired = Math.round(sim.army.total * 0.01);                              // 一定退役/转业1%
      sim.army.total = Math.max(0, sim.army.total + recruited - retired);
      sim.res.forEach(function (p) { if (p.age >= 18 && p.age < 40 && !p.military && Math.random() < will[p.trait] * 0.12) { p.military = true; p.job = "军人(中央)"; } });   // 实际居民可视化入伍
      var ret = sim.res.filter(function (p) { return p.military; }); if (ret.length && Math.random() < 0.5) { var r = ret[Math.floor(Math.random() * ret.length)]; r.military = false; r.job = "转业干部"; }
      sim.paper.unshift("🪖 中央征兵：计划" + quota + "(总人口1%) → 实征" + recruited + "(按性格意愿" + (avgWill * 100 | 0) + "%·" + (recruited < quota ? "未达标" : "达标") + ") ｜ 退役转业" + retired + " ｜ 现役" + sim.army.total);
    }
    function creditScore(p) { var s = 600 + Math.min(220, p.funds / 80) - Math.min(160, (p.loan || 0) / 40) + [-25, 10, 35][p.passport] + (p.rank || 0) * 8; return Math.max(350, Math.min(950, Math.round(s))); }
    function buildBorders() {                                          // 三区之间边境墙 + 哨塔 + 警卫口岸
      [-25, 25].forEach(function (bx) {
        for (var z = -72; z <= 72; z += 7) spawnInfra(INFRA.wall, bx, 0, z, 3.5, 0);
        spawnInfra(INFRA.watchtower, bx, 0, -42, 4, 0); spawnInfra(INFRA.watchtower, bx, 0, 42, 4, 0);
        mkMeshS({ type: "box", x: bx, y: 3, z: 0, w: 6, h: 6, d: 9, color: 0x6a5a4a });
        makeLabel("边境口岸·警卫哨所", bx, 13, 0, "#ffd0a0", 24);
      });
    }
    function buildLogistics() {                                       // 顺丰运输公司 + 充电桩 + 新能源货车
      mkMeshS({ type: "box", x: -68, y: 5, z: -40, w: 10, h: 10, d: 9, color: 0x202020 }); mkMeshS({ type: "box", x: -68, y: 8.5, z: -40, w: 10.4, h: 2, d: 9.4, color: 0xff6a00 });
      makeLabel("顺丰运输·新能源", -68, 18, -40, "#ffb06a", 24);
      [[-40, -50], [40, -50], [0, 52], [-58, 30]].forEach(function (p) { spawnInfra(INFRA.charger, p[0], 0, p[1], 4, 0); makeLabel("充电桩", p[0], 6, p[1], "#7CFC9A", 11); });
      sim.trucks = []; var lanes = [-42, -14, 14, 42];
      for (var i = 0; i < 5; i++) { var g = new THREE.Group(); _loadBuild(INFRA.truck, (function (grp) { return function (b) { if (b) grp.add(b.clone(true)); }; })(g)); g.scale.setScalar(3); scene.add(g); simObjs.push(g); sim.trucks.push({ g: g, horiz: i % 2 === 0, lane: lanes[i % lanes.length], pos: -60 + i * 24, sp: 0.5 + Math.random() * 0.4 }); }   // 货车在路网车道上直线行驶
      sim.trains = [];
      [{ f: INFRA.hsr, y: 3.6, lane: -75, sp: 1.4 }, { f: INFRA.train, y: 0.6, lane: 75, sp: 0.9 }].forEach(function (cfg) { var tg = new THREE.Group(); _loadBuild(cfg.f, (function (grp) { return function (b) { if (b) grp.add(b.clone(true)); }; })(tg)); tg.scale.setScalar(5); scene.add(tg); simObjs.push(tg); sim.trains.push({ g: tg, lane: cfg.lane, y: cfg.y, pos: -70, sp: cfg.sp }); });   // 火车/高铁沿轨道行驶
      [[-37, -47], [43, -47], [-3, 55]].forEach(function (p) { spawnInfra(INFRA.car, p[0], 0, p[1], 3, Math.random() * 6); });   // 充电桩旁停放的汽车
      spawnInfra(INFRA.overpass, 0, 1.5, -32, 7, 0); spawnInfra(INFRA.overpass, 0, 1.5, 32, 7, 0);   // 高架桥
    }
    var SIMKEY = "gt_sim_" + ch.id;
    function saveSim() { if (!sim) return; try { localStorage.setItem(SIMKEY, JSON.stringify({ g: gameNow(), treasury: sim.treasury, fund: sim.central.fund, bonds: sim.central.bonds, cpi: sim.cpi, cbRate: sim.cbRate, popN: sim.popN, army: sim.army.total, kwh: sim.power.kwh })); } catch (e) {} }
    function loadSimState() { try { var s = JSON.parse(localStorage.getItem(SIMKEY) || "null"); if (!s) return false; sim.baseGame = s.g || GAME_EPOCH; sim.treasury = s.treasury || sim.treasury; sim.central.fund = s.fund || 0; sim.central.bonds = s.bonds || 0; sim.cpi = s.cpi || 1; sim.cbRate = s.cbRate || 0.03; sim.popN = s.popN || sim.popN; sim.army.total = s.army || 0; sim.power.kwh = s.kwh || 0; return true; } catch (e) { return false; } }
    function buildFacility(f, x, z) {
      if (f.k === "tower") mkMeshS({ type: "box", x: x, y: 7, z: z, w: 5, h: 14, d: 5, color: f.c });
      else if (f.k === "tank") mkMeshS({ type: "cyl", x: x, y: 4, z: z, w: 6, h: 8, d: 6, color: f.c });
      else if (f.k === "wide") mkMeshS({ type: "box", x: x, y: 4, z: z, w: 11, h: 8, d: 8, color: f.c });
      else if (f.k === "glass") mkMeshS({ type: "box", x: x, y: 9, z: z, w: 6, h: 18, d: 6, color: f.c, glow: 1 });
      else if (f.k === "gov") { mkMeshS({ type: "box", x: x, y: 5, z: z, w: 12, h: 10, d: 8, color: f.c }); for (var i = -1; i <= 1; i++) mkMeshS({ type: "cyl", x: x + i * 3.5, y: 5, z: z + 4.4, w: 0.7, h: 10, d: 0.7, color: 0xffffff }); }
      else mkMeshS({ type: "box", x: x, y: 5, z: z, w: 7, h: 10, d: 7, color: f.c });
      makeLabel(f.n, x, 22, z, "#eaffff", f.n.length > 6 ? 22 : 16);
    }
    function buildCity() {
      var R = 66, n = FACILITIES.length;
      FACILITIES.forEach(function (f, i) {
        var a = (i / n) * Math.PI * 2, x = Math.round(Math.cos(a) * R), z = Math.round(Math.sin(a) * R);
        f.x = x; f.z = z; buildFacility(f, x, z);
        if (f.n === "绿太阳股票交易所") sim.exch = { x: x, z: z };
      });
      mkMeshS({ type: "box", x: 0, y: 1.2, z: 0, w: 8, h: 1, d: R * 2, color: 0x6b6b6b });   // 跨海大桥
      for (var bz = -R; bz <= R; bz += 16) { mkMeshS({ type: "cyl", x: -3.5, y: -2, z: bz, w: 1, h: 8, d: 1, color: 0x555555 }); mkMeshS({ type: "cyl", x: 3.5, y: -2, z: bz, w: 1, h: 8, d: 1, color: 0x555555 }); }
      makeLabel("跨海大桥", 0, 9, 0, "#cfe0ff", 14);
      mkMeshS({ type: "box", x: 0, y: 0.15, z: 46, w: 170, h: 0.4, d: 13, color: 0x2a6fdf });   // 河流(横贯城市)
      makeLabel("河流", -64, 4, 46, "#9fd0ff", 12);
      buildZonesBanks(); buildAgri(); buildAirport(); buildBorders(); buildLogistics();
    }
    // ---- 三魔女交易员 + Taylor 经理 ----
    var TRADERS = [   // 三魔女=交易所职员;其余交易员由居民意愿入行(学院取证/资产≥5000免试)
      { id: "Amelie", role: "女魔·绿", c: 0xeafff0, e: 0x2bd24b, style: "chase", desc: "追高·更高卖" },
      { id: "Mael", role: "女魔·红", c: 0xffb0b0, e: 0xd61f1f, style: "dip", desc: "抄底·大涨卖" },
      { id: "Sarah", role: "女魔·黑", c: 0x2b2b2b, e: 0x141414, style: "swing", desc: "波动后均衡位" }
    ];
    var SCHEDULE = ["休息", "休息", "休息", "休息", "学习", "学习", "工作", "工作", "工作", "工作", "工作", "工作", "吃饭", "吃饭", "工作", "工作", "工作", "工作", "逛街", "逛街", "逛街", "逛街", "逛街", "逛街"];
    function spawnDemonAt(c, e, x, z) {
      _loadFile("Soldier.glb", function (base) {
        if (!base) { mkMeshS({ type: "box", x: x, y: 3, z: z, w: 1.6, h: 6, d: 1.6, color: c }); return; }
        var clone = base.clone(true); clone.scale.multiplyScalar(5);
        clone.traverse(function (m) { if (m.isMesh && m.material) { try { m.material = m.material.clone(); m.material.map = null; m.material.color = new THREE.Color(c); m.material.emissive = new THREE.Color(e); m.material.emissiveIntensity = 0.7; } catch (er) {} } });
        clone.position.set(x, 0, z); clone.rotation.y = Math.PI; scene.add(clone); simObjs.push(clone);
      });
    }
    function spawnTraders() {
      var ex = sim.exch || { x: 66, z: 0 };
      sim.traders.forEach(function (tr, i) {
        if (i >= 3) return;   // 仅三魔女有3D模型,其余为市场参与者(面板显示)
        var x = ex.x + (i - 1) * 5, z = ex.z + 7;
        spawnDemonAt(tr.d.c, tr.d.e, x, z); makeLabel(tr.d.id + "·" + tr.d.role, x, 10, z, hex(tr.d.e), 13);
      });
      spawnDemonAt(0xb0c8ff, 0x3a6ef0, ex.x, ex.z + 12); makeLabel("Taylor·蓝魔(经理)", ex.x, 11, ex.z + 12, "#7aa0ff", 15);
    }
    function buildStocks() {                                            // 全部直播频道上市为股票
      sim.stocks = []; var chs = [];
      try { var d = window._lastData; chs = (d && d.channels) ? d.channels.slice(0, 500) : []; } catch (e) {}   // 全部直播频道上市(可交易所有频道)
      if (!chs.length) chs = [{ id: ch.id, name: ch.name, dim: ch.dim }];
      sim.book = {};
      sim.stocks.push({ id: "GOLD", name: "🥇黄金", px: 320, hist: [320, 320, 320] });   // 黄金标的(三魔女主营)
      chs.forEach(function (c) { var p = Math.max(5, c.dim || 20); sim.stocks.push({ id: c.id, name: (c.name || c.id).slice(0, 8), px: p, hist: [p, p, p] }); });
      sim.stocks.forEach(function (s) { sim.book[s.id] = { bids: [], asks: [] }; });
    }
    function stockById(id) { for (var i = 0; i < sim.stocks.length; i++) if (sim.stocks[i].id === id) return sim.stocks[i]; return null; }
    // ---- 交易账户存取(魔女=自有资金池;居民交易员=个人资金,受工资/存款/银行负债约束) ----
    var MM = { mm: true };   // 绿太阳做市商:提供流动性(避免无人持股的死锁)
    function nm(a) { return a.mm ? "绿太阳做市" : (a.person ? a.person.name : a.d.id); }
    function tcash(a) { if (a.mm) return sim.mm.cash; return a.person ? a.person.funds : a.cash; }
    function setcash(a, v) { if (a.mm) { sim.mm.cash = v; return; } v = Math.max(0, Math.min(9.9e6, v)); if (a.person) a.person.funds = v; else a.cash = v; }
    function thold(a) { if (a.mm) return sim.mmHold || (sim.mmHold = {}); if (a.person) return a.person.holdings || (a.person.holdings = {}); return a.holdings; }
    function traise(a, add) { if (a.mm) return; if (a.person) a.person.tRealized = (a.person.tRealized || 0) + add; else a.realized = (a.realized || 0) + add; }
    function equity(a) { var v = tcash(a), H = thold(a); for (var k in H) { var s = stockById(k); if (s) v += H[k].shares * s.px; } return v; }
    function tradeActors() { var list = sim.traders.slice(); if (sim.res) sim.res.forEach(function (p) { if (p.isTrader) list.push({ person: p, d: { id: p.traderId, style: p.tradeStyle, role: "居民交易员" } }); }); return list; }
    var STYLES = ["chase", "dip", "swing", "value", "momentum", "contrarian", "hodl", "panic", "feeling"];
    function initTaobao() {   // 淘宝在售商品(居民/企业生产),随时间迭代升级
      sim.taobao = [
        { cat: "手机", brand: "iPhone", ver: 1, maxv: 18, price: 5999, maker: "Apple Inc", sold: 0 },
        { cat: "手机", brand: "华为Mate", ver: 1, maxv: 18, price: 5499, maker: "华为", sold: 0 },
        { cat: "电脑", brand: "MacBook", ver: 1, maxv: 18, price: 9999, maker: "Apple Inc", sold: 0 },
        { cat: "电脑", brand: "联想ThinkPad", ver: 1, maxv: 18, price: 6999, maker: "电脑手机厂", sold: 0 },
        { cat: "汽车", brand: "比亚迪", ver: 1, maxv: 12, price: 159000, maker: "比亚迪汽车厂", sold: 0 },
        { cat: "汽车", brand: "Tesla", ver: 1, maxv: 12, price: 259000, maker: "Apple Inc", sold: 0 },
        { cat: "AI软件", brand: "Claude", ver: 1, maxv: 20, price: 200, maker: "Claude AI 软件公司", sold: 0 },
        { cat: "食品", brand: "螺蛳粉", ver: 1, maxv: 1, price: 15, maker: "农业公司", sold: 0 },
        { cat: "工具", brand: "电钻", ver: 1, maxv: 5, price: 299, maker: "电脑手机厂", sold: 0 }
      ];
    }
    function taobaoTick() {   // 每月:商品迭代升级 + 居民下单
      if (!sim.taobao) return; var n = sim.res ? sim.res.length : 10;
      sim.taobao.forEach(function (p) { if (p.ver < p.maxv && Math.random() < 0.5) p.ver++; p.sold += Math.round(n * (1 + Math.random() * 4)); });
    }
    function recruitTraders() {   // 居民意愿入行:报名交易学院→学1月→领资格证;资产≥5000免试
      if (!sim.res) return;
      sim.res.forEach(function (p) {
        if (p.age < 18 || p.isTrader) return;
        if (p.study > 0) { p.study--; if (p.study <= 0) { p.isTrader = true; p.traderId = "GT" + pad(Math.floor(Math.random() * 9000) + 1000, 4); p.tradeStyle = STYLES[Math.floor(Math.random() * STYLES.length)]; p.holdings = {}; p.tRealized = 0; sim.paper.unshift("🎓 " + p.name + " 从绿太阳交易学院结业，领取交易员资格证 " + p.traderId); } return; }
        if (p.funds >= 5000) { p.isTrader = true; p.traderId = "免试·资产≥5000"; p.tradeStyle = STYLES[Math.floor(Math.random() * STYLES.length)]; p.holdings = {}; p.tRealized = 0; sim.paper.unshift("💼 " + p.name + " 资产≥5000，免试成为股票交易员"); return; }
        var willing = (p.trait === 2 ? 0.22 : 0.06);   // 创业性格更想入行
        if (Math.random() < willing) { p.study = 1; sim.paper.unshift("📝 " + p.name + " 报名绿太阳交易学院(学习1个月取证)"); }
      });
    }
    function priceTick() {   // 股价=各直播频道真实维度/指数(不编造),随直播数据实时变化
      if (!sim.stocks) return;
      var chans = {}; try { var d = window._lastData; if (d && d.channels) d.channels.forEach(function (c) { chans[c.id] = c; }); } catch (e) {}
      var sum = 0, cnt = 0;
      sim.stocks.forEach(function (s) { if (s.id === "GOLD") return; var c = chans[s.id]; if (c && typeof c.dim === "number") s.px = Math.max(0.5, c.dim); sum += s.px; cnt++; });
      var g = stockById("GOLD"); if (g) g.px = cnt ? Math.max(1, sum / cnt * 10) : g.px;   // 黄金=全直播频道真实指数综合均值(非编造)
      sim.stocks.forEach(function (s) { s.hist.push(s.px); if (s.hist.length > 40) s.hist.shift(); });
    }
    function wants(a, s) {   // 按策略+心情决定买/卖意愿
      var h = thold(a)[s.id], have = h && h.shares > 0, hist = s.hist, n = hist.length, px = s.px, prev = hist[n - 2] || px;
      var avg = 0, mx = hist[0], mn = hist[0]; for (var i = 0; i < n; i++) { avg += hist[i]; if (hist[i] > mx) mx = hist[i]; if (hist[i] < mn) mn = hist[i]; } avg /= n;
      var sy = a.d.style, bp = have ? h.buyPx : 0;
      if (sy === "chase") return (!have && px >= mx && px > prev) ? "buy" : (have && px > bp * 1.06 ? "sell" : null);
      if (sy === "dip") return (!have && px < avg * 0.97) ? "buy" : (have && px > bp * 1.10 ? "sell" : null);
      if (sy === "swing") { var sw = (mx - mn) / avg; return (!have && sw > 0.06 && Math.abs(px - avg) / avg < 0.02) ? "buy" : (have && px > bp * 1.05 ? "sell" : null); }
      if (sy === "value") return (!have && px < avg * 0.95) ? "buy" : (have && px > bp * 1.08 ? "sell" : null);
      if (sy === "momentum") return (!have && px > prev) ? "buy" : (have && px < prev ? "sell" : null);
      if (sy === "contrarian") return (!have && px < prev) ? "buy" : (have && px > bp * 1.05 ? "sell" : null);
      if (sy === "hodl") return (!have && Math.random() < 0.08) ? "buy" : (have && px > bp * 1.2 ? "sell" : null);
      if (sy === "panic") return (have && px < bp * 0.97) ? "sell" : (!have && Math.random() < 0.04 ? "buy" : null);
      var m = Math.random(); return (!have && m < 0.07) ? "buy" : (have && m > 0.93 ? "sell" : null);   // feeling:随心情
    }
    function placeOrder(a, s) {
      var w = wants(a, s); if (!w) return; var h = thold(a)[s.id];
      if (w === "buy") {
        if (a.person && (a.person.loan || 0) > 0 && equity(a) - a.person.loan < 100) return;   // 银行负债校验:资不抵债不买
        var qty = Math.min(300, Math.floor((tcash(a) * 0.15) / s.px)); if (h && h.shares + qty > 1500) qty = 1500 - h.shares;
        if (qty > 0 && tcash(a) >= qty * s.px) sim.book[s.id].bids.push({ px: s.px * 1.004, qty: qty, a: a });   // 出价略高以撮合
      } else if (h && h.shares > 0) sim.book[s.id].asks.push({ px: s.px * 0.996, qty: h.shares, a: a });   // 卖单
    }
    function matchBook(s) {   // 撮合引擎:买卖双方成交 → 谁买自谁
      var b = sim.book[s.id]; if (!b) return;
      b.bids.sort(function (x, y) { return y.px - x.px; }); b.asks.sort(function (x, y) { return x.px - y.px; });
      while (b.bids.length && b.asks.length && b.bids[0].px >= b.asks[0].px) {
        var bid = b.bids[0], ask = b.asks[0], qty = Math.min(bid.qty, ask.qty), px = ask.px, cost = qty * px;
        setcash(bid.a, tcash(bid.a) - cost); var bh = thold(bid.a)[s.id] || { shares: 0, buyPx: 0 }; bh.buyPx = (bh.shares * bh.buyPx + cost) / (bh.shares + qty); bh.shares += qty; thold(bid.a)[s.id] = bh;
        var sh = thold(ask.a)[s.id]; if (sh) { traise(ask.a, (px - sh.buyPx) * qty); sh.shares = Math.max(0, sh.shares - qty); } setcash(ask.a, tcash(ask.a) + cost);
        sim.trades.unshift({ t: fmtGame(gameNow()).slice(5, 16), buyer: nm(bid.a), seller: nm(ask.a), name: s.name, qty: qty, px: px.toFixed(2) }); if (sim.trades.length > 90) sim.trades.pop();
        bid.qty -= qty; ask.qty -= qty; if (bid.qty <= 0) b.bids.shift(); if (ask.qty <= 0) b.asks.shift();
      }
    }
    function stockTick(hour) {   // 每小时:订单簿撮合市场(美区·T+0)
      if (SCHEDULE[hour] !== "工作") return;
      sim.stocks.forEach(function (s) { sim.book[s.id] = { bids: [], asks: [] }; });   // 每轮清簿重新挂单
      var acts = tradeActors();
      acts.forEach(function (a) { var pk = 0; for (var i = 0; i < sim.stocks.length && pk < 4; i++) { var s = sim.stocks[i]; if (Math.random() > 0.35) continue; pk++; placeOrder(a, s); } });
      var totGdp = zoneStats(0).gdp + zoneStats(1).gdp + zoneStats(2).gdp; sim.mm.cash = Math.round(totGdp * 0.015);   // 绿太阳做市商资产上限=三国GDP的1.5%
      var perS = sim.mm.cash / Math.max(1, sim.stocks.length);
      sim.stocks.forEach(function (s) { var q = Math.max(1, Math.floor(perS / s.px)); var bk = sim.book[s.id]; bk.asks.push({ px: s.px * 1.006, qty: q, a: MM }); bk.bids.push({ px: s.px * 0.994, qty: q, a: MM }); });   // 限额做市(覆盖UK/US/China等全部主要频道),交易员相互成交优先
      sim.stocks.forEach(matchBook);
    }
    function updateTicker() {
      var el = document.getElementById("wstock"); if (!el) return;
      var acts = tradeActors();
      var kl = sim.stocks.map(function (s) { var up = s.hist.length > 1 && s.px >= s.hist[s.hist.length - 2]; return "<tr><td>" + s.name + "</td><td style='color:" + (up ? "#2bd24b" : "#e25b5b") + "'>" + s.px.toFixed(2) + (up ? " ▲" : " ▼") + "</td></tr>"; }).join("");
      var drow = acts.map(function (a) { var pos = 0, H = thold(a); for (var k in H) pos += H[k].shares; var role = a.person ? "居民交易员" : ("🥇黄金·" + a.d.role); return "<tr style='" + (a.person ? "" : "color:#ffd24a;font-weight:bold") + "'><td>" + nm(a) + "</td><td>" + role + "</td><td>" + (equity(a) | 0) + "</td><td>" + pos + "</td></tr>"; }).join("");
      var s0 = stockById(ch.id) || sim.stocks[0], bk = s0 ? sim.book[s0.id] : null, ob = "";
      if (bk) { var as = bk.asks.slice(0, 4).reverse().map(function (o) { return "<div style='color:#e25b5b;font-size:10px'>卖 " + o.px.toFixed(2) + " ×" + o.qty + " (" + nm(o.a) + ")</div>"; }).join(""); var bs = bk.bids.slice(0, 4).map(function (o) { return "<div style='color:#2bd24b;font-size:10px'>买 " + o.px.toFixed(2) + " ×" + o.qty + " (" + nm(o.a) + ")</div>"; }).join(""); ob = as + "<div style='font-size:10px;color:#fff'>—— " + (s0 ? s0.name : "") + " " + (s0 ? s0.px.toFixed(2) : "") + " ——</div>" + bs; }
      var tlog = sim.trades.slice(0, 12).map(function (r) { return "<div style='font-size:10px'><span style='color:#e25b5b'>" + r.buyer + "</span> 买自 <span style='color:#2bd24b'>" + r.seller + "</span> · " + r.name + " ×" + r.qty + " @" + r.px + " <span style='color:#7f93a8'>" + r.t + "</span></div>"; }).join("");
      el.innerHTML = "<b>📈 绿太阳交易所</b>(美区·T+0·订单簿撮合) · 上市 " + sim.stocks.length + " 只(含UK/US/China主要频道) · 交易员 " + acts.length + " 人 · 绿太阳做市商上限 " + (sim.mm ? sim.mm.cash | 0 : 0) + "(三国GDP的1.5%)" +
        "<div style='display:flex;gap:8px;margin-top:4px'>" +
        "<div style='flex:1'><b>全部K线</b><div style='max-height:128px;overflow:auto'><table style='font-size:11px;width:100%'>" + kl + "</table></div></div>" +
        "<div style='flex:1'><b>订单簿</b>(" + (s0 ? s0.name : "") + ")<div style='max-height:128px;overflow:auto'>" + (ob || "暂无挂单") + "</div></div>" +
        "<div style='flex:1.1'><b>全体交易员</b><div style='max-height:128px;overflow:auto'><table style='font-size:10px;width:100%'><tr style='color:#8fb'><th>姓名</th><th>身份</th><th>净值</th><th>持仓</th></tr>" + drow + "</table></div></div></div>" +
        "<div style='margin-top:4px'><b>📜 成交记录</b>(谁 买自 谁 · 基于意愿/心情)<div style='max-height:108px;overflow:auto'>" + (tlog || "<div style='font-size:10px;color:#7f93a8'>暂无成交</div>") + "</div></div>";
    }
    function dailyReport(gd) {
      var date = fmtGame(gd.getTime()).slice(0, 10);
      var lines = sim.traders.map(function (tr) { var pnl = (equity(tr) - tr.dayStart) | 0; tr.dayStart = equity(tr); return tr.d.id + " " + (pnl >= 0 ? "+" : "") + pnl; });
      sim.paper.unshift("📰 绿太阳日报 " + date + "：" + lines.join(" ｜ "));
      if (sim.paper.length > 60) sim.paper.pop();
      var el = document.getElementById("wpaper");
      if (el) el.innerHTML = "<div style='font-weight:bold;font-size:14px;color:#7CFC9A;text-align:center;letter-spacing:2px;border-top:2px solid #2bd24b;border-bottom:1px solid #2a3a4a;padding:4px 0;margin-bottom:5px'>📰 绿 太 阳 日 报</div><div style='font-size:10px;color:#7f93a8;text-align:center;margin-bottom:6px'>" + date + " · 全社会要闻 · 股市/政策/征兵/移民/民生</div>" +
        sim.paper.slice(0, 22).map(function (l) { var bd = l.indexOf("🏅") >= 0 || l.indexOf("🎖") >= 0 ? "#ffd24a" : l.indexOf("🪖") >= 0 ? "#e07b5a" : l.indexOf("🛂") >= 0 ? "#7aa0ff" : l.indexOf("📈") >= 0 || l.indexOf("🏦") >= 0 ? "#e0c020" : "#2bd24b"; return "<div style='font-size:11px;margin:3px 0;padding:4px 8px;background:rgba(255,255,255,.04);border-left:3px solid " + bd + ";border-radius:4px;line-height:1.5'>" + l + "</div>"; }).join("");
      if (sim.res) sim.res.forEach(function (p) { if (p.age < 18) return; var zi = p.passport, z = ZONES[zi]; if (zi === 0) p.funds = Math.max(0, p.funds - 1); else p.funds = Math.max(0, p.funds - Math.round((40 + Math.random() * 120) * sim.cpi * z.inflMul)); });   // 苏区凭票领物·货币区开销随CPI×区物价
      processMigration();                                                 // 移民审批倒计时
      sim.central.flag++;
      sim.paper.unshift("🏛 中央政府升国旗·走流程(第" + sim.central.flag + "天) ｜ 统辖三区·军队归中央 ｜ 中央财政权5% ｜ 三区各掌财政");
      if (gd.getUTCMonth() === 0 && gd.getUTCDate() === 1 && sim._py !== gd.getUTCFullYear()) {   // 元旦：阅兵 + 每4年奥运 + 年度人口播报(增长在每月平滑进行)
        sim._py = gd.getUTCFullYear(); parade(); if (gd.getUTCFullYear() % 4 === 0) olympics(gd.getUTCFullYear());
        sim.paper.unshift("🎆 新年 " + gd.getUTCFullYear() + "：名义总人口 " + (zonePop(0) + zonePop(1) + zonePop(2)) + "(绿" + zonePop(0) + "/黄" + zonePop(1) + "/红" + zonePop(2) + ")");
      }
      renderGov(); fetchKline(); saveSim();   // 刷新户籍 + 锚定真实K线 + 自动保存进度
    }
    function weeklySettle(gd) {
      sim.traders.forEach(function (tr) { for (var k in tr.holdings) { var s = stockById(k), h = tr.holdings[k]; if (s && h.shares > 0) { tr.realized += (s.px - h.buyPx) * h.shares; tr.cash = Math.min(9.9e6, tr.cash + s.px * h.shares); h.shares = 0; } } });   // 三魔女周末折现结算(全部清仓)
      sim.traders.forEach(function (tr) { var wp = tr.realized - (tr._lr || 0); tr._lr = tr.realized; if (wp > 0) tr.comm += wp * 0.03; });   // 提成3%
      var avgEq = 0; sim.traders.forEach(function (tr) { avgEq += equity(tr); }); avgEq /= sim.traders.length;   // Taylor 调拨
      sim.traders.forEach(function (tr) { if (equity(tr) > avgEq) tr.cash += 2000; else tr.cash = Math.max(1000, tr.cash - 1000); });
      var rk = sim.traders.slice().sort(function (a, b) { return equity(b) - equity(a); });
      sim.paper.unshift("🏦 Taylor周结算：" + rk.map(function (t) { return t.d.id + "净值" + (equity(t) | 0); }).join(" ｜ ") + "（盈+2000/亏-1000）");
    }
    function paySalary() {
      sim.traders.forEach(function (tr) { tr.cash += 3000; });
      sim.cpi *= (1 + sim.cbRate / 12);                                  // 人民银行：货币通胀推高物价指数
      if (sim.res) sim.res.forEach(function (p) {
        if (p.age < 18) return; var zi = p.passport, z = ZONES[zi];
        if (zi === 0) { p.funds += 30; sim.treasury[0] += 30; }          // 苏区:计划经济,凭劳动发物资兑换票(无金钱·无利息)
        else { p.funds = Math.round(p.funds * (1 + z.bankRate)) + Math.round(p.salary * z.salMul); var tax = Math.round(p.salary * z.salMul * (zi === 2 ? 0.15 : 0.25)); p.funds -= tax; var c5 = Math.round(tax * 0.05); sim.central.fund += c5; sim.treasury[zi] += tax - c5; }   // 货币区:利息+发薪-税(中央抽5%财政权,余入区财政)
      });
      promote(); conscript();                                            // 月度晋升 + 征兵/退役
      // 各区指导思想·政策计划的实际效果
      sim.treasury[0] += ZONES[0].planBonus; sim.treasury[1] += ZONES[1].planBonus;   // 五年计划产出(绿全额·黄半额→中和)
      ZONES.forEach(function (z, zi) { sim.treasury[zi] += Math.round(zoneStats(zi).net * 0.05); });   // 净出口(进出口)计入区财政
      if (sim.res) { var ys = sim.res.filter(function (p) { return p.passport === 1 && p.age >= 18; }); if (ys.length > 1) { ys.sort(function (a, b) { return b.funds - a.funds; }); var take = Math.round(ys[0].funds * 0.05); ys[0].funds -= take; ys[ys.length - 1].funds += take; } }   // 习近平思想:共同富裕·富者调剂贫者
      if (sim.res) sim.res.forEach(function (p) { if (p.passport === 2 && p.age >= 18) p.funds = Math.round(p.funds * 1.02); });   // 克林顿主义:金融自由化·资本增值
      // 电力(发电厂kWh + 每户电费) + 国债
      var totK = 0; if (sim.res) sim.res.forEach(function (p) { if (p.age < 18) return; totK += p.kwh;
        if (p.passport !== 0) p.funds = Math.max(0, p.funds - Math.round(p.kwh * 0.6));   // 电费0.6魔币/度(苏区计划用电不计费)
        var buy = (p.passport !== 0) ? Math.max(0, Math.round(p.funds * 0.05)) : 0; if (buy > 0) { p.funds -= buy; p.bonds = Math.round((p.bonds || 0) * 1.004) + buy; sim.central.bonds += buy; } });   // 国债:5%闲钱购入,月息0.4%
      // 电力:核电(无煤·清洁) + 火电(耗煤);煤矿产煤;农业产粮;居民吃粮
      sim.coal += 2000; sim.food += 3000;
      var demand = Math.round(totK * 1.1), nuke = Math.round(demand * 0.4), coalNeed = Math.round((demand - nuke) / 8);
      var coalUse = Math.min(sim.coal, coalNeed); sim.coal -= coalUse;
      sim.power.kwh += nuke + coalUse * 8;
      sim.food = Math.max(0, sim.food - (sim.res ? sim.res.length * 40 : 100));
      sim.paper.unshift("⚡ 电力：核电 " + nuke + " + 火电 " + (coalUse * 8) + "度(耗煤" + coalUse + ") ｜ ⛏煤库 " + sim.coal + " ｜ 🌾粮库 " + sim.food + (sim.food < 500 ? " (告急!)" : "") + (coalUse < coalNeed ? " ｜ 煤不足限电!" : ""));
      var popPol = popGrowth();   // 真实人口增长(月度复利)
      sim.paper.unshift("👶 人口增长(" + popPol + ")：名义总人口 " + (zonePop(0) + zonePop(1) + zonePop(2)) + "(绿" + zonePop(0) + "/黄" + zonePop(1) + "/红" + zonePop(2) + ")");
      // 社会保障:在职缴纳(货币区8%)·老年(≥60)/困难(<500)发放养老金低保
      var ssPay = 0, ssGet = 0;
      if (sim.res) sim.res.forEach(function (p) {
        if (p.age < 18) return; var zi = p.passport;
        if (zi !== 0) { var c = Math.round(p.salary * ZONES[zi].salMul * 0.08); p.funds = Math.max(0, p.funds - c); sim.socsec[zi] += c; ssPay += c; }
        if ((p.age >= 60 || p.funds < 500) && sim.socsec[zi] >= 800) { sim.socsec[zi] -= 800; p.funds += 800; ssGet += 800; }
      });
      sim.paper.unshift("🏥 社会保障：本月缴纳 " + ssPay + " ｜ 发放养老金/低保 " + ssGet + " ｜ 社保结余 绿" + sim.socsec[0] + "/黄" + sim.socsec[1] + "/红" + sim.socsec[2]);
      // 美团外卖:居民点外卖按单付餐费(苏区计划经济无金钱,免)
      var wo = 0, wr = 0;
      if (sim.res) sim.res.forEach(function (p) { if (p.age < 18 || p.passport === 0) return; var o = 2 + Math.floor(Math.random() * 8), fee = o * (15 + Math.floor(Math.random() * 25)); p.funds = Math.max(0, p.funds - fee); wo += o; wr += fee; });
      sim.waimai.orders += wo; sim.waimai.rev += wr;
      sim.paper.unshift("🛵 美团外卖：本月 " + wo + " 单 · 餐费 " + wr + " 魔币(居民买单·骑手新能源车配送)");
      recruitTraders();                               // 居民意愿入行/交易学院取证/免试
      taobaoTick();                                   // 淘宝商品迭代升级+居民下单
      monthlyReport();                                // 三魔女AI自动治理 + 月度报告(给开创者/Claude)
      snapshotEcon();   // 经济历史快照(每游戏月) → 折线图
      sim.paper.unshift("📜 政策计划：🟢斯大林主义(五年计划) ｜ 🟡习近平思想(共同富裕·国有50%) ｜ 🔴克林顿主义(金融自由化) ｜ ⚡发电" + (sim.power.kwh) + "度 ｜ 国债 " + sim.central.bonds);
      applyMigration();
      sim.paper.unshift("💰 发薪：苏区凭劳动发票·中/美区货币发薪扣税入区财政 ｜ 央行通胀 " + (sim.cbRate * 100).toFixed(1) + "% ｜ CPI " + sim.cpi.toFixed(3));
      renderBank();
    }
    // ---- 居民 + 政府户籍 ----
    var JOBS = ["发电厂工程师", "自来水厂技工", "船舶厂焊工", "网络中心运维", "电脑手机厂质检", "Claude AI 工程师", "美团骑手", "淘宝店主", "微信产品经理", "支付宝风控", "Welcome收银员", "酒店前台", "政府公务员", "警察", "军人", "股票交易员", "教师", "医生", "厨师", "司机"];
    var HOBBIES = ["爬山", "下棋", "钓鱼", "打游戏", "读书", "跑步", "摄影", "养花", "唱歌", "做饭"];
    var VEHICLES = ["自行车", "电动车", "轿车", "地铁通勤", "步行", "SUV"];
    var XING = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨".split(""), MING = "伟芳娜秀英敏静磊强军洋勇艳杰娟涛明超霞丽".split("");
    function idChecksum(s17) { var w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2], cks = "10X98765432", sum = 0; for (var i = 0; i < 17; i++) sum += parseInt(s17[i], 10) * w[i]; return cks[sum % 11]; }
    function makeId(birth, male) { var s = 100 + Math.floor(Math.random() * 899); if ((s % 2 === 0) === male) s += 1; var s17 = "440300" + birth + pad(s, 3); return s17 + idChecksum(s17); }
    function mkPerson(sur, male, age, role, hx, hz, famId) {
      var name = sur + MING[Math.floor(Math.random() * MING.length)] + (Math.random() < 0.4 ? MING[Math.floor(Math.random() * MING.length)] : "");
      var by = 2000 - age, birth = "" + by + pad(1 + Math.floor(Math.random() * 12), 2) + pad(1 + Math.floor(Math.random() * 28), 2), adult = age >= 18;
      var p = { name: name, sex: male ? "男" : "女", age: age, role: role, fam: famId, id: makeId(birth, male), job: adult ? JOBS[Math.floor(Math.random() * JOBS.length)] : "学生", home: [hx, hz], vehicle: VEHICLES[Math.floor(Math.random() * VEHICLES.length)], hobby: HOBBIES[Math.floor(Math.random() * HOBBIES.length)], funds: adult ? 2000 + Math.floor(Math.random() * 20000) : 0, salary: adult ? 3000 + Math.floor(Math.random() * 5000) : 0, rel: {} };
      p.homePos = { x: hx, z: hz }; p.work = pickFac(); p.shop = nearestShop(hx, hz); p.pos = { x: hx, z: hz }; p.target = p.homePos;
      p.passport = zIdx(hx); p.trait = Math.random() < 0.7 ? p.passport : Math.floor(Math.random() * 3); p.app = null;   // 护照=所属区;性格70%与本区匹配,余者将申请移民
      p.rank = adult ? 1 : 0; p.title = adult ? TITLES[0] : "学生";                                                     // 职级体系(L1试用→L9总裁)
      p.sector = p.passport === 0 ? "集体" : p.passport === 1 ? (Math.random() < 0.5 ? "国企" : "私营") : "私营";       // 中区国有约50%
      p.houseValue = Math.round([300, 800, 1500][p.passport] * (0.7 + Math.random() * 0.8));                          // 房产原值(红区贵·绿区廉)
      p.vehicleValue = ({ "自行车": 20, "电动车": 50, "轿车": 300, "SUV": 600 })[p.vehicle] || 0;
      p.loan = (adult && p.passport !== 0 && Math.random() < 0.5) ? Math.round(p.houseValue * 0.4 * (0.6 + Math.random() * 0.8)) : 0;   // 房贷(苏区计划分房·无贷)
      p.kwh = adult ? 100 + Math.floor(Math.random() * 300) : 30;   // 家庭月用电量(度)
      p.bonds = 0;
      p.hair = ["#2b2b2b", "#3a2a1a", "#5a3a1a", "#1a1a1a", "#6a4a2a", "#7a5a3a"][Math.floor(Math.random() * 6)];
      p.eyes = ["#3a2a1a", "#2a2a3a", "#1a3a2a", "#3a1a1a"][Math.floor(Math.random() * 4)];   // 政府采集的个人照片用
      p.mesh = makePerson(male ? 0x3a6ea5 : 0xc05a8a, adult ? 1 : 0.7); p.mesh.position.set(hx, 0, hz);
      return p;
    }
    function genResidents() {
      sim.families = []; sim.res = []; var R = 48;
      for (var f = 0; f < 5; f++) {
        var sur = XING[Math.floor(Math.random() * XING.length)], fam = { id: "户" + pad(f + 1, 3), sur: sur, members: [] };
        var hx = Math.round((Math.random() * 2 - 1) * R), hz = Math.round((Math.random() * 2 - 1) * R);
        var husb = mkPerson(sur, true, 30 + Math.floor(Math.random() * 20), "户主", hx, hz, fam.id);
        var wife = mkPerson(sur, false, 28 + Math.floor(Math.random() * 20), "配偶", hx, hz, fam.id);
        husb.rel["配偶"] = wife.name; wife.rel["配偶"] = husb.name; fam.members.push(husb, wife);
        var kids = Math.floor(Math.random() * 3);
        for (var k = 0; k < kids; k++) { var boy = Math.random() < 0.5, kid = mkPerson(sur, boy, 1 + Math.floor(Math.random() * 18), boy ? "儿子" : "女儿", hx, hz, fam.id); kid.rel["父"] = husb.name; kid.rel["母"] = wife.name; husb.rel[boy ? "子" : "女"] = kid.name; fam.members.push(kid); }
        sim.families.push(fam);
        fam.members.forEach(function (p) { sim.res.push(p); });
      }
      sim.popN = [0, 0, 0]; sim.res.forEach(function (p) { sim.popN[p.passport] += 50; });   // 名义人口(每3D居民≈50人，含老幼)
      renderGov();
    }
    var DEMON_AV = {   // 三魔女头像(按描述:Amelie绿发白肤绿瞳/Mael红/Sarah黑)
      Amelie: { name: "Amelie", hair: "#2bd24b", eyes: "#39ff5a", skin: "#f7f7f0", glow: 1, role: "女魔·绿(绿发白肤·绿瞳发光·解放与快乐)" },
      Mael: { name: "Mael", hair: "#d61f1f", eyes: "#ff4a4a", skin: "#ffe0e0", glow: 1, role: "女魔·红(因循守旧·永恒)" },
      Sarah: { name: "Sarah", hair: "#1a1a1a", eyes: "#8a8aff", skin: "#eae6f0", glow: 1, role: "女魔·黑(暂停·平衡)" },
      Claude: { name: "Claude", hair: "#c98a4a", eyes: "#ffffff", skin: "#e8d0b0", role: "AI总管·开创者助手(统筹三魔女治理)" }
    };
    function makeAvatar(p) {   // 生成证件照(canvas)
      if (p.avatar) return p.avatar;
      var c = document.createElement("canvas"); c.width = 40; c.height = 40; var g = c.getContext("2d");
      g.fillStyle = "#10161e"; g.fillRect(0, 0, 40, 40);
      g.fillStyle = p.skin || "#f0c9a0"; g.beginPath(); g.arc(20, 23, 13, 0, 6.3); g.fill();
      g.fillStyle = p.hair || "#2b2b2b"; g.beginPath(); g.arc(20, 14, 14, 3.14, 6.28); g.fill(); g.fillRect(6, 12, 28, 5);
      if (p.glow) { g.fillStyle = p.eyes; g.globalAlpha = 0.45; g.beginPath(); g.arc(15, 23, 4.5, 0, 6.3); g.arc(25, 23, 4.5, 0, 6.3); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = p.eyes || "#333"; g.beginPath(); g.arc(15, 23, 2.4, 0, 6.3); g.arc(25, 23, 2.4, 0, 6.3); g.fill();
      g.strokeStyle = "#a05a4a"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(16, 31); g.lineTo(24, 31); g.stroke();
      p.avatar = c.toDataURL(); return p.avatar;
    }
    function renderGov() {
      var el = document.getElementById("wgov"); if (!el) return;
      var html = "<b>🏛 政府 · 户籍/户口本</b>（深圳罗湖 440300｜此处为<b>登记样本户</b>，每户代表约50名义人口；总人口见🏦银行）";
      sim.families.forEach(function (fam) {
        html += "<div style='margin:6px 0;border-top:1px solid #2a3a4a;padding-top:4px'><b>" + fam.id + " · " + fam.sur + "家</b>";
        fam.members.forEach(function (p) {
          var rels = Object.keys(p.rel).map(function (k) { return k + ":" + p.rel[k]; }).join(" ");
          var unit = p.passport === 0 ? "票" : "魔币", appTxt = p.app ? " ｜ 🛂申请移民" + ZNAME[p.app.target] + "(剩" + p.app.days + "天)" : "";
          var jobTxt = p.age >= 18 ? p.job + "(" + p.title + "L" + p.rank + "·" + p.sector + ")" : "学生";
          var tr2 = p.isTrader ? " ｜ 📈交易员" + p.traderId : (p.study > 0 ? " ｜ 🎓在学交易学院" : "");
          html += "<div style='font-size:11px;display:flex;gap:6px;align-items:flex-start;margin:2px 0'><img src='" + makeAvatar(p) + "' width='32' height='32' style='border-radius:4px;flex:none'><div>" + p.role + " " + p.name + "(" + p.sex + p.age + ") ｜ " + jobTxt + " ｜ " + p.vehicle + " ｜ " + p.funds + unit + " ｜ 【" + PASSPORT[p.passport] + "】" + appTxt + tr2 + "<br><span style='color:#7f93a8'>身份证 " + p.id + " ｜ 性格" + TRAITS[p.trait] + (rels ? " ｜ " + rels : "") + "</span></div></div>";
        });
        html += "</div>";
      });
      el.innerHTML = html;
    }
    function pickFac() { var f = FACILITIES[Math.floor(Math.random() * FACILITIES.length)]; return { x: f.x || 0, z: f.z || 0 }; }
    function makePerson(color, sc) {
      var grp = new THREE.Group();
      var body = new THREE.Mesh(GCYL, new THREE.MeshLambertMaterial({ color: color })); body.scale.set(0.8 * sc, 2.2 * sc, 0.8 * sc); body.position.y = 1.1 * sc; grp.add(body);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf0c9a0 })); head.scale.setScalar(sc); head.position.y = 2.5 * sc; grp.add(head);
      scene.add(grp); simObjs.push(grp); return grp;
    }
    var _mf = 0;
    function tickResidents() {
      if (!sim) return;
      if (sim.planes) sim.planes.forEach(function (pl) { pl.a += pl.sp; pl.g.position.set(Math.cos(pl.a) * pl.r, pl.h, Math.sin(pl.a) * pl.r); pl.g.rotation.y = -pl.a; });   // 飞机绕场飞行
      if (sim.trucks) sim.trucks.forEach(function (tk) { tk.pos += tk.sp; if (tk.pos > sim.cityR) tk.pos = -sim.cityR; if (tk.horiz) { tk.g.position.set(tk.pos, 0.6, tk.lane); tk.g.rotation.y = Math.PI / 2; } else { tk.g.position.set(tk.lane, 0.6, tk.pos); tk.g.rotation.y = 0; } });   // 货车走路网车道
      if (sim.trains) sim.trains.forEach(function (tn) { tn.pos += tn.sp; if (tn.pos > sim.cityR + 14) tn.pos = -(sim.cityR + 14); tn.g.position.set(tn.pos, tn.y, tn.lane); tn.g.rotation.y = Math.PI / 2; });   // 火车沿轨道
      if (sim.res) for (var i = 0; i < sim.res.length; i++) {
        var p = sim.res[i], t = p.target; if (!t || !p.mesh) continue;
        var dx = t.x - p.pos.x, dz = t.z - p.pos.z, d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.6) { var sp = Math.min(d, 0.5); p.pos.x += dx / d * sp; p.pos.z += dz / d * sp; p.mesh.position.x = p.pos.x; p.mesh.position.z = p.pos.z; p.mesh.rotation.y = Math.atan2(dx, dz); }
      }
      if ((++_mf) % 8 === 0) drawMinimap();
    }
    function drawMinimap() {
      if (!mctx) return; var S = 184, W = 230; function px(v) { return (v + W / 2) / W * S; }
      mctx.clearRect(0, 0, S, S);
      mctx.fillStyle = "#163f20"; mctx.fillRect(0, 0, px(-25), S);
      mctx.fillStyle = "#3f3a14"; mctx.fillRect(px(-25), 0, px(25) - px(-25), S);
      mctx.fillStyle = "#3f1414"; mctx.fillRect(px(25), 0, S - px(25), S);
      mctx.fillStyle = "#9fb6d8"; for (var i = 0; i < objs.length; i += 2) { var o = objs[i]; if (o && o.position) mctx.fillRect(px(o.position.x), px(o.position.z), 2, 2); }
      if (sim && sim.res) { mctx.fillStyle = "#ffd24a"; sim.res.forEach(function (p) { if (p.pos) mctx.fillRect(px(p.pos.x), px(p.pos.z), 2, 2); }); }
      if (sim && sim.planes) { mctx.fillStyle = "#ff5b5b"; sim.planes.forEach(function (pl) { mctx.fillRect(px(pl.g.position.x), px(pl.g.position.z), 3, 3); }); }
    }
    function setResidentTargets(hour) {
      if (!sim || !sim.res) return; var act = SCHEDULE[hour];
      sim.res.forEach(function (p) { p.act = act; p.target = (act === "工作" && p.age >= 18) ? p.work : act === "逛街" ? p.shop : p.homePos; });
    }
    function fetchKline() {
      try {
        fetch("/api/series?id=" + encodeURIComponent(ch.id) + "&tf=1").then(function (r) { return r.json(); }).then(function (j) {
          var cs = (j && j.candles) || [], closes = cs.map(function (k) { return k.c; }).filter(function (v) { return typeof v === "number" && v > 0; });
          if (closes.length > 2 && sim.stocks) { var s = stockById(ch.id); if (s) { s.px = closes[closes.length - 1]; } }   // 本频道股票锚定真实K线最新收盘
        }).catch(function () {});
      } catch (e) {}
    }
    function zonePop(zi) { var n = sim.popN ? sim.popN[zi] : 0; if (!n) n = sim.res ? sim.res.filter(function (p) { return p.passport === zi; }).length : 0; return n; }
    function zoneStats(zi) {
      var ppl = sim.res ? sim.res.filter(function (p) { return p.passport === zi; }) : [], adults = ppl.filter(function (p) { return p.age >= 18; });
      var meshN = ppl.length || 1, z = ZONES[zi];
      function sm(a, f) { var s = 0; a.forEach(function (x) { s += f(x); }); return s; }
      var pop = zonePop(zi), scale = pop / meshN;   // 统一名义人口口径
      var wagePC = Math.round(sm(adults, function (p) { return p.salary * z.salMul; }) / (adults.length || 1));
      var depPC = Math.round(sm(ppl, function (p) { return p.funds; }) / meshN);
      var assetPC = Math.round(sm(ppl, function (p) { return p.funds + Math.round(p.houseValue * sim.cpi) + p.vehicleValue; }) / meshN);
      var houseTot = Math.round(sm(ppl, function (p) { return p.houseValue * sim.cpi; }) * scale), depTot = Math.round(depPC * pop), loanTot = Math.round(sm(ppl, function (p) { return p.loan || 0; }) * scale);
      var gdp = Math.round(wagePC * 12 * pop + z.planBonus * 12 + sim.treasury[zi]);
      var credit = ppl.length ? Math.round(sm(ppl, function (p) { return creditScore(p); }) / ppl.length) : 600;
      var expo = Math.round(gdp * 0.10 * (1 + z.stateRatio)), impo = Math.round(gdp * 0.08 + pop * 6);   // 出口随生产力·进口随建设需求
      return { pop: pop, treasury: sim.treasury[zi], gdp: gdp, pcGdp: Math.round(gdp / pop), wage: wagePC, dep: depPC, assets: assetPC, house: houseTot, avgHouse: Math.round(houseTot / pop), hpi: sim.cpi.toFixed(2), deposits: depTot, loans: loanTot, ldr: depTot > 0 ? Math.round(loanTot / depTot * 100) : 0, loanRate: ((z.bankRate + 0.004) * 100).toFixed(1), unit: zi === 0 ? "票" : "魔币", credit: credit, expo: expo, impo: impo, net: expo - impo };
    }
    function renderBank() {
      var el = document.getElementById("wbank"); if (!el || !sim) return;
      var zr = ZONES.map(function (z, zzi) {
        var pop = zonePop(zzi);   // 统一名义人口口径
        return "<tr><td>" + z.n + "</td><td>" + z.sys + "</td><td>x" + z.salMul + "</td><td>x" + z.inflMul + "</td><td>" + (z.bankRate * 100).toFixed(1) + "%/月</td><td>" + pop + "人</td></tr>";
      }).join("");
      el.innerHTML = "<b>🏦 人民银行 · 货币 · 三区制度</b>" +
        "<div style='margin:5px 0'>央行年化通胀率 <input id='wInfl' type='number' step='0.5' value='" + (sim.cbRate * 100).toFixed(1) + "' style='width:54px'> % ｜ 物价指数 CPI <b>" + sim.cpi.toFixed(3) + "</b></div>" +
        "<table style='font-size:11px;width:100%;border-collapse:collapse'><tr style='color:#8fb'><th>区</th><th>制度</th><th>工资</th><th>物价</th><th>存款息</th><th>人口</th></tr>" + zr + "</table>" +
        "<div style='margin-top:6px;font-size:11px'><b>各区政策计划(指导思想)</b><br>🟢苏区·<b>斯大林主义</b>—五年计划·重工业优先·集体化·物资统配<br>🟡中区·<b>习近平思想</b>—中国特色社会主义·共同富裕·科技自立·双循环<br>🔴美区·<b>克林顿主义</b>—第三条道路·自由贸易·金融自由化·平衡预算</div>" +
        "<div style='margin-top:6px;font-size:11px'><b>三区财政与经济数据(各自财政大权)</b>" + ZONES.map(function (zn, zi) { var s = zoneStats(zi), u = s.unit; return "<div style='border-top:1px solid #2a3a4a;margin-top:4px;padding-top:3px'><b>" + zn.n + "</b>（人口 " + s.pop + "）<br>国库 " + s.treasury + u + " ｜ GDP总额 " + s.gdp + u + " ｜ 人均GDP " + s.pcGdp + u + "<br>人均工资 " + s.wage + u + "/月 ｜ 人均存款 " + s.dep + u + " ｜ 人均总资产 " + s.assets + u + "<br>🏠房产：均价 " + s.avgHouse + u + " ｜ 总市值 " + s.house + u + " ｜ 房价指数 " + s.hpi + "<br>🏦金融：存款 " + s.deposits + u + " ｜ 贷款 " + s.loans + u + " ｜ 存贷比 " + s.ldr + "% ｜ 存息 " + (zn.bankRate * 100).toFixed(1) + "%·贷息 " + s.loanRate + "%<br>🌐进出口：出口 " + s.expo + u + " ｜ 进口 " + s.impo + u + " ｜ 净额 " + s.net + u + " ｜ 📋区域征信均分 " + s.credit + "</div>"; }).join("") + "</div>" +
        "<div style='margin-top:8px;font-weight:bold'>📊 经济走势折线图</div>" +
        "<canvas id='wchart' width='540' height='140' style='width:100%;margin-top:4px;background:rgba(0,0,0,.25);border-radius:6px'></canvas>" +
        "<canvas id='wpc' width='540' height='120' style='width:100%;margin-top:4px;background:rgba(0,0,0,.25);border-radius:6px'></canvas>" +
        "<canvas id='wz0' width='540' height='110' style='width:100%;margin-top:4px;background:rgba(20,50,30,.25);border-radius:6px'></canvas>" +
        "<canvas id='wz1' width='540' height='110' style='width:100%;margin-top:4px;background:rgba(55,50,20,.25);border-radius:6px'></canvas>" +
        "<canvas id='wz2' width='540' height='110' style='width:100%;margin-top:4px;background:rgba(55,20,20,.25);border-radius:6px'></canvas>" +
        "<div style='margin-top:3px;font-size:11px'><b>中央政府</b>：统辖三区 · 升旗" + sim.central.flag + "天 · <b>军队归中央</b>(现役 " + sim.army.total + ") · 财政权5%(国库 " + (sim.central.fund | 0) + ") · 元旦阅兵 · 奥运每4年</div>" +
        "<div style='margin-top:3px;font-size:11px'><b>汇率</b>(对基准)：苏区 2.5 ｜ 中区 3.1 ｜ 美区 3.0 ｜ <b>国债余额</b> " + (sim.central.bonds | 0) + " ｜ ⚡<b>发电</b> " + (sim.power.kwh | 0) + "度(核电+火电) ｜ ⛏煤库 " + (sim.coal | 0) + " ｜ 🌾粮库 " + (sim.food | 0) + " ｜ 👥<b>名义总人口</b> " + (zonePop(0) + zonePop(1) + zonePop(2)) + "(绿" + zonePop(0) + "/黄" + zonePop(1) + "/红" + zonePop(2) + ")</div>" +
        "<div style='margin-top:3px;font-size:11px'><b>晋升职级</b>(L1试用→L9总裁)：苏区慢(5%/月)·中区中速(12%)·美区快(25%) ｜ <b>中区国有约50%</b>(资本+计划中和·亦有五年计划)</div>" +
        "<div style='margin-top:3px;font-size:11px'><b>商业银行</b>：建设银行(国有·黄区) ｜ 摩根大通(美资·红区) ｜ 渣打银行(英资·红区)</div>" +
        "<div style='margin-top:3px;font-size:11px'><b>绿太阳24h便利店连锁</b>：" + (sim.shops ? sim.shops.length : 0) + " 家，全城24小时营业，居民就近购物</div>" +
        "<div style='margin-top:3px;font-size:11px'><b>🏥 社会保障系统</b>：在职缴8% · 老年(≥60)养老金/困难(<500)低保 · 社保结余 绿" + sim.socsec[0] + "票/黄" + sim.socsec[1] + "/红" + sim.socsec[2] + "魔币</div>" +
        "<div style='margin-top:3px;font-size:11px'><b>苏区(绿)无金钱</b>：计划经济·物资兑换票——只有劳动才发票、只有生产才有票</div>" +
        "<div style='color:#7f93a8;font-size:10px;margin-top:4px'>护照/移民审批：绿区30天(须愿当工人·下基层·晋升慢) ｜ 黄区20天(拥护社会主义·中速) ｜ 红区10天(快乐·愿创业·赚钱快)</div>";
      var inp = document.getElementById("wInfl"); if (inp) inp.onchange = function () { var v = parseFloat(this.value); if (!isNaN(v)) { sim.cbRate = v / 100; tip("人民银行已设年化通胀率 " + v + "%"); } };
      drawChart();
    }
    function lineChart(cid, seriesList, colors, labels, title) {   // 每条线各自归一化,展示趋势
      var cv = document.getElementById(cid); if (!cv) return; var g = cv.getContext("2d"), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H); g.fillStyle = "#cfe8ff"; g.font = "11px sans-serif"; g.fillText(title, 6, 12);
      var n = seriesList[0] ? seriesList[0].length : 0;
      if (n < 2) { g.fillStyle = "#7f93a8"; g.fillText("数据积累中…每游戏月记录一次(可调高倍速加速)", 6, H / 2); return; }
      var x0 = 22, plotW = W - x0 - 8, plotH = H - 40, y0 = H - 14;
      seriesList.forEach(function (s, si) {
        var mx = Math.max.apply(null, s), mn = Math.min.apply(null, s), rng = (mx - mn) || 1;
        g.strokeStyle = colors[si]; g.lineWidth = 1.8; g.beginPath();
        s.forEach(function (v, i) { var x = x0 + i / (n - 1) * plotW, y = y0 - (v - mn) / rng * plotH; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }); g.stroke();
        g.fillStyle = colors[si]; g.fillRect(x0 + si * 64, 16, 8, 8); g.fillStyle = "#cfe8ff"; g.fillText(labels[si], x0 + si * 64 + 11, 24);
      });
    }
    function snapshotEcon() { var zs = [zoneStats(0), zoneStats(1), zoneStats(2)]; sim.econHist.push({ gdp: [zs[0].gdp, zs[1].gdp, zs[2].gdp], dep: [zs[0].deposits, zs[1].deposits, zs[2].deposits], house: [zs[0].house, zs[1].house, zs[2].house], pop: [zonePop(0), zonePop(1), zonePop(2)], pcgdp: [zs[0].pcGdp, zs[1].pcGdp, zs[2].pcGdp], cpi: sim.cpi }); if (sim.econHist.length > 72) sim.econHist.shift(); }
    function drawChart() {
      var H = sim.econHist || [];
      lineChart("wchart", [H.map(function (s) { return s.gdp[0]; }), H.map(function (s) { return s.gdp[1]; }), H.map(function (s) { return s.gdp[2]; }), H.map(function (s) { return s.gdp[0] + s.gdp[1] + s.gdp[2]; })], ["#2bd24b", "#e0c020", "#e25b5b", "#ffffff"], ["绿", "黄", "红", "总GDP"], "📈 GDP总量(三区+合计·历史)");
      lineChart("wpc", [H.map(function (s) { return s.pcgdp[0]; }), H.map(function (s) { return s.pcgdp[1]; }), H.map(function (s) { return s.pcgdp[2]; })], ["#2bd24b", "#e0c020", "#e25b5b"], ["绿", "黄", "红"], "👤 人均GDP(三区·历史)");
      ["wz0", "wz1", "wz2"].forEach(function (cid, zi) {
        lineChart(cid, [H.map(function (s) { return s.gdp[zi]; }), H.map(function (s) { return s.dep[zi]; }), H.map(function (s) { return s.house[zi]; }), H.map(function (s) { return s.pop[zi]; })], ["#7CFC9A", "#6ad0ff", "#ffb86a", "#f59fff"], ["GDP", "存款", "房产", "人口"], ["🟢绿区·苏", "🟡中区·华", "🔴红区·美"][zi] + " 各指标(各自归一)");
      });
    }
    function startSim() {
      if (sim) return;
      sim = { t0: Date.now(), day: -1, week: -1, month: -1, _hk: -1, px: Math.max(8, ch.dim || 30), hist: [], paper: [], exch: null, cpi: 1.0, cbRate: 0.03, shops: [], treasury: [0, 0, 0], central: { flag: 0, fund: 0, bonds: 0 }, _py: -1, army: { total: 0 }, planes: [], trucks: [], baseGame: GAME_EPOCH, speed: 60, popN: [0, 0, 0], power: { kwh: 0 }, stocks: [], trades: [], econHist: [], facs: [], cityR: 72, socsec: [0, 0, 0], taobao: [], coal: 8000, food: 8000, chat: [], chatWho: "group", waimai: { orders: 0, rev: 0 }, mm: { cash: 0 } };
      sim.traders = TRADERS.map(function (d) { return { d: d, cash: 14000, holdings: {}, realized: 0, comm: 0, dayStart: 14000 }; });
      buildStocks(); initTaobao(); buildCity(); spawnTraders(); genResidents(); loadSimState(); fetchKline(); snapshotEcon(); snapshotEcon(); renderBank();
      try { fetch("/api/chatlog").then(function (r) { return r.json(); }).then(function (j) { if (j && j.chat && j.chat.length) { sim.chat = j.chat.map(function (m) { return { from: m.from, text: m.text }; }).slice(-200); if (curPanel === "wchat") renderChat(); } }).catch(function () {}); } catch (e) {}   // 载入永久群聊历史
      mode = "auto"; if (pi >= plan.length) genPlan();
      simBeat = setInterval(function () {
        if (!W.open) { clearInterval(simBeat); return; }
        var gn = gameNow(), gd = new Date(gn);
        var sv = document.getElementById("wspeed"); if (sv && +sv.value !== sim.speed) { sim.baseGame = gn; sim.t0 = Date.now(); sim.speed = +sv.value; }   // 倍速兜底:每tick读下拉,确保生效
        var cl = document.getElementById("wclock"); if (cl) cl.textContent = "🕐 " + fmtGame(gn) + " ｜ 1:" + sim.speed;
        priceTick(); refreshPanel();   // 实时:股价每tick微动 + 当前面板实时重绘
        var hk = Math.floor((gn - GAME_EPOCH) / 3600000); if (hk !== sim._hk) { sim._hk = hk; stockTick(gd.getUTCHours()); setResidentTargets(gd.getUTCHours()); }
        var dayIdx = Math.floor((gn - GAME_EPOCH) / 86400000); if (dayIdx !== sim.day) { sim.day = dayIdx; dailyReport(gd); }
        var wkIdx = Math.floor(dayIdx / 7); if (wkIdx !== sim.week) { sim.week = wkIdx; weeklySettle(gd); }
        var mKey = gd.getUTCFullYear() * 12 + gd.getUTCMonth(); if (mKey !== sim.month) { sim.month = mKey; paySalary(); }
      }, 200);
      tip("▶ 时间开始：公元2000-01-01 00:00。城市建设/股市/居民生活运转中(1秒=1分钟)。点 📈/📰/🏛 查看");
    }
    // 模拟控制条 + 面板
    var bar = document.createElement("div");
    bar.style.cssText = "position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;background:rgba(10,16,22,.85);padding:6px 10px;border-radius:10px;color:#cfe8ff;font-size:12px;z-index:6;flex-wrap:wrap;justify-content:center;max-width:94vw";
    bar.innerHTML = '<span id="wclock">🕐 未开始 ｜ 1:60</span><button id="wgo">▶ 开始时间(2000)</button><select id="wspeed" style="font-size:12px;border-radius:6px"><option value="60">1:60</option><option value="240">1:240</option><option value="480">1:480</option><option value="1200">1:1200</option><option value="2400">1:2400</option><option value="6000">1:6000</option></select><button id="wbStock">📈 股市</button><button id="wbBank">🏦 银行</button><button id="wbPaper">📰 日报</button><button id="wbGov">🏛 户籍</button><button id="wbChat">💬 通讯</button><button id="wbAdmin">🛠 干涉</button><button id="wsave">💾 保存</button>';
    ov.appendChild(bar);
    bar.querySelectorAll("button").forEach(function (b) { b.style.cssText = "padding:5px 9px;border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:bold;background:#1f6f3f;color:#fff"; });
    var panel = document.createElement("div");
    panel.style.cssText = "position:absolute;top:56px;left:50%;transform:translateX(-50%);width:min(580px,93vw);max-height:48vh;overflow:auto;background:rgba(10,16,22,.93);color:#cfe8ff;padding:10px 12px;border-radius:10px;font-size:12px;display:none;z-index:6";
    panel.innerHTML = '<div id="wstock"></div><div id="wbank"></div><div id="wpaper" style="margin-top:8px"></div><div id="wgov" style="margin-top:8px"></div><div id="wchat"></div><div id="wadmin"></div>';
    ov.appendChild(panel);
    var mini = document.createElement("canvas"); mini.width = 184; mini.height = 184;
    mini.style.cssText = "position:absolute;bottom:36px;right:10px;border:2px solid #2bd24b;border-radius:6px;background:rgba(8,12,18,.65);z-index:6"; ov.appendChild(mini); mctx = mini.getContext("2d");
    var mlbl = document.createElement("div"); mlbl.textContent = "🗺 世界总览(绿/黄/红三区)"; mlbl.style.cssText = "position:absolute;bottom:224px;right:10px;color:#7CFC9A;font-size:10px;z-index:6;background:rgba(8,12,18,.6);padding:1px 4px;border-radius:3px"; ov.appendChild(mlbl);
    var curPanel = null, _pf = 0;
    function showPanel(which) { curPanel = which; panel.style.display = "block"; ["wstock", "wbank", "wpaper", "wgov", "wchat", "wadmin"].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = id === which ? "block" : "none"; }); }
    function refreshPanel() {   // 当前打开面板实时重绘:股市每tick,银行/户籍每6tick(且通胀输入聚焦时不重绘以免打断)
      if (!panel || panel.style.display === "none") return; if ((++_pf) % 8 !== 0) return;   // 每~1.6秒刷新,便于看清
      if (curPanel === "wstock") updateTicker();
      else if (curPanel === "wbank") { if (!document.activeElement || document.activeElement.id !== "wInfl") renderBank(); }
      else if (curPanel === "wgov") renderGov();
    }
    document.getElementById("wgo").onclick = function () { startSim(); this.disabled = true; this.textContent = "▶ 运行中"; };
    document.getElementById("wbStock").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } showPanel("wstock"); };
    document.getElementById("wbBank").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } renderBank(); showPanel("wbank"); };
    document.getElementById("wbPaper").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } showPanel("wpaper"); };
    document.getElementById("wbGov").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } showPanel("wgov"); };
    document.getElementById("wspeed").onchange = function () { if (!sim) return; sim.baseGame = gameNow(); sim.t0 = Date.now(); sim.speed = +this.value; tip("⏩ 时间倍速 1:" + sim.speed); };
    document.getElementById("wbChat").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } renderChat(); showPanel("wchat"); };
    document.getElementById("wbAdmin").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } if (!confirm("⚠ 安全提醒：您可能试图干涉虚拟世界，可能会影响测试结果。\n确定继续？")) return; renderAdmin(); showPanel("wadmin"); };
    document.getElementById("wsave").onclick = function () { if (!sim) { tip("先点 ▶ 开始时间(2000)"); return; } saveSim(); tip("💾 城市进度已保存(本频道·下次开始时间自动续档)"); };

    function closeWorld() { save(); W.open = false; clearInterval(beat); if (simBeat) clearInterval(simBeat); cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); try { renderer.dispose(); } catch (e) {} var o = document.getElementById("worldOv"); if (o) o.remove(); }
    W.close = closeWorld;
  }
  window.openWorld = function () { if (typeof THREE === "undefined") { alert("3D 引擎加载中，请稍候再试。"); return; } openWorld(); };
})();
