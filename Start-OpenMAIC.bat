@echo off
setlocal EnableExtensions
title OpenMAIC 启动器
cd /d "%~dp0"

rem ---- 系统工具一律用绝对路径，避免被 PATH 里的同名命令抢占 ----
set "SYS=%SystemRoot%\System32"

rem ---- 隔离宿主环境（WorkBuddy 注入的 delete shim / 代理会让包工具卡死）----
set "NODE_OPTIONS="
set "http_proxy="
set "https_proxy="
set "HTTP_PROXY="
set "HTTPS_PROXY="

rem ---- 确保 Node / corepack 在纯 CMD 下可用（离线也能用 pnpm）----
for %%D in ("C:\Users\28712\.workbuddy\binaries\node\versions\22.22.2-3") do (
  if exist "%%~D\node.exe" set "NODE_DIR=%%~D"
)
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"
if not defined COREPACK_HOME set "COREPACK_HOME=C:\Users\28712\.cache\node\corepack"

set "PORT=3000"
set "URL=http://localhost:%PORT%"
set "CHK=%TEMP%\openmaic_probe_%PORT%.html"

echo ==================================================
echo   OpenMAIC 启动器              %URL%
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，需要 22 或更高版本。
  goto :end
)

set "PNPM="
where corepack >nul 2>nul && set "PNPM=corepack pnpm"
if not defined PNPM (
  where pnpm >nul 2>nul && set "PNPM=pnpm"
)
if not defined PNPM (
  echo [错误] 未找到 corepack 或 pnpm。
  goto :end
)

rem ---- 命令行参数直通：Start-OpenMAIC.bat prod^|dev^|build^|stop ----
set "MODE=%~1"
if /i "%MODE%"=="prod"  goto :prod
if /i "%MODE%"=="dev"   goto :dev
if /i "%MODE%"=="build" goto :build
if /i "%MODE%"=="stop"  goto :stop
if /i "%MODE%"=="help"  goto :help

echo 请选择操作：
echo   [1] 启动 - 生产模式（推荐，已构建过则秒起）
echo   [2] 启动 - 开发模式（热更新，改代码即时生效）
echo   [3] 重新构建（production build，耗时数分钟）
echo   [4] 停止服务
echo   [5] 退出
echo.
choice /c 12345 /n /m "输入编号: "
if errorlevel 5 goto :end
if errorlevel 4 goto :stop
if errorlevel 3 goto :build
if errorlevel 2 goto :dev
goto :prod

rem ==================== 生产模式 ====================
:prod
call :portstate
if "%STATE%"=="OURS" (
  echo [提示] OpenMAIC 已经在运行（PID %OLDPID%），直接打开浏览器。
  start "" "%URL%"
  goto :end
)
if "%STATE%"=="BUSY" (
  echo [警告] 端口 %PORT% 已被其他程序占用（PID %OLDPID%）。
  choice /c YN /n /m "结束该进程后继续？[Y/N]: "
  if errorlevel 2 goto :end
  "%SYS%\taskkill.exe" /F /PID %OLDPID% >nul 2>nul
  "%SYS%\ping.exe" -n 3 127.0.0.1 >nul
)
if not exist ".next\BUILD_ID" (
  echo [提示] 未检测到构建产物，先执行生产构建……
  call %PNPM% build
  if errorlevel 1 (
    echo [错误] 构建失败，请查看上方输出。
    goto :end
  )
)
echo [提示] 正在新窗口 "OpenMAIC Server" 中启动服务……
echo         请保持该窗口开着；关闭它等于停止服务。
start "OpenMAIC Server" cmd /k "%PNPM% start"
call :waitready
goto :end

rem ==================== 开发模式 ====================
:dev
call :portstate
if "%STATE%"=="OURS" (
  echo [提示] OpenMAIC 已经在运行（PID %OLDPID%），直接打开浏览器。
  start "" "%URL%"
  goto :end
)
if "%STATE%"=="BUSY" (
  echo [警告] 端口 %PORT% 已被占用（PID %OLDPID%）。
  choice /c YN /n /m "结束该进程后继续？[Y/N]: "
  if errorlevel 2 goto :end
  "%SYS%\taskkill.exe" /F /PID %OLDPID% >nul 2>nul
  "%SYS%\ping.exe" -n 3 127.0.0.1 >nul
)
echo [提示] 正在新窗口 "OpenMAIC Dev Server" 中启动开发服务……
echo         请保持该窗口开着；关闭它等于停止服务。
start "OpenMAIC Dev Server" cmd /k "%PNPM% dev"
call :waitready
goto :end

rem ==================== 重新构建 ====================
:build
echo [提示] 开始生产构建，可能需要几分钟，请勿关闭本窗口……
call %PNPM% build
if errorlevel 1 (
  echo [错误] 构建失败。
) else (
  echo [完成] 构建成功。现在可以选 [1] 启动。
)
goto :end

rem ==================== 停止服务 ====================
:stop
call :portstate
if "%STATE%"=="FREE" (
  echo [提示] 端口 %PORT% 未在监听，服务未运行。
  goto :end
)
echo [提示] 正在停止 PID %OLDPID% ……
"%SYS%\taskkill.exe" /F /PID %OLDPID% >nul 2>nul
"%SYS%\ping.exe" -n 2 127.0.0.1 >nul
echo [完成] 服务已停止。
goto :end

:help
echo 用法：Start-OpenMAIC.bat [prod^|dev^|build^|stop]
echo   不带参数打开菜单。
goto :end

rem ==================== 子过程：探测端口状态 ====================
rem 结果：STATE = FREE / OURS / BUSY，占用进程号写入 OLDPID
:portstate
set "STATE=FREE"
set "OLDPID="
for /f "tokens=5" %%P in ('%SYS%\netstat.exe -ano ^| %SYS%\findstr.exe /r /c:":%PORT% .*LISTENING"') do (
  if not defined OLDPID set "OLDPID=%%P"
)
if not defined OLDPID goto :eof
set "STATE=BUSY"
if exist "%CHK%" del /f /q "%CHK%" >nul 2>nul
"%SYS%\curl.exe" -s -m 5 -o "%CHK%" "%URL%/" >nul 2>nul
if not exist "%CHK%" goto :eof
"%SYS%\findstr.exe" /i /c:"OpenMAIC" "%CHK%" >nul 2>nul
if not errorlevel 1 set "STATE=OURS"
goto :eof

rem ==================== 子过程：等待服务就绪并打开浏览器 ====================
:waitready
echo [提示] 等待服务就绪（最多 90 秒）……
set /a N=0
:waitloop
set /a N+=1
"%SYS%\ping.exe" -n 4 127.0.0.1 >nul
call :portstate
if "%STATE%"=="OURS" (
  echo [完成] 服务已就绪，正在打开浏览器：%URL%
  start "" "%URL%"
  goto :eof
)
if %N% GEQ 30 (
  echo.
  echo [警告] 90 秒内服务仍未就绪。
  echo        如果没看到 "OpenMAIC Server" 窗口，说明服务没起来；
  echo        如果看到了，请查看该窗口里的报错信息。
  goto :eof
)
goto :waitloop

:end
echo.
pause
endlocal
