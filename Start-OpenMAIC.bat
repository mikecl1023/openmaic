@echo off
setlocal
title OpenMAIC Launcher
cd /d "%~dp0"

rem --- Neutralize any host-injected delete/proxy that could hang package tools (safe to keep globally) ---
set "NODE_OPTIONS="
set "http_proxy="
set "https_proxy="
set "HTTP_PROXY="
set "HTTPS_PROXY="

rem --- Ensure Node / corepack are reachable from a plain CMD.
rem     Always put the WorkBuddy-managed Node FIRST so corepack + pnpm work offline. ---
for %%D in ("C:\Users\28712\.workbuddy\binaries\node\versions\22.22.2-3") do (
  if exist "%%~D\node.exe" set "PATH=%%~D;%PATH%"
  if exist "%%~D\node.exe" set "NODE_DIR=%%~D"
)
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"

rem --- corepack cache: keep pnpm usable even when offline ---
if not defined COREPACK_HOME set "COREPACK_HOME=C:\Users\28712\.cache\node\corepack"

echo ==================================================
echo   OpenMAIC - Launcher   (http://localhost:3000)
echo ==================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js ^>= 22 first.
  goto :end
)

rem --- Resolve pnpm. Prefer corepack (cached offline), fall back to global pnpm. ---
set "PNPM=pnpm"
where corepack >nul 2>nul
if not errorlevel 1 (
  set "PNPM=corepack pnpm"
) else (
  where pnpm >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Neither corepack nor pnpm found. Run: npm install -g pnpm
    goto :end
  )
)

rem ---------- choose mode: command arg or menu ----------
set "MODE=%~1"
if /i "%MODE%"=="" (
  echo.
  echo Select mode:
  echo   [1] Production  ^(build + start^, recommended^)
  echo   [2] Development ^(hot reload^)
  echo   [3] Build only
  echo   [4] Exit
  choice /c 1234 /m "Your choice: "
  if errorlevel 4 goto :end
  if errorlevel 3 set "MODE=build"
  if errorlevel 2 set "MODE=dev"
  if errorlevel 1 set "MODE=prod"
)

if /i "%MODE%"=="dev"   goto :dev
if /i "%MODE%"=="build" goto :build
goto :prod

:prod
echo.
echo Building production bundle (first time may take several minutes)...
call %PNPM% build
if errorlevel 1 ( echo [ERROR] Build failed. & goto :end )
echo.
echo Starting production server: http://localhost:3000
echo  -> Press Ctrl+C in THIS window to stop.
call %PNPM% start
goto :end

:dev
echo.
echo Starting dev server: http://localhost:3000
echo  -> Press Ctrl+C in THIS window to stop.
call %PNPM% dev
goto :end

:build
call %PNPM% build
if errorlevel 1 ( echo [ERROR] Build failed. ) else ( echo Build OK. )
goto :end

:end
echo.
pause
endlocal
