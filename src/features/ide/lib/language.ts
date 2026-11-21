import type { Extension } from '@codemirror/state'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'

function extensionOf(path: string) {
  const normalized = path.replace(/\\/g, '/')
  return (normalized.split('.').pop() ?? '').toLowerCase()
}

export function languageForPath(path: string) {
  const extension = extensionOf(path)
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return 'JavaScript'
  if (['ts', 'tsx', 'mts', 'cts'].includes(extension)) return 'TypeScript'
  if (['json', 'jsonc'].includes(extension)) return 'JSON'
  if (['html', 'htm', 'vue'].includes(extension)) return 'HTML'
  if (['css', 'scss', 'less'].includes(extension)) return 'CSS'
  if (['md', 'mdx'].includes(extension)) return 'Markdown'
  if (['yaml', 'yml'].includes(extension)) return 'YAML'
  if (['graphql', 'gql'].includes(extension)) return 'GraphQL'
  return 'Plain Text'
}

export function languageExtensionForPath(path: string): Extension[] {
  const extension = extensionOf(path)
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) {
    return [javascript({ jsx: true, typescript: false })]
  }
  if (['ts', 'tsx', 'mts', 'cts'].includes(extension)) {
    return [javascript({ jsx: extension === 'tsx', typescript: true })]
  }
  if (['json', 'jsonc'].includes(extension)) return [json()]
  if (['html', 'htm', 'vue'].includes(extension)) return [html()]
  if (['css', 'scss', 'less'].includes(extension)) return [css()]
  if (['md', 'mdx'].includes(extension)) return [markdown()]
  if (['yaml', 'yml'].includes(extension)) return [yaml()]
  return []
}
