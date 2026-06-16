# ============================================================
# SillyTavern WebDAV Plugin - 一键安装脚本 (Windows PowerShell)
# 用法: 在 SillyTavern 根目录执行
#   .\install.ps1
# ============================================================
$ErrorActionPreference = "Stop"

$ST_DIR = if ($env:ST_DIR) { $env:ST_DIR } else { Get-Location }
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PLUGIN_DIR = Join-Path $ST_DIR "plugins\webdav"
$CONFIG = Join-Path $ST_DIR "config.yaml"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  SillyTavern WebDAV Plugin Installer" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 验证 SillyTavern 目录
if (-not (Test-Path "$ST_DIR\server.js") -and -not (Test-Path "$ST_DIR\package.json")) {
    Write-Host "[!] 未找到 SillyTavern 安装目录: $ST_DIR" -ForegroundColor Red
    Write-Host "    请在 SillyTavern 根目录下执行此脚本，或设置 `$env:ST_DIR:"
    Write-Host "    `$env:ST_DIR = 'C:\path\to\SillyTavern'; .\install.ps1"
    exit 1
}

Write-Host "[*] SillyTavern 目录: $ST_DIR"
Write-Host ""

# 1. 安装 Server Plugin
if ((Test-Path $PLUGIN_DIR) -and (Test-Path "$PLUGIN_DIR\index.mjs")) {
    Write-Host "[+] Server plugin 已存在于 $PLUGIN_DIR" -ForegroundColor Green
} else {
    Write-Host "[*] 安装 Server Plugin..."
    New-Item -ItemType Directory -Path $PLUGIN_DIR -Force | Out-Null
    Copy-Item -Path "$SCRIPT_DIR\plugin\*" -Destination $PLUGIN_DIR -Recurse -Force
    Write-Host "[+] Server Plugin 已安装到 $PLUGIN_DIR" -ForegroundColor Green
}

# 2. 安装 npm 依赖
Write-Host "[*] 安装 npm 依赖..."
Push-Location $PLUGIN_DIR
npm install --silent 2>$null
if ($LASTEXITCODE -ne 0) { npm install }
Pop-Location
Write-Host "[+] 依赖安装完成" -ForegroundColor Green

# 3. 启用 Server Plugins
if (Test-Path $CONFIG) {
    $content = Get-Content $CONFIG -Raw
    if ($content -match "enableServerPlugins:\s*true") {
        Write-Host "[+] Server plugins 已在 config.yaml 中启用" -ForegroundColor Green
    } elseif ($content -match "enableServerPlugins:\s*false") {
        $content = $content -replace "enableServerPlugins:\s*false", "enableServerPlugins: true"
        Set-Content $CONFIG $content -NoNewline
        Write-Host "[+] 已在 config.yaml 中启用 Server Plugins" -ForegroundColor Green
    } else {
        Add-Content $CONFIG "`nenableServerPlugins: true"
        Write-Host "[+] 已添加 enableServerPlugins: true 到 config.yaml" -ForegroundColor Green
    }
} else {
    Write-Host "[!] config.yaml 未找到，请启动一次 SillyTavern 后重试" -ForegroundColor Yellow
    Write-Host "    或手动创建 config.yaml 并添加: enableServerPlugins: true"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  1. 重启 SillyTavern"
Write-Host "  2. 打开 Extensions 面板"
Write-Host "  3. 找到 WebDAV File Manager 设置"
Write-Host "  4. 输入 WebDAV 服务器信息并连接"
Write-Host ""
