import { z } from 'zod';

const id = z.string().min(1);
export const sessionSchema = z.object({
  id, title: z.string(), directory: z.string(), parentID: id.optional(),
  agent: z.string().optional(), model: z.object({ id: z.string(), providerID: z.string(), variant: z.string().optional() }).optional(),
  time: z.object({ created: z.number(), updated: z.number(), archived: z.number().optional() }),
});
export type Session = z.infer<typeof sessionSchema>;
export const messageInfoSchema = z.object({ id, sessionID: id, role: z.enum(['user', 'assistant']), time: z.object({ created: z.number(), completed: z.number().optional() }), agent: z.string().optional(), model: z.object({ providerID: z.string(), modelID: z.string(), variant: z.string().optional() }).optional() });
const basePart = z.object({ id, messageID: id, sessionID: id });
export const partSchema = z.discriminatedUnion('type', [
  basePart.extend({ type: z.literal('text'), text: z.string(), synthetic: z.boolean().optional(), ignored: z.boolean().optional() }),
  basePart.extend({ type: z.literal('reasoning'), text: z.string() }),
  basePart.extend({ type: z.literal('file'), mime: z.string(), filename: z.string().optional(), url: z.string() }),
  basePart.extend({ type: z.literal('tool'), tool: z.string(), callID: z.string(), state: z.object({ status: z.enum(['pending', 'running', 'completed', 'error']), title: z.string().optional(), input: z.json().optional(), output: z.string().optional(), error: z.string().optional() }) }),
]);
const messageWireSchema = z.object({ info: messageInfoSchema, parts: z.array(z.json()) });
export const messagesSchema = z.array(messageWireSchema).transform(messages => messages.map(message => ({ info: message.info, parts: message.parts.flatMap(part => { const parsed = partSchema.safeParse(part); return parsed.success ? [parsed.data] : []; }) })));
export type Message = z.infer<typeof messagesSchema>[number];
export type Part = z.infer<typeof partSchema>;
export const modelSchema = z.object({ id, name: z.string(), providerID: z.string().optional(), variants: z.record(z.string(), z.json()).optional() });
export const providersSchema = z.object({ all: z.array(z.object({ id, name: z.string(), models: z.record(z.string(), modelSchema) })), connected: z.array(z.string()), default: z.record(z.string(), z.string()) });
export type ModelChoice = { id: string; providerID: string; provider: string; name: string; variants: string[] };
export type ModelSelection = { providerID: string; modelID: string; variant?: string };
export const agentSchema = z.object({ name: z.string(), mode: z.enum(['subagent', 'primary', 'all']), hidden: z.boolean().optional(), description: z.string().optional() });
export const permissionSchema = z.object({ id, sessionID: id, permission: z.string(), patterns: z.array(z.string()) });
export const questionSchema = z.object({ id, sessionID: id, questions: z.array(z.object({ question: z.string(), header: z.string(), multiple: z.boolean().optional(), custom: z.boolean().optional(), options: z.array(z.object({ label: z.string(), description: z.string() })) })) });
export type Permission = z.infer<typeof permissionSchema>;
export type Question = z.infer<typeof questionSchema>;
export const statusSchema = z.discriminatedUnion('type', [z.object({ type: z.literal('idle') }), z.object({ type: z.literal('busy') }), z.object({ type: z.literal('retry'), attempt: z.number(), message: z.string(), next: z.number() })]);
export type SessionStatus = z.infer<typeof statusSchema>;
export const statusMapSchema = z.record(z.string(), statusSchema);

const eventBase = z.object({ id: z.string().optional() });
export const eventSchema = z.discriminatedUnion('type', [
  eventBase.extend({ type: z.enum(['session.created', 'session.updated', 'session.deleted']), properties: z.object({ info: sessionSchema }) }),
  eventBase.extend({ type: z.literal('message.updated'), properties: z.object({ info: messageInfoSchema }) }),
  eventBase.extend({ type: z.literal('message.removed'), properties: z.object({ sessionID: id, messageID: id }) }),
  eventBase.extend({ type: z.literal('message.part.updated'), properties: z.object({ part: partSchema }) }),
  eventBase.extend({ type: z.literal('message.part.removed'), properties: z.object({ sessionID: id, messageID: id, partID: id }) }),
  eventBase.extend({ type: z.literal('message.part.delta'), properties: z.object({ sessionID: id, messageID: id, partID: id, field: z.string(), delta: z.string() }) }),
  eventBase.extend({ type: z.literal('session.status'), properties: z.object({ sessionID: id, status: statusSchema }) }),
  eventBase.extend({ type: z.literal('session.idle'), properties: z.object({ sessionID: id }) }),
  eventBase.extend({ type: z.enum(['permission.asked', 'question.asked', 'permission.replied', 'question.replied', 'question.rejected', 'session.error', 'server.connected']), properties: z.json() }),
]);
export type RuntimeEvent = z.infer<typeof eventSchema>;

export const directSchema = z.object({ type: z.enum(['lan', 'tunnel']), url: z.url(), priority: z.number().optional() });
export const relaySchema = z.object({ type: z.literal('relay'), relayUrl: z.url(), serverId: id, hostEncPubJwk: z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: id, y: id }), priority: z.number().optional() });
export const connectionSchema = z.object({ id, label: z.string(), candidates: z.array(z.union([directSchema, relaySchema])).min(1), serverId: z.string().optional(), redeemedPairingDigest: z.string().regex(/^[a-f\d]{64}$/).optional() });
export type SavedConnection = z.infer<typeof connectionSchema>;
export const connectionListSchema = z.array(connectionSchema);
export const healthSchema = z.object({ serverId: z.string().optional() });
export const tokenSchema = z.object({ clientToken: id, server: z.object({ label: z.string().optional() }).optional() });
export const authSchema = z.object({ authenticated: z.boolean().optional(), disabled: z.boolean().optional() });
export const homeSchema = z.object({ home: id, dataDirectory: z.string().optional() });
