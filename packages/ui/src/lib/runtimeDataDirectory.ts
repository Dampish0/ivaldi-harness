import { z } from 'zod';
import { runtimeFetch } from './runtime-fetch';

const homeSchema = z.object({ home: z.string().min(1), dataDirectory: z.string().min(1).optional() });

export async function getRuntimeDataDirectory(): Promise<string> {
  const response = await runtimeFetch('/api/fs/home', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to resolve application data directory');
  const result = homeSchema.parse(await response.json());
  // Older remote servers expose only home and use the original directory.
  return result.dataDirectory ?? `${result.home.replace(/[\\/]+$/, '')}/.config/openchamber`;
}
