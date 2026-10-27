@echo off
echo ========================================================
echo   CPDS Database Schema Setup (LocalDB / BPMTEST)
echo ========================================================
echo.
echo Executing db\schema.sql ...
echo.

sqlcmd -f 65001 -S "(localdb)\MSSQLLocalDB" -d BPMTEST -i "%~dp0..\db\schema.sql"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   [SUCCESS] Database tables, indexes and views created!
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   [ERROR] Failed to execute schema script.
    echo ========================================================
)
