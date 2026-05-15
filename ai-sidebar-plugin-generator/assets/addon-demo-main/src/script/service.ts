/*global DingdocsScript*/
import type {} from 'dingtalk-docs-cool-app';

// ============================================================
// 文档信息
// ============================================================

function getDocumentInfo() {
  try {
    const base = DingdocsScript.base;
    const uuid = base.getDentryUuid();
    const sheets = base.getSheets();
    return {
      uuid,
      sheetsCount: sheets.length,
      currentSheet: base.getActiveSheet()?.getName() || '无'
    };
  } catch (error: any) {
    throw new Error(`获取文档信息失败: ${error.message}`);
  }
}

// ============================================================
// 安排日期 (scheduleDateButton)
// 将 VBA GetTargetDate 逻辑迁移为钉钉AI表边栏插件按钮
// ============================================================

// ---------- 字段名配置（根据实际表结构调整） ----------

/** 主表：TR4评审完成 日期字段（VBA中的 $BV列，即 DateA） */
const SDB_FIELD_TR4_DATE = 'TR4评审完成';
/** 主表：对应开发类型 字段（VBA中的 $AZ列，用于查找 CategoryC） */
const SDB_FIELD_DEV_TYPE = '对应开发类型';
/** 主表：节点刷新条件 字段（值为工序名，推算写入至该节点含；空则跳过该行） */
const SDB_FIELD_REFRESH_NODE = '节点刷新条件';
/** 产品族对应周期：类别字段名（VBA中的 AB列） */
const SDB_CYCLE_CATEGORY_FIELD = '类别';

/**
 * 21个目标工序字段（按工序顺序排列，与产品族对应周期中的列顺序一致）
 * 对应 Excel 中 D列 → Y列的顺序
 */
const SDB_PROCESS_FIELDS = [
  '最晚开工时间',
  '完成1：1CAD',
  '完成木架结构设计',
  '完成TR2支持排版-cnc-钉架',
  '完成TR2评审',
  '完成TR3海绵及初版面套样板',
  '完成第一次TR3仿套下放',
  '完成第一次TR3裁缝/切棉制作',
  '完成第一次TR3样品包制',
  '完成第一次TR3评审',
  '完成修改后TR3海绵及初版面套样板',
  '完成修改后TR3仿套',
  '完成修改后TR3结构',
  '完成修改后TR3切绵/裁缝/钉架制作',
  '完成修改后TR3样品包制',
  '完成修改后TR3评审',
  '完成TR4海绵及初版面套样板',
  '完成TR4仿套样板',
  '完成TR4结构样板',
  '完成TR4切绵/钉架/裁缝制作',
  '完成TR4成品包制',
];

// ---------- 工具函数 ----------

/** 从各类 DingTalk 单元格值中提取字符串（兼容 text/primaryDoc/singleSelect 等类型） */
function sdbExtractString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return val.map((item: any) => {
      if (typeof item === 'string') return item;
      return item?.text ?? item?.value ?? item?.name ?? '';
    }).join('').trim();
  }
  if (typeof val === 'object') {
    const s = val?.value ?? val?.text ?? val?.name ?? '';
    return String(s).trim();
  }
  return String(val).trim();
}

/** 解析 DingTalk 日期单元格值（时间戳ms 或 YYYY-MM-DD 字符串）为本地时间 Date */
function sdbParseDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      // 用本地午夜，避免 UTC±8 时区偏移导致日期错位
      return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** 将 Date 格式化为 YYYY-MM-DD（本地时间，兼容北京时间存储） */
function sdbFormatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- 数据加载 ----------

interface SdbHolidayData {
  holidays: Set<string>; // YYYY-MM-DD，法定节假日（跳过不计）
  workdays: Set<string>; // YYYY-MM-DD，补班工作日（强制计为工作日）
}

interface SdbCycleRecord {
  colAValue: string;              // 产品族对应周期 第一列：开发类型标识
  category: string;               // 类别字段值（对应 AB 列）
  durations: Map<string, number>; // 工序名 → 工期天数
}

interface SdbCycleData {
  records: SdbCycleRecord[];
  processOrder: string[]; // 工序字段的有序列表（决定 S 的计算顺序）
}

/** 加载 holidays 表：A列=非周六的放假日期，B列=周六补班日期 */
async function sdbLoadHolidayData(holidaysSheet: any): Promise<SdbHolidayData> {
  const holidays = new Set<string>();
  const workdays = new Set<string>();

  const fields = holidaysSheet.getFields();
  // A列（index 0）= 非周六放假日（法定节假日中的工作日）
  const holidayFieldName: string | null = fields[0]?.getName() ?? null;
  // B列（index 1）= 周六补班日（需计为工作日的周六）
  const workdayFieldName: string | null = fields.length > 1 ? (fields[1]?.getName() ?? null) : null;

  let hasMore = true;
  let cursor = '';
  while (hasMore) {
    const page = await holidaysSheet.getRecordsAsync({ pageSize: 100, cursor });
    for (const rec of page.records) {
      if (holidayFieldName) {
        const d = sdbParseDate(rec.getCellValue(holidayFieldName));
        if (d) holidays.add(sdbFormatDate(d));
      }
      if (workdayFieldName) {
        const d = sdbParseDate(rec.getCellValue(workdayFieldName));
        if (d) workdays.add(sdbFormatDate(d));
      }
    }
    hasMore = page.hasMore;
    cursor = page.cursor ?? '';
  }

  return { holidays, workdays };
}

/** 加载产品族对应周期：收集各行的工序工期数据 */
async function sdbLoadCycleData(cycleSheet: any): Promise<SdbCycleData> {
  const allFields = cycleSheet.getFields();

  const colAFieldName: string = allFields[0]?.getName() ?? '';

  // 类别字段：先按名称查找，找不到则按索引 27（AB列）兜底
  let categoryFieldName = SDB_CYCLE_CATEGORY_FIELD;
  if (!cycleSheet.getField(SDB_CYCLE_CATEGORY_FIELD)) {
    categoryFieldName = allFields[27]?.getName() ?? SDB_CYCLE_CATEGORY_FIELD;
  }

  // 工序字段顺序：对应 Excel D列（index 3）到 Y列（index 24），共22列
  // 包含所有工序工期列（含"TR4评审完成"等末尾列），保证 S 的累加正确
  const effectiveOrder: string[] = [];
  for (let i = 3; i <= 24 && i < allFields.length; i++) {
    const fieldName: string = allFields[i]?.getName();
    if (fieldName) effectiveOrder.push(fieldName);
  }
  // 兜底：若 sheet 列数不足（结构异常），回退到目标字段名列表
  if (effectiveOrder.length === 0) effectiveOrder.push(...SDB_PROCESS_FIELDS);

  const records: SdbCycleRecord[] = [];
  let hasMore = true;
  let cursor = '';

  while (hasMore) {
    const page = await cycleSheet.getRecordsAsync({ pageSize: 100, cursor });
    for (const rec of page.records) {
      const categoryVal = sdbExtractString(rec.getCellValue(categoryFieldName));
      if (!categoryVal) continue;

      const colAVal = sdbExtractString(rec.getCellValue(colAFieldName));
      const durations = new Map<string, number>();

      for (const fname of effectiveOrder) {
        const v = rec.getCellValue(fname);
        const n = (v !== null && v !== undefined) ? Number(v) : 0;
        durations.set(fname, isNaN(n) ? 0 : n);
      }

      records.push({ colAValue: colAVal, category: categoryVal, durations });
    }
    hasMore = page.hasMore;
    cursor = page.cursor ?? '';
  }

  return { records, processOrder: effectiveOrder };
}

// ---------- 核心计算（对应 VBA GetTargetDate 函数） ----------

/**
 * 通过开发类型查找 CategoryC
 * 对应 VBA 公式: INDEX(产品族对应周期!$AB:$AB, MATCH($AZ7, 产品族对应周期!$A:$A, 0), 0)
 */
function sdbGetCategory(cycleData: SdbCycleData, devType: string): string | null {
  const rec = cycleData.records.find(r => r.colAValue === devType);
  return rec ? rec.category : null;
}

/**
 * 计算某工序的最晚完成日期（逆排程）
 *
 * 步骤：
 *  1. 在 cycleData 中找最多3条 category === categoryC 的记录
 *  2. 找 processB 在有序工序列表中的索引
 *  3. 在匹配记录中找第一个该工序值 > 0 的行
 *  4. S = 该行中 processB 之后所有工序的工期之和
 *  5. 从 dateA 往前数 S 个工作日（跳过节假日/周末，补班日强制计入）
 */
function sdbCalcDate(
  dateA: Date,
  processB: string,
  categoryC: string,
  cycleData: SdbCycleData,
  holidayData: SdbHolidayData
): Date | null {
  // 1. 找最多 3 条匹配记录
  const matched: SdbCycleRecord[] = [];
  for (const r of cycleData.records) {
    if (r.category === categoryC) {
      matched.push(r);
      if (matched.length >= 3) break;
    }
  }
  if (matched.length === 0) return null;

  // 2. 找工序位置
  const processIdx = cycleData.processOrder.indexOf(processB);
  if (processIdx === -1) return null;

  // 3. 找第一个该工序 > 0 的行
  let targetRec: SdbCycleRecord | null = null;
  for (const rec of matched) {
    if ((rec.durations.get(processB) ?? 0) > 0) {
      targetRec = rec;
      break;
    }
  }
  if (!targetRec) return null;

  // 4. S = processB 之后所有工序的工期之和
  let S = 0;
  for (let i = processIdx + 1; i < cycleData.processOrder.length; i++) {
    S += targetRec.durations.get(cycleData.processOrder[i]) ?? 0;
  }

  // 5. 从 dateA 逆向回退 S 个工作日
  if (S <= 0) return new Date(dateA.getTime());

  // 用本地年月日逐天回退，避免 UTC 时区偏移导致星期几判断错误
  let current = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  let counted = 0;

  while (counted < S) {
    // 回退一天（本地午夜）
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
    const key = sdbFormatDate(current);
    const dow = current.getDay(); // 本地时间的星期，0=周日, 6=周六

    if (dow === 0 || dow === 6) {
      // 周六/周日：只有在补班列表（B列）中才算工作日
      if (holidayData.workdays.has(key)) counted++;
    } else {
      // 周一~周五：只有在法定放假列表（A列）中才跳过
      if (!holidayData.holidays.has(key)) counted++;
    }
  }

  return current;
}

// ---------- 主入口 ----------

/**
 * 安排日期按钮
 * 遍历主表全部记录，根据【TR4评审完成】日期逆推各工序最晚完成时间。
 * 每批最多100条（API限制），循环直至全部记录处理完毕。
 */
async function scheduleDateButton() {
  try {
    const base = DingdocsScript.base;
    const mainSheet = base.getActiveSheet();
    const holidaysSheet = base.getSheet('holidays');
    const cycleSheet = base.getSheet('产品族对应周期');

    if (!mainSheet) {
      return { success: false, message: '未找到当前激活的数据表，请先切换到目标数据表' };
    }
    if (mainSheet.getName() !== '排产表') {
      return { success: false, message: `当前数据表是"${mainSheet.getName()}"，请先切换到"排产表"再执行` };
    }
    if (!holidaysSheet) {
      return { success: false, message: '未找到 "holidays" 数据表，请确认表名正确' };
    }
    if (!cycleSheet) {
      return { success: false, message: '未找到 "产品族对应周期" 数据表，请确认表名正确' };
    }

    // 一次性预加载辅助数据
    const holidayData = await sdbLoadHolidayData(holidaysSheet);
    const cycleData = await sdbLoadCycleData(cycleSheet);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let hasMore = true;
    let cursor = '';

    // 分批读取 + 分批更新（每批最多100条，循环直至全部完成）
    while (hasMore) {
      const pageResult = await mainSheet.getRecordsAsync({ pageSize: 100, cursor });
      const batchUpdates: Array<{ id: string; fields: Record<string, any> }> = [];

      for (const record of pageResult.records) {
        totalProcessed++;

        // 节点刷新条件为空则跳过该行
        const refreshNode = sdbExtractString(record.getCellValue(SDB_FIELD_REFRESH_NODE));
        if (!refreshNode) { totalSkipped++; continue; }

        // 找节点在工序列表中的位置（找不到说明值填写有误，跳过）
        const refreshNodeIndex = SDB_PROCESS_FIELDS.indexOf(refreshNode);
        if (refreshNodeIndex === -1) { totalSkipped++; continue; }

        const dateA = sdbParseDate(record.getCellValue(SDB_FIELD_TR4_DATE));
        if (!dateA) { totalSkipped++; continue; }

        const devType = sdbExtractString(record.getCellValue(SDB_FIELD_DEV_TYPE));
        if (!devType) { totalSkipped++; continue; }

        const categoryC = sdbGetCategory(cycleData, devType);
        if (!categoryC) { totalSkipped++; continue; }

        // 从指定节点（含）开始往后推算并写入，之前的节点保持不变
        const fields: Record<string, any> = {};
        for (let i = refreshNodeIndex; i < SDB_PROCESS_FIELDS.length; i++) {
          const processName = SDB_PROCESS_FIELDS[i];
          const d = sdbCalcDate(dateA, processName, categoryC, cycleData, holidayData);
          if (d) {
            fields[processName] = sdbFormatDate(d) as any;
          }
        }

        if (Object.keys(fields).length > 0) {
          batchUpdates.push({ id: record.getId(), fields });
        } else {
          totalSkipped++;
        }
      }

      if (batchUpdates.length > 0) {
        await mainSheet.updateRecordsAsync(batchUpdates);
        totalUpdated += batchUpdates.length;
      }

      hasMore = pageResult.hasMore;
      cursor = pageResult.cursor ?? '';
    }

    return {
      success: true,
      message: `安排日期完成！共扫描 ${totalProcessed} 条，更新 ${totalUpdated} 条，跳过 ${totalSkipped} 条（节点刷新条件为空、节点名有误或缺少TR4日期/开发类型）`
    };
  } catch (err: any) {
    console.error('scheduleDateButton error:', err);
    return { success: false, message: `安排日期失败：${err?.message || String(err)}` };
  }
}

// ============================================================
// 注册
// ============================================================

DingdocsScript.registerScript('getDocumentInfo', getDocumentInfo);
DingdocsScript.registerScript('scheduleDateButton', scheduleDateButton);

export {};
