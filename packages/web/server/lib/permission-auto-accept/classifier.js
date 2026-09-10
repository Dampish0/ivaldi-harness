const ALLOW = 'allow';
const ASK = 'ask';

const decision = (effect, reasonCode, risk) => ({ effect, reasonCode, risk });

const ALLOW_ROUTINE = (reasonCode) => decision(ALLOW, reasonCode, 'routine');
const ASK_SENSITIVE = (reasonCode) => decision(ASK, reasonCode, 'sensitive');
const ASK_DESTRUCTIVE = (reasonCode) => decision(ASK, reasonCode, 'destructive');
const ASK_PRIVILEGED = (reasonCode) => decision(ASK, reasonCode, 'privileged');
const ASK_PRODUCTION = (reasonCode) => decision(ASK, reasonCode, 'production');
const ASK_UNKNOWN = (reasonCode) => decision(ASK, reasonCode, 'unknown');

const SAFE_PERMISSION_TYPES = new Set([
  'glob',
  'grep',
  'list',
  'lsp',
  'question',
  'skill',
  'task',
  'todowrite',
  'websearch',
]);

const SAFE_SCRIPT_PATTERN = /^(?:test(?::[^\s]+)?|lint(?::[^\s]+)?|type-?check(?::[^\s]+)?|check(?::[^\s]+)?|build(?::[^\s]+)?|format(?::check)?|fmt(?::check)?|validate(?::[^\s]+)?)$/i;
const PRIVATE_HOST_PATTERN = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/i;
const SENSITIVE_PATH_PATTERN = /(?:^|[\\/])(?:\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.config[\\/]gcloud)(?:[\\/]|$)|(?:^|[\\/])(?:id_rsa|id_ed25519|credentials|credentials\.json|secrets?\.json|auth\.json|\.npmrc|\.pypirc|\.netrc)(?:$|[\\/])|\.(?:pem|p12|pfx|key)$/i;
const ENV_FILE_PATTERN = /(?:^|[\\/])\.env(?:\.[^\\/]+)?$/i;
const SAFE_ENV_EXAMPLE_PATTERN = /(?:^|[\\/])\.env\.(?:example|sample|template|defaults?)$/i;

const cleanPattern = (value) => value.trim();

const candidatePathValues = (value) => {
  const cleaned = cleanPattern(value);
  if (!cleaned || /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) return [];
  const equalsIndex = cleaned.indexOf('=');
  return equalsIndex > 0 ? [cleaned, cleaned.slice(equalsIndex + 1)] : [cleaned];
};
const normalizePathLike = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const isAbsolutePathLike = (value) => (
  /^[a-z]:[\\/]/i.test(value)
  || /^\\\\/.test(value)
  || /^\//.test(value)
);

const containsExternalPath = (patterns, directory) => {
  const root = directory?.trim?.() ?? '';
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

const containsSensitivePath = (patterns) => patterns.some((rawPattern) => {
  const pattern = cleanPattern(rawPattern);
  if (!pattern) return false;
  if (SAFE_ENV_EXAMPLE_PATTERN.test(pattern)) return false;
  return ENV_FILE_PATTERN.test(pattern) || SENSITIVE_PATH_PATTERN.test(pattern);
});

const classifyWebFetch = (patterns) => {
  for (const rawPattern of patterns) {
    const pattern = cleanPattern(rawPattern);
    if (!pattern) continue;
    let url;
    try {
      url = new URL(pattern);
    } catch {
      return ASK_UNKNOWN('auto.ask.web-target-unknown');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ASK_SENSITIVE('auto.ask.web-non-http');
    }
    if (PRIVATE_HOST_PATTERN.test(url.hostname)) {
      return ASK_SENSITIVE('auto.ask.private-network');
    }
  }
  return ALLOW_ROUTINE('auto.allow.public-web-read');
};

const tokenize = (command) => {
  const matches = command.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+/g) ?? [];
  return matches.map((token) => {
    if (token.length >= 2 && ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")))) {
      return token.slice(1, -1);
    }
    return token;
  });
};

const classifyGit = (tokens) => {
  const action = (tokens[1] ?? '').toLowerCase();
  const args = tokens.slice(2).map((token) => token.toLowerCase());
  if (!action) return ASK_UNKNOWN('auto.ask.git-command-unknown');

  if (['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'describe'].includes(action)) {
    return ALLOW_ROUTINE('auto.allow.git-read');
  }
  if (action === 'branch' && (args.length === 0 || args.includes('--show-current') || args.includes('--list'))) {
    return ALLOW_ROUTINE('auto.allow.git-read');
  }
  if (action === 'remote' && (args.length === 0 || args.includes('-v') || args[0] === 'get-url')) {
    return ALLOW_ROUTINE('auto.allow.git-read');
  }
  if (action === 'config' && args.some((arg) => arg === '--get' || arg === '--get-all' || arg === '--list')) {
    return ALLOW_ROUTINE('auto.allow.git-read');
  }
  if (action === 'add' || (action === 'restore' && args.includes('--staged'))) {
    return ALLOW_ROUTINE('auto.allow.git-index');
  }
  return ASK_DESTRUCTIVE('auto.ask.protected-git');
};

const classifyPackageCommand = (tokens) => {
  const tool = (tokens[0] ?? '').toLowerCase();
  const action = (tokens[1] ?? '').toLowerCase();
  if (tool === 'bun' && action === 'test') return ALLOW_ROUTINE('auto.allow.validation');
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(tool) && action === 'test') {
    return ALLOW_ROUTINE('auto.allow.validation');
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(tool) && action === 'run') {
    const script = tokens[2] ?? '';
    return SAFE_SCRIPT_PATTERN.test(script)
      ? ALLOW_ROUTINE('auto.allow.validation')
      : ASK_UNKNOWN('auto.ask.project-script');
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(tool)
    && ['install', 'add', 'remove', 'uninstall', 'update', 'upgrade', 'publish', 'pack', 'link'].includes(action)) {
    return action === 'publish'
      ? ASK_PRODUCTION('auto.ask.publish')
      : ASK_SENSITIVE('auto.ask.dependency-mutation');
  }
  return null;
};

const classifyKnownValidation = (tokens) => {
  const tool = (tokens[0] ?? '').toLowerCase();
  const action = (tokens[1] ?? '').toLowerCase();
  if (['tsc', 'eslint', 'oxlint', 'vitest', 'jest', 'pytest', 'ruff', 'mypy'].includes(tool)) {
    return ALLOW_ROUTINE('auto.allow.validation');
  }
  if (tool === 'go' && action === 'test') return ALLOW_ROUTINE('auto.allow.validation');
  if (tool === 'cargo' && ['test', 'check', 'clippy', 'fmt'].includes(action)) return ALLOW_ROUTINE('auto.allow.validation');
  if (tool === 'dotnet' && ['test', 'build', 'format'].includes(action)) return ALLOW_ROUTINE('auto.allow.validation');
  if (['mvn', 'mvnw', 'gradle', 'gradlew'].includes(tool) && tokens.some((token) => /^(?:test|check|build)$/i.test(token))) {
    return ALLOW_ROUTINE('auto.allow.validation');
  }
  return null;
};

const classifyShellSegment = (segment, directory) => {
  const tokens = tokenize(segment);
  const executable = (tokens[0] ?? '').toLowerCase();
  if (!executable) return ASK_UNKNOWN('auto.ask.command-unknown');

  const argumentsOnly = tokens.slice(1);
  if (containsSensitivePath(argumentsOnly)) return ASK_SENSITIVE('auto.ask.sensitive-path');
  if (containsExternalPath(argumentsOnly, directory)) return ASK_SENSITIVE('auto.ask.external-directory');

  const lower = segment.toLowerCase();
  if (/\b(?:sudo|doas|pkexec|runas)\b|start-process[\s\S]*-verb\s+runas/i.test(segment)) {
    return ASK_PRIVILEGED('auto.ask.privilege-elevation');
  }
  if (/\b(?:rm|rmdir|del|erase|remove-item|format|diskpart|shutdown|reboot|restart-computer|stop-computer|taskkill)\b/i.test(segment)) {
    return ASK_DESTRUCTIVE('auto.ask.destructive-command');
  }
  if (/\b(?:kubectl\s+(?:apply|delete|patch|replace|rollout|scale)|terraform\s+(?:apply|destroy|import)|(?:aws|gcloud|az)\s+[^\r\n]*(?:create|delete|update|put|set|deploy|publish)|docker\s+(?:push|system\s+prune)|gh\s+(?:pr\s+merge|release\s+create))\b/i.test(lower)) {
    return ASK_PRODUCTION('auto.ask.production-mutation');
  }
  if (/\b(?:curl|wget|invoke-webrequest|invoke-restmethod)\b/i.test(executable)) {
    if (/\s(?:-x|--request)\s*(?:post|put|patch|delete)\b|\s(?:-d|--data|--data-raw|--data-binary|-f|--form|-t|--upload-file)\b/i.test(lower)) {
      return ASK_PRODUCTION('auto.ask.network-mutation');
    }
    return ASK_SENSITIVE('auto.ask.shell-network-access');
  }

  if (executable === 'git') return classifyGit(tokens);
  const packageDecision = classifyPackageCommand(tokens);
  if (packageDecision) return packageDecision;
  const validationDecision = classifyKnownValidation(tokens);
  if (validationDecision) return validationDecision;

  if (['pwd', 'ls', 'dir', 'get-location', 'get-childitem', 'get-child-item', 'cat', 'type', 'get-content', 'head', 'tail', 'wc', 'rg', 'grep', 'findstr', 'select-string', 'where', 'which', 'get-command', 'echo', 'printf'].includes(executable)) {
    return ALLOW_ROUTINE('auto.allow.shell-read');
  }
  if (tokens.length > 1 && ['node', 'python', 'python3', 'ruby', 'java', 'go', 'rustc', 'cargo', 'dotnet'].includes(executable)
    && tokens.slice(1).every((token) => /^(?:--version|-v|version)$/i.test(token))) {
    return ALLOW_ROUTINE('auto.allow.tool-version');
  }
  return ASK_UNKNOWN('auto.ask.command-unknown');
};

const classifyShell = (patterns, directory) => {
  const command = patterns.map(cleanPattern).filter(Boolean).join(' && ');
  if (!command) return ASK_UNKNOWN('auto.ask.command-unknown');
  if (/\|\||(?<!&)&(?!&)|[|><`\r\n]|\$\(/.test(command)) {
    return ASK_UNKNOWN('auto.ask.shell-syntax');
  }
  const segments = command.split(/\s*(?:&&|;)\s*/).filter(Boolean);
  if (segments.length === 0) return ASK_UNKNOWN('auto.ask.command-unknown');
  for (const segment of segments) {
    const result = classifyShellSegment(segment, directory);
    if (result.effect !== ALLOW) return result;
  }
  return ALLOW_ROUTINE(segments.length > 1 ? 'auto.allow.command-chain' : classifyShellSegment(segments[0], directory).reasonCode);
};

export const classifyAutoPermission = ({ permission, patterns = [], directory = null } = {}) => {
  const type = permission?.trim().toLowerCase() ?? '';
  const normalizedPatterns = patterns;

  if (!type) return ASK_UNKNOWN('auto.ask.permission-unknown');
  if (type === 'external_directory') return ASK_SENSITIVE('auto.ask.external-directory');
  if (type === 'doom_loop') return ASK_SENSITIVE('auto.ask.doom-loop');
  if (type === 'bash') return classifyShell(normalizedPatterns, directory);
  if (type === 'webfetch') return classifyWebFetch(normalizedPatterns);
  if (type === 'read' || type === 'edit') {
    if (containsSensitivePath(normalizedPatterns)) return ASK_SENSITIVE('auto.ask.sensitive-path');
    if (containsExternalPath(normalizedPatterns, directory)) return ASK_SENSITIVE('auto.ask.external-directory');
    return ALLOW_ROUTINE(type === 'read' ? 'auto.allow.read' : 'auto.allow.edit');
  }
  if (SAFE_PERMISSION_TYPES.has(type)) return ALLOW_ROUTINE(`auto.allow.${type}`);
  return ASK_UNKNOWN('auto.ask.permission-unknown');
};
