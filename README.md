<p align="center">
  <img src="assets/icon.png" alt="REF7 Auto Register" width="128" height="128">
</p>

<h1 align="center">REF7 Auto Register</h1>

<p align="center">
  <strong>一款优雅的 Context7自动化账户注册管理工具</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.0-blue.svg" alt="Version 1.4.0">
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用指南">使用指南</a>
</p>

---

## 项目简介

REF7 Auto Register 是一款基于 Electron 的桌面应用程序，专为 [Context7.com](https://context7.com) 自动化账户注册流程而设计。它集成了智能浏览器自动化、Cloudflare Turnstile 验证绕过、邮件验证码自动获取、账户与 API Key 批量管理等功能，提供了一站式的注册解决方案。

应用采用现代化的 Cyberpunk 风格 UI 设计，支持深色/浅色主题切换，提供流畅的动画效果和优秀的用户体验。

## 更新日志

> 查看完整更新历史：[CHANGELOG.md](CHANGELOG.md)

### v1.4.0 (2026-01-18)
- ✨ 新增「关于」页面，支持在线检测更新
- 📦 新增账户数据导入/导出功能（JSON 格式）
- 🎨 全新设置页面 UI，分类标签式布局（通用/账号/高级）
- 📊 Dashboard 重构优化，新增最近账户快速预览
- 🔐 账户列表新增密码显示/隐藏切换
- ⚙️ 新增批量注册参数配置（默认数量/最大数量）
- 🛠️ 优化 IPC 处理逻辑与数据库服务

### v1.1.0
- ✨ 新增 Context7.com 注册支持与 API Key 自动获取
- 🔑 新增 API Key 管理功能，支持查看配额与使用情况
- 🚀 优化浏览器自动化，增强反检测能力
- 🖥️ 新增后台隐藏模式，浏览器窗口可自动隐藏到屏幕外
- 💎 UI 优化：新增确认弹窗组件，提升交互体验
- 🛠️ 重构数据库服务与 IPC 处理逻辑

## 功能特性

### 🚀 自动化注册
- **智能浏览器自动化**：基于 puppeteer-real-browser，自动绕过 Cloudflare Turnstile 验证
- **后台隐藏模式**：浏览器窗口可隐藏到屏幕外并从任务栏移除，实现真正的后台运行
- **增强反检测**：禁用自动化特征检测，模拟真实浏览器指纹
- **批量注册支持**：单次可配置注册 1-20 个账户
- **随机密码生成**：自动生成包含大小写字母、数字和特殊字符的安全密码
- **可配置注册间隔**：随机延迟策略，模拟人工行为

### 📧 双邮箱服务支持
- **TempMail+ 临时邮箱**：无需自有域名，快速注册
- **IMAP 邮箱服务**：支持自有域名邮箱，通过 IMAP/POP3 协议接收验证码

### 🔑 API Key 管理
- **自动获取 API Key**：注册完成后自动获取 Context7 API Key
- **配额追踪**：显示每个账户的 API 请求配额和使用情况
- **一键复制**：快速复制 API Key 到剪贴板

### 📊 账户管理
- **账户状态追踪**：实时显示有效、待验证、失效账户统计
- **搜索与筛选**：支持按邮箱地址快速搜索
- **批量操作**：支持批量选择和删除
- **数据导出**：支持导出为 CSV/JSON 格式

### 🎨 现代化界面
- **Cyberpunk 风格设计**：独特的视觉效果，neon 发光效果
- **主题切换**：支持深色、浅色和跟随系统三种模式
- **流畅动画**：基于 Framer Motion 的丝滑过渡效果
- **响应式布局**：适配不同屏幕尺寸

### 📝 实时日志
- **彩色日志输出**：不同类型日志以不同颜色区分
- **实时滚动**：自动滚动到最新日志
- **日志清空**：一键清空历史日志

## 应用截图

<table>
  <tr>
    <td align="center">
      <img src="docs/screenshots/dashboard.png" alt="控制面板" width="400"><br>
      <em>控制面板 - 账户统计概览与实时日志</em>
    </td>
    <td align="center">
      <img src="docs/screenshots/accounts.png" alt="账户列表" width="400"><br>
      <em>账户列表 - 搜索、导出和批量管理</em>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/settings.png" alt="系统设置" width="400"><br>
      <em>系统设置 - 邮箱服务与外观主题配置</em>
    </td>
    <td align="center"></td>
  </tr>
</table>

## 技术栈

### 前端
- **React 19** - 用户界面构建
- **TypeScript** - 类型安全的 JavaScript
- **Tailwind CSS** - 原子化 CSS 框架
- **Framer Motion** - 动画库
- **Lucide React** - 图标库

### 后端 (Electron)
- **Electron 34** - 跨平台桌面应用框架
- **puppeteer-real-browser** - 反检测浏览器自动化
- **sql.js** - SQLite 数据库 (WebAssembly)
- **imap** - IMAP 协议客户端
- **mailparser** - 邮件解析

### 构建工具
- **Vite** - 现代化构建工具
- **electron-builder** - Electron 应用打包

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/ref7/ref7-auto-register.git
cd ref7-auto-register

# 安装依赖
npm install
```

### 构建应用

```bash
# 构建 Windows 安装包
npm run electron:build:win

# 或通用构建
npm run electron:build
```

构建产物将输出到 `release` 目录。

## 使用指南

### 1. 配置 Cloudflare 域名邮箱

> ⚠️ **重要前提**：必须使用 Cloudflare 域名邮箱！请先完成以下步骤。

#### 1.1 将域名托管到 Cloudflare

1. 登录 [Cloudflare 控制面板](https://dash.cloudflare.com)
2. 点击「添加站点」，输入你的域名
3. 按照提示修改域名的 DNS 服务器为 Cloudflare 提供的地址
4. 等待 DNS 生效（通常需要几分钟到几小时）

#### 1.2 配置 Cloudflare 邮件路由

1. 在 Cloudflare 控制面板，选择你的域名
2. 点击左侧菜单的「电子邮件」→「电子邮件路由」
3. 启用电子邮件路由功能
4. 点击「路由规则」→「创建地址」或「Catch-all 地址」
5. 选择「发送到电子邮件」
6. 填写目标邮箱地址（用于接收验证码的邮箱，如 QQ 邮箱或 tempmail.plus 邮箱）
7. 验证目标邮箱后保存规则

> 💡 **提示**：建议使用 Catch-all 规则，这样任意前缀的邮箱都会转发到目标邮箱。

### 2. 配置邮箱服务

完成 Cloudflare 邮件路由后，进入 **系统设置** 页面配置接收方式：

#### 方式一：TempMail+（推荐）

1. 访问 [tempmail.plus](https://tempmail.plus) 创建临时邮箱
2. 获取邮箱用户名和 EPIN 码
3. 在设置中填入相应信息
4. 将 Cloudflare 邮件路由的目标邮箱设置为 `用户名@mailto.plus`
5. 点击"测试连接"验证配置

#### 方式二：IMAP 邮箱

1. 填写你的邮箱账号（如 QQ 邮箱、Gmail 等）
2. 获取并填入邮箱授权码（非登录密码）
3. 配置 Cloudflare 域名（用于生成注册邮箱）
4. 可选配置 IMAP 服务器地址、端口等
5. 将 Cloudflare 邮件路由的目标邮箱设置为此邮箱地址
6. 点击"测试连接"验证配置

### 3. 开始注册

进入 **开始注册** 页面：

1. 选择邮箱服务类型（TempMail+ 或 IMAP）
2. 设置批量数量（1-20）
3. 可选开启调试模式（显示浏览器窗口）
4. 点击"启动任务"开始自动注册
5. 在右侧面板查看实时日志

### 4. 管理账户

进入 **账户列表** 页面：

- 查看所有已注册账户及其 API Key
- 使用搜索框快速定位账户
- 点击复选框批量选择账户
- 一键复制 API Key 到剪贴板
- 导出账户数据为 CSV 格式
- 删除不需要的账户

### 5. 使用 API Key

注册成功后，每个账户都会自动获取 Context7 API Key：

1. 在账户列表中找到目标账户
2. 点击 API Key 旁的复制按钮
3. 将 API Key 用于你的 Context7 API 调用

## 注意事项

- 本工具仅供学习和研究使用
- 请遵守目标网站的使用条款和服务协议
- 过于频繁的注册可能会触发风控机制
- 建议合理设置注册间隔时间

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ref7">REF7 Team</a>
</p>
