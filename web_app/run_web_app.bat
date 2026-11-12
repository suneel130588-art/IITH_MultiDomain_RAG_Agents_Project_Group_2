@echo off
rem ---------------------------------------------------------------------------
rem  Multi-Domain RAG Assistant - set up (first time) and start the web app.
rem  Double-click this file, or run:  run_web_app.bat [port]      (default 8001)
rem  First time: creates .venv, installs requirements.txt, asks for your key.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
set "PORT=8001"
if not "%~1"=="" set "PORT=%~1"

rem 1. Python 3.12 (the py launcher is preferred, plain python as fallback)
set "PY="
py -3.12 --version >nul 2>&1 && set "PY=py -3.12"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
    echo Python was not found. Install Python 3.12 from https://www.python.org/downloads/
    echo and tick "Add python.exe to PATH", then run this file again.
    pause & exit /b 1
)

rem 2. First run: create the environment and install the packages (5-15 minutes)
if not exist ".venv\Scripts\python.exe" (
    echo Creating the Python environment in .venv ...
    %PY% -m venv .venv || (echo Could not create .venv & pause & exit /b 1)
    echo Installing packages - this takes 5-15 minutes the first time ...
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt || (
        echo Package installation failed. Check the internet connection and run this file again.
        rmdir /s /q .venv
        pause & exit /b 1
    )
)

rem 3. Groq API key in .env (never uploaded to GitHub)
if not exist ".env" (
    copy /y ".env.example" ".env" >nul
    echo.
    echo A file named .env opens in Notepad now.
    echo Replace gsk_your_key_here with your own Groq API key, save, and close Notepad.
    notepad ".env"
)
findstr /c:"gsk_your_key_here" ".env" >nul && (
    echo .env still contains the placeholder key. Put your own key in web_app\.env and run again.
    pause & exit /b 1
)

rem 4. Start the app; the browser opens by itself when the app is ready
echo.
echo Starting the app on http://127.0.0.1:%PORT%
if not exist "chroma_multidomain" echo First start: building the search index takes about 15-60 minutes on a CPU (once only).
echo Keep this window open while you use the app. Press Ctrl+C to stop it.
echo.
if not defined NO_BROWSER start "" /min powershell -NoProfile -WindowStyle Hidden -Command "while ($true) { try { Invoke-WebRequest 'http://127.0.0.1:%PORT%/' -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 0 -ErrorAction Stop | Out-Null; break } catch { if ($_.Exception.Response) { break } }; Start-Sleep 5 }; Start-Process 'http://127.0.0.1:%PORT%/'"
set "PYTHONIOENCODING=utf-8"
".venv\Scripts\python.exe" -X utf8 web_app.py --host 127.0.0.1 --port %PORT%
echo.
echo The app has stopped.
pause
