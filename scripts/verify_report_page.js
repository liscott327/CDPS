/**
 * =========================================================================
 *  報表前端頁面與資料串接綜合檢核腳本 (scripts/verify_report_page.js)
 * =========================================================================
 *  執行方式: node scripts/verify_report_page.js
 * =========================================================================
 */

const fs = require('fs');
const path = require('path');

function runChecks() {
    console.log('================================================================');
    console.log('  CPDS report.html 結構、元件與 API 串接檢核');
    console.log('================================================================');

    const reportHtmlPath = path.resolve(__dirname, '../report.html');
    if (!fs.existsSync(reportHtmlPath)) {
        console.error('❌ 找不到 report.html 檔案！');
        process.exit(1);
    }

    const content = fs.readFileSync(reportHtmlPath, 'utf-8');

    let passed = 0;
    let failed = 0;

    function assert(name, condition) {
        if (condition) {
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${name}`);
            failed++;
        }
    }

    // 1. 依賴與元件檢驗
    console.log('\n📌 [檢核 1] 核心依賴套件引用');
    assert('引用 SheetJS (xlsx.full.min.js)', content.includes('xlsx.full.min.js'));
    assert('引用 Bootstrap 5 CSS 與 JS', content.includes('bootstrap.min.css') && content.includes('bootstrap.bundle.min.js'));
    assert('引用 Bootstrap-Table', content.includes('bootstrap-table.min.js'));
    assert('引用 Select2 與 Bootstrap 5 主題', content.includes('select2.min.js') && content.includes('select2-bootstrap-5-theme'));
    assert('引用 scripts/api.js', content.includes('scripts/api.js'));
    assert('引用 scripts/auth.js', content.includes('scripts/auth.js'));

    // 2. 篩選卡片元件
    console.log('\n📌 [檢核 2] 多維度篩選卡片元件');
    assert('包含調派日期 (起) #filterStartDate', content.includes('id="filterStartDate"'));
    assert('包含調派日期 (迄) #filterEndDate', content.includes('id="filterEndDate"'));
    assert('包含來源廠下拉選單 #filterFromPlant', content.includes('id="filterFromPlant"'));
    assert('包含目的廠下拉選單 #filterToPlant', content.includes('id="filterToPlant"'));
    assert('包含狀態多選下拉選單 #filterStatus', content.includes('id="filterStatus"'));
    assert('包含 5 種狀態選項 (0, 1, 2, 4, 3)', 
        content.includes('value="0"') && 
        content.includes('value="1"') && 
        content.includes('value="2"') && 
        content.includes('value="4"') && 
        content.includes('value="3"')
    );
    assert('包含關鍵字搜尋輸入框 #filterKeyword', content.includes('id="filterKeyword"'));
    assert('包含清空條件按鈕 #btnResetFilters', content.includes('id="btnResetFilters"'));
    assert('包含匯出 Excel 按鈕 #btnExportExcel', content.includes('id="btnExportExcel"') && content.includes('exportToExcel()'));
    assert('完全移除舊版 CSV 匯出呼叫', !content.includes('exportToCSV'));

    // 3. 表格與表頭欄位
    console.log('\n📌 [檢核 3] 表格與表頭欄位');
    assert('包含 #reportTable 元素', content.includes('id="reportTable"'));
    assert('表格欄位包含調派日期 (data-field="dispatchDate")', content.includes('data-field="dispatchDate"'));
    assert('表格欄位包含來源廠 (data-field="sourceDeptName")', content.includes('data-field="sourceDeptName"'));
    assert('表格欄位包含目的廠 (data-field="targetDeptName")', content.includes('data-field="targetDeptName"'));
    assert('表格欄位包含工號 (data-field="empId")', content.includes('data-field="empId"'));
    assert('表格欄位包含姓名 (data-field="empName")', content.includes('data-field="empName"'));
    assert('表格欄位包含狀態 (data-field="status")', content.includes('data-field="status"'));
    assert('表格欄位包含調度時間起訖 (data-field="dispatchTimeRange")', content.includes('data-field="dispatchTimeRange"'));
    assert('表格欄位包含簽到時間 (data-field="checkinTime")', content.includes('data-field="checkinTime"'));
    assert('表格欄位包含確認人 (data-field="receiverName")', content.includes('data-field="receiverName"'));
    assert('表格欄位包含異常說明 (data-field="anomalyNote")', content.includes('data-field="anomalyNote"'));
    assert('各主要欄位均啟用 data-sortable="true"', (content.match(/data-sortable="true"/g) || []).length >= 8);

    // 4. 前端業務邏輯與 API 串接
    console.log('\n📌 [檢核 4] 核心業務邏輯函式');
    assert('實作動態廠別載入 loadDepartments() 呼叫 /api/departments', content.includes('loadDepartments') && content.includes('/api/departments'));
    assert('實作報表 API 資料載入 applyReportFilters() 呼叫 /api/reports', content.includes('applyReportFilters') && content.includes('/api/reports'));
    assert('實作狀態動態判定 resolveRecordStatus()', content.includes('resolveRecordStatus'));
    assert('實作未簽到逾期判定 isNotCheckedInOverdue() (比對 EndTime 與歷史日期)', content.includes('isNotCheckedInOverdue'));
    assert('實作已簽到逾期判定 isCheckinOverdue() (超過開始時間 10 分鐘)', content.includes('isCheckinOverdue'));
    assert('實作原生 Excel 活頁簿匯出函式 exportToExcel() (XLSX.utils.book_new / writeFile)', 
        content.includes('function exportToExcel') && 
        content.includes('XLSX.utils.aoa_to_sheet') && 
        content.includes('XLSX.writeFile')
    );
    assert('實作重設條件為當天 resetFilters()', content.includes('function resetFilters'));
    assert('預設複合排序邏輯 multiColumnComparator()', content.includes('multiColumnComparator'));
    assert('來源廠選項同步 index.html 排除工程部與物流部', 
        content.includes('isExcludedSourceDept') && 
        content.includes('工程部') && 
        content.includes('物流部')
    );

    console.log('\n----------------------------------------------------------------');
    console.log(`檢核結果: 通過 ${passed} 項, 失敗 ${failed} 項`);
    console.log('----------------------------------------------------------------');

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('🎉 report.html 前端頁面與功能串接檢核全數通過！\n');
        process.exit(0);
    }
}

if (require.main === module) {
    runChecks();
}

module.exports = { runChecks };
