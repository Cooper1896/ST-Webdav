/**
 * @module routes/files
 * @description 文件操作路由
 * 处理 WebDAV 文件的浏览、下载、上传、删除、创建目录等操作。
 * 使用流式传输支持大文件，通过 multer 处理文件上传。
 */

import multer from 'multer';
import path from 'node:path';
import { getClient, sanitizePath, getConnectionInfo } from '../webdav-client-manager.mjs';

// 配置 multer：内存存储（适合中小文件）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024, // 最大 500MB
    },
});

/**
 * 获取文件类型的 MIME 类型映射
 * @param {string} filename - 文件名
 * @returns {string} MIME 类型
 */
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
        '.txt': 'text/plain', '.html': 'text/html', '.css': 'text/css',
        '.js': 'application/javascript', '.json': 'application/json',
        '.xml': 'application/xml', '.pdf': 'application/pdf',
        '.zip': 'application/zip', '.gz': 'application/gzip',
        '.tar': 'application/x-tar', '.rar': 'application/x-rar-compressed',
        '.7z': 'application/x-7z-compressed',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.flac': 'audio/flac', '.aac': 'audio/aac',
        '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
        '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.md': 'text/markdown', '.yaml': 'text/yaml', '.yml': 'text/yaml',
    };
    return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 格式化文件大小为人类可读格式
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * 将 WebDAV FileStat 转换为统一的文件信息格式
 * @param {object} stat - webdav 包的 FileStat 对象
 * @returns {object} 统一格式的文件信息
 */
function formatFileStat(stat) {
    return {
        filename: stat.filename || stat.basename,
        basename: stat.basename,
        size: stat.size || 0,
        sizeFormatted: formatFileSize(stat.size || 0),
        lastmod: stat.lastmod,
        type: stat.type, // 'file' or 'directory'
        mime: stat.type === 'directory' ? null : getMimeType(stat.basename),
    };
}

/**
 * 注册文件操作相关路由
 * @param {import('express').Router} router
 */
export function registerFileRoutes(router) {

    /**
     * POST /list
     * 列出目录内容 (PROPFIND)
     * Body: { path: string }
     */
    router.post('/list', async (req, res) => {
        try {
            const connInfo = getConnectionInfo();
            const safePath = sanitizePath(req.body.path, connInfo?.rootPath);
            const client = getClient();

            const contents = await client.getDirectoryContents(safePath);

            // 统一格式并排序（目录优先，然后按名称）
            const items = (Array.isArray(contents) ? contents : contents?.data || [])
                .map(formatFileStat)
                .sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                    return a.basename.localeCompare(b.basename);
                });

            return res.json(items);
        } catch (error) {
            console.error('[WebDAV] List error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * GET /stat
     * 获取文件/目录信息
     * Query: ?path=
     */
    router.get('/stat', async (req, res) => {
        try {
            const connInfo = getConnectionInfo();
            const safePath = sanitizePath(req.query.path, connInfo?.rootPath);
            const client = getClient();

            const stat = await client.stat(safePath);
            return res.json(formatFileStat(stat));
        } catch (error) {
            console.error('[WebDAV] Stat error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * POST /download
     * 流式下载文件
     * Body: { path: string }
     */
    router.post('/download', async (req, res) => {
        try {
            const connInfo = getConnectionInfo();
            const safePath = sanitizePath(req.body.path, connInfo?.rootPath);
            const client = getClient();

            // 获取文件信息以确定大小和类型
            const stat = await client.stat(safePath);
            if (stat.type === 'directory') {
                return res.status(400).json({ message: 'Cannot download a directory.' });
            }

            const mimeType = getMimeType(stat.basename);
            const encodedFilename = encodeURIComponent(stat.basename);

            // 设置响应头
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
            if (stat.size) {
                res.setHeader('Content-Length', stat.size);
            }

            // 使用流式传输
            const stream = client.createReadStream(safePath);
            stream.on('error', (err) => {
                console.error('[WebDAV] Download stream error:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ message: 'Download failed.' });
                }
            });

            stream.pipe(res);
        } catch (error) {
            console.error('[WebDAV] Download error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * POST /upload
     * 上传文件 (multipart/form-data)
     * Form fields: file (文件), path (目标目录路径)
     */
    router.post('/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No file provided.' });
            }

            const connInfo = getConnectionInfo();
            const targetDir = sanitizePath(req.body.path || '/', connInfo?.rootPath);
            const client = getClient();

            // 构建完整的远程文件路径
            const remotePath = targetDir.endsWith('/')
                ? targetDir + req.file.originalname
                : targetDir + '/' + req.file.originalname;

            // 上传文件内容（使用 buffer）
            await client.putFileContents(remotePath, req.file.buffer, {
                overwrite: true,
            });

            return res.json({
                success: true,
                filename: req.file.originalname,
                size: req.file.size,
                sizeFormatted: formatFileSize(req.file.size),
                path: remotePath,
            });
        } catch (error) {
            console.error('[WebDAV] Upload error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * POST /delete
     * 删除文件或目录
     * Body: { path: string }
     */
    router.post('/delete', async (req, res) => {
        try {
            const connInfo = getConnectionInfo();
            const safePath = sanitizePath(req.body.path, connInfo?.rootPath);

            // 不允许删除根目录
            if (safePath === '/' || safePath === connInfo?.rootPath) {
                return res.status(400).json({ message: 'Cannot delete root directory.' });
            }

            const client = getClient();
            await client.deleteFile(safePath);

            return res.json({ success: true });
        } catch (error) {
            console.error('[WebDAV] Delete error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * POST /mkdir
     * 创建目录 (MKCOL)
     * Body: { path: string, recursive?: boolean }
     */
    router.post('/mkdir', async (req, res) => {
        try {
            const connInfo = getConnectionInfo();
            const safePath = sanitizePath(req.body.path, connInfo?.rootPath);
            const client = getClient();

            await client.createDirectory(safePath, {
                recursive: req.body.recursive !== false,
            });

            return res.json({ success: true });
        } catch (error) {
            console.error('[WebDAV] Mkdir error:', error.message);
            const status = mapWebDAVStatus(error);
            return res.status(status).json({ message: error.message });
        }
    });

    /**
     * POST /exists
     * 检查文件/目录是否存在
     * Body: { path: string }
     */
    router.post('/exists', async (req, res) => {
        try {
            const connInfo = getConnectionInfo();
            const safePath = sanitizePath(req.body.path, connInfo?.rootPath);
            const client = getClient();

            const exists = await client.exists(safePath);
            return res.json({ exists });
        } catch (error) {
            console.error('[WebDAV] Exists error:', error.message);
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
