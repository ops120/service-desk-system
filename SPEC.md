# 通用报修系统 - 产品规格说明书

## 1. 产品概述

### 1.1 产品简介
通用报修系统是一款面向住宅小区/写字楼的物业报修管理平台，支持业主通过手机拍照快速提交报修、实时查询维修状态、确认完工，以及物业在线管理报修单、上传完工照片、更新处理状态。

### 1.2 目标用户
| 用户角色 | 说明 |
|---------|------|
| 业主 (owner) | 住宅或写字楼单元的住户/使用者 |
| 物业管理员 (manager) | 负责维修管理的物业工作人员 |

### 1.3 核心价值
- **业主端**：手机拍照快速提交，实时掌握维修进度，确认完工更安心
- **物业端**：集中处理报修单，在线上传完工照片，工作高效可追溯

---

## 2. 功能规格

### 2.1 业主端功能

#### 2.1.1 用户注册
- 输入项：用户名、密码、确认密码、姓名（选填）、房号（必填）、手机号（选填）
- 密码最小长度：6位
- 角色固定为 `owner`
- 注册成功后跳转至登录页

#### 2.1.2 用户登录
- 输入项：用户名、密码
- 支持 Tab 切换：业主登录 / 物业登录
- 登录成功保存 JWT Token，有效期 7 天
- 自动跳转：业主跳转 `owner.html`，物业跳转 `manager.html`

#### 2.1.3 提交报修
- 必填项：房号、故障位置
- 选填项：故障描述（文本域）
- 故障照片：最多 5 张，支持拍照或相册选择，仅图片格式
- 照片上传流程：选择照片 → 上传至服务器 → 返回路径 → 提交报修时附带照片信息
- 提交成功后跳转至报修列表页

#### 2.1.4 查询报修列表
- 展示当前业主提交的所有报修单
- 支持按状态筛选：全部 / 待处理 / 处理中 / 已完成
- 卡片显示：故障位置、房号、状态标签、提交时间、故障照片缩略图（最多 3 张）
- 点击卡片跳转至报修详情页

#### 2.1.5 查询报修详情
- 展示内容：
  - 状态标签（大字彩色背景头部）
  - 房号、提交时间
  - 故障位置、故障描述
  - 故障照片（点击放大）
  - 完工照片（物业上传后显示）
  - 处理进度时间线（状态、备注、操作人、时间）
- 确认完工按钮：当状态为 `已完成` 时显示

#### 2.1.6 确认完工
- 仅当物业将状态更新为 `已完成` 后，业主方可确认
- 确认后状态变更为 `已确认`
- 记录操作历史

### 2.2 物业端功能

#### 2.2.1 用户登录
- 使用物业管理员账号登录（默认账号：`admin` / `admin123`）
- 登录流程同业主登录

#### 2.2.2 物业首页
- 统计数据卡片：待处理数量、处理中数量、已完成数量、已确认数量
- 快捷入口：查看所有报修单
- 最新待处理列表（最多显示 5 条）

#### 2.2.3 查看报修列表
- 展示所有业主提交的报修单（含业主姓名）
- 支持按状态筛选：全部 / 待处理 / 处理中 / 已完成 / 已确认
- 卡片显示：故障位置、业主姓名+房号、状态标签、提交时间
- 点击卡片跳转至报修处理页

#### 2.2.4 处理报修（报修详情页）
- 展示内容：
  - 业主信息（姓名、房号）
  - 故障位置、故障描述、提交时间
  - 故障照片（点击放大）
  - 完工照片（已上传时显示）
  - 处理进度时间线
- 状态更新：
  - 可选状态：待处理 / 处理中 / 已完成
  - 可填写备注说明
  - 更新后记录操作历史
- 上传完工照片：
  - 支持选择多张照片
  - 上传成功后自动将状态更新为 `已完成`
  - 记录操作历史
- 当状态为 `已确认` 时，隐藏操作区域

### 2.3 状态流转设计

| 状态值 | 中文标签 | 颜色代码 | 说明 |
|--------|----------|----------|------|
| `pending` | 待处理 | #fa8c16 (橙色) | 业主提交，等待物业接单 |
| `processing` | 处理中 | #1890ff (蓝色) | 物业已开始处理 |
| `completed` | 已完成 | #52c41a (绿色) | 物业上传完工照片 |
| `confirmed` | 已确认 | #8bc34a (浅绿) | 业主确认维修完成 |

**流转规则：**
```
业主提交 → pending（待处理）
物业接单 → processing（处理中）
物业上传完工照 → completed（已完成）
业主确认 → confirmed（已确认）
```

---

## 3. UI/UX 规格

### 3.1 页面清单

| 页面文件 | 页面名称 | 访问角色 |
|---------|----------|----------|
| `index.html` | 登录/注册页 | 公共 |
| `owner_register.html` | 业主注册页 | 公共 |
| `owner.html` | 业主首页 | 业主 |
| `owner_repair.html` | 提交报修页 | 业主 |
| `owner_list.html` | 我的报修列表 | 业主 |
| `owner_detail.html` | 报修详情页 | 业主 |
| `manager.html` | 物业首页 | 物业 |
| `manager_list.html` | 报修管理列表 | 物业 |
| `manager_detail.html` | 报修处理页 | 物业 |

### 3.2 页面布局

#### 顶部导航栏（Header）
- 背景色：`#1890ff`（主色）
- 文字颜色：`#fff`
- 标题文字：18px，居中显示
- 返回按钮（如有上级页面）：绝对定位左侧，16px

#### 页面容器（Container）
- 最大宽度：750px
- 内边距：0 16px
- 外边距：0 auto（居中）

#### 内容卡片（Card）
- 背景色：`#fff`
- 圆角：8px
- 内边距：16px
- 外边距：底部 12px
- 阴影：`0 2px 8px rgba(0,0,0,0.1)`

#### 底部导航（Bottom Nav）
- 固定定位：bottom 0
- 最多 3 个菜单项
- 图标 + 文字垂直排列

### 3.3 色彩规格

| 用途 | 颜色代码 | 说明 |
|------|----------|------|
| 主色 | `#1890ff` | 按钮、链接、顶部导航 |
| 成功色 | `#52c41a` | 完成状态 |
| 警告色 | `#faad14` | 警告提示 |
| 错误色 | `#ff4d4f` | 错误提示、必填标记 |
| 文字主色 | `#333` | 主要文字 |
| 文字副色 | `#666` | 次要文字 |
| 边框色 | `#e8e8e8` | 边框、分割线 |
| 背景色 | `#f5f5f5` | 页面背景 |

### 3.4 状态标签样式

| 状态 | 背景色 | 文字色 |
|------|--------|--------|
| 待处理 | `#fff7e6` | `#fa8c16` |
| 处理中 | `#e6f7ff` | `#1890ff` |
| 已完成 | `#f6ffed` | `#52c41a` |
| 已确认 | `#d9f7be` | `#389e0d` |

### 3.5 表单规格

| 元素 | 样式规格 |
|------|----------|
| 输入框 | 高度 40px，内边距 10px 12px，边框 1px #e8e8e8，圆角 4px，聚焦时边框变为主色 |
| 文本域 | 最小高度 100px，可调整高度 |
| 按钮 | 高度 44px（移动端），圆角 4px |

### 3.6 照片上传/展示

| 用途 | 样式规格 |
|------|----------|
| 上传区域 | 虚线边框，圆角 8px，居中图标+文字 |
| 预览小图 | 80x80px，圆角 4px，右上角删除按钮 |
| 详情展示 | 三列网格，宽高相等，点击可放大 |

### 3.7 时间线样式

- 垂直时间线，左侧点状节点
- 当前节点（最后一条）：绿色圆点
- 历史节点：蓝色圆点
- 连接线：灰色 2px

### 3.8 响应式断点

| 设备 | 最大宽度 | 布局调整 |
|------|----------|----------|
| 手机 | 480px | 单列，12px 内边距 |
| 平板/桌面 | >480px | 最大宽度 750px 居中 |

---

## 4. 数据规格

### 4.1 数据库表结构

#### users 用户表
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 用户ID |
| username | TEXT | UNIQUE NOT NULL | 用户名 |
| password | TEXT | NOT NULL | bcrypt 加密的密码 |
| role | TEXT | NOT NULL, CHECK IN ('owner','manager') | 角色 |
| unit_number | TEXT | - | 房号 |
| name | TEXT | - | 姓名 |
| phone | TEXT | - | 手机号 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

#### repair_orders 报修单表
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 报修单ID |
| owner_id | INTEGER | NOT NULL, FK(users.id) | 业主ID |
| unit_number | TEXT | NOT NULL | 房号 |
| fault_location | TEXT | NOT NULL | 故障位置 |
| fault_description | TEXT | - | 故障描述 |
| fault_photos | TEXT | DEFAULT '[]' | 故障照片JSON数组 |
| status | TEXT | DEFAULT 'pending' | 状态 |
| completion_photos | TEXT | DEFAULT '[]' | 完工照片JSON数组 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

#### status_history 状态历史表
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 记录ID |
| repair_order_id | INTEGER | NOT NULL, FK(repair_orders.id) | 报修单ID |
| status | TEXT | NOT NULL | 状态值 |
| note | TEXT | - | 备注说明 |
| operator_id | INTEGER | FK(users.id) | 操作人ID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 操作时间 |

### 4.2 照片数据结构

照片以 JSON 数组形式存储，单个照片对象结构：
```json
{
  "filename": "1704067200123-839274581.jpg",
  "path": "/uploads/1704067200123-839274581.jpg",
  "uploaded_at": "2024-01-01T10:00:00.000Z"
}
```

### 4.3 默认数据

默认物业管理员账号：
- 用户名：`admin`
- 密码：`admin123`

---

## 5. API 接口规格

### 5.1 认证接口

#### POST /api/auth/register - 用户注册
**请求：**
```json
{
  "username": "string",
  "password": "string",
  "role": "owner",
  "name": "string",
  "unit_number": "string",
  "phone": "string"
}
```
**响应：**
```json
{
  "success": true,
  "message": "注册成功",
  "user": { "id": 1, "username": "...", "role": "owner" }
}
```

#### POST /api/auth/login - 用户登录
**请求：**
```json
{
  "username": "string",
  "password": "string"
}
```
**响应：**
```json
{
  "success": true,
  "token": "jwt_token_string",
  "user": {
    "id": 1,
    "username": "...",
    "role": "owner|manager",
    "name": "...",
    "unit_number": "..."
  }
}
```

#### GET /api/auth/me - 获取当前用户信息
**Headers：** `Authorization: Bearer <token>`
**响应：**
```json
{
  "id": 1,
  "username": "...",
  "role": "owner",
  "name": "...",
  "unit_number": "...",
  "phone": "..."
}
```

### 5.2 业主接口

#### POST /api/repairs - 提交报修
**Headers：** `Authorization: Bearer <token>`
**请求：**
```json
{
  "unit_number": "1栋101",
  "fault_location": "厨房",
  "fault_description": "水龙头漏水",
  "fault_photos": [...]
}
```
**响应：**
```json
{ "success": true, "message": "报修提交成功", "id": 1 }
```

#### GET /api/repairs - 查询报修列表
**Headers：** `Authorization: Bearer <token>`
**响应：** 数组，业主返回自己的报修单，物业返回所有报修单

#### GET /api/repairs/:id - 查询报修详情
**Headers：** `Authorization: Bearer <token>`
**响应：**
```json
{
  "id": 1,
  "owner_id": 1,
  "unit_number": "1栋101",
  "fault_location": "厨房",
  "fault_description": "水龙头漏水",
  "fault_photos": [...],
  "status": "completed",
  "completion_photos": [...],
  "owner_name": "张三",
  "owner_phone": "13800138000",
  "created_at": "2024-01-01 10:00:00",
  "updated_at": "2024-01-01 12:00:00",
  "history": [
    { "id": 1, "status": "pending", "note": "提交报修", "operator_name": "张三", "created_at": "2024-01-01 10:00:00" },
    { "id": 2, "status": "completed", "note": "上传完工照片", "operator_name": "系统管理员", "created_at": "2024-01-01 12:00:00" }
  ]
}
```

#### POST /api/repairs/:id/confirm - 业主确认完工
**Headers：** `Authorization: Bearer <token>`
**前置条件：** 状态必须为 `completed`
**响应：**
```json
{ "success": true, "message": "已确认完工，感谢您的反馈！" }
```

#### POST /api/repairs/upload-fault-photos - 上传故障照片
**Headers：** `Authorization: Bearer <token>`
**Body：** `FormData` (field: `photos[]`，最多 5 个文件)
**响应：**
```json
{
  "success": true,
  "photos": [
    { "filename": "xxx.jpg", "path": "/uploads/xxx.jpg", "uploaded_at": "..." }
  ]
}
```

### 5.3 物业接口

#### PATCH /api/repairs/:id/status - 更新报修状态
**Headers：** `Authorization: Bearer <token>`
**请求：**
```json
{
  "status": "processing|completed",
  "note": "备注信息"
}
```
**响应：**
```json
{ "success": true, "message": "状态已更新" }
```

#### POST /api/repairs/:id/completion-photos - 上传完工照片
**Headers：** `Authorization: Bearer <token>`
**Body：** `FormData` (field: `photos[]`，最多 5 个文件)
**响应：**
```json
{
  "success": true,
  "message": "完工照片上传成功",
  "photos": [...]
}
```
**副作用：** 自动将状态更新为 `completed`

### 5.4 字典接口

#### GET /api/dict/status - 获取状态字典
**响应：**
```json
{
  "pending": { "label": "待处理", "color": "#ff9800" },
  "processing": { "label": "处理中", "color": "#2196f3" },
  "completed": { "label": "已完成", "color": "#4caf50" },
  "confirmed": { "label": "已确认", "color": "#8bc34a" }
}
```

---

## 6. 技术架构

### 6.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML5 + CSS3 + JavaScript | 移动优先响应式设计 |
| 后端 | Node.js + Express | REST API |
| 数据库 | SQLite (sql.js) | 单文件数据库 |
| 文件存储 | 本地文件系统 | `/uploads` 目录 |
| 密码加密 | bcryptjs | 加盐哈希（cost factor 10） |
| 认证 | JWT (jsonwebtoken) | HS256 签名，7 天有效期 |
| 图形验证码 | svg-captcha | SVG 数学题（2-3 位数运算） |
| 限流/锁定 | 内存 Map | 账号 5 次错误锁定 5 分钟 |
| 环境变量 | dotenv | JWT_SECRET 从 `.env` 读取 |
| 审计日志 | 文件存储 | `backend/logs/audit.log` |

### 6.2 项目结构

```
通用报修系统/
├── backend/
│   ├── server.js          # Express 服务器与路由
│   ├── database.js        # SQLite 数据库初始化、审计日志
│   ├── package.json       # 依赖配置
│   ├── .env              # 环境变量（JWT_SECRET，不上传）
│   ├── repair.db         # SQLite 数据库文件
│   ├── uploads/          # 上传文件存储
│   └── logs/
│       └── audit.log     # 审计日志
├── frontend/
│   ├── index.html         # 登录/注册页（3Tab：业主/物业/管理员）
│   ├── owner_register.html # 业主注册页
│   ├── owner.html         # 业主首页（看板+统计）
│   ├── owner_repair.html  # 提交报修页
│   ├── owner_list.html    # 业主报修列表（6状态筛选）
│   ├── owner_detail.html  # 报修详情（业主视图）
│   ├── manager.html       # 物业首页（看板+统计）
│   ├── manager_list.html  # 报修管理列表
│   ├── manager_detail.html # 报修处理页（物业视图）
│   ├── admin_users.html   # 管理员后台（用户审核/报修统计）
│   ├── change_password.html # 修改密码
│   ├── css/
│   │   └── style.css      # 全局样式
│   └── js/
│       └── app.js         # 前端 JavaScript
├── docs/
│   ├── SYSTEM_DESIGN.md   # 系统设计文档
│   └── SECURITY_REPORT.md # 安全评估报告
├── .gitignore             # Git 忽略规则
├── start.bat              # 启动脚本
├── SPEC.md                # 本规格说明书
└── backup_*/            # 代码备份（不上传）
```

### 6.3 安全机制

| 机制 | 说明 |
|------|------|
| 密码加密 | bcryptjs 加盐哈希（cost factor 10），不可逆 |
| JWT 认证 | HS256 签名，防伪造，7 天有效期 |
| JWT_SECRET | 必须从 `.env` 环境变量读取，无则拒绝启动 |
| 图形验证码 | SVG 数学题（2-3 位数运算），5 分钟有效 |
| 账号锁定 | 密码连续错误 5 次锁定 5 分钟 |
| 审计日志 | 14 种事件全覆盖，写入 `backend/logs/audit.log` |
| 文件上传限制 | 仅图片格式 (jpeg/jpg/png/gif/webp)，单文件最大 10MB |
| 权限控制 | 物业可访问所有报修，业主仅可访问自己的报修 |

---

## 7. 部署规格

### 7.1 环境要求

- Node.js >= 16.x
- npm >= 8.x

### 7.2 启动步骤

```bash
cd backend
npm install
npm start
```

> **注意**：首次启动会自动生成 JWT_SECRET 到 `.env` 文件，请勿删除或泄露此文件。

### 7.3 快速启动（Windows）

双击运行 `start.bat`，自动管理 JWT_SECRET 并启动服务。

### 7.3 访问地址

| 服务 | 地址 |
|------|------|
| 后端 API | http://localhost:3000 |
| 前端页面 | 浏览器直接打开 `frontend/*.html` |

### 7.4 默认账号

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| 管理员 | admin | admin123 | 首次登录后建议立即修改密码 |

---

## 8. 后续扩展建议

1. **云存储**：将 `uploads` 迁移至阿里云 OSS 或腾讯云 COS
2. **消息通知**：集成微信模板消息，状态变更时通知业主
3. **统计分析**：物业端增加报修统计图表（按类型、按楼栋等）
4. **多小区支持**：增加小区表，支持多小区管理
5. **评分系统**：业主确认后可对维修服务评分
6. **数据导出**：支持导出 Excel 格式的报修记录
7. **批量操作**：物业批量更新多条报修单状态
8. **照片压缩**：前端上传前压缩照片，减少流量和存储
