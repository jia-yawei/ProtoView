# ProtoView - 通信总线协议管理平台

> 专业、纯净、高密度的工业总线通信协议管理平台，支持浏览器桌面级「本地工作目录」双向读写与 AI 上位机协议规范自动导出。

🔗 **在线访问地址 (GitHub Pages)**: [https://jia-yawei.github.io/ProtoView/](https://jia-yawei.github.io/ProtoView/)  
📦 **项目源码仓库**: [https://github.com/jia-yawei/ProtoView.git](https://github.com/jia-yawei/ProtoView.git)

---

## 🚀 核心特性

- **航空 ARINC 429 标准全覆盖**：
  - 经典航电模式（8位标号、2位SDI、19位数据、2位SSM、1位奇偶校验）
  - 自由 Bit 流模式（支持 32 位全字长按字段跨度自由分配）
  - BNR（数值型）、BCD（码盘编码）、Discrete（离散状态位）等多种航空标准数据类型。
- **桌面软件级「本地工作目录」直接关联**：
  - 基于现代浏览器原生 File System Access API，一键关联电脑本地协议工程文件夹。
  - 自动扫描加载目录下的所有 `.json` 协议文件并展示在协议管理卡片中。
  - 编辑保存时直接将修改写回本地磁盘物理文件，实现离线、永久不丢协议的桌面级体验。
- **高数据密度工程工作台**：
  - 紧凑工具栏，协议全局属性统一管理（总线速率、校验位、对端系统、传输方向、协议调度周期）。
  - 八进制 Label 醒目提示、快速换算与冲突检测。
  - 数据字行内快速删除、字段一键克隆。
  - 字段状态数据字典映射（物理值与工程含义对应）。
- **AI 上位机开发友好规范导出**：
  - 一键导出规范格式的 Markdown 协议表格，支持直接发给 ChatGPT / Claude / DeepSeek 编写上位机测控软件。
- **零构建依赖，100% 静态纯前端**：
  - 原生 HTML5 + CSS3 + 纯 JavaScript，无任何 Node / Webpack 构建依赖，直接静态托管在 GitHub Pages。

---

## 📂 项目结构

```text
ProtoView/
├── index.html        # 主应用入口单页 (SPA 视图路由)
├── css/
│   └── style.css     # 紧凑高密度样式表 (支持浅色/深色主题切换)
├── js/
│   ├── app.js        # 核心交互、路由切换与本地工作目录管理器
│   ├── arinc429.js   # ARINC 429 协议编解码、八进制校验与代码生成核心库
│   ├── db.js         # IndexedDB / LocalStorage 双引擎容灾本地数据库助手
│   └── parser.js     # 总线通信报文数据解析引擎
├── .gitignore        # Git 忽略配置
└── README.md         # 项目使用与部署说明
```

---

## 🛠️ 本地运行

该项目为纯静态应用，无需安装 Node.js 或执行 npm install：
1. 克隆本仓库到本地：
   ```bash
   git clone https://github.com/jia-yawei/ProtoView.git
   ```
2. 直接双击 `index.html`，或使用 VS Code 插件 `Live Server` / 任意静态 Web 服务器启动访问即可。

---

## 🌐 GitHub Pages 部署步骤

1. 在本地终端进入项目目录并提交代码：
   ```bash
   git init
   git add .
   git commit -m "feat: 初次提交 ProtoView 航空通信协议管理平台"
   git branch -M main
   git remote add origin https://github.com/jia-yawei/ProtoView.git
   git push -u origin main
   ```
2. 在 GitHub 仓库页面中开启 Pages：
   - 打开 GitHub 仓库页面: `https://github.com/jia-yawei/ProtoView`
   - 进入 **Settings** -> 左侧菜单选择 **Pages**
   - 在 **Build and deployment** -> **Branch** 下选择 `main` 分支，文件夹选择 `/ (root)`，点击 **Save**
   - 稍等 1-2 分钟，即可通过 `https://jia-yawei.github.io/ProtoView/` 在线访问！

