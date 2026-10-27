# ========================================================
#  CPDS 資料庫結構建置腳本 (PowerShell)
# ========================================================
$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CPDS 資料庫結構快速建置工具 (LocalDB / BPMTEST)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$schemaPath = Join-Path $scriptDir "..\db\schema.sql"

if (-not (Test-Path $schemaPath)) {
    Write-Error "找不到 SQL 腳本檔案: $schemaPath"
    exit 1
}

Write-Host "正在讀取並執行: $schemaPath" -ForegroundColor Yellow

try {
    sqlcmd -f 65001 -S "(localdb)\MSSQLLocalDB" -d BPMTEST -i $schemaPath
    Write-Host "`n[成功] 資料表、唯一防呆索引與檢視表建置完成！" -ForegroundColor Green
} catch {
    Write-Error "執行失敗: $_"
}
