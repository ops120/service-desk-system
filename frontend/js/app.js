// 通用报修系统 - 前端JavaScript

// 自动使用当前域名作为API地址
const API_BASE = window.location.protocol + '//' + window.location.host + '/api';
document.title = API_BASE + ' - ' + document.title;

// 工具函数
const Utils = {
  // 显示Toast提示
  showToast(message, duration = 2000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  },

  // 获取localStorage
  getStorage(key) {
    return localStorage.getItem(key);
  },

  setStorage(key, value) {
    localStorage.setItem(key, value);
  },

  removeStorage(key) {
    localStorage.removeItem(key);
  },

  getToken() {
    return this.getStorage('token');
  },

  getUser() {
    const userStr = this.getStorage('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  logout() {
    this.removeStorage('token');
    this.removeStorage('user');
    location.href = 'index.html';
  },

  async changePassword(oldPassword, newPassword) {
    return Utils.request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  // API请求
  async request(url, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    try {
      const response = await fetch(API_BASE + url, { ...options, headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '请求失败');
      return data;
    } catch (err) {
      console.error('API请求错误:', err);
      throw err;
    }
  },

  // 格式化时间
  formatTime(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  },

  // 获取状态标签
  getStatusTag(status) {
    const statusMap = {
      pending: { label: '待处理', class: 'status-pending' },
      processing: { label: '处理中', class: 'status-processing' },
      completed: { label: '已完成', class: 'status-completed' },
      confirmed: { label: '已确认', class: 'status-confirmed' },
      cancelled: { label: '已取消', class: 'status-cancelled' }
    };
    return statusMap[status] || { label: status, class: '' };
  },

  // HTML转义（防XSS）
  escapeHtml(str) {
    if (str == null) return '';
    var s = String(str);
    s = s.replace(/&/g, '&amp;');
    s = s.replace(/</g, '&lt;');
    s = s.replace(/>/g, '&gt;');
    s = s.replace(/"/g, '&quot;');
    s = s.replace(/'/g, '&#39;');
    return s;
  },

  // 预览图片
  previewImage(src) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    modal.innerHTML = '<img src="' + Utils.escapeHtml(src) + '" style="max-width:95%;max-height:95%;object-fit:contain;">';
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
  }
};

// 页面初始化检查
function checkAuth() {
  const user = Utils.getUser();
  if (!user) {
    location.href = 'index.html';
    return null;
  }
  return user;
}

// 渲染底部导航
function renderBottomNav(role) {
  const isOwner = role === 'owner';
  return '<nav style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:8px 0;display:flex;border-top:1px solid #e8e8e8;max-width:750px;margin:0 auto;">' +
    '<a href="' + (isOwner ? 'owner.html' : 'manager.html') + '" style="flex:1;text-align:center;color:#666;font-size:12px;text-decoration:none;">🏠<br><span>首页</span></a>' +
    '<a href="' + (isOwner ? 'owner_list.html' : 'manager_list.html') + '" style="flex:1;text-align:center;color:#666;font-size:12px;text-decoration:none;">📋<br><span>报修单</span></a>' +
    '<a href="#" onclick="Utils.logout()" style="flex:1;text-align:center;color:#666;font-size:12px;text-decoration:none;">🚪<br><span>退出</span></a>' +
    '</nav>';
}

// 加载并应用系统名称
async function loadSystemName() {
  try {
    const res = await fetch(API_BASE + '/system-name');
    if (res.ok) {
      const d = await res.json();
      document.title = d.system_name + ' - ' + document.title.split(' - ').pop();
      document.querySelectorAll('[data-system-name]').forEach(el => {
        el.textContent = d.system_name;
      });
    }
  } catch (e) {}
}

// 业主相关API
const OwnerAPI = {
  async createRepair(data) {
    return Utils.request('/repairs', { method: 'POST', body: JSON.stringify(data) });
  },

  async getMyRepairs() {
    const res = await Utils.request('/repairs');
    return res.repairs || [];
  },

  async getRepairDetail(id) {
    return Utils.request('/repairs/' + id);
  },

  async confirmRepair(id) {
    return Utils.request('/repairs/' + id + '/confirm', { method: 'POST' });
  },

  async cancelRepair(id) {
    return Utils.request('/repairs/' + id + '/cancel', { method: 'POST' });
  },

  async rejectRepair(id, note) {
    return Utils.request('/repairs/' + id + '/owner-status', { method: 'PATCH', body: JSON.stringify({ note }) });
  },

  async uploadFaultPhotos(files) {
    const formData = new FormData();
    files.forEach(file => formData.append('photos', file));
    const token = Utils.getToken();
    const res = await fetch(API_BASE + '/repairs/upload-fault-photos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  }
};

// 物业相关API
const ManagerAPI = {
  async getAllRepairs() {
    const res = await Utils.request('/repairs');
    return res.repairs || [];
  },

  async getRepairDetail(id) {
    return Utils.request('/repairs/' + id);
  },

  async updateStatus(id, status, note = '') {
    return Utils.request('/repairs/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status, note }) });
  },

  async uploadCompletionPhotos(id, files) {
    const formData = new FormData();
    files.forEach(file => formData.append('photos', file));
    const token = Utils.getToken();
    const res = await fetch(API_BASE + '/repairs/' + id + '/photos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  }
};

window.Utils = Utils;
window.OwnerAPI = OwnerAPI;
window.ManagerAPI = ManagerAPI;
window.checkAuth = checkAuth;
window.renderBottomNav = renderBottomNav;
window.loadSystemName = loadSystemName;
