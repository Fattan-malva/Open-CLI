import { describe, expect, it } from 'vitest'
import { formatReviewNotes, noteTargetFor, parseUnifiedDiff } from './diff'

const SAMPLE = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index 1111..2222 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -3,3 +3,4 @@',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
  '+const c = 4',
  ' export {}',
].join('\n')

describe('parseUnifiedDiff', () => {
  it('numbers added, removed and context lines against hunk headers', () => {
    const [file] = parseUnifiedDiff(SAMPLE)
    expect(file?.path).toBe('src/app.ts')
    const code = file!.lines.filter((line) => ['add', 'del', 'context'].includes(line.kind))
    expect(code.map((line) => [line.kind, line.oldLine, line.newLine])).toEqual([
      ['context', 3, 3],
      ['del', 4, null],
      ['add', null, 4],
      ['add', null, 5],
      ['context', 5, 6],
    ])
  })

  it('maps each file path from the diff header', () => {
    const files = parseUnifiedDiff(`${SAMPLE}\ndiff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+new`)
    expect(files.map((file) => file.path)).toEqual(['src/app.ts', 'README.md'])
  })
})

describe('noteTargetFor', () => {
  it('uses the new side for additions and the old side for deletions', () => {
    const [file] = parseUnifiedDiff(SAMPLE)
    const del = file!.lines.find((line) => line.kind === 'del')!
    const add = file!.lines.find((line) => line.kind === 'add')!
    expect(noteTargetFor(del)).toEqual({ file: 'src/app.ts', line: 4, side: 'old' })
    expect(noteTargetFor(add)).toEqual({ file: 'src/app.ts', line: 4, side: 'new' })
    expect(noteTargetFor(file!.lines[0]!)).toBeNull()
  })
})

describe('formatReviewNotes', () => {
  it('groups notes by file and orders them by line', () => {
    const prompt = formatReviewNotes(
      [
        { id: '2', file: 'src/app.ts', line: 9, side: 'new', text: 'Rename this' },
        { id: '1', file: 'src/app.ts', line: 4, side: 'new', text: 'Add a test' },
      ],
      'Wire notes'
    )
    expect(prompt).toContain('Review feedback for task "Wire notes".')
    expect(prompt.indexOf('line 4')).toBeLessThan(prompt.indexOf('line 9'))
    expect(prompt.match(/File: src\/app\.ts/g)).toHaveLength(1)
  })
})
