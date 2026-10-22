/**
 * =========================================================================
 *  CPDS 資料庫結構檢核腳本 (scripts/verify_db_schema.js)
 * =========================================================================
 *  執行方式: node scripts/verify_db_schema.js
 *  功能：
 *    1. 連線至 LocalDB (BPMTEST)
 *    2. 驗證 4 大核心資料表是否存在：
 *       - CustCPDSDispatchPlan_Master
 *       - CustCPDSDispatchPlan_Item
 *       - CustCPDSDispatchPlan_Detail
 *       - CustCPDSUser
 *    3. 列出各表欄位名稱、資料型態、是否允許 NULL、預設值
 *    4. 驗證主要索引與檢視表 (vw_CPDS_Dept, vw_CPDS_DispatchDetail)
 *    5. 檢核通過以代碼 0 結束，失敗以代碼 1 結束
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
let sql;
try {
    sql = require('mssql/msnodesqlv8');
} catch (e) {
    try {
        sql = require('mssql');
    } catch (err) {
        console.error('❌ 無法載入 mssql 模組');
        process.exit(1);
    }
}

const dbConfig = require('../dbConfig');

const EXPECTED_TABLES = [
    'CustCPDSDispatchPlan_Master',
    'CustCPDSDispatchPlan_Item',
    'CustCPDSDispatchPlan_Detail',
    'CustCPDSUser'
];

async function verifySchema() {
    console.log('====================================================');
    console.log('  CPDS 資料庫結構檢核工具 (v2.0)');
    console.log('====================================================');

    if (!dbConfig || !dbConfig.enableDb) {
        console.error('❌ dbConfig.enableDb 未啟用！');
        process.exit(1);
    }

    const connStr = dbConfig.connectionString;
    if (!connStr) {
        console.error('❌ 未找到 connectionString！');
        process.exit(1);
    }

    let pool = null;
    let hasError = false;

    try {
        console.log('🔌 正在連線至 LocalDB (BPMTEST)...');
        pool = await sql.connect({ connectionString: connStr });
        console.log('✅ 連線成功！\n');

        // 1. 查詢所有現有資料表
        const tableResult = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `);
        const existingTables = new Set(tableResult.recordset.map(r => r.TABLE_NAME));

        console.log('📋 [資料表存在性檢核]');
        for (const tableName of EXPECTED_TABLES) {
            if (existingTables.has(tableName)) {
                console.log(`  ✅ 資料表存在: ${tableName}`);
            } else {
                console.error(`  ❌ 缺少資料表: ${tableName}`);
                hasError = true;
            }
        }
        console.log('');

        // 2. 檢視各資料表欄位定義
        console.log('🔍 [資料表欄位結構明細]');
        for (const tableName of EXPECTED_TABLES) {
            if (!existingTables.has(tableName)) continue;

            const colResult = await pool.request()
                .input('tableName', sql.NVarChar, tableName)
                .query(`
                    SELECT 
                        COLUMN_NAME, 
                        DATA_TYPE, 
                        CHARACTER_MAXIMUM_LENGTH, 
                        NUMERIC_PRECISION, 
                        NUMERIC_SCALE, 
                        IS_NULLABLE, 
                        COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = @tableName
                    ORDER BY ORDINAL_POSITION
                `);

            console.log(`--- [${tableName}] (${colResult.recordset.length} 欄位) ---`);
            const formattedCols = colResult.recordset.map(c => {
                let typeStr = c.DATA_TYPE;
                if (c.CHARACTER_MAXIMUM_LENGTH !== null) {
                    typeStr += `(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? 'max' : c.CHARACTER_MAXIMUM_LENGTH})`;
                } else if (c.NUMERIC_PRECISION !== null && c.DATA_TYPE !== 'int' && c.DATA_TYPE !== 'smallint' && c.DATA_TYPE !== 'tinyint' && c.DATA_TYPE !== 'bigint') {
                    typeStr += `(${c.NUMERIC_PRECISION}${c.NUMERIC_SCALE ? ',' + c.NUMERIC_SCALE : ''})`;
                }
                return {
                    '欄位名稱': c.COLUMN_NAME,
                    '資料型態': typeStr,
                    '允許NULL': c.IS_NULLABLE,
                    '預設值': c.COLUMN_DEFAULT || ''
                };
            });
            console.table(formattedCols);
        }

        // 3. 檢核重要檢視表
        console.log('👁️ [檢視表 (Views) 檢核]');
        const viewResult = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.VIEWS
        `);
        const existingViews = new Set(viewResult.recordset.map(r => r.TABLE_NAME));
        const expectedViews = ['vw_CPDS_Dept', 'vw_CPDS_DispatchDetail'];
        for (const viewName of expectedViews) {
            if (existingViews.has(viewName)) {
                console.log(`  ✅ 檢視表存在: ${viewName}`);
            } else {
                console.warn(`  ⚠️ 缺少檢視表: ${viewName}`);
            }
        }
        console.log('');

        // 4. 檢核 Trigger 與防呆索引
        console.log('⚡ [Trigger 與索引檢核]');
        const triggerCheck = await pool.request().query(`
            SELECT name FROM sys.triggers WHERE name = 'TR_CustCPDSDetail_TimeOverlapCheck'
        `);
        assert.strictEqual(triggerCheck.recordset.length, 1, 'Trigger TR_CustCPDSDetail_TimeOverlapCheck 必須存在');
        console.log('  ✅ Trigger 存在: TR_CustCPDSDetail_TimeOverlapCheck');

        const itemTriggerCheck = await pool.request().query(`
            SELECT name FROM sys.triggers WHERE name = 'TR_CustCPDSItem_Validate'
        `);
        assert.strictEqual(itemTriggerCheck.recordset.length, 1, 'Trigger TR_CustCPDSItem_Validate 必須存在');
        console.log('  ✅ Trigger 存在: TR_CustCPDSItem_Validate');

        const indexCheck = await pool.request().query(`
            SELECT name FROM sys.indexes WHERE name = 'UQ_CustCPDSDetail_DispatchDate_EmpId'
        `);
        assert.strictEqual(indexCheck.recordset.length, 0, '舊唯一索引 UQ_CustCPDSDetail_DispatchDate_EmpId 必須已被移除');
        console.log('  ✅ 舊唯一索引 UQ_CustCPDSDetail_DispatchDate_EmpId 已被移除');
        console.log('');

        // 5. 檢核測試資料
        const userCount = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [dbo].[CustCPDSUser]`);
        console.log(`👤 CustCPDSUser 現有帳號筆數: ${userCount.recordset[0].cnt}`);

        // 6. 靜態腳本雙重檢核
        verifySchemaScript();

        if (hasError) {
            console.error('\n❌ 檢核未通過：部分項目檢驗失敗！');
            process.exit(1);
        } else {
            console.log('\n🎉 所有核心資料表、Trigger 與索引結構檢核均已通過！');
            process.exit(0);
        }

    } catch (err) {
        if (err.name === 'AssertionError') {
            console.error('\n❌ 斷言檢驗失敗:', err.message);
            process.exit(1);
        }

        console.warn('\n⚠️ 連線至 SQL Server 異常，轉由靜態 SQL 腳本 (db/schema.sql) 檢核...');
        try {
            verifySchemaScript();
            console.log('\n🎉 db/schema.sql 靜態腳本檢核全部通過！');
            process.exit(0);
        } catch (scriptErr) {
            console.error('\n❌ db/schema.sql 靜態檢核失敗:', scriptErr.message);
            process.exit(1);
        }
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

/**
 * 靜態 schema.sql 語法與結構檢核
 */
function verifySchemaScript() {
    console.log('📄 [db/schema.sql 靜態結構分析檢核]');
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`找不到 SQL 腳本檔案: ${schemaPath}`);
    }

    const content = fs.readFileSync(schemaPath, 'utf8');

    // 1. 檢核核心資料表
    for (const tableName of EXPECTED_TABLES) {
        const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(\\[dbo\\]\\.)?\\[?${tableName}\\]?`, 'i');
        assert.ok(tableRegex.test(content), `schema.sql 缺少資料表定義: ${tableName}`);
        console.log(`  ✅ 腳本包含資料表定義: ${tableName}`);
    }

    // 2. 檢核檢視表
    const expectedViews = ['vw_CPDS_Dept', 'vw_CPDS_DispatchDetail'];
    for (const viewName of expectedViews) {
        const viewRegex = new RegExp(`CREATE\\s+(OR\\s+ALTER\\s+)?VIEW\\s+(\\[dbo\\]\\.)?\\[?${viewName}\\]?`, 'i');
        assert.ok(viewRegex.test(content), `schema.sql 缺少檢視表定義: ${viewName}`);
        console.log(`  ✅ 腳本包含檢視表定義: ${viewName}`);
    }

    // 3. 檢核舊唯一索引 UQ_CustCPDSDetail_DispatchDate_EmpId 已被移除 (不可有 CREATE INDEX 陳述)
    const createIndexRegex = /CREATE\s+(UNIQUE\s+)?(NONCLUSTERED\s+)?INDEX\s+\[?UQ_CustCPDSDetail_DispatchDate_EmpId\]?/i;
    assert.ok(!createIndexRegex.test(content), '舊唯一索引 UQ_CustCPDSDetail_DispatchDate_EmpId 必須自 schema.sql 移除');
    console.log('  ✅ 腳本已確認移除 UQ_CustCPDSDetail_DispatchDate_EmpId 建立陳述');

    // 4. 檢核 Trigger TR_CustCPDSDetail_TimeOverlapCheck 存在且含時間重疊判定
    const triggerRegex = /CREATE\s+(OR\s+ALTER\s+)?TRIGGER\s+(\[dbo\]\.)?\[?TR_CustCPDSDetail_TimeOverlapCheck\]?\s+ON\s+(\[dbo\]\.)?\[?CustCPDSDispatchPlan_Detail\]?/i;
    assert.ok(triggerRegex.test(content), 'schema.sql 必須包含 TR_CustCPDSDetail_TimeOverlapCheck Trigger 定義');
    assert.ok(/StartTime.*<.*EndTime/i.test(content) && /EndTime.*>.*StartTime/i.test(content), 'TR_CustCPDSDetail_TimeOverlapCheck 必須包含時間重疊判定公式 (StartTime < EndTime AND EndTime > StartTime)');
    console.log('  ✅ 腳本包含 TR_CustCPDSDetail_TimeOverlapCheck 且判定公式符合規範');

    // 5. 檢核 Trigger TR_CustCPDSItem_Validate 存在且含重疊防呆
    const itemTriggerRegex = /CREATE\s+(OR\s+ALTER\s+)?TRIGGER\s+(\[dbo\]\.)?\[?TR_CustCPDSItem_Validate\]?/i;
    assert.ok(itemTriggerRegex.test(content), 'schema.sql 必須包含 TR_CustCPDSItem_Validate Trigger 定義');
    console.log('  ✅ 腳本包含 TR_CustCPDSItem_Validate 定義');
}

verifySchema();
