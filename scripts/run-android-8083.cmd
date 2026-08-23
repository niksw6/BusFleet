@echo off
cd /d "%~dp0\.."
echo === Run started %date% %time% === > "run_22545840957_logs\android-8083-20260811-203236.log"
npm run android -- --port 8083 >> "run_22545840957_logs\android-8083-20260811-203236.log" 2>&1
echo === Run finished with exit %errorlevel% %date% %time% >> "run_22545840957_logs\android-8083-20260811-203236.log"
