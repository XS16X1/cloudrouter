// 获取管理页面 HTML 内容
export async function getAdminHtml(env) {
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
        input[type="text"], input[type="password"] { width: calc(100% - 22px); padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; }
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
                <input type="password" id="setupPassword" autocomplete="new-password" required>
                <label for="confirmPassword">确认密码:</label>
                <input type="password" id="confirmPassword" autocomplete="new-password" required>
                <button type="submit">设置密码</button>
            </form>
        </div>
        <div id="loginSection" class="hidden">
            <h2>管理员登录</h2>
            <div id="loginError" class="error-message hidden"></div>
            <form id="loginForm">
                <label for="loginPassword">密码:</label>
                <input type="password" id="loginPassword" autocomplete="current-password" required>
                <button type="submit">登录</button>
            </form>
        </div>
    </div>
    <div id="mainContent" class="container hidden">
        <div style="display: flex; justify-content: space-between; align-items: center;">
             <h2>管理</h2>
             <button id="logoutButton">退出登录</button>
        </div>
        <div class="container">
            <h3>API 密钥管理 (OpenRouter)</h3>
            <div id="apiKeyError" class="error-message hidden"></div>
            <div id="apiKeySuccess" class="success-message hidden"></div>
            <form id="addKeyForm" style="margin-bottom: 15px;">
                <label for="keyName">密钥名称:</label>
                <input type="text" id="keyName" placeholder="例如：My Key 1" required>
                <label for="keyValue">密钥值 (sk-...):</label>
                <input type="password" id="keyValue" autocomplete="current-password" required>
                <button type="submit">添加密钥</button>
            </form>
            
            <!-- 批量操作区域 -->
            <div class="batch-operations" style="margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
                <h4>批量操作</h4>
                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <!-- 批量添加 -->
                    <div style="flex: 1; min-width: 300px;">
                        <h5>批量添加 API 密钥</h5>
                        <div id="batchAddError" class="error-message hidden"></div>
                        <div id="batchAddSuccess" class="success-message hidden"></div>
                        <textarea id="batchKeysInput" placeholder="请输入多个 API 密钥，每行一个\n例如：\nsk-key1\nsk-key2\nsk-key3" rows="5" style="width: 100%; padding: 8px; margin-bottom: 10px;"></textarea>
                        <button id="batchAddButton">批量添加密钥</button>
                    </div>
                    
                    <!-- 批量删除 -->
                    <div style="flex: 1; min-width: 300px;">
                        <h5>批量删除 API 密钥</h5>
                        <div id="batchDeleteError" class="error-message hidden"></div>
                        <div id="batchDeleteSuccess" class="success-message hidden"></div>
                        <div id="keysChecklist" style="max-height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin-bottom: 10px;">
                            <!-- 密钥复选框将在这里动态生成 -->
                        </div>
                        <button id="batchDeleteButton" class="danger">批量删除选中</button>
                        <button id="selectAllButton" style="margin-left: 10px;">全选/取消全选</button>
                    </div>
                </div>
            </div>
            <h4>现有密钥:</h4>
            <table id="keysTable">
                <thead>
                    <tr>
                        <th>状态</th>
                        <th>名称</th>
                        <th>今日请求次数</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="keysList">
                    <tr><td colspan="4">正在加载...</td></tr>
                </tbody>
            </table>
             <button id="refreshKeysButton">重新加载</button>
             <button id="checkHealthButton">深度健康检查</button>
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
                <input type="password" id="currentPassword" autocomplete="current-password" required>
                <label for="newPassword">新密码:</label>
                <input type="password" id="newPassword" autocomplete="new-password" required>
                <label for="confirmNewPassword">确认新密码:</label>
                <input type="password" id="confirmNewPassword" autocomplete="new-password" required>
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
        const refreshTokensButton = document.getElementById('refreshTokensButton');
        const apiUrlCode = document.getElementById('apiUrl');
        
        // 批量操作相关元素
        const batchKeysInput = document.getElementById('batchKeysInput');
        const batchAddButton = document.getElementById('batchAddButton');
        const batchDeleteButton = document.getElementById('batchDeleteButton');
        const selectAllButton = document.getElementById('selectAllButton');
        const keysChecklist = document.getElementById('keysChecklist');
        
        // 消息显示函数
        const showBatchAddError = (msg) => showMessage('batchAddError', msg);
        const showBatchAddSuccess = (msg) => showMessage('batchAddSuccess', msg, false);
        const showBatchDeleteError = (msg) => showMessage('batchDeleteError', msg);
        const showBatchDeleteSuccess = (msg) => showMessage('batchDeleteSuccess', msg, false);
        
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
            keysList.innerHTML = '<tr><td colspan="4">正在加载密钥...</td></tr>';
            const [keysResult, countsResult] = await Promise.all([
                apiCall('/keys'),
                apiCall('/keys/request-counts')
            ]);
            
            if (keysResult && keysResult.keys) {
                const counts = countsResult ? countsResult.counts : {};
                renderApiKeys(keysResult.keys, counts);
                updateKeysChecklist(keysResult.keys);
            } else if (keysResult === null) {
                 keysList.innerHTML = '<tr><td colspan="4" style="color: red;">加载密钥失败，请检查登录状态。</td></tr>';
            } else {
                 keysList.innerHTML = '<tr><td colspan="4">没有找到 API 密钥。</td></tr>';
            }
        }
        
        function renderApiKeys(keys, counts = {}) {
            if (keys.length === 0) {
                keysList.innerHTML = '<tr><td colspan="4">没有找到 API 密钥。请添加。</td></tr>';
                return;
            }
            keysList.innerHTML = keys.map(key => {
                const statusClass = key.isHealthy === true ? 'healthy' : (key.isHealthy === false ? 'unhealthy' : 'unknown');
                let statusText = key.isHealthy === true ? '✅ 可用' : (key.isHealthy === false ? '❌ 不可用' : '⚪ 未检测');

                // 如果是不可用状态，添加更多信息
                if (key.isHealthy === false) {
                    statusText += '<br><small style="color: #999;">可能原因: 数据策略限制、余额不足或密钥无效</small>';
                }

                const escapedName = escapeHtml(key.name);
                return '<tr>' +
                    '<td><span class="status ' + statusClass + '"></span> ' + statusText + '</td>' +
                    '<td>' + escapedName + '</td>' +
                    '<td><button class="danger" onclick="deleteApiKey(\\'' + escapedName + '\\')">删除</button></td>' +
                    '</tr>';
            }).join('');
        }
        
        function escapeHtml(unsafe) {
            if (!unsafe) return '';
            return unsafe
                 .replace(/&/g, "&")
                 .replace(/</g, "<")
                 .replace(/>/g, ">")
                 .replace(/"/g, """)
                 .replace(/'/g, "&#039;");
        }
        
        addKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('keyName').value.trim();
            const value = document.getElementById('keyValue').value.trim();
            
            if (!name || !value) {
                showApiKeyError('密钥名称和值不能为空。');
                return;
            }
             if (!value.startsWith('sk-')) {
                 showApiKeyError('OpenRouter API 密钥通常以 "sk-" 开头。');
             }
            
            const result = await apiCall('/keys', 'POST', { name, value });
            if (result && result.success) {
                showApiKeySuccess('API 密钥添加成功！');
                addKeyForm.reset();
                loadApiKeys();
            }
        });
        
        async function deleteApiKey(name) {
            if (!confirm('确定要删除密钥 "' + name + '" 吗？')) return;
            
            const result = await apiCall('/keys/' + encodeURIComponent(name), 'DELETE');
            if (result && result.success) {
                showApiKeySuccess('API 密钥删除成功！');
                loadApiKeys();
            }
        }
        
        refreshKeysButton.addEventListener('click', loadApiKeys);

        // 批量操作函数
        function updateKeysChecklist(keys) {
            keysChecklist.innerHTML = keys.map(key => {
                const escapedName = escapeHtml(key.name);
                return '<label style="display: block; margin-bottom: 5px;">' +
                    '<input type="checkbox" name="keyToDelete" value="' + escapedName + '" style="margin-right: 5px;">' +
                    escapedName +
                    '</label>';
            }).join('');
        }

        // 批量添加 API 密钥
        batchAddButton.addEventListener('click', async () => {
            const keysText = batchKeysInput.value.trim();
            if (!keysText) {
                showBatchAddError('请输入要添加的 API 密钥');
                return;
            }

            const keys = keysText.split('\n').map(key => key.trim()).filter(key => key);
            if (keys.length === 0) {
                showBatchAddError('请输入有效的 API 密钥');
                return;
            }

            batchAddButton.disabled = true;
            batchAddButton.textContent = '添加中...';

            try {
                const result = await apiCall('/keys/batch-add', 'POST', { keys });
                if (result && result.success) {
                    showBatchAddSuccess(result.message);
                    batchKeysInput.value = '';
                    loadApiKeys();
                }
            } catch (error) {
                showBatchAddError('批量添加失败: ' + error.message);
            } finally {
                batchAddButton.disabled = false;
                batchAddButton.textContent = '批量添加密钥';
            }
        });

        // 批量删除 API 密钥
        batchDeleteButton.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('input[name="keyToDelete"]:checked');
            const namesToDelete = Array.from(checkboxes).map(cb => cb.value);
            
            if (namesToDelete.length === 0) {
                showBatchDeleteError('请选择要删除的密钥');
                return;
            }

            if (!confirm('确定要删除选中的 ' + namesToDelete.length + ' 个密钥吗？')) {
                return;
            }

            batchDeleteButton.disabled = true;
            batchDeleteButton.textContent = '删除中...';

            try {
                const result = await apiCall('/keys/batch-delete', 'POST', { names: namesToDelete });
                if (result && result.success) {
                    showBatchDeleteSuccess(result.message);
                    loadApiKeys();
                }
            } catch (error) {
                showBatchDeleteError('批量删除失败: ' + error.message);
            } finally {
                batchDeleteButton.disabled = false;
                batchDeleteButton.textContent = '批量删除选中';
            }
        });

        // 全选/取消全选
        selectAllButton.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('input[name="keyToDelete"]');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
            });
            
            selectAllButton.textContent = allChecked ? '全选' : '取消全选';
        });

        // 深度健康检查
        checkHealthButton.addEventListener('click', async () => {
            checkHealthButton.disabled = true;
            checkHealthButton.textContent = '检查中...';
            keysList.innerHTML = '<tr><td colspan="4">正在进行深度健康检查，请稍候...</td></tr>';

            try {
                const result = await apiCall('/keys/refresh', 'POST');
                if (result && result.success) {
                    showApiKeySuccess(result.message);
                    loadApiKeys();
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
        
        document.addEventListener('DOMContentLoaded', checkAuthStatus);
    </script>
</body>
</html>`;
    return new Response(htmlContent, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
