/* backup.js — نسخ احتياطي تلقائي لبيانات المستخدم إلى Firestore (المجموعة: backups/{uid}).
   - يقرأ من localStorage ولا يكتب فيه إلا عند الاستعادة على جهاز جديد.
   - لا يلمس IndexedDB، وكل الأخطاء تُلتقط بصمت فلا يتعطل التطبيق.
   تعديلات هذا الإصدار:
   • نافذة استعادة خاصة بدل confirm() (التي تُرجع false فورًا في كثير من نسخ APK/WebView).
   • إضافة مفاتيح الروبوت والاختبار والمصحف إلى النسخ الاحتياطي.
   • رفع تلقائي بعد ثلاث ثوانٍ من كل تغيير، بدل الانتظار دقيقة.
   • إن رفض المستخدم الاستعادة تُحفظ النسخة السحابية القديمة في الحقل p فلا تضيع. */
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
  var MAIN = "muraja3a1";                                   // الخطة والتقدم
  var COMMON = ["mpref", "mlang", "tjhide",                 // العرض واللغة
    "mrbN_m", "mrbN_f", "mrbQ_m", "mrbQ_f", "mrbSeen",      // الروبوت
    "ikCfg",                                                // إعدادات الاختبار
    "mshf_set", "mshf_pg"];                                 // المصحف
  var MAXB = 450000;     // حد حجم البيانات (بايت)؛ مستند Firestore حده 1 ميغابايت
  var POLL = 60000;      // فحص دوري كل دقيقة
  var DEBOUNCE = 3000;   // رفع بعد آخر تغيير بثلاث ثوانٍ
  var ROT = 3600000;     // النسخة السابقة تُستبدل إن كان عمر الحالية أكثر من ساعة

  var uid = null, db = null, fs = null, ready = false, busy = false, busyAt = 0;
  var last = null, cloud = null, timer = null, dt = null, started = false, tries = 0, keepOld = false;

  function log(m) { try { console.log("[MBK] " + m); } catch (e) {} }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function keys() { return [MAIN, "mprof_" + uid].concat(COMMON); }
  function bytes(s) { try { return new TextEncoder().encode(s).length; } catch (e) { return s.length * 3; } }
  function en() { return ls("mlang") === "en"; }

  function snap() {
    var d = {}, k = keys();
    for (var i = 0; i < k.length; i++) { var v = ls(k[i]); if (v !== null) d[k[i]] = v; }
    return d;
  }
  // تسلسل ثابت الترتيب للمقارنة (Firestore يعيد المفاتيح مرتبة أبجديًا)
  function ser(d) {
    return JSON.stringify(Object.keys(d).sort().map(function (k) { return [k, d[k]]; }));
  }
  function ref() { return fs.doc(db, "backups", uid); }

  /* ===== نافذة الاستعادة ===== */
  function askRestore(t) {
    return new Promise(function (resolve) {
      var E = en(), when = "";
      try { when = new Date(t).toLocaleString(E ? "en" : "ar"); } catch (e) {}
      var T = E
        ? { h: "Backup found", p: "A backup of your account saved on " + when + " exists. Restore it?", n: "Your current data on this device is kept safely before restoring.", y: "Restore the backup", k: "Keep this device's data" }
        : { h: "وُجدت نسخة احتياطية", p: "لحسابك نسخة احتياطية محفوظة بتاريخ " + when + ". هل تريد استعادتها؟", n: "تُحفظ بيانات هذا الجهاز الحالية احتياطًا قبل الاستعادة.", y: "استعادة النسخة", k: "إبقاء بيانات هذا الجهاز" };
      try {
        var o = document.createElement("div");
        o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true");
        o.dir = E ? "ltr" : "rtl";
        o.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif";
        o.innerHTML = '<div style="background:#0b1a3a;color:#eef2fb;border:1px solid #f5b83d;border-radius:18px;padding:22px;max-width:380px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)">' +
          '<h2 style="margin:0 0 10px;font-size:19px;color:#f5b83d"></h2>' +
          '<p style="margin:0 0 8px;line-height:1.8"></p>' +
          '<p style="margin:0 0 16px;line-height:1.7;font-size:13px;opacity:.75"></p>' +
          '<button type="button" data-y style="display:block;width:100%;padding:13px;border:0;border-radius:12px;background:#f5b83d;color:#041029;font-size:16px;font-weight:700;cursor:pointer"></button>' +
          '<button type="button" data-k style="display:block;width:100%;padding:12px;margin-top:10px;border:1px solid #f5b83d;border-radius:12px;background:transparent;color:#f5b83d;font-size:15px;cursor:pointer"></button></div>';
        var ps = o.querySelectorAll("h2,p");
        ps[0].textContent = T.h; ps[1].textContent = T.p; ps[2].textContent = T.n;
        o.querySelector("[data-y]").textContent = T.y;
        o.querySelector("[data-k]").textContent = T.k;
        function done(v) { try { o.remove(); } catch (e) {} resolve(v); }
        o.querySelector("[data-y]").onclick = function () { done(true); };
        o.querySelector("[data-k]").onclick = function () { done(false); };
        document.body.appendChild(o);
      } catch (e) { resolve(false); }
    });
  }

  /* استعادة: لا تُكتب إلا مفاتيح من القائمة البيضاء، وتُحفظ قيم الجهاز السابقة أولًا */
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
      return askRestore(cloud.t).then(function (yes) {
        if (yes) return restore(cloud, local) ? "reload" : "ok-noflag";
        keepOld = true;            // لا نفقد النسخة السحابية القديمة: تُحفظ في p عند أول رفع
        lset(flag, "1");
        return "ok";
      });
    });
  }

  function upload() {
    if (!ready || !uid || !fs) return;
    if (busy && Date.now() - busyAt < 30000) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    var d = snap();
    if (d[MAIN] === undefined) return;                       // لا شيء يُنسخ، ولا نرفع حالة فارغة أبدًا
    try { var o = JSON.parse(d[MAIN]); if (!o || typeof o !== "object") return; } catch (e) { return; }
    var body = ser(d);
    if (body === last) return;
    if (bytes(body) > MAXB) { log("data too large, skipped"); return; }
    var now = Date.now(), p = null, pt = null;
    if (cloud && cloud.d) {
      if (keepOld || now - (cloud.t || 0) > ROT) { p = cloud.d; pt = cloud.t; }
      else { p = cloud.p || null; pt = cloud.pt || null; }
    }
    var doc = { v: 1, t: now, d: d, p: p, pt: pt };
    busy = true; busyAt = now;
    fs.setDoc(ref(), doc).then(function () {
      last = body; cloud = doc; keepOld = false; log("backup saved");
    }).catch(function (e) {
      log("upload failed: " + (e && e.code || e));
    }).then(function () { busy = false; });
  }

  function onUser(u) {
    if (!u) { uid = null; ready = false; if (timer) { clearInterval(timer); timer = null; } return; }
    if (u.uid === uid && ready) return;
    uid = u.uid; ready = false; cloud = null; last = null; keepOld = false;
    if (timer) { clearInterval(timer); timer = null; }
    var me = uid;
    reconcile().then(function (r) {
      if (me !== uid) return;
      if (r === "reload") { reload(); return; }
      if (r === "ok-noflag") return;
      ready = true;
      last = cloud && cloud.d ? ser(cloud.d) : null;
      setTimeout(upload, 3000);
      timer = setInterval(upload, POLL);
    }).catch(function (e) {
      log("reconcile failed: " + (e && e.code || e));
      if (me === uid && tries++ < 5) setTimeout(function () { if (me === uid && !ready) { onUser(null); onUser(u); } }, 60000);
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
      var app = m.app.initializeApp(FB);       // نفس الإعدادات: يعيد تطبيق الصفحة نفسه دون خطأ
      var auth = m.auth.getAuth(app);
      fs = m.fs;
      try { db = fs.initializeFirestore(app, { experimentalAutoDetectLongPolling: true }); }
      catch (e) { db = fs.getFirestore(app); }
      m.auth.onAuthStateChanged(auth, onUser);
    }).catch(function () { started = false; log("load failed"); });
  }

  /* رفع تلقائي بعد كل تغيير في المفاتيح المنسوخة */
  try {
    var _set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      _set.call(this, k, v);
      try {
        if (this === localStorage && ready && uid && keys().indexOf(k) >= 0) {
          clearTimeout(dt); dt = setTimeout(upload, DEBOUNCE);
        }
      } catch (e) {}
    };
  } catch (e) {}

  try {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") upload();
    });
    window.addEventListener("pagehide", upload);
    window.addEventListener("online", function () { if (!started) boot(); else upload(); });
  } catch (e) {}

  window.MBK = {
    now: upload,
    /* لإعادة تشغيل المطابقة يدويًا على هذا الجهاز: MBK.recheck() ثم أعد فتح التطبيق */
    recheck: function () { if (uid) { try { localStorage.removeItem("mbk_ok_" + uid); } catch (e) {} } },
    status: function () { return { uid: uid, ready: ready, busy: busy, cloudTime: cloud && cloud.t || null }; }
  };

  // نتأخر قليلًا حتى لا نزاحم تحميل الواجهة
  setTimeout(boot, 2000);
})();
