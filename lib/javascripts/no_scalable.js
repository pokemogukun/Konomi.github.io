/**
* タッチデバイスでのピンチイン・ピンチアウト、ダブルタップでの
* 拡大縮小を禁止する
*/
/* "passive" が使えるかどうかを検出 */
var passiveSupported = false;
try {
document.addEventListener("test", null, Object.defineProperty({}, "passive", {
get: function () {
passiveSupported = true;
}
}));
} catch (err) { }
/* ピンチイン・アウトによる拡大を禁止 */
document.addEventListener('touchstart', function listener(e) {
if (e.touches.length > 1) {
e.preventDefault();
}
}, passiveSupported ? { passive: false } : false);
/* ダブルタップによる拡大を禁止 */
var t = 0;
document.addEventListener('touchend', function listener(e) {
var now = new Date().getTime();
if ((now - t) < 350) {
e.preventDefault();
}
t = now;
}, passiveSupported ? { passive: false } : false);
// window.onload = () => {
// }
