import { expect, test } from 'claude-code/testing'
import type { Worker } from '../types'
import { groupByRoom } from './status'
import { wrap } from './util'

const w = (id: string, cwd: string): Worker => ({ id, session: 's', project: 'app', cwd, name: id, type: 'main', description: '', status: 'idle', since: 0 })

test('rooms with the same folder name keep a stable order by path', () => {
  const a = groupByRoom([w('1', 'C:/b/app'), w('2', 'C:/a/app')])
  const b = groupByRoom([w('2', 'C:/a/app'), w('1', 'C:/b/app')])
  expect(a.map(g => g[0].cwd)).toEqual(['C:/a/app', 'C:/b/app'])
  expect(b.map(g => g[0].cwd)).toEqual(['C:/a/app', 'C:/b/app'])
})

test('wrap adds an ellipsis only when text was really cut', () => {
  expect(wrap('a   b', 10, 2)).toEqual(['a b'])
  expect(wrap('abcdefghij', 5, 2)).toEqual(['abcde', 'fghij'])
  expect(wrap('abcdefghijklm', 5, 2)[1].endsWith('…')).toBe(true)
})
