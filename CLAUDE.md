# mod-pixel-office

Claude Code mod:像素辦公室。每個 agent(主控 + subagents)是一個坐在辦公桌前的像素小人,滑鼠移上去顯示狀態卡。
多個 Claude Code session 共用同一間辦公室,依專案資料夾分排。

- Mod 原始碼: `E:\project\mod-pixel-office\pixel-office\`
  - `hooks/register.tsx` — 接線:事件 hook、1 秒輪詢、`ui.render` 分派。`$` 不能跨 import 傳(validate 會擋),所以 `ioOf($)` 把需要的呼叫包成 `Io` 交給 sync.ts
  - `hooks/sync.ts` — 主控狀態(工具計數 + turn → running/thinking/idle)、usage/名稱慢速輪詢、共用資料夾 slot、幽靈桌、重畫判斷
  - `hooks/svg.ts`(匯出入口)、`kit.ts`(常數/像素圖樣)、`desk.ts`、`card.ts`、`room.ts`、`hud.ts`、`desktop.tsx` — 桌面 SVG 辦公室(房間、閒置房間折疊條、用量條);`terminal.tsx` — 終端機半格字元版
  - `hooks/status.ts`、`util.ts` — 狀態表、排座、用量彙整、字串/時間工具
  - `hooks/*.test.ts` — `claude plugin test` 測試;型別檢查: 裝 typescript 後 `tsc -p pixel-office --noEmit`
  - `types/index.d.ts` — `$.state` 型別契約
- 載入: 使用者環境變數 `CLAUDE_CODE_PLUGIN_DIRS` 指向上面的資料夾,新開的 claude 自動載入(舊的終端機需重開)。
  也可手動 `claude --plugin-dir E:\project\mod-pixel-office\pixel-office`
- 開啟: 輸入 `/office`(session 啟動時也會自動開,終端機夠寬才顯示)
- 跨 session 共用資料夾: `C:\Users\Lai\.claude\pixel-office\slot-N.json`,每個活著的 session 佔一個 slot、約 2 秒寫一次心跳,6 秒沒更新視為離線。`$.fs` 無刪檔功能,所以死掉 session 的檔案由新 session 接手重用(檔內 `sid` 衝突時後到者換 slot),資料夾不會無限變大。
- 驗證: `claude plugin validate E:\project\mod-pixel-office\pixel-office`
- 限制: mod 只能畫在 Claude Code 介面內(pane),不能做成覆蓋 OS 桌面的視窗。
- 舊的開發副本 `C:\Users\Lai\.claude\dev-mods\b8eb4ee1-…\pixel-office` 只是原 session 的熱重載資料夾,之後以專案內這份為準。
