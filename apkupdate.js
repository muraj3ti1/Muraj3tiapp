/* تنبيه تحديث تطبيق الأندرويد (APK): يظهر داخل التطبيق فقط عندما يتوفر إصدار أحدث.
   يقرأ apk-version.json من الموقع ويقارن رقم البناء بالمثبّت على الهاتف.
   المستخدم يختار: تنزيل التحديث (بعد تأكيد أنه سجّل الدخول لحفظ بياناته) أو المتابعة بدون المسمّع.
   يكتب مفتاحًا واحدًا جديدًا فقط (mapkskip) لتذكّر «المتابعة بدون»، ولا يمس أي بيانات للمستخدم. */
(function (G) {
  "use strict";
  var VER_URL = "https://muraj3ti1.github.io/Muraj3tiapp/apk-version.json";
  var SKIP_KEY = "mapkskip", SKIP_DAYS = 3;
  function native() { try { return !!(G.Capacitor && G.Capacitor.isNativePlatform && G.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  if (!G.document || !native()) return;
  function plug(n) { try { return (G.Capacitor.Plugins && G.Capacitor.Plugins[n]) || null; } catch (e) { return null; } }
  function ls(k) { try { return G.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { G.localStorage.setItem(k, v); } catch (e) {} }

  var bar = null, hidden = false;
  var CSS = ".ua{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);transform:translateX(-50%);width:min(460px,calc(100% - 20px));max-height:85vh;overflow:auto;box-sizing:border-box;z-index:300;background:var(--card,#0f1d3d);color:var(--ink,#fff);border:2px solid var(--acc,#3f7cf0);border-radius:18px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);direction:rtl;font-family:inherit}" +
    ".ua b{display:block;font-size:15px;margin-bottom:4px}.ua p{margin:0 0 8px;font-size:13px;line-height:1.7;opacity:.92}" +
    ".ua .ua-w{border:1px solid #e0a030;border-radius:10px;padding:8px 10px;background:rgba(224,160,48,.12)}" +
    ".ua label{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.6;margin:0 0 10px;cursor:pointer}.ua label input{margin-top:4px;flex:none}" +
    ".ua-r{display:flex;gap:8px}.ua-r button{flex:1;font:inherit;font-size:14px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid var(--acc,#3f7cf0);background:transparent;color:inherit}" +
    ".ua-r button.ua-go{background:var(--acc,#3f7cf0);color:#fff;font-weight:700}.ua-r button:disabled{opacity:.4;cursor:not-allowed}";

  function download(url) {
    var B = plug("Browser");
    try { if (B && B.open) { B.open({ url: url }); return; } } catch (e) {}
    try { G.location.href = url; } catch (e) {}
  }
  function hide() { hidden = true; if (bar) { bar.remove(); bar = null; } }
  function skipped() { var t = parseInt(ls(SKIP_KEY), 10); return t > 0 && (Date.now() - t) < SKIP_DAYS * 864e5; }
  function el(tag, txt, cls) { var e = document.createElement(tag); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; }

  function show(r) {
    if (bar || hidden) return;
    if (!document.getElementById("uaCss")) { var s = el("style"); s.id = "uaCss"; s.textContent = CSS; document.head.appendChild(s); }
    bar = el("div", "", "ua"); bar.setAttribute("role", "status");
    bar.appendChild(el("b", "يتوفر تحديث للتطبيق" + (r.name ? " (" + String(r.name).slice(0, 12) + ")" : "")));
    bar.appendChild(el("p", (r.notes ? String(r.notes).slice(0, 140) + ". " : "") + "حتى يعمل المسمّع الآلي بكامل ميزاته تحتاج لتنزيل النسخة الجديدة. إن فضّلت يمكنك المتابعة بدونه، وكل ما عداه يعمل كالمعتاد."));
    var hasAcct = ls("mhasacct") === "1";
    var w = el("div", "", "ua-w");
    w.appendChild(el("p", "تنبيه مهم: هذه النسخة لا تُثبَّت فوق الحالية، فيلزم حذف التطبيق الحالي ثم تثبيت الجديد. لحفظ بياناتك سجّل الدخول بحسابك قبل ذلك وانتظر دقيقة، ثم سجّل الدخول بنفس الحساب في النسخة الجديدة فتعود خطتك وتقدمك. ملف PDF الذي رفعتَه بنفسك يُعاد رفعه."));
    if (!hasAcct) w.appendChild(el("p", "لم نجد حسابًا مسجّلًا على هذا الجهاز. سجّل الدخول أولًا، وإلا قد تفقد بياناتك."));
    bar.appendChild(w);
    var lab = el("label"), cb = document.createElement("input"); cb.type = "checkbox";
    lab.appendChild(cb); lab.appendChild(el("span", "سجّلتُ الدخول بحسابي وانتظرت دقيقة على الأقل بعد فتح التطبيق"));
    bar.appendChild(lab);
    var row = el("div", "", "ua-r");
    var go = el("button", "تنزيل التحديث", "ua-go"); go.type = "button"; go.disabled = true;
    var no = el("button", "متابعة بدون المسمّع"); no.type = "button";
    cb.onchange = function () { go.disabled = !cb.checked; };
    go.onclick = function () { if (cb.checked) download(r.url); };
    no.onclick = function () { lsSet(SKIP_KEY, String(Date.now())); hide(); };
    row.appendChild(go); row.appendChild(no); bar.appendChild(row);
    document.body.appendChild(bar);
  }
  function check() {
    var App = plug("App"); if (bar || hidden || skipped() || !App || !App.getInfo || !G.fetch) return;
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
