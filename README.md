<div align=center>
<img src="icon.png" style="width:100px;" width="100"/>
<h2>AI3D · AI3D模型</h2>
</div>

[English](README.en.md) | 简体中文

### 一、产品概述

AI3D（中文名：AI3D模型）是一个游戏 3D 资产生成器：一句话描述你想要的道具、角色或场景，几秒内生成带命名部位、可播放动画、可直接导出 Unity／Godot／Unreal 的低模资产。它同时内置聊天面板与 MCP 服务器——生成、提问、审阅都在同一个窗口里完成。

- 确定性程序化建模：同一句描述加同一个种子，永远得到同一份网格，适合进版本管理。
- 102 类内置资产模板：武器、护甲、生物、建筑、道具、载具、科幻、自然，按类型自动给出命名部位、标签与碰撞体预设。
- 引擎就绪：每个资产带 LOD、碰撞体、命名部位与附加点、玩法与出生元数据，导出即用，不停留在预览图。
- 内置聊天：软件内直接对话，一句话就能生成资产、套装、场景与项目；附离线建模知识包，回答带来源引用。
- MCP 服务器：AI 编程助手（Claude Code、Cursor 等）可直接调用生成与审阅能力，软件自己就是服务器。
- 审阅闭环：在真实网格表面放置定位针、用油漆桶标出近平面区域，Agent 收到的是三维坐标与面引用，而不是截图。
- 桌面客户端：Tauri 构建的 Windows／macOS／Linux 应用，界面支持简体中文、繁体中文、英语、德语、法语、日语。
- **发行方** 由异猫工作群（mutantcat.org）发行，GitHub: https://github.com/Mutantcat-Working-Group

核心价值：

- 确定性：生成结果可重建，描述加种子就是配方。
- 引擎就绪：命名、LOD、碰撞体、动画、manifest 齐备，导出包直接进管线。
- AI 原生：聊天与 MCP 是内置能力而不是插件。
- 单窗口闭环：生成、导出、知识检索、审阅标注、与 Agent 对话，都在一个界面内。

### 二、功能说明

#### 资产生成

- 快速模板：102 类资产，每类带命名部位、默认 PBR 贴图、碰撞体预设与六语言模板描述。
- 自然语言：直接描述资产，可选低模／写实／风格化，调节颜色、粗糙度、金属度与自发光。
- 种子变体：一次生成最多 12 个变体，逐个预览后保存进资产库；资产库支持标签过滤、收藏、重命名与批量导出。
- 资产套装：一行输入一件，一次生成最多 32 件，共享同一套风格、材质与导出设置，顶层产出 `set.json` 清单。
- 场景与项目：八种场景套装按种子确定性摆放道具；五种项目模板一次展开成资产套装、场景与引擎导入顺序。

#### 引擎就绪

- 三档 LOD：一键生成、按级预览、批量导出，每级记录三角面、顶点、部件与绘制调用预算。
- 碰撞体：box／sphere／capsule／cylinder／convex hull／mesh 预设，尺寸按实际网格计算；预览区可勾选「显示碰撞体」，把物理代理叠在模型上先看再导。
- 命名部位与附加点：导出记录每个部位的中心与包围盒，并给出推荐附加点（握把、脚底、铰链、挂点等）；勾选后 GLB／glTF 写入 `anchor_<role>` 空节点，引擎导入后按名查找。
- 玩法与出生元数据：宝箱可打开、吊闸可升起、金币可拾取、怪物是敌人……交互角色、阵营、AI 行为、生命与战斗数值写进 manifest，关卡脚本直接可读。
- 引擎包：Unity／Godot／Unreal 预设，含网格、独立贴图（albedo／normal／roughness／metalness／AO）、碰撞体、动画清单与预算汇总；Godot 包带可直接实例化 `LOD0.glb` 的 `.tscn`。
- 真实尺寸与原点：单位（m／cm／mm／ft／in）、尺寸依据（最大边／高度／宽度／深度）与原点位置可选，按米写入 manifest 与实测包围盒。

#### 内置聊天与知识包

- 聊天面板收在工作台内：生成、导出或审阅时都能就当前模型直接对话，不用另开窗口。
- 说人话就能建：带生成意图的项目／场景／套装／单件需求会被识别并直接走对应生成管线，确认、进度与结果都回写聊天区；普通问题仍原样转发给已连接的 Agent。
- 模型配置：支持同时保存多个模型端点并分别填写 API Key（最多 12 个），默认聊天从已配置的模型中选择。
- 知识检索：输入「LOD 预算」「白模」「拓扑」「PBR」等关键词，从随软件发布的离线知识包取回带来源与许可的条目，点选后直接插入消息；检索不依赖宿主，离线也能用。
- 知识包覆盖：glTF 2.0 规范与 Khronos 示例资产；白模与基础网格工作流、重拓扑与四边面布线、UV 展开与像素密度、高低模烘焙、骨骼绑定预算、PBR 材质等专业建模流程；Blender 官方人体白模（CC0）、史密森尼开放获取藏品（CC0）、OpenGameArt、Poly Haven、Kenney、Quaternius、Mixamo、NASA 3D Resources 等公共来源，逐条标注许可。

#### 与 Agent 的审阅闭环

- Agent 先对模型文件运行 `precheck`，再 `open` 发布；你在浏览器里直接在网格表面放下带字母的定位针，或用油漆桶标出相连的近平面区域，然后按「交给 Agent」。
- Agent 读到的是一组三维坐标、面引用和版本信息，确认后发布下一版；每个版本都保持可打开、可继续标注。
- 模型上限：三角面 600,000、文件 80 MB、单张贴图 8192×8192（合计 33,554,432 像素），超限在 `open` 之前就被 `precheck` 拦下并给出应简化的比例。

#### 桌面客户端

- Tauri 桌面客户端把同一个生成器与工作台放进独立窗口，窗口标题 AI3D，图标与仓库根目录的 `icon.png` 一致。
- 看门狗每 5 秒探测一次内置服务，进程退出或连续无响应会自动重启并把窗口重新指向新端口；息屏或休眠不会误判为崩溃。
- 默认只监听本机 loopback 地址；LAN 模式绑定经验证的私有 IPv4，并且始终要求授权。
- 桌面端数据（资产库、审阅状态、已发布模型）保存在系统应用数据目录。

### 三、安装与下载

1. 桌面端：从 [Releases](https://github.com/Mutantcat-Working-Group/AI3D/releases/latest) 下载对应平台安装包——Linux x64 AppImage、macOS Intel 与 Apple Silicon 的 DMG（ad-hoc 签名，内含 Applications 拖放快捷方式）、Windows x64 与 ARM64 的 NSIS 安装包（自签名）。每个 Release 附带 `checksums-sha1.txt` 与 `checksums-md5.txt`：

   ```sh
   sha1sum -c checksums-sha1.txt
   md5sum -c checksums-md5.txt
   ```

   桌面版需要本机安装 Node.js 22 或更新版本——打包后的内置服务仍由 Node 运行，窗口本身使用系统 WebView（Windows 上为 WebView2）。
2. 浏览器直接运行：需要 Node.js 22 或更新版本与支持 WebGL 的浏览器。

   ```sh
   npm ci
   npm run dev          # 打开 http://127.0.0.1:43175
   ```
3. MCP 客户端：把 AI3D 作为 MCP 服务器接入 Claude Code、Cursor 等 AI 编程助手。

   ```toml
   [mcp_servers.ai3d]
   command = "npx"
   args = ["-p", "github:Mutantcat-Working-Group/AI3D#v1.0.20261007", "ai3d-mcp"]
   ```

   务必固定 tag。没有 tag 时，npm 会安装默认分支当时的内容并运行其中的 `prepare` 脚本。本仓库未发布到 npm registry；安装命令用 npm 作为包管理器，而不是把 npm registry 当作来源。
4. 源码构建（含本地安装包）：

   ```sh
   npm ci
   npm run desktop:build            # 打包内置服务与前端
   npm run desktop:build:installer  # 构建本地安装包
   ```

### 四、快速上手

1. 启动后界面默认是审阅工作台；点右上角「生成器」按钮进入生成器。
2. 选一个快速模板，或直接用一句话描述你想要的资产，点「生成」。
3. 调节颜色、材质与种子，一次最多生成 12 个变体；预览满意后保存进资产库。
4. 打开导出面板：选格式（GLB／JSON glTF／OBJ）与引擎（Unity／Godot／Unreal），勾选碰撞体、LOD、动画与命名附加点，下载单文件或整包。
5. 想改主意或有问题：右侧「AI」面板直接聊天——可以问建模知识，也可以说「生成一个奇幻地牢项目」让工作台就地开建。
6. 使用自己的模型：打开「设置」，添加模型端点并填写 API Key，可保存多个端点；之后聊天默认从已配置的模型里选。
7. 与 Agent 协作审阅：Agent 对模型运行 `precheck` 并 `open` 后，你在网格表面打针或用油漆桶标注，再按「交给 Agent」。

### 五、开发者集成

#### MCP Server

- 说明：为 MCP 兼容的 AI 编程助手提供生成与审阅能力，服务名 `org.mutantcat.ai3d`。
- 安装：`npx -p "github:Mutantcat-Working-Group/AI3D#v1.0.20261007" ai3d-mcp`。
- 归属：`AI3D_OWNER` 环境变量或工作区决定草稿归属；第二个归属者询问同一项目会收到 `RESUME_REQUIRED`，直到有人明确说明审阅正在继续。
- 工具：`ai3d_generate`（`kind` 区分单件／套装／场景／项目，支持 `quality` 与 `profile`）、`ai3d_catalog`（只读目录查询）、`ai3d_knowledge`（知识包检索），以及 `precheck`／`open`／`read` 等审阅动作。
- 投递：只有能写回自己会话的宿主可以主动投递提交；`status.notifier` 报告宿主实际提供的能力，`send` 为 false 时提交批次状态为 `waiting`——可持久化、可列出，不是投递失败。

#### CLI

```sh
npm i -g "github:Mutantcat-Working-Group/AI3D#v1.0.20261007"
ai3d <action> --owner <id> …   # JSON 进 JSON 出
```

#### OpenClaw 扩展

```sh
npm run build:integration -- tmp/candidate/package
openclaw plugins install ./tmp/candidate/package
```

#### Web API

内置服务的 HTTP API 默认只监听 loopback；LAN 模式绑定经验证的私有 IPv4 并始终要求授权。

#### 源码构建与测试

```sh
npm ci
npm run samples      # 生成参数化样例模型
npm test             # 414 unit and integration tests
npm run test:browser # 94 real-Chromium tests
```

#### 文档

- [AGENT-INTERFACE.md](AGENT-INTERFACE.md) — Agent 实现的接口契约
- [docs/zh/](docs/zh/) — 中文设计文档：定位、需求、版本规则、路线图
- [English README](README.en.md) — 英文项目说明

### 六、开发进度

计划不是承诺：使用中可能会调整顺序。想法和需求欢迎发到 [Discussions](https://github.com/Mutantcat-Working-Group/AI3D/discussions)。

- [X] 102 类资产模板与确定性生成器
- [X] 引擎包导出（Unity／Godot／Unreal）、LOD、碰撞体、动画
- [X] 命名部位、附加点、玩法与出生元数据
- [X] 资产套装、场景套装与项目模板生成
- [X] 内置聊天：软件内对话生成资产、套装、场景与项目
- [X] 离线建模知识包（带来源与许可，聊天与 MCP 共用）
- [X] MCP Server、OpenClaw 扩展、CLI 三种入口，同一套实现
- [X] 与 Agent 的审阅闭环（定位针、油漆桶、precheck／open）
- [X] Tauri 桌面客户端（Windows／macOS／Linux）与看门狗
- [X] 六语言界面（简体中文、繁体中文、English、Deutsch、Français、日本語）
- [ ] 模型兼容性扩展：Draco／Meshopt／KTX2 压缩、外部文件 glTF、形态目标

[Apache-2.0](LICENSE)

---

STEP 支持是唯一不属于本项目代码的部分。读取 STEP 需要求值其曲面，AI3D 使用 [occt-import-js](https://github.com/kovacsv/occt-import-js) 完成，它是 [Open CASCADE Technology](https://github.com/Open-Cascade-SAS/OCCT) 的 WebAssembly 构建。两者都是 **LGPL-2.1**，并保持原样。AI3D 自身的代码保持 Apache-2.0。
