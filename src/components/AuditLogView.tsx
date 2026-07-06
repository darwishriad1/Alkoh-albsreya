/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AuditLogEntry } from '../types';
import { getAllFromStore, clearAuditLog } from '../lib/db';
import { Trash2, Search, Calendar, Shield, Clock, AlertTriangle } from 'lucide-react';

interface AuditLogViewProps {
  currentUser: { username: string; role: string };
}

export default function AuditLogView({ currentUser }: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const isAdmin = currentUser.role === 'admin';

  const loadData = async () => {
    try {
      const data = await getAllFromStore<AuditLogEntry>('auditLog');
      // Sort chronologically (newest first)
      const sorted = data.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setLogs(sorted);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, 2000); // Polling logs
    return () => clearInterval(interval);
  }, []);

  const handleClearLogs = async () => {
    if (!isAdmin) return;
    if (confirm('هل أنت متأكد من مسح وتطهير سجل التدقيق والنظام بالكامل؟ هذا الإجراء غير قابل للتراجع ومقيد للمسؤول فقط!')) {
      try {
        await clearAuditLog(currentUser.username);
        loadData();
      } catch (err: any) {
        alert('حدث خطأ: ' + err.message);
      }
    }
  };

  // Filter logs by action type or description
  const filteredLogs = logs.filter(l => {
    return (
      l.action.includes(searchQuery) ||
      l.details.includes(searchQuery) ||
      l.user.includes(searchQuery)
    );
  });

  const formatArabicDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      // Format as YYYY-MM-DD HH:MM:SS
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div id="audit-log-view-container" className="space-y-6">
      {/* Search and control header */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-xs">
        <div className="relative w-full sm:w-auto min-w-[320px]">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="audit-search"
            type="text"
            placeholder="ابحث عن إجراء، اسم الفرد، تفاصيل، أو مستخدم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
          />
        </div>

        {isAdmin && logs.length > 0 && (
          <button
            id="clear-logs-btn"
            onClick={handleClearLogs}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            تطهير السجل وتصفيره
          </button>
        )}
      </div>

      {/* Logs timeline list card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <Clock className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-sm font-semibold">لا يوجد أية عمليات أو إجراءات مسجلة تطابق بحثك حالياً.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold font-sans">
                  <th className="py-4 px-6 w-48">الوقت والتاريخ</th>
                  <th className="py-4 px-6 w-36">نوع الإجراء</th>
                  <th className="py-4 px-6">تفاصيل وتوثيق الحركة</th>
                  <th className="py-4 px-6 w-36">المستخدم المنفذ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs font-sans font-medium">
                {filteredLogs.map((l) => {
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                      <td className="py-3 px-6 text-slate-500 font-mono font-bold">
                        {formatArabicDate(l.time)}
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded-lg ${
                          l.action.includes('حذف') ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400' :
                          l.action.includes('إضافة') ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400' :
                          l.action.includes('إجازة') ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400' :
                          l.action.includes('تحضير') ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                          'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {l.action}
                        </span>
                      </td>
                      <td className="py-3 px-6 font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
                        {l.details}
                      </td>
                      <td className="py-3 px-6 font-bold text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          {l.user}
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
    </div>
  );
}
