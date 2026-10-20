# CodeDAG plugin marketplace

This repository is `codedag`, the plugin marketplace of [CodeDAG](https://codedag.com) for Claude Code and Codex. It provides the `codedag@codedag` plugin, whose CodeDAG Guide skill teaches the agent how to use the CodeDAG CLI: initialize a project, write and submit workflows, follow their status and logs, and review the results.

## Requirements

The plugin works with the CodeDAG CLI. The CLI versions it supports are listed in `plugins/codedag/compat.json`. To install the CLI, see the [CodeDAG documentation](https://codedag.com/docs).

## Install

The CodeDAG CLI installs the plugin for you: `cdg init` installs it into Claude Code and Codex when they are installed on your machine. If you skipped that step or installed a host later, run:

```sh
cdg plugin install --all
```

To add the marketplace with the host's own commands instead:

- Claude Code:

  ```sh
  claude plugin marketplace add CodedagAI/codedag-plugins
  claude plugin install codedag@codedag
  ```

- Codex:

  ```sh
  codex plugin marketplace add CodedagAI/codedag-plugins
  codex plugin add codedag@codedag
  ```

## Update

```sh
cdg plugin update --all
```

Each host can also update the plugin by itself:

- Claude Code: `claude plugin update codedag@codedag`
- Codex: `codex plugin marketplace upgrade codedag`

## Repository layout

| Path | Contents |
|---|---|
| `plugins/codedag/` | The CodeDAG plugin |
| `catalog/codedag.yaml` | The CodeDAG plugin's entry in the marketplace catalog |
| `docs/zh/codedag-guide.md` | The Chinese original of the CodeDAG Guide, for reference |
| `.claude-plugin/marketplace.json` | The marketplace manifest for Claude Code |
| `.agents/plugins/marketplace.json` | The marketplace manifest for Codex |
| `scripts/generate-marketplaces.mjs` | The generator of both marketplace manifests |

All files above except the generator are generated, and edits made by hand are overwritten the next time they are generated:

- The CodeDAG plugin export writes `plugins/codedag/`, `catalog/codedag.yaml`, and `docs/zh/codedag-guide.md`.
- `npm run generate` writes both marketplace manifests from `catalog/*.yaml`. It needs Node.js 22 or later; run `npm ci` first.
