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
}
export type Office = { workers: Worker[]; frame: number; now: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-office': { office: Office }
  }
}
