/**
 * @module routes/connection
 * @description 连接管理路由
 * 处理 WebDAV 连接测试、凭据管理、状态查询和配额信息。
 */

import {
    saveCredentials,
    loadCredentials,
    deleteCredentials,
} from '../credential-store.mjs';

import {
    connect,
    disconnect,
    isConnected,
    getConnectionInfo,
    getClient,
} from '../webdav-client-manager.mjs';

/**
 * 注册连接管理相关路由
 * @param {import('express').Router} router
 */
export function registerConnectionRoutes(router) {

    /**
     * POST /probe
     * 探测服务端插件是否已安装并运行
     */
    router.post('/probe', (_req, res) => {
        res.sendStatus(204);
    });

    /**
     * POST /connect
     * 测试 WebDAV 连接并保存加密凭据
     * Body: { serverUrl, username, password, rootPath?, authType? }
     */
    router.post('/connect', async (req, res) => {
        try {
            const { serverUrl, username, password, rootPath, authType } = req.body;

            // 输入验证
            if (!serverUrl || !username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Server URL, username, and password are required.',
                });
            }

            // 先尝试连接
            const result = await connect({ serverUrl, username, password, rootPath, authType });

            // 连接成功后保存凭据（加密存储）
            await saveCredentials({
                serverUrl,
                username,
                password,
                rootPath: rootPath || '/',
                authType: authType || 'password',
            });

            return res.json(result);
        } catch (error) {
            console.error('[WebDAV] Connect error:', error.message);
            // 连接失败时清除可能保存的凭据
            disconnect();
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    });

    /**
     * POST /disconnect
     * 断开连接并清除凭据
     */
    router.post('/disconnect', (_req, res) => {
        try {
            disconnect();
            deleteCredentials();
            return res.json({ success: true, message: 'Disconnected successfully.' });
        } catch (error) {
            console.error('[WebDAV] Disconnect error:', error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    /**
     * GET /status
     * 获取当前连接状态（不返回密码）
     */
    router.get('/status', async (_req, res) => {
        try {
            const connected = isConnected();
            const info = getConnectionInfo();

            // 如果内存中没有连接信息，尝试从加密文件加载
            if (!connected) {
                const savedCreds = await loadCredentials();
                if (savedCreds) {
                    // 有保存的凭据但未连接，尝试自动重连
                    try {
                        await connect(savedCreds);
                        return res.json({
                            connected: true,
                            ...getConnectionInfo(),
                        });
                    } catch {
                        // 自动重连失败，凭据可能已过期
                        return res.json({ connected: false });
                    }
                }
                return res.json({ connected: false });
            }

            return res.json({
                connected: true,
                ...info,
            });
        } catch (error) {
            console.error('[WebDAV] Status error:', error.message);
            return res.status(500).json({ connected: false, message: error.message });
        }
    });

    /**
     * GET /quota
     * 获取 WebDAV 服务器磁盘配额信息
     */
    router.get('/quota', async (_req, res) => {
        try {
            const client = getClient();
            const quota = await client.getQuota();
            return res.json(quota || { used: 0, available: 'Infinity' });
        } catch (error) {
            console.error('[WebDAV] Quota error:', error.message);
            return res.status(500).json({
                used: 0,
                available: 'unknown',
                message: error.message,
            });
        }
    });
}
