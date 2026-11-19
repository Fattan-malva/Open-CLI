import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = path.join(root, 'package.json')
const tauriConfigPath = path.join(root, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml')
const cargoLockPath = path.join(root, 'src-tauri', 'Cargo.lock')

const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Versi package.json tidak valid: ${version}`)
}

function replaceOnce(filePath, pattern, label) {
  const content = readFileSync(filePath, 'utf8')
  if (!pattern.test(content)) {
    throw new Error(`Tidak dapat menyamakan versi di ${label}`)
  }
  writeFileSync(filePath, content.replace(pattern, `$1${version}$2`))
}

replaceOnce(tauriConfigPath, /("version"\s*:\s*")[^"]+(")/, 'tauri.conf.json')
replaceOnce(cargoTomlPath, /(^version\s*=\s*")[^"]+(")/m, 'Cargo.toml')
replaceOnce(
  cargoLockPath,
  /(name = "open-cli"\r?\nversion = ")[^"]+(")/,
  'Cargo.lock'
)

console.log(`Versi tersinkron: ${version}`)
