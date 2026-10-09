export type Usage = {
  ctxTokens?: number
  ctxWindow?: number
  ctxPercent?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  costUsd?: number
}
export type Worker = {
  id: string
  session: string
  project: string
  cwd: string
  name: string
  type: string
  description: string
  status: string
  lastTool?: string
  since: number
  usage?: Usage
}
export type Office = { workers: Worker[]; frame: number; now: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-office': { office: Office }
  }
}
