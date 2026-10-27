# Task 1 執行報告：升級 LocalDB 資料庫結構至 v2.0 並建立檢核腳本

- **執行日期**：2026-10-20
- **工作目錄**：`d:\work\CPDS`
- **負責任務**：Task 1 - 升級 LocalDB 資料庫結構至 v2.0 並建立檢核腳本
- **執行狀態**：✅ DONE

---

## 1. 任務執行項目與成果

### (1) 修正連線方式相容性 (`scripts/init-db.js`)
- 比對 `server.js` 與 `dbConfig.js`，將 `sql.connect` 的參數統一為 `{ connectionString: connStr }` 物件形式，確保 Windows 環境下 `msnodesqlv8` (ODBC Driver 17 for SQL Server) 穩定連線至 LocalDB (BPMTEST)。

### (2) 執行資料庫結構腳本 (`db/schema.sql`)
- 執行批次 SQL 腳本共 19 個區塊，完整建立/重建 v2.0 所需之資料表、觸發程序與檢視表：
  - 清理舊版檢視表與暫存表
  - 保留並維護使用者主檔 `CustCPDSUser`
  - 建立調度單主檔 `CustCPDSDispatchPlan_Master` 及每日單一調度單唯一索引
  - 建立調度時段明細 `CustCPDSDispatchPlan_Item` 及外鍵階層關聯 (CASCADE)
  - 建立人員簽到檔 `CustCPDSDispatchPlan_Detail` 及同日單一調度防呆索引
  - 建立防呆 Trigger (`TR_CustCPDSItem_Validate`, `TR_CustCPDSDetail_SyncDate`)
  - 建立跨廠檢視表 (`vw_CPDS_Dept`, `vw_CPDS_DispatchDetail`)

### (3) 建立檢核腳本 (`scripts/verify_db_schema.js`)
- 支援透過 `dbConfig.js` 連線 LocalDB。
- 檢驗 4 大核心資料表是否存在。
- 檢驗 2 大核心檢視表是否存在。
- 輸出每張表的欄位定義、型態、是否可為 NULL 與預設值。
- 若檢驗全數通過，程式以 exit code 0 正常結束。

---

## 2. 檢核輸出摘要 (Test Output Summary)

執行指令：
```bash
node scripts/verify_db_schema.js
```

輸出結果：
```text
====================================================
  CPDS 資料庫結構檢核工具 (v2.0)
====================================================
🔌 正在連線至 LocalDB (BPMTEST)...
✅ 連線成功！

📋 [資料表存在性檢核]
  ✅ 資料表存在: CustCPDSDispatchPlan_Master
  ✅ 資料表存在: CustCPDSDispatchPlan_Item
  ✅ 資料表存在: CustCPDSDispatchPlan_Detail
  ✅ 資料表存在: CustCPDSUser

🔍 [資料表欄位結構明細]
--- [CustCPDSDispatchPlan_Master] (8 欄位) ---
┌─────────┬────────────────┬───────────────┬──────────┬───────────────┐
│ (index) │ 欄位名稱       │ 資料型態      │ 允許NULL │ 預設值        │
├─────────┼────────────────┼───────────────┼──────────┼───────────────┤
│ 0       │ 'PlanNo'       │ 'varchar(15)' │ 'NO'     │ ''            │
│ 1       │ 'DispatchDate' │ 'date'        │ 'NO'     │ ''            │
│ 2       │ 'SourceDeptId' │ 'varchar(50)' │ 'NO'     │ ''            │
│ 3       │ 'PlanStatus'   │ 'tinyint'     │ 'NO'     │ '((1))'       │
│ 4       │ 'CreateUser'   │ 'varchar(10)' │ 'NO'     │ ''            │
│ 5       │ 'CreateTime'   │ 'datetime'    │ 'NO'     │ '(getdate())' │
│ 6       │ 'UpdateUser'   │ 'varchar(10)' │ 'YES'    │ ''            │
│ 7       │ 'UpdateTime'   │ 'datetime'    │ 'YES'    │ ''            │
└─────────┴────────────────┴───────────────┴──────────┴───────────────┘

--- [CustCPDSDispatchPlan_Item] (10 欄位) ---
┌─────────┬────────────────┬─────────────────┬──────────┬───────────────┐
│ (index) │ 欄位名稱       │ 資料型態        │ 允許NULL │ 預設值        │
├─────────┼────────────────┼─────────────────┼──────────┼───────────────┤
│ 0       │ 'ItemId'       │ 'bigint'        │ 'NO'     │ ''            │
│ 1       │ 'PlanNo'       │ 'varchar(15)'   │ 'NO'     │ ''            │
│ 2       │ 'Seq'          │ 'smallint'      │ 'NO'     │ ''            │
│ 3       │ 'DispatchDate' │ 'date'          │ 'NO'     │ ''            │
│ 4       │ 'TargetDeptId' │ 'varchar(50)'   │ 'NO'     │ ''            │
│ 5       │ 'StartTime'    │ 'time'          │ 'NO'     │ ''            │
│ 6       │ 'EndTime'      │ 'time'          │ 'NO'     │ ''            │
│ 7       │ 'Purpose'      │ 'nvarchar(100)' │ 'YES'    │ ''            │
│ 8       │ 'CreateTime'   │ 'datetime'      │ 'NO'     │ '(getdate())' │
│ 9       │ 'UpdateTime'   │ 'datetime'      │ 'YES'    │ ''            │
└─────────┴────────────────┴─────────────────┴──────────┴───────────────┘

--- [CustCPDSDispatchPlan_Detail] (11 欄位) ---
┌─────────┬──────────────────┬─────────────────┬──────────┬───────────────┐
│ (index) │ 欄位名稱         │ 資料型態        │ 允許NULL │ 預設值        │
├─────────┼──────────────────┼─────────────────┼──────────┼───────────────┤
│ 0       │ 'DetailId'       │ 'bigint'        │ 'NO'     │ ''            │
│ 1       │ 'ItemId'         │ 'bigint'        │ 'NO'     │ ''            │
│ 2       │ 'DispatchDate'   │ 'date'          │ 'NO'     │ ''            │
│ 3       │ 'EmpId'          │ 'varchar(10)'   │ 'NO'     │ ''            │
│ 4       │ 'CheckInStatus'  │ 'tinyint'       │ 'NO'     │ '((0))'       │
│ 5       │ 'CheckInTime'    │ 'datetime'      │ 'YES'    │ ''            │
│ 6       │ 'CheckInMethod'  │ 'tinyint'       │ 'YES'    │ ''            │
│ 7       │ 'ConfirmUser'    │ 'varchar(10)'   │ 'YES'    │ ''            │
│ 8       │ 'AbnormalReason' │ 'nvarchar(200)' │ 'YES'    │ ''            │
│ 9       │ 'CreateTime'     │ 'datetime'      │ 'NO'     │ '(getdate())' │
│ 10      │ 'UpdateTime'     │ 'datetime'      │ 'YES'    │ ''            │
└─────────┴──────────────────┴─────────────────┴──────────┴───────────────┘

--- [CustCPDSUser] (6 欄位) ---
┌─────────┬──────────────┬────────────────┬──────────┬───────────────┐
│ (index) │ 欄位名稱     │ 資料型態       │ 允許NULL │ 預設值        │
├─────────┼──────────────┼────────────────┼──────────┼───────────────┤
│ 0       │ 'EmpId'      │ 'nvarchar(50)' │ 'NO'     │ ''            │
│ 1       │ 'Name'       │ 'nvarchar(50)' │ 'YES'    │ ''            │
│ 2       │ 'Password'   │ 'nvarchar(50)' │ 'NO'     │ ''            │
│ 3       │ 'CreateTime' │ 'datetime'     │ 'NO'     │ '(getdate())' │
│ 4       │ 'IsActive'   │ 'bit'          │ 'NO'     │ '((1))'       │
│ 5       │ 'Role'       │ 'nvarchar(10)' │ 'NO'     │ "(N'1')"      │
└─────────┴──────────────┴────────────────┴──────────┴───────────────┘

👁️ [檢視表 (Views) 檢核]
  ✅ 檢視表存在: vw_CPDS_Dept
  ✅ 檢視表存在: vw_CPDS_DispatchDetail

👤 CustCPDSUser 現有帳號筆數: 4

🎉 所有核心資料表結構檢核均已通過！
Process finished with exit code 0.
```

---

## 3. 異動與新增檔案清單
1. `scripts/verify_db_schema.js` (新增): LocalDB v2.0 結構檢核腳本
2. `scripts/init-db.js` (修改): 調整 `sql.connect({ connectionString: connStr })` 匹配 `server.js` 連線形式
3. `docs/superpowers/plans/task-1-report.md` (新增): 本次任務執行報告
