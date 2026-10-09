import { resolveIvaldiDataDirectory } from '../ivaldi-data-dir.js';
import { createRealpathCache } from '../path-realpath-cache.js';
import nodeFsPromises from 'node:fs/promises';
import nodePath from 'node:path';

const OUTSIDE_FILE_GRANT_TTL_MS = 10 * 60 * 1000;

const outsideFileGrants = new Map();

const pruneOutsideFileGrants = () => {
  const now = Date.now();
  for (const [token, grant] of outsideFileGrants.entries()) {
    if (!grant || grant.expiresAt <= now) {
      outsideFileGrants.delete(token);
    }
  }
};

const isOsPermissionError = (error) => (
  error
  && typeof error === 'object'
  && (error.code === 'EACCES' || error.code === 'EPERM')
);

const sendOsPermissionDenied = (res, message) => (
  res.status(403).json({ error: message, reason: 'os-permission' })
);

export const mintOutsideFileGrant = async (targetPath, {
  scopes = ['stat', 'read', 'raw'],
  fsPromises = nodeFsPromises,
  path = nodePath,
  crypto = globalThis.crypto,
} = {}) => {
  const raw = typeof targetPath === 'string' ? targetPath.trim() : '';
  if (!raw) {
    throw new Error('Path is required');
  }
  const canonicalPath = await fsPromises.realpath(raw);
  const stats = await fsPromises.stat(canonicalPath);
  if (!stats.isFile()) {
    throw new Error('Outside file grants require a file path');
  }
  pruneOutsideFileGrants();
  const token = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const normalizedScopes = new Set(
    (Array.isArray(scopes) ? scopes : [])
      .filter((scope) => typeof scope === 'string' && scope.trim())
      .map((scope) => scope.trim())
  );
  if (normalizedScopes.size === 0) {
    normalizedScopes.add('read');
  }
  const grant = {
    canonicalPath,
    base: path.dirname(canonicalPath),
    scopes: normalizedScopes,
    expiresAt: Date.now() + OUTSIDE_FILE_GRANT_TTL_MS,
  };
  outsideFileGrants.set(token, grant);
  return {
    path: canonicalPath,
    outsideFileGrant: token,
    expiresAt: grant.expiresAt,
  };
};

const resolveOutsideFileGrant = async ({ token, targetPath, scope, fsPromises }) => {
  pruneOutsideFileGrants();
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, error: 'Outside workspace file access requires a grant' };
  }
  const grant = outsideFileGrants.get(token.trim());
  if (!grant) {
    return { ok: false, error: 'Outside workspace file grant is invalid or expired' };
  }
  if (!grant.scopes.has(scope)) {
    return { ok: false, error: 'Outside workspace file grant does not allow this operation' };
  }
  const canonicalPath = await fsPromises.realpath(targetPath);
  if (canonicalPath !== grant.canonicalPath) {
    return { ok: false, error: 'Outside workspace file grant does not match requested path' };
  }
  return { ok: true, base: grant.base, resolved: canonicalPath, granted: true };
};

const createGitCheckIgnoreTimeoutMs = () => {
  const raw = Number(process.env.OPENCHAMBER_GIT_CHECK_IGNORE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 2500;
};

const createUploadMaxBytes = () => {
  const raw = Number(process.env.OPENCHAMBER_FS_UPLOAD_MAX_BYTES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 100 * 1024 * 1024;
};

// User files that can run script when a browser opens them as a document.
// Served same-origin, they would run with the app's privileges: a repository's
// HTML file could drive the terminal API. The CSP sandbox gives them an opaque
// origin instead. Not applied to PDF, which Chromium refuses to render in a
// sandboxed document.
const SCRIPTABLE_DOCUMENT_MIME_TYPES = new Set(['text/html', 'image/svg+xml', 'application/xml', 'text/xml', 'application/xhtml+xml']);
const USER_DOCUMENT_SANDBOX_CSP = 'sandbox allow-scripts allow-forms';

const setUserFileSecurityHeaders = (res, mimeType) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (SCRIPTABLE_DOCUMENT_MIME_TYPES.has(mimeType)) {
    res.setHeader('Content-Security-Policy', USER_DOCUMENT_SANDBOX_CSP);
  }
};

const FILE_MIME_MAP = Object.freeze({
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
});

const MAX_SERVE_BYTES = 100 * 1024 * 1024;

const streamUploadBody = async (req, handle, maxBytes) => {
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBytes) {
      req.resume?.();
      throw Object.assign(new Error('Upload exceeds the maximum allowed size'), { uploadTooLarge: true });
    }

    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, null);
      if (!Number.isFinite(bytesWritten) || bytesWritten <= 0) {
        throw new Error('Failed to write upload');
      }
      offset += bytesWritten;
    }
  }
};

const isPathWithinRoot = (resolvedPath, rootPath, path, os) => {
  const resolvedRoot = path.resolve(rootPath || os.homedir());
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  return true;
};

const resolveWorkspacePath = ({ targetPath, baseDirectory, path, os, normalizeDirectoryPath, openchamberUserConfigRoot }) => {
  const normalized = normalizeDirectoryPath(targetPath);
  if (!normalized || typeof normalized !== 'string') {
    return { ok: false, error: 'Path is required' };
  }

  const resolved = path.resolve(normalized);
  const resolvedBase = path.resolve(baseDirectory || os.homedir());

  if (isPathWithinRoot(resolved, resolvedBase, path, os)) {
    return { ok: true, base: resolvedBase, resolved };
  }

  if (isPathWithinRoot(resolved, openchamberUserConfigRoot, path, os)) {
    return { ok: true, base: path.resolve(openchamberUserConfigRoot), resolved };
  }

  return { ok: false, error: 'Path is outside of active workspace' };
};

const resolveWorkspacePathFromWorktrees = async ({ targetPath, baseDirectory, path, os, normalizeDirectoryPath }) => {
  const normalized = normalizeDirectoryPath(targetPath);
  if (!normalized || typeof normalized !== 'string') {
    return { ok: false, error: 'Path is required' };
  }

  const resolved = path.resolve(normalized);
  const resolvedBase = path.resolve(baseDirectory || os.homedir());

  try {
    const { getWorktrees } = await import('../git/index.js');
    const worktrees = await getWorktrees(resolvedBase);

    for (const worktree of worktrees) {
      const candidatePath = typeof worktree?.path === 'string'
        ? worktree.path
        : (typeof worktree?.worktree === 'string' ? worktree.worktree : '');
      const candidate = normalizeDirectoryPath(candidatePath);
      if (!candidate) {
        continue;
      }
      const candidateResolved = path.resolve(candidate);
      if (isPathWithinRoot(resolved, candidateResolved, path, os)) {
        return { ok: true, base: candidateResolved, resolved };
      }
    }
  } catch (error) {
    console.warn('Failed to resolve worktree roots:', error);
  }

  return { ok: false, error: 'Path is outside of active workspace' };
};

const resolveWorkspacePathFromContext = async ({ req, targetPath, resolveProjectDirectory, path, os, normalizeDirectoryPath, openchamberUserConfigRoot }) => {
  const resolvedProject = await resolveProjectDirectory(req);
  if (!resolvedProject.directory) {
    return { ok: false, error: resolvedProject.error || 'Active workspace is required' };
  }

  const resolved = resolveWorkspacePath({
    targetPath,
    baseDirectory: resolvedProject.directory,
    path,
    os,
    normalizeDirectoryPath,
    openchamberUserConfigRoot,
  });
  if (resolved.ok || resolved.error !== 'Path is outside of active workspace') {
    return resolved;
  }

  return resolveWorkspacePathFromWorktrees({
    targetPath,
    baseDirectory: resolvedProject.directory,
    path,
    os,
    normalizeDirectoryPath,
  });
};

const deriveCloneDirectoryName = (remoteUrl) => {
  const remote = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
  if (!remote) return '';
  const withoutQuery = remote.split(/[?#]/, 1)[0] || remote;
  const match = withoutQuery.match(/([^/:]+?)(?:\.git)?\/?$/);
  return match?.[1]?.trim() || '';
};

const resolveCloneGitIdentity = async (gitIdentityId) => {
  const id = typeof gitIdentityId === 'string' ? gitIdentityId.trim() : '';
  if (!id) return null;
  const { getProfile, getGlobalIdentity } = await import('../git/index.js');
  if (id === 'global') {
    const globalIdentity = await getGlobalIdentity();
    if (!globalIdentity?.userName || !globalIdentity?.userEmail) return null;
    return {
      id: 'global',
      name: 'Global Identity',
      userName: globalIdentity.userName,
      userEmail: globalIdentity.userEmail,
      sshKey: globalIdentity.sshCommand ? globalIdentity.sshCommand.replace('ssh -i ', '') : null,
    };
  }
  return getProfile(id) || null;
};

const escapeCloneSshKeyPath = (sshKeyPath) => {
  const raw = String(sshKeyPath || '').trim();
  if (!raw) return '';
  const normalized = process.platform === 'win32' ? raw.replace(/\\/g, '/') : raw;
  const dangerousChars = /[`$!"';&|<>(){}[\]*?#~]/;
  if (dangerousChars.test(normalized)) {
    throw new Error(`SSH key path contains invalid characters: ${raw}`);
  }
  if (process.platform === 'win32') {
    const driveMatch = normalized.match(/^([A-Za-z]):\//);
    const unixPath = driveMatch ? `/${driveMatch[1].toLowerCase()}${normalized.slice(2)}` : normalized;
    return `'${unixPath}'`;
  }
  return `'${normalized.replace(/'/g, "'\\''")}'`;
};

const resolveReadPathFromContext = async ({ req, targetPath, scope, resolveProjectDirectory, path, os, fsPromises, normalizeDirectoryPath, openchamberUserConfigRoot }) => {
  if (req.query?.allowOutsideWorkspace === 'true') {
    const normalized = normalizeDirectoryPath(targetPath);
    if (!normalized || typeof normalized !== 'string') {
      return { ok: false, error: 'Path is required' };
    }
    const resolved = path.resolve(normalized);
    return resolveOutsideFileGrant({
      token: req.query?.outsideFileGrant,
      targetPath: resolved,
      scope,
      fsPromises,
    });
  }

  return resolveWorkspacePathFromContext({
    req,
    targetPath,
    resolveProjectDirectory,
    path,
    os,
    normalizeDirectoryPath,
    openchamberUserConfigRoot,
  });
};

export const registerFsRoutes = (app, dependencies) => {
  const {
    os,
    path,
    fsPromises,
    spawn,
    platform = process.platform,
    crypto,
    normalizeDirectoryPath,
    resolveProjectDirectory,
    buildAugmentedPath,
    resolveGitBinaryForSpawn,
    openchamberUserConfigRoot,
  } = dependencies;
  const realpathCache = createRealpathCache({
    realpath: fsPromises.realpath.bind(fsPromises),
  });

  const isUnlistableDirectory = async (directoryPath) => {
    try {
      const handle = await fsPromises.opendir(directoryPath);
      await handle.close();
      return false;
    } catch (error) {
      return error?.code === 'EPERM' || error?.code === 'EACCES';
    }
  };

  const spawnDetached = (command, args) => new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { windowsHide: true, stdio: 'ignore', detached: true });
    } catch (error) {
      reject(new Error('Failed to launch file browser', { cause: error }));
      return;
    }
    const onError = (error) => {
      child.removeListener('spawn', onSpawn);
      reject(new Error('Failed to launch file browser', { cause: error }));
    };
    const onSpawn = () => {
      child.removeListener('error', onError);
      child.unref();
      resolve();
    };
    child.once('error', onError);
    child.once('spawn', onSpawn);
  });

  const gitCheckIgnoreTimeoutMs = createGitCheckIgnoreTimeoutMs();
  app.get('/api/fs/home', (_req, res) => {
    try {
      const home = os.homedir();
      if (!home || typeof home !== 'string' || home.length === 0) {
        return res.status(500).json({ error: 'Failed to resolve home directory' });
      }
      return res.json({ home, dataDirectory: resolveIvaldiDataDirectory() });
    } catch (error) {
      console.error('Failed to resolve home directory:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to resolve home directory' });
    }
  });

  app.post('/api/fs/mkdir', async (req, res) => {
    try {
      const { path: dirPath, allowOutsideWorkspace } = req.body ?? {};
      if (typeof dirPath !== 'string' || !dirPath.trim()) {
        return res.status(400).json({ error: 'Path is required' });
      }

      let resolvedPath = '';
      if (allowOutsideWorkspace) {
        console.warn('Rejected outside-workspace mkdir without trusted directory grant');
        return res.status(403).json({ error: 'Outside workspace directory creation requires a grant' });
      } else {
        const resolved = await resolveWorkspacePathFromContext({
          req,
          targetPath: dirPath,
          resolveProjectDirectory,
          path,
          os,
          normalizeDirectoryPath,
          openchamberUserConfigRoot,
        });
        if (!resolved.ok) {
          return res.status(400).json({ error: resolved.error });
        }
        resolvedPath = resolved.resolved;
      }

      await fsPromises.mkdir(resolvedPath, { recursive: true });
      return res.json({ success: true, path: resolvedPath });
    } catch (error) {
      if (isOsPermissionError(error)) {
        return sendOsPermissionDenied(res, 'Access denied');
      }
      console.error('Failed to create directory:', error);
      return res.status(500).json({ error: error.message || 'Failed to create directory' });
    }
  });

  app.post('/api/fs/clone', async (req, res) => {
    try {
      const { remoteUrl, destinationPath, gitIdentityId } = req.body ?? {};
      const remote = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
      const destination = typeof destinationPath === 'string' ? destinationPath.trim() : '';
      if (!remote) {
        return res.status(400).json({ error: 'Repository URL is required' });
      }
      if (!destination) {
        return res.status(400).json({ error: 'Destination path is required' });
      }

      let resolvedDestination = path.resolve(normalizeDirectoryPath(destination));
      let parentPath = path.dirname(resolvedDestination);
      let directoryName = path.basename(resolvedDestination);

      const cloneIntoDestinationDirectory = destination.endsWith('/') || destination.endsWith('\\');
      if (cloneIntoDestinationDirectory) {
        const inferredName = deriveCloneDirectoryName(remote);
        if (!inferredName) {
          return res.status(400).json({ error: 'Could not infer repository directory name from URL' });
        }
        parentPath = resolvedDestination;
        directoryName = inferredName;
        resolvedDestination = path.join(parentPath, directoryName);
      } else {
        try {
          const stat = await fsPromises.stat(resolvedDestination);
          if (stat.isDirectory()) {
            const inferredName = deriveCloneDirectoryName(remote);
            if (!inferredName) {
              return res.status(400).json({ error: 'Could not infer repository directory name from URL' });
            }
            parentPath = resolvedDestination;
            directoryName = inferredName;
            resolvedDestination = path.join(parentPath, directoryName);
          }
        } catch (error) {
          if (!error || error.code !== 'ENOENT') {
            throw error;
          }
        }
      }
      if (!directoryName || directoryName === '.' || directoryName === '..') {
        return res.status(400).json({ error: 'Destination path must include a directory name' });
      }

      const identity = await resolveCloneGitIdentity(gitIdentityId);
      const gitArgs = ['clone', '--', remote, directoryName];
      const sshKeyPath = typeof identity?.sshKey === 'string' ? identity.sshKey.trim() : '';
      if (sshKeyPath) {
        gitArgs.unshift(`core.sshCommand=ssh -i ${escapeCloneSshKeyPath(sshKeyPath)} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new`);
        gitArgs.unshift('-c');
      }

      await fsPromises.mkdir(parentPath, { recursive: true });
      try {
        await fsPromises.access(resolvedDestination);
        return res.status(409).json({ error: 'Destination path already exists' });
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          throw error;
        }
      }

      const output = await new Promise((resolve, reject) => {
        const child = spawn(resolveGitBinaryForSpawn(), gitArgs, {
          cwd: parentPath,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: buildAugmentedPath ? buildAugmentedPath(process.env.PATH || '') : process.env.PATH,
            GIT_TERMINAL_PROMPT: '0',
          },
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
          const combined = `${stdout}\n${stderr}`.trim();
          if (code === 0) {
            resolve(combined);
            return;
          }
          const message = combined || `git clone failed with exit code ${code}`;
          reject(new Error(message));
        });
      });

      if (identity?.userName && identity?.userEmail) {
        try {
          const { setLocalIdentity } = await import('../git/index.js');
          await setLocalIdentity(resolvedDestination, identity);
        } catch (error) {
          console.warn('Failed to apply git identity after clone:', error);
        }
      }

      return res.json({ success: true, path: resolvedDestination, output });
    } catch (error) {
      console.error('Failed to clone repository:', error);
      return res.status(500).json({ error: error.message || 'Failed to clone repository' });
    }
  });

  app.get('/api/fs/stat', async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    const optional = req.query.optional === 'true';
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolved = await resolveReadPathFromContext({
        req,
        targetPath: filePath,
        scope: 'stat',
        resolveProjectDirectory,
        path,
        os,
        fsPromises,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        if (req.query?.allowOutsideWorkspace === 'true') {
          console.warn(`Rejected outside-workspace stat: ${resolved.error}`);
        }
        return res.status(400).json({ error: resolved.error });
      }

      const canonicalPath = await fsPromises.realpath(resolved.resolved);

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Specified path is not a file' });
      }

      return res.json({ path: canonicalPath, isFile: true, size: stats.size, mtimeMs: stats.mtimeMs });
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        if (optional) {
          return res.json({ path: filePath, exists: false });
        }
        return res.status(404).json({ error: 'File not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access to file denied');
      }
      console.error('Failed to stat file:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to stat file' });
    }
  });

  app.get('/api/fs/read', async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    const optional = req.query.optional === 'true';
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolved = await resolveReadPathFromContext({
        req,
        targetPath: filePath,
        scope: 'read',
        resolveProjectDirectory,
        path,
        os,
        fsPromises,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        if (req.query?.allowOutsideWorkspace === 'true') {
          console.warn(`Rejected outside-workspace read: ${resolved.error}`);
        }
        return res.status(400).json({ error: resolved.error });
      }

      const canonicalPath = await fsPromises.realpath(resolved.resolved);

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Specified path is not a file' });
      }

      let content = await fsPromises.readFile(canonicalPath, 'utf8');
      // Retry empty reads — concurrent writer may have truncated the file
      // between our stat and read (O_TRUNC window). If the file existed with
      // content at stat time but we read nothing, the writer hasn't finished
      // writing yet.
      if (content.length === 0 && stats.size > 0) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          content = await fsPromises.readFile(canonicalPath, 'utf8');
          if (content.length > 0) break;
        }
        if (content.length === 0) {
          console.warn(`Read retry exhausted for ${canonicalPath}: stat reported ${stats.size} bytes but content is empty`);
        }
      }
      return res.type('text/plain').send(content);
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        if (optional) {
          return res.type('text/plain').send('');
        }
        return res.status(404).json({ error: 'File not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access to file denied');
      }
      console.error('Failed to read file:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to read file' });
    }
  });

  app.get('/api/fs/raw', async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolved = await resolveReadPathFromContext({
        req,
        targetPath: filePath,
        scope: 'raw',
        resolveProjectDirectory,
        path,
        os,
        fsPromises,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        if (req.query?.allowOutsideWorkspace === 'true') {
          console.warn(`Rejected outside-workspace raw read: ${resolved.error}`);
        }
        return res.status(400).json({ error: resolved.error });
      }

      const canonicalPath = await fsPromises.realpath(resolved.resolved);

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Specified path is not a file' });
      }

      const ext = path.extname(canonicalPath).toLowerCase();
      const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.bmp': 'image/bmp',
        '.avif': 'image/avif',
        '.pdf': 'application/pdf',
      };
      const mimeType = mimeMap[ext] || 'application/octet-stream';

      const download = req.query.download === 'true';
      if (download) {
        const fileName = path.basename(canonicalPath);
        // RFC 5987: use filename*= for non-ASCII filenames, with ASCII-only
        // filename= as fallback for older clients.
        const asciiOnly = fileName.replace(/[^\u0000-\u007F]/g, '');
        const fallback = asciiOnly || 'file';
        // Percent-encode the raw UTF-8 bytes for filename*=
        const encoded = encodeURIComponent(fileName);
        res.setHeader('Content-Disposition', `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
      }

      const content = await fsPromises.readFile(canonicalPath);
      res.setHeader('Cache-Control', 'no-store');
      setUserFileSecurityHeaders(res, mimeType);
      if (resolved.granted) {
        res.setHeader('Referrer-Policy', 'no-referrer');
      }
      return res.type(mimeType).send(content);
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access to file denied');
      }
      console.error('Failed to read raw file:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to read file' });
    }
  });

  app.get(/^\/api\/fs\/serve\/(.+)$/, async (req, res) => {
    const rawPath = req.params[0] || '';
    if (!rawPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      if (req.query?.allowOutsideWorkspace === 'true') {
        return res.status(403).json({ error: 'allowOutsideWorkspace is not permitted for this endpoint' });
      }

      const filePath = path.resolve('/', rawPath);
      const resolved = await resolveReadPathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      const canonicalPath = await fsPromises.realpath(resolved.resolved);

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Specified path is not a file' });
      }
      if (stats.size > MAX_SERVE_BYTES) {
        return res.status(413).json({ error: 'File too large to serve' });
      }

      const ext = path.extname(canonicalPath).toLowerCase();
      const mimeType = FILE_MIME_MAP[ext] || 'application/octet-stream';
      const content = await fsPromises.readFile(canonicalPath);
      res.setHeader('Cache-Control', 'no-store');
      setUserFileSecurityHeaders(res, mimeType);
      return res.type(mimeType).send(content);
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access to file denied');
      }
      console.error('Failed to serve file:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to serve file' });
    }
  });

  app.post('/api/fs/write', async (req, res) => {
    const { path: filePath, content } = req.body || {};
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      const writePath = await fsPromises.realpath(resolved.resolved).catch((error) => {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
          return resolved.resolved;
        }
        throw error;
      });
      const canonicalBase = await fsPromises.realpath(resolved.base).catch(() => path.resolve(resolved.base));
      if (!isPathWithinRoot(writePath, canonicalBase, path, os)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const existing = await fsPromises.readFile(writePath, 'utf8').catch(() => null);
      if (existing === content) {
        return res.json({ success: true, path: resolved.resolved });
      }

      await fsPromises.mkdir(path.dirname(writePath), { recursive: true });

      // Atomic write: write to temp then rename to avoid concurrent readers
      // seeing an empty file during the O_TRUNC window of direct writeFile.
      const tmp = `${writePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await fsPromises.writeFile(tmp, content, 'utf8');
        await fsPromises.rename(tmp, writePath);
      } catch (error) {
        await fsPromises.unlink(tmp).catch(() => {});
        throw error;
      }
      return res.json({ success: true, path: resolved.resolved });
    } catch (error) {
      const err = error;
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access denied');
      }
      console.error('Failed to write file:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to write file' });
    }
  });

  app.post('/api/fs/upload', async (req, res) => {
    const filePath = typeof req.query?.path === 'string' ? req.query.path.trim() : '';
    const overwrite = req.query?.overwrite === 'true';
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/octet-stream')) {
      return res.status(415).json({ error: 'Content-Type must be application/octet-stream' });
    }

    const maxUploadBytes = createUploadMaxBytes();
    const declaredSize = Number(req.headers?.['content-length']);
    if (Number.isFinite(declaredSize) && declaredSize > maxUploadBytes) {
      req.resume?.();
      return res.status(413).json({ error: `File exceeds maximum size of ${maxUploadBytes} bytes` });
    }

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      const canonicalBase = await fsPromises.realpath(resolved.base).catch(() => path.resolve(resolved.base));
      const requestedParent = path.dirname(resolved.resolved);
      const canonicalParent = await fsPromises.realpath(requestedParent);
      if (!isPathWithinRoot(canonicalParent, canonicalBase, path, os)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const existingPath = await fsPromises.realpath(resolved.resolved).catch((error) => {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });
      const writePath = existingPath || path.join(canonicalParent, path.basename(resolved.resolved));
      if (!isPathWithinRoot(writePath, canonicalBase, path, os)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (existingPath) {
        const stats = await fsPromises.stat(existingPath);
        if (stats.isDirectory()) {
          return res.status(400).json({ error: 'Specified path is a directory' });
        }
        if (!overwrite) {
          req.resume?.();
          return res.status(409).json({ error: 'File already exists', reason: 'already-exists' });
        }
      }

      const tmp = `${writePath}.upload-${crypto.randomUUID()}`;
      let tempExists = false;
      try {
        const handle = await fsPromises.open(tmp, 'wx');
        tempExists = true;
        let streamError = null;
        try {
          await streamUploadBody(req, handle, maxUploadBytes);
        } catch (error) {
          streamError = error;
        }
        try {
          await handle.close();
        } catch (error) {
          if (!streamError) throw error;
        }
        if (streamError) throw streamError;

        if (overwrite) {
          await fsPromises.rename(tmp, writePath);
        } else {
          // A same-directory hard link commits without replacing a target that
          // appeared after the existence check. The temp file is already fully
          // flushed, so readers never observe a partial upload.
          await fsPromises.link(tmp, writePath);
          await fsPromises.unlink(tmp).catch(() => {});
        }
        tempExists = false;
      } catch (error) {
        if (tempExists) {
          await fsPromises.unlink(tmp).catch(() => {});
        }
        throw error;
      }

      return res.json({ success: true, path: resolved.resolved });
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'EEXIST') {
        return res.status(409).json({ error: 'File already exists', reason: 'already-exists' });
      }
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Destination directory not found', reason: 'not-found' });
      }
      if (err && typeof err === 'object' && err.uploadTooLarge) {
        return res.status(413).json({ error: `File exceeds maximum size of ${maxUploadBytes} bytes` });
      }
      if (err && typeof err === 'object' && (err.code === 'EISDIR' || err.code === 'ENOTDIR')) {
        return res.status(400).json({ error: 'Specified path is a directory' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access denied');
      }
      console.error('Failed to upload file:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to upload file' });
    }
  });

  app.post('/api/fs/delete', async (req, res) => {
    const { path: targetPath } = req.body || {};
    if (!targetPath || typeof targetPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath,
        resolveProjectDirectory,
        path,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      await fsPromises.rm(resolved.resolved, { recursive: true, force: true });
      return res.json({ success: true, path: resolved.resolved });
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File or directory not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access denied');
      }
      console.error('Failed to delete path:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to delete path' });
    }
  });

  app.post('/api/fs/rename', async (req, res) => {
    const { oldPath, newPath } = req.body || {};
    if (!oldPath || typeof oldPath !== 'string') {
      return res.status(400).json({ error: 'oldPath is required' });
    }
    if (!newPath || typeof newPath !== 'string') {
      return res.status(400).json({ error: 'newPath is required' });
    }

    try {
      const resolvedOld = await resolveWorkspacePathFromContext({
        req,
        targetPath: oldPath,
        resolveProjectDirectory,
        path,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolvedOld.ok) {
        return res.status(400).json({ error: resolvedOld.error });
      }

      const resolvedNew = await resolveWorkspacePathFromContext({
        req,
        targetPath: newPath,
        resolveProjectDirectory,
        path,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolvedNew.ok) {
        return res.status(400).json({ error: resolvedNew.error });
      }

      if (resolvedOld.base !== resolvedNew.base) {
        return res.status(400).json({ error: 'Source and destination must share the same workspace root' });
      }

      await fsPromises.rename(resolvedOld.resolved, resolvedNew.resolved);
      return res.json({ success: true, path: resolvedNew.resolved });
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Source path not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access denied');
      }
      console.error('Failed to rename path:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to rename path' });
    }
  });

  app.post('/api/fs/reveal', async (req, res) => {
    const { path: targetPath } = req.body || {};
    if (!targetPath || typeof targetPath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolved = path.resolve(targetPath.trim());
      await fsPromises.access(resolved);

      if (platform === 'darwin') {
        const stat = await fsPromises.stat(resolved);
        if (stat.isDirectory()) {
          await spawnDetached('open', [resolved]);
        } else {
          await spawnDetached('open', ['-R', resolved]);
        }
      } else if (platform === 'win32') {
        const stat = await fsPromises.stat(resolved);
        const escapedPath = resolved.replace(/'/g, "''");
        const explorerArg = stat.isDirectory() ? escapedPath : `/select,${escapedPath}`;
        const command = `Start-Process -FilePath explorer.exe -ArgumentList '${explorerArg}'`;
        await new Promise((resolve, reject) => {
          const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
            windowsHide: true,
            stdio: 'ignore',
          });
          child.once('error', reject);
          child.once('exit', (code) => {
            if (code === 0) {
              resolve();
              return;
            }
            reject(new Error(`Explorer launch failed with code ${code ?? 'unknown'}`));
          });
        });
      } else {
        const stat = await fsPromises.stat(resolved);
        const dir = stat.isDirectory() ? resolved : path.dirname(resolved);
        await spawnDetached('xdg-open', [dir]);
      }

      return res.json({ success: true, path: resolved });
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Path not found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access to path denied');
      }
      console.error('Failed to reveal path:', error);
      return res.status(500).json({ error: (error && error.message) || 'Failed to reveal path' });
    }
  });

  app.get('/api/fs/list', async (req, res) => {
    const rawPath = typeof req.query.path === 'string' && req.query.path.trim().length > 0
      ? req.query.path.trim()
      : os.homedir();
    const respectGitignore = req.query.respectGitignore === 'true';
    // Logical (requested) path stays in the caller's path space. Realpath is
    // only used to read directory contents — returning real paths for entries
    // breaks file-tree expansion when listing through a symlink, because the
    // UI rejects expanded paths that fall outside the workspace root.
    let requestedPath = '';
    let resolvedPath = '';

    const isPlansDirectory = (value) => {
      if (!value || typeof value !== 'string') return false;
      const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
      return normalized.endsWith('/.opencode/plans') || normalized.endsWith('.opencode/plans');
    };

    try {
      requestedPath = path.resolve(normalizeDirectoryPath(rawPath));
      resolvedPath = await realpathCache.resolve(requestedPath);

      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified path is not a directory', reason: 'not-directory' });
      }

      const dirents = await fsPromises.readdir(resolvedPath, { withFileTypes: true });
      let ignoredPaths = new Set();
      if (respectGitignore) {
        try {
          const pathsToCheck = dirents.map((d) => d.name);
          if (pathsToCheck.length > 0) {
            try {
              const result = await new Promise((resolve) => {
                const child = spawn(resolveGitBinaryForSpawn(), ['check-ignore', '--', ...pathsToCheck], {
                  cwd: resolvedPath,
                  windowsHide: true,
                  stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stdout = '';
                let settled = false;
                let timeout = null;
                const finish = (value) => {
                  if (settled) return;
                  settled = true;
                  if (timeout) clearTimeout(timeout);
                  resolve(value);
                };

                if (gitCheckIgnoreTimeoutMs > 0) {
                  timeout = setTimeout(() => {
                    try {
                      child.kill('SIGKILL');
                    } catch {
                    }
                    finish('');
                  }, gitCheckIgnoreTimeoutMs);
                }

                child.stdout.on('data', (data) => { stdout += data.toString(); });
                child.on('close', () => finish(stdout));
                child.on('error', () => finish(''));
              });

              result.split('\n').filter(Boolean).forEach((name) => {
                const fullPath = path.join(resolvedPath, name.trim());
                ignoredPaths.add(fullPath);
              });
            } catch {
            }
          }
        } catch {
        }
      }

      const entries = await Promise.all(
        dirents.map(async (dirent) => {
          const physicalEntryPath = path.join(resolvedPath, dirent.name);
          if (respectGitignore && ignoredPaths.has(physicalEntryPath)) {
            return null;
          }

          let isDirectory = dirent.isDirectory();
          const isSymbolicLink = dirent.isSymbolicLink();

          if (!isDirectory && isSymbolicLink) {
            try {
              const linkStats = await fsPromises.stat(physicalEntryPath);
              isDirectory = linkStats.isDirectory();
            } catch {
              isDirectory = false;
            }
          }

          // Windows keeps legacy junctions such as "Cookies" or "My Documents"
          // in the profile and denies listing them. They can never be opened,
          // so they only add noise to pickers and file trees.
          if (platform === 'win32' && isSymbolicLink && isDirectory && await isUnlistableDirectory(physicalEntryPath)) {
            return null;
          }

          return {
            name: dirent.name,
            path: path.join(requestedPath, dirent.name),
            isDirectory,
            isFile: dirent.isFile(),
            isSymbolicLink,
          };
        })
      );

      return res.json({
        path: requestedPath,
        entries: entries.filter(Boolean),
      });
    } catch (error) {
      const err = error;
      const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
      const isPlansPath = code === 'ENOENT' && (
        isPlansDirectory(resolvedPath)
        || isPlansDirectory(requestedPath)
        || isPlansDirectory(rawPath)
      );
      if (code !== 'ENOENT') {
        console.error('Failed to list directory:', error);
      }
      if (code === 'ENOENT') {
        if (isPlansPath) {
          return res.json({ path: requestedPath || resolvedPath || rawPath, entries: [] });
        }
        return res.status(404).json({ error: 'Directory not found', reason: 'not-found' });
      }
      if (isOsPermissionError(err)) {
        return sendOsPermissionDenied(res, 'Access to directory denied');
      }
      return res.status(500).json({ error: (error && error.message) || 'Failed to list directory' });
    }
  });
};
