# GeminiCLI MCP Antigravity Server

A local Model Context Protocol (MCP) server designed for **code analysis and investigation** without code modification. Supports connection via SSE, enabling seamless integration with Gemini CLI and Antigravity.

## 特性

- **提供 5 组强大的 MCP Tools**：
  - `repo_list`: 枚举工作区根目录文件
  - `code_search`: 强大的基于 Ripgrep (支持回退 Node.js) 的全库内容检索
  - `file_read`: 精确读取指定文件的指定行以提供引用证据
  - `symbol_hint`: 基于正则探索常见源文件的符号（Class、Function、API Endpoints）
  - `build_investigation_report`: 生成事故排查标准的 Markdown 模板报告
- **严格的安全沙盒**：限制只能读取 `WORKSPACE_ROOT` 内的文件，原生支持 allowlist/denylist，忽略常见 build 目录。
- **本地审计**：自动日志记录至 `data/audit.log` 包含每次 Tool 调用的参数，不写回用户文件修改。
- **专为 Windows 11 设计**：开箱即跑的 Node.js/TypeScript 实现。

## 环境要求

- **Node.js**: v18.x 或更高
- **OS**: Windows 11 (也可兼容 Linux/macOS)
- **可选依赖**: [Ripgrep (rg)](https://github.com/BurntSushi/ripgrep)（如未安装会自动降级为 Node 实现）

## 快速安装与启动

1. 在项目目录执行依赖安装：
   ```ps1
   npm install
   ```
2. 复制环境变量示例：
   ```ps1
   copy .env.example .env
   ```
3. 编辑 `.env` 文件：
   ```env
   # 服务运行的端口
   PORT=3001
   
   # 你期望分析的目标项目的绝对路径
   WORKSPACE_ROOT=D:/Your/Target/Project
   
   # 如果需要强制指定 ripgrep 路径（如果你有）
   # RG_PATH=C:/Program Files/ripgrep/rg.exe
   ```
4. 编译并启动服务：
   ```ps1
   npm run build
   npm start
   ```
   > 启动成功后，控制台会打印：`Listening on http://127.0.0.1:3001`

---

## 客户端配置示例（SSE 接入）

### 如何将同一 Server 同时接入 Gemini CLI 和 Antigravity？

你只需要把上述 `npm start` 开启的 Server 保持在后台独立运行，然后在 Gemini CLI 和 Antigravity 中都配置接入这个 `http://127.0.0.1:3001/sse` 节点即可。因为是基于 HTTP 的 SSE (Server-Sent Events) 长连接，同一个端口可以接受多个 Client 并发连接并响应调用。

**1. Gemini CLI 接入 (`~/.gemini/settings.json`)**
参见 `examples/gemini-settings.json`：
```json
{
  "mcp": {
    "servers": {
      "local_code_analysis": {
        "url": "http://127.0.0.1:3001/sse"
      }
    }
  }
}
```

**2. Antigravity 接入 (`mcp_config.json`)**
参见 `examples/antigravity-mcp_config.json`：
```json
{
  "mcpServers": {
    "geminiCLI-MCP": {
      "url": "http://127.0.0.1:3001/sse"
    }
  }
}
```

---

## 常见分析问题示例模板 (Sample Queries)

**Q: “如何用它找一个 error code 在哪里抛出？”**
*给 AI 发送的 Prompt：* 
> “请使用 code_search 检索 `ERR_DB_TIMEOUT_001`，找到它被抛出的具体文件和行号，并用 file_read 读取抛出位置的上下 20 行，告诉我触发超时错误前的业务逻辑。”

**Q: “如何让它总结某个 API 的 data flow（入口->service->repo->SQL/topic）？”**
*给 AI 发送的 Prompt：*
> “首先用 symbol_hint 找出所有的 endpoint，告诉我处理 POST `/api/v1/orders` 的 Controller 是什么。发现是 `OrderController.ts` 后，请用 code_search 看看里面调用了哪个 Service。接着顺藤摸瓜检索该 Service 里的 Repository 调用，并总结从入口到 SQL 写入数据库的完整 data flow（仅输出 markdown 说明，禁止修改代码）。”

---

## 常见问题排查 (Troubleshooting in Windows 11)

1. **端口被占用 (EADDRINUSE)`**
   *问题*: 无法绑定 3001 端口。
   *解决*: 在 `.env` 中修改 `PORT=3002`，并同步修改各客户端配置的 URL。
   
2. **"Path access denied" 错误**
   *问题*: 你试图跨盘符或检索不在 `WORKSPACE_ROOT` 定义的文件夹。
   *解决*: 检查你 `code_search` 或 `file_read` 传入的是相对路径还是包含在 WorkSpace 下的真实绝对路径。

3. **没有找到 Ripgrep**
   *问题*: 终端出现 `Ripgrep search failed... falling back to nodefs search.`。
   *解决*: 纯提示信息，系统已自动平滑降级到 Node 原生搜索。如果项目非常大，推荐通过 `winget install BurntSushi.ripgrep.MSVC` 安装 rg 以获取百倍速度提升。


## 原理说明

 在本项目（GeminiCLI_MCP_Antigravity）的语境下，Antigravity 是另一个可以接入该 MCP 服务的“客户端”，它与 Gemini CLI 的作用互补。


  如果说 Gemini CLI 是你的“文字助手”，那么 Antigravity 通常被视为你的“图形化代码分析工作台”。

  它的核心作用如下：


  1. 提供可视化交互界面 (GUI)
  Gemini CLI 运行在终端，交互以文字为主。而 Antigravity 通常提供一个更直观的界面，可以让你在侧边栏看到文件树，或者在更宽敞的窗口中阅读 AI 生成的代码分析报告、调用图等。


  2. 共享“后端”探针
  这个项目的最大特色是“一服多用”。你运行的那个 npm start 开启的 SSE 服务器（3001 端口），可以同时被两个客户端连接：
   * Gemini CLI：负责快速的、基于命令行的即时问答。
   * Antigravity：负责更深度的、需要可视化展示的复杂项目排查。


  3. 专注“事故排查”与“代码调查”
  Antigravity 往往内置了更复杂的 Prompt 模板和工作流（Workflow）。例如，本项目中专门提供了一个工具叫 build_investigation_report：
   * 当你使用 Antigravity 时，它可以调用这个工具自动生成一份符合行业标准的 Markdown 事故排查报告。
   * 它擅长处理“顺藤摸瓜”式的逻辑推导，比如：入口 A -> 服务 B -> 数据库 C 的数据流向图，在 Antigravity 中展示会比在命令行中更易读。


  4. 离线/本地化优先
  Antigravity 和该 MCP Server 的设计初衷都是为了隐私和性能。
   * 它不需要把你的整个 Java 项目（ib）上传到云端。
   * 它利用本地的 ripgrep (rg) 进行秒级搜索，然后只把 AI 关心的那一小段代码片段发送给大模型处理。


  总结
   * MCP Server (本项目)：是“眼睛和手”，负责去硬盘上读代码、搜关键字。
   * Gemini CLI：是“对讲机”，让你通过命令行指挥。
   * Antigravity：是“大屏幕监控室”，让你更全局、更直观地进行代码分析和问题定位。



1  MCP 服务端：通过 /sse 和 /message 路由，继续为 Gemini CLI 和 Antigravity 提供本地代码检索能力。
2 Web 助手服务端：通过 / 路由提供静态网页，通过 /api/chat 路由接收网页端发来的图片和文字，并在 Node.js 后台调用 Google 的 Gemini API 进行回答。