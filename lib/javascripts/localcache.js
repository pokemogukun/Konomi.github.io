/**
* キャッシュ関連処理 公開関数
*/
LocalCache = {
/**
* ・IndexedDBからキャッシュを取得し結果をBlobとして戻します
*
* ・サーバー側のETag値が違う場合はファイルが更新されているとみなしてキャッシュを登録し直してからBlobを戻します
* ・IndexedDBにキャッシュが登録されていない場合は登録してBlobを戻します
* @param {String} url ダウンロードするURL
*/
getBlob: function (url, option = {}) {
return new Promise((resolve) => {
console.log(url + ' Start Loading from localcache.js');

// ネットワーク及びキャッシュを操作するオブジェクト
const networkClient = new this.client.Network(url);
const cacheClient = new this.client.Cache(url);

// タイムアウト値を設定(デフォルトは3.0秒)
const timeout = option["timeout"] || 3.0 * 1000;

// キャッシュを使用しない場合はtrue
const nocache = option["nocache"] || false;

// SourceMappingが見つかった場合の処理(Developer Toolsを開いているならばリロードの必要がある)
const sourceMappingDetected = () => {
// Developer Toolsが開いていることを確認するハックな関数
const detectDevTools = (e => { const o = new Image; Object.defineProperty(o, "id", { get: e }), console.log("checking if devtools open...%c", o) });
// Developper Toolsを開いていたらリロードさせる
const reloader = () => {
detectDevTools(ifOpen => {
console.log("キャッシュにSourceMappingを適用するため、5秒後にリロードします……");
setTimeout(() => {
location.reload();
}, 5 * 1000);
});
};
setTimeout(reloader, 0); // すでにDeveloper Toolsを開いていたらリロードする
setInterval(reloader, 5000); // 5秒ごとにDeveloper Toolsを開いているかチェックする
};

// ダウンロードマネージャー
const manager = new this.blobDownloader({
"client": {
"network": networkClient,
"cache": cacheClient
},
"url": url,
"timeout": timeout,
"sourceMappingDetected": sourceMappingDetected
});

// キャッシュ値を使用しない場合
if (nocache) {
// ダウンロードした値を戻す(キャッシュは保存される)
manager.download()
.then((blob) => resolve(blob));
return;
}

// キャッシュを取得する
manager.getCache({
// キャッシュが存在する場合
exist: (cache) => {
//最新かをチェックする
manager.checkUpdate(
cache,
{
// タイムアウトした
timeout: () => {
// 5秒後にタイムアウト値を2倍にして再挑戦する
setTimeout(() => {
this.getBlob(url, {
"timeout": timeout * 2
});
}, 5 * 1000);
// とりあえずキャッシュは戻しておく
resolve(cache.blob);
},
// キャッシュが最新ではなかった
expired: () => {
// ダウンロードした値を戻す
manager.download()
.then((blob) => resolve(blob));
},
// キャッシュが最新だった
latest: () => {
// キャッシュを戻す
resolve(cache.blob);
}
});
},
// キャッシュが存在しない場合など
unusable: () => {
// ダウンロードした値を戻す
manager.download()
.then((blob) => resolve(blob));
}
});
});
},
/**
* index.bundle.jsをキャッシュから読み込みます
* @param {String} url
*/
loadIndexBundle: function (url) {
const startTime = performance && performance.now();
const loader = (_url) => {
const script = document.createElement('script');
script.src = _url;
// onloadを意図的に発火させる
script.onload = () => {
// loadがすでに完了してしまっている場合だけ
if (document.readyState === 'complete') {
const evt = document.createEvent('HTMLEvents');
evt.initEvent('load', false, true);
window.dispatchEvent(evt);
}
console.info(
'index.bundle.js Loading time:' + ((performance.now() - startTime) / 1000) + 'sec',
'Original URL:' + url,
'Blob URL:' + _url);
};
script.error = event => {
// 読み込みに失敗したら1秒後にやり直す
setTimeout(() => this.loadIndexBundle(url), 1000);
};
document.head.appendChild(script);
};

const wait = time => new Promise(resolve => setTimeout(resolve, time));
if (!Promise.any) {
Promise.__proto__.any = Promise.race;
}

//　第1候補 マニュアルされたキャッシュを戻す
const strategy1 = this.getBlob(url)
.then(URL.createObjectURL);
// 第2候補　fetch APIのキャッシュ制御に期待する
const strategy2controller = new AbortController();
const strategy2 = wait(1000)
.then(() => fetch(url, { cache: 'no-cache', signal: strategy2controller.signal }))
.then(res => res.blob())
.then(blob => URL.createObjectURL(blob))
.catch(e => { console.warn("abort:" + e); return url; });
//　第3候補　ただのURL
const strategy3 = wait(5000)
.then(() => url);
//urlを取得
Promise.any([strategy1, strategy2, strategy3])
.then(blobURL => {
console.log(blobURL);
strategy2controller.abort(); //候補2を止める
loader(blobURL);
})
.catch(e => {
console.error(e);
loader(url);
}); //非常事態

},
/**
* 指定されたURLをキャッシュに保存します。(タイムアウト値を30秒と長めに設定しています)
* @param {String} url
*/
prefetch: function (url) {
return this.getBlob(url, {
"timeout": 30 * 1000
});
},
/**
* バージョンチェッカーを起動します
*/
startVersionChecker: function () {
this.checker = new this.monitor.VersionChecker();
this.checker.onBeforeLeave = this.client.Cache.clear // 再読み込み前にIndexedDBをクリアします
},
/**
* キャッシュをクリアします
*/
clear: function () {
this.client.Cache.clear();
if (window.CacheClear) CacheClear();
},
/**
* indexedDB内部のキャッシュを全てチェックし、更新がある場合は更新します
*/
updateAll: function () {
this.client.Cache.getURLs()
.then(urls => {
if (Array.isArray(urls)) {
urls.forEach(url => this.prefetch(url));
};
})
.catch(error => {
// エラーがあった場合はキャッシュをクリアする
console.error(error);
this.clear();
});
}
};

/*
* 以下、 非公開オブジェクト
*/

/**
* Blobをダウンロードするマネージャークラス
*/
LocalCache.blobDownloader = class {
constructor(option) {
this.client = option.client;
this.url = option.url;
this.timeout = option.timeout || 1.5 * 1000;
this.sourceMappingDetected = option.sourceMappingDetected || (() => { });
}

/**
* キャッシュが利用可能である場合はキャッシュをコールバックに戻す
*/

getCache(callbacks) {
this.client.cache.get()
.then((cache) => {
console.log(this.url + " Cache Exist");
callbacks["exist"](cache)
})
.catch((error) => {
console.log(this.url + " Cache unusable Because of:", error);
callbacks["unusable"]();
});
}
/**
* キャッシュが最新かどうかを調べる
*/
checkUpdate(cache, callbacks) {
(async () => {
console.log(this.url + ' Check if Cache needs up-to-date');
// タイムアウト時間内にgetETagが反応しなかったらタイムアウト
const timer = setTimeout(() => callbacks["timeout"](), this.timeout);
// 更新されているかどうかを調べるにはETagをみる。HEADアクセスを試みる
const etag = await this.client.network.getETag();
// タイムアウト測定用タイマーを止める
clearTimeout(timer);
// 更新されていた!
if (!etag || etag.length == 0 || etag != cache.etag) {
console.log(this.url + ' Cache expired');
callbacks["expired"]();
}
// 更新されていなかった!
else {
console.log(this.url + ' Cache is the Latest');
callbacks["latest"]();
}
})()
}

/**
* ダウンロードを行い、非同期でキャッシュに保存する
*/
download() {
return new Promise((resolve, reject) => {
(async () => {
console.log(this.url + ' Load from Network');
//　ネットワークからデータをダウンロードする
const data = await this.client.network.get();
// 非同期でキャッシュを保存する
setTimeout(() => this.registCache(data), 0);
// blobを戻す
resolve(data.blob);
})()
.catch(e => reject(e));
});
}
/**
* キャッシュに保存する
* ただし、ソース内部にソースマップURLが存在した場合はそのURLを書き換えてキャッシュ内でも使えるようにする
*/
registCache(data) {
// ソースマップを調べる
this.adjustSourceMapping(data, {
// ソースマップが見つかったらsourceMappingURLを書き換えてキャッシュに保存する
found: async _data => {
await this.client.cache.set(_data);
this.sourceMappingDetected();
},
//　ソースマップが見つからなかったらそのままキャッシュに保存する
notFound: () => {
this.client.cache.set(data);
}
});
}



/**
*　指定されたjavascript Blobを解析し
* sourceMappingURLが指定されていた場合はフルパスに書き換える
*/
adjustSourceMapping(data, callbacks) {
// javascriptではない場合はそのまま
if (data.blob.type.indexOf("javascript") == -1) {
callbacks["notFound"](data);
}
// javascriptである場合は中身を調べる
else {
const reader = new FileReader();
reader.onload = (event) => {
let text = event.target.result;
const p = text.split('\n');
const lastLine = p[p.length - 1].trim(); //jsファイルの最終行を取得
//ソースマップが見つかった場合の処理
if (lastLine.match(/^\/\/.*/) && lastLine.indexOf("sourceMappingURL=") !== -1) {
//ソースマップの値をフルパスに書き換える
const baseURL = this.url.substring(0, this.url.lastIndexOf('/')) + '/';
const sourceMappingURL = lastLine.split("sourceMappingURL=")[1];
const sourceMappingFullPath = (new URL(sourceMappingURL, baseURL)).href;
const newLastLine = "//# sourceMappingURL=" + sourceMappingFullPath;
text += "\n";
text += newLastLine;
data.blob = new Blob([text], { type: data.blob.type });
console.log("Source Map Detected:Adjusted");
callbacks["found"](data);
}
//ソースマップが見つからなかった場合
else {
callbacks["notFound"](data);
}
};
reader.onerror = e => { throw e };
reader.readAsText(data.blob, "utf-8");
}
}
};

/**
* 指定されたリソースを読むクライアント
*/
LocalCache.client = {};
/**
* 指定されたURLのリソースを読み込むインターフェース
*
* 継承した静的クラス
* LocalCache.Network :ネットワークからリソースを読み込みます
* LocalCache.Cache :キャッシュからリソースを読み込みます
*/
LocalCache.client.ReadableInterface = class {
/** 読み込むURL情報を指定する */
constructor(url) {
this.url = url;
}

/** URLのリソースを{"blob":blob,"etag":String}の形で取得する。戻り値はPromise */
get() { }

/** URLのリソースのblobを取る。戻り値はPromise */
getBlob() { }

/** URLのリソースのEtagを取る。ETagのみが欲しい場合は、getより低コストである。戻り値はPromise */
getETag() { }
};
/**
* 指定されたURLのリソースを保存するインターフェース
* LocalCache.ReadableInterfaceを継承しています。
*
* 継承した静的クラス
* LocalCache.Cache :キャッシュに保存します
*/
LocalCache.client.WriteableInterface = class extends LocalCache.client.ReadableInterface {
/** URLをキーとして、{"blob":blob,"etag":String}のobjectを保存・更新する */
set(object) { }

/** URLをキーとして、blobを保存・更新する */
setBlob(blob) { }

/** URLをキーとして、etagを保存・更新する */
setETag(etag) { }

/** 保存された情報のURLを全て取得する */
static getURLs() { }

/** 保存された情報を全て削除する */
static clear() { }
};
/**
* 指定されたURLのリソースをネットワークから読み込む
*/
LocalCache.client.Network = class extends LocalCache.client.ReadableInterface {
get() {
return new Promise((resolve, reject) => {
(async () => {
const option = {
importance: "high"
};
const res = await fetch(this.url, option);
const etag = res.headers.get('ETag');
const blob = await res.blob();
if (!res.ok) throw res;
resolve({
etag: etag,
blob: blob,
});
})()
.catch(e => reject(e));
});
}

getBlob() {
return new Promise((resolve) => {
(async () => {
resolve((await this.get()).blob);
})();
});
}

getETag() {
return new Promise((resolve, reject) => {
(async () => {
const res = await fetch(this.url, {
method: 'head',
cache: 'no-store',
importance: "high"
});
if (!res.ok) {
reject(new Error(['Connection Failed', res]));
}
resolve(res.headers.get('ETag'));
})();
});
}
};
/**
* 指定されたURLのリソースをキャッシュから読み込む
*/
LocalCache.client.Cache = class extends LocalCache.client.WriteableInterface {
get() {
return new Promise((resolve, reject) => {
(async () => {
const etag = await this.getETag();
const blob = await this.getBlob();
resolve({
etag: etag,
blob: blob,
});
})()
.catch((e) => reject(e));
});
}

set(res) {
return new Promise((resolve, reject) => {
(async () => {
await this.setBlob(res.blob);
await this.setETag(res.etag);
resolve();
})().catch(e => reject(e));
});
}

getBlob() {
return new Promise((resolve, reject) => {
this._getConnection().then((conn) => {
try {
const key = this._getKey(this.url);
const transaction = conn.transaction(['blob'], 'readonly');
const req = transaction.objectStore('blob').get(key);
req.onsuccess = (event) => {
const blob = event.target.result;
if (blob == undefined) reject(new Error('Blob Not on Cache'));
resolve(blob);
};
req.onerror = (error) => reject(error);
transaction.onerror = (error) => reject(error);
transaction.onabort = (error) => reject(error);
} finally {
conn.close();
}
})
.catch((error) => reject(error));
});
}

getETag() {
return new Promise((resolve, reject) => {
this._getConnection()
.then((conn) => {
try {
const key = this._getKey(this.url);
const transaction = conn.transaction(['etag'], 'readonly');
const req = transaction.objectStore('etag').get(key);
req.onsuccess = (event) => {
const blob = event.target.result;
if (blob == undefined) reject(new Error('ETag Not on Cache'));
resolve(blob);
};
req.onerror = (error) => reject(error);
transaction.onerror = (error) => reject(error);
transaction.onabort = (error) => reject(error);
} finally {
conn.close();
}
})
.catch((error) => reject(error));
});
}

setBlob(blob) {
return new Promise((resolve, reject) => {
if (!(blob instanceof Blob)) {
reject(new Error('Try to insert object which is not Blob'));
}
this._getConnection()
.then((conn) => {
try {
const key = this._getKey(this.url);
const transaction = conn.transaction(['blob'], 'readwrite');
transaction.objectStore('blob').put(blob, key);
transaction.oncomplete = (result) => resolve(result);
transaction.onerror = (error) => reject(error);
transaction.onabort = (error) => reject(error);
} finally {
conn.close();
}
})
.catch((error) => reject(error));
});
}

setETag(etag) {
return new Promise((resolve, reject) => {
this._getConnection()
.then((conn) => {
try {
const key = this._getKey(this.url);
const transaction = conn.transaction(['etag'], 'readwrite');
transaction.objectStore('etag').put(etag, key);
transaction.oncomplete = (result) => resolve(result);
transaction.onerror = (error) => reject(error);
transaction.onabort = (error) => reject(error);
} finally {
conn.close();
}
})
.catch((error) => reject(error));
});
}

static clear() {
return new Promise((resolve, reject) => {
const ddl = indexedDB.deleteDatabase('cacheDB');
ddl.onsuccess = (result) => resolve(result);
ddl.onblocked = (error) => reject(error);
ddl.onerror = (error) => reject(error);
});
}
/**キャッシュされているURLを取得する */
static getURLs() {
return new Promise((resolve, reject) => {
(new this)._getConnection()
.then(conn => {
const transaction = conn.transaction(['etag'], 'readonly');
const object = transaction.objectStore('etag');
const request = object.getAllKeys();
request.onsuccess = event => {
try {
// keyからurlに変換する
let urls = [];
const keys = event.target.result;
if (!keys) {
resolve(urls);
}
else {
keys.forEach(key => {
urls.push(decodeURIComponent(key));
});
resolve(urls);
}
}
catch (e) {
reject(e);
}
};
request.onerror = error => reject(error);
request.onabort = error => reject(error);
})
.catch(error => reject(error));
});
}

_getConnection() {
return new Promise((resolve, reject) => {
const request = indexedDB.open('cacheDB', 2);
request.onsuccess = (event) => {
const conn = request.result;
resolve(conn);
};
request.onerror = (error) => {
reject(error);
};
request.onupgradeneeded = (event) => {
const conn = request.result;
conn.createObjectStore('blob');
conn.createObjectStore('etag');
};
});
}

/** URLをFull Pathに変換した上でサニタイズし、データベースのキー値として使用可能にします */
_getKey(url) {
if (this.key != null) return this.key;
// URLをFull Path に変換する
const fullPath = (new URL(url, location.href)).href;
this.key = encodeURIComponent(fullPath);
return this.key;
}
};

/**
* キャッシュを監視するクラス群
*/
LocalCache.monitor = {};

/**
* レジューム復帰時及びページ読み込み時にバージョンチェックを行います
* バージョン番号に変化がある場合はキャッシュをクリアし、再読込を行います
*
* ※Cordova上でのみ動作します。通常のブラウザから呼ばれた場合は何もしません
*/
LocalCache.monitor.VersionChecker = class {
constructor() {
document.addEventListener('deviceready', function () {
document.addEventListener('resume', this.onActive.bind(this), false); // レジューム復帰時
this.onActive(); // ページ読み込み時
}.bind(this), false);
}

//　非同期処理として実行する
async onActive() {
if (!window.cordova) {
console.log('Not inside of Cordova Webview');
return;
}
if (!window.CustomConfigParameters) {
console.warn("versionchecker do not work without CustomConfigParameters plugin now");
return;
}
const configData = await new Promise((ok, no) => CustomConfigParameters.get(ok, no, ['bootconfigurl']));
const bootconfigurl = configData.bootconfigurl || "";
if (this.isValidURL(bootconfigurl)) {
// bootconfig.json取得
const json = await fetch(bootconfigurl, { mode: 'cors', credentials: 'same-origin', importance: "low" }).then(res => res.json());
// アプリ側に保存されているserverVersionを取得
const serverVersionInApp = this.getVersion();
// アプリ本体のバージョン番号を取得
const version = await new Promise(window.cordova.getAppVersion.getVersionNumber);
// iosかandroidかを判定
const platform = window.cordova.platformId;
const { serverVersion, serverUrl } =
(json[platform] || [])[version] || json[version] || json['default'];
// ログ
console.log("bootconfig取得成功", { json, platform, version, serverVersion, serverVersionInApp, serverUrl });
// serverVersionが合致するかを確認する
if (serverVersion != serverVersionInApp) {
// 一致しない場合はキャッシュを削除して再読込を行う
await new Promise(CacheClear);
this.setVersion(serverVersion);
try {
await this.onBeforeLeave();
// Cordova内部ならFirebase IDも更新する
if (window.cordova) {
FirebasePlugin.setAutoInitEnabled(true, FirebasePlugin.unregister);
await new Promise(r => setTimeout(r, 1000)); //安定のため1秒ほど待つ
}
}
finally {
if (serverVersionInApp) {
window.location.replace(serverUrl);
}
}
}
}
else if (bootconfigurl.indexOf('test://') != -1) {
await new Promise(CacheClear);
console.warn('ローカルテストでversion_checker.jsが呼び出されました');
return;
}
else
throw new Error('config.xmlにbootconfigurlの設定が必要です');
}

isValidURL(url) {
return !!url.match(/^(https?|ftp)(:\/\/[-_.!~*\'()a-zA-Z0-9;\/?:\@&=+\$,%#]+)$/);
}

getVersion() {
return localStorage.getItem('serverVersion');
}

setVersion(version) {
return localStorage.setItem('serverVersion', version);
}

/** ここにページから離れる前の処理をPromiseの形で書く */
async onBeforeLeave() { }
};
