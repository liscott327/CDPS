const sql = require('mssql/msnodesqlv8');
const dbConfig = require('../dbConfig');

async function test() {
    try {
        console.log('Connecting...');
        const pool = await sql.connect({ connectionString: dbConfig.connectionString });
        console.log('Connected!');
        const res = await pool.request().query(`
            SELECT DISTINCT OrganizationUnit.id AS deptId, OrganizationUnit.organizationUnitName AS deptName
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
        console.log('Count:', res.recordset.length);
        console.log(res.recordset);
        await pool.close();
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
