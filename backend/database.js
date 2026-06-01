require('dotenv').config();
const initSqlJs = require('sql.js');
const svgCaptcha = require('svg-captcha');
const fs = require('fs');
const path = require('path');

// ============ 审计日志 ============
const AUDIT_LOG = path.join(__dirname, 'logs', 'audit.log');

function ensureLogDir() {
  const logDir = path.dirname(AUDIT_LOG);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
}

function audit(action, user, details, ip) {
  const timestamp = new Date().toISOString();
  const userStr = user ? (typeof user === 'object' ? (user.username || user.id) : user) : 'system';
  const ipStr = ip || '-';
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');
  const line = `[${timestamp}] [${action}] [${userStr}] [${ipStr}] ${detailsStr}\n`;
  try {
    ensureLogDir();
    fs.appendFileSync(AUDIT_LOG, line);
  } catch (e) {
    console.error('[AUDIT] 写入失败:', e.message);
  }
}

// 验证码存储（key: token前8位, value: {answer, expires}）
const captchaStore = new Map();

// 生成验证码
function createCaptcha() {
  const captcha = svgCaptcha.createMathExpr({ fontSize: 48, width: 120, height: 40 });
  const key = Math.random().toString(36).substring(2, 10);
  captchaStore.set(key, { answer: captcha.text, expires: Date.now() + 5 * 60 * 1000 });
  return { key, data: captcha.data };
}

// 验证验证码
function verifyCaptcha(key, answer) {
  const entry = captchaStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expires) { captchaStore.delete(key); return false; }
  const ok = entry.answer.toLowerCase() === answer.toLowerCase().trim();
  captchaStore.delete(key);
  return ok;
}
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 账号锁定（key: username, value: {attempts, lockedUntil}）
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 5 * 60 * 1000; // 5分钟

// 检查账号是否被锁定
function isAccountLocked(username) {
  const record = loginAttempts.get(username);
  if (!record) return false;
  // lockedUntil = 0 表示尚未锁定，仅记录过尝试
  if (record.lockedUntil === 0) return false;
  if (Date.now() > record.lockedUntil) {
    loginAttempts.delete(username);
    return false;
  }
  return true;
}

// 获取剩余锁定秒数
function getLockRemainingSeconds(username) {
  const record = loginAttempts.get(username);
  if (!record || record.lockedUntil === 0) return 0;
  return Math.ceil((record.lockedUntil - Date.now()) / 1000);
}

// 记录登录失败
function recordFailedAttempt(username) {
  const record = loginAttempts.get(username) || { attempts: 0, lockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_DURATION;
  }
  loginAttempts.set(username, record);
}

// 清除登录失败记录（成功时调用）
function clearFailedAttempts(username) {
  loginAttempts.delete(username);
}

// 获取剩余尝试次数
function getRemainingAttempts(username) {
  const record = loginAttempts.get(username);
  if (!record) return MAX_ATTEMPTS;
  return Math.max(0, MAX_ATTEMPTS - record.attempts);
}

// JWT 密钥（生产环境必须从环境变量读取，禁止硬编码）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量未设置，请先设置再启动');
}
const JWT_EXPIRES = '7d';

// 生成 JWT
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// 验证 JWT，返回 payload 或 null
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload; // { userId, iat, exp }
  } catch (e) {
    return null;
  }
}

const DB_PATH = path.join(__dirname, 'repair.db');
let db;

async function initDB() {
  const SQL = await initSqlJs();

  // 加载已有数据库或创建新数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('[DB] SQLite 数据库加载完成');
  } else {
    db = new SQL.Database();
    console.log('[DB] 新建 SQLite 数据库');
  }

  // 创建表（IF NOT EXISTS 不会修复已有损坏的表，需单独检查并重建）
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','manager','admin')),
      unit_number TEXT,
      phone TEXT,
      employee_id TEXT DEFAULT '',
      property_certificate TEXT DEFAULT '',
      employee_certificate TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 通用表修复函数：检测并重建缺少 AUTOINCREMENT 的表
  // 策略：用测试插入来检测——如果插入后 id 为 null，说明缺少 AUTOINCREMENT
  function fixTableIfNeeded(tableName, createSQL, testColumns) {
    if (!testColumns || testColumns.length === 0) return;
    // 构造最小测试插入（前几列），id 列传 null 期待自增
    const placeholders = testColumns.map(() => '?').join(',');
    const colNames = testColumns.join(',');
    const testValues = testColumns.map(() => null); // id=null, 其他列=null
    try {
      db.run('INSERT INTO ' + tableName + ' (' + colNames + ') VALUES (' + placeholders + ')', testValues);
      const lid = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      db.run('DELETE FROM ' + tableName + ' WHERE id = ?', [lid]); // 回滚测试
      if (lid === null) throw new Error('AUTOINCREMENT broken');
      return; // 自增正常，无需修复
    } catch (e) {
      // id 为 null 说明表缺少 AUTOINCREMENT，需要重建
    }
    console.log('[DB] 检测到 ' + tableName + ' 表缺少 AUTOINCREMENT，正在重建...');
    const backup = db.exec('SELECT * FROM ' + tableName);
    const columns = backup.length > 0 ? backup[0].columns : [];
    const rows = backup.length > 0 ? backup[0].values : [];
    db.run('DROP TABLE ' + tableName);
    db.run(createSQL);
    const validRows = rows.filter(r => r[0] !== null);
    if (columns.length > 0 && validRows.length > 0) {
      const insPlaceholders = validRows.map(() => '(' + columns.map(() => '?').join(',') + ')').join(',');
      const colNames2 = columns.join(',');
      const allValues = validRows.flat();
      db.run('INSERT INTO ' + tableName + ' (' + colNames2 + ') VALUES ' + insPlaceholders, allValues);
    }
    console.log('[DB] ' + tableName + ' 表已修复，共恢复', validRows.length, '条有效记录');
  }

  // 检查并修复各表 schema
  fixTableIfNeeded('users', `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','manager','admin')),
      unit_number TEXT,
      phone TEXT,
      employee_id TEXT DEFAULT '',
      property_certificate TEXT DEFAULT '',
      employee_certificate TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, ['id', 'username', 'password', 'role', 'status']);
  fixTableIfNeeded('repair_orders', `
    CREATE TABLE repair_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      unit_number TEXT NOT NULL,
      fault_location TEXT NOT NULL,
      fault_description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','confirmed','cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `, ['id', 'owner_id', 'unit_number', 'fault_location', 'status']);
  fixTableIfNeeded('photos', `
    CREATE TABLE photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_order_id INTEGER NOT NULL,
      photo_type TEXT NOT NULL CHECK(photo_type IN ('fault','completion')),
      file_path TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id)
    )
  `, ['id', 'repair_order_id', 'photo_type', 'file_path']);
  fixTableIfNeeded('status_history', `
    CREATE TABLE status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      note TEXT DEFAULT '',
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `, ['id', 'repair_order_id', 'status', 'note']);

  db.run(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // 初始化系统配置
  const sysName = db.exec("SELECT value FROM system_config WHERE key = 'system_name'");
  if (sysName.length === 0 || sysName[0].values.length === 0) {
    db.run("INSERT INTO system_config (key, value) VALUES ('system_name', '通用报修系统')");
  }

  // 创建默认管理员
  const adminExists = db.exec("SELECT id FROM users WHERE role = 'admin'");
  if (adminExists.length === 0 || adminExists[0].values.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run("INSERT INTO users (username, password, role, unit_number, status) VALUES ('admin', ?, 'admin', '系统', 'approved')", [hash]);
    console.log('[DB] 默认管理员已创建: admin / admin123');
  }

  saveDB();
  console.log('[DB] SQLite 数据库初始化完成');
  return db;
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// 密码哈希（不可逆）
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// 验证密码
function verifyPassword(password, hash, userId) {
  // 兼容旧 base64 格式
  if (hash && !hash.startsWith('$2')) {
    const encoded = Buffer.from(password, 'utf8').toString('base64');
    if (encoded === hash) {
      // 验证成功，升级为 bcrypt
      const newHash = hashPassword(password);
      db.run('UPDATE users SET password = ? WHERE id = ?', [newHash, userId]);
      saveDB();
      return true;
    }
    return false;
  }
  return bcrypt.compareSync(password, hash);
}

function maskPhone(phone) {
  if (!phone || phone.length < 11) return phone || '';
  return phone.substring(0, 3) + '****' + phone.substring(7);
}

// 辅助：将 sql.js 结果转为对象数组
function toObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

const queries = {
  // ===== 用户 =====
  insertUser(params) {
    const hash = hashPassword(params.password || params.phone || '123456');
    // 先用 db.exec 执行 INSERT（sql.js 对 db.run 的 last_insert_rowid 支持不稳定）
    db.exec(`
      INSERT INTO users (username, password, role, unit_number, phone, employee_id, property_certificate, employee_certificate, status)
      VALUES ('${params.username}', '${hash}', '${params.role || 'owner'}', '${params.unit_number || ''}', '${params.phone || ''}', '${params.employee_id || ''}', '${params.property_certificate || ''}', '${params.employee_certificate || ''}', '${params.status || 'pending'}')
    `);
    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
    saveDB();
    console.log('[DB] insertUser -> lastId:', lastId, 'username:', params.username);
    return { lastInsertRowid: lastId };
  },

  findUserByUsername(username) {
    const result = db.exec('SELECT * FROM users WHERE username = ?', [username]);
    const users = toObjects(result);
    if (users.length === 0) return null;
    const u = users[0];
    return {
      id: u.id, username: u.username, password: u.password, role: u.role,
      unit_number: u.unit_number, phone: maskPhone(u.phone),
      phone_raw: u.phone || '', employee_id: u.employee_id || '',
      property_certificate: u.property_certificate || '',
      employee_certificate: u.employee_certificate || '',
      status: u.status, created_at: u.created_at
    };
  },

  findUserById(id) {
    const result = db.exec('SELECT * FROM users WHERE id = ?', [id]);
    const users = toObjects(result);
    if (users.length === 0) return null;
    const u = users[0];
    return {
      id: u.id, username: u.username, role: u.role,
      unit_number: u.unit_number, phone: maskPhone(u.phone),
      phone_raw: u.phone || '', employee_id: u.employee_id || '',
      property_certificate: u.property_certificate || '',
      employee_certificate: u.employee_certificate || '',
      status: u.status, created_at: u.created_at
    };
  },

  findPendingUsers() {
    const result = db.exec("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC");
    return toObjects(result).map(u => ({
      id: u.id, username: u.username, role: u.role,
      unit_number: u.unit_number, phone: maskPhone(u.phone),
      employee_id: u.employee_id || '',
      property_certificate: u.property_certificate || '',
      employee_certificate: u.employee_certificate || '',
      status: u.status, created_at: u.created_at
    }));
  },

  findAllUsers() {
    const result = db.exec('SELECT * FROM users ORDER BY created_at DESC');
    return toObjects(result).map(u => ({
      id: u.id, username: u.username, role: u.role,
      unit_number: u.unit_number, phone: maskPhone(u.phone),
      employee_id: u.employee_id || '',
      property_certificate: u.property_certificate || '',
      employee_certificate: u.employee_certificate || '',
      status: u.status, created_at: u.created_at
    }));
  },

  approveUser(id, status) {
    db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    saveDB();
  },

  updateUserDocument(id, field, val) {
    db.run(`UPDATE users SET ${field} = ? WHERE id = ?`, [val, id]);
    saveDB();
  },

  updatePassword(id, oldPassword, newPassword) {
    const result = db.exec('SELECT password FROM users WHERE id = ?', [id]);
    const users = toObjects(result);
    if (users.length === 0) return { success: false, error: '用户不存在' };
    if (!verifyPassword(oldPassword, users[0].password, id)) return { success: false, error: '原密码错误' };
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(newPassword), id]);
    saveDB();
    return { success: true };
  },

  // ===== 报修单 =====
  insertRepairOrder(params) {
    db.run(`
      INSERT INTO repair_orders (owner_id, unit_number, fault_location, fault_description, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [params.owner_id, params.unit_number, params.fault_location, params.fault_description || '']);
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    if (params.fault_photos && Array.isArray(params.fault_photos)) {
      params.fault_photos.forEach(p => {
        db.run('INSERT INTO photos (repair_order_id, photo_type, file_path) VALUES (?, ?, ?)', [lastId, 'fault', p.path]);
      });
    }
    saveDB();
    return { lastInsertRowid: lastId };
  },

  findRepairOrderById(id) {
    const result = db.exec('SELECT * FROM repair_orders WHERE id = ?', [id]);
    const orders = toObjects(result);
    if (orders.length === 0) return null;
    const order = orders[0];
    const ownerResult = db.exec('SELECT username FROM users WHERE id = ?', [order.owner_id]);
    const owner_name = ownerResult.length > 0 && ownerResult[0].values.length > 0 ? ownerResult[0].values[0][0] : '未知';
    const photosResult = db.exec('SELECT * FROM photos WHERE repair_order_id = ?', [id]);
    const photos = toObjects(photosResult);
    const fault_photos = photos.filter(p => p.photo_type === 'fault').map(p => ({ path: p.file_path, uploaded_at: p.uploaded_at }));
    const completion_photos = photos.filter(p => p.photo_type === 'completion').map(p => ({ path: p.file_path, uploaded_at: p.uploaded_at }));
    return { ...order, owner_name, owner_unit: order.unit_number, fault_photos, completion_photos };
  },

  findRepairOrdersByOwnerId(ownerId) {
    const result = db.exec('SELECT * FROM repair_orders WHERE owner_id = ? ORDER BY created_at DESC', [ownerId]);
    return toObjects(result).map(order => {
      const photosResult = db.exec('SELECT * FROM photos WHERE repair_order_id = ?', [order.id]);
      const photos = toObjects(photosResult);
      const fault_photos = photos.filter(p => p.photo_type === 'fault').map(p => ({ path: p.file_path, uploaded_at: p.uploaded_at }));
      const completion_photos = photos.filter(p => p.photo_type === 'completion').map(p => ({ path: p.file_path, uploaded_at: p.uploaded_at }));
      return { ...order, fault_photos, completion_photos };
    });
  },

  findAllRepairOrders() {
    const result = db.exec('SELECT * FROM repair_orders ORDER BY created_at DESC');
    return toObjects(result).map(order => {
      const ownerResult = db.exec('SELECT username FROM users WHERE id = ?', [order.owner_id]);
      const owner_name = ownerResult.length > 0 && ownerResult[0].values.length > 0 ? ownerResult[0].values[0][0] : '未知';
      const photosResult = db.exec('SELECT * FROM photos WHERE repair_order_id = ?', [order.id]);
      const photos = toObjects(photosResult);
      const fault_photos = photos.filter(p => p.photo_type === 'fault').map(p => ({ path: p.file_path, uploaded_at: p.uploaded_at }));
      const completion_photos = photos.filter(p => p.photo_type === 'completion').map(p => ({ path: p.file_path, uploaded_at: p.uploaded_at }));
      return { ...order, owner_name, owner_unit: order.unit_number, fault_photos, completion_photos };
    });
  },

  updateRepairOrderStatus(id, status) {
    db.run("UPDATE repair_orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    saveDB();
  },

  // ===== 照片 =====
  insertPhoto(params) {
    db.run('INSERT INTO photos (repair_order_id, photo_type, file_path) VALUES (?, ?, ?)', [params.repair_order_id, params.photo_type, params.file_path]);
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveDB();
    return { id: lastId };
  },

  findPhotosByRepairOrderId(repairOrderId) {
    const result = db.exec('SELECT * FROM photos WHERE repair_order_id = ?', [repairOrderId]);
    return toObjects(result);
  },

  // ===== 状态历史 =====
  insertStatusHistory(params) {
    db.run('INSERT INTO status_history (repair_order_id, status, note, operator_id) VALUES (?, ?, ?, ?)', [params.repair_order_id, params.status, params.note || '', params.operator_id || null]);
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    saveDB();
    return { id: lastId };
  },

  findStatusHistoryByRepairOrderId(repairOrderId) {
    const result = db.exec('SELECT * FROM status_history WHERE repair_order_id = ? ORDER BY created_at ASC', [repairOrderId]);
    return toObjects(result).map(h => {
      const opResult = db.exec('SELECT username FROM users WHERE id = ?', [h.operator_id]);
      const operator_name = opResult.length > 0 && opResult[0].values.length > 0 ? opResult[0].values[0][0] : '未知';
      return { ...h, operator_name };
    });
  },

  // ===== 统计 =====
  getUserStats() {
    const total = db.exec('SELECT COUNT(*) FROM users')[0].values[0][0];
    const pending = db.exec("SELECT COUNT(*) FROM users WHERE status = 'pending'")[0].values[0][0];
    const approved = db.exec("SELECT COUNT(*) FROM users WHERE status = 'approved'")[0].values[0][0];
    const rejected = db.exec("SELECT COUNT(*) FROM users WHERE status = 'rejected'")[0].values[0][0];
    const owner = db.exec("SELECT COUNT(*) FROM users WHERE role = 'owner'")[0].values[0][0];
    const manager = db.exec("SELECT COUNT(*) FROM users WHERE role = 'manager'")[0].values[0][0];
    const admin = db.exec("SELECT COUNT(*) FROM users WHERE role = 'admin'")[0].values[0][0];
    return { total, pending, approved, rejected, byRole: { owner, manager, admin } };
  },

  getRepairStats() {
    const total = db.exec('SELECT COUNT(*) FROM repair_orders')[0].values[0][0];
    const pending = db.exec("SELECT COUNT(*) FROM repair_orders WHERE status = 'pending'")[0].values[0][0];
    const processing = db.exec("SELECT COUNT(*) FROM repair_orders WHERE status = 'processing'")[0].values[0][0];
    const completed = db.exec("SELECT COUNT(*) FROM repair_orders WHERE status = 'completed'")[0].values[0][0];
    const confirmed = db.exec("SELECT COUNT(*) FROM repair_orders WHERE status = 'confirmed'")[0].values[0][0];
    const cancelled = db.exec("SELECT COUNT(*) FROM repair_orders WHERE status = 'cancelled'")[0].values[0][0];
    return { total, pending, processing, completed, confirmed, cancelled };
  },

  // ===== 系统配置 =====
  getSystemName() {
    const result = db.exec("SELECT value FROM system_config WHERE key = 'system_name'");
    if (result.length === 0 || result[0].values.length === 0) return '通用报修系统';
    return result[0].values[0][0];
  },

  setSystemName(name) {
    db.run("UPDATE system_config SET value = ? WHERE key = 'system_name'", [name]);
    saveDB();
  },

  // ===== 自动审核（测试用） =====
  getAutoApprove() {
    const result = db.exec("SELECT value FROM system_config WHERE key = 'auto_approve'");
    if (result.length === 0 || result[0].values.length === 0) return false;
    return result[0].values[0][0] === 'true';
  },

  setAutoApprove(val) {
    // 使用 INSERT OR REPLACE 确保存在
    db.run("INSERT OR REPLACE INTO system_config (key, value) VALUES ('auto_approve', ?)", [val ? 'true' : 'false']);
    saveDB();
  },

  // ===== 筛选 =====
  findUsersByFilter(status, role) {
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    sql += ' ORDER BY created_at DESC';
    const result = db.exec(sql, params);
    return toObjects(result).map(u => ({
      id: u.id, username: u.username, role: u.role,
      unit_number: u.unit_number, phone: maskPhone(u.phone),
      employee_id: u.employee_id || '',
      property_certificate: u.property_certificate || '',
      employee_certificate: u.employee_certificate || '',
      status: u.status, created_at: u.created_at
    }));
  }
};

module.exports = {
  initDB, queries, hashPassword, verifyPassword,
  generateToken, verifyToken,
  createCaptcha, verifyCaptcha,
  isAccountLocked, getLockRemainingSeconds, recordFailedAttempt, clearFailedAttempts, getRemainingAttempts,
  MAX_ATTEMPTS, LOCK_DURATION,
  audit
};
