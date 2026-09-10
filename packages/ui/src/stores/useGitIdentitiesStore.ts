import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { createDeferredSafeJSONStorage } from "./utils/safeStorage";
import {
  getGitIdentities,
  createGitIdentity,
  updateGitIdentity,
  deleteGitIdentity,
  discoverGitCredentials,
  getGlobalGitIdentity
} from "@/lib/gitApi";
import { reportSettingsSaveState, updateDesktopSettings } from "@/lib/persistence";
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry";
import { runtimeFetch } from "@/lib/runtime-fetch";
import type { SettingsPayload } from "@/lib/api/types";

export type GitIdentityAuthType = 'ssh' | 'token';

export interface GitIdentityProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  authType?: GitIdentityAuthType;
  sshKey?: string | null;
  signCommits?: boolean;
  signingKey?: string | null;
  host?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface DiscoveredGitCredential {
  host: string;
  username: string;
}

type GitIdentityLoadErrors = {
  profiles?: string;
  globalIdentity?: string;
  discoveredCredentials?: string;
  defaultIdentity?: string;
};

interface GitIdentitiesStore {

  selectedProfileId: string | null;
  defaultGitIdentityId: string | null; // null = unset, 'global' = system, profile id = custom
  profiles: GitIdentityProfile[];
  globalIdentity: GitIdentityProfile | null;
  discoveredCredentials: DiscoveredGitCredential[];
  isLoading: boolean;
  loadErrors: GitIdentityLoadErrors;

  setSelectedProfile: (id: string | null) => void;
  loadProfiles: () => Promise<boolean>;
  loadGlobalIdentity: () => Promise<boolean>;
  loadDiscoveredCredentials: () => Promise<boolean>;
  loadDefaultGitIdentityId: () => Promise<boolean>;
  setDefaultGitIdentityId: (id: string | null) => Promise<boolean>;

  createProfile: (profile: Omit<GitIdentityProfile, 'id'> & { id?: string }) => Promise<boolean>;
  updateProfile: (id: string, updates: Partial<GitIdentityProfile>) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<boolean>;
  getProfileById: (id: string) => GitIdentityProfile | undefined;
  getUnimportedCredentials: () => DiscoveredGitCredential[];
}

declare global {
  interface Window {
    __zustand_git_identities_store__?: UseBoundStore<StoreApi<GitIdentitiesStore>>;
  }
}

export const useGitIdentitiesStore = create<GitIdentitiesStore>()(
  devtools(
    persist(
      (set, get) => ({

        selectedProfileId: null,
        defaultGitIdentityId: null,
        profiles: [],
        globalIdentity: null,
        discoveredCredentials: [],
        isLoading: false,
        loadErrors: {},

        setSelectedProfile: (id: string | null) => {
          set({ selectedProfileId: id });
        },

        loadProfiles: async () => {
          set({ isLoading: true });
          const previousProfiles = get().profiles;

          try {
            const profiles = await getGitIdentities();
            set((state) => ({
              profiles,
              isLoading: false,
              loadErrors: { ...state.loadErrors, profiles: undefined },
            }));
            return true;
          } catch (error) {
            console.error("Failed to load git identity profiles:", error);
            const message = error instanceof Error && error.message
              ? error.message
              : 'Failed to load Git identity profiles';
            set((state) => ({
              profiles: previousProfiles,
              isLoading: false,
              loadErrors: {
                ...state.loadErrors,
                profiles: message,
              },
            }));
            return false;
          }
        },

        loadGlobalIdentity: async () => {
          try {
            const data = await getGlobalGitIdentity();

            if (data && data.userName && data.userEmail) {
              const globalProfile: GitIdentityProfile = {
                id: 'global',
                name: 'Global Identity',
                userName: data.userName,
                userEmail: data.userEmail,
                authType: data.sshCommand ? 'ssh' : undefined,
                sshKey: data.sshCommand ? data.sshCommand.replace('ssh -i ', '') : null,
                color: 'info',
                icon: 'fingerprint'
              };
              set((state) => ({
                globalIdentity: globalProfile,
                loadErrors: { ...state.loadErrors, globalIdentity: undefined },
              }));
            } else {
              set((state) => ({
                globalIdentity: null,
                loadErrors: { ...state.loadErrors, globalIdentity: undefined },
              }));
            }

            return true;
          } catch (error) {
            console.error("Failed to load global git identity:", error);
            const message = error instanceof Error && error.message
              ? error.message
              : 'Failed to load global Git identity';
            set((state) => ({
              loadErrors: {
                ...state.loadErrors,
                globalIdentity: message,
              },
            }));
            return false;
          }
        },

        loadDiscoveredCredentials: async () => {
          try {
            const credentials = await discoverGitCredentials();
            set((state) => ({
              discoveredCredentials: credentials,
              loadErrors: { ...state.loadErrors, discoveredCredentials: undefined },
            }));
            return true;
          } catch (error) {
            console.error("Failed to discover git credentials:", error);
            const message = error instanceof Error && error.message
              ? error.message
              : 'Failed to discover Git credentials';
            set((state) => ({
              loadErrors: {
                ...state.loadErrors,
                discoveredCredentials: message,
              },
            }));
            return false;
          }
        },

        loadDefaultGitIdentityId: async () => {
          const normalize = (value: string | null | undefined): string | null => {
            const trimmed = value?.trim() ?? '';
            return trimmed.length > 0 ? trimmed : null;
          };

          try {
            let defaultId: string | null = null;
            let hadSuccessfulRead = false;

            if (defaultId === null) {
              const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
              if (runtimeSettings) {
                try {
                  const result = await runtimeSettings.load();
                  defaultId = normalize(result.settings.defaultGitIdentityId);
                  hadSuccessfulRead = true;
                } catch {
                  // fall through
                }
              }
            }

            if (defaultId === null) {
              try {
                const response = await runtimeFetch('/api/config/settings', {
                  method: 'GET',
                  headers: { Accept: 'application/json' },
                });
                if (response.ok) {
                  const data: SettingsPayload | null = await response.json().catch(() => null);
                  defaultId = normalize(data?.defaultGitIdentityId);
                  hadSuccessfulRead = true;
                }
              } catch {
                // ignore
              }
            }

            if (!hadSuccessfulRead) {
              set((state) => ({
                loadErrors: {
                  ...state.loadErrors,
                  defaultIdentity: 'Failed to load default Git identity setting',
                },
              }));
              return false;
            }

            set((state) => ({
              defaultGitIdentityId: defaultId,
              loadErrors: { ...state.loadErrors, defaultIdentity: undefined },
            }));
            return true;
          } catch (error) {
            console.error('Failed to load default git identity setting:', error);
            const message = error instanceof Error && error.message
              ? error.message
              : 'Failed to load default Git identity setting';
            set((state) => ({
              loadErrors: {
                ...state.loadErrors,
                defaultIdentity: message,
              },
            }));
            return false;
          }
        },

        setDefaultGitIdentityId: async (id) => {
          try {
            const trimmed = id?.trim() ?? '';
            const value = trimmed.length > 0 ? trimmed : '';
            await updateDesktopSettings({ defaultGitIdentityId: value });
            set({ defaultGitIdentityId: value.length > 0 ? value : null });
            return true;
          } catch (error) {
            console.error('Failed to save default git identity setting:', error);
            return false;
          }
        },

        createProfile: async (profileData) => {
          try {

            const profile = {
              ...profileData,
              id: profileData.id || `profile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              color: profileData.color || 'keyword',
              icon: profileData.icon || 'branch'
            };

            reportSettingsSaveState('saving');
            await createGitIdentity(profile);
            reportSettingsSaveState('saved');

            await get().loadProfiles();
            return true;
          } catch (error) {
            reportSettingsSaveState('error');
            console.error("Failed to create git identity profile:", error);
            return false;
          }
        },

        updateProfile: async (id, updates) => {
          try {

            const existing = get().profiles.find(p => p.id === id);
            if (!existing) {
              throw new Error("Profile not found");
            }

            const updated = { ...existing, ...updates };
            reportSettingsSaveState('saving');
            await updateGitIdentity(id, updated);
            reportSettingsSaveState('saved');

            await get().loadProfiles();
            return true;
          } catch (error) {
            reportSettingsSaveState('error');
            console.error("Failed to update git identity profile:", error);
            return false;
          }
        },

        deleteProfile: async (id) => {
          try {
            reportSettingsSaveState('saving');
            await deleteGitIdentity(id);
            reportSettingsSaveState('saved');

            if (get().selectedProfileId === id) {
              set({ selectedProfileId: null });
            }

            await get().loadProfiles();
            return true;
          } catch (error) {
            reportSettingsSaveState('error');
            console.error("Failed to delete git identity profile:", error);
            return false;
          }
        },

        getProfileById: (id) => {
          const { profiles, globalIdentity } = get();
          if (id === 'global') {
            return globalIdentity || undefined;
          }
          return profiles.find((p) => p.id === id);
        },

        getUnimportedCredentials: () => {
          const { profiles, discoveredCredentials } = get();
          // Filter out credentials that have already been imported as token-based profiles
          return discoveredCredentials.filter(cred => {
            return !profiles.some(p => 
              p.authType === 'token' && p.host === cred.host
            );
          });
        },
      }),
      {
        name: "git-identities-store",
        storage: createDeferredSafeJSONStorage(),
        partialize: (state) => ({
          selectedProfileId: state.selectedProfileId,
        }),
      },
    ),
    {
      name: "git-identities-store",
    },
  ),
);

if (typeof window !== "undefined") {
  window.__zustand_git_identities_store__ = useGitIdentitiesStore;
}
