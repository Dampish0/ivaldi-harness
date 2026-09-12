import { create } from 'zustand';
import { z } from 'zod';

const STORAGE_KEY = 'ivaldi-profile';
const nameSchema = z.string().trim().min(1).max(64);
const profileSchema = z.object({ version: z.literal(1), name: nameSchema });

type Profile =
  | { kind: 'unloaded' }
  | { kind: 'missing' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; name: string };

type ProfileStore = {
  profile: Profile;
  load: () => void;
  saveName: (name: string) => 'invalid' | 'storage' | null;
};

// This is the user's local app identity, independent of GitHub and runtime hosts.
export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: { kind: 'unloaded' },
  load: () => {
    if (get().profile.kind === 'ready' || get().profile.kind === 'missing') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        set({ profile: { kind: 'missing' } });
        return;
      }
      const parsed = profileSchema.safeParse(JSON.parse(raw));
      set({ profile: parsed.success ? { kind: 'ready', name: parsed.data.name } : { kind: 'missing' } });
    } catch {
      // Preserve the stored value until the user explicitly saves a replacement.
      set({ profile: { kind: 'unavailable' } });
    }
  },
  saveName: (name) => {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return 'invalid';
    try {
      // Commit to durable storage before advancing onboarding or changing the UI.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, name: parsed.data }));
    } catch {
      return 'storage';
    }
    set({ profile: { kind: 'ready', name: parsed.data } });
    return null;
  },
}));
