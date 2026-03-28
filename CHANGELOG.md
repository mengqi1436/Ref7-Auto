# 更新日志

本项目所有重要更改都将记录在此文件中。

## [1.7.5] - 2026-03-29

### 重构 / 工程
- ♻️ 核心类型与默认设置迁入 **`shared/`**，渲染与主进程共用单一来源
- ♻️ **`App.tsx` 瘦身**：抽取 `useAppTheme`、`useAppNotifications`、`useRegistrationSideEffects` 与工具函数 `cn`
- ♻️ 精简 **`preload`**、**`ipc/handlers`** 与全局样式；**Tailwind** 配置与 **`globals.css`** 收敛
- ♻️ **`electron/services/browser`** 等行为整理与能力补全

### 文档
- 📝 同步 **README**、**CHANGELOG**；移除 **`AGENTS.md`**

## [1.7.4] - 2026-03-29

### 优化
- 🔧 增强 Context7 请求与 Ref 额度（`ref-credits`）拉取与错误处理，完善 IPC
- 📋 账户列表展示与交互调整
- 🛠️ 开发启动脚本 `start-dev.bat` 小更新

## [1.7.3] - 2026-03-29

### 新增 / 改进
- 📧 Context7：邮件分流，区分验证码邮件与「已注册」类通知，避免误判
- 🔗 浏览器与后续步骤的会话桥接；邮箱验证后改为以 HTTP 接口为主的续跑流程，减少无效自动化
- 📬 IMAP / TempMail+ 与 Context7 邮件解析辅助（`context7-mail` 等）

### 依赖
- 依赖与 lockfile 版本对齐

## [1.7.2] - 2026-03-28

### 改进
- 📧 IMAP 服务增强（收取、解析与注册流程衔接）
- 🔌 Ref 侧：`ref-api`、`ref-credits` 与 IPC 调度优化
- 🧾 新增 `describe-fetch-error` 等工具，统一网络错误描述
- 🖥️ 注册面板、账户列表与 `App` 壳层路由/状态适配

## [1.7.1] - 2026-03-28

### 新增
- 💾 数据库与 Ref 额度相关能力扩展，IPC / preload 与渲染层类型同步
- 📊 账户列表与主进程联动增强（额度、刷新等）

### CI
- ✅ 增加 push / Pull Request 触发的持续集成构建

## [1.7.0] - 2026-03-28

### 新增
- 🔗 **Ref.tools HTTP API 集成**（`ref-api.ts`）：与浏览器自动化互补的后端调用路径
- 📚 Ref / Context7 相关文档与网络分析辅助脚本（`docs/ref-api-analysis` 等）
- 🛠️ IPC、数据库字段、`RegisterPanel` / `AccountList` 与 `context7-requests` 链条大修

## [1.6.1] - 2026-03-21

### 新增
- 📡 Context7 / Ref **额度（credits）** IPC，支持账户侧刷新与展示
- 🔄 注册面板能力扩展，与额度、补全流程配合

## [1.6.0] - 2026-03-21

### 版本
- 📌 版本号递进到 1.6.0，与后续发版与 CI 流程对齐

## [1.5.3] - 2026-03-21

### 新增
- 📊 **Ref / Context7 额度 HTTP 拉取**（`ref-credits`、`context7-requests`）
- 🔐 Context7 **Clerk** 登录与控制台向 API 请求编排
- 📈 Dashboard / 账户列表上的请求数、额度类信息展示
- 🤖 `ref-browser` 浏览器自动化增强

### CI / 工程
- 📦 GitHub Release 自动上传产物；构建侧 `--publish never` 与 `GITHUB_TOKEN` 使用方式调整

## [1.5.2] - 2026-01-19

### 修复
- 🐛 修复应用底部版本号硬编码问题，现在动态从 package.json 获取
- 🐛 修复 ElectronAPI 类型定义缺少 startRefRegistration 方法
- 🐛 修复 Windows 构建图标格式问题

## [1.5.1] - 2026-01-19

### 修复
- 🐛 修复 macOS 构建时 blockmap 文件上传冲突问题
- 🐛 修复 Ref API Key 注册后未自动保存到数据库的问题

### 优化
- 🔧 统一 artifactName 格式，移除文件名中的空格
- 🔧 简化 GitHub Actions 工作流，由 electron-builder 统一处理发布
- ♻️ 大规模代码重构，减少约 245 行冗余代码
- ♻️ 统一编程风格，提取公共函数和常量
- ♻️ 优化浏览器自动化服务代码结构

### 技术改进
- 移除 macOS zip 构建目标，简化发布流程
- 发布模式改为 draft，避免多平台并发上传冲突
- 新增 `updateAccountRefApiKey` 数据库接口

## [1.5.0] - 2026-01-19

### 新增
- ✨ 新增 Ref.tools API 自动注册功能，支持一键获取 Ref API Key
- 🔑 账户列表新增 Ref API Key 显示列，支持一键复制
- 🔄 新增「注册 Ref API」按钮，可为已有账户单独注册 Ref API
- 🖥️ Ref 注册支持调试模式，可选择显示/隐藏浏览器窗口
- 📧 IMAP 服务新增 Ref 验证链接自动提取功能

### 优化
- 🎨 注册面板支持双模式切换（普通注册 / Ref 注册）
- 📊 账户列表新增操作按钮列，优化用户体验
- 🛠️ 重构 IPC 处理逻辑，新增 Ref 相关接口
- 💾 数据库新增 refApiKey 字段支持

### 技术改进
- 新增 `ref-browser.ts` 服务模块，封装 Ref.tools 自动化逻辑
- 浏览器自动化增强反检测能力（Turnstile 验证绕过）
- TypeScript 类型定义完善（RefRegistrationConfig、RefRegistrationResult）
- IMAP 服务增加多种验证链接匹配模式

## [1.4.5] – [1.4.8] - 2026-01-18 ~ 2026-01-19

### 新增 / 修复
- ✨ **自动更新**：集成 `electron-updater`，支持检查 GitHub Release
- 🔧 关闭差分下载（differential download）、移除旧版自研更新逻辑；动态版本展示统一 `app.getVersion()`
- 🐛 关闭 blockmap 生成，缓解上传冲突；Windows 安装包图标改为 `icon.png`；移除 macOS zip 目标等构建调整

### CI
- 🤖 GitHub Actions 多平台矩阵构建、Linux 依赖与 Ubuntu 镜像修正、`fail-fast` 策略优化

## [1.4.0] - 2026-01-18

### 新增
- ✨ 新增「关于」页面，展示应用信息、技术栈和作者信息
- 🔄 新增在线检测更新功能，自动对比 GitHub Release 版本
- 📦 新增账户数据导入功能，支持 JSON 格式批量导入
- 📤 新增账户数据导出功能，支持 JSON 格式导出
- 🔐 账户列表新增密码显示/隐藏切换按钮
- ⚙️ 新增批量注册参数配置（默认批量数量/最大批量数量）

### 优化
- 🎨 全新设置页面 UI 设计，采用分类标签式布局（通用/账号/高级）
- 📊 Dashboard 页面重构，新增最近注册账户快速预览卡片
- 🖥️ 优化控制面板布局，提升信息展示效率
- 🛠️ 重构 IPC 处理逻辑，增加导入导出相关接口
- 💾 优化数据库服务，增强数据操作的健壮性

### 技术改进
- 代码结构优化，提升可维护性
- 组件拆分更合理，减少代码耦合
- TypeScript 类型定义完善

## [1.1.0] - 2026-01-15

### 新增
- ✨ 新增 Context7.com 注册支持与 API Key 自动获取
- 🔑 新增 API Key 管理功能，支持查看配额与使用情况
- 🖥️ 新增后台隐藏模式，浏览器窗口可自动隐藏到屏幕外
- 💎 新增确认弹窗组件，提升交互体验

### 优化
- 🚀 优化浏览器自动化，增强反检测能力
- 🛠️ 重构数据库服务与 IPC 处理逻辑

## [1.0.0] - 2026-01-10

### 初始版本
- 🚀 基于 Electron + React 的桌面应用
- 📧 支持 TempMail+ 临时邮箱服务
- 📧 支持 IMAP 邮箱服务
- 🤖 智能浏览器自动化，绕过 Cloudflare Turnstile 验证
- 📊 账户管理与数据导出
- 🎨 Cyberpunk 风格现代化 UI
- 🌙 深色/浅色主题切换
