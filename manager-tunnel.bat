@echo off
title XHBlogs Tunnel
echo Keeping the SSH tunnel to the XHBlogs server alive...
echo Close this window to disconnect the manager console.

:loop
ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -N ^
  -L 3001:127.0.0.1:3001 -L 8000:127.0.0.1:8000 xhblogs-server
echo Tunnel closed at %time%. Reconnecting in 5 seconds...
ping -n 6 127.0.0.1 >nul
goto loop
