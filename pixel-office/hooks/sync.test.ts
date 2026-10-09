import { expect, test } from 'claude-code/testing'
import type { Io } from './sync'
import { claimSlot, configure, refresh, toolEnd, toolStart, turnState } from './sync'

// An in-memory shared folder plus a clock we move by hand.
const makeIo = (files: Map<string, { text: string; mtimeMs: number }>, clock: { t: number }): Io => ({
  agents: async () => [],
  now: async () => clock.t,
  usage: (async () => ({ startedAt: 0, context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [] })) as unknown as Io['usage'],
  sessionId: async () => 'sid',
  model: async () => 'model',
  list: (async () => [...files].map(([name, f]) => ({ name: name.split('/').pop()!, kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false }))) as unknown as Io['list'],
  read: (async (p: string) => {
    const f = files.get(p)
    if (!f) throw new Error('ENOENT')
    return f.text
  }) as unknown as Io['read'],
  write: async (p, text) => void files.set(p, { text, mtimeMs: clock.t }),
  stat: (async () => { throw new Error('ENOENT') }) as unknown as Io['stat'],
})

test('parallel tool calls keep the main agent running until the last one ends', async () => {
  configure({ shareDir: '', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const status = async (t: number) => (await refresh(makeIo(new Map(), { t }), true))!.workers.find(w => w.type === 'main')!.status
  turnState(true, 1)
  expect(await status(1)).toBe('thinking')
  toolStart('Read', 2)
  toolStart('Grep', 2)
  toolEnd(3)
  expect(await status(3)).toBe('running')
  toolEnd(4)
  expect(await status(4)).toBe('thinking')
  turnState(false, 5)
  expect(await status(5)).toBe('idle')
})

test('a dead session\'s file is taken over instead of piling up', async () => {
  configure({ shareDir: 'd', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const files = new Map([['d/slot-0.json', { text: '{}', mtimeMs: 0 }]])
  await refresh(makeIo(files, { t: 100000 }), true)
  expect(files.size).toBe(1)
  expect(files.get('d/slot-0.json')!.text).toContain('workers')
})

test('a peer\'s half-written file keeps its last good reading', async () => {
  configure({ shareDir: 'd', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const peer = { sid: 'peer', ts: 200000, workers: [{ id: 'peer:main', session: 'peer', project: 'q', cwd: 'C:/q', name: 'q', type: 'main', description: '', status: 'idle', since: 0 }] }
  const files = new Map([['d/slot-9.json', { text: JSON.stringify(peer), mtimeMs: 200000 }]])
  const clock = { t: 200000 }
  const io = makeIo(files, clock)
  const first = await refresh(io, true)
  expect(first!.workers.some(w => w.id === 'peer:main')).toBe(true)
  files.set('d/slot-9.json', { text: '{"sid":"peer","ts":2', mtimeMs: 201000 })
  clock.t = 201000
  const second = await refresh(io, true)
  expect(second!.workers.some(w => w.id === 'peer:main')).toBe(true)
})

test('only slot-*.json files are slots; stray json files are left alone', async () => {
  configure({ shareDir: 'd', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const files = new Map([['d/notes.json', { text: 'keep', mtimeMs: 0 }]])
  await refresh(makeIo(files, { t: 100000 }), true)
  expect(files.get('d/notes.json')!.text).toBe('keep')
  expect([...files.keys()].some(k => /slot-/.test(k))).toBe(true)
})

test('claimSlot takes over a stale slot, else the lowest free number', () => {
  const e = (name: string, mtimeMs: number) => ({ name, kind: 'file', mtimeMs })
  expect(claimSlot([e('slot-0.json', 100000), e('slot-1.json', 0)], 100000)).toBe('slot-1.json')
  expect(claimSlot([e('slot-0.json', 100000), e('slot-2.json', 100000)], 100000)).toBe('slot-1.json')
})

test('a transcript over the size cap is not read for the session name', async () => {
  configure({ shareDir: '', claudeDir: 'c', cwd: 'C:/p', project: 'p' })
  let reads = 0
  const io = makeIo(new Map(), { t: 1e6 })
  io.stat = (async () => ({ mtimeMs: 5, size: 50 * 1024 * 1024 })) as unknown as Io['stat']
  io.read = (async () => { reads++; return '' }) as unknown as Io['read']
  await refresh(io, true)
  expect(reads).toBe(0)
})

test('subagents do not carry a copy of the usage', async () => {
  configure({ shareDir: '', claudeDir: '', cwd: 'C:/p', project: 'p' })
  const io = makeIo(new Map(), { t: 2e6 })
  io.agents = (async () => [{ id: 'a1', name: 'sub', type: 'Explore', status: 'running' }]) as unknown as Io['agents']
  const ws = (await refresh(io, true))!.workers
  expect(ws.find(w => w.type === 'main')!.usage).toBeDefined()
  expect(ws.find(w => w.id.endsWith(':a1'))!.usage).toBeUndefined()
})
