require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDB, queries, hashPassword, verifyPassword, generateToken, verifyToken, createCaptcha, verifyCaptcha, isAccountLocked, getLockRemainingSeconds, recordFailedAttempt, clearFailedAttempts, getRemainingAttempts, MAX_ATTEMPTS, audit } = require('./database');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Serve frontend static files
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// 限流：登录（5次/分钟）
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '操作过于频繁，请1分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 限流：注册（10次/分钟）
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '操作过于频繁，请1分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth middleware（JWT 验证）
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '请先登录' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: '登录已过期，请重新登录' });
  const user = queries.findUserById(payload.userId);
  if (!user) return res.status(401).json({ error: '登录已过期，请重新登录' });
  req.user = user;
  next();
};

// 权限检查：manager和admin都可以访问报修管理
const requireManager = (req, res, next) => {
  if (!['manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: '权限不足' });
  }
  next();
};

// admin专属权限
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

// 兼容requireRole
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: '权限不足' });
  next();
};

// ============ AUTH ROUTES ============

app.post('/api/auth/register', registerLimiter, (req, res) => {
  try {
    const { username, password, unit_number, phone, role, employee_id, property_certificate, employee_certificate } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }
    if (!phone) {
      return res.status(400).json({ error: '请填写手机号' });
    }
    // 业主必须填写房号，物业不需要
    if (role === 'owner' && !unit_number) {
      return res.status(400).json({ error: '请填写房号' });
    }
    if (username.length < 2 || password.length < 6) {
      return res.status(400).json({ error: '用户名至少2字符，密码至少6字符' });
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    // 物业必须提供员工编号
    if (role === 'manager' && !employee_id) {
      return res.status(400).json({ error: '物业员工需提供员工编号' });
    }

    const existing = queries.findUserByUsername(username);
    if (existing) return res.status(409).json({ error: '用户名已存在' });

    const result = queries.insertUser({
      username,
      password: password, // 明文传，由 database.js 哈希
      role: 'owner', // 注册强制为业主，禁止指定其他角色
      unit_number,
      phone,
      employee_id: employee_id || '',
      property_certificate: property_certificate || '',
      employee_certificate: employee_certificate || ''
    });

    res.status(201).json({ message: '注册成功，请等待管理员审核', user: { id: result.lastInsertRowid, username, role: 'owner', unit_number } });
    audit('USER_REGISTER', username, { role, unit_number, phone: phone ? '***' : '' }, req.ip);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 验证码接口
app.get('/api/auth/captcha', (req, res) => {
  const { key, data } = createCaptcha();
  res.json({ key, data });
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '-';
  try {
    const { username, password, captchaKey, captchaAnswer } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });
    if (!captchaKey || !captchaAnswer) return res.status(400).json({ error: '请先完成验证码' });
    if (!verifyCaptcha(captchaKey, captchaAnswer)) {
      audit('LOGIN_FAIL', username, { reason: 'captcha_error' }, ip);
      return res.status(400).json({ error: '验证码错误，请重试' });
    }

    const user = queries.findUserByUsername(username);

    // 检查账号是否被锁定
    if (isAccountLocked(username)) {
      const secs = getLockRemainingSeconds(username);
      audit('ACCOUNT_LOCKED', username, { reason: 'too_many_attempts', lockSeconds: secs }, ip);
      return res.status(429).json({ error: `密码连续错误，账号已锁定，请${Math.ceil(secs/60)}分钟后重试` });
    }

    if (!user || !verifyPassword(password, user.password, user.id)) {
      recordFailedAttempt(username);
      const remaining = getRemainingAttempts(username);
      audit('LOGIN_FAIL', username, { reason: 'wrong_password', remainingAttempts: remaining }, ip);
      if (remaining > 0) {
        return res.status(401).json({ error: `用户名或密码错误，剩余${remaining}次机会` });
      }
      return res.status(429).json({ error: '密码连续错误，账号已锁定5分钟' });
    }
    clearFailedAttempts(username);

    if (user.status === 'pending') {
      audit('LOGIN_DENY', username, { reason: 'account_pending' }, ip);
      return res.status(403).json({ error: '账号待审核，请联系管理员' });
    }
    if (user.status === 'rejected') {
      audit('LOGIN_DENY', username, { reason: 'account_rejected' }, ip);
      return res.status(403).json({ error: '账号已被拒绝，请联系管理员' });
    }
    audit('LOGIN_OK', user.id, { username: user.username, role: user.role }, ip);
    const token = generateToken(user.id);
    res.json({ message: '登录成功', token, user: { id: user.id, username: user.username, role: user.role, unit_number: user.unit_number, status: user.status } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// 修改密码
app.put('/api/auth/password', authenticate, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请填写原密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }
    const result = queries.updatePassword(req.user.id, oldPassword, newPassword);
    if (!result.success) {
      audit('PASSWORD_CHANGE_FAIL', req.user.id, { reason: result.error }, req.ip);
      return res.status(400).json({ error: result.error });
    }
    audit('PASSWORD_CHANGE_OK', req.user.id, {}, req.ip);
    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============ USER DOCUMENT UPLOAD ROUTES ============

// 无需登录的上传接口（注册时使用）
app.post('/api/upload/temp', registerLimiter, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传照片' });
    }
    const filePath = `/uploads/${req.file.filename}`;
    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

// 上传用户证件（需登录）
app.post('/api/users/upload-document', authenticate, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传照片' });
    }

    const { document_type } = req.body; // 'certificate' or 'property'
    const filePath = `/uploads/${req.file.filename}`;

    // 更新用户证件信息
    const user = queries.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    if (document_type === 'certificate') {
      queries.updateUserDocument(req.user.id, 'employee_certificate', filePath);
    } else if (document_type === 'property') {
      queries.updateUserDocument(req.user.id, 'property_certificate', filePath);
    }

    res.json({ success: true, path: filePath });
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

// ============ ADMIN USER MANAGEMENT ROUTES ============

// 获取待审核用户列表
app.get('/api/admin/users/pending', authenticate, requireAdmin, (req, res) => {
  try {
    const users = queries.findPendingUsers();
    res.json({ users });
  } catch (err) {
    console.error('Get pending users error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取所有用户
app.get('/api/admin/users', authenticate, requireAdmin, (req, res) => {
  try {
    const users = queries.findAllUsers();
    res.json({ users });
  } catch (err) {
    console.error('Get all users error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 审核用户（批准或拒绝）
app.patch('/api/admin/users/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: '状态必须是 approved 或 rejected' });
    }

    const user = queries.findUserById(userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'admin') return res.status(403).json({ error: '不能修改管理员状态' });

    queries.approveUser(userId, status);
    audit('USER_APPROVE', req.user.id, { targetUserId: userId, targetUsername: user.username, action: status }, req.ip);
    res.json({ message: status === 'approved' ? '已批准' : '已拒绝' });
  } catch (err) {
    console.error('Update user status error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============ AUDIT LOG ROUTES ============

// 获取审计日志（仅管理员）
app.get('/api/admin/audit', authenticate, requireAdmin, (req, res) => {
  try {
    const lineCount = parseInt(req.query.limit) || 100;
    const logFile = require('path').join(__dirname, 'logs', 'audit.log');
    if (!require('fs').existsSync(logFile)) {
      return res.json({ logs: [], total: 0 });
    }
    const content = require('fs').readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    const total = lines.length;
    const recent = lines.slice(-lineCount).reverse();
    res.json({ logs: recent, total });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: '读取日志失败' });
  }
});

// ============ STATS & SYSTEM ROUTES ============

// 获取统计数据
app.get('/api/admin/stats', authenticate, requireAdmin, (req, res) => {
  try {
    const userStats = queries.getUserStats();
    const repairStats = queries.getRepairStats();
    res.json({ userStats, repairStats });
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取系统名称
app.get('/api/admin/system-name', authenticate, requireAdmin, (req, res) => {
  res.json({ system_name: queries.getSystemName() });
});

// 设置系统名称
app.put('/api/admin/system-name', authenticate, requireAdmin, (req, res) => {
  try {
    const { system_name } = req.body;
    if (!system_name || system_name.trim().length === 0) {
      return res.status(400).json({ error: '系统名称不能为空' });
    }
    queries.setSystemName(system_name.trim());
    audit('SYSTEM_NAME_CHANGE', req.user.id, { newName: system_name.trim() }, req.ip);
    res.json({ message: '系统名称已更新', system_name: system_name.trim() });
  } catch (err) {
    console.error('Set system name error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 按筛选条件获取用户列表
app.get('/api/admin/users/filter', authenticate, requireAdmin, (req, res) => {
  try {
    const { status, role } = req.query;
    const users = queries.findUsersByFilter(status || null, role || null);
    res.json({ users });
  } catch (err) {
    console.error('Filter users error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============ REPAIR ROUTES ============

app.get('/api/repairs', authenticate, (req, res) => {
  try {
    let orders = ['manager', 'admin'].includes(req.user.role) ? queries.findAllRepairOrders() : queries.findRepairOrdersByOwnerId(req.user.id);
    const ordersWithDetails = orders.map(order => ({
      ...order,
      history: queries.findStatusHistoryByRepairOrderId(order.id)
    }));
    res.json({ repairs: ordersWithDetails });
  } catch (err) {
    console.error('Get repairs error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/repairs', authenticate, requireRole('owner'), (req, res) => {
  try {
    const { fault_location, fault_description, fault_photos } = req.body;
    if (!fault_location) {
      return res.status(400).json({ error: '故障位置不能为空' });
    }
    const result = queries.insertRepairOrder({
      owner_id: req.user.id,
      unit_number: req.user.unit_number,
      fault_location,
      fault_description,
      fault_photos: fault_photos || []
    });
    queries.insertStatusHistory({ repair_order_id: result.lastInsertRowid, status: 'pending', note: '提交报修', operator_id: req.user.id });
    res.status(201).json({ message: '报修提交成功', repair: queries.findRepairOrderById(result.lastInsertRowid) });
  } catch (err) {
    console.error('Create repair error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/repairs/:id', authenticate, (req, res) => {
  try {
    const order = queries.findRepairOrderById(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ error: '报修单不存在' });
    if (req.user.role === 'owner' && order.owner_id !== req.user.id) return res.status(403).json({ error: '无权访问此报修单' });
    res.json({ ...order, photos: queries.findPhotosByRepairOrderId(order.id), history: queries.findStatusHistoryByRepairOrderId(order.id) });
  } catch (err) {
    console.error('Get repair error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.patch('/api/repairs/:id/status', authenticate, requireManager, (req, res) => {
  try {
    const { status, note } = req.body;
    if (!['pending', 'processing', 'completed'].includes(status)) {
      return res.status(400).json({ error: '物业不能直接设置此状态' });
    }
    const order = queries.findRepairOrderById(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ error: '报修单不存在' });

    queries.updateRepairOrderStatus(order.id, status);
    queries.insertStatusHistory({ repair_order_id: order.id, status, note: note || '', operator_id: req.user.id });
    audit('REPAIR_STATUS', req.user.id, { orderId: order.id, status, note: note || '' }, req.ip);
        res.json({ message: 'Status updated' });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/repairs/:id/photos', authenticate, upload.array('photos', 5), (req, res) => {
  try {
    if (!['manager', 'admin'].includes(req.user.role)) return res.status(403).json({ error: '权限不足' });
    const order = queries.findRepairOrderById(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ error: '报修单不存在' });

    req.files.forEach(file => {
      queries.insertPhoto({ repair_order_id: order.id, photo_type: 'completion', file_path: `/uploads/${file.filename}` });
    });
    queries.updateRepairOrderStatus(order.id, 'completed');
    queries.insertStatusHistory({ repair_order_id: order.id, status: 'completed', note: '物业上传了完工照片', operator_id: req.user.id });
    audit('REPAIR_COMPLETE', req.user.id, { orderId: order.id }, req.ip);
        res.json({ message: '完工照片上传成功', photos: queries.findPhotosByRepairOrderId(order.id) });
  } catch (err) {
    console.error('Upload photos error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/repairs/upload-fault-photos', authenticate, requireRole('owner'), upload.array('photos', 5), (req, res) => {
  try {
    const photos = req.files.map(file => ({ filename: file.filename, path: `/uploads/${file.filename}` }));
    res.json({ success: true, photos });
  } catch (err) {
    console.error('Upload fault photos error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/repairs/:id/confirm', authenticate, requireRole('owner'), (req, res) => {
  try {
    const order = queries.findRepairOrderById(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ error: '报修单不存在' });
    if (order.owner_id !== req.user.id) return res.status(403).json({ error: '只能确认自己的报修单' });
    if (order.status !== 'completed') return res.status(400).json({ error: '请等待物业上传完工照片后再确认' });

    queries.updateRepairOrderStatus(order.id, 'confirmed');
    queries.insertStatusHistory({ repair_order_id: order.id, status: 'confirmed', note: '业主已确认完工', operator_id: req.user.id });
    audit('REPAIR_CONFIRM', req.user.id, { orderId: order.id }, req.ip);
        res.json({ message: '已确认完工' });
  } catch (err) {
    console.error('Confirm error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 业主取消报修
app.post('/api/repairs/:id/cancel', authenticate, requireRole('owner'), (req, res) => {
  try {
    const order = queries.findRepairOrderById(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ error: '报修单不存在' });
    if (order.owner_id !== req.user.id) return res.status(403).json({ error: '只能取消自己的报修单' });
    if (!['pending', 'processing'].includes(order.status)) {
      return res.status(400).json({ error: '当前状态无法取消' });
    }

    queries.updateRepairOrderStatus(order.id, 'cancelled');
    queries.insertStatusHistory({ repair_order_id: order.id, status: 'cancelled', note: '业主取消了报修', operator_id: req.user.id });
    audit('REPAIR_CANCEL', req.user.id, { orderId: order.id }, req.ip);
        res.json({ message: '已取消报修' });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 业主打回（认为未完工）
app.patch('/api/repairs/:id/owner-status', authenticate, requireRole('owner'), (req, res) => {
  try {
    const { note } = req.body;
    const order = queries.findRepairOrderById(parseInt(req.params.id, 10));
    if (!order) return res.status(404).json({ error: '报修单不存在' });
    if (order.owner_id !== req.user.id) return res.status(403).json({ error: '只能操作自己的报修单' });
    if (!['completed', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ error: '当前状态无法打回' });
    }
    if (!note || note.trim().length === 0) {
      return res.status(400).json({ error: '请填写打回原因' });
    }

    queries.updateRepairOrderStatus(order.id, 'processing');
    queries.insertStatusHistory({ repair_order_id: order.id, status: 'processing', note: '业主打回：' + note.trim(), operator_id: req.user.id });
    audit('REPAIR_REJECT', req.user.id, { orderId: order.id, note: note.trim() }, req.ip);
        res.json({ message: '已打回，物业将重新处理' });
  } catch (err) {
    console.error('Owner status error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/dict/status', (req, res) => {
  res.json({ pending: { label: '待处理', color: '#fa8c16' }, processing: { label: '处理中', color: '#1890ff' }, completed: { label: '已完成', color: '#52c41a' }, confirmed: { label: '已确认', color: '#8bc34a' }, cancelled: { label: '已取消', color: '#999' } });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

// Start server
async function start() {
  try {
    await initDB();
    console.log('Database initialized');
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
      console.log(`Server running. Default admin: admin / admin123`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
