-- =========================================================================
-- 跨廠人員調度與簽到系統 (CPDS) - 資料庫建表與檢視表腳本
-- 目標資料庫：Microsoft SQL Server 2016+ (LocalDB / BPMTEST / 正式環境)
-- 更新日期：2026-10-20
-- 版本：2.0
--   - 調度結構改為三層：Master(調度單) → Item(調度時段) → Detail(調派人員與簽到)
--   - 廠別 / 人員 / 職稱一律動態關聯 BPM 檢視表 [vw_ActiveUserMainFunction]
--   - 簽到狀態：0 待簽到 / 1 已簽到 / 2 逾期簽到 / 3 異常；4 已逾期由檢視表推導
--   - 同一人同一天可排多個「不重疊」時段（由 Trigger 防呆）
-- 注意：本腳本會「直接重建」調度相關資料表（既有調度資料將被清除）。
--       帳號表 CustCPDSUser 不會被刪除。
-- =========================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- =========================================================================
-- 0. 移除舊版 (v1.1 / v2.0) 調度物件 —— 直接重建
-- =========================================================================
DROP VIEW    IF EXISTS [dbo].[vw_CPDS_DispatchDetail];
DROP VIEW    IF EXISTS [dbo].[vw_CPDS_Dept];
DROP TABLE   IF EXISTS [dbo].[CustCPDSDispatchPlan_Detail];
DROP TABLE   IF EXISTS [dbo].[CustCPDSDispatchPlan_Item];
DROP TABLE   IF EXISTS [dbo].[CustCPDSDispatchPlan_Master];
PRINT N'🧹 已移除舊版調度資料表與檢視表';
GO

-- =========================================================================
-- 1. 系統帳密主檔 CustCPDSUser (保留，不重建)
-- =========================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CustCPDSUser')
BEGIN
    CREATE TABLE [dbo].[CustCPDSUser] (
        [UserId]      VARCHAR(10)   NOT NULL,
        [Password]    VARCHAR(100)  NOT NULL,
        [CreateTime]  DATETIME      NOT NULL CONSTRAINT DF_CustCPDSUser_CreateTime DEFAULT GETDATE(),
        [IsActive]    BIT           NOT NULL CONSTRAINT DF_CustCPDSUser_IsActive DEFAULT 1,
        [IsAdmin]     NVARCHAR(10)  NOT NULL CONSTRAINT DF_CustCPDSUser_IsAdmin DEFAULT N'0',
        [UpdateTime]  DATETIME      NULL,
        CONSTRAINT PK_CustCPDSUser PRIMARY KEY CLUSTERED ([UserId] ASC)
    );
    PRINT N'✅ 已成功建立資料表: CustCPDSUser';
END
GO

-- 1.1 若 CustCPDSUser 已存在，執行平滑結構升級與遷移
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'EmpId')
    AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'UserId')
BEGIN
    EXEC sp_rename 'CustCPDSUser.EmpId', 'UserId', 'COLUMN';
    PRINT N'🔄 已將 CustCPDSUser.EmpId 重新命名為 UserId';
END
GO
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'Name')
BEGIN
    ALTER TABLE [dbo].[CustCPDSUser] DROP COLUMN [Name];
    PRINT N'🧹 已自 CustCPDSUser 移除 Name 欄位（改由關聯 vw_ActiveUserMainFunction 取得）';
END
GO
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'Role')
    AND NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'IsAdmin')
BEGIN
    ALTER TABLE [dbo].[CustCPDSUser] ADD [IsAdmin] NVARCHAR(10) NOT NULL CONSTRAINT DF_CustCPDSUser_IsAdmin DEFAULT N'0';
    EXEC('UPDATE [dbo].[CustCPDSUser] SET [IsAdmin] = CASE WHEN [Role] = ''2'' THEN N''1'' ELSE N''0'' END');
    ALTER TABLE [dbo].[CustCPDSUser] DROP COLUMN [Role];
    PRINT N'🔄 已將 CustCPDSUser.Role 欄位遷移轉換為 IsAdmin (1:是, 0:否)';
END
GO
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'IsAdmin')
    ALTER TABLE [dbo].[CustCPDSUser] ADD [IsAdmin] NVARCHAR(10) NOT NULL CONSTRAINT DF_CustCPDSUser_IsAdmin DEFAULT N'0';
GO
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'CreateTime')
    ALTER TABLE [dbo].[CustCPDSUser] ADD [CreateTime] DATETIME NOT NULL CONSTRAINT DF_CustCPDSUser_CreateTime DEFAULT GETDATE();
GO
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'IsActive')
    ALTER TABLE [dbo].[CustCPDSUser] ADD [IsActive] BIT NOT NULL CONSTRAINT DF_CustCPDSUser_IsActive DEFAULT 1;
GO
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('CustCPDSUser') AND name = 'UpdateTime')
    ALTER TABLE [dbo].[CustCPDSUser] ADD [UpdateTime] DATETIME NULL;
GO

-- 1.2 植入預設測試帳號 (僅於帳號不存在時)
IF NOT EXISTS (SELECT 1 FROM [dbo].[CustCPDSUser] WHERE [UserId] = 'JM30448')
BEGIN
    EXEC('INSERT INTO [dbo].[CustCPDSUser] ([UserId], [Password], [IsActive], [IsAdmin])
          VALUES (''JM30448'', ''123'', 1, N''1''),
                 (''A0123'',   ''123'', 1, N''1''),
                 (''A0145'',   ''123'', 1, N''0''),
                 (''B0211'',   ''123'', 1, N''0''),
                 (''C0089'',   ''123'', 1, N''0''),
                 (''C0102'',   ''123'', 1, N''0'');');
    PRINT N'✅ 已植入 CustCPDSUser 預設測試帳號資料';
END
GO

-- =========================================================================
-- 2. 調度單主檔 CustCPDSDispatchPlan_Master
--    對應 index.html 上半部「支援調度列表」每一列
-- =========================================================================
CREATE TABLE [dbo].[CustCPDSDispatchPlan_Master] (
    [PlanNo]        VARCHAR(15)   NOT NULL,                 -- 調度單號 DPyyyyMMdd-NNN
    [DispatchDate]  DATE          NOT NULL,                 -- 調度日期
    [SourceDeptId]  VARCHAR(10)   NOT NULL,                 -- 來源廠別代號
    [CreateUser]    VARCHAR(10)   NOT NULL,
    [CreateTime]    DATETIME      NOT NULL CONSTRAINT DF_CustCPDSMaster_CreateTime DEFAULT GETDATE(),
    [UpdateUser]    VARCHAR(10)   NULL,
    [UpdateTime]    DATETIME      NULL,
    CONSTRAINT PK_CustCPDSDispatchPlan_Master PRIMARY KEY CLUSTERED ([PlanNo] ASC)
);
PRINT N'✅ 已成功建立資料表: CustCPDSDispatchPlan_Master';
GO

-- 2.1 各廠每日僅能有一張調度單
CREATE UNIQUE NONCLUSTERED INDEX UQ_CustCPDSMaster_Date_SourceDept
    ON [dbo].[CustCPDSDispatchPlan_Master] ([DispatchDate], [SourceDeptId]);
GO

-- =========================================================================
-- 3. 調度時段明細 CustCPDSDispatchPlan_Item
--    對應 index.html 下半部「支援調度明細」每一列 (目的廠 + 起訖時間 + 用途)
-- =========================================================================
CREATE TABLE [dbo].[CustCPDSDispatchPlan_Item] (
    [ItemId]        BIGINT IDENTITY(1,1) NOT NULL,
    [PlanNo]        VARCHAR(15)   NOT NULL,
    [Seq]           SMALLINT      NOT NULL,                 -- 順序
    [DispatchDate]  DATE          NOT NULL,                 -- 調度日期 (冗餘自 Master，供簽到/報表查詢)
    [TargetDeptId]  VARCHAR(10)   NOT NULL,                 -- 目的廠別代號
    [StartTime]     TIME(0)       NOT NULL,                 -- 調度時間(起)
    [EndTime]       TIME(0)       NOT NULL,                 -- 調度時間(訖)
    [Purpose]       NVARCHAR(100) NULL,                     -- 用途
    [CreateTime]    DATETIME      NOT NULL CONSTRAINT DF_CustCPDSItem_CreateTime DEFAULT GETDATE(),
    [UpdateTime]    DATETIME      NULL,
    CONSTRAINT PK_CustCPDSDispatchPlan_Item PRIMARY KEY CLUSTERED ([ItemId] ASC),
    CONSTRAINT FK_CustCPDSItem_Master FOREIGN KEY ([PlanNo])
        REFERENCES [dbo].[CustCPDSDispatchPlan_Master] ([PlanNo])
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT UQ_CustCPDSItem_PlanNo_Seq UNIQUE ([PlanNo], [Seq]),
    CONSTRAINT CK_CustCPDSItem_TimeRange CHECK ([StartTime] < [EndTime])
);
PRINT N'✅ 已成功建立資料表: CustCPDSDispatchPlan_Item';
GO

-- 3.1 簽到頁 (當日 + 目的廠) 拉單、報表目的廠篩選
CREATE NONCLUSTERED INDEX IX_CustCPDSItem_Date_TargetDept
    ON [dbo].[CustCPDSDispatchPlan_Item] ([DispatchDate], [TargetDeptId])
    INCLUDE ([PlanNo], [StartTime], [EndTime], [Purpose]);
GO

-- =========================================================================
-- 4. 調派人員與簽到檔 CustCPDSDispatchPlan_Detail
--    1 個時段 (Item) 對多位同仁；同時承載 checkin.html 的簽到結果
-- =========================================================================
CREATE TABLE [dbo].[CustCPDSDispatchPlan_Detail] (
    [DetailId]       BIGINT IDENTITY(1,1) NOT NULL,         -- 調派編號
    [ItemId]         BIGINT        NOT NULL,
    [DispatchDate]   DATE          NOT NULL,                -- 調度日期 (冗餘自 Item，供同日排程與防呆 Trigger)
    [EmpId]          VARCHAR(10)   NOT NULL,                -- 調派員工工號
    [CheckInStatus]  TINYINT       NOT NULL CONSTRAINT DF_CustCPDSDetail_CheckInStatus DEFAULT 0,
                                                            -- 0 待簽到 / 1 已簽到 / 2 逾期簽到 / 3 異常
    [CheckInTime]    DATETIME      NULL,                    -- 簽到時間
    [CheckInMethod]  TINYINT       NULL,                    -- 1 掃描/輸入工號 / 2 主管代簽
    [ConfirmUser]    VARCHAR(10)   NULL,                    -- 確認人 (簽到頁實際操作之目的廠人員，通常為小組長)
    [AbnormalReason] NVARCHAR(100) NULL,                    -- 異常說明
    [CreateTime]     DATETIME      NOT NULL CONSTRAINT DF_CustCPDSDetail_CreateTime DEFAULT GETDATE(),
    [UpdateTime]     DATETIME      NULL,
    CONSTRAINT PK_CustCPDSDispatchPlan_Detail PRIMARY KEY CLUSTERED ([DetailId] ASC),
    CONSTRAINT FK_CustCPDSDetail_Item FOREIGN KEY ([ItemId])
        REFERENCES [dbo].[CustCPDSDispatchPlan_Item] ([ItemId])
        ON DELETE CASCADE,
    CONSTRAINT UQ_CustCPDSDetail_Item_Emp UNIQUE ([ItemId], [EmpId]),
    CONSTRAINT CK_CustCPDSDetail_CheckInStatus CHECK ([CheckInStatus] IN (0, 1, 2, 3)),
    CONSTRAINT CK_CustCPDSDetail_CheckInMethod CHECK ([CheckInMethod] IS NULL OR [CheckInMethod] IN (1, 2)),
    -- 已簽到 / 逾期簽到 必須有簽到時間；待簽到 / 異常 不可有簽到時間
    CONSTRAINT CK_CustCPDSDetail_CheckInTime CHECK (
        ([CheckInStatus] IN (1, 2) AND [CheckInTime] IS NOT NULL) OR
        ([CheckInStatus] IN (0, 3) AND [CheckInTime] IS NULL)
    )
);
PRINT N'✅ 已成功建立資料表: CustCPDSDispatchPlan_Detail';
GO

-- 4.1 移除舊的同日單次唯一索引 (改由 Trigger 進行區間重疊防呆)
DROP INDEX IF EXISTS [UQ_CustCPDSDetail_DispatchDate_EmpId] 
    ON [dbo].[CustCPDSDispatchPlan_Detail];
GO

-- 4.2 人員查詢與工號關鍵字查詢索引
CREATE NONCLUSTERED INDEX IX_CustCPDSDetail_EmpId
    ON [dbo].[CustCPDSDispatchPlan_Detail] ([EmpId])
    INCLUDE ([ItemId], [CheckInStatus]);
GO

-- =========================================================================
-- 5. 防呆 Trigger
-- =========================================================================

-- 5.1 Item：日期需與主檔一致、來源廠 ≠ 目的廠；若更新 Item 日期，同步更新 Detail 日期；若變更時段，防呆人員排班衝突
CREATE OR ALTER TRIGGER [dbo].[TR_CustCPDSItem_Validate]
ON [dbo].[CustCPDSDispatchPlan_Item]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted i
        JOIN [dbo].[CustCPDSDispatchPlan_Master] m ON m.[PlanNo] = i.[PlanNo]
        WHERE i.[DispatchDate] <> m.[DispatchDate]
    )
    BEGIN
        RAISERROR(N'時段明細的調度日期必須與調度單主檔一致', 16, 1);
        ROLLBACK TRANSACTION; RETURN;
    END

    IF EXISTS (
        SELECT 1 FROM inserted i
        JOIN [dbo].[CustCPDSDispatchPlan_Master] m ON m.[PlanNo] = i.[PlanNo]
        WHERE i.[TargetDeptId] = m.[SourceDeptId]
    )
    BEGIN
        RAISERROR(N'「來源廠」與「目的廠」不可相同', 16, 1);
        ROLLBACK TRANSACTION; RETURN;
    END

    -- 若 Item 日期變更，自動同步至所屬 Detail 確保防呆索引生效
    IF UPDATE([DispatchDate])
    BEGIN
        UPDATE d
        SET d.[DispatchDate] = i.[DispatchDate]
        FROM [dbo].[CustCPDSDispatchPlan_Detail] d
        JOIN inserted i ON d.[ItemId] = i.[ItemId]
        WHERE d.[DispatchDate] <> i.[DispatchDate];
    END

    -- 若 Item 時間或日期變更，檢查其下所屬同仁是否與同日其他時段產生衝突
    IF EXISTS (
        SELECT 1
        FROM inserted i1
        JOIN [dbo].[CustCPDSDispatchPlan_Detail] d1 ON d1.[ItemId] = i1.[ItemId]
        JOIN [dbo].[CustCPDSDispatchPlan_Detail] d2 
            ON d2.[DispatchDate] = i1.[DispatchDate] 
           AND d2.[EmpId] = d1.[EmpId]
           AND d2.[DetailId] <> d1.[DetailId]
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i2 ON i2.[ItemId] = d2.[ItemId]
        WHERE i1.[StartTime] < i2.[EndTime] 
          AND i1.[EndTime] > i2.[StartTime]
    )
    BEGIN
        RAISERROR(N'人員排班時間衝突：時段變更導致同仁排定重疊的調度時段！', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
END
GO

-- 5.2 Detail：新增/修改時確保 DispatchDate 與所屬 Item 一致
CREATE OR ALTER TRIGGER [dbo].[TR_CustCPDSDetail_SyncDate]
ON [dbo].[CustCPDSDispatchPlan_Detail]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted d
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i ON i.[ItemId] = d.[ItemId]
        WHERE d.[DispatchDate] <> i.[DispatchDate]
    )
    BEGIN
        UPDATE d
        SET d.[DispatchDate] = i.[DispatchDate]
        FROM [dbo].[CustCPDSDispatchPlan_Detail] d
        JOIN inserted ins ON d.[DetailId] = ins.[DetailId]
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i ON i.[ItemId] = ins.[ItemId]
        WHERE d.[DispatchDate] <> i.[DispatchDate];
    END
END
GO

-- 5.3 Detail：新增/修改時確保同一位同仁在同一天不可排定重疊的調度時段
CREATE OR ALTER TRIGGER [dbo].[TR_CustCPDSDetail_TimeOverlapCheck]
ON [dbo].[CustCPDSDispatchPlan_Detail]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted d1
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i1 ON i1.[ItemId] = d1.[ItemId]
        JOIN [dbo].[CustCPDSDispatchPlan_Detail] d2 
            ON d2.[DispatchDate] = d1.[DispatchDate] 
           AND d2.[EmpId] = d1.[EmpId]
           AND d2.[DetailId] <> d1.[DetailId]
        JOIN [dbo].[CustCPDSDispatchPlan_Item] i2 ON i2.[ItemId] = d2.[ItemId]
        WHERE i1.[StartTime] < i2.[EndTime] 
          AND i1.[EndTime] > i2.[StartTime]
    )
    BEGIN
        RAISERROR(N'人員排班時間衝突：同一位同仁在同一天不可排定重疊的調度時段！', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END
END
GO

-- =========================================================================
-- 6. 檢視表
-- =========================================================================

-- 6.1 廠別 / 部門下拉清單 (來源廠、目的廠選單)
CREATE OR ALTER VIEW [dbo].[vw_CPDS_Dept] AS
SELECT [organizationUnitID]        AS [DeptId],
       MAX([organizationUnitName]) AS [DeptName]
FROM [dbo].[vw_ActiveUserMainFunction]
WHERE [organizationUnitID] IS NOT NULL
GROUP BY [organizationUnitID];
GO

-- 6.2 調派明細整合檢視表 (調度列表 / 簽到頁 / 報表共用)
--     DisplayStatus：0 待簽到 / 1 已簽到 / 2 逾期簽到 / 3 異常 / 4 已逾期(調度結束時間前未簽到)
CREATE OR ALTER VIEW [dbo].[vw_CPDS_DispatchDetail] AS
SELECT
    d.[DetailId],
    m.[PlanNo],
    i.[ItemId],
    i.[Seq],
    i.[DispatchDate],
    m.[SourceDeptId],
    sd.[DeptName]                       AS [SourceDeptName],
    i.[TargetDeptId],
    td.[DeptName]                       AS [TargetDeptName],
    i.[StartTime],
    i.[EndTime],
    i.[Purpose],
    d.[EmpId],
    emp.[userName]                      AS [EmpName],
    emp.[functionDefinitionName]        AS [EmpTitle],
    d.[CheckInStatus],
    CASE
        WHEN d.[CheckInStatus] = 0
         AND GETDATE() > CAST(i.[DispatchDate] AS DATETIME) + CAST(i.[EndTime] AS DATETIME)
        THEN 4
        ELSE d.[CheckInStatus]
    END                                 AS [DisplayStatus],
    CASE
        WHEN d.[CheckInStatus] = 0
         AND GETDATE() > CAST(i.[DispatchDate] AS DATETIME) + CAST(i.[EndTime] AS DATETIME)
        THEN N'已逾期'
        WHEN d.[CheckInStatus] = 0 THEN N'待簽到'
        WHEN d.[CheckInStatus] = 1 THEN N'已簽到'
        WHEN d.[CheckInStatus] = 2 THEN N'逾期簽到'
        WHEN d.[CheckInStatus] = 3 THEN N'異常'
        ELSE N'未知'
    END                                 AS [DisplayStatusName],
    d.[CheckInTime],
    d.[CheckInMethod],
    d.[ConfirmUser],
    cu.[userName]                       AS [ConfirmUserName],
    d.[AbnormalReason],
    m.[CreateUser]                      AS [PlanCreateUser],
    d.[CreateTime],
    d.[UpdateTime]
FROM [dbo].[CustCPDSDispatchPlan_Detail] d
INNER JOIN [dbo].[CustCPDSDispatchPlan_Item]   i ON i.[ItemId] = d.[ItemId]
INNER JOIN [dbo].[CustCPDSDispatchPlan_Master] m ON m.[PlanNo] = i.[PlanNo]
LEFT JOIN  [dbo].[vw_CPDS_Dept] sd ON sd.[DeptId] = m.[SourceDeptId]
LEFT JOIN  [dbo].[vw_CPDS_Dept] td ON td.[DeptId] = i.[TargetDeptId]
OUTER APPLY (SELECT TOP 1 v.[userName], v.[functionDefinitionName]
             FROM [dbo].[vw_ActiveUserMainFunction] v WHERE v.[userID] = d.[EmpId]) emp
OUTER APPLY (SELECT TOP 1 v.[userName]
             FROM [dbo].[vw_ActiveUserMainFunction] v WHERE v.[userID] = d.[ConfirmUser]) cu;
GO

PRINT N'✅ 已成功建立檢視表: vw_CPDS_Dept, vw_CPDS_DispatchDetail';
PRINT N'🎉 CPDS 資料庫腳本 v2.0 執行完畢！';
