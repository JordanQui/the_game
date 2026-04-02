export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '')
}

export function buildSystemPrompt(options: {
  worldSystemPrompt: string
  playerName: string
  worldName: string
  worldDescription: string
  questTitle: string
  questObjective: string
  npcNamesAndArchetypes: string
}): string {
  return `${options.worldSystemPrompt}

Joueur : ${options.playerName}
Royaume : ${options.worldName} — ${options.worldDescription}
Lieu actuel : L'Auberge du Bout du Monde
Quête : ${options.questTitle} — ${options.questObjective}
Personnages présents : ${options.npcNamesAndArchetypes}

Règles absolues :
- Réponds toujours en français
- Ne dépasse pas 150 mots sauf pour la narration d'ouverture
- Ne brise jamais le quatrième mur
- Ne mentionne jamais que tu es une IA`
}

export function buildConversationHistory(
  turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTurns = 6
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return turns.slice(-maxTurns * 2)
}
