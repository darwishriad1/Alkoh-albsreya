/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Personnel, Leave } from '../types';
import { getAllFromStore, recordLeaveReturn, submitLeaveReturn, subscribeToDbChanges } from '../lib/db';
import { 
  Bell, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  User, 
  CornerDownLeft, 
  X, 
  Check, 
  Search, 
  CalendarDays 
} from 'lucide-react';

interface AlertsViewProps {
  currentUser: {
    username: string;
    role: string;
  };
}

export default function AlertsView({ currentUser }: AlertsViewProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'overdue' | 'endingSoon'>('all');

  // Return modal state
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [selectedLeave, setSelectedLeave] = useState<{ leave: Leave; person: Personnel } | null>(null);
  const [actualReturnDate, setActualReturnDate] = useState<string>('');
  const [returnError, setReturnError] = useState<string>('');
  const [returnSuccess, setReturnSuccess] = useState<string>('');

  const username = currentUser.username || 'مدير النظام';
  const canEdit = currentUser.role !== 'viewer';

  const todayStr = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    try {
      const pData = await getAllFromStore<Personnel>('personnel');
      const lData = await getAllFromStore<Leave>('leaves');
      setPersonnel(pData);
      setLeaves(lData);
    } catch (err) {
      console.error('Failed to load data in AlertsView:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to DB changes for real-time updates
    const unsub = subscribeToDbChanges(() => {
      loadData();
    });

    return () => unsub();
  }, []);

  const getDaysOverdue = (endDateStr: string) => {
    const today = new Date(todayStr);
    const end = new Date(endDateStr);
    const diffTime = today.getTime() - end.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  const getDaysRemaining = (endDateStr: string) => {
    const today = new Date(todayStr);
    const end = new Date(endDateStr);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  const getEndingSoonLabel = (endDateStr: string) => {
    const today = new Date(todayStr);
    const end = new Date(endDateStr);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'تنتهي اليوم';
    if (diffDays === 1) return 'تنتهي غداً';
    if (diffDays === 2) return 'تنتهي بعد غد';
    return `خلال ${diffDays} يوم`;
  };

  // Get details for Overdue list
  const overdueList = (() => {
    const map = new Map<number, { leave: Leave; person: Personnel }>();
    const overdue = leaves.filter(l => !l.actualReturnDate && l.endDate < todayStr);
    
    for (const l of overdue) {
      const person = personnel.find(p => p.id === l.personnelId);
      if (person) {
        const existing = map.get(person.id!);
        if (!existing || l.endDate > existing.leave.endDate) {
          map.set(person.id!, { leave: l, person });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.leave.endDate.localeCompare(b.leave.endDate));
  })();

  // Get details for Ending Soon list
  const endingSoonList = (() => {
    const map = new Map<number, { leave: Leave; person: Personnel }>();
    const activeAndSoon = leaves.filter(l => !l.actualReturnDate && l.endDate >= todayStr);
    
    for (const l of activeAndSoon) {
      const end = new Date(l.endDate);
      const today = new Date(todayStr);
      const diffTime = end.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 0 && diffDays <= 2) {
        const person = personnel.find(p => p.id === l.personnelId);
        if (person) {
          const existing = map.get(person.id!);
          if (!existing || l.endDate < existing.leave.endDate) {
            map.set(person.id!, { leave: l, person });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.leave.endDate.localeCompare(b.leave.endDate));
  })();

  const handleOpenReturnModal = (leave: Leave, person: Personnel) => {
    setSelectedLeave({ leave, person });
    setActualReturnDate(new Date().toISOString().split('T')[0]);
    setReturnError('');
    setReturnSuccess('');
    setIsReturnModalOpen(true);
  };

  const handleReturnSubmit = async () => {
    if (!selectedLeave) return;
    if (!actualReturnDate) {
      setReturnError('يرجى اختيار تاريخ المباشرة الفعلية.');
      return;
    }

    try {
      setReturnError('');
      const leaveId = selectedLeave.leave.id!;
      
      // 1. Record return date
      await recordLeaveReturn(leaveId, actualReturnDate, username);
      // 2. Submit to HR
      await submitLeaveReturn(leaveId, username);
      
      setReturnSuccess('تم تسجيل المباشرة ومواصلة العمل بنجاح!');
      
      // Refresh local states
      await loadData();

      setTimeout(() => {
        setIsReturnModalOpen(false);
        setReturnSuccess('');
        setSelectedLeave(null);
      }, 1500);
    } catch (err: any) {
      setReturnError(err.message || 'فشل في تسجيل مواصلة العمل.');
    }
  };

  // Combine lists and apply filters
  const combinedList = [
    ...overdueList.map(item => ({ ...item, type: 'overdue' as const })),
    ...endingSoonList.map(item => ({ ...item, type: 'endingSoon' as const }))
  ];

  const filteredList = combinedList.filter(item => {
    // Tab filter
    if (activeTab === 'overdue' && item.type !== 'overdue') return false;
    if (activeTab === 'endingSoon' && item.type !== 'endingSoon') return false;

    // Search query filter
    if (!searchQuery) return true;
    const cleanQuery = searchQuery.trim();
    return (
      item.person.fullName.includes(cleanQuery) ||
      item.person.militaryNumber.includes(cleanQuery) ||
      item.person.unit.includes(cleanQuery) ||
      (item.person.platoon || '').includes(cleanQuery) ||
      item.person.rank.includes(cleanQuery)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div id="alerts-view-container" className="space-y-6" style={{ direction: 'rtl' }}>
      
      {/* Upper Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total active alerts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-extrabold block">إجمالي التنبيهات النشطة</span>
            <span className="text-3xl font-black text-slate-800 dark:text-slate-100 font-mono">
              {overdueList.length + endingSoonList.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Bell className="w-6 h-6 text-amber-500" />
          </div>
        </div>

        {/* Overdue Alerts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-extrabold block">الأفراد المتخلفين عن الحضور</span>
            <span className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono">
              {overdueList.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
          </div>
        </div>

        {/* Ending soon */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-extrabold block">مباشرة خلال الـ 48 ساعة القادمة</span>
            <span className="text-3xl font-black text-blue-600 dark:text-blue-400 font-mono">
              {endingSoonList.length}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Navigation, Search and filter controls */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs">
        
        {/* Left Side: Filter Tabs */}
        <div className="flex gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 shadow-md shadow-slate-900/10'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-850'
            }`}
          >
            الكل ({overdueList.length + endingSoonList.length})
          </button>
          
          <button
            onClick={() => setActiveTab('overdue')}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'overdue'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/15'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-850'
            }`}
          >
            المتخلفين عن الحضور ({overdueList.length})
          </button>

          <button
            onClick={() => setActiveTab('endingSoon')}
            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'endingSoon'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-850'
            }`}
          >
            إجازات تنتهي خلال 48 ساعة ({endingSoonList.length})
          </button>
        </div>

        {/* Right Side: Interactive Search Box */}
        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="alerts-search-input"
            type="text"
            placeholder="ابحث بالاسم، الرقم العسكري أو السرية..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
          />
        </div>
      </div>

      {/* Alerts Grid / Table */}
      {filteredList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
          <div className="space-y-1">
            <h3 className="font-extrabold text-slate-800 dark:text-slate-200">المنظومة خالية من التنبيهات</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold max-w-md mx-auto leading-relaxed">
              جميع الأفراد ملتزمون بمواعيد الإجازات وعادوا لمباشرة أعمالهم في الوقت المحدد، ولا يوجد أي متخلفين عن الحضور حالياً.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map(({ leave, person, type }) => {
            const isOverdue = type === 'overdue';
            const daysOverdue = isOverdue ? getDaysOverdue(leave.endDate) : 0;
            const daysRemaining = !isOverdue ? getDaysRemaining(leave.endDate) : 0;
            const endingLabel = !isOverdue ? getEndingSoonLabel(leave.endDate) : '';

            return (
              <div 
                key={leave.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-xs flex flex-col justify-between transition-all duration-300 hover:shadow-md ${
                  isOverdue 
                    ? 'border-rose-100 dark:border-rose-950/40 bg-gradient-to-br from-white to-rose-50/20 dark:to-rose-950/5' 
                    : 'border-blue-100 dark:border-blue-950/40 bg-gradient-to-br from-white to-blue-50/20 dark:to-blue-950/5'
                }`}
              >
                {/* Header Information */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                      isOverdue 
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' 
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                    }`}>
                      {isOverdue ? `متخلف منذ ${daysOverdue} يوم` : endingLabel}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold font-mono">
                      رقم عسكري: {person.militaryNumber}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                      {person.rank} / {person.fullName}
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold">
                      {person.unit} {person.platoon && `• ${person.platoon}`}
                    </p>
                  </div>

                  <div className="border-t border-dashed border-slate-100 dark:border-slate-800/60 pt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex justify-between font-medium">
                      <span>نوع الإجازة:</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {leave.leaveType === 'استحقاقه' ? 'سنوية استحقاق' : leave.leaveType}
                      </span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>تاريخ الانتهاء المقرر:</span>
                      <span className="font-bold font-mono text-slate-700 dark:text-slate-300">
                        {leave.endDate}
                      </span>
                    </div>
                    {!isOverdue && (
                      <div className="flex justify-between font-medium">
                        <span>الوقت المتبقي:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {daysRemaining === 0 ? 'اليوم' : `متبقي ${daysRemaining} يوم`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Button */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <button
                    onClick={() => handleOpenReturnModal(leave, person)}
                    className={`w-full py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isOverdue 
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/10' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10'
                    }`}
                  >
                    <CornerDownLeft className="w-4 h-4" />
                    <span>تسجيل المباشرة ومواصلة الخدمة</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- CONFIRM RETURN / CONTINUATION MODAL --- */}
      {isReturnModalOpen && selectedLeave && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <CornerDownLeft className="w-5 h-5 text-emerald-500" />
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100">مباشرة وعودة للخدمة</h3>
              </div>
              <button 
                onClick={() => setIsReturnModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-4">
              {!canEdit ? (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                  <span>عذراً، لا تمتلك صلاحية لتسجيل عودة ومباشرة الأفراد (مشاهد فقط).</span>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">تفاصيل الفرد المباشر للخدمة:</p>
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                      {selectedLeave.person.rank} / {selectedLeave.person.fullName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                      رقم عسكري: {selectedLeave.person.militaryNumber} • {selectedLeave.person.unit}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold font-mono">
                      تاريخ انتهاء الإجازة المفترض: {selectedLeave.leave.endDate}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">تاريخ العودة والمباشرة الفعلية:</label>
                    <input
                      type="date"
                      value={actualReturnDate}
                      onChange={(e) => setActualReturnDate(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold font-mono text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  {returnError && (
                    <div className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-bold rounded-xl text-center">
                      {returnError}
                    </div>
                  )}

                  {returnSuccess && (
                    <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl text-center flex items-center justify-center gap-1.5 animate-pulse">
                      <Check className="w-4 h-4" />
                      <span>{returnSuccess}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer buttons */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5">
              <button
                onClick={() => setIsReturnModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              {canEdit && (
                <button
                  onClick={handleReturnSubmit}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/10 cursor-pointer"
                >
                  تأكيد وتسجيل المباشرة
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
