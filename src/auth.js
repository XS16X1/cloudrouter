import { getAdminPasswordHash } from './utils.js';

// 管理员认证中间件
export async function requireAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未提供认证信息' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7); // 提取密码
  const currentAdminHash = getAdminPasswordHash();
  if (!currentAdminHash) {
    return new Response(JSON.stringify({ error: '管理员密码尚未设置' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  // 导入 verifyPassword 函数
  const { verifyPassword } = await import('./utils.js');
  const isValid = await verifyPassword(token, currentAdminHash);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效的管理密码' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 认证成功，将密码（或标记）附加到请求对象，以便后续路由使用（如果需要）
  request.isAdmin = true;
  request.adminPassword = token; // 存储明文密码以备更改密码时使用
  
  // 认证成功，返回 undefined 让路由继续处理
  return undefined;
}