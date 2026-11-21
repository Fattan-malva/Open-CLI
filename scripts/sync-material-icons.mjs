import { copyFileSync, cpSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/material-icon-theme')
const target = resolve(root, 'src/assets/material-icon-theme')

mkdirSync(target, { recursive: true })
cpSync(resolve(source, 'icons'), resolve(target, 'icons'), {
  recursive: true,
  force: true,
})
copyFileSync(
  resolve(source, 'dist/material-icons.json'),
  resolve(target, 'material-icons.json')
)
copyFileSync(resolve(source, 'LICENSE'), resolve(target, 'LICENSE'))
