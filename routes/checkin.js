/**
 * =========================================================================
 *  跨廠人員調度與簽到系統 (CPDS) - 現場簽到業務模組 (routes/checkin.js)
 * =========================================================================
 */

const express = require('express');
const jwt = require('jsonwebtoken');

function createCheckinRouter({ getDbPool, sql, JWT_SECRET }) {
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
    // 工具函式：時間轉換與比對
    // -------------------------------------------------------------------------
    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return null;
        const parts = String(timeStr).trim().split(':');
        if (parts.length < 2) return null;
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function getCurrentTimeStr() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function formatTimeFromDb(val) {
        if (!val) return '';
        if (val instanceof Date) {
            const h = String(val.getUTCHours()).padStart(2, '0');
            const m = String(val.getUTCMinutes()).padStart(2, '0');
            return `${h}:${m}`;
        }
        const str = String(val).trim();
        if (str.includes(':')) {
            const parts = str.split(':');
            return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
        return str;
    }

    // -------------------------------------------------------------------------
    // 本地 Demo 記憶體備援資料集
    // -------------------------------------------------------------------------
    let memoryCheckinRecords = [
        {
            detailId: 101,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA02',
            sourceDeptName: 'A12-2廠',
            id: 'JM10001',
            name: '王小明',
            dispatchTime: '10:00~11:00',
            startTime: '10:00',
            endTime: '11:00',
            time: '10:02',
            status: '1',
            checkInMethod: 1,
            confirmUser: 'JM30448',
            reasonText: ''
        },
        {
            detailId: 102,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA06',
            sourceDeptName: 'A7-1廠',
            id: 'JM10105',
            name: '陳建志',
            dispatchTime: '08:00~11:00',
            startTime: '08:00',
            endTime: '11:00',
            time: '08:25',
            status: '2',
            checkInMethod: 1,
            confirmUser: 'JM30448',
            reasonText: ''
        },
        {
            detailId: 103,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA01',
            sourceDeptName: 'A12-1廠',
            id: 'JM10007',
            name: '趙大成',
            dispatchTime: '14:00~17:00',
            startTime: '14:00',
            endTime: '17:00',
            time: '',
            status: '0',
            checkInMethod: null,
            confirmUser: '',
            reasonText: ''
        },
        {
            detailId: 104,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA02',
            sourceDeptName: 'A12-2廠',
            id: 'JM10008',
            name: '錢小華',
            dispatchTime: '14:00~17:00',
            startTime: '14:00',
            endTime: '17:00',
            time: '',
            status: '0',
            checkInMethod: null,
            confirmUser: '',
            reasonText: ''
        },
        {
            detailId: 105,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA05',
            sourceDeptName: 'A5-2廠',
            id: 'JM10111',
            name: '孫立文',
            dispatchTime: '14:00~17:00',
            startTime: '14:00',
            endTime: '17:00',
            time: '',
            status: '3',
            checkInMethod: null,
            confirmUser: 'JM30448',
            reasonText: '請假'
        },
        {
            detailId: 106,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA01',
            sourceDeptName: 'A12-1廠',
            id: 'JM10020',
            name: '林雙段',
            dispatchTime: '08:00~12:00',
            startTime: '08:00',
            endTime: '12:00',
            time: '',
            status: '0',
            checkInMethod: null,
            confirmUser: '',
            reasonText: ''
        },
        {
            detailId: 107,
            targetDeptId: 'JMB03',
            targetDeptName: 'B10-3廠',
            dispatchDate: '2026-10-21',
            sourceDeptId: 'JMA01',
            sourceDeptName: 'A12-1廠',
            id: 'JM10020',
            name: '林雙段',
            dispatchTime: '13:00~17:00',
            startTime: '13:00',
            endTime: '17:00',
            time: '',
            status: '0',
            checkInMethod: null,
            confirmUser: '',
            reasonText: ''
        }
    ];

    // =========================================================================
    // 1. GET /records: 依目的廠別與日期查詢簽到清單
    // =========================================================================
    router.get('/records', async (req, res) => {
        try {
            let deptId = req.query.deptId || req.query.DeptId;
            let dispatchDate = req.query.dispatchDate || req.query.DispatchDate;
            if (!deptId) deptId = 'JMB03';
            if (!dispatchDate) {
                const today = new Date();
                dispatchDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            }

            // 正規化 YYYYMMDD -> YYYY-MM-DD
            if (/^\d{8}$/.test(dispatchDate)) {
                dispatchDate = `${dispatchDate.slice(0, 4)}-${dispatchDate.slice(4, 6)}-${dispatchDate.slice(6, 8)}`;
            }

            const pool = getDbPool();
            if (pool && sql) {
                const request = pool.request();
                request.input('deptId', sql.VarChar(10), deptId);
                request.input('dispatchDate', sql.Date, dispatchDate);

                const querySql = `
                    SELECT 
                        DetailId AS detailId,
                        TargetDeptId AS targetDeptId,
                        TargetDeptName AS targetDeptName,
                        CONVERT(VARCHAR(10), DispatchDate, 120) AS dispatchDate,
                        SourceDeptId AS sourceDeptId,
                        SourceDeptName AS dept,
                        EmpId AS id,
                        EmpName AS name,
                        CONVERT(VARCHAR(5), StartTime, 108) + '~' + CONVERT(VARCHAR(5), EndTime, 108) AS dispatchTime,
                        CONVERT(VARCHAR(5), StartTime, 108) AS startTime,
                        CONVERT(VARCHAR(5), EndTime, 108) AS endTime,
                        CONVERT(VARCHAR(5), CheckInTime, 108) AS time,
                        CAST(CheckInStatus AS VARCHAR(2)) AS status,
                        CheckInMethod AS checkInMethod,
                        ConfirmUser AS confirmUser,
                        ISNULL(AbnormalReason, '') AS reasonText
                    FROM vw_CPDS_DispatchDetail
                    WHERE TargetDeptId = @deptId AND DispatchDate = @dispatchDate
                    ORDER BY StartTime ASC, SourceDeptName ASC, EmpId ASC
                `;

                const result = await request.query(querySql);
                const records = result.recordset || [];
                const deptName = records.length > 0 ? records[0].targetDeptName : deptId;

                return res.json({
                    success: true,
                    deptId,
                    deptName,
                    dispatchDate,
                    data: records
                });
            }

            // 備援模式：篩選記憶體資料
            let filtered = memoryCheckinRecords.filter(r => r.targetDeptId === deptId && r.dispatchDate === dispatchDate);
            if (filtered.length === 0 && memoryCheckinRecords.length > 0) {
                // 自動產生當日測試展示資料
                filtered = memoryCheckinRecords.map(r => ({
                    ...r,
                    targetDeptId: deptId,
                    dispatchDate
                }));
            }

            res.json({
                success: true,
                deptId,
                deptName: filtered.length > 0 ? filtered[0].targetDeptName : deptId,
                dispatchDate,
                data: filtered
            });
        } catch (err) {
            console.error('[Checkin API] 查詢失敗:', err);
            res.status(500).json({ success: false, message: '查詢簽到清單失敗: ' + err.message });
        }
    });

    // =========================================================================
    // 2. POST /scan: 條碼刷卡/工號簽到 (支援多時段智慧匹配與嚴格時段邊界檢驗)
    // =========================================================================
    router.post('/scan', async (req, res) => {
        try {
            let { deptId, dispatchDate, empId, currentTime } = req.body;
            const currentUser = (req.user && req.user.empId ? req.user.empId : 'SYSTEM').slice(0, 10);

            if (!empId) {
                return res.status(400).json({ success: false, message: '請提供工號！' });
            }

            // 正規化 YYYYMMDD -> YYYY-MM-DD
            if (dispatchDate && /^\d{8}$/.test(dispatchDate)) {
                dispatchDate = `${dispatchDate.slice(0, 4)}-${dispatchDate.slice(4, 6)}-${dispatchDate.slice(6, 8)}`;
            }

            const cleanEmpId = empId.trim().toUpperCase();
            const nowTimeStr = currentTime || getCurrentTimeStr();
            const nowMinutes = parseTimeToMinutes(nowTimeStr);

            const pool = getDbPool();
            if (pool && sql) {
                const checkReq = pool.request();
                checkReq.input('deptId', sql.VarChar(10), deptId);
                checkReq.input('dispatchDate', sql.Date, dispatchDate);
                checkReq.input('empId', sql.VarChar(10), cleanEmpId);

                const checkRes = await checkReq.query(`
                    SELECT DetailId, CheckInStatus, StartTime, EndTime, EmpName
                    FROM vw_CPDS_DispatchDetail
                    WHERE TargetDeptId = @deptId AND DispatchDate = @dispatchDate AND UPPER(EmpId) = @empId
                    ORDER BY StartTime ASC, DetailId ASC
                `);

                if (checkRes.recordset.length === 0) {
                    return res.status(404).json({
                        success: false,
                        type: 'NOT_FOUND',
                        message: `發生錯誤<br>工號 ${cleanEmpId}<br>未於調度名單中`
                    });
                }

                const allRecords = checkRes.recordset;
                const empName = allRecords[0].EmpName;

                // 排除已標記異常之明細 (CheckInStatus = 3)
                const activeRecords = allRecords.filter(r => r.CheckInStatus !== 3);
                if (activeRecords.length === 0) {
                    return res.status(400).json({
                        success: false,
                        type: 'ABNORMAL_RECORD',
                        message: `發生錯誤<br>${cleanEmpId} ${empName}<br>今日調度明細已全數標記異常`
                    });
                }

                const parseSlot = (row) => {
                    const sStr = formatTimeFromDb(row.StartTime);
                    const eStr = formatTimeFromDb(row.EndTime);
                    const sMin = parseTimeToMinutes(sStr);
                    const eMin = parseTimeToMinutes(eStr);
                    return { sStr, eStr, sMin, eMin };
                };

                // 檢驗有效窗口：嚴格限制在「調度時段開始後 ~ 調度時段結束前」(nowMinutes >= startMin && nowMinutes <= endMin)
                const matchingSlots = activeRecords.filter(row => {
                    const { sMin, eMin } = parseSlot(row);
                    return sMin !== null && eMin !== null && nowMinutes >= sMin && nowMinutes <= eMin;
                });

                if (matchingSlots.length === 0) {
                    const slotListStr = activeRecords.map(row => {
                        const { sStr, eStr } = parseSlot(row);
                        return `${sStr}~${eStr}`;
                    }).join(', ');

                    return res.status(400).json({
                        success: false,
                        type: 'TIME_ERROR',
                        message: `發生錯誤<br>${cleanEmpId} ${empName}<br>應於調度時間內（時段開始後~結束前）簽到（今日時段: ${slotListStr}）`
                    });
                }

                // 優先比對尚未完成簽到 (CheckInStatus === 0) 之明細
                const targetRow = matchingSlots.find(row => row.CheckInStatus === 0);

                if (!targetRow) {
                    return res.status(400).json({
                        success: false,
                        type: 'DUPLICATE',
                        message: `重複掃描<br>${cleanEmpId} ${empName}<br>已略過`
                    });
                }

                const { sMin } = parseSlot(targetRow);
                const onTimeLimit = sMin + 10;
                const newStatus = nowMinutes <= onTimeLimit ? 1 : 2;

                const updateReq = pool.request();
                updateReq.input('detailId', sql.BigInt, targetRow.DetailId);
                updateReq.input('status', sql.TinyInt, newStatus);
                updateReq.input('method', sql.TinyInt, 1);
                updateReq.input('confirmUser', sql.VarChar(10), currentUser);

                await updateReq.query(`
                    UPDATE CustCPDSDispatchPlan_Detail
                    SET CheckInStatus = @status,
                        CheckInTime = GETDATE(),
                        CheckInMethod = @method,
                        ConfirmUser = @confirmUser,
                        AbnormalReason = NULL,
                        UpdateTime = GETDATE()
                    WHERE DetailId = @detailId
                `);

                return res.json({
                    success: true,
                    type: newStatus === 1 ? 'SUCCESS_ON_TIME' : 'SUCCESS_LATE',
                    status: newStatus,
                    statusName: newStatus === 1 ? '已簽到' : '逾期簽到',
                    empId: cleanEmpId,
                    empName: empName,
                    detailId: targetRow.DetailId,
                    time: nowTimeStr,
                    message: newStatus === 1 
                        ? `✓ 簽到成功<br>${cleanEmpId} ${empName}<br>簽到時間 ${nowTimeStr}`
                        : `✓ 逾期簽到成功<br>${cleanEmpId} ${empName}<br>簽到時間 ${nowTimeStr}`
                });
            }

            // 備援模式
            let userRecords = memoryCheckinRecords.filter(r => 
                r.targetDeptId === deptId && 
                r.dispatchDate === dispatchDate && 
                r.id.toUpperCase() === cleanEmpId
            );

            if (userRecords.length === 0) {
                userRecords = memoryCheckinRecords.filter(r => r.id.toUpperCase() === cleanEmpId);
            }

            if (userRecords.length === 0) {
                return res.status(404).json({
                    success: false,
                    type: 'NOT_FOUND',
                    message: `發生錯誤<br>工號 ${cleanEmpId}<br>未於調度名單中`
                });
            }

            const empName = userRecords[0].name;
            const activeRecords = userRecords.filter(r => String(r.status) !== '3');

            if (activeRecords.length === 0) {
                return res.status(400).json({
                    success: false,
                    type: 'ABNORMAL_RECORD',
                    message: `發生錯誤<br>${cleanEmpId} ${empName}<br>今日調度明細已全數標記異常`
                });
            }

            const parseMemorySlot = (rec) => {
                const sStr = rec.startTime || (rec.dispatchTime ? rec.dispatchTime.split('~')[0] : '08:00');
                const eStr = rec.endTime || (rec.dispatchTime ? rec.dispatchTime.split('~')[1] : '17:00');
                const sMin = parseTimeToMinutes(sStr);
                const eMin = parseTimeToMinutes(eStr);
                return { sStr, eStr, sMin, eMin };
            };

            const matchingSlots = activeRecords.filter(rec => {
                const { sMin, eMin } = parseMemorySlot(rec);
                return sMin !== null && eMin !== null && nowMinutes >= sMin && nowMinutes <= eMin;
            });

            if (matchingSlots.length === 0) {
                const slotListStr = activeRecords.map(r => {
                    const { sStr, eStr } = parseMemorySlot(r);
                    return `${sStr}~${eStr}`;
                }).join(', ');

                return res.status(400).json({
                    success: false,
                    type: 'TIME_ERROR',
                    message: `發生錯誤<br>${cleanEmpId} ${empName}<br>應於調度時間內（時段開始後~結束前）簽到（今日時段: ${slotListStr}）`
                });
            }

            const targetRecord = matchingSlots.find(r => String(r.status) === '0');
            if (!targetRecord) {
                return res.status(400).json({
                    success: false,
                    type: 'DUPLICATE',
                    message: `重複掃描<br>${cleanEmpId} ${empName}<br>已略過`
                });
            }

            const { sMin } = parseMemorySlot(targetRecord);
            const onTimeLimit = sMin + 10;
            const newStatus = nowMinutes <= onTimeLimit ? '1' : '2';

            targetRecord.status = newStatus;
            targetRecord.time = nowTimeStr;
            targetRecord.checkInMethod = 1;
            targetRecord.confirmUser = currentUser;
            targetRecord.reasonText = '';

            return res.json({
                success: true,
                type: newStatus === '1' ? 'SUCCESS_ON_TIME' : 'SUCCESS_LATE',
                status: parseInt(newStatus, 10),
                statusName: newStatus === '1' ? '已簽到' : '逾期簽到',
                empId: targetRecord.id,
                empName: targetRecord.name,
                detailId: targetRecord.detailId,
                time: nowTimeStr,
                message: newStatus === '1' 
                    ? `✓ 簽到成功<br>${targetRecord.id} ${targetRecord.name}<br>簽到時間 ${nowTimeStr}`
                    : `✓ 逾期簽到成功<br>${targetRecord.id} ${targetRecord.name}<br>簽到時間 ${nowTimeStr}`
            });
        } catch (err) {
            console.error('[Checkin API] 刷碼失敗:', err);
            res.status(500).json({ success: false, message: '簽到失敗: ' + err.message });
        }
    });

    // =========================================================================
    // 3. POST /manager & POST /manager-checkin: 主管代簽 (支援 detailId 或 empId 智慧匹配)
    // =========================================================================
    const handleManagerCheckin = async (req, res) => {
        try {
            const { detailId, empId, deptId, dispatchDate, currentTime } = req.body;
            const currentUser = (req.user && req.user.empId ? req.user.empId : 'SYSTEM').slice(0, 10);

            if (!detailId && !empId) {
                return res.status(400).json({ success: false, message: '請指定調派明細編號或員工工號！' });
            }

            const nowTimeStr = currentTime || getCurrentTimeStr();
            const nowMinutes = parseTimeToMinutes(nowTimeStr);

            const pool = getDbPool();
            if (pool && sql) {
                let row = null;

                if (detailId) {
                    const reqRow = pool.request();
                    reqRow.input('detailId', sql.BigInt, detailId);
                    const rowRes = await reqRow.query(`
                        SELECT DetailId, StartTime, EndTime, EmpId, EmpName, CheckInStatus
                        FROM vw_CPDS_DispatchDetail
                        WHERE DetailId = @detailId
                    `);
                    if (rowRes.recordset.length > 0) {
                        row = rowRes.recordset[0];
                    }
                } else if (empId) {
                    const cleanEmp = empId.trim().toUpperCase();
                    const reqRow = pool.request();
                    reqRow.input('empId', sql.VarChar(10), cleanEmp);
                    reqRow.input('deptId', sql.VarChar(10), deptId || null);
                    reqRow.input('dispatchDate', sql.Date, dispatchDate || null);

                    const rowRes = await reqRow.query(`
                        SELECT DetailId, StartTime, EndTime, EmpId, EmpName, CheckInStatus
                        FROM vw_CPDS_DispatchDetail
                        WHERE UPPER(EmpId) = @empId
                          AND (@deptId IS NULL OR TargetDeptId = @deptId)
                          AND (@dispatchDate IS NULL OR DispatchDate = @dispatchDate)
                          AND CheckInStatus <> 3
                        ORDER BY StartTime ASC, DetailId ASC
                    `);

                    if (rowRes.recordset.length > 0) {
                        const candidates = rowRes.recordset;
                        row = candidates.find(c => {
                            const sMin = parseTimeToMinutes(formatTimeFromDb(c.StartTime));
                            const eMin = parseTimeToMinutes(formatTimeFromDb(c.EndTime));
                            return sMin !== null && eMin !== null && nowMinutes >= sMin && nowMinutes <= eMin && c.CheckInStatus === 0;
                        }) || candidates.find(c => c.CheckInStatus === 0) || candidates[0];
                    }
                }

                if (!row) {
                    return res.status(404).json({ success: false, message: '找不到該調派記錄！' });
                }

                const startStr = formatTimeFromDb(row.StartTime);
                const startMin = parseTimeToMinutes(startStr);
                const newStatus = (startMin !== null && nowMinutes > (startMin + 10)) ? 2 : 1;

                const updateReq = pool.request();
                updateReq.input('detailId', sql.BigInt, row.DetailId);
                updateReq.input('status', sql.TinyInt, newStatus);
                updateReq.input('confirmUser', sql.VarChar(10), currentUser);

                await updateReq.query(`
                    UPDATE CustCPDSDispatchPlan_Detail
                    SET CheckInStatus = @status,
                        CheckInTime = GETDATE(),
                        CheckInMethod = 2,
                        ConfirmUser = @confirmUser,
                        AbnormalReason = NULL,
                        UpdateTime = GETDATE()
                    WHERE DetailId = @detailId
                `);

                return res.json({
                    success: true,
                    status: newStatus,
                    statusName: newStatus === 1 ? '已簽到' : '逾期簽到',
                    empId: row.EmpId,
                    empName: row.EmpName,
                    detailId: row.DetailId,
                    time: nowTimeStr,
                    message: newStatus === 1 
                        ? `✓ 主管代簽成功<br>${row.EmpId} ${row.EmpName}<br>簽到時間 ${nowTimeStr}`
                        : `✓ 逾期簽到成功（主管代簽）<br>${row.EmpId} ${row.EmpName}<br>簽到時間 ${nowTimeStr}`
                });
            }

            // 備援模式
            let item = null;
            if (detailId) {
                item = memoryCheckinRecords.find(r => 
                    r.detailId === Number(detailId) || String(r.detailId) === String(detailId) || r.id === String(detailId)
                );
            } else if (empId) {
                const cleanEmp = empId.trim().toUpperCase();
                const candidates = memoryCheckinRecords.filter(r => 
                    r.id.toUpperCase() === cleanEmp && String(r.status) !== '3'
                );
                if (candidates.length > 0) {
                    item = candidates.find(c => {
                        const sMin = parseTimeToMinutes(c.startTime || '08:00');
                        const eMin = parseTimeToMinutes(c.endTime || '17:00');
                        return sMin !== null && eMin !== null && nowMinutes >= sMin && nowMinutes <= eMin && String(c.status) === '0';
                    }) || candidates.find(c => String(c.status) === '0') || candidates[0];
                }
            }

            if (!item) {
                return res.status(404).json({ success: false, message: '找不到該調派記錄！' });
            }

            const startMin = parseTimeToMinutes(item.startTime || '10:00');
            const newStatus = (startMin !== null && nowMinutes > (startMin + 10)) ? '2' : '1';
            item.status = newStatus;
            item.time = nowTimeStr;
            item.checkInMethod = 2;
            item.confirmUser = currentUser;
            item.reasonText = '';

            return res.json({
                success: true,
                status: parseInt(newStatus, 10),
                statusName: newStatus === '1' ? '已簽到' : '逾期簽到',
                empId: item.id,
                empName: item.name,
                detailId: item.detailId,
                time: nowTimeStr,
                message: newStatus === '1' 
                    ? `✓ 主管代簽成功<br>${item.id} ${item.name}<br>簽到時間 ${nowTimeStr}`
                    : `✓ 逾期簽到成功（主管代簽）<br>${item.id} ${item.name}<br>簽到時間 ${nowTimeStr}`
            });
        } catch (err) {
            console.error('[Checkin API] 主管代簽失敗:', err);
            res.status(500).json({ success: false, message: '主管代簽失敗: ' + err.message });
        }
    };

    router.post('/manager', handleManagerCheckin);
    router.post('/manager-checkin', handleManagerCheckin);

    // =========================================================================
    // 4. POST /abnormal: 標記異常 / 復原待簽到
    // =========================================================================
    router.post('/abnormal', async (req, res) => {
        try {
            const { detailId, action, reason } = req.body;
            const currentUser = req.user.empId || 'SYSTEM';

            if (!detailId) {
                return res.status(400).json({ success: false, message: '請指定調派明細編號！' });
            }

            const isMark = action === 'MARK';
            const newStatus = isMark ? 3 : 0;

            const pool = getDbPool();
            if (pool && sql) {
                const updateReq = pool.request();
                updateReq.input('detailId', sql.BigInt, detailId);
                updateReq.input('status', sql.TinyInt, newStatus);
                updateReq.input('confirmUser', sql.VarChar(10), currentUser);
                updateReq.input('reason', sql.NVarChar(100), isMark ? (reason || '') : null);

                await updateReq.query(`
                    UPDATE CustCPDSDispatchPlan_Detail
                    SET CheckInStatus = @status,
                        CheckInTime = NULL,
                        CheckInMethod = NULL,
                        AbnormalReason = @reason,
                        ConfirmUser = CASE WHEN @status = 3 THEN @confirmUser ELSE NULL END,
                        UpdateTime = GETDATE()
                    WHERE DetailId = @detailId
                `);

                return res.json({
                    success: true,
                    status: newStatus,
                    message: isMark ? '已標記異常並移至異常標記清單' : '已復原狀態為待簽到'
                });
            }

            // 備援模式
            const item = memoryCheckinRecords.find(r => r.detailId === Number(detailId) || String(r.detailId) === String(detailId) || r.id === String(detailId));
            if (!item) {
                return res.status(404).json({ success: false, message: '找不到該調派記錄！' });
            }

            item.status = String(newStatus);
            item.time = '';
            item.checkInMethod = null;
            item.reasonText = isMark ? (reason || '') : '';
            item.confirmUser = isMark ? currentUser : '';

            return res.json({
                success: true,
                status: newStatus,
                message: isMark ? '已標記異常並移至異常標記清單' : '已復原狀態為待簽到'
            });
        } catch (err) {
            console.error('[Checkin API] 異常狀態切換失敗:', err);
            res.status(500).json({ success: false, message: '處理異常狀態失敗: ' + err.message });
        }
    });

    // =========================================================================
    // 5. POST /abnormal-reasons: 儲存所有異常原因
    // =========================================================================
    router.post('/abnormal-reasons', async (req, res) => {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.json({ success: true, count: 0, message: '無需要儲存之項目' });
            }

            const pool = getDbPool();
            if (pool && sql) {
                for (const item of items) {
                    const updateReq = pool.request();
                    updateReq.input('detailId', sql.BigInt, item.detailId);
                    updateReq.input('reason', sql.NVarChar(100), item.reason || '');
                    await updateReq.query(`
                        UPDATE CustCPDSDispatchPlan_Detail
                        SET AbnormalReason = @reason, UpdateTime = GETDATE()
                        WHERE DetailId = @detailId AND CheckInStatus = 3
                    `);
                }
            } else {
                for (const item of items) {
                    const rec = memoryCheckinRecords.find(r => r.detailId === Number(item.detailId) || String(r.detailId) === String(item.detailId) || r.id === String(item.detailId));
                    if (rec) {
                        rec.reasonText = item.reason || '';
                    }
                }
            }

            res.json({
                success: true,
                count: items.length,
                message: '已成功儲存所有異常原因記錄！'
            });
        } catch (err) {
            console.error('[Checkin API] 儲存異常原因失敗:', err);
            res.status(500).json({ success: false, message: '儲存異常原因失敗: ' + err.message });
        }
    });

    return router;
}

module.exports = { createCheckinRouter };
