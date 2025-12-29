// HTML模板文件 - 优化版本

export function getAdminPageHtml(originUrl, rpm, tpm, rpd, tpd) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudRouter 管理面板</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            line-height: 1.6; 
            padding: 20px; 
            max-width: 800px; 
            margin: auto; 
            background: #f5f5f5; 
        }
        .container { 
            background: #fff; 
            padding: 30px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            margin-bottom: 20px; 
        }
        h1, h2 { 
            color: #333; 
            margin-bottom: 20px; 
        }
        .status { 
            display: inline-block; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-size: 12px; 
            font-weight: 500; 
            background: #d4edda; 
            color: #155724; 
        }
        .api-info { 
            background: #e3f2fd; 
            border: 1px solid #bbdefb; 
            padding: 20px; 
            border-radius: 6px; 
            margin-bottom: 20px; 
        }
        .key-list { margin-top: 20px; }
        .key-item { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 10px; 
            border-bottom: 1px solid #eee; 
        }
        .key-item:last-child { border-bottom: none; }
        .key-value { 
            font-family: monospace; 
            background: #f8f9fa; 
            padding: 4px 8px; 
            border-radius: 4px; 
        }
        .delete-btn { 
            background: #dc3545; 
            color: white; 
            border: none; 
            padding: 6px 12px; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 12px; 
        }
        .delete-btn:hover { background: #c82333; }
        .add-form { margin-top: 20px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { 
            display: block; 
            margin-bottom: 5px; 
            font-weight: 500; 
        }
        .form-group input, .form-group textarea { 
            width: 100%; 
            padding: 8px 12px; 
            border: 1px solid #ddd; 
            border-radius: 4px; 
            font-family: monospace; 
        }
        .form-group textarea { 
            resize: vertical; 
            min-height: 100px; 
        }
        /* 新增：响应式网格布局 */
        .form-row { 
            display: grid; 
            gap: 15px; 
            /* 默认移动端单列 */
            grid-template-columns: 1fr;
        }
        /* 桌面端三列在一排 */
        @media (min-width: 768px) {
            .form-row {
                grid-template-columns: 2fr 3fr 1.5fr; /* 客户端名称 : Token : 过期时间 */
                align-items: start;
            }
        }

        .form-row .form-group { 
            margin-bottom: 0; 
            min-width: 0; /* 防止内容溢出 */
        }
        
        /* 移除旧的 flex 宽度设置，由 grid 接管 */
        .form-row .form-group:nth-child(1),
        .form-row .form-group:nth-child(2),
        .form-row .form-group:nth-child(3) {
            flex: unset;
            min-width: unset;
        }
        .expire-inputs {
            display: flex;
            position: relative;
            align-items: center;
        }
        .expire-inputs input {
            flex: 1;
            padding-right: 60px; /* 为下拉菜单留出空间 */
        }
        .expire-inputs select {
            position: absolute;
            right: 1px;
            top: 1px;
            bottom: 1px;
            border: none;
            background: transparent;
            padding: 0 5px;
            cursor: pointer;
            height: calc(100% - 2px);
            border-left: 1px solid #ddd;
            border-radius: 0 4px 4px 0;
            background-color: #f8f9fa;
        }
        .expire-inputs select:focus {
            outline: none;
            background-color: #e9ecef;
        }
        .copy-btn { 
            background: #28a745; 
            color: white; 
            border: none; 
            padding: 4px 8px; 
            border-radius: 3px; 
            cursor: pointer; 
            font-size: 12px; 
            margin-left: 5px; 
        }
        .copy-btn:hover { background: #218838; }
        .copy-btn.copied { background: #17a2b8; }
        .batch-controls { 
            margin-top: 20px; 
            padding: 15px; 
            background: #f8f9fa; 
            border-radius: 6px; 
        }
        .batch-delete-btn { 
            background: #dc3545; 
            color: white; 
            border: none; 
            padding: 8px 16px; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 14px; 
        }
        .batch-delete-btn:hover { background: #c82333; }
        .batch-delete-btn:disabled { 
            background: #6c757d; 
            cursor: not-allowed; 
        }
        .select-all-checkbox { margin-right: 10px; }
        .submit-btn { 
            background: #007bff; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 14px; 
        }
        .submit-btn:hover { background: #0056b3; }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
            gap: 10px; 
            margin-bottom: 20px; 
        }
        .stat-card { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 6px; 
            text-align: center; 
        }
        .stat-number { 
            font-size: 24px; 
            font-weight: bold; 
            color: #007bff; 
        }
        .stat-label { 
            font-size: 12px; 
            color: #6c757d; 
            margin-top: 5px; 
        }
        .token-list { margin-top: 20px; }
        .token-item { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 10px; 
            border-bottom: 1px solid #eee; 
        }
        .token-item:last-child { border-bottom: none; }
        .token-value { 
            font-family: monospace; 
            background: #f8f9fa; 
            padding: 4px 8px; 
            border-radius: 4px; 
            word-break: break-all; 
        }
        .expired { 
            background: #f8d7da; 
            color: #721c24; 
        }
        .expiring-soon { 
            background: #fff3cd; 
            color: #856404; 
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
        }
        th, td { 
            padding: 10px; 
            text-align: left; 
            border-bottom: 1px solid #dee2e6; 
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 CloudRouter 管理面板</h1>
        <div style="text-align: right; margin-bottom: 20px;">
            <button onclick="changePassword()" class="submit-btn" style="background: #28a745; width: auto; padding: 6px 12px; font-size: 14px; margin-right: 10px;">修改密码</button>
            <a href="/logout" class="submit-btn" style="background: #6c757d; text-decoration: none; padding: 6px 12px; font-size: 14px;">退出登录</a>
        </div>
        
        <div class="api-info">
            <h3>API 端点信息</h3>
            <p>
                <strong>API Base URL:</strong> 
                <code id="apiBaseUrl">${originUrl}/v1</code>
                <button class="copy-btn" id="copyBtn" data-action="copy-api-url">复制</button>
            </p>
            <p><strong>支持模型:</strong> 所有OpenRouter支持的模型</p>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${rpm}</div>
                <div class="stat-label">每分钟请求数 (RPM)</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${tpm}</div>
                <div class="stat-label">每分钟Token数 (TPM)</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${rpd}</div>
                <div class="stat-label">每日请求数 (RPD)</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${tpd}</div>
                <div class="stat-label">每日Token数 (TPD)</div>
            </div>
        </div>

        <h2>API 密钥管理</h2>
        
        <div class="add-form">
            <h3>添加新密钥（支持批量添加）</h3>
            <form id="addKeyForm">
                <div class="form-group">
                    <label for="keyValue">API 密钥列表：</label>
                    <textarea id="keyValue" placeholder="sk-or-v1-key1&#10;sk-or-v1-key2,sk-or-v1-key3&#10;或者每行一个"></textarea>
                    <small style="color: #666; font-size: 12px;">支持逗号分隔或换行分隔，可以输入多个密钥</small>
                </div>
                <button type="submit" class="submit-btn">添加密钥</button>
            </form>
        </div>

        <div class="key-list">
            <h3>现有密钥 (<span id="keysCount">0</span>)</h3>
            <div id="keysList">
                <p>请刷新页面查看最新密钥列表</p>
            </div>
            <div class="batch-controls" id="batchControls" style="display: none;">
                <input type="checkbox" id="selectAll" class="select-all-checkbox">
                <label for="selectAll">全选</label>
                <button class="batch-delete-btn" id="batchDeleteBtn" disabled>删除选中 (<span id="selectedCount">0</span>)</button>
            </div>
        </div>
    </div>

    <div class="container">
        <h2>客户端 Token 管理</h2>
        
        <div class="add-form">
            <h3>生成新客户端 Token</h3>
            <form id="addTokenForm">
                <div class="form-row">
                    <div class="form-group">
                        <label for="tokenName">客户端名称（可选）：</label>
                        <input type="text" id="tokenName" placeholder="留空将自动生成，如：客户端1、客户端2" value="">
                        <small style="color: #666; font-size: 12px;">留空时将自动生成"客户端+数字"格式的名称</small>
                    </div>
                    <div class="form-group">
                        <label for="customToken">自定义 Token（可选）：</label>
                        <input type="text" id="customToken" placeholder="留空将自动生成，如：cr_YourCustomToken" value="">
                        <small style="color: #666; font-size: 12px;">留空时自动生成，支持自定义任意字符</small>
                    </div>
                    <div class="form-group">
                        <label>过期时间：</label>
                        <div class="expire-inputs">
                            <input type="number" id="expireValue" placeholder="30" value="30" min="1">
                            <select id="expireUnit">
                                <option value="years">年</option>
                                <option value="days" selected>日</option>
                                <option value="hours">时</option>
                                <option value="minutes">分</option>
                                <option value="seconds">秒</option>
                            </select>
                        </div>
                        <small style="color: #666; font-size: 12px;">设置token有效期</small>
                    </div>
                </div>
                <button type="submit" class="submit-btn">生成 Token</button>
            </form>
        </div>

        <div class="token-list">
            <h3>现有客户端 Token (<span id="tokensCount">0</span>)</h3>
            <div id="tokensList">
                <p>请刷新页面查看最新Token列表</p>
            </div>
        </div>
    </div>

    <script>
        // 加载密钥列表
        async function loadKeys() {
            try {
                const response = await fetch('/api/keys');
                const result = await response.json();
                
                if (result.success) {
                    const keysList = document.getElementById('keysList');
                    const keysCount = document.getElementById('keysCount');
                    
                    // 更新密钥数量显示
                    keysCount.textContent = result.keys.length;
                    
                    if (result.keys.length === 0) {
                        keysList.innerHTML = '<p>暂无API密钥</p>';
                        document.getElementById('batchControls').style.display = 'none';
                    } else {
                        let html = '<table>';
                        html += '<thead><tr>';
                        html += '<th>选择</th>';
                        html += '<th>API密钥</th>';
                        html += '<th>状态</th>';
                        html += '<th>今日请求数</th>';
                        html += '</tr></thead><tbody>';
                        
                        result.keys.forEach((key, index) => {
                            html += '<tr>';
                            html += '<td><input type="checkbox" class="key-checkbox" value="' + index + '" data-key="' + key.full_key + '"></td>';
                            html += '<td><span class="key-value">' + key.key + '</span></td>';
                            html += '<td><span class="status">' + key.status + '</span></td>';
                            html += '<td>' + (key.daily_requests || 0) + '</td>';
                            html += '</tr>';
                        });
                        
                        html += '</tbody></table>';
                        keysList.innerHTML = html;
                        document.getElementById('batchControls').style.display = 'block';
                        bindCheckboxEvents();
                    }
                }
            } catch (error) {
                console.error('加载密钥列表失败:', error);
            }
        }

        // 批量添加密钥表单提交
        document.getElementById('addKeyForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const keyValue = document.getElementById('keyValue').value.trim();
            
            if (!keyValue) {
                alert('请输入API密钥');
                return;
            }

            try {
                const response = await fetch('/api/keys', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ keys: keyValue }),
                });

                const result = await response.json();
                
                if (result.success) {
                    alert(result.message);
                    document.getElementById('keyValue').value = '';
                    loadKeys(); // 重新加载密钥列表
                } else {
                    alert('添加失败: ' + result.error);
                }
            } catch (error) {
                alert('添加失败: ' + error.message);
            }
        });

        // 绑定复选框事件
        function bindCheckboxEvents() {
            const checkboxes = document.querySelectorAll('.key-checkbox');
            const selectAll = document.getElementById('selectAll');
            const batchDeleteBtn = document.getElementById('batchDeleteBtn');
            
            // 复选框变化事件
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', updateBatchControls);
            });
            
            // 全选事件
            selectAll.addEventListener('change', function() {
                checkboxes.forEach(checkbox => {
                    checkbox.checked = this.checked;
                });
                updateBatchControls();
            });
            
            // 批量删除事件
            batchDeleteBtn.addEventListener('click', batchDeleteKeys);
        }
        
        // 更新批量控制状态
        function updateBatchControls() {
            const checkboxes = document.querySelectorAll('.key-checkbox');
            const selected = Array.from(checkboxes).filter(cb => cb.checked);
            const selectedCount = selected.length;
            const batchDeleteBtn = document.getElementById('batchDeleteBtn');
            const countSpan = document.getElementById('selectedCount');
            const selectAll = document.getElementById('selectAll');
            
            countSpan.textContent = selectedCount;
            batchDeleteBtn.disabled = selectedCount === 0;
            
            // 更新全选状态
            selectAll.checked = selectedCount === checkboxes.length;
            selectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
        }
        
        // 批量删除密钥
        async function batchDeleteKeys() {
            const selectedCheckboxes = Array.from(document.querySelectorAll('.key-checkbox:checked'));
            
            if (selectedCheckboxes.length === 0) {
                alert('请选择要删除的密钥');
                return;
            }
            
            if (!confirm('确定要删除选中的 ' + selectedCheckboxes.length + ' 个密钥吗？')) {
                return;
            }
            
            try {
                const keysToDelete = selectedCheckboxes.map(cb => cb.dataset.key);
                
                for (const key of keysToDelete) {
                    const response = await fetch('/api/keys/' + encodeURIComponent(key), {
                        method: 'DELETE',
                    });
                    
                    if (!response.ok) {
                        throw new Error('删除失败');
                    }
                }
                
                alert('成功删除 ' + keysToDelete.length + ' 个密钥！');
                loadKeys(); // 重新加载密钥列表
            } catch (error) {
                alert('批量删除失败: ' + error.message);
            }
        }

        // 复制API URL功能（改进版）
        async function copyApiUrl() {
            const apiUrl = document.getElementById('apiBaseUrl').textContent;
            const copyBtn = document.getElementById('copyBtn');
            
            try {
                await navigator.clipboard.writeText(apiUrl);
                
                // 显示复制成功状态
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                // 如果剪贴板API失败，尝试使用传统方法
                const textArea = document.createElement('textarea');
                textArea.value = apiUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
        }

        // 加载客户端token列表
        async function loadTokens() {
            try {
                const response = await fetch('/api/client-tokens');
                const result = await response.json();
                
                if (result.success) {
                    const tokensList = document.getElementById('tokensList');
                    const tokensCount = document.getElementById('tokensCount');
                    
                    // 更新token数量显示
                    tokensCount.textContent = result.tokens.length;
                    
                    if (result.tokens.length === 0) {
                        tokensList.innerHTML = '<p>暂无客户端token</p>';
                    } else {
                        let html = '<table>';
                        html += '<thead><tr>';
                        html += '<th>Token</th>';
                        html += '<th>客户端名称</th>';
                        html += '<th>状态</th>';
                        html += '<th>过期时间</th>';
                        html += '<th>使用次数</th>';
                        html += '<th>操作</th>';
                        html += '</tr></thead><tbody>';
                        
                        result.tokens.forEach((token, index) => {
                            const now = new Date();
                            const expireDate = new Date(token.expireAt);
                            const daysUntilExpire = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
                            
                            let statusClass = 'active';
                            let statusText = '正常';
                            
                            if (daysUntilExpire <= 0) {
                                statusClass = 'expired';
                                statusText = '已过期';
                            } else if (daysUntilExpire <= 7) {
                                statusClass = 'expiring-soon';
                                statusText = '即将过期(' + daysUntilExpire + '天)';
                            }
                            
                            html += '<tr>';
                            html += '<td><span class="token-value" title="' + token.token + '">' + token.token.substring(0, 20) + '...</span></td>';
                            html += '<td>' + token.name + '</td>';
                            html += '<td><span class="status ' + statusClass + '">' + statusText + '</span></td>';
                            html += '<td>' + expireDate.toLocaleDateString() + '</td>';
                            html += '<td>' + (token.requestCount || 0) + '</td>';
                            html += '<td><button class="copy-btn" data-token="' + token.token + '">复制</button> <button class="delete-btn" data-token="' + token.token + '">删除</button></td>';
                            html += '</tr>';
                        });
                        
                        html += '</tbody></table>';
                        tokensList.innerHTML = html;
                    }
                }
            } catch (error) {
                console.error('加载客户端token列表失败:', error);
            }
        }

        document.getElementById('addTokenForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = document.getElementById('tokenName').value.trim();
            const customToken = document.getElementById('customToken').value.trim();
            
            const expireValue = parseInt(document.getElementById('expireValue').value) || 0;
            const expireUnit = document.getElementById('expireUnit').value;
            
            let expireSeconds = 0;
            const SECONDS_IN_MINUTE = 60;
            const SECONDS_IN_HOUR = 60 * 60;
            const SECONDS_IN_DAY = 24 * 60 * 60;
            const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;

            switch(expireUnit) {
                case 'seconds': expireSeconds = expireValue; break;
                case 'minutes': expireSeconds = expireValue * SECONDS_IN_MINUTE; break;
                case 'hours': expireSeconds = expireValue * SECONDS_IN_HOUR; break;
                case 'days': expireSeconds = expireValue * SECONDS_IN_DAY; break;
                case 'years': expireSeconds = expireValue * SECONDS_IN_YEAR; break;
                default: expireSeconds = 30 * SECONDS_IN_DAY; // 默认30天
            }

            try {
                const response = await fetch('/api/client-tokens', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, customToken, expireSeconds }),
                });

                const result = await response.json();
                
                if (result.success) {
                    alert('客户端token生成成功！\\nToken: ' + result.token.token);
                    // 清空表单
                    document.getElementById('tokenName').value = '';
                    document.getElementById('customToken').value = '';
                    document.getElementById('expireValue').value = '30';
                    document.getElementById('expireUnit').value = 'days';
                    loadTokens(); // 重新加载token列表
                } else {
                    alert('生成失败: ' + result.error);
                }
            } catch (error) {
                alert('生成失败: ' + error.message);
            }
        });

        // 复制token功能（改进版 - 和API Base URL一样）
        async function copyToken(token, buttonElement) {
            const copyBtn = buttonElement;
            
            try {
                await navigator.clipboard.writeText(token);
                
                // 显示复制成功状态
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                // 如果剪贴板API失败，尝试使用传统方法
                const textArea = document.createElement('textarea');
                textArea.value = token;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
        }

        // 删除token
        async function deleteToken(token) {
            if (!confirm('确定要删除这个客户端token吗？')) {
                return;
            }

            try {
                const response = await fetch('/api/client-tokens/' + encodeURIComponent(token), {
                    method: 'DELETE',
                });

                const result = await response.json();
                
                if (result.success) {
                    alert('客户端token删除成功！');
                    loadTokens(); // 重新加载token列表
                } else {
                    alert('删除失败: ' + result.error);
                }
            } catch (error) {
                alert('删除失败: ' + error.message);
            }
        }

        // 修改管理员密码
        async function changePassword() {
            const newPassword = prompt('请输入新密码：');
            if (!newPassword) return;
            
            const confirmPassword = prompt('请再次输入新密码以确认：');
            if (newPassword !== confirmPassword) {
                alert('两次输入的密码不一致！');
                return;
            }
            
            try {
                const response = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: newPassword })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('密码修改成功！请使用新密码重新登录。');
                    window.location.href = '/login';
                } else {
                    alert('修改失败: ' + result.error);
                }
            } catch (error) {
                alert('修改失败: ' + error.message);
            }
        }

        // 页面加载时获取密钥列表和token列表
        loadKeys();
        loadTokens();

        // 事件委托处理动态生成的按钮
        document.addEventListener('click', function(e) {
            if (e.target.dataset.action === 'copy-api-url') {
                copyApiUrl();
            } else if (e.target.classList.contains('copy-btn') && e.target.dataset.token) {
                copyToken(e.target.dataset.token, e.target);
            } else if (e.target.classList.contains('delete-btn') && e.target.dataset.token) {
                deleteToken(e.target.dataset.token);
            }
        });
    </script>
</body>
</html>`;
}