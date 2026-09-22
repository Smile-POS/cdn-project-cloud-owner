// ตั้งที่อยู่ของ main.dart.js / .part.js ที่ไฟล์นี้แห่งเดียว แล้ว build ใหม่
//
//     base = url + <เวอร์ชัน> + path
//
//   url        "https://cdn.jsdelivr.net/gh/Smile-POS/cdn-project-cloud-owner@v"
//   <เวอร์ชัน>  "1.0.0+100000" — อ่านจาก /version.json ตอน runtime (ไฟล์ที่ flutter build web
//              สร้างให้เอง) เป็น version + "+" + build_number
//              ตั้ง version เป็นค่าคงที่เพื่อ pin แทนการอ่านไฟล์ก็ได้
//   path       "/project/js/"
//
// รวมกันเป็น https://cdn.jsdelivr.net/gh/Smile-POS/cdn-project-cloud-owner@v1.0.0+100000/project/js/
// (prefix "v" ของ tag อยู่ท้าย url — version.json ไม่มีตัวนี้ให้)
//
// รูปแบบที่ใช้ได้ต่อ environment (tool/web_config.mjs ตรวจให้ตอน build):
//   ว่างทั้งสามค่า          โฮสต์เดียวกับหน้าเว็บ (dev = /, production = /js/)
//   ตั้ง url อย่างเดียว     ใช้ URL นั้นเป็นโฟลเดอร์ตรง ๆ ต้องลงท้ายด้วย / และไม่อ่าน version.json
//   ตั้ง url + path        แทรกเวอร์ชันตรงกลาง path ต้องขึ้นต้นและลงท้ายด้วย /
//
// เครื่องมือตอน build **อ่านค่าด้วยการ parse ไม่ใช่รันไฟล์นี้** — เขียนแบบ object ปกติได้
// (key ไม่ต้องมี quote, trailing comma ได้ จัด formatter ทับได้) แต่ **ค่าต้องเป็นสตริงที่มี
// quote เสมอ** และปีกกาปิดต้องอยู่ต้นบรรทัดเป็น `};`
window.APP_ENVIRONMENTS = {
  debug: {
    url: "",
    version: "",
    path: "",
  },
  sandbox: {
    url: "",
    version: "",
    path: "",
  },
  production: {
    url: "https://cdn.jsdelivr.net/gh/Smile-POS/cdn-project-cloud-owner@v1.0.3/project/js/",
    version: "",
    path: "",
  },
};

// environment ที่มีผลจริง
//   dev (flutter run -d chrome) ใช้ค่าในบรรทัดนี้ตรง ๆ
//   production build ใช้ `dart run dependency build-web --env <ชื่อ>` (ดีฟอลต์ production)
//     ซึ่งจะเขียนทับบรรทัดนี้ตอนฝัง config ลง HTML — ตัวไฟล์ใน web/ ไม่ถูกแตะ
window.APP_ENVIRONMENT = "debug";

(function () {
  var pending = null;
  var selected = window.APP_ENVIRONMENTS[window.APP_ENVIRONMENT];
  if (!selected) {
    throw new Error("Unknown APP_ENVIRONMENT: " + window.APP_ENVIRONMENT);
  }
  // แตกออกมาเป็นตัวแปรระดับ window ด้วย เพื่อให้เปิด console ดูได้ว่า build นี้ชี้ไปไหน
  window.JS_BASE_URL = selected.url || "";
  window.JS_BASE_VERSION = selected.version || "";
  window.JS_BASE_PATH = selected.path || "";

  // คืน URL เต็มที่มี origin เสมอ — entrypointBaseUrl ที่เป็น path ล้วนใช้ไม่ได้ เพราะ
  // flutter.js ตัด "/" ท้ายทุกตัวแล้ว filter สตริงว่างทิ้ง ⇒ "/" เท่ากับไม่ได้ตั้งอะไรเลย
  // (ตรวจด้วย tool/verify_entrypoint_url.mjs)
  function absolute(value) {
    return new URL(value, location.origin).href.replace(/\/?$/, "/");
  }

  // no-store + query กันเวอร์ชันค้างใน cache — ไฟล์เล็กและอยู่โฮสต์เดียวกับหน้านี้
  // (ค่าที่ค้างแค่รอบเดียวแปลว่าโหลด part ของ build เก่าคู่กับ main ใหม่ = จอขาว)
  function readVersion() {
    if (window.JS_BASE_VERSION) return Promise.resolve(window.JS_BASE_VERSION);
    return fetch("/version.json?v=" + Date.now(), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("version.json HTTP " + res.status);
        return res.json();
      })
      .then(function (info) {
        var version = info && info.version;
        if (!version) throw new Error("version.json has no version");
        var build = info.build_number;
        return build ? version + "+" + build : version;
      });
  }

  // โฟลเดอร์ของ main.dart.js + .part.js (ลงท้ายด้วย / เสมอ) — จำผลไว้ตัวเดียวทั้งหน้า
  // ทุกที่ที่ต้องรู้ที่อยู่ของ bundle ต้องเรียกตัวนี้ ห้ามต่อ URL เอง ไม่งั้น warm-up กับ engine
  // จะขอคนละ URL แล้วได้คนละ cache entry = โหลดซ้ำทั้งก้อน
  window.resolveJsBase = function () {
    if (pending) return pending;
    var url = window.JS_BASE_URL;
    var path = window.JS_BASE_PATH;
    if (!url) {
      pending = Promise.resolve(absolute(window.FLUTTER_JS_PATH || "/"));
    } else if (!path) {
      pending = Promise.resolve(absolute(url));
    } else {
      pending = readVersion().then(function (version) {
        // เวอร์ชันมาจากไฟล์ จึงต้องกันไม่ให้พาอะไรแปลก ๆ เข้ามาต่อใน URL
        if (!/^[A-Za-z0-9._+-]+$/.test(version)) {
          throw new Error("unusable version: " + version);
        }
        return absolute(url + version + path);
      });
    }
    return pending;
  };
})();
