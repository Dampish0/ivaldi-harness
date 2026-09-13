import type { SavedConnection } from './schema';

/** A reused address is not evidence that newly issued credentials belong to an existing saved server. */
export function reusablePairingConnection(saved: readonly SavedConnection[], pairing: SavedConnection, serverId: string | undefined): SavedConnection | undefined {
  if (!serverId?.trim()) return undefined;
  return saved.find(connection => {
    const pinnedId = connection.serverId ?? connection.candidates.find(candidate => candidate.type === 'relay')?.serverId;
    if (pinnedId !== serverId) return false;
    return connection.candidates.some(candidate => pairing.candidates.some(next =>
      candidate.type === 'relay' && next.type === 'relay'
        ? candidate.serverId === next.serverId
        : candidate.type !== 'relay' && next.type !== 'relay' && candidate.url === next.url,
    ));
  });
}
