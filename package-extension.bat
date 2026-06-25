@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
set "OUTPUT=%~1"
if "%OUTPUT%"=="" set "OUTPUT=%ROOT%gchat-extension.zip"

set "STAGE=%TEMP%\gchat-extension-package-%RANDOM%%RANDOM%"

mkdir "%STAGE%" || exit /b 1
mkdir "%STAGE%\icons" || exit /b 1

call :copy_file "manifest.json" || goto :error
call :copy_file "content.js" || goto :error
call :copy_file "styles.css" || goto :error
call :copy_file "icons\icon16.png" || goto :error
call :copy_file "icons\icon32.png" || goto :error
call :copy_file "icons\icon48.png" || goto :error
call :copy_file "icons\icon128.png" || goto :error

if exist "%OUTPUT%" del /f /q "%OUTPUT%" || goto :error

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%OUTPUT%' -Force" || goto :error

echo Packaged extension: %OUTPUT%
echo Included files:
echo  - manifest.json
echo  - content.js
echo  - styles.css
echo  - icons\icon16.png
echo  - icons\icon32.png
echo  - icons\icon48.png
echo  - icons\icon128.png

rmdir /s /q "%STAGE%"
exit /b 0

:copy_file
if not exist "%ROOT%%~1" (
  echo Missing package file: %~1
  exit /b 1
)
copy /y "%ROOT%%~1" "%STAGE%\%~1" >nul
exit /b 0

:error
if exist "%STAGE%" rmdir /s /q "%STAGE%"
exit /b 1
