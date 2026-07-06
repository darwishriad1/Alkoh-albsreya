/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Personnel, Leave, LeaveType, STATUS_METADATA } from '../types';
import { getAllFromStore, addLeave, deleteLeave, submitLeaveCut, recordLeaveReturn, submitLeaveReturn } from '../lib/db';
import { Plus, Search, Calendar, ChevronDown, CheckCircle, Trash2, Scissors, CornerDownLeft, Download, X, AlertTriangle, BadgeAlert } from 'lucide-react';

interface LeavesViewProps {
  currentUser: { username: string; role: string };
}

export default function LeavesView({ currentUser }: LeavesViewProps) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all'); // all, active, completed, overdue

  // Add Leave Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [leaveType, setLeaveType] = useState<LeaveType>('استحقاقه');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [daysCount, setDaysCount] = useState<number>(0);
  const [modalError, setModalError] = useState<string>('');

  // Search state inside Add Leave Form Dropdown
  const [personSearchText, setPersonSearchText] = useState<string>('');

  // Record Return Modal State
  const [returnLeaveId, setReturnLeaveId] = useState<number | null>(null);
  const [actualReturnDate, setActualReturnDate] = useState<string>('');

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';
  const todayStr = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    try {
      const [allLeaves, allP] = await Promise.all([
        getAllFromStore<Leave>('leaves'),
        getAllFromStore<Personnel>('personnel')
      ]);
      setLeaves(allLeaves);
      setPersonnel(allP);
    } catch (err) {
      console.error('Failed to load leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, 1500); // Polling for sync
    return () => clearInterval(interval);
  }, []);

  // Calculate days when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
      setDaysCount(diffDays > 0 ? diffDays : 0);
    } else {
      setDaysCount(0);
    }
  }, [startDate, endDate]);

  const getPersonDetails = (id: number) => {
    return personnel.find(p => p.id === id);
  };

  // Determine Leave Status: نشطة (active), مكتملة (completed), متأخر (overdue)
  const getLeaveStatus = (l: Leave): { label: string; bg: string; text: string; code: 'active' | 'completed' | 'overdue' } => {
    if (l.actualReturnDate) {
      const isLate = new Date(l.actualReturnDate) > new Date(l.endDate);
      if (isLate) {
        return { label: 'مكتملة (متأخر)', bg: 'bg-rose-50 dark:bg-rose-950/20', text: 'text-rose-600 dark:text-rose-400', code: 'overdue' };
      }
      return { label: 'مكتملة', bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-700 dark:text-emerald-400', code: 'completed' };
    }

    if (l.endDate < todayStr) {
      return { label: 'متأخر العودة', bg: 'bg-red-50 dark:bg-red-950/20', text: 'text-red-700 dark:text-red-450 font-bold', code: 'overdue' };
    }

    return { label: 'نشطة', bg: 'bg-blue-50 dark:bg-blue-950/20', text: 'text-blue-700 dark:text-blue-400', code: 'active' };
  };

  // Filter leaves
  const filteredLeaves = leaves.filter(l => {
    const person = getPersonDetails(l.personnelId);
    if (!person) return false;

    const matchesSearch = person.fullName.includes(searchQuery) || person.militaryNumber.includes(searchQuery);
    const matchesType = filterType === 'all' || l.leaveType === filterType;
    
    const leaveStatus = getLeaveStatus(l);
    const matchesStatus = filterStatus === 'all' || leaveStatus.code === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Handle Add Leave Submission
  const handleAddLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!selectedPersonId || !startDate || !endDate) {
      setModalError('يرجى اختيار الفرد وتواريخ بداية ونهاية الإجازة.');
      return;
    }

    if (daysCount <= 0) {
      setModalError('تاريخ نهاية الإجازة يجب أن يكون مساوياً أو بعد تاريخ البدء.');
      return;
    }

    const pId = Number(selectedPersonId);
    const person = personnel.find(p => p.id === pId);
    if (!person) return;

    const newLeave: Leave = {
      personnelId: pId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      cutSubmitted: false,
      returnSubmitted: false
    };

    try {
      await addLeave(newLeave, currentUser.username);
      setIsModalOpen(false);
      
      // Reset form
      setSelectedPersonId('');
      setStartDate('');
      setEndDate('');
      setLeaveType('استحقاقه');
      setPersonSearchText('');
      
      loadData();
    } catch (err: any) {
      setModalError('فشل تسجيل الإجازة: ' + err.message);
    }
  };

  // Delete Leave
  const handleDeleteLeave = async (id: number) => {
    if (!canEdit) return;
    if (confirm('هل أنت متأكد من حذف سجل هذه الإجازة؟ سيتم إعادة رصيد الإجازة للفرد وإعادة مزامنة حالته العسكرية.')) {
      try {
        await deleteLeave(id, currentUser.username);
        loadData();
      } catch (err: any) {
        alert('حدث خطأ: ' + err.message);
      }
    }
  };

  // Submit Cut
  const handleCutSubmit = async (id: number) => {
    if (!canEdit) return;
    try {
      await submitLeaveCut(id, currentUser.username);
      loadData();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  // Open Record Return Modal
  const handleOpenReturnModal = (leaveId: number, defaultReturnDate: string) => {
    if (!canEdit) return;
    setReturnLeaveId(leaveId);
    setActualReturnDate(defaultReturnDate);
  };

  // Submit Record Return
  const handleReturnSubmit = async () => {
    if (!returnLeaveId || !actualReturnDate) return;
    try {
      await recordLeaveReturn(returnLeaveId, actualReturnDate, currentUser.username);
      setReturnLeaveId(null);
      setActualReturnDate('');
      loadData();
    } catch (err: any) {
      alert('حدث خطأ أثناء تسجيل العودة: ' + err.message);
    }
  };

  // Submit Return Report to Personnel
  const handleReturnReportSubmit = async (id: number) => {
    if (!canEdit) return;
    try {
      await submitLeaveReturn(id, currentUser.username);
      loadData();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  // Export Leaves to CSV
  const handleExportCSV = () => {
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel Arabic support
    csvContent += 'الرقم العسكري,الرتبة,الاسم الكامل,نوع الإجازة,تاريخ البدء,تاريخ الانتهاء,المدة باليوم,حالة قطع الإجازة,العودة الفعلية,حالة المباشرة,حالة الإجازة\n';

    filteredLeaves.forEach(l => {
      const person = getPersonDetails(l.personnelId);
      if (person) {
        const statusDetails = getLeaveStatus(l);
        const row = [
          person.militaryNumber,
          person.rank,
          person.fullName,
          l.leaveType,
          l.startDate,
          l.endDate,
          l.daysCount,
          l.cutSubmitted ? 'تم الرفع' : 'معلق',
          l.actualReturnDate || 'لم يعد بعد',
          l.returnSubmitted ? 'تم رفع المباشرة' : 'معلق',
          statusDetails.label
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
        csvContent += row + '\n';
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `كشف_إجازات_منتسبي_اللواء_43_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter candidates for Add Leave dropdown based on search text
  const filteredCandidates = personnel.filter(p => {
    if (!personSearchText) return true;
    return p.fullName.includes(personSearchText) || p.militaryNumber.includes(personSearchText);
  });

  return (
    <div id="leaves-view-container" className="space-y-6">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:flex-initial min-w-[220px]">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="leaves-search"
              type="text"
              placeholder="ابحث باسم الفرد أو رقمه العسكري..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <select
              id="leaves-type-filter"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none pl-8 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
            >
              <option value="all">كافة أنواع الإجازات</option>
              <option value="استحقاقه">سنوية (استحقاقه)</option>
              <option value="مرضية">مرضية</option>
              <option value="طارئة">طارئة</option>
              <option value="إذن">إذن مسبق</option>
            </select>
            <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              id="leaves-status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none pl-8 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
            >
              <option value="all">كافة الإجازات (الوضع)</option>
              <option value="active">نشطة حالياً</option>
              <option value="completed">مكتملة وعاد للدوام</option>
              <option value="overdue">متأخر عن العودة</option>
            </select>
            <ChevronDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto justify-end">
          <button
            id="leaves-csv-btn"
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer"
          >
            <Download className="w-4 h-4" />
            تصدير تقرير الإجازات
          </button>

          {canEdit && (
            <button
              id="add-leave-btn"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-850 hover:bg-slate-750 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              منح إجازة جديدة
            </button>
          )}
        </div>
      </div>

      {/* Leave Table Card (Hidden on mobile, visible on desktop) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Calendar className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا توجد إجازات مسجلة تطابق هذه الشروط.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold">
                  <th className="py-4 px-6">الفرد العسكري</th>
                  <th className="py-4 px-6">النوع</th>
                  <th className="py-4 px-6">تاريخ الإجازة والمدة</th>
                  <th className="py-4 px-6 text-center">قطع الإجازة</th>
                  <th className="py-4 px-6 text-center">العودة الفعلية</th>
                  <th className="py-4 px-6 text-center">المباشرة</th>
                  <th className="py-4 px-6">حالة الإجازة</th>
                  <th className="py-4 px-6 text-left w-24">التحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                {filteredLeaves.map((l) => {
                  const person = getPersonDetails(l.personnelId);
                  if (!person) return null;
                  const statusDetails = getLeaveStatus(l);

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-bold text-slate-800 dark:text-slate-100">{person.fullName}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{person.rank} • رقم عسكري {person.militaryNumber}</div>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-lg ${
                          l.leaveType === 'استحقاقه' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400' :
                          l.leaveType === 'مرضية' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                          l.leaveType === 'طارئة' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400' :
                          'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400'
                        }`}>
                          {l.leaveType === 'استحقاقه' ? 'سنوية' : l.leaveType}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="font-mono font-bold text-xs text-slate-600 dark:text-slate-300">من {l.startDate} إلى {l.endDate}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">المدة الكلية: {l.daysCount} يوم</div>
                      </td>
                      
                      {/* Cut Leave check */}
                      <td className="py-3.5 px-6 text-center">
                        {l.cutSubmitted ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            تم رفع القطع
                          </span>
                        ) : (
                          <div className="flex justify-center">
                            <button
                              id={`cut-btn-${l.id}`}
                              disabled={!canEdit}
                              onClick={() => handleCutSubmit(l.id!)}
                              className="px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-250 dark:border-slate-700 rounded-md cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              <Scissors className="w-3 h-3" />
                              رفع قطع الإجازة
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actual Return Date */}
                      <td className="py-3.5 px-6 text-center">
                        {l.actualReturnDate ? (
                          <div className="text-center">
                            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{l.actualReturnDate}</span>
                            {new Date(l.actualReturnDate) > new Date(l.endDate) && (
                              <div className="text-[9px] text-rose-550 dark:text-rose-450 font-bold flex items-center justify-center gap-0.5 mt-0.5">
                                <BadgeAlert className="w-2.5 h-2.5" />
                                متأخر
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <button
                              id={`return-btn-${l.id}`}
                              disabled={!canEdit}
                              onClick={() => handleOpenReturnModal(l.id!, todayStr)}
                              className="px-2 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-md cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              <CornerDownLeft className="w-3 h-3" />
                              تسجيل العودة الفعلية
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Return Submitted check (مباشرة العمل) */}
                      <td className="py-3.5 px-6 text-center">
                        {!l.actualReturnDate ? (
                          <span className="text-[10px] text-slate-300 dark:text-slate-700 font-semibold">—</span>
                        ) : l.returnSubmitted ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            تم رفع المباشرة
                          </span>
                        ) : (
                          <div className="flex justify-center">
                            <button
                              id={`report-return-btn-${l.id}`}
                              disabled={!canEdit}
                              onClick={() => handleReturnReportSubmit(l.id!)}
                              className="px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-250 dark:border-slate-700 rounded-md cursor-pointer disabled:opacity-50"
                            >
                              رفع العودة والمباشرة
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Overall status badge */}
                      <td className="py-3.5 px-6">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-bold rounded-lg ${statusDetails.bg} ${statusDetails.text}`}>
                          {statusDetails.label}
                        </span>
                      </td>

                      {/* Delete / Actions */}
                      <td className="py-3.5 px-6 text-left">
                        <div className="flex justify-start">
                          {canEdit && (
                            <button
                              id={`del-leave-${l.id}`}
                              onClick={() => handleDeleteLeave(l.id!)}
                              title="حذف الإجازة وإعادة رصيد الفرد"
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile-only Leaves list (Hidden on desktop, visible on mobile) */}
      <div className="md:hidden space-y-3.5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Calendar className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا توجد إجازات مسجلة تطابق هذه الشروط.</p>
          </div>
        ) : (
          filteredLeaves.map((l) => {
            const person = getPersonDetails(l.personnelId);
            if (!person) return null;
            const statusDetails = getLeaveStatus(l);

            return (
              <div 
                key={l.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 p-4 shadow-xs space-y-3"
              >
                {/* Header: Person & Overall Leave Status */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">{person.fullName}</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{person.rank} • رقم عسكري {person.militaryNumber}</p>
                  </div>
                  <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold rounded-lg ${statusDetails.bg} ${statusDetails.text}`}>
                    {statusDetails.label}
                  </span>
                </div>

                {/* Info Block */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[9px] mb-0.5">نوع الإجازة</span>
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md ${
                      l.leaveType === 'استحقاقه' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400' :
                      l.leaveType === 'مرضية' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                      l.leaveType === 'طارئة' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400' :
                      'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400'
                    }`}>
                      {l.leaveType === 'استحقاقه' ? 'سنوية' : l.leaveType}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[9px] mb-0.5">مدة الإجازة</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{l.daysCount} يوم</span>
                  </div>
                  <div className="col-span-2 border-t border-slate-100 dark:border-slate-800/50 pt-2 mt-1">
                    <span className="text-slate-400 dark:text-slate-500 block text-[9px] mb-0.5">فترة الإجازة</span>
                    <span className="font-mono font-bold text-[10px] text-slate-600 dark:text-slate-300">من {l.startDate} إلى {l.endDate}</span>
                  </div>
                </div>

                {/* Workflows bottom grid */}
                <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {/* Cut Leave check */}
                    <div className="flex-1 min-w-[120px]">
                      <span className="text-slate-400 dark:text-slate-500 block text-[9px] mb-1">قطع الإجازة</span>
                      {l.cutSubmitted ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          تم رفع القطع
                        </span>
                      ) : (
                        <button
                          id={`cut-btn-mobile-${l.id}`}
                          disabled={!canEdit}
                          onClick={() => handleCutSubmit(l.id!)}
                          className="w-full text-center py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-250 dark:border-slate-700 rounded-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          <Scissors className="w-2.5 h-2.5" />
                          رفع قطع الإجازة
                        </button>
                      )}
                    </div>

                    {/* Actual Return Date */}
                    <div className="flex-1 min-w-[120px]">
                      <span className="text-slate-400 dark:text-slate-400 block text-[9px] mb-1">العودة الفعلية</span>
                      {l.actualReturnDate ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">{l.actualReturnDate}</span>
                          {new Date(l.actualReturnDate) > new Date(l.endDate) && (
                            <span className="text-[9px] bg-rose-50 dark:bg-rose-950/20 text-rose-550 dark:text-rose-450 px-1 py-0.2 rounded font-extrabold flex items-center gap-0.5">
                              <BadgeAlert className="w-2.5 h-2.5" />
                              متأخر
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          id={`return-btn-mobile-${l.id}`}
                          disabled={!canEdit}
                          onClick={() => handleOpenReturnModal(l.id!, todayStr)}
                          className="w-full text-center py-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          <CornerDownLeft className="w-2.5 h-2.5" />
                          تسجيل العودة الفعلية
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs border-t border-slate-100 dark:border-slate-800/65 pt-2.5 mt-1.5">
                    {/* Return Submitted check (مباشرة العمل) */}
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 block text-[9px] mb-1">رفع المباشرة</span>
                      {!l.actualReturnDate ? (
                        <span className="text-[10px] text-slate-300 dark:text-slate-700 font-semibold">بانتظار العودة</span>
                      ) : l.returnSubmitted ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          تم رفع المباشرة
                        </span>
                      ) : (
                        <button
                          id={`report-return-btn-mobile-${l.id}`}
                          disabled={!canEdit}
                          onClick={() => handleReturnReportSubmit(l.id!)}
                          className="px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 border border-slate-250 dark:border-slate-700 rounded-md cursor-pointer disabled:opacity-50"
                        >
                          رفع العودة والمباشرة
                        </button>
                      )}
                    </div>

                    {/* Delete Icon */}
                    {canEdit && (
                      <button
                        id={`del-leave-mobile-${l.id}`}
                        onClick={() => handleDeleteLeave(l.id!)}
                        title="حذف الإجازة وإعادة رصيد الفرد"
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer shrink-0 mt-3"
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

      {/* Modal: Add New Leave Form */}
      {isModalOpen && (
        <div id="add-leave-modal" className="fixed inset-0 z-45 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-150 dark:border-slate-850 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">منح إجازة عسكرية رسمية</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">قسم السجلات والمحاضر - اللواء 43</p>
              </div>
              <button
                id="close-add-leave-modal"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleAddLeaveSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-450 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Personnel searchable select */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">ابحث واختر الفرد العسكري *</label>
                
                {/* Search input to filter dropdown */}
                <input
                  id="form-person-search"
                  type="text"
                  placeholder="ابحث بالاسم أو الرقم العسكري في القوة..."
                  value={personSearchText}
                  onChange={(e) => setPersonSearchText(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden"
                />

                <div className="relative mt-1">
                  <select
                    id="form-personnel-id"
                    required
                    size={4}
                    value={selectedPersonId}
                    onChange={(e) => setSelectedPersonId(e.target.value)}
                    className="w-full text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-1 cursor-pointer focus:outline-hidden h-28"
                  >
                    {filteredCandidates.length === 0 ? (
                      <option disabled className="p-2 text-slate-400">لا توجد قوة مطابقة للبحث</option>
                    ) : (
                      filteredCandidates.map(p => (
                        <option key={p.id} value={p.id} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850">
                          {p.rank}/ {p.fullName} (رصيد: {p.leaveBalance} يوم - رقم عسكري: {p.militaryNumber})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Leave Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">نوع الإجازة المطلوبة</label>
                <div className="relative">
                  <select
                    id="form-leave-type"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="w-full appearance-none px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    <option value="استحقاقه">سنوية (استحقاقه - يخصم من الرصيد)</option>
                    <option value="مرضية">مرضية (لا يخصم من الرصيد)</option>
                    <option value="طارئة">طارئة (لا يخصم من الرصيد)</option>
                    <option value="إذن">إذن رسمي مسبق (لا يخصم من الرصيد)</option>
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">تاريخ بدء الإجازة *</label>
                  <input
                    id="form-leave-start"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">تاريخ انتهاء الإجازة *</label>
                  <input
                    id="form-leave-end"
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Calculated Days Preview */}
              {daysCount > 0 && (
                <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl flex justify-between items-center">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-450">إجمالي مدة الإجازة المحتسبة:</span>
                  <span className="text-sm font-bold text-indigo-800 dark:text-indigo-400 font-mono">{daysCount} يوم</span>
                </div>
              )}
            </form>

            {/* Modal Actions */}
            <div className="px-6 py-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-3 justify-end">
              <button
                id="close-add-leave-modal-secondary"
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                id="submit-leave-btn"
                onClick={handleAddLeaveSubmit}
                className="px-5 py-2 bg-slate-850 hover:bg-slate-750 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                تأكيد ومنح الإجازة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Actual Return Date */}
      {returnLeaveId !== null && (
        <div id="record-return-modal" className="fixed inset-0 z-45 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-150 dark:border-slate-850 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">تسجيل عودة الفرد الفعلية</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">مكتب شؤون الأفراد والضباط - اللواء 43</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">تاريخ العودة والمباشرة الفعلية *</label>
                <input
                  id="form-return-date"
                  type="date"
                  required
                  value={actualReturnDate}
                  onChange={(e) => setActualReturnDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-2 justify-end">
              <button
                id="close-record-return-modal"
                onClick={() => setReturnLeaveId(null)}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                id="submit-record-return-btn"
                onClick={handleReturnSubmit}
                className="px-5 py-2 bg-slate-850 hover:bg-slate-750 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                تأكيد وتسجيل المباشرة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
