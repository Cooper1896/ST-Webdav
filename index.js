/**
 * @module sillytavern-webdav-extension
 * @description SillyTavern WebDAV 文件管理器 UI 扩展入口
 *
 * 提供 WebDAV 连接配置面板和文件浏览器界面。
 * 所有 WebDAV 操作通过服务端插件代理执行，凭据安全存储在服务端。
 */

import { WebDAVApi } from './api-client.js';

/** 模块唯一标识，用于 extensionSettings 键名 */
const MODULE_NAME = 'sillytavern_webdav';

/** 日志前缀 */
const LOG_PREFIX = '[WebDAV]';

/**
 * 安全提取错误信息
 * @param {*} error - 可能是 Error、字符串或其他类型
 * @returns {string}
 */
function getErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.statusText) return error.statusText;
    try { return String(error); } catch { return 'Unknown error'; }
}

/** 默认设置（仅包含非敏感数据） */
const defaultSettings = Object.freeze({
    enabled: true,
    lastPath: '/',
    viewMode: 'list',           // 'grid' 或 'list'
    showHiddenFiles: false,
    sortBy: 'name',             // 'name', 'size', 'lastmod'
    sortOrder: 'asc',
    confirmDelete: true,
    autoRefresh: false,
});

/** 连接状态枚举 */
const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
};

/** 当前连接状态 */
let currentState = ConnectionState.DISCONNECTED;

/** 当前浏览路径 */
let currentPath = '/';

/** 当前目录文件列表 */
let currentFiles = [];

// ============================================================
// 设置管理
// ============================================================

/**
 * 获取或初始化扩展设置
 * @returns {object} 当前设置
 */
function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    // 确保所有默认键存在（版本更新后）
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

/**
 * 保存设置到服务端
 */
function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
}

// ============================================================
// UI 状态管理
// ============================================================

/**
 * 更新连接状态 UI
 * @param {string} state - ConnectionState 枚举值
 */
function updateConnectionState(state) {
    currentState = state;

    const indicator = document.querySelector('.webdav-status-indicator');
    const statusText = document.querySelector('.webdav-status-text');
    const connectBtn = document.getElementById('webdav_connect_btn');
    const disconnectBtn = document.getElementById('webdav_disconnect_btn');
    const browserBtn = document.getElementById('webdav_open_browser_btn');

    if (!indicator) return;

    // 移除所有状态类
    indicator.classList.remove('status-disconnected', 'status-connecting', 'status-connected');

    switch (state) {
        case ConnectionState.CONNECTED:
            indicator.classList.add('status-connected');
            if (statusText) statusText.textContent = 'Connected';
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = false;
            if (browserBtn) browserBtn.disabled = false;
            break;

        case ConnectionState.CONNECTING:
            indicator.classList.add('status-connecting');
            if (statusText) statusText.textContent = 'Connecting...';
            if (connectBtn) connectBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = true;
            if (browserBtn) browserBtn.disabled = true;
            break;

        case ConnectionState.DISCONNECTED:
        default:
            indicator.classList.add('status-disconnected');
            if (statusText) statusText.textContent = 'Disconnected';
            if (connectBtn) connectBtn.disabled = false;
            if (disconnectBtn) disconnectBtn.disabled = true;
            if (browserBtn) browserBtn.disabled = true;
            break;
    }
}

/**
 * 填充已保存的连接信息到设置面板
 */
async function populateConnectionInfo() {
    try {
        const status = await WebDAVApi.getStatus();
        if (status.connected) {
            const serverInput = document.getElementById('webdav_server_url');
            const userInput = document.getElementById('webdav_username');
            const rootInput = document.getElementById('webdav_root_path');
            const authSelect = document.getElementById('webdav_auth_type');

            if (serverInput) serverInput.value = status.serverUrl || '';
            if (userInput) userInput.value = status.username || '';
            if (rootInput) rootInput.value = status.rootPath || '/';
            if (authSelect && status.authType) authSelect.value = status.authType;

            updateConnectionState(ConnectionState.CONNECTED);
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to populate connection info:`, getErrorMessage(error));
    }
}

// ============================================================
// 连接操作
// ============================================================

/**
 * 连接到 WebDAV 服务器
 */
async function handleConnect() {
    const serverUrl = document.getElementById('webdav_server_url')?.value?.trim();
    const username = document.getElementById('webdav_username')?.value?.trim();
    const password = document.getElementById('webdav_password')?.value;
    const rootPath = document.getElementById('webdav_root_path')?.value?.trim() || '/';
    const authType = document.getElementById('webdav_auth_type')?.value || 'password';

    if (!serverUrl || !username || !password) {
        toastr.warning('Please fill in server URL, username, and password.', 'WebDAV');
        return;
    }

    updateConnectionState(ConnectionState.CONNECTING);

    try {
        const result = await WebDAVApi.connect({ serverUrl, username, password, rootPath, authType });

        // 连接成功：立即清空密码输入框（安全）
        const passwordInput = document.getElementById('webdav_password');
        if (passwordInput) passwordInput.value = '';

        updateConnectionState(ConnectionState.CONNECTED);
        toastr.success(result.message || 'Connected to WebDAV server.', 'WebDAV');
        console.log(`${LOG_PREFIX} Connected to ${serverUrl}`);
    } catch (error) {
        updateConnectionState(ConnectionState.DISCONNECTED);
        toastr.error(getErrorMessage(error) || 'Failed to connect.', 'WebDAV');
        console.error(`${LOG_PREFIX} Connect error:`, getErrorMessage(error));
    }
}

/**
 * 断开 WebDAV 连接
 */
async function handleDisconnect() {
    try {
        await WebDAVApi.disconnect();
        updateConnectionState(ConnectionState.DISCONNECTED);

        // 清空输入框
        const fields = ['webdav_server_url', 'webdav_username', 'webdav_password', 'webdav_root_path'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        toastr.info('Disconnected from WebDAV server.', 'WebDAV');
    } catch (error) {
        toastr.error(getErrorMessage(error) || 'Failed to disconnect.', 'WebDAV');
    }
}

// ============================================================
// 文件浏览器
// ============================================================

/**
 * 获取文件类型对应的 Font Awesome 图标类名
 * @param {object} file - 文件信息对象
 * @returns {string} 图标类名
 */
function getFileIcon(file) {
    if (file.type === 'directory') return 'fa-solid fa-folder';

    const ext = (file.basename || '').split('.').pop()?.toLowerCase();
    const iconMap = {
        // 图片
        jpg: 'fa-solid fa-file-image', jpeg: 'fa-solid fa-file-image',
        png: 'fa-solid fa-file-image', gif: 'fa-solid fa-file-image',
        webp: 'fa-solid fa-file-image', svg: 'fa-solid fa-file-image',
        bmp: 'fa-solid fa-file-image', ico: 'fa-solid fa-file-image',
        // 文档
        pdf: 'fa-solid fa-file-pdf', doc: 'fa-solid fa-file-word',
        docx: 'fa-solid fa-file-word', txt: 'fa-solid fa-file-lines',
        md: 'fa-solid fa-file-lines', rtf: 'fa-solid fa-file-lines',
        // 表格
        xls: 'fa-solid fa-file-excel', xlsx: 'fa-solid fa-file-excel',
        csv: 'fa-solid fa-file-csv',
        // 演示文稿
        ppt: 'fa-solid fa-file-powerpoint', pptx: 'fa-solid fa-file-powerpoint',
        // 压缩包
        zip: 'fa-solid fa-file-zipper', rar: 'fa-solid fa-file-zipper',
        '7z': 'fa-solid fa-file-zipper', gz: 'fa-solid fa-file-zipper',
        tar: 'fa-solid fa-file-zipper',
        // 视频
        mp4: 'fa-solid fa-file-video', avi: 'fa-solid fa-file-video',
        mkv: 'fa-solid fa-file-video', webm: 'fa-solid fa-file-video',
        mov: 'fa-solid fa-file-video',
        // 音频
        mp3: 'fa-solid fa-file-audio', wav: 'fa-solid fa-file-audio',
        ogg: 'fa-solid fa-file-audio', flac: 'fa-solid fa-file-audio',
        aac: 'fa-solid fa-file-audio',
        // 代码
        js: 'fa-solid fa-file-code', mjs: 'fa-solid fa-file-code',
        ts: 'fa-solid fa-file-code', py: 'fa-solid fa-file-code',
        html: 'fa-solid fa-file-code', css: 'fa-solid fa-file-code',
        json: 'fa-solid fa-file-code', xml: 'fa-solid fa-file-code',
        yaml: 'fa-solid fa-file-code', yml: 'fa-solid fa-file-code',
    };
    return iconMap[ext] || 'fa-solid fa-file';
}

/**
 * 获取文件图标的颜色
 * @param {object} file - 文件信息对象
 * @returns {string} CSS 颜色类名
 */
function getFileIconColor(file) {
    if (file.type === 'directory') return 'webdav-icon-folder';
    const ext = (file.basename || '').split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const videoExts = ['mp4', 'avi', 'mkv', 'webm', 'mov'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
    if (imageExts.includes(ext)) return 'webdav-icon-image';
    if (videoExts.includes(ext)) return 'webdav-icon-video';
    if (audioExts.includes(ext)) return 'webdav-icon-audio';
    return 'webdav-icon-file';
}

/**
 * 构建面包屑导航 HTML
 * @param {string} path - 当前路径
 * @returns {string} HTML 字符串
 */
function buildBreadcrumb(path) {
    const segments = path.split('/').filter(Boolean);
    let html = '<span class="webdav-breadcrumb-item" data-path="/">Root</span>';
    let accumulated = '';

    for (const segment of segments) {
        accumulated += '/' + segment;
        html += `<span class="webdav-breadcrumb-sep">/</span>`;
        html += `<span class="webdav-breadcrumb-item" data-path="${accumulated}">${segment}</span>`;
    }

    return html;
}

/**
 * 加载并渲染目录内容
 * @param {string} dirPath - 目录路径
 */
async function loadDirectory(dirPath) {
    const fileList = document.querySelector('.webdav-file-list');
    if (!fileList) return;

    // 显示加载状态
    fileList.innerHTML = '<div class="webdav-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        currentFiles = await WebDAVApi.listDir(dirPath);
        currentPath = dirPath;

        // 更新设置中的 lastPath
        const settings = getSettings();
        settings.lastPath = dirPath;
        saveSettings();

        // 更新面包屑
        const breadcrumb = document.querySelector('.webdav-breadcrumb');
        if (breadcrumb) breadcrumb.innerHTML = buildBreadcrumb(dirPath);

        // 更新当前路径显示
        const pathDisplay = document.querySelector('.webdav-current-path');
        if (pathDisplay) pathDisplay.textContent = dirPath;

        // 更新项目计数
        const itemCount = document.querySelector('.webdav-item-count');
        if (itemCount) itemCount.textContent = `${currentFiles.length} items`;

        // 排序文件列表
        sortFiles();

        // 渲染文件列表
        renderFileList();
    } catch (error) {
        const msg = getErrorMessage(error);
        fileList.innerHTML = `<div class="webdav-error"><i class="fa-solid fa-exclamation-triangle"></i> ${msg}</div>`;
        toastr.error(msg, 'WebDAV');
    }
}

/**
 * 根据当前排序设置排序文件列表
 */
function sortFiles() {
    const settings = getSettings();
    const { sortBy, sortOrder } = settings;

    currentFiles.sort((a, b) => {
        // 目录始终排在前面
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;

        let cmp = 0;
        switch (sortBy) {
            case 'size':
                cmp = (a.size || 0) - (b.size || 0);
                break;
            case 'lastmod':
                cmp = new Date(a.lastmod || 0) - new Date(b.lastmod || 0);
                break;
            case 'name':
            default:
                cmp = (a.basename || '').localeCompare(b.basename || '');
                break;
        }

        return sortOrder === 'desc' ? -cmp : cmp;
    });
}

/**
 * 渲染文件列表 HTML
 */
function renderFileList() {
    const fileList = document.querySelector('.webdav-file-list');
    if (!fileList) return;

    const settings = getSettings();

    if (currentFiles.length === 0) {
        fileList.innerHTML = '<div class="webdav-empty"><i class="fa-solid fa-folder-open"></i> Empty directory</div>';
        return;
    }

    // 过滤隐藏文件
    let displayFiles = currentFiles;
    if (!settings.showHiddenFiles) {
        displayFiles = currentFiles.filter(f => !f.basename?.startsWith('.'));
    }

    const viewMode = settings.viewMode || 'list';
    fileList.className = `webdav-file-list webdav-view-${viewMode}`;

    fileList.innerHTML = displayFiles.map(file => {
        const name = file.basename || file.filename || 'unnamed';
        const filePath = file.filename || file.basename || '';
        const fileType = file.type || 'file';
        const sizeStr = file.sizeFormatted || '0 B';
        const dateStr = file.lastmod ? new Date(file.lastmod).toLocaleDateString() : '';

        return `
        <div class="webdav-file-item" data-path="${filePath}" data-type="${fileType}" data-name="${name}">
            <div class="webdav-file-icon ${getFileIconColor(file)}">
                <i class="${getFileIcon(file)}"></i>
            </div>
            <div class="webdav-file-info">
                <span class="webdav-file-name" title="${name}">${name}</span>
                <span class="webdav-file-meta">
                    ${fileType === 'file' ? `<span class="webdav-file-size">${sizeStr}</span>` : ''}
                    ${dateStr ? `<span class="webdav-file-date">${dateStr}</span>` : ''}
                </span>
            </div>
            <div class="webdav-file-actions">
                ${fileType === 'file' ? '<button class="webdav-btn-download" title="Download"><i class="fa-solid fa-download"></i></button>' : ''}
                <button class="webdav-btn-rename" title="Rename"><i class="fa-solid fa-pen"></i></button>
                <button class="webdav-btn-delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');

    // 绑定文件项事件
    bindFileItemEvents();
}

/**
 * 绑定文件项的交互事件
 */
function bindFileItemEvents() {
    const fileList = document.querySelector('.webdav-file-list');
    if (!fileList) return;

    // 双击打开目录
    fileList.querySelectorAll('.webdav-file-item').forEach(item => {
        item.addEventListener('dblclick', (e) => {
            if (e.target.closest('.webdav-file-actions')) return;
            const type = item.dataset.type;
            const filePath = item.dataset.path;
            if (type === 'directory') {
                loadDirectory(filePath);
            }
        });
    });

    // 下载按钮
    fileList.querySelectorAll('.webdav-btn-download').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.webdav-file-item');
            const filePath = item.dataset.path;
            const fileName = item.dataset.name;
            await handleDownload(filePath, fileName);
        });
    });

    // 重命名按钮
    fileList.querySelectorAll('.webdav-btn-rename').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.webdav-file-item');
            await handleRename(item.dataset.path, item.dataset.name);
        });
    });

    // 删除按钮
    fileList.querySelectorAll('.webdav-btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.webdav-file-item');
            await handleDelete(item.dataset.path, item.dataset.name);
        });
    });
}

// ============================================================
// 文件操作处理
// ============================================================

/**
 * 下载文件
 * @param {string} filePath - 远程文件路径
 * @param {string} fileName - 文件名
 */
async function handleDownload(filePath, fileName) {
    const { loader } = SillyTavern.getContext();
    const handle = loader.show({ message: `Downloading ${fileName}...`, blocking: false });

    try {
        const blob = await WebDAVApi.download(filePath);

        // 创建下载链接并触发下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toastr.success(`${fileName} downloaded.`, 'WebDAV');
    } catch (error) {
        toastr.error(`Download failed: ${getErrorMessage(error)}`, 'WebDAV');
    } finally {
        await handle.hide();
    }
}

/**
 * 上传文件到当前目录
 */
async function handleUpload() {
    // 创建隐藏的文件选择器
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;

    input.onchange = async () => {
        if (!input.files || input.files.length === 0) return;

        const { loader } = SillyTavern.getContext();
        const totalFiles = input.files.length;
        let uploaded = 0;

        for (const file of input.files) {
            const handle = loader.show({
                message: `Uploading ${file.name} (${uploaded + 1}/${totalFiles})...`,
                blocking: true,
            });

            try {
                await WebDAVApi.upload(file, currentPath, (progress) => {
                    // 进度更新可通过 loader message 反映
                });
                uploaded++;
                toastr.success(`${file.name} uploaded.`, 'WebDAV');
            } catch (error) {
                toastr.error(`Failed to upload ${file.name}: ${getErrorMessage(error)}`, 'WebDAV');
            } finally {
                await handle.hide();
            }
        }

        // 刷新目录
        if (uploaded > 0) {
            await loadDirectory(currentPath);
        }
    };

    input.click();
}

/**
 * 删除文件或目录
 * @param {string} filePath - 文件路径
 * @param {string} fileName - 文件名
 */
async function handleDelete(filePath, fileName) {
    const settings = getSettings();
    const { Popup } = SillyTavern.getContext();

    // 确认删除
    if (settings.confirmDelete) {
        const confirmed = await Popup.show.confirm(
            'Confirm Delete',
            `Are you sure you want to delete "${fileName}"? This action cannot be undone.`
        );
        if (!confirmed) return;
    }

    try {
        await WebDAVApi.deleteFile(filePath);
        toastr.success(`${fileName} deleted.`, 'WebDAV');
        await loadDirectory(currentPath);
    } catch (error) {
        toastr.error(`Delete failed: ${getErrorMessage(error)}`, 'WebDAV');
    }
}

/**
 * 重命名文件或目录
 * @param {string} filePath - 当前路径
 * @param {string} currentName - 当前名称
 */
async function handleRename(filePath, currentName) {
    const { Popup } = SillyTavern.getContext();

    const newName = await Popup.show.input(
        'Rename',
        `Enter new name for "${currentName}":`,
        currentName
    );

    if (!newName || newName === currentName) return;

    // 构建新路径
    const parentPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
    const newPath = parentPath.endsWith('/') ? parentPath + newName : parentPath + '/' + newName;

    try {
        await WebDAVApi.moveFile(filePath, newPath);
        toastr.success(`Renamed to "${newName}".`, 'WebDAV');
        await loadDirectory(currentPath);
    } catch (error) {
        toastr.error(`Rename failed: ${getErrorMessage(error)}`, 'WebDAV');
    }
}

/**
 * 创建新目录
 */
async function handleMkdir() {
    const { Popup } = SillyTavern.getContext();

    const folderName = await Popup.show.input(
        'New Folder',
        'Enter folder name:',
        ''
    );

    if (!folderName) return;

    const newPath = currentPath.endsWith('/') ? currentPath + folderName : currentPath + '/' + folderName;

    try {
        await WebDAVApi.mkdir(newPath);
        toastr.success(`Folder "${folderName}" created.`, 'WebDAV');
        await loadDirectory(currentPath);
    } catch (error) {
        toastr.error(`Failed to create folder: ${getErrorMessage(error)}`, 'WebDAV');
    }
}

/**
 * 打开文件浏览器弹窗
 */
async function openFileBrowser() {
    if (currentState !== ConnectionState.CONNECTED) {
        toastr.warning('Please connect to a WebDAV server first.', 'WebDAV');
        return;
    }

    const { renderExtensionTemplateAsync, Popup, POPUP_TYPE } = SillyTavern.getContext();

    try {
        if (typeof renderExtensionTemplateAsync !== 'function') {
            toastr.error('renderExtensionTemplateAsync is not available.', 'WebDAV');
            return;
        }

        const browserHtml = await renderExtensionTemplateAsync(
            'third-party/sillytavern-webdav',
            'templates/file-browser',
            {}
        );

        if (!browserHtml || typeof browserHtml !== 'string') {
            toastr.error('Failed to load file browser template.', 'WebDAV');
            return;
        }

        // 确定正确的弹窗类型
        const popupType = POPUP_TYPE?.TEXT ?? Popup?.POPUP_TYPE?.TEXT ?? 1;

        const popup = new Popup(
            browserHtml,
            popupType,
            '',
            {
                wide: true,
                okButton: 'Close',
                allowVerticalScrolling: true,
            }
        );

        // 在弹窗显示后初始化浏览器内容
        setTimeout(async () => {
            bindBrowserToolbarEvents();
            const settings = getSettings();
            await loadDirectory(settings.lastPath || '/');

            // 尝试加载配额信息
            try {
                const quota = await WebDAVApi.getQuota();
                const quotaEl = document.querySelector('.webdav-quota-info');
                if (quotaEl && quota.used !== undefined) {
                    const used = formatBytes(quota.used);
                    const available = quota.available === 'Infinity' ? '∞' : formatBytes(quota.available);
                    quotaEl.textContent = `Used: ${used} / Available: ${available}`;
                }
            } catch {
                // 配额获取失败不影响使用
            }
        }, 200);

        await popup.show();
    } catch (error) {
        console.error(`${LOG_PREFIX} File browser error:`, getErrorMessage(error));
        toastr.error('Failed to open file browser.', 'WebDAV');
    }
}

/**
 * 绑定文件浏览器工具栏事件
 */
function bindBrowserToolbarEvents() {
    // 返回上级目录
    const backBtn = document.querySelector('.webdav-btn-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentPath === '/' || currentPath === '') return;
            const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
            loadDirectory(parent);
        });
    }

    // 刷新
    const refreshBtn = document.querySelector('.webdav-btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDirectory(currentPath));
    }

    // 新建文件夹
    const mkdirBtn = document.querySelector('.webdav-btn-mkdir');
    if (mkdirBtn) {
        mkdirBtn.addEventListener('click', () => handleMkdir());
    }

    // 上传
    const uploadBtn = document.querySelector('.webdav-btn-upload');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => handleUpload());
    }

    // 视图切换
    const viewToggle = document.querySelector('.webdav-btn-view-toggle');
    if (viewToggle) {
        viewToggle.addEventListener('click', () => {
            const settings = getSettings();
            settings.viewMode = settings.viewMode === 'grid' ? 'list' : 'grid';
            saveSettings();
            renderFileList();
        });
    }

    // 面包屑导航
    const breadcrumb = document.querySelector('.webdav-breadcrumb');
    if (breadcrumb) {
        breadcrumb.addEventListener('click', (e) => {
            const item = e.target.closest('.webdav-breadcrumb-item');
            if (item && item.dataset.path) {
                loadDirectory(item.dataset.path);
            }
        });
    }

    // 排序按钮
    document.querySelectorAll('.webdav-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const settings = getSettings();
            const field = btn.dataset.sort;
            if (settings.sortBy === field) {
                settings.sortOrder = settings.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                settings.sortBy = field;
                settings.sortOrder = 'asc';
            }
            saveSettings();
            sortFiles();
            renderFileList();
        });
    });
}

/**
 * 格式化字节数为可读字符串
 * @param {number} bytes - 字节数
 * @returns {string}
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================
// 设置面板渲染
// ============================================================

/**
 * 渲染设置面板并追加到扩展设置区域
 */
async function renderSettingsPanel() {
    try {
        const { renderExtensionTemplateAsync } = SillyTavern.getContext();

        if (typeof renderExtensionTemplateAsync !== 'function') {
            console.error(`${LOG_PREFIX} renderExtensionTemplateAsync is not available`);
            return;
        }

        const settingsHtml = await renderExtensionTemplateAsync(
            'third-party/sillytavern-webdav',
            'templates/settings',
            {}
        );

        if (!settingsHtml || typeof settingsHtml !== 'string') {
            console.error(`${LOG_PREFIX} Settings template returned empty or invalid HTML`);
            return;
        }

        const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (container) {
            container.insertAdjacentHTML('beforeend', settingsHtml);
        } else {
            console.warn(`${LOG_PREFIX} Settings container not found (#extensions_settings2 or #extensions_settings)`);
        }
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to render settings panel:`, getErrorMessage(error));
    }
}

/**
 * 绑定设置面板的事件监听器
 */
function bindSettingsEvents() {
    // 连接按钮
    document.getElementById('webdav_connect_btn')?.addEventListener('click', handleConnect);

    // 断开按钮
    document.getElementById('webdav_disconnect_btn')?.addEventListener('click', handleDisconnect);

    // 打开文件浏览器
    document.getElementById('webdav_open_browser_btn')?.addEventListener('click', openFileBrowser);

    // 显示隐藏文件选项
    document.getElementById('webdav_show_hidden')?.addEventListener('change', (e) => {
        const settings = getSettings();
        settings.showHiddenFiles = e.target.checked;
        saveSettings();
    });

    // 删除确认选项
    document.getElementById('webdav_confirm_delete')?.addEventListener('change', (e) => {
        const settings = getSettings();
        settings.confirmDelete = e.target.checked;
        saveSettings();
    });

    // 重新检查服务端插件按钮
    document.getElementById('webdav_recheck_btn')?.addEventListener('click', async () => {
        toastr.info('Re-checking server plugin...', 'WebDAV');
        await checkServerPluginStatus();
    });
}

// ============================================================
// 服务端插件检测
// ============================================================

/**
 * 检查服务端插件是否可用并更新 UI 状态
 */
async function checkServerPluginStatus() {
    const isOnline = await WebDAVApi.probe();
    const setupGuide = document.querySelector('.webdav-setup-guide');

    if (!isOnline) {
        updateConnectionState(ConnectionState.DISCONNECTED);

        // 显示安装引导
        if (setupGuide) {
            setupGuide.style.display = 'block';
        }

        const statusText = document.querySelector('.webdav-status-text');
        if (statusText) {
            statusText.textContent = 'Server plugin not available';
            statusText.title = 'The WebDAV server plugin is not installed or not running. Please run the install script and restart SillyTavern.';
        }
        console.warn(`${LOG_PREFIX} Server plugin is not available`);
        return;
    }

    // 隐藏安装引导
    if (setupGuide) {
        setupGuide.style.display = 'none';
    }

    console.log(`${LOG_PREFIX} Server plugin detected`);

    // 插件在线，获取连接状态
    await populateConnectionInfo();
}

// ============================================================
// 生命周期 Hooks（导出给 manifest.json 使用）
// ============================================================

/**
 * 扩展安装时调用
 */
export async function onInstall() {
    console.log(`${LOG_PREFIX} Extension installed`);
}

/**
 * 扩展激活时调用（页面加载期间）
 * 在此阶段仅注册 APP_INITIALIZED 事件监听器，
 * 实际的 DOM 操作和 API 调用延迟到 APP_INITIALIZED 事件触发时执行。
 */
export async function onActivate() {
    console.log(`${LOG_PREFIX} Extension activated, waiting for APP_INITIALIZED...`);

    try {
        const { eventSource, event_types } = SillyTavern.getContext();

        eventSource.on(event_types.APP_INITIALIZED, async () => {
            console.log(`${LOG_PREFIX} APP_INITIALIZED received, initializing UI...`);

            // 渲染设置面板
            await renderSettingsPanel();

            // 绑定事件
            bindSettingsEvents();

            // 检查服务端插件状态
            await checkServerPluginStatus();
        });
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to register APP_INITIALIZED handler:`, getErrorMessage(error));
        // 降级：直接尝试初始化（可能部分功能不可用）
        setTimeout(async () => {
            await renderSettingsPanel();
            bindSettingsEvents();
            await checkServerPluginStatus();
        }, 1000);
    }
}

/**
 * 扩展删除时调用
 */
export async function onDelete() {
    console.log(`${LOG_PREFIX} Extension deleted, cleaning up...`);
    try {
        const { localforage } = SillyTavern.libs;
        if (localforage) {
            await localforage.removeItem(`${MODULE_NAME}_cache`);
        }
    } catch (error) {
        console.error(`${LOG_PREFIX} Cleanup error:`, getErrorMessage(error));
    }
}

/**
 * 用户点击 "Clean extension data" 时调用
 */
export async function onClean() {
    console.log(`${LOG_PREFIX} Extension data cleaned`);
    try {
        const { extensionSettings } = SillyTavern.getContext();
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        saveSettings();
    } catch (error) {
        console.error(`${LOG_PREFIX} Clean error:`, getErrorMessage(error));
    }
}
