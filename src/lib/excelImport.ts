import ExcelJS from 'exceljs';

export interface ExcelImportReport {
  personnel: any[];
  leaves: any[];
  units: string[];
  duplicates: string[];
  discrepancies: string[];
  specializedMismatches: string[];
  countsByUnit: Record<string, { main: number; sheet: number }>;
}

export function parseExcelDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date format
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  let parts = str.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (parts) {
    return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
  }
  parts = str.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (parts) {
    return `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return str;
}

export function getCellValue(cell: any): string {
  if (!cell) return '';
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.result !== undefined && val.result !== null) {
      return String(val.result);
    }
    if (val.formula !== undefined) {
      return '';
    }
    if (Array.isArray(val.richText)) {
      return val.richText.map((t: any) => t.text || '').join('');
    }
    return JSON.stringify(val);
  }
  return String(val).trim();
}

export async function parseBrigadeExcelFile(
  file: File, 
  onProgress: (step: string) => void
): Promise<ExcelImportReport> {
  onProgress('جاري قراءة ملف الإكسل وتحميل أوراق العمل...');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  onProgress('جاري تحليل هيكل الأوراق واكتشاف الكشوفات...');
  const mainSheet = workbook.worksheets.find(s => 
    s.name.includes('كشف القوة الكلي') || 
    s.name.includes('كشف القوة') || 
    s.name.includes('الكلي') || 
    s.name.includes('القوة الكلية') || 
    s.name.includes('السجل العام')
  );

  if (!mainSheet) {
    throw new Error('لم يتم العثور على ورقة "كشف القوة الكلي" الرئيسية في الملف! يرجى التأكد من اسم ورقة العمل.');
  }

  onProgress('جاري البحث عن العناوين وتحديد موضع البيانات...');
  let headerRowIndex = -1;
  let colMap: Record<string, number> = {};
  
  for (let r = 1; r <= 15; r++) {
    const row = mainSheet.getRow(r);
    let foundKeywords = 0;
    row.eachCell((cell) => {
      const val = String(cell.value || '').trim();
      if (val.includes('الرقم العسكري') || val === 'الرقم' || val.includes('الاسم') || val.includes('الرتبة') || val.includes('الحالة')) {
        foundKeywords++;
      }
    });
    if (foundKeywords >= 2) {
      headerRowIndex = r;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || '').trim();
        if (val.includes('الرقم العسكري') || val === 'الرقم' || val === 'رقم عسكري') colMap.militaryNumber = colNumber;
        else if (val.includes('الاسم')) colMap.fullName = colNumber;
        else if (val.includes('الرتبة')) colMap.rank = colNumber;
        else if (val.includes('المنصب') || val.includes('الوظيفة') || val.includes('العمل')) colMap.position = colNumber;
        else if (val.includes('الحالة')) colMap.status = colNumber;
        else if (val.includes('الكتيبة') || val.includes('اللواء')) colMap.battalion = colNumber;
        else if (val.includes('السرية')) colMap.company = colNumber;
        else if (val.includes('الفصيل') || val.includes('الجهة')) colMap.platoon = colNumber;
        else if (val.includes('ملاحظات') || val.includes('الملاحظات') || val.includes('ملاحظة')) colMap.notes = colNumber;
      });
      break;
    }
  }

  const finalColMap = {
    militaryNumber: colMap.militaryNumber || 1,
    fullName: colMap.fullName || 2,
    rank: colMap.rank || 3,
    position: colMap.position || 4,
    status: colMap.status || 5,
    battalion: colMap.battalion || 6,
    company: colMap.company || 7,
    platoon: colMap.platoon || 8,
    notes: colMap.notes || 9
  };

  onProgress('جاري قراءة سجلات القوة الكلية وتحويل الحالات عسكرياً...');
  const parsedPersonnel: any[] = [];
  const militaryNumbersSet = new Set<string>();
  const duplicates: string[] = [];

  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 2;
  const totalRowsCount = mainSheet.rowCount;

  for (let r = startRow; r <= totalRowsCount; r++) {
    const row = mainSheet.getRow(r);
    
    const rawMilNum = getCellValue(row.getCell(finalColMap.militaryNumber));
    const milNum = rawMilNum.replace(/\D/g, '');
    
    const fullName = getCellValue(row.getCell(finalColMap.fullName));
    if (!milNum && !fullName) continue;
    
    if (!milNum) continue;

    if (militaryNumbersSet.has(milNum)) {
      duplicates.push(`تكرر الرقم العسكري ${milNum} للفرد "${fullName}" في السطر ${r}`);
      continue;
    }
    militaryNumbersSet.add(milNum);

    const rawRank = getCellValue(row.getCell(finalColMap.rank));
    const rawStatus = getCellValue(row.getCell(finalColMap.status));
    const rawBattalion = getCellValue(row.getCell(finalColMap.battalion));
    const rawCompany = getCellValue(row.getCell(finalColMap.company));
    const rawPlatoon = getCellValue(row.getCell(finalColMap.platoon));
    const rawPosition = getCellValue(row.getCell(finalColMap.position));
    const rawNotes = getCellValue(row.getCell(finalColMap.notes));

    let finalStatus: 'موجود' | 'إجازة' | 'غياب' | 'مريض' | 'إذن' = 'موجود';
    const st = rawStatus.toLowerCase();
    if (st.includes('على القوة') || st.includes('موجود') || st.includes('حاضر') || st.includes('عمل') || st.includes('خدمة')) {
      finalStatus = 'موجود';
    } else if (st.includes('إجازة') || st.includes('مجاز') || st.includes('اجازه')) {
      finalStatus = 'إجازة';
    } else if (st.includes('غياب') || st.includes('متغيب') || st.includes('تأخير') || st.includes('تخلف') || st.includes('فرار')) {
      finalStatus = 'غياب';
    } else if (st.includes('مريض') || st.includes('مرض') || st.includes('مستشفى') || st.includes('طبي') || st.includes('مصاب')) {
      finalStatus = 'مريض';
    } else {
      finalStatus = 'إذن';
    }

    let finalUnit = 'هيئة القيادة';
    const comp = rawCompany || rawBattalion || '';
    if (comp.includes('الاولى') || comp.includes('الأولى')) finalUnit = 'السرية الأولى';
    else if (comp.includes('الثانية') || comp.includes('الثانية')) finalUnit = 'السرية الثانية';
    else if (comp.includes('الثالثة') || comp.includes('الثالثة')) finalUnit = 'السرية الثالثة';
    else if (comp.includes('القيادة') || comp.includes('هيئة')) finalUnit = 'هيئة القيادة';
    else if (comp) finalUnit = comp;

    let finalPlatoon = undefined;
    const plat = rawPlatoon || '';
    if (plat.includes('الأول') || plat.includes('الاول')) finalPlatoon = 'الفصيل الأول';
    else if (plat.includes('الثاني') || plat.includes('الثاني')) finalPlatoon = 'الفصيل الثاني';
    else if (plat.includes('الثالث') || plat.includes('الثالث')) finalPlatoon = 'الفصيل الثالث';

    let finalNotes = rawNotes;
    if (rawStatus && finalStatus === 'إذن') {
      finalNotes = finalNotes ? `${finalNotes} [الحالة بالأصل: ${rawStatus}]` : `[الحالة بالأصل: ${rawStatus}]`;
    }
    if (rawPosition) {
      finalNotes = finalNotes ? `${finalNotes} - المنصب: ${rawPosition}` : `المنصب: ${rawPosition}`;
    }

    parsedPersonnel.push({
      militaryNumber: milNum,
      fullName,
      rank: rawRank || 'جندي',
      unit: finalUnit,
      platoon: finalPlatoon,
      status: finalStatus,
      leaveBalance: 30,
      notes: finalNotes || ''
    });
  }

  onProgress('جاري البحث وتحليل الكشوفات المتخصصة وعلاقات الإجازات...');
  const parsedLeaves: any[] = [];
  const specializedMismatches: string[] = [];

  const leavesSheet = workbook.worksheets.find(s => 
    s.name.includes('الإجازات') || 
    s.name.includes('الاجازات') || 
    s.name.includes('كشف الإجازات')
  );

  if (leavesSheet) {
    let leavesHeaderIndex = -1;
    let leavesColMap: Record<string, number> = {};

    for (let r = 1; r <= 10; r++) {
      const row = leavesSheet.getRow(r);
      let found = 0;
      row.eachCell((cell) => {
        const val = String(cell.value || '').trim();
        if (val.includes('الرقم') || val.includes('الاسم') || val.includes('البدء') || val.includes('تاريخ')) {
          found++;
        }
      });
      if (found >= 2) {
        leavesHeaderIndex = r;
        row.eachCell((cell, colNum) => {
          const val = String(cell.value || '').trim();
          if (val.includes('الرقم') || val.includes('رقم')) leavesColMap.militaryNumber = colNum;
          else if (val.includes('نوع') || val.includes('النوع')) leavesColMap.leaveType = colNum;
          else if (val.includes('البدء') || val.includes('بداية') || val.includes('من')) leavesColMap.startDate = colNum;
          else if (val.includes('الانتهاء') || val.includes('نهاية') || val.includes('إلى') || val.includes('الي')) leavesColMap.endDate = colNum;
          else if (val.includes('الأيام') || val.includes('المدة') || val.includes('يوم')) leavesColMap.daysCount = colNum;
        });
        break;
      }
    }

    const fLeavesColMap = {
      militaryNumber: leavesColMap.militaryNumber || 1,
      leaveType: leavesColMap.leaveType || 3,
      startDate: leavesColMap.startDate || 4,
      endDate: leavesColMap.endDate || 5,
      daysCount: leavesColMap.daysCount || 6
    };

    const leavesStartRow = leavesHeaderIndex !== -1 ? leavesHeaderIndex + 1 : 2;
    for (let r = leavesStartRow; r <= leavesSheet.rowCount; r++) {
      const row = leavesSheet.getRow(r);
      const rawMilNum = getCellValue(row.getCell(fLeavesColMap.militaryNumber));
      const milNum = rawMilNum.replace(/\D/g, '');
      if (!milNum) continue;

      const person = parsedPersonnel.find(p => p.militaryNumber === milNum);
      if (person && person.status !== 'إجازة') {
        specializedMismatches.push(`الفرد "${person.fullName}" (${milNum}) مسجل في كشف الإجازات ولكنه مقيد بـ [${person.status}] في الكشف الكلي.`);
      }

      const rawLeaveType = getCellValue(row.getCell(fLeavesColMap.leaveType));
      const rawStart = row.getCell(fLeavesColMap.startDate).value;
      const rawEnd = row.getCell(fLeavesColMap.endDate).value;
      const rawDays = getCellValue(row.getCell(fLeavesColMap.daysCount));

      let finalLeaveType: 'استحقاقه' | 'مرضية' | 'طارئة' | 'إذن' = 'استحقاقه';
      if (rawLeaveType.includes('مرض')) finalLeaveType = 'مرضية';
      else if (rawLeaveType.includes('طارئ') || rawLeaveType.includes('اضطرار')) finalLeaveType = 'طارئة';
      else if (rawLeaveType.includes('إذن') || rawLeaveType.includes('رخصة')) finalLeaveType = 'إذن';

      const startDateStr = parseExcelDate(rawStart) || new Date().toISOString().split('T')[0];
      const endDateStr = parseExcelDate(rawEnd) || new Date().toISOString().split('T')[0];
      const daysCount = Number(rawDays) || Math.max(1, Math.ceil((new Date(endDateStr).getTime() - new Date(startDateStr).getTime()) / (1000 * 60 * 60 * 24)) + 1);

      parsedLeaves.push({
        militaryNumber: milNum,
        leaveType: finalLeaveType,
        startDate: startDateStr,
        endDate: endDateStr,
        daysCount,
        cutSubmitted: false,
        returnSubmitted: false
      });
    }
  }

  const absentSheet = workbook.worksheets.find(s => s.name.includes('الغياب') || s.name.includes('غياب'));
  if (absentSheet) {
    for (let r = 2; r <= absentSheet.rowCount; r++) {
      const row = absentSheet.getRow(r);
      const rawMilNum = getCellValue(row.getCell(1));
      const milNum = rawMilNum.replace(/\D/g, '');
      if (!milNum) continue;
      const person = parsedPersonnel.find(p => p.militaryNumber === milNum);
      if (person && person.status !== 'غياب') {
        specializedMismatches.push(`الفرد "${person.fullName}" (${milNum}) مدرج في كشف الغياب ولكن حالته في الكشف الكلي هي [${person.status}].`);
      }
    }
  }

  onProgress('جاري فحص سلامة المطابقة الإحصائية في الأوراق الـ 60 للوحدات...');
  const discrepancies: string[] = [];
  const countsByUnit: Record<string, { main: number; sheet: number }> = {};

  for (const sheet of workbook.worksheets) {
    const name = sheet.name;
    if (
      name.includes('كشف القوة') || 
      name.includes('لوحة') || 
      name.includes('إحصائية') || 
      name.includes('الغياب') || 
      name.includes('الإجازات') || 
      name.includes('المرضى') || 
      name.includes('المستجدين') || 
      name.includes('الرئيسية') ||
      name.includes('السجل العام')
    ) {
      continue;
    }

    const mNumsInSheet = new Set<string>();
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      row.eachCell((cell) => {
        const strVal = String(cell.value || '').trim();
        const numeric = strVal.replace(/\D/g, '');
        if (numeric.length >= 4 && numeric.length <= 8 && !isNaN(Number(numeric))) {
          mNumsInSheet.add(numeric);
        }
      });
    }

    const sheetPeopleCount = mNumsInSheet.size;
    if (sheetPeopleCount === 0) continue;

    let matchedUnit = 'هيئة القيادة';
    if (name.includes('الاولى') || name.includes('الأولى') || name.includes('س1')) matchedUnit = 'السرية الأولى';
    else if (name.includes('الثانية') || name.includes('الثانية') || name.includes('س2')) matchedUnit = 'السرية الثانية';
    else if (name.includes('الثالثة') || name.includes('الثالثة') || name.includes('س3')) matchedUnit = 'السرية الثالثة';
    else if (name.includes('القيادة') || name.includes('قيادة')) matchedUnit = 'هيئة القيادة';

    const mainUnitPeopleCount = parsedPersonnel.filter(p => p.unit === matchedUnit).length;

    countsByUnit[name] = {
      main: mainUnitPeopleCount,
      sheet: sheetPeopleCount
    };

    if (sheetPeopleCount !== mainUnitPeopleCount) {
      discrepancies.push(`ورقة التفاصيل [${name}]: تحتوي على (${sheetPeopleCount}) فرداً مكتوباً، بينما سجلات الكشف الكلي للوحدة المطابقة [${matchedUnit}] تبلغ (${mainUnitPeopleCount}) فرداً.`);
    }
  }

  onProgress('تم الانتهاء بنجاح!');
  return {
    personnel: parsedPersonnel,
    leaves: parsedLeaves,
    units: Array.from(new Set(parsedPersonnel.map(p => p.unit))),
    duplicates,
    discrepancies,
    specializedMismatches,
    countsByUnit
  };
}
