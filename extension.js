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
            content.push(`- [${checkMark}] KR${index + 1}: ${kr.content} (权重: ${kr.weight}%)`);
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
                // 如果有数据，重新计算权重
                if (data.keyResults && data.keyResults.length > 0) {
                    const totalWeight = data.keyResults.reduce((sum, kr) => sum + (kr.weight || 0), 0);
                    if (totalWeight !== 100) {
                        const averageWeight = Math.floor(100 / data.keyResults.length);
                        const remainder = 100 - (averageWeight * (data.keyResults.length - 1));

                        data.keyResults.forEach((kr, index) => {
                            kr.weight = index === data.keyResults.length - 1 ? remainder : averageWeight;
                        });
                    }
                }
                // 发送到webview
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

            // 关闭面板
            if (this._panel) {
                this._panel.dispose();
            }

            // 显示 todolist 视图
            await vscode.commands.executeCommand('setContext', 'foyg:showTodoList', true);
            await vscode.commands.executeCommand('workbench.view.extension.foyg-sidebar');
            
            // 确保 todolist 视图被激活并更新
            setTimeout(() => {
                const provider = FoygSidebarProvider.getInstance();
                if (provider) {
                    provider._updateView();
                }
            }, 500);

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

        const todosPath = path.join(workspaceFolders[0].uri.fsPath, 'todos');
        if (!fs.existsSync(todosPath)) {
            return { exists: false };
        }

        // 获取todos目录下的所有文件
        const files = fs.readdirSync(todosPath)
            .filter(file => file.endsWith('.md'))
            .sort((a, b) => b.localeCompare(a)); // 按日期降序排序

        if (files.length === 0) {
            return { exists: false };
        }

        // 读取最新的文件
        const latestFile = path.join(todosPath, files[0]);
        const content = await fs.promises.readFile(latestFile, 'utf8');
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
                const match = line.match(/权重: (\d+)%/);
                const weight = match ? parseInt(match[1]) : 0;
                
                keyResults.push({
                    content,
                    weight,
                    isCompleted
                });
            }
        }

        // 重新计算权重
        const totalWeight = keyResults.reduce((sum, kr) => sum + (kr.weight || 0), 0);
        if (totalWeight !== 100 && keyResults.length > 0) {
            const averageWeight = Math.floor(100 / keyResults.length);
            const remainder = 100 - (averageWeight * (keyResults.length - 1));

            keyResults.forEach((kr, index) => {
                kr.weight = index === keyResults.length - 1 ? remainder : averageWeight;
            });

            // 更新文件内容
            const updatedLines = lines.map(line => {
                if (line.startsWith('- [')) {
                    const index = parseInt(line.match(/KR(\d+):/)[1]) - 1;
                    const checkMark = line.includes('- [x]') ? 'x' : ' ';
                    return `- [${checkMark}] KR${index + 1}: ${keyResults[index].content} (权重: ${keyResults[index].weight}%)`;
                }
                return line;
            });

            await fs.promises.writeFile(latestFile, updatedLines.join('\n'), 'utf8');
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

class FoygSidebarProvider {
    static _instance = null;

    constructor(context) {
        this.context = context;
        this._view = null;
        this._creationTime = new Date().toISOString();
    }

    _getTodayFilePath() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return null;
        }

        const todosPath = path.join(workspaceFolders[0].uri.fsPath, 'todos');
        if (!fs.existsSync(todosPath)) {
            return null;
        }

        // 获取最新的文件
        const files = fs.readdirSync(todosPath)
            .filter(file => file.endsWith('.md'))
            .sort((a, b) => b.localeCompare(a));

        if (files.length === 0) {
            return null;
        }

        return path.join(todosPath, files[0]);
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media')),
                vscode.Uri.file(path.join(this.context.extensionPath, 'todos'))
            ]
        };

        // 添加视图状态变化监听器
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateView();
            }
        });

        // 注册消息处理器
        this._messageHandler = webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'updateKR':
                    await this._updateKR(message.data);
                    await this._updateView();
                    break;
                case 'addKR':
                    await this._addKR(message.data);
                    await this._updateView();
                    break;
                case 'deleteKR':
                    await this._deleteKR(message.data);
                    await this._updateView();
                    break;
                case 'reorderKR':
                    await this._reorderKR(message.data);
                    await this._updateView();
                    break;
                case 'refresh':
                    await this._updateView();
                    break;
            }
        });

        // 初始化视图
        this._updateView();
    }

    async _updateView() {
        if (!this._view) {
            return;
        }

        const todayFile = this._getTodayFilePath();
        let todoData = { objective: '', keyResults: [] };

        if (fs.existsSync(todayFile)) {
            // 每次更新时重新读取文件内容
            const content = fs.readFileSync(todayFile, 'utf8');
            todoData = this._parseMdContent(content);
        }

        const htmlContent = await this._getWebviewContent(todoData);
        this._view.webview.html = htmlContent;
    }

    _parseMdContent(content) {
        const lines = content.split('\n');
        let objective = '';
        const keyResults = [];
        
        for (const line of lines) {
            if (line.startsWith('## 主要目标:')) {
                objective = line.replace('## 主要目标:', '').trim();
            } else if (line.startsWith('- [')) {
                const kr = this._parseKRLine(line);
                if (kr) {
                    keyResults.push(kr);
                }
            }
        }

        console.log('Parsed objective:', objective); // 调试日志
        console.log('Parsed keyResults:', keyResults); // 调试日志

        return { objective, keyResults };
    }

    _parseKRLine(line) {
        // 更新正则表达式以匹配包含完成时间的格式
        const match = line.match(/- \[([ x])\] KR(\d+): (.*?) \(权重: (\d+)%(?:, 完成时间: ([\d:]+))?\)/);
        if (match) {
            return {
                completed: match[1] === 'x',
                content: match[3],
                weight: parseInt(match[4]),
                completionTime: match[5] || null
            };
        }
        return null;
    }

    async _updateKR(data) {
        const todayFile = this._getTodayFilePath();
        if (!fs.existsSync(todayFile)) {
            return;
        }

        let content = fs.readFileSync(todayFile, 'utf8');
        const lines = content.split('\n');
        const updatedLines = lines.map(line => {
            if (line.includes(`KR${data.index + 1}:`)) {
                const checkMark = data.completed ? 'x' : ' ';
                const completionTime = data.completed && data.completionTime ? `, 完成时间: ${data.completionTime}` : '';
                return `- [${checkMark}] KR${data.index + 1}: ${data.content} (权重: ${data.weight}%${completionTime})`;
            }
            return line;
        });

        fs.writeFileSync(todayFile, updatedLines.join('\n'), 'utf8');
    }

    async _addKR(data) {
        const todayFile = this._getTodayFilePath();
        if (!fs.existsSync(todayFile)) {
            return;
        }

        let content = fs.readFileSync(todayFile, 'utf8');
        const lines = content.split('\n');
        
        // 找到最后一个 KR 的位置
        let lastKRIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith('- [')) {
                lastKRIndex = i;
                break;
            }
        }

        // 计算新任务的权重
        const currentKRs = this._parseMdContent(content).keyResults;
        const totalKRs = currentKRs.length + 1;
        const weightPerKR = Math.floor(100 / totalKRs);
        const remainder = 100 % totalKRs;

        // 更新所有任务的权重，保持原有任务的编号和内容不变
        let krCount = 0;
        const updatedLines = lines.map(line => {
            if (line.startsWith('- [')) {
                krCount++;
                const kr = this._parseKRLine(line);
                if (kr) {
                    const checkMark = kr.completed ? 'x' : ' ';
                    const completionTime = kr.completionTime ? `, 完成时间: ${kr.completionTime}` : '';
                    return `- [${checkMark}] KR${krCount}: ${kr.content} (权重: ${weightPerKR}%${completionTime})`;
                }
            }
            return line;
        });

        // 添加新任务
        const newKRLine = `- [ ] KR${currentKRs.length + 1}: ${data.content} (权重: ${weightPerKR + remainder}%)`;
        if (lastKRIndex === -1) {
            // 如果没有找到任何 KR，添加到文件末尾
            updatedLines.push(newKRLine);
        } else {
            // 在最后一个 KR 后插入新任务
            updatedLines.splice(lastKRIndex + 1, 0, newKRLine);
        }

        fs.writeFileSync(todayFile, updatedLines.join('\n'), 'utf8');
    }

    async _deleteKR(data) {
        const todayFile = this._getTodayFilePath();
        if (!fs.existsSync(todayFile)) {
            return;
        }

        let content = fs.readFileSync(todayFile, 'utf8');
        const lines = content.split('\n');
        let krIndex = -1;
        const updatedLines = lines.filter(line => {
            if (line.startsWith('- [')) {
                krIndex++;
                return krIndex !== data.index;
            }
            return true;
        });

        // 重新计算权重
        const remainingKRs = this._parseMdContent(updatedLines.join('\n')).keyResults;
        if (remainingKRs.length > 0) {
            const weightPerKR = Math.floor(100 / remainingKRs.length);
            const remainder = 100 % remainingKRs.length;

            krIndex = -1;
            const finalLines = updatedLines.map(line => {
                if (line.startsWith('- [')) {
                    krIndex++;
                    const kr = this._parseKRLine(line);
                    if (kr) {
                        const checkMark = kr.completed ? 'x' : ' ';
                        const completionTime = kr.completionTime ? `, 完成时间: ${kr.completionTime}` : '';
                        const weight = krIndex === remainingKRs.length - 1 ? weightPerKR + remainder : weightPerKR;
                        return `- [${checkMark}] KR${krIndex + 1}: ${kr.content} (权重: ${weight}%${completionTime})`;
                    }
                }
                return line;
            });

            fs.writeFileSync(todayFile, finalLines.join('\n'), 'utf8');
        } else {
            fs.writeFileSync(todayFile, updatedLines.join('\n'), 'utf8');
        }
    }

    async _reorderKR(data) {
        const todayFile = this._getTodayFilePath();
        if (!fs.existsSync(todayFile)) {
            return;
        }

        let content = fs.readFileSync(todayFile, 'utf8');
        const lines = content.split('\n');
        const krLines = [];
        const otherLines = [];

        // 分离KR行和其他行
        lines.forEach(line => {
            if (line.startsWith('- [')) {
                krLines.push(line);
            } else {
                otherLines.push(line);
            }
        });

        // 移动KR行
        const [movedLine] = krLines.splice(data.fromIndex, 1);
        krLines.splice(data.toIndex, 0, movedLine);

        // 重新编号和计算权重
        const weightPerKR = Math.floor(100 / krLines.length);
        const remainder = 100 % krLines.length;

        const updatedKRLines = krLines.map((line, index) => {
            const kr = this._parseKRLine(line);
            if (kr) {
                const checkMark = kr.completed ? 'x' : ' ';
                const completionTime = kr.completionTime ? `, 完成时间: ${kr.completionTime}` : '';
                const weight = index === krLines.length - 1 ? weightPerKR + remainder : weightPerKR;
                return `- [${checkMark}] KR${index + 1}: ${kr.content} (权重: ${weight}%${completionTime})`;
            }
            return line;
        });

        // 重建文件内容
        let newContent = '';
        let krIndex = 0;
        otherLines.forEach(line => {
            newContent += line + '\n';
            if (line === '## 关键结果:') {
                newContent += '\n';
                updatedKRLines.forEach(krLine => {
                    newContent += krLine + '\n';
                });
            }
        });

        fs.writeFileSync(todayFile, newContent.trim(), 'utf8');
    }

    async _getWebviewContent(todoData) {
        const htmlPath = path.join(this.context.extensionPath, 'todolist.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // 使用实例的创建时间
        html = html.replace(
            'const creationTime = new Date();',
            `const creationTime = new Date('${this._creationTime}');`
        );

        // 添加占位符样式
        html = html.replace('</style>', `
            .todo-text.placeholder {
                color: var(--vscode-input-placeholderForeground);
            }
        </style>`);

        html = html.replace(
            '<ul class="todo-list" id="todo-list">',
            `<ul class="todo-list" id="todo-list">
            <li class="todo-objective">
                <h2>${todoData.objective}</h2>
            </li>
            ${todoData.keyResults.map((kr, index) => `
                <li class="todo-item" data-index="${index}">
                    <input type="checkbox" class="todo-checkbox" ${kr.completed ? 'checked' : ''} onchange="markCompleted(this)">
                    <span class="todo-text ${kr.completed ? 'todo-completed' : ''} ${!kr.content ? 'placeholder' : ''}">${kr.content || '新建任务'}</span>
                    <span class="todo-weight">${kr.weight}%</span>
                    ${kr.completionTime ? `<span class="todo-completion-time">${kr.completionTime}</span>` : ''}
                    <button class="delete-button" onclick="deleteTask(${index})" title="删除任务">×</button>
                </li>
            `).join('')}`
        );

        return html;
    }
}

function activate(context) {
    console.log('FOYG extension is now active');

    // 默认隐藏 todolist
    vscode.commands.executeCommand('setContext', 'foyg:showTodoList', false);

    // 检查今天是否已经设置了目标
    checkTodayGoal().then(result => {
        const panel = GoalPanel.getInstance(context);
        if (!result.exists) {
            // 如果今天还没有设置目标，显示空白的目标设置面板
            panel.show();
        } else {
            // 如果已有目标，加载数据到设置面板
            panel.show(result.data);
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

    // Register sidebar provider
    const sidebarProvider = new FoygSidebarProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('foyg-todo', sidebarProvider)
    );

    context.subscriptions.push(setGoalCommand, viewGoalCommand);
}

function deactivate() {
    console.log('FOYG extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
};