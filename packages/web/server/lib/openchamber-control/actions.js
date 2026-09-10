/**
 * Two capabilities, two tools.
 *
 * Controlling sessions and driving a page are different intents, and a single
 * tool description covering both is vaguer than either — which is how a model
 * ends up calling the wrong one. Separate tools also mean turning one off
 * removes it entirely, parameters included, rather than leaving its inputs
 * visible in a shared schema.
 */
export const OPENCHAMBER_CONTROL_ACTION_DEFINITIONS = Object.freeze([
  { action: 'projects.list', title: 'List configured projects', description: 'List configured projects; no parameters' },
  { action: 'models.list', title: 'Show model preferences', description: 'Show default, favorite, and recent model preferences; no parameters' },
  { action: 'session.list', title: 'List sessions', description: 'List sessions; optional directory, limit (default 10), all, or withStatus' },
  { action: 'session.create', title: 'Create a session', description: 'Create a session in the current directory by default; prompt is optional' },
  { action: 'session.send', title: 'Send a prompt', description: 'Send a new prompt to sessionId; scope with projectId or directory' },
  { action: 'session.fork', title: 'Fork a session', description: 'Fork sessionId; messageId selects the boundary; prompt is optional' },
  { action: 'session.status', title: 'Check session status', description: 'Check sessionId status; directory defaults to the current session' },
  { action: 'session.messages', title: 'Read session messages', description: 'Read text-only messages and current sessionStatus for sessionId; directory and limit 10 are defaults' },
  { action: 'schedule.status', title: 'Check scheduler status', description: 'Check scheduler status; no parameters', agentExposed: false },
  { action: 'schedule.list', title: 'List scheduled tasks', description: 'List tasks and scheduler status; scope with projectId or directory' },
  { action: 'schedule.create', title: 'Create a scheduled task', description: 'Create task; requires name, prompt, model, and one schedule selector' },
  { action: 'schedule.run', title: 'Run a scheduled task', description: 'Run taskId; scope with projectId or directory' },
  { action: 'schedule.delete', title: 'Delete a scheduled task', description: 'Delete taskId; scope with projectId or directory' },
  { action: 'schedule.toggle', title: 'Enable or disable a scheduled task', description: 'Enable or disable taskId; requires the disabled boolean' },
  { action: 'lifecycle.list', title: 'List lifecycle hooks', description: 'List lifecycle hooks, supported events, and recent executions; no parameters' },
  { action: 'lifecycle.create', title: 'Create a lifecycle hook', description: 'Create a user lifecycle hook; requires hookId, event, and command argv. New agent-created hooks default disabled unless enabled is explicitly true' },
  { action: 'lifecycle.update', title: 'Update a lifecycle hook', description: 'Update hookId in place; provide only fields to change. Setting enabled true activates executable code on matching lifecycle events' },
  { action: 'lifecycle.delete', title: 'Delete a lifecycle hook', description: 'Delete the exact saved hookId; use only when the user asked to remove it' },
  { action: 'lifecycle.test', title: 'Test a lifecycle hook', description: 'Execute saved hookId once as a dry run without changing configuration; use only when the user explicitly asked to test or run it' },
]);

const OPENCHAMBER_CONTROL_ACTIONS = Object.freeze(
  OPENCHAMBER_CONTROL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS = Object.freeze(
  OPENCHAMBER_CONTROL_ACTION_DEFINITIONS.filter(({ agentExposed }) => agentExposed !== false),
);

export const OPENCHAMBER_AGENT_TOOL_ACTIONS = Object.freeze(
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const OPENCHAMBER_WEB_ACTION_DEFINITIONS = Object.freeze([
  { action: 'browser.open', title: 'Open a page in the browser panel', description: 'Open url in the in-app browser panel; use it to look at the running app. Set viewport to mobile, tablet or desktop to lay the page out at that size' },
  { action: 'browser.snapshot', title: 'Read the open page', description: 'Read the open page: url, title, visible text, and interactive elements with the selectors the other browser actions accept. Pass selector to read only that part of a long page. Reports any errors the page logged' },
  { action: 'browser.click', title: 'Click on the open page', description: 'Click an element; give selector, or text to match a link or button by its visible label' },
  { action: 'browser.type', title: 'Type into the open page', description: 'Type value into the field matched by selector; set submit to press Enter afterwards' },
  { action: 'browser.scroll', title: 'Scroll the open page', description: 'Scroll the page; direction is up, down, top, or bottom, or pass selector to bring one element into view' },
  { action: 'browser.back', title: 'Go back in the browser panel', description: 'Return to the previous page in this tab; no parameters' },
  { action: 'browser.forward', title: 'Go forward in the browser panel', description: 'Move forward again in this tab; no parameters' },
  { action: 'browser.inspect', title: 'Read how an element renders', description: 'Read the computed styles of the element matched by selector — colours, fonts, spacing, borders — as the page actually renders them' },
  { action: 'browser.capture', title: 'Save a screenshot of the page', description: 'Save what is currently visible in the browser panel as an image file in the project and return its path, so a change can be shown rather than described. Pass label to name it (for example before-fix); the result reports the page, layout and path to reference in your answer' },
  { action: 'browser.resize', title: 'Change the page viewport', description: 'Lay the open page out at a different size; viewport is mobile, tablet, desktop, or fill to use the whole panel' },
]);

export const OPENCHAMBER_WEB_ACTIONS = Object.freeze(
  OPENCHAMBER_WEB_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Memory is its own tool for the same reason web is: remembering across
 * sessions is a distinct intent from controlling one, and a shared description
 * would blur both. It also has to switch off cleanly and completely, which a
 * shared schema cannot do.
 *
 * The session already carries an index of stored titles, so the descriptions
 * push the model toward reading one entry it can already see rather than
 * listing everything again — and toward reading it at all, since a title that
 * reads as a complete fact is exactly the one whose conditions get lost.
 */
export const OPENCHAMBER_MEMORY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'memory.read', title: 'Read a stored memory', description: 'Read the full text of one memory listed in the session index. The index shows titles only, and a title omits the conditions that decide how the memory applies, so read before acting rather than working from the title. Requires title (as the index spells it) or memoryId; scope is optional and both stores are searched without it' },
  { action: 'memory.list', title: 'List stored memories', description: 'List stored memory titles when the session index is missing or stale; scope is global, project, or both (default)' },
  { action: 'memory.save', title: 'Remember something', description: 'Store a durable fact, preference, or reference; requires title and body, plus scope global (about the user) or project (about this codebase). Restating something already stored updates it. Do not store secrets, one-off task state, or anything the user asked you not to keep' },
  { action: 'memory.delete', title: 'Forget a memory', description: 'Delete a memory that turned out to be wrong or obsolete; requires memoryId and scope' },
]);

export const OPENCHAMBER_MEMORY_ACTIONS = Object.freeze(
  OPENCHAMBER_MEMORY_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const IVALDI_COMPUTER_ACTION_DEFINITIONS = Object.freeze([
  { action: 'window.list', title: 'List controllable windows', description: 'List visible Windows desktop windows that Ivaldi can safely target; no parameters' },
  { action: 'window.select', title: 'Select a window', description: 'Select one windowId from window.list and take the first snapshot' },
  { action: 'computer.snapshot', title: 'Inspect the selected window', description: 'Capture the selected window and its accessibility tree. Returns a snapshotId required by every input action' },
  { action: 'computer.click', title: 'Click in the selected window', description: 'Click elementId from the current snapshot, or x and y in client coordinates; requires snapshotId' },
  { action: 'computer.type', title: 'Type in the selected window', description: 'Type text into elementId from the current snapshot or the focused control; requires snapshotId. Password values are never returned' },
  { action: 'computer.key', title: 'Press a key', description: 'Press key with optional modifiers in the selected window; requires snapshotId' },
  { action: 'computer.scroll', title: 'Scroll the selected window', description: 'Scroll up or down by amount at optional x and y coordinates; requires snapshotId' },
  { action: 'computer.drag', title: 'Drag in the selected window', description: 'Drag from fromX/fromY to toX/toY in client coordinates; requires snapshotId' },
  { action: 'computer.stop', title: 'Stop computer control', description: 'Immediately release the selected window and the computer-control lease; no parameters' },
]);

export const IVALDI_COMPUTER_ACTIONS = Object.freeze(
  IVALDI_COMPUTER_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Which actions each managed tool may ask for.
 *
 * The callback needs this because models routinely drop the namespace: asked
 * for `memory.read` from a tool already called `openchamber_memory`, they send
 * `read`, since the tool's own name appears to have said "memory" already. The
 * name is unambiguous inside one tool's action set even when it is not across
 * all of them (`delete` belongs to both schedule and memory), so resolution
 * starts from the tool that asked.
 */
const ACTIONS_BY_TOOL = Object.freeze({
  openchamber: OPENCHAMBER_AGENT_TOOL_ACTIONS,
  openchamber_web: OPENCHAMBER_WEB_ACTIONS,
  openchamber_memory: OPENCHAMBER_MEMORY_ACTIONS,
  ivaldi_computer: IVALDI_COMPUTER_ACTIONS,
});

const bareName = (action) => {
  const separator = action.indexOf('.');
  return separator === -1 ? action : action.slice(separator + 1);
};

const uniqueMatch = (candidates, requested) => {
  const matches = candidates.filter((candidate) => bareName(candidate) === requested);
  return matches.length === 1 ? matches[0] : null;
};

/**
 * The canonical action for what a tool asked, or the reason it could not be
 * resolved. The reason lists what the tool can actually do: an error that only
 * says "unsupported" leaves the model to guess again, which is how one wrong
 * name becomes three.
 */
export const resolveAgentToolAction = (requested, toolName) => {
  const value = typeof requested === 'string' ? requested.trim() : '';
  const scoped = ACTIONS_BY_TOOL[toolName] ?? null;
  const known = scoped ?? OPENCHAMBER_ALL_ACTIONS;

  if (value && known.includes(value)) {
    return { action: value };
  }
  if (value) {
    // Preserve the legacy unidentified-caller meaning now that Computer Use
    // also has a snapshot action. Managed plugins always identify their tool.
    if (!scoped && value === 'snapshot') return { action: 'browser.snapshot' };
    const resolved = uniqueMatch(known, value)
      // A tool that did not identify itself still gets the benefit when the
      // bare name means only one thing across every action.
      ?? (scoped ? null : uniqueMatch(OPENCHAMBER_ALL_ACTIONS, value));
    if (resolved) {
      return { action: resolved };
    }
  }

  return {
    error: `Unsupported Ivaldi action: ${value || 'missing'}. Use one of: ${known.join(', ')}`,
  };
};

/** Everything the callback route will dispatch, whichever tool asked. */
export const OPENCHAMBER_ALL_ACTIONS = Object.freeze([
  ...OPENCHAMBER_CONTROL_ACTIONS,
  ...OPENCHAMBER_WEB_ACTIONS,
  ...OPENCHAMBER_MEMORY_ACTIONS,
  ...IVALDI_COMPUTER_ACTIONS,
]);
