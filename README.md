# mod-pixel-office

Claude Code mod:像素辦公室。每個 agent(主控 + subagents)是一個坐在辦公桌前的像素小人,滑鼠移上去顯示狀態卡。
多個 Claude Code session 共用同一間辦公室,依專案資料夾分排。

```
claude-code-pixel-office/
├─ README.md
├─ CLAUDE.md
└─ pixel-office/            ← 真正的 mod(plugin)資料夾
   ├─ .claude-plugin/plugin.json
   ├─ hooks/hooks.json
   ├─ hooks/register.tsx    ← 主要邏輯
   └─ types/index.d.ts
```

## 安裝(給 Claude / 人類照著做)

> 前提:已安裝支援 mod / plugin 的 Claude Code(`claude --version` 可執行),且有 git。

### 1. Clone

```bash
git clone https://github.com/ungetLai/claude-code-pixel-office.git
```

記下 `pixel-office` 子資料夾的**絕對路徑**,下面稱為 `<MOD_DIR>`,例如 `D:\work\mod-pixel-office\pixel-office`。

### 2. 驗證(可選)

```bash
claude plugin validate <MOD_DIR>
```

### 3. 載入方式(二選一)

**A. 臨時載入(測試用)**

```bash
claude --plugin-dir <MOD_DIR>
```

**B. 永久載入(推薦):設定使用者環境變數 `CLAUDE_CODE_PLUGIN_DIRS`**

- Windows(PowerShell):
  ```powershell
  [Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', '<MOD_DIR>', 'User')
  ```
  若已有其他 plugin 路徑,用 `;` 串接(macOS/Linux 用 `:`)。設定後**重開終端機**。
- macOS / Linux:在 `~/.bashrc` 或 `~/.zshrc` 加
  ```bash
  export CLAUDE_CODE_PLUGIN_DIRS="<MOD_DIR>"
  ```

### 4. 使用

重新開啟 `claude`,session 啟動時會自動開啟辦公室(終端機夠寬才會顯示)。
手動開啟:輸入 `/office`。

## 運作說明

- 每個 session 每秒把自己的 agent 狀態寫到共用資料夾 `<sessionId>.json`,同時讀取其他 session 的檔案合併顯示。
- 超過 6 秒沒更新視為離線(舊檔會留著但被忽略,`$.fs` 無刪檔功能)。
- 共用資料夾位置:由 plugin 根目錄推得 —— 若路徑含 `/.claude/` 則為其前面的 `.claude/pixel-office`,否則為 `<MOD_DIR>/.claude/pixel-office`(已被 .gitignore 排除)。
  同一台電腦上所有 session 都載入同一份 `<MOD_DIR>`,所以會共用同一間辦公室。
- 限制:mod 只能畫在 Claude Code 介面內(pane),不能做成覆蓋 OS 桌面的視窗。

## 疑難排解

| 現象 | 處理 |
|---|---|
| 沒出現辦公室 | 終端機太窄請拉寬;或輸入 `/office` |
| 環境變數設了沒作用 | 已開著的終端機不會更新,需重開 |
| 看不到其他 session 的人 | 確認各 session 都用同一個 `<MOD_DIR>` 載入 |
| `plugin validate` 失敗 | 確認路徑指到 `pixel-office` 子資料夾(內含 `.claude-plugin/plugin.json`),而非 repo 根目錄 |
