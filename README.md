# SillyTavern WebDAV File Manager

一个完整的 WebDAV 集成插件，为 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 提供安全的远程文件管理功能。

## 快速安装

### 第一步：通过 Install Extension 安装 UI 扩展

1. 打开 SillyTavern
2. 进入 **Extensions** 面板
3. 点击 **Install Extension**
4. 粘贴本仓库的 Git URL
5. 点击安装

### 第二步：安装服务端插件

#### 1.插件安装
UI 扩展安装后，设置面板中会显示安装引导。按照引导执行以下命令：

**Windows (PowerShell):**
```powershell
cd <你的SillyTavern目录>
.\data\<user>\extensions\third-party\sillytavern-webdav\install.ps1
```

**macOS / Linux:**
```bash
cd <你的SillyTavern目录>
bash data/<user>/extensions/third-party/sillytavern-webdav/install.sh
```

安装脚本会自动：
- 将服务端插件复制到 `plugins/webdav/` 目录
- 安装 npm 依赖
- 在 `config.yaml` 中启用 `enableServerPlugins: true`

#### 2.手动配置

如果不使用安装脚本，也可以手动配置：

**1. 复制服务端插件**

将扩展目录中的 `plugin/` 文件夹完整复制到 SillyTavern 的 `plugins/webdav/` 目录：

```
<SillyTavern目录>/plugins/webdav/
├── index.mjs
├── package.json
├── credential-store.mjs
├── webdav-client-manager.mjs
├── routes/
│   ├── connection.mjs
│   ├── files.mjs
│   └── operations.mjs
└── credentials/
```

**2. 安装 npm 依赖**

```bash
cd <SillyTavern目录>/plugins/webdav
npm install
```

**3. 启用服务端插件**

编辑 SillyTavern 根目录下的 `config.yaml`，将 `enableServerPlugins` 设为 `true`：

```yaml
enableServerPlugins: true
```

> 如果 `config.yaml` 中没有该字段，手动添加即可。

#### 文件位置参考

安装完成后，各组件位置如下：

| 组件 | 路径 |
|------|------|
| UI 扩展文件 | `<SillyTavern目录>/data/<user>/extensions/ST-Webdav/` |
| 服务端插件 | `<SillyTavern目录>/plugins/webdav/` |
| 凭据存储 | `<SillyTavern目录>/plugins/webdav/credentials/config.enc` |
| 安装脚本 | `<SillyTavern目录>/data/<user>/extensions/ST-Webdav/install.cmd` (Windows) |

> `<user>` 是你的 SillyTavern 用户名，默认为 `default-user`。

### 第三步：重启 SillyTavern

重启后，设置面板中的安装引导会自动消失，你可以开始使用 WebDAV 功能。

## 使用指南

### 连接 WebDAV 服务器

1. 在 SillyTavern 中打开 **Extensions** 面板
2. 展开 **WebDAV File Manager** 设置
3. 填写连接参数：
   - **Server URL**: WebDAV 服务器地址
   - **Username**: 用户名
   - **Password**: 密码
   - **Root Path**: 根目录路径（可选，默认 `/`）
   - **Authentication Type**: 认证方式
4. 点击 **Connect** 按钮

### 常用 WebDAV 服务器 URL 格式

| 服务 | URL 格式 |
|------|---------|
| Nextcloud | `https://your-domain.com/remote.php/dav/files/username/` |
| ownCloud | `https://your-domain.com/remote.php/dav/files/username/` |
| Apache mod_dav | `https://your-domain.com/webdav/` |
| Nginx WebDAV | `https://your-domain.com/dav/` |
| 坚果云 | `https://dav.jianguoyun.com/dav/` |

## 架构说明

本插件由两个组件组成（合并在同一个仓库中）：

| 组件 | 运行环境 | 部署位置 |
|------|---------|---------|
| **UI 扩展** (根目录文件) | 浏览器 | SillyTavern `extensions/third-party/sillytavern-webdav/` |
| **服务端插件** (`plugin/` 目录) | Node.js | SillyTavern `plugins/webdav/` |

## 安全说明

使用 AES-256-GCM 加密，密钥由机器特征通过 scrypt 派生

## 项目结构

```
sillytavern-webdav/
├── manifest.json              # UI 扩展清单 (Install Extension 读取)
├── index.js                   # UI 扩展入口
├── api-client.js              # API 通信封装
├── style.css                  # 自定义样式
├── templates/
│   ├── settings.html          # 设置面板模板
│   └── file-browser.html      # 文件浏览器模板
├── i18n/
│   ├── zh-cn.json             # 中文翻译
│   └── en.json                # 英文翻译
├── plugin/                    # 服务端插件 (由 install 脚本部署)
│   ├── package.json
│   ├── index.mjs              # 插件入口
│   ├── credential-store.mjs   # 凭据加密存储
│   ├── webdav-client-manager.mjs
│   ├── routes/
│   │   ├── connection.mjs     # 连接管理路由
│   │   ├── files.mjs          # 文件操作路由
│   │   └── operations.mjs     # 高级操作路由
│   └── credentials/           # 加密凭据目录
├── install.sh                 # 一键安装脚本 (macOS/Linux)
├── install.ps1                # 一键安装脚本 (Windows)
└── README.md
```

## REST API

服务端插件在 `/api/plugins/webdav/` 下注册以下端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/probe` | 探测插件是否在线 |
| `POST` | `/connect` | 测试连接并保存凭据 |
| `POST` | `/disconnect` | 断开连接并清除凭据 |
| `GET` | `/status` | 获取连接状态 |
| `GET` | `/quota` | 获取磁盘配额 |
| `POST` | `/list` | 列出目录内容 |
| `GET` | `/stat` | 获取文件信息 |
| `POST` | `/download` | 流式下载文件 |
| `POST` | `/upload` | 上传文件 (multipart) |
| `POST` | `/delete` | 删除文件或目录 |
| `POST` | `/mkdir` | 创建目录 |
| `POST` | `/exists` | 检查文件存在 |
| `POST` | `/move` | 移动/重命名 |
| `POST` | `/copy` | 复制文件 |

## 许可证

AGPL-3.0
