@echo off
setlocal
cd /d "%~dp0\.."
set LOG=run_22545840957_logs\android-8083-20260811-204146.log
echo === Run started %date% %time% === > "%LOG%"
start /b "ExpoAndroid" cmd /c "npm run android -- --port 8083 >> ""%LOG%"" 2>&1"
