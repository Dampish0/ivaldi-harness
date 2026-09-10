import { beforeEach, describe, expect, mock, test } from 'bun:test';

const activeProjectPath = '/workspace/project-with-agents-skills';

let runtimeFetchCalls: Array<{ url: string; headers?: HeadersInit }> = [];
let runtimeFetchImpl: (url: string, init?: RequestInit) => Promise<Response> = async () => (
  new Response(JSON.stringify({ skills: [] }), {
    headers: { 'Content-Type': 'application/json' },
  })
);
let getDirectoryImpl: () => string | undefined = () => undefined;

const runtimeFetchMock = async (url: string, init?: RequestInit) => {
  runtimeFetchCalls.push({ url: String(url), headers: init?.headers });
  return runtimeFetchImpl(url, init);
};

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    getDirectory: () => getDirectoryImpl(),
    checkHealth: async () => true,
  },
}));

mock.module('@/stores/useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({
      getActiveProject: () => ({ path: activeProjectPath }),
    }),
  },
}));

mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: runtimeFetchMock,
}));

mock.module('@/lib/background-network', () => ({
  runBackgroundNetworkTask: async <T,>(task: () => Promise<T>) => task(),
}));

mock.module('@/lib/configUpdate', () => ({
  startConfigUpdate: mock(() => undefined),
  finishConfigUpdate: mock(() => undefined),
  updateConfigUpdateMessage: mock(() => undefined),
}));

mock.module('@/lib/configSync', () => ({
  emitConfigChange: mock(() => undefined),
  scopeMatches: mock(() => false),
  subscribeToConfigChanges: mock(() => () => undefined),
}));

mock.module('./utils/safeStorage', () => ({
  createDeferredSafeJSONStorage: () => ({
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  }),
}));

const {
  invalidateSkillsLoadCache,
  selectSkillsLoadErrorForDirectory,
  useSkillsStore,
} = await import('./useSkillsStore');

describe('useSkillsStore directory resolution', () => {
  beforeEach(() => {
    runtimeFetchCalls = [];
    getDirectoryImpl = () => undefined;
    runtimeFetchImpl = async () => new Response(JSON.stringify({
      skills: [{
        name: 'repo-local-skill',
        path: `${activeProjectPath}/.agents/skills/repo-local-skill/SKILL.md`,
        scope: 'project',
        source: 'agents',
        sources: { md: { description: 'Repository local' } },
      }],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    invalidateSkillsLoadCache(activeProjectPath);
    invalidateSkillsLoadCache('/workspace/other-project');
    useSkillsStore.setState({
      selectedSkillName: null,
      skills: [],
      skillsByDirectory: {},
      skillsLoadErrorByDirectory: {},
      isLoading: false,
      skillDraft: null,
    });
  });

  test('loading another project leaves the active project\'s skills alone', async () => {
    // Settings can browse a project the app is not on. Chat autocompletes read
    // `skills`, so that list must keep describing the active project.
    const activeSkills = [{
      name: 'active-only',
      path: `${activeProjectPath}/.agents/skills/active-only/SKILL.md`,
      scope: 'project' as const,
      source: 'agents' as const,
      description: 'Active project skill',
      group: undefined,
      renamable: false,
    }];
    useSkillsStore.setState({
      skills: activeSkills,
      skillsByDirectory: { [activeProjectPath]: activeSkills },
    });

    const loaded = await useSkillsStore.getState().loadSkills('/workspace/other-project');

    expect(loaded).toBe(true);
    expect(runtimeFetchCalls[0]?.url).toContain(`directory=${encodeURIComponent('/workspace/other-project')}`);
    const state = useSkillsStore.getState();
    expect(state.skills).toEqual(activeSkills);
    expect(state.skillsByDirectory['/workspace/other-project']?.map((skill) => skill.name)).toEqual(['repo-local-skill']);
  });

  test('loadSkills scopes discovery to the active project even when client directory is unset', async () => {
    const loaded = await useSkillsStore.getState().loadSkills();

    expect(loaded).toBe(true);
    expect(runtimeFetchCalls.length).toBe(1);
    expect(runtimeFetchCalls[0]?.url).toContain(`directory=${encodeURIComponent(activeProjectPath)}`);
    expect(useSkillsStore.getState().skills).toEqual([{
      name: 'repo-local-skill',
      path: `${activeProjectPath}/.agents/skills/repo-local-skill/SKILL.md`,
      scope: 'project',
      source: 'agents',
      description: 'Repository local',
      group: undefined,
      renamable: false,
    }]);
  });

  test('loadSkills maps authoritative renamable from the list response', async () => {
    runtimeFetchImpl = async () => new Response(JSON.stringify({
      skills: [
        {
          name: 'managed-skill',
          path: `${activeProjectPath}/.opencode/skills/managed-skill/SKILL.md`,
          scope: 'project',
          source: 'opencode',
          renamable: true,
          sources: { md: { description: 'Managed' } },
        },
        {
          name: 'cache-skill',
          path: '/home/ubuntu/.cache/opencode/skills/hash/cache-skill/SKILL.md',
          scope: 'user',
          source: 'opencode',
          renamable: false,
          sources: { md: { description: 'Cache' } },
        },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(useSkillsStore.getState().skills).toEqual([
      {
        name: 'managed-skill',
        path: `${activeProjectPath}/.opencode/skills/managed-skill/SKILL.md`,
        scope: 'project',
        source: 'opencode',
        description: 'Managed',
        group: undefined,
        renamable: true,
      },
      {
        name: 'cache-skill',
        path: '/home/ubuntu/.cache/opencode/skills/hash/cache-skill/SKILL.md',
        scope: 'user',
        source: 'opencode',
        description: 'Cache',
        group: 'hash',
        renamable: false,
      },
    ]);
  });

  test('renameSkill uses getRequestDirectory query and x-opencode-directory header', async () => {
    runtimeFetchImpl = async (_url, init) => {
      if (init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          success: true,
          requiresReload: false,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        skills: [{
          name: 'new-skill',
          path: `${activeProjectPath}/.opencode/skills/new-skill/SKILL.md`,
          scope: 'project',
          source: 'opencode',
          renamable: true,
          sources: { md: { description: 'Renamed' } },
        }],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const renamed = await useSkillsStore.getState().renameSkill('old-skill', 'new-skill');
    expect(renamed).toBe(true);

    const renameCall = runtimeFetchCalls.find((call) => String(call.url).includes('/api/config/skills/old-skill'));
    expect(renameCall).toBeTruthy();
    expect(renameCall?.url).toContain(`directory=${encodeURIComponent(activeProjectPath)}`);

    const headers = new Headers(renameCall?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-opencode-directory')).toBe(activeProjectPath);
  });

  test('invalidateSkillsLoadCache() with no argument clears the active-project cache key used by loadSkills', async () => {
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(1);

    // Wrong key: client-directory-first null maps to __default__, not the active project.
    invalidateSkillsLoadCache(null);
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(1);

    // Default resolution must match loadSkills (active project first).
    invalidateSkillsLoadCache();
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(2);
    expect(runtimeFetchCalls[1]?.url).toContain(`directory=${encodeURIComponent(activeProjectPath)}`);
  });

  test('failed list refresh preserves the previous skills and reports failure separately', async () => {
    const previousSkills = [{
      name: 'known-skill',
      path: `${activeProjectPath}/.opencode/skills/known-skill/SKILL.md`,
      scope: 'project' as const,
      source: 'opencode' as const,
      description: 'Known skill',
      group: undefined,
      renamable: true,
    }];
    useSkillsStore.setState({
      skills: previousSkills,
      skillsByDirectory: { [activeProjectPath]: previousSkills },
    });
    runtimeFetchImpl = async () => new Response('backend unavailable', { status: 503 });
    invalidateSkillsLoadCache(activeProjectPath);

    expect(await useSkillsStore.getState().loadSkills(activeProjectPath)).toBe(false);

    const state = useSkillsStore.getState();
    expect(state.skillsByDirectory[activeProjectPath]).toEqual(previousSkills);
    expect(state.skills).toEqual(previousSkills);
    expect(selectSkillsLoadErrorForDirectory(state, activeProjectPath)).toBe(true);
  });

  test('successful empty list is distinct from a failed list refresh', async () => {
    runtimeFetchImpl = async () => new Response(JSON.stringify({ skills: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
    invalidateSkillsLoadCache(activeProjectPath);

    expect(await useSkillsStore.getState().loadSkills(activeProjectPath)).toBe(true);

    const state = useSkillsStore.getState();
    expect(state.skillsByDirectory[activeProjectPath]).toEqual([]);
    expect(selectSkillsLoadErrorForDirectory(state, activeProjectPath)).toBe(false);
  });

  test('getSkillDetail returns null only for authoritative not-found and throws on server failure', async () => {
    runtimeFetchImpl = async () => new Response('missing', { status: 404 });
    expect(await useSkillsStore.getState().getSkillDetail('missing-skill', activeProjectPath)).toBeNull();

    runtimeFetchImpl = async () => new Response('backend unavailable', { status: 503 });
    await expect(useSkillsStore.getState().getSkillDetail('known-skill', activeProjectPath)).rejects.toThrow(
      'Failed to load skill details: 503',
    );
  });
});
