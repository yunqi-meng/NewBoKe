@echo off
title XHBlogs Manager Launcher
set "TUNNEL_BAT=%~dp0manager-tunnel.bat"

netstat -ano | findstr /C:":3001 " | findstr /C:"LISTENING" >nul
if errorlevel 1 (
  echo Starting SSH tunnel...
  start "XHBlogs Tunnel" /min "%TUNNEL_BAT%"
  timeout /t 4 /nobreak >nul
) else (
  echo Tunnel is already running.
)

start "" http://127.0.0.1:3001
echo Manager console: http://127.0.0.1:3001
echo Public site:     http://118.190.204.158:8080
echo.
echo Keep the minimized "XHBlogs Tunnel" window open. It reconnects automatically.
pause
