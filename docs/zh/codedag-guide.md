---
name: codedag-guide
description: 当需要在本机使用 CodeDAG CLI 初始化项目、编写工作流、提交任务、查看状态日志、进入任务会话、执行 review 或控制运行中任务时使用；覆盖 Agent 最常用的 80/20 操作路径。
---

# CodeDAG

## 何时使用

- 当你需要把多个开发任务编排成一个 DAG，由 CodeDAG 负责排队、调度、并行隔离、日志记录和审核推进。
- 当你需要查看某个 workflow 或 task 的状态、日志、交互会话，或对其执行 `review`、`pause`、`kill`、`recover`。
- 当任务之间存在明确依赖关系，且你希望把“执行”和“审核后是否继续”拆开管理。
- 如果只是一次性本地修改，不需要依赖、排队、并行或 review，直接使用 Agent 本身即可，不必强行套 CodeDAG。

## 命令名说明

- 推荐主命令：`cdg`
- `codedag` 是完整命令名；两者等价。
- `cdg --help` 与 `codedag --help` 都应可用；缺一个就是安装异常。

## 版本要求

<!-- codedag-compat:begin -->
- 最低 CodeDAG CLI 版本：`0.0.7-local.53`
- 已核对的 CodeDAG CLI 版本：`0.0.7-local.53`
<!-- codedag-compat:end -->

- **会话内第一次使用前：** 运行 `cdg --version`，与上面的两个版本比较。
- **找不到 `cdg`：** CodeDAG CLI 尚未安装或不在 `PATH` 中。告诉用户先安装（安装方法见 `https://codedag.com/docs`），在此之前不执行本文的其他命令。
- **低于最低版本：** 本文写到的命令或行为可能不存在，请用户先升级 CodeDAG CLI 再继续。
- **高于已核对的版本：** 本文仍然适用；遇到与本文不一致的地方，以 CLI 的 `--help` 为准。
- **带版本条件的内容：** 只在 `cdg --version` 满足条件时使用，否则按同一处写明的替代做法处理。
- **参数报错：** 命令报未知参数、取值非法等错误时，先用 `cdg --version` 确认版本，再用该命令的 `--help` 查当前写法并据此改正；只有版本低于最低版本时，升级 CLI 才是解决办法。

## help 与本文档的分工

- `cdg --help`：查现场命令。
- 本文档：看策略、模式和操作路径。
- 两者不一致时，以 `--help` 为准。

## 用户规则优先

如果用户项目或全局的记忆、规则文件、系统 prompt 中写有 CodeDAG 相关操作要求，且与本文档的默认操作说明不同，优先遵守用户指令。本文档只提供默认路径，不覆盖用户显式配置的项目约束、全局偏好或系统级规则。

## 术语约定

- 命令中这个对象叫 `dag`，如 `cdg dag submit`。
- 本文称它为 workflow；两者指同一对象。

## 最短路径

1. 运行 `cdg --version`，按“版本要求”核对。
2. 确认仓库已准备好 CodeDAG 需要的工作区。
   - 确定当前仓库是否有 worktree，当前命令目录是否在 worktree 中。
   - 如果任务只需要顺序执行：主仓库即可。
   - 如果任务需要并行隔离：先准备 `git worktree` 或多个 clone。
3. 根据主仓库根目录下是否有 `.codedag` 判断项目是否已初始化；若没有，可在项目仓库或已注册 worktree 中运行 `cdg init`，它会把 `.codedag` sidecar 仓库创建到主仓库。
4. 在主仓库的 `.codedag/dags/` 下创建一个 workflow 文件；这是标准 workflow 目录。
5. 先运行 `cdg dag validate <workflow>`。
6. 再运行 `cdg dag submit <workflow>`。
7. 用 `cdg dag status`、`cdg dag logs`、`cdg task view` 观察执行。
8. 运行中实时纠偏或观测原生轨迹，优先用 `cdg task view`；需要暂停、继续、中断或恢复时，再按范围选择 `cdg task ...` 或 `cdg dag ...` 的控制命令。
9. 当任务或工作流停在待审核点时，用 `cdg task review ...` 或 `cdg dag review ...` 推进。

## 环境前提

- CodeDAG 的安装方法见 `https://codedag.com/docs`；装好后 `cdg --help` 与 `codedag --help` 都应可正常运行，日常命令统一优先使用 `cdg`。`cdg` 不存在时，按“版本要求”处理。
- CodeDAG 运行在 Git 仓库内；一个 workflow 只服务一个仓库，不要跨仓库混编。
- 并行隔离依赖仓库副本。优先使用 `git worktree`；也可用多个 clone。
- 通常在主工作区根目录存在 `.codedag` 文件夹，则说明已初始化；不存在则说明未初始化。如果出现不符合这个规则的情况，通常是相关文件已损坏，可尝试重新运行一次 `cdg init`。
- `.codedag` 只放在主仓库中；workflow 也只从主仓库的 `.codedag/dags/` 解析。拿不准时，传显式文件路径。

## `.codedag` 与项目仓库

- 项目仓库继续按原方式管理项目代码、分支和提交；`.codedag` 内的文件不属于项目代码本身。
- `.codedag` 是独立于项目仓库的 Git 仓库；在项目仓库执行 `git status`、`git commit`、`git push` 都不会包含 `.codedag` 的文件，也不会改动 `.codedag` 的历史。做成独立仓库，是因为 workflow 与 shared settings 既要跨分支稳定、不随项目仓库切换分支而变化，又需要版本跟踪。
- 团队共享文件主要放在 `.codedag/dags/` 与 `.codedag/settings.jsonc`；本机 local-only 文件放在 `.codedag/local/`，其中 `.codedag/local/settings.local.jsonc` 不用于团队共享，也默认不进入 `.codedag` 仓库版本管理。
- 需要版本管理或同步团队共享的 CodeDAG 文件时，进入 `.codedag` 自己执行 Git；远程仓库的创建与同步同样在 `.codedag` 内用 Git 与托管平台自行完成。
- 当用户需要把 `.codedag` 同步到远程时，若用户未明确指定仓库名，则命名为 `<项目仓库名>-codedag` 并放在与项目仓库相同的命名空间下，这样就可避免不同项目的 sidecar 仓库重名。
- 新成员或新机器接入已有的远程 `.codedag` 时，先在主仓库根目录执行 `git clone <远程地址> .codedag`，再运行 `cdg init`，已提交到 `.codedag` 的文件会自动保留；先 init 会让模板文件挡住之后的 pull。
- 标准 workflow 名称（如 `feature`）以及 `.codedag/dags/...` 形式的路径，都会解析到主仓库的标准 workflow 目录，而不是当前 `cwd` 下的某个 `.codedag/dags/`。
- 命令所在目录只决定你当前操作的是哪个项目；真正的执行工作区由 workflow 配置决定，重点看 `executionMode`、`excludeWorkspaces`、`baseRef` 等字段。

## 登录与计费

- **需登录的命令：** `cdg init`、`cdg dag submit`、`cdg auth status`。未登录时，它们会在本机打开浏览器并等待用户登录，登录完成后继续原命令；只支持用 Google 账号登录。
  - **不打开浏览器：** 设了 `CODEDAG_NO_BROWSER=1` 时，这三个命令只打印登录地址，不打开浏览器；单独登录时也可以用 `cdg auth login --no-browser`。
  - **授权回调：** 完成授权的浏览器必须能把回调送到运行 CLI 的机器上的 `127.0.0.1:<本次随机端口>/callback`，端口见所打印地址中的 `redirect_uri` 参数。CLI 运行在远程主机或容器中时，先为本次端口配置转发等打通回调；只在另一台机器上打开地址，授权结果回不到 CLI，登录无法完成。
- **确认登录状态：** 运行上述命令前，先执行 `cdg auth status --local` 确认已登录，避免命令停在等待浏览器登录。它只读取本机凭证，不联网、不打开浏览器，也不显示额度；退出码 `0` 为已登录，`1` 为未登录。未登录时，请用户运行 `cdg auth login` 并在浏览器中完成登录，再继续。
- **额度来源：** `cdg auth status` 的 `Credit source:` 是下列三种之一。
  - **`Free trial credits`（标准免费期）：** 通过公开注册新建的账号获得一次，800 点，自发放起 30 天内有效；不重置，到期作废，无需绑定支付方式。
  - **`Beta credits`（内测额度）：** 受邀参加内测的账号获得，按月重置，未用完的点数不结转，可能设有结束日期；每个窗口的点数以 `Credits total:` 为准。
  - **`Subscription credits`（订阅）：** 只有一种订阅计划，月付 $12 或年付 $96，每月 800 点，按月重置，不结转。价格不含税，税费在结账时按账单地区计算；部分国家和地区暂不支持付费，免费额度照常可用。
  - **订阅并入：** 订阅生效时，仍未使用且未到期的免费点数并入首个付费周期；并入只发生一次。
- **查看额度：** 以 `cdg auth status` 的输出为准。
  - **有可用额度时：** `Credits remaining:` 是当前额度窗口的剩余点数，`Current period:` 是当前额度窗口的起止时间；还有下一个额度窗口时显示 `Next credit reset:`，免费额度设有结束时间时显示 `Credits expire:`。
  - **没有可用额度时：** 输出 `This account has no active subscription and no available free credits.`，免费额度结束过时另有 `Your free credits ended at <时间>.`，之后给出订阅地址。这种情况退出码仍为 `0`，不能据退出码判断是否有额度。
- **扣费：** 只有 `cdg dag submit` 计费。提交时只检查额度是否足够、不扣除，入队输出写明本次需要的点数与检查时的剩余点数；每个工作流开始执行时，按本次要执行的任务数一次扣除，每个任务 1 点，提交前已审核的任务不执行、不扣费；`recover` 不再扣费。
- **提交被拒：** 输出以 `Not enough credits for this submission.` 或没有可用额度的说明开头，最后是 `Workflow was not submitted.` 与文档链接，退出码 `1`，工作流不入队。按输出处理，避免反复重试提交，因为额度不会因重试而增加：
  - **没有可用额度，或标准免费期点数不足：** 请用户按输出中的地址订阅。
  - **内测额度或订阅点数不足，且输出了 `Your credits reset at <时间>.`：** 可等到该时间后再提交；内测额度也可以订阅。
  - **内测额度点数不足，且没有重置时间：** 这是最后一个额度窗口，按输出的订阅引导处理。
  - **订阅点数不足，且没有重置时间：** 订阅在本窗口结束时终止，没有下一个额度窗口；请用户在 Billing 管理订阅。
- **开始执行时被拦下：** 工作流停在 `on-hold`（`startup-gate-blocked`），`cdg dag status` 显示 `Startup gate failure:`、`Details:` 与 `Action:` 三行。按 `Action:` 给出的步骤处理，通常是解决原因后运行 `cdg dag recover <workflow>`；恢复沿用原来的提交，不重复扣费。
- **CLI 版本：**
  - **版本过低：** 命令输出 `This CodeDAG CLI version (<版本>) is no longer supported.` 及最低支持版本，以非零状态退出。请用户升级 CodeDAG CLI（方法见输出中的文档链接），升级后重新执行原命令；开始执行时因此被拦下的工作流（`Startup gate failure: cli_version_unsupported`），升级后运行 `cdg dag recover <workflow>`。
  - **建议升级：** 输出 `A newer CodeDAG CLI is recommended` 时只是建议，命令照常完成，转告用户即可。

## 核心概念

- `workflow` / `dag`：一个工作流文件，描述一组任务及依赖关系。
- `task`：工作流中的单个节点。通常是 `agent`，对于 CodeDAG 自身的开发者，也会使用 `test`。
- `planning`：还没提交，只是定义。
- `submitted`：已进入队列，可能在排队、执行、等待或已完成但未审核。
- `in-progress`：`submitted` 阶段中的一个运行态，表示 workflow 或 task 正在实际推进，而不是仍在等待。
- `reviewed`：已经给出最终审核结论，任务或工作流不再继续推进。
- `review`：决定结果是否被接受，以及下游是否继续。
- `autoAccepted` / `taskAutoAccepted` / `dagAutoAccepted`：自动接受规则，决定节点完成后是自动进入后续推进，还是停下来等你手动 review。

理解 CodeDAG 时抓住两点：

- `task` 不独立脱离 `dag` 运行；它总是属于某个 workflow。
- “执行完成”不等于“流程结束”；很多场景下，任务先跑完，再等你 `review` 后才释放下游。

### 状态流转怎么读

- 主路径：`planning -> submitted -> in-progress -> reviewed`
- `in-progress` 属于 `submitted` 里的运行态，不是另一条 phase。
- `autoAccepted=always`：自动推进；`autoAccepted=none`：停下等 `review`。
- `blocked` / `on-hold` / `killed`：先看 `status` / `logs`，再决定 `review`、`revise` 还是 `recover`。

## 何时用哪种执行模式（executionMode）

- 默认用 `isolated-branches`。
- `executionMode: shared-workspace` 只给共享同一现场的轻量任务。
- 拿不准时，继续用 `isolated-branches`。

### isolated-branches

- 代码修改、测试、并行开发，默认都用它。
- 优点：隔离清晰，回溯容易。

### shared-workspace

- 共享一个现场，不做任务级隔离。
- 更适合文档、配置、文案、调研、内容生产这类轻量任务。
- 例子：用户文档生成/翻译、UI i18n、调研与报告、pSEO。
- 不适合：并行编码、频繁编译/测试、需要清晰归因的工程实现。

shared-workspace 的硬风险：

- 现场会互相污染，归因更难。

shared-workspace 的最低防冲突策略：

- 不要把多个不相关目标混在同一个共享 dag 里。
- 不要让多个任务同时写同一文件。
- 高频看 `status` / `logs`。
- 现场失控时，先停下来 `kill`、`view`、`recover` 或人工清理。

## 在 worktree 仓库下创建工作流前的范围确认

创建或提交 workflow 之前，必须先判断**当前命令所在仓库是不是某个 `git worktree`**（而不是主仓库本身）。如果是 worktree，必须先告知用户，工作流执行的工作区与命令所在目录无关，只和工作流配置有关。并和用户确认两件事，再决定如何写 workflow 字段：

1. 本轮 DAG 允许在哪些仓库范围内执行（例如：仅主仓库、指定若干 worktree、或全部已注册工作区参与）。
2. 以哪一版代码作为本轮 DAG 的基线（例如：当前 worktree 的 HEAD、主仓库的 HEAD、某个分支或具体提交）。

范围确认后，按需要使用以下字段尽量满足用户：

- `excludeWorkspaces`：排除用户不希望本轮参与调度的工作区。
- `baseRef`：把本轮 DAG 的 Git 基线显式锚定到用户指定的提交点，避免默认拿当前集成工作区的 `HEAD`。
- `maxConcurrency`：根据本轮实际可用的工作区数量调整并发上限。
- 只有当当前终端位于错误的项目/仓库上下文时，才需要切换 Agent 自身的 `cwd`；这只影响命令要作用于哪个项目，不会直接决定任务最终在哪个执行工作区运行。

如果用户的范围或基线需求**无法仅靠这些字段满足**，不要硬套，应直接向用户说明限制，并给出建议（例如：先在主仓库切到目标分支、先把当前 worktree 的改动提交或 stash、先用 `git worktree add` 准备所需工作区，然后再回来提交 DAG）。

## 第一个 Workflow

优先用 YAML。最小可用示例：

```yaml
tasks:
  - id: 1
    title: "为 dag ls JSON 输出编写规划文档"
    prompt: |
      阅读需求文档 `docs/requirements/dag-ls-json-output.md`。
      充分阅读所有相关代码、现有命令实现、测试、设计文档与历史上下文，并进行全面调研后，再开始写规划。
      将实现规划写入 `docs/plans/dag-ls-json-output-plan.md`。
      规划文档必须详细覆盖命令行为、输出结构、涉及模块、测试改动、边界情况、风险点与实现顺序。
      本任务只写规划，不实现代码。

  - id: 2
    title: "根据规划实现 dag ls JSON 输出"
    dependencies: [1]
    prompt: |
      阅读 `docs/plans/dag-ls-json-output-plan.md`。
      根据该规划实现 `docs/requirements/dag-ls-json-output.md` 中的需求。
      同步修改代码与测试，并保持实现与规划一致。
```

这个例子里有两个关键点：

- 在场景上，每个任务都会使用大量上下文，从而应该将每个任务独立拆出来，而非在单个 prompt 里完成所有工作。
- 独立出来的每个任务，都会启动各自全新的 Agent 会话；task 2 不会直接继承 task 1 的对话上下文。两个任务之间共享信息，依赖的是仓库文件。

格式最小规则：

- `tasks` 必填，且至少有一个任务。
- 每个任务都需要 `id`、`title`，以及 `prompt` 或 `details` 二选一。
- `dependencies` 不写时表示无依赖；推荐使用 YAML flow sequence 写法，如 `dependencies: [1, 2]`。YAML block sequence 写法也能解析，但不作为首选。
- `id` 用正整数；同一 workflow 内保持唯一。
- `prompt` 和 `details` 同时存在时，以 `prompt` 为准。

## 高频字段

### 任务字段

- `id`：任务唯一标识。建议从 `1` 开始顺序写。
- `title`：给人看的短标题；要让你自己和其他 Agent 一眼知道任务目标。
- `prompt`：给 Agent 的主指令。核心字段。
- `details`：`prompt` 的兼容别名；新内容优先直接写 `prompt`。
- `dependencies`：依赖哪些上游任务。
- `type`：
  - `agent`：默认值。适合编码、分析、重构、生成文档。
  - `test`：仅用于 CodeDAG 自身开发测试使用；使用时需切到 `shared-workspace`。
- `agent`：目前仅支持 `codex` 或 `claude`。根据用户已安装的 agent，以及用户偏好来决定，可不同任务使用不同 agent，配合使用。不填时使用默认配置值。
- `mode`：决定该任务的执行权限与交互策略——运行中哪些操作免审批、是否会弹审批需要值守；Codex 侧还覆盖沙箱档位、网络访问与 Web Search 开关。**强烈建议显式填写**，不要依赖继承：未设置时 CodeDAG 不传该参数，实际行为回落到 Agent 自身的项目/用户配置（如 `.claude/settings.json` 的 `permissions.defaultMode`、`~/.codex/config.toml` 的 `approval_policy` / `sandbox_mode`）或 Agent 默认值，编排者从工作流文件中看不出实际授权档。`mode` 语义按 Agent 分叉：Claude 为 `--permission-mode` 值（CodeDAG 别名 `yolo` / `askForPermissions` 自动翻译，其余透传）；Codex 为 `ask-for-approval` / `sandbox` / `approvals_reviewer` / `search` / `network_access` 键值组合，或简写 `yolo`、`approve-for-me`（同 `auto`）；取值按已验证的 Codex 版本校验，`ask-for-approval` 只接受 `on-request` / `never`，`approvals_reviewer` 只接受 `user` / `auto_review`。推荐配置：

  | | 完全授权（无头全自动） | 自动审查 |
  |---|---|---|
  | **Claude** | `mode: bypassPermissions` | `mode: auto`（后台分类器自动审查放行，拦截时模型自行调整） |
  | **Codex** | `mode: yolo`（等价官方 `--dangerously-bypass-approvals-and-sandbox` 并额外开启 `--search`，网络已放开） | `mode: approve-for-me`（即 `--approve-for-me`：workspace-write 沙箱，审批请求先交给 Codex 自动审查，被拒时模型自行调整）；需人工逐次审批时用 `mode: "approvals_reviewer=user,ask-for-approval=on-request,sandbox=workspace-write,network_access=true"` |

  - ⚠️ 完全授权档跳过 Agent 的权限检查（Claude 官方仅建议在容器/VM 等隔离环境使用，Codex `yolo` 官方同样定性为危险绕过）：仅用于可信任务与可控环境，并经「校验与提交 · 使用原则」与用户确认审批处置策略后使用。
  - 自动审查档由 Agent 的审查机制处理审批请求，被拒时模型自行调整；Codex 因连续拒绝中断回合时，按 `task status` 的诊断处理后 recover。只有实际出现人工审批界面时，才按「运行中弹出审批时」剧本值守。权限档位与审批处置策略由用户决定。
  - Codex `workspace-write` 沙箱默认禁网；`approve-for-me` 可由模型申请越出沙箱并交给自动审查。需要直接放开沙箱内网络时，使用键值组合 `approvals_reviewer=auto_review,ask-for-approval=on-request,sandbox=workspace-write,network_access=true`。
  - 确认 Claude 所用模型（需 Sonnet 4.6 / Opus 4.6 / Fable 5 及以上）或组织设置不支持 `auto` 时，改用 `mode: acceptEdits`（读取、文件编辑与常用文件系统命令免批，其余命令索批）。
  - 推荐值基于当前已验证的 Agent 版本；Agent 升级后以其 CLI help 复核。
- `model` / `effort`：用于精细化约束模型与推理力度；只有确实需要固定时再写。
- `autoAccepted`：任务自动接受规则，默认值为 `always`。需要在每个任务完成后，手动 `review` 才推进下游任务时，设置为 `none`。
- `branchName`：只在 `isolated-branches` 下使用；当你必须固定任务分支名时再写。同名分支已存在时，校验给出 `branch-name-conflict` 警告，任务启动后停在 `on-hold`；按警告或 `cdg task status` 的 `Diagnostic` 写明的来源处理后再 recover：本地分支用 Git 删除或改名，clone 副本项目中被同步仓库占用的用 `cdg branch release <分支名>` 释放。

### 工作流字段

以下字段均为选填，不填时使用默认值。

- `executionMode`：`isolated-branches` 或 `shared-workspace`。默认值为 `isolated-branches`，表示每个任务默认使用独立工作区和任务分支执行；只有明确需要共享同一工作区时，才改成 `shared-workspace`。
- `maxConcurrency`：工作流级并发数。默认值为项目 settings 中的 `maxConcurrency`（`.codedag/local/settings.local.jsonc` 覆盖 `.codedag/settings.jsonc`，通常为 worktree 数 +1）；如果项目配置也未设置，则默认值为 `1`，表示串行执行。只有你明确需要覆盖默认值时再写。
- `dagAutoAccepted`：工作流自动接受规则，默认值为 `done`。需要在每个工作流完成后，手动 `review` 才推进下游工作流时，设置为 `none`。
- `taskAutoAccepted`：工作流级任务自动接受默认值，默认值为 `always`。相当于为工作流中的每个任务设置了 `autoAccepted`，可被任务自身的 `autoAccepted` 字段覆盖。
- `baseRef`：显式指定本轮 DAG 的 Git 基线。默认值为当前集成工作区的 `HEAD`，表示以本轮 DAG 启动时当前检出的提交点作为基线。
- `mergeConflictAgent`：指定自动处理合并冲突时使用的 Agent 配置（`agent` 必填，`mode` / `model` 选填）。默认值为空，表示任务级自动合并默认使用当前任务自己的 Agent 配置，DAG 级发布冲突处理默认使用提交时项目设置中的默认 Agent。冲突会话无人可应答审批，未得到显式 `mode`（`mergeConflictAgent.mode`，或回退时任务自己的 `mode`）时一律以完全授权档 `yolo` 运行；需要更低权限时显式写 `mode`，但会话一旦弹出审批就会卡住。
- `excludeWorkspaces`：排除本轮不参与调度的工作区。默认值为空列表，表示当前项目所有已注册工作区都可参与本轮调度。
- `metadata`：只用于补充版本、说明、创建时间、更新时间等人类可读信息。默认值为空，表示没有额外元数据，不影响执行。

## Prompt 写法

`prompt` 决定任务质量，推荐结构：

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

写 prompt 前，必须先区分用户输入里哪些是给创建 workflow 的 Agent 的写作指令，哪些才是要交给执行 workflow 的 Agent 处理的任务内容。

- 指令：用户要求创建 workflow 的 Agent 在编写 workflow 时遵守的规则、侧重点、格式、取舍或写法。
- 内容：用户希望执行 workflow 的 Agent 实际完成的工作、读取的材料、修改的文件、验证方式或交付结果。

创建 workflow 的 Agent 不能把用户给自己的写作指令直接转述进任务 `prompt`，也不能把自己变成传话筒。必须先理解这些指令的含义，并把它们转化为创建 workflow 时的行动，例如任务拆分、依赖关系、字段选择、prompt 取舍、措辞精简或约束调整。只有真正有助于执行 Agent 完成任务的内容，才应该写进工作流 `prompt`。

写 prompt 时遵循这些规则：

- 一个任务只做一个清晰目标，不要把多个独立目标塞进同一任务。
- 把“完成标准”写清楚；不要只写“处理一下”“看看能不能优化”。
- 需要读代码时，直接写明先读哪些范围。
- 需要修改代码时，写清楚改动边界、测试要求和禁止事项。
- 不要把 CodeDAG 的流程控制命令写进 prompt；`submit`、`review`、`pause` 这类流程控制应由你在 CLI 外部执行。
- 如果任务依赖上游输出，把依赖关系放进 `dependencies`，不要只靠 prompt 口头描述。
- 默认情况下，各个任务彼此独立，看不到之前任务的会话历史；后续任务应以仓库当前最新代码和文档为基础，从之前任务产出的文件中获取进度，而不是依赖直接读取之前任务的上下文。
- 如果任务是分析、调研、排查这类无需改代码的工作，也必须要求 Agent 把结果写入文档中（并指定文件名，包含路径），确保 Agent 不只在对话中回复；否则任务结束后，后续 Agent 无法看到这些结果。

## 常用命令

### 初始化

- `cdg init`
- Agent 执行初始化时，推荐使用非交互式命令：
  - 必须传 `--primary-workdir`，通常是项目根目录的绝对路径。
  - 推荐传 `--replica-workdirs` 和 `--default-agent claude|codex`。
  - 可按需传 `--max-concurrency` 和 `--no-install-guide-plugins`。
- `--replica-workdirs` 用空格分隔多个副本目录：
  - 用户使用 worktree 时，传各 worktree 目录；Claude Code（`.claude/worktrees/` 下）与 Codex（`~/.codex/worktrees/` 下）为自身会话创建的临时 worktree 不传。
  - 用户使用克隆副本时，传各克隆副本目录。
  - 无需并行时，不传 `--replica-workdirs`。
  - 需要并行但尚未准备 worktree 或克隆副本时，先和用户沟通，通常推荐先准备 worktree 再初始化；worktree 数量根据任务需求和用户确认决定。
- `--default-agent` 根据用户偏好选择 `codex` 或 `claude`；通常你是 Codex 就使用 `codex`，你是 Claude Code 就使用 `claude`。
- 示例：`cdg init --primary-workdir /path/to/project --replica-workdirs /path/to/project-wt-1 /path/to/project-wt-2 --default-agent codex`
- 重复运行非交互式初始化时，`.codedag` 下已有的文件一律保留；退出码非 0 表示初始化未完成，按输出的原因处理后重试。
- 输出 `Warning: Claude Code <版本> is older than ...` 或 `Warning: Could not determine the Claude Code version` 时，初始化照常完成，但使用 Claude Code 的任务会进入 on-hold（`agent-version-unsupported`）；先升级 Claude Code 再运行这类任务。

- `cdg init` 检测本机已安装的 Claude Code / Codex；默认 Agent 与并发数由团队设置提供，本机取值不同时才写入 local settings。初始化不写 `availableAgents`，该字段只用于用户主动限制项目可使用的 Agent。
- `cdg init` 会在主仓库创建 `.codedag` sidecar 仓库；团队共享文件用 `.codedag/dags/` 与 `.codedag/settings.jsonc`，本机 local-only 设置用 `.codedag/local/settings.local.jsonc`。
- `cdg init` 完成后，项目仓库的 Git 使用方式保持不变；如果要提交或同步 workflow / shared settings，进入 `.codedag` 自己执行 Git。

### CodeDAG 插件安装

- **来源：** CodeDAG 插件 `codedag@codedag`（含本技能）来自 GitHub 上的插件 marketplace `CodedagAI/codedag-plugin-marketplace`，marketplace 名为 `codedag`。
- **默认安装：** `cdg init` 默认为本机已安装的 Claude Code、Codex 注册这个 marketplace 并安装插件，非交互初始化装到 user 范围；加 `--no-install-guide-plugins` 时跳过插件的安装与修复。
- **生效时机：** 新装的插件只在新会话中生效；要在当前会话使用，先退出再恢复（`claude --resume` 或 `codex resume`）。
- **补装与改范围：** 初始化时跳过了插件安装的，用 `cdg plugin install --all -s user|project|local` 补装；改范围时先 `cdg plugin uninstall --all` 再装。Claude Code 与 Codex 都支持 user、project、local 三个范围；`project` 装好后，提交改动的 `.claude/settings.json` 或 `.codex/config.toml`。Codex 的 `local` 让同一仓库所有 worktree 中未跟踪的 `.codex/config.toml` 都被 Git 忽略，在其他 worktree 提交这个文件要用 `git add -f`。
- **查看：** `cdg plugin status --all` 显示插件在 Claude Code、Codex 中的安装状态、范围、启用状态、插件版本、插件要求的最低 CLI 版本与下一步建议。`cdg init` 或 `cdg plugin status` 提示 CLI 低于插件要求的最低版本时，请用户升级 CLI。
- **更新：** `cdg plugin update --all` 刷新 marketplace 并更新插件；也可以用宿主自己的入口：Claude Code 为 `claude plugin update codedag@codedag`，Codex 为 `codex plugin marketplace upgrade codedag`。
- **卸载：** `cdg plugin uninstall --all` 只卸载 CodeDAG 插件，保留 `codedag` marketplace 及其中的其他插件。Codex 卸载 user 范围时只把插件改为停用，插件文件保留给本机其他项目的 project、local 范围使用；要彻底移除，运行 `codex plugin remove codedag@codedag`。

### 校验与提交

- `cdg dag validate <workflow>`
- `cdg dag submit <workflow>`

使用原则：

- **提交前明确审批处置策略**：各任务 `mode` 授权档与「运行中弹出审批如何处理」是一体决策。用户已明示无人值守、已显式指定各任务 mode、或已有长期规则时直接继承，不再追问；策略不明确且影响安全边界（如启用完全授权档、代用户应答审批的范围）时，先与用户确认再提交——避免「用户要全自动却被审批卡住」与「用户要亲自把关却被自动放行」两类错配。
- 提交前先 `validate`。
- `validate` 报错就先修；有 warning 时先理解 warning，再决定是否继续提交。决定继续时，非交互环境中加 `-y`（`cdg dag submit -y <workflow>`）。不加时结果取决于标准输入：标准输入已关闭时，只有普通 warning 的工作流照常提交，含 `branch-name-conflict` warning 的取消提交；确认提示显示后输入才结束时不提交。不提交的两种情况都以退出码 1 结束，工作流不入队。
- 优先使用纯文件名（如 `feature`）或 `.codedag/dags/feature.yaml` 这类标准路径；它们都会回到主仓库的标准 workflow 目录解析。

### 观察状态

- `cdg status`：等价于 `cdg dag ls`，看全局 workflow 看板。
- `cdg dag status [workflow]`：看单个 workflow 及其中任务。
- `cdg task status <taskId> -w <workflow>`：只看指定任务。
- `--watch`：适合持续观察 submitted 阶段的变化。

选择建议：

- 不知道系统里现在有哪些 workflow：先看 `cdg status`。
- 想看一个 workflow 的全貌：用 `cdg dag status`。
- 只想盯一个任务：用 `cdg task status`。

3 种 status 的区别：

- `cdg status` 解决“系统里现在整体发生了什么”。它适合先扫全局，确认有哪些 workflow 在排队、运行、等待审核或已经停住。
- `cdg dag status <workflow>` 解决“这个 workflow 里面具体卡在哪个 task”。它会把注意力收敛到单个 workflow 内部，适合排查依赖、子状态、当前卡点和下一步处理动作。
- `cdg task status <taskId> -w <workflow>` 解决“这个 task 现在到底怎样了”。它适合在已经定位到某个 task 后，继续看它的 phase、substatus、review 结果和当前卡点。
- 实际操作里，先 `cdg status` 找到目标 workflow，再进入 `cdg dag status <workflow>` 看细节，是最稳妥的路径。
- 要查看或手工修改任务代码时，从这两个命令取代码位置：`cdg task status <taskId>` 给出任务的工作区、任务分支与任务开始前的提交（`Workspace`、`Branch`、`Base Commit`），`cdg dag status` 给出集成工作区、集成分支与工作流起点提交；`shared-workspace` 下只有执行目录。

### 监督运行中的 DAG

你是工作流的第一责任人，从提交到执行完成全程负总责：按本节节奏主动巡检推进，及时识别停滞、空跑、审批挂起与额度限制，不被动等待；约定授权范围内的审批与异常直接处置（见「运行中弹出审批时」剧本），高风险审批、破坏性操作与约定之外的决策升级给用户——主人公意识不等于对一切审批自行同意，审批由任务内的 Agent 发起、你「隔着两层」也不构成袖手理由。

- 启动后：高频看 `status` / `dag status` / `dag logs -f`。
- 稳定后：明显切换到低频轮询，建议 5–10 分钟巡检一次；不要每几十秒就去查一次进展，那既不会让任务跑得更快，也容易过度打扰用户和占用上下文。
- 每次巡检都核对实际进展，不只看状态：对每个运行中的任务看 `task logs` 的最新输出与它工作区的改动（如 `git diff --stat`），确认输出、工具调用或改动在增加；状态是 `working`，这些却长时间没有变化时，按下一条判断是否停滞。巡检后给用户留一句巡检记录，说明各任务实际推进到哪里。
- 等待节点任务时要有耐心，特别是任务内部又派发了 subagent 的场景；短时间没有新输出不代表卡死，至少连续 10 分钟没有响应后，才考虑进入干预路径。
- 出错时先 `task status` / `task logs`，必要时 `task view`。
- 运行中需要调整任务方向时，优先用 `cdg task view <taskId> -w <workflow>` 进入会话后发 prompt；交流后退出，回到状态与日志确认进展。没有 view 的执行条件时，按“进入任务会话”一节的 request-changes 兜底方式处理。
- `review`：给结果定案；`revise` / `request-changes` / `rework`：继续改；`recover`：恢复被打断或异常的执行。

### 任务完成后结果不符合预期时

- 任务已完成、等待审核，对结果不满意但希望沿用当前成果时，优先用 `cdg task review request-changes <taskId> -w <workflow> -m "<修改要求>"`。说明要保留的成果和期望调整，修改完成后再次审核；代码处理按下方 task review 的默认值与选项选择。
- 想自己修改当前成果时用 `revise`；需要推翻当前实现、从干净基线重做时用 `rework`。
- 上述动作适用于尚未进入 `reviewed` 的任务。任务已经进入 `reviewed` 后，如需继续处理，结束或取消原 workflow 后新建后续 workflow；明确需要清除审核并重新提交时，按 Review 规则处理。

### 发现 5 小时额度限制时

任务达到 5 小时额度限制时，会停在 `on-hold`，原因为 `agent-api-error`，不会进入 `done`；Claude Code 任务的日志里会出现以 `Claude API stopped the current turn due to rate limiting.` 开头的一行，其后的 `Reset information:` 给出重置时间。先判断限额 Agent 类型与当前监督 Agent 是否相同，然后立即止损并设置覆盖额度重置时间的长 `sleep`。

止损方式：

- 单一 Agent 类型，或当前 workflow 后续无法避开该限额 Agent：用 `cdg dag kill <workflow>` 停止整个异常 workflow，然后进入长 `sleep`；sleep 期间无需响应。
- 混合 Agent 类型，且当前监督 workflow 的 Agent 未达到额度限制：只用 `cdg task kill <taskId> -w <workflow>` 停止限额 Agent 对应任务；设置长 `sleep` 作为提醒，同时继续监督未限额 Agent 的任务推进。
- 混合 Agent 类型，且当前监督 workflow 的 Agent 也达到额度限制：只用 `cdg task kill <taskId> -w <workflow>` 停止限额 Agent 对应任务；设置长 `sleep` 后不再继续监督未限额 Agent 的任务。

sleep 醒来后收口，常规做法是原地恢复：

- 先检查限额前后结束的任务，确认其成果完整。
- 整个 workflow 之前被 `dag kill` 时，用 `cdg dag recover <workflow>` 恢复；只停了限额 Agent 的任务时，用 `cdg task recover <taskId...> -w <workflow>` 恢复这些任务。`on-hold` 与 `killed` 的任务在原会话中接着做，`paused` 的任务重新等待调度，暂停时已做完当前一轮的任务直接按完成处理；恢复不再消耗 CodeDAG 额度。
- 恢复后回到监督节奏，确认任务重新推进。任务再次停在 `on-hold`（`agent-api-error`）时，说明额度尚未重置，继续等待后再 `recover`。

只有某个任务成果不完整却已被接受、无法原地恢复时，才收下已完成的成果，用新 workflow 接力；新 workflow 按任务数另行消耗 CodeDAG 额度。隔离分支模式下的步骤：

- 如果异常 workflow 之前已被整体 `dag kill`，不需要再 `dag pause`。
- 如果异常 workflow 仍有未限额任务在推进，先用 `cdg dag pause <workflow>` 暂停 workflow，这时已开始执行的任务会继续执行直至完成（可能需要一点时间），但下游未开始的任务不会开始，从而能尽可能减少半成品任务的产生。
- 当工作流不处于 working 状态后，逐个检查已开始但尚无审核结论的任务，确定哪些任务已完整完成、哪些任务只完成一半。只完成一半的，用 `cdg task review cancel <taskId> -w <workflow> --code snapshot --downstream cascade` 取消：它已有的改动存进快照分支，之后仍可取回；它的成果不会交给下游，未开始的下游任务在本次执行中也不会再开始。
- 用 `cdg dag review accept <workflow>` 结束整个 workflow。其余已执行完的任务随之被接受，成果合并到集成分支 `cdg/<工作流名>/integration`；子目录中的 workflow，`<工作流名>` 是相对 `.codedag/dags/` 的路径并把 `/` 换成 `_`（`team/build.yaml` 对应 `team_build`），实际分支名见 `cdg dag status <workflow>` 的 `Integration Branch`。这一步会接受所有尚无结论的已执行任务，所以上一步要先把只完成一半的任务都取消掉。
- 将被取消的任务、未开始的任务，以及成果不完整却已被接受的任务还需补完的部分，重新组成新的 workflow 后提交；用 `baseRef: cdg/<工作流名>/integration` 让它从已收下的成果接着做。

### 查看日志

- `cdg dag logs [workflow]`
- `cdg task logs <taskId> -w <workflow>`

高频选项：

- `-f` / `--follow`：实时跟随。
- `-n` / `--tail <lines>`：先看最后若干行。

选择建议：

- 想按任务分段回看整个 workflow：用 `dag logs`。
- 只想盯一个任务：用 `task logs`。
- 只读分析用 logs；需要双向交互时不要用 logs，在真实终端或tmux里用 `task view`。

### 进入任务会话

- `cdg task view <taskId> -w <workflow>`
- 必要时可用 `--session-id <id>` 恢复会话。
- 任务停下（`killed` / `paused` / `on-hold`，或执行进程已退出）且会话未运行时，进入只是把原会话重新打开，不向 Agent 发送任何内容：在会话里让 Agent 继续，任务随之继续执行；什么都不做就退出，任务保持原状。因读不到会话状态等原因不能打开时，命令说明原因与处理办法。

需要真实可交互终端；监督 Agent 可用 tmux 承载，不直接在没有交互终端的 bash 工具中运行。

`task view` 后发 prompt 与 `task review request-changes` 都能让任务 Agent 继续修改，按场景优先选择，必要时可以相互替代；不要只按“一次输入”或“连续输入”划分。替代时仍须满足终端条件和任务阶段要求。

何时进入 `view`：

- 通常观察使用 `status` 和 `logs` 即可，不要默认进入 `view`。
- 执行过程中实时纠偏、查看原生轨迹或应答原生交互时，优先进入 `view`，按需发送一条或多条 prompt。
- 任务完成、等待审核时对结果提出修改要求，优先用 `request-changes`，见“任务完成后结果不符合预期时”。

在 `view` 中发 prompt 默认不在修改前自动做 Git 提交；需要先提交时，在 prompt 中明确写“先提交当前改动，再按以下要求修改……”。

无法提供 view 所需的真实可交互终端（也没有可用的 tmux）时，运行中纠偏可用 `cdg task review request-changes <taskId> -w <workflow> -k -m "<修改要求>"` 兜底；希望等待当前工作收尾时，将 `-k` 换为 `-p`，二者不同时使用。此操作沿用 request-changes 的代码处理默认值，见下方 task review 规则；它用于交代修改要求，原生审批仍按相应交互流程处理。

进入 `view` 之后退出方式：

- 通过 Task View 对会话完成干预后，优先按 `Ctrl+C` 退出。
- 正常情况下，按 `Ctrl+C` 退出后，原始任务继续运行；当原始任务完成时，对应进程会自动退出。
- 当原始任务已经完成时，如果未能自动退出，再用 `cdg task view <taskId> -w <workflow>` 进入会话，并在会话内手动发送 `/exit`。尽量不要用系统 `kill`、`pkill` 或进程管理工具强制结束底层 Agent 进程；这会绕过 CodeDAG 的任务状态管理。

**非交互环境驱动 task view**：监督 Agent 运行在 bash 工具等非交互环境、需要应答审批或双向交互时，用 tmux 承载 view。会话名包含 workflow 与 task 双标识，避免多 DAG 并行时撞名；workflow 名中的 `.` / `:` 替换为 `-`，因为 tmux 会话名不接受这两个字符。

1. `tmux new-session -d -s cdg-view-<workflow>-<taskId> 'cdg task view <taskId> -w <workflow>'` 启动后台承载会话。
2. `tmux capture-pane -t cdg-view-<workflow>-<taskId> -p` 读取当前屏幕，确认审批内容、可选项与对应按键。
3. `tmux send-keys -t cdg-view-<workflow>-<taskId> <按键>` 发送应答；按键以第 2 步读到的界面提示为准，不同 Agent 审批面板的选项与键位不同，不要凭经验盲发。
4. 完成后用 `tmux send-keys -t cdg-view-<workflow>-<taskId> C-c` 按上文标准方式退出，用 `capture-pane` 确认 view 已退出，再执行 `tmux kill-session -t cdg-view-<workflow>-<taskId>` 清理承载会话；不要用系统 `kill` / `pkill` 强杀底层 Agent 进程。

## Review 规则

把 review 分成三类理解：

- 最终审核动作：结束当前节点。
- 继续处理动作：节点不结束，只是换一种继续方式。
- 状态清理子命令：清理已有 review 状态，让对象回到可重新提交的状态。

除 `task review clear` / `dag review clear` 外，所有 `task review ...` 和 `dag review ...` 动作命令都只适用于尚未进入 `reviewed` 的任务或工作流。对象已经进入 `reviewed` 后，只能在明确需要清理 review 状态时使用 `review clear`；否则应新建后续 workflow 承接。

### task review

审核与继续处理命令：

- `cdg task review accept ...`
- `cdg task review cancel ...`
- `cdg task review defer ...`
- `cdg task review revise ...`
- `cdg task review request-changes ...`
- `cdg task review rework ...`

状态清理命令：

- `cdg task review clear [taskId...] -w <workflow>`

审核与继续处理动作含义：

- `accept`：接受结果，任务进入 reviewed。
- `cancel`：取消当前结果，任务进入 reviewed。
- `defer`：暂缓决策，任务进入 reviewed。
- `revise`：保留当前现场，由你或后续操作继续修订。
- `request-changes`：让 Agent 基于当前结果继续改。
- `rework`：废弃当前实现思路，从干净基线重做。

状态清理子命令含义：

- `clear`：清理已有 review 状态，用于明确需要重新提交的场景。

高频参数：

- `--code commit|snapshot|none|discard`
- `--downstream proceed|hold|cascade`
- `-m` / `--message`：记录本次 review 的说明、反馈或后续要求；尤其适合 `cancel`、`defer`、`request-changes`、`rework` 这类需要留下明确原因或修改意见的场景。
- `-k` / `--kill`
- `-p` / `--pause`
- `-y` / `--yes`：选中的任务中有已审核的，或 `accept` 用 `--upto` 等范围选择器圈进尚未开始的任务时，不询问直接继续。
- `--workflow-file <file>` / `--dag <file>` / `-w <file>`：指定 workflow；审核、继续处理动作省略时使用队首 workflow，`task review clear` 必须显式指定。

实用规则：

- `accept` 只能配 `--code commit`。
- 隔离分支模式下，`request-changes` 默认 `--code commit`，先提交当前改动再修改；不想先提交时显式设置 `--code none`。它只支持 `commit` 与 `none`。
- `--code none` 仅用于 `revise` / `request-changes`。
- 除 `clear` 外，所有 `task review` 动作命令只适用于尚未进入 `reviewed` 的任务。
- `revise` / `request-changes` / `rework` 不使用 `--downstream`。
- `shared-workspace` 不支持 `--code`。
- `shared-workspace` 不支持 `rework`。
- 没有交互终端时（Agent 调用即如此），需要询问的情形直接以退出码 1 报错、不做改动：`cancel` 有下游时写明 `--downstream`，对象仍在执行时 `cancel` 写明 `-k` 或 `-p`，需要确认的情形加 `-y`。

### dag review

审核命令：

- `cdg dag review accept [workflow]`
- `cdg dag review cancel [workflow]`
- `cdg dag review defer [workflow]`

状态清理命令：

- `cdg dag review clear <workflow...>`

高频参数：

- `--code commit|snapshot|discard`
- `--downstream proceed|hold|cascade`
- `-k` / `--kill`
- `-p` / `--pause`
- `-y` / `--yes`：选中的工作流中有已审核的（`clear` 时为仍在队列中的）时，不询问直接继续。

使用原则：

- `dag review` 是工作流级最终决策，只做 `accept` / `cancel` / `defer`。
- `accept` / `cancel` / `defer` 省略 workflow 时使用队首 workflow；`dag review clear` 必须显式指定一个或多个 workflow。
- 除 `clear` 外，所有 `dag review` 动作命令只适用于尚未进入 `reviewed` 的工作流。
- `clear` 是状态清理子命令，只用于明确需要清理已有 review 状态并重新提交的场景。
- 任务级代码去留优先在 `task review` 解决；`dag review` 处理的是 workflow 最终收口。
- `accept` 默认就是继续下游；只有在 `cancel` / `defer` 时，才更需要你显式思考下游怎么处理。
- `--downstream cascade` 一并结束队列中排在后面的工作流。`--code` 不适用于共享工作区模式的工作流：点名这类工作流时报错；级联到它们时照常结束，不做代码处理。
- 没有交互终端时的要求同 `task review`。

### 工作流结束后的告知

工作流已经结束且进入 `reviewed` 后，按执行模式告知用户下一步：

- 未指定 `executionMode`，或 `executionMode: isolated-branches`：说明当前工作流所有任务已完成，所有修改都在本地；每个有修改的任务都有对应本地分支和提交。下一步可以提交 PR、推送到远程分支，或继续本地开发。当前版本 CodeDAG 暂不提供远程 Git 操作功能；需要远程 Git 操作时，用户可自行执行普通 `git` 命令，也可让 Agent 代为执行。若继续本地开发，可继续使用 CodeDAG。
- `executionMode: shared-workspace`：说明当前工作流所有任务已在本地完成，建议用户人工检查一遍；如有其他任务，可继续使用 CodeDAG。

## 控制命令

### pause / unpause

- `cdg task pause ...`
- `cdg dag pause ...`
- `cdg task unpause ...`
- `cdg dag unpause ...`

适用场景：

- 你想暂时停止继续推进，但希望当前运行中的步骤尽量自然收尾。
- `pause` 更温和；它不是强杀。

### kill

- `cdg task kill ...`
- `cdg dag kill ...`

适用场景：

- 当前执行必须立刻停止。
- 对 Agent 任务来说，`kill` 更接近“中断当前会话/输出”，不是温和暂停。

### recover

- `cdg task recover ...`
- `cdg dag recover ...`

适用场景：

- 任务停在 `on-hold`、`killed`、`paused` 或 `draining`。暂停时已做完当前一轮的 `paused` 任务，`recover` 与 `unpause` 一样直接按完成处理，不再让 Agent 多做一轮。
- `recover` 会按停住原因尝试恢复执行；如果你怀疑现场已经脏了，先看状态和日志，再决定是否 recover。
- 机器重启或执行进程被意外终止后，任务仍记为 `working`，但已没有进程推进，status 类命令也不会重新拉起调度。`cdg status` 在该 workflow 行下、`cdg dag status` 在 workflow 信息区给出 `Diagnostic:`，任务行标为 `[working (stale owner)]`；按其中的 `cdg dag recover <workflow>` 恢复。

选择原则：

- 想保留当前过程并稍后继续：先 `pause`。
- 明确需要立刻打断：用 `kill`。
- 已经停住且希望恢复：用 `recover`。

## 高频场景剧本

### 1. 新建一个顺序开发 workflow

1. 新建 `.codedag/dags/feature.yaml`
2. 写最小 `tasks`
3. `cdg dag validate feature`
4. `cdg dag submit feature`
5. `cdg dag status feature`
6. 按需要执行 `task review` 或 `dag review`

### 2. 让多个 Agent 并行开发

1. 先准备 worktree 或多个 clone。
2. 为并行节点写清晰依赖，互不依赖的任务不要互相串联。
3. 提交后优先看 `dag status` 和 `dag logs`，确认任务各自在独立工作区推进。

### 3. 任务跑完了，但你还不想立刻接受

1. 先用 `cdg task status` 或 `cdg task logs` 看结果。
2. 对结果不满意但想保留当前成果时，优先 `task review request-changes` 交代修改要求；想自己改时用 `task review revise`。
3. 如果思路错了，且当前模式允许，使用 `task review rework`。
4. 只有确认结果可进入后续链路时再 `accept`。

### 4. 执行中实时纠偏或查看原生轨迹

1. 在真实可交互终端或 tmux 中进入项目目录，用 `cdg task view <taskId> -w <workflow>`；无法满足执行条件时，按“进入任务会话”一节使用 request-changes 兜底。
2. 在会话里观测轨迹，或发 prompt 实时纠偏；是否先提交由 prompt 中的要求决定。
3. 退出 `view` 不等于 workflow 结束；退出后仍要回到 CodeDAG 侧继续看状态和 review。

### 5. 运行中弹出审批时

1. 从 `dag logs` / `task logs` 发现任务出现审批提示且长时间无进展。
2. 对照提交前与用户约定的审批处置策略：约定内自行应答，超范围先问用户。
3. 按「进入任务会话 → 非交互环境驱动 task view」用 tmux 读屏并应答。
4. 应答后退出 view，回到 `status` / `logs` 确认任务恢复推进。

## 写 workflow 时的默认习惯

- 优先保持 task 粒度均匀；不要一个 task 包含半个项目的工作量。
- 优先让依赖表达真实约束，不要为了“看起来简单”删掉必要依赖。
- 优先让 `title` 和 `prompt` 可读；别人只看这两个字段也应理解任务意图。
- 只有确定要人工审核时，才把 `autoAccepted` 或 `taskAutoAccepted` 设为 `none`。

## 遇到这些情况时，先查更详细文档

详细文档在 `https://codedag.com/docs`，按下列情况查对应页面：

- 你需要完整状态机定义，而不是高频状态解释。
- 你要精确理解分支命名、集成分支、冲突合并和工作区排除策略。
- 你要排查 `review` 的代码处理副作用，或理解某个 continue action 的后台接管机制。
- 你要回答用户关于登录、订阅与额度细则的边界问题。
- 你要使用当前 skill 未覆盖的低频字段或新命令。
