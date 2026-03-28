@echo off
cd /d "%~dp0"
chcp 65001 >nul
echo Starting REF7 Auto Register (Dev Mode)...
echo Main-process operation logs (register / account flows) mirror here when NODE_ENV=development.
echo.
call npm run electron:dev
pause
