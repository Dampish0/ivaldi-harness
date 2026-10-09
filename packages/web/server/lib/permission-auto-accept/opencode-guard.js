import { parse as parseJsonc } from 'jsonc-parser';
import { pathToFileURL } from 'node:url';

// OpenCode allows edits and shell commands unless a rule says otherwise, so a
// Manual session would never be asked about them. This plugin appends a guard
// block to each session's rules before every prompt. The block makes edit and
// bash requests ask, keeps every deny the agent or session already had, and
// leaves the answer to the permission responder, which decides by mode.
//
// OpenCode evaluates rules last match wins, and session rules come after the
// agent's. The block starts with a catch-all ask for each guarded permission,
// then copies every agent and session rule that applies to it in order, with
// allow turned into ask. Inside the block the result is the agent's own answer
// with allow replaced by ask, and the block shadows everything before it.
//
// Both markers are deny rules on names no tool uses. A subagent inherits only
// deny rules, so it inherits both markers and can drop the whole parent block
// before it builds its own.
const createPluginSource = () => String.raw`
const GUARDED_PERMISSIONS = ["edit", "bash"]
const BLOCK_START = "ivaldi.guard.start"
const BLOCK_END = "ivaldi.guard.end"

// Same as OpenCode's Wildcard.match, so a copied rule matches the same requests.
function wildcardMatch(input, pattern) {
  const normalized = input.replaceAll("\\", "/")
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^$|{}()[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s").test(normalized)
}

function isRule(rule) {
  return Boolean(rule)
    && typeof rule.permission === "string"
    && typeof rule.pattern === "string"
    && typeof rule.action === "string"
}

function withoutGuardBlocks(rules) {
  const plain = []
  let inBlock = false
  for (const rule of rules) {
    if (rule?.permission === BLOCK_START) inBlock = true
    else if (rule?.permission === BLOCK_END) inBlock = false
    else if (!inBlock) plain.push(rule)
  }
  return plain
}

function guardBlock(agentRules, sessionRules) {
  const chain = [...agentRules, ...withoutGuardBlocks(sessionRules)].filter(isRule)
  const block = [{ permission: BLOCK_START, pattern: "*", action: "deny" }]
  for (const permission of GUARDED_PERMISSIONS) {
    block.push({ permission, pattern: "*", action: "ask" })
    for (const rule of chain) {
      if (!wildcardMatch(permission, rule.permission)) continue
      block.push({ permission, pattern: rule.pattern, action: rule.action === "allow" ? "ask" : rule.action })
    }
  }
  block.push({ permission: BLOCK_END, pattern: "*", action: "deny" })
  return block
}

function endsWithBlock(rules, block) {
  if (rules.length < block.length) return false
  const tail = rules.slice(rules.length - block.length)
  return block.every((rule, index) => tail[index]?.permission === rule.permission
    && tail[index]?.pattern === rule.pattern
    && tail[index]?.action === rule.action)
}

export const IvaldiPermissionGuardPlugin = async ({ client }) => ({
  "chat.message": async (input, output) => {
    // A throw here would fail the prompt, so every error is swallowed. When the
    // rules cannot be read, nothing is written: a block built without them
    // could turn an agent's deny into a prompt.
    try {
      const sessionID = input?.sessionID
      const agentName = output?.message?.agent ?? input?.agent
      if (!sessionID || !agentName) return
      const [agents, session] = await Promise.all([
        client.app.agents(),
        client.session.get({ path: { id: sessionID } }),
      ])
      const agent = Array.isArray(agents?.data) ? agents.data.find((item) => item?.name === agentName) : undefined
      const sessionRules = session?.data ? (session.data.permission ?? []) : null
      if (!Array.isArray(agent?.permission) || !Array.isArray(sessionRules)) return
      const block = guardBlock(agent.permission, sessionRules)
      if (endsWithBlock(sessionRules, block)) return
      await client.session.update({ path: { id: sessionID }, body: { permission: block } })
    } catch {
      // The prompt runs with the rules the session already has.
    }
  },
})
`;

const mergePluginConfig = (rawConfig, pluginUrl) => {
  const errors = [];
  const source = String(rawConfig ?? '').trim();
  const parsed = source ? parseJsonc(source, errors, { allowTrailingComma: true }) : {};
  // A parsed JSON object is a plain object. Null, arrays and other values are not.
  if (errors.length > 0 || parsed?.constructor !== Object) {
    throw new Error('OPENCODE_CONFIG_CONTENT must contain a valid JSON object before Ivaldi can inject its permission guard');
  }
  if (parsed.plugin !== undefined && !Array.isArray(parsed.plugin)) {
    throw new Error('OPENCODE_CONFIG_CONTENT plugin must be an array before Ivaldi can inject its permission guard');
  }
  const configured = Array.isArray(parsed.plugin) ? parsed.plugin : [];
  parsed.plugin = [
    ...configured.filter((value) => value !== pluginUrl && (!Array.isArray(value) || value[0] !== pluginUrl)),
    pluginUrl,
  ];
  return JSON.stringify(parsed);
};

export const createOpenCodePermissionGuard = ({ fsPromises, path, dataDir }) => {
  const pluginDirectory = path.join(dataDir, 'permission-guard');
  const pluginPath = path.join(pluginDirectory, 'ivaldi-permission-guard-plugin.js');

  const prepareManagedOpenCodeEnv = async (rawConfig) => {
    await fsPromises.mkdir(pluginDirectory, { recursive: true });
    await fsPromises.writeFile(pluginPath, createPluginSource(), { mode: 0o600 });
    return {
      OPENCODE_CONFIG_CONTENT: mergePluginConfig(rawConfig, pathToFileURL(pluginPath).href),
    };
  };

  return { prepareManagedOpenCodeEnv };
};
