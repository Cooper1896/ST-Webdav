/**
 * @module webdav-client-manager
 * @description WebDAV 客户端实例管理器
 * 负责创建、缓存和销毁 webdav npm 包的客户端实例。
 * 提供统一的客户端访问接口，凭据变更时自动重建实例。
 */

import { createClient } from 'webdav';

/** @type {import('webdav').WebDAVClient|null} 当前活跃的 WebDAV 客户端实例 */
let clientInstance = null;

/** @type {object|null} 当前连接配置（不含密码，仅用于状态查询） */
let connectionInfo = null;

/**
 * 获取当前 WebDAV 客户端实例
 * @returns {import('webdav').WebDAVClient} 客户端实例
 * @throws {Error} 未连接时抛出错误
 */
export function getClient() {
    if (!clientInstance) {
        throw new Error('WebDAV client is not connected. Please connect first.');
    }
    return clientInstance;
}

/**
 * 创建新的 WebDAV 客户端并测试连接
 * @param {object} config - 连接配置
 * @param {string} config.serverUrl - WebDAV 服务器 URL
 * @param {string} config.username - 用户名
 * @param {string} config.password - 密码
 * @param {string} [config.rootPath='/'] - 根目录路径
 * @param {string} [config.authType='password'] - 认证类型: password, digest, token
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function connect(config) {
    const { serverUrl, username, password, rootPath = '/', authType = 'password' } = config;

    // 验证输入
    if (!serverUrl || !username || !password) {
        throw new Error('Server URL, username, and password are required.');
    }

    // 验证 URL 格式
    try {
        new URL(serverUrl);
    } catch {
        throw new Error('Invalid server URL format.');
    }

    // 构建客户端选项
    const clientOptions = {
        username,
        password,
    };

    // 根据认证类型设置
    if (authType === 'digest') {
        clientOptions.authType = 'digest';
    } else if (authType === 'token') {
        // Token 认证：将密码作为 Bearer Token
        clientOptions.headers = { Authorization: `Bearer ${password}` };
        // 不需要 username/password 字段
        delete clientOptions.username;
        delete clientOptions.password;
    }

    // 创建客户端实例
    const client = createClient(serverUrl, clientOptions);

    // 测试连接：尝试获取根目录信息
    try {
        await client.stat(rootPath || '/');
    } catch (error) {
        const status = error?.status || error?.response?.status;
        if (status === 401) {
            throw new Error('Authentication failed. Please check your credentials.');
        } else if (status === 403) {
            throw new Error('Access forbidden. The server denied the connection.');
        }
        throw new Error(`Connection test failed: ${error.message || 'Unknown error'}`);
    }

    // 连接成功，保存实例
    clientInstance = client;
    connectionInfo = {
        serverUrl,
        username,
        rootPath: rootPath || '/',
        authType,
    };

    console.log(`[WebDAV] Connected to ${serverUrl} as ${username}`);
    return { success: true, message: 'Connected successfully.' };
}

/**
 * 断开连接并销毁客户端实例
 * @returns {void}
 */
export function disconnect() {
    clientInstance = null;
    connectionInfo = null;
    console.log('[WebDAV] Disconnected');
}

/**
 * 检查是否已连接
 * @returns {boolean}
 */
export function isConnected() {
    return clientInstance !== null;
}

/**
 * 获取当前连接信息（不含密码）
 * @returns {object|null} 连接信息 { serverUrl, username, rootPath, authType }
 */
export function getConnectionInfo() {
    return connectionInfo ? { ...connectionInfo } : null;
}

/**
 * 确保路径在允许的根目录范围内，防止路径遍历攻击
 * @param {string} requestedPath - 请求的路径
 * @param {string} rootPath - 允许的根路径
 * @returns {string} 验证后的安全路径
 * @throws {Error} 路径包含目录遍历时抛出错误
 */
export function sanitizePath(requestedPath, rootPath = '/') {
    if (!requestedPath) {
        return rootPath || '/';
    }

    // 检查路径遍历攻击
    const normalized = requestedPath.replace(/\\/g, '/');
    if (normalized.includes('..')) {
        throw new Error('Path traversal is not allowed.');
    }

    // 确保路径以 / 开头
    if (!normalized.startsWith('/')) {
        return '/' + normalized;
    }

    return normalized;
}
