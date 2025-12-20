# Course Platform

[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat-square&logo=vue.js)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.x-000000?style=flat-square&logo=bun)](https://bun.sh/)
[![ElysiaJS](https://img.shields.io/badge/ElysiaJS-1.x-orange?style=flat-square)](https://elysiajs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> **English** | [简体中文](./README_zh-CN.md)

A modern, full-process software engineering course management platform. It supports the complete lifecycle from **student team formation**, **project proposal**, **phased development** to **peer review and acceptance**. Designed specifically for university software engineering practice courses.

---

## 📚 Table of Contents

- [Core Features](#-core-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Features](#-features)
- [Documentation](#-documentation)
- [License](#-license)

---

## 🚀 Core Features

- **👥 Flexible Team Management**: Supports free team formation, size limit validation, captain management, and instructor intervention (assignment/dissolution).
- **📅 Full Project Lifecycle**: Covers the entire process from **Proposal Review** -> **Requirements Analysis** -> **System Design** -> **Testing & Delivery**, with stage gatekeeping mechanisms.
- **📝 Assignments & Version Control**: Supports individual and team submissions, automatic version history, late submission marking, and soft deletes.
- **⚖️ Multi-dimensional Assessment**: Integrates **Instructor Grading** and **Peer Review (Double-blind)**, supporting review coefficient adjustments and instructor veto.
- **🛡️ Enterprise-grade Security & Audit**: Based on RBAC + ABAC permissions, full audit logging for key operations, and data soft deletion.
- **🌐 Internationalization**: Built-in support for switching between English and Chinese (i18n).

---

## 🛠 Tech Stack

### Client (Frontend)
- **Framework**: [Vue 3](https://vuejs.org/) (Composition API)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **UI Components**: [Element Plus](https://element-plus.org/)
- **Styling**: Tailwind CSS (Utility-first)
- **i18n**: Vue I18n

### Server (Backend)
- **Runtime**: [Bun](https://bun.sh/) (High-performance JavaScript runtime)
- **Web Framework**: [ElysiaJS](https://elysiajs.com/) (End-to-end type safety)
- **Database**: SQLite (Lightweight, high performance)
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Security**: Argon2 hashing, JWT authentication, CSRF protection

---

## 📂 Project Structure

```text
CoursePlatform/
├── client/                 # Vue 3 Frontend Application
│   ├── src/
│   │   ├── api/           # API Definitions
│   │   ├── views/         # Page Views (Admin/Teacher/Student)
│   │   ├── components/    # Shared Components
│   │   └── locales/       # i18n Language Packs
│   └── ...
├── server/                 # Bun + Elysia Backend Service
│   ├── src/
│   │   ├── routes/        # API Routes (v1)
│   │   ├── db/            # Database Schema (Drizzle)
│   │   ├── middleware/    # Middleware (Auth, Access Control)
│   │   └── services/      # Business Logic
│   └── ...
├── docs/                   # Detailed Project Documentation
│   ├── USER_MANUAL.md     # User Manual
│   ├── API_REFERENCE.md   # API Reference
│   └── DEPLOYMENT.md      # Deployment Guide
└── README.md               # Project Readme
```

---

## ⚡ Quick Start

### Prerequisites
- **Node.js**: v18+
- **Bun**: v1.0+ ([Installation Guide](https://bun.sh/docs/installation))

### 1. Start Server

```bash
cd server

# Install dependencies
bun install

# Initialize database (Generate SQLite file)
bun run db:push 
# Or if using migrations: bun run db:migrate

# Seed data (Optional, for testing)
bun run db:seed

# Start development server
bun run dev
```
> Server runs at `http://localhost:3000` by default.

### 2. Start Client

```bash
cd client

# Install dependencies
npm install

# Start development server
npm run dev
```
> Client runs at `http://localhost:5173` by default.

---

## 🧩 Features

### 👨‍🎓 Student Portal
- **My Class**: View class info, download course materials.
- **Team Lobby**: Create teams, search for teams, apply to join.
- **Project Workspace**: Submit proposals, upload stage assignments, view reviews.
- **Peer Review Center**: Anonymously grade team members during specific windows.

### 👩‍🏫 Teacher Portal
- **Class Management**: Import student lists, set class rules.
- **Approval Center**: Review project proposals, handle special requests.
- **Progress Monitoring**: View submissions, control project stage transitions (unlock/rollback).
- **Grade Management**: Online grading, view/veto peer reviews, export transcripts.

### 🔧 Admin Portal
- **User Management**: Create teacher accounts, reset user passwords.
- **System Config**: Global parameter settings.

---

## 📖 Documentation

For more details, please refer to the `docs/` directory:

- [Requirements Specification](./docs/REQUIRE.md)
- [User Manual](./docs/USER_MANUAL.md)
- [API Reference](./docs/API_REFERENCE.md)
- [Testing Guide](./docs/TESTING.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
