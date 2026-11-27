export type DiffLineKind = 'add' | 'del' | 'context' | 'hunk' | 'meta'

export type DiffLine = {
  key: string
  kind: DiffLineKind
  text: string
  file: string
  oldLine: number | null
  newLine: number | null
}

export type DiffFile = {
  path: string
  lines: DiffLine[]
}

/** The line a note refers to: new-side line for additions/context, old-side for deletions. */
export type NoteTarget = {
  file: string
  line: number
  side: 'new' | 'old'
}

export type ReviewNote = NoteTarget & {
  id: string
  text: string
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Parses `git diff` unified output into files with per-line numbering. */
export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  let oldLine = 0
  let newLine = 0
  let index = 0

  const push = (kind: DiffLineKind, text: string, oldNo: number | null, newNo: number | null) => {
    if (!current) return
    current.lines.push({
      key: `${current.path}:${index}`,
      kind,
      text,
      file: current.path,
      oldLine: oldNo,
      newLine: newNo,
    })
    index += 1
  }

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw)
      current = { path: match?.[2] ?? raw, lines: [] }
      files.push(current)
      continue
    }
    if (!current) continue
    const hunk = HUNK.exec(raw)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      push('hunk', raw, null, null)
      continue
    }
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('index ') || raw.startsWith('new file') || raw.startsWith('deleted file') || raw.startsWith('similarity') || raw.startsWith('rename ')) {
      push('meta', raw, null, null)
      continue
    }
    if (raw.startsWith('+')) {
      push('add', raw.slice(1), null, newLine)
      newLine += 1
    } else if (raw.startsWith('-')) {
      push('del', raw.slice(1), oldLine, null)
      oldLine += 1
    } else if (raw.startsWith(' ')) {
      push('context', raw.slice(1), oldLine, newLine)
      oldLine += 1
      newLine += 1
    } else if (raw.startsWith('\\')) {
      push('meta', raw, null, null)
    }
  }
  return files
}

/** Notes attach to a line the reviewer can point at: additions and context use the new side, deletions the old side. */
export function noteTargetFor(line: DiffLine): NoteTarget | null {
  if (line.kind === 'add' || line.kind === 'context') {
    return line.newLine === null ? null : { file: line.file, line: line.newLine, side: 'new' }
  }
  if (line.kind === 'del') {
    return line.oldLine === null ? null : { file: line.file, line: line.oldLine, side: 'old' }
  }
  return null
}

/** Builds the prompt that is sent to an agent. Notes are grouped by file and ordered by line. */
export function formatReviewNotes(notes: ReviewNote[], taskTitle: string): string {
  const sorted = [...notes].sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file)
    if (a.side !== b.side) return a.side === 'new' ? -1 : 1
    return a.line - b.line
  })
  const lines: string[] = [
    `Review feedback for task "${taskTitle}".`,
    'Address each note below in the workspace, then report what changed.',
    '',
  ]
  let currentFile = ''
  for (const note of sorted) {
    if (note.file !== currentFile) {
      currentFile = note.file
      lines.push(`File: ${currentFile}`)
    }
    const side = note.side === 'new' ? 'line' : 'removed line'
    lines.push(`- ${side} ${note.line}: ${note.text.trim()}`)
  }
  return lines.join('\n')
}
