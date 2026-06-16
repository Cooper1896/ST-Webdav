/**
 * @module api-client
 * @description WebDAV 服务端 API 通信封装
 * 封装所有与 SillyTavern WebDAV 服务端插件 (/api/plugins/webdav/) 的 HTTP 通信。
 * 提供统一的方法调用服务端 REST API。
 */

const API_BASE = '/api/plugins/webdav';

/**
 * 发送 JSON POST 请求
 * @param {string} url - 请求 URL
 * @param {object} data - 请求体数据
 * @returns {Promise<object>} 响应 JSON
 */
async function postJson(url, data = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });

    if (response.status === 204) return { success: true };

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(json.message || `Request failed (${response.status})`);
    }
    return json;
}

/**
 * 发送 JSON GET 请求
 * @param {string} url - 请求 URL
 * @returns {Promise<object>} 响应 JSON
 */
async function getJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.message || `Request failed (${response.status})`);
    }
    return response.json();
}

/**
 * WebDAV API 客户端对象
 */
export const WebDAVApi = {

    // ===== 连接管理 =====

    /**
     * 探测服务端插件是否在线
     * @returns {Promise<boolean>}
     */
    async probe() {
        try {
            const response = await fetch(`${API_BASE}/probe`, { method: 'POST' });
            return response.ok;
        } catch {
            return false;
        }
    },

    /**
     * 连接 WebDAV 服务器
     * @param {object} config - 连接配置
     * @param {string} config.serverUrl - 服务器 URL
     * @param {string} config.username - 用户名
     * @param {string} config.password - 密码
     * @param {string} [config.rootPath='/'] - 根路径
     * @param {string} [config.authType='password'] - 认证类型
     * @returns {Promise<object>} { success, message }
     */
    connect(config) {
        return postJson(`${API_BASE}/connect`, config);
    },

    /**
     * 断开连接
     * @returns {Promise<object>} { success }
     */
    disconnect() {
        return postJson(`${API_BASE}/disconnect`);
    },

    /**
     * 获取连接状态
     * @returns {Promise<object>} { connected, serverUrl?, username?, rootPath? }
     */
    getStatus() {
        return getJson(`${API_BASE}/status`);
    },

    /**
     * 获取磁盘配额
     * @returns {Promise<object>} { used, available }
     */
    getQuota() {
        return getJson(`${API_BASE}/quota`);
    },

    // ===== 文件操作 =====

    /**
     * 列出目录内容
     * @param {string} dirPath - 目录路径
     * @returns {Promise<Array>} 文件/目录列表
     */
    listDir(dirPath) {
        return postJson(`${API_BASE}/list`, { path: dirPath });
    },

    /**
     * 获取文件/目录信息
     * @param {string} filePath - 文件路径
     * @returns {Promise<object>} 文件信息
     */
    stat(filePath) {
        return getJson(`${API_BASE}/stat?path=${encodeURIComponent(filePath)}`);
    },

    /**
     * 下载文件（返回 Blob）
     * @param {string} filePath - 远程文件路径
     * @param {function} [onProgress] - 进度回调 (0-100)
     * @returns {Promise<Blob>} 文件 Blob
     */
    async download(filePath, onProgress) {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath }),
        });

        if (!response.ok) {
            const json = await response.json().catch(() => ({}));
            throw new Error(json.message || 'Download failed');
        }

        // 如果支持进度追踪
        if (onProgress && response.body) {
            const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
            if (contentLength > 0) {
                const reader = response.body.getReader();
                let received = 0;
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    received += value.length;
                    onProgress(Math.round((received / contentLength) * 100));
                }

                return new Blob(chunks);
            }
        }

        return response.blob();
    },

    /**
     * 上传文件
     * @param {File} file - 要上传的文件
     * @param {string} targetDir - 目标目录路径
     * @param {function} [onProgress] - 进度回调 (0-100)
     * @returns {Promise<object>} { success, filename, size }
     */
    async upload(file, targetDir, onProgress) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', targetDir);

        if (onProgress) {
            // 使用 XMLHttpRequest 获取上传进度
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${API_BASE}/upload`);

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress(Math.round((e.loaded / e.total) * 100));
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText));
                        } catch {
                            resolve({ success: true });
                        }
                    } else {
                        try {
                            const err = JSON.parse(xhr.responseText);
                            reject(new Error(err.message || 'Upload failed'));
                        } catch {
                            reject(new Error('Upload failed'));
                        }
                    }
                };

                xhr.onerror = () => reject(new Error('Upload network error'));
                xhr.send(formData);
            });
        }

        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const json = await response.json().catch(() => ({}));
            throw new Error(json.message || 'Upload failed');
        }

        return response.json();
    },

    /**
     * 删除文件或目录
     * @param {string} filePath - 文件路径
     * @returns {Promise<object>} { success }
     */
    deleteFile(filePath) {
        return postJson(`${API_BASE}/delete`, { path: filePath });
    },

    /**
     * 创建目录
     * @param {string} dirPath - 目录路径
     * @param {boolean} [recursive=true] - 是否递归创建
     * @returns {Promise<object>} { success }
     */
    mkdir(dirPath, recursive = true) {
        return postJson(`${API_BASE}/mkdir`, { path: dirPath, recursive });
    },

    /**
     * 检查文件是否存在
     * @param {string} filePath - 文件路径
     * @returns {Promise<object>} { exists: boolean }
     */
    exists(filePath) {
        return postJson(`${API_BASE}/exists`, { path: filePath });
    },

    /**
     * 移动/重命名文件
     * @param {string} source - 源路径
     * @param {string} destination - 目标路径
     * @param {boolean} [overwrite=false] - 是否覆盖
     * @returns {Promise<object>} { success }
     */
    moveFile(source, destination, overwrite = false) {
        return postJson(`${API_BASE}/move`, { source, destination, overwrite });
    },

    /**
     * 复制文件
     * @param {string} source - 源路径
     * @param {string} destination - 目标路径
     * @param {boolean} [overwrite=false] - 是否覆盖
     * @returns {Promise<object>} { success }
     */
    copyFile(source, destination, overwrite = false) {
        return postJson(`${API_BASE}/copy`, { source, destination, overwrite });
    },
};
