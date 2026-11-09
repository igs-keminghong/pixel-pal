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
├─ pets/                 夥伴（每隻一個資料夾：5 張圖 + pet.json）
├─ tools/check_pets.py   檢查夥伴資料是否齊全
└─ assets/               背景、介面元件圖
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

發新版前，先看 `CHANGELOG.md` 最上方的「發新版的檢查清單」。

改了任何檔案後，請把 `sw.js` 第 2 行的 `VERSION` 加 1（例如 `'v1'` → `'v2'`），
手機下次打開時才會換成新版（有時要關掉 App 再開一次）。

## 夥伴

每個夥伴是 `pets/` 底下的一個資料夾（圖片 + `pet.json` 設定），新增或修改看 `pets/README.md`。

## 換圖

`assets/` 裡的檔名就是程式讀取的名字，直接用同名檔案覆蓋即可，例如：

| 檔名 | 用途 |
|---|---|
| `bg_day / bg_dusk / bg_night.webp` | 首頁背景（依時間自動切換） |
| `bg_room.webp` | 行程／好友／設定分頁的背景 |
| `bg_chat.webp` | 聊天頁背景 |
| `frame / card / btn_wood / btn_gold / plank / sign.png` | 木框、羊皮紙、按鈕、分頁列、招牌 |
| `bubble_body / bubble_tail.png` | 對話框（框身與尾巴分開，框身四邊等比縮放） |
| `ic_*.png` | 圖示 |

## 後端（Supabase）與 Google 登入

- Supabase 專案：`https://oqdizogpzqqxxlbfymfk.supabase.co`（網址與 publishable key 寫在 `index.html` 開頭，這兩個本來就是公開值）
- 資料庫結構：`supabase/schema.sql`（在 Supabase 的 SQL Editor 執行，可重複執行）
- **絕對不要**把 `secret` / `service_role` 金鑰放進這個專案或 git。

### Google Cloud
1. <https://console.cloud.google.com> 建立專案 `pixel-pal`
2. APIs & Services → Library → 啟用 **Google Calendar API**
3. Google Auth Platform（OAuth 同意畫面）→ 對象選 **External**，填 App 名稱與信箱
4. Data Access → Add scopes → 勾 `.../auth/calendar.readonly`
5. Audience → Test users → 加入自己和朋友的 Gmail（測試模式上限 100 人）
6. Clients → Create client → **Web application**
   - Authorized JavaScript origins：`https://igs-keminghong.github.io`、`http://localhost:8000`
   - Authorized redirect URIs：`https://oqdizogpzqqxxlbfymfk.supabase.co/auth/v1/callback`
7. 複製 Client ID / Client secret

### Supabase
1. Authentication → Sign In / Providers → **Google** → 啟用，貼上 Client ID / Client secret
2. Authentication → URL Configuration
   - Site URL：`https://igs-keminghong.github.io/pixel-pal/`
   - Redirect URLs：加 `https://igs-keminghong.github.io/pixel-pal/**` 和 `http://localhost:8000/**`

### 已知限制（測試模式）
- Google 存取權杖約 1 小時有效，日曆在登入當下與手動按「同步日曆」時更新；之後打開 App 會先用上次同步的資料。
- 在 App 裡新增的行程只存在 App，不會寫回 Google 日曆。

## 每晚推播

- 前端：設定頁「開啟通知」→ 訂閱存到 `push_subscriptions`；`sw.js` 處理 `push` / `notificationclick`
- 後端：`supabase/functions/nightly-reminder/index.ts`（不需外部套件，自帶 Web Push 加密）
- 排程：`supabase/push.sql`，pg_cron 每 15 分鐘呼叫一次，函式依每個人的時區與提醒時間決定要不要送
- 金鑰：`secrets/push-secrets.txt`（已被 .gitignore 排除，**不要上傳**）。VAPID 公鑰另外寫在 `index.html`，那是公開值。
- iPhone 需 iOS 16.4 以上，並且從「加入主畫面」的圖示打開才能開通知。
