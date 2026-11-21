import AdmZip from 'adm-zip'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/material-icon-theme')
const materialIconsDir = resolve(root, 'src/assets/material-icon-theme')
const materialIconsArchive = resolve(
  materialIconsDir,
  'material-icons.zip'
)
const extractedIconsDir = resolve(materialIconsDir, 'icons')
const markerPath = resolve(extractedIconsDir, '.archive-key')

function archiveKey() {
  const stat = statSync(materialIconsArchive)
  return `${stat.size}-${Math.floor(stat.mtimeMs)}`
}

export function extractMaterialIcons() {
  if (!existsSync(materialIconsArchive)) return

  const key = archiveKey()
  if (
    existsSync(markerPath) &&
    readFileSync(markerPath, 'utf8') === key &&
    existsSync(resolve(extractedIconsDir, 'folder.svg'))
  ) {
    return
  }

  rmSync(extractedIconsDir, { recursive: true, force: true })
  mkdirSync(extractedIconsDir, { recursive: true })
  new AdmZip(materialIconsArchive).extractAllTo(materialIconsDir, true)
  writeFileSync(markerPath, key)
}

export function createMaterialIconsArchive() {
  const iconsSource = resolve(source, 'icons')
  if (!existsSync(iconsSource)) {
    throw new Error(
      'material-icon-theme belum terpasang. Jalankan pnpm install dulu.'
    )
  }

  mkdirSync(materialIconsDir, { recursive: true })
  const zip = new AdmZip()
  zip.addLocalFolder(iconsSource, 'icons')
  zip.writeZip(materialIconsArchive)

  copyFileSync(
    resolve(source, 'dist/material-icons.json'),
    resolve(materialIconsDir, 'material-icons.json')
  )
  copyFileSync(resolve(source, 'LICENSE'), resolve(materialIconsDir, 'LICENSE'))

  rmSync(markerPath, { force: true })
  extractMaterialIcons()
}
