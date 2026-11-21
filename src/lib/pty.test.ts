import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
}))
vi.mock('./platform', () => ({ isDesktop: true }))

import { invoke } from '@tauri-apps/api/core'
import { ptyEnsure } from './pty'

const mockedInvoke = vi.mocked(invoke)

describe('pty commands', () => {
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
  })
})
