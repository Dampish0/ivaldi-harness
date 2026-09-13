import { z } from 'zod';
import type { Message, ModelSelection, Session } from './schema';

const modelChoiceSchema = z.object({ providerID: z.string(), modelID: z.string(), variant: z.string().optional() });
const choiceSchema = z.object({ model: modelChoiceSchema.nullable(), agent: z.string() });
export type ChatChoice = { model: ModelSelection | null; agent: string };
export type ChatChoices = { [sessionId: string]: ChatChoice };
export const chatSelectionSchema = z.object({
  activeId: z.string().nullable().default(null),
  model: modelChoiceSchema.nullable(),
  agent: z.string(),
  sessionChoices: z.record(z.string(), choiceSchema).default({}),
});

export function rememberChatChoice(choices: ChatChoices, sessionId: string | null, choice: ChatChoice) {
  return { ...choices, [sessionId ?? 'new']: choice };
}

/** The legacy model/agent pair belongs to its saved active chat, not every chat. */
export function restoreChatChoices(saved: z.infer<typeof chatSelectionSchema>): ChatChoices {
  const key = saved.activeId ?? 'new';
  if (saved.sessionChoices[key] || !saved.model && !saved.agent) return saved.sessionChoices;
  return rememberChatChoice(saved.sessionChoices, saved.activeId, { model: saved.model, agent: saved.agent });
}

/** Device choices win. Missing fields may come from explicit server metadata or user turns. */
export function sessionChatChoice(sessionId: string, choices: ChatChoices, session: Session | undefined, messages: Message[]): ChatChoice {
  const saved = choices[sessionId];
  let latestUser: Message['info'] | undefined;
  for (const message of messages) {
    if (message.info.role === 'user' && (!latestUser || message.info.time.created >= latestUser.time.created)) latestUser = message.info;
  }
  return {
    model: saved?.model ?? (session?.model ? { providerID: session.model.providerID, modelID: session.model.id, variant: session.model.variant } : latestUser?.model ?? null),
    agent: saved?.agent || session?.agent || latestUser?.agent || '',
  };
}
