@echo off
REM ViralCool - klik dua kali fail ni untuk mula. (Windows)
cd /d "%~dp0"
title ViralCool

echo.
echo   ViralCool
echo   ---------

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node belum dipasang dalam komputer ni.
  echo   Muat turun versi LTS di https://nodejs.org, pasang,
  echo   lepas tu klik dua kali fail ni semula.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

set TZ=Asia/Kuala_Lumpur
echo   Sedang mula... jangan tutup tetingkap ni.
echo   Nak berhenti: tutup tetingkap ni.
echo.

start "" "http://localhost:8787"
node server.mjs
pause
