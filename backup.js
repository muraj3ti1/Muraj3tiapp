/* backup.js — نسخ احتياطي تلقائي لبيانات المستخدم إلى Firestore.
   - يقرأ من localStorage ولا يكتب فيه إلا عند الاستعادة على جهاز جديد.
   - لا يغيّر أي مفتاح تخزين موجود، ولا يلمس IndexedDB.
   - كل الأخطاء تُلتقط بصمت فلا يتعطل التطبيق. */
(function () {
  "use strict";
  if (window.MBK) return;

  var FB = {
    apiKey: "AIzaSyBsOgfKtckqou79mHn1P721T9cE4ZEgTrU",
    authDomain: "muraj3tiiapp.firebaseapp.com",
    projectId: "muraj3tiiapp",
    appId: "1:68198447824:web:28fa6d52547ab53a3fbcd5"
  };
  var V = "10.14.1", BASE = "https://www.gstatic.com/firebasejs/" + V + "/";
  var MAIN = "muraja3a1";                 // الخطة والتقدم
  var COMMON = ["mpref", "mlang", "tjhide"]; // إعدادات العرض واللغة
  var MAXB = 450000;                      // حد حجم البيانات (بايت)، مستند Firestore حده 1 ميغابايت
  var POLL = 60000;                       // فحص التغيّر كل دقيقة
  var ROT = 3600000;                      // النسخة السابقة تُستبدل إن كان عمر الحالية أكثر من ساعة

  var uid = null, db = null, fs = null, ready = false, busy = false, busyAt = 0;
  var last = null, cloud = null, timer = null, started = false, tries = 0;

  function log(m) { try { console.log("[MBK] " + m); } catch (e) {} }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function keys() { return [MAIN, "mprof_" + uid].concat(COMMON); }
  function bytes(s) { try { return new TextEncoder().encode(s).length; } catch (e) { return s.length * 3; } }

  function snap() {
    var d = {}, k = keys();
    for (var i = 0; i < k.length; i++) { var v = ls(k[i]); if (v !== null) d[k[i]] = v; }
    return d;
  }
  // تسلسل ثابت الترتيب للمقارنة (Firestore يعيد المفاتيح مرتبة أبجدياً)
  function ser(d) {
    return JSON.stringify(Object.keys(d).sort().map(function (k) { return [k, d[k]]; }));
  }
  function ref() { return fs.doc(db, "backups", uid); }

  /* استعادة: لا تُكتب إلا مفاتيح من القائمة البيضاء، وتُحفظ قيم الجهاز السابقة أولاً */
  function restore(c, local) {
    var allowed = keys(), flag = "mbk_ok_" + uid;
    lset("mbk_before_restore_" + uid, JSON.stringify({ t: Date.now(), d: local }));
    for (var k in c.d) {
      if (allowed.indexOf(k) < 0 || typeof c.d[k] !== "string") continue;
      if (!lset(k, c.d[k])) { log("restore failed on " + k); return false; }
    }
    lset(flag, "1");
    return true;
  }

  function reload() {
    try {
      if (sessionStorage.getItem("mbk_rl") === "1") return;
      sessionStorage.setItem("mbk_rl", "1");
    } catch (e) { return; }
    location.reload();
  }

  /* مطابقة هذا الجهاز مع السحابة عند أول دخول للحساب عليه */
  function reconcile() {
    var flag = "mbk_ok_" + uid;
    return fs.getDoc(ref()).then(function (s) {
      cloud = s.exists() ? s.data() : null;
      if (ls(flag) === "1") return "ok";
      var local = snap(), hasMain = local[MAIN] !== undefined;
      if (!cloud || !cloud.d || cloud.d[MAIN] === undefined) { lset(flag, "1"); return "ok"; }
      if (!hasMain) return restore(cloud, local) ? "reload" : "ok-noflag";
      if (local[MAIN] === cloud.d[MAIN]) { lset(flag, "1"); return "ok"; }
      var when = "";
      try { when = new Date(cloud.t).toLocaleString("ar"); } catch (e) {}
      var yes = false;
      try {
        yes = confirm("وُجدت نسخة احتياطية لحسابك محفوظة بتاريخ " + when +
          ".\nهل تريد استعادتها؟\n\nموافق: استعادة النسخة (تُحفظ بيانات هذا الجهاز الحالية احتياطاً).\nإلغاء: إبقاء بيانات هذا الجهاز.");
      } catch (e) {}
      if (yes) return restore(cloud, local) ? "reload" : "ok-noflag";
      lset(flag, "1");
      return "ok";
    });
  }

  function upload() {
    if (!ready || !uid || !fs) return;
    if (busy && Date.now() - busyAt < 30000) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    var d = snap();
    if (d[MAIN] === undefined) return;                       // لا شيء يُنسخ، ولا نرفع حالة فارغة أبداً
    try { var o = JSON.parse(d[MAIN]); if (!o || typeof o !== "object") return; } catch (e) { return; }
    var body = ser(d);
    if (body === last) return;
    if (bytes(body) > MAXB) { log("data too large, skipped"); return; }
    var now = Date.now(), p = null, pt = null;
    if (cloud && cloud.d) {
      if (now - (cloud.t || 0) > ROT) { p = cloud.d; pt = cloud.t; }
      else { p = cloud.p || null; pt = cloud.pt || null; }
    }
    var doc = { v: 1, t: now, d: d, p: p, pt: pt };
    busy = true; busyAt = now;
    fs.setDoc(ref(), doc).then(function () {
      last = body; cloud = doc; log("backup saved");
    }).catch(function (e) {
      log("upload failed: " + (e && e.code || e));
    }).then(function () { busy = false; });
  }

  function onUser(u) {
    if (!u) { uid = null; ready = false; if (timer) { clearInterval(timer); timer = null; } return; }
    if (u.uid === uid && ready) return;
    uid = u.uid; ready = false; cloud = null; last = null;
    if (timer) { clearInterval(timer); timer = null; }
    var me = uid;
    reconcile().then(function (r) {
      if (me !== uid) return;
      if (r === "reload") { reload(); return; }
      if (r === "ok-noflag") return;
      ready = true;
      last = cloud && cloud.d ? ser(cloud.d) : null;
      setTimeout(upload, 5000);
      timer = setInterval(upload, POLL);
    }).catch(function (e) {
      log("reconcile failed: " + (e && e.code || e));
      if (me === uid && tries++ < 5) setTimeout(function () { if (me === uid && !ready) onUser(null), onUser(u); }, 60000);
    });
  }

  function boot() {
    if (started) return;
    started = true;
    var D = window.__mbkDeps;
    var p = D ? Promise.resolve(D) : Promise.all([
      import(BASE + "firebase-app.js"),
      import(BASE + "firebase-auth.js"),
      import(BASE + "firebase-firestore.js")
    ]).then(function (m) { return { app: m[0], auth: m[1], fs: m[2] }; });
    p.then(function (m) {
      var app = m.app.initializeApp(FB);
      var auth = m.auth.getAuth(app);
      fs = m.fs;
      try { db = fs.initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); }
      catch (e) { db = fs.getFirestore(app); }
      m.auth.onAuthStateChanged(auth, onUser);
    }).catch(function (e) { started = false; log("load failed"); });
  }

  try {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") upload();
    });
    window.addEventListener("online", function () { if (!started) boot(); });
  } catch (e) {}

  window.MBK = {
    now: upload,
    status: function () { return { uid: uid, ready: ready, busy: busy, cloudTime: cloud && cloud.t || null }; }
  };

  // نتأخر قليلاً حتى لا نزاحم تحميل الواجهة
  setTimeout(boot, 3000);
})();
