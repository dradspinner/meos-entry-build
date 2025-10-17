@echo off
echo Starting MeOS Runner Database Service...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: package.json not found
    echo Please run this script from the src/services/ directory
    echo.
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

REM Start the service
echo Starting MeOS Runner Database Service on http://localhost:3001
echo.
echo The service will automatically find your MeOS database.wpersons file
echo and serve runner data via HTTP API for the Entry Portal.
echo.
echo Press Ctrl+C to stop the service
echo.

npm start

pause