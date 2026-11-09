# Changelog

像素行程夥伴（Pixel Pal）的版本紀錄。

- 版本號格式：`主版本.次版本`（例如 1.1）。
- 每個版本分成三段：
  - **玩家看得到的**：同步寫進 `index.html` 的 `NEWS` 清單，App 會以「更新公告」顯示。
  - **技術變更**：給開發者看。
  - **上線步驟**：Supabase 等需要手動處理的事。

## 發新版的檢查清單

1. 在本檔最上面新增一個版本段落。
2. 在 `index.html` 的 `NEWS` 清單**最上面**加一筆相同版本號的公告；有新夥伴時，填進 `pets:[{key:'代號'}]`。
3. `sw.js` 的 `VERSION` 加 1，玩家手機才會抓到新檔案。
4. 有改資料庫或推播程式時，照該版本的「上線步驟」處理。
5. `git commit`、`git push`。
6. 上線後要通知玩家時，到 Supabase SQL Editor 執行：
   ```sql
   select public.send_news('有新版本囉！……快來看看～');
   ```
   訊息裡的 `{name}` 會換成每個人自己的夥伴名字。只在有明顯更新時發，不要太頻繁。

## 新增夥伴

每個夥伴是 `pets/` 底下的一個資料夾（5 張圖 + `pet.json`），詳細規格見 `pets/README.md`。

1. 複製 `pets/_template`，改名成新代號（小寫英文），放進 5 張圖、填好 `pet.json`。
2. `pets/index.json` 的清單加上新代號。
3. `python tools/check_pets.py` 全部通過。
4. 在 `NEWS` 加公告時，新夥伴只要寫 `pets:[{key:'代號'}]`，名字和介紹會從 `pet.json` 帶入。
5. 照上面的檢查清單發新版。

不用改程式、不用動 Supabase、不用重新部署推播程式。

---

## [1.2] — 未發布

### 玩家看得到的

- 每隻夥伴被點時都有自己的動作：柴犬「哼」一聲轉身、米格魯連跳兩下、鸚鵡跳舞，捨令維持歪頭蹭蹭。
- 柴犬、米格魯、鸚鵡換上配合動作的新開心圖。

### 技術變更

- **夥伴改成角色包**：`pets/<代號>/` 放 `idle / happy / sleep / alert / blink.png` 和 `pet.json`（名字、介紹、被點動作、App 台詞、推播台詞）；`pets/index.json` 決定選單順序。
  - App 啟動時讀取清單和每個 `pet.json`，圖片高度從檔案自動讀取。
  - 推播程式從網站讀 `pets/<代號>/pet.json` 的推播台詞（快取 5 分鐘）；讀不到時用通用台詞和 App 圖示，推播照常送出。
  - Service Worker 安裝時依 `pets/index.json` 一併快取所有夥伴；`.json` 一律先抓網路，改台詞不用升版號也會更新。
  - 新增 `pets/README.md`（給畫角色的人看的規格）、`pets/_template/`、`tools/check_pets.py`（檢查圖片和設定是否齊全）。
- 資料庫的吉祥物欄位只檢查格式（小寫英數、底線），加夥伴不用再改資料庫。
- 修正：點過柴犬後切換夥伴，新夥伴也會轉身的問題。

### 上線步驟（只需做一次）

```sql
alter table public.profiles drop constraint if exists profiles_pet_check;
alter table public.profiles add constraint profiles_pet_check
  check (pet ~ '^[a-z][a-z0-9_]{0,23}$');
```

- 重新部署 `nightly-reminder`。
- 網站不是放在 `https://igs-keminghong.github.io/pixel-pal/` 時，在 Edge Functions → Secrets 加 `APP_URL`。

---

## [1.1] — 2026-11-07

### 玩家看得到的

- **新夥伴：貓咪「捨令」**（英國短毛貓）。有點呆、常常發呆，摸她會歪頭蹭你的手。
- 首頁依時間切換顯示的行程：
  - 提醒時間前顯示**今天**：過去的行程變淡，下一個行程有「下一個」標記。
  - 到了提醒時間，或今天的行程都結束了，改成顯示**明天**。
  - 點面板上方的木牌可以手動切換今天和明天。
- 今晚還有行程時，吉祥物會提醒你，睡覺時也會講。
- 每晚推播：在設定頁開啟通知，依你設定的提醒時間和所在時區送出。
- 「打聲招呼」按鈕：讓夥伴傳一則通知來，確認通知有正常運作。
- 更新公告：老玩家更新後第一次打開會看到，設定頁也可以重新查看。
- 畫面優化：招牌換成繩結款，對話框四邊留白一致，並會自動避開吉祥物的頭。

### 技術變更

- 第四隻吉祥物用通用欄位接入：
  - 選單只會顯示 `assets/<key>_idle.png` 真的存在的吉祥物。
  - 圖片尺寸從檔案自動讀取，不用手動填。
  - 個別吉祥物可以指定被點時的動畫（`tap`：`jump` / `wiggle` / `purr` / `rub`），以及哪些動作是躺姿（`lie`），躺姿會改用較寬的影子和身體中心當支點。
- 捨令的五張圖由飼主照片生成，`cat_blink` 是從 idle 圖只換掉眼睛區域，眨眼時不會跳動。
- 推播程式 `supabase/functions/nightly-reminder`：
  - 不依賴任何套件，自己實作 Web Push 加密（aes128gcm）與 VAPID。
  - pg_cron 每 15 分鐘呼叫一次；同一位玩家每天只送一次（記錄在 `profiles.last_reminded_on`）。
  - 失效的推播訂閱（回應 404/410）會自動刪除。
  - 支援新版 `sb_secret_` 金鑰（存在 `SB_SECRET_KEY`）。
- 玩家手機的時區會寫回 `profiles.timezone`，推播依各自時區計算。
- 吉祥物大小在畫面高度確定後重新計算，修正剛打開時偏小的問題。
- `sw.js` 從 `v3` 升到 `v20`。

### 上線步驟

```sql
-- 允許新吉祥物
alter table public.profiles drop constraint if exists profiles_pet_check;
alter table public.profiles add constraint profiles_pet_check
  check (pet in ('shiba','beagle','parrot','cat'));

-- 推播程式用 service_role 讀寫（建專案時取消了自動開放資料表）
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
```

- 執行 `secrets/push-secrets.txt` 第 [2] 段：建立 `last_reminded_on` 欄位和 pg_cron 排程。
- Edge Functions → Secrets：
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
  - `CRON_SECRET`
  - `SB_SECRET_KEY`
- 部署 `nightly-reminder`，並關閉 **Verify JWT**。
- 執行 `secrets/push-secrets.txt` 第 [3] 段，建立 `send_news()`，之後發新版就能發推播。
- 推播程式要重新部署：這版新增了廣播功能。

---

## [1.0] — 2026-11-06

### 玩家看得到的

- 像素行程夥伴上線，有柴犬、米格魯、鸚鵡三位夥伴。
- 白天、黃昏、夜晚三種場景依時間自動切換；吉祥物會眨眼，有開心、睡覺、提醒等動作。
- 用 Google 登入，讀取 Google 日曆今天起 7 天的行程；登入和連結日曆是分開的兩步。
- 好友碼、即時聊天、傳圖片（可以下載原圖）、戳一下。
- 可以安裝到手機主畫面（PWA），支援離線開啟。

### 技術變更

- 純靜態網站，放在 GitHub Pages；後端是 Supabase。
- 資料庫結構在 `supabase/schema.sql`：
  - 開啟 RLS，每個人只讀得到自己和好友的資料。
  - 只能傳訊息給好友。
  - 聊天圖片放在私人儲存區，用有時效的連結讀取。
- Google OAuth：
  - 登入只取名字和信箱。
  - 日曆權限 `calendar.readonly` 在設定頁另外連結。
  - 連結失敗時會顯示原因，不會一直重新跳轉。
- 隱私權政策頁 `privacy.html`，Google 正式發布 App 需要這個頁面。

### 上線步驟

- 在 Supabase SQL Editor 執行 `supabase/schema.sql`。
- Google Cloud：
  - 啟用 Calendar API。
  - 設定 OAuth 同意畫面和品牌頁。
  - 建立 Web Client。
- Supabase：
  - 啟用 Google 登入。
  - 設定 Site URL 和 Redirect URLs。
