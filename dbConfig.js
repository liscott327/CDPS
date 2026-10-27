/**
 * =========================================================================
 *  CPDS 資料庫連線設定檔 (dbConfig.js)
 * =========================================================================
 *  比對 d:\SkillCertification\server.js 成功連線 LocalDB 的關鍵：
 *  LocalDB 需透過 Windows 原生 ODBC 驅動 (ODBC Driver 17 for SQL Server) 連線。
 */

module.exports = {
    // 是否啟用真實資料庫連線 (true: 連線 LocalDB, false: 本地模擬資料)
    enableDb: true,

    // 【方式一：Windows 驗證 (推薦)】直接以當前 Windows 身分登入 LocalDB，不需額外密碼
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\MSSQLLocalDB;Database=BPMTEST;Trusted_Connection=yes;',

    // 【方式二：SQL 帳號密碼驗證 (如 scott)】若要使用特定帳號登入，取消下方註解並填寫密碼：
    // connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\MSSQLLocalDB;Database=BPMTEST;UID=scott;PWD=請在此輸入密碼;'
};
