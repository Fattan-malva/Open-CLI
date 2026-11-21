import manifestJson from '../../../assets/material-icon-theme/material-icons.json'

type IconDefinition = {
  iconPath?: string
}

type IconMap = Record<string, string>

type Manifest = {
  iconDefinitions: Record<string, IconDefinition>
  fileNames: IconMap
  fileExtensions: IconMap
  folderNames: IconMap
  folderNamesExpanded: IconMap
  rootFolderNames: IconMap
  rootFolderNamesExpanded: IconMap
  light?: {
    fileNames: IconMap
    fileExtensions: IconMap
    folderNames: IconMap
    folderNamesExpanded: IconMap
  }
}

const manifest = manifestJson as Manifest
const iconModules = import.meta.glob<string>(
  '../../../assets/material-icon-theme/icons/*.svg',
  { eager: true, query: '?url', import: 'default' }
)

const iconUrls = new Map(
  Object.entries(iconModules).map(([path, url]) => [
    path.split('/').pop() ?? path,
    url,
  ])
)

const cache = new Map<string, string>()

function isLightTheme() {
  if (typeof document === 'undefined') return false
  return !document.documentElement.classList.contains('dark')
}

function lookup(map: IconMap, value: string) {
  return map[value.toLowerCase()]
}

function findExtensionIcon(map: IconMap, name: string) {
  const lower = name.toLowerCase()
  let dot = lower.indexOf('.')
  while (dot !== -1) {
    const extension = lower.slice(dot + 1)
    const icon = map[extension]
    if (icon) return icon
    dot = lower.indexOf('.', dot + 1)
  }
  return undefined
}

function iconUrlForId(id: string | undefined, fallback: string) {
  if (!id) return iconUrls.get(fallback) ?? ''
  const definition = manifest.iconDefinitions[id]
  const path = definition?.iconPath
  const fileName = path?.split('/').pop()
  return (fileName && iconUrls.get(fileName)) || iconUrls.get(fallback) || ''
}

function resolveMaterialIcon(
  name: string,
  options: { isFolder?: boolean; expanded?: boolean } = {}
) {
  const light = isLightTheme()
  const lightMap = light ? manifest.light : undefined
  const cacheKey = `${name}|${options.isFolder ? 'folder' : 'file'}|${
    options.expanded ? 'open' : 'closed'
  }|${light ? 'light' : 'dark'}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  let iconId: string | undefined

  if (options.isFolder) {
    const folderMap = lightMap?.folderNames ?? manifest.folderNames
    const expandedMap =
      lightMap?.folderNamesExpanded ?? manifest.folderNamesExpanded
    iconId = lookup(options.expanded ? expandedMap : folderMap, name)
      ?? lookup(folderMap, name)
  } else {
    const fileNames = lightMap?.fileNames ?? manifest.fileNames
    const extensions = lightMap?.fileExtensions ?? manifest.fileExtensions
    iconId = lookup(fileNames, name) ?? findExtensionIcon(extensions, name)
  }

  const url = iconUrlForId(
    iconId,
    options.isFolder
      ? options.expanded
        ? 'folder-open.svg'
        : 'folder.svg'
      : 'file.svg'
  )
  cache.set(cacheKey, url)
  return url
}

type MaterialIconProps = {
  name: string
  isFolder?: boolean
  expanded?: boolean
  className?: string
}

export function MaterialIcon({
  name,
  isFolder = false,
  expanded = false,
  className = 'size-4',
}: MaterialIconProps) {
  return (
    <img
      src={resolveMaterialIcon(name, { isFolder, expanded })}
      alt=''
      aria-hidden='true'
      className={`${className} shrink-0 object-contain`}
    />
  )
}
