# FOYG (Focus On Your Goal)

一个帮助你专注于目标管理的 VSCode 扩展。

## 功能特点

- 📝 简单直观的 OKR 设置界面
- 🎯 支持目标（O）和关键结果（KR）的管理
- ⚖️ 自动计算和分配 KR 权重
- 🤖 可选的 AI 润色功能，帮助优化 KR 描述
- 📊 进度追踪和完成状态管理
- 🔄 支持拖拽排序 KR
- 💾 自动保存为 Markdown 文件

## 使用方法

1. 在 VSCode 中打开命令面板（Cmd/Ctrl + Shift + P）
2. 输入 "FOYG: Set Your Goal" 来打开目标设置面板
3. 输入你的目标（Objective）
4. 添加关键结果（Key Results）
5. 可选：使用 AI 润色功能优化 KR 描述
6. 点击保存，将在工作区创建今日的目标文件

## 配置选项

- `foyg.storageLocation`: 设置目标文件的存储位置
- `foyg.autoOpenGoalFile`: 设置保存后是否自动打开目标文件
- `foyg.apiKey`: AI 润色功能的 API 密钥（必须配置才能使用 AI 功能）

### 配置 API Key

1. 打开 VSCode 设置（Cmd/Ctrl + ,）
2. 搜索 "FOYG"
3. 在 `foyg.apiKey` 中填入您的 API Key
4. API Key 会安全存储在 VSCode 的配置系统中

## 注意事项

- AI 润色功能需要配置有效的 API 密钥（从硅基流动平台获取）
- 目标文件以日期命名，存储在工作区的 `todos` 目录下
- API Key 不会被同步到版本控制系统

## 安全说明

- API Key 存储在 VSCode 的用户设置中，不会被包含在扩展包中
- 建议不要在共享的设备上保存 API Key
- 如果怀疑 API Key 泄露，请立即在硅基流动平台重置

## 许可证

MIT 