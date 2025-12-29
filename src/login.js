// 登录页面 HTML 模板
export function getLoginPageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CloudRouter 管理员登录</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .login-container {
            background: #fff;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
            font-size: 24px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
        }
        .form-group input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            font-size: 16px;
        }
        .submit-btn {
            width: 100%;
            background: #007bff;
            color: white;
            border: none;
            padding: 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
        }
        .submit-btn:hover {
            background: #0056b3;
        }
        .error-msg {
            color: #dc3545;
            margin-bottom: 20px;
            text-align: center;
            font-size: 14px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>🚀 CloudRouter 登录</h1>
        <div id="errorMsg" class="error-msg"></div>
        <form id="loginForm">
            <div class="form-group">
                <label for="password">管理员密码</label>
                <input type="password" id="password" name="password" required placeholder="请输入管理员密码">
            </div>
            <button type="submit" class="submit-btn">登录</button>
        </form>
    </div>
    <script>
        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const password = document.getElementById('password').value;
            const errorMsg = document.getElementById('errorMsg');
            
            // 重置错误信息
            errorMsg.style.display = 'none';
            
            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    window.location.href = '/';
                } else {
                    errorMsg.textContent = result.error || '登录失败';
                    errorMsg.style.display = 'block';
                }
            } catch (error) {
                console.error('Login error:', error);
                errorMsg.textContent = '发生错误，请重试';
                errorMsg.style.display = 'block';
            }
        });
    </script>
</body>
</html>`;
}
