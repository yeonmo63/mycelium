@echo off
REM Git Push Batch Script
REM Usage: ./push.bat "Your commit message"

powershell -ExecutionPolicy Bypass -File "%~dp0push.ps1" -Message "%~1"
pause
