# 通用报修系统

面向住宅小区/写字楼的物业报修管理平台，支持业主提交报修、物业处理、状态流转、完工确认。

---

## 快速开始

```bash
# 启动后端（Node.js >= 16）
cd backend
node server.js

# 浏览器访问
http://localhost:3000
```

---

## 账号体系

| 角色 | 权限 |
|------|------|
| **admin** | 审核用户、管理报修统计、查看审计日志 |
| **manager** | 处理报修、上传完工照、管理报修 |
| **owner** | 提交报修、确认完工、打回重做、取消报修 |

> ⚠️ 首次部署后请立即修改管理员默认密码

---

## 项目结构

```
通用报修系统/
├── backend/
│   ├── server.js        # Express 路由与中间件
│   ├── database.js      # SQLite 数据库、审计日志
│   ├── .env             # JWT_SECRET（禁止提交）
│   ├── repair.db        # SQLite 数据库文件（禁止提交）
│   ├── logs/            # 审计日志（禁止提交）
│   └── uploads/         # 上传文件（禁止提交）
├── frontend/
│   ├── index.html        # 登录/注册页
│   ├── owner*.html       # 业主端页面
│   ├── manager*.html     # 物业端页面
│   ├── admin_users.html  # 管理员后台
│   ├── js/app.js        # 前端 API 封装
│   └── css/style.css
├── docs/                 # 项目文档
└── README.md
```

---

## 报修状态流转

```
pending（待处理）
    ↓ 物业接单
processing（处理中）
    ↓ 物业上传完工照片
completed（已完成）
    ↓ 业主确认
confirmed（已确认）

取消：pending / processing → cancelled（业主取消）
打回：completed / confirmed → processing（业主打回重做）
```

---

## 安全特性

| 特性 | 说明 |
|------|------|
| 密码加密 | bcryptjs 加盐哈希（salt rounds = 10） |
| JWT 认证 | HS256 签名，密钥从 `.env` 读取，启动时校验 |
| 图形验证码 | SVG 数学题（2-3 位运算）防暴力破解 |
| 登录限流 | 5 次/分钟（超出触发账号锁定） |
| 账号锁定 | 连续 5 次密码错误锁定 5 分钟 |
| CSRF 防护 | 双重 Cookie 验证（httpOnly + 前端可读 Token） |
| XSS 防护 | 所有用户数据 HTML 转义后渲染 |
| 审计日志 | 14 种事件全覆盖，写入 `backend/logs/audit.log` |
| 安全头 | Helmet 中间件（11 项 HTTP 安全头） |
| 文件上传 | 仅图片格式（jpeg/png/gif/webp），单文件最大 10MB |

> ⚠️ 生产环境请务必设置 `JWT_SECRET` 环境变量并限制 CORS 来源

---

## 常见问题

**Q: 业主注册后无法登录？**
A: 需要管理员审核后才能登录（状态：pending → approved）。

**Q: 忘记 admin 密码怎么办？**
A: 删除 `backend/repair.db` 重启，或通过数据库重置密码哈希。

**Q: 如何查看审计日志？**
A: 管理员登录后访问 `/api/admin/audit?limit=100`，或直接查看 `backend/logs/audit.log`。

---

## 技术栈

Node.js · Express · SQLite(sql.js) · bcryptjs · JWT · svg-captcha · Helmet

---

*生产环境使用请做好数据备份和安全评估。*
