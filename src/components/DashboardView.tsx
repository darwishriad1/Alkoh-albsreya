/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Personnel, Leave, LeaveType, AuditLogEntry } from '../types';
import ExcelJS from 'exceljs';
import { getAllFromStore, submitLeaveCut, recordLeaveReturn, submitLeaveReturn, addLeave, putInStore, writeAuditLog } from '../lib/db';
import { 
  Users, 
  ShieldAlert, 
  HeartPulse, 
  UserCheck, 
  LogOut, 
  Clock, 
  Calendar, 
  Compass, 
  Shield, 
  Scissors, 
  CornerDownLeft, 
  FileText, 
  Printer, 
  X, 
  Check, 
  Search, 
  AlertTriangle,
  BellRing,
  CalendarDays,
  Database,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Radio,
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface DashboardViewProps {
  currentUser?: {
    username: string;
    role: string;
  };
  onNavigateToTab?: (tab: 'dashboard' | 'personnel' | 'attendance' | 'leaves' | 'duties' | 'reports' | 'audit' | 'users' | 'backup' | 'alerts') => void;
}

export default function DashboardView({ currentUser, onNavigateToTab }: DashboardViewProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');
  const [loading, setLoading] = useState<boolean>(true);
  const [feedTab, setFeedTab] = useState<'all' | 'leaves' | 'absences' | 'returns'>('all');
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isFeedExpanded, setIsFeedExpanded] = useState<boolean>(false);
  const [isAutoPlay, setIsAutoPlay] = useState<boolean>(true);
  const [feedSearchQuery, setFeedSearchQuery] = useState<string>('');
  const [feedLimit, setFeedLimit] = useState<number>(3);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [exportingFeedExcel, setExportingFeedExcel] = useState<boolean>(false);

  // User permissions and info
  const username = currentUser?.username || 'مدير النظام';
  const canEdit = currentUser?.role !== 'viewer';

  // Modal states for shortcuts
  const [isCutModalOpen, setIsCutModalOpen] = useState(false);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string>(''); // Stores selected Personnel ID
  const [cutSearch, setCutSearch] = useState('');
  const [cutError, setCutError] = useState('');
  const [cutSuccess, setCutSuccess] = useState('');

  // States for Leave Granting (which is "قطع إجازة" in user context)
  const [cutLeaveType, setCutLeaveType] = useState<LeaveType>('استحقاقه');
  const [cutStartDate, setCutStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [cutEndDate, setCutEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [cutDaysCount, setCutDaysCount] = useState<number>(1);

  // Monitor and calculate days count
  useEffect(() => {
    if (cutStartDate && cutEndDate) {
      const start = new Date(cutStartDate);
      const end = new Date(cutEndDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
      setCutDaysCount(diffDays > 0 ? diffDays : 0);
    } else {
      setCutDaysCount(0);
    }
  }, [cutStartDate, cutEndDate]);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedReturnLeaveId, setSelectedReturnLeaveId] = useState<string>('');
  const [actualReturnDate, setActualReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAlertCollapsed, setIsAlertCollapsed] = useState(false);
  const [isAlertsSectionOpen, setIsAlertsSectionOpen] = useState(false);
  const [activeAlertSubTab, setActiveAlertSubTab] = useState<'overdue' | 'endingSoon'>('overdue');

  // Helper functions to open modals with clean slate
  const handleOpenCutModal = () => {
    setSelectedLeaveId('');
    setCutSearch('');
    setCutError('');
    setCutSuccess('');
    setCutLeaveType('استحقاقه');
    const today = new Date().toISOString().split('T')[0];
    setCutStartDate(today);
    setCutEndDate(today);
    setIsCutModalOpen(true);
  };

  const handleOpenReturnModal = (initialLeaveId?: string | number) => {
    setSelectedReturnLeaveId(initialLeaveId ? String(initialLeaveId) : '');
    setReturnSearch('');
    setReturnError('');
    setReturnSuccess('');
    setActualReturnDate(new Date().toISOString().split('T')[0]);
    setIsReturnModalOpen(true);
  };

  const handleOpenReportModal = () => {
    setIsReportModalOpen(true);
  };

  const handleCutSubmit = async () => {
    if (!selectedLeaveId) {
      setCutError('يرجى اختيار فرد أولاً لمنحه الإجازة.');
      return;
    }
    if (!cutStartDate || !cutEndDate) {
      setCutError('يرجى تحديد تاريخ بداية ونهاية الإجازة.');
      return;
    }
    if (cutDaysCount <= 0) {
      setCutError('تاريخ نهاية الإجازة يجب أن يكون مساوياً أو بعد تاريخ البدء.');
      return;
    }

    const pId = Number(selectedLeaveId);
    const person = personnel.find(p => p.id === pId);
    if (!person) {
      setCutError('الفرد المحدد غير موجود.');
      return;
    }

    const newLeave: Leave = {
      personnelId: pId,
      leaveType: cutLeaveType,
      startDate: cutStartDate,
      endDate: cutEndDate,
      daysCount: cutDaysCount,
      cutSubmitted: false,
      returnSubmitted: false
    };

    try {
      setCutError('');
      await addLeave(newLeave, username);
      setCutSuccess(`تم قطع إجازة (منح الإجازة) لـ ${person.rank} / ${person.fullName} بنجاح!`);

      // Reload state
      const [allP, allL] = await Promise.all([
        getAllFromStore<Personnel>('personnel'),
        getAllFromStore<Leave>('leaves')
      ]);
      setPersonnel(allP);
      setLeaves(allL);

      setTimeout(() => {
        setIsCutModalOpen(false);
        setCutSuccess('');
        setSelectedLeaveId('');
      }, 1800);
    } catch (err: any) {
      setCutError(err.message || 'فشل في منح الإجازة.');
    }
  };

  const handleReturnSubmit = async () => {
    if (!selectedReturnLeaveId) {
      setReturnError('يرجى اختيار فرد أولاً لتسجيل مواصلته.');
      return;
    }
    if (!actualReturnDate) {
      setReturnError('يرجى اختيار تاريخ العودة الفعلية لمباشرة الخدمة.');
      return;
    }
    try {
      setReturnError('');
      const leaveId = Number(selectedReturnLeaveId);
      // 1. Record return date
      await recordLeaveReturn(leaveId, actualReturnDate, username);
      // 2. Submit to HR
      await submitLeaveReturn(leaveId, username);
      
      setReturnSuccess('تم تسجيل المواصلة والعودة لمباشرة العمل بنجاح!');
      setTimeout(() => {
        setIsReturnModalOpen(false);
        setReturnSuccess('');
        setSelectedReturnLeaveId('');
      }, 1500);
    } catch (err: any) {
      setReturnError(err.message || 'فشل في تسجيل مواصلة العمل.');
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [allP, allL, allLogs] = await Promise.all([
        getAllFromStore<Personnel>('personnel'),
        getAllFromStore<Leave>('leaves'),
        getAllFromStore<AuditLogEntry>('auditLog'),
      ]);
      setPersonnel(allP);
      setLeaves(allL);
      const sortedLogs = allLogs.sort((a, b) => (b.id || 0) - (a.id || 0));
      setAuditLogs(sortedLogs);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleExportFeedExcel = async () => {
    setExportingFeedExcel(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام المتابعة العسكري - اللواء 43';
      workbook.lastModifiedBy = 'شعبة المتابعة الفورية';
      workbook.created = new Date();
      
      const sheet = workbook.addWorksheet('سجل الحركة الفوري', {
        views: [{ rightToLeft: true }]
      });
      sheet.views[0].showGridLines = true;

      // Title Block
      sheet.mergeCells('A1:F1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'شعبة المتابعة والسيطرة - سجل رصد التحركات والعمليات الفورية';
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(1).height = 40;

      // Report Details
      sheet.mergeCells('A2:F2');
      const detailsCell = sheet.getCell('A2');
      const activeFilterLabel = feedTab === 'all' ? 'كافة الأحداث' : feedTab === 'leaves' ? 'الإجازات الممنوحة' : feedTab === 'absences' ? 'الغيابات والتاخير' : 'مباشرات العودة';
      detailsCell.value = `نوع التصفية: ${activeFilterLabel} | البحث: ${feedSearchQuery || 'لا يوجد'} | تاريخ التصدير: ${new Date().toLocaleDateString('ar-YE')} ${new Date().toLocaleTimeString('ar-YE', {hour: '2-digit', minute: '2-digit'})}`;
      detailsCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF334155' } };
      detailsCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
      detailsCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(2).height = 25;

      sheet.addRow([]); // Spacer

      // Headers
      const headers = ['م', 'الرصد / الوقت', 'نوع الحركة', 'الحدث العملياتي', 'تفاصيل الإجراء وحالة القوة', 'المسؤول / المسجل'];
      const headerRow = sheet.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF475569' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
          left: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FF94A3B8' } }
        };
      });

      // Data Rows
      filteredFeedEvents.forEach((ev, idx) => {
        const formattedTime = ev.time 
          ? new Date(ev.time).toLocaleDateString('ar-YE') + ' ' + new Date(ev.time).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }) 
          : 'الآن';
        
        const typeArabic = ev.type === 'absent' ? '⚠️ غياب/تأخير' : ev.type === 'leave' ? '✈️ منح إجازة' : ev.type === 'return' ? '🔄 عودة ومباشرة' : '⚙️ نظام';

        const r = sheet.addRow([
          idx + 1,
          formattedTime,
          typeArabic,
          ev.action,
          ev.details,
          ev.user
        ]);
        r.height = 22;

        r.eachCell((cell, colIdx) => {
          cell.font = { name: 'Arial', size: 9 };
          cell.alignment = { 
            horizontal: colIdx === 5 ? 'right' : colIdx === 1 ? 'center' : 'center', 
            vertical: 'middle' 
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };

          if (ev.type === 'absent') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2F2' } };
          } else if (ev.type === 'leave') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F5FF' } };
          } else if (ev.type === 'return') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0FDF4' } };
          }
        });
      });

      sheet.columns.forEach((col, idx) => {
        if (idx === 0) col.width = 6;
        else if (idx === 1) col.width = 20;
        else if (idx === 2) col.width = 16;
        else if (idx === 3) col.width = 24;
        else if (idx === 4) col.width = 55;
        else col.width = 20;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `سجل_التحركات_الفورية_اللواء_43_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
    } catch (err) {
      console.error('Failed to export feed excel:', err);
      alert('فشل تصدير سجل التحركات. يرجى المحاولة مرة أخرى.');
    } finally {
      setExportingFeedExcel(false);
    }
  };

  // Load database statistics
  useEffect(() => {
    async function loadStats() {
      try {
        const [allP, allL, allLogs] = await Promise.all([
          getAllFromStore<Personnel>('personnel'),
          getAllFromStore<Leave>('leaves'),
          getAllFromStore<AuditLogEntry>('auditLog'),
        ]);
        setPersonnel(allP);
        setLeaves(allL);
        // Sort logs descending by ID so latest is first
        const sortedLogs = allLogs.sort((a, b) => {
          const idA = a.id || 0;
          const idB = b.id || 0;
          return idB - idA;
        });
        setAuditLogs(sortedLogs);
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
    
    // Subscribe to DB changes so stats update in real-time
    const handleDbChange = () => {
      loadStats();
    };
    
    // Listen for custom change events
    const unsub = window.setInterval(loadStats, 1000); // Polling as failsafe besides subscription
    return () => clearInterval(unsub);
  }, []);

  // Auto-rotate the featured spotlight log card every 4.5 seconds
  useEffect(() => {
    if (!isAutoPlay) return;
    const timer = setInterval(() => {
      setSpotlightIndex((prev) => prev + 1);
    }, 4500);
    return () => clearInterval(timer);
  }, [isAutoPlay]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  // Count aggregates
  const totalCount = personnel.length;
  const presentCount = personnel.filter(p => p.status === 'موجود').length;
  const leaveCount = personnel.filter(p => p.status === 'إجازة').length;
  const absentCount = personnel.filter(p => p.status === 'غياب').length;
  const sickCount = personnel.filter(p => p.status === 'مريض').length;
  const permitCount = personnel.filter(p => p.status === 'إذن').length;

  // Readiness Percentage
  const readinessPercentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  // Active Leaves (end date >= today)
  const todayStr = new Date().toISOString().split('T')[0];
  const activeLeaves = leaves.filter(l => {
    // If there is an actual return date, it's not active anymore
    if (l.actualReturnDate) return false;
    return l.endDate >= todayStr;
  });

  // Get active leaves with person details
  const activeLeavesWithDetails = activeLeaves.map(l => {
    const person = personnel.find(p => p.id === l.personnelId);
    return {
      leave: l,
      person
    };
  }).filter(item => item.person !== undefined);

  // Get pending return leaves (leaves with no actualReturnDate)
  const pendingReturnLeaves = leaves.filter(l => !l.actualReturnDate).map(l => {
    const person = personnel.find(p => p.id === l.personnelId);
    return {
      leave: l,
      person
    };
  }).filter(item => item.person !== undefined);

  const units = ['هيئة القيادة', 'السرية الأولى', 'السرية الثانية', 'السرية الثالثة'];
  const unitStats = units.map(u => {
    // Match 'السرية الثالث' or 'السرية الثالثة' correctly
    const matchName = u === 'السرية الثالثة' ? 'السرية الثالث' : u;
    const unitP = personnel.filter(p => p.unit.includes(matchName) || p.unit.includes(u));
    const total = unitP.length;
    const present = unitP.filter(p => p.status === 'موجود').length;
    const leave = unitP.filter(p => p.status === 'إجازة').length;
    const absent = unitP.filter(p => p.status === 'غياب').length;
    const sick = unitP.filter(p => p.status === 'مريض').length;
    const permit = unitP.filter(p => p.status === 'إذن').length;
    const ready = total > 0 ? Math.round((present / total) * 100) : 0;
    return { name: u, total, present, leave, absent, sick, permit, ready };
  });

  const grandTotal = unitStats.reduce((sum, item) => sum + item.total, 0);
  const grandPresent = unitStats.reduce((sum, item) => sum + item.present, 0);
  const grandLeave = unitStats.reduce((sum, item) => sum + item.leave, 0);
  const grandAbsent = unitStats.reduce((sum, item) => sum + item.absent, 0);
  const grandSick = unitStats.reduce((sum, item) => sum + item.sick, 0);
  const grandPermit = unitStats.reduce((sum, item) => sum + item.permit, 0);
  const grandReady = grandTotal > 0 ? Math.round((grandPresent / grandTotal) * 100) : 0;

  const criticalPersonnel = personnel.filter(p => p.status === 'غياب' || p.status === 'مريض');

  // Map personnel ID to Name & Rank
  const getPersonDetails = (id: number) => {
    const person = personnel.find(p => p.id === id);
    return person ? { name: person.fullName, rank: person.rank, unit: person.unit } : { name: 'غير معروف', rank: '', unit: '' };
  };

  // Helper: Calculate days remaining
  const getDaysRemaining = (endDateStr: string) => {
    const today = new Date(todayStr);
    const end = new Date(endDateStr);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  // Helper: Calculate days overdue (ended but did not return yet)
  const getDaysOverdue = (endDateStr: string) => {
    const today = new Date(todayStr);
    const end = new Date(endDateStr);
    const diffTime = today.getTime() - end.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  // Get personnel whose leaves have ended but haven't registered return/continuation yet
  const overdueLeavesWithDetails = (() => {
    const today = new Date().toISOString().split('T')[0];
    const map = new Map<number, { leave: Leave; person: Personnel }>();
    
    // Filter leaves that have ended but don't have actualReturnDate
    const overdue = leaves.filter(l => !l.actualReturnDate && l.endDate < today);
    
    for (const l of overdue) {
      const person = personnel.find(p => p.id === l.personnelId);
      if (person) {
        // If they are already added, keep the one with the latest endDate
        const existing = map.get(person.id!);
        if (!existing || l.endDate > existing.leave.endDate) {
          map.set(person.id!, { leave: l, person });
        }
      }
    }
    
    return Array.from(map.values()).sort((a, b) => a.leave.endDate.localeCompare(b.leave.endDate));
  })();

  // Helper: Get human-readable label for leaves ending soon
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

  // Get personnel whose leaves are ending within the next 48 hours (ends today, tomorrow, or after tomorrow)
  const endingSoonLeavesWithDetails = (() => {
    const today = new Date(todayStr);
    const map = new Map<number, { leave: Leave; person: Personnel }>();
    
    // Filter active leaves (no actualReturnDate yet) whose endDate is >= todayStr
    const activeAndSoon = leaves.filter(l => !l.actualReturnDate && l.endDate >= todayStr);
    
    for (const l of activeAndSoon) {
      const end = new Date(l.endDate);
      const diffTime = end.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // If it ends within 48 hours (<= 2 days from today)
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

  // 🇸🇾 Construction of Unified Live Operations Feed (Absences, Leaves, Returnees)
  const feedEvents = (() => {
    const list: Array<{
      id: string | number;
      type: 'leave' | 'absent' | 'return' | 'system';
      action: string;
      details: string;
      user: string;
      time: string;
    }> = [];

    // 1. Process actual audit logs
    auditLogs.forEach((log) => {
      let type: 'leave' | 'absent' | 'return' | 'system' = 'system';
      const actionText = log.action || '';
      const detailsText = log.details || '';

      if (
        actionText.includes('غياب') || 
        detailsText.includes('غياب') || 
        actionText.includes('تخلف') || 
        detailsText.includes('تخلف')
      ) {
        type = 'absent';
      } else if (
        actionText.includes('إجازة') || 
        detailsText.includes('إجازة') || 
        actionText.includes('مأذون') || 
        detailsText.includes('مأذون')
      ) {
        type = 'leave';
      } else if (
        actionText.includes('عودة') || 
        detailsText.includes('عودة') || 
        actionText.includes('مواصلة') || 
        detailsText.includes('مواصلة') || 
        actionText.includes('مباشرة') || 
        detailsText.includes('مباشرة')
      ) {
        type = 'return';
      }

      list.push({
        id: `log-${log.id || Math.random()}`,
        type,
        action: log.action,
        details: log.details,
        user: log.user,
        time: log.time,
      });
    });

    // 2. Add dynamic states to keep feed alive & extremely accurate
    // Add absent status alerts
    personnel.filter(p => p.status === 'غياب').forEach(p => {
      list.push({
        id: `abs-${p.id}`,
        type: 'absent',
        action: 'تنبيه غياب عملياتي',
        details: `الفرد ${p.rank} / ${p.fullName} مقيد بحالة [غياب] عن الخدمة اليومية لـ ${p.unit}.`,
        user: 'منظومة الرصد الفوري',
        time: new Date().toISOString()
      });
    });

    // Add currently active leaves
    leaves.filter(l => !l.actualReturnDate && l.endDate >= todayStr).forEach(l => {
      const p = personnel.find(person => person.id === l.personnelId);
      if (p) {
        const remaining = getDaysRemaining(l.endDate);
        list.push({
          id: `leave-active-${l.id}`,
          type: 'leave',
          action: 'مأذونية إجازة جارية',
          details: `الفرد ${p.rank} / ${p.fullName} في إجازة [${l.leaveType === 'استحقاقه' ? 'سنوية' : l.leaveType}] تنتهي بعد ${remaining} أيام في ${l.endDate}.`,
          user: 'شعبة القوة البشرية',
          time: l.startDate
        });
      }
    });

    // Add returning personnel
    leaves.filter(l => l.actualReturnDate).forEach(l => {
      const p = personnel.find(person => person.id === l.personnelId);
      if (p) {
        list.push({
          id: `ret-${l.id}`,
          type: 'return',
          action: 'تسجيل مواصلة الخدمة',
          details: `تم تسجيل العودة والمباشرة بنجاح لـ ${p.rank} / ${p.fullName} ومباشرة العمل بكتيبة الدعم والسيطرة.`,
          user: 'مدير العمليات',
          time: l.actualReturnDate || ''
        });
      }
    });

    // Unique-fy by details to prevent duplicate messages
    const seen = new Set<string>();
    const uniqueList = list.filter(item => {
      const key = `${item.type}-${item.details.substring(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by time or priority so latest is first
    return uniqueList.sort((a, b) => {
      const timeA = new Date(a.time).getTime() || 0;
      const timeB = new Date(b.time).getTime() || 0;
      return timeB - timeA;
    });
  })();

  const filteredFeedEvents = feedEvents.filter((ev) => {
    // 1. Filter by feedTab
    let matchesTab = true;
    if (feedTab === 'leaves') matchesTab = ev.type === 'leave';
    else if (feedTab === 'absences') matchesTab = ev.type === 'absent';
    else if (feedTab === 'returns') matchesTab = ev.type === 'return';
    
    // 2. Filter by feedSearchQuery
    let matchesSearch = true;
    if (feedSearchQuery.trim() !== '') {
      const query = feedSearchQuery.toLowerCase();
      matchesSearch = 
        (ev.action && ev.action.toLowerCase().includes(query)) ||
        (ev.details && ev.details.toLowerCase().includes(query)) ||
        (ev.user && ev.user.toLowerCase().includes(query));
    }
    
    return matchesTab && matchesSearch;
  });

  const spotlightEvent = filteredFeedEvents.length > 0 
    ? filteredFeedEvents[spotlightIndex % filteredFeedEvents.length] 
    : null;

  // 🏥 Compute dynamic medical readiness
  const medicalReadiness = totalCount > 0 ? Math.round(((totalCount - sickCount) / totalCount) * 100) : 100;

  // ✈️ Compute dynamic active/open leaves
  const activeLeavesCount = leaves.filter(l => !l.actualReturnDate && l.endDate >= todayStr).length;

  // ⏰ Compute personnel returning in the next 48 hours
  const todayDate = new Date();
  const tomDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterDate = new Date(todayDate.getTime() + 48 * 60 * 60 * 1000);
  const tomStr = tomDate.toISOString().split('T')[0];
  const dayAfterStr = dayAfterDate.toISOString().split('T')[0];

  const returning48h = leaves.filter(l => {
    if (l.actualReturnDate || l.returnSubmitted) return false;
    return l.endDate === todayStr || l.endDate === tomStr || l.endDate === dayAfterStr;
  });

  const returningNames = returning48h.map(l => {
    const p = personnel.find(person => person.id === l.personnelId);
    return p ? `${p.rank} / ${p.fullName}` : '';
  }).filter(Boolean);

  const returningSoonText = returningNames.length > 0
    ? `⏰ عودة مرتقبة (خلال 48 ساعة): لـ ${returningNames.length} أفراد (${returningNames.join(' ، ')})`
    : `⏰ لا توجد عودات خدمة مقررة خلال الـ 48 ساعة القادمة`;

  // Create highly structured ticker updates
  const tickerItems = [
    `🩺 الجاهزية الطبية للواء: ${medicalReadiness}% (${sickCount === 0 ? 'جاهزية طبية كاملة 100%' : `الحالات الطبية النشطة: ${sickCount} أفراد`})`,
    `✈️ الإجازات المفتوحة: ${activeLeavesCount} مأذونية إجازة نشطة قيد المتابعة والرقابة حالياً`,
    returningSoonText,
    `⚠️ الغيابات المسجلة: ${personnel.filter(p => p.status === 'غياب').length} حالات غياب نشطة`,
    `🔄 المواصلين ومباشرة العمل: ${leaves.filter(l => l.actualReturnDate).length} أفراد تم تثبيت مواصلتهم`
  ];

  // List of structured notifications to flip through
  const tickerNotifications = [
    ...tickerItems.map(text => {
      let type: 'status' | 'leave' | 'absent' | 'return' | 'system' = 'status';
      if (text.includes('🩺')) type = 'status';
      else if (text.includes('✈️')) type = 'leave';
      else if (text.includes('⚠️')) type = 'absent';
      else if (text.includes('🔄')) type = 'return';
      return { text, type };
    }),
    ...feedEvents.slice(0, 10).map((ev) => ({
      text: `[${ev.action}] ${ev.details}`,
      type: ev.type as 'status' | 'leave' | 'absent' | 'return' | 'system'
    }))
  ].filter(item => item.text.trim().length > 0);

  const totalNotifications = tickerNotifications.length;
  const currentTickerIndex = totalNotifications > 0 ? spotlightIndex % totalNotifications : 0;
  const activeNotification = totalNotifications > 0 ? tickerNotifications[currentTickerIndex] : null;

  // Filter personnel for dashboard search
  const dashboardSearchResults = dashboardSearchQuery.trim() === ''
    ? []
    : personnel.filter(p => 
        (p.fullName && p.fullName.toLowerCase().includes(dashboardSearchQuery.toLowerCase())) ||
        (p.militaryNumber && p.militaryNumber.includes(dashboardSearchQuery))
      );

  return (
    <div id="dashboard-view-container" className="space-y-4 md:space-y-6">
      {/* 🔴 LIVE FEED Section (Live Feed Ticker - Styled precisely like the uploaded image) */}
      <div 
        onClick={() => setIsFeedExpanded(!isFeedExpanded)}
        className="bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100/90 dark:hover:bg-slate-900/80 rounded-full border border-slate-150 dark:border-slate-800 shadow-xs px-3 sm:px-6 py-2 sm:py-3 no-print flex items-center justify-between gap-3 sm:gap-4 cursor-pointer transition-all duration-300 relative overflow-hidden group"
      >
        <style>{`
          .ticker-perspective {
            perspective: 1000px;
          }
        `}</style>
        
        {/* Left/Middle side: Rotating Alert Ticker (with elegant 3D vertical roll transition) */}
        <div className="flex-1 overflow-hidden relative h-8 sm:h-9 px-1 sm:px-3 flex items-center ticker-perspective">
          <div className="w-full relative h-full flex items-center justify-start">
            <AnimatePresence mode="wait">
              {activeNotification && (
                <motion.div
                  key={currentTickerIndex}
                  initial={{ opacity: 0, rotateX: -90, y: 15 }}
                  animate={{ opacity: 1, rotateX: 0, y: 0 }}
                  exit={{ opacity: 0, rotateX: 90, y: -15 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  className="absolute inset-0 flex items-center gap-2 text-right text-xs sm:text-sm font-black text-slate-700 dark:text-slate-100 select-none w-full"
                  style={{ transformOrigin: "center center" }}
                >
                  <span className="truncate flex-1">
                    {activeNotification.text}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right side: LIVE FEED Badge and Pulsing Yellow-Orange Dot */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 select-none pl-1 sm:pl-2">
          <span className="text-[#f59e0b] dark:text-[#fbbf24] bg-[#fffbeb] dark:bg-amber-950/20 border border-[#fef3c7] dark:border-amber-900/30 px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-black tracking-widest font-mono leading-none shadow-2xs group-hover:scale-105 transition-transform">
            LIVE FEED
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f59e0b]"></span>
          </span>
        </div>
      </div>

      {/* Expanded View: Filters, Spotlight Carousel, and Recent Event Cards */}
      {isFeedExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-slate-900 dark:bg-slate-950 text-white rounded-2xl border border-slate-800 p-4 sm:p-5 shadow-lg no-print space-y-5"
        >
          {/* 🌟 Top Header Stats & Control Panel */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-850">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h3 className="text-sm font-black text-slate-100">بث المتابعة والسيطرة المباشر (Live Operations Feed)</h3>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">متابعة دقيقة وتحليلات فورية لـ جاهزية القوى البشرية في اللواء 43 عمالقة</p>
            </div>
            
            {/* Action buttons inside the expanded feed header */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Manual Refresh Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleManualRefresh();
                }}
                disabled={isRefreshing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-black text-slate-300 bg-slate-900/60 hover:bg-slate-850 hover:text-white transition-all cursor-pointer ${isRefreshing ? 'opacity-70 cursor-not-allowed' : ''}`}
                title="تحديث البيانات فوراً"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث فوري'}</span>
              </button>

              {/* Excel Export Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportFeedExcel();
                }}
                disabled={exportingFeedExcel || filteredFeedEvents.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-550 transition-all cursor-pointer ${
                  exportingFeedExcel || filteredFeedEvents.length === 0 ? 'opacity-60 cursor-not-allowed bg-emerald-700/60' : ''
                }`}
                title="تصدير الأحداث المصفاة إلى Excel"
              >
                {exportingFeedExcel ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                    <span>جاري التصدير...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>تصدير السجل المصفى Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Stats overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-bold">
            <div className="bg-slate-950/40 border border-slate-850 p-2.5 rounded-xl text-right">
              <span className="text-[9px] font-bold text-slate-400 block mb-0.5">المواصلون المسجلون</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-400">{feedEvents.filter(e => e.type === 'return').length} أفراد</span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-850 p-2.5 rounded-xl text-right">
              <span className="text-[9px] font-bold text-slate-400 block mb-0.5">الإجازات النشطة</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-400">{activeLeavesCount} مأذونية</span>
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-850 p-2.5 rounded-xl text-right">
              <span className="text-[9px] font-bold text-slate-400 block mb-0.5">الغيابات المرصودة</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-rose-400">{feedEvents.filter(e => e.type === 'absent').length} حالات</span>
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-slate-850 p-2.5 rounded-xl text-right">
              <span className="text-[9px] font-bold text-slate-400 block mb-0.5">جاهزية اللواء الطبية</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-400">{medicalReadiness}% جاهزية</span>
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              </div>
            </div>
          </div>

          {/* ⚡ FEATURED AUTOMATIC ROTATING SPOTLIGHT CARD with Controls */}
          {spotlightEvent ? (
            <div className="bg-gradient-to-l from-slate-950/95 via-slate-900/40 to-slate-950/95 border border-amber-500/20 rounded-xl p-3.5 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
              
              <div className="space-y-1.5 z-10 text-right flex-1 w-full">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest font-mono">تسليط الضوء العملياتي | Operations Spotlight</span>
                  </div>

                  {/* Spotlight Carousel Controls */}
                  <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpotlightIndex((prev) => (prev > 0 ? prev - 1 : filteredFeedEvents.length - 1));
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                      title="الحدث السابق"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAutoPlay(!isAutoPlay);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                      title={isAutoPlay ? "إيقاف التدوير التلقائي" : "تشغيل التدوير التلقائي"}
                    >
                      {isAutoPlay ? <Pause className="w-3 h-3 text-amber-500" /> : <Play className="w-3 h-3 text-emerald-500" />}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpotlightIndex((prev) => prev + 1);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                      title="الحدث التالي"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                
                <h4 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full inline-block ${
                    spotlightEvent.type === 'leave' ? 'bg-blue-500 shadow-sm shadow-blue-500/55' :
                    spotlightEvent.type === 'absent' ? 'bg-rose-500 shadow-sm shadow-rose-500/55' :
                    'bg-emerald-500 shadow-sm shadow-emerald-500/55'
                  }`}></span>
                  {spotlightEvent.action}
                </h4>
                <p className="text-[11px] font-bold text-slate-200 leading-relaxed max-w-4xl">
                  {spotlightEvent.details}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2.5 text-left w-full md:w-auto border-t md:border-t-0 border-slate-850/50 pt-2.5 md:pt-0">
                <div className="text-right font-bold">
                  <span className="text-[9px] font-bold text-slate-500 block leading-none">توقيت الرصد</span>
                  <span className="text-[10px] font-black text-amber-400/90 font-mono">
                    {spotlightEvent.time ? new Date(spotlightEvent.time).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }) : 'الآن'}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 text-xs font-black">
                  {spotlightEvent.type === 'leave' ? '✈️' : spotlightEvent.type === 'absent' ? '⚠️' : '🔄'}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/20 py-4 text-center border border-dashed border-slate-850 rounded-xl text-xs text-slate-500 font-bold">
              لا توجد أحداث نشطة لتسليط الضوء عليها حالياً.
            </div>
          )}

          {/* Search, Filter & Limit Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/30 p-2 rounded-xl border border-slate-850/60">
            {/* 🎛️ Filter Pills for Interactive Sorting */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'all', label: 'الكل', count: feedEvents.length, activeBg: 'bg-slate-800 text-white border-slate-700' },
                { id: 'absences', label: '⚠️ غياب/تأخير', count: feedEvents.filter(e => e.type === 'absent').length, activeBg: 'bg-rose-600 text-white border-rose-550' },
                { id: 'leaves', label: '✈️ الإجازات', count: feedEvents.filter(e => e.type === 'leave').length, activeBg: 'bg-indigo-600 text-white border-indigo-550' },
                { id: 'returns', label: '🔄 العودات', count: feedEvents.filter(e => e.type === 'return').length, activeBg: 'bg-emerald-600 text-white border-emerald-550' }
              ].map((tab) => {
                const isActive = feedTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFeedTab(tab.id as any);
                      setSpotlightIndex(0); // reset spotlight sequence on tab change
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      isActive 
                        ? tab.activeBg + ' shadow-xs font-black' 
                        : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-850/45'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.5 text-[8px] font-mono rounded ${isActive ? 'bg-black/20 text-white' : 'bg-slate-850 text-slate-400 border border-slate-800'}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Live Search & Size Limits */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Internal Feed Search */}
              <div className="relative flex-1 md:w-64">
                <input
                  type="text"
                  placeholder="ابحث في سجل الحركة..."
                  value={feedSearchQuery}
                  onChange={(e) => setFeedSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 text-right font-black"
                />
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                {feedSearchQuery && (
                  <button 
                    onClick={() => setFeedSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 text-[10px]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Feed Card Limits */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 shrink-0">
                {[
                  { label: '3 حركات', val: 3 },
                  { label: '12 حركة', val: 12 },
                  { label: 'الكل', val: 999 }
                ].map((lim) => (
                  <button
                    key={lim.val}
                    onClick={() => setFeedLimit(lim.val)}
                    className={`px-2 py-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                      feedLimit === lim.val 
                        ? 'bg-slate-800 text-white font-extrabold shadow-inner' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lim.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 📅 Filtered Logs Grid (Animated with smooth entries) */}
          {filteredFeedEvents.length === 0 ? (
            <div className="text-center py-8 bg-slate-950/20 border border-dashed border-slate-850 rounded-xl space-y-1.5">
              <p className="text-xs text-slate-500 font-bold">لا توجد حركات أو أحداث مطابقة للبحث أو التصفية الحالية.</p>
              <p className="text-[10px] text-slate-600">جرب كتابة جزء آخر من الاسم، أو غير تصنيف التصفية أعلاه.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {filteredFeedEvents.slice(0, feedLimit).map((log, index) => {
                  const formattedTime = log.time 
                    ? new Date(log.time).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }) 
                    : 'الآن';
                  
                  // Color mapping with specific solid borders & elegant gradients
                  const cardStyles = 
                    log.type === 'absent' ? { 
                      bg: 'border-slate-850 hover:border-rose-500/40 bg-gradient-to-br from-rose-950/[0.04] to-slate-900/10', 
                      badge: 'bg-rose-500/15 text-rose-400 border border-rose-500/20',
                      borderAccent: 'border-r-4 border-r-rose-500'
                    } :
                    log.type === 'leave' ? { 
                      bg: 'border-slate-850 hover:border-indigo-500/40 bg-gradient-to-br from-indigo-950/[0.04] to-slate-900/10', 
                      badge: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
                      borderAccent: 'border-r-4 border-r-indigo-500'
                    } :
                    log.type === 'return' ? { 
                      bg: 'border-slate-850 hover:border-emerald-500/40 bg-gradient-to-br from-emerald-950/[0.04] to-slate-900/10', 
                      badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
                      borderAccent: 'border-r-4 border-r-emerald-500'
                    } :
                    { 
                      bg: 'border-slate-850 hover:border-slate-700 bg-slate-950/20', 
                      badge: 'bg-slate-800 text-slate-400 border border-slate-750',
                      borderAccent: 'border-r-4 border-r-slate-500'
                    };

                  return (
                    <motion.div
                      key={log.id || index}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2.5 transition-all duration-300 hover:shadow-md ${cardStyles.bg} ${cardStyles.borderAccent}`}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-slate-500 flex items-center gap-1 font-bold">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {formattedTime}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider ${cardStyles.badge}`}>
                          {log.action}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-200 line-clamp-3 leading-relaxed text-right min-h-[36px]">
                        {log.details}
                      </p>

                      <div className="text-[9px] text-slate-500 flex items-center justify-between border-t border-slate-900/60 pt-2 font-bold">
                        <span className="truncate max-w-[150px] text-slate-400">الضابط المسؤول: {log.user}</span>
                        <span className="shrink-0 text-[8px] bg-slate-950/60 px-1.5 py-0.5 rounded text-slate-500 font-mono">قوة اللواء 43</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      {/* 🔍 SEARCH BAR SECTION (Pill styled precisely like the uploaded image) */}
      <div className="no-print space-y-3">
        <div className="relative">
          <input
            type="text"
            placeholder="🔍 ابحث فوراً عن أي فرد بالاسم، الرتبة أو الرقم العسكري..."
            value={dashboardSearchQuery}
            onChange={(e) => setDashboardSearchQuery(e.target.value)}
            className="w-full pl-12 pr-12 py-3.5 sm:py-4 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-full text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-md text-right font-black"
          />
          <Search className="absolute right-4.5 top-4 sm:top-4.5 w-5 h-5 text-slate-400" />
          
          {dashboardSearchQuery && (
            <button
              onClick={() => setDashboardSearchQuery('')}
              className="absolute left-4.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {dashboardSearchQuery && (
          <div className="border-t border-slate-100 dark:border-slate-850 pt-3 mt-3">
            <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 mb-3">
              نتائج البحث الفورية ({dashboardSearchResults.length})
            </h3>
            
            {dashboardSearchResults.length === 0 ? (
              <p className="text-xs font-bold text-slate-400 text-center py-4">لا توجد نتائج تطابق بحثك.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {dashboardSearchResults.map((p) => {
                  return (
                    <div key={p.id} className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850 flex items-center justify-between gap-3">
                      <div className="truncate">
                        <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 truncate">
                          {p.rank} / {p.fullName}
                        </h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5 truncate">
                          رقم عسكري: {p.militaryNumber} • {p.unit} {p.platoon ? `(${p.platoon})` : ''}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Status Badge */}
                        <span className={`inline-block px-2.5 py-1 text-[10px] font-black rounded-lg ${
                          p.status === 'موجود' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30' :
                          p.status === 'إجازة' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' :
                          p.status === 'غياب' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30' :
                          p.status === 'مريض' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30' :
                          'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30'
                        }`}>
                          {p.status}
                        </span>

                        {/* Quick Actions Trigger */}
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            {p.status === 'إجازة' ? (
                              <button
                                onClick={() => handleOpenReturnModal(p.id)}
                                className="px-2 py-1 text-[9px] font-bold text-white bg-blue-600 hover:bg-blue-500 rounded shadow-xs transition-colors cursor-pointer"
                              >
                                عودة/مواصلة
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedLeaveId(String(p.id));
                                  setCutLeaveType('استحقاقه');
                                  const today = new Date().toISOString().split('T')[0];
                                  setCutStartDate(today);
                                  setCutEndDate(today);
                                  setIsCutModalOpen(true);
                                }}
                                className="px-2 py-1 text-[9px] font-bold text-white bg-amber-600 hover:bg-amber-500 rounded shadow-xs transition-colors cursor-pointer"
                              >
                                منح إجازة
                              </button>
                            )}
                            
                            {/* Fast status cycler */}
                            <select
                              value={p.status}
                              onChange={async (e) => {
                                const newStat = e.target.value as any;
                                const updatedP = { ...p, status: newStat };
                                await putInStore('personnel', updatedP);
                                await writeAuditLog('تحديث سريع للحالة', `تم تعديل حالة الفرد ${p.rank}/ ${p.fullName} إلى [${newStat}] من البحث السريع`, username);
                                // reload
                                const allP = await getAllFromStore<Personnel>('personnel');
                                setPersonnel(allP);
                              }}
                              className="text-[9px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-0.5 text-slate-700 dark:text-slate-300 focus:outline-none"
                            >
                              <option value="موجود">موجود</option>
                              <option value="غياب">غياب</option>
                              <option value="مريض">مريض</option>
                              <option value="إذن">إذن</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* App Shortcuts & Control Center Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5 no-print">
        {/* Quick Operations Panel - Sleeker and lower vertical profile */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              مـركـز الـسـيـطـرة والـعـمـلـيـات الـسـريـعـة
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed font-bold">
              لوحة تحكم تفاعلية لاتخاذ إجراءات فورية على قوة اللواء 43 عمالقة الجنوبية.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 pt-1">
              <button
                onClick={handleOpenCutModal}
                className="p-3 bg-amber-500/[0.04] dark:bg-amber-500/[0.02] text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-xl font-black text-xs flex items-center justify-start gap-3 hover:bg-amber-500/10 hover:border-amber-500/40 transition-all cursor-pointer active:scale-95 shadow-2xs group"
              >
                <div className="p-1.5 bg-amber-500/10 rounded-lg group-hover:scale-105 transition-transform">
                  <Scissors className="w-4 h-4" />
                </div>
                <span>منح إجازة جديدة</span>
              </button>

              <button
                onClick={() => handleOpenReturnModal()}
                className="p-3 bg-blue-500/[0.04] dark:bg-blue-500/[0.02] text-blue-700 dark:text-blue-400 border border-blue-500/20 rounded-xl font-black text-xs flex items-center justify-start gap-3 hover:bg-blue-500/10 hover:border-blue-500/40 transition-all cursor-pointer active:scale-95 shadow-2xs group"
              >
                <div className="p-1.5 bg-blue-500/10 rounded-lg group-hover:scale-105 transition-transform">
                  <CornerDownLeft className="w-4 h-4" />
                </div>
                <span>تسجيل العودة والمباشرة</span>
              </button>

              <button
                onClick={handlePrintReport}
                className="p-3 bg-slate-500/[0.04] dark:bg-slate-500/[0.02] text-slate-700 dark:text-slate-300 border border-slate-500/20 rounded-xl font-black text-xs flex items-center justify-start gap-3 hover:bg-slate-500/10 hover:border-slate-500/45 transition-all cursor-pointer active:scale-95 shadow-2xs group"
              >
                <div className="p-1.5 bg-slate-500/10 rounded-lg group-hover:scale-105 transition-transform">
                  <Printer className="w-4 h-4" />
                </div>
                <span>طباعة الموقف اليومي</span>
              </button>
            </div>
          </div>

          <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-bold">
            <span>الكتيبة: اللواء 43 عمالقة</span>
            <span>الوضعية: اتصال مشفر آمن</span>
          </div>
        </div>

        {/* Readiness Combat Gauge Card - Beautiful side-by-side bento card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl p-4 sm:p-5 text-white border border-slate-850 flex flex-col justify-between shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-xs font-black text-slate-400">مؤشر الجاهزية القتالية</h3>
              <p className="text-[10px] text-slate-500 font-bold leading-none">المتواجد الفعلي بالنسبة للقوة الإجمالية</p>
            </div>
            <span className="bg-amber-500/10 text-amber-400 p-1.5 rounded-lg border border-amber-500/25">
              <Shield className="w-4 h-4" />
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 my-2.5">
            <div className="space-y-1 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-amber-500 font-mono tracking-tight">{readinessPercentage}%</span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                  readinessPercentage > 85 ? 'bg-emerald-500/15 text-emerald-400' :
                  readinessPercentage > 60 ? 'bg-amber-500/15 text-amber-400' :
                  'bg-red-500/15 text-red-400'
                }`}>
                  {readinessPercentage > 85 ? 'جاهزية كاملة' : readinessPercentage > 60 ? 'متوسطة' : 'منخفضة'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span>{presentCount} موجود / {totalCount} كلي</span>
              </div>
            </div>

            {/* Compact Svg Circle Progress Gauge */}
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="28" cy="28" r="23" className="stroke-slate-800 fill-transparent stroke-4" />
                <circle 
                  cx="28" 
                  cy="28" 
                  r="23" 
                  className="stroke-amber-500 fill-transparent stroke-4 transition-all duration-1000" 
                  strokeDasharray="144.5"
                  strokeDashoffset={144.5 - (144.5 * readinessPercentage) / 100}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Compass className="w-4.5 h-4.5 text-amber-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-850/80 text-[10px] text-slate-300 font-bold flex justify-between items-center">
            <span>الحالة العامة</span>
            <span className="text-slate-500 font-mono leading-none">محدث الآن</span>
          </div>
        </div>
      </div>

      {/* Grid Status Cards - Super high density side-by-side bento metrics */}
      <div id="stats-grid" className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 no-print">
        {/* Total force card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/85 p-3 sm:p-4 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-300 flex items-center justify-between gap-2 group">
          <div className="space-y-1 text-right truncate">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-400 dark:text-slate-500 block leading-none">إجمالي القوة</span>
            <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 font-mono tracking-tight">{totalCount}</span>
          </div>
          <div className="p-2 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 rounded-xl group-hover:scale-105 transition-transform border border-slate-100 dark:border-slate-850 shrink-0">
            <Users className="w-4 h-4 sm:w-5 h-5" />
          </div>
        </div>

        {/* Present card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/85 p-3 sm:p-4 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-300 flex items-center justify-between gap-2 group">
          <div className="space-y-1 text-right truncate">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-400 dark:text-slate-500 block leading-none">موجود (فعلي)</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">{presentCount}</span>
          </div>
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl group-hover:scale-105 transition-transform border border-emerald-100/40 dark:border-emerald-900/30 shrink-0">
            <UserCheck className="w-4 h-4 sm:w-5 h-5" />
          </div>
        </div>

        {/* Leave card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/85 p-3 sm:p-4 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-300 flex items-center justify-between gap-2 group">
          <div className="space-y-1 text-right truncate">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-400 dark:text-slate-500 block leading-none">في إجازة</span>
            <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono tracking-tight">{leaveCount}</span>
          </div>
          <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl group-hover:scale-105 transition-transform border border-blue-100/40 dark:border-blue-900/30 shrink-0">
            <LogOut className="w-4 h-4 sm:w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* Absent card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/85 p-3 sm:p-4 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-300 flex items-center justify-between gap-2 group">
          <div className="space-y-1 text-right truncate">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-400 dark:text-slate-500 block leading-none">غياب</span>
            <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight">{absentCount}</span>
          </div>
          <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl group-hover:scale-105 transition-transform border border-rose-100/40 dark:border-rose-900/30 shrink-0">
            <ShieldAlert className="w-4 h-4 sm:w-5 h-5" />
          </div>
        </div>

        {/* Sick card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/85 p-3 sm:p-4 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-300 flex items-center justify-between gap-2 group">
          <div className="space-y-1 text-right truncate">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-400 dark:text-slate-500 block leading-none">مريض</span>
            <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tracking-tight">{sickCount}</span>
          </div>
          <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl group-hover:scale-105 transition-transform border border-amber-100/40 dark:border-amber-900/30 shrink-0">
            <HeartPulse className="w-4 h-4 sm:w-5 h-5" />
          </div>
        </div>

        {/* Permission card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/85 p-3 sm:p-4 rounded-2xl shadow-xs hover:shadow-sm transition-all duration-300 flex items-center justify-between gap-2 group">
          <div className="space-y-1 text-right truncate">
            <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-400 dark:text-slate-500 block leading-none">إذن / مهمة</span>
            <span className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 font-mono tracking-tight">{permitCount}</span>
          </div>
          <div className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl group-hover:scale-105 transition-transform border border-purple-100/40 dark:border-purple-900/30 shrink-0">
            <Clock className="w-4 h-4 sm:w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Grid: Unit breakdown and Active Leaves */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Active Leaves Table */}
        <div id="active-leaves-panel" className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-xs p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800/85">
            <div className="flex items-center gap-2">
              <Calendar className="w-4.5 h-4.5 text-blue-500" />
              <h2 className="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100">الإجازات النشطة الحالية ({activeLeaves.length})</h2>
            </div>
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 font-mono">اليوم: {todayStr}</span>
          </div>

          <div className="flex-1 max-h-[300px] overflow-y-auto pr-0.5">
            {activeLeaves.length === 0 ? (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2">
                <Calendar className="w-8 h-8 stroke-1" />
                <p className="text-xs font-bold">لا توجد إجازات نشطة مسجلة حالياً</p>
              </div>
            ) : (
              <>
                {/* Desktop view (Hidden on mobile) */}
                <div className="hidden md:block">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-850 text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase">
                        <th className="pb-2 pt-1">الفرد</th>
                        <th className="pb-2 pt-1">الوحدة / السرية</th>
                        <th className="pb-2 pt-1">نوع الإجازة</th>
                        <th className="pb-2 pt-1">فترة الإجازة</th>
                        <th className="pb-2 pt-1 text-left">الأيام المتبقية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850/50 text-xs">
                      {activeLeaves.map((l) => {
                        const person = getPersonDetails(l.personnelId);
                        const daysRemaining = getDaysRemaining(l.endDate);
                        // Progress bars calculations
                        const totalDuration = l.daysCount;
                        const elapsed = Math.max(0, totalDuration - daysRemaining);
                        const progressPercent = Math.min(100, Math.round((elapsed / totalDuration) * 100));

                        return (
                          <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10 transition-colors">
                            <td className="py-2">
                              <div className="font-extrabold text-slate-800 dark:text-slate-100">{person.name}</div>
                              <div className="text-[10px] text-slate-400 font-bold">{person.rank}</div>
                            </td>
                            <td className="py-2 text-slate-600 dark:text-slate-400 font-bold">{person.unit}</td>
                            <td className="py-2">
                              <span className={`inline-block px-1.5 py-0.5 text-[9px] font-black rounded ${
                                l.leaveType === 'استحقاقه' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400' :
                                l.leaveType === 'مرضية' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                                'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}>
                                {l.leaveType === 'استحقاقه' ? 'سنوية' : l.leaveType}
                              </span>
                            </td>
                            <td className="py-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">
                              من {l.startDate} إلى {l.endDate}
                            </td>
                            <td className="py-2 text-left">
                              <div className="flex flex-col items-end gap-1">
                                <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-[11px]">
                                  {daysRemaining} / {totalDuration} يوم
                                </span>
                                {/* Small progress meter */}
                                <div className="w-16 h-1 bg-slate-100 dark:bg-slate-850 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500"
                                    style={{ width: `${100 - progressPercent}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards list for Active Leaves (Shown only on mobile) */}
                <div className="md:hidden space-y-2 mt-1">
                  {activeLeaves.map((l) => {
                    const person = getPersonDetails(l.personnelId);
                    const daysRemaining = getDaysRemaining(l.endDate);
                    const totalDuration = l.daysCount;
                    const elapsed = Math.max(0, totalDuration - daysRemaining);
                    const progressPercent = Math.min(100, Math.round((elapsed / totalDuration) * 100));

                    return (
                      <div key={l.id} className="bg-slate-50/50 dark:bg-slate-950/50 p-2.5 rounded-xl space-y-1.5 border border-slate-100/70 dark:border-slate-850/60">
                        <div className="flex justify-between items-start gap-1">
                          <div>
                            <h4 className="font-black text-xs text-slate-800 dark:text-slate-100">{person.name}</h4>
                            <p className="text-[10px] text-slate-400 font-bold">{person.rank} • {person.unit}</p>
                          </div>
                          <span className={`inline-block px-1.5 py-0.5 text-[9px] font-black rounded ${
                            l.leaveType === 'استحقاقه' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400' :
                            l.leaveType === 'مرضية' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                            'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            {l.leaveType === 'استحقاقه' ? 'سنوية' : l.leaveType}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono font-bold">
                          <span>من {l.startDate} إلى {l.endDate}</span>
                          <span className="font-black text-blue-600 dark:text-blue-400">{daysRemaining} / {totalDuration} يوم متبقي</span>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1 bg-slate-200 dark:bg-slate-850 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500"
                            style={{ width: `${100 - progressPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Readiness per company Breakdown - Compact, high efficiency */}
        <div id="company-ready-panel" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-xs p-4 sm:p-5">
          <h2 className="font-black text-xs sm:text-sm text-slate-800 dark:text-slate-100 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-emerald-500" />
            توزيع الجاهزية الفعالة للوحدات
          </h2>
          
          <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-0.5">
            {['هيئة القيادة', 'السرية الأولى', 'السرية الثانية', 'السرية الثالث'].map((unitName) => {
              // Standardize name match since 'السرية الثالثة' has 'ة'
              const unitP = personnel.filter(p => p.unit.includes(unitName));
              const unitTotal = unitP.length;
              const unitPresent = unitP.filter(p => p.status === 'موجود').length;
              const unitPercent = unitTotal > 0 ? Math.round((unitPresent / unitTotal) * 100) : 0;

               return (
                <div key={unitName} className="space-y-1 border-b border-slate-100/50 dark:border-slate-850/30 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="text-slate-700 dark:text-slate-300">{unitName}</span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono">
                      {unitPresent} / {unitTotal} فرد ({unitPercent}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden relative border border-slate-200/10 dark:border-slate-850">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        unitPercent > 80 ? 'bg-emerald-500 dark:bg-emerald-400' :
                        unitPercent > 50 ? 'bg-amber-500 dark:bg-amber-400' :
                        'bg-red-500 dark:bg-red-400'
                      }`}
                      style={{ width: `${unitPercent}%` }}
                    ></div>
                  </div>
                  {/* Miniature tags for sub stats */}
                  <div className="flex gap-2 text-[10px] text-slate-400 font-bold">
                    <span>إجازة: {unitP.filter(p => p.status === 'إجازة').length}</span>
                    <span>•</span>
                    <span>غياب: {unitP.filter(p => p.status === 'غياب').length}</span>
                    <span>•</span>
                    <span>مريض: {unitP.filter(p => p.status === 'مريض').length}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- CUT LEAVE QUICK MODAL --- */}
      {isCutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[95vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100">إجراء قطع إجازة (منح إجازة فردية)</h3>
              </div>
              <button 
                onClick={() => setIsCutModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {!canEdit ? (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                  <span>عذراً، لا تمتلك الصلاحية الكافية لإجراء هذا التعديل (مشاهد فقط).</span>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">البحث عن الفرد من المتواجدين حالياً:</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="ابحث بالاسم أو الرقم العسكري للمتواجدين..."
                        value={cutSearch}
                        onChange={(e) => setCutSearch(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">اختر الفرد لمنحه إجازة:</label>
                    {personnel.filter(p => p.status !== 'إجازة').length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">لا يوجد أفراد متواجدون حالياً بالوحدة.</p>
                    ) : (
                      <div className="max-h-[160px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50 dark:bg-slate-950">
                        {personnel
                          .filter(p => 
                            p.status !== 'إجازة' && (
                              !cutSearch || 
                              p.fullName.includes(cutSearch) || 
                              p.militaryNumber.includes(cutSearch)
                            )
                          )
                          .map(p => {
                            const isSelected = selectedLeaveId === String(p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => setSelectedLeaveId(String(p.id))}
                                className={`w-full text-right p-2.5 text-xs flex justify-between items-center transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold' 
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-905'
                                }`}
                              >
                                <div>
                                  <span className="font-extrabold">{p.rank} / {p.fullName}</span>
                                  <div className="text-[10px] text-slate-400 mt-0.5">رقم: {p.militaryNumber} • {p.unit}</div>
                                </div>
                                <div className="text-left font-mono">
                                  <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-sm inline-block text-slate-600 dark:text-slate-400">
                                    رصيد: مفتوح
                                  </span>
                                  <span className="block text-[9px] text-slate-400 mt-0.5">حالة: {p.status}</span>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {selectedLeaveId && (() => {
                    const selectedPerson = personnel.find(p => String(p.id) === selectedLeaveId);
                    if (!selectedPerson) return null;
                    return (
                      <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
                        <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">
                          تحديد تفاصيل الإجازة لـ ({selectedPerson.rank} / {selectedPerson.fullName})
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400">نوع الإجازة:</label>
                            <select
                              value={cutLeaveType}
                              onChange={(e) => setCutLeaveType(e.target.value as LeaveType)}
                              className="w-full text-xs font-semibold py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none"
                            >
                              <option value="استحقاقه">سنوية (استحقاقه)</option>
                              <option value="طارئة">طارئة</option>
                              <option value="مرضية">مرضية</option>
                              <option value="إذن">إذن غياب مؤقت</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400">الرصيد المتوفر الحالي:</label>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                              مفتوح (غير محدود)
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400">تاريخ بدء الإجازة:</label>
                            <input 
                              type="date"
                              value={cutStartDate}
                              onChange={(e) => setCutStartDate(e.target.value)}
                              className="w-full text-xs font-semibold py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400">تاريخ نهاية الإجازة:</label>
                            <input 
                              type="date"
                              value={cutEndDate}
                              onChange={(e) => setCutEndDate(e.target.value)}
                              className="w-full text-xs font-semibold py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5">
                          <div className="text-slate-500">مدة الإجازة المحتسبة:</div>
                          <div className="text-amber-600 dark:text-amber-400 font-mono text-sm">{cutDaysCount} أيام</div>
                        </div>
                      </div>
                    );
                  })()}

                  {cutError && (
                    <div className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-bold rounded-xl text-center">
                      {cutError}
                    </div>
                  )}

                  {cutSuccess && (
                    <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl text-center flex items-center justify-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>{cutSuccess}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5">
              <button
                onClick={() => setIsCutModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              {canEdit && (
                <button
                  onClick={handleCutSubmit}
                  className="px-5 py-2 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors shadow-md shadow-amber-600/10 cursor-pointer"
                >
                  تأكيد قطع الإجازة (المنح)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- REGISTER RETURN / CONTINUATION QUICK MODAL --- */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <CornerDownLeft className="w-5 h-5 text-emerald-500 animate-pulse" />
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100">تسجيل عودة ومباشرة (مواصلة)</h3>
              </div>
              <button 
                onClick={() => setIsReturnModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {!canEdit ? (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0" />
                  <span>عذراً، لا تمتلك الصلاحية الكافية لإجراء هذا التعديل (مشاهد فقط).</span>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">البحث عن الفرد بقائمة الإجازات النشطة:</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="ابحث بالاسم أو الرقم العسكري..."
                        value={returnSearch}
                        onChange={(e) => setReturnSearch(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">اختر الفرد لتسجيل مواصلته للعمل:</label>
                    {pendingReturnLeaves.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">لا توجد سجلات إجازة نشطة حالياً لتسجيل مواصلتها.</p>
                    ) : (
                      <div className="max-h-[180px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60 bg-slate-50 dark:bg-slate-950">
                        {pendingReturnLeaves
                          .filter(item => 
                            !returnSearch || 
                            item.person?.fullName.includes(returnSearch) || 
                            item.person?.militaryNumber.includes(returnSearch)
                          )
                          .map(item => {
                            const isSelected = selectedReturnLeaveId === String(item.leave.id);
                            return (
                              <button
                                key={item.leave.id}
                                onClick={() => setSelectedReturnLeaveId(String(item.leave.id))}
                                className={`w-full text-right p-3 text-xs flex justify-between items-center transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold' 
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-905'
                                }`}
                              >
                                <div>
                                  <span className="font-extrabold">{item.person?.rank} / {item.person?.fullName}</span>
                                  <div className="text-[10px] text-slate-400 mt-0.5">رقم: {item.person?.militaryNumber} • {item.person?.unit}</div>
                                </div>
                                <div className="text-left font-mono">
                                  <span className="block text-[10px] text-slate-400">المتوقع: {item.leave.endDate}</span>
                                  {item.leave.cutSubmitted && (
                                    <span className="text-[9px] bg-amber-500/15 text-amber-600 px-1.5 py-0.5 rounded-sm mt-0.5 inline-block font-bold">
                                      مقطوعة
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400">تاريخ العودة الفعلية ومباشرة العمل:</label>
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
                    <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl text-center flex items-center justify-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>{returnSuccess}</span>
                    </div>
                  )}
                </>
              )}
            </div>

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
                  تسجيل المواصلة والعودة
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- PRINTABLE DAILY REPORT MODAL --- */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 no-print">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500 animate-pulse" />
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100">بيان الموقف اليومي الفعلي للقوة</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintReport}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  طباعة الموقف
                </button>
                <button 
                  onClick={() => setIsReportModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
            
            {/* Printable Area */}
            <div id="printable-military-report" className="p-8 overflow-y-auto flex-1 space-y-6 font-sans bg-white dark:bg-slate-900">
              
              {/* Report Header */}
              <div className="text-center space-y-2 border-b-2 border-double border-slate-300 dark:border-slate-800 pb-5">
                <div className="flex justify-between items-start text-xs font-bold text-slate-500 dark:text-slate-400">
                  <div className="text-right space-y-1">
                    <p className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">وزارة الدفاع والداخلية</p>
                    <p className="text-slate-600 dark:text-slate-400">شعبة القوة البشرية والتحضير</p>
                    <p className="text-slate-600 dark:text-slate-400">اللواء 43 عمالقة الجنوبية</p>
                  </div>
                  <div className="text-left space-y-1 font-mono">
                    <p>التاريخ: {todayStr}</p>
                    <p>الوقت: {new Date().toLocaleTimeString('ar-YE')}</p>
                  </div>
                </div>
                <div className="py-2">
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">بيان الموقف اليومي الفعلي للقوة البشرية</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">الموقف العام للموجود اليومي الفعلي ومستوى الجاهزية القتالية</p>
                </div>
              </div>

              {/* Statistics Grid Matrix Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 border-r-4 border-indigo-500 pr-2">أولاً: مصفوفة القوة والجاهزية اليومية</h4>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-850 rounded-xl">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 text-slate-700 dark:text-slate-300 font-extrabold">
                        <th className="p-3">الوحدة / السرية</th>
                        <th className="p-3 text-center">القوة الكلية</th>
                        <th className="p-3 text-center bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 font-black">الموجود</th>
                        <th className="p-3 text-center bg-blue-500/5 text-blue-600 dark:text-blue-400">الإجازة</th>
                        <th className="p-3 text-center bg-red-500/5 text-red-600 dark:text-red-400">الغياب</th>
                        <th className="p-3 text-center bg-amber-500/5 text-amber-600 dark:text-amber-400">مريض</th>
                        <th className="p-3 text-center bg-purple-500/5 text-purple-600 dark:text-purple-400">إذن</th>
                        <th className="p-3 text-left">الجاهزية %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
                      {unitStats.map((u) => (
                        <tr key={u.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                          <td className="p-3 font-extrabold">{u.name}</td>
                          <td className="p-3 text-center font-mono font-bold text-slate-500">{u.total}</td>
                          <td className="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.01]">{u.present}</td>
                          <td className="p-3 text-center font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/[0.01]">{u.leave}</td>
                          <td className="p-3 text-center font-mono font-bold text-red-600 dark:text-red-400 bg-red-500/[0.01]">{u.absent}</td>
                          <td className="p-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/[0.01]">{u.sick}</td>
                          <td className="p-3 text-center font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/[0.01]">{u.permit}</td>
                          <td className="p-3 text-left font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                            {u.ready}%
                          </td>
                        </tr>
                      ))}
                      {/* Total row */}
                      <tr className="bg-slate-50 dark:bg-slate-950 font-black text-sm border-t-2 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                        <td className="p-3 font-black">الإجمالي العام</td>
                        <td className="p-3 text-center font-mono">{grandTotal}</td>
                        <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">{grandPresent}</td>
                        <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400 bg-blue-500/5">{grandLeave}</td>
                        <td className="p-3 text-center font-mono text-red-600 dark:text-red-400 bg-red-500/5">{grandAbsent}</td>
                        <td className="p-3 text-center font-mono text-amber-600 dark:text-amber-400 bg-amber-500/5">{grandSick}</td>
                        <td className="p-3 text-center font-mono text-purple-600 dark:text-purple-400 bg-purple-500/5">{grandPermit}</td>
                        <td className="p-3 text-left font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                          {grandReady}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Critical personnel breakdown details */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 border-r-4 border-red-500 pr-2">ثانياً: بيان الأفراد المتخلفين (غياب) وحالات المرض اليوم</h4>
                {criticalPersonnel.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">الحمد لله، لا توجد حالات غياب أو حالات مرضية مسجلة اليوم.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-850 rounded-xl">
                    <table className="w-full text-right border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-400 font-bold">
                          <th className="p-2.5">الرقم العسكري</th>
                          <th className="p-2.5">الرتبة والاسم</th>
                          <th className="p-2.5">الوحدة / السرية</th>
                          <th className="p-2.5">الحالة</th>
                          <th className="p-2.5">ملاحظات ومبررات الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                        {criticalPersonnel.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-mono">{p.militaryNumber}</td>
                            <td className="p-2.5 font-extrabold">{p.rank} / {p.fullName}</td>
                            <td className="p-2.5">{p.unit} {p.platoon && `(${p.platoon})`}</td>
                            <td className="p-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded font-black text-[9px] ${
                                p.status === 'غياب' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-500 dark:text-slate-400">{p.notes || 'لا توجد ملاحظات مدونة'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Officers Authorization Signatures */}
              <div className="grid grid-cols-2 gap-10 pt-10 text-center text-xs font-bold text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-850">
                <div className="space-y-8">
                  <p>ركن بشرية اللواء 43 عمالقة</p>
                  <p className="text-slate-300 dark:text-slate-700">________________________</p>
                </div>
                <div className="space-y-8">
                  <p>قائد اللواء 43 عمالقة الجنوبية</p>
                  <p className="text-slate-300 dark:text-slate-700">________________________</p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
