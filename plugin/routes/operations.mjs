/**
 * @module routes/operations
 * @description 高级文件操作路由
 * 处理 WebDAV 文件的移动/重命名和复制操作。
 */

import { getClient, sanitizePath, getConnectionInfo } from '../webdav-client-manager.mjs';

/**
 * 注册高级文件操作路由
 * @param {import('express').Router} router
 */
export function registerOperationRoutes(router) {

    /**
     * POST /move
     * 移动或重命名文件/目录 (MOVE)
     * Body: { source: string, destination: string, overwrite?: boolean }
     */
    router.post('/move', async (req, res) => {
        try {
            const { source, destination, overwrite = false } = req.body;
            const connInfo = getConnectionInfo();

            if (!source || !destination) {
                return res.status(400).json({ message: 'Source and destination paths are required.' });
            }

            const safeSource = sanitizePath(source, connInfo?.rootPath);
            const safeDest = sanitizePath(destination, connInfo?.rootPath);

            // 不允许操作根目录
            if (safeSource === '/' || safeSource === connInfo?.rootPath) {
                return res.status(400).json({ message: 'Cannot move root directory.' });
            }

            const client = getClient();
            await client.moveFile(safeSource, safeDest, { overwrite });

            return res.json({ success: true });
        } catch (error) {
            console.error('[WebDAV] Move error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * POST /copy
     * 复制文件/目录 (COPY)
     * Body: { source: string, destination: string, overwrite?: boolean }
     */
    router.post('/copy', async (req, res) => {
        try {
            const { source, destination, overwrite = false } = req.body;
            const connInfo = getConnectionInfo();

            if (!source || !destination) {
                return res.status(400).json({ message: 'Source and destination paths are required.' });
            }

            const safeSource = sanitizePath(source, connInfo?.rootPath);
            const safeDest = sanitizePath(destination, connInfo?.rootPath);

            const client = getClient();
            await client.copyFile(safeSource, safeDest, { overwrite });

            return res.json({ success: true });
        } catch (error) {
            console.error('[WebDAV] Copy error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });
}

/**
 * 将 WebDAV 错误映射为 HTTP 状态码
 * @param {Error} error - WebDAV 错误
 * @returns {number} HTTP 状态码
 */
function mapWebDAVStatus(error) {
    const status = error?.status || error?.response?.status;
    if (status === 401) return 401;
    if (status === 403) return 403;
    if (status === 404) return 404;
    if (status === 409) return 409;
    if (status === 507) return 507;
    return 500;
}
