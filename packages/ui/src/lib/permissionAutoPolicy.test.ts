import { describe, expect, test } from 'bun:test';

import { classifyAutoPermission } from './permissionAutoPolicy';

const cases = [
  ['read source', 'read', ['src/main.ts'], 'allow', 'auto.allow.read'],
  ['read env', 'read', ['.env'], 'ask', 'auto.ask.sensitive-path'],
  ['read env example', 'read', ['.env.example'], 'allow', 'auto.allow.read'],
  ['external directory', 'external_directory', ['C:/Users/test'], 'ask', 'auto.ask.external-directory'],
  ['search', 'grep', ['needle'], 'allow', 'auto.allow.grep'],
  ['public fetch', 'webfetch', ['https://example.com/docs'], 'allow', 'auto.allow.public-web-read'],
  ['private fetch', 'webfetch', ['http://127.0.0.1:3000/admin'], 'ask', 'auto.ask.private-network'],
  ['git status', 'bash', ['git status --short'], 'allow', 'auto.allow.git-read'],
  ['git add', 'bash', ['git add src/main.ts'], 'allow', 'auto.allow.git-index'],
  ['git commit', 'bash', ['git commit -m "done"'], 'ask', 'auto.ask.protected-git'],
  ['git push', 'bash', ['git push origin main'], 'ask', 'auto.ask.protected-git'],
  ['validation', 'bash', ['bun run type-check'], 'allow', 'auto.allow.validation'],
  ['unknown script', 'bash', ['bun run deploy'], 'ask', 'auto.ask.project-script'],
  ['dependency mutation', 'bash', ['npm install lodash'], 'ask', 'auto.ask.dependency-mutation'],
  ['destructive command', 'bash', ['rm -rf build'], 'ask', 'auto.ask.destructive-command'],
  ['elevation', 'bash', ['sudo apt update'], 'ask', 'auto.ask.privilege-elevation'],
  ['production mutation', 'bash', ['kubectl apply -f deploy.yaml'], 'ask', 'auto.ask.production-mutation'],
  ['network mutation', 'bash', ['curl -X POST https://example.com/api'], 'ask', 'auto.ask.network-mutation'],
  ['opaque shell', 'bash', ['node scripts/custom.mjs'], 'ask', 'auto.ask.command-unknown'],
  ['safe chain', 'bash', ['git status && bun test'], 'allow', 'auto.allow.command-chain'],
  ['pipe syntax', 'bash', ['git status | cat'], 'ask', 'auto.ask.shell-syntax'],
  ['unknown permission', 'computer', ['click'], 'ask', 'auto.ask.permission-unknown'],
] as const;

describe('Auto permission policy', () => {
  for (const [name, permission, patterns, effect, reasonCode] of cases) {
    test(name, () => {
      const result = classifyAutoPermission({ permission, patterns: [...patterns] });
      expect(result.effect).toBe(effect);
      expect(result.reasonCode).toBe(reasonCode);
    });
  }

  test('asks before shell reads of sensitive files', () => {
    expect(classifyAutoPermission({ permission: 'bash', patterns: ['cat .env'], directory: '/repo' }).reasonCode)
      .toBe('auto.ask.sensitive-path');
  });

  test('asks before absolute or parent-path shell access outside the project', () => {
    expect(classifyAutoPermission({ permission: 'bash', patterns: ['cat /etc/hosts'], directory: '/repo' }).reasonCode)
      .toBe('auto.ask.external-directory');
    expect(classifyAutoPermission({ permission: 'bash', patterns: ['cat ../outside.txt'], directory: '/repo' }).reasonCode)
      .toBe('auto.ask.external-directory');
  });

  test('allows an absolute read that stays inside the project root', () => {
    expect(classifyAutoPermission({ permission: 'read', patterns: ['/repo/src/main.ts'], directory: '/repo' }).effect)
      .toBe('allow');
  });
});
