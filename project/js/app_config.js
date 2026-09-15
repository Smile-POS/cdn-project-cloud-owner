// ตั้งที่อยู่ของ main.dart.js / .part.js ที่ไฟล์นี้แห่งเดียว แล้ว build ใหม่
//
//     base = JS_BASE_URL + <เวอร์ชัน> + JS_BASE_PATH
//
//   JS_BASE_URL      "https://cdn.jsdelivr.net/gh/Smile-POS/cdn-project-cloud-owner@v"
//   <เวอร์ชัน>       "1.0.0+100000" — อ่านจาก /version.json ตอน runtime (ไฟล์ที่ flutter
//                    build web สร้างให้เอง) เป็น version + "+" + build_number
//                    ตั้ง JS_BASE_VERSION เป็นค่าคงที่เพื่อ pin เวอร์ชันแทนการอ่านไฟล์ก็ได้
//   JS_BASE_PATH     "/project/js/"
//
// รวมกันเป็น https://cdn.jsdelivr.net/gh/Smile-POS/cdn-project-cloud-owner@v1.0.0+100000/project/js/
// (prefix "v" ของ tag อยู่ท้าย JS_BASE_URL — version.json ไม่มีตัวนี้ให้)
//
// รูปแบบที่ใช้ได้ (tool/web_config.mjs ตรวจให้ตอน build):
//   ว่างทั้งสามค่า                  โฮสต์เดียวกับหน้าเว็บ (dev = /, production = /js/)
//   ตั้ง URL อย่างเดียว             ใช้ URL นั้นเป็นโฟลเดอร์ตรง ๆ ต้องลงท้ายด้วย / และไม่อ่าน version.json
//   ตั้ง URL + PATH                 แทรกเวอร์ชันตรงกลาง PATH ต้องขึ้นต้นและลงท้ายด้วย /
window.JS_BASE_URL = "https://cdn.jsdelivr.net/gh/Smile-POS/cdn-project-cloud-owner@v";
window.JS_BASE_VERSION = "";
window.JS_BASE_PATH = "/project/js/";

(function () {
  var pending = null;

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
    var url = window.JS_BASE_URL || "";
    var path = window.JS_BASE_PATH || "";
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
