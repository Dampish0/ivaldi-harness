# Ivaldi VS Code extension

Ivaldi brings OpenCode sessions into your editor. This fork uses extension ID `dampish0.ivaldi` and is distributed as a locally built VSIX. See the [Ivaldi repository](https://github.com/Dampish0/ivaldi-harness) for release status.

## What you get

- **Chat beside your code** — responsive layout that adapts to narrow and wide panels
- **Agent Manager** — run the same prompt across multiple models in parallel, compare results side by side
- **Right-click actions** — add context, explain selections, and improve code in-place
- **Click-to-open** — file paths in tool output open directly in your editor; edit-style results land in a focused diff view
- **Session editor panel** — keep chat sessions open alongside files
- **Theme-aware** — adapts to your VS Code light, dark, and high-contrast themes

Plus everything from the shared Ivaldi UI: branchable timeline, smart tool UIs, voice mode, Git workflows, and more.

## Commands

| Command | Description |
|---------|-------------|
| `Ivaldi: Focus Chat` | Focus the chat panel |
| `Ivaldi: New Session` | Start a new chat session |
| `Ivaldi: Open Sidebar` | Open the Ivaldi sidebar |
| `Ivaldi: Open Agent Manager` | Launch parallel multi-model runs |
| `Ivaldi: Open Session in Editor` | Open current or new session in an editor tab |
| `Ivaldi: Settings` | Open extension settings |
| `Ivaldi: Restart API Connection` | Restart the OpenCode API process |
| `Ivaldi: Show OpenCode Status` | Debug info for development or bug reports |

### Right-click menu

Select code in the editor, right-click, and find the **Ivaldi** submenu:

| Action | Description |
|--------|-------------|
| Add to Context | Attach selection to your next prompt |
| Explain | Ask the agent to explain the selected code |
| Improve Code | Ask the agent to improve the selection in-place |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ivaldi.apiUrl` | _(empty)_ | URL of an external OpenCode API server. Leave empty to auto-start a local instance. |
| `ivaldi.opencodeBinary` | _(empty)_ | Absolute path to the `opencode` CLI binary. Useful when PATH lookup fails. Requires window reload to apply. |

Existing global and workspace `openchamber.apiUrl` and `openchamber.opencodeBinary` settings are copied on activation only when the corresponding Ivaldi setting is unset. Workspace-folder overrides and extension-specific UI state are not migrated automatically.

Google quota can use an existing unexpired Gemini or Antigravity access token. Token refresh requires the matching `IVALDI_GEMINI_GOOGLE_CLIENT_ID` and `IVALDI_GEMINI_GOOGLE_CLIENT_SECRET`, or `IVALDI_ANTIGRAVITY_GOOGLE_CLIENT_ID` and `IVALDI_ANTIGRAVITY_GOOGLE_CLIENT_SECRET`, in the VS Code process environment. The extension does not bundle third-party OAuth client credentials.

## Requirements

- [OpenCode CLI](https://opencode.ai) installed and available in PATH (or set `OPENCODE_BINARY` env var)
- VS Code 1.85+

<details>
<summary>Development</summary>

```bash
bun install
bun run vscode:dev
```

`bun run vscode:dev` now starts watchers + opens an Extension Development Host automatically. Webview UI changes use Vite HMR automatically.

Optional overrides:

- `OPENCHAMBER_VSCODE_BIN=cursor bun run vscode:dev`
- `OPENCHAMBER_VSCODE_DEV_WORKSPACE=/path/to/workspace bun run vscode:dev`
- `bun run vscode:dev /path/to/workspace`

To package manually:

```bash
bun run --cwd packages/vscode build
cd packages/vscode && bunx vsce package --no-dependencies
```

Install locally: `code --install-extension packages/vscode/ivaldi-*.vsix`

</details>

## License

MIT
