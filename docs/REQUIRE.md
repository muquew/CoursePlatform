---

# 软件工程案例实践课程管理平台

## 需求规格说明书

---

## 0. 技术架构 (Technical Stack)

- **运行时**：Bun
    
- **后端**：ElysiaJS
    
- **数据库**：SQLite
    
- **ORM**：Drizzle ORM
    
- **前端**：Vue.js
    


---

## 1. 用户与账号体系 (User & Account)

### 1.1 账号生成

- **禁止注册**：系统关闭所有公开注册入口。
    
- **教师账号创建**：教师账号仅由**管理员在后台创建**。
    
- **学生账号导入**：
    
    - 仅支持教师通过 Excel / CSV 模板批量导入学生名单（学号、姓名）。
        
    - 系统在导入时自动创建学生账号：
        
        - 默认账号：学号
            
        - 默认密码：系统预设初始密码
            
    - 自动建立学生与班级的关联关系。
        
- **首次登录强制改密**：学生首次登录系统时，必须修改默认密码后方可继续使用。
    

---

### 1.2 账号维护

- **密码重置**：教师拥有“重置密码”权限，可将指定学生密码重置为系统默认值。
    
- **角色权限模型**：
    
    - **管理员 (Admin)**：
        
        - 教师账号管理
            
        - 系统全局配置
            
    - **教师 (Teacher)**：
        
        - 管理其创建的班级
            
        - 审核项目立项
            
        - 阶段控制、评分、互评裁决
            
    - **学生 (Student)**：
        
        - 仅可访问所属班级资源
            
        - 组队、提交作业、参与互评
            

---

## 2. 班级管理 (Class Management)

### 2.1 班级容器

- 教师可创建班级，包含：
    
    - 课程名称
        
    - 学期信息
        
    - 班级配置（如团队人数限制等）
        


- **多教师支持（与实现保持一致）**：班级与教师为多对多关系，使用 `class_teachers` 关联表，`role ∈ { owner, teacher, assistant }`。
---

### 2.2 数据隔离

- 学生登录后，仅可看到其被导入的班级。
    
- 禁止跨班级访问任何数据（包括通过 URL / ID 方式）。
    

---

### 2.3 名单调整

- 教师可：
    
    - 移除学生（退课）
        
    - 追加导入或手动添加学生（插班）
        

---

### 2.4 班级生命周期（Lifecycle）

- **状态字段**：`classes.status ∈ { Active, Archived }`
    
- **结课归档规则**：
    
    - 当班级状态为 `Archived`（已结课）时：
        
        - **禁止所有写操作**：
            
            - 名单调整
                
            - 组队变更
                
            - 项目立项审核
                
            - 阶段流转 / 回滚
                
            - 作业提交
                
            - 评分与互评
                
        - **仅允许只读访问**：查看历史项目、作业与成绩。
            
        - **附件下载策略**：结课后是否允许学生下载历史附件由教师配置；若未配置，默认允许只读查看与下载其所属班级内资源。

---

## 3. 团队管理 (Team Management)

### 3.1 组建规则

- **自由组队**：同一班级内学生可自由创建或加入团队。
    
- **人数限制**：系统根据班级配置校验团队人数（如 3–6 人）。
    
- **兜底机制**：
    
    - 教师可查看“未组队学生”列表。
        
    - 教师拥有强制指派权限：
        
        - 指派至已有团队
            
        - 强制创建新团队
            

---

### 3.2 团队锁定（核心规则）

- **立项即锁定**：当团队项目立项申请被教师审核通过（项目状态变为 `Active`）：
    
    - 团队成员名单立即被系统锁定。
        
- **锁定后禁止操作**：
    
    - 学生无法退出团队
        
    - 无法移除成员
        
    - 无法邀请新成员
        
- **强制变更**：
    
    - 如遇不可抗力（退学等），仅教师可在后台进行强制成员调整。
        
    - 所有强制变更必须记录审计日志。
        
- **数据库状态同步**：
    - 项目立项审核通过后，`teams.status` 置为 `locked`，同时写入 `is_locked=1` 与 `locked_at` 时间戳，用于后续权限校验与审计。
    
---

### 3.3 团队治理

- **队长制**：
    
    - 队长拥有以下独占权限：
        
        - 项目立项申请
            
        - 团队成果提交
            
        - 阶段作业提交
            
- **队长变更**：
    
    - 队长可主动转让职位。
        
    - 教师可强制撤换队长或解散违规团队。
        

---

## 4. 项目管理 (Project Lifecycle)

### 4.1 选题与立项

- **双轨模式**：
    
    - **案例库选题**：从教师发布的标准案例中选择。
        
    - **自命题项目**：团队提交项目名称、背景说明与技术栈。
        
- **审核流程**：
    
    - 所有立项必须经教师审核。
        
    - 通过后：
        
        - 项目状态设为 `Active`
            
        - 团队成员锁定
            
        - 第一阶段自动解锁
            


**项目状态（与实现一致）**：
- `draft`：草稿（队长可修改）
- `submitted`：已提交待审核（队长不可再改，仅可撤回/重提可作为扩展）
- `active`：审核通过（触发团队锁定 + 第一阶段解锁）
- `rejected`：审核驳回（保留数据，允许回到 draft 重新提交）

---

### 4.2 阶段流转 (Stage Workflow)

- **标准阶段**：  
    需求分析 → 概要设计 → 详细设计 → 软件测试 → 交付验收
    
- **阶段状态**：  
    `Locked` / `Open` / `Passed`
    
- **门禁机制 (Gatekeeping)**：
    
    - 当前阶段状态为 `Passed` 时，下一阶段自动解锁。
        
- **回滚机制 (Rollback)**：
    
    - 教师或管理员可将项目阶段回滚至任意前序阶段。
        
    - 回滚仅重置阶段状态：
        
        - **不删除任何已提交数据**
            
        - 已有作业、版本与评分全部保留
            

---

## 5. 作业与版本控制 (Assignment & Versioning)

### 5.1 提交逻辑

- **作业类型**：
    
    - **个人作业**：所有成员均可提交
        
    - **团队成果**：仅队长可提交
        
- **阶段绑定规则**：
    
    - 作业必须绑定某一项目阶段（`submission.stage_id` 必填）。
        
- **截止时间**：
    
    - 超过 Deadline 仍允许提交
        
    - 系统自动标记为 **[LATE]**
        

---

### 5.2 版本控制

- 系统保留所有提交历史版本（V1, V2, …）。
    
- 前端默认展示最新版本。
    
- 提供“查看历史版本”功能，防止误覆盖。
    

---

### 5.3 文件存储策略

- **强制重命名**：
    
    - 后端接收文件后，必须使用 `UUID` 或 `Timestamp` 重命名。
        
    - 禁止使用用户原始文件名作为物理存储名。
        
- **映射记录**：
    
    - 数据库需保存：
        
        - `original_name`（下载展示）
            
        - `storage_path`（物理路径）
            

---

## 6. 评价与成绩体系 (Assessment)

### 6.1 多维评分

- **教师评分**：针对每个阶段的团队成果进行评分。
    
- **成绩构成公式**：  
    `总成绩 = (团队分 × 互评系数) + 个人作业分`
    

---

### 6.2 组内互评机制 (Peer Review)

- **双盲原则**：
    
    - 评分阶段互不可见
        
    - 公示时仅展示最终互评系数
        
- **延时公布**：
    
    - 互评数据在教师发布成绩前处于封存状态
        
- **教师裁决权 (Veto)**：
    
    - 教师可选择是否采用互评结果
        
    - 若发现恶意评分，可忽略该组互评，强制系数为 1
        
- **互评算法说明**：
	
	- 互评系数计算方式由教师线下制定或由课程规则确定
		
	- 本系统负责互评数据存储、系数应用与教师裁决，不强制限定具体算法
		


**互评窗口（与实现一致）**：互评按班级 + 阶段开启窗口 `peer_review_windows`，状态流转：`draft → open → sealed → published`。
- `sealed`：关闭后封存（学生互评不可再提交/修改）
- `published`：教师发布后，学生端才允许查看（满足“延时公布”）
- 教师裁决（veto/adopt）与可选的强制系数写入 `peer_review_adoptions`；互评系数可缓存到 `peer_review_coefficients`（算法不限定）。
---

## 7. 数据安全与交互规范 (Data & UX)

### 7.1 软删除 (Soft Deletes)

- 所有核心业务表必须包含 `deleted_at` 字段。
    
- 删除操作仅标记时间戳，查询默认过滤已删除数据。
    

---
### 7.2 交互防护

**二次确认**：敏感操作（解散团队、踢人、驳回立项、删除作业等）必须弹出二次确认 Modal。

---

### 7.3 操作日志 (Audit Log)

- **强制全量记录**：所有关键业务操作必须记录审计日志，包括：
    
    - 操作者（who）、操作时间（when）、操作对象（what）、变更内容（before/after）、来源信息（IP/User-Agent）
        
- **日志不可篡改（补充）**：审计日志为系统内部只读数据，不允许任何角色修改或删除。
        

---

### 7.4 站内通知 (In-app Notifications)

- 系统提供站内通知机制，至少覆盖：
    
    - 立项审核结果
        
    - 阶段解锁 / 回滚
        
    - 作业评分结果
        
    - 互评开启与成绩发布
        
    - 教师强制操作提示
        
- 通知需支持已读 / 未读状态。
    

---

### 7.5 权限与安全边界

- **后端强校验**：
    
    - 所有权限校验必须在后端完成。
        
    - 前端仅作为交互提示，不作为安全边界。
        
- **数据隔离强制**：
    
    - 后端接口必须基于身份与班级归属进行硬隔离。
        

---

## 8. 核心数据实体预览 (Core Entities)

|实体|关键职责|特殊字段/备注|
|---|---|---|
|`users`|账号基础（用户名/密码/角色上限）|`role`, `must_change_password`, `deleted_at`|
|`student_profiles`|学生档案（学号/姓名）|`student_no` 唯一；导入时创建|
|`teacher_profiles`|教师档案（工号/姓名）|`teacher_no` 可选；由管理员维护|
|`admin_profiles`|管理员档案|`admin_level`|
|`classes`|班级容器|`status ∈ {active, archived}`, `config_json`, `allow_student_download_after_archived`|
|`class_teachers`|班级-教师关联（多教师）|`role ∈ {owner, teacher, assistant}`|
|`class_students`|班级-学生名单/退课|`is_active`, `joined_at`, `left_at`|
|`user_settings`|用户偏好/上下文（如当前激活班级）|`active_class_id` 可空|
|`teams`|团队元数据|`status ∈ {recruiting, locked}`, `is_locked`, `locked_at`|
|`team_members`|团队成员关联|冗余 `class_id` 用于强隔离与性能校验|
|`team_join_requests`|入队申请/审批|`status ∈ {pending, approved, rejected, cancelled}`|
|`case_library`|案例库（可选）|班级内发布的标准案例|
|`projects`|项目元数据|`source_type`, `status ∈ {draft, submitted, active, rejected}`|
|`project_stages`|阶段控制|`key ∈ {requirements, high_level_design, detailed_design, software_testing, acceptance}`, `status`|
|`assignments`|作业定义（班级维度）|`stage_key`（必须绑定阶段）, `type ∈ {individual, team}`|
|`submissions`|作业提交（含版本）|`stage_id`, `version`, `is_late`|
|`files`|文件元数据/映射|`original_name`, `storage_path`, `sha256`, `size`|
|`submission_files`|提交-文件多对多|支持一个 submission 多文件|
|`grades`|评分（按 submission）|主键 `submission_id`，含 `rubric_json`|
|`peer_review_windows`|互评窗口（按班级+阶段）|`status ∈ {draft, open, sealed, published}`|
|`peer_reviews`|互评记录|`payload_json`|
|`peer_review_coefficients`|互评系数缓存（可选）|用于加速成绩计算/展示|
|`peer_review_adoptions`|教师裁决（采用/强制系数）|`adopted`, `forced_coefficient`|
|`audit_logs`|操作审计（不可篡改）|append-only；含 before/after|
|`notifications`|站内通知|`read_at`|
|`abac_rules`|ABAC 开关/规则（可选）|按 key 启用/禁用|

