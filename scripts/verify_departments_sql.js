const sql = require('mssql/msnodesqlv8');
const dbConfig = require('../dbConfig');

async function testDepartmentsSql() {
    console.log('Testing /api/departments SQL query with proper parentheses...');
    let pool;
    try {
        pool = await sql.connect({ connectionString: dbConfig.connectionString });
    } catch (e) {
        console.error('Connection error details:', e);
        process.exit(1);
    }
    const querySql = `
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
    `;
    const result = await pool.request().query(querySql);
    console.log(`Found ${result.recordset.length} departments.`);
    
    // Ensure all returned departments match the condition
    for (const d of result.recordset) {
        const id = d.deptId;
        const valid = id.startsWith('JMA') || id.startsWith('JMB') || id === 'JW001' || id === 'JL001';
        if (!valid) {
            console.error(`Invalid department ID returned: ${id}`);
            process.exit(1);
        }
    }
    console.log('✅ All departments match JMA%, JMB%, JW001, or JL001!');
    await pool.close();
}

testDepartmentsSql().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
