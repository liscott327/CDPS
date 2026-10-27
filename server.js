/**
 * =========================================================================
 *  跨廠人員調度與簽到系統 (CPDS) - 後端服務 (server.js)
 * =========================================================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

// 比對 SkillCertification/server.js：使用 mssql/msnodesqlv8 連線 LocalDB
let sql = null;
try {
    sql = require('mssql/msnodesqlv8');
} catch (e) {
    try {
        sql = require('mssql');
    } catch (err) {
        console.warn('[DB] 尚未載入 mssql 相關模組');
    }
}

let dbConfig = null;
try {
    dbConfig = require('./dbConfig');
} catch (e) {
    console.warn('[DB] 未找到 dbConfig.js 設定檔');
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cpds_jwt_secret_key_2026';

// 中介軟體設定
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 靜態檔案託管 (根目錄)
app.use(express.static(__dirname));

// =========================================================================
// 【資料庫連線管理 (MSSQL LocalDB via msnodesqlv8)】
// =========================================================================
let dbPool = null;
let dbStatus = {
    connected: false,
    message: '尚未嘗試連線'
};

async function initDbConnection() {
    if (!sql) {
        dbStatus = { connected: false, message: 'mssql/msnodesqlv8 套件未載入，使用本地備用資料' };
        return;
    }

    if (!dbConfig || !dbConfig.enableDb) {
        dbStatus = { connected: false, message: 'dbConfig.enableDb 為 false，使用本地備用資料' };
        console.log('[DB] 資料庫連線未啟用，採用 localdb 模擬模式');
        return;
    }

    try {
        console.log('[DB] 正在嘗試透過 msnodesqlv8 (ODBC) 連線至 LocalDB...');
        const connStr = dbConfig.connectionString;

        if (!connStr || connStr.includes('請在此輸入密碼')) {
            dbStatus = { connected: false, message: '連線字串未設定或密碼未填寫' };
            console.log('[DB] 提示: 請至 dbConfig.js 設定您的連線字串。目前使用本地備援資料。');
            return;
        }

        // 以 connectionString 物件連線
        dbPool = await sql.connect({ connectionString: connStr });
        dbStatus = { connected: true, message: 'LocalDB (BPMTEST) 連線成功！' };
        console.log('✅ [DB] LocalDB 資料庫連線成功！(Database: BPMTEST)');

        // 自動檢查並建立 CustCPDSUser 表 (若尚未存在)
        await ensureCustCPDSUserTable();

    } catch (err) {
        dbPool = null;
        dbStatus = { connected: false, message: `連線失敗: ${err.message}` };
        console.warn('⚠️ [DB] 連線至資料庫失敗，自動切換至備援模式。錯誤訊息:', err.message);
    }
}

// 自動檢查/建立 CustCPDSUser 資料表
async function ensureCustCPDSUserTable() {
    if (!dbPool) return;
    try {
        const checkSql = `
            IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CustCPDSUser')
            BEGIN
                CREATE TABLE CustCPDSUser (
                    UserId VARCHAR(10) NOT NULL PRIMARY KEY,
                    Password VARCHAR(100) NOT NULL,
                    CreateTime DATETIME NOT NULL DEFAULT GETDATE(),
                    IsActive BIT NOT NULL DEFAULT 1,
                    IsAdmin NVARCHAR(10) NOT NULL DEFAULT '0',
                    UpdateTime DATETIME NULL
                );
                INSERT INTO CustCPDSUser (UserId, Password, IsActive, IsAdmin) VALUES 
                ('JM30448', '123', 1, '1'),
                ('JM11504', '123', 1, '0'),
                ('JM11237', '123', 1, '0'),
                ('A0123',   '123', 1, '1');
            END
            ELSE
            BEGIN
                -- 平滑升級現有表欄位結構
                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'EmpId')
                   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'UserId')
                BEGIN
                    EXEC sp_rename 'CustCPDSUser.EmpId', 'UserId', 'COLUMN';
                END

                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'Name')
                BEGIN
                    ALTER TABLE CustCPDSUser DROP COLUMN [Name];
                END

                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'Role')
                   AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'IsAdmin')
                BEGIN
                    ALTER TABLE CustCPDSUser ADD [IsAdmin] NVARCHAR(10) NOT NULL CONSTRAINT DF_CustCPDSUser_IsAdmin DEFAULT '0';
                    EXEC('UPDATE CustCPDSUser SET [IsAdmin] = CASE WHEN [Role] = ''2'' THEN ''1'' ELSE ''0'' END');
                    ALTER TABLE CustCPDSUser DROP COLUMN [Role];
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'IsAdmin')
                BEGIN
                    ALTER TABLE CustCPDSUser ADD [IsAdmin] NVARCHAR(10) NOT NULL CONSTRAINT DF_CustCPDSUser_IsAdmin DEFAULT '0';
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'CreateTime')
                BEGIN
                    ALTER TABLE CustCPDSUser ADD [CreateTime] DATETIME NOT NULL CONSTRAINT DF_CustCPDSUser_CreateTime DEFAULT GETDATE();
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'IsActive')
                BEGIN
                    ALTER TABLE CustCPDSUser ADD [IsActive] BIT NOT NULL CONSTRAINT DF_CustCPDSUser_IsActive DEFAULT 1;
                END

                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'UpdateTime')
                BEGIN
                    ALTER TABLE CustCPDSUser ADD [UpdateTime] DATETIME NULL;
                END
            END
        `;
        await dbPool.request().query(checkSql);
        console.log('✅ [DB] CustCPDSUser 資料表檢核完成 (含預設帳密)');
    } catch (e) {
        console.warn('⚠️ [DB] 檢查 CustCPDSUser 資料表時發生提示:', e.message);
    }
}

// 啟動連線
initDbConnection();

// =========================================================================
// 【LocalDB 本地備援資料集】
// =========================================================================
const fallbackUsers = [
    { UserId: 'JM30448', Password: '123', IsAdmin: '1', DeptId: 'OU_A51_IT', DeptName: 'A5-1廠 資訊部', Title: '軟體工程師', Name: '李奕諴' },
    { UserId: 'JM11504', Password: '123', IsAdmin: '0', DeptId: 'JMB03', DeptName: 'B10-3廠', Title: '作業員', Name: '沈佳承' },
    { UserId: 'A0123',   Password: '123', IsAdmin: '1', DeptId: 'OU_A51_MFG', DeptName: 'A5-1廠 製造部', Title: '組長', Name: '王大明' }
];

// =========================================================================
// 【身分驗證 API 路由】
// =========================================================================

/**
 * POST /api/auth/login
 * 員工登入驗證
 */
app.post('/api/auth/login', async (req, res) => {
    const { empId, password } = req.body;

    if (!empId || !password) {
        return res.status(400).json({
            success: false,
            message: '請輸入員工工號與密碼！'
        });
    }

    const cleanEmpId = empId.trim();

    // --- 情況 A: 資料庫已成功連線 (真實 LocalDB) ---
    if (dbPool && dbStatus.connected) {
        try {
            // 1. 查詢 CustCPDSUser 帳密並 JOIN vw_ActiveUserMainFunction 取得使用者姓名與部門職稱資訊
            const userQuery = await dbPool.request()
                .input('userId', sql.NVarChar, cleanEmpId)
                .input('password', sql.NVarChar, password)
                .query(`
                    SELECT TOP 1 
                        u.UserId, 
                        u.Password, 
                        u.IsActive, 
                        u.IsAdmin,
                        v.userName, 
                        v.organizationUnitID, 
                        v.organizationUnitName, 
                        v.functionDefinitionName
                    FROM CustCPDSUser u
                    LEFT JOIN [vw_ActiveUserMainFunction] v ON UPPER(v.userID) = UPPER(u.UserId)
                    WHERE UPPER(u.UserId) = UPPER(@userId) AND u.Password = @password
                `);

            if (userQuery.recordset.length === 0) {
                return res.status(401).json({
                    success: false,
                    message: '員工工號或密碼錯誤！'
                });
            }

            const dbUser = userQuery.recordset[0];

            const userData = {
                userId: dbUser.UserId,
                empId: dbUser.UserId, // 保持向後相容性，供系統其他依賴 empId 之模組使用
                name: dbUser.userName || cleanEmpId,
                deptId: dbUser.organizationUnitID || 'OU_DEFAULT',
                deptName: dbUser.organizationUnitName || '未指定部門',
                title: dbUser.functionDefinitionName || '同仁',
                isAdmin: dbUser.IsAdmin === '1'
            };

            const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });

            return res.json({
                success: true,
                message: '登入成功 (來自真實 LocalDB 資料庫)',
                token,
                user: userData
            });
        } catch (dbErr) {
            console.error('[DB Login Error] 查詢發生錯誤:', dbErr);
            return res.status(500).json({
                success: false,
                message: `資料庫查詢異常: ${dbErr.message}`
            });
        }
    }

    // --- 情況 B: 本地備援模式 (Local Fallback) ---
    const userAccount = fallbackUsers.find(u =>
        (u.UserId || u.EmpId).toUpperCase() === cleanEmpId.toUpperCase() && u.Password === password
    );

    if (!userAccount) {
        return res.status(401).json({
            success: false,
            message: '員工工號或密碼錯誤！'
        });
    }

    const userData = {
        userId: userAccount.UserId,
        empId: userAccount.UserId,
        name: userAccount.Name || cleanEmpId,
        deptId: userAccount.DeptId,
        deptName: userAccount.DeptName,
        title: userAccount.Title,
        isAdmin: userAccount.IsAdmin === '1'
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: '8h' });

    return res.json({
        success: true,
        message: '登入成功 (本地備援模式)',
        token,
        user: userData
    });
});

/**
 * GET /api/auth/me
 * 取得當前登入者資訊
 */
app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: '未提供授權憑證' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, message: '憑證無效或已過期' });
        }
        res.json({ success: true, user: decoded });
    });
});

/**
 * GET /api/department-names
 * 部門名稱列表 (只取代號 JMA、JMB 開頭的部門)
 */
app.get('/api/department-names', async (req, res) => {
    if (dbPool && dbStatus.connected) {
        try {
            const querySql = `
                SELECT DISTINCT OrganizationUnit.organizationUnitName
                FROM Users
                    INNER JOIN Functions ON Functions.occupantOID = Users.OID
                    INNER JOIN OrganizationUnit ON OrganizationUnit.OID = Functions.organizationUnitOID
                    INNER JOIN Organization ON Organization.OID = OrganizationUnit.organizationOID
                    INNER JOIN FunctionDefinition ON FunctionDefinition.OID = Functions.definitionOID
                LEFT OUTER JOIN CustEmployeeSkill ON CustEmployeeSkill.OID = Users.OID
                WHERE Functions.isMain = 1
                    AND OrganizationUnit.organizationUnitType = 0
                    AND (
                        OrganizationUnit.id LIKE 'JMA%' 
                        OR OrganizationUnit.id LIKE 'JMB%' 
                        OR OrganizationUnit.id IN ('JW001', 'JL001')
                    )
                ORDER BY OrganizationUnit.organizationUnitName
            `;
            const result = await dbPool.request().query(querySql);

            if (result.recordset && result.recordset.length > 0) {
                return res.json(result.recordset);
            } else {
                return res.status(404).send('No data available');
            }
        } catch (err) {
            console.error('Error fetching department names: ' + err.stack);
            return res.status(500).send('Error fetching department names');
        }
    }

    // 本地備援廠別清單
    const fallbackFactories = [
        'A12-1廠', 'A12-2廠', 'A12-3廠', 'A5-1廠', 'A5-2廠', 'A7廠',
        'B10-1廠', 'B10-2廠', 'B10-3廠', 'B11廠', 'B4廠', 'C1廠',
        'ED廠', 'F1廠', '工程部', '物流部'
    ];
    return res.json(fallbackFactories.map(name => ({ organizationUnitName: name })));
});

/**
 * POST /api/employees
 * 員工資料查詢 (依據部門、姓名、工號、職稱等篩選)
 */
app.post('/api/employees', async (req, res) => {
    const filters = req.body || {};

    if (dbPool && dbStatus.connected && sql) {
        let querySql = `
            SELECT Users.id AS userID,
                   Users.userName AS userName,
                   OrganizationUnit.id AS organizationUnitID,
                   OrganizationUnit.organizationUnitName,
                   functionDefinitionName
              FROM Users
             INNER JOIN Functions ON Functions.occupantOID = Users.OID
             INNER JOIN OrganizationUnit ON OrganizationUnit.OID = Functions.organizationUnitOID
             INNER JOIN Organization ON Organization.OID = OrganizationUnit.organizationOID
             INNER JOIN FunctionDefinition ON FunctionDefinition.OID = Functions.definitionOID
             LEFT OUTER JOIN CustEmployeeSkill ON CustEmployeeSkill.OID = Users.OID
             WHERE (Users.leaveDate IS NULL OR DATEDIFF(day, GETDATE(), Users.leaveDate) > 0)
               AND Functions.isMain = 1
               AND OrganizationUnit.organizationUnitType = 0
        `;

        const conditions = [];
        const parameters = {};

        function addCondition(column, value, operator = 'LIKE') {
            if (value) {
                const paramName = column.replace(/[^a-zA-Z0-9]/g, '') + '_param';
                conditions.push(`${column} ${operator} @${paramName}`);
                parameters[paramName] = `%${value}%`;
            }
        }

        addCondition('Users.id', filters.EmployeeId);
        addCondition('Users.userName', filters.EmployeeName);
        addCondition('OrganizationUnit.id', filters.Department);
        addCondition('OrganizationUnit.organizationUnitName', filters.DepartmentName);
        addCondition('functionDefinitionName', filters.FunctionDefinitionName);

        if (filters.Skill && filters.Skill.length > 0) {
            const skillParams = filters.Skill.map((_, index) => `@Skill${index}`).join(', ');
            conditions.push('employeeSkill IN (' + skillParams + ')');
            filters.Skill.forEach((skill, index) => {
                parameters[`Skill${index}`] = skill;
            });
        }

        if (conditions.length > 0) {
            querySql += ' AND ' + conditions.join(' AND ');
        }

        querySql += `
            GROUP BY Users.id,
                    Users.userName,
                    OrganizationUnit.id,
                    OrganizationUnit.organizationUnitName,
                    functionDefinitionName
            ORDER BY
                    OrganizationUnit.id ASC,
                    Users.id ASC
        `;

        try {
            const request = dbPool.request();
            for (const [param, value] of Object.entries(parameters)) {
                request.input(param, sql.NVarChar, value);
            }
            const result = await request.query(querySql);
            return res.json(result.recordset);
        } catch (err) {
            console.error('Error fetching employees: ' + err.stack);
            return res.status(500).send('Error fetching employees');
        }
    }

    // 本地備援員工資料集 (離線或資料庫未連線時)
    const fallbackEmployees = [
        { userID: 'JM30448', userName: '李奕諴', organizationUnitID: 'OU_A51_IT', organizationUnitName: 'A5-1廠 資訊部', functionDefinitionName: '軟體工程師' },
        { userID: 'A0123', userName: '王大明', organizationUnitID: 'OU_A51_MFG', organizationUnitName: 'A5-1廠 製造部', functionDefinitionName: '組長' },
        { userID: 'A0145', userName: '李小華', organizationUnitID: 'OU_A51_MFG', organizationUnitName: 'A5-1廠 製造部', functionDefinitionName: '技術員' },
        { userID: 'B0211', userName: '陳大文', organizationUnitID: 'OU_A51_QA', organizationUnitName: 'A5-1廠 品管部', functionDefinitionName: '品檢專員' },
        { userID: 'C0089', userName: '張美玲', organizationUnitID: 'OU_B101_MFG', organizationUnitName: 'B10-1廠', functionDefinitionName: '組長' },
        { userID: 'C0102', userName: '林志豪', organizationUnitID: 'OU_B101_MFG', organizationUnitName: 'B10-1廠', functionDefinitionName: '技術員' },
        { userID: 'JM11504', userName: '沈佳承', organizationUnitID: 'JMB03', organizationUnitName: 'B10-3廠', functionDefinitionName: '作業員' }
    ];

    let result = fallbackEmployees;
    if (filters.DepartmentName) {
        result = result.filter(e => e.organizationUnitName.includes(filters.DepartmentName));
    }
    if (filters.Department) {
        result = result.filter(e => e.organizationUnitID.includes(filters.Department));
    }
    if (filters.EmployeeId) {
        result = result.filter(e => e.userID.includes(filters.EmployeeId));
    }
    if (filters.EmployeeName) {
        result = result.filter(e => e.userName.includes(filters.EmployeeName));
    }
    return res.json(result);
});

/**
 * GET /api/departments
 * 取得所有部門清單 (供篩選工具列下拉使用)
 */
app.get('/api/departments', async (req, res) => {
    if (dbPool && dbStatus.connected) {
        try {
            const result = await dbPool.request().query(`
                SELECT DISTINCT  OrganizationUnit.id AS deptId, OrganizationUnit.organizationUnitName AS deptName
                FROM Users 
                        INNER JOIN Functions ON Functions.occupantOID = Users.OID 
                        INNER JOIN OrganizationUnit ON OrganizationUnit.OID = Functions.organizationUnitOID 
                        INNER JOIN Organization ON Organization.OID = OrganizationUnit.organizationOID 
                        INNER JOIN FunctionDefinition ON FunctionDefinition.OID = Functions.definitionOID 
                LEFT OUTER JOIN CustEmployeeSkill ON CustEmployeeSkill.OID = Users.OID 
                WHERE Functions.isMain = 1 
                        AND OrganizationUnit.organizationUnitType = 0 
                        AND (
                            OrganizationUnit.id LIKE 'JMA%' 
                            OR OrganizationUnit.id LIKE 'JMB%' 
                            OR OrganizationUnit.id IN ('JW001', 'JL001')
                        )
                ORDER BY OrganizationUnit.organizationUnitName
            `);
            return res.json({ success: true, data: result.recordset });
        } catch (e) {
            console.warn('[DB] 部門清單查詢失敗，改用本地資料:', e.message);
        }
    }

    // 備援清單 (16 個標準廠別)
    const fallbackFactories = [
        { deptId: 'JMA01', deptName: 'A12-1廠' },
        { deptId: 'JMA02', deptName: 'A12-2廠' },
        { deptId: 'JMA03', deptName: 'A12-3廠' },
        { deptId: 'JMA04', deptName: 'A5-1廠' },
        { deptId: 'JMA05', deptName: 'A5-2廠' },
        { deptId: 'JMA06', deptName: 'A7廠' },
        { deptId: 'JMB01', deptName: 'B10-1廠' },
        { deptId: 'JMB02', deptName: 'B10-2廠' },
        { deptId: 'JMB03', deptName: 'B10-3廠' },
        { deptId: 'JMB04', deptName: 'B11廠' },
        { deptId: 'JMB05', deptName: 'B4廠' },
        { deptId: 'JMB06', deptName: 'C1廠' },
        { deptId: 'JMB07', deptName: 'ED廠' },
        { deptId: 'JMB08', deptName: 'F1廠' },
        { deptId: 'JW001', deptName: '工程部' },
        { deptId: 'JL001', deptName: '物流部' }
    ];
    res.json({
        success: true,
        data: fallbackFactories
    });
});

/**
 * GET /api/db/status
 * 檢查目前資料庫連線狀態
 */
app.get('/api/db/status', (req, res) => {
    res.json({
        success: true,
        dbStatus,
        configFile: 'dbConfig.js'
    });
});

// =========================================================================
// 【調度排程業務模組路由掛載】
// =========================================================================
const { createDispatchRouter } = require('./routes/dispatch');
app.use('/api/dispatch-plans', createDispatchRouter({
    getDbPool: () => (dbPool && dbStatus.connected ? dbPool : null),
    sql,
    JWT_SECRET
}));

// =========================================================================
// 【現場簽到業務模組路由掛載】
// =========================================================================
const { createCheckinRouter } = require('./routes/checkin');
app.use('/api/checkin', createCheckinRouter({
    getDbPool: () => (dbPool && dbStatus.connected ? dbPool : null),
    sql,
    JWT_SECRET
}));

// =========================================================================
// 【報表查詢業務模組路由掛載】
// =========================================================================
const { createReportRouter } = require('./routes/report');
app.use('/api/reports', createReportRouter({
    getDbPool: () => (dbPool && dbStatus.connected ? dbPool : null),
    sql,
    JWT_SECRET
}));

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  CPDS 伺服器已啟動`);
    console.log(`  連線網址: http://localhost:${PORT}`);
    console.log(`  資料庫設定檔: dbConfig.js`);
    console.log(`  資料庫狀態: ${dbStatus.message}`);
    console.log(`====================================================`);
});
