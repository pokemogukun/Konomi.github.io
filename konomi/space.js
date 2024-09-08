// space.js

// URLパラメータから spaceid と spacename を取得
const urlParams = new URLSearchParams(window.location.search);
const spaceid = urlParams.get('spaceid') || 'デフォルトID';
const spacename = urlParams.get('spacename') || 'デフォルト名';

// HTMLにspaceidとspacenameを挿入する関数
function displaySpaceInfo() {
  document.getElementById('spaceid').innerText = spaceid;
  document.getElementById('spacename').innerText = spacename;
}

// DOMが読み込まれた後に関数を実行
document.addEventListener('DOMContentLoaded', displaySpaceInfo);
