@echo off
rem Open the Layla site that runs on your server, through an SSH tunnel.
rem   scripts\run_local_site.bat user@your-server      (or put user@your-server in .local\host.txt once)
rem The API never listens publicly; the tunnel maps local port 8790 to the server's 127.0.0.1:8790,
rem and the API serves the site itself (same origin, so sign-in cookies just work).
setlocal
cd /d "%~dp0\.."
set HOST=%~1
if "%HOST%"=="" if exist .local\host.txt set /p HOST=<.local\host.txt
if "%HOST%"=="" (
  echo Usage: scripts\run_local_site.bat user@your-server
  exit /b 1
)
start "layla tunnel (close to disconnect)" ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -L 8790:127.0.0.1:8790 %HOST%
ping -n 4 127.0.0.1 >nul
start "" "http://127.0.0.1:8790/"
echo The tunnel runs in its own window. Close it to disconnect.
