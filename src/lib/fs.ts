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
