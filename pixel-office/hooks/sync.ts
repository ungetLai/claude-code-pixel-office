// State of this session's workers, and the shared folder that joins sessions into one office.
import type { EngineInterface } from 'claude-code'
import type { Usage, Worker } from '../types'

type Ctx = EngineInterface
// `$` may not cross an import, so register.tsx hands this module plain callbacks over it.
export type Io = {
  agents: Ctx['agent']['list']
  now: Ctx['clock']['now']
  usage: Ctx['session']['usage']
  sessionId: Ctx['session']['id']
  model: Ctx['session']['model']
  list: Ctx['fs']['list']
  read: Ctx['fs']['read']
  write: Ctx['fs']['write']
  stat: Ctx['fs']['stat']
}
type PeerFile = { sid?: string; ts: number; workers: Worker[] }

export const SID = Math.random().toString(36).slice(2, 10)
const MAIN = 'main'
const STALE_MS = 6000 // a session that has not written for this long is offline
const HEARTBEAT_MS = 2000 // rewrite our file at least this often
const USAGE_MS = 5000
const NAME_MS = 30000
const DETAIL_MS = 15000 // card-only changes redraw at most this often
const GHOST_MS = 8000 // a worker that just left stays as a dimmed empty desk
const SLOT_FREE_MS = STALE_MS * 2 // a file untouched this long may be taken over by a new session
const MAX_SLOTS = 32
const NAME_MAX_BYTES = 4 * 1024 * 1024
const SLOT_FILE = /^slot-[\w-]+\.json$/

// Last tick-level failure, shown on the desktop surface so a frozen office is not a silent one.
export const diag = { error: '' }

let shareDir = ''
let claudeDir = ''
let project = ''
let cwd = ''

export const configure = (c: { shareDir: string; claudeDir: string; cwd: string; project: string }) => {
  ;({ shareDir, claudeDir, cwd, project } = c)
  slot = ''
  lastPayload = ''
  lastWrite = -Infinity
}

// ───────────── Main agent: derived from tool calls and turns ─────────────
const main = { tools: 0, turn: false, status: 'idle', since: 0, lastTool: undefined as string | undefined }

const settle = (now: number) => {
  const s = main.tools > 0 ? 'running' : main.turn ? 'thinking' : 'idle'
  if (s !== main.status) {
    main.status = s
    main.since = now
  }
}
// Counted, not flagged: with parallel tool calls the first to finish must not put the worker to sleep.
export const toolStart = (tool: string, now: number) => {
  main.tools++
  main.lastTool = tool
  settle(now)
}
export const toolEnd = (now: number) => {
  main.tools = Math.max(0, main.tools - 1)
  settle(now)
}
export const turnState = (on: boolean, now: number) => {
  main.turn = on
  if (!on) main.tools = 0
  settle(now)
}

// Last tool seen per subagent; pruned together with `known`.
const subTool = new Map<string, string>()
export const subagentTool = (id: string, tool: string) => {
  subTool.delete(id)
  subTool.set(id, tool)
  if (subTool.size > 200) subTool.delete(subTool.keys().next().value as string)
}

// ───────────── Usage and session name (both polled slowly) ─────────────
let usage: Usage | undefined
let usageAt = -Infinity
const readUsage = async (io: Io, now: number) => {
  if (now - usageAt < USAGE_MS) return usage
  usageAt = now
  try {
    const u = await io.usage()
    usage = {
      ctxTokens: u.context?.tokens ?? undefined,
      ctxWindow: u.context?.window ?? undefined,
      ctxPercent: u.context?.percent ?? undefined,
      limits: (u.rateLimits ?? []).map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
      costUsd: u.cost?.usd,
    }
  } catch {}
  return usage
}

// /rename lands in the transcript as a `custom-title` entry; the mod has no API for it, so read it there.
// Only look when the file changed, at most every NAME_MS, and keep the last name when it is gone or over 4 MiB.
let sessionName = ''
let nameCheckedAt = -Infinity
let nameMtime = 0
const readSessionName = async (io: Io, now: number) => {
  if (!claudeDir || now - nameCheckedAt < NAME_MS) return
  nameCheckedAt = now
  try {
    const sid = await io.sessionId()
    const file = `${claudeDir}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sid}.jsonl`
    const st = await io.stat(file)
    if (st.mtimeMs === nameMtime) return
    nameMtime = st.mtimeMs
    if (st.size > NAME_MAX_BYTES) return
    const text = await io.read(file)
    const hits = [...text.matchAll(/"customTitle":("(?:[^"\\]|\\.)*")/g)]
    if (hits.length) sessionName = String(JSON.parse(hits[hits.length - 1][1]))
  } catch {}
}

// ───────────── Shared folder ─────────────
// Each live session owns one slot file and rewrites it as a heartbeat. A dead session's file is
// taken over by the next newcomer, so the folder never grows past the number of concurrent sessions.
let slot = ''
let lastPayload = ''
let lastWrite = -Infinity
const peerCache = new Map<string, { mtimeMs: number; data: PeerFile }>()

type Entry = { name: string; kind: string; mtimeMs: number }

export const claimSlot = (files: Entry[], now: number) => {
  const free = files.filter(f => now - f.mtimeMs > SLOT_FREE_MS).sort((a, b) => a.name.localeCompare(b.name))[0]
  if (free) return free.name
  const taken = new Set(files.map(f => f.name))
  for (let i = 0; i < MAX_SLOTS; i++) if (!taken.has(`slot-${i}.json`)) return `slot-${i}.json`
  return `slot-${SID}.json`
}

const parse = (text: string): PeerFile | undefined => {
  try {
    const j = JSON.parse(text)
    return j && Array.isArray(j.workers) && typeof j.ts === 'number' ? j : undefined
  } catch {
    return undefined
  }
}

const share = async (io: Io, mine: Worker[], now: number): Promise<Worker[]> => {
  if (!shareDir) return []
  const entries = (await io.list(shareDir).catch(() => [])) as Entry[]
  const files = entries.filter(f => f.kind === 'file' && SLOT_FILE.test(f.name))
  if (!slot) slot = claimSlot(files, now)

  const payload = JSON.stringify(mine)
  if (payload !== lastPayload || now - lastWrite >= HEARTBEAT_MS) {
    // Two newcomers can pick the same free slot; the one that finds a live stranger in it moves on.
    const cur = files.find(f => f.name === slot)
    if (cur && lastWrite > -Infinity) {
      const j = parse(await io.read(`${shareDir}/${slot}`).catch(() => ''))
      if (j?.sid && j.sid !== SID && now - j.ts <= STALE_MS) slot = claimSlot(files.filter(f => f.name !== slot), now)
    }
    await io.write(`${shareDir}/${slot}`, JSON.stringify({ sid: SID, ts: now, workers: mine }))
    lastPayload = payload
    lastWrite = now
  }

  const peers: Worker[] = []
  const names = new Set<string>()
  for (const f of files) {
    if (f.name === slot) continue
    names.add(f.name)
    if (now - f.mtimeMs > STALE_MS) continue
    let hit = peerCache.get(f.name)
    if (!hit || hit.mtimeMs !== f.mtimeMs) {
      // A half-written file must not make that session vanish for a tick: keep its last good reading.
      const data = parse(await io.read(`${shareDir}/${f.name}`).catch(() => ''))
      if (data) {
        hit = { mtimeMs: f.mtimeMs, data }
        peerCache.set(f.name, hit)
      }
    }
    if (hit && hit.data.sid !== SID && now - hit.data.ts <= STALE_MS * 2 && now - f.mtimeMs <= STALE_MS) peers.push(...hit.data.workers)
  }
  for (const k of peerCache.keys()) if (!names.has(k)) peerCache.delete(k)
  return peers
}

// ───────────── Refresh ─────────────
const known = new Map<string, Worker>() // this session's workers by local id, to keep `since` stable
const seenLive = new Map<string, Worker>()
const ghosts = new Map<string, { w: Worker; until: number }>()
let lastSig = ''
let lastDetail = ''
let lastDraw = -Infinity

// Returns the whole office when it needs redrawing, else undefined.
// Status changes redraw at once; card-only details (last tool, usage, durations, wall clock) are
// throttled, since every redraw swaps the whole SVG image and resets the hover card under the mouse.
export const refresh = async (io: Io, alwaysDraw: boolean): Promise<{ workers: Worker[]; now: number } | undefined> => {
  const list = await io.agents()
  const now = await io.now()
  const u = await readUsage(io, now)
  await readSessionName(io, now)
  const mainName = sessionName || (await io.model().catch(() => '')) || 'Claude'

  const present = new Set<string>([MAIN])
  const mk = (id: string, name: string, type: string, description: string, status: string, lastTool?: string, withUsage = false): Worker => {
    present.add(id)
    const old = known.get(id)
    const since = old && old.status === status ? old.since : now
    const w: Worker = { id: `${SID}:${id}`, session: SID, project, cwd, name, type, description, status, lastTool, since, usage: withUsage ? u : undefined }
    known.set(id, w)
    return w
  }
  const mine: Worker[] = [
    { ...mk(MAIN, mainName, 'main', '主要對話', main.status, main.lastTool, true), since: main.since || now },
    ...list.map(a => mk(a.id, String(a.name ?? a.type ?? 'agent'), String(a.type ?? '-'), String(a.description ?? ''), a.status, subTool.get(a.id))),
  ]
  for (const id of known.keys()) {
    if (present.has(id)) continue
    known.delete(id)
    subTool.delete(id)
  }

  const all: Worker[] = [...(await share(io, mine, now)), ...mine]
  const live = new Set(all.map(w => w.id))
  for (const w of all) {
    ghosts.delete(w.id)
    seenLive.set(w.id, w)
  }
  for (const [id, w] of seenLive) {
    if (live.has(id)) continue
    seenLive.delete(id)
    ghosts.set(id, { w, until: now + GHOST_MS })
  }
  for (const [id, g] of ghosts) {
    if (g.until <= now) ghosts.delete(id)
    else all.push({ ...g.w, status: 'offline', since: g.until - GHOST_MS })
  }

  const sig = JSON.stringify(all.map(w => [w.id, w.name, w.type, w.description, w.status, w.project]))
  const detail = JSON.stringify([
    Math.floor(now / 60000),
    all.map(w => [w.lastTool, w.since, Math.floor((now - w.since) / 60000), w.usage && [w.usage.ctxPercent, w.usage.limits]]),
  ])
  const structural = sig !== lastSig
  if (!alwaysDraw && !structural && (detail === lastDetail || now - lastDraw < DETAIL_MS)) return undefined
  lastSig = sig
  lastDetail = detail
  lastDraw = now
  return { workers: all, now }
}
