---
name: codedag-guide
description: Use when the user mentions CodeDAG or workflows, or gives you a complex task that is better split into interdependent subtasks for several agents to run. Covers the 80/20 path of using CodeDAG, such as writing and submitting workflow files and supervising and intervening in running workflows.
---

# CodeDAG

## When to use

- When the user explicitly mentions CodeDAG or workflows, use CodeDAG.
- When the user's task is complex enough that splitting it into interdependent subtasks, each run by a different agent, works better, consider orchestrating it with CodeDAG.
- Exception: when the "workflow" the user describes is only a few steps run one after another within a simple task, and does not suit being split among several agents, you do not need CodeDAG; finish it in the current session.

## CLI and version requirements

The command is `cdg`; the full command name `codedag` is equivalent.

<!-- codedag-compat:begin -->
- Minimum CodeDAG CLI version: `0.1.0`
- Verified CodeDAG CLI version: `0.1.0`
<!-- codedag-compat:end -->

Use this guide as written without checking the version first; deal with the version only in these cases:

- **`cdg` is not found:** The CodeDAG CLI is not installed or not on your `PATH`. Install it following `https://codedag.com/docs/get-started/installation.md`, then continue.
- **A command or option does not exist, or the CLI behaves differently from this guide:** Run `cdg --version` and compare it with the two versions above. Below the minimum version, commands or behavior described here may not exist yet; upgrade the CodeDAG CLI (see `https://codedag.com/docs/get-started/installation.md`), then continue. At or above the minimum version, correct the command using its `--help`.
- **The service no longer supports this version:** When a command reports `This CodeDAG CLI version (<version>) is no longer supported.`, upgrade the CLI following the docs link in the output, then run the original command again.
- **Before upgrading:** Use `cdg status` to confirm that no workflow is running; if any are, wait for them to finish before upgrading.

## Core concepts

- **workflow:** Called `dag` in commands. A YAML file that describes a set of tasks and their dependencies.
- **Phases:** `planning` (defined only, not submitted) → `submitted` (queued; it may be waiting in the queue, running, waiting, or done but not yet reviewed; while it is actually being driven forward, its running state is `in-progress`) → `reviewed` (it has a final review decision and is no longer driven forward).
- **Review decides what happens downstream:** "Done running" is not "finished". After a task runs, review decides whether its result is accepted and whether downstream work continues; with `autoAccepted=always` the result is accepted automatically, and with `none` the task stops and waits for you to `review` it.
- **Tasks pass information only through repository files:** Every task starts a fresh agent session. It does not inherit other tasks' session context, and tasks cannot message each other. Whatever an upstream task must hand downstream has to be written to files in the repository, and the downstream task's `prompt` must say which files to read.
- **When something stops:** When a task or workflow is `blocked`, `on-hold`, or `killed`, check `status` and `logs` first, then decide between `review`, `revise`, and `recover`.

## 1. Prepare the project

1. **Check the repository and workspaces:** CodeDAG runs inside a Git repository, and a workflow serves exactly one repository. When the tasks only need to run sequentially, the primary repository is enough; parallel isolation needs `git worktree`s or multiple clones as replicas.
2. **Make sure you are signed in:** `cdg init`, `cdg dag submit`, and `cdg auth status` require sign-in; when you are not signed in, they open a browser on this machine, wait for the user to sign in, and then continue the original command. So that a command does not stall waiting for sign-in, check with `cdg auth status --local` before running them: exit code `0` means signed in and `1` means not signed in. If you are not signed in, run `cdg auth login` yourself; it opens a browser on this machine, and you ask the user to finish signing in there. The command exits once sign-in completes, and then you continue.
3. **Initialize:** When the root of the primary repository has no `.codedag` yet, run the non-interactive `cdg init` from the project repository or a registered worktree; it creates the `.codedag` sidecar repository in the primary repository. Done when: the root of the primary repository has `.codedag`.
   - `--primary-workdir`: required; usually the absolute path of the project root.
   - `--default-agent`: when the user has no preference, pass `codex` if you are Codex and `claude` if you are Claude Code.
   - `--replica-workdirs`: space-separated; pass the user's worktree or clone directories. Do not pass the temporary worktrees that Claude Code (under `.claude/worktrees/`) and Codex (under `~/.codex/worktrees/`) create for their own sessions, and leave the option out when no parallelism is needed. When parallelism is needed but there are no replicas yet, agree with the user on how many worktrees to prepare first, then initialize.
   - Example: `cdg init --primary-workdir /path/to/project --replica-workdirs /path/to/project-wt-1 /path/to/project-wt-2 --default-agent codex`
   - When it runs again, existing files under `.codedag` are always kept.
   - When the output shows `Warning: Claude Code <version> is older than ...` or `Warning: Could not determine the Claude Code version`, initialization still completes, but tasks that use Claude Code will go `on-hold` (`agent-version-unsupported`); upgrade Claude Code before running such tasks.
   - When a new team member or machine joins an existing remote `.codedag`, first run `git clone <remote-url> .codedag` at the root of the primary repository, then run `cdg init`. Avoid running `cdg init` first, because the template files it creates block the later pull.

### The `.codedag` repository

- `.codedag` is a Git repository separate from the project repository, and the project repository's Git commands do not touch its files; to commit or sync workflows and shared settings, run Git inside `.codedag`.
- Team-shared files go in `.codedag/dags/` and `.codedag/settings.jsonc`; settings for this machine go in `.codedag/local/settings.local.jsonc`, which is not version-tracked in `.codedag`.
- When the user wants to sync `.codedag` to a remote and has not named the repository, name it `<project-repo-name>-codedag` and put it in the same namespace as the project repository.

### The CodeDAG plugin

- **Default installation:** By default, `cdg init` installs the CodeDAG plugin (which contains this skill) for the Claude Code and Codex on this machine.
- **When it takes effect:** A newly installed plugin takes effect only in new sessions; to use it in the current session, exit and resume (`claude --resume` or `codex resume`).
- **Install later or change the scope:** If initialization skipped the plugin, install it later with `cdg plugin install --all -s user|project|local`; to change the scope, run `cdg plugin uninstall --all` first, then install again.
- **Check and update:** `cdg plugin status --all` shows the installation status and the suggested next step, and `cdg plugin update --all` updates the plugin.

## 2. Write the workflow

Workflow files always go under `.codedag/dags/` in the primary repository. When you work in a worktree, you do not need to change your working directory for this: in commands, a file name (such as `feature`) and `.codedag/dags/feature.yaml` both resolve to this directory in the primary repository, not to one under the current `cwd`; when in doubt, pass an explicit file path. Which workspaces the tasks run in, and which version of the code they start from, are decided by the workflow's `excludeWorkspaces` and `baseRef` fields, independent of your working directory and of where the workflow file is.

### Settle these before writing

The user decides the following two things, and the answers affect the workflow's fields. When the user has already said so, specified them explicitly, or has a standing rule, follow that; when you need to ask, ask everything at once before you start writing.

- **Approval-handling policy:** The access level in each task's `mode` and "how approval prompts during the run are handled" are a single decision. When the policy is unclear and affects safety boundaries (such as enabling full access, or how far you may respond to approvals on the user's behalf), confirm it with the user first, so that a user who wants full automation is not stuck on approvals, and a user who wants to sign off personally does not have actions approved automatically.
- **Execution scope and baseline:** Without `excludeWorkspaces` and `baseRef`, the workflow can use every registered workspace and starts from the `HEAD` of the current integration workspace, whichever directory you are working in. Confirm which workspaces this run may execute in (such as only the primary repository, specific worktrees, or all registered workspaces) and which version of the code it starts from (such as the primary repository's HEAD, a worktree's HEAD, a branch, or a commit), then express that with these two fields. When you work in a `git worktree`, first explain the defaults above to the user, because users tend to assume that the workflow will run in this worktree and on its code.

### Split the work into tasks

Here is an example:

```yaml
tasks:
  - id: 1
    title: "Write a planning document for dag ls JSON output"
    agent: claude
    mode: auto
    prompt: |
      Read the requirements document `docs/requirements/dag-ls-json-output.md`.
      Before writing the plan, read all related code, the existing command implementation, tests, design documents, and historical context, and research the topic thoroughly.
      Write the implementation plan to `docs/plans/dag-ls-json-output-plan.md`.
      This task only writes the plan; do not implement any code.

  - id: 2
    title: "Review the plan for dag ls JSON output"
    dependencies: [1]
    agent: codex
    mode: auto
    autoAccepted: none
    prompt: |
      Review the plan `docs/plans/dag-ls-json-output-plan.md` against the requirements document `docs/requirements/dag-ls-json-output.md` and the related code.
      Write numbered review comments to `docs/plans/dag-ls-json-output-plan-review.md`, each giving the location, the problem, the basis, and a suggestion.
      This task only writes review comments; do not change the plan or implement any code.

  - id: 3
    title: "Implement dag ls JSON output from the plan"
    dependencies: [2]
    agent: claude
    mode: auto
    prompt: |
      Read `docs/plans/dag-ls-json-output-plan.md`.
      Implement the requirements in `docs/requirements/dag-ls-json-output.md` according to that plan, using TDD:
      first write the tests and run them to confirm they fail (red); then write the implementation that makes them pass (green); finally run the full test suite and confirm that everything passes.

  - id: 4
    title: "Review the implementation of dag ls JSON output"
    dependencies: [3]
    agent: codex
    mode: auto
    autoAccepted: none
    prompt: |
      Review the code and test changes of this implementation against the plan `docs/plans/dag-ls-json-output-plan.md`.
      Write numbered review comments to `docs/reviews/dag-ls-json-output-code-review.md`, each giving the location, the problem, the basis, and a suggestion.
      This task only writes review comments; do not change any code.
```

- **Keep planning and implementation apart:** As in the example, make planning and implementation separate tasks. Avoid doing both in one prompt, because each needs a lot of context. Later tasks cannot see the sessions of earlier tasks; they pick up from the plan and review files that earlier tasks wrote.
- **Have different agents write and review:** In the example, Claude writes the plan and the implementation and Codex does both reviews; all four tasks use `mode: auto` (automatic review).
- **Stop after each review to decide:** The two review tasks set `autoAccepted: none`, so they stop and wait for review once they finish. You or the user read the review comments and decide which to adopt. When some should be adopted and acted on, hand them to this task's agent with `cdg task review request-changes <taskId> -w <workflow> -m "<adopted-comments-and-requested-changes>"`; when no changes are needed, or once they are made, accept the task with `cdg task review accept <taskId> -w <workflow>`. The implementation task starts only after task 2 is accepted.
- **Granularity:** Give each task one clear goal, keep the tasks' workloads roughly even, and keep each within what one session can do well.
- **Dependencies:** When a task needs an upstream task's output, put the dependency in `dependencies`.
- **Format:** Every task needs `id` (a positive integer, unique within the workflow), `title`, and `prompt`; `details` is an alias of `prompt`, so write `prompt` in new workflows. Omitting `dependencies` means the task has no dependencies; write them as a flow sequence such as `dependencies: [1, 2]`.

### Execution mode (`executionMode`)

- Use `isolated-branches` by default: each task runs in its own workspace and task branch. Use it for code changes, testing, and parallel development.
- `shared-workspace`: all tasks share one working state, with no per-task isolation. Use it only for lightweight tasks such as documentation, configuration, copywriting, research, and content production, for example generating or translating user docs, UI i18n, and research and reports. It does not suit parallel coding, frequent builds or tests, or engineering work that needs clear attribution. When you use it, keep one workflow to one goal, and have tasks that run at the same time write separate files.

### Task fields

- `agent`: `codex` or `claude`; different tasks can use different agents. When omitted, the configured default is used.
- `mode`: decides the task's permissions and interaction policy: which operations run without approval during the run, and whether approval prompts need someone to respond to them. For Codex, it also covers the sandbox level, network access, and web search. **Setting it explicitly is strongly recommended**: when it is not set, CodeDAG does not pass the parameter, so the actual access level depends on the agent's own configuration and cannot be told from the workflow file. For Claude, the value is a `--permission-mode` value (plus the aliases `yolo` and `askForPermissions`); for Codex, it is a key-value combination of `ask-for-approval` / `sandbox` / `approvals_reviewer` / `search` / `network_access`, or the shorthand `yolo` or `approve-for-me` (same as `auto`). Recommended settings:

  | | Full access (headless, fully automatic) | Automatic review |
  |---|---|---|
  | **Claude** | `mode: bypassPermissions` | `mode: auto` (a background classifier reviews and allows actions automatically; when it blocks one, the model adjusts on its own) |
  | **Codex** | `mode: yolo` (equivalent to the official `--dangerously-bypass-approvals-and-sandbox`, plus `--search`; network access is open) | `mode: approve-for-me` (that is, `--approve-for-me`: a workspace-write sandbox, with approval requests sent to Codex automatic review first; when one is denied, the model adjusts on its own); when each request needs manual approval, use `mode: "approvals_reviewer=user,ask-for-approval=on-request,sandbox=workspace-write,network_access=true"` |

  - ⚠️ Full access skips the agent's permission checks: use it only for trusted tasks in controlled environments, and only after confirming the approval-handling policy with the user as described in "Settle these before writing".
  - The Codex `workspace-write` sandbox blocks network access by default; with `approve-for-me`, the model can request to step outside the sandbox, and the request goes to automatic review. To open network access inside the sandbox directly, use the key-value combination `approvals_reviewer=auto_review,ask-for-approval=on-request,sandbox=workspace-write,network_access=true`.
  - If you confirm that the Claude model in use (Sonnet 4.6 / Opus 4.6 / Fable 5 or later is required) or the organization's settings do not support `auto`, use `mode: acceptEdits` instead (reads, file edits, and common filesystem commands need no approval; other commands ask for approval).
- `model` / `effort`: fine-grained control over the model and reasoning effort; set them only when you really need to pin them.
- `autoAccepted`: the task's auto-accept rule; the default is `always`. Set it to `none` when each task must be reviewed manually before its downstream tasks proceed.
- `branchName`: only under `isolated-branches`, and only when you must pin the task branch name; when a branch with the same name already exists, validation warns with `branch-name-conflict`.

### Workflow fields

- `maxConcurrency`: the workflow-level concurrency. The default is `maxConcurrency` from the project settings; when the project does not set it either, it is `1` (serial). Set it only when you need to override it.
- `dagAutoAccepted`: the workflow's auto-accept rule; the default is `done`. Set it to `none` when each workflow must be reviewed manually before downstream workflows proceed.
- `taskAutoAccepted`: the workflow-level default for task auto-accept; the default is `always`. It is equivalent to setting `autoAccepted` on every task in the workflow, and a task's own `autoAccepted` overrides it.
- `baseRef`: explicitly sets the Git baseline of this workflow run. The default is the `HEAD` of the current integration workspace, meaning the commit checked out when the workflow run starts becomes the baseline.
- `mergeConflictAgent`: the agent configuration used to resolve merge conflicts automatically (`agent` is required; `mode` / `model` are optional). The default is empty: task-level automatic merges use the task's own `agent` and `model`, and workflow-level publish conflict handling uses the default agent from the project settings at submission time. Nobody can respond to approvals in a conflict session, so its `mode` comes only from `mergeConflictAgent.mode`; when that is not set, the session runs at the full-access level `yolo` (Claude Code requires the full-access warning to have been accepted on this machine). Set `mode` explicitly when lower permissions are needed, but the session gets stuck as soon as it shows an approval prompt.
- `excludeWorkspaces`: excludes workspaces from scheduling in this run. The default is an empty list, meaning every registered workspace of the project can be scheduled in this run.

### Write prompts

The recommended structure of a `prompt`:

```text
Goal:
What to implement / analyze / fix / write.

Context and background:
The current repository, related modules, known assumptions, the documents and files to consult, and the recommended skills or tools.

Completion criteria:
What results or effects to produce, and how to verify that they meet the requirements.

Constraints:
Limits that must be followed; for example, do not change unrelated files, keep the tests passing, change only the specified directory.

Required or recommended process (optional):
If the user explicitly requires or recommends a process, add it here; otherwise leave this section out.
```

The template above is shown in English; when you write an actual `prompt`, prefer the language the end user is working in.

Before writing a prompt, sort the user's input into two kinds:

- **Writing instructions for you:** the rules, priorities, formats, trade-offs, or styles the user wants you to follow while writing the workflow. Understand what they are for and turn them into actions you take while writing, such as splitting tasks, setting dependencies, choosing fields, deciding what goes into the prompt, tightening the wording, or adjusting constraints.
- **Task content for the executing agent:** the work the user wants the executing agent to actually do, the materials it should read, the files it should change, how it should verify, or what it should deliver. Put only this kind into `prompt`, plus anything else that genuinely helps the executing agent complete the task.

Two more rules:

- You run flow control such as `submit`, `review`, and `pause` in the CLI yourself; `prompt` covers only what the task itself has to do.
- For analysis, research, or troubleshooting tasks that change no code, still require the agent to write its results to a file named in the prompt (with its path), because results given only as a reply in the conversation are visible to no one once the task ends.

## 3. Submit the workflow

1. **Make sure you are signed in:** as in step 2 of "Prepare the project".
2. **Validate:** `cdg dag validate <workflow>`. Fix errors first; when there are warnings, understand them before deciding whether to continue.
3. **Submit:** `cdg dag submit <workflow>`; when you continue despite warnings, add `-y`, because without an interactive terminal, leaving out `-y` can cancel the submission. When you submit, the CLI checks your credits, and the submission is refused when there are not enough; see "Credits and deductions" below. Done when: the command exits with code 0 and the workflow is queued.

### Credits and deductions

CodeDAG deducts credits only when a workflow starts running, so credits need attention only at submission, at the start of execution, and on recovery.

- **How credits are deducted:** Submitting only checks that there are enough credits and deducts nothing; when the workflow starts running, credits are deducted once for the tasks it will run this time, 1 credit per task; `recover` reuses the original deduction and deducts nothing again.
- **What this means day to day:**
  - **Recover a stopped workflow first:** Prefer `recover` for a workflow that has stopped; avoid cancelling it and submitting it again, because that deducts credits for its tasks a second time.
  - **Check proactively:** When the user asks about credits, or when you are deciding how many tasks to split the work into or whether to rerun something, check the remaining credits and the reset time with `cdg auth status`. After a successful submission, the output states how many credits this submission needs and how many remain; pass these on to the user when you report back.
- **When something goes wrong:**
  - **The submission is refused for lack of credits:** `cdg dag submit` exits with code 1 and the workflow is not queued. Retrying does not add credits, so pass the output on to the user and let the user decide how to continue. When the output includes `Your credits reset at <time>.`, the credits reset at that time, so you can wait until then to submit; with free or beta credits, the user can also subscribe at the URL in the output. When it does not, this credit pool has no next window, so the only ways forward are to subscribe following the guidance in the output or to manage the subscription on the Billing page.
  - **Stopped when the workflow starts running:** The workflow stays `on-hold` (`startup-gate-blocked`), and `cdg dag status` shows three lines: `Startup gate failure:`, `Details:`, and `Action:`. Follow the steps in `Action:`, which usually means dealing with the cause and then running `cdg dag recover <workflow>`. When a `Recover by: <time>` line follows `Action:`, recover before that time; after it, the workflow can only be submitted again, which deducts credits a second time.

## 4. Supervise and intervene

### Routine checks

You own the workflow and answer for it from submission until it enters `reviewed`: check on it proactively at the pace this section sets, and spot stalls, idle spinning, pending approvals, and usage limits promptly. Approvals raised by the agents inside tasks are also yours to handle: handle approvals and anomalies within the agreed authorization yourself (see "When an approval prompt appears during a run"), and escalate high-risk approvals, destructive operations, and decisions outside the agreement to the user.

- **What to look at:** `cdg status` (equivalent to `cdg dag ls`) shows the global status board, `cdg dag status [workflow]` one workflow and its tasks, and `cdg task status <taskId> -w <workflow>` one task. For logs, use `cdg dag logs [workflow]` and `cdg task logs <taskId> -w <workflow>`, with `-n <lines>` to see only the last few lines.
- To view or manually change a task's code, get the code location from these two commands: `cdg task status <taskId>` gives the task's workspace, task branch, and the commit before the task started (`Workspace`, `Branch`, `Base Commit`), and `cdg dag status` gives the integration workspace, the integration branch, and the workflow's starting commit; under `shared-workspace` there is only the execution directory.
- Right after launch: check `status`, `dag status`, and `dag logs -n <lines>` frequently.
- Once it runs steadily: check once every 5–10 minutes instead. Avoid polling more often, because it does not make tasks run any faster; it only disturbs the user and uses up context.
- At every check, confirm actual progress rather than status alone: for each running task, see whether the latest output of `task logs` and the changes in its workspace (for example `git diff --stat`) keep growing. When the status is `working` but these have not changed for a long time, use the next item to decide whether the task is stuck. After each check, leave the user a one-line note on how far each task has actually got.
- Be patient while waiting for node tasks. Avoid taking the intervention path before 10 consecutive minutes without a response, because a short period without new output does not mean a task is stuck, especially when it has dispatched subagents of its own.
- To change a task's direction during a run, prefer entering its session with `cdg task view <taskId> -w <workflow>` and sending a prompt; exit after the exchange and go back to status and logs to confirm progress. When the conditions for view are not met, use the fallback in "Enter a task session".

### Enter a task session

- `cdg task view <taskId> -w <workflow>`; if needed, resume a session with `--session-id <id>`.
- When the task has stopped (`killed` / `paused` / `on-hold`, or its worker process has exited) and its session is not running, `task view` only reopens the original session and sends nothing to the agent: ask the agent to continue in the session and the task resumes with it; exit right away and the task stays as it was.
- **When to enter:** For ordinary observation, `status` and `logs` are enough. To course-correct in real time, inspect the native trace, or respond to native interactions during execution, enter `view` and send one or more prompts as needed; to ask for changes to a result once the task is done and waiting for review, use `request-changes` (see task review).
- **Git commits:** Sending a prompt in `view` does not commit before the changes; when a commit is needed first, say so explicitly in the prompt, for example "Commit the current changes first, then make the following changes...".
- **Exit:** After intervening, exit with `Ctrl+C`; the original task keeps running, and its process exits automatically when it finishes. If the original task has finished but has not exited automatically, enter again with `cdg task view <taskId> -w <workflow>` and send `/exit` in the session. End sessions only in these two ways so that CodeDAG records the task state; avoid forcibly ending the underlying agent process with the system `kill` or `pkill`, because that bypasses CodeDAG's state management.
- **A real interactive terminal is needed:** When you run in a non-interactive environment such as a shell tool, host `view` in tmux. If tmux is not installed and the user has authorized you to install software, install it; otherwise ask the user whether to install it. Put both the workflow and the task in the session name, replacing `.` / `:` in the workflow name with `-`:

  1. `tmux new-session -d -s cdg-view-<workflow>-<taskId> 'cdg task view <taskId> -w <workflow>'` starts the background hosting session.
  2. `tmux capture-pane -t cdg-view-<workflow>-<taskId> -p` reads the current screen; confirm the approval content, the available choices, and the corresponding keys.
  3. `tmux send-keys -t cdg-view-<workflow>-<taskId> <key>` sends the response; base the keys on the on-screen prompt read in step 2, because the approval panels of different agents have different options and key bindings.
  4. When done, exit the standard way described above with `tmux send-keys -t cdg-view-<workflow>-<taskId> C-c`, confirm with `capture-pane` that view has exited, then clean up the hosting session with `tmux kill-session -t cdg-view-<workflow>-<taskId>`.

- **Fallback:** When tmux is not available (for example, the user does not install it), you can course-correct during a run with `cdg task review request-changes <taskId> -w <workflow> -k -m "<requested-changes>"`; to let the current work finish first, replace `-k` with `-p`. Never use the two together.

### When an approval prompt appears during a run

1. You notice in `dag logs` / `task logs` that a task shows an approval prompt and has made no progress for a long time.
2. Compare it with the approval-handling policy agreed with the user (see "Settle these before writing"): respond yourself if it falls within the agreement, and ask the user first if it does not.
3. Read the screen and respond following the tmux steps in "Enter a task session".
4. After responding, exit view and go back to `status` / `logs` to confirm that the task is running again.

### Control commands

- **pause:** `cdg task pause ...` / `cdg dag pause ...` pause progress: steps already running finish on their own, and later ones do not start; undo it with `unpause`.
- **kill:** `cdg task kill ...` / `cdg dag kill ...` interrupt the current execution immediately; for an agent task, this interrupts the current session.
- **recover:** `cdg task recover ...` / `cdg dag recover ...` resume execution according to why it stopped, when a task is stopped in `on-hold`, `killed`, `paused`, or `draining`.
- **The process is gone:** After a machine restart or an unexpected termination of the worker process, a task is still recorded as `working`, but no process is driving it any more, and status commands do not restart scheduling either. `cdg status` shows `Diagnostic:` under that workflow's row and `cdg dag status` shows it in the workflow information area, and the task row is marked `[working (stale owner)]`; recover with the `cdg dag recover <workflow>` given there.

### When a task hits a usage limit

Agent providers impose two kinds of usage limits: the 5-hour limit and the weekly limit. A task that hits either one stops `on-hold` with the reason `agent-api-error` and does not become `done`; the log of a Claude Code task contains a line starting with `Claude API stopped the current turn due to rate limiting.`, with the reset time given after `Reset information:`. Both kinds are handled the same way; they differ only in how far away the reset is. First determine whether the limited agent type is the same as your own supervising agent, then limit the damage right away and set a long `sleep` that covers the reset time. When the reset is far away (a weekly limit often resets days later), tell the user the reset time first, then wait in whatever way your environment supports, such as a scheduled wake-up; when you cannot, stop, and let the user ask you to resume after the limit resets.

Ways to limit the damage:

- A single agent type, or the rest of the current workflow cannot avoid the limited agent: stop the whole affected workflow with `cdg dag kill <workflow>`, then go into a long `sleep`; there is nothing to respond to during the sleep.
- Mixed agent types, and the agent supervising the current workflow has not hit the limit: stop only the tasks of the limited agent with `cdg task kill <taskId> -w <workflow>`; set a long `sleep` as a reminder, and keep supervising the tasks of the agents that are not limited.
- Mixed agent types, and the agent supervising the current workflow has also hit the limit: stop only the tasks of the limited agent with `cdg task kill <taskId> -w <workflow>`; after setting a long `sleep`, stop supervising the tasks of the agents that are not limited.

After the limit resets, finish up; the usual approach is to recover in place:

- First check the tasks that ended around the time of the limit, and confirm that their results are complete.
- If the whole workflow was stopped earlier with `dag kill`, recover it with `cdg dag recover <workflow>`; if only the tasks of the limited agent were stopped, recover those tasks with `cdg task recover <taskId...> -w <workflow>`. `on-hold` and `killed` tasks pick up in their original sessions, and `paused` tasks wait to be scheduled again; recovering does not consume CodeDAG credits again.
- After recovering, return to the checking schedule and confirm that the tasks are running again. If a task goes `on-hold` (`agent-api-error`) again, the limit has not reset yet; keep waiting, then `recover`.

Only when a task's result is incomplete but has already been accepted, so it cannot be recovered in place, collect the completed results and continue in a new workflow; the new workflow consumes CodeDAG credits for its own tasks. The steps in isolated-branches mode:

- If the affected workflow still has tasks of non-limited agents in progress, first pause it with `cdg dag pause <workflow>`, so that tasks already started finish while downstream tasks do not start, which keeps half-finished work to a minimum.
- Once the workflow is no longer `working`, check each task that has started but has no review decision yet, and determine which are fully complete and which are only half done. Cancel each half-done task with `cdg task review cancel <taskId> -w <workflow> --code snapshot --downstream cascade`: its existing changes are saved to a snapshot branch, so you can still restore them later; its result is not handed downstream, and its downstream tasks that have not started will not start in this run either.
- Finish the whole workflow with `cdg dag review accept <workflow>`. The other tasks that have finished running are accepted with it, and their results are merged into the integration branch, whose name is shown as `Integration Branch` in `cdg dag status <workflow>`. This step accepts every task that has run but has no decision yet, so cancel all half-done tasks in the previous step first.
- Put the canceled tasks, the tasks that never started, and the remaining work of tasks accepted with incomplete results into a new workflow and submit it; point `baseRef` at that integration branch so that it continues from the accepted results.

## 5. Review and wrap up

Manual review is needed only when a task or workflow explicitly sets `autoAccepted: none` (at the workflow level, `taskAutoAccepted: none` or `dagAutoAccepted: none`); everything else is accepted automatically. You carry out manual review when the user has authorized it in advance or on the spot; without that authorization, remind the user to run the review commands.

Except for `clear`, the actions of `task review` and `dag review` apply only to tasks or workflows that have not yet entered `reviewed`. Once an object has entered `reviewed`, use `clear` only when you explicitly need to clear its review state and resubmit; otherwise create a follow-up workflow to carry the work on.

### task review

`cdg task review <action> <taskId...> -w <workflow>`. When `-w` is omitted, the command acts on the workflow at the head of the queue, so always pass `-w`.

- `accept`: accepts the result; the task enters reviewed.
- `cancel`: cancels the current result; the task enters reviewed.
- `defer`: postpones the decision; the task enters reviewed.
- `request-changes`: has the agent keep changing the work based on the current result. When you are not satisfied with the result but want to build on what it produced, prefer this, and use `-m` to say which results to keep and what to adjust. By default it commits the current changes before making new ones; add `--code none` if you do not want to commit first.
- `revise`: keeps the current working state so that you can keep revising it yourself.
- `rework`: discards the current implementation approach and redoes the task from a clean baseline.
- `clear`: clears an existing review state, for cases where you explicitly need to resubmit.

Frequently used options:

- **`-m <text>`:** For `accept`, `cancel`, `defer`, and `revise`, it records a review note; for `request-changes` and `rework`, it is the requested changes handed to the agent, and when it is omitted, the agent receives a built-in prompt.
- **`--code`:** where the current task's code goes; not used under `shared-workspace`.
  - `commit`: keeps it as a result that downstream tasks can merge.
  - `snapshot`: saves it to a snapshot branch, outside downstream merges, so that you can still restore it later.
  - `none`: leaves the current code as it is, for `revise` or `request-changes` to keep changing.
  - `discard`: discards the current code; downstream tasks do not use it either.
  - The values each action accepts (the first is the default): `accept` only `commit`; `cancel` and `defer` `snapshot`, `commit`, `discard`; `revise` `none`, `commit`, `snapshot`, `discard`; `request-changes` `commit`, `none`; `rework` `snapshot`, `discard`.
- **`--downstream`:** how downstream tasks are handled; only for `accept`, `cancel`, and `defer`. `proceed` lets downstream tasks continue, `hold` stops them to wait for someone to handle them, and `cascade` applies this decision to downstream tasks as well (for example, with `cancel`, downstream tasks that have not started will not run either). The default is `proceed` for `accept` and `cascade` for `defer`; `cancel` has no default, so specify it.
- **`-k` / `-p`:** When the task is still running (for example, `cancel` during a run, or `request-changes` as the course-correction fallback), stop it first, then carry out the review action: `-k` interrupts the agent immediately, and `-p` lets it finish its current step. Never use the two together.

### dag review

- `cdg dag review accept|cancel|defer [workflow]` gives the workflow-level final decision; when the workflow is omitted, it acts on the workflow at the head of the queue, so always name it. `cdg dag review clear <workflow...>` clears the review state.
- Settle what happens to each task's code in `task review`; `dag review` handles the final wrap-up of the workflow.
- **`--code`:** where the workflow-level code result goes; not used for workflows in shared-workspace mode. `commit` publishes the workflow's result as the reviewed output, `snapshot` archives it for later viewing, and `discard` discards it. The default is `commit` for `accept` and `snapshot` for `cancel` and `defer`.
- **`--downstream`:** acts on the workflows queued after this one, with the same values as in task review; `cascade` ends them as well. The default is `proceed` for `accept` and `cascade` for `defer`; `cancel` has no default, so specify it.
- **`-m`, `-k`, `-p`:** used as in task review, acting on the whole workflow.

### What to tell the user after a workflow finishes

Once a workflow has finished and entered `reviewed`, tell the user the next step according to the execution mode:

- `isolated-branches` (the default): explain that all tasks of the workflow are done and all changes are local; every task with changes has its own local branch and commits. Next, the user can open a pull request, push to a remote branch, or keep developing locally.
- `shared-workspace`: explain that all tasks of the workflow are done locally, and suggest that the user check the results manually.

## What this skill does not cover

For CodeDAG product questions this skill does not cover, check the user docs at `https://codedag.com/docs`; the page index is at `https://codedag.com/llms.txt`. Append `.md` to the URL of any docs page to get that page as plain Markdown, which is easier to read.
