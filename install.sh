#!/usr/bin/env bash
# ============================================================
# SillyTavern WebDAV Plugin - 一键安装脚本 (macOS/Linux)
# 用法: 在 SillyTavern 根目录执行
#   bash install.sh
# 或远程安装:
#   bash <(curl -fsSL https://raw.githubusercontent.com/YOUR-REPO/main/install.sh)
# ============================================================
set -euo pipefail

ST_DIR="${ST_DIR:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$ST_DIR/plugins/webdav"
CONFIG="$ST_DIR/config.yaml"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SillyTavern WebDAV Plugin Installer     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 验证 SillyTavern 目录
if [[ ! -f "$ST_DIR/server.js" ]] && [[ ! -f "$ST_DIR/package.json" ]]; then
    echo "[!] 未找到 SillyTavern 安装目录: $ST_DIR"
    echo "    请在 SillyTavern 根目录下执行此脚本，或设置 ST_DIR:"
    echo "    ST_DIR=/path/to/SillyTavern bash install.sh"
    exit 1
fi

echo "[*] SillyTavern 目录: $ST_DIR"
echo ""

# 1. 安装 Server Plugin
if [[ -d "$PLUGIN_DIR" ]] && [[ -f "$PLUGIN_DIR/index.mjs" ]]; then
    echo "[✓] Server plugin 已存在于 $PLUGIN_DIR"
else
    echo "[*] 安装 Server Plugin..."
    mkdir -p "$PLUGIN_DIR"
    cp -r "$SCRIPT_DIR/plugin/"* "$PLUGIN_DIR/"
    echo "[✓] Server Plugin 已安装到 $PLUGIN_DIR"
fi

# 2. 安装 npm 依赖
echo "[*] 安装 npm 依赖..."
cd "$PLUGIN_DIR"
npm install --silent 2>/dev/null || npm install
cd "$ST_DIR"
echo "[✓] 依赖安装完成"

# 3. 启用 Server Plugins
if [[ -f "$CONFIG" ]]; then
    if grep -q "enableServerPlugins: true" "$CONFIG"; then
        echo "[✓] Server plugins 已在 config.yaml 中启用"
    elif grep -q "enableServerPlugins:" "$CONFIG"; then
        sed -i.bak 's/enableServerPlugins: false/enableServerPlugins: true/' "$CONFIG" 2>/dev/null || \
        sed 's/enableServerPlugins: false/enableServerPlugins: true/' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
        echo "[✓] 已在 config.yaml 中启用 Server Plugins"
    else
        echo "" >> "$CONFIG"
        echo "enableServerPlugins: true" >> "$CONFIG"
        echo "[✓] 已添加 enableServerPlugins: true 到 config.yaml"
    fi
else
    echo "[!] config.yaml 未找到，请启动一次 SillyTavern 后重试"
    echo "    或手动创建 config.yaml 并添加: enableServerPlugins: true"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  安装完成！                               ║"
echo "╠══════════════════════════════════════════╣"
echo "║  1. 重启 SillyTavern                      ║"
echo "║  2. 打开 Extensions 面板                   ║"
echo "║  3. 找到 WebDAV File Manager 设置         ║"
echo "║  4. 输入 WebDAV 服务器信息并连接            ║"
echo "╚══════════════════════════════════════════╝"
echo ""
