# mod-pixel-office

Claude Code mod:像素辦公室。每個 agent(主控 + subagents)是一個坐在辦公桌前的像素小人,滑鼠移上去顯示狀態卡。
多個 Claude Code session 共用同一間辦公室,依專案資料夾分排。

- Mod 原始碼: `E:\project\mod-pixel-office\pixel-office\`
  - `hooks/register.tsx` — 主要邏輯(輪詢 `$.agent.list()`、`tool.call` 追蹤、寫/讀共用資料夾、`ui.render` 畫 Pane)
  - `types/index.d.ts` — `$.state` 型別契約
- 載入: 使用者環境變數 `CLAUDE_CODE_PLUGIN_DIRS` 指向上面的資料夾,新開的 claude 自動載入(舊的終端機需重開)。
  也可手動 `claude --plugin-dir E:\project\mod-pixel-office\pixel-office`
- 開啟: 輸入 `/office`(session 啟動時也會自動開,終端機夠寬才顯示)
- 跨 session 共用資料夾: `C:\Users\Lai\.claude\pixel-office\<sessionId>.json`,6 秒沒更新視為離線。`$.fs` 無刪檔功能,舊檔會留著但被忽略。
- 驗證: `claude plugin validate E:\project\mod-pixel-office\pixel-office`
- 限制: mod 只能畫在 Claude Code 介面內(pane),不能做成覆蓋 OS 桌面的視窗。
- 舊的開發副本 `C:\Users\Lai\.claude\dev-mods\b8eb4ee1-…\pixel-office` 只是原 session 的熱重載資料夾,之後以專案內這份為準。
