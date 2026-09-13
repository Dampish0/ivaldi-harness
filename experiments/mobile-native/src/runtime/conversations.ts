import type { Message, Part, RuntimeEvent, Session } from './schema';

export function upsertSession(sessions: Session[], session: Session) {
  return [...sessions.filter(item => item.id !== session.id), session].sort((a, b) => b.time.updated - a.time.updated);
}
export function eventSessionId(event: RuntimeEvent): string | undefined {
  switch (event.type) {
    case 'session.created': case 'session.updated': case 'session.deleted': return event.properties.info.id;
    case 'message.updated': return event.properties.info.sessionID;
    case 'message.part.updated': return event.properties.part.sessionID;
    case 'message.part.delta': case 'message.removed': case 'message.part.removed': case 'session.status': case 'session.idle': return event.properties.sessionID;
    default: return undefined;
  }
}
export function applyMessageEvent(messages: Message[], event: RuntimeEvent): Message[] {
  if (event.type === 'message.updated') {
    const info = event.properties.info;
    const previous = messages.find(item => item.info.id === info.id);
    return [...messages.filter(item => item.info.id !== info.id), { info, parts: previous?.parts ?? [] }].sort((a, b) => a.info.time.created - b.info.time.created || a.info.id.localeCompare(b.info.id));
  }
  if (event.type === 'message.removed') return messages.filter(item => item.info.id !== event.properties.messageID);
  if (event.type === 'message.part.updated') {
    const part = event.properties.part;
    return messages.map(message => message.info.id === part.messageID ? { ...message, parts: [...message.parts.filter(item => item.id !== part.id), part].sort((a, b) => a.id.localeCompare(b.id)) } : message);
  }
  if (event.type === 'message.part.removed') return messages.map(message => message.info.id === event.properties.messageID ? { ...message, parts: message.parts.filter(part => part.id !== event.properties.partID) } : message);
  if (event.type === 'message.part.delta') {
    const { messageID, partID, field, delta } = event.properties;
    if (field !== 'text') return messages;
    return messages.map(message => message.info.id === messageID ? { ...message, parts: message.parts.map(part => part.id === partID && (part.type === 'text' || part.type === 'reasoning') ? { ...part, text: part.text + delta } : part) } : message);
  }
  return messages;
}

// A history request may race full-part events and deltas. Preserve mutations
// made after it started, including removals. Prefix comparison only reconciles
// the same growing text; it never guesses message identity from content.
export function reconcileHistory(snapshot: Message[], live: Message[], mutations: RuntimeEvent[]) {
  let result = snapshot;
  for (const event of mutations) {
    if (event.type === 'message.part.delta') {
      const { messageID, partID } = event.properties;
      const livePart = live.find(message => message.info.id === messageID)?.parts.find(part => part.id === partID);
      if (!livePart || (livePart.type !== 'text' && livePart.type !== 'reasoning')) continue;
      result = result.map(message => message.info.id !== messageID ? message : { ...message, parts: message.parts.map(part => {
        if (part.id !== partID || (part.type !== 'text' && part.type !== 'reasoning')) return part;
        return part.text.startsWith(livePart.text) ? part : livePart;
      }) });
    } else result = applyMessageEvent(result, event);
  }
  return result;
}
export function visibleText(parts: Part[]) {
  return parts.filter(part => part.type === 'text' && !part.synthetic && !part.ignored).map(part => part.type === 'text' ? part.text : '').join('\n\n');
}
export function isManagedChat(directory: string) {
  return /\/\.config\/(?:ivaldi|openchamber)\/chats\//i.test(directory.replace(/\\/g, '/'));
}
