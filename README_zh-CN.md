# 软件工程案例实践课程管理平台 (Course Platform)

[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat-square&logo=vue.js)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.x-000000?style=flat-square&logo=bun)](https://bun.sh/)
[![ElysiaJS](https://img.shields.io/badge/ElysiaJS-1.x-orange?style=flat-square)](https://elysiajs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> [English](./README.md) | **简体中文**

一个现代化、全流程的软件工程课程管理平台。支持从**学生组队**、**项目立项**、**分阶段开发**到**互评验收**的完整生命周期管理。专为高校软件工程实践课程设计。

---

## 📚 目录

- [核心特性](#-核心特性)
- [技术栈](#-技术栈)
- [项目结构](#-项目结构)
- [快速开始](#-快速开始)
- [功能模块](#-功能模块)
- [文档](#-文档)
- [许可证](#-许可证)

---

## 🚀 核心特性

- **👥 灵活的团队管理**：支持学生自由组队、人数限制校验、队长管理制以及教师强制干预（指派/解散）。
- **📅 项目全生命周期**：覆盖从 **立项审核** -> **需求分析** -> **系统设计** -> **测试交付** 的全过程，支持阶段门禁（Gatekeeping）机制。
- **📝 作业与版本控制**：支持个人作业与团队成果提交，自动记录版本历史，支持逾期标记与软删除。
- **⚖️ 多维评价体系**：集成 **教师评分** 与 **组内互评（双盲）** 机制，支持互评系数调整与教师裁决。
- **🛡️ 企业级安全与审计**：基于 RBAC + ABAC 的权限控制，关键操作全量审计（Audit Log），数据软删除防误删。
- **🌐 国际化支持**：内置中英文多语言切换（i18n）。

---

## 🛠 技术栈

### 前端 (Client)
- **框架**: [Vue 3](https://vuejs.org/) (Composition API)
- **构建**: [Vite](https://vitejs.dev/)
- **状态管理**: [Pinia](https://pinia.vuejs.org/)
- **UI 组件**: [Element Plus](https://element-plus.org/)
- **样式**: Tailwind CSS (Utility-first)
- **国际化**: Vue I18n

### 后端 (Server)
- **运行时**: [Bun](https://bun.sh/) (高性能 JavaScript 运行时)
- **Web 框架**: [ElysiaJS](https://elysiajs.com/) (End-to-end type safety)
- **数据库**: SQLite (轻量级、高性能)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **安全**: Argon2 哈希, JWT 认证, CSRF 防护

---

## 📂 项目结构

```text
CoursePlatform/
├── client/                 # Vue 3 前端应用
│   ├── src/
│   │   ├── api/           # API 接口定义
│   │   ├── views/         # 页面视图 (Admin/Teacher/Student)
│   │   ├── components/    # 公共组件
│   │   └── locales/       # i18n 语言包
│   └── ...
├── server/                 # Bun + Elysia 后端服务
│   ├── src/
│   │   ├── routes/        # API 路由定义 (v1)
│   │   ├── db/            # 数据库 Schema (Drizzle)
│   │   ├── middleware/    # 中间件 (Auth, Access Control)
│   │   └── services/      # 业务逻辑
│   └── ...
├── docs/                   # 详细项目文档
│   ├── USER_MANUAL.md     # 用户手册
│   ├── API_REFERENCE.md   # API 接口文档
│   └── DEPLOYMENT.md      # 部署指南
└── README.md               # 项目说明
```

---

## ⚡ 快速开始

### 前置要求
- **Node.js**: v18+
- **Bun**: v1.0+ ([安装指南](https://bun.sh/docs/installation))

### 1. 启动后端 (Server)

```bash
cd server

# 安装依赖
bun install

# 初始化数据库 (生成 SQLite 文件)
bun run db:push 
# 或者如果配置了 migrate 脚本: bun run db:migrate

# 填充种子数据 (可选，用于测试)
bun run db:seed

# 启动开发服务器
bun run dev
```
> 后端默认运行在 `http://localhost:3000`

### 2. 启动前端 (Client)

```bash
cd client

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```
> 前端默认运行在 `http://localhost:5173`

---

## 🧩 功能模块

### 👨‍🎓 学生端
- **我的班级**：查看班级信息，下载课件。
- **组队大厅**：创建团队、搜索团队、申请加入。
- **项目工作台**：提交立项申请、上传阶段作业、查看评审意见。
- **互评中心**：在指定窗口期内对组员进行匿名评分。

### 👩‍🏫 教师端
- **班级管理**：导入学生名单、设置班级规则。
- **审批中心**：审核项目立项、处理特殊申请。
- **进度监控**：查看各组提交情况，控制项目阶段流转（解锁/回滚）。
- **成绩管理**：在线评分，查看并裁决互评结果，导出成绩单。

### 🔧 管理员端
- **用户管理**：创建教师账号，重置用户密码。
- **系统配置**：全局参数设置。

---

## 📖 文档

更多详细信息请参考 `docs/` 目录下的文档：

- [需求规格说明书 (Requirements)](./docs/REQUIRE.md)
- [用户手册 (User Manual)](./docs/USER_MANUAL.md)
- [API 参考文档 (API Reference)](./docs/API_REFERENCE.md)
- [测试指南 (Testing Guide)](./docs/TESTING.md)
- [部署文档 (Deployment)](./docs/DEPLOYMENT.md)

---

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](./LICENSE) 文件。
