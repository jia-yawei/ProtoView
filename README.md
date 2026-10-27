# ProtoView - 通信总线协议管理平台

> 专业、纯净、高密度的工业总线通信协议管理平台，支持「本地硬盘目录」双向读写、基于 Cloudflare 全球分布式 KV 的「多端云同步工作台」，以及 AI 上位机协议规范自动导出。

🔗 **在线访问地址 (GitHub Pages)**: [https://jia-yawei.github.io/ProtoView/](https://jia-yawei.github.io/ProtoView/)  
📦 **项目源码仓库**: [https://github.com/jia-yawei/ProtoView.git](https://github.com/jia-yawei/ProtoView.git)

---

## 🚀 核心特性

- **航空 ARINC 429 标准全覆盖**：
  - 经典航电模式（8位标号、2位SDI、19位数据、2位SSM、1位奇偶校验）
  - 自由 Bit 流模式（支持 32 位全字长按字段跨度自由分配）
  - BNR（数值型）、BCD（码盘编码）、Discrete（离散状态位）等多种航空标准数据类型。
- **☁️ Cloudflare 多端云同步工作台**：
  - 基于 Cloudflare Pages Functions 与全球分布式 Workers KV 数据库。
  - 电脑和手机共享同一个云端工作台，实时读写，手机随时随地开箱即用。
  - 支持工作空间隔离与私密访问口令保护。
- **🖥️ 桌面软件级「本地工作目录」直接关联**：
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
  - 原生 HTML5 + CSS3 + 纯 JavaScript，无任何 Node / Webpack 构建依赖，直接静态托管在 GitHub Pages 或 Cloudflare Pages。

---

## 📂 项目结构

```text
ProtoView/
├── index.html        # 主应用入口单页 (SPA 视图路由)
├── css/
│   └── style.css     # 紧凑高密度样式表 (支持浅色/深色主题切换)
├── js/
│   ├── app.js        # 核心交互、路由切换、本地目录与云端工作台同步器
│   ├── arinc429.js   # ARINC 429 协议编解码、八进制校验与代码生成核心库
│   ├── db.js         # IndexedDB / LocalStorage 双引擎容灾本地数据库助手
│   └── parser.js     # 总线通信报文数据解析引擎
├── functions/
│   └── api/
│       └── protocols.js # Cloudflare Pages Functions 全栈云端协议存储与同步接口 (KV 驱动)
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

## ☁️ Cloudflare Pages 部署与云端工作台配置指南

通过 Cloudflare Pages + Workers KV，您可以将 ProtoView 部署到云端，并在**手机、电脑等多端实现协议文件的实时在线同步**。

### 1. 部署到 Cloudflare Pages
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 进入 **Workers 和 Pages (Workers & Pages)** -> 点击 **创建 (Create application)** -> 切换到 **Pages**。
3. 选择 **连接到 Git (Connect to Git)** 并选择您的 `ProtoView` 仓库。
4. 构建配置：
   - **框架预设 (Framework preset)**: `None`
   - **构建命令 (Build command)**: 留空
   - **输出目录 (Build output directory)**: `/`
5. 点击 **保存并部署**，稍等十几秒即可完成上线。

### 2. 绑定 Cloudflare KV 云端数据库（实现多端同步工作台）
1. 在 Cloudflare 控制台左侧菜单点击 **存储和数据库 (Storage & Databases)** -> **KV**。
2. 点击 **创建命名空间 (Create a namespace)**，名称填：`PROTOVIEW_KV`，点击添加。
3. 回到 **Workers 和 Pages** -> 点击进入刚才部署的 **ProtoView** Pages 项目。
4. 进入 **设置 (Settings)** -> **函数 (Functions)** -> 往下拉找到 **KV 命名空间绑定 (KV namespace bindings)**。
5. 点击 **添加绑定 (Add binding)**：
   - **变量名称 (Variable name)**: 必须严格填写为 `PROTOVIEW_KV`
   - **KV 命名空间 (KV namespace)**: 选择刚才创建的 `PROTOVIEW_KV`
6. 点击保存。重新部署一次项目或等待几秒生效。
7. 在手机或电脑浏览器打开您的 Cloudflare 网站，点击顶部的 **「Cloudflare 云端工作台」**，即可随时随地跨设备同步协议！

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
