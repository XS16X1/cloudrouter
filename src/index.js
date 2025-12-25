import { Router } from 'itty-router';
import { setupAdminApiRoutes } from './admin-api.js';
import { setupOpenaiApiRoutes } from './openai-api.js';
import { getAdminHtml } from './admin-ui.js';

// 创建路由器
const router = Router();

// 主页路由
router.get('/', async (request, env) => {
  return await getAdminHtml(env);
});

// 404 处理
router.all('*', () => new Response('Not Found', { status: 404 }));

// 设置所有路由
setupAdminApiRoutes(router);
setupOpenaiApiRoutes(router);

// --- 导出 ---
export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },
};
