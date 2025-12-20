# lib（项目内工具函数）

这是项目自用的 `lib/` 目录（不是要发布/编译成独立 npm 包的库），用于放置通用的小工具。

## 目录
- crypto：哈希、随机 ID、时序安全比较
- token：Bearer Token 解析/规范化
- password：密码哈希/验证（scrypt，无额外依赖）
- jwt：最小 HS256 JWT 签名/验签
- csrf：按 ROUTES.md 规则校验 `x-csrf-token=sha256(bearer)`
- http-error：统一的 HttpError 与序列化
- error-mapper：把 SQLite trigger/JWT 等底层错误映射为 HttpError，并提供 ROUTES.md 的 error envelope
- logger：JSON 结构化日志（安全 stringify，Error 归一化）
- time：时间工具（ISO、ms、sleep）
- err-monitor：内存错误环形缓冲（用于 debug / 运维排障）
- stages：阶段 key/status 常量与顺序工具
- file-storage：文件存储名/sha256 计算（满足“UUID/Timestamp 重命名”）
- guards：API 层硬规则 guard（Archived 班级只读、锁定团队不可变更等）
- soft-delete：Drizzle 查询用的软删除条件小工具（`deleted_at IS NULL`）

## 使用
```ts
import { httpError, toHttpError, logInfo, createLogger } from './lib';
```
