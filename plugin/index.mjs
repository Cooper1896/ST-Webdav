/**
 * @module sillytavern-webdav-server
 * @description SillyTavern WebDAV 服务端插件入口
 *
 * 该插件为 SillyTavern 提供 WebDAV 文件管理代理服务。
 * 所有 WebDAV 操作通过服务端路由执行，凭据安全存储在加密文件中。
 *
 * 路由前缀: /api/plugins/webdav/
 */

import { registerConnectionRoutes } from './routes/connection.mjs';
import { registerFileRoutes } from './routes/files.mjs';
import { registerOperationRoutes } from './routes/operations.mjs';
import { disconnect } from './webdav-client-manager.mjs';

/**
 * 初始化插件，注册所有路由
 * @param {import('express').Router} router - SillyTavern 提供的 Express 路由器
 * @returns {Promise<void>}
 */
async function init(router) {
    // 注册连接管理路由
    registerConnectionRoutes(router);

    // 注册文件操作路由
    registerFileRoutes(router);

    // 注册高级操作路由
    registerOperationRoutes(router);

    console.log('[WebDAV] Server plugin loaded successfully');
    console.log('[WebDAV] Routes registered at /api/plugins/webdav/');
}

/**
 * 插件退出时的清理操作
 * @returns {Promise<void>}
 */
async function exit() {
    disconnect();
    console.log('[WebDAV] Server plugin exited');
}

/**
 * 插件信息
 */
const info = {
    id: 'webdav',
    name: 'WebDAV Client',
    description: 'WebDAV file management proxy for SillyTavern. Provides secure file browsing, upload, download, and management through a server-side proxy.',
};

export { init, exit, info };
