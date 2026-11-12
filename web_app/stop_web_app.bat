@echo off
rem ---------------------------------------------------------------------------
rem  Multi-Domain RAG Assistant - stop the web app started by run_web_app.bat.
rem  Double-click this file, or run:  stop_web_app.bat [port]      (default 8001)
rem  Only a Python process listening on that port is stopped.
rem ---------------------------------------------------------------------------
setlocal
set "PORT=8001"
if not "%~1"=="" set "PORT=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue;" ^
  "if (-not $c) { Write-Host 'No web app is running on port %PORT%.'; exit 0 };" ^
  "foreach ($id in ($c.OwningProcess | Sort-Object -Unique)) {" ^
  "  $p = Get-Process -Id $id -ErrorAction SilentlyContinue;" ^
  "  if ($p -and $p.ProcessName -like 'python*') { Stop-Process -Id $id -Force; Write-Host ('Stopped the web app on port %PORT% (process ' + $id + ').') }" ^
  "  else { Write-Host ('Port %PORT% is used by ' + $p.ProcessName + ', not by the web app - nothing was stopped.') }" ^
  "}"
echo.
pause
