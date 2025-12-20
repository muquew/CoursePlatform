# Frontend Architecture

This document describes the architecture of the Client Application for the Course Management Platform.

## Technology Stack

- **Framework**: Vue 3 (Composition API)
- **Language**: TypeScript
- **Build Tool**: Vite
- **UI Library**: Element Plus
- **State Management**: Pinia
- **Routing**: Vue Router
- **Internationalization**: vue-i18n
- **HTTP Client**: Axios

## Directory Structure

```
src/
├── components/        # Reusable UI components (LanguageSwitcher, etc.)
├── locales/           # i18n translation files (en.ts, zh.ts)
├── router/            # Route definitions and guards
├── services/          # API service layer (auth, user, course, etc.)
├── stores/            # Pinia stores for global state (user session)
├── types/             # TypeScript interfaces mirroring server models
├── utils/             # Helper functions (request interceptors)
├── views/             # Page components
│   ├── admin/         # Admin-specific views
│   ├── auth/          # Authentication views (Login)
│   ├── common/        # Shared views (404)
│   ├── layouts/       # Layout wrappers (MainLayout, AuthLayout)
│   ├── student/       # Student-specific views
│   └── teacher/       # Teacher-specific views
├── App.vue            # Root component
└── main.ts            # Application entry point
```

## Key Architectural Decisions

### 1. Service Layer Pattern
All API communication is abstracted into `src/services/`. Components should never make raw HTTP requests. This allows for:
- Centralized error handling.
- Easy mocking for tests.
- Type-safe API responses.

### 2. Role-Based Routing
The router uses a `role` based guard system.
- Users are redirected to their specific dashboard (`/student`, `/teacher`, `/admin`) upon login.
- Navigation guards prevent unauthorized access to role-specific routes.

### 3. Internationalization (i18n)
- All user-facing text is extracted to `src/locales/`.
- Keys are organized by domain (`auth`, `nav`, `course`, etc.).
- Language preference is persisted in `localStorage`.

### 4. Layout System
- `AuthLayout`: For public pages like Login.
- `MainLayout`: A responsive layout with a Sidebar and Header.
- Role-specific layouts (`StudentLayout`, etc.) wrap `MainLayout` and provide role-specific menu items.

## State Management
We use **Pinia** for global state.
- `userStore`: Manages the JWT token, user profile, and active settings. It persists critical data to `localStorage` to survive page reloads.

## Development Guidelines
- Use the **Composition API** (`<script setup>`).
- Use **Element Plus** components for UI consistency.
- Always define types in `src/types/` for data models.
