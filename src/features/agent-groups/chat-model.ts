export type ChatRole = 'user' | 'agent'
export type ChatMessage = { id: string; role: ChatRole; text: string }
export type AgentView = 'terminal' | 'chat'

/** Keeps the transcript bounded so a long-running agent cannot grow memory without limit. */
export const CHAT_LIMIT = 200

function trimmed(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > CHAT_LIMIT ? messages.slice(-CHAT_LIMIT) : messages
}

/**
 * Appends plain agent output. Consecutive output joins the current agent turn; a user
 * message starts a new turn, so each reply reads as one block in the chat view.
 */
export function appendAgentChunk(messages: ChatMessage[], chunk: string): ChatMessage[] {
  if (!chunk) return messages
  const last = messages[messages.length - 1]
  if (last?.role === 'agent') {
    return trimmed([...messages.slice(0, -1), { ...last, text: last.text + chunk }])
  }
  return trimmed([...messages, { id: `agent-${messages.length}-${Date.now()}`, role: 'agent', text: chunk }])
}

export function appendUserMessage(messages: ChatMessage[], text: string): ChatMessage[] {
  return trimmed([...messages, { id: `user-${messages.length}-${Date.now()}`, role: 'user', text }])
}
