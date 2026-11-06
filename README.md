# 像素行程夥伴（Pixel Pal）

像素風行程助手：吉祥物每晚提醒你明天的行程，還能和好友互傳訊息、圖片、戳一下。
目前是**第一版（前端原型）**：行程與好友都是示範資料，存在各自手機的瀏覽器裡。

## 專案結構

```
pixel-pal/
├─ index.html            整個 App（畫面 + 程式）
├─ manifest.webmanifest  安裝到主畫面用的設定（名稱、圖示、顏色）
├─ sw.js                 Service Worker：離線快取
├─ icons/                App 圖示（主畫面、分頁標籤）
└─ assets/               背景、吉祥物、介面元件圖
```

純靜態網站，不需要編譯，也不需要安裝套件。

## 在電腦上預覽

直接雙擊 `index.html` 也能看畫面，但 Service Worker 只在 `http://` 下運作，建議用本機伺服器：

```bash
cd pixel-pal
python -m http.server 8000
# 或：npx serve .
```

再用瀏覽器開 <http://localhost:8000>。Chrome 開發者工具切到手機模式（Ctrl+Shift+M）看起來最接近手機。

## 上線到 GitHub Pages（免費）

### 方法 A：網頁上傳（最簡單）

1. 到 GitHub 右上角「+」→ **New repository**，名稱填 `pixel-pal`，選 **Public**，按 Create。
2. 在新 repo 頁面點 **uploading an existing file**。
3. 把 `pixel-pal` 資料夾**裡面的所有檔案與資料夾**（不是資料夾本身）拖進去，按 **Commit changes**。
4. 到 repo 的 **Settings → Pages**：Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，按 Save。
5. 等 1～2 分鐘，頁面上方會出現網址：`https://<你的帳號>.github.io/pixel-pal/`。

### 方法 B：用 git 指令

```bash
cd pixel-pal
git init
git add .
git commit -m "Pixel Pal v1"
git branch -M main
git remote add origin https://github.com/<你的帳號>/pixel-pal.git
git push -u origin main
```

推上去後一樣到 **Settings → Pages** 開啟。

## 安裝到手機

- **iPhone**：用 **Safari** 開網址 → 下方分享按鈕 → **加入主畫面**。（之後的推播通知也需要用這個方式開啟，iOS 16.4 以上）
- **Android**：用 Chrome 開網址 → 右上選單 → **安裝應用程式**。

## 更新版本

改了任何檔案後，請把 `sw.js` 第 2 行的 `VERSION` 加 1（例如 `'v1'` → `'v2'`），
手機下次打開時才會換成新版（有時要關掉 App 再開一次）。

## 換圖

`assets/` 裡的檔名就是程式讀取的名字，直接用同名檔案覆蓋即可，例如：

| 檔名 | 用途 |
|---|---|
| `bg_day / bg_dusk / bg_night.webp` | 首頁背景（依時間自動切換） |
| `bg_room.webp` | 行程／好友／設定分頁的背景 |
| `bg_chat.webp` | 聊天頁背景 |
| `{shiba,beagle,parrot}_{idle,happy,sleep,alert}.png` | 三隻吉祥物的四個動作 |
| `{shiba,beagle,parrot}_blink.png` | 眨眼圖（和 idle 同尺寸，只有眼睛不同） |
| `frame / card / btn_wood / btn_gold / plank / sign.png` | 木框、羊皮紙、按鈕、分頁列、招牌 |
| `bubble_body / bubble_tail.png` | 對話框（框身與尾巴分開，框身四邊等比縮放） |
| `ic_*.png` | 圖示 |

## 接下來（第二階段）

1. Supabase：帳號、好友、訊息、圖片儲存
2. Google 登入 + 讀取 Google 日曆（未來 7 天）
3. 每晚依設定時間推播「明天的行程」
