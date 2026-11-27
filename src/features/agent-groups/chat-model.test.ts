import { describe, expect, it } from 'vitest'
import { CHAT_LIMIT, appendAgentChunk, appendUserMessage, type ChatMessage } from './chat-model'

describe('chat model', () => {
  it('joins consecutive agent output into one turn', () => {
    const messages = appendAgentChunk(appendAgentChunk([], 'Hello'), ', world')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.text).toBe('Hello, world')
  })

  it('starts a new agent turn after a user message', () => {
    let messages: ChatMessage[] = appendAgentChunk([], 'first')
    messages = appendUserMessage(messages, 'question')
    messages = appendAgentChunk(messages, 'second')
    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['agent', 'first'],
      ['user', 'question'],
      ['agent', 'second'],
    ])
  })

  it('ignores empty chunks and caps the transcript', () => {
    expect(appendAgentChunk([], '')).toEqual([])
    let messages: ChatMessage[] = []
    for (let i = 0; i < CHAT_LIMIT + 5; i += 1) messages = appendUserMessage(messages, String(i))
    expect(messages).toHaveLength(CHAT_LIMIT)
    expect(messages[0]?.text).toBe('5')
  })
})
