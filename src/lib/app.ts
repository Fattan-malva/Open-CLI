import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'

export async function getAppDataPath(): Promise<string | null> {
  if (!isDesktop) return null
  return invoke<string>('app_data_path')
}

export async function getBrowserDataPath(): Promise<string | null> {
  if (!isDesktop) return null
  return invoke<string>('browser_data_path')
}

export async function clearBrowserData(): Promise<void> {
  if (!isDesktop) {
    throw new Error('Hapus data browser hanya tersedia pada aplikasi desktop.')
  }
  await invoke('browser_clear_data')
}

export async function getBrowserSessionOnly(): Promise<boolean> {
  if (!isDesktop) return false
  return invoke<boolean>('browser_session_only_get')
}

export async function setBrowserSessionOnly(enabled: boolean): Promise<void> {
  if (!isDesktop) {
    throw new Error('Pengaturan privasi hanya tersedia pada aplikasi desktop.')
  }
  await invoke('browser_session_only_set', { enabled })
}

export async function uninstallApp(): Promise<void> {
  if (!isDesktop) {
    throw new Error('Uninstall hanya tersedia pada aplikasi desktop.')
  }
  await invoke('app_uninstall', { confirmation: 'UNINSTALL' })
}
