---
name: codedag-guide
description: Use when you need to use the CodeDAG CLI on this machine to initialize a project, write workflows, submit them, check status and logs, enter task sessions, review results, or control running tasks. Covers the 80/20 operations an agent needs most.
---

# CodeDAG

## When to use

- When you need to orchestrate several development tasks as a DAG and let CodeDAG handle queuing, scheduling, parallel isolation, logging, and review-driven progression.
- When you need to check the status, logs, or interactive session of a workflow or task, or run `review`, `pause`, `kill`, or `recover` on it.
- When tasks have clear dependencies and you want to manage "running the work" separately from "whether to continue after review".
- For a one-off local change that needs no dependencies, queuing, parallelism, or review, use the agent directly; there is no need to force it into CodeDAG.

## Command names

- Preferred command: `cdg`
- `codedag` is the full command name; the two are equivalent.
- Both `cdg --help` and `codedag --help` should work; if either one is missing, the installation is broken.

## Version requirements

<!-- codedag-compat:begin -->
- Minimum CodeDAG CLI version: `0.0.7-local.51`
- Verified CodeDAG CLI version: `0.0.7-local.51`
<!-- codedag-compat:end -->

- **Before your first use in a session:** Run `cdg --version` and compare the result with the two versions above.
- **`cdg` is not found:** The CodeDAG CLI is not installed or not on your `PATH`. Tell the user to install it first (installation instructions are at `https://codedag.com/docs`), and run no other command from this guide until it is installed.
- **Below the minimum version:** Commands or behavior described in this guide may not exist. Ask the user to upgrade the CodeDAG CLI before you continue.
- **Above the verified version:** This guide still applies; wherever the CLI differs from this guide, the CLI's `--help` is authoritative.
- **Version-conditional content:** Use it only when `cdg --version` meets the stated condition; otherwise follow the alternative given in the same place.
- **Argument errors:** When a command reports an unknown option, an invalid value, or a similar error, confirm the version with `cdg --version`, then look up the command's current syntax with its `--help` and correct the command accordingly; upgrading the CLI is the fix only when the version is below the minimum.

## `--help` versus this guide

- `cdg --help`: look up the commands as they exist on this machine.
- This guide: strategy, patterns, and operating paths.
- When the two disagree, `--help` is authoritative.

## User rules take precedence

If the user's project or global memory, rule files, or system prompt contain CodeDAG instructions that differ from the defaults in this guide, follow the user's instructions. This guide only provides the default path; it does not override project constraints, global preferences, or system-level rules that the user has configured explicitly.

## Terminology

- Commands call this object `dag`, as in `cdg dag submit`.
- This guide calls it a workflow; both names refer to the same object.

## Shortest path

1. Run `cdg --version` and check it against "Version requirements".
2. Make sure the repository has the workspaces CodeDAG needs.
   - Find out whether the current repository has worktrees and whether the current directory is inside one.
   - If the tasks only need to run sequentially, the primary repository is enough.
   - If the tasks need parallel isolation, prepare `git worktree`s or multiple clones first.
3. Check whether the root of the primary repository contains `.codedag` to tell whether the project is initialized. If it does not, run `cdg init` from the project repository or a registered worktree; it creates the `.codedag` sidecar repository in the primary repository.
4. Create a workflow file under `.codedag/dags/` in the primary repository; this is the standard workflow directory.
5. Run `cdg dag validate <workflow>` first.
6. Then run `cdg dag submit <workflow>`.
7. Monitor the run with `cdg dag status`, `cdg dag logs`, and `cdg task view`.
8. To course-correct in real time or watch the native trace during a run, prefer `cdg task view`; to pause, unpause, kill, or recover, choose the `cdg task ...` or `cdg dag ...` control command that matches the scope.
9. When a task or workflow stops at a review point, continue the workflow with `cdg task review ...` or `cdg dag review ...`.

## Prerequisites

- Installation instructions for CodeDAG are at `https://codedag.com/docs`. Once it is installed, both `cdg --help` and `codedag --help` should run normally; prefer `cdg` for everyday commands. If `cdg` does not exist, follow "Version requirements".
- CodeDAG runs inside a Git repository. A workflow serves exactly one repository, so do not mix repositories in one workflow.
- Parallel isolation relies on replicas of the repository. Prefer `git worktree`; multiple clones also work.
- A `.codedag` directory at the root of the primary workspace usually means the project is initialized, and its absence means it is not. If what you see contradicts this rule, the related files are usually damaged; try running `cdg init` once more.
- `.codedag` lives only in the primary repository, and workflows are resolved only from `.codedag/dags/` in the primary repository. When in doubt, pass an explicit file path.

## `.codedag` and the project repository

- The project repository keeps managing the project's code, branches, and commits as before; files in `.codedag` are not part of the project code.
- `.codedag` is a Git repository separate from the project repository. `git status`, `git commit`, and `git push` in the project repository never include `.codedag` files or change `.codedag` history. It is a separate repository because workflows and shared settings must stay stable across branches, unaffected by branch switches in the project repository, while still being version-tracked.
- Team-shared files live mainly in `.codedag/dags/` and `.codedag/settings.jsonc`; local-only files for this machine live in `.codedag/local/`. Among them, `.codedag/local/settings.local.jsonc` is not for team sharing and is not tracked in the `.codedag` repository by default.
- To version CodeDAG files or share them with the team, run Git inside `.codedag` itself; creating and syncing a remote repository is also done inside `.codedag` with Git and your hosting platform.
- When the user wants to sync `.codedag` to a remote and has not named the repository, name it `<project-repo-name>-codedag` and put it in the same namespace as the project repository, so the sidecar repositories of different projects never share a name.
- When a new team member or machine joins an existing remote `.codedag`, first run `git clone <remote-url> .codedag` at the root of the primary repository, then run `cdg init`; files already committed to `.codedag` are kept. Running init first creates template files that block the later pull.
- Standard workflow names (such as `feature`) and paths of the form `.codedag/dags/...` both resolve to the standard workflow directory of the primary repository, not to some `.codedag/dags/` under the current `cwd`.
- The directory a command runs from only decides which project you are operating on; the workspaces that actually run the tasks are decided by the workflow configuration, mainly the `executionMode`, `excludeWorkspaces`, and `baseRef` fields.

## Sign-in and billing

- **Commands that require sign-in:** `cdg init`, `cdg dag submit`, and `cdg auth status`. When you are not signed in, they open a browser on this machine, wait for the user to sign in, and then continue the original command. Only Google accounts are supported.
  - **Without opening a browser:** With `CODEDAG_NO_BROWSER=1` set, these three commands print the sign-in URL instead of opening a browser. To sign in separately, use `cdg auth login --no-browser`.
  - **Authorization callback:** The browser that completes authorization must be able to deliver the callback to `127.0.0.1:<random-port>/callback` on the machine running the CLI; the port is in the `redirect_uri` parameter of the printed URL. When the CLI runs on a remote host or in a container, make the callback reachable first, for example by forwarding that port. Opening the URL on another machine alone does not work: the authorization result never reaches the CLI, so sign-in cannot complete.
- **Check the sign-in state:** Before running the commands above, run `cdg auth status --local` to confirm you are signed in, so the command does not stall waiting for browser sign-in. It reads only the credentials on this machine: it does not go online, open a browser, or show credits. Exit code `0` means signed in and `1` means not signed in. If you are not signed in, ask the user to run `cdg auth login` and finish signing in in the browser, then continue.
- **Credit source:** The `Credit source:` line of `cdg auth status` is one of the following three.
  - **`Free trial credits` (the free trial):** Granted once to an account created through public sign-up: 800 credits, valid for 30 days from when they are granted. They do not reset, cannot be used after they expire, and require no payment method.
  - **`Beta credits`:** Granted to accounts invited to the private beta. They reset each month, unused credits do not roll over, and they may have an end date. The number of credits in each window is what `Credits total:` shows.
  - **`Subscription credits` (a subscription):** There is a single subscription plan, billed monthly at $12 or yearly at $96, with 800 credits each month that reset monthly and do not roll over. Prices exclude tax, which is calculated at checkout based on the billing region. Payments are not yet available in some countries and regions, where free credits still work as usual.
  - **Carry-over into a subscription:** When a subscription starts, free credits that are still unused and unexpired are added to your first paid period. This happens only once.
- **Check credits:** The output of `cdg auth status` is authoritative.
  - **When credits are available:** `Credits remaining:` is what is left in the current credit window, and `Current period:` is that window's start and end. `Next credit reset:` appears when another credit window follows this one, and `Credits expire:` appears when the free credits have an end time.
  - **When no credits are available:** The output reads `This account has no active subscription and no available free credits.`, followed by `Your free credits ended at <time>.` if free credits have ended, and then a subscription URL. The exit code is still `0` in this case, so the exit code does not tell you whether credits are available.
- **Charges:** Only `cdg dag submit` is billed. Submitting only checks that enough credits are available and charges nothing; the output after queuing shows how many credits this submission needs and how many remained when checked. Each workflow is charged once when it starts running, 1 credit for each task it will run this time, and tasks reviewed before submission are neither run nor charged; `recover` does not charge again.
- **Submission rejected:** The output starts with `Not enough credits for this submission.` or the notice that no credits are available, and ends with `Workflow was not submitted.` followed by a docs link; the exit code is `1` and the workflow is not queued. Act on what the output says, and avoid resubmitting repeatedly, because retrying does not add credits:
  - **No credits available, or the free trial is short of credits:** Ask the user to subscribe at the URL in the output.
  - **Insufficient beta or subscription credits, with a reset time (the output includes `Your credits reset at <time>.`):** You can wait until that time and submit again; with beta credits, the user can also subscribe.
  - **Insufficient beta credits, with no reset time:** This is the last credit window; follow the subscription guidance in the output.
  - **Insufficient subscription credits, with no reset time:** The subscription ends with the current window, so there is no next credit window; ask the user to manage the subscription in Billing.
- **Stopped when the workflow starts running:** The workflow stays `on-hold` (`startup-gate-blocked`), and `cdg dag status` shows three lines: `Startup gate failure:`, `Details:`, and `Action:`. Follow the steps in `Action:`, which usually means dealing with the cause and then running `cdg dag recover <workflow>`; recovery reuses the original submission and does not charge again.
- **CLI version:**
  - **Version too old:** The command prints `This CodeDAG CLI version (<version>) is no longer supported.` along with the minimum supported version, and exits with a non-zero code. Ask the user to upgrade the CodeDAG CLI (the docs link in the output explains how), then run the original command again. For a workflow stopped at startup for this reason (`Startup gate failure: cli_version_unsupported`), run `cdg dag recover <workflow>` after upgrading.
  - **Upgrade recommended:** `A newer CodeDAG CLI is recommended` is only a suggestion; the command completes as usual, so just pass it on to the user.

## Core concepts

- `workflow` / `dag`: a workflow file that describes a set of tasks and their dependencies.
- `task`: a single node in a workflow. Usually an `agent` task; CodeDAG's own developers also use `test`.
- `planning`: not yet submitted; only defined.
- `submitted`: in the queue; it may be waiting in the queue, running, waiting, or done but not yet reviewed.
- `in-progress`: a running state within the `submitted` phase, meaning the workflow or task is actually being driven forward rather than still waiting.
- `reviewed`: a final review decision has been made, and the task or workflow is no longer driven forward.
- `review`: decides whether a result is accepted and whether downstream work continues.
- `autoAccepted` / `taskAutoAccepted` / `dagAutoAccepted`: auto-accept rules that decide whether a node moves on automatically when it finishes running or stops and waits for your manual review.

Keep two points in mind about CodeDAG:

- A `task` never runs on its own, apart from a `dag`; it always belongs to a workflow.
- "Done running" is not "finished". In many cases a task runs to completion first, and its downstream tasks are released only after you `review` it.

### Reading state transitions

- Main path: `planning -> submitted -> in-progress -> reviewed`
- `in-progress` is a running state inside `submitted`, not a separate phase.
- `autoAccepted=always`: moves on automatically; `autoAccepted=none`: stops and waits for `review`.
- `blocked` / `on-hold` / `killed`: check `status` / `logs` first, then decide between `review`, `revise`, and `recover`.

## Choosing an execution mode (`executionMode`)

- Use `isolated-branches` by default.
- Use `executionMode: shared-workspace` only for lightweight tasks that share the same working state.
- When unsure, stay with `isolated-branches`.

### isolated-branches

- The default for code changes, testing, and parallel development.
- Benefits: clean isolation and easy traceability.

### shared-workspace

- All tasks share one working state, with no per-task isolation.
- Better suited to lightweight tasks such as documentation, configuration, copywriting, research, and content production.
- Examples: generating or translating user docs, UI i18n, research and reports, pSEO.
- Not suited to: parallel coding, frequent builds or tests, or engineering work that needs clear attribution.

The main risk of shared-workspace:

- Tasks contaminate each other's working state, which makes attribution harder.

Minimum conflict-avoidance strategy for shared-workspace:

- Do not mix several unrelated goals in the same shared workflow.
- Do not let several tasks write the same file at the same time.
- Check `status` / `logs` frequently.
- When the working state gets out of control, stop first: `kill`, `view`, `recover`, or clean up manually.

## Confirm the scope before creating a workflow from a worktree

Before creating or submitting a workflow, you must first determine **whether the repository you are running commands in is a `git worktree`** rather than the primary repository itself. If it is a worktree, first tell the user that the workspaces a workflow runs in have nothing to do with the directory the commands run from; they depend only on the workflow configuration. Then confirm two things with the user before deciding how to write the workflow fields:

1. Which repositories this workflow run may execute in (for example, only the primary repository, specific worktrees, or all registered workspaces).
2. Which version of the code this workflow run uses as its baseline (for example, the current worktree's HEAD, the primary repository's HEAD, a branch, or a specific commit).

Once the scope is confirmed, use these fields as needed to meet the user's requirements as closely as possible:

- `excludeWorkspaces`: excludes workspaces the user does not want scheduled in this run.
- `baseRef`: anchors this run's Git baseline explicitly to the commit the user specified, instead of defaulting to the `HEAD` of the current integration workspace.
- `maxConcurrency`: adjusts the concurrency limit to the number of workspaces actually available for this run.
- Change your own `cwd` only when the current terminal is in the wrong project or repository context; this only affects which project the commands act on and does not directly decide which workspace a task finally runs in.

If the user's scope or baseline requirements **cannot be met with these fields alone**, do not force a fit. Explain the limitation to the user directly and suggest a way forward (for example, check out the target branch in the primary repository first, commit or stash the current worktree's changes first, or prepare the needed workspaces with `git worktree add` first, then come back and submit the workflow).

## Your first workflow

Prefer YAML. A minimal working example:

```yaml
tasks:
  - id: 1
    title: "Write a planning document for dag ls JSON output"
    prompt: |
      Read the requirements document `docs/requirements/dag-ls-json-output.md`.
      Before writing the plan, read all related code, the existing command implementation, tests, design documents, and historical context, and research the topic thoroughly.
      Write the implementation plan to `docs/plans/dag-ls-json-output-plan.md`.
      The plan must cover in detail the command behavior, output structure, affected modules, test changes, edge cases, risks, and implementation order.
      This task only writes the plan; do not implement any code.

  - id: 2
    title: "Implement dag ls JSON output from the plan"
    dependencies: [1]
    prompt: |
      Read `docs/plans/dag-ls-json-output-plan.md`.
      Implement the requirements in `docs/requirements/dag-ls-json-output.md` according to that plan.
      Update the code and tests together, and keep the implementation consistent with the plan.
```

Two key points in this example:

- Planning and implementation each require substantial context, so give each its own task rather than combining both in one prompt.
- Each separate task starts its own fresh agent session; task 2 does not inherit task 1's conversation context. The two tasks share information through files in the repository.

Minimal format rules:

- `tasks` is required and must contain at least one task.
- Every task needs `id`, `title`, and either `prompt` or `details`.
- Omitting `dependencies` means the task has no dependencies. The YAML flow sequence form, such as `dependencies: [1, 2]`, is recommended; the YAML block sequence form also parses but is not the first choice.
- `id` is a positive integer and must be unique within the workflow.
- When both `prompt` and `details` are present, `prompt` wins.

## Frequently used fields

### Task fields

- `id`: the task's unique identifier. Number tasks sequentially, starting from `1`.
- `title`: a short title for people to read; it should let you and other agents see the task's goal at a glance.
- `prompt`: the main instruction for the agent. The core field.
- `details`: a compatibility alias of `prompt`; write new content in `prompt`.
- `dependencies`: the upstream tasks this task depends on.
- `type`:
  - `agent`: the default. Suited to coding, analysis, refactoring, and writing documentation.
  - `test`: only for CodeDAG's own development tests; using it requires switching to `shared-workspace`.
- `agent`: currently only `codex` or `claude`. Decide based on which agents the user has installed and the user's preference; different tasks can use different agents in combination. When omitted, the configured default is used.
- `mode`: controls the task's permissions and interaction policy: which operations can run without approval and whether someone needs to respond to approval prompts. For Codex, it also controls the sandbox level, network access, and whether web search is enabled. **Setting it explicitly is strongly recommended**, rather than relying on inheritance: when it is not set, CodeDAG does not pass the parameter, and the actual behavior falls back to the agent's own project or user configuration (such as `permissions.defaultMode` in `.claude/settings.json`, or `approval_policy` / `sandbox_mode` in `~/.codex/config.toml`) or to the agent's defaults, so the orchestrator cannot tell the actual access level from the workflow file. The meaning of `mode` depends on the agent: for Claude it is a `--permission-mode` value (the CodeDAG aliases `yolo` / `askForPermissions` are translated automatically, and other values are passed through); for Codex it is a key-value combination of `ask-for-approval` / `sandbox` / `approvals_reviewer` / `search` / `network_access`, or the shorthand `yolo` or `approve-for-me` (same as `auto`). Values are validated against the verified Codex version: `ask-for-approval` accepts only `on-request` / `never`, and `approvals_reviewer` accepts only `user` / `auto_review`. Recommended settings:

  | | Full access (headless, fully automatic) | Automatic review |
  |---|---|---|
  | **Claude** | `mode: bypassPermissions` | `mode: auto` (a background classifier reviews and allows actions automatically; when it blocks one, the model adjusts on its own) |
  | **Codex** | `mode: yolo` (equivalent to the official `--dangerously-bypass-approvals-and-sandbox`, plus `--search`; network access is open) | `mode: approve-for-me` (that is, `--approve-for-me`: a workspace-write sandbox, with approval requests sent to Codex automatic review first; when one is denied, the model adjusts on its own); when each request needs manual approval, use `mode: "approvals_reviewer=user,ask-for-approval=on-request,sandbox=workspace-write,network_access=true"` |

  - ⚠️ Full access skips the agent's permission checks (Claude officially recommends it only in isolated environments such as containers or VMs, and Codex likewise describes `yolo` as a dangerous bypass). Use it only for trusted tasks in controlled environments, and only after confirming the approval-handling policy with the user as described in "Validate and submit > Usage principles".
  - With automatic review, the agent's own review mechanism handles approval requests, and the model adjusts on its own when a request is denied. When Codex interrupts a turn after repeated denials, deal with the cause shown in the `task status` diagnostic, then recover. Follow the "When an approval prompt appears during a run" playbook only when a manual approval screen actually appears. The access level and the approval-handling policy are the user's decision.
  - The Codex `workspace-write` sandbox blocks network access by default; with `approve-for-me`, the model can request to step outside the sandbox, and the request goes to automatic review. To open network access inside the sandbox directly, use the key-value combination `approvals_reviewer=auto_review,ask-for-approval=on-request,sandbox=workspace-write,network_access=true`.
  - If you confirm that the Claude model in use (Sonnet 4.6 / Opus 4.6 / Fable 5 or later is required) or the organization's settings do not support `auto`, use `mode: acceptEdits` instead (reads, file edits, and common filesystem commands need no approval; other commands ask for approval).
  - The recommended values are based on the agent versions verified so far; after an agent upgrade, recheck them against that agent's CLI help.
- `model` / `effort`: fine-grained control over the model and reasoning effort; set them only when you really need to pin them.
- `autoAccepted`: the task's auto-accept rule; the default is `always`. Set it to `none` when each task must be reviewed manually before its downstream tasks proceed.
- `branchName`: only for `isolated-branches`; set it only when you must pin the task branch name. When a branch with the same name already exists, validation warns with `branch-name-conflict`, and the task goes `on-hold` once it starts. Deal with the source named in the warning or in the `Diagnostic` of `cdg task status`, then recover: delete or rename a local branch with Git; in a project that uses clone replicas, release a branch held by the sync repository with `cdg branch release <branch-name>`.

### Workflow fields

All of the following fields are optional; defaults apply when they are omitted.

- `executionMode`: `isolated-branches` or `shared-workspace`. The default is `isolated-branches`, meaning each task runs in its own workspace and task branch by default; change it to `shared-workspace` only when tasks explicitly need to share one workspace.
- `maxConcurrency`: the workflow-level concurrency. The default is `maxConcurrency` from the project settings (`.codedag/local/settings.local.jsonc` overrides `.codedag/settings.jsonc`; it is usually the number of worktrees + 1); if the project settings do not set it either, the default is `1`, meaning tasks run serially. Set it only when you explicitly need to override the default.
- `dagAutoAccepted`: the workflow's auto-accept rule; the default is `done`. Set it to `none` when each workflow must be reviewed manually before downstream workflows proceed.
- `taskAutoAccepted`: the workflow-level default for task auto-accept; the default is `always`. It is equivalent to setting `autoAccepted` on every task in the workflow, and a task's own `autoAccepted` field overrides it.
- `baseRef`: explicitly sets the Git baseline of this workflow run. The default is the `HEAD` of the current integration workspace, meaning the commit checked out when the workflow run starts becomes the baseline.
- `mergeConflictAgent`: the agent configuration used to resolve merge conflicts automatically (`agent` is required; `mode` / `model` are optional). The default is empty: task-level automatic merges use the task's own agent configuration, and workflow-level publish conflict handling uses the default agent from the project settings at submission time. Nobody can respond to approvals in a conflict session, so without an explicit `mode` (`mergeConflictAgent.mode`, or the task's own `mode` when falling back) it always runs at the full-access level `yolo`. Set `mode` explicitly when lower permissions are needed, but the session gets stuck as soon as it shows an approval prompt.
- `excludeWorkspaces`: excludes workspaces from scheduling in this run. The default is an empty list, meaning every registered workspace of the project can be scheduled in this run.
- `metadata`: only for supplementary human-readable information such as version, description, creation time, and update time. The default is empty, meaning no extra metadata; it does not affect execution.

## Writing prompts

`prompt` determines the quality of a task. Recommended structure:

```text
Goal:
What to implement / analyze / fix / write.

Context and required reading:
The current repository, related modules, known assumptions, the documents and files to consult, and the recommended skills or tools.

Completion criteria:
What results or effects to produce, and how to verify that the results meet the requirements.

Constraints:
Limits that must be followed; for example, do not change unrelated files, keep the tests passing, change only the specified directory.

Required or recommended process (optional):
If the user explicitly requires or recommends a process, add it here; otherwise leave this section out.
```

The template above is shown in English; when you write an actual `prompt`, use the language the end user is working in.

Before writing a prompt, separate the parts of the user's input that are writing instructions for the agent creating the workflow from the task content to hand over to the agent executing the workflow.

- Instructions: the rules, priorities, formats, trade-offs, or writing styles the user wants the agent creating the workflow to follow while writing it.
- Content: the work the user wants the agent executing the workflow to actually do, the materials it should read, the files it should change, how it should verify, or what it should deliver.

The agent creating the workflow must not pass the user's writing instructions straight into a task `prompt`, or reduce itself to a messenger. It must first understand what those instructions mean and turn them into actions taken while creating the workflow, such as splitting tasks, setting dependencies, choosing fields, deciding what goes into the prompt, tightening the wording, or adjusting constraints. Only content that genuinely helps the executing agent complete the task belongs in the workflow `prompt`.

Follow these rules when writing prompts:

- Give each task one clear goal; do not pack several independent goals into the same task.
- Spell out the "completion criteria"; do not just write "take care of this" or "see if this can be optimized".
- When the agent needs to read code, state which areas to read first.
- When the agent needs to change code, state the scope of the changes, the testing requirements, and what is off-limits.
- Keep CodeDAG's flow-control commands out of prompts; you run flow control such as `submit`, `review`, and `pause` yourself, outside the task agent's CLI.
- If a task depends on upstream output, put that relationship in `dependencies` instead of only describing it in the prompt.
- By default, tasks are independent of each other and cannot see the session history of earlier tasks. Later tasks should build on the latest code and documents in the repository and pick up progress from the files that earlier tasks produced, rather than relying on reading an earlier task's context directly.
- For analysis, research, or troubleshooting tasks that need no code changes, still require the agent to write its results to a document (and specify the file name, including the path), so the agent does not reply only in the conversation; otherwise later agents cannot see those results once the task ends.

## Common commands

### Initialize

- `cdg init`
- When an agent runs initialization, the non-interactive form is recommended:
  - `--primary-workdir` is required; it is usually the absolute path of the project root.
  - Passing `--replica-workdirs` and `--default-agent claude|codex` is recommended.
  - Pass `--max-concurrency` and `--no-install-guide-plugins` as needed.
- `--replica-workdirs` takes several replica directories separated by spaces:
  - If the user works with worktrees, pass each worktree directory; do not pass the temporary worktrees that Claude Code (under `.claude/worktrees/`) and Codex (under `~/.codex/worktrees/`) create for their own sessions.
  - If the user works with clone replicas, pass each clone directory.
  - If no parallelism is needed, do not pass `--replica-workdirs`.
  - If parallelism is needed but no worktrees or clones are ready yet, discuss it with the user first; usually recommend preparing worktrees before initializing. Decide the number of worktrees from the task needs and the user's confirmation.
- Choose `codex` or `claude` for `--default-agent` based on the user's preference; usually use `codex` if you are Codex and `claude` if you are Claude Code.
- Example: `cdg init --primary-workdir /path/to/project --replica-workdirs /path/to/project-wt-1 /path/to/project-wt-2 --default-agent codex`
- When non-interactive initialization runs again, existing files under `.codedag` are always kept. A non-zero exit code means initialization did not complete; deal with the reason in the output and retry.
- If the output shows `Warning: Claude Code <version> is older than ...` or `Warning: Could not determine the Claude Code version`, initialization still completes, but tasks that use Claude Code will go `on-hold` (`agent-version-unsupported`); upgrade Claude Code before running such tasks.

- `cdg init` detects the Claude Code / Codex installed on this machine. The default agent and concurrency come from the team's shared settings, and values are written to local settings only when this machine's values differ. Initialization does not write `availableAgents`; that field exists only for users who deliberately restrict which agents a project may use.
- `cdg init` creates the `.codedag` sidecar repository in the primary repository; team-shared files go in `.codedag/dags/` and `.codedag/settings.jsonc`, and local-only settings for this machine go in `.codedag/local/settings.local.jsonc`.
- After `cdg init`, the way you use Git in the project repository stays the same; to commit or sync workflows / shared settings, run Git inside `.codedag` itself.

### Install the CodeDAG plugin

- **Source:** The CodeDAG plugin `codedag@codedag`, which contains this skill, comes from the plugin marketplace `CodedagAI/codedag-plugin-marketplace` on GitHub; the marketplace name is `codedag`.
- **Default installation:** By default, `cdg init` registers this marketplace with the Claude Code and Codex installed on this machine and installs the plugin; non-interactive initialization installs it at the user scope. With `--no-install-guide-plugins`, it skips installing, repairing, and updating the plugin.
- **When it takes effect:** A newly installed plugin takes effect only in new sessions; to use it in the current session, exit and resume (`claude --resume` or `codex resume`).
- **Install later or change the scope:** If initialization skipped the plugin, install it later with `cdg plugin install --all -s user|project|local`; to change the scope, run `cdg plugin uninstall --all` first, then install again. Codex supports only the user scope: with `project` or `local`, only Claude Code is installed at that scope, and Codex is skipped with a warning.
- **Check:** `cdg plugin status --all` shows, for Claude Code and Codex, the plugin's installation status, scope, enabled state, plugin version, the minimum CLI version the plugin requires, and the suggested next step. When `cdg init` or `cdg plugin status` reports that the CLI is older than the minimum version the plugin requires, ask the user to upgrade the CLI.
- **Update:** `cdg plugin update --all` refreshes the marketplace and updates the plugin. You can also use each host's own command: `claude plugin update codedag@codedag` for Claude Code and `codex plugin marketplace upgrade codedag` for Codex.
- **Uninstall:** `cdg plugin uninstall --all` uninstalls only the CodeDAG plugin and keeps the `codedag` marketplace and any other plugins in it.

### Validate and submit

- `cdg dag validate <workflow>`
- `cdg dag submit <workflow>`

Usage principles:

- **Settle the approval-handling policy before submitting**: the `mode` access level of each task and "how to handle approval prompts during the run" are a single decision. When the user has said the run is unattended, has set each task's mode explicitly, or already has a standing rule, inherit that and do not ask again. When the policy is unclear and affects safety boundaries (such as enabling full access, or how far you may respond to approvals on the user's behalf), confirm with the user before submitting. This prevents two mismatches: "the user wanted full automation but the run got stuck on approvals" and "the user wanted to sign off personally but actions were approved automatically".
- Run `validate` before submitting.
- Fix `validate` errors first; when there are warnings, understand them before deciding whether to submit anyway. If you decide to continue, add `-y` in a non-interactive environment (`cdg dag submit -y <workflow>`). Without it, the result depends on standard input: when standard input is already closed, the workflow is submitted despite ordinary warnings, but a `branch-name-conflict` warning cancels the submission; when the confirmation prompt appears and input ends before an answer, nothing is submitted. Both cases that submit nothing exit with code 1, and the workflow is not queued.
- Prefer a bare file name (such as `feature`) or a standard path such as `.codedag/dags/feature.yaml`; both resolve to the primary repository's standard workflow directory.

### Monitor status

- `cdg status`: equivalent to `cdg dag ls`; shows the global workflow status board.
- `cdg dag status [workflow]`: shows a single workflow and its tasks.
- `cdg task status <taskId> -w <workflow>`: shows only the specified task.
- `--watch`: suited to watching changes continuously during the submitted phase.

How to choose:

- You do not know which workflows are in the system right now: start with `cdg status`.
- You want the full picture of one workflow: use `cdg dag status`.
- You only want to watch one task: use `cdg task status`.

How the three status commands differ:

- `cdg status` answers "what is happening across the whole system right now". Use it to scan everything first and see which workflows are waiting in the queue, running, waiting for review, or stopped.
- `cdg dag status <workflow>` answers "which task inside this workflow is holding things up". It narrows your attention to the inside of one workflow, which suits investigating dependencies, substatuses, the current sticking point, and the next action.
- `cdg task status <taskId> -w <workflow>` answers "what exactly is going on with this task". Use it once you have located a task, to see its phase, substatus, review result, and current sticking point.
- In practice, the most reliable path is to find the target workflow with `cdg status` first, then go into `cdg dag status <workflow>` for the details.
- To view or manually change a task's code, get the code location from these two commands: `cdg task status <taskId>` gives the task's workspace, task branch, and the commit before the task started (`Workspace`, `Branch`, `Base Commit`), and `cdg dag status` gives the integration workspace, the integration branch, and the workflow's starting commit. Under `shared-workspace` there is only the execution directory.

### Supervise a running workflow

You own the workflow and answer for the whole run, from submission to completion. Follow the monitoring schedule below to check on it and drive it forward proactively, and spot stalls, idle spinning, pending approvals, and usage limits promptly instead of waiting passively. Handle approvals and anomalies within the agreed authorization yourself (see the "When an approval prompt appears during a run" playbook), and escalate high-risk approvals, destructive operations, and decisions outside the agreement to the user. Ownership does not mean approving everything yourself, and the fact that approvals come from the agent inside the task, "two layers away" from you, is no reason to stand by.

- Right after launch: check `status` / `dag status` / `dag logs -f` frequently.
- Once the workflow is running steadily: reduce polling to once every 5–10 minutes. Do not check progress every few dozen seconds; that does not make tasks run any faster, and it tends to disturb the user and use up context.
- Be patient while waiting for node tasks, especially when a task dispatches subagents of its own; a short period without new output does not mean it is stuck. Consider the intervention path only after at least 10 consecutive minutes without a response.
- Drill into a task only when something is wrong; when there is an error, check `task status` / `task logs` first, and use `task view` if needed.
- To change a task's direction during a run, prefer entering its session with `cdg task view <taskId> -w <workflow>` and sending a prompt; exit after the exchange and go back to status and logs to confirm progress. When the conditions for view are not met, use the request-changes fallback described in the "Enter a task session" section.
- `review`: settles a result; `revise` / `request-changes` / `rework`: keep working on it; `recover`: recovers a run that was interrupted or went wrong.

### When a task is done running but its result needs changes

- When a task is done running and waiting for review, and you are not satisfied with the result but want to build on what it produced, prefer `cdg task review request-changes <taskId> -w <workflow> -m "<requested-changes>"`. State which results to keep and what to adjust, and review again once the changes are done; choose the code handling from the task review defaults and options below.
- Use `revise` when you want to change the current result yourself; use `rework` when you need to throw away the current implementation and redo it from a clean baseline.
- These actions apply to tasks that have not yet entered `reviewed`. Once a task has entered `reviewed`, to keep working on it, finish or cancel the original workflow and create a follow-up workflow; when you explicitly need to clear the review and resubmit, follow "Review rules".

### When a task hits the 5-hour usage limit

When a task hits the 5-hour usage limit, it stops `on-hold` with the reason `agent-api-error` and does not become `done`. The log of a Claude Code task then contains a line starting with `Claude API stopped the current turn due to rate limiting.`, with the reset time given after `Reset information:`. First determine whether the limited agent type is the same as your own supervising agent, then limit the damage right away and set a long `sleep` that covers the reset time.

Ways to limit the damage:

- A single agent type, or the rest of the current workflow cannot avoid the limited agent: stop the whole affected workflow with `cdg dag kill <workflow>`, then go into a long `sleep`; there is nothing to respond to during the sleep.
- Mixed agent types, and the agent supervising the current workflow has not hit the limit: stop only the tasks of the limited agent with `cdg task kill <taskId> -w <workflow>`; set a long `sleep` as a reminder, and keep supervising the tasks of the agents that are not limited.
- Mixed agent types, and the agent supervising the current workflow has also hit the limit: stop only the tasks of the limited agent with `cdg task kill <taskId> -w <workflow>`; after setting a long `sleep`, stop supervising the tasks of the agents that are not limited.

When the sleep ends, finish up; the usual approach is to recover in place:

- First check the tasks that ended around the time of the limit, and confirm their results are complete.
- If the whole workflow was stopped earlier with `dag kill`, recover it with `cdg dag recover <workflow>`; if only the tasks of the limited agent were stopped, recover those tasks with `cdg task recover <taskId...> -w <workflow>`. `on-hold` and `killed` tasks pick up in their original sessions, and `paused` tasks wait to be scheduled again; recovering does not consume CodeDAG credits again.
- After recovering, return to the monitoring schedule and confirm that the tasks are running again. If a task goes `on-hold` (`agent-api-error`) again, the limit has not reset yet; keep waiting, then `recover`.

Only when a task's result is incomplete but has already been accepted, so it cannot be recovered in place, collect the completed results and continue in a new workflow; the new workflow consumes CodeDAG credits for its own tasks. The steps in isolated-branches mode:

- If the affected workflow was already stopped as a whole with `dag kill`, you do not need `dag pause`.
- If the affected workflow still has tasks of non-limited agents in progress, first pause it with `cdg dag pause <workflow>`. Tasks that have already started continue until they are done running (which may take a while), but downstream tasks that have not started will not start, which keeps half-finished tasks to a minimum.
- Once the workflow is no longer `working`, check each task that has started but has no review decision yet, and determine which ones are fully complete and which are only half done. Cancel each half-done task with `cdg task review cancel <taskId> -w <workflow> --code snapshot --downstream cascade`: its existing changes are saved to a snapshot branch, so you can still restore them later; its result is not handed downstream, and its downstream tasks that have not started will not start in this run either.
- Finish the whole workflow with `cdg dag review accept <workflow>`. The other tasks that have finished running are accepted with it, and their results are merged into the integration branch `cdg/<workflow-name>/integration`. For a workflow in a subdirectory, `<workflow-name>` is its path relative to `.codedag/dags/` with `/` replaced by `_` (`team/build.yaml` becomes `team_build`); the actual branch name is shown as `Integration Branch` in `cdg dag status <workflow>`. This step accepts every task that has run but has no decision yet, so cancel all half-done tasks in the previous step first.
- Put the canceled tasks, the tasks that never started, and the remaining work of tasks accepted with incomplete results into a new workflow and submit it; use `baseRef: cdg/<workflow-name>/integration` so it continues from the accepted results.

### View logs

- `cdg dag logs [workflow]`
- `cdg task logs <taskId> -w <workflow>`

Frequently used options:

- `-f` / `--follow`: follow in real time.
- `-n` / `--tail <lines>`: show the last few lines first.

How to choose:

- To review the logs for an entire workflow, grouped by task: use `dag logs`.
- To watch only one task: use `task logs`.
- Use logs for read-only analysis. When you need two-way interaction, use `task view` in a real terminal or tmux instead of logs.

### Enter a task session

- `cdg task view <taskId> -w <workflow>`
- If needed, resume a session with `--session-id <id>`.
- When the task has been interrupted (`killed` / `paused` / `on-hold`, or its worker process has exited) and its session is not running, entering the session requires recovering the task first, and the task continues running after it is recovered. To recover, add `--recover` (or choose Yes at the confirmation prompt); if you only want to know what the task did, use `cdg task logs`.

This needs a real interactive terminal; a supervising agent can host it in tmux instead of running it directly in a shell tool that has no interactive terminal.

Sending a prompt after `task view` and running `task review request-changes` can both make the task agent keep changing its work. Choose by scenario, and use one in place of the other when needed; do not divide them merely into "a single input" and "continuous input". When you substitute one for the other, the terminal conditions and task phase requirements still apply.

When to enter `view`:

- For ordinary observation, `status` and `logs` are enough; do not enter `view` by default.
- To course-correct in real time, inspect the native trace, or respond to native interactions during execution, prefer entering `view` and sending one or more prompts as needed.
- To ask for changes to a result once the task is done running and waiting for review, prefer `request-changes`; see "When a task is done running but its result needs changes".

Sending a prompt in `view` does not make a Git commit before the changes by default; when a commit is needed first, say so explicitly in the prompt, for example "Commit the current changes first, then make the following changes...".

When you cannot provide the real interactive terminal that view needs (and no tmux is available either), you can course-correct during a run with `cdg task review request-changes <taskId> -w <workflow> -k -m "<requested-changes>"` as a fallback; to let the current work finish first, replace `-k` with `-p`. Never use the two together. This operation keeps the default code handling of request-changes, described in the task review rules below. It conveys requested changes; native approvals are still handled through the corresponding interactive flow.

How to exit after entering `view`:

- After intervening in the session through Task View, prefer exiting with `Ctrl+C`.
- Normally, after you exit with `Ctrl+C`, the original task keeps running; when the original task finishes running, its process exits automatically.
- If the original task has finished running but the process does not exit automatically, enter the session again with `cdg task view <taskId> -w <workflow>` and send `/exit` manually inside it. Avoid forcibly ending the underlying agent process with the system `kill`, `pkill`, or a process manager; that bypasses CodeDAG's task state management.

**Driving task view from a non-interactive environment**: When the supervising agent runs in a non-interactive environment such as a shell tool and needs to respond to approvals or interact both ways, host view in tmux. Put both the workflow and the task in the session name so that sessions do not collide when several workflows run in parallel; replace `.` / `:` in the workflow name with `-`, because tmux session names do not accept these two characters.

1. `tmux new-session -d -s cdg-view-<workflow>-<taskId> 'cdg task view <taskId> -w <workflow>'` starts the background hosting session.
2. `tmux capture-pane -t cdg-view-<workflow>-<taskId> -p` reads the current screen; confirm the approval content, the available choices, and the corresponding keys.
3. `tmux send-keys -t cdg-view-<workflow>-<taskId> <key>` sends the response. Base the keys on the on-screen prompt read in step 2; the approval panels of different agents have different options and key bindings, so do not send keys blindly from experience.
4. When done, exit the standard way described above with `tmux send-keys -t cdg-view-<workflow>-<taskId> C-c`, confirm with `capture-pane` that view has exited, then clean up the hosting session with `tmux kill-session -t cdg-view-<workflow>-<taskId>`; do not forcibly kill the underlying agent process with the system `kill` / `pkill`.

## Review rules

Think of review in three categories:

- Final actions: end the current node.
- Continuation actions: the node does not end; it just continues in a different way.
- Cleanup subcommand: clears an existing review state so the object can be submitted again.

Except for `task review clear` / `dag review clear`, every `task review ...` and `dag review ...` action command applies only to tasks or workflows that have not yet entered `reviewed`. Once an object has entered `reviewed`, use `review clear` only when you explicitly need to clear its review state; otherwise create a follow-up workflow to carry the work on.

### task review

Review and continuation commands:

- `cdg task review accept ...`
- `cdg task review cancel ...`
- `cdg task review defer ...`
- `cdg task review revise ...`
- `cdg task review request-changes ...`
- `cdg task review rework ...`

Cleanup command:

- `cdg task review clear [taskId...] -w <workflow>`

What the review and continuation actions mean:

- `accept`: accepts the result; the task enters reviewed.
- `cancel`: cancels the current result; the task enters reviewed.
- `defer`: postpones the decision; the task enters reviewed.
- `revise`: keeps the current working state so that you or a later operation can keep revising it.
- `request-changes`: has the agent keep changing the work based on the current result.
- `rework`: discards the current implementation approach and redoes the task from a clean baseline.

What the cleanup subcommand means:

- `clear`: clears an existing review state, for cases where you explicitly need to resubmit.

Frequently used options:

- `--code commit|snapshot|none|discard`
- `--downstream proceed|hold|cascade`
- `-m` / `--message`: records a note, feedback, or follow-up requirements for this review; especially useful for `cancel`, `defer`, `request-changes`, and `rework`, where a clear reason or requested changes should be left behind.
- `-k` / `--kill`
- `-p` / `--pause`
- `-y` / `--yes`: continues without asking when some of the selected tasks are already reviewed, or when `accept` uses a range selector such as `--upto` that takes in tasks that have not started yet.
- `--workflow-file <file>` / `--dag <file>` / `-w <file>`: specifies the workflow. When it is omitted, review and continuation actions use the workflow at the head of the queue; `task review clear` must specify it explicitly.

Practical rules:

- `accept` works only with `--code commit`.
- In isolated-branches mode, `request-changes` defaults to `--code commit`, committing the current changes before making new ones; set `--code none` explicitly if you do not want to commit first. It supports only `commit` and `none`.
- `--code none` is only for `revise` / `request-changes`.
- Except for `clear`, every `task review` action command applies only to tasks that have not yet entered `reviewed`.
- `revise` / `request-changes` / `rework` do not use `--downstream`.
- `shared-workspace` does not support `--code`.
- `shared-workspace` does not support `rework`.
- Without an interactive terminal (which is always the case when an agent calls the command), any situation that would ask a question fails immediately with exit code 1 and changes nothing: for `cancel` when there are downstream tasks, specify `--downstream`; for `cancel` while the object is still running, specify `-k` or `-p`; where confirmation is needed, add `-y`.

### dag review

Review commands:

- `cdg dag review accept [workflow]`
- `cdg dag review cancel [workflow]`
- `cdg dag review defer [workflow]`

Cleanup command:

- `cdg dag review clear <workflow...>`

Frequently used options:

- `--code commit|snapshot|discard`
- `--downstream proceed|hold|cascade`
- `-k` / `--kill`
- `-p` / `--pause`
- `-y` / `--yes`: continues without asking when some of the selected workflows are already reviewed (for `clear`, when some are still in the queue).

Usage principles:

- `dag review` is the workflow-level final decision and only does `accept` / `cancel` / `defer`.
- When the workflow is omitted, `accept` / `cancel` / `defer` use the workflow at the head of the queue; `dag review clear` must specify one or more workflows explicitly.
- Except for `clear`, every `dag review` action command applies only to workflows that have not yet entered `reviewed`.
- `clear` is the cleanup subcommand, only for cases where you explicitly need to clear an existing review state and resubmit.
- Settle what happens to each task's code in `task review` first; `dag review` handles the final wrap-up of the workflow.
- `accept` continues downstream by default; you mainly need to think explicitly about downstream handling for `cancel` / `defer`.
- `--downstream cascade` also ends the workflows queued after it. `--code` does not apply to workflows in shared-workspace mode: naming such a workflow is an error, while a cascade that reaches them ends them as usual without code handling.
- Without an interactive terminal, the same requirements as for `task review` apply.

### What to tell the user after a workflow finishes

Once a workflow has finished and entered `reviewed`, tell the user the next step according to the execution mode:

- `executionMode` not set, or `executionMode: isolated-branches`: explain that all tasks of the workflow are done and all changes are local; every task with changes has its own local branch and commits. Next, the user can open a pull request, push to a remote branch, or keep developing locally. The current version of CodeDAG does not provide remote Git operations; when they are needed, the user can run ordinary `git` commands or have an agent run them. To keep developing locally, the user can keep using CodeDAG.
- `executionMode: shared-workspace`: explain that all tasks of the workflow are done locally and suggest that the user check the results manually; for further tasks, the user can keep using CodeDAG.

## Control commands

### pause / unpause

- `cdg task pause ...`
- `cdg dag pause ...`
- `cdg task unpause ...`
- `cdg dag unpause ...`

When to use:

- You want to pause execution for now while allowing the current step to finish if possible.
- `pause` is gentler; it is not a forced kill.

### kill

- `cdg task kill ...`
- `cdg dag kill ...`

When to use:

- The current execution must stop immediately.
- For agent tasks, `kill` is closer to "interrupt the current session/output" than to a gentle pause.

### recover

- `cdg task recover ...`
- `cdg dag recover ...`

When to use:

- A task is stopped in `on-hold`, `killed`, `paused`, or `draining`.
- `recover` tries to resume execution according to why it stopped; if you suspect the working state is already dirty, check the status and logs first, then decide whether to recover.
- After a machine restart or an unexpected termination of the worker process, a task is still recorded as `working`, but no process is driving it any more, and status commands do not restart scheduling either. `cdg status` shows `Diagnostic:` under that workflow's row and `cdg dag status` shows it in the workflow information area, and the task row is marked `[working (stale owner)]`; recover with the `cdg dag recover <workflow>` given there.

How to choose:

- To keep the current progress and continue later: `pause` first.
- When you clearly need to interrupt right away: use `kill`.
- When it has already stopped and you want it to resume: use `recover`.

## Playbooks for common scenarios

### 1. Create a sequential development workflow

1. Create `.codedag/dags/feature.yaml`
2. Write a minimal `tasks` list
3. `cdg dag validate feature`
4. `cdg dag submit feature`
5. `cdg dag status feature`
6. Run `task review` or `dag review` as needed

### 2. Have several agents develop in parallel

1. Prepare worktrees or multiple clones first.
2. Write clear dependencies for the parallel nodes; do not chain together tasks that do not depend on each other.
3. After submitting, prefer `dag status` and `dag logs` to confirm that each task is running in its own workspace.

### 3. A task is done running, but you do not want to accept it yet

1. Check the result with `cdg task status` or `cdg task logs` first.
2. If you are not satisfied with the result but want to keep what it produced, prefer `task review request-changes` to give the requested changes; use `task review revise` if you want to make the changes yourself.
3. If the approach is wrong and the current mode allows it, use `task review rework`.
4. `accept` only once you have confirmed that the result can go on to the next steps.

### 4. Course-correct or inspect the native trace during execution

1. In a real interactive terminal or tmux, go to the project directory and run `cdg task view <taskId> -w <workflow>`; if the conditions cannot be met, use the request-changes fallback from the "Enter a task session" section.
2. Watch the trace in the session, or send prompts to course-correct in real time; whether the agent commits first depends on what the prompt asks for.
3. Exiting `view` does not end the workflow; after exiting, go back to the CodeDAG side and keep checking status and reviewing.

### 5. When an approval prompt appears during a run

1. You notice in `dag logs` / `task logs` that a task shows an approval prompt and has made no progress for a long time.
2. Compare it with the approval-handling policy agreed with the user before submitting: respond yourself if it falls within the agreement, and ask the user first if it does not.
3. Read the screen and respond through tmux as described in "Enter a task session > Driving task view from a non-interactive environment".
4. After responding, exit view and go back to `status` / `logs` to confirm that the task is running again.

## Default habits when writing workflows

- Keep task granularity even; do not let one task hold half a project's worth of work.
- Let dependencies express real constraints; do not drop necessary dependencies just to make things "look simpler".
- Keep `title` and `prompt` readable; someone reading only these two fields should still understand the task's intent.
- Set `autoAccepted` or `taskAutoAccepted` to `none` only when you are sure manual review is wanted.

## Check the detailed docs first in these cases

The detailed documentation is at `https://codedag.com/docs`; check the relevant page in the following cases:

- You need the complete state machine definition rather than explanations of common states.
- You need a precise understanding of branch naming, integration branches, merge conflict resolution, and workspace exclusion.
- You need to investigate side effects of `review` code handling, or understand how a continuation action is taken over in the background.
- You need to answer the user's edge-case questions about sign-in, subscriptions, and credit details.
- You need less commonly used fields or new commands that this skill does not cover.
