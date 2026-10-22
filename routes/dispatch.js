/**
 * =========================================================================
 *  跨廠人員調度與簽到系統 (CPDS) - 調度排程業務模組 (routes/dispatch.js)
 * =========================================================================
 */

const express = require('express');
const jwt = require('jsonwebtoken');

/**
 * 建立調度排程 Router
 * @param {Object} options
 * @param {Function} options.getDbPool - 取得目前資料庫連線 pool 的函式 () => pool
 * @param {Object} options.sql - mssql 模組物件
 * @param {string} options.JWT_SECRET - JWT 密鑰
 * @returns {express.Router}
 */
function createDispatchRouter({ getDbPool, sql, JWT_SECRET }) {
    const router = express.Router();

    // -------------------------------------------------------------------------
    // 中介軟體：JWT Token 認證
    // -------------------------------------------------------------------------
    function authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: '未提供授權憑證，請先登入系統'
            });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({
                    success: false,
                    message: '憑證無效或已過期，請重新登入'
                });
            }
            req.user = decoded;
            next();
        });
    }

    // 所有調度排程 API 皆需經過 JWT 認證
    router.use(authenticateToken);

    // -------------------------------------------------------------------------
    // 工具函式：時間標準化與區間重疊比對
    // -------------------------------------------------------------------------
    function normalizeTime(t) {
        if (!t) return '';
        const parts = String(t).trim().split(':');
        const hh = parts[0].padStart(2, '0');
        const mm = (parts[1] || '00').padStart(2, '0');
        return `${hh}:${mm}`;
    }

    function isTimeOverlap(s1, e1, s2, e2) {
        const start1 = normalizeTime(s1);
        const end1 = normalizeTime(e1);
        const start2 = normalizeTime(s2);
        const end2 = normalizeTime(e2);
        return start1 < end2 && end1 > start2;
    }

    // -------------------------------------------------------------------------
    // 工具函式：產生調度單號 DPyyyyMMdd-NNN
    // -------------------------------------------------------------------------
    async function generatePlanNo(dbOrTx, dispatchDate) {
        // dispatchDate 格式為 YYYY-MM-DD
        const dateStr = dispatchDate.replace(/-/g, '');
        const prefix = `DP${dateStr}-`;

        // 查詢當日目前最大單號
        const querySql = `
            SELECT MAX(PlanNo) AS maxPlanNo
            FROM CustCPDSDispatchPlan_Master WITH (UPDLOCK, HOLDLOCK)
            WHERE PlanNo LIKE @prefix + '%'
        `;

        const request = dbOrTx.request();
        request.input('prefix', sql.VarChar(12), prefix);
        const result = await request.query(querySql);

        let nextSeq = 1;
        if (result.recordset.length > 0 && result.recordset[0].maxPlanNo) {
            const currentMax = result.recordset[0].maxPlanNo;
            const parts = currentMax.split('-');
            if (parts.length === 2) {
                const seqNum = parseInt(parts[1], 10);
                if (!isNaN(seqNum)) {
                    nextSeq = seqNum + 1;
                }
            }
        }

        const seqStr = String(nextSeq).padStart(3, '0');
        return `${prefix}${seqStr}`;
    }

    // -------------------------------------------------------------------------
    // 本地備援資料庫模擬 (Local Fallback Storage)
    // -------------------------------------------------------------------------
    const memoryPlans = [];

    // =========================================================================
    // 1. POST /check-conflict: 人員排班前衝突檢驗
    // =========================================================================
    router.post('/check-conflict', async (req, res) => {
        try {
            const { dispatchDate, startTime, endTime, empIds, excludePlanNo } = req.body;

            if (!dispatchDate || !Array.isArray(empIds) || empIds.length === 0) {
                return res.json({ success: true, conflicts: [] });
            }

            const pool = getDbPool();
            if (pool) {
                // 從資料庫檢查在 dispatchDate 已排定的同仁 (所有簽到狀態皆鎖定)
                // 若提供 excludePlanNo，則排除該調度單的人員
                // 若提供 startTime 與 endTime，則進行時間區間重疊比對
                const request = pool.request();
                request.input('dispatchDate', sql.Date, dispatchDate);

                let idFilterClauses = [];
                empIds.forEach((id, idx) => {
                    const paramName = `empId_${idx}`;
                    request.input(paramName, sql.VarChar(20), id.trim());
                    idFilterClauses.push(`@${paramName}`);
                });

                let timeClause = '';
                if (startTime && endTime) {
                    request.input('startTime', sql.VarChar(10), normalizeTime(startTime));
                    request.input('endTime', sql.VarChar(10), normalizeTime(endTime));
                    timeClause = 'AND (i.StartTime < @endTime AND i.EndTime > @startTime)';
                }

                let querySql = `
                    SELECT 
                        d.EmpId AS empId,
                        ISNULL(emp.userName, d.EmpId) AS name,
                        m.PlanNo AS planNo,
                        sd.DeptName AS sourceDeptName,
                        td.DeptName AS targetDeptName,
                        CONVERT(VARCHAR(5), i.StartTime, 108) AS startTime,
                        CONVERT(VARCHAR(5), i.EndTime, 108) AS endTime
                    FROM CustCPDSDispatchPlan_Detail d
                    INNER JOIN CustCPDSDispatchPlan_Item i ON i.ItemId = d.ItemId
                    INNER JOIN CustCPDSDispatchPlan_Master m ON m.PlanNo = i.PlanNo
                    OUTER APPLY (SELECT TOP 1 userName FROM vw_ActiveUserMainFunction WHERE userID = d.EmpId) emp
                    LEFT JOIN vw_CPDS_Dept sd ON sd.DeptId = m.SourceDeptId
                    LEFT JOIN vw_CPDS_Dept td ON td.DeptId = i.TargetDeptId
                    WHERE d.DispatchDate = @dispatchDate
                      AND d.EmpId IN (${idFilterClauses.join(',')})
                      ${timeClause}
                `;

                if (excludePlanNo) {
                    request.input('excludePlanNo', sql.VarChar(15), excludePlanNo);
                    querySql += ` AND m.PlanNo <> @excludePlanNo`;
                }

                const result = await request.query(querySql);

                return res.json({
                    success: true,
                    conflicts: result.recordset
                });
            }

            // 本地備援檢查
            const conflicts = [];
            memoryPlans.forEach(plan => {
                if (plan.dispatchDate === dispatchDate) {
                    if (excludePlanNo && plan.planNo === excludePlanNo) return;
                    plan.items.forEach(item => {
                        const overlap = (!startTime || !endTime) || isTimeOverlap(startTime, endTime, item.startTime, item.endTime);
                        if (overlap) {
                            item.employees.forEach(emp => {
                                if (empIds.includes(emp.empId)) {
                                    conflicts.push({
                                        empId: emp.empId,
                                        name: emp.name || emp.empId,
                                        planNo: plan.planNo,
                                        sourceDeptName: plan.sourceDeptName || plan.sourceDeptId,
                                        targetDeptName: item.targetDeptName || item.targetDeptId,
                                        startTime: item.startTime,
                                        endTime: item.endTime
                                    });
                                }
                            });
                        }
                    });
                }
            });

            return res.json({ success: true, conflicts });
        } catch (err) {
            console.error('[Dispatch check-conflict error]:', err);
            return res.status(500).json({
                success: false,
                message: `衝突檢驗失敗: ${err.message}`
            });
        }
    });

    // =========================================================================
    // 2. GET /: 查詢調度單清單
    // =========================================================================
    router.get('/', async (req, res) => {
        try {
            const {
                startDate,
                endDate,
                sourceDeptId,
                targetDeptId,
                startTime,
                endTime,
                keyword
            } = req.query;

            const pool = getDbPool();
            if (pool) {
                const request = pool.request();
                let whereClauses = ['1=1'];

                if (startDate) {
                    request.input('startDate', sql.Date, startDate);
                    whereClauses.push('m.DispatchDate >= @startDate');
                }
                if (endDate) {
                    request.input('endDate', sql.Date, endDate);
                    whereClauses.push('m.DispatchDate <= @endDate');
                }
                if (sourceDeptId) {
                    const depts = sourceDeptId.split(',').map(s => s.trim()).filter(Boolean);
                    if (depts.length > 0) {
                        const deptParams = depts.map((d, i) => {
                            const pName = `sDept_${i}`;
                            request.input(pName, sql.VarChar(10), d);
                            return `@${pName}`;
                        });
                        whereClauses.push(`m.SourceDeptId IN (${deptParams.join(',')})`);
                    }
                }
                if (targetDeptId) {
                    const depts = targetDeptId.split(',').map(s => s.trim()).filter(Boolean);
                    if (depts.length > 0) {
                        const deptParams = depts.map((d, i) => {
                            const pName = `tDept_${i}`;
                            request.input(pName, sql.VarChar(10), d);
                            return `@${pName}`;
                        });
                        whereClauses.push(`EXISTS (
                            SELECT 1 FROM CustCPDSDispatchPlan_Item ti 
                            WHERE ti.PlanNo = m.PlanNo AND ti.TargetDeptId IN (${deptParams.join(',')})
                        )`);
                    }
                }
                if (startTime) {
                    request.input('startTime', sql.VarChar(10), startTime);
                    whereClauses.push(`EXISTS (
                        SELECT 1 FROM CustCPDSDispatchPlan_Item ti 
                        WHERE ti.PlanNo = m.PlanNo AND CONVERT(VARCHAR(5), ti.StartTime, 108) >= @startTime
                    )`);
                }
                if (endTime) {
                    request.input('endTime', sql.VarChar(10), endTime);
                    whereClauses.push(`EXISTS (
                        SELECT 1 FROM CustCPDSDispatchPlan_Item ti 
                        WHERE ti.PlanNo = m.PlanNo AND CONVERT(VARCHAR(5), ti.EndTime, 108) <= @endTime
                    )`);
                }
                if (keyword) {
                    request.input('keyword', sql.NVarChar(100), `%${keyword.trim()}%`);
                    whereClauses.push(`(
                        m.PlanNo LIKE @keyword
                        OR sd.DeptName LIKE @keyword
                        OR EXISTS (
                            SELECT 1 FROM CustCPDSDispatchPlan_Item ki
                            LEFT JOIN vw_CPDS_Dept ktd ON ktd.DeptId = ki.TargetDeptId
                            WHERE ki.PlanNo = m.PlanNo AND (ki.Purpose LIKE @keyword OR ktd.DeptName LIKE @keyword)
                        )
                        OR EXISTS (
                            SELECT 1 FROM CustCPDSDispatchPlan_Detail kd
                            INNER JOIN CustCPDSDispatchPlan_Item kdi ON kdi.ItemId = kd.ItemId
                            LEFT JOIN vw_ActiveUserMainFunction kemp ON kemp.userID = kd.EmpId
                            WHERE kdi.PlanNo = m.PlanNo AND (kd.EmpId LIKE @keyword OR kemp.userName LIKE @keyword)
                        )
                    )`);
                }

                const querySql = `
                    SELECT 
                        m.PlanNo AS planNo,
                        CONVERT(VARCHAR(10), m.DispatchDate, 120) AS dispatchDate,
                        m.SourceDeptId AS sourceDeptId,
                        ISNULL(sd.DeptName, m.SourceDeptId) AS sourceDeptName,
                        m.CreateUser AS createUser,
                        ISNULL(cuser.userName, m.CreateUser) AS createUserName,
                        CONVERT(VARCHAR(19), m.CreateTime, 120) AS createTime,
                        i.ItemId AS itemId,
                        i.Seq AS seq,
                        i.TargetDeptId AS targetDeptId,
                        ISNULL(td.DeptName, i.TargetDeptId) AS targetDeptName,
                        CONVERT(VARCHAR(5), i.StartTime, 108) AS startTime,
                        CONVERT(VARCHAR(5), i.EndTime, 108) AS endTime,
                        i.Purpose AS purpose,
                        d.DetailId AS detailId,
                        d.EmpId AS empId,
                        ISNULL(emp.userName, d.EmpId) AS empName,
                        ISNULL(emp.functionDefinitionName, N'同仁') AS empTitle,
                        ISNULL(emp.organizationUnitName, sd.DeptName) AS empDeptName,
                        d.CheckInStatus AS checkInStatus
                    FROM CustCPDSDispatchPlan_Master m
                    LEFT JOIN vw_CPDS_Dept sd ON sd.DeptId = m.SourceDeptId
                    OUTER APPLY (SELECT TOP 1 userName FROM vw_ActiveUserMainFunction WHERE userID = m.CreateUser) cuser
                    LEFT JOIN CustCPDSDispatchPlan_Item i ON i.PlanNo = m.PlanNo
                    LEFT JOIN vw_CPDS_Dept td ON td.DeptId = i.TargetDeptId
                    LEFT JOIN CustCPDSDispatchPlan_Detail d ON d.ItemId = i.ItemId
                    OUTER APPLY (SELECT TOP 1 userName, functionDefinitionName, organizationUnitName FROM vw_ActiveUserMainFunction WHERE userID = d.EmpId) emp
                    WHERE ${whereClauses.join(' AND ')}
                    ORDER BY m.DispatchDate DESC, m.PlanNo DESC, i.Seq ASC, d.DetailId ASC
                `;

                const result = await request.query(querySql);

                // 將平坦化的查詢結果聚合為 Master -> Items -> Employees 的階層結構
                const planMap = new Map();

                for (const row of result.recordset) {
                    if (!planMap.has(row.planNo)) {
                        planMap.set(row.planNo, {
                            planNo: row.planNo,
                            dispatchDate: row.dispatchDate,
                            sourceDeptId: row.sourceDeptId,
                            sourceDeptName: row.sourceDeptName,
                            createUser: row.createUser,
                            createUserName: row.createUserName,
                            createTime: row.createTime,
                            items: [],
                            itemsMap: new Map(),
                            totalEmpCount: 0
                        });
                    }

                    const plan = planMap.get(row.planNo);

                    if (row.itemId != null) {
                        if (!plan.itemsMap.has(row.itemId)) {
                            const itemObj = {
                                itemId: row.itemId,
                                seq: row.seq,
                                targetDeptId: row.targetDeptId,
                                targetDeptName: row.targetDeptName,
                                startTime: row.startTime,
                                endTime: row.endTime,
                                purpose: row.purpose || '',
                                employees: []
                            };
                            plan.itemsMap.set(row.itemId, itemObj);
                            plan.items.push(itemObj);
                        }

                        if (row.empId != null) {
                            const itemObj = plan.itemsMap.get(row.itemId);
                            const empKey = String(row.empId).trim().toUpperCase();
                            const alreadyExists = itemObj.employees.some(e => String(e.empId).trim().toUpperCase() === empKey);
                            if (!alreadyExists) {
                                itemObj.employees.push({
                                    detailId: row.detailId,
                                    empId: row.empId,
                                    name: row.empName,
                                    title: row.empTitle,
                                    deptName: row.empDeptName,
                                    checkInStatus: row.checkInStatus
                                });
                                plan.totalEmpCount += 1;
                            }
                        }
                    }
                }

                const data = Array.from(planMap.values()).map(p => {
                    return {
                        planNo: p.planNo,
                        dispatchDate: p.dispatchDate,
                        sourceDeptId: p.sourceDeptId,
                        sourceDeptName: p.sourceDeptName,
                        createUser: p.createUser,
                        createUserName: p.createUserName,
                        createTime: p.createTime,
                        items: p.items,
                        totalItemCount: p.items.length,
                        totalEmpCount: p.totalEmpCount
                    };
                });

                return res.json({ success: true, data });
            }

            // 本地備援資料查詢
            let resultData = memoryPlans.map(p => ({
                ...p,
                totalItemCount: p.totalItemCount !== undefined ? p.totalItemCount : (p.items ? p.items.length : 0),
                totalEmpCount: p.totalEmpCount !== undefined ? p.totalEmpCount : (p.items ? p.items.reduce((acc, it) => acc + (it.employees ? it.employees.length : 0), 0) : 0)
            }));
            if (startDate) resultData = resultData.filter(p => p.dispatchDate >= startDate);
            if (endDate) resultData = resultData.filter(p => p.dispatchDate <= endDate);
            if (sourceDeptId) resultData = resultData.filter(p => p.sourceDeptId === sourceDeptId);
            if (keyword) {
                const kw = keyword.toLowerCase();
                resultData = resultData.filter(p => 
                    p.planNo.toLowerCase().includes(kw) ||
                    p.sourceDeptName.toLowerCase().includes(kw) ||
                    p.items.some(it => it.purpose.toLowerCase().includes(kw) || it.employees.some(e => e.name.toLowerCase().includes(kw) || e.empId.toLowerCase().includes(kw)))
                );
            }

            return res.json({
                success: true,
                data: resultData
            });
        } catch (err) {
            console.error('[Dispatch GET list error]:', err);
            return res.status(500).json({
                success: false,
                message: `查詢調度單失敗: ${err.message}`
            });
        }
    });

    // =========================================================================
    // 3. GET /:planNo: 取得單筆完整調度單資料
    // =========================================================================
    router.get('/:planNo', async (req, res) => {
        try {
            const { planNo } = req.params;
            const pool = getDbPool();

            if (pool) {
                const request = pool.request();
                request.input('planNo', sql.VarChar(15), planNo);

                const querySql = `
                    SELECT 
                        m.PlanNo AS planNo,
                        CONVERT(VARCHAR(10), m.DispatchDate, 120) AS dispatchDate,
                        m.SourceDeptId AS sourceDeptId,
                        ISNULL(sd.DeptName, m.SourceDeptId) AS sourceDeptName,
                        m.CreateUser AS createUser,
                        ISNULL(cuser.userName, m.CreateUser) AS createUserName,
                        CONVERT(VARCHAR(19), m.CreateTime, 120) AS createTime,
                        i.ItemId AS itemId,
                        i.Seq AS seq,
                        i.TargetDeptId AS targetDeptId,
                        ISNULL(td.DeptName, i.TargetDeptId) AS targetDeptName,
                        CONVERT(VARCHAR(5), i.StartTime, 108) AS startTime,
                        CONVERT(VARCHAR(5), i.EndTime, 108) AS endTime,
                        i.Purpose AS purpose,
                        d.DetailId AS detailId,
                        d.EmpId AS empId,
                        ISNULL(emp.userName, d.EmpId) AS empName,
                        ISNULL(emp.functionDefinitionName, N'同仁') AS empTitle,
                        ISNULL(emp.organizationUnitName, sd.DeptName) AS empDeptName,
                        d.CheckInStatus AS checkInStatus
                    FROM CustCPDSDispatchPlan_Master m
                    LEFT JOIN vw_CPDS_Dept sd ON sd.DeptId = m.SourceDeptId
                    OUTER APPLY (SELECT TOP 1 userName FROM vw_ActiveUserMainFunction WHERE userID = m.CreateUser) cuser
                    LEFT JOIN CustCPDSDispatchPlan_Item i ON i.PlanNo = m.PlanNo
                    LEFT JOIN vw_CPDS_Dept td ON td.DeptId = i.TargetDeptId
                    LEFT JOIN CustCPDSDispatchPlan_Detail d ON d.ItemId = i.ItemId
                    OUTER APPLY (SELECT TOP 1 userName, functionDefinitionName, organizationUnitName FROM vw_ActiveUserMainFunction WHERE userID = d.EmpId) emp
                    WHERE m.PlanNo = @planNo
                    ORDER BY i.Seq ASC, d.DetailId ASC
                `;

                const result = await request.query(querySql);

                if (result.recordset.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `找不到調度單據 ${planNo} 或已刪除`
                    });
                }

                let planObj = null;
                const itemsMap = new Map();

                for (const row of result.recordset) {
                    if (!planObj) {
                        planObj = {
                            planNo: row.planNo,
                            dispatchDate: row.dispatchDate,
                            sourceDeptId: row.sourceDeptId,
                            sourceDeptName: row.sourceDeptName,
                            createUser: row.createUser,
                            createUserName: row.createUserName,
                            createTime: row.createTime,
                            items: [],
                            totalEmpCount: 0
                        };
                    }

                    if (row.itemId != null) {
                        if (!itemsMap.has(row.itemId)) {
                            const item = {
                                itemId: row.itemId,
                                seq: row.seq,
                                targetDeptId: row.targetDeptId,
                                targetDeptName: row.targetDeptName,
                                startTime: row.startTime,
                                endTime: row.endTime,
                                purpose: row.purpose || '',
                                employees: []
                            };
                            itemsMap.set(row.itemId, item);
                            planObj.items.push(item);
                        }

                        if (row.empId != null) {
                            const item = itemsMap.get(row.itemId);
                            const empKey = String(row.empId).trim().toUpperCase();
                            const alreadyExists = item.employees.some(e => String(e.empId).trim().toUpperCase() === empKey);
                            if (!alreadyExists) {
                                item.employees.push({
                                    detailId: row.detailId,
                                    empId: row.empId,
                                    name: row.empName,
                                    title: row.empTitle,
                                    deptName: row.empDeptName,
                                    checkInStatus: row.checkInStatus
                                });
                                planObj.totalEmpCount += 1;
                            }
                        }
                    }
                }

                return res.json({ success: true, data: planObj });
            }

            // 本地備援
            const plan = memoryPlans.find(p => p.planNo === planNo);
            if (!plan) {
                return res.status(404).json({ success: false, message: '找不到調度單據' });
            }
            return res.json({ success: true, data: plan });
        } catch (err) {
            console.error('[Dispatch GET single error]:', err);
            return res.status(500).json({
                success: false,
                message: `取得調度單失敗: ${err.message}`
            });
        }
    });

    // =========================================================================
    // 4. POST /: 新增調度單 (Transaction 保護)
    // =========================================================================
    router.post('/', async (req, res) => {
        const pool = getDbPool();
        const { dispatchDate, sourceDeptId, items } = req.body;
        const currentUser = req.user.empId || 'SYSTEM';

        // 欄位基礎驗證
        if (!dispatchDate || !sourceDeptId) {
            return res.status(400).json({
                success: false,
                message: '請提供調度日期與來源廠別！'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: '調度單必須包含至少一筆時段明細！'
            });
        }

        // 檢查時段明細與人員
        const allEmpIds = [];
        const empAssignments = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.targetDeptId) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段未選擇目的廠` });
            }
            if (item.targetDeptId === sourceDeptId) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段目的廠不可與來源廠相同` });
            }
            if (!item.startTime || !item.endTime) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段起訖時間不完整` });
            }
            if (item.startTime >= item.endTime) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段起始時間需早於結束時間` });
            }
            if (!Array.isArray(item.employees) || item.employees.length === 0) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段請至少挑選一位同仁` });
            }
            item.employees.forEach(e => {
                if (e.empId) {
                    const empId = e.empId.trim();
                    allEmpIds.push(empId);
                    empAssignments.push({
                        empId,
                        name: e.name || empId,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        itemIndex: i + 1,
                        targetDeptId: item.targetDeptId
                    });
                }
            });
        }

        // 單內自我比對：檢查送出的所有 items，是否有同一個同仁被同時分配在重疊的時段中
        for (let i = 0; i < empAssignments.length; i++) {
            for (let j = i + 1; j < empAssignments.length; j++) {
                const a = empAssignments[i];
                const b = empAssignments[j];
                if (a.empId === b.empId && isTimeOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
                    return res.status(400).json({
                        success: false,
                        message: `同一張調度單內同仁 [${a.name || a.empId}] 排定重疊的時段 (${a.startTime}~${a.endTime} 與 ${b.startTime}~${b.endTime})！`,
                        conflicts: [
                            { empId: a.empId, name: a.name, startTime: a.startTime, endTime: a.endTime },
                            { empId: b.empId, name: b.name, startTime: b.startTime, endTime: b.endTime }
                        ]
                    });
                }
            }
        }

        if (pool) {
            // 1. 同廠同日唯一性檢查
            const checkExistReq = pool.request();
            checkExistReq.input('dispatchDate', sql.Date, dispatchDate);
            checkExistReq.input('sourceDeptId', sql.VarChar(10), sourceDeptId);
            const existRes = await checkExistReq.query(`
                SELECT TOP 1 PlanNo FROM CustCPDSDispatchPlan_Master 
                WHERE DispatchDate = @dispatchDate AND SourceDeptId = @sourceDeptId
            `);

            if (existRes.recordset.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `【同廠同日限制】該廠於 ${dispatchDate} 已存在調度單（單號：${existRes.recordset[0].PlanNo}），請直接進行修改！`
                });
            }

            // 2. 跨單既有排程重疊檢驗 (i.StartTime < @endTime AND i.EndTime > @startTime)
            if (empAssignments.length > 0) {
                const conflictReq = pool.request();
                conflictReq.input('dispatchDate', sql.Date, dispatchDate);

                const overlapConditions = [];
                items.forEach((item, itemIdx) => {
                    const itemEmpIds = (item.employees || []).map(e => (e.empId || '').trim()).filter(Boolean);
                    if (itemEmpIds.length === 0) return;

                    const startParam = `start_${itemIdx}`;
                    const endParam = `end_${itemIdx}`;
                    conflictReq.input(startParam, sql.VarChar(10), normalizeTime(item.startTime));
                    conflictReq.input(endParam, sql.VarChar(10), normalizeTime(item.endTime));

                    const empParams = itemEmpIds.map((id, empIdx) => {
                        const paramName = `emp_${itemIdx}_${empIdx}`;
                        conflictReq.input(paramName, sql.VarChar(20), id);
                        return `@${paramName}`;
                    });

                    overlapConditions.push(`(d.EmpId IN (${empParams.join(',')}) AND i.StartTime < @${endParam} AND i.EndTime > @${startParam})`);
                });

                if (overlapConditions.length > 0) {
                    const conflictRes = await conflictReq.query(`
                        SELECT 
                            d.EmpId AS empId,
                            ISNULL(emp.userName, d.EmpId) AS name,
                            m.PlanNo AS planNo,
                            sd.DeptName AS sourceDeptName,
                            td.DeptName AS targetDeptName,
                            CONVERT(VARCHAR(5), i.StartTime, 108) AS startTime,
                            CONVERT(VARCHAR(5), i.EndTime, 108) AS endTime
                        FROM CustCPDSDispatchPlan_Detail d
                        INNER JOIN CustCPDSDispatchPlan_Item i ON i.ItemId = d.ItemId
                        INNER JOIN CustCPDSDispatchPlan_Master m ON m.PlanNo = i.PlanNo
                        OUTER APPLY (SELECT TOP 1 userName FROM vw_ActiveUserMainFunction WHERE userID = d.EmpId) emp
                        LEFT JOIN vw_CPDS_Dept sd ON sd.DeptId = m.SourceDeptId
                        LEFT JOIN vw_CPDS_Dept td ON td.DeptId = i.TargetDeptId
                        WHERE d.DispatchDate = @dispatchDate
                          AND (${overlapConditions.join(' OR ')})
                    `);

                    if (conflictRes.recordset.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: '選取的人員在調度當日已存在其他有效調派排程且時段發生重疊！',
                            conflicts: conflictRes.recordset
                        });
                    }
                }
            }

            // 3. 啟動資料庫交易寫入 Master -> Items -> Details
            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin();

                // 產生單號
                const planNo = await generatePlanNo(transaction, dispatchDate);

                // 寫入 Master
                const masterReq = transaction.request();
                masterReq.input('planNo', sql.VarChar(15), planNo);
                masterReq.input('dispatchDate', sql.Date, dispatchDate);
                masterReq.input('sourceDeptId', sql.VarChar(10), sourceDeptId);
                masterReq.input('createUser', sql.VarChar(10), currentUser);
                await masterReq.query(`
                    INSERT INTO CustCPDSDispatchPlan_Master (PlanNo, DispatchDate, SourceDeptId, CreateUser, CreateTime)
                    VALUES (@planNo, @dispatchDate, @sourceDeptId, @createUser, GETDATE())
                `);

                // 逐筆寫入 Items 與 Details
                for (let seqIdx = 0; seqIdx < items.length; seqIdx++) {
                    const item = items[seqIdx];
                    const seq = item.seq || (seqIdx + 1);

                    const itemReq = transaction.request();
                    itemReq.input('planNo', sql.VarChar(15), planNo);
                    itemReq.input('seq', sql.SmallInt, seq);
                    itemReq.input('dispatchDate', sql.Date, dispatchDate);
                    itemReq.input('targetDeptId', sql.VarChar(10), item.targetDeptId);
                    itemReq.input('startTime', sql.VarChar(10), item.startTime);
                    itemReq.input('endTime', sql.VarChar(10), item.endTime);
                    itemReq.input('purpose', sql.NVarChar(100), item.purpose || '');

                    const itemResult = await itemReq.query(`
                        INSERT INTO CustCPDSDispatchPlan_Item (PlanNo, Seq, DispatchDate, TargetDeptId, StartTime, EndTime, Purpose, CreateTime)
                        VALUES (@planNo, @seq, @dispatchDate, @targetDeptId, @startTime, @endTime, @purpose, GETDATE());
                        SELECT SCOPE_IDENTITY() AS ItemId;
                    `);

                    const itemId = itemResult.recordset[0].ItemId;

                    // 寫入 Detail 人員
                    for (const emp of item.employees) {
                        const detailReq = transaction.request();
                        detailReq.input('itemId', sql.BigInt, itemId);
                        detailReq.input('dispatchDate', sql.Date, dispatchDate);
                        detailReq.input('empId', sql.VarChar(10), emp.empId.trim());
                        detailReq.input('status', sql.TinyInt, emp.checkInStatus !== undefined ? Number(emp.checkInStatus) : 0);

                        await detailReq.query(`
                            INSERT INTO CustCPDSDispatchPlan_Detail (ItemId, DispatchDate, EmpId, CheckInStatus, CreateTime)
                            VALUES (@itemId, @dispatchDate, @empId, @status, GETDATE())
                        `);
                    }
                }

                await transaction.commit();

                return res.json({
                    success: true,
                    message: '調度單建立成功',
                    planNo
                });
            } catch (txErr) {
                try {
                    await transaction.rollback();
                } catch (rbErr) {
                    console.error('[Transaction Rollback Error]:', rbErr);
                }
                console.error('[Dispatch Create Tx Error]:', txErr);
                return res.status(500).json({
                    success: false,
                    message: `建立調度單失敗: ${txErr.message}`
                });
            }
        }

        // 本地備援儲存模式
        // 1. 同廠同日唯一性檢查
        const existPlan = memoryPlans.find(p => p.dispatchDate === dispatchDate && p.sourceDeptId === sourceDeptId);
        if (existPlan) {
            return res.status(409).json({
                success: false,
                message: `【同廠同日限制】該廠於 ${dispatchDate} 已存在調度單（單號：${existPlan.planNo}），請直接進行修改！`
            });
        }

        // 2. 跨單人員衝突檢驗 (區間重疊比對，所有狀態皆鎖定)
        const memConflicts = [];
        memoryPlans.forEach(plan => {
            if (plan.dispatchDate === dispatchDate) {
                plan.items.forEach(it => {
                    it.employees.forEach(emp => {
                        const overlapAssignment = empAssignments.find(a =>
                            a.empId === emp.empId && isTimeOverlap(a.startTime, a.endTime, it.startTime, it.endTime)
                        );
                        if (overlapAssignment) {
                            memConflicts.push({
                                empId: emp.empId,
                                name: emp.name || emp.empId,
                                planNo: plan.planNo,
                                sourceDeptName: plan.sourceDeptName || plan.sourceDeptId,
                                targetDeptName: it.targetDeptName || it.targetDeptId,
                                startTime: it.startTime,
                                endTime: it.endTime
                            });
                        }
                    });
                });
            }
        });

        if (memConflicts.length > 0) {
            return res.status(400).json({
                success: false,
                message: '選取的人員在調度當日已存在其他有效調派排程且時段發生重疊！',
                conflicts: memConflicts
            });
        }

        const planNo = `DP${dispatchDate.replace(/-/g, '')}-${String(memoryPlans.length + 1).padStart(3, '0')}`;
        const newPlan = {
            planNo,
            dispatchDate,
            sourceDeptId,
            sourceDeptName: sourceDeptId,
            createUser: currentUser,
            createUserName: currentUser,
            createTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
            totalItemCount: items.length,
            totalEmpCount: allEmpIds.length,
            items: items.map((it, idx) => ({
                itemId: Date.now() + idx,
                seq: idx + 1,
                targetDeptId: it.targetDeptId,
                targetDeptName: it.targetDeptId,
                startTime: it.startTime,
                endTime: it.endTime,
                purpose: it.purpose || '',
                employees: it.employees.map((e, eidx) => ({
                    detailId: Date.now() + 100 + eidx,
                    empId: e.empId,
                    name: e.name || e.empId,
                    title: '同仁',
                    deptName: sourceDeptId,
                    checkInStatus: e.checkInStatus !== undefined ? Number(e.checkInStatus) : 0
                }))
            }))
        };
        memoryPlans.unshift(newPlan);

        return res.json({
            success: true,
            message: '調度單建立成功 (本地備援模式)',
            planNo
        });
    });

    // =========================================================================
    // 5. PUT /:planNo: 修改調度單 (Transaction 保護)
    // =========================================================================
    router.put('/:planNo', async (req, res) => {
        const { planNo } = req.params;
        const pool = getDbPool();
        const { dispatchDate, sourceDeptId, items } = req.body;
        const currentUser = req.user.empId || 'SYSTEM';

        if (!dispatchDate || !sourceDeptId) {
            return res.status(400).json({ success: false, message: '請提供調度日期與來源廠別！' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: '調度單必須包含至少一筆時段明細！' });
        }

        // 收集人員並檢核
        const allEmpIds = [];
        const empAssignments = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.targetDeptId) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段未選擇目的廠` });
            }
            if (item.targetDeptId === sourceDeptId) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段目的廠不可與來源廠相同` });
            }
            if (!item.startTime || !item.endTime) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段起訖時間不完整` });
            }
            if (item.startTime >= item.endTime) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段起始時間需早於結束時間` });
            }
            if (!Array.isArray(item.employees) || item.employees.length === 0) {
                return res.status(400).json({ success: false, message: `第 ${i + 1} 個時段請至少挑選一位同仁` });
            }
            item.employees.forEach(e => {
                if (e.empId) {
                    const empId = e.empId.trim();
                    allEmpIds.push(empId);
                    empAssignments.push({
                        empId,
                        name: e.name || empId,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        itemIndex: i + 1,
                        targetDeptId: item.targetDeptId
                    });
                }
            });
        }

        // 單內自我比對：檢查送出的所有 items，是否有同一個同仁被同時分配在重疊的時段中
        for (let i = 0; i < empAssignments.length; i++) {
            for (let j = i + 1; j < empAssignments.length; j++) {
                const a = empAssignments[i];
                const b = empAssignments[j];
                if (a.empId === b.empId && isTimeOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
                    return res.status(400).json({
                        success: false,
                        message: `同一張調度單內同仁 [${a.name || a.empId}] 排定重疊的時段 (${a.startTime}~${a.endTime} 與 ${b.startTime}~${b.endTime})！`,
                        conflicts: [
                            { empId: a.empId, name: a.name, startTime: a.startTime, endTime: a.endTime },
                            { empId: b.empId, name: b.name, startTime: b.startTime, endTime: b.endTime }
                        ]
                    });
                }
            }
        }

        if (pool) {
            // 1. 檢核原單是否存在
            const checkReq = pool.request();
            checkReq.input('planNo', sql.VarChar(15), planNo);
            const checkRes = await checkReq.query(`
                SELECT PlanNo, DispatchDate, SourceDeptId FROM CustCPDSDispatchPlan_Master 
                WHERE PlanNo = @planNo
            `);

            if (checkRes.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `調度單 ${planNo} 不存在！`
                });
            }

            // 1.1 檢核是否有現場已簽到之同仁 (CheckInStatus 1: 已簽到, 2: 逾期簽到)
            const checkInCheckReq = pool.request();
            checkInCheckReq.input('planNo', sql.VarChar(15), planNo);
            const checkInRes = await checkInCheckReq.query(`
                SELECT COUNT(*) AS checkedInCount
                FROM CustCPDSDispatchPlan_Detail d
                INNER JOIN CustCPDSDispatchPlan_Item i ON i.ItemId = d.ItemId
                WHERE i.PlanNo = @planNo AND d.CheckInStatus IN (1, 2)
            `);
            if (checkInRes.recordset[0].checkedInCount > 0) {
                return res.status(400).json({
                    success: false,
                    message: `該調度單現場已有 ${checkInRes.recordset[0].checkedInCount} 位同仁完成簽到，受保護無法覆蓋修改！`
                });
            }

            // 2. 檢核人員衝突（排除自己這張單，區間重疊比對）
            if (empAssignments.length > 0) {
                const conflictReq = pool.request();
                conflictReq.input('dispatchDate', sql.Date, dispatchDate);
                conflictReq.input('currentPlanNo', sql.VarChar(15), planNo);

                const overlapConditions = [];
                items.forEach((item, itemIdx) => {
                    const itemEmpIds = (item.employees || []).map(e => (e.empId || '').trim()).filter(Boolean);
                    if (itemEmpIds.length === 0) return;

                    const startParam = `start_${itemIdx}`;
                    const endParam = `end_${itemIdx}`;
                    conflictReq.input(startParam, sql.VarChar(10), normalizeTime(item.startTime));
                    conflictReq.input(endParam, sql.VarChar(10), normalizeTime(item.endTime));

                    const empParams = itemEmpIds.map((id, empIdx) => {
                        const paramName = `emp_${itemIdx}_${empIdx}`;
                        conflictReq.input(paramName, sql.VarChar(20), id);
                        return `@${paramName}`;
                    });

                    overlapConditions.push(`(d.EmpId IN (${empParams.join(',')}) AND i.StartTime < @${endParam} AND i.EndTime > @${startParam})`);
                });

                if (overlapConditions.length > 0) {
                    const conflictRes = await conflictReq.query(`
                        SELECT 
                            d.EmpId AS empId,
                            ISNULL(emp.userName, d.EmpId) AS name,
                            m.PlanNo AS planNo,
                            sd.DeptName AS sourceDeptName,
                            td.DeptName AS targetDeptName,
                            CONVERT(VARCHAR(5), i.StartTime, 108) AS startTime,
                            CONVERT(VARCHAR(5), i.EndTime, 108) AS endTime
                        FROM CustCPDSDispatchPlan_Detail d
                        INNER JOIN CustCPDSDispatchPlan_Item i ON i.ItemId = d.ItemId
                        INNER JOIN CustCPDSDispatchPlan_Master m ON m.PlanNo = i.PlanNo
                        OUTER APPLY (SELECT TOP 1 userName FROM vw_ActiveUserMainFunction WHERE userID = d.EmpId) emp
                        LEFT JOIN vw_CPDS_Dept sd ON sd.DeptId = m.SourceDeptId
                        LEFT JOIN vw_CPDS_Dept td ON td.DeptId = i.TargetDeptId
                        WHERE d.DispatchDate = @dispatchDate
                          AND m.PlanNo <> @currentPlanNo
                          AND (${overlapConditions.join(' OR ')})
                    `);

                    if (conflictRes.recordset.length > 0) {
                        return res.status(400).json({
                            success: false,
                            message: '更新排程中有人員已被其他有效調度單排定且時段發生重疊！',
                            conflicts: conflictRes.recordset
                        });
                    }
                }
            }

            // 3. 啟動資料庫交易更新
            const transaction = new sql.Transaction(pool);
            try {
                await transaction.begin();

                // 更新 Master
                const updateMasterReq = transaction.request();
                updateMasterReq.input('planNo', sql.VarChar(15), planNo);
                updateMasterReq.input('updateUser', sql.VarChar(10), currentUser);
                await updateMasterReq.query(`
                    UPDATE CustCPDSDispatchPlan_Master
                    SET UpdateUser = @updateUser, UpdateTime = GETDATE()
                    WHERE PlanNo = @planNo
                `);

                // 刪除既有 Items (因 CASCADE DELETE，Detail 會自動一併刪除)
                const deleteItemsReq = transaction.request();
                deleteItemsReq.input('planNo', sql.VarChar(15), planNo);
                await deleteItemsReq.query(`
                    DELETE FROM CustCPDSDispatchPlan_Item WHERE PlanNo = @planNo
                `);

                // 重新寫入新 Items 與 Details
                for (let seqIdx = 0; seqIdx < items.length; seqIdx++) {
                    const item = items[seqIdx];
                    const seq = item.seq || (seqIdx + 1);

                    const itemReq = transaction.request();
                    itemReq.input('planNo', sql.VarChar(15), planNo);
                    itemReq.input('seq', sql.SmallInt, seq);
                    itemReq.input('dispatchDate', sql.Date, dispatchDate);
                    itemReq.input('targetDeptId', sql.VarChar(10), item.targetDeptId);
                    itemReq.input('startTime', sql.VarChar(10), item.startTime);
                    itemReq.input('endTime', sql.VarChar(10), item.endTime);
                    itemReq.input('purpose', sql.NVarChar(100), item.purpose || '');

                    const itemResult = await itemReq.query(`
                        INSERT INTO CustCPDSDispatchPlan_Item (PlanNo, Seq, DispatchDate, TargetDeptId, StartTime, EndTime, Purpose, CreateTime)
                        VALUES (@planNo, @seq, @dispatchDate, @targetDeptId, @startTime, @endTime, @purpose, GETDATE());
                        SELECT SCOPE_IDENTITY() AS ItemId;
                    `);

                    const itemId = itemResult.recordset[0].ItemId;

                    for (const emp of item.employees) {
                        const detailReq = transaction.request();
                        detailReq.input('itemId', sql.BigInt, itemId);
                        detailReq.input('dispatchDate', sql.Date, dispatchDate);
                        detailReq.input('empId', sql.VarChar(10), emp.empId.trim());
                        detailReq.input('status', sql.TinyInt, emp.checkInStatus !== undefined ? Number(emp.checkInStatus) : 0);

                        await detailReq.query(`
                            INSERT INTO CustCPDSDispatchPlan_Detail (ItemId, DispatchDate, EmpId, CheckInStatus, CreateTime)
                            VALUES (@itemId, @dispatchDate, @empId, @status, GETDATE())
                        `);
                    }
                }

                await transaction.commit();

                return res.json({
                    success: true,
                    message: '調度單更新成功',
                    planNo
                });
            } catch (txErr) {
                try {
                    await transaction.rollback();
                } catch (rbErr) {
                    console.error('[Update Transaction Rollback Error]:', rbErr);
                }
                console.error('[Dispatch Update Tx Error]:', txErr);
                return res.status(500).json({
                    success: false,
                    message: `更新調度單失敗: ${txErr.message}`
                });
            }
        }

        // 本地備援修改
        const idx = memoryPlans.findIndex(p => p.planNo === planNo);
        if (idx === -1) {
            return res.status(404).json({ success: false, message: '找不到調度單據' });
        }
        const memConflicts = [];
        memoryPlans.forEach(plan => {
            if (plan.dispatchDate === dispatchDate && plan.planNo !== planNo) {
                plan.items.forEach(it => {
                    it.employees.forEach(emp => {
                        const overlapAssignment = empAssignments.find(a =>
                            a.empId === emp.empId && isTimeOverlap(a.startTime, a.endTime, it.startTime, it.endTime)
                        );
                        if (overlapAssignment) {
                            memConflicts.push({
                                empId: emp.empId,
                                name: emp.name || emp.empId,
                                planNo: plan.planNo,
                                sourceDeptName: plan.sourceDeptName || plan.sourceDeptId,
                                targetDeptName: it.targetDeptName || it.targetDeptId,
                                startTime: it.startTime,
                                endTime: it.endTime
                            });
                        }
                    });
                });
            }
        });
        if (memConflicts.length > 0) {
            return res.status(400).json({
                success: false,
                message: '更新排程中有人員已被其他有效調度單排定且時段發生重疊！',
                conflicts: memConflicts
            });
        }
        memoryPlans[idx].items = items.map((it, i) => ({
            itemId: Date.now() + i,
            seq: i + 1,
            targetDeptId: it.targetDeptId,
            targetDeptName: it.targetDeptId,
            startTime: it.startTime,
            endTime: it.endTime,
            purpose: it.purpose || '',
            employees: it.employees.map((e, ei) => ({
                detailId: Date.now() + 100 + ei,
                empId: e.empId,
                name: e.name || e.empId,
                title: '同仁',
                deptName: sourceDeptId,
                checkInStatus: e.checkInStatus !== undefined ? Number(e.checkInStatus) : 0
            }))
        }));

        return res.json({
            success: true,
            message: '調度單更新成功 (本地備援模式)'
        });
    });

    // =========================================================================
    // 6. DELETE /:planNo: 刪除調度單 (硬刪除 CASCADE 刪除 Items 與 Details)
    // =========================================================================
    router.delete('/:planNo', async (req, res) => {
        const { planNo } = req.params;
        const pool = getDbPool();

        try {
            if (pool) {
                // 檢核是否有現場已簽到同仁
                const checkInReq = pool.request();
                checkInReq.input('planNo', sql.VarChar(15), planNo);
                const checkInRes = await checkInReq.query(`
                    SELECT COUNT(*) AS checkedInCount
                    FROM CustCPDSDispatchPlan_Detail d
                    INNER JOIN CustCPDSDispatchPlan_Item i ON i.ItemId = d.ItemId
                    WHERE i.PlanNo = @planNo AND d.CheckInStatus IN (1, 2)
                `);
                if (checkInRes.recordset[0].checkedInCount > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `該調度單現場已有 ${checkInRes.recordset[0].checkedInCount} 位同仁完成簽到，無法刪除！`
                    });
                }

                const request = pool.request();
                request.input('planNo', sql.VarChar(15), planNo);

                const result = await request.query(`
                    DELETE FROM CustCPDSDispatchPlan_Master
                    WHERE PlanNo = @planNo;
                    SELECT @@ROWCOUNT AS affectedRows;
                `);

                if (result.recordset[0].affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: `調度單 ${planNo} 不存在！`
                    });
                }

                return res.json({
                    success: true,
                    message: '調度單已成功刪除'
                });
            }

            // 本地備援
            const planIdx = memoryPlans.findIndex(p => p.planNo === planNo);
            if (planIdx === -1) {
                return res.status(404).json({ success: false, message: '調度單不存在' });
            }
            memoryPlans.splice(planIdx, 1);
            return res.json({ success: true, message: '調度單已成功刪除 (本地備援模式)' });
        } catch (err) {
            console.error('[Dispatch DELETE error]:', err);
            return res.status(500).json({
                success: false,
                message: `刪除調度單失敗: ${err.message}`
            });
        }
    });

    return router;
}

module.exports = {
    createDispatchRouter
};
