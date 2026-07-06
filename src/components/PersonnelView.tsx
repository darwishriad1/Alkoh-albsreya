/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Personnel, PersonnelStatus, MILITARY_RANKS, BRIGADE_UNITS, PLATOONS, STATUS_METADATA } from '../types';
import { 
  getAllFromStore, 
  addPersonnel, 
  updatePersonnel, 
  deletePersonnel, 
  bulkUpdateStatus, 
  bulkDeletePersonnel,
  addToStore,
  putInStore,
  syncAllPersonnelStatus,
  openDB,
  writeAuditLog
} from '../lib/db';
import { 
  Search, Filter, Plus, Edit, Trash2, CreditCard, ChevronDown, CheckSquare, 
  Square, Download, X, AlertTriangle, Users, FileSpreadsheet, Upload, 
  CheckCircle, RefreshCw, FileWarning, ShieldCheck, AlertCircle, Database, 
  Sparkles, Cpu, Layers, Activity, ShieldAlert
} from 'lucide-react';
import IdCardModal from './IdCardModal';
import { parseBrigadeExcelFile, ExcelImportReport } from '../lib/excelImport';

interface PersonnelViewProps {
  currentUser: { username: string; role: string };
}

export default function PersonnelView({ currentUser }: PersonnelViewProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Form Modal/Drawer State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingPerson, setEditingPerson] = useState<Personnel | null>(null);

  // Form Fields
  const [militaryNumber, setMilitaryNumber] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [rank, setRank] = useState<string>(MILITARY_RANKS[0]);
  const [unit, setUnit] = useState<string>(BRIGADE_UNITS[0]);
  const [platoon, setPlatoon] = useState<string>('');
  const [status, setStatus] = useState<PersonnelStatus>('موجود');
  const [leaveBalance, setLeaveBalance] = useState<number>(30);
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatusOpen, setBulkStatusOpen] = useState<boolean>(false);

  // ID Card Modal
  const [activeCardPerson, setActiveCardPerson] = useState<Personnel | null>(null);

  // Excel Import States
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState<boolean>(false);
  const [isExcelParsing, setIsExcelParsing] = useState<boolean>(false);
  const [excelStep, setExcelStep] = useState<string>('');
  const [excelFileName, setExcelFileName] = useState<string>('');
  const [excelReport, setExcelReport] = useState<ExcelImportReport | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [reportTab, setReportTab] = useState<'summary' | 'duplicates' | 'discrepancies'>('summary');
  const [isExcelDragging, setIsExcelDragging] = useState<boolean>(false);
  const [excelImportError, setExcelImportError] = useState<string>('');
  const [excelImportSuccess, setExcelImportSuccess] = useState<string>('');
  const [isCommittingImport, setIsCommittingImport] = useState<boolean>(false);

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';
  const isAdmin = currentUser.role === 'admin';

  // Load Personnel list
  const loadData = async () => {
    try {
      const data = await getAllFromStore<Personnel>('personnel');
      setPersonnel(data);
    } catch (err) {
      console.error('Failed to load personnel data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleDbChange = () => {
      loadData();
    };
    // Polling as reliable fallback for real-time Sync
    const timer = window.setInterval(loadData, 1500);
    return () => clearInterval(timer);
  }, []);

  // Filter and search logic
  const filteredPersonnel = personnel.filter(p => {
    const matchesSearch = p.fullName.includes(searchQuery) || p.militaryNumber.includes(searchQuery);
    const matchesUnit = filterUnit === 'all' || p.unit === filterUnit;
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesUnit && matchesStatus;
  });

  // Handle Multi-Selection Checkboxes
  const handleSelectAll = () => {
    if (selectedIds.length === filteredPersonnel.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPersonnel.map(p => p.id!).filter(Boolean));
    }
  };

  const handleSelectRow = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Open Form Drawer
  const handleOpenAddForm = () => {
    if (!canEdit) return;
    setEditingPerson(null);
    setMilitaryNumber('');
    setFullName('');
    setRank(MILITARY_RANKS[0]);
    setUnit(BRIGADE_UNITS[0]);
    setPlatoon('');
    setStatus('موجود');
    setLeaveBalance(30);
    setNotes('');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (p: Personnel) => {
    if (!canEdit) return;
    setEditingPerson(p);
    setMilitaryNumber(p.militaryNumber);
    setFullName(p.fullName);
    setRank(p.rank);
    setUnit(p.unit);
    setPlatoon(p.platoon || '');
    setStatus(p.status);
    setLeaveBalance(p.leaveBalance);
    setNotes(p.notes || '');
    setFormError('');
    setIsFormOpen(true);
  };

  // Save Form Handler
  const handleSavePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!militaryNumber.trim() || !fullName.trim()) {
      setFormError('يرجى ملء جميع الحقول الإلزامية (الرقم العسكري والاسم الكامل).');
      return;
    }

    // Check military number uniqueness
    const duplicate = personnel.find(p => p.militaryNumber === militaryNumber && (!editingPerson || p.id !== editingPerson.id));
    if (duplicate) {
      setFormError('الرقم العسكري المدخل مسجل بالفعل لفرد آخر!');
      return;
    }

    // Command Staff cannot have a platoon
    const finalPlatoon = unit === 'هيئة القيادة' ? undefined : (platoon || undefined);

    const personData: Personnel = {
      ...(editingPerson && { id: editingPerson.id }),
      militaryNumber: militaryNumber.trim(),
      fullName: fullName.trim(),
      rank,
      unit,
      platoon: finalPlatoon,
      status,
      leaveBalance: Number(leaveBalance) || 30,
      notes: notes.trim() || undefined
    };

    try {
      if (editingPerson) {
        await updatePersonnel(personData, currentUser.username);
      } else {
        await addPersonnel(personData, currentUser.username);
      }
      setIsFormOpen(false);
      loadData();
    } catch (err: any) {
      setFormError('فشل حفظ البيانات: ' + err.message);
    }
  };

  // Delete Individual Handler
  const handleDeletePerson = async (id: number) => {
    if (!canEdit) return;
    if (confirm('هل أنت متأكد من حذف هذا الفرد؟ سيؤدي ذلك لحذف كافة إجازاته وتحضيراته اليومية بشكل نهائي!')) {
      try {
        await deletePersonnel(id, currentUser.username);
        setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
        loadData();
      } catch (err: any) {
        alert('فشل عملية الحذف: ' + err.message);
      }
    }
  };

  // Bulk Status Change
  const handleBulkStatusChange = async (newStatus: PersonnelStatus) => {
    if (!canEdit || selectedIds.length === 0) return;
    try {
      await bulkUpdateStatus(selectedIds, newStatus, currentUser.username);
      setBulkStatusOpen(false);
      setSelectedIds([]);
      loadData();
    } catch (err: any) {
      alert('فشل التعديل الجماعي: ' + err.message);
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (!canEdit || selectedIds.length === 0) return;
    if (confirm(`هل أنت متأكد من حذف عدد (${selectedIds.length}) أفراد محددين نهائياً مع كافة سجلاتهم المتصلة؟`)) {
      try {
        await bulkDeletePersonnel(selectedIds, currentUser.username);
        setSelectedIds([]);
        loadData();
      } catch (err: any) {
        alert('فشل الحذف الجماعي: ' + err.message);
      }
    }
  };

  // Export CSV Helper with UTF-8 BOM to display Arabic perfectly in MS Excel
  const handleExportCSV = () => {
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'الرقم العسكري,الرتبة,الاسم الكامل,الوحدة,الفصيل,الحالة الحالية,رصيد الإجازات المتبقي,ملاحظات\n';

    filteredPersonnel.forEach(p => {
      const row = [
        p.militaryNumber,
        p.rank,
        p.fullName,
        p.unit,
        p.platoon || 'بلا فصيل (هيئة قيادة)',
        p.status,
        p.leaveBalance,
        p.notes || ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `كشف_القوة_البشرية_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel drag and drop handlers
  const handleExcelDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canEdit) {
      setIsExcelDragging(true);
    }
  };

  const handleExcelDragLeave = () => {
    setIsExcelDragging(false);
  };

  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsExcelDragging(false);

    if (canEdit) {
      const file = e.dataTransfer.files?.[0];
      if (file) {
        parseExcelFile(file);
      }
    }
  };

  const parseExcelFile = async (file: File) => {
    setIsExcelParsing(true);
    setExcelImportError('');
    setExcelImportSuccess('');
    setExcelReport(null);
    setExcelFileName(file.name);

    try {
      const report = await parseBrigadeExcelFile(file, (step) => {
        setExcelStep(step);
      });
      setExcelReport(report);
      setExcelImportSuccess('تم تحليل ملف "نظام اللواء .xlsx" بنجاح وعرض تقرير التحقق المزدوج والتكامل!');
    } catch (err: any) {
      setExcelImportError('فشل تحليل ملف الإكسل: ' + err.message);
    } finally {
      setIsExcelParsing(false);
    }
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseExcelFile(file);
    }
  };

  const triggerExcelFileSelect = () => {
    if (!canEdit) {
      alert('صلاحية الاستيراد مقيدة للمسؤولين ومعدي البيانات فقط!');
      return;
    }
    excelFileInputRef.current?.click();
  };

  const handleCommitExcelImport = async () => {
    if (!excelReport) return;
    setIsCommittingImport(true);
    setExcelImportError('');
    setExcelImportSuccess('');

    try {
      const db = await openDB();
      const currentUserUsername = currentUser.username;

      if (importMode === 'overwrite') {
        const stores = ['personnel', 'leaves', 'attendance', 'duties'];
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(s => tx.objectStore(s).clear());
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }

      const personnelStore = 'personnel';
      const existingPersonnel = await getAllFromStore<any>('personnel');
      const existingMap = new Map<string, any>();
      existingPersonnel.forEach(p => existingMap.set(p.militaryNumber, p));

      for (const p of excelReport.personnel) {
        const match = existingMap.get(p.militaryNumber);
        if (match) {
          const updatedPerson = { ...match, ...p };
          await putInStore(personnelStore, updatedPerson);
        } else {
          await addToStore(personnelStore, p);
        }
      }

      const updatedPersonnelList = await getAllFromStore<any>('personnel');
      const milNumToDbIdMap = new Map<string, number>();
      updatedPersonnelList.forEach(p => {
        if (p.id) milNumToDbIdMap.set(p.militaryNumber, p.id);
      });

      const leavesStore = 'leaves';
      if (importMode === 'overwrite') {
        for (const l of excelReport.leaves) {
          const pId = milNumToDbIdMap.get(l.militaryNumber);
          if (pId) {
            const leaveRecord = {
              personnelId: pId,
              leaveType: l.leaveType,
              startDate: l.startDate,
              endDate: l.endDate,
              daysCount: l.daysCount,
              cutSubmitted: l.cutSubmitted,
              returnSubmitted: l.returnSubmitted
            };
            await addToStore(leavesStore, leaveRecord);
          }
        }
      } else {
        const existingLeaves = await getAllFromStore<any>('leaves');
        for (const l of excelReport.leaves) {
          const pId = milNumToDbIdMap.get(l.militaryNumber);
          if (pId) {
            const isDuplicate = existingLeaves.some(el => 
              el.personnelId === pId && 
              el.startDate === l.startDate && 
              el.endDate === l.endDate
            );
            if (!isDuplicate) {
              const leaveRecord = {
                personnelId: pId,
                leaveType: l.leaveType,
                startDate: l.startDate,
                endDate: l.endDate,
                daysCount: l.daysCount,
                cutSubmitted: l.cutSubmitted,
                returnSubmitted: l.returnSubmitted
              };
              await addToStore(leavesStore, leaveRecord);
            }
          }
        }
      }

      await syncAllPersonnelStatus();

      await writeAuditLog(
        'استيراد إكسل', 
        `تم استيراد ${excelReport.personnel.length} فرداً و ${excelReport.leaves.length} إجازة من ملف "${excelFileName}" بنجاح (${importMode === 'overwrite' ? 'استبدال كامل' : 'دمج وإضافة'}).`, 
        currentUserUsername
      );

      setExcelImportSuccess(`تمت عملية الاستيراد والتزامن العسكري بنجاح! تم حفظ عدد (${excelReport.personnel.length}) فرداً و (${excelReport.leaves.length}) سجل إجازة.`);
      setExcelReport(null);
      setIsExcelImportOpen(false);
      loadData();
    } catch (err: any) {
      setExcelImportError('فشل إتمام حفظ البيانات المستوردة: ' + err.message);
    } finally {
      setIsCommittingImport(false);
    }
  };

  return (
    <div id="personnel-view-container" className="space-y-3.5">
      {/* 📊 Database Analytics Dashboard - Compact & Premium */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-2xs flex items-center gap-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700">
          <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-850">
            <Users className="w-5 h-5" />
          </div>
          <div className="truncate">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block leading-tight">إجمالي القوة المسجلة</span>
            <span className="text-xs font-black text-slate-800 dark:text-slate-100 font-mono leading-none mt-1 inline-block">
              {personnel.length} <span className="text-[10px] font-extrabold text-slate-400">فرد</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-2xs flex items-center gap-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700">
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <div className="truncate">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block leading-tight">المتواجدون بالخدمة</span>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono leading-none mt-1 inline-block">
              {personnel.filter(p => p.status === 'موجود').length} <span className="text-[10px] font-extrabold text-slate-400">فرد</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-2xs flex items-center gap-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/20">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <div className="truncate">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block leading-tight">المقيدون في إجازة</span>
            <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono leading-none mt-1 inline-block">
              {personnel.filter(p => p.status === 'إجازة').length} <span className="text-[10px] font-extrabold text-slate-400">فرد</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-2xs flex items-center gap-2.5 transition-all hover:border-slate-300 dark:hover:border-slate-700 col-span-2 lg:col-span-1">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/20">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <div className="truncate">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block leading-tight">غياب وإذن وحالات أخرى</span>
            <span className="text-xs font-black text-amber-600 dark:text-amber-400 font-mono leading-none mt-1 inline-block">
              {personnel.filter(p => p.status !== 'موجود' && p.status !== 'إجازة').length} <span className="text-[10px] font-extrabold text-slate-400">فرد</span>
            </span>
          </div>
        </div>
      </div>

      {/* Action & Filter bar - Compact & Mobile Optimized */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="search-input"
                type="text"
                placeholder="ابحث بالاسم أو الرقم العسكري..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 dark:text-slate-100 transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Unit filter */}
            <div className="relative">
              <select
                id="unit-filter"
                value={filterUnit}
                onChange={(e) => setFilterUnit(e.target.value)}
                className="w-full appearance-none pl-8 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
              >
                <option value="all">كافة الوحدات</option>
                {BRIGADE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Status Dropdown - kept as fallback & visual label */}
            <div className="relative block sm:hidden">
              <select
                id="status-filter"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full appearance-none pl-8 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
              >
                <option value="all">كافة الحالات</option>
                <option value="موجود">موجود</option>
                <option value="إجازة">إجازة</option>
                <option value="غياب">غياب</option>
                <option value="مريض">مريض</option>
                <option value="إذن">إذن</option>
              </select>
              <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
            {/* CSV export */}
            <button
              id="csv-export-btn"
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-250 dark:border-slate-850 rounded-xl cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تصدير CSV</span>
              <span className="sm:hidden">تصدير</span>
            </button>

            {/* Excel Import button */}
            {canEdit && (
              <button
                id="excel-import-trigger-btn"
                onClick={() => setIsExcelImportOpen(!isExcelImportOpen)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-xl border cursor-pointer transition-all ${
                  isExcelImportOpen 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-550' 
                    : 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.09] dark:bg-emerald-500/[0.01] dark:hover:bg-emerald-500/[0.06] border-emerald-500/20 hover:border-emerald-500/40'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">استيراد إكسل</span>
                <span className="sm:hidden">استيراد</span>
              </button>
            )}

            {/* Add member button */}
            {canEdit && (
              <button
                id="add-member-btn"
                onClick={handleOpenAddForm}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة فرد</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Interactive Filter Chips - Extremely professional and helpful */}
        <div className="hidden sm:flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-850 pt-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-2 whitespace-nowrap">تصفية سريعة حسب الحالة:</span>
          {[
            { value: 'all', label: 'كافة القوة البشرية', count: personnel.length },
            { value: 'موجود', label: 'موجودون بالتحضير', count: personnel.filter(p => p.status === 'موجود').length },
            { value: 'إجازة', label: 'إجازات رسمية', count: personnel.filter(p => p.status === 'إجازة').length },
            { value: 'غياب', label: 'غياب مسجل', count: personnel.filter(p => p.status === 'غياب').length },
            { value: 'مريض', label: 'مريض بتقرير', count: personnel.filter(p => p.status === 'مريض').length },
            { value: 'إذن', label: 'مأذون مؤقت', count: personnel.filter(p => p.status === 'إذن').length },
          ].map((chip) => {
            const isSelected = filterStatus === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setFilterStatus(chip.value)}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected 
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-900/40 font-black' 
                    : 'bg-slate-50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850'
                }`}
              >
                <span>{chip.label}</span>
                <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}>
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 🟢 Excel Import Panel (نظام اللواء .xlsx) */}
      {isExcelImportOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-emerald-500/40 dark:border-emerald-500/20 p-4 shadow-md space-y-4 animate-fadeIn text-right">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="space-y-1 text-right w-full sm:w-auto">
              <h2 className="font-extrabold text-emerald-800 dark:text-emerald-400 text-sm flex items-center gap-2 justify-end">
                <span>بوابة استيراد البيانات من ملف "نظام اللواء .xlsx"</span>
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 animate-pulse" />
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                قم برفع الملف العسكري "نظام اللواء .xlsx" لتحديث كشف القوة الكلي، واستخراج الإجازات تلقائياً، والتحقق المزدوج من مطابقة السرايا والوحدات الـ 60.
              </p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-md font-bold">
                محرك دمج ذكي نشط
              </span>
            </div>
          </div>

          {excelImportError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/30 rounded-xl text-xs font-bold flex items-center gap-2 justify-end text-right">
              <span>{excelImportError}</span>
              <FileWarning className="w-4 h-4 shrink-0" />
            </div>
          )}

          {excelImportSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-900/30 rounded-xl text-xs font-bold flex items-center gap-2 justify-end text-right">
              <span>{excelImportSuccess}</span>
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            </div>
          )}

          {/* Drag & Drop Zone or Parsing State */}
          {isExcelParsing ? (
            <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-950/20 border-2 border-dashed border-emerald-300 dark:border-emerald-900 rounded-xl flex flex-col items-center justify-center space-y-3 min-h-[170px] animate-pulse">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                  {excelStep}
                </p>
                <p className="text-[10px] text-slate-400">
                  جاري مسح ومعالجة الـ 60 ورقة عمل والتحقق من التناسق والتكامل الداخلي لكشوفات اللواء...
                </p>
              </div>
            </div>
          ) : !excelReport ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Upload Zone */}
              <div className="md:col-span-2">
                <div
                  id="excel-drag-drop-zone"
                  onDragOver={handleExcelDragOver}
                  onDragLeave={handleExcelDragLeave}
                  onDrop={handleExcelDrop}
                  onClick={triggerExcelFileSelect}
                  className={`border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center space-y-3 cursor-pointer transition-all min-h-[170px] ${
                    isExcelDragging 
                      ? 'border-emerald-500 bg-emerald-500/[0.04]'
                      : 'border-slate-250 dark:border-slate-800 hover:border-emerald-500/40 bg-slate-50/50 dark:bg-slate-950/20 hover:bg-slate-100/30'
                  }`}
                >
                  <Upload className={`w-10 h-10 ${isExcelDragging ? 'text-emerald-500' : 'text-slate-400'}`} />
                  
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200">
                      اسحب ملف "نظام اللواء .xlsx" وأفلته هنا للتحليل والمطابقة
                    </p>
                    <p className="text-[10px] text-slate-400 leading-normal max-w-md mx-auto">
                      أو اضغط لتصفح الملف يدويًا من جهازك. سيقوم النظام بقراءة كشف القوة الكلي وأوراق الوحدات واستخراج كشوف الإجازات بدقة عسكرية فائقة.
                    </p>
                  </div>

                  <input
                    ref={excelFileInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleExcelFileChange}
                    disabled={isExcelParsing}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Quick Info Side Card */}
              <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-150 dark:border-slate-850 flex flex-col justify-between text-right">
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 justify-end">
                    شروط وقواعد الاستيراد الناجح
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  </h3>
                  <ul className="text-[10px] text-slate-500 dark:text-slate-400 space-y-2 pl-4 list-disc leading-relaxed pr-3">
                    <li>يجب أن يحتوي الملف على ورقة رئيسية باسم <strong>"كشف القوة الكلي"</strong>.</li>
                    <li>الأرقام العسكرية هي مفتاح الدمج والتحديث الأساسي للأفراد.</li>
                    <li>ورقة <strong>"الإجازات"</strong> يتم فحصها آلياً لجدولة وتوثيق الإجازات النشطة لكل فرد تلقائياً.</li>
                  </ul>
                </div>
                
                <div className="text-[9px] text-slate-400 mt-3 border-t border-slate-200/55 dark:border-slate-800 pt-2">
                  * متاح لحسابات معدي البيانات والمسؤولين. سيتم إدراج تقرير الاستيراد في سجل العمليات تلقائياً.
                </div>
              </div>
            </div>
          ) : (
            /* Report & Save Option View */
            <div className="space-y-4 animate-fadeIn text-right">
              {/* Header statistics of parsed file */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-150 dark:border-slate-850 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-850 px-3 py-1.5 rounded-lg text-center">
                    <span className="text-[9px] block text-slate-400 leading-tight">سجلات القوة الكلية</span>
                    <span className="text-xs font-black font-mono text-slate-700 dark:text-slate-250">{excelReport.personnel.length} فرد</span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-850 px-3 py-1.5 rounded-lg text-center">
                    <span className="text-[9px] block text-slate-400 leading-tight">الإجازات المكتشفة</span>
                    <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">{excelReport.leaves.length} سجل</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
                      تقرير معالجة الملف: <span className="font-mono text-emerald-600 dark:text-emerald-400">{excelFileName}</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      تم اكتشاف عدد <strong className="text-slate-600 dark:text-slate-300 font-mono">{excelReport.units.length}</strong> وحدات/سرايا مختلفة و <strong className="text-slate-600 dark:text-slate-300 font-mono">{excelReport.leaves.length}</strong> سجل إجازة عسكرية نشطة.
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">
                    📊
                  </div>
                </div>
              </div>

              {/* Mode selection & Commit block */}
              <div className="bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-250 dark:border-emerald-900/30 p-3.5 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Import Mode Selector */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode('merge')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        importMode === 'merge'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      دمج وتحديث السجلات
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('overwrite')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        importMode === 'overwrite'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      استبدال كامل (مسح وإعادة تحميل)
                    </button>
                  </div>

                  <div className="space-y-0.5">
                    <h4 className="text-xs font-black text-emerald-800 dark:text-emerald-400">طريقة دمج وحفظ البيانات المستوردة:</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      حدد كيفية تفاعل السجلات المستوردة مع البيانات الحالية المسجلة بالمتصفح.
                    </p>
                  </div>
                </div>

                {/* Warning label based on mode */}
                <div className="p-2.5 rounded-lg text-[10px] font-bold leading-normal flex items-center gap-1.5 justify-end bg-white/70 dark:bg-slate-900/60">
                  {importMode === 'overwrite' ? (
                    <>
                      <span className="text-rose-700 dark:text-rose-400">
                        تحذير خطير: سيقوم هذا الإجراء بتصفير قاعدة البيانات ومسح كافة السرايا الحالية والتحضيرات التاريخية واستبدالها كلياً ببيانات هذا الملف!
                      </span>
                      <span className="text-rose-500 font-extrabold">⚠️ تنبيه أمني:</span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-600 dark:text-slate-400 font-bold">
                        دمج آمن: سيتم الحفاظ على سجلات التحضير والخدمات التاريخية الحالية، مع إدراج الأفراد الجدد وتحديث بيانات الحاليين المطابقين للرقم العسكري.
                      </span>
                      <span className="text-emerald-600 font-extrabold">✓ خيار آمن:</span>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 justify-end">
                  <button
                    type="button"
                    onClick={() => setExcelReport(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    إلغاء وتجاهل الملف
                  </button>
                  <button
                    type="button"
                    onClick={handleCommitExcelImport}
                    disabled={isCommittingImport}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-550 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isCommittingImport ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        جاري معالجة وتثبيت البيانات...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        تثبيت وحفظ البيانات المستوردة
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Validation tabs & lists */}
              <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                {/* Tab selector */}
                <div className="flex border-b border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'summary', label: 'قوام السرايا المستوردة', icon: Users, badge: excelReport.units.length },
                    { id: 'discrepancies', label: 'تحذيرات عدم المطابقة والتكامل', icon: AlertTriangle, badge: excelReport.discrepancies.length, color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400' },
                    { id: 'leaves', label: 'سجلات الإجازات المكتشفة', icon: CheckCircle, badge: excelReport.leaves.length },
                    { id: 'duplicates', label: 'الأرقام العسكرية المكررة', icon: ShieldAlert, badge: excelReport.duplicates.length, color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400' }
                  ].map((tab) => (
                    <button
                      type="button"
                      key={tab.id}
                      onClick={() => setReportTab(tab.id as any)}
                      className={`px-4 py-2.5 text-xs font-extrabold border-b-2 flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                        reportTab === tab.id
                          ? 'border-emerald-500 text-emerald-600 bg-white dark:bg-slate-900'
                          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      <tab.icon className={`w-3.5 h-3.5 ${reportTab === tab.id ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span>{tab.label}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${tab.color || 'bg-slate-200 text-slate-700 dark:bg-slate-850 dark:text-slate-300'}`}>
                        {tab.badge}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Tab contents */}
                <div className="p-3.5 max-h-[250px] overflow-y-auto">
                  {reportTab === 'summary' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {excelReport.units.map((unit, idx) => {
                          const count = excelReport.personnel.filter(p => p.unit === unit).length;
                          return (
                            <div key={idx} className="bg-slate-50/50 dark:bg-slate-950/20 p-2.5 rounded-xl border border-slate-150 dark:border-slate-850 flex items-center justify-between">
                              <span className="text-xs font-mono font-black text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md">{count} فرد</span>
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{unit}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {reportTab === 'discrepancies' && (
                    <div className="space-y-2 text-right">
                      {excelReport.discrepancies.length === 0 && excelReport.specializedMismatches.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs flex flex-col items-center gap-2">
                          <CheckCircle className="w-8 h-8 text-emerald-500" />
                          <span>تهانينا! جميع الكشوفات متطابقة بنسبة 100% مع أوراق الوحدات التفصيلية ولا توجد أي فروقات.</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {excelReport.specializedMismatches.map((mismatch, idx) => (
                            <div key={idx} className="p-2 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 rounded-lg text-[11px] font-bold border border-rose-100 dark:border-rose-900/30 flex items-start gap-1.5 justify-end">
                              <span>{mismatch}</span>
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            </div>
                          ))}
                          {excelReport.discrepancies.map((mismatch, idx) => (
                            <div key={idx} className="p-2 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 rounded-lg text-[11px] font-bold border border-amber-100 dark:border-amber-900/30 flex items-start gap-1.5 justify-end">
                              <span>{mismatch}</span>
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {reportTab === 'leaves' && (
                    <div className="space-y-2">
                      {excelReport.leaves.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          لم يتم العثور على أي سجلات إجازات نشطة في ورقة الإجازات الخاصة بالملف المرفوع.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {excelReport.leaves.map((l, idx) => {
                            const person = excelReport.personnel.find(p => p.militaryNumber === l.militaryNumber);
                            return (
                              <div key={idx} className="bg-slate-50/50 dark:bg-slate-950/10 p-2 rounded-lg border border-slate-150 dark:border-slate-850 flex items-center justify-between text-xs">
                                <span className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-black font-mono">
                                  {l.daysCount} أيام ({l.leaveType})
                                </span>
                                <div className="space-y-0.5 text-right">
                                  <span className="font-extrabold text-slate-700 dark:text-slate-200 block">
                                    {person ? person.fullName : `فرد عسكري رقم (${l.militaryNumber})`}
                                  </span>
                                  <p className="text-[10px] text-slate-400 font-bold">
                                    من: <strong className="font-mono text-slate-600 dark:text-slate-350">{l.startDate}</strong> إلى: <strong className="font-mono text-slate-600 dark:text-slate-350">{l.endDate}</strong>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {reportTab === 'duplicates' && (
                    <div className="space-y-2">
                      {excelReport.duplicates.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs flex flex-col items-center gap-1">
                          <CheckCircle className="w-6 h-6 text-emerald-500" />
                          <span>سليم! جميع أرقام القوة فريدة تماماً ولا توجد أرقام مكررة في الملف.</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {excelReport.duplicates.map((dup, idx) => (
                            <div key={idx} className="p-2 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 rounded-lg text-[11px] font-bold border border-rose-100 dark:border-rose-900/20 flex items-start gap-1.5 justify-end">
                              <span>{dup}</span>
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk actions float panel */}
      {selectedIds.length > 0 && (
        <div id="bulk-actions-panel" className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-200 dark:border-amber-900/40 text-slate-800 dark:text-slate-200 animate-fadeIn">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
            <span>تم تحديد عدد ({selectedIds.length}) أفراد من القوة البشرية</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end relative">
            <span className="text-xs text-slate-400 ml-1">إجراء جماعي:</span>
            
            {/* Bulk status update dropdown */}
            <div className="relative">
              <button
                id="bulk-status-trigger"
                onClick={() => setBulkStatusOpen(!bulkStatusOpen)}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1"
              >
                تغيير الحالة جماعياً
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {bulkStatusOpen && (
                <div id="bulk-status-menu" className="absolute left-0 bottom-full mb-2 z-20 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 flex flex-col gap-1">
                  {(['موجود', 'إجازة', 'غياب', 'مريض', 'إذن'] as PersonnelStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleBulkStatusChange(st)}
                      className="w-full text-right px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bulk delete */}
            {canEdit && (
              <button
                id="bulk-delete-btn"
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-red-550 hover:bg-red-650 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                حذف المحدد
              </button>
            )}

            <button
              id="cancel-bulk-selection"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1.5"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* Main Personnel Table card (Hidden on mobile, visible on desktop) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold">
                <th className="py-4 px-4 w-12 text-center">
                  <button
                    id="select-all-btn"
                    onClick={handleSelectAll}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer inline-flex items-center justify-center"
                  >
                    {selectedIds.length === filteredPersonnel.length && filteredPersonnel.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-4 px-4">الرقم العسكري</th>
                <th className="py-4 px-4">الرتبة</th>
                <th className="py-4 px-4">الاسم الكامل</th>
                <th className="py-4 px-4">الوحدة / السرية</th>
                <th className="py-4 px-4">الفصيل</th>
                <th className="py-4 px-4">الحالة</th>
                <th className="py-4 px-4 text-center">رصيد الإجازات</th>
                <th className="py-4 px-4 w-32 text-left">التحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
              {filteredPersonnel.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    <Search className="w-10 h-10 mx-auto stroke-1 mb-2" />
                    <p className="text-sm font-semibold">لا يوجد نتائج تطابق معايير البحث والفلترة</p>
                  </td>
                </tr>
              ) : (
                filteredPersonnel.map((p) => {
                  const statusMeta = STATUS_METADATA[p.status];
                  const isRowSelected = selectedIds.includes(p.id!);

                  return (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors ${
                        isRowSelected ? 'bg-amber-500/5 dark:bg-amber-500/[0.03]' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <button
                          id={`select-row-${p.id}`}
                          onClick={() => handleSelectRow(p.id!)}
                          className="p-1 text-slate-400 hover:text-amber-500 rounded-md cursor-pointer inline-flex items-center justify-center"
                        >
                          {isRowSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-600 dark:text-slate-400">
                        {p.militaryNumber}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        {p.rank}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100">{p.fullName}</div>
                        {p.notes && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5 max-w-xs truncate">
                            {p.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">
                        {p.unit}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {p.platoon || <span className="text-slate-300 dark:text-slate-700">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg ${statusMeta.bg} ${statusMeta.text}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current ml-1.5"></span>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">
                        مفتوح
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="flex items-center justify-start gap-1">
                          {/* ID Card */}
                          <button
                            id={`id-card-btn-${p.id}`}
                            onClick={() => setActiveCardPerson(p)}
                            title="عرض بطاقة الهوية"
                            className="p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          {canEdit && (
                            <button
                              id={`edit-btn-${p.id}`}
                              onClick={() => handleOpenEditForm(p)}
                              title="تعديل البيانات"
                              className="p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete */}
                          {canEdit && (
                            <button
                              id={`delete-btn-${p.id}`}
                              onClick={() => handleDeletePerson(p.id!)}
                              title="حذف الفرد"
                              className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Personnel Cards (Hidden on desktop, visible on mobile) */}
      <div className="md:hidden space-y-3.5">
        {filteredPersonnel.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-150 dark:border-slate-800 text-center text-slate-400 dark:text-slate-500">
            <Search className="w-10 h-10 mx-auto stroke-1 mb-2" />
            <p className="text-sm font-semibold">لا يوجد نتائج تطابق معايير البحث والفلترة</p>
          </div>
        ) : (
          filteredPersonnel.map((p) => {
            const statusMeta = STATUS_METADATA[p.status];
            const isRowSelected = selectedIds.includes(p.id!);

            return (
              <div 
                key={p.id} 
                className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-4 relative ${
                  isRowSelected 
                    ? 'border-amber-500 bg-amber-500/[0.02] dark:bg-amber-550/[0.01]' 
                    : 'border-slate-150 dark:border-slate-800/80 shadow-xs'
                }`}
              >
                {/* Top header of card: Checkbox & Status & Military Number */}
                <div className="flex justify-between items-center gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      id={`select-card-row-${p.id}`}
                      onClick={() => handleSelectRow(p.id!)}
                      className="p-1 text-slate-400 hover:text-amber-500 rounded-md cursor-pointer inline-flex items-center justify-center shrink-0"
                    >
                      {isRowSelected ? (
                        <CheckSquare className="w-4.5 h-4.5 text-amber-500" />
                      ) : (
                        <Square className="w-4.5 h-4.5" />
                      )}
                    </button>
                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-bold font-mono">#{p.militaryNumber}</span>
                    </div>
                  </div>
                  
                  <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-lg ${statusMeta.bg} ${statusMeta.text}`}>
                    <span className="w-1 h-1 rounded-full bg-current ml-1"></span>
                    {statusMeta.label}
                  </span>
                </div>

                {/* Main info */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">{p.rank} /</span>
                    <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">{p.fullName}</h4>
                  </div>
                  
                  {p.notes && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal max-w-full">
                      {p.notes}
                    </p>
                  )}
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-b border-slate-100 dark:border-slate-800/80 py-2.5 my-2.5 text-xs">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[10px] mb-0.5">الوحدة / السرية</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{p.unit}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[10px] mb-0.5">الفصيل</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{p.platoon || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 dark:text-slate-500 block text-[10px] mb-0.5">رصيد الإجازات المتبقي</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">مفتوح</span>
                  </div>
                </div>

                {/* Actions bottom bar */}
                <div className="flex items-center justify-between mt-2 pt-1">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">إدارة الملف</span>
                  
                  <div className="flex items-center gap-1">
                    {/* ID Card */}
                    <button
                      id={`id-card-btn-mobile-${p.id}`}
                      onClick={() => setActiveCardPerson(p)}
                      title="عرض بطاقة الهوية"
                      className="p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                    </button>

                    {/* Edit */}
                    {canEdit && (
                      <button
                        id={`edit-btn-mobile-${p.id}`}
                        onClick={() => handleOpenEditForm(p)}
                        title="تعديل البيانات"
                        className="p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete */}
                    {canEdit && (
                      <button
                        id={`delete-btn-mobile-${p.id}`}
                        onClick={() => handleDeletePerson(p.id!)}
                        title="حذف الفرد"
                        className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Slide-over Form Drawer (Add/Edit) */}
      {isFormOpen && (
        <div id="personnel-form-backdrop" className="fixed inset-0 z-45 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl border-r border-slate-100 dark:border-slate-800 flex flex-col rounded-2xl md:rounded-r-none md:rounded-l-2xl overflow-hidden transform transition-transform duration-300">
            {/* Form Header */}
            <div className="px-6 py-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  {editingPerson ? 'تعديل بيانات فرد عسكري' : 'تسجيل فرد عسكري جديد'}
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  اللواء 43 عمالقة - قسم شؤون القوة البشرية
                </p>
              </div>
              <button
                id="close-form-btn"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields container */}
            <form id="personnel-form" onSubmit={handleSavePersonnel} className="flex-1 overflow-y-auto p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Military Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الرقم العسكري *</label>
                <input
                  id="form-military-number"
                  type="text"
                  required
                  placeholder="مثال: 1001"
                  value={militaryNumber}
                  onChange={(e) => setMilitaryNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الاسم الكامل للفرد *</label>
                <input
                  id="form-full-name"
                  type="text"
                  required
                  placeholder="الاسم الرباعي الكامل..."
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              {/* Rank */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الرتبة العسكرية</label>
                <div className="relative">
                  <select
                    id="form-rank"
                    value={rank}
                    onChange={(e) => setRank(e.target.value)}
                    className="w-full appearance-none px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    {MILITARY_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Unit / Company */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الوحدة / السرية</label>
                <div className="relative">
                  <select
                    id="form-unit"
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value);
                      if (e.target.value === 'هيئة القيادة') {
                        setPlatoon('');
                      } else if (!platoon) {
                        setPlatoon(PLATOONS[0]);
                      }
                    }}
                    className="w-full appearance-none px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    {BRIGADE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Platoon (Conditional - Only for Companies) */}
              {unit !== 'هيئة القيادة' && (
                <div className="space-y-1.5 animate-slideDown">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الفصيل عسكري *</label>
                  <div className="relative">
                    <select
                      id="form-platoon"
                      value={platoon || PLATOONS[0]}
                      onChange={(e) => setPlatoon(e.target.value)}
                      required
                      className="w-full appearance-none px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                    >
                      {PLATOONS.map(pl => <option key={pl} value={pl}>{pl}</option>)}
                    </select>
                    <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">الحالة الأولية</label>
                <div className="relative">
                  <select
                    id="form-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PersonnelStatus)}
                    className="w-full appearance-none px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    <option value="موجود">موجود</option>
                    <option value="إجازة">إجازة</option>
                    <option value="غياب">غياب</option>
                    <option value="مريض">مريض</option>
                    <option value="إذن">إذن</option>
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Leave balance */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">رصيد الإجازات السنوية</label>
                <div className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 select-none">
                  مفتوح (غير محدود)
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">ملاحظات إضافية (أختياري)</label>
                <textarea
                  id="form-notes"
                  placeholder="أية ملاحظات بخصوص الحالة الصحية أو المهام..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 resize-none"
                />
              </div>
            </form>

            {/* Form Footer */}
            <div className="px-6 py-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-3 justify-end">
              <button
                id="cancel-form-btn"
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                id="submit-form-btn"
                onClick={handleSavePersonnel}
                className="px-5 py-2 bg-slate-850 hover:bg-slate-750 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                {editingPerson ? 'حفظ التعديلات' : 'تسجيل وإضافة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Military ID Card Modal Overlay */}
      {activeCardPerson && (
        <IdCardModal
          personnel={activeCardPerson}
          onClose={() => setActiveCardPerson(null)}
        />
      )}
    </div>
  );
}
