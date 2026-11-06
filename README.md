# CodeDAG plugin marketplace

This repository is `codedag`, the plugin marketplace of [CodeDAG](https://codedag.com) for Claude Code and Codex. It provides the `codedag@codedag` plugin, whose CodeDAG Guide skill teaches the agent how to use the CodeDAG CLI: initialize a project, write and submit workflows, follow their status and logs, and review the results.

## Requirements

The plugin works with the CodeDAG CLI. The CLI versions it supports are listed in `plugins/codedag/compat.json`. To install the CLI, see the [CodeDAG documentation](https://codedag.com/docs).

During the private beta, signing in to the CodeDAG CLI requires an invitation. Join the waitlist at https://codedag.com/waitlist.

## Install

The CodeDAG CLI installs the plugin for you: `cdg init` installs it into Claude Code and Codex when they are installed on your machine. If you skipped that step or installed a host later, run:

```sh
cdg plugin install --all
```

`-s` sets the installation scope to `user`, `project`, or `local`, and the default is `user`. `project` and `local` install into the Git repository where you run the command:

```sh
cdg plugin install --all -s project
```

To uninstall the plugin:

```sh
cdg plugin uninstall --all
```

For what each scope changes and which installations `uninstall` removes, see the [plugin reference](https://codedag.com/docs/reference/cli/plugin).

To add the marketplace with the host's own commands instead:

- Claude Code:

  ```sh
  claude plugin marketplace add CodedagAI/codedag-plugin-marketplace
  claude plugin install codedag@codedag
  ```

- Codex:

  ```sh
  codex plugin marketplace add CodedagAI/codedag-plugin-marketplace
  codex plugin add codedag@codedag
  ```

This repository is public, so adding the marketplace doesn't need a GitHub account or credentials. Codex fetches it over HTTPS. Claude Code first checks whether it can reach GitHub over SSH and uses the SSH address if it can, and HTTPS otherwise; set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` to make it always use HTTPS.

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

These files are generated again with each CodeDAG release, so changes made to them in this repository aren't kept. To report a problem with the plugin or the Guide, email hi@codedag.com or open an issue in [CodedagAI/codedag-home](https://github.com/CodedagAI/codedag-home/issues).

## License

This repository is licensed under the [MIT License](LICENSE). The CodeDAG name and logo aren't covered by the license.

The CodeDAG CLI that the plugin works with isn't in this repository. It's proprietary software of Zillion AI LLC, licensed under the [CodeDAG Terms of Service](https://codedag.com/terms).
