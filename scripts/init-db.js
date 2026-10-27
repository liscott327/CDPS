/**
 * =========================================================================
 *  CPDS 資料庫快速初始化腳本 (scripts/init-db.js)
 * =========================================================================
 *  執行方式: node scripts/init-db.js
 *  說明: 自動讀取 dbConfig.js 連線字串，並批次執行 db/schema.sql 建表腳本。
 */

const fs = require('fs');
const path = require('path');

let sql;
try {
    sql = require('mssql/msnodesqlv8');
} catch (e) {
    try {
        sql = require('mssql');
    } catch (err) {
        console.error('❌ 無法載入 mssql 模組，請確認是否已執行 npm install');
        process.exit(1);
    }
}

const dbConfig = require('../dbConfig');

async function runInitDb() {
    console.log('====================================================');
    console.log('  CPDS 資料庫結構快速初始化工具');
    console.log('====================================================');

    if (!dbConfig || !dbConfig.enableDb) {
        console.warn('⚠️ dbConfig.enableDb 為 false，請先於 dbConfig.js 啟用連線設定。');
        process.exit(1);
    }

    const connStr = dbConfig.connectionString || dbConfig.config;
    if (!connStr || (typeof connStr === 'string' && connStr.includes('請在此輸入密碼'))) {
        console.error('❌ 請先於 dbConfig.js 確認連線字串或填妥連線密碼！');
        process.exit(1);
    }

    const schemaPath = path.join(__dirname, '../db/schema.sql');
    if (!fs.existsSync(schemaPath)) {
        console.error(`❌ 找不到 SQL 腳本檔案: ${schemaPath}`);
        process.exit(1);
    }

    console.log(`📄 正在讀取 SQL 腳本: ${schemaPath}`);
    const sqlContent = fs.readFileSync(schemaPath, 'utf8');

    // 依 GO 切分 SQL 批次陳述式
    const batches = sqlContent
        .split(/^\s*GO\s*$/gim)
        .map(b => b.trim())
        .filter(b => b.length > 0);

    console.log(`📦 共有 ${batches.length} 個 SQL 區塊待執行...`);

    let pool = null;
    try {
        console.log('🔌 正在連線至 SQL Server 資料庫...');
        pool = await sql.connect(typeof connStr === 'string' ? { connectionString: connStr } : connStr);
        console.log('✅ 連線成功！開始執行建表腳本...');

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const firstLine = batch.split('\n')[0].substring(0, 60);
            process.stdout.write(`   [${i + 1}/${batches.length}] 執行中: ${firstLine}... `);
            await pool.request().batch(batch);
            console.log('完成 ✔');
        }

        console.log('\n🎉 所有資料表、索引、約束與檢視表均已成功建立完畢！');
    } catch (err) {
        console.error('\n❌ 執行過程發生錯誤:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    } finally {
        if (pool) {
            await pool.close();
        }
        console.log('🔒 已關閉資料庫連線。');
    }
}

runInitDb();
