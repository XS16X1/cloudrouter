import { Router } from 'itty-router';

// 创建路由器
const router = Router();

// --- 全局变量 ---
let apiKeys = {}; // 缓存 API 密钥，键为密钥值，值为 {type, balance, isHealthy, usage, limit}
let currentKeyIndex = 0;
let lastHealthCheck = 0;
let adminPasswordHash = null; // 缓存管理员密码哈希
let clientTokens = []; // 缓存客户端访问 token
let keyStatus = {
  "invalid": [],
  "free": [],
  "unverified": [],
  "valid": []
};

// --- 请求统计变量 ---
let requestTimestamps = []; // 请求时间戳数组 (用于RPM计算)
let tokenCounts = []; // token数量数组 (用于TPM计算)
let requestTimestampsDay = []; // 每日请求时间戳数组 (用于RPD计算)
let tokenCountsDay = []; // 每日token数量数组 (用于TPD计算)
let serviceStartTime = Date.now(); // 服务启动时间

// --- 免费请求限制 ---
const FREE_REQUESTS_LIMIT = 50; // 每日免费请求限制
let freeRequestsCount = {}; // 每个API密钥的免费请求计数
let lastResetDate = null; // 上次重置计数的日期

// OpenRouter API 基础 URL
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const KV_KEYS = {
  API_KEYS: 'api_keys',
  ADMIN_PASSWORD_HASH: 'admin_password_hash',
  CLIENT_TOKENS: 'client_tokens',
};

// --- 辅助函数 ---

// 初始化：从 KV 加载 API 密钥、管理员密码哈希和客户端 token
async function initializeState(env) {
  try {
    const [keysData, passwordHashData, tokensData] = await Promise.all([
      env.ROUTER_KV.get(KV_KEYS.API_KEYS, { type: 'json' }),
      env.ROUTER_KV.get(KV_KEYS.ADMIN_PASSWORD_HASH, { type: 'text' }),
      env.ROUTER_KV.get(KV_KEYS.CLIENT_TOKENS, { type: 'json' }),
    ]);

    if (keysData) {
      if (Array.isArray(keysData)) {
        // 迁移旧格式：从数组转换为对象
        apiKeys = {};
        keysData.forEach(key => {
          if (key.value && typeof key.value === 'string') {
            apiKeys[key.value] = { isHealthy: key.isHealthy !== false };
          }
        });
        console.log(`已迁移 ${Object.keys(apiKeys).length} 个API密钥到新格式`);
        // 保存新格式
        await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));
      } else if (typeof keysData === 'object') {
        // 新格式
        apiKeys = keysData;
        console.log(`已加载 ${Object.keys(apiKeys).length} 个API密钥`);
      }
    } else {
      apiKeys = {};
      console.log('未找到API密钥');
    }

    if (passwordHashData) {
      adminPasswordHash = passwordHashData;
      console.log('已加载管理员密码哈希');
    } else {
      adminPasswordHash = null;
      console.log('未设置管理员密码');
    }

    if (tokensData && Array.isArray(tokensData)) {
      clientTokens = tokensData;
      console.log(`已加载 ${clientTokens.length} 个客户端 token`);
    } else {
      clientTokens = [];
      console.log('未找到客户端 token');
    }
  } catch (error) {
    console.error('初始化状态失败:', error);
    apiKeys = {};
    adminPasswordHash = null;
    clientTokens = [];
  }
}

// 密码哈希函数 (SHA-256)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// 验证密码
async function verifyPassword(providedPassword, storedHash) {
  if (!providedPassword || !storedHash) {
    return false;
  }
  const providedHash = await hashPassword(providedPassword);
  return providedHash === storedHash;
}

// 验证客户端 token
function verifyClientToken(token) {
  if (!token || clientTokens.length === 0) {
    return false;
  }
  return clientTokens.some(tokenObj => tokenObj.token === token && tokenObj.enabled);
}

// --- 统计和限制辅助函数 ---

// 重置免费请求计数（每天执行一次）
function resetFreeRequestsIfNeeded() {
  const currentDate = new Date().toDateString();
  if (lastResetDate !== currentDate) {
    freeRequestsCount = {};
    lastResetDate = currentDate;
    console.log('已重置所有API密钥的免费请求计数');
  }
}

// 增加API密钥的免费请求计数
function incrementFreeRequests(apiKey) {
  resetFreeRequestsIfNeeded();
  if (!(apiKey in freeRequestsCount)) {
    freeRequestsCount[apiKey] = 0;
  }
  freeRequestsCount[apiKey] += 1;
  return freeRequestsCount[apiKey];
}

// 获取API密钥的免费请求计数
function getFreeRequestsCount(apiKey) {
  resetFreeRequestsIfNeeded();
  return freeRequestsCount[apiKey] || 0;
}

// 更新请求统计信息
function updateRequestStats(promptTokens, completionTokens) {
  const currentTime = Date.now();
  const totalTokens = promptTokens + completionTokens;

  // 更新RPM/TPM统计 (最近1分钟)
  requestTimestamps.push(currentTime);
  tokenCounts.push(totalTokens);

  // 更新RPD/TPD统计 (最近24小时)
  requestTimestampsDay.push(currentTime);
  tokenCountsDay.push(totalTokens);

  // 清理过期数据
  const oneMinuteAgo = currentTime - 60 * 1000;
  const oneDayAgo = currentTime - 24 * 60 * 60 * 1000;

  // 清理1分钟统计
  while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
    requestTimestamps.shift();
    tokenCounts.shift();
  }

  // 清理24小时统计
  while (requestTimestampsDay.length > 0 && requestTimestampsDay[0] < oneDayAgo) {
    requestTimestampsDay.shift();
    tokenCountsDay.shift();
  }
}

// 获取当前统计信息
function getCurrentStats() {
  const currentTime = Date.now();
  const oneMinuteAgo = currentTime - 60 * 1000;
  const oneDayAgo = currentTime - 24 * 60 * 60 * 1000;

  // 计算RPM和TPM
  let recentRequests = 0;
  let recentTokens = 0;
  for (let i = requestTimestamps.length - 1; i >= 0; i--) {
    if (requestTimestamps[i] >= oneMinuteAgo) {
      recentRequests++;
      recentTokens += tokenCounts[i];
    } else {
      break;
    }
  }

  // 计算RPD和TPD
  let dailyRequests = 0;
  let dailyTokens = 0;
  for (let i = requestTimestampsDay.length - 1; i >= 0; i--) {
    if (requestTimestampsDay[i] >= oneDayAgo) {
      dailyRequests++;
      dailyTokens += tokenCountsDay[i];
    } else {
      break;
    }
  }

  return {
    rpm: recentRequests,
    tpm: recentTokens,
    rpd: dailyRequests,
    tpd: dailyTokens
  };
}

// 获取API密钥的信用额度信息
async function getCreditSummary(apiKey) {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`获取额度信息失败，API Key：${apiKey.substring(0, 8)}...，状态码：${response.status}`);
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || !data.data) {
      console.error(`解析额度信息失败，API Key：${apiKey.substring(0, 8)}...`);
      return null;
    }

    // 解析OpenRouter返回的数据
    const usage = data.data.usage || 0;
    const limit = data.data.limit;
    const limitRemaining = data.data.limit_remaining;
    const isFreeTier = data.data.is_free_tier || false;
    const rateLimit = data.data.rate_limit || {};

    // 计算余额
    let totalBalance;
    if (limitRemaining !== null && limitRemaining !== undefined) {
      totalBalance = limitRemaining;
    } else if (limit !== null && limit !== undefined) {
      totalBalance = limit - usage;
    } else {
      // 如果是免费用户且没有limit信息，设置余额为0
      totalBalance = isFreeTier ? 0 : Infinity;
    }

    console.log(`获取额度，API Key：${apiKey.substring(0, 8)}...，当前额度: ${totalBalance}, 使用量: ${usage}, 限额: ${limit}, 剩余限额: ${limitRemaining}, 是否免费用户: ${isFreeTier}`);

    return {
      total_balance: totalBalance,
      usage,
      limit,
      limit_remaining: limitRemaining,
      is_free_tier: isFreeTier,
      rate_limit: rateLimit
    };
  } catch (error) {
    console.error(`获取额度信息异常，API Key：${apiKey.substring(0, 8)}...，错误：${error}`);
    return null;
  }
}

// 生成随机 token
function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sk-';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 管理员认证中间件
async function requireAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未提供认证信息' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7); // 提取密码
  if (!adminPasswordHash) {
    return new Response(JSON.stringify({ error: '管理员密码尚未设置' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const isValid = await verifyPassword(token, adminPasswordHash);
  if (!isValid) {
    return new Response(JSON.stringify({ error: '无效的管理密码' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 认证成功，将密码（或标记）附加到请求对象，以便后续路由使用（如果需要）
  request.isAdmin = true;
  request.adminPassword = token; // 存储明文密码以备更改密码时使用
  
  // 认证成功，返回 undefined 让路由继续处理
  return undefined;
}

// 分类API密钥并检查健康状态
async function classifyAndCheckKey(key) {
  try {
    // 获取信用额度信息
    const creditSummary = await getCreditSummary(key);
    if (!creditSummary) {
      console.log(`密钥 ${key.substring(0, 8)}... 无效，无法获取额度信息`);
      return 'invalid';
    }

    const totalBalance = creditSummary.total_balance;

    // 分类密钥
    if (totalBalance <= 0.03) {
      // 余额很少的密钥认为是免费密钥
      console.log(`密钥 ${key.substring(0, 8)}... 余额很少，分类为免费密钥`);
      return 'free';
    } else {
      // 有余额的密钥，测试可用性
      try {
        // 1. 基础连通性检查 - 获取模型列表
        const modelsResponse = await fetch(`${OPENROUTER_BASE_URL}/models`, {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        });

        if (!modelsResponse.ok) {
          console.log(`密钥 ${key.substring(0, 8)}... 模型列表检查失败:`, modelsResponse.status);
          return 'unverified';
        }

        // 2. 实际调用检查 - 测试一个常用的模型
        const testResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-r1-0528:free',
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
          })
        });

        // 检查是否是数据策略错误
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          if (errorText.includes('No endpoints found matching your data policy')) {
            console.log(`密钥 ${key.substring(0, 8)}... 数据策略限制，无法访问免费模型`);
            return 'unverified';
          }
          // 其他错误（如余额不足）也认为未验证
          console.log(`密钥 ${key.substring(0, 8)}... 实际调用失败:`, testResponse.status);
          return 'unverified';
        }

        console.log(`密钥 ${key.substring(0, 8)}... 健康检查通过，分类为有效密钥`);
        return 'valid';
      } catch (error) {
        console.error(`密钥 ${key.substring(0, 8)}... 健康检查异常:`, error);
        return 'unverified';
      }
    }
  } catch (error) {
    console.error(`密钥 ${key.substring(0, 8)}... 分类检查失败:`, error);
    return 'invalid';
  }
}

// 根据请求类型选择合适的密钥
function selectKey(requestType, modelName) {
  let availableKeys = [];

  if (requestType === 'free') {
    // 免费请求可以使用免费、未验证或有效密钥
    availableKeys = [
      ...keyStatus.free,
      ...keyStatus.unverified,
      ...keyStatus.valid
    ];
  } else if (requestType === 'paid') {
    // 付费请求只能使用未验证或有效密钥
    availableKeys = [
      ...keyStatus.unverified,
      ...keyStatus.valid
    ];
  } else {
    // 未知请求类型，使用所有可用密钥
    availableKeys = [
      ...keyStatus.free,
      ...keyStatus.unverified,
      ...keyStatus.valid
    ];
  }

  if (availableKeys.length === 0) {
    return null;
  }

  // 使用轮询策略选择密钥
  const keyToUse = availableKeys[currentKeyIndex % availableKeys.length];
  currentKeyIndex = (currentKeyIndex + 1) % availableKeys.length;

  return keyToUse;
}

// 获取下一个可用的 API 密钥
async function getNextApiKey(modelName = null, env) {
  if (keyStatus.valid.length === 0 && keyStatus.free.length === 0 && keyStatus.unverified.length === 0) {
    throw new Error('没有可用的 API 密钥');
  }

  // 每6小时检查一次健康状态并重新分类
  const now = Date.now();
  if (now - lastHealthCheck > 6 * 60 * 60 * 1000) {
    console.log('执行 API 密钥健康检查和重新分类...');
    await refreshKeyClassification(env);
    lastHealthCheck = now;
  }

  // 确定请求类型
  let requestType = 'unknown';
  if (modelName && modelName.endsWith(':free')) {
    requestType = 'free';
  } else if (modelName) {
    requestType = 'paid';
  }

  // 选择合适的密钥
  const keyToUse = selectKey(requestType, modelName);
  if (!keyToUse) {
    throw new Error(`没有找到适合 ${requestType} 请求类型的API密钥`);
  }

  console.log(`选择密钥 ${keyToUse.substring(0, 8)}... 用于 ${requestType} 请求`);
  return keyToUse;
}

// 刷新密钥分类
async function refreshKeyClassification(env) {
  // 清空分类
  keyStatus.invalid.length = 0;
  keyStatus.free.length = 0;
  keyStatus.unverified.length = 0;
  keyStatus.valid.length = 0;

  const keyValues = Object.keys(apiKeys);
  console.log(`开始重新分类 ${keyValues.length} 个API密钥...`);

  for (let i = 0; i < keyValues.length; i++) {
    const key = keyValues[i];
    console.log(`检查密钥 ${i + 1}/${keyValues.length}: ${key.substring(0, 8)}...`);

    const keyType = await classifyAndCheckKey(key);
    if (keyStatus[keyType]) {
      keyStatus[keyType].push(key);
    }

    // 更新密钥信息
    const creditSummary = await getCreditSummary(key);
    if (creditSummary) {
      apiKeys[key] = {
        type: keyType,
        balance: creditSummary.total_balance,
        usage: creditSummary.usage,
        limit: creditSummary.limit,
        isHealthy: keyType === 'valid' || keyType === 'unverified',
        lastChecked: Date.now()
      };
    }
  }

  // 保存更新后的状态
  await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));

  console.log(`密钥分类完成: 有效 ${keyStatus.valid.length}, 免费 ${keyStatus.free.length}, 未验证 ${keyStatus.unverified.length}, 无效 ${keyStatus.invalid.length}`);
}

// 获取管理页面 HTML 内容
async function getAdminHtml(env) {
  await initializeState(env);

  // 获取当前统计信息
  const stats = getCurrentStats();

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudRouter 管理面板</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: auto; background-color: #f4f4f4; }
        .container { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        h1, h2 { color: #333; }
        button { background-color: #3498db; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background-color 0.3s; margin-right: 5px; }
        button:hover { background-color: #2980b9; }
        button.danger { background-color: #e74c3c; }
        button.danger:hover { background-color: #c0392b; }
        input[type="text"], input[type="password"], textarea { width: calc(100% - 22px); padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #f0f0f0; }
        .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
        .status.healthy { background-color: #2ecc71; }
        .status.unhealthy { background-color: #e74c3c; }
        .status.unknown { background-color: #95a5a6; }
        .hidden { display: none; }
        #loading { text-align: center; padding: 20px; font-style: italic; color: #666; }
        .error-message { color: red; margin-bottom: 10px; }
        .success-message { color: green; margin-bottom: 10px; }
    </style>
</head>
<body>
    <h1>CloudRouter 管理面板</h1>
    <div id="loading">正在加载...</div>
    <div id="authSection" class="container hidden">
        <div id="setupSection" class="hidden">
            <h2>设置管理员密码</h2>
            <p>首次使用，请设置管理员密码。</p>
            <div id="setupError" class="error-message hidden"></div>
            <form id="setupForm">
                <label for="setupPassword">新密码:</label>
                <input type="password" id="setupPassword" required>
                <label for="confirmPassword">确认密码:</label>
                <input type="password" id="confirmPassword" required>
                <button type="submit">设置密码</button>
            </form>
        </div>
        <div id="loginSection" class="hidden">
            <h2>管理员登录</h2>
            <div id="loginError" class="error-message hidden"></div>
            <form id="loginForm">
                <label for="loginPassword">密码:</label>
                <input type="password" id="loginPassword" required>
                <button type="submit">登录</button>
            </form>
        </div>
    </div>
    <div id="mainContent" class="container hidden">
        <div style="display: flex; justify-content: space-between; align-items: center;">
             <h2>管理</h2>
             <button id="logoutButton">退出登录</button>
        </div>

        <div class="container" style="background: #e8f4f8; border: 1px solid #bee5eb;">
            <h3>📊 请求统计</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;">
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #007bff;">${stats.rpm}</div>
                    <div style="font-size: 12px; color: #666;">每分钟请求数 (RPM)</div>
                </div>
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #28a745;">${stats.tpm}</div>
                    <div style="font-size: 12px; color: #666;">每分钟Token数 (TPM)</div>
                </div>
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${stats.rpd}</div>
                    <div style="font-size: 12px; color: #666;">每日请求数 (RPD)</div>
                </div>
                <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
                    <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${stats.tpd}</div>
                    <div style="font-size: 12px; color: #666;">每日Token数 (TPD)</div>
                </div>
            </div>
            <p style="font-size: 12px; color: #666; margin: 0;">
                💡 <strong>统计说明:</strong> RPM/TPM显示最近1分钟内的数据，RPD/TPD显示最近24小时内的数据。
            </p>
        </div>

        <div class="container">
            <h3>API 密钥管理 (OpenRouter)</h3>
            <div id="apiKeyError" class="error-message hidden"></div>
            <div id="apiKeySuccess" class="success-message hidden"></div>
            <form id="addKeyForm" style="margin-bottom: 15px;">
                <label for="keyValue">密钥值 (每行一个，格式 sk-...):</label>
                <textarea id="keyValue" rows="3" placeholder="sk-abc123...&#10;sk-def456..." required></textarea>
                <button type="submit">批量添加密钥</button>
            </form>
            <h4>现有密钥:</h4>
            <table id="keysTable">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="selectAllKeys"></th>
                        <th>状态</th>
                        <th>密钥</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="keysList">
                    <tr><td colspan="4">正在加载...</td></tr>
                </tbody>
            </table>
             <button id="refreshKeysButton">重新加载</button>
             <button id="checkHealthButton">深度健康检查</button>
              <button id="batchDeleteKeysButton" class="danger" style="margin-left: 10px;">批量删除选中密钥</button>
             <p style="font-size: 12px; color: #666; margin-top: 10px;">
                 💡 <strong>提示</strong>: "深度健康检查" 会实际调用 OpenRouter API 测试每个密钥的可用性，包括数据策略检查。
             </p>
        </div>
        <div class="container">
            <h3>客户端 Token 管理</h3>
            <div id="tokenError" class="error-message hidden"></div>
            <div id="tokenSuccess" class="success-message hidden"></div>
            <form id="addTokenForm" style="margin-bottom: 15px;">
                <label for="tokenName">Token 名称:</label>
                <input type="text" id="tokenName" placeholder="例如：NextChat Token" required>
                <label for="customToken">自定义 Token (可选):</label>
                <input type="text" id="customToken" placeholder="留空则自动生成，或输入自定义 token">
                <button type="submit">创建 Token</button>
            </form>
            <h4>现有 Token:</h4>
            <table id="tokensTable">
                <thead>
                    <tr>
                        <th>名称</th>
                        <th>Token</th>
                        <th>状态</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="tokensList">
                    <tr><td colspan="5">正在加载...</td></tr>
                </tbody>
            </table>
             <button id="refreshTokensButton">刷新 Token 列表</button>
        </div>
        <div class="container">
            <h3>修改管理员密码</h3>
            <div id="changePasswordError" class="error-message hidden"></div>
            <div id="changePasswordSuccess" class="success-message hidden"></div>
            <form id="changePasswordForm">
                <label for="currentPassword">当前密码:</label>
                <input type="password" id="currentPassword" required>
                <label for="newPassword">新密码:</label>
                <input type="password" id="newPassword" required>
                <label for="confirmNewPassword">确认新密码:</label>
                <input type="password" id="confirmNewPassword" required>
                <button type="submit">修改密码</button>
            </form>
        </div>
        <div class="container">
             <h3>使用说明</h3>
             <p>将以下地址配置到你的 AI 客户端的 API Base URL:</p>
             <code id="apiUrl"></code>
             <p><strong>重要:</strong> 请使用上面生成的客户端 Token 作为 API Key。</p>
             <p><strong>Token 创建:</strong> 您可以自定义 Token 内容，或留空让系统自动生成。</p>
             <p><strong>安全提示:</strong> 每个 Token 都是唯一的，可以单独启用/禁用。建议为不同的应用创建不同的 Token。</p>
             <p><strong>注意:</strong> 管理员密码仅用于访问此管理面板，不用于 API 调用。</p>
        </div>
    </div>
    <script>
        const apiUrlBase = window.location.origin;
        const adminApiBase = apiUrlBase + '/api/admin';
        let adminPassword = null;
        
        const loadingDiv = document.getElementById('loading');
        const authSection = document.getElementById('authSection');
        const setupSection = document.getElementById('setupSection');
        const loginSection = document.getElementById('loginSection');
        const mainContent = document.getElementById('mainContent');
        const setupForm = document.getElementById('setupForm');
        const loginForm = document.getElementById('loginForm');
        const addKeyForm = document.getElementById('addKeyForm');
        const addTokenForm = document.getElementById('addTokenForm');
        const changePasswordForm = document.getElementById('changePasswordForm');
        const keysList = document.getElementById('keysList');
        const tokensList = document.getElementById('tokensList');
        const logoutButton = document.getElementById('logoutButton');
        const refreshKeysButton = document.getElementById('refreshKeysButton');
        const checkHealthButton = document.getElementById('checkHealthButton');
        const batchDeleteKeysButton = document.getElementById('batchDeleteKeysButton');
        const refreshTokensButton = document.getElementById('refreshTokensButton');
        const apiUrlCode = document.getElementById('apiUrl');
        
        function showMessage(elementId, message, isError = true) {
            const el = document.getElementById(elementId);
            el.textContent = message;
            el.className = isError ? 'error-message' : 'success-message';
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 5000);
        }
        const showSetupError = (msg) => showMessage('setupError', msg);
        const showLoginError = (msg) => showMessage('loginError', msg);
        const showApiKeyError = (msg) => showMessage('apiKeyError', msg);
        const showApiKeySuccess = (msg) => showMessage('apiKeySuccess', msg, false);
        const showTokenError = (msg) => showMessage('tokenError', msg);
        const showTokenSuccess = (msg) => showMessage('tokenSuccess', msg, false);
        const showChangePasswordError = (msg) => showMessage('changePasswordError', msg);
        const showChangePasswordSuccess = (msg) => showMessage('changePasswordSuccess', msg, false);
        
        async function apiCall(endpoint, method = 'GET', body = null, requiresAuth = true) {
            const headers = { 'Content-Type': 'application/json' };
            if (requiresAuth) {
                if (!adminPassword) {
                    console.error('Admin password not available for authenticated request');
                    showLogin();
                    return null;
                }
                headers['Authorization'] = 'Bearer ' + adminPassword;
            }
            
            const options = { method, headers };
            if (body) {
                options.body = JSON.stringify(body);
            }
            
            try {
                const response = await fetch(adminApiBase + endpoint, options);
                if (response.status === 401) {
                    adminPassword = null;
                    localStorage.removeItem('cloudrouter_admin_password');
                    showLogin();
                    showLoginError('认证失败或会话已过期，请重新登录。');
                    return null;
                }
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: '未知错误' }));
                    throw new Error(errorData.error || 'HTTP error! status: ' + response.status);
                }
                if (response.status === 204) {
                    return { success: true };
                }
                return await response.json();
            } catch (error) {
                console.error('API call failed for ' + method + ' ' + endpoint + ':', error);
                if (endpoint.startsWith('/keys')) showApiKeyError('操作失败: ' + error.message);
                else if (endpoint.startsWith('/tokens')) showTokenError('操作失败: ' + error.message);
                else if (endpoint.startsWith('/auth/change-password')) showChangePasswordError('操作失败: ' + error.message);
                else showLoginError('操作失败: ' + error.message);
                return null;
            }
        }
        
        async function checkAuthStatus() {
            console.log('checkAuthStatus: Starting...');
            loadingDiv.classList.remove('hidden');
            authSection.classList.add('hidden');
            mainContent.classList.add('hidden');
            
            try {
                const storedPassword = localStorage.getItem('cloudrouter_admin_password');
                let loggedIn = false;
                console.log('checkAuthStatus: Checking stored password...');
                
                if (storedPassword) {
                    console.log('checkAuthStatus: Found stored password. Verifying...');
                    adminPassword = storedPassword;
                    const loginResponse = await apiCall('/auth/login', 'POST', { password: adminPassword }, false);
                    if (loginResponse && loginResponse.success) {
                        console.log('checkAuthStatus: Stored password verified.');
                        loggedIn = true;
                    } else {
                        console.log('checkAuthStatus: Stored password invalid or verification failed.');
                        adminPassword = null;
                        localStorage.removeItem('cloudrouter_admin_password');
                    }
                } else {
                    console.log('checkAuthStatus: No stored password found.');
                }
                
                if (loggedIn) {
                    console.log('checkAuthStatus: Logged in. Showing main content...');
                    showMainContent();
                } else {
                    console.log('checkAuthStatus: Not logged in. Checking setup status...');
                    let statusData = null;
                    try {
                        const statusResponse = await fetch(adminApiBase + '/auth/status');
                        console.log('checkAuthStatus: Status API response status:', statusResponse.status);
                        if (!statusResponse.ok) {
                             throw new Error('Status check failed with status: ' + statusResponse.status);
                        }
                        statusData = await statusResponse.json();
                        console.log('checkAuthStatus: Status API response data:', statusData);
                    } catch (fetchError) {
                         console.error('checkAuthStatus: Failed to fetch or parse status API response:', fetchError);
                         showLogin();
                         showLoginError('无法检查服务器状态，请稍后重试。');
                         loadingDiv.classList.add('hidden');
                         return;
                    }
                    
                    if (statusData && statusData.isPasswordSet === false) {
                        console.log('checkAuthStatus: Password not set. Showing setup...');
                        showSetup();
                    } else {
                        console.log('checkAuthStatus: Password likely set or status unknown. Showing login...');
                        showLogin();
                    }
                }
            } catch (error) {
                console.error('checkAuthStatus: General error during auth check:', error);
                loadingDiv.textContent = '加载管理面板时出错，请刷新页面。';
                return;
            }
            
            console.log('checkAuthStatus: Hiding loading indicator.');
            loadingDiv.classList.add('hidden');
            console.log('checkAuthStatus: Finished.');
        }
        
        function showSetup() {
            authSection.classList.remove('hidden');
            setupSection.classList.remove('hidden');
            loginSection.classList.add('hidden');
            mainContent.classList.add('hidden');
        }
        
        function showLogin() {
            authSection.classList.remove('hidden');
            setupSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
            mainContent.classList.add('hidden');
        }
        
        function showMainContent() {
            authSection.classList.add('hidden');
            mainContent.classList.remove('hidden');
            apiUrlCode.textContent = apiUrlBase + '/v1';
            loadApiKeys();
            loadTokens();
        }
        
        setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('setupPassword').value;
            const confirm = document.getElementById('confirmPassword').value;
            
            if (password !== confirm) {
                showSetupError('两次输入的密码不匹配。');
                return;
            }
            if (password.length < 8) {
                 showSetupError('密码长度至少需要8位。');
                 return;
            }
            
            const result = await apiCall('/auth/setup', 'POST', { password }, false);
            if (result && result.success) {
                adminPassword = password;
                localStorage.setItem('cloudrouter_admin_password', password);
                showMainContent();
            } else {
                 showSetupError(result?.error || '设置密码失败。');
            }
        });
        
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('loginPassword').value;
            const result = await apiCall('/auth/login', 'POST', { password }, false);
             if (result && result.success) {
                adminPassword = password;
                localStorage.setItem('cloudrouter_admin_password', password);
                showMainContent();
            } else {
                showLoginError('登录失败：密码错误。');
            }
        });
        
        logoutButton.addEventListener('click', () => {
            adminPassword = null;
            localStorage.removeItem('cloudrouter_admin_password');
            showLogin();
        });
        
        async function loadApiKeys() {
            keysList.innerHTML = '<tr><td colspan="3">正在加载密钥...</td></tr>';
            const result = await apiCall('/keys');
            if (result && result.keys) {
                renderApiKeys(result.keys);
            } else if (result === null) {
                 keysList.innerHTML = '<tr><td colspan="3" style="color: red;">加载密钥失败，请检查登录状态。</td></tr>';
            } else {
                 keysList.innerHTML = '<tr><td colspan="3">没有找到 API 密钥。</td></tr>';
            }
        }
        
        function renderApiKeys(keys) {
            const keyValues = Object.keys(keys);
            if (keyValues.length === 0) {
                keysList.innerHTML = '<tr><td colspan="5">没有找到 API 密钥。请添加。</td></tr>';
                return;
            }
            keysList.innerHTML = keyValues.map(value => {
                const key = keys[value];
                const keyType = key.type || 'unknown';
                let statusIcon = '';
                let statusText = '';
                let statusClass = 'unknown';

                switch (keyType) {
                    case 'valid':
                        statusIcon = '✅';
                        statusText = '有效';
                        statusClass = 'healthy';
                        break;
                    case 'free':
                        statusIcon = '💰';
                        statusText = '免费';
                        statusClass = 'healthy';
                        break;
                    case 'unverified':
                        statusIcon = '⚠️';
                        statusText = '未验证';
                        statusClass = 'unknown';
                        break;
                    case 'invalid':
                        statusIcon = '❌';
                        statusText = '无效';
                        statusClass = 'unhealthy';
                        break;
                    default:
                        statusIcon = '⚪';
                        statusText = '未知';
                        statusClass = 'unknown';
                }

                const balance = key.balance !== undefined ? (key.balance === Infinity ? '无限' : key.balance.toFixed(4)) : '未知';
                const maskedValue = value.substring(0, 8) + '...' + value.substring(value.length - 8);
                const escapedValue = escapeHtml(value);

                return '<tr>' +
                    '<td><input type="checkbox" class="keyCheckbox" value="' + escapedValue + '"></td>' +
                    '<td><span class="status ' + statusClass + '"></span> ' + statusIcon + ' ' + statusText + '</td>' +
                    '<td><code style="font-size: 12px;">' + maskedValue + '</code></td>' +
                    '<td>' + balance + '</td>' +
                    '<td><button class="danger" onclick="deleteApiKey(\\'' + escapedValue + '\\')">删除</button></td>' +
                    '</tr>';
            }).join('');
        }
        
        function escapeHtml(unsafe) {
            if (!unsafe) return '';
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        }
        
        addKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const value = document.getElementById('keyValue').value.trim();

            if (!value) {
                showApiKeyError('密钥值不能为空。');
                return;
            }

            // 分割多行密钥
            const keys = value.split('\\n').map(k => k.trim()).filter(k => k);

            if (keys.length === 0) {
                showApiKeyError('密钥值不能为空。');
                return;
            }

            // 检查所有密钥格式
            for (const key of keys) {
                if (!key.startsWith('sk-')) {
                    showApiKeyError('OpenRouter API 密钥通常以 "sk-" 开头。');
                    return;
                }
            }

            // 批量添加密钥
            let successCount = 0;
            let errorMessages = [];

            for (const key of keys) {
                const result = await apiCall('/keys', 'POST', { value: key });
                if (result && result.success) {
                    successCount++;
                } else {
                    errorMessages.push(result?.error || '未知错误');
                }
            }

            if (successCount > 0) {
                showApiKeySuccess('成功添加 ' + successCount + ' 个API密钥！');
                addKeyForm.reset();
                loadApiKeys();
            }

            if (errorMessages.length > 0) {
                showApiKeyError('部分密钥添加失败: ' + errorMessages.join(', '));
            }
        });
        
        async function deleteApiKey(value) {
            const maskedValue = value.substring(0, 8) + '...' + value.substring(value.length - 8);
            if (!confirm('确定要删除密钥 "' + maskedValue + '" 吗？')) return;

            const result = await apiCall('/keys/' + encodeURIComponent(value), 'DELETE');
            if (result && result.success) {
                showApiKeySuccess('API 密钥删除成功！');
                loadApiKeys();
            }
        }
        
        refreshKeysButton.addEventListener('click', loadApiKeys);

        // 深度健康检查
        checkHealthButton.addEventListener('click', async () => {
            checkHealthButton.disabled = true;
            checkHealthButton.textContent = '检查中...';
            keysList.innerHTML = '<tr><td colspan="3">正在进行深度健康检查，请稍候...</td></tr>';

            try {
                const result = await apiCall('/keys/refresh', 'POST');
                if (result && result.success) {
                    showApiKeySuccess(result.message);
                    renderApiKeys(result.keys);
                } else {
                    showApiKeyError('健康检查失败');
                    loadApiKeys(); // 回退到普通加载
                }
            } catch (error) {
                showApiKeyError('健康检查时发生错误: ' + error.message);
                loadApiKeys(); // 回退到普通加载
            } finally {
                checkHealthButton.disabled = false;
                checkHealthButton.textContent = '深度健康检查';
            }
        });

        // Token 管理函数
        async function loadTokens() {
            tokensList.innerHTML = '<tr><td colspan="5">正在加载 Token...</td></tr>';
            const result = await apiCall('/tokens');
            if (result && result.tokens) {
                renderTokens(result.tokens);
            } else if (result === null) {
                 tokensList.innerHTML = '<tr><td colspan="5" style="color: red;">加载 Token 失败，请检查登录状态。</td></tr>';
            } else {
                 tokensList.innerHTML = '<tr><td colspan="5">没有找到 Token。</td></tr>';
            }
        }

        function renderTokens(tokens) {
            if (tokens.length === 0) {
                tokensList.innerHTML = '<tr><td colspan="5">没有找到 Token。请创建。</td></tr>';
                return;
            }
            tokensList.innerHTML = tokens.map(token => {
                const statusText = token.enabled ? '启用' : '禁用';
                const statusClass = token.enabled ? 'success-message' : 'error-message';
                const escapedName = escapeHtml(token.name);
                const maskedToken = token.token.substring(0, 8) + '...' + token.token.substring(token.token.length - 8);
                const createdDate = new Date(token.createdAt).toLocaleDateString();
                const toggleText = token.enabled ? '禁用' : '启用';

                return '<tr>' +
                    '<td>' + escapedName + '</td>' +
                    '<td><code style="font-size: 12px;">' + maskedToken + '</code> <button onclick="copyToken(\\'' + token.token + '\\')">复制</button></td>' +
                    '<td><span class="' + statusClass + '">' + statusText + '</span></td>' +
                    '<td>' + createdDate + '</td>' +
                    '<td>' +
                        '<button onclick="toggleToken(\\'' + escapedName + '\\', ' + !token.enabled + ')">' + toggleText + '</button> ' +
                        '<button class="danger" onclick="deleteToken(\\'' + escapedName + '\\')">删除</button>' +
                    '</td>' +
                    '</tr>';
            }).join('');
        }

        async function copyToken(token) {
            try {
                await navigator.clipboard.writeText(token);
                showTokenSuccess('Token 已复制到剪贴板！');
            } catch (err) {
                showTokenError('复制失败，请手动复制');
            }
        }

        async function toggleToken(name, enabled) {
            const result = await apiCall('/tokens/' + encodeURIComponent(name), 'PATCH', { enabled });
            if (result && result.success) {
                showTokenSuccess('Token 状态更新成功！');
                loadTokens();
            }
        }

        async function deleteToken(name) {
            if (!confirm('确定要删除 Token "' + name + '" 吗？')) return;

            const result = await apiCall('/tokens/' + encodeURIComponent(name), 'DELETE');
            if (result && result.success) {
                showTokenSuccess('Token 删除成功！');
                loadTokens();
            }
        }

        addTokenForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('tokenName').value.trim();
            const customToken = document.getElementById('customToken').value.trim();

            if (!name) {
                showTokenError('Token 名称不能为空。');
                return;
            }

            const requestData = { name };
            if (customToken) {
                requestData.token = customToken;
            }

            const result = await apiCall('/tokens', 'POST', requestData);
            if (result && result.success) {
                if (customToken) {
                    showTokenSuccess('Token 创建成功！使用了您的自定义 token: ' + result.token.token);
                } else {
                    showTokenSuccess('Token 创建成功！自动生成的 token: ' + result.token.token);
                }
                addTokenForm.reset();
                loadTokens();
            }
        });

        refreshTokensButton.addEventListener('click', loadTokens);

        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;
            
            if (newPassword !== confirmNewPassword) {
                showChangePasswordError('新密码和确认密码不匹配。');
                return;
            }
             if (newPassword.length < 8) {
                 showChangePasswordError('新密码长度至少需要8位。');
                 return;
            }
            if (currentPassword !== adminPassword) {
                 showChangePasswordError('当前密码不正确。');
                 return;
            }
            
            const result = await apiCall('/auth/change-password', 'POST', { currentPassword, newPassword });
            if (result && result.success) {
                showChangePasswordSuccess('密码修改成功！请使用新密码重新登录。');
                adminPassword = newPassword;
                localStorage.setItem('cloudrouter_admin_password', newPassword);
                changePasswordForm.reset();
            }
        });
        
        // 批量删除功能
        batchDeleteKeysButton.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('.keyCheckbox:checked');
            const selectedKeys = Array.from(checkboxes).map(cb => cb.value);

            if (selectedKeys.length === 0) {
                showApiKeyError('请选择要删除的密钥。');
                return;
            }

            if (!confirm('确定要删除选中的 ' + selectedKeys.length + ' 个密钥吗？此操作不可撤销。')) {
                return;
            }

            const result = await apiCall('/keys/batch-delete', 'POST', { keys: selectedKeys });
            if (result && result.success) {
                showApiKeySuccess('批量删除成功！删除了 ' + selectedKeys.length + ' 个密钥。');
                loadApiKeys();
            }
        });

        // 全选功能
        const selectAllCheckbox = document.getElementById('selectAllKeys');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('.keyCheckbox');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        }

        document.addEventListener('DOMContentLoaded', checkAuthStatus);
    </script>
</body>
</html>`;
    return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// --- API 路由 ---

// --- 健康监控和统计 API ---
router.get('/ping', async (request, env) => {
  await initializeState(env);

  const uptime = Date.now() - serviceStartTime;
  const uptimeStr = new Date(uptime).toISOString().substr(11, 8); // HH:MM:SS format

  const stats = getCurrentStats();

  // 统计API密钥数量
  const validKeysCount = keyStatus.valid.length;
  const freeKeysCount = keyStatus.free.length;
  const unverifiedKeysCount = keyStatus.unverified.length;
  const totalKeys = Object.keys(apiKeys).length;

  // 统计模型数量（简化版，从OpenRouter获取）
  let modelsCount = 0;
  try {
    const apiKey = await getNextApiKey(null, env);
    const modelsResponse = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json();
      modelsCount = modelsData.data ? modelsData.data.length : 0;
    }
  } catch (error) {
    console.error('获取模型数量失败:', error);
  }

  const statusInfo = {
    status: "running",
    service: {
      start_time: new Date(serviceStartTime).toISOString(),
      uptime: uptimeStr,
    },
    system: {
      platform: "Cloudflare Worker",
      version: "1.0.0"
    },
    api_keys: {
      valid: validKeysCount,
      free: freeKeysCount,
      unverified: unverifiedKeysCount,
      total: totalKeys
    },
    models: {
      total: modelsCount
    },
    requests: {
      per_minute: stats.rpm,
      per_day: stats.rpd,
      tokens_per_minute: stats.tpm,
      tokens_per_day: stats.tpd
    },
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(statusInfo), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// --- 管理员认证 API ---
router.get('/api/admin/auth/status', async (request, env) => {
  await initializeState(env);
  return new Response(JSON.stringify({ isPasswordSet: !!adminPasswordHash }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.post('/api/admin/auth/setup', async (request, env) => {
  await initializeState(env);
  if (adminPasswordHash) {
    return new Response(JSON.stringify({ error: '密码已设置' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { password } = await request.json();
    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: '密码无效或太短（至少8位）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const newHash = await hashPassword(password);
    await env.ROUTER_KV.put(KV_KEYS.ADMIN_PASSWORD_HASH, newHash);
    adminPasswordHash = newHash;

    return new Response(JSON.stringify({ success: true, message: '管理员密码设置成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("密码设置失败:", error);
    return new Response(JSON.stringify({ error: '设置密码时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.post('/api/admin/auth/login', async (request, env) => {
  await initializeState(env);
  if (!adminPasswordHash) {
    return new Response(JSON.stringify({ error: '管理员密码尚未设置' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { password } = await request.json();
    const isValid = await verifyPassword(password, adminPasswordHash);

    if (isValid) {
      return new Response(JSON.stringify({ success: true, message: '登录成功' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: '密码错误' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
     console.error("登录失败:", error);
     return new Response(JSON.stringify({ error: '登录时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.post('/api/admin/auth/change-password', requireAdminAuth, async (request, env) => {
  try {
    const { newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: '新密码无效或太短（至少8位）' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const newHash = await hashPassword(newPassword);
    await env.ROUTER_KV.put(KV_KEYS.ADMIN_PASSWORD_HASH, newHash);
    adminPasswordHash = newHash;

    return new Response(JSON.stringify({ success: true, message: '密码修改成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("密码修改失败:", error);
    return new Response(JSON.stringify({ error: '修改密码时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- API 密钥管理 ---
router.get('/api/admin/keys', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  return new Response(JSON.stringify({ success: true, keys: apiKeys }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// 手动刷新所有密钥健康状态
router.post('/api/admin/keys/refresh', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    console.log('开始手动刷新所有密钥状态和分类...');
    await refreshKeyClassification(env);
    lastHealthCheck = Date.now();

    const validCount = keyStatus.valid.length;
    const freeCount = keyStatus.free.length;
    const unverifiedCount = keyStatus.unverified.length;
    const invalidCount = keyStatus.invalid.length;
    const totalKeys = Object.keys(apiKeys).length;

    console.log(`密钥分类完成: 有效 ${validCount}, 免费 ${freeCount}, 未验证 ${unverifiedCount}, 无效 ${invalidCount}`);

    return new Response(JSON.stringify({
      success: true,
      message: `密钥检查完成: 有效 ${validCount}, 免费 ${freeCount}, 未验证 ${unverifiedCount}, 无效 ${invalidCount}`,
      keys: apiKeys,
      status: {
        valid: validCount,
        free: freeCount,
        unverified: unverifiedCount,
        invalid: invalidCount,
        total: totalKeys
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("刷新密钥状态失败:", error);
    return new Response(JSON.stringify({ error: '刷新密钥状态时发生内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

router.post('/api/admin/keys', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { value } = await request.json();
    if (!value) {
      return new Response(JSON.stringify({ error: '密钥值不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 检查是否已存在相同的密钥
    if (value in apiKeys) {
      return new Response(JSON.stringify({ error: '密钥已存在' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 分类并检查密钥
    console.log(`添加新密钥: ${value.substring(0, 8)}...`);
    const keyType = await classifyAndCheckKey(value);

    // 添加到密钥状态分类
    if (keyStatus[keyType]) {
      keyStatus[keyType].push(value);
    }

    // 获取信用额度信息
    const creditSummary = await getCreditSummary(value);
    apiKeys[value] = {
      type: keyType,
      balance: creditSummary ? creditSummary.total_balance : 0,
      usage: creditSummary ? creditSummary.usage : 0,
      limit: creditSummary ? creditSummary.limit : 0,
      isHealthy: keyType === 'valid' || keyType === 'unverified',
      lastChecked: Date.now()
    };

    // 保存到 KV
    await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));

    console.log(`密钥 ${value.substring(0, 8)}... 添加成功，分类为: ${keyType}`);
    return new Response(JSON.stringify({
      success: true,
      message: 'API 密钥添加成功',
      key: {
        value,
        type: keyType,
        balance: apiKeys[value].balance,
        isHealthy: apiKeys[value].isHealthy
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("添加 API 密钥失败:", error);
    return new Response(JSON.stringify({ error: '添加密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.delete('/api/admin/keys/:value', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { value } = request.params;

    if (!(value in apiKeys)) {
      return new Response(JSON.stringify({ error: '密钥不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    delete apiKeys[value];
    await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));

    return new Response(JSON.stringify({ success: true, message: 'API 密钥删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("删除 API 密钥失败:", error);
    return new Response(JSON.stringify({ error: '删除密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// 批量删除 API 密钥
router.post('/api/admin/keys/batch-delete', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { keys } = await request.json();

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return new Response(JSON.stringify({ error: '密钥列表不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    let deletedCount = 0;
    for (const key of keys) {
      if (key in apiKeys) {
        delete apiKeys[key];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await env.ROUTER_KV.put(KV_KEYS.API_KEYS, JSON.stringify(apiKeys));
    }

    return new Response(JSON.stringify({
      success: true,
      message: `成功删除 ${deletedCount} 个API密钥`,
      deletedCount
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("批量删除 API 密钥失败:", error);
    return new Response(JSON.stringify({ error: '批量删除密钥时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- 客户端 Token 管理 ---
router.get('/api/admin/tokens', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  return new Response(JSON.stringify({ success: true, tokens: clientTokens }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

router.post('/api/admin/tokens', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name, token } = await request.json();
    if (!name) {
      return new Response(JSON.stringify({ error: 'Token 名称不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 检查是否已存在相同名称的 token
    if (clientTokens.some(t => t.name === name)) {
      return new Response(JSON.stringify({ error: 'Token 名称已存在' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 处理 token 值
    let tokenValue;
    if (token && token.trim()) {
      // 使用用户提供的自定义 token
      tokenValue = token.trim();

      // 检查是否已存在相同的 token 值
      if (clientTokens.some(t => t.token === tokenValue)) {
        return new Response(JSON.stringify({ error: 'Token 值已存在，请使用不同的 token' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else {
      // 自动生成 token
      tokenValue = generateToken();
    }

    // 创建新的 token
    const newToken = {
      name,
      token: tokenValue,
      enabled: true,
      createdAt: new Date().toISOString()
    };
    clientTokens.push(newToken);

    // 保存到 KV
    await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));

    return new Response(JSON.stringify({
      success: true,
      message: 'Token 创建成功',
      token: newToken
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("创建 Token 失败:", error);
    return new Response(JSON.stringify({ error: '创建 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.patch('/api/admin/tokens/:name', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name } = request.params;
    const { enabled } = await request.json();

    const tokenIndex = clientTokens.findIndex(token => token.name === name);
    if (tokenIndex === -1) {
      return new Response(JSON.stringify({ error: 'Token 不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    clientTokens[tokenIndex].enabled = enabled;
    await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));

    return new Response(JSON.stringify({ success: true, message: 'Token 状态更新成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("更新 Token 失败:", error);
    return new Response(JSON.stringify({ error: '更新 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.delete('/api/admin/tokens/:name', requireAdminAuth, async (request, env) => {
  await initializeState(env);
  try {
    const { name } = request.params;
    const tokenIndex = clientTokens.findIndex(token => token.name === name);

    if (tokenIndex === -1) {
      return new Response(JSON.stringify({ error: 'Token 不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    clientTokens.splice(tokenIndex, 1);
    await env.ROUTER_KV.put(KV_KEYS.CLIENT_TOKENS, JSON.stringify(clientTokens));

    return new Response(JSON.stringify({ success: true, message: 'Token 删除成功' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("删除 Token 失败:", error);
    return new Response(JSON.stringify({ error: '删除 Token 时发生内部错误' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- OpenAI 兼容 API ---
router.get('/v1/models', async (request, env) => {
  await initializeState(env);

  // 客户端 token 验证
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: { message: '未提供认证信息', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7);
  if (!verifyClientToken(token)) {
    return new Response(JSON.stringify({ error: { message: '无效的 API 密钥', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const apiKey = await getNextApiKey(null, env);
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API 错误: ${response.status}`);
    }

    const data = await response.text();
    return new Response(data, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return new Response(JSON.stringify({ error: { message: '获取模型列表失败', type: 'api_error' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

router.post('/v1/chat/completions', async (request, env) => {
  await initializeState(env);

  // 客户端 token 验证
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: { message: '未提供认证信息', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const token = authHeader.substring(7);
  if (!verifyClientToken(token)) {
    return new Response(JSON.stringify({ error: { message: '无效的 API 密钥', type: 'invalid_request_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const requestBody = await request.json();
    const apiKey = await getNextApiKey(requestBody.model, env);

    // 检查是否为免费请求并应用限制
    const isFreeRequest = requestBody.model && requestBody.model.endsWith(':free');
    if (isFreeRequest) {
      const currentCount = incrementFreeRequests(apiKey);
      if (currentCount > FREE_REQUESTS_LIMIT) {
        console.warn(`API密钥 ${apiKey.substring(0, 8)}... 已达到每日免费请求限制 (${FREE_REQUESTS_LIMIT})`);
        return new Response(JSON.stringify({
          error: { message: 'Daily free request limit exceeded', type: 'rate_limit_error' }
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // 检查是否为流式请求
    const isStream = requestBody.stream === true;

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: { message: 'OpenRouter API 请求失败', type: 'api_error' } }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } });
    }

    if (isStream) {
      // 处理流式响应
      const { readable, writable } = new TransformStream();

      // 异步处理流式数据
      (async () => {
        const reader = response.body.getReader();
        const writer = writable.getWriter();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
          }
        } catch (error) {
          console.error('流式传输错误:', error);
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        status: response.status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
        },
      });
    } else {
      // 非流式响应
      const responseData = await response.text();
      const responseJson = JSON.parse(responseData);

      // 更新统计信息
      const usage = responseJson.usage || {};
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      updateRequestStats(promptTokens, completionTokens);

      return new Response(responseData, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('聊天完成请求失败:', error);
    return new Response(JSON.stringify({ error: { message: '聊天完成请求失败', type: 'api_error' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

// --- 主页路由 ---
router.get('/', async (request, env) => {
  return await getAdminHtml(env);
});

// 404 处理
router.all('*', () => new Response('Not Found', { status: 404 }));

// --- 导出 ---
export default {
  async fetch(request, env, ctx) {
    await initializeState(env);
    return router.handle(request, env, ctx);
  },
};
