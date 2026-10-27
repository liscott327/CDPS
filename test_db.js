const sql = require('mssql/msnodesqlv8');
const dbConfig = require('./dbConfig');

async function test() {
    try {
        console.log('Connecting to LocalDB...');
        const pool = await sql.connect({ connectionString: dbConfig.connectionString });
        console.log('Connected!');

        const depts = await pool.request().query(`
            SELECT DISTINCT OrganizationUnit.organizationUnitName
            FROM Users
                INNER JOIN Functions ON Functions.occupantOID = Users.OID
                INNER JOIN OrganizationUnit ON OrganizationUnit.OID = Functions.organizationUnitOID
                INNER JOIN Organization ON Organization.OID = OrganizationUnit.organizationOID
                INNER JOIN FunctionDefinition ON FunctionDefinition.OID = Functions.definitionOID
            LEFT OUTER JOIN CustEmployeeSkill ON CustEmployeeSkill.OID = Users.OID
            WHERE Functions.isMain = 1
                AND OrganizationUnit.organizationUnitType = 0
                AND (OrganizationUnit.id LIKE 'JMA%' OR OrganizationUnit.id LIKE 'JMB%')
            ORDER BY OrganizationUnit.organizationUnitName
        `);
        console.log('Total departments:', depts.recordset.length);
        console.log('Department names:', depts.recordset.map(d => d.organizationUnitName));

        for (const dept of depts.recordset.slice(0, 5)) {
            const name = dept.organizationUnitName;
            const empRes = await pool.request()
                .input('name', sql.NVarChar, '%' + name + '%')
                .query(`
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
                       AND OrganizationUnit.organizationUnitName LIKE @name
                     GROUP BY Users.id,
                              Users.userName,
                              OrganizationUnit.id,
                              OrganizationUnit.organizationUnitName,
                              functionDefinitionName
                `);
            console.log(`Dept [${name}] has ${empRes.recordset.length} employees:`);
            console.log(empRes.recordset);
        }

        await pool.close();
    } catch (e) {
        console.error('Test error:', e.message);
    }
}

test();
