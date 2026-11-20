import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
}))
vi.mock('./platform', () => ({ isDesktop: true }))

import { invoke } from '@tauri-apps/api/core'
import {
  ptyEnsure,
  ptySetActive,
  ptySuspend,
  systemMemoryAvailablePercent,
} from './pty'

const mockedInvoke = vi.mocked(invoke)

describe('pty performance commands', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
  })

  it('uses camelCase Tauri arguments', async () => {
    mockedInvoke.mockResolvedValue(true)
    await ptyEnsure('pty-1', 80, 24, 'powershell.exe', 'C:/repo')
    expect(mockedInvoke).toHaveBeenCalledWith('pty_ensure', {
      id: 'pty-1',
      cols: 80,
      rows: 24,
      shell: 'powershell.exe',
      cwd: 'C:/repo',
    })

    await ptySetActive('pty-1', false)
    expect(mockedInvoke).toHaveBeenCalledWith('pty_set_active', {
      id: 'pty-1',
      active: false,
    })
  })

  it('exposes suspend and memory probes', async () => {
    mockedInvoke.mockResolvedValueOnce(true).mockResolvedValueOnce(42)
    await expect(ptySuspend('pty-1')).resolves.toBe(true)
    await expect(systemMemoryAvailablePercent()).resolves.toBe(42)
  })
})
