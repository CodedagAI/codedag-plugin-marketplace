---
name: codedag-guide
description: 当用户提到 CodeDAG 或工作流，或者交代的复杂任务适合拆成相互依赖的子任务、交给多个 Agent 执行时使用；覆盖 CodeDAG 最常用的 80/20 操作路径，如工作流文件的撰写与提交、工作流的监督与干预等。
---

# CodeDAG

## 何时使用

- 用户明确提到 CodeDAG 或工作流时，使用 CodeDAG。
- 用户交代的任务较复杂，拆成相互依赖的子任务、由不同的 Agent 分别执行更合适时，考虑用 CodeDAG 编排。
- 例外：用户说的工作流只是一个简单任务里依次执行的几个步骤，不适合拆给多个 Agent 分别完成时，不必使用 CodeDAG，直接在当前会话里做完。

## CLI 与版本要求

命令用 `cdg`，完整命令名 `codedag` 与它等价。

<!-- codedag-compat:begin -->
- 最低 CodeDAG CLI 版本：`0.1.0`
- 已核对的 CodeDAG CLI 版本：`0.1.0`
<!-- codedag-compat:end -->

平时直接按本文使用，不必事先查版本；遇到下列情况时再处理：

- **找不到 `cdg`：** CodeDAG CLI 尚未安装或不在 `PATH` 中，按 `https://codedag.com/docs/get-started/installation.md` 安装后再继续。
- **命令或参数不存在，或行为与本文不一致：** 运行 `cdg --version`，与上面的两个版本比较。低于最低版本时，本文写到的命令或行为可能还不存在，升级 CodeDAG CLI（方法见 `https://codedag.com/docs/get-started/installation.md`）后再继续；不低于最低版本时，按该命令的 `--help` 改正。
- **服务端不再支持当前版本：** 命令报 `This CodeDAG CLI version (<版本>) is no longer supported.` 时，按输出中的文档链接升级 CLI，再重新执行原命令。
- **升级之前：** 用 `cdg status` 确认没有运行中的工作流，有的话等它们结束再升级。

## 核心概念

- **workflow：** 命令中叫 `dag`。一个 YAML 文件，描述一组任务及依赖关系。
- **阶段：** `planning`（只定义，未提交）→ `submitted`（已入队，可能在排队、执行、等待或已完成未审核；其中正在实际推进的运行态是 `in-progress`）→ `reviewed`（已有最终审核结论，不再推进）。
- **review 决定下游：** “执行完成”不等于“流程结束”。任务跑完后，由 review 决定结果是否被接受、下游是否继续；`autoAccepted=always` 时自动接受，`none` 时停下等你 `review`。
- **任务之间只靠仓库文件传递信息：** 每个任务都启动全新的 Agent 会话，不继承其他任务的会话上下文，任务之间也不能互发消息。上游任务要交给下游的结果，必须写进仓库文件；下游任务的 `prompt` 要写明去读哪些文件。
- **停住时：** 任务或工作流处于 `blocked`、`on-hold`、`killed` 时，先看 `status` 与 `logs`，再决定 `review`、`revise` 还是 `recover`。

## 1. 准备项目

1. **确认仓库与工作区：** CodeDAG 运行在 Git 仓库内，一个 workflow 只服务一个仓库。任务只需顺序执行时，主仓库即可；需要并行隔离时，要有 `git worktree` 或多个 clone 作为副本。
2. **确认已登录：** `cdg init`、`cdg dag submit`、`cdg auth status` 需要登录；未登录时，它们会在本机打开浏览器并等待用户登录，登录完成后继续原命令。为了不让命令停在等待登录，运行它们之前先用 `cdg auth status --local` 确认：退出码 `0` 为已登录，`1` 为未登录。未登录时，你运行 `cdg auth login`，它会在本机打开浏览器，请用户在浏览器中完成登录；命令在登录完成后退出，再继续。
3. **初始化：** 主仓库根目录还没有 `.codedag` 时，在项目仓库或已注册的 worktree 中运行非交互式 `cdg init`，它把 `.codedag` sidecar 仓库建在主仓库。完成标准：主仓库根目录有了 `.codedag`。
   - `--primary-workdir`：必须传，通常是项目根目录的绝对路径。
   - `--default-agent`：用户没有偏好时，你是 Codex 就传 `codex`，你是 Claude Code 就传 `claude`。
   - `--replica-workdirs`：空格分隔，传用户的各 worktree 或克隆副本目录；Claude Code（`.claude/worktrees/` 下）与 Codex（`~/.codex/worktrees/` 下）为自身会话创建的临时 worktree 不传；无需并行时不传。需要并行但还没有副本时，先和用户商量准备几个 worktree，再初始化。
   - 示例：`cdg init --primary-workdir /path/to/project --replica-workdirs /path/to/project-wt-1 /path/to/project-wt-2 --default-agent codex`
   - 重复运行时，`.codedag` 下已有的文件一律保留。
   - 输出 `Warning: Claude Code <版本> is older than ...` 或 `Warning: Could not determine the Claude Code version` 时，初始化照常完成，但使用 Claude Code 的任务会进入 on-hold（`agent-version-unsupported`）；先升级 Claude Code 再运行这类任务。
   - 新成员或新机器接入已有的远程 `.codedag` 时，先在主仓库根目录执行 `git clone <远程地址> .codedag`，再运行 `cdg init`；避免先运行 `cdg init`，因为它生成的模板文件会挡住之后的 pull。

### `.codedag` 仓库

- `.codedag` 是独立于项目仓库的 Git 仓库，项目仓库的 Git 命令不涉及其中的文件；要提交或同步 workflow 与共享设置，进入 `.codedag` 执行 Git。
- 团队共享的文件放在 `.codedag/dags/` 与 `.codedag/settings.jsonc`；本机设置放在 `.codedag/local/settings.local.jsonc`，不进入 `.codedag` 的版本管理。
- 用户要把 `.codedag` 同步到远程、又没有指定仓库名时，命名为 `<项目仓库名>-codedag`，放在与项目仓库相同的命名空间下。

### CodeDAG 插件

- **默认安装：** `cdg init` 默认为本机的 Claude Code、Codex 安装 CodeDAG 插件（含本技能）。
- **生效时机：** 新装的插件只在新会话中生效；要在当前会话使用，先退出再恢复（`claude --resume` 或 `codex resume`）。
- **补装与改范围：** 初始化时跳过了插件安装的，用 `cdg plugin install --all -s user|project|local` 补装；改范围时先 `cdg plugin uninstall --all` 再装。
- **查看与更新：** `cdg plugin status --all` 查看安装状态与下一步建议，`cdg plugin update --all` 更新插件。

## 2. 编写工作流

工作流文件一律放在主仓库的 `.codedag/dags/` 下。你在某个 worktree 中工作时，不必为此切换工作路径：命令中用文件名（如 `feature`）或 `.codedag/dags/feature.yaml` 指定工作流，两种写法都解析到主仓库的这个目录，而不是当前 `cwd` 下的；拿不准时传显式文件路径。任务在哪些工作区执行、以哪一版代码为基线，由工作流的 `excludeWorkspaces` 与 `baseRef` 字段决定，与你的工作路径和工作流文件的位置无关。

### 动笔前先问清

下面两件事由用户决定，答案会影响工作流的字段。用户已经明示、显式指定，或已有长期规则时，直接沿用；需要问时，动笔前一次问完。

- **审批处置策略：** 各任务 `mode` 的授权档与“运行中弹出审批如何处理”是一体决策。策略不明确且影响安全边界（如启用完全授权档、代用户应答审批的范围）时，先与用户确认，让用户要全自动时不被审批卡住、要亲自把关时不被自动放行。
- **执行范围与基线：** 不写 `excludeWorkspaces` 与 `baseRef` 时，工作流可以使用全部已注册的工作区，以当前集成工作区的 `HEAD` 为基线，与你在哪个目录工作无关。确认本轮允许在哪些工作区执行（如仅主仓库、指定若干 worktree、全部已注册工作区），以及以哪一版代码为基线（如主仓库的 HEAD、某个 worktree 的 HEAD、某个分支或提交），再用这两个字段落实。你在某个 `git worktree` 中工作时，先向用户说明上面的默认，因为用户容易以为工作流会在这个 worktree 里、以它的代码执行。

### 拆分任务

下面是一个示例：

```yaml
tasks:
  - id: 1
    title: "为 dag ls JSON 输出编写规划文档"
    agent: claude
    mode: auto
    prompt: |
      阅读需求文档 `docs/requirements/dag-ls-json-output.md`。
      充分阅读所有相关代码、现有命令实现、测试、设计文档与历史上下文，并进行全面调研后，再开始写规划。
      将实现规划写入 `docs/plans/dag-ls-json-output-plan.md`。
      本任务只写规划，不实现代码。

  - id: 2
    title: "审查 dag ls JSON 输出的规划"
    dependencies: [1]
    agent: codex
    mode: auto
    autoAccepted: none
    prompt: |
      对照需求文档 `docs/requirements/dag-ls-json-output.md` 与相关代码，审查规划 `docs/plans/dag-ls-json-output-plan.md`。
      把审查意见逐条编号写入 `docs/plans/dag-ls-json-output-plan-review.md`，每条写明位置、问题、依据与建议。
      本任务只写审查意见，不修改规划，也不实现代码。

  - id: 3
    title: "根据规划实现 dag ls JSON 输出"
    dependencies: [2]
    agent: claude
    mode: auto
    prompt: |
      阅读 `docs/plans/dag-ls-json-output-plan.md`。
      根据该规划实现 `docs/requirements/dag-ls-json-output.md` 中的需求，按 TDD 进行：
      先写测试并运行，确认失败（红灯）；再写实现，让这些测试通过（绿灯）；最后运行全量测试，确认全部通过。

  - id: 4
    title: "审查 dag ls JSON 输出的实现"
    dependencies: [3]
    agent: codex
    mode: auto
    autoAccepted: none
    prompt: |
      对照规划 `docs/plans/dag-ls-json-output-plan.md`，审查本次实现的代码与测试改动。
      把审查意见逐条编号写入 `docs/reviews/dag-ls-json-output-code-review.md`，每条写明位置、问题、依据与建议。
      本任务只写审查意见，不修改代码。
```

- **规划与实现分开：** 像示例这样把规划和实现各自做成一个任务，避免在一个 prompt 里做完，因为两者都要用到大量上下文。后面的任务看不到前面任务的会话，靠读前面写下的规划与审查文件接着做。
- **写与审交给不同的 Agent：** 示例中写规划与实现用 Claude，两个审查用 Codex，四个任务的 `mode` 都是 `auto`（自动审查档）。
- **审查之后停下来决定：** 两个审查任务设了 `autoAccepted: none`，跑完后停下等 review。由你或用户读审查意见，决定采纳哪些：有要采纳并修改的，用 `cdg task review request-changes <taskId> -w <workflow> -m "<采纳的意见与修改要求>"` 交给这个任务的 Agent 去改；不需要修改或改完之后，用 `cdg task review accept <taskId> -w <workflow>` 接受。任务 2 被接受之后，实现任务才开始。
- **粒度：** 一个任务只做一个清晰目标，各任务的工作量大致均匀，每个都在一次会话能做好的范围内。
- **依赖：** 任务需要上游的产出时，把依赖写进 `dependencies`。
- **格式：** 每个任务都需要 `id`（正整数，同一 workflow 内唯一）、`title` 与 `prompt`；`details` 是 `prompt` 的别名，新写时用 `prompt`。`dependencies` 不写时表示无依赖，写成 `dependencies: [1, 2]` 这样的 flow sequence。

### 执行模式（executionMode）

- 默认用 `isolated-branches`：每个任务在独立工作区和任务分支上执行，代码修改、测试、并行开发都用它。
- `shared-workspace`：所有任务共享同一个现场，不做任务级隔离。只用于文档、配置、文案、调研、内容生产这类轻量任务，如用户文档生成或翻译、UI i18n、调研与报告；不适合并行编码、频繁编译或测试、需要清晰归因的工程实现。使用时，一个 workflow 只服务一个目标，同时运行的任务各写各的文件。

### 任务字段

- `agent`：`codex` 或 `claude`，不同任务可以用不同的 Agent；不填时使用默认配置值。
- `mode`：决定该任务的执行权限与交互策略——运行中哪些操作免审批、是否会弹审批需要值守；Codex 侧还覆盖沙箱档位、网络访问与 Web Search 开关。**强烈建议显式填写**：未设置时 CodeDAG 不传该参数，实际授权档取决于 Agent 自身的配置，从工作流文件中看不出来。Claude 的取值是 `--permission-mode` 的值（另有别名 `yolo`、`askForPermissions`）；Codex 的取值是 `ask-for-approval` / `sandbox` / `approvals_reviewer` / `search` / `network_access` 的键值组合，或简写 `yolo`、`approve-for-me`（同 `auto`）。推荐配置：

  | | 完全授权（无头全自动） | 自动审查 |
  |---|---|---|
  | **Claude** | `mode: bypassPermissions` | `mode: auto`（后台分类器自动审查放行，拦截时模型自行调整） |
  | **Codex** | `mode: yolo`（等价官方 `--dangerously-bypass-approvals-and-sandbox` 并额外开启 `--search`，网络已放开） | `mode: approve-for-me`（即 `--approve-for-me`：workspace-write 沙箱，审批请求先交给 Codex 自动审查，被拒时模型自行调整）；需人工逐次审批时用 `mode: "approvals_reviewer=user,ask-for-approval=on-request,sandbox=workspace-write,network_access=true"` |

  - ⚠️ 完全授权档跳过 Agent 的权限检查：仅用于可信任务与可控环境，并按“动笔前先问清”与用户确认审批处置策略后使用。
  - Codex `workspace-write` 沙箱默认禁网；`approve-for-me` 可由模型申请越出沙箱并交给自动审查。需要直接放开沙箱内网络时，使用键值组合 `approvals_reviewer=auto_review,ask-for-approval=on-request,sandbox=workspace-write,network_access=true`。
  - 确认 Claude 所用模型（需 Sonnet 4.6 / Opus 4.6 / Fable 5 及以上）或组织设置不支持 `auto` 时，改用 `mode: acceptEdits`（读取、文件编辑与常用文件系统命令免批，其余命令索批）。
- `model` / `effort`：用于精细化约束模型与推理力度；只有确实需要固定时再写。
- `autoAccepted`：任务自动接受规则，默认值为 `always`。需要在每个任务完成后，手动 `review` 才推进下游任务时，设置为 `none`。
- `branchName`：只在 `isolated-branches` 下、必须固定任务分支名时写；同名分支已存在时，校验会给出 `branch-name-conflict` 警告。

### 工作流字段

- `maxConcurrency`：工作流级并发数，默认取项目设置中的 `maxConcurrency`，项目也没设置时为 `1`（串行）；需要覆盖时再写。
- `dagAutoAccepted`：工作流自动接受规则，默认值为 `done`。需要在每个工作流完成后，手动 `review` 才推进下游工作流时，设置为 `none`。
- `taskAutoAccepted`：工作流级任务自动接受默认值，默认值为 `always`。相当于为工作流中的每个任务设置了 `autoAccepted`，可被任务自身的 `autoAccepted` 字段覆盖。
- `baseRef`：显式指定本轮 DAG 的 Git 基线。默认值为当前集成工作区的 `HEAD`，表示以本轮 DAG 启动时当前检出的提交点作为基线。
- `mergeConflictAgent`：指定自动处理合并冲突时使用的 Agent 配置（`agent` 必填，`mode` / `model` 选填）。默认值为空：任务级自动合并使用当前任务自己的 `agent` 与 `model`，DAG 级发布冲突处理使用提交时项目设置中的默认 Agent。冲突会话无人可应答审批，`mode` 只取 `mergeConflictAgent.mode`，没写时以完全授权档 `yolo` 运行（Claude Code 要求这台电脑已接受完全授权警告）；需要更低权限时显式写 `mode`，但会话一旦弹出审批就会卡住。
- `excludeWorkspaces`：排除本轮不参与调度的工作区。默认值为空列表，表示当前项目所有已注册工作区都可参与本轮调度。

### 写 prompt

`prompt` 的推荐结构：

```text
目标：
实现 / 分析 / 修复 / 撰写什么。

上下文/背景：
当前仓库、相关模块、已知前提、需参考的文档和文件，以及推荐使用的技能或工具是什么。

完成标准：
需要产出什么结果/什么影响；如何验证结果是否符合要求。

约束：
必须遵守的限制；例如不要改无关文件、保持测试通过、只改指定目录。

必须遵守/建议的处理流程（可选）：
如果用户明确要求或建议了某种处理流程，在此补充；否则不写。
```

上面的模板用中文展示；实际写 `prompt` 时，优先使用最终用户正在使用的语言。

写 prompt 前，先把用户的输入分成两类：

- **给你的写作指令：** 用户要求你编写 workflow 时遵守的规则、侧重点、格式、取舍或写法。理解它们的用意，落实为编写时的行动，如任务拆分、依赖关系、字段选择、prompt 取舍、措辞精简或约束调整。
- **给执行 Agent 的任务内容：** 用户希望执行 Agent 实际完成的工作、读取的材料、修改的文件、验证方式或交付结果。`prompt` 里只写这一类，以及其他真正有助于执行 Agent 完成任务的内容。

另外两条规则：

- `submit`、`review`、`pause` 这类流程控制由你在 CLI 中执行，`prompt` 只写任务本身要做的事。
- 分析、调研、排查这类不改代码的任务，也要求 Agent 把结果写进 prompt 中指定的文件（写明路径），因为只在对话里回复的结果，任务结束后谁也看不到。

## 3. 提交工作流

1. **确认已登录：** 做法同“准备项目”第 2 步。
2. **校验：** `cdg dag validate <workflow>`。报错先修；有 warning 时先理解它，再决定是否继续。
3. **提交：** `cdg dag submit <workflow>`；带着 warning 继续时加 `-y`，因为没有交互终端时，不加 `-y` 可能取消提交。提交时 CLI 会检查额度，额度不足时提交被拒，见下方“额度与扣除”。完成标准：命令以退出码 0 结束，工作流已入队。

### 额度与扣除

CodeDAG 只在工作流开始执行时扣除额度，所以额度只在提交、开始执行与恢复这几处需要关注。

- **扣除规则：** 提交时只检查额度是否足够、不扣除；工作流开始执行时，按本次要执行的任务数一次扣除，每个任务 1 点；`recover` 沿用原来的扣除，不再扣。
- **平时要据此做的：**
  - **停住后先恢复：** 停住的工作流优先 `recover`；避免取消后重新提交，因为那样会按任务数再扣一次。
  - **主动查询：** 用户问到额度，或者你在决定拆成多少个任务、要不要重跑时，用 `cdg auth status` 查剩余额度与重置时间。提交成功后，输出会写明本次需要多少点、检查时还剩多少点，汇报时转告用户。
- **出现问题时：**
  - **提交因额度被拒：** `cdg dag submit` 以退出码 1 结束，工作流没有入队。重试不会增加额度，把输出转告用户，由用户决定怎样继续：输出带 `Your credits reset at <时间>.` 时，额度会在这个时间重置，可以等到那时再提交，用的是免费或内测额度时也可以按输出的地址订阅；不带时，这个额度池已经没有下一个窗口，只能按输出中的指引订阅，或在 Billing 管理订阅。
  - **开始执行时被拦下：** 工作流停在 `on-hold`（`startup-gate-blocked`），`cdg dag status` 显示 `Startup gate failure:`、`Details:` 与 `Action:` 三行。按 `Action:` 给出的步骤处理，通常是解决原因后运行 `cdg dag recover <workflow>`。`Action:` 之后还有 `Recover by: <时间>` 一行时，要在这个时间之前恢复，超过之后只能重新提交，会再扣一次额度。

## 4. 监督与干预

### 巡检

你是工作流的第一责任人，从提交到工作流进入 `reviewed` 全程负责：按本节节奏主动巡检，及时发现停滞、空跑、审批挂起与额度限制。任务内的 Agent 弹出的审批也由你处置：约定授权范围内的审批与异常直接处理（见“运行中弹出审批时”），高风险审批、破坏性操作与约定之外的决策交给用户。

- **看什么：** `cdg status`（等价于 `cdg dag ls`）看全局看板，`cdg dag status [workflow]` 看单个 workflow 及其任务，`cdg task status <taskId> -w <workflow>` 看单个任务；日志用 `cdg dag logs [workflow]` 与 `cdg task logs <taskId> -w <workflow>`，`-n <行数>` 只看最后几行。
- 要查看或手工修改任务代码时，从这两个命令取代码位置：`cdg task status <taskId>` 给出任务的工作区、任务分支与任务开始前的提交（`Workspace`、`Branch`、`Base Commit`），`cdg dag status` 给出集成工作区、集成分支与工作流起点提交；`shared-workspace` 下只有执行目录。
- 启动后：高频看 `status`、`dag status` 与 `dag logs -n <行数>`。
- 稳定后：改为每 5–10 分钟巡检一次，避免更频繁的轮询，因为它不会让任务跑得更快，只会打扰用户、占用上下文。
- 每次巡检都核对实际进展，不只看状态：看每个运行中任务 `task logs` 的最新输出与它工作区的改动（如 `git diff --stat`）是否在增加；状态是 `working`、这些却长时间没有变化时，按下一条判断是否停滞。巡检后给用户留一句话，说明各任务实际推进到哪里。
- 等待节点任务时要有耐心，避免在连续 10 分钟没有响应之前进入干预路径，因为短时间没有新输出不代表卡死，任务内部又派发了 subagent 时尤其如此。
- 运行中需要调整任务方向时，优先用 `cdg task view <taskId> -w <workflow>` 进入会话后发 prompt；交流后退出，回到状态与日志确认进展。没有 view 的执行条件时，按“进入任务会话”的兜底方式处理。

### 进入任务会话

- `cdg task view <taskId> -w <workflow>`；必要时用 `--session-id <id>` 恢复会话。
- 任务停下（`killed` / `paused` / `on-hold`，或执行进程已退出）且会话未运行时，`task view` 只重新打开原会话，不向 Agent 发送任何内容：在会话里让 Agent 继续，任务随之继续执行；直接退出则任务保持原状。
- **什么时候进入：** 通常观察用 `status` 和 `logs` 即可。执行过程中实时纠偏、查看原生轨迹或应答原生交互时，进入 `view`，按需发送一条或多条 prompt；任务完成、等待审核时对结果提出修改要求，用 `request-changes`（见 task review）。
- **Git 提交：** 在 `view` 中发 prompt 不会在修改前自动提交；需要先提交时，在 prompt 中明确写“先提交当前改动，再按以下要求修改……”。
- **退出：** 干预完按 `Ctrl+C` 退出，原始任务照常运行，完成时进程自动退出。原始任务已经完成却没有自动退出时，再用 `cdg task view <taskId> -w <workflow>` 进入，在会话内发送 `/exit`。结束会话都走这两种方式，让 CodeDAG 记下任务状态；避免用系统 `kill`、`pkill` 强杀底层 Agent 进程，因为那样会绕过 CodeDAG 的状态管理。
- **需要真实可交互终端：** 你运行在 bash 工具等非交互环境中时，用 tmux 承载 `view`。系统没有安装 tmux 时，用户已授权你安装软件的，直接安装；否则询问用户是否安装。会话名包含 workflow 与 task 双标识，workflow 名中的 `.` / `:` 替换为 `-`：

  1. `tmux new-session -d -s cdg-view-<workflow>-<taskId> 'cdg task view <taskId> -w <workflow>'` 启动后台承载会话。
  2. `tmux capture-pane -t cdg-view-<workflow>-<taskId> -p` 读取当前屏幕，确认审批内容、可选项与对应按键。
  3. `tmux send-keys -t cdg-view-<workflow>-<taskId> <按键>` 发送应答；按键以第 2 步读到的界面提示为准，因为不同 Agent 审批面板的选项与键位不同。
  4. 完成后用 `tmux send-keys -t cdg-view-<workflow>-<taskId> C-c` 按上文标准方式退出，用 `capture-pane` 确认 view 已退出，再执行 `tmux kill-session -t cdg-view-<workflow>-<taskId>` 清理承载会话。

- **兜底：** 用不了 tmux（如用户不安装）时，运行中纠偏可用 `cdg task review request-changes <taskId> -w <workflow> -k -m "<修改要求>"` 兜底；希望等待当前工作收尾时，将 `-k` 换为 `-p`，二者不同时使用。

### 运行中弹出审批时

1. 从 `dag logs` / `task logs` 发现任务出现审批提示且长时间无进展。
2. 对照与用户约定的审批处置策略（见“动笔前先问清”）：约定内自行应答，超范围先问用户。
3. 按“进入任务会话”的 tmux 步骤读屏并应答。
4. 应答后退出 view，回到 `status` / `logs` 确认任务恢复推进。

### 控制命令

- **pause：** `cdg task pause ...` / `cdg dag pause ...` 暂停推进：运行中的步骤自然收尾，之后的不再开始；解除用 `unpause`。
- **kill：** `cdg task kill ...` / `cdg dag kill ...` 立刻中断当前执行；对 Agent 任务是中断当前会话。
- **recover：** `cdg task recover ...` / `cdg dag recover ...`，任务停在 `on-hold`、`killed`、`paused` 或 `draining` 时，按停住原因恢复执行。
- **进程已不在：** 机器重启或执行进程被意外终止后，任务仍记为 `working`，但已没有进程推进，status 类命令也不会重新拉起调度。`cdg status` 在该 workflow 行下、`cdg dag status` 在 workflow 信息区给出 `Diagnostic:`，任务行标为 `[working (stale owner)]`；按其中的 `cdg dag recover <workflow>` 恢复。

### 发现额度限制时

Agent 服务商的额度限制有 5 小时额度与周额度两种，任务达到其中任一种时，都会停在 `on-hold`，原因为 `agent-api-error`，不会进入 `done`；Claude Code 任务的日志里会出现以 `Claude API stopped the current turn due to rate limiting.` 开头的一行，其后的 `Reset information:` 给出重置时间。两种限制的处理相同，区别只在重置时间的远近。先判断限额 Agent 类型与当前监督 Agent 是否相同，然后立即止损并设置覆盖额度重置时间的长 `sleep`。重置时间较远时（周额度常在几天之后），先把重置时间告诉用户，再按你所在环境支持的方式等待，如定时唤醒；做不到时停下，由用户在额度重置后让你恢复。

止损方式：

- 单一 Agent 类型，或当前 workflow 后续无法避开该限额 Agent：用 `cdg dag kill <workflow>` 停止整个异常 workflow，然后进入长 `sleep`；sleep 期间无需响应。
- 混合 Agent 类型，且当前监督 workflow 的 Agent 未达到额度限制：只用 `cdg task kill <taskId> -w <workflow>` 停止限额 Agent 对应任务；设置长 `sleep` 作为提醒，同时继续监督未限额 Agent 的任务推进。
- 混合 Agent 类型，且当前监督 workflow 的 Agent 也达到额度限制：只用 `cdg task kill <taskId> -w <workflow>` 停止限额 Agent 对应任务；设置长 `sleep` 后不再继续监督未限额 Agent 的任务。

额度重置后收口，常规做法是原地恢复：

- 先检查限额前后结束的任务，确认其成果完整。
- 整个 workflow 之前被 `dag kill` 时，用 `cdg dag recover <workflow>` 恢复；只停了限额 Agent 的任务时，用 `cdg task recover <taskId...> -w <workflow>` 恢复这些任务。`on-hold` 与 `killed` 的任务在原会话中接着做，`paused` 的任务重新等待调度；恢复不再消耗 CodeDAG 额度。
- 恢复后回到监督节奏，确认任务重新推进。任务再次停在 `on-hold`（`agent-api-error`）时，说明额度尚未重置，继续等待后再 `recover`。

只有某个任务成果不完整却已被接受、无法原地恢复时，才收下已完成的成果，用新 workflow 接力；新 workflow 按任务数另行消耗 CodeDAG 额度。隔离分支模式下的步骤：

- 如果异常 workflow 仍有未限额任务在推进，先用 `cdg dag pause <workflow>` 暂停，让已开始的任务做完、下游不再开始，减少半成品。
- 当工作流不处于 working 状态后，逐个检查已开始但尚无审核结论的任务，确定哪些任务已完整完成、哪些任务只完成一半。只完成一半的，用 `cdg task review cancel <taskId> -w <workflow> --code snapshot --downstream cascade` 取消：它已有的改动存进快照分支，之后仍可取回；它的成果不会交给下游，未开始的下游任务在本次执行中也不会再开始。
- 用 `cdg dag review accept <workflow>` 结束整个 workflow。其余已执行完的任务随之被接受，成果合并到集成分支，分支名见 `cdg dag status <workflow>` 的 `Integration Branch`。这一步会接受所有尚无结论的已执行任务，所以上一步要先把只完成一半的任务都取消掉。
- 将被取消的任务、未开始的任务，以及成果不完整却已被接受的任务还需补完的部分，重新组成新的 workflow 后提交；用 `baseRef` 指向这个集成分支，让它从已收下的成果接着做。

## 5. 审核与收尾

只有任务或工作流明确设置了 `autoAccepted: none`（工作流级为 `taskAutoAccepted: none` 或 `dagAutoAccepted: none`）时，才需要手动审核，其余情况都会自动接受。手动审核在用户提前或当场授权时由你执行；没有授权时，由你提醒用户执行审核命令。

除 `clear` 外，`task review` 与 `dag review` 的动作只适用于尚未进入 `reviewed` 的任务或工作流。对象已经进入 `reviewed` 后，只在明确需要清理 review 状态、重新提交时用 `clear`；其余情况新建后续 workflow 承接。

### task review

`cdg task review <动作> <taskId...> -w <workflow>`。省略 `-w` 时作用于队首 workflow，所以一律写明 `-w`。

- `accept`：接受结果，任务进入 reviewed。
- `cancel`：取消当前结果，任务进入 reviewed。
- `defer`：暂缓决策，任务进入 reviewed。
- `request-changes`：让 Agent 基于当前结果继续改。对结果不满意、但想沿用当前成果时优先用它，在 `-m` 中说明要保留的成果和期望的调整。默认先提交当前改动再修改，不想先提交时加 `--code none`。
- `revise`：保留当前现场，由你自己继续修订。
- `rework`：推翻当前实现思路，从干净基线重做。
- `clear`：清理已有 review 状态，用于明确需要重新提交的场景。

常用选项：

- **`-m <文本>`：** 对 `accept`、`cancel`、`defer`、`revise`，记下本次 review 的说明；对 `request-changes`、`rework`，作为交给 Agent 的修改要求，不写时 Agent 收到内置的提示。
- **`--code`：** 当前任务代码的去向，`shared-workspace` 下不用。
  - `commit`：作为下游可以合并的成果保留。
  - `snapshot`：存进快照分支，不进入下游的合并，之后仍可取回。
  - `none`：不动当前代码，留给 `revise` 或 `request-changes` 继续改。
  - `discard`：丢弃当前代码，下游也不会用到。
  - 各动作可用的取值（第一个是默认值）：`accept` 只能用 `commit`；`cancel`、`defer` 为 `snapshot`、`commit`、`discard`；`revise` 为 `none`、`commit`、`snapshot`、`discard`；`request-changes` 为 `commit`、`none`；`rework` 为 `snapshot`、`discard`。
- **`--downstream`：** 下游任务怎样处理，只用于 `accept`、`cancel`、`defer`。`proceed` 让下游继续，`hold` 让下游停下等人处理，`cascade` 把本次结论一并施加到下游（如 `cancel` 时，未开始的下游任务也不再执行）。默认 `accept` 为 `proceed`、`defer` 为 `cascade`；`cancel` 没有默认，要写明。
- **`-k` / `-p`：** 任务仍在执行时（如运行中 `cancel`，或用 `request-changes` 兜底纠偏），先停下它再执行 review 动作：`-k` 立刻中断 Agent，`-p` 让它做完当前这一步。二者不同时使用。

### dag review

- `cdg dag review accept|cancel|defer [workflow]` 给出工作流级的最终决策，省略 workflow 时作用于队首 workflow，所以一律写明；`cdg dag review clear <workflow...>` 清理 review 状态。
- 任务级的代码去留在 `task review` 中解决；`dag review` 处理 workflow 的最终收口。
- **`--code`：** 工作流级代码结果的去向，共享工作区模式的工作流不用。`commit` 把工作流结果作为审核后的产出发布，`snapshot` 存档供之后查看，`discard` 丢弃。默认 `accept` 为 `commit`，`cancel`、`defer` 为 `snapshot`。
- **`--downstream`：** 作用于队列中排在后面的工作流，取值含义同 task review，`cascade` 会一并结束它们。默认 `accept` 为 `proceed`、`defer` 为 `cascade`；`cancel` 没有默认，要写明。
- **`-m`、`-k`、`-p`：** 用法同 task review，作用于整个工作流。

### 工作流结束后的告知

工作流已经结束且进入 `reviewed` 后，按执行模式告知用户下一步：

- `isolated-branches`（默认）：说明当前工作流所有任务已完成，所有修改都在本地；每个有修改的任务都有对应本地分支和提交。下一步可以提交 PR、推送到远程分支，或继续本地开发。
- `shared-workspace`：说明当前工作流所有任务已在本地完成，建议用户人工检查一遍。

## 本技能未覆盖的内容

遇到本技能没有覆盖的 CodeDAG 产品问题，查用户文档 `https://codedag.com/docs`；页面目录见 `https://codedag.com/llms.txt`。每个文档页面的地址末尾加上 `.md`，就能取得这一页的纯 Markdown 文本，便于读取。
