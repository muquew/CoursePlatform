import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts", // 告诉工具表结构在哪
  dialect: "sqlite",            // 告诉工具我们用 SQLite
  dbCredentials: {
    url: "file:sqlite.db",      // 数据库文件名
  },
});