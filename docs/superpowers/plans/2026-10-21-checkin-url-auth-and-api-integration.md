# 現場簽到作業 (checkin.html) 廠別身分帶入、URL 參數解析與簽到 API 串接實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 `checkin.html` 現場簽到作業功能串接，包含身分登入廠別帶入、URL 參數相容解析切換、自動 Focus 工號輸入框、前後端簽到 API 與狀態精準判定（0 待簽到、1 已簽到、2 逾期簽到、3 異常、4 已逾期）及 LocalDB/Demo 備援雙軌支援。

**Architecture:**
1. 後端新增獨立路由模組 `routes/checkin.js`，於 `server.js` 掛載至 `/api/checkin`，實作 records、scan、manager、abnormal 等端點，支援 LocalDB 資料庫與 Demo 記憶體雙軌運作。
2. 前端 `checkin.html` 整合 `Auth.requireAuth()` 守衛，正規化解析 `?deptId=...&&DispatchDate=...`，動態帶入廠別與日期，並維持自動 Focus `#barcodeInput`。
3. 實作五大狀態比對與「已逾期(4)」動態渲染，並串接真實 API 進行掃碼簽到、主管代簽、異常標記與異常原因批次儲存。

**Tech Stack:** Node.js, Express.js, MSSQL (msnodesqlv8), HTML5, Bootstrap 5.3, Bootstrap Table 1.22, jQuery 3.7.

## Global Constraints
- 狀態代碼規格：
  - `0`: 待簽到（未到結束時間前）
  - `1`: 已簽到（開始前 10 分鐘至開始後 10 分鐘內）
  - `2`: 逾期簽到（開始後 10 分鐘至結束前）
  - `3`: 異常（主管手動標記並填寫原因）
  - `4`: 已逾期（僅前端動態顯示用，不變更資料庫狀態；當日超過結束時間或歷史單據一律標記）
- 簽到窗口限制：提早超過 10 分鐘或超過結束時間，阻擋簽到並顯示「應在調度時間內簽到」。
- URL 格式相容：支援 `&&`、`&` 及 `YYYYMMDD`（如 `20261020`）與 `YYYY-MM-DD` 格式。
- 自動 Focus：進入頁面與每次掃碼完成後，必須自動聚焦於 `#barcodeInput`。

---

### Task 1: 建立後端簽到路由模組 `routes/checkin.js` 並於 `server.js` 掛載

**Files:**
- Create: `routes/checkin.js`
- Modify: `server.js:475-485`

**Interfaces:**
- Produces: `createCheckinRouter({ getDbPool, sql, JWT_SECRET })`
- Produces: API 端點
  - `GET /api/checkin/records`
  - `POST /api/checkin/scan`
  - `POST /api/checkin/manager`
  - `POST /api/checkin/abnormal`
  - `POST /api/checkin/abnormal-reasons`

- [ ] **Step 1: 建立 `routes/checkin.js` 模組**

```javascript
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
        }
    ];

    // =========================================================================
    // 1. GET /records: 依目的廠別與日期查詢簽到清單
    // =========================================================================
    router.get('/records', async (req, res) => {
        try {
            let { deptId, dispatchDate } = req.query;
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
                request.input('deptId', sql.VarChar(50), deptId);
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
    // 2. POST /scan: 條碼刷卡/工號簽到
    // =========================================================================
    router.post('/scan', async (req, res) => {
        try {
            let { deptId, dispatchDate, empId, currentTime } = req.body;
            const currentUser = req.user.empId || 'SYSTEM';

            if (!empId) {
                return res.status(400).json({ success: false, message: '請提供工號！' });
            }

            const cleanEmpId = empId.trim().toUpperCase();
            const nowTimeStr = currentTime || getCurrentTimeStr();
            const nowMinutes = parseTimeToMinutes(nowTimeStr);

            const pool = getDbPool();
            if (pool && sql) {
                const checkReq = pool.request();
                checkReq.input('deptId', sql.VarChar(50), deptId);
                checkReq.input('dispatchDate', sql.Date, dispatchDate);
                checkReq.input('empId', sql.VarChar(10), cleanEmpId);

                const checkRes = await checkReq.query(`
                    SELECT TOP 1 DetailId, CheckInStatus, StartTime, EndTime, EmpName
                    FROM vw_CPDS_DispatchDetail
                    WHERE TargetDeptId = @deptId AND DispatchDate = @dispatchDate AND UPPER(EmpId) = @empId
                `);

                if (checkRes.recordset.length === 0) {
                    return res.status(404).json({
                        success: false,
                        type: 'NOT_FOUND',
                        message: `發生錯誤<br>工號 ${cleanEmpId}<br>未於調度名單中`
                    });
                }

                const row = checkRes.recordset[0];

                if (row.CheckInStatus === 1 || row.CheckInStatus === 2) {
                    return res.status(400).json({
                        success: false,
                        type: 'DUPLICATE',
                        message: `重複掃描<br>${cleanEmpId} ${row.EmpName}<br>已略過`
                    });
                }

                // 時間檢驗 (StartTime / EndTime 為 Date 物件或時間字串)
                const startStr = row.StartTime instanceof Date ? 
                    `${String(row.StartTime.getUTCHours()).padStart(2, '0')}:${String(row.StartTime.getUTCMinutes()).padStart(2, '0')}` : 
                    String(row.StartTime).slice(0, 5);
                const endStr = row.EndTime instanceof Date ? 
                    `${String(row.EndTime.getUTCHours()).padStart(2, '0')}:${String(row.EndTime.getUTCMinutes()).padStart(2, '0')}` : 
                    String(row.EndTime).slice(0, 5);

                const startMin = parseTimeToMinutes(startStr);
                const endMin = parseTimeToMinutes(endStr);

                if (startMin !== null && endMin !== null) {
                    const windowStart = startMin - 10;
                    const onTimeLimit = startMin + 10;
                    const windowEnd = endMin;

                    if (nowMinutes < windowStart || nowMinutes > windowEnd) {
                        return res.status(400).json({
                            success: false,
                            type: 'TIME_ERROR',
                            message: `發生錯誤<br>${cleanEmpId} ${row.EmpName}<br>應在 調度時間內 簽到`
                        });
                    }

                    const newStatus = nowMinutes <= onTimeLimit ? 1 : 2;

                    const updateReq = pool.request();
                    updateReq.input('detailId', sql.BigInt, row.DetailId);
                    updateReq.input('status', sql.TinyInt, newStatus);
                    updateReq.input('method', sql.TinyInt, 1);
                    updateReq.input('confirmUser', sql.VarChar(10), currentUser);

                    await updateReq.query(`
                        UPDATE CustCPDSDispatchPlan_Detail
                        SET CheckInStatus = @status,
                            CheckInTime = GETDATE(),
                            CheckInMethod = @method,
                            ConfirmUser = @confirmUser,
                            UpdateTime = GETDATE()
                        WHERE DetailId = @detailId
                    `);

                    return res.json({
                        success: true,
                        type: newStatus === 1 ? 'SUCCESS_ON_TIME' : 'SUCCESS_LATE',
                        status: newStatus,
                        statusName: newStatus === 1 ? '已簽到' : '逾期簽到',
                        empId: cleanEmpId,
                        empName: row.EmpName,
                        time: nowTimeStr,
                        message: newStatus === 1 
                            ? `✓ 簽到成功<br>${cleanEmpId} ${row.EmpName}<br>簽到時間 ${nowTimeStr}`
                            : `✓ 逾期簽到成功<br>${cleanEmpId} ${row.EmpName}<br>簽到時間 ${nowTimeStr}`
                    });
                }
            }

            // 備援模式
            const item = memoryCheckinRecords.find(r => 
                r.targetDeptId === deptId && r.dispatchDate === dispatchDate && r.id.toUpperCase() === cleanEmpId
            );

            if (!item) {
                return res.status(404).json({
                    success: false,
                    type: 'NOT_FOUND',
                    message: `發生錯誤<br>工號 ${cleanEmpId}<br>未於調度名單中`
                });
            }

            if (item.status === '1' || item.status === '2') {
                return res.status(400).json({
                    success: false,
                    type: 'DUPLICATE',
                    message: `重複掃描<br>${item.id} ${item.name}<br>已略過`
                });
            }

            const startMin = parseTimeToMinutes(item.startTime || '10:00');
            const endMin = parseTimeToMinutes(item.endTime || '12:00');
            const windowStart = startMin - 10;
            const onTimeLimit = startMin + 10;
            const windowEnd = endMin;

            if (nowMinutes < windowStart || nowMinutes > windowEnd) {
                return res.status(400).json({
                    success: false,
                    type: 'TIME_ERROR',
                    message: `發生錯誤<br>${item.id} ${item.name}<br>應在 調度時間內 簽到`
                });
            }

            const newStatus = nowMinutes <= onTimeLimit ? '1' : '2';
            item.status = newStatus;
            item.time = nowTimeStr;
            item.checkInMethod = 1;
            item.confirmUser = currentUser;

            return res.json({
                success: true,
                type: newStatus === '1' ? 'SUCCESS_ON_TIME' : 'SUCCESS_LATE',
                status: parseInt(newStatus, 10),
                statusName: newStatus === '1' ? '已簽到' : '逾期簽到',
                empId: item.id,
                empName: item.name,
                time: nowTimeStr,
                message: newStatus === '1' 
                    ? `✓ 簽到成功<br>${item.id} ${item.name}<br>簽到時間 ${nowTimeStr}`
                    : `✓ 逾期簽到成功<br>${item.id} ${item.name}<br>簽到時間 ${nowTimeStr}`
            });
        } catch (err) {
            console.error('[Checkin API] 刷碼失敗:', err);
            res.status(500).json({ success: false, message: '簽到失敗: ' + err.message });
        }
    });

    // =========================================================================
    // 3. POST /manager: 主管代簽
    // =========================================================================
    router.post('/manager', async (req, res) => {
        try {
            const { detailId, currentTime } = req.body;
            const currentUser = req.user.empId || 'SYSTEM';

            if (!detailId) {
                return res.status(400).json({ success: false, message: '請指定調派明細編號！' });
            }

            const nowTimeStr = currentTime || getCurrentTimeStr();
            const nowMinutes = parseTimeToMinutes(nowTimeStr);

            const pool = getDbPool();
            if (pool && sql) {
                const reqRow = pool.request();
                reqRow.input('detailId', sql.BigInt, detailId);
                const rowRes = await reqRow.query(`
                    SELECT DetailId, StartTime, EmpId, EmpName
                    FROM vw_CPDS_DispatchDetail
                    WHERE DetailId = @detailId
                `);

                if (rowRes.recordset.length === 0) {
                    return res.status(404).json({ success: false, message: '找不到該調派記錄！' });
                }

                const row = rowRes.recordset[0];
                const startStr = row.StartTime instanceof Date ? 
                    `${String(row.StartTime.getUTCHours()).padStart(2, '0')}:${String(row.StartTime.getUTCMinutes()).padStart(2, '0')}` : 
                    String(row.StartTime).slice(0, 5);
                const startMin = parseTimeToMinutes(startStr);

                const newStatus = (startMin !== null && nowMinutes > (startMin + 10)) ? 2 : 1;

                const updateReq = pool.request();
                updateReq.input('detailId', sql.BigInt, detailId);
                updateReq.input('status', sql.TinyInt, newStatus);
                updateReq.input('confirmUser', sql.VarChar(10), currentUser);

                await updateReq.query(`
                    UPDATE CustCPDSDispatchPlan_Detail
                    SET CheckInStatus = @status,
                        CheckInTime = GETDATE(),
                        CheckInMethod = 2,
                        ConfirmUser = @confirmUser,
                        UpdateTime = GETDATE()
                    WHERE DetailId = @detailId
                `);

                return res.json({
                    success: true,
                    status: newStatus,
                    statusName: newStatus === 1 ? '已簽到' : '逾期簽到',
                    empId: row.EmpId,
                    empName: row.EmpName,
                    time: nowTimeStr,
                    message: newStatus === 1 
                        ? `✓ 主管代簽成功<br>${row.EmpId} ${row.EmpName}<br>簽到時間 ${nowTimeStr}`
                        : `✓ 逾期簽到成功（主管代簽）<br>${row.EmpId} ${row.EmpName}<br>簽到時間 ${nowTimeStr}`
                });
            }

            // 備援模式
            const item = memoryCheckinRecords.find(r => r.detailId === Number(detailId));
            if (!item) {
                return res.status(404).json({ success: false, message: '找不到該調派記錄！' });
            }

            const startMin = parseTimeToMinutes(item.startTime || '10:00');
            const newStatus = (startMin !== null && nowMinutes > (startMin + 10)) ? '2' : '1';
            item.status = newStatus;
            item.time = nowTimeStr;
            item.checkInMethod = 2;
            item.confirmUser = currentUser;

            return res.json({
                success: true,
                status: parseInt(newStatus, 10),
                statusName: newStatus === '1' ? '已簽到' : '逾期簽到',
                empId: item.id,
                empName: item.name,
                time: nowTimeStr,
                message: newStatus === '1' 
                    ? `✓ 主管代簽成功<br>${item.id} ${item.name}<br>簽到時間 ${nowTimeStr}`
                    : `✓ 逾期簽到成功（主管代簽）<br>${item.id} ${item.name}<br>簽到時間 ${nowTimeStr}`
            });
        } catch (err) {
            console.error('[Checkin API] 主管代簽失敗:', err);
            res.status(500).json({ success: false, message: '主管代簽失敗: ' + err.message });
        }
    });

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
                updateReq.input('reason', sql.NVarChar(200), isMark ? (reason || '') : null);

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
            const item = memoryCheckinRecords.find(r => r.detailId === Number(detailId));
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
                    updateReq.input('reason', sql.NVarChar(200), item.reason || '');
                    await updateReq.query(`
                        UPDATE CustCPDSDispatchPlan_Detail
                        SET AbnormalReason = @reason, UpdateTime = GETDATE()
                        WHERE DetailId = @detailId AND CheckInStatus = 3
                    `);
                }
            } else {
                for (const item of items) {
                    const rec = memoryCheckinRecords.find(r => r.detailId === Number(item.detailId));
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
```

- [ ] **Step 2: 於 `server.js` 掛載 `/api/checkin` 路由**

在 [server.js](file:///d:/work/CPDS/server.js) 約第 481 行掛載：
```javascript
// =========================================================================
// 【現場簽到業務模組路由掛載】
// =========================================================================
const { createCheckinRouter } = require('./routes/checkin');
app.use('/api/checkin', createCheckinRouter({
    getDbPool: () => (dbPool && dbStatus.connected ? dbPool : null),
    sql,
    JWT_SECRET
}));
```

---

### Task 2: 撰寫後端 API 自動驗證腳本並執行確認

**Files:**
- Create: `scripts/verify_checkin_api.js`

- [x] **Step 1: 建立 `scripts/verify_checkin_api.js` 腳本**

```javascript
// scripts/verify_checkin_api.js
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createCheckinRouter } = require('../routes/checkin');

const app = express();
app.use(express.json());

const JWT_SECRET = 'test_secret_key';
const token = jwt.sign({ empId: 'TEST01', name: '測試員', deptId: 'JMB03' }, JWT_SECRET);

app.use('/api/checkin', createCheckinRouter({
    getDbPool: () => null, // 測試備援模式
    sql: null,
    JWT_SECRET
}));

const server = app.listen(0, async () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/checkin`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    try {
        console.log('Testing Checkin APIs...');

        // 1. GET /records
        const r1 = await fetch(`${baseUrl}/records?deptId=JMB03&dispatchDate=2026-10-21`, { headers });
        const d1 = await r1.json();
        assert.strictEqual(d1.success, true);
        assert.ok(Array.isArray(d1.data));
        console.log('✅ GET /records OK, count =', d1.data.length);

        // 2. POST /scan - 準時 (09:55)
        const r2 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10007',
                currentTime: '13:55'
            })
        });
        const d2 = await r2.json();
        assert.strictEqual(d2.success, true);
        assert.strictEqual(d2.status, 1);
        console.log('✅ POST /scan 準時簽到 OK (status = 1)');

        // 3. POST /scan - 重複簽到
        const r3 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10007',
                currentTime: '13:58'
            })
        });
        assert.strictEqual(r3.status, 400);
        console.log('✅ POST /scan 重複簽到阻擋 OK');

        // 4. POST /scan - 提早超過10分鐘 (應阻擋)
        const r4 = await fetch(`${baseUrl}/scan`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                deptId: 'JMB03',
                dispatchDate: '2026-10-21',
                empId: 'JM10008',
                currentTime: '13:40'
            })
        });
        assert.strictEqual(r4.status, 400);
        console.log('✅ POST /scan 提早超時阻擋 OK');

        // 5. POST /manager - 主管代簽逾期 (14:15)
        const r5 = await fetch(`${baseUrl}/manager`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                detailId: 104,
                currentTime: '14:15'
            })
        });
        const d5 = await r5.json();
        assert.strictEqual(d5.success, true);
        assert.strictEqual(d5.status, 2);
        console.log('✅ POST /manager 主管代簽逾期 OK (status = 2)');

        // 6. POST /abnormal - 標記異常
        const r6 = await fetch(`${baseUrl}/abnormal`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                detailId: 104,
                action: 'MARK',
                reason: '身體不適'
            })
        });
        const d6 = await r6.json();
        assert.strictEqual(d6.status, 3);
        console.log('✅ POST /abnormal 標記異常 OK (status = 3)');

        // 7. POST /abnormal-reasons - 儲存所有異常原因
        const r7 = await fetch(`${baseUrl}/abnormal-reasons`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                items: [{ detailId: 104, reason: '緊急送醫' }]
            })
        });
        const d7 = await r7.json();
        assert.strictEqual(d7.success, true);
        console.log('✅ POST /abnormal-reasons OK');

        console.log('🎉 All Checkin API tests PASSED!');
    } finally {
        server.close();
    }
});
```

- [ ] **Step 2: 執行驗證腳本**

Run: `node scripts/verify_checkin_api.js`
Expected: `All Checkin API tests PASSED!`

---

### Task 3: `checkin.html` 身分守衛、URL 參數相容解析與頁面標題動態化

**Files:**
- Modify: `checkin.html`

- [x] **Step 1: 實作 URL 參數解析器 `parseCheckinUrlParams()`**

在 `checkin.html` 內加入：
```javascript
function parseCheckinUrlParams() {
    var rawSearch = window.location.search || '';
    if (rawSearch.startsWith('?')) {
        rawSearch = rawSearch.substring(1);
    }
    // 容錯處理連續的 &&
    var cleanSearch = rawSearch.replace(/&&+/g, '&');
    var params = new URLSearchParams(cleanSearch);

    var deptId = params.get('deptId') || '';
    var rawDate = params.get('DispatchDate') || params.get('dispatchDate') || '';
    var dispatchDate = '';

    // 正規化日期
    if (rawDate) {
        rawDate = rawDate.trim();
        if (/^\d{8}$/.test(rawDate)) {
            dispatchDate = rawDate.substring(0, 4) + '-' + rawDate.substring(4, 6) + '-' + rawDate.substring(6, 8);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            dispatchDate = rawDate;
        }
    }

    var user = window.Auth ? Auth.getUser() : null;
    if (!deptId && user && user.deptId) {
        deptId = user.deptId;
    }
    if (!deptId) {
        deptId = 'JMB03'; // 預設廠別
    }

    if (!dispatchDate) {
        var today = new Date();
        var yyyy = today.getFullYear();
        var mm = String(today.getMonth() + 1).padStart(2, '0');
        var dd = String(today.getDate()).padStart(2, '0');
        dispatchDate = yyyy + '-' + mm + '-' + dd;
    }

    return { deptId: deptId, dispatchDate: dispatchDate };
}
```

- [x] **Step 2: 頂部資訊區動態渲染標籤綁定**

將原靜態寫死的 `2026/10/07 &nbsp;|&nbsp; A12-3廠` 改為含 id 的標籤：
```html
<h5 class="mb-0 fw-bold" id="pageTitleInfo">載入中...</h5>
```
並實作 `updateHeaderInfo(deptId, deptName, dispatchDate)` 動態刷新。

---

### Task 4: `checkin.html` 前端表格渲染、五大狀態計算與自動 Focus

**Files:**
- Modify: `checkin.html`

- [x] **Step 1: 動態「已逾期(4)」判斷與 `statusFormatter` 完善**

針對歷史單據（`dispatchDate < today`）以及當天調度結束時間超過者，動態顯示「已逾期(4)」：
```javascript
function isDatePast(dateStr) {
    if (!dateStr) return false;
    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    return dateStr < todayStr;
}

function statusFormatter(value, row) {
    var st = String(value);

    // 待簽到狀態檢核
    if (st === '0' || st === '待簽到') {
        var currentUrlParams = window.currentCheckinParams || {};
        if (isDatePast(currentUrlParams.dispatchDate)) {
            return '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
        }
        var nowStr = getCurrentTimeStr();
        if (isNotCheckedInExpired(row.dispatchTime, nowStr)) {
            return '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
        }
        return '<span class="badge bg-secondary px-3 py-2"><i class="bi bi-hourglass-split me-1"></i>待簽到</span>';
    }

    switch (st) {
        case '1':
        case '已簽到':
            return '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-lg me-1"></i>已簽到</span>';
        case '2':
        case '逾期簽到':
            return '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-clock-history me-1"></i>逾期簽到</span>';
        case '3':
        case '異常':
            return '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-exclamation-triangle-fill me-1"></i>異常</span>';
        case '4':
        case '已逾期':
            return '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i>已逾期</span>';
        default:
            return value || '';
    }
}
```

- [x] **Step 2: 實作 `loadCheckinData(deptId, dispatchDate)` 從 API 載入名單並分流至三表格**

呼叫 `Auth.authFetch('/api/checkin/records?deptId=' + deptId + '&dispatchDate=' + dispatchDate)`，取得 data 後分配至 `checkedInData`, `notCheckedInData`, `abnormalData`，並自動觸發：
1. `$('#barcodeInput').focus()`
2. `updateCounters()`

---

### Task 5: `checkin.html` 掃碼簽到、主管代簽、異常標記與批次儲存真實 API 串接

**Files:**
- Modify: `checkin.html`

- [x] **Step 1: 改造 `handleScanSubmit()` 呼叫 `POST /api/checkin/scan`**

前端條碼槍掃入工號後：
1. 前端先行檢查是否重複刷卡。
2. 呼叫 `Auth.authFetch('/api/checkin/scan', { method: 'POST', body: JSON.stringify({ deptId, dispatchDate, empId: val }) })`。
3. 若成功：依據回應呈現 Alert 提示並重新載入列表或動態更新表格與計數。
4. 若失敗（如提早超過10分鐘、逾期超時或未在名單）：顯示紅色 Alert 提示。
5. 始終清空輸入框並執行 `$('#barcodeInput').focus()`。

- [x] **Step 2: 改造 `managerCheckIn(detailId)` 呼叫 `POST /api/checkin/manager`**
- [x] **Step 3: 改造 `markAbnormal(detailId)` 與 `restoreAbnormal(detailId)` 呼叫 `POST /api/checkin/abnormal`**
- [x] **Step 4: 改造 `saveAllAbnormal()` 呼叫 `POST /api/checkin/abnormal-reasons`**

---

### Task 6: 系統端到端完整功能驗證與測試 (E2E Verification)

**Files:**
- Test: `scripts/test_checkin_integration.js`

- [x] **Step 1: 建立整合性驗證腳本 `scripts/test_checkin_integration.js`**
- [x] **Step 2: 啟動伺服器並執行驗證腳本測試真實流程**
- [x] **Step 3: 於瀏覽器中驗證 URL 切換（如 `?deptId=JMB03&&DispatchDate=20261020`）、工號 Focus 與狀態顯示**
