import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'

export type FsEntry = {
  name: string
  path: string
  kind: 'drive' | 'folder'
}

export async function listDrives(): Promise<FsEntry[]> {
  if (!isDesktop) return []

  try {
    return await invoke<FsEntry[]>('fs_list_drives')
  } catch {
    return []
  }
}

export async function listFolders(path: string, query = ''): Promise<FsEntry[]> {
  if (!isDesktop) return []

  try {
    return await invoke<FsEntry[]>('fs_list_folders', { path, query })
  } catch {
    return []
  }
}

export type IdeDirEntry = {
  name: string
  path: string
  kind: 'file' | 'folder'
  size: number
}

export type IdeTextFile = {
  path: string
  content: string
  size: number
  binary: boolean
  truncated: boolean
}

export type IdeTextMatch = {
  path: string
  line: number
  column: number
  preview: string
}

export type IdeFileMatch = {
  name: string
  path: string
}

export async function listIdeDir(path: string): Promise<IdeDirEntry[]> {
  if (!isDesktop) return []

  try {
    return await invoke<IdeDirEntry[]>('ide_fs_list_dir', { path })
  } catch {
    return []
  }
}

export async function readIdeTextFile(path: string): Promise<IdeTextFile | null> {
  if (!isDesktop) return null

  try {
    return await invoke<IdeTextFile>('ide_fs_read_text', { path })
  } catch {
    return null
  }
}

export async function writeIdeTextFile(
  path: string,
  contents: string
): Promise<void> {
  if (!isDesktop) return
  await invoke<void>('ide_fs_write_text', { path, contents })
}

export async function searchIdeText(
  root: string,
  query: string,
  caseSensitive = false,
  limit = 200
): Promise<IdeTextMatch[]> {
  if (!isDesktop || !query.trim()) return []

  try {
    return await invoke<IdeTextMatch[]>('ide_fs_search_text', {
      root,
      query,
      caseSensitive,
      limit,
    })
  } catch {
    return []
  }
}

export async function searchIdeFiles(
  root: string,
  query: string,
  limit = 150
): Promise<IdeFileMatch[]> {
  if (!isDesktop || !query.trim()) return []

  try {
    return await invoke<IdeFileMatch[]>('ide_fs_search_files', {
      root,
      query,
      limit,
    })
  } catch {
    return []
  }
}
