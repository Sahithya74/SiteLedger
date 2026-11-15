@echo off
rem Double-click to start SITECORE and share it with a temporary public link.
cd /d "%~dp0"
call npm run public
pause
