import type { PermissionRequest } from '@opencode-ai/sdk/v2/client';

export type AutoPermissionDecision = {
  effect: 'allow' | 'ask';
  reasonCode: string;
  risk: 'routine' | 'sensitive' | 'destructive' | 'privileged' | 'production' | 'unknown';
};
type AutoPermissionInput = Pick<PermissionRequest, 'permission' | 'patterns'> & {
  directory?: string;
};

const decision = (
  effect: AutoPermissionDecision['effect'],
  reasonCode: string,
  risk: AutoPermissionDecision['risk'],
): AutoPermissionDecision => ({ effect, reasonCode, risk });

const allowRoutine = (reasonCode: string) => decision('allow', reasonCode, 'routine');
const askSensitive = (reasonCode: string) => decision('ask', reasonCode, 'sensitive');
const askDestructive = (reasonCode: string) => decision('ask', reasonCode, 'destructive');
const askPrivileged = (reasonCode: string) => decision('ask', reasonCode, 'privileged');
const askProduction = (reasonCode: string) => decision('ask', reasonCode, 'production');
const askUnknown = (reasonCode: string) => decision('ask', reasonCode, 'unknown');

const safePermissionTypes = new Set([
  'glob', 'grep', 'list', 'lsp', 'question', 'skill', 'task', 'todowrite', 'websearch',
]);
const safeScriptPattern = /^(?:test(?::[^\s]+)?|lint(?::[^\s]+)?|type-?check(?::[^\s]+)?|check(?::[^\s]+)?|build(?::[^\s]+)?|format(?::check)?|fmt(?::check)?|validate(?::[^\s]+)?)$/i;
const privateHostPattern = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i;
const sensitivePathPattern = /(?:^|[\\/])(?:\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.config[\\/]gcloud)(?:[\\/]|$)|(?:^|[\\/])(?:id_rsa|id_ed25519|credentials|credentials\.json|secrets?\.json|auth\.json|\.npmrc|\.pypirc|\.netrc)(?:$|[\\/])|\.(?:pem|p12|pfx|key)$/i;
const envFilePattern = /(?:^|[\\/])\.env(?:\.[^\\/]+)?$/i;
const safeEnvExamplePattern = /(?:^|[\\/])\.env\.(?:example|sample|template|defaults?)$/i;

const cleanPattern = (value: string) => value.trim();
const candidatePathValues = (value: string) => {
  const cleaned = cleanPattern(value);
  if (!cleaned || /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) return [];
  const equalsIndex = cleaned.indexOf('=');
  return equalsIndex > 0 ? [cleaned, cleaned.slice(equalsIndex + 1)] : [cleaned];
};
const normalizePathLike = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const isAbsolutePathLike = (value: string) => /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value) || /^\//.test(value);
const containsExternalPath = (patterns: string[], directory?: string) => {
  const root = directory?.trim() ?? '';
  const normalizedRoot = root && isAbsolutePathLike(root) ? normalizePathLike(root) : null;
  for (const rawPattern of patterns) {
    for (const value of candidatePathValues(rawPattern)) {
      if (value === '~' || /^[~][\\/]/.test(value) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value)) return true;
      if (!isAbsolutePathLike(value)) continue;
      if (!normalizedRoot) return true;
      const normalizedValue = normalizePathLike(value);
      if (normalizedValue !== normalizedRoot && !normalizedValue.startsWith(`${normalizedRoot}/`)) return true;
    }
  }
  return false;
};
const containsSensitivePath = (patterns: string[]) => patterns.some((rawPattern) => {
  const pattern = cleanPattern(rawPattern);
  if (!pattern) return false;
  if (safeEnvExamplePattern.test(pattern)) return false;
  return envFilePattern.test(pattern) || sensitivePathPattern.test(pattern);
});

const classifyWebFetch = (patterns: string[]): AutoPermissionDecision => {
  for (const rawPattern of patterns) {
    const pattern = cleanPattern(rawPattern);
    if (!pattern) continue;
    let url: URL;
    try {
      url = new URL(pattern);
    } catch {
      return askUnknown('auto.ask.web-target-unknown');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return askSensitive('auto.ask.web-non-http');
    if (privateHostPattern.test(url.hostname)) return askSensitive('auto.ask.private-network');
  }
  return allowRoutine('auto.allow.public-web-read');
};

const tokenize = (command: string) => {
  const matches = command.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+/g) ?? [];
  return matches.map((token) => {
    if (token.length >= 2 && ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")))) {
      return token.slice(1, -1);
    }
    return token;
  });
};

const classifyGit = (tokens: string[]): AutoPermissionDecision => {
  const action = (tokens[1] ?? '').toLowerCase();
  const args = tokens.slice(2).map((token) => token.toLowerCase());
  if (!action) return askUnknown('auto.ask.git-command-unknown');
  if (['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'describe'].includes(action)) return allowRoutine('auto.allow.git-read');
  if (action === 'branch' && (args.length === 0 || args.includes('--show-current') || args.includes('--list'))) return allowRoutine('auto.allow.git-read');
  if (action === 'remote' && (args.length === 0 || args.includes('-v') || args[0] === 'get-url')) return allowRoutine('auto.allow.git-read');
  if (action === 'config' && args.some((arg) => arg === '--get' || arg === '--get-all' || arg === '--list')) return allowRoutine('auto.allow.git-read');
  if (action === 'add' || (action === 'restore' && args.includes('--staged'))) return allowRoutine('auto.allow.git-index');
  return askDestructive('auto.ask.protected-git');
};

const classifyPackageCommand = (tokens: string[]): AutoPermissionDecision | null => {
  const tool = (tokens[0] ?? '').toLowerCase();
  const action = (tokens[1] ?? '').toLowerCase();
  if (tool === 'bun' && action === 'test') return allowRoutine('auto.allow.validation');
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(tool) && action === 'test') return allowRoutine('auto.allow.validation');
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(tool) && action === 'run') {
    const script = tokens[2] ?? '';
    return safeScriptPattern.test(script) ? allowRoutine('auto.allow.validation') : askUnknown('auto.ask.project-script');
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(tool) && ['install', 'add', 'remove', 'uninstall', 'update', 'upgrade', 'publish', 'pack', 'link'].includes(action)) {
    return action === 'publish' ? askProduction('auto.ask.publish') : askSensitive('auto.ask.dependency-mutation');
  }
  return null;
};

const classifyKnownValidation = (tokens: string[]): AutoPermissionDecision | null => {
  const tool = (tokens[0] ?? '').toLowerCase();
  const action = (tokens[1] ?? '').toLowerCase();
  if (['tsc', 'eslint', 'oxlint', 'vitest', 'jest', 'pytest', 'ruff', 'mypy'].includes(tool)) return allowRoutine('auto.allow.validation');
  if (tool === 'go' && action === 'test') return allowRoutine('auto.allow.validation');
  if (tool === 'cargo' && ['test', 'check', 'clippy', 'fmt'].includes(action)) return allowRoutine('auto.allow.validation');
  if (tool === 'dotnet' && ['test', 'build', 'format'].includes(action)) return allowRoutine('auto.allow.validation');
  if (['mvn', 'mvnw', 'gradle', 'gradlew'].includes(tool) && tokens.some((token) => /^(?:test|check|build)$/i.test(token))) return allowRoutine('auto.allow.validation');
  return null;
};

const classifyShellSegment = (segment: string, directory?: string): AutoPermissionDecision => {
  const tokens = tokenize(segment);
  const executable = (tokens[0] ?? '').toLowerCase();
  if (!executable) return askUnknown('auto.ask.command-unknown');
  const argumentsOnly = tokens.slice(1);
  if (containsSensitivePath(argumentsOnly)) return askSensitive('auto.ask.sensitive-path');
  if (containsExternalPath(argumentsOnly, directory)) return askSensitive('auto.ask.external-directory');
  const lower = segment.toLowerCase();
  if (/\b(?:sudo|doas|pkexec|runas)\b|start-process[\s\S]*-verb\s+runas/i.test(segment)) return askPrivileged('auto.ask.privilege-elevation');
  if (/\b(?:rm|rmdir|del|erase|remove-item|format|diskpart|shutdown|reboot|restart-computer|stop-computer|taskkill)\b/i.test(segment)) return askDestructive('auto.ask.destructive-command');
  if (/\b(?:kubectl\s+(?:apply|delete|patch|replace|rollout|scale)|terraform\s+(?:apply|destroy|import)|(?:aws|gcloud|az)\s+[^\r\n]*(?:create|delete|update|put|set|deploy|publish)|docker\s+(?:push|system\s+prune)|gh\s+(?:pr\s+merge|release\s+create))\b/i.test(lower)) return askProduction('auto.ask.production-mutation');
  if (/\b(?:curl|wget|invoke-webrequest|invoke-restmethod)\b/i.test(executable)) {
    if (/\s(?:-x|--request)\s*(?:post|put|patch|delete)\b|\s(?:-d|--data|--data-raw|--data-binary|-f|--form|-t|--upload-file)\b/i.test(lower)) return askProduction('auto.ask.network-mutation');
    return askSensitive('auto.ask.shell-network-access');
  }
  if (executable === 'git') return classifyGit(tokens);
  const packageDecision = classifyPackageCommand(tokens);
  if (packageDecision) return packageDecision;
  const validationDecision = classifyKnownValidation(tokens);
  if (validationDecision) return validationDecision;
  if (['pwd', 'ls', 'dir', 'get-location', 'get-childitem', 'get-child-item', 'cat', 'type', 'get-content', 'head', 'tail', 'wc', 'rg', 'grep', 'findstr', 'select-string', 'where', 'which', 'get-command', 'echo', 'printf'].includes(executable)) return allowRoutine('auto.allow.shell-read');
  if (tokens.length > 1 && ['node', 'python', 'python3', 'ruby', 'java', 'go', 'rustc', 'cargo', 'dotnet'].includes(executable) && tokens.slice(1).every((token) => /^(?:--version|-v|version)$/i.test(token))) return allowRoutine('auto.allow.tool-version');
  return askUnknown('auto.ask.command-unknown');
};

const classifyShell = (patterns: string[], directory?: string): AutoPermissionDecision => {
  const command = patterns.map(cleanPattern).filter(Boolean).join(' && ');
  if (!command) return askUnknown('auto.ask.command-unknown');
  if (/\|\||(?<!&)&(?!&)|[|><`\r\n]|\$\(/.test(command)) return askUnknown('auto.ask.shell-syntax');
  const segments = command.split(/\s*(?:&&|;)\s*/).filter(Boolean);
  if (segments.length === 0) return askUnknown('auto.ask.command-unknown');
  let lastDecision = allowRoutine('auto.allow.shell-read');
  for (const segment of segments) {
    lastDecision = classifyShellSegment(segment, directory);
    if (lastDecision.effect !== 'allow') return lastDecision;
  }
  return segments.length > 1 ? allowRoutine('auto.allow.command-chain') : lastDecision;
};

export const classifyAutoPermission = (input: AutoPermissionInput): AutoPermissionDecision => {
  const type = input.permission.trim().toLowerCase();
  const patterns = input.patterns;
  if (!type) return askUnknown('auto.ask.permission-unknown');
  if (type === 'external_directory') return askSensitive('auto.ask.external-directory');
  if (type === 'doom_loop') return askSensitive('auto.ask.doom-loop');
  if (type === 'bash') return classifyShell(patterns, input.directory);
  if (type === 'webfetch') return classifyWebFetch(patterns);
  if (type === 'read' || type === 'edit') {
    if (containsSensitivePath(patterns)) return askSensitive('auto.ask.sensitive-path');
    if (containsExternalPath(patterns, input.directory)) return askSensitive('auto.ask.external-directory');
    return allowRoutine(type === 'read' ? 'auto.allow.read' : 'auto.allow.edit');
  }
  if (safePermissionTypes.has(type)) return allowRoutine(`auto.allow.${type}`);
  return askUnknown('auto.ask.permission-unknown');
};
