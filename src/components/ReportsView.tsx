/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Leave, Personnel } from '../types';
import { getAllFromStore, bulkSubmitCuts, bulkSubmitReturns } from '../lib/db';
import { FileText, Printer, CheckSquare, ShieldCheck, HelpCircle, FileCheck, Award } from 'lucide-react';

interface ReportsViewProps {
  currentUser: { username: string; role: string };
}

export default function ReportsView({ currentUser }: ReportsViewProps) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'cuts' | 'returns'>('cuts');

  const canEdit = currentUser.role === 'admin' || currentUser.role === 'editor';
  const todayStr = new Date().toLocaleDateString('ar-YE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const loadData = async () => {
    try {
      const [allLeaves, allP] = await Promise.all([
        getAllFromStore<Leave>('leaves'),
        getAllFromStore<Personnel>('personnel')
      ]);
      setLeaves(allLeaves);
      setPersonnel(allP);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, 1500); // Poll for sync
    return () => clearInterval(interval);
  }, []);

  const getPersonDetails = (id: number) => {
    return personnel.find(p => p.id === id);
  };

  // Pending Cuts list (cutSubmitted = false)
  const pendingCuts = leaves.filter(l => !l.cutSubmitted);

  // Pending Returns list (actualReturnDate exists, returnSubmitted = false)
  const pendingReturns = leaves.filter(l => l.actualReturnDate && !l.returnSubmitted);

  // Bulk Raise Cuts
  const handleBulkSubmitCuts = async () => {
    if (!canEdit || pendingCuts.length === 0) return;
    try {
      const ids = pendingCuts.map(l => l.id!);
      await bulkSubmitCuts(ids, currentUser.username);
      loadData();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  // Bulk Raise Returns
  const handleBulkSubmitReturns = async () => {
    if (!canEdit || pendingReturns.length === 0) return;
    try {
      const ids = pendingReturns.map(l => l.id!);
      await bulkSubmitReturns(ids, currentUser.username);
      loadData();
    } catch (err: any) {
      alert('حدث خطأ: ' + err.message);
    }
  };

  const triggerPrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div id="reports-view-container" className="space-y-6">
      {/* Tab select header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 no-print">
        <div className="flex gap-4">
          <button
            id="tab-cuts-btn"
            onClick={() => setActiveTab('cuts')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'cuts'
                ? 'border-amber-500 text-slate-900 dark:text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            طلب قطع الإجازات المعلقة ({pendingCuts.length})
          </button>
          
          <button
            id="tab-returns-btn"
            onClick={() => setActiveTab('returns')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'returns'
                ? 'border-amber-500 text-slate-900 dark:text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            إقرارات العودة ومباشرة العمل المعلقة ({pendingReturns.length})
          </button>
        </div>

        {/* Action Panel */}
        <div className="flex gap-2">
          {activeTab === 'cuts' && pendingCuts.length > 0 && canEdit && (
            <button
              id="bulk-raise-cuts-btn"
              onClick={handleBulkSubmitCuts}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
            >
              رفع جميع القطوعات ({pendingCuts.length})
            </button>
          )}

          {activeTab === 'returns' && pendingReturns.length > 0 && canEdit && (
            <button
              id="bulk-raise-returns-btn"
              onClick={handleBulkSubmitReturns}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
            >
              رفع جميع المباشرات ({pendingReturns.length})
            </button>
          )}

          <button
            id="print-report-btn"
            onClick={triggerPrint}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-amber-600 dark:hover:bg-amber-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            طباعة التقرير الرسمي
          </button>
        </div>
      </div>

      {/* Printable Area Wrapper */}
      <div id="printable-report-area" className="print-container bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs p-6 sm:p-8 space-y-6">
        
        {/* Print Header (Only visible on paper and styled nicely) */}
        <div className="border-b-2 border-slate-900 dark:border-slate-800 pb-4 flex justify-between items-center text-slate-900 dark:text-white">
          <div className="text-right space-y-1">
            <h2 className="text-lg font-extrabold">قوات العمالقة الجنوبية</h2>
            <p className="text-xs font-bold">اللواء 43 عمالقة - شؤون الأفراد والضباط</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">مكتب السجلات العسكرية</p>
          </div>
          
          <div className="flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-slate-300 dark:border-slate-750 flex items-center justify-center bg-slate-50 dark:bg-slate-850">
              <Award className="w-6 h-6 text-amber-600 dark:text-amber-500" />
            </div>
            <span className="text-[10px] font-bold mt-1 text-slate-800 dark:text-slate-200">شعار اللواء 43</span>
          </div>

          <div className="text-left space-y-1">
            <p className="text-xs font-semibold">التاريخ: <span className="font-mono">{new Date().toISOString().split('T')[0]}</span></p>
            <p className="text-xs font-semibold">تاريخ التحضير: <span className="font-mono">{todayStr}</span></p>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-500">سري ومكتوم</p>
          </div>
        </div>

        {/* Tab Title in Print */}
        <div className="text-center space-y-2 py-2">
          <h1 className="text-base font-extrabold tracking-wide uppercase border-b-2 border-slate-200 dark:border-slate-800 pb-2 max-w-sm mx-auto">
            {activeTab === 'cuts' 
              ? 'كشف بطلبات قطع الإجازات العسكرية المعلقة' 
              : 'كشف بإقرارات العودة ومباشرات العمل المعلقة'
            }
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {activeTab === 'cuts'
              ? `إجمالي الطلبات المعلقة المراد تسليمها لقسم شؤون الأفراد: ${pendingCuts.length} طلب`
              : `إجمالي طلبات مباشرات العمل المعلقة المراد قيدها رسمياً: ${pendingReturns.length} طلب مباشر`
            }
          </p>
        </div>

        {/* Tab content list */}
        {activeTab === 'cuts' ? (
          <div>
            {pendingCuts.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FileCheck className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300" />
                <p className="text-sm font-semibold">لا توجد طلبات قطع إجازات معلقة حالياً.</p>
                <p className="text-xs mt-1">كافة إجازات منتسبي اللواء تم قطعها وإرفاق ملفاتها بالكامل.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                      <th className="py-3 px-4 w-12 text-center">م</th>
                      <th className="py-3 px-4">الرقم العسكري</th>
                      <th className="py-3 px-4">الرتبة</th>
                      <th className="py-3 px-4">الاسم الكامل للفرد</th>
                      <th className="py-3 px-4">الوحدة / السرية</th>
                      <th className="py-3 px-4">فترة الإجازة</th>
                      <th className="py-3 px-4 text-center">عدد الأيام</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {pendingCuts.map((l, idx) => {
                      const person = getPersonDetails(l.personnelId);
                      return (
                        <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-600 dark:text-slate-400">{person?.militaryNumber}</td>
                          <td className="py-3 px-4 font-bold">{person?.rank}</td>
                          <td className="py-3 px-4 font-bold">{person?.fullName}</td>
                          <td className="py-3 px-4 font-semibold">{person?.unit}</td>
                          <td className="py-3 px-4 font-mono text-xs">من {l.startDate} إلى {l.endDate}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-amber-600">{l.daysCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div>
            {pendingReturns.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FileCheck className="w-12 h-12 mx-auto stroke-1 mb-2 text-slate-300" />
                <p className="text-sm font-semibold">لا توجد مباشرات عودة معلقة حالياً.</p>
                <p className="text-xs mt-1">كافة مباشرات عودة منتسبي اللواء تم رفعها واعتمادها بالكامل.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-250 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                      <th className="py-3 px-4 w-12 text-center">م</th>
                      <th className="py-3 px-4">الرقم العسكري</th>
                      <th className="py-3 px-4">الرتبة</th>
                      <th className="py-3 px-4">الاسم الكامل للفرد</th>
                      <th className="py-3 px-4">الوحدة / السرية</th>
                      <th className="py-3 px-4 font-mono">الانتهاء المخطط</th>
                      <th className="py-3 px-4 font-mono">العودة الفعلية</th>
                      <th className="py-3 px-4 text-center">ملاحظات العودة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {pendingReturns.map((l, idx) => {
                      const person = getPersonDetails(l.personnelId);
                      const isLate = new Date(l.actualReturnDate!) > new Date(l.endDate);

                      return (
                        <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-600 dark:text-slate-400">{person?.militaryNumber}</td>
                          <td className="py-3 px-4 font-bold">{person?.rank}</td>
                          <td className="py-3 px-4 font-bold">{person?.fullName}</td>
                          <td className="py-3 px-4 font-semibold">{person?.unit}</td>
                          <td className="py-3 px-4 font-mono text-xs">{l.endDate}</td>
                          <td className="py-3 px-4 font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">{l.actualReturnDate}</td>
                          <td className="py-3 px-4 text-center text-xs">
                            {isLate ? (
                              <span className="text-rose-600 dark:text-rose-450 font-bold">متأخر عن المباشرة الرسمية</span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">في الموعد المحدد</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Official Military Signatures Block (For Print) */}
        <div className="grid grid-cols-2 gap-12 pt-16 border-t border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" style={{ pageBreakInside: 'avoid' }}>
          <div className="text-center space-y-12">
            <p className="text-xs font-bold">توقيع وختم ضابط شؤون القوة والارتباط للواء</p>
            <div className="w-48 border-b border-dashed border-slate-400 mx-auto"></div>
            <p className="text-[10px] text-slate-400">الاسم واللقب: .......................................</p>
          </div>

          <div className="text-center space-y-12">
            <p className="text-xs font-bold">مصادقة رئيس أركان / قائد اللواء 43 عمالقة</p>
            <div className="w-48 border-b border-dashed border-slate-400 mx-auto"></div>
            <p className="text-[10px] text-slate-400">الاسم والختم: .......................................</p>
          </div>
        </div>
      </div>
    </div>
  );
}
