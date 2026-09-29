<div align="center">
  <img src="icon.png" width="100" alt="AI3D" />
  <h2>AI3D · AI3D模型</h2>
  <p>在模型上标清楚，让 Agent 改明白。</p>
</div>

**中文** | [English](README.en.md)

[![CI](https://github.com/Mutantcat-Working-Group/AI3D/actions/workflows/ci.yml/badge.svg)](https://github.com/Mutantcat-Working-Group/AI3D/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

### 一、产品概述

AI3D（中文名：AI3D模型）是一个在浏览器里与 Agent 协作审阅 3D 模型的标注工作台。Agent 先发布一版草稿，你在自己的浏览器中打开它，直接在网格表面放下带字母的定位针，或用油漆桶标出相连的近平面区域，然后把这一批标注交回给 Agent。Agent 读到的是一组三维坐标、面引用和版本信息，而不是截图；确认理解后，它发布下一版。每个版本都保持可打开、可继续标注。

它不替代 CAD 或雕刻软件；它补的是「这是草稿」和「这里要改」之间那一段：以前是一张截图加一段话，现在是一批落在模型表面、可被 Agent 精确读取的标记。

![在模型表面放置 A、B 字母针，油漆桶填充平面，然后发送给 Agent 的录制演示](docs/media/demo.gif)

### 二、为什么直接在模型上标注

对 Agent 说「左边支架的圆角太锐利」只需要一句话，却要花更多话确认是哪个支架。AI3D 的标记携带网格、面、重心坐标以及它依据的版本；Agent 拿到的是地址而不是描述，还能反过来指出它理解的是哪个表面。

### 三、审阅闭环

1. Agent 先对模型文件运行 `precheck`，再 `open` 发布。
2. 你在 Chrome、Safari 或任何现代 WebGL 浏览器里打开链接。
3. 选标注工具，点击表面放下字母针；油漆桶会填充所点面周围相连的近平面区域。旋转视角的工具不会产生标注，模型在明确提交前不会发出任何东西。
4. 按「交给 Agent」。这一批标注会冻结在它所依据的版本上。
5. Agent 调用 `read` 读取标注，在原对话中回复，并 `open` 下一版。旧版本保留自己的标注，仍可切换选择。

没有「结束本轮」按钮：下一版本就是上一轮的结束。

### 四、三种入口，同一套实现

核心不知道是谁在调用它；三个入口都驱动同一个实例管理器，使用同一组动作和同一种结果。

| 入口 | 调用方式 | 审阅归属 |
| --- | --- | --- |
| OpenClaw 扩展 | 原生 `ai3d` 工具 | 由宿主会话派生 |
| `ai3d` CLI | `ai3d <action> --owner <id> …`，JSON 进 JSON 出 | 由调用方声明 |
| `ai3d-mcp` | stdio MCP server，加入客户端的 `mcp_servers` | 工作区，或 `AI3D_OWNER` |

归属决定谁能改动草稿或切换显示版本。第二个归属者询问同一项目时会收到 `RESUME_REQUIRED`，直到有人明确说明审阅正在继续。

只有能写回自己会话的宿主才能主动投递提交；通过工具协议连进来的客户端不能，因为协议里没有唤醒对话的机制。`status.notifier` 会报告宿主实际提供的能力。`send` 为 false 时，提交批次的状态是 `waiting`：可持久化、可列出、由调用 `read` 收集。这不是投递失败，也不会变成卡死状态。

### 五、模型限制

| 限制 | 阈值 | 超出时 |
| --- | --- | --- |
| 三角面 | 600,000 | 拒绝发布，`MODEL_LIMIT` |
| 文件大小 | 80 MB | 拒绝发布，`MODEL_LIMIT` |
| 贴图像素 | 单张 8192×8192，合计 33,554,432 | 拒绝发布，`TEXTURE_LIMIT` |

标记指向源面，所以处于限制边缘的模型与小型模型一样精确；限制以下不存在性能悄悄变差的问题。`precheck` 在 `open` 之前测量文件，超出时给出应简化的比例，而不是事后拒绝。

STEP 在细分前没有三角面数，所以 `precheck` 会先细分再测量；`open` 随后发布的就是同一次细分。超出上限时它要求简化模型而不是给出比例，因为文件里没有可减面的三角形，被数过的三角形来自这次细分。

### 六、安装与运行

需要 Node.js 22 或更新版本，以及支持 WebGL 的浏览器。

从克隆运行开发环境：

```sh
npm ci
npm run samples      # 生成参数化样例模型
npm test             # 257 unit and integration tests
npm run test:browser # 76 real-Chromium tests
```

`npm run samples` 写到克隆内的 `tmp/samples`，测试套件也从这里发布。开发工作在 `dev` 分支；`main` 只发布，永远从 `dev` fast-forward 并紧接着打 tag。

OpenClaw 安装：

```sh
npm run build:integration -- tmp/candidate/package
openclaw plugins install ./tmp/candidate/package
```

任何 MCP 客户端安装指定 tag：

```sh
npm i -g "github:Mutantcat-Working-Group/AI3D#v1.0.20260929"
```

```toml
[mcp_servers.ai3d]
command = "ai3d-mcp"
```

或不安装、直接运行：

```toml
[mcp_servers.ai3d]
command = "npx"
args = ["-p", "github:Mutantcat-Working-Group/AI3D#v1.0.20260929", "ai3d-mcp"]
```

务必固定 tag。没有 tag 时，npm 会安装默认分支当时的内容并运行其中的 `prepare` 脚本。本仓库未发布到 npm registry，仓库内包名为 `org.mutantcat.ai3d`；安装命令用 npm 作为包管理器，而不是把 npm registry 当作来源。

工作台默认只监听 loopback 地址；LAN 模式绑定一个验证过的私有 IPv4，并且始终要求授权。

### 七、桌面客户端

AI3D 同时提供 Tauri 桌面客户端，把同一个工作台放进独立窗口。桌面端需要本机安装 Node.js 22 或更新版本，因为打包后的内置服务仍由 Node 运行；窗口本身使用系统 WebView（Windows 上为 WebView2）。

```sh
npm ci
npm run desktop:build                 # 打包内置服务与前端到 tmp/desktop-package
npm run desktop:dev                   # 以开发模式启动桌面窗口
npm run desktop:build:installer       # 构建本地 NSIS 安装包（Windows）
```

本地安装包输出在 `src-tauri/target/release/bundle/nsis/`。推送 `v*` 标签时，GitHub Actions 会构建并附加到对应 Release：Linux x64 AppImage，macOS Intel 与 Apple Silicon 两个 DMG（ad-hoc 签名，内含 Applications 拖放快捷方式），以及 Windows x64 与 ARM64 两个 NSIS 安装包（自签名，安装界面提供简体中文、繁体中文与英文）。应用标识为 `org.mutantcat.ai3d`，窗口标题为 AI3D，图标与仓库根目录的 `icon.png` 一致。桌面端数据（审阅状态、已发布模型）保存在系统应用数据目录，默认只在本机 loopback 地址上运行内置服务。

### 八、开发进度

计划不是承诺：使用中可能会调整顺序。想法和需求欢迎发到 [Discussions](https://github.com/Mutantcat-Working-Group/AI3D/discussions)。

- **1.4** — 审阅者的意图完整到达 Agent：提交携带屏幕朝上方向，标记可附简短说明，审阅者可以测量模型并把尺寸附给标记。
- **1.5** — 所有合法 GLB 都按作者本意打开：Draco、Meshopt、KTX2 压缩，绑定姿势的绑骨模型，形态目标，GPU instancing，适配 4K PBR 的贴图预算，以及带外部文件的 `.gltf`。
- **1.6** — 按设计显示 GLB：动画姿势、LOD 集合、材质变体。
- **1.7** — 面向游戏资产的审阅辅助：UV 和棋盘格视图、分通道贴图视图、按网格三角面数、带可见性的节点树。
- **1.8** — 游戏资产道具库扩展：火盆、符文石、尖刺陷阱等地牢道具，炮塔、无人机、通信天线等科幻道具；每个资产输出三角形、顶点与部件数量，方便直接对照引擎预算。
- **1.9** — 场景套装：地牢、营地、前哨站三种预设场景，按种子确定性摆放九件道具，支持整场景导出并保留道具命名。
- **2.0** — 动画播放：可以播放并逐帧查看绑骨动画。

### 九、文档

- [AGENT-INTERFACE.md](AGENT-INTERFACE.md) — Agent 实现的接口契约
- [docs/zh/](docs/zh/) — 中文设计文档：定位、需求、版本规则、路线图
- [English README](README.en.md) — 英文项目说明

### 十、许可证

Apache-2.0，见 [LICENSE](LICENSE)。

STEP 支持是唯一不属于本项目代码的部分。读取 STEP 需要求值其曲面，AI3D 使用 [occt-import-js](https://github.com/kovacsv/occt-import-js) 完成，它是 [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT) 的 WebAssembly 构建。两者都是 **LGPL-2.1**，并保持原样：从克隆或 npm 安装时作为普通依赖解析，OpenClaw 包把它们作为 `vendor/` 中两个未修改文件与许可文本一起携带，而不是折叠进 bundle。这是有意的选择；替换它们只需换掉这两个文件。AI3D 自身的代码保持 Apache-2.0。
