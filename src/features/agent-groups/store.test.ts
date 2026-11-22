import { describe, expect, it } from 'vitest'
import { cleanOutputChunk } from './store'

describe('cleanOutputChunk', () => {
  it('removes colour and cursor codes', () => {
    expect(cleanOutputChunk('\x1b[31mred\x1b[0m text')).toBe('red text')
  })

  it('removes OSC sequences such as window titles', () => {
    expect(cleanOutputChunk('\x1b]0;title\x07ready')).toBe('ready')
  })

  it('drops carriage returns that are not part of a line ending', () => {
    expect(cleanOutputChunk('line\rover\r\nnext')).toBe('lineover\r\nnext')
  })
})
