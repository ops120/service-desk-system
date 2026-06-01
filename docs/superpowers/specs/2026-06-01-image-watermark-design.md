# 图片水印功能设计

## 概述

在所有图片上传入口，服务器自动为图片添加文字水印（用户名 + 上传时间），覆盖存储原图。

## 水印内容

格式：`用户名 | 2026-06-01 14:30`
来源：自动从当前登录用户 JWT token 解码获取 `username`，时间取服务器当前时间。

## 水印样式

- **位置**：右下角，距边缘 16px
- **颜色**：白色半透明 + 黑色描边
  - 填充：`rgba(255, 255, 255, 0.85)`
  - 描边：`2px black`
- **字号**：图片宽度的 2.5%（最小 12px，最大 24px），自适应
- **排列**：单行，超长用户名截断显示

## 技术方案

### 依赖

`jimp` — 纯 Node.js 图片处理库，无需系统依赖。

### 实现位置

`backend/server.js` — 在 multer 的 `filename` 回调中，在文件写入后读取并处理：

```
上传请求 → multer 拦截写入临时文件 → Jimp 读取添加水印 → 覆盖保存原路径 → 继续路由逻辑
```

### 数据流

```
Client POST file
  → multer diskStorage filename() 生成唯一文件名
  → multer 保存临时文件到 uploads/
  → watermarkImage(tempPath) 读取 → 添加水印 → 覆盖写入
  → 路由继续处理（存入数据库等）
```

### 统一处理的上传路由

| 路由 | 说明 |
|------|------|
| `POST /api/upload/temp` | 注册时上传头像/证件 |
| `POST /api/users/upload-document` | 上传员工/房产证件 |
| `POST /api/repairs/upload-fault-photos` | 报修故障照片 |
| `POST /api/repairs/:id/photos` | 完工照片 |

## 限制与降级

| 情况 | 处理方式 |
|------|------|
| GIF 图片 | 跳过水印，保留原图 |
| 图片宽/高 > 4096px | 跳过水印，保留原图，记录日志 |
| Jimp 处理异常 | 降级保留原图，不阻塞上传 |

## 改动范围

| 文件 | 改动 |
|------|------|
| `backend/package.json` | 新增 `jimp` 依赖 |
| `backend/server.js` | 新增 `watermarkImage()` 函数，修改 multer filename 回调 |

## 测试要点

1. 各上传入口上传图片，验证水印正确添加（文字、时间、位置）
2. 上传 GIF 验证原样保留
3. 未登录请求（`/api/upload/temp` 允许）水印文字处理
4. 异常情况（超大图、处理失败）降级是否正常
