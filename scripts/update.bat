@echo off
rem Clawd light updater: run this next to Clawd.exe (after extracting the update zip into the Clawd folder)
cd /d "%~dp0"
if not exist "Clawd.exe" (
  echo [!] Clawd.exe not found here. Please extract the update zip INTO the Clawd folder, next to Clawd.exe, then run this again.
  pause
  exit /b 1
)
if not exist "app.asar" (
  echo [!] app.asar not found next to this script.
  pause
  exit /b 1
)
echo Closing Clawd...
taskkill /f /im Clawd.exe >nul 2>&1
timeout /t 2 /nobreak >nul
copy /y "app.asar" "resources\app.asar" >nul
if errorlevel 1 (
  echo [!] Update failed. Make sure Clawd is closed (tray icon - Exit), then try again.
  pause
  exit /b 1
)
del "app.asar" >nul 2>&1
if exist "browser-extension" (
  if exist "resources\browser-extension" xcopy /y /e /i "browser-extension" "resources\browser-extension" >nul
  rmdir /s /q "browser-extension" >nul 2>&1
  echo Browser extension files updated. Open chrome://extensions and click Reload on the Clawd extension.
)
echo Updated! Starting Clawd...
start "" "Clawd.exe"
timeout /t 2 /nobreak >nul
