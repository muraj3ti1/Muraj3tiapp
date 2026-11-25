/* تنبيه تحديث تطبيق الأندرويد (APK): يظهر داخل التطبيق فقط عندما يتوفر إصدار أحدث.
   يقرأ ملف apk-version.json من الموقع، ويقارن رقم البناء (versionCode) بالمثبّت على الهاتف.
   لا يكتب شيئًا في التخزين ولا يمس بيانات المستخدم. */
(function (G) {
  "use strict";
  var VER_URL = "https://muraj3ti1.github.io/Muraj3tiapp/apk-version.json";
  function native() { try { return !!(G.Capacitor && G.Capacitor.isNativePlatform && G.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  if (!G.document || !native()) return;
  function plug(n) { try { return (G.Capacitor.Plugins && G.Capacitor.Plugins[n]) || null; } catch (e) { return null; } }

  var bar = null, hidden = false;
  var CSS = ".ua{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);transform:translateX(-50%);width:min(460px,calc(100% - 20px));box-sizing:border-box;z-index:300;background:var(--card,#0f1d3d);color:var(--ink,#fff);border:2px solid var(--acc,#3f7cf0);border-radius:18px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);direction:rtl;font-family:inherit}" +
    ".ua b{display:block;font-size:15px;margin-bottom:4px}.ua p{margin:0 0 10px;font-size:13px;line-height:1.7;opacity:.9}" +
    ".ua-r{display:flex;gap:8px}.ua-r button{flex:1;font:inherit;font-size:14px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid var(--acc,#3f7cf0);background:transparent;color:inherit}" +
    ".ua-r button.ua-go{background:var(--acc,#3f7cf0);color:#fff;font-weight:700}";

  function download(url) {
    var B = plug("Browser");
    try { if (B && B.open) { B.open({ url: url }); return; } } catch (e) {}
    try { G.location.href = url; } catch (e) {}
  }
  function hide() { hidden = true; if (bar) { bar.remove(); bar = null; } }
  function show(r) {
    if (bar || hidden) return;
    if (!document.getElementById("uaCss")) { var s = document.createElement("style"); s.id = "uaCss"; s.textContent = CSS; document.head.appendChild(s); }
    bar = document.createElement("div"); bar.className = "ua"; bar.setAttribute("role", "status");
    var t = document.createElement("b"); t.textContent = "يتوفر إصدار جديد من التطبيق" + (r.name ? " (" + String(r.name).slice(0, 12) + ")" : "");
    var p = document.createElement("p"); p.textContent = (r.notes ? String(r.notes).slice(0, 140) + ". " : "") + "اضغط «تنزيل»، وبعد انتهاء التنزيل افتح الملف واضغط «تثبيت». تبقى بياناتك كما هي.";
    var row = document.createElement("div"); row.className = "ua-r";
    var go = document.createElement("button"); go.type = "button"; go.className = "ua-go"; go.textContent = "تنزيل التحديث";
    var no = document.createElement("button"); no.type = "button"; no.textContent = "لاحقًا";
    go.onclick = function () { download(r.url); }; no.onclick = hide;
    row.appendChild(go); row.appendChild(no); bar.appendChild(t); bar.appendChild(p); bar.appendChild(row);
    document.body.appendChild(bar);
  }
  function check() {
    var App = plug("App"); if (bar || hidden || !App || !App.getInfo || !G.fetch) return;
    Promise.all([
      App.getInfo(),
      G.fetch(VER_URL + "?t=" + Date.now(), { cache: "no-store" }).then(function (x) { return x.ok ? x.json() : null; })
    ]).then(function (a) {
      var cur = parseInt(a[0] && a[0].build, 10), r = a[1], nb = r ? parseInt(r.build, 10) : 0;
      if (!(cur > 0) || !(nb > cur) || !r.url || String(r.url).indexOf("https://") !== 0) return;
      show(r);
    }).catch(function () {});
  }
  function init() { setTimeout(check, 4000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
