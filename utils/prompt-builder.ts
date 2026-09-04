export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
}

/** Ne garde que les derniers tours, pour borner le coût et le contexte. */
export function buildConversationHistory(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTurns = 6
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return turns.slice(-maxTurns * 2)
}
