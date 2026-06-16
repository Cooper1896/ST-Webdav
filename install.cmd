@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ============================================================
REM SillyTavern WebDAV Plugin - 一键安装脚本 (Windows CMD)
REM 用法: 在扩展目录双击运行，或从任意位置执行
REM ============================================================

echo.
echo ==========================================
echo   SillyTavern WebDAV Plugin Installer
echo ==========================================
echo.

REM 确定脚本所在目录（即扩展安装目录）
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM 确定 SillyTavern 目录
if defined ST_DIR (
    set "ST_DIR=%ST_DIR%"
) else (
    REM 自动检测：脚本在 data/<user>/extensions/ST-Webdav/ 下，往上 4 层即 ST 根目录
    set "ST_DIR=%SCRIPT_DIR%\..\..\..\.."
    for %%I in ("!ST_DIR!") do set "ST_DIR=%%~fI"
)

set "PLUGIN_DIR=%ST_DIR%\plugins\webdav"
set "CONFIG=%ST_DIR%\config.yaml"

REM 验证 SillyTavern 目录
if exist "%ST_DIR%\server.js" goto :st_ok
if exist "%ST_DIR%\package.json" goto :st_ok
echo [!] 未找到 SillyTavern 安装目录: %ST_DIR%
echo     脚本自动检测到的路径可能不正确，请手动设置 ST_DIR:
echo     set ST_DIR=C:\path\to\SillyTavern
echo     install.cmd
goto :fail
:st_ok

echo [*] SillyTavern 目录: %ST_DIR%
echo.

REM 1. 安装 Server Plugin
if exist "%PLUGIN_DIR%\index.mjs" (
    echo [+] Server plugin 已存在于 %PLUGIN_DIR%
) else (
    echo [*] 安装 Server Plugin...
    if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
    xcopy /E /I /Y /Q "%SCRIPT_DIR%\plugin\*" "%PLUGIN_DIR%\" >nul 2>&1
    if errorlevel 1 (
        echo [!] 复制文件失败
        goto :fail
    )
    echo [+] Server Plugin 已安装到 %PLUGIN_DIR%
)

REM 2. 安装 npm 依赖
echo [*] 安装 npm 依赖...
pushd "%PLUGIN_DIR%"
call npm install --silent 2>nul
if errorlevel 1 (
    call npm install
    if errorlevel 1 (
        echo [!] npm install 失败
        popd
        goto :fail
    )
)
popd
echo [+] 依赖安装完成

REM 3. 启用 Server Plugins
if not exist "%CONFIG%" (
    echo [!] config.yaml 未找到，请启动一次 SillyTavern 后重试
    echo     或手动创建 config.yaml 并添加: enableServerPlugins: true
    goto :end
)

findstr /C:"enableServerPlugins: true" "%CONFIG%" >nul 2>&1
if !errorlevel! equ 0 (
    echo [+] Server plugins 已在 config.yaml 中启用
    goto :end
)

REM 使用 node 安全修改 config.yaml（避免 CMD 处理特殊字符崩溃）
echo [*] 修改 config.yaml...
node -e "const fs=require('fs');const f='%CONFIG:\=\\%';let c=fs.readFileSync(f,'utf8');if(c.includes('enableServerPlugins: false')){c=c.replace('enableServerPlugins: false','enableServerPlugins: true');fs.writeFileSync(f,c);console.log('[+] 已将 enableServerPlugins 设为 true')}else{fs.appendFileSync(f,'\nenableServerPlugins: true\n');console.log('[+] 已添加 enableServerPlugins: true')}"
if errorlevel 1 (
    echo [!] 修改 config.yaml 失败，请手动添加: enableServerPlugins: true
)

goto :end

:end
echo.
echo ==========================================
echo   安装完成！
echo ==========================================
echo   1. 重启 SillyTavern
echo   2. 打开 Extensions 面板
echo   3. 找到 WebDAV File Manager 设置
echo   4. 输入 WebDAV 服务器信息并连接
echo.
goto :done

:fail
echo.
echo ==========================================
echo   安装失败！请检查上方错误信息
echo ==========================================
echo.

:done
endlocal
pause
