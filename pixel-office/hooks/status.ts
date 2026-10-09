import type { Usage, Worker } from '../types'

export const STATUS: Record<string, { label: string; color: string }> = {
  running: { label: '工作中', color: '#4ade80' },
  thinking: { label: '思考中', color: '#a78bfa' },
  pending: { label: '待命(排隊中)', color: '#facc15' },
  waiting: { label: '等待回應', color: '#facc15' },
  idle: { label: '閒置', color: '#94a3b8' },
  completed: { label: '已完成', color: '#60a5fa' },
  failed: { label: '失敗', color: '#f87171' },
  killed: { label: '已終止', color: '#f87171' },
  offline: { label: '已離開', color: '#64748b' },
}

export const SHORT: Record<string, string> = {
  running: '工作中', thinking: '思考中', pending: '待命', waiting: '等待中', idle: '閒置', completed: '完成', failed: '失敗', killed: '終止', offline: '離開',
}

export const statusOf = (s: string) => STATUS[s] ?? STATUS.idle

// Statuses where something is going on (or went wrong); rooms with none of these may be collapsed.
export const isActive = (s: string) => s === 'running' || s === 'thinking' || s === 'pending' || s === 'waiting' || s === 'failed' || s === 'killed'

// Stable seating: by session, main first, then id. Sorting by `since` made desks swap places on every status change.
export const deskOrder = (a: Worker, b: Worker) =>
  a.session.localeCompare(b.session) || (a.type === 'main' ? -1 : 0) - (b.type === 'main' ? -1 : 0) || a.id.localeCompare(b.id)

export type Limit = Usage['limits'][number]

// Plan limits are account-wide, so take the highest reading per kind across sessions.
export const summarizeUsage = (workers: Worker[]) => {
  const bySession = new Map<string, Worker>()
  for (const w of workers) if (w.usage && w.status !== 'offline' && !bySession.has(w.session)) bySession.set(w.session, w)
  const limits = new Map<string, Limit>()
  for (const w of bySession.values()) {
    for (const l of w.usage!.limits) {
      const cur = limits.get(l.kind)
      if (!cur || l.percentUsed > cur.percentUsed) limits.set(l.kind, l)
    }
  }
  return { sessions: [...bySession.values()], limits: [...limits.values()] }
}

export const groupByRoom = (workers: Worker[]) => {
  const groups = new Map<string, Worker[]>()
  for (const w of workers) {
    const g = groups.get(w.cwd)
    if (g) g.push(w)
    else groups.set(w.cwd, [w])
  }
  return [...groups.values()].sort((a, b) => a[0].project.localeCompare(b[0].project) || a[0].cwd.localeCompare(b[0].cwd))
}
