# AI3D · 正式命名与兼容

2026-09-29，软件正式更名为 **AI3D**，中文名 **AI3D模型**，包名统一为
`org.mutantcat.xxx` 形式；仓库包名 `org.mutantcat.ai3d`，OpenClaw 适配包名
`org.mutantcat.ai3d.openclaw`。

| 用途                | 正式名称                                                          |
| ------------------- | ----------------------------------------------------------------- |
| 产品名              | **AI3D**                                                          |
| 中文名              | **AI3D模型**                                                      |
| GitHub仓库          | `Mutantcat-Working-Group/AI3D`                                    |
| 仓库包名            | `org.mutantcat.ai3d`                                              |
| 适配插件包名        | `org.mutantcat.ai3d.openclaw`                                     |
| 中文说明            | 面向Agent协作的3D模型审阅与标注工作台                             |
| 中文一句话          | 在模型上标清楚，让Agent改明白。                                   |
| 英文描述            | Browser-based 3D review and annotation for agent-assisted modeling. |

本次改名覆盖页面标题、工作台品牌、CLI／MCP 入口（`ai3d`／`ai3d-mcp`）、
OpenClaw 插件标识、环境变量（`AI3D_*`）、构建常量、媒体与状态路径、包名及
锁文件。health 的 `app: 3d-agent-review`、浏览器缓存键、cookie、服务 API、
Unix IPC 和提交消息识别前缀等兼容标识不随改名变动，历史版本与审阅数据不受影响。

---

> 以下为 2026-09-10 正式定名 **MeshCue** 时的记录，保留作为历史背景；当前正式名称以本文顶部为准。

2026-09-10 17:14，Kelven明确采纳 **MeshCue** 为正式产品名，并要求完成项目命名修改；GitHub仓库由Kelven创建。

| 用途                | 正式名称                                                            |
| ------------------- | ------------------------------------------------------------------- |
| 产品名              | **MeshCue**                                                         |
| GitHub仓库／npm包名 | `meshcue`                                                           |
| 中文说明            | 面向Agent协作的3D模型审阅与标注工作台                               |
| 中文一句话          | 在模型上标清楚，让Agent改明白。                                     |
| 英文描述            | Browser-based 3D review and annotation for agent-assisted modeling. |

Mesh指3D模型网格，Cue指修改提示与指引。品牌不绑定OpenClaw、Telegram或某个建模工具；它是审阅协作工作台，不是完整CAD或另一个独立Agent。

## 已统一

- 页面标题、工作台品牌、页面描述、package.json和锁文件、下载标注／恢复文件的名称、服务启动提示、当前项目主文档。
- 本机源码目录为 `projects/meshcue/`。旧目录名 `projects/3d-agent-review` 是指向新目录的相对符号链接；新旧入口为同一份Git、运行数据及源码，不是复制项目或分叉。
- 历史验收文档、模型manifest、提交和旧侧栏证据不批量重写。正式名称不影响已有版本或审阅数据。

## 特意保留的兼容标识

- HTTP health的 `app: 3d-agent-review` 用于既有启动器和进程身份核对；新增 `product: MeshCue` 表示正式名称。
- 浏览器的 `3d-review-client`／`3d-review-draft-*` 缓存键、cookie名、服务API、Unix IPC、提交消息识别前缀均保持。改品牌不能使浏览器授权、未同步草稿或旧提交丢失。
- 已有 `media/3d/3d-agent-review/` 媒体目录及模型记录中的旧路径继续可用，不移动或复制用户原始模型。
- 已有内网网址、端口、Telegram来源绑定和30天闲置授权规则不变。不创建新授权范围，不撤销浏览器或清锁。

## GitHub仓库

Kelven已创建正式仓库 [lzyling/meshcue](https://github.com/lzyling/meshcue)，并在2026-09-10提供实际地址。`origin` 为 `git@github.com:lzyling/meshcue.git`；首次同步以当前0.4候选建立 `main`，保留开发分支、完整项目历史和原 `v0.4.0-rc.1` 标签。分支用途与数据边界见 [README](../../README.md#版本与数据边界)。

项目级SSH访问使用独立GitHub Deploy Key；提交给用户的是公钥，添加到仓库 **Settings → Deploy keys**，不是提交到仓库文件或Actions secret。Mac端私钥使用系统钥匙串保管，不进入源码／日志／聊天；这把key与工作台浏览器授权完全无关。

## 本次验证与试用更新

- 命名源码／文档提交 `2c2ff84`，分支仍为 `feat/v0.4-lan-delivery`，main与rc.1标签不移动；历史侧栏改动未混入。
- 改名后核心／真实HTTP／私网测试52/52；定向浏览器回归2/2，覆盖普通入口自动领取、标记／恢复／下载以及长期授权跨进程重启与重开标签页。没有为品牌文案新增重复测试，也没有冒称这次重跑全部37个浏览器用例。
- 构建／格式／diff通过，新前端资产 `index-DQjVz5J6.js`。仅更新独立43176试用实例，静态目录 `tmp/windows-lan-test/dist-meshcue`；正式runtime/dist和Gateway未操作。
- 17:25实时核对新PID60706、health产品名MeshCue，原浏览器记录与两个视窗保持，仍30天闲置到期，未签发或撤销任何入场许可。state与停止时最新检查点完全一致，模型与审阅ID不变；匿名state401。
- 正式2,133项基线文件SHA相同，旧目录兼容链接有效。证据在 `tmp/meshcue-naming/`，包含核心／浏览器日志及部署状态；无用户凭据。
