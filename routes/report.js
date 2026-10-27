/**
 * =========================================================================
 *  跨廠人員調度與簽到系統 (CPDS) - 報表查詢業務模組 (routes/report.js)
 * =========================================================================
 */

const express = require('express');
const jwt = require('jsonwebtoken');

function createReportRouter({ getDbPool, sql, JWT_SECRET }) {
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

    router.use(authenticateToken);

    // -------------------------------------------------------------------------
    // 本地 Demo 記憶體備援資料集
    // -------------------------------------------------------------------------
    const memoryReportRecords = [];

    // =========================================================================
    // GET /: 報表清單查詢
    // =========================================================================
    router.get('/', async (req, res) => {
        try {
            const {
                startDate,
                endDate,
                sourceDeptId,
                targetDeptId,
                status,
                keyword,
                startTime,
                endTime
            } = req.query;

            const pool = getDbPool();
            if (pool && sql) {
                const request = pool.request();
                let whereClauses = ['1=1'];

                if (startDate) {
                    request.input('startDate', sql.Date, startDate);
                    whereClauses.push('DispatchDate >= @startDate');
                }
                if (endDate) {
                    request.input('endDate', sql.Date, endDate);
                    whereClauses.push('DispatchDate <= @endDate');
                }
                if (sourceDeptId) {
                    const depts = sourceDeptId.split(',').map(s => s.trim()).filter(Boolean);
                    if (depts.length > 0) {
                        const deptParams = depts.map((d, i) => {
                            const pName = `sDept_${i}`;
                            request.input(pName, sql.NVarChar(50), d);
                            return `@${pName}`;
                        });
                        whereClauses.push(`(SourceDeptId IN (${deptParams.join(',')}) OR SourceDeptName IN (${deptParams.join(',')}))`);
                    }
                }
                if (targetDeptId) {
                    const depts = targetDeptId.split(',').map(s => s.trim()).filter(Boolean);
                    if (depts.length > 0) {
                        const deptParams = depts.map((d, i) => {
                            const pName = `tDept_${i}`;
                            request.input(pName, sql.NVarChar(50), d);
                            return `@${pName}`;
                        });
                        whereClauses.push(`(TargetDeptId IN (${deptParams.join(',')}) OR TargetDeptName IN (${deptParams.join(',')}))`);
                    }
                }
                if (status) {
                    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
                    if (statuses.length > 0) {
                        const statusParams = statuses.map((st, i) => {
                            const pName = `st_${i}`;
                            request.input(pName, sql.Int, parseInt(st, 10));
                            return `@${pName}`;
                        });
                        whereClauses.push(`DisplayStatus IN (${statusParams.join(',')})`);
                    }
                }
                if (startTime && endTime) {
                    request.input('startTime', sql.VarChar(10), startTime.trim());
                    request.input('endTime', sql.VarChar(10), endTime.trim());
                    whereClauses.push('(StartTime < @endTime AND EndTime > @startTime)');
                } else if (startTime) {
                    request.input('startTime', sql.VarChar(10), startTime.trim());
                    whereClauses.push('EndTime > @startTime');
                } else if (endTime) {
                    request.input('endTime', sql.VarChar(10), endTime.trim());
                    whereClauses.push('StartTime < @endTime');
                }
                if (keyword && keyword.trim()) {
                    request.input('keyword', sql.NVarChar(100), `%${keyword.trim()}%`);
                    whereClauses.push(`(
                        EmpId LIKE @keyword
                        OR EmpName LIKE @keyword
                        OR PlanNo LIKE @keyword
                        OR AbnormalReason LIKE @keyword
                        OR SourceDeptName LIKE @keyword
                        OR TargetDeptName LIKE @keyword
                    )`);
                }

                const querySql = `
                    SELECT 
                        DetailId AS detailId,
                        PlanNo AS planNo,
                        ItemId AS itemId,
                        CONVERT(VARCHAR(10), DispatchDate, 120) AS dispatchDate,
                        SourceDeptId AS sourceDeptId,
                        SourceDeptName AS sourceDeptName,
                        TargetDeptId AS targetDeptId,
                        TargetDeptName AS targetDeptName,
                        EmpId AS empId,
                        EmpName AS empName,
                        CONVERT(VARCHAR(5), StartTime, 108) + '~' + CONVERT(VARCHAR(5), EndTime, 108) AS dispatchTimeRange,
                        CONVERT(VARCHAR(5), StartTime, 108) AS startTime,
                        CONVERT(VARCHAR(5), EndTime, 108) AS endTime,
                        CONVERT(VARCHAR(5), CheckInTime, 108) AS checkinTime,
                        DisplayStatus AS status,
                        DisplayStatusName AS statusName,
                        ConfirmUserName AS receiverName,
                        AbnormalReason AS anomalyNote
                    FROM vw_CPDS_DispatchDetail
                    WHERE ${whereClauses.join(' AND ')}
                    ORDER BY 
                        DispatchDate DESC, 
                        SourceDeptName ASC, 
                        TargetDeptName ASC, 
                        DisplayStatus ASC
                `;

                const result = await request.query(querySql);
                return res.json({
                    success: true,
                    total: result.recordset.length,
                    data: result.recordset
                });
            }

            // -----------------------------------------------------------------
            // 備援模式：篩選記憶體資料集
            // -----------------------------------------------------------------
            let filtered = [...memoryReportRecords];

            if (startDate) {
                filtered = filtered.filter(r => r.dispatchDate >= startDate);
            }
            if (endDate) {
                filtered = filtered.filter(r => r.dispatchDate <= endDate);
            }
            if (sourceDeptId) {
                const depts = sourceDeptId.split(',').map(s => s.trim()).filter(Boolean);
                if (depts.length > 0) {
                    filtered = filtered.filter(r => depts.includes(r.sourceDeptId) || depts.includes(r.sourceDeptName));
                }
            }
            if (targetDeptId) {
                const depts = targetDeptId.split(',').map(s => s.trim()).filter(Boolean);
                if (depts.length > 0) {
                    filtered = filtered.filter(r => depts.includes(r.targetDeptId) || depts.includes(r.targetDeptName));
                }
            }
            if (status) {
                const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
                if (statuses.length > 0) {
                    filtered = filtered.filter(r => statuses.includes(String(r.status)));
                }
            }
            if (keyword && keyword.trim()) {
                const kw = keyword.trim().toLowerCase();
                filtered = filtered.filter(r =>
                    (r.empId && r.empId.toLowerCase().includes(kw)) ||
                    (r.empName && r.empName.toLowerCase().includes(kw)) ||
                    (r.planNo && r.planNo.toLowerCase().includes(kw)) ||
                    (r.anomalyNote && r.anomalyNote.toLowerCase().includes(kw)) ||
                    (r.sourceDeptName && r.sourceDeptName.toLowerCase().includes(kw)) ||
                    (r.targetDeptName && r.targetDeptName.toLowerCase().includes(kw))
                );
            }
            if (startTime && endTime) {
                filtered = filtered.filter(r => {
                    const rStart = r.startTime || (r.dispatchTimeRange ? r.dispatchTimeRange.split('~')[0] : '');
                    const rEnd = r.endTime || (r.dispatchTimeRange ? r.dispatchTimeRange.split('~')[1] : '');
                    return rStart < endTime && rEnd > startTime;
                });
            } else if (startTime) {
                filtered = filtered.filter(r => {
                    const rEnd = r.endTime || (r.dispatchTimeRange ? r.dispatchTimeRange.split('~')[1] : '');
                    return rEnd > startTime;
                });
            } else if (endTime) {
                filtered = filtered.filter(r => {
                    const rStart = r.startTime || (r.dispatchTimeRange ? r.dispatchTimeRange.split('~')[0] : '');
                    return rStart < endTime;
                });
            }

            // 預設排序：調度日期 DESC ➔ 來源廠 ASC ➔ 目的廠 ASC ➔ 狀態 ASC (排除工號)
            filtered.sort((a, b) => {
                // 1. 調度日期 DESC
                if (a.dispatchDate !== b.dispatchDate) {
                    return b.dispatchDate.localeCompare(a.dispatchDate);
                }
                // 2. 來源廠 ASC
                const srcCmp = (a.sourceDeptName || '').localeCompare(b.sourceDeptName || '', 'zh-Hant');
                if (srcCmp !== 0) return srcCmp;
                // 3. 目的廠 ASC
                const tgtCmp = (a.targetDeptName || '').localeCompare(b.targetDeptName || '', 'zh-Hant');
                if (tgtCmp !== 0) return tgtCmp;
                // 4. 狀態 ASC
                return Number(a.status) - Number(b.status);
            });

            return res.json({
                success: true,
                total: filtered.length,
                data: filtered
            });

        } catch (error) {
            console.error('[Report API] 查詢失敗:', error);
            res.status(500).json({
                success: false,
                message: '伺服器內部錯誤，無法載入報表資料',
                error: error.message
            });
        }
    });

    return router;
}

module.exports = { createReportRouter };
