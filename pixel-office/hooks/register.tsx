import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Office } from '../types'
import { pruneSeen, renderDesktop } from './desktop'
import type { Io } from './sync'
import { configure, refresh, subagentTool, toolEnd, toolStart, turnState } from './sync'
import { renderTerminal } from './terminal'

const PANE = 'pixel-office'
const office = atom(
  { plugin: 'pixel-office', key: 'office' } as const,
  { workers: [], frame: 0, now: 0 } as Office,
)

let timer: { cancel: () => void } | undefined
let terminalSurface = false
let busy = false

// One tick at a time: a slow disk must not stack refreshes on top of each other.
const ioOf = ($: EngineInterface): Io => ({
  agents: () => $.agent.list(),
  now: () => $.clock.now(),
  usage: args => $.session.usage(args),
  sessionId: () => $.session.id(),
  model: () => $.session.model(),
  list: path => $.fs.list(path),
  read: ((path: string, options?: { as?: 'text' | 'bytes' }) => $.fs.read(path, options as never)) as Io['read'],
  write: (path, text) => $.fs.write(path, text),
  stat: (path, options) => $.fs.stat(path, options),
})

const tick = async ($: EngineInterface) => {
  if (busy) return
  busy = true
  try {
    const r = await refresh(ioOf($), terminalSurface)
    if (!r) return
    pruneSeen(new Set(r.workers.map(w => w.id)))
    await update($, office, (o: Office) => ({ workers: r.workers, frame: o.frame + 1, now: r.now }))
  } catch {
  } finally {
    busy = false
  }
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cwd = await $.session.cwd()
    const project = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
    const root = String($.plugin.root).split('\\').join('/')
    // Loaded from ~/.claude/... the root tells us the home; loaded from the project folder
    // (CLAUDE_CODE_PLUGIN_DIRS) it does not, so ask the environment. No home: no sharing, a solo office.
    const home = root.includes('/.claude/')
      ? root.split('/.claude/')[0]
      : String((await $.env.get('USERPROFILE')) ?? '').split('\\').join('/')
    const claudeDir = home ? `${home}/.claude` : ''
    configure({ shareDir: claudeDir ? `${claudeDir}/pixel-office` : '', claudeDir, cwd, project })
    await $.command.register({ name: 'office', description: '開啟像素辦公室' })
    void $.ui.open({ id: PANE, title: '像素辦公室' })
    await tick($)
    timer?.cancel()
    timer = $.clock.every(1000, () => void tick($))
    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: '像素辦公室' })
    return { text: 'Pixel office opened.' }
  })

  // The main agent is "thinking" between a turn's start and end, "working" while any tool call is in flight.
  on('turn.start', async ($, e, next) => {
    turnState(true, await $.clock.now())
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    turnState(false, await $.clock.now())
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = (e as { agentId?: string }).agentId
    if (id) {
      subagentTool(id, e.tool)
      return next(e)
    }
    toolStart(e.tool, await $.clock.now())
    try {
      return await next(e)
    } finally {
      toolEnd(await $.clock.now())
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    terminalSurface = e.surface === 'terminal'
    const o = await read($, office)
    const ui = $.ui.resolve(e) as any
    if (terminalSurface) return renderTerminal(o, ui)
    return renderDesktop(o, ui, (e.props as { bodyColumns?: number } | undefined)?.bodyColumns ?? 100)
  })
}
