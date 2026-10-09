# mod-pixel-office

Claude Code mod:像素辦公室。每個 agent(主控 + subagents)是一個坐在辦公桌前的像素小人,滑鼠移上去顯示狀態卡。
多個 Claude Code session 共用同一間辦公室,依專案資料夾分排。

```
claude-code-pixel-office/
├─ README.md
├─ CLAUDE.md
└─ pixel-office/            ← 真正的 mod(plugin)資料夾
   ├─ .claude-plugin/plugin.json
   ├─ hooks/                ← register.tsx(接線)、sync.ts(狀態/同步)、svg/desktop/terminal(繪圖)
   └─ types/index.d.ts
```

## 🚀 快速安裝(給夥伴:複製提示詞貼進 Claude Code 即可)

前提:已安裝支援 mod / plugin 的 Claude Code(終端機執行 `claude --version` 有輸出),且電腦有 `git`。

開一個 Claude Code,把下面整段貼進去送出,Claude 會自動完成安裝:

````text
請幫我安裝「像素辦公室」Claude Code mod,依序執行,每步完成後簡短回報:

1. 判斷我的作業系統(Windows / macOS / Linux)。
2. 把 https://github.com/ungetLai/claude-code-pixel-office.git clone 到我的家目錄下(`~/claude-code-pixel-office`;Windows 即 `%USERPROFILE%\claude-code-pixel-office`)。如果資料夾已存在且是這個 repo,改成在裡面執行 `git pull`,不要覆蓋。
3. 記下其中 `pixel-office` 子資料夾的「絕對路徑」,稱為 MOD_DIR(必須是含有 `.claude-plugin/plugin.json` 的那一層,不是 repo 根目錄)。
4. 執行 `claude plugin validate <MOD_DIR>`,若失敗請告訴我原因並停止。
5. 永久載入:把 MOD_DIR 加入使用者環境變數 `CLAUDE_CODE_PLUGIN_DIRS`。
   - 先讀取目前的值;若已有其他路徑就用分隔符串接並保留原值(Windows 用 `;`,macOS/Linux 用 `:`),若 MOD_DIR 已在其中就不要重複加入。
   - Windows:用 PowerShell `[Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', '<新值>', 'User')`。
   - macOS/Linux:在目前使用的 shell 設定檔(`~/.zshrc` 或 `~/.bashrc`)加一行 `export CLAUDE_CODE_PLUGIN_DIRS="<新值>"`,不要重複加。
   - 動手前先告訴我你要改哪個變數/檔案、改成什麼值。
6. 最後告訴我:請「關閉所有終端機並重新開啟」,再執行 `claude`;辦公室會在 session 啟動時自動出現(終端機要夠寬),也可以輸入 `/office` 手動開啟。
   若想先不重開就試用,可改用 `claude --plugin-dir <MOD_DIR>` 啟動。

不要修改 repo 內的任何程式碼。
````

> 更新 mod:在 `~/claude-code-pixel-office` 內執行 `git pull`,重開 `claude` 即可。
> 解除安裝:從 `CLAUDE_CODE_PLUGIN_DIRS` 移除該路徑並重開終端機。

## 手動安裝

### 1. Clone

```bash
git clone https://github.com/ungetLai/claude-code-pixel-office.git
```

記下 `pixel-office` 子資料夾的**絕對路徑**,下面稱為 `<MOD_DIR>`,例如 `D:\work\claude-code-pixel-office\pixel-office`。

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

- 滑鼠移到小人上顯示狀態卡:名稱、專案、類型、狀態(執行中 / 思考中 / 閒置)、任務、最近工具,以及該 session 的 Context 用量、方案額度(5h/7d)與費用。辦公室頂端有總覽列(額度 + 所有 session 總費用)。額度只有訂閱方案才有資料;用量為 session 層級,無法細分到單一 subagent。
- 多個 session 依專案資料夾分排成房間;整間閒置的房間會折疊成一條。
- 跨 session 共用資料夾:`~/.claude/pixel-office/slot-N.json`(Windows 為 `C:\Users\<你>\.claude\pixel-office\`)。每個活著的 session 佔一個 slot,約 2 秒寫一次心跳,6 秒沒更新視為離線。
  `$.fs` 無刪檔功能,所以死掉 session 的檔案由新 session 接手重用,資料夾不會無限變大。
  同一台電腦上所有載入此 mod 的 session 都會共用同一間辦公室(不同電腦不會互通)。
- 限制:mod 只能畫在 Claude Code 介面內(pane),不能做成覆蓋 OS 桌面的視窗。

## 開發

- 驗證:`claude plugin validate <MOD_DIR>`;測試:`claude plugin test <MOD_DIR>`
- 型別檢查:裝 typescript 後 `tsc -p pixel-office --noEmit`
- 模組分工見 `CLAUDE.md`。

## 疑難排解

| 現象 | 處理 |
|---|---|
| 沒出現辦公室 | 終端機太窄請拉寬;或輸入 `/office` |
| 環境變數設了沒作用 | 已開著的終端機不會更新,需重開 |
| 看不到其他 session 的人 | 對方 session 也要載入此 mod,且是在設定好環境變數「之後」才開的;離線超過 6 秒的不會顯示 |
| `plugin validate` 失敗 | 確認路徑指到 `pixel-office` 子資料夾(內含 `.claude-plugin/plugin.json`),而非 repo 根目錄 |
| `claude plugin` 指令不存在 | Claude Code 版本太舊,請先升級 |
