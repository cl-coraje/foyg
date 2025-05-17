const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// API 配置
const API_CONFIG = {
    API_URL: "https://api.siliconflow.cn/v1/chat/completions"
};

class KRAnalyzer {
    static async analyzeKR(kr) {
        try {
            const apiKey = vscode.workspace.getConfiguration('foyg').get('apiKey');
            if (!apiKey) {
                vscode.window.showWarningMessage('请先在设置中配置 API Key');
                return kr;
            }
            const optimizedKR = await this.callDeepSeekAPI(kr, apiKey);
            return {
                ...kr,
                content: optimizedKR.content
            };
        } catch (error) {
            console.error('AI优化失败:', error);
            return kr;
        }
    }

    static async callDeepSeekAPI(kr, apiKey) {
        try {
            const headers = {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            };

            const prompt = `作为OKR专家，请直接优化以下关键结果(KR)的描述，使其更符合SMART原则（具体、可衡量、可实现、相关性、时限性）。
只需返回优化后的描述，不要包含任何分析或解释。如果原描述已经足够好，可以保持不变。

原关键结果：
${kr.content}`;

            const data = {
                "model": "Pro/deepseek-ai/DeepSeek-V3",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
                "max_tokens": 2000
            };

            const response = await axios.post(API_CONFIG.API_URL, data, { headers });
            return {
                content: response.data.choices[0].message.content.trim()
            };
        } catch (error) {
            if (error.response?.status === 401) {
                vscode.window.showErrorMessage('API Key 无效，请检查设置');
            } else {
                vscode.window.showErrorMessage(`API调用失败: ${error.message}`);
            }
            throw error;
        }
    }

    static async generateAnalysisSummary(keyResults) {
        // 不再生成分析总结
        return '';
    }
}

class TodoGenerator {
    static async generateTodoContent(objective, keyResults, useAI = false) {
        const timestamp = new Date().toISOString().split('T')[0];
        let content = [];
        
        content.push(`# ${timestamp} 的目标与任务`);
        content.push('');
        content.push(`## 主要目标: ${objective}`);
        content.push('');
        content.push('## 关键结果:');
        content.push('');

        // 只在启用 AI 时进行优化
        const finalKRs = useAI 
            ? await Promise.all(keyResults.map(async kr => await KRAnalyzer.analyzeKR(kr)))
            : keyResults;

        finalKRs.forEach((kr, index) => {
            const checkMark = kr.isCompleted ? 'x' : ' ';
            content.push(`- [${checkMark}] KR${index + 1}: ${kr.content} (进度: ${kr.progress}%, 权重: ${kr.weight}%)`);
        });

        return content.join('\n');
    }
}

// 使用单例模式管理面板
class GoalPanel {
    static _instance = null;

    constructor(context) {
        this.context = context;
        this._panel = null;
        this._disposables = [];
    }

    static getInstance(context) {
        if (!GoalPanel._instance) {
            GoalPanel._instance = new GoalPanel(context);
        }
        return GoalPanel._instance;
    }

    show(data) {
        // 如果面板已经存在，直接显示
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
            if (data) {
                // 如果有新数据，发送到webview
                this._panel.webview.postMessage({
                    type: 'init',
                    data: data
                });
            }
            return;
        }

        // 创建新的 webview panel
        this._panel = vscode.window.createWebviewPanel(
            'foygGoalSetting',
            'Focus On Your Goal',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        // 设置HTML内容
        this._panel.webview.html = this._getHtmlContent(this._panel.webview);

        // 如果有初始数据，发送到webview
        if (data) {
            setTimeout(() => {
                this._panel.webview.postMessage({
                    type: 'init',
                    data: data
                });
            }, 500); // 给webview一些时间初始化
        }

        // 处理消息
        this._panel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'save':
                    await this._saveGoal(message.data);
                    break;
                case 'cancel':
                    vscode.window.showWarningMessage('请先设置今天的目标！');
                    break;
            }
        }, null, this._disposables);

        // 处理面板关闭
        this._panel.onDidDispose(() => {
            this._panel = null;
            GoalPanel._instance = null;
            
            // 清理资源
            while (this._disposables.length) {
                const disposable = this._disposables.pop();
                if (disposable) {
                    disposable.dispose();
                }
            }
        }, null, this._disposables);
    }

    _getHtmlContent(webview) {
        const mediaPath = path.join(this.context.extensionPath, 'media');
        const mainScriptUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(mediaPath, 'main.js')
        ));
        const mainStyleUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(mediaPath, 'main.css')
        ));

        return `<!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>FOYG - Focus On Your Goal</title>
                <link href="${mainStyleUri}" rel="stylesheet">
                <style>
                    .codicon {
                        font-family: codicon;
                        font-size: 16px;
                        font-style: normal;
                    }
                    body {
                        padding: 20px;
                    }
                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    .settings-section {
                        margin: 20px 0;
                        padding: 10px;
                        border-top: 1px solid var(--vscode-input-border);
                    }
                    .checkbox-wrapper {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="objective-section">
                        <div class="section-header">
                            <div class="section-number">O1</div>
                            <input type="text" id="objective-input" class="input-field" 
                                placeholder="请输入目标">
                        </div>
                    </div>

                    <div class="kr-section">
                        <div id="kr-list"></div>
                        
                        <button id="add-kr-button" class="add-kr-button">
                            <span class="codicon codicon-plus"></span>
                            添加关键结果
                        </button>
                    </div>

                    <div class="settings-section">
                        <div class="checkbox-wrapper">
                            <input type="checkbox" id="use-ai" name="use-ai">
                            <label for="use-ai">使用模型润色</label>
                        </div>
                    </div>

                    <div class="button-group">
                        <div class="action-buttons">
                            <button id="save-button" class="btn btn-primary">保存</button>
                            <button id="cancel-button" class="btn btn-secondary">取消</button>
                        </div>
                    </div>
                </div>

                <script src="${mainScriptUri}"></script>
            </body>
            </html>`;
    }

    async _saveGoal(data) {
        try {
            // 验证数据
            if (!data.objective.trim()) {
                throw new Error('请输入主要目标');
            }
            if (data.keyResults.length === 0) {
                throw new Error('请至少添加一个关键结果');
            }
            if (data.keyResults.some(kr => !kr.content.trim())) {
                throw new Error('请填写所有关键结果的内容');
            }

            // 获取工作区
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('请先打开一个工作区文件夹');
            }

            // 生成待办事项内容，传入 useAI 参数
            const todoContent = await TodoGenerator.generateTodoContent(
                data.objective, 
                data.keyResults,
                data.useAI
            );
            
            // 在工作区根目录创建 todos 文件夹
            const todosPath = path.join(workspaceFolders[0].uri.fsPath, 'todos');
            if (!fs.existsSync(todosPath)) {
                fs.mkdirSync(todosPath);
            }

            // 生成文件名（使用日期）
            const today = new Date().toISOString().split('T')[0];
            const todoFilePath = path.join(todosPath, `${today}.md`);

            // 保存待办事项文件
            await fs.promises.writeFile(todoFilePath, todoContent, 'utf8');

            // 显示成功消息
            vscode.window.showInformationMessage('目标设置成功！正在打开待办事项列表...');

            // 打开待办事项文件
            const doc = await vscode.workspace.openTextDocument(todoFilePath);
            await vscode.window.showTextDocument(doc);

            // 关闭面板
            if (this._panel) {
                this._panel.dispose();
            }
        } catch (error) {
            vscode.window.showErrorMessage('保存目标时发生错误: ' + error.message);
        }
    }
}

async function checkTodayGoal() {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return { exists: false };
        }

        const today = new Date().toISOString().split('T')[0];
        const todoFilePath = path.join(
            workspaceFolders[0].uri.fsPath,
            'todos',
            `${today}.md`
        );

        if (!fs.existsSync(todoFilePath)) {
            return { exists: false };
        }

        // 读取文件内容
        const content = await fs.promises.readFile(todoFilePath, 'utf8');
        const lines = content.split('\n');
        
        let objective = '';
        const keyResults = [];
        
        // 解析文件内容
        for (const line of lines) {
            if (line.startsWith('## 主要目标:')) {
                objective = line.replace('## 主要目标:', '').trim();
            } else if (line.startsWith('- [')) {
                const isCompleted = line.includes('- [x]');
                const content = line.replace(/- \[[x ]\] KR\d+: /, '').split(' (')[0].trim();
                const match = line.match(/进度: (\d+)%, 权重: (\d+)%/);
                const progress = match ? parseInt(match[1]) : 0;
                const weight = match ? parseInt(match[2]) : 0;
                
                keyResults.push({
                    content,
                    progress,
                    weight,
                    isCompleted
                });
            }
        }

        return {
            exists: true,
            data: {
                objective,
                keyResults
            }
        };
    } catch (error) {
        console.error('Error checking today\'s goal:', error);
        return { exists: false };
    }
}

function activate(context) {
    console.log('FOYG extension is now active');

    // 检查今天是否已经设置了目标
    checkTodayGoal().then(result => {
        const panel = GoalPanel.getInstance(context);
        if (result.exists) {
            // 如果今天已经有目标，加载已有数据
            panel.show(result.data);
        } else {
            // 如果今天还没有设置目标，显示空白的目标设置面板
            panel.show();
        }
    });

    // 注册命令
    let setGoalCommand = vscode.commands.registerCommand('foyg.setGoal', () => {
        GoalPanel.getInstance(context).show();
    });

    let viewGoalCommand = vscode.commands.registerCommand('foyg.viewGoal', async () => {
        const result = await checkTodayGoal();
        if (result.exists) {
            const panel = GoalPanel.getInstance(context);
            panel.show(result.data);
        } else {
            vscode.window.showInformationMessage('今天还没有设置目标，请先设置目标。');
            vscode.commands.executeCommand('foyg.setGoal');
        }
    });

    context.subscriptions.push(setGoalCommand, viewGoalCommand);
}

function deactivate() {
    console.log('FOYG extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
};