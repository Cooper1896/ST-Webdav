/**
 * @module credential-store
 * @description 凭据加密存储模块
 * 使用 AES-256-GCM 加密 WebDAV 连接凭据，密钥由机器特征派生。
 * 凭据仅存储在服务端文件系统中，永远不会发送到浏览器。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_DIR = path.join(__dirname, 'credentials');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'config.enc');

const ALGORITHM = 'aes-256-gcm';
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT = 'sillytavern-webdav-salt-v1';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * 从机器特征派生加密密钥
 * @returns {Promise<Buffer>} 32字节密钥
 */
async function deriveKey() {
    const machineId = [
        os.hostname(),
        os.platform(),
        os.arch(),
        os.cpus().length.toString(),
        os.totalmem().toString(),
    ].join('|');

    return new Promise((resolve, reject) => {
        crypto.scrypt(machineId, SCRYPT_SALT, SCRYPT_KEY_LENGTH, (err, key) => {
            if (err) return reject(err);
            resolve(key);
        });
    });
}

/**
 * 确保凭据目录存在
 */
function ensureCredentialsDir() {
    if (!fs.existsSync(CREDENTIALS_DIR)) {
        fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
    }
}

/**
 * 加密并保存凭据到文件
 * @param {object} credentials - 凭据对象 { serverUrl, username, password, rootPath, authType }
 * @returns {Promise<void>}
 */
export async function saveCredentials(credentials) {
    ensureCredentialsDir();

    const key = await deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(credentials);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // 存储格式: iv:authTag:encrypted (全部 base64)
    const payload = [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted,
    ].join(':');

    fs.writeFileSync(CREDENTIALS_FILE, payload, { encoding: 'utf8', mode: 0o600 });
    console.log('[WebDAV] Credentials saved (encrypted)');
}

/**
 * 从文件读取并解密凭据
 * @returns {Promise<object|null>} 凭据对象，文件不存在时返回 null
 */
export async function loadCredentials() {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
        return null;
    }

    try {
        const payload = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
        const [ivB64, authTagB64, encrypted] = payload.split(':');

        const key = await deriveKey();
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    } catch (error) {
        console.error('[WebDAV] Failed to decrypt credentials:', error.message);
        // 凭据损坏时删除文件
        deleteCredentials();
        return null;
    }
}

/**
 * 删除凭据文件
 * @returns {void}
 */
export function deleteCredentials() {
    if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
        console.log('[WebDAV] Credentials deleted');
    }
}
