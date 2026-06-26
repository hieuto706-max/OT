@echo off
echo ==================================================
echo   OT Manager - Android App Build Script (v1.3.5)
echo ==================================================
echo.

set SCRIPT_DIR=%~dp0
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%
for %%i in ("%SCRIPT_DIR%\..") do set ROOT=%%~fi

set MOBILE_DIR=%ROOT%\mobile
set ANDROID_ASSETS=%ROOT%\mobile-android\app\src\main\assets
set IOS_ASSETS=%ROOT%\mobile-ios\OTManager\www

echo [1/3] Dong bo tai nguyen (Syncing assets)...
copy /Y "%MOBILE_DIR%\app.js" "%ANDROID_ASSETS%\app.js"
copy /Y "%MOBILE_DIR%\index.html" "%ANDROID_ASSETS%\index.html"
copy /Y "%MOBILE_DIR%\style.css" "%ANDROID_ASSETS%\style.css"
copy /Y "%MOBILE_DIR%\download.html" "%ANDROID_ASSETS%\download.html"

if not exist "%ANDROID_ASSETS%\resources" mkdir "%ANDROID_ASSETS%\resources"
xcopy /E /I /Y "%MOBILE_DIR%\resources\*" "%ANDROID_ASSETS%\resources\"

echo.
echo [2/3] Bien dich ung dung Android (Building APK)...
set JAVA_HOME=%ROOT%\temp_jdk\jdk-17.0.19+10
cd /d "%ROOT%\mobile-android"
call gradlew.bat clean assembleRelease --no-daemon --no-configuration-cache
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Loi bien dich Android app!
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Sao chep file APK hoan thien (Copying APK)...
cd /d "%ROOT%"
copy /Y "%ROOT%\mobile-android\app\build\outputs\apk\release\app-release.apk" "%MOBILE_DIR%\OT-Manager-mobile.apk"

echo.
echo ==================================================
echo   BIEN DICH THANH CONG!
echo   File APK da duoc luu tai:
echo   %MOBILE_DIR%\OT-Manager-mobile.apk
echo ==================================================
echo.
pause
