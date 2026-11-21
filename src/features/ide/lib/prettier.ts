export type FormatOptions = {
  printWidth: number
  tabWidth: number
  semi: boolean
  singleQuote: boolean
}

export type FormatRequest = {
  id: number
  code: string
  parser: string
  options: FormatOptions
}

export type FormatResponse = {
  id: number
  ok: boolean
  result?: string
  error?: string
}

export function parserForPath(path: string) {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  if (normalized.endsWith('.component.html')) return 'angular'

  const extension = normalized.split('.').pop() ?? ''
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return 'babel'
  if (['ts', 'tsx', 'mts', 'cts'].includes(extension)) return 'typescript'
  if (['json', 'jsonc'].includes(extension)) return 'json'
  if (['html', 'htm', 'vue'].includes(extension)) return 'html'
  if (['css', 'scss', 'less'].includes(extension)) return extension
  if (['md', 'mdx'].includes(extension)) return extension
  if (['yaml', 'yml'].includes(extension)) return 'yaml'
  if (['graphql', 'gql'].includes(extension)) return 'graphql'
  return null
}

export function isFormatSupported(path: string) {
  return parserForPath(path) !== null
}

type Pending = {
  resolve: (value: string) => void
  reject: (error: Error) => void
  timer: number
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker() {
  if (worker) return worker

  worker = new Worker(new URL('../workers/prettier.worker.ts', import.meta.url), {
    type: 'module',
  })

  worker.onmessage = (event: MessageEvent<FormatResponse>) => {
    const response = event.data
    const item = pending.get(response.id)
    if (!item) return
    window.clearTimeout(item.timer)
    pending.delete(response.id)
    if (response.ok && response.result !== undefined) {
      item.resolve(response.result)
    } else {
      item.reject(new Error(response.error ?? 'Format gagal'))
    }
  }

  worker.onerror = () => {
    for (const item of pending.values()) {
      window.clearTimeout(item.timer)
      item.reject(new Error('Prettier worker gagal dimuat'))
    }
    pending.clear()
    worker?.terminate()
    worker = null
  }

  return worker
}

export function formatCode(
  code: string,
  parser: string,
  options: FormatOptions
): Promise<string> {
  const id = nextId++
  const activeWorker = getWorker()

  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('FormatPrettier timeout'))
    }, 15000)

    pending.set(id, { resolve, reject, timer })
    activeWorker.postMessage({ id, code, parser, options } satisfies FormatRequest)
  })
}
