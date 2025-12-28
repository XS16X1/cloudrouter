// HTML模板文件

export function getAdminPageHtml(originUrl, rpm, tpm, rpd, tpd) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudRouter 管理面板</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: auto; background: #f5f5f5; }
        .container { background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        h1, h2 { color: #333; margin-bottom: 20px; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .status.active { background: #d4edda; color: #155724; }
        .api-info { background: #e3f2fd; border: 1px solid #bbdefb; padding: 20px; border-radius: 6px; margin-bottom: 20px; }
        .key-list { margin-top: 20px; }
        .key-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; }
        .key-item:last-child { border-bottom: none; }
        .key-value { font-family: monospace; background: #f8f9fa; padding: 4px 8px; border-radius: 4px; }
        .delete-btn { background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .delete-btn:hover { background: #c82333; }
        .add-form { margin-top: 20px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
        .form-group input, .form-group textarea { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; }
        .form-group textarea { resize: vertical; min-height: 100px; }
        .copy-btn { background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-left: 5px; }
        .copy-btn:hover { background: #218838; }
        .copy-btn.copied { background: #17a2b8; }
        .batch-controls { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        .batch-delete-btn { background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .batch-delete-btn:hover { background: #c82333; }
        .batch-delete-btn:disabled { background: #6c757d; cursor: not-allowed; }
        .select-all-checkbox { margin-right: 10px; }
        .submit-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .submit-btn:hover { background: #0056b3; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .stat-number { font-size: 24px; font-weight: bold; color: #007bff; }
        .stat-label { font-size: 12px; color: #6c757d; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 CloudRouter 管理面板</h1>
        
        <div class="api-info">
            <h3>API 端点信息</h3>
            <p>
                <strong>API Base URL:</strong> 
                <code id="apiBaseUrl">${originUrl}/v1</code>
                <button class="copy-btn" onclick="copyApiUrl()" id="copyBtn">复制</button>
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
                    <textarea id="keyValue" placeholder="
sk-or-v1-key1
sk-or-v1-key2,sk-or-v1-key3
或者每行一个"></textarea>
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
                        let html = '<table style="width: 100%; border-collapse: collapse;">';
                        html += '<thead><tr style="border-bottom: 2px solid #dee2e6;">';
                        html += '<th style="padding: 10px; text-align: left;">选择</th>';
                        html += '<th style="padding: 10px; text-align: left;">API密钥</th>';
                        html += '<th style="padding: 10px; text-align: left;">状态</th>';
                        html += '<th style="padding: 10px; text-align: left;">今日请求数</th>';
                        html += '</tr></thead><tbody>';
                        
                        result.keys.forEach((key, index) => {
                            html += '<tr style="border-bottom: 1px solid #dee2e6;">';
                            html += '<td style="padding: 10px;"><input type="checkbox" class="key-checkbox" value="' + index + '" data-key="' + key.full_key + '"></td>';
                            html += '<td style="padding: 10px;"><span class="key-value">' + key.key + '</span></td>';
                            html += '<td style="padding: 10px;"><span class="status active">' + key.status + '</span></td>';
                            html += '<td style="padding: 10px;"><span class="daily-requests">' + (key.daily_requests || 0) + '</span></td>';
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
        document.getElementById('addKeyForm').addEventListener('submit', async (e) => {
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

        // 删除密钥
        async function deleteKey(keyIndex) {
            if (!confirm('确定要删除这个API密钥吗？')) {
                return;
            }

            try {
                // 先获取完整密钥列表
                const response = await fetch('/api/keys');
                const result = await response.json();
                
                if (result.success && result.keys[keyIndex]) {
                    const fullKey = result.keys[keyIndex].full_key;
                    
                    const deleteResponse = await fetch('/api/keys/' + encodeURIComponent(fullKey), {
                        method: 'DELETE',
                    });

                    const deleteResult = await deleteResponse.json();
                    
                    if (deleteResult.success) {
                        alert('API密钥删除成功！');
                        loadKeys(); // 重新加载密钥列表
                    } else {
                        alert('删除失败: ' + deleteResult.error);
                    }
                } else {
                    alert('密钥不存在');
                }
            } catch (error) {
                alert('删除失败: ' + error.message);
            }
        }

        // 绑定复选框事件
        function bindCheckboxEvents() {
            const checkboxes = document.querySelectorAll('.key-checkbox');
            const selectAll = document.getElementById('selectAll');
            const batchDeleteBtn = document.getElementById('batchDeleteBtn');
            const selectedCount = document.getElementById('selectedCount');
            
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

        // 复制API URL功能
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

        // 页面加载时获取密钥列表
        loadKeys();
    </script>
</body>
</html>`;
}