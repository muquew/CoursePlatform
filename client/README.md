# Course Platform Client

A modern, responsive, and internationalized frontend for the Course Management Platform.

## Features

- **Role-Based Access Control**: Distinct interfaces for Students, Teachers, and Admins.
- **Internationalization**: Full support for English and Simplified Chinese.
- **Course Management**: View courses, manage classes (Teacher), and enrollments (Student).
- **Assignments & Grading**: File uploads, version history, grading with feedback.
- **Project Workspace**: Team formation, stage management (Proposal -> Final), and peer reviews.
- **Admin Dashboard**: Audit logs, system health monitoring, and dynamic ABAC rules.
- **Authentication**: Secure JWT-based login with auto-logout on expiration.

## Setup & Run

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

3. **Build for Production**
   ```bash
   npm run build
   ```

## Configuration

- `.env`: Configure the API base URL.
  ```
  VITE_API_BASE=http://localhost:3000/api/v1
  ```

## Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architectural documentation.
