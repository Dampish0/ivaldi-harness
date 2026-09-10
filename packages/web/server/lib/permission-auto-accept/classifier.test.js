import { describe, expect, it } from 'vitest';

import { classifyAutoPermission as classifyUiAutoPermission } from '../../../../ui/src/lib/permissionAutoPolicy.ts';
import { classifyAutoPermission } from './classifier.js';

const cases = [
  { permission: 'read', patterns: ['src/main.ts'] },
  { permission: 'read', patterns: ['.env'] },
  { permission: 'edit', patterns: ['C:\\Users\\me\\.ssh\\config'] },
  { permission: 'external_directory', patterns: ['/tmp'] },
  { permission: 'grep', patterns: ['needle'] },
  { permission: 'webfetch', patterns: ['https://example.com/docs'] },
  { permission: 'webfetch', patterns: ['http://localhost:3000/admin'] },
  { permission: 'bash', patterns: ['git status --short'] },
  { permission: 'bash', patterns: ['git add src/main.ts'] },
  { permission: 'bash', patterns: ['git commit -m done'] },
  { permission: 'bash', patterns: ['git push --force origin main'] },
  { permission: 'bash', patterns: ['bun run lint'] },
  { permission: 'bash', patterns: ['npm run deploy'] },
  { permission: 'bash', patterns: ['npm install lodash'] },
  { permission: 'bash', patterns: ['Remove-Item -Recurse build'] },
  { permission: 'bash', patterns: ['Start-Process powershell -Verb RunAs'] },
  { permission: 'bash', patterns: ['terraform destroy -auto-approve'] },
  { permission: 'bash', patterns: ['curl --data x=1 https://example.com'] },
  { permission: 'bash', patterns: ['node scripts/custom.mjs'] },
  { permission: 'bash', patterns: ['git status && bun test'] },
  { permission: 'bash', patterns: ['git status | cat'] },
  { permission: 'bash', patterns: ['cat .env'], directory: '/repo' },
  { permission: 'bash', patterns: ['cat /etc/hosts'], directory: '/repo' },
  { permission: 'bash', patterns: ['cat ../outside.txt'], directory: '/repo' },
  { permission: 'read', patterns: ['/repo/src/main.ts'], directory: '/repo' },
  { permission: 'computer', patterns: ['click'] },
];

describe('Auto permission classifier', () => {
  it.each(cases)('matches the shared UI classifier for $permission $patterns', (input) => {
    expect(classifyAutoPermission(input)).toEqual(classifyUiAutoPermission(input));
  });
});
