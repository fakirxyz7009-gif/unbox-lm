@echo off
title UNBOX STUDIOS — Standalone Hardware Workstation
cd /d "%~dp0"
echo =============================================================
echo   Starting UNBOX STUDIOS Standalone Application (No Electron)
echo   GPU Hardware Acceleration, Web MIDI, and Low-Latency Audio
echo =============================================================
node scripts/standalone-runner.js
pause

