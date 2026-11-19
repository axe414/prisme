@echo off
title Prisme
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance. & pause & exit /b 1)
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:8888 -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  start "" http://localhost:8888
  exit /b 0
)
start "" /b cmd /c "timeout /t 2 >nul & start "" http://localhost:8888"
echo Prisme tourne sur http://localhost:8888  -  ferme cette fenetre pour l'arreter.
node --max-old-space-size=4096 dev-server.mjs
pause
