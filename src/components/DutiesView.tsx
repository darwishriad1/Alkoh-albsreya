/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Personnel, Duty, DutyType, DUTY_METADATA } from '../types';
import { getAllFromStore, getDutiesByDate, saveDailyDuties } from '../lib/db';
import { Calendar, Save, CheckCircle, RefreshCw, User, ShieldCheck } from 'lucide-react';

interface DutiesViewProps {
  currentUser: { username: string; role: string };
}

interface RowState {
  personnelId: number;
  duty: DutyType;
}

export default function DutiesView({ currentUser }: DutiesViewProps) {
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

      // Load existing duties for this date
      const duties = await getDutiesByDate(selectedDate);
      
      const preparedRows = allP.map(p => {
        const match = duties.find(d => d.personnelId === p.id);
        return {
          personnelId: p.id!,
          duty: match ? match.duty : 'لا يوجد' as DutyType
        };
      });

      setRows(preparedRows);
    } catch (err) {
      console.error('Failed to load duties roster:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleDutyChange = (personnelId: number, newDuty: DutyType) => {
    if (!canEdit) return;
    setRows(prev =>
      prev.map(r => r.personnelId === personnelId ? { ...r, duty: newDuty } : r)
    );
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await saveDailyDuties(selectedDate, rows, currentUser.username);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving duties:', err);
      alert('حدث خطأ أثناء حفظ جدول الواجبات!');
    } finally {
      setIsSaving(false);
    }
  };

  const getPersonDetails = (id: number) => {
    return personnel.find(p => p.id === id);
  };

  return (
    <div id="duties-view-container" className="space-y-6">
      {/* Top filter and actions block */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <span className="p-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-300 rounded-xl">
              <Calendar className="w-5 h-5" />
            </span>
            <div className="space-y-0.5">
              <label className="block text-[10px] text-slate-400 font-bold uppercase">جدول واجب تاريخ</label>
              <input
                id="duties-date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-hidden cursor-pointer"
              />
            </div>
          </div>

          <span className="bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 text-xs px-2.5 py-1 rounded-lg font-bold">
            مستويات توزيع الواجب والراحة
          </span>
        </div>

        {/* Save Roster button */}
        {canEdit && (
          <div className="w-full md:w-auto flex justify-end">
            <button
              id="save-duties-btn"
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
                  حفظ جدول الخدمات والواجب
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Save feedback banner */}
      {saveSuccess && (
        <div id="duties-save-success-banner" className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-900/40 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4" />
          <span>تم تعديل وحفظ وتوثيق جدول الواجبات والخدمات العسكرية للتاريخ [{selectedDate}] بنجاح!</span>
        </div>
      )}

      {/* Roster Table Card (Hidden on mobile, visible on desktop) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : personnel.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <User className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا توجد قوة بشرية مسجلة لتوزيع المهام عليها.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold">
                  <th className="py-4 px-6 w-36">الرقم العسكري</th>
                  <th className="py-4 px-6 w-44">الرتبة</th>
                  <th className="py-4 px-6">الاسم الكامل للفرد</th>
                  <th className="py-4 px-6">السرية عسكرية</th>
                  <th className="py-4 px-6 text-center w-56">الخدمة الحالية</th>
                  <th className="py-4 px-6 text-left w-96">تخصيص الواجب العسكري والخدمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                {rows.map((row) => {
                  const person = getPersonDetails(row.personnelId);
                  if (!person) return null;

                  const currentDutyMeta = DUTY_METADATA[row.duty];

                  return (
                    <tr key={row.personnelId} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="py-3.5 px-6 font-mono font-bold text-slate-500">
                        {person.militaryNumber}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-slate-700 dark:text-slate-300">
                        {person.rank}
                      </td>
                      <td className="py-3.5 px-6 font-bold text-slate-800 dark:text-slate-100">
                        {person.fullName}
                      </td>
                      <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400 font-medium">
                        {person.unit}
                        {person.platoon && <span className="text-xs text-slate-400"> ({person.platoon})</span>}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-lg ${currentDutyMeta.bg} ${currentDutyMeta.text}`}>
                          {currentDutyMeta.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-left">
                        {/* Selector pill row */}
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {(['حراسة', 'دورية', 'مطبخ', 'إداري', 'راحة', 'لا يوجد'] as DutyType[]).map((dt) => {
                            const isSelected = row.duty === dt;
                            const meta = DUTY_METADATA[dt];

                            return (
                              <button
                                key={dt}
                                id={`duty-btn-${row.personnelId}-${dt}`}
                                disabled={!canEdit}
                                onClick={() => handleDutyChange(row.personnelId, dt)}
                                className={`px-2 py-1 text-[11px] font-bold rounded-md border cursor-pointer transition-all ${
                                  isSelected
                                    ? `${meta.bg} ${meta.text} border-current ring-1 ring-current`
                                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {dt}
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

      {/* Mobile-only Duties list (Hidden on desktop, visible on mobile) */}
      <div className="md:hidden space-y-3.5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
          </div>
        ) : personnel.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <User className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا توجد قوة بشرية مسجلة لتوزيع المهام عليها.</p>
          </div>
        ) : (
          rows.map((row) => {
            const person = getPersonDetails(row.personnelId);
            if (!person) return null;

            const currentDutyMeta = DUTY_METADATA[row.duty];

            return (
              <div 
                key={row.personnelId}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 p-4 shadow-xs space-y-3"
              >
                {/* Header info */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">{person.rank} /</span>
                    <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">{person.fullName}</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold">#{person.militaryNumber}</span>
                </div>

                {/* Subtitle / Unit info */}
                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                  <span>{person.unit} {person.platoon && `(${person.platoon})`}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-lg ${currentDutyMeta.bg} ${currentDutyMeta.text}`}>
                    {currentDutyMeta.label}
                  </span>
                </div>

                {/* Duty assignment buttons */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 flex flex-col gap-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">تخصيص الواجب العسكري والخدمة:</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['حراسة', 'دورية', 'مطبخ', 'إداري', 'راحة', 'لا يوجد'] as DutyType[]).map((dt) => {
                      const isSelected = row.duty === dt;
                      const meta = DUTY_METADATA[dt];

                      return (
                        <button
                          key={dt}
                          id={`duty-mobile-btn-${row.personnelId}-${dt}`}
                          disabled={!canEdit}
                          onClick={() => handleDutyChange(row.personnelId, dt)}
                          className={`flex-1 min-w-[55px] text-center py-1 text-[11px] font-bold rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? `${meta.bg} ${meta.text} border-current ring-1 ring-current`
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-850'
                          }`}
                        >
                          {dt}
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
