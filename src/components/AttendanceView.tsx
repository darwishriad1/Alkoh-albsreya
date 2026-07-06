/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Personnel, PersonnelStatus, STATUS_METADATA, Leave } from '../types';
import { getAllFromStore, getAttendanceByDate, getPersonnelStatusOnDate, saveDailyAttendance } from '../lib/db';
import { Calendar, Save, CheckCircle, Clock, AlertTriangle, User, RefreshCw, Star } from 'lucide-react';

interface AttendanceViewProps {
  currentUser: { username: string; role: string };
}

interface RowState {
  personnelId: number;
  status: PersonnelStatus;
  isAutoLeave: boolean;
}

export default function AttendanceView({ currentUser }: AttendanceViewProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';

  const loadData = async () => {
    setLoading(true);
    try {
      const allP = await getAllFromStore<Personnel>('personnel');
      setPersonnel(allP);

      // Load existing attendance for this date
      const attendance = await getAttendanceByDate(selectedDate);
      
      // Load all leaves once for performance and calculations
      const allLeaves = await getAllFromStore<Leave>('leaves');
      
      const preparedRows: RowState[] = [];
      
      for (const p of allP) {
        // Calculate status on this date dynamically
        const calculatedStatus = getPersonnelStatusOnDate(p.id!, selectedDate, allLeaves);
        
        let initialStatus: PersonnelStatus = 'موجود';
        let isAutoLeave = false;

        if (calculatedStatus === 'إجازة' || calculatedStatus === 'غياب') {
          initialStatus = calculatedStatus;
          isAutoLeave = true; // Auto-calculated based on active/ended leave
        } else {
          // Check if there is already a saved attendance record for this date
          const savedAtt = attendance.find(a => a.personnelId === p.id);
          if (savedAtt) {
            initialStatus = savedAtt.status;
          } else {
            // Fallback to person's overall database status ONLY if date is today, else default 'موجود'
            const todayStr = new Date().toISOString().split('T')[0];
            initialStatus = selectedDate === todayStr ? p.status : 'موجود';
          }
        }

        preparedRows.push({
          personnelId: p.id!,
          status: initialStatus,
          isAutoLeave
        });
      }

      setRows(preparedRows);
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleStatusChange = (personnelId: number, newStatus: PersonnelStatus) => {
    if (!canEdit) return;
    setRows(prev =>
      prev.map(r => r.personnelId === personnelId ? { ...r, status: newStatus, isAutoLeave: false } : r)
    );
  };

  const handleMarkAllPresent = () => {
    if (!canEdit) return;
    setRows(prev =>
      prev.map(r => {
        // Keep auto-detected leave statuses intact or allow overriding, but simple workflow is override except auto-leaves if preferred
        // We override all except the ones that have actual auto-leave flags to make it smarter!
        if (r.isAutoLeave) return r;
        return { ...r, status: 'موجود' };
      })
    );
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const recordsToSave = rows.map(r => ({
        personnelId: r.personnelId,
        status: r.status
      }));

      await saveDailyAttendance(selectedDate, recordsToSave, currentUser.username);
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving attendance:', err);
      alert('حدث خطأ أثناء حفظ التحضير!');
    } finally {
      setIsSaving(false);
    }
  };

  const getPersonDetails = (id: number) => {
    return personnel.find(p => p.id === id);
  };

  return (
    <div id="attendance-view-container" className="space-y-6">
      {/* Top configuration box */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Date Selector */}
          <div className="flex items-center gap-2">
            <span className="p-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-300 rounded-xl">
              <Calendar className="w-5 h-5" />
            </span>
            <div className="space-y-0.5">
              <label className="block text-[10px] text-slate-400 font-bold uppercase">تاريخ التحضير</label>
              <input
                id="attendance-date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
              />
            </div>
          </div>

          {selectedDate === new Date().toISOString().split('T')[0] && (
            <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-lg font-bold">
              تحضير اليوم الفعلي
            </span>
          )}
        </div>

        {/* Shortcut and Actions */}
        {canEdit && (
          <div className="flex gap-2 w-full md:w-auto justify-end">
            <button
              id="mark-all-present-btn"
              onClick={handleMarkAllPresent}
              className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl cursor-pointer"
            >
              تحضير الحاضرين (موجود)
            </button>

            <button
              id="save-attendance-btn"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-slate-850 hover:bg-slate-750 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer transition-all"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  حفظ سجل التحضير
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Save feedback banner */}
      {saveSuccess && (
        <div id="attendance-save-success-banner" className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-900/40 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4" />
          <span>تم حفظ وتأكيد كشف التحضير اليومي للتاريخ [{selectedDate}] ومزامنة حالات القوة بنجاح!</span>
        </div>
      )}

      {/* Main Attendance List (Hidden on mobile, visible on desktop) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : personnel.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <User className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا توجد قوة بشرية مسجلة في قاعدة البيانات حالياً.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold">
                  <th className="py-4 px-6 w-32">الرقم العسكري</th>
                  <th className="py-4 px-6 w-44">الرتبة</th>
                  <th className="py-4 px-6">الاسم الكامل للفرد</th>
                  <th className="py-4 px-6">الوحدة / السرية</th>
                  <th className="py-4 px-6">فترة الإجازة النشطة</th>
                  <th className="py-4 px-6 text-left w-[460px]">تسجيل وتحضير الحالة اليومية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                {rows.map((row) => {
                  const person = getPersonDetails(row.personnelId);
                  if (!person) return null;

                  return (
                    <tr 
                      key={row.personnelId}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors ${
                        row.isAutoLeave ? 'bg-blue-500/[0.04] dark:bg-blue-400/[0.03]' : ''
                      }`}
                    >
                      <td className="py-3.5 px-6 font-mono font-bold text-slate-500 dark:text-slate-400">
                        {person.militaryNumber}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-slate-700 dark:text-slate-300">
                        {person.rank}
                      </td>
                      <td className="py-3.5 px-6 font-bold text-slate-800 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          {person.fullName}
                          {row.isAutoLeave && (
                            row.status === 'غياب' ? (
                              <span 
                                title="تم احتسابه غائباً تلقائياً لتجاوز تاريخ انتهاء إجازته دون مباشرة العمل"
                                className="inline-flex items-center gap-1 text-[10px] bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-450 px-2 py-0.5 rounded-md font-bold"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                غياب تلقائي (لم يباشر)
                              </span>
                            ) : (
                              <span 
                                title="تم الكشف عن إجازة نشطة تغطي هذا التاريخ تلقائياً"
                                className="inline-flex items-center gap-1 text-[10px] bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md font-bold"
                              >
                                <Clock className="w-3 h-3" />
                                إجازة نشطة تلقائية
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400 font-medium">
                        {person.unit}
                        {person.platoon && <span className="text-xs text-slate-400"> ({person.platoon})</span>}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-400 font-medium">
                        {row.isAutoLeave ? 'يغطي تاريخ التحضير' : <span className="text-slate-300 dark:text-slate-800">—</span>}
                      </td>
                      <td className="py-3.5 px-6 text-left">
                        {/* Interactive status chooser button row */}
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {(['موجود', 'إجازة', 'غياب', 'مريض', 'إذن'] as PersonnelStatus[]).map((st) => {
                            const isSelected = row.status === st;
                            const meta = STATUS_METADATA[st];

                            return (
                              <button
                                key={st}
                                id={`att-btn-${row.personnelId}-${st}`}
                                disabled={!canEdit}
                                onClick={() => handleStatusChange(row.personnelId, st)}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer transition-all ${
                                  isSelected 
                                    ? `${meta.bg} ${meta.text} border-current ring-1 ring-current`
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                {st}
                              </button>
                            );
                          })}
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

      {/* Mobile-only Attendance Cards list (Hidden on desktop, visible on mobile) */}
      <div className="md:hidden space-y-3.5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : personnel.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <User className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا توجد قوة بشرية مسجلة في قاعدة البيانات حالياً.</p>
          </div>
        ) : (
          rows.map((row) => {
            const person = getPersonDetails(row.personnelId);
            if (!person) return null;

            return (
              <div 
                key={row.personnelId}
                className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-4 ${
                  row.isAutoLeave 
                    ? 'border-blue-500 bg-blue-500/[0.02] dark:bg-blue-400/[0.01]' 
                    : 'border-slate-150 dark:border-slate-800 shadow-xs'
                }`}
              >
                {/* Header info */}
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">{person.rank} /</span>
                    <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">{person.fullName}</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold">#{person.militaryNumber}</span>
                </div>

                {/* Subtitle / Unit info */}
                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-3.5">
                  <span>{person.unit} {person.platoon && `(${person.platoon})`}</span>
                  {row.isAutoLeave && (
                    row.status === 'غياب' ? (
                      <span className="inline-flex items-center gap-1 text-[9px] bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-450 px-1.5 py-0.5 rounded font-bold">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        غياب تلقائي
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9px] bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">
                        <Clock className="w-2.5 h-2.5" />
                        إجازة تلقائية
                      </span>
                    )
                  )}
                </div>

                {/* Buttons row */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 flex flex-col gap-2 justify-start">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">حالة التحضير اليومي:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['موجود', 'إجازة', 'غياب', 'مريض', 'إذن'] as PersonnelStatus[]).map((st) => {
                      const isSelected = row.status === st;
                      const meta = STATUS_METADATA[st];

                      return (
                        <button
                          key={st}
                          id={`att-mobile-btn-${row.personnelId}-${st}`}
                          disabled={!canEdit}
                          onClick={() => handleStatusChange(row.personnelId, st)}
                          className={`flex-1 min-w-[55px] text-center py-1 text-[11px] font-bold rounded-lg border cursor-pointer transition-all ${
                            isSelected 
                              ? `${meta.bg} ${meta.text} border-current ring-1 ring-current`
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
