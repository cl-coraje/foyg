// 获取 vscode API
const vscode = acquireVsCodeApi();

// 状态管理
let state = {
    objective: '',
    keyResults: []
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 监听来自VSCode的消息
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'init') {
            state = message.data;
            renderState();
        }
    });

    // 尝试恢复状态
    const previousState = vscode.getState();
    if (previousState) {
        state = previousState;
        renderState();
    }

    // 设置事件监听器
    setupEventListeners();
});

function setupEventListeners() {
    // Objective 输入监听
    const objectiveInput = document.getElementById('objective-input');
    objectiveInput.addEventListener('input', (e) => {
        state.objective = e.target.value;
        saveState();
    });

    // 为Objective输入框添加回车键监听
    objectiveInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeyResult();
            // 等待DOM更新后聚焦到新添加的输入框
            setTimeout(() => {
                const krInputs = document.querySelectorAll('.kr-content input');
                const lastInput = krInputs[krInputs.length - 1];
                if (lastInput) {
                    lastInput.focus();
                }
            }, 0);
        }
    });

    // 添加 KR 按钮
    document.getElementById('add-kr-button').addEventListener('click', () => {
        addKeyResult();
    });

    // 保存按钮
    document.getElementById('save-button').addEventListener('click', () => {
        saveToVSCode();
    });

    // 取消按钮
    document.getElementById('cancel-button').addEventListener('click', () => {
        vscode.postMessage({ type: 'cancel' });
    });
}

function addKeyResult() {
    state.keyResults.push({
        content: '',
        progress: 0,
        weight: 0,
        isCompleted: false
    });
    saveState();
    renderKeyResults();
    updateWeights();
}

function updateKeyResult(index, field, value) {
    state.keyResults[index][field] = value;
    if (field === 'isCompleted') {
        renderKeyResults(); // 重新渲染以更新视觉效果
    }
    saveState();
    if (field === 'content') {
        updateWeights();
    }
}

function toggleComplete(index) {
    state.keyResults[index].isCompleted = !state.keyResults[index].isCompleted;
    updateKeyResult(index, 'isCompleted', state.keyResults[index].isCompleted);
}

function deleteKeyResult(index) {
    state.keyResults.splice(index, 1);
    saveState();
    renderKeyResults();
    updateWeights();
}

// 自动计算和更新权重
function updateWeights() {
    const totalKRs = state.keyResults.length;
    if (totalKRs > 0) {
        const weightPerKR = Math.floor(100 / totalKRs);
        const remainder = 100 % totalKRs;
        
        state.keyResults.forEach((kr, index) => {
            // 将余数加到最后一个KR上
            kr.weight = index === totalKRs - 1 ? 
                weightPerKR + remainder : 
                weightPerKR;
        });
        
        saveState();
        renderKeyResults();
    }
}

function renderState() {
    document.getElementById('objective-input').value = state.objective;
    renderKeyResults();
}

function renderKeyResults() {
    const container = document.getElementById('kr-list');
    container.innerHTML = state.keyResults.map((kr, index) => `
        <div class="kr-item ${kr.isCompleted ? 'completed' : ''}" draggable="true" data-index="${index}">
            <div class="drag-handle">
                <span class="codicon codicon-gripper"></span>
            </div>
            <div class="section-number">KR${index + 1}</div>
            <div class="kr-content">
                <input type="text" class="input-field" 
                    value="${kr.content}"
                    placeholder="请输入关键结果"
                    onkeypress="handleKRKeyPress(event, ${index})"
                    onchange="updateKeyResult(${index}, 'content', this.value)">
            </div>
            <div class="kr-metrics">
                <label class="checkbox-wrapper">
                    <input type="checkbox" 
                        ${kr.isCompleted ? 'checked' : ''} 
                        onchange="toggleComplete(${index})"
                        title="标记完成状态">
                </label>
                <span class="weight-display">${kr.weight}%</span>
                <button class="icon-button remove-button" onclick="deleteKeyResult(${index})" title="删除此项">
                    <span></span>
                </button>
            </div>
        </div>
    `).join('');

    // 为所有KR输入框添加回车键事件监听
    const krInputs = document.querySelectorAll('.kr-content input');
    krInputs.forEach((input, index) => {
        input.addEventListener('keypress', (e) => handleKRKeyPress(e, index));
    });

    // 设置拖拽事件
    setupDragAndDrop();
}

function setupDragAndDrop() {
    const container = document.getElementById('kr-list');
    const items = container.getElementsByClassName('kr-item');

    Array.from(items).forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const bounding = this.getBoundingClientRect();
    const offset = bounding.y + (bounding.height / 2);
    
    if (e.clientY - offset > 0) {
        this.classList.add('drop-after');
        this.classList.remove('drop-before');
    } else {
        this.classList.add('drop-before');
        this.classList.remove('drop-after');
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (draggedItem === this) return;

    const items = Array.from(document.getElementsByClassName('kr-item'));
    const fromIndex = parseInt(draggedItem.dataset.index);
    const toIndex = parseInt(this.dataset.index);

    // 重新排序数组
    const [movedItem] = state.keyResults.splice(fromIndex, 1);
    state.keyResults.splice(toIndex, 0, movedItem);

    saveState();
    renderKeyResults();
    updateWeights();
}

function handleDragEnd() {
    this.classList.remove('dragging');
    const items = document.getElementsByClassName('kr-item');
    Array.from(items).forEach(item => {
        item.classList.remove('drop-before', 'drop-after');
    });
}

// 处理KR输入框的回车键事件
function handleKRKeyPress(event, index) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (index === state.keyResults.length - 1) {
            // 如果是最后一个KR，添加新的KR
            addKeyResult();
            // 等待DOM更新后聚焦到新添加的输入框
            setTimeout(() => {
                const krInputs = document.querySelectorAll('.kr-content input');
                const lastInput = krInputs[krInputs.length - 1];
                if (lastInput) {
                    lastInput.focus();
                }
            }, 0);
        } else {
            // 如果不是最后一个KR，聚焦到下一个KR
            const krInputs = document.querySelectorAll('.kr-content input');
            if (krInputs[index + 1]) {
                krInputs[index + 1].focus();
            }
        }
    }
}

function saveState() {
    vscode.setState(state);
}

function saveToVSCode() {
    vscode.postMessage({
        type: 'save',
        data: {
            objective: state.objective,
            keyResults: state.keyResults,
            useAI: document.getElementById('use-ai').checked
        }
    });
} 