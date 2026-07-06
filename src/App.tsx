/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, Users, UserCheck, Calendar, ClipboardList, 
  FileText, History, UserCog, Database, LogOut, Sun, Moon, 
  Menu, X, Lock, User as UserIcon, Award, Download, DownloadCloud,
  Bell, ShieldAlert, Clock, CheckCircle2, CornerDownLeft, Search,
  AlertTriangle, Printer, BellRing, Volume2, Copy, Check
} from 'lucide-react';

import { 
  seedDatabaseIfEmpty, getAllFromStore, subscribeToDbChanges, openDB, 
  syncAllPersonnelStatus, addLeave, recordLeaveReturn, submitLeaveReturn,
  submitLeaveCut
} from './lib/db';
import { User, Leave, Personnel, Duty } from './types';

// Import Modular Views
import DashboardView from './components/DashboardView';
import PersonnelView from './components/PersonnelView';
import AttendanceView from './components/AttendanceView';
import LeavesView from './components/LeavesView';
import DutiesView from './components/DutiesView';
import ReportsView from './components/ReportsView';
import AuditLogView from './components/AuditLogView';
import UsersView from './components/UsersView';
import BackupRestoreView from './components/BackupRestoreView';
import AlertsView from './components/AlertsView';
import DailyReportView from './components/DailyReportView';

type ViewTab = 'dashboard' | 'personnel' | 'attendance' | 'leaves' | 'duties' | 'reports' | 'audit' | 'users' | 'backup' | 'alerts' | 'daily-report';

export default function App() {
  // Authentication State
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  
  // App Navigation and layout states
  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  
  // Pending submissions badge count
  const [pendingBadgeCount, setPendingBadgeCount] = useState<number>(0);
  
  // Notification and data states
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [notificationActiveTab, setNotificationActiveTab] = useState<'overdue' | 'endingSoon' | 'dutiesToday' | 'pendingSync'>('overdue');
  const [notificationSearch, setNotificationSearch] = useState<string>('');
  const [copiedNotificationAlert, setCopiedNotificationAlert] = useState<boolean>(false);

  // --- Global Quick Operations States ---
  const [isCutModalOpenGlobal, setIsCutModalOpenGlobal] = useState(false);
  const [isReturnModalOpenGlobal, setIsReturnModalOpenGlobal] = useState(false);
  const [isReportModalOpenGlobal, setIsReportModalOpenGlobal] = useState(false);

  // Cut Leave form states
  const [cutSearch, setCutSearch] = useState('');
  const [selectedLeaveId, setSelectedLeaveId] = useState(''); // Personnel ID
  const [cutLeaveType, setCutLeaveType] = useState<'استحقاقه' | 'ميدانية' | 'مرضية' | 'اضطرارية' | 'أخرى'>('استحقاقه');
  const [cutStartDate, setCutStartDate] = useState('');
  const [cutEndDate, setCutEndDate] = useState('');
  const [cutError, setCutError] = useState('');
  const [cutSuccess, setCutSuccess] = useState('');

  // Register Return form states
  const [selectedReturnLeaveId, setSelectedReturnLeaveId] = useState(''); // Leave ID
  const [returnSearch, setReturnSearch] = useState('');
  const [actualReturnDate, setActualReturnDate] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState('');
  
  // PWA Install states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState<boolean>(false);

  // Inactivity timeout ref
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  // Auto-collapse sidebar on smaller mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Initialize DB and Check Sessions
  useEffect(() => {
    async function init() {
      try {
        await seedDatabaseIfEmpty();
        await syncAllPersonnelStatus();
        
        // Restore local theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          setDarkMode(true);
          document.documentElement.classList.add('dark');
        } else {
          setDarkMode(false);
          document.documentElement.classList.remove('dark');
        }

        // Restore logged in user session from sessionStorage
        const savedSession = sessionStorage.getItem('userSession');
        if (savedSession) {
          setUser(JSON.parse(savedSession));
        }
      } catch (err) {
        console.error('Failed to bootstrap database:', err);
      }
    }
    init();

    // Listen to PWA install flow
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // 2. Real-time Reports Pending Badge Sync
  useEffect(() => {
    async function syncBadge() {
      try {
        const leaves = await getAllFromStore<Leave>('leaves');
        
        // Count cuts where cutSubmitted is false
        const cutsCount = leaves.filter(l => !l.cutSubmitted).length;
        
        // Count returns where actualReturnDate exists and returnSubmitted is false
        const returnsCount = leaves.filter(l => l.actualReturnDate && !l.returnSubmitted).length;
        
        setPendingBadgeCount(cutsCount + returnsCount);
      } catch (e) {
        console.error('Failed to sync reports badge:', e);
      }
    }

    syncBadge();
    
    // Subscribe to DB changes to recalculate instantly
    const unsub = subscribeToDbChanges(() => {
      syncBadge();
    });

    const timer = window.setInterval(syncBadge, 2000); // Polling failsafe
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  // Synchronize Personnel, Leaves and Duties for header notifications
  useEffect(() => {
    if (!user) return;
    
    async function fetchData() {
      try {
        const pData = await getAllFromStore<Personnel>('personnel');
        const lData = await getAllFromStore<Leave>('leaves');
        const dData = await getAllFromStore<Duty>('duties');
        setPersonnel(pData);
        setLeaves(lData);
        setDuties(dData);
      } catch (err) {
        console.error('Failed to fetch data for notifications:', err);
      }
    }

    fetchData();

    // Subscribe to DB changes
    const unsub = subscribeToDbChanges(() => {
      fetchData();
    });

    const timer = window.setInterval(fetchData, 4000); // Failsafe polling
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [user]);

  const todayStr = new Date().toISOString().split('T')[0];

  const cutDaysCount = (() => {
    if (!cutStartDate || !cutEndDate) return 0;
    const start = new Date(cutStartDate);
    const end = new Date(cutEndDate);
    const diff = end.getTime() - start.getTime();
    if (isNaN(diff)) return 0;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; // inclusive
    return days < 0 ? 0 : days;
  })();

  const handleCutSubmitGlobal = async () => {
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
      await addLeave(newLeave, user?.username || 'system');
      setCutSuccess(`تم قطع إجازة (منح الإجازة) لـ ${person.rank} / ${person.fullName} بنجاح!`);

      // Reload state
      const [allP, allL] = await Promise.all([
        getAllFromStore<Personnel>('personnel'),
        getAllFromStore<Leave>('leaves')
      ]);
      setPersonnel(allP);
      setLeaves(allL);

      setTimeout(() => {
        setIsCutModalOpenGlobal(false);
        setCutSuccess('');
        setSelectedLeaveId('');
        setCutSearch('');
      }, 1800);
    } catch (err: any) {
      setCutError(err.message || 'فشل في منح الإجازة.');
    }
  };

  const handleReturnSubmitGlobal = async () => {
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
      await recordLeaveReturn(leaveId, actualReturnDate, user?.username || 'system');
      await submitLeaveReturn(leaveId, user?.username || 'system');
      
      setReturnSuccess('تم تسجيل المواصلة والعودة لمباشرة العمل بنجاح!');
      
      // Reload state
      const [allP, allL] = await Promise.all([
        getAllFromStore<Personnel>('personnel'),
        getAllFromStore<Leave>('leaves')
      ]);
      setPersonnel(allP);
      setLeaves(allL);

      setTimeout(() => {
        setIsReturnModalOpenGlobal(false);
        setReturnSuccess('');
        setSelectedReturnLeaveId('');
        setReturnSearch('');
      }, 1500);
    } catch (err: any) {
      setReturnError(err.message || 'فشل في تسجيل مواصلة العمل.');
    }
  };

  // Filter personnel for Grant/Cut Leave search input
  const filteredPersonnelForCut = personnel
    .filter(p => p.fullName.toLowerCase().includes(cutSearch.toLowerCase()) || (p.militaryNumber && p.militaryNumber.includes(cutSearch)))
    .slice(0, 5);

  // Filter leaves for Return search input
  const filteredLeavesForReturn = leaves
    .filter(l => !l.actualReturnDate)
    .map(l => {
      const person = personnel.find(p => p.id === l.personnelId);
      return { leave: l, person };
    })
    .filter(item => item.person && (item.person.fullName.toLowerCase().includes(returnSearch.toLowerCase()) || (item.person.militaryNumber && item.person.militaryNumber.includes(returnSearch))))
    .slice(0, 5);

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

  // Get details for list
  const overdueNotificationsList = (() => {
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

  const endingSoonNotificationsList = (() => {
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

  const dutiesTodayList = (() => {
    return duties
      .filter(d => d.date === todayStr)
      .map(d => {
        const person = personnel.find(p => p.id === d.personnelId);
        return { duty: d, person };
      })
      .filter((item): item is { duty: Duty; person: Personnel } => !!item.person);
  })();

  const pendingSyncList = (() => {
    return leaves
      .filter(l => !l.cutSubmitted || (l.actualReturnDate && !l.returnSubmitted))
      .map(l => {
        const person = personnel.find(p => p.id === l.personnelId);
        let reason = '';
        if (!l.cutSubmitted) {
          reason = 'منح إجازة غير مرفوع';
        } else if (l.actualReturnDate && !l.returnSubmitted) {
          reason = 'مواصلة عمل غير مرفوعة';
        }
        return { leave: l, person, reason };
      })
      .filter((item): item is { leave: Leave; person: Personnel; reason: string } => !!item.person);
  })();

  const totalNotificationsCount = overdueNotificationsList.length + endingSoonNotificationsList.length + dutiesTodayList.length + pendingSyncList.length;

  // Custom audio synthesizer chime
  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.start(start);
        osc.stop(start + duration);
      };
      
      const now = ctx.currentTime;
      playTone(523.25, now, 0.12); // C5
      playTone(659.25, now + 0.08, 0.2); // E5
    } catch (e) {
      console.warn('Audio Context blocked or unsupported', e);
    }
  };

  // Quick direct return from dropdown
  const handleQuickReturn = async (leaveId: number, name: string) => {
    try {
      const todayDate = new Date().toISOString().split('T')[0];
      await recordLeaveReturn(leaveId, todayDate, user?.username || 'system');
      await submitLeaveReturn(leaveId, user?.username || 'system');
      
      // Refresh local lists
      const [allP, allL, allD] = await Promise.all([
        getAllFromStore<Personnel>('personnel'),
        getAllFromStore<Leave>('leaves'),
        getAllFromStore<Duty>('duties')
      ]);
      setPersonnel(allP);
      setLeaves(allL);
      setDuties(allD);
      playNotificationSound();
    } catch (err) {
      console.error('Failed quick direct return:', err);
    }
  };

  // Quick submit from dropdown
  const handleQuickSubmit = async (leaveId: number, isCut: boolean) => {
    try {
      if (isCut) {
        await submitLeaveCut(leaveId, user?.username || 'system');
      } else {
        await submitLeaveReturn(leaveId, user?.username || 'system');
      }
      
      // Refresh local lists
      const [allP, allL, allD] = await Promise.all([
        getAllFromStore<Personnel>('personnel'),
        getAllFromStore<Leave>('leaves'),
        getAllFromStore<Duty>('duties')
      ]);
      setPersonnel(allP);
      setLeaves(allL);
      setDuties(allD);
      playNotificationSound();
    } catch (err) {
      console.error('Failed quick submit:', err);
    }
  };

  // Export alerts to share on WhatsApp
  const handleExportToWhatsApp = () => {
    try {
      const parts: string[] = [];
      parts.push(`*📊 الموقف العملياتي والتنبيهات اليومية - اللواء 43 عمالقة*`);
      parts.push(`*تاريخ اليوم:* ${todayStr}\n`);

      if (overdueNotificationsList.length > 0) {
        parts.push(`🚨 *الأفراد المتخلفين عن المباشرة (${overdueNotificationsList.length}):*`);
        overdueNotificationsList.forEach(({ leave, person }) => {
          const days = getDaysOverdue(leave.endDate);
          parts.push(`- ${person.rank} / ${person.fullName} (${person.unit}) - متأخر ${days} يوم`);
        });
        parts.push('');
      }

      if (endingSoonNotificationsList.length > 0) {
        parts.push(`⏳ *إجازات تنتهي خلال 48 ساعة (${endingSoonNotificationsList.length}):*`);
        endingSoonNotificationsList.forEach(({ leave, person }) => {
          parts.push(`- ${person.rank} / ${person.fullName} (${person.unit}) - عودته: ${leave.endDate}`);
        });
        parts.push('');
      }

      if (dutiesTodayList.length > 0) {
        parts.push(`🛡️ *خدمات وواجبات اليوم القتالية (${dutiesTodayList.length}):*`);
        dutiesTodayList.forEach(({ duty, person }) => {
          parts.push(`- ${person.rank} / ${person.fullName} (${person.unit}) - الواجب: [${duty.duty}]`);
        });
        parts.push('');
      }

      if (pendingSyncList.length > 0) {
        parts.push(`⚠️ *إجراءات معلقة بانتظار الرفع لشؤون الأفراد (${pendingSyncList.length}):*`);
        pendingSyncList.forEach(({ leave, person, reason }) => {
          parts.push(`- ${person.rank} / ${person.fullName} (${person.unit}) - الإجراء: ${reason}`);
        });
        parts.push('');
      }

      if (parts.length === 2) {
        parts.push(`جميع الأفراد والسرية في حالة انضباط تام ولا توجد أي إشعارات أو متأخرين اليوم.`);
      } else {
        parts.push(`_تم توليد التقرير تلقائياً من المنظومة الرقمية للواء 43 عمالقة_`);
      }

      const text = parts.join('\n');
      navigator.clipboard.writeText(text);
      setCopiedNotificationAlert(true);
      playNotificationSound();
      setTimeout(() => setCopiedNotificationAlert(false), 2500);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  // 3. Inactivity Session Timeout Tracker (15 mins)
  useEffect(() => {
    if (!user) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const resetInactivityTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        handleLogout('تم تسجيل الخروج تلقائياً بسبب عدم النشاط لمدة 15 دقيقة.');
      }, IDLE_TIMEOUT_MS);
    };

    // User interaction listeners
    window.addEventListener('mousemove', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('scroll', resetInactivityTimer);

    // Initial trigger
    resetInactivityTimer();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener('mousemove', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
      window.removeEventListener('click', resetInactivityTimer);
      window.removeEventListener('scroll', resetInactivityTimer);
    };
  }, [user]);

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanUser = loginUsername.trim().toLowerCase();
    const cleanPass = loginPassword.trim();

    if (!cleanUser || !cleanPass) {
      setLoginError('يرجى كتابة اسم الحساب وكلمة المرور بالكامل.');
      return;
    }

    try {
      const allUsers = await getAllFromStore<User>('users');
      const match = allUsers.find(u => u.username.toLowerCase() === cleanUser && u.password === cleanPass);

      if (match) {
        const session = { username: match.username, role: match.role };
        setUser(session);
        sessionStorage.setItem('userSession', JSON.stringify(session));
        
        // Log clean login audit
        const db = await openDB();
        const tx = db.transaction('auditLog', 'readwrite');
        tx.objectStore('auditLog').add({
          action: 'تسجيل الدخول',
          details: `تم تسجيل دخول المستخدم ${match.username} بنجاح بصلاحية [${match.role}]`,
          user: match.username,
          time: new Date().toISOString()
        });
        
        // Reset login credentials
        setLoginUsername('');
        setLoginPassword('');
      } else {
        setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة، يرجى المحاولة مجدداً.');
      }
    } catch (err) {
      setLoginError('فشل الاتصال بقاعدة البيانات المحلية للتحقق.');
    }
  };

  // Handle Logout
  const handleLogout = async (message?: string) => {
    if (user) {
      // Log logout audit
      try {
        const db = await openDB();
        const tx = db.transaction('auditLog', 'readwrite');
        tx.objectStore('auditLog').add({
          action: 'تسجيل الخروج',
          details: message || `تم تسجيل خروج المستخدم ${user.username} من المنظومة`,
          user: user.username,
          time: new Date().toISOString()
        });
      } catch (e) {
        console.error(e);
      }
    }

    setUser(null);
    sessionStorage.removeItem('userSession');
    if (message) alert(message);
  };

  // Toggle Dark Mode
  const handleThemeToggle = () => {
    const nextMode = !darkMode;
    setDarkMode(nextMode);
    if (nextMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // PWA Install Prompt
  const handlePwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted PWA installation');
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  // Render current tab component
  const renderTabContent = () => {
    if (!user) return null;
    
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView currentUser={user} onNavigateToTab={setActiveTab} />;
      case 'personnel':
        return <PersonnelView currentUser={user} />;
      case 'attendance':
        return <AttendanceView currentUser={user} />;
      case 'leaves':
        return <LeavesView currentUser={user} />;
      case 'duties':
        return <DutiesView currentUser={user} />;
      case 'reports':
        return <ReportsView currentUser={user} />;
      case 'daily-report':
        return <DailyReportView currentUser={user} />;
      case 'audit':
        return <AuditLogView currentUser={user} />;
      case 'users':
        return user.role === 'admin' ? <UsersView currentUser={user} /> : <DashboardView currentUser={user} onNavigateToTab={setActiveTab} />;
      case 'backup':
        return <BackupRestoreView currentUser={user} />;
      case 'alerts':
        return <AlertsView currentUser={user} />;
      default:
        return <DashboardView currentUser={user} />;
    }
  };

  const getTabLabel = (tab: ViewTab) => {
    switch (tab) {
      case 'dashboard': return 'لوحة القيادة';
      case 'personnel': return 'قاعدة البيانات';
      case 'attendance': return 'الحضور اليومي';
      case 'leaves': return 'إدارة الإجازات';
      case 'duties': return 'جدول الواجبات';
      case 'reports': return 'التقارير والرفع';
      case 'daily-report': return 'التقرير اليومي والموقف';
      case 'audit': return 'سجل التدقيق';
      case 'users': return 'إدارة المستخدمين';
      case 'backup': return 'النسخ والبيانات';
      case 'alerts': return 'التنبيهات الذكية';
    }
  };

  // IF NOT AUTHENTICATED: Render Login Screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white relative overflow-hidden font-sans select-none" style={{ direction: 'rtl' }}>
        {/* Visual backgrounds */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-slate-950 opacity-90"></div>
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative w-full max-w-md p-6">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-slate-950/60 backdrop-blur-md rounded-2xl p-8 border border-slate-800/80 shadow-2xl flex flex-col items-center"
          >
            {/* Header / Logo */}
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/5">
                <Shield className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">قوات العمالقة الجنوبية</h1>
                <p className="text-[11px] text-amber-500/80 font-bold uppercase tracking-widest mt-1">اللواء 43 عمالقة - شؤون الأفراد</p>
              </div>
            </div>

            {/* Title */}
            <div className="w-full border-t border-slate-800/60 pt-4 mb-5 text-center">
              <h2 className="text-sm font-semibold text-slate-300">نظام إدارة القوة البشرية والتحضير اليومي</h2>
            </div>

            {/* Error alerts */}
            {loginError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full p-3 bg-red-950/40 border border-red-900 rounded-xl text-xs text-red-400 font-semibold mb-4 text-center leading-relaxed"
              >
                {loginError}
              </motion.div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">اسم حساب الدخول</label>
                <div className="relative">
                  <UserIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="username-input"
                    type="text"
                    required
                    placeholder="مثال: admin"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 text-xs font-semibold rounded-xl border border-slate-800 bg-slate-900/60 text-slate-100 focus:outline-hidden focus:border-amber-500 transition-colors"
                    style={{ direction: 'ltr' }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">كلمة المرور السرية</label>
                <div className="relative">
                  <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="password-input"
                    type="password"
                    required
                    placeholder="أدخل كلمة المرور..."
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 text-xs font-semibold rounded-xl border border-slate-800 bg-slate-900/60 text-slate-100 focus:outline-hidden focus:border-amber-500 transition-colors"
                    style={{ direction: 'ltr' }}
                  />
                </div>
              </div>

              <button
                id="login-btn"
                type="submit"
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-amber-600/10 hover:shadow-amber-550/20 active:scale-98 transition-all cursor-pointer mt-2"
              >
                تسجيل الدخول للمنظومة
              </button>
            </form>

            <div className="mt-6 text-center text-[10px] text-slate-500 leading-relaxed max-w-xs">
              <p>* حساب المدير الافتراضي: <span className="font-mono text-slate-400 font-bold select-all">admin</span> / كلمة المرور: <span className="font-mono text-slate-400 font-bold select-all">admin123</span></p>
              <p className="mt-2 text-slate-600">نظام مشفر آمن للعمل دون اتصال بالإنترنت بالكامل.</p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // IF AUTHENTICATED: Render Main System Dashboard Layout
  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 font-sans" style={{ direction: 'rtl' }}>
      
      {/* Sidebar mobile overlay backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-35 md:hidden no-print animate-fadeIn"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      {/* 1. Sidebar Navigation (Left/Right depending on RTL, in Arabic right) */}
      <aside 
        id="main-sidebar"
        className={`bg-slate-900 text-white shrink-0 border-l border-slate-850 z-40 transition-all duration-300 no-print fixed md:relative inset-y-0 md:right-auto ${
          isSidebarOpen 
            ? 'right-0 w-64 shadow-2xl' 
            : '-right-64 w-64 md:w-20'
        }`}
      >
        <div className="h-full flex flex-col justify-between">
          <div className="space-y-6">
            {/* Sidebar Brand Logo */}
            <div className="h-16 border-b border-slate-850 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-amber-500" />
                </div>
                {isSidebarOpen && (
                  <div className="truncate">
                    <h2 className="text-xs font-black text-slate-100">اللواء 43 عمالقة</h2>
                    <p className="text-[9px] text-amber-500/90 font-bold tracking-wider mt-0.5">إدارة القوة البشرية</p>
                  </div>
                )}
              </div>
              
              {/* Close Button on Mobile */}
              {isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-850 text-slate-400 hover:text-slate-200 md:hidden cursor-pointer"
                  title="إغلاق القائمة"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              )}
            </div>

            {/* Navigation Tabs List */}
            <nav className="px-3 space-y-1">
              {[
                { id: 'dashboard', label: 'لوحة القيادة', icon: Users },
                { id: 'personnel', label: 'قاعدة البيانات', icon: UserCheck },
                { id: 'attendance', label: 'الحضور اليومي', icon: Calendar },
                { id: 'leaves', label: 'إدارة الإجازات', icon: ClipboardList },
                { id: 'duties', label: 'جدول الواجبات', icon: Shield },
                { id: 'reports', label: 'التقارير والرفع', icon: FileText, badge: pendingBadgeCount },
                { id: 'daily-report', label: 'التقرير اليومي والموقف', icon: FileText },
                { id: 'alerts', label: 'التنبيهات الذكية', icon: Bell, badge: totalNotificationsCount },
                { id: 'audit', label: 'سجل التدقيق', icon: History }
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    id={`sidebar-tab-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id as ViewTab);
                      if (window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10' 
                        : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4.5 h-4.5 shrink-0" />
                      {isSidebarOpen && <span className="truncate">{item.label}</span>}
                    </div>
                    {isSidebarOpen && item.badge !== undefined && item.badge > 0 && (
                      <span className="bg-red-550 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ring-2 ring-slate-900 animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Admin-only options */}
              {user.role === 'admin' && (
                <div className="pt-4 mt-4 border-t border-slate-850 space-y-1">
                  {isSidebarOpen && <p className="px-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">إدارة المنظومة</p>}
                  
                  <button
                    id="sidebar-tab-users"
                    onClick={() => {
                      setActiveTab('users');
                      if (window.innerWidth < 768) {
                        setIsSidebarOpen(false);
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'users' 
                        ? 'bg-amber-600 text-white shadow-md' 
                        : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                    }`}
                  >
                    <UserCog className="w-4.5 h-4.5 shrink-0" />
                    {isSidebarOpen && <span className="truncate">إدارة المستخدمين</span>}
                  </button>
                </div>
              )}

              {/* Data Backup Tab */}
              <div className="pt-4 mt-4 border-t border-slate-850/50 space-y-1">
                <button
                  id="sidebar-tab-backup"
                  onClick={() => {
                    setActiveTab('backup');
                    if (window.innerWidth < 768) {
                      setIsSidebarOpen(false);
                    }
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'backup' 
                      ? 'bg-amber-600 text-white shadow-md' 
                      : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                  }`}
                >
                  <Database className="w-4.5 h-4.5 shrink-0" />
                  {isSidebarOpen && <span className="truncate">النسخ والبيانات</span>}
                </button>
              </div>
            </nav>
          </div>

          {/* Sidebar Footer logout */}
          <div className="p-3 border-t border-slate-850 space-y-2">
            {isSidebarOpen && (
              <div className="px-3 py-1 bg-slate-950/40 rounded-lg border border-slate-850/30 text-[10px] text-slate-400">
                <span className="font-bold text-slate-300">المستخدم:</span> {user.username} ({user.role})
              </div>
            )}
            
            <button
              id="sidebar-logout-btn"
              onClick={() => handleLogout()}
              className="w-full flex items-center gap-3 p-3 text-red-400 hover:bg-red-950/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <LogOut className="w-4.5 h-4.5 shrink-0" />
              {isSidebarOpen && <span>تسجيل الخروج</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main content wrapper (Flex Column) */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top bar (Header) */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-150 dark:border-slate-800 px-4 md:px-6 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-3 md:gap-4">
            {/* Sidebar Hamburger */}
            <button
              id="toggle-sidebar-btn"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">{getTabLabel(activeTab)}</h2>
              <p className="text-[10px] text-slate-400 font-semibold">شعبة القوة البشرية - اللواء 43 عمالقة</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Custom PWA Install prompt */}
            {showInstallBtn && (
              <button
                id="pwa-install-header-btn"
                onClick={handlePwaInstall}
                className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-extrabold rounded-lg border border-amber-500/20 transition-all cursor-pointer"
                title="تثبيت المنظومة PWA"
              >
                <DownloadCloud className="w-4 h-4 animate-bounce" />
                <span className="hidden sm:inline">تثبيت المنظومة PWA</span>
                <span className="sm:hidden text-[10px]">تثبيت</span>
              </button>
            )}

            {/* Dark mode switcher */}
            <button
              id="toggle-darkmode-btn"
              onClick={handleThemeToggle}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 cursor-pointer"
              title="تغيير المظهر"
            >
              {darkMode ? <Sun className="w-4.5 h-4.5 text-amber-500" /> : <Moon className="w-4.5 h-4.5 text-slate-600" />}
            </button>

            {/* Notifications Button and Popover */}
            <div className="relative">
              <button
                id="header-notifications-btn"
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className={`p-2 rounded-lg cursor-pointer transition-colors relative ${
                  isNotificationOpen 
                    ? 'bg-slate-100 dark:bg-slate-800 text-amber-500' 
                    : 'hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400'
                }`}
                title="التنبيهات والإشعارات الذكية"
              >
                <Bell className={`w-4.5 h-4.5 ${totalNotificationsCount > 0 ? 'animate-bounce' : ''}`} />
                {totalNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[8px] font-black text-white ring-2 ring-white dark:ring-slate-900">
                    {totalNotificationsCount}
                  </span>
                )}
              </button>

              {/* Popover Dropdown */}
              {isNotificationOpen && (
                <>
                  {/* Backdrop overlay for click-away */}
                  <div 
                    className="fixed inset-0 z-40 cursor-default" 
                    onClick={() => setIsNotificationOpen(false)} 
                  />
                  
                  <div 
                    id="notifications-dropdown"
                    className="absolute left-0 mt-2 w-80 md:w-[420px] bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden text-right animate-fadeIn flex flex-col max-h-[550px]"
                    style={{ direction: 'rtl' }}
                  >
                    {/* Popover Header */}
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-l from-slate-50 to-slate-100/50 dark:from-slate-950/40 dark:to-slate-900/40 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                          <BellRing className="w-4 h-4 text-amber-500 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">الإشعارات والتنبيهات الذكية</span>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block">غرفة العمليات والمتابعة الفورية</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        {/* Audio Chime Button */}
                        <button
                          onClick={playNotificationSound}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-colors"
                          title="تجربة رنين التنبيه"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>

                        {/* WhatsApp copy button */}
                        <button
                          onClick={handleExportToWhatsApp}
                          className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-all ${
                            copiedNotificationAlert
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 hover:opacity-90'
                          }`}
                          title="نسخ الموقف لمشاركته على واتساب"
                        >
                          {copiedNotificationAlert ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>تم النسخ!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>نسخ الموقف</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Search Field */}
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-slate-50/30 dark:bg-slate-950/10 shrink-0">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5" />
                      <input
                        type="text"
                        value={notificationSearch}
                        onChange={(e) => setNotificationSearch(e.target.value)}
                        placeholder="ابحث بالاسم، الرقم العسكري أو السرية..."
                        className="w-full text-xs bg-transparent text-slate-800 dark:text-slate-100 outline-hidden placeholder-slate-400 dark:placeholder-slate-500 font-semibold"
                      />
                      {notificationSearch && (
                        <button 
                          onClick={() => setNotificationSearch('')} 
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ml-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Tabs switcher */}
                    <div className="flex border-b border-slate-100 dark:border-slate-800 p-1 bg-slate-50/10 dark:bg-slate-950/5 overflow-x-auto shrink-0 scrollbar-none">
                      <button
                        onClick={() => {
                          setNotificationActiveTab('overdue');
                          playNotificationSound();
                        }}
                        className={`px-2.5 py-2 text-center text-[10px] font-extrabold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          notificationActiveTab === 'overdue'
                            ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/10'
                            : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        المتخلفين ({overdueNotificationsList.length})
                      </button>
                      <button
                        onClick={() => {
                          setNotificationActiveTab('endingSoon');
                          playNotificationSound();
                        }}
                        className={`px-2.5 py-2 text-center text-[10px] font-extrabold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          notificationActiveTab === 'endingSoon'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/10'
                            : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        العودة قريباً ({endingSoonNotificationsList.length})
                      </button>
                      <button
                        onClick={() => {
                          setNotificationActiveTab('dutiesToday');
                          playNotificationSound();
                        }}
                        className={`px-2.5 py-2 text-center text-[10px] font-extrabold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          notificationActiveTab === 'dutiesToday'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/10'
                            : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        واجبات اليوم ({dutiesTodayList.length})
                      </button>
                      <button
                        onClick={() => {
                          setNotificationActiveTab('pendingSync');
                          playNotificationSound();
                        }}
                        className={`px-2.5 py-2 text-center text-[10px] font-extrabold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          notificationActiveTab === 'pendingSync'
                            ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/10'
                            : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        المعلقة ({pendingSyncList.length})
                      </button>
                    </div>

                    {/* Popover Content Scroll area */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40 min-h-[220px] max-h-[340px]">
                      
                      {/* 1. OVERDUE TAB */}
                      {notificationActiveTab === 'overdue' && (
                        (() => {
                          const clean = notificationSearch.trim().toLowerCase();
                          const filtered = overdueNotificationsList.filter(({ person }) => 
                            !clean || 
                            person.fullName.toLowerCase().includes(clean) || 
                            person.militaryNumber.includes(clean) || 
                            person.unit.toLowerCase().includes(clean)
                          );

                          return filtered.length === 0 ? (
                            <div className="p-10 text-center text-xs text-slate-400 dark:text-slate-500 font-bold space-y-2">
                              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                              <p>لا يوجد متخلفين عن الحضور حالياً</p>
                              {notificationSearch && <p className="text-[10px] text-slate-400">امسح البحث للعثور على كل العناصر</p>}
                            </div>
                          ) : (
                            filtered.map(({ leave, person }) => {
                              const daysOverdue = getDaysOverdue(leave.endDate);
                              return (
                                <div 
                                  key={leave.id} 
                                  className="p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                                      {person.rank} / {person.fullName}
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                        {person.unit} {person.platoon && `(${person.platoon})`}
                                      </span>
                                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">• الرقم: {person.militaryNumber}</span>
                                    </div>
                                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold font-mono">تاريخ نهاية الإجازة: {leave.endDate}</p>
                                  </div>
                                  <div className="text-left shrink-0 flex flex-col items-end gap-1.5">
                                    <span className="inline-block bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black px-2 py-0.5 rounded-sm font-mono">
                                      متخلف {daysOverdue} يوم
                                    </span>
                                    {user?.role !== 'viewer' && (
                                      <button
                                        onClick={() => handleQuickReturn(leave.id!, person.fullName)}
                                        className="text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                                        title="تسجيل عودة ومباشرة العمل الفورية"
                                      >
                                        <CornerDownLeft className="w-3 h-3" />
                                        <span>مباشرة</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          );
                        })()
                      )}

                      {/* 2. ENDING SOON TAB */}
                      {notificationActiveTab === 'endingSoon' && (
                        (() => {
                          const clean = notificationSearch.trim().toLowerCase();
                          const filtered = endingSoonNotificationsList.filter(({ person }) => 
                            !clean || 
                            person.fullName.toLowerCase().includes(clean) || 
                            person.militaryNumber.includes(clean) || 
                            person.unit.toLowerCase().includes(clean)
                          );

                          return filtered.length === 0 ? (
                            <div className="p-10 text-center text-xs text-slate-400 dark:text-slate-500 font-bold space-y-2">
                              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                              <p>لا توجد إجازات تنتهي خلال الـ 48 ساعة القادمة</p>
                              {notificationSearch && <p className="text-[10px] text-slate-400">امسح البحث للعثور على كل العناصر</p>}
                            </div>
                          ) : (
                            filtered.map(({ leave, person }) => {
                              const label = getEndingSoonLabel(leave.endDate);
                              const daysRemaining = getDaysRemaining(leave.endDate);
                              return (
                                <div 
                                  key={leave.id} 
                                  className="p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                                      {person.rank} / {person.fullName}
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                        {person.unit} {person.platoon && `(${person.platoon})`}
                                      </span>
                                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">• النوع: {leave.leaveType}</span>
                                    </div>
                                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold font-mono">تاريخ العودة المقرر: {leave.endDate}</p>
                                  </div>
                                  <div className="text-left shrink-0 flex flex-col items-end gap-1.5">
                                    <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-sm font-mono ${
                                      daysRemaining === 0 
                                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                    }`}>
                                      {label}
                                    </span>
                                    {user?.role !== 'viewer' && (
                                      <button
                                        onClick={() => handleQuickReturn(leave.id!, person.fullName)}
                                        className="text-[10px] font-bold bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                                        title="تسجيل عودة ومباشرة العمل الفورية"
                                      >
                                        <CornerDownLeft className="w-3 h-3" />
                                        <span>مباشرة</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          );
                        })()
                      )}

                      {/* 3. TODAY'S DUTIES TAB */}
                      {notificationActiveTab === 'dutiesToday' && (
                        (() => {
                          const clean = notificationSearch.trim().toLowerCase();
                          const filtered = dutiesTodayList.filter(({ person }) => 
                            !clean || 
                            person.fullName.toLowerCase().includes(clean) || 
                            person.militaryNumber.includes(clean) || 
                            person.unit.toLowerCase().includes(clean)
                          );

                          return filtered.length === 0 ? (
                            <div className="p-10 text-center text-xs text-slate-400 dark:text-slate-500 font-bold space-y-2">
                              <Shield className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                              <p>لا توجد خدمات قتالية أو واجبات مسجلة لليوم</p>
                              {notificationSearch && <p className="text-[10px] text-slate-400">امسح البحث للعثور على كل العناصر</p>}
                            </div>
                          ) : (
                            filtered.map(({ duty, person }) => (
                              <div 
                                key={duty.id} 
                                className="p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                                    {person.rank} / {person.fullName}
                                  </p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                    {person.unit} {person.platoon && `(${person.platoon})`} • الرقم العسكري: {person.militaryNumber}
                                  </p>
                                </div>
                                <div className="text-left shrink-0">
                                  <span className="inline-block bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-black px-2.5 py-1 rounded-full">
                                    {duty.duty}
                                  </span>
                                </div>
                              </div>
                            ))
                          );
                        })()
                      )}

                      {/* 4. PENDING SYNC TAB */}
                      {notificationActiveTab === 'pendingSync' && (
                        (() => {
                          const clean = notificationSearch.trim().toLowerCase();
                          const filtered = pendingSyncList.filter(({ person }) => 
                            !clean || 
                            person.fullName.toLowerCase().includes(clean) || 
                            person.militaryNumber.includes(clean) || 
                            person.unit.toLowerCase().includes(clean)
                          );

                          return filtered.length === 0 ? (
                            <div className="p-10 text-center text-xs text-slate-400 dark:text-slate-500 font-bold space-y-2">
                              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                              <p>جميع الإجراءات تم رفعها ومزامنتها بنجاح</p>
                              {notificationSearch && <p className="text-[10px] text-slate-400">امسح البحث للعثور على كل العناصر</p>}
                            </div>
                          ) : (
                            filtered.map(({ leave, person, reason }) => (
                              <div 
                                key={leave.id} 
                                className="p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <p className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                                    {person.rank} / {person.fullName}
                                  </p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                    {person.unit} {person.platoon && `(${person.platoon})`} • {reason}
                                  </p>
                                </div>
                                <div className="text-left shrink-0 flex flex-col items-end gap-1.5">
                                  <span className="inline-block bg-purple-500/10 text-purple-700 dark:text-purple-400 text-[9px] font-extrabold px-2 py-0.5 rounded-sm">
                                    بانتظار الرفع
                                  </span>
                                  {user?.role !== 'viewer' && (
                                    <button
                                      onClick={() => handleQuickSubmit(leave.id!, !leave.cutSubmitted)}
                                      className="text-[9px] font-bold bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded-md transition-all cursor-pointer"
                                      title="رفع المعاملة لشؤون الأفراد الآن"
                                    >
                                      رفع فوري
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          );
                        })()
                      )}

                    </div>

                    {/* Popover Footer link */}
                    <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-center shrink-0">
                      <button
                        onClick={() => {
                          setActiveTab('alerts');
                          setIsNotificationOpen(false);
                        }}
                        className="text-[11px] text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300 font-black flex items-center justify-center gap-1 mx-auto cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
                        عرض وتفصيل جميع التنبيهات في صفحة مستقلة
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Profile widget */}
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300">
                {user.username[0].toUpperCase()}
              </div>
              <div className="hidden sm:block text-right font-sans">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{user.username}</p>
                <p className="text-[9px] text-slate-400 font-semibold">{user.role === 'admin' ? 'مدير عام' : user.role === 'editor' ? 'محرر القوة' : 'مشاهد فقط'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Modular view area (Full width and padded) */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-24 md:pb-28">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {renderTabContent()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Soft Footer inside applet */}
        <footer className="h-10 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-900 px-4 md:px-6 flex items-center justify-between text-[10px] text-slate-400 font-semibold shrink-0 no-print">
          <p>© {new Date().getFullYear()} شعبة القوة البشرية - اللواء 43 عمالقة.</p>
          <p>جميع الحقوق محفوظة ومحمية محلياً.</p>
        </footer>

        {/* Floating Bottom Quick Operations Bar (Fixed, Centered) */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] sm:w-[90%] max-w-lg bg-slate-950/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-800 shadow-2xl rounded-2xl px-4 py-2.5 flex items-center justify-between text-white transition-all no-print">
          
          {/* Button 1: Cut Leave */}
          <button
            onClick={() => setIsCutModalOpenGlobal(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 hover:text-amber-400 text-slate-400 transition-colors cursor-pointer"
            title="قطع إجازة (منح جديدة)"
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[9px] font-black mt-1">منح إجازة</span>
          </button>

          {/* Button 2: Register Return */}
          <button
            onClick={() => setIsReturnModalOpenGlobal(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 hover:text-emerald-400 text-slate-400 transition-colors cursor-pointer"
            title="تسجيل مواصلة عمل"
          >
            <CornerDownLeft className="w-5 h-5" />
            <span className="text-[9px] font-black mt-1">مواصلة عمل</span>
          </button>

          {/* Centered Database Icon (Pops up) */}
          <div className="flex-1 flex justify-center -mt-6">
            <button
              onClick={() => {
                setActiveTab('personnel');
                if (window.innerWidth < 768) {
                  setIsSidebarOpen(false);
                }
              }}
              className="w-13 h-13 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 hover:scale-110 active:scale-95 transition-all border-4 border-slate-50 dark:border-slate-950 cursor-pointer"
              title="قاعدة البيانات"
            >
              <Database className="w-5.5 h-5.5 text-slate-950" />
            </button>
          </div>

          {/* Button 4: Daily Report */}
          <button
            onClick={() => {
              setActiveTab('daily-report');
              if (window.innerWidth < 768) {
                setIsSidebarOpen(false);
              }
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
              activeTab === 'daily-report' ? 'text-indigo-400' : 'text-slate-400 hover:text-indigo-400'
            }`}
            title="التقرير اليومي والموقف"
          >
            <FileText className="w-5 h-5" />
            <span className="text-[9px] font-black mt-1">التقرير اليومي</span>
          </button>

          {/* Button 5: Smart Alerts */}
          <button
            onClick={() => {
              setActiveTab('alerts');
              if (window.innerWidth < 768) {
                setIsSidebarOpen(false);
              }
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer relative ${
              activeTab === 'alerts' ? 'text-rose-400' : 'text-slate-400 hover:text-rose-400'
            }`}
            title="التنبيهات والرقابة"
          >
            {totalNotificationsCount > 0 && (
              <span className="absolute -top-1 right-4 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[8px] font-black text-white ring-1 ring-slate-950 animate-pulse">
                {totalNotificationsCount}
              </span>
            )}
            <BellRing className="w-5 h-5" />
            <span className="text-[9px] font-black mt-1">التنبيهات</span>
          </button>

        </div>

        {/* Modal 1: Cut Leave */}
        <AnimatePresence>
          {isCutModalOpenGlobal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print" style={{ direction: 'rtl' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-800 dark:text-slate-100"
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-500" />
                    <h3 className="text-sm font-black">منح إجازة جديدة (قطع الخدمة)</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setIsCutModalOpenGlobal(false);
                      setCutError('');
                      setCutSuccess('');
                    }}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {cutError && (
                    <div className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-black rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{cutError}</span>
                    </div>
                  )}

                  {cutSuccess && (
                    <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{cutSuccess}</span>
                    </div>
                  )}

                  {/* Search personnel */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">البحث عن الفرد (الاسم أو الرقم العسكري)</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cutSearch}
                        onChange={(e) => setCutSearch(e.target.value)}
                        placeholder="اكتب الاسم أو الرقم العسكري للبحث..."
                        className="w-full text-xs font-bold bg-slate-55/60 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 pr-8 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-right"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3.5" />
                    </div>

                    {cutSearch && (
                      <div className="mt-2 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/20 divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredPersonnelForCut.length === 0 ? (
                          <p className="p-3 text-[11px] text-slate-400 text-center font-bold">لا توجد نتائج مطابقة</p>
                        ) : (
                          filteredPersonnelForCut.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setSelectedLeaveId(String(p.id));
                                setCutSearch(`${p.rank} / ${p.fullName}`);
                              }}
                              className={`w-full p-2.5 text-right text-[11px] font-bold flex justify-between items-center hover:bg-amber-500/5 cursor-pointer ${
                                selectedLeaveId === String(p.id) ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{p.rank} / {p.fullName}</span>
                              <span className="text-[9px] text-slate-400 font-mono">({p.unit})</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Leave Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">نوع الإجازة</label>
                      <select
                        value={cutLeaveType}
                        onChange={(e: any) => setCutLeaveType(e.target.value)}
                        className="w-full text-xs font-bold bg-slate-55/60 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-right cursor-pointer"
                      >
                        <option value="استحقاقه">سنوية (استحقاق)</option>
                        <option value="ميدانية">ميدانية</option>
                        <option value="مرضية">مرضية</option>
                        <option value="اضطرارية">اضطرارية</option>
                        <option value="أخرى">أخرى</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">مدة الإجازة المحتسبة</label>
                      <div className="w-full text-xs font-black bg-slate-100 dark:bg-slate-850 p-2.5 rounded-xl text-center font-mono text-amber-600 dark:text-amber-400">
                        {cutDaysCount} يوم
                      </div>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">تاريخ البدء</label>
                      <input
                        type="date"
                        value={cutStartDate}
                        onChange={(e) => setCutStartDate(e.target.value)}
                        className="w-full text-xs font-bold font-mono bg-slate-55/60 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-right cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">تاريخ الانتهاء</label>
                      <input
                        type="date"
                        value={cutEndDate}
                        onChange={(e) => setCutEndDate(e.target.value)}
                        className="w-full text-xs font-bold font-mono bg-slate-55/60 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 text-right cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsCutModalOpenGlobal(false);
                      setCutError('');
                      setCutSuccess('');
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleCutSubmitGlobal}
                    className="px-5 py-2 rounded-xl text-xs font-black bg-amber-600 text-white hover:bg-amber-500 shadow-md shadow-amber-600/10 cursor-pointer transition-all active:scale-95"
                  >
                    تأكيد ومنح الإجازة
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal 2: Register Return */}
        <AnimatePresence>
          {isReturnModalOpenGlobal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs no-print" style={{ direction: 'rtl' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-slate-800 dark:text-slate-100"
              >
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                  <div className="flex items-center gap-2">
                    <CornerDownLeft className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-sm font-black">تسجيل مواصلة (مباشرة عمل)</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setIsReturnModalOpenGlobal(false);
                      setReturnError('');
                      setReturnSuccess('');
                    }}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {returnError && (
                    <div className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-black rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{returnError}</span>
                    </div>
                  )}

                  {returnSuccess && (
                    <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-black rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{returnSuccess}</span>
                    </div>
                  )}

                  {/* Search leaves to return */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">البحث عن المجاز لمواصلته</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={returnSearch}
                        onChange={(e) => setReturnSearch(e.target.value)}
                        placeholder="اكتب اسم المجاز لتسجيل عودته..."
                        className="w-full text-xs font-bold bg-slate-55/60 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 pr-8 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-right"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3.5" />
                    </div>

                    {returnSearch && (
                      <div className="mt-2 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/20 divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredLeavesForReturn.length === 0 ? (
                          <p className="p-3 text-[11px] text-slate-400 text-center font-bold">لا توجد إجازات جارية مطابقة</p>
                        ) : (
                          filteredLeavesForReturn.map(({ leave, person }) => (
                            <button
                              key={leave.id}
                              onClick={() => {
                                setSelectedReturnLeaveId(String(leave.id));
                                setReturnSearch(`${person?.rank} / ${person?.fullName}`);
                              }}
                              className={`w-full p-2.5 text-right text-[11px] font-bold flex justify-between items-center hover:bg-emerald-500/5 cursor-pointer ${
                                selectedReturnLeaveId === String(leave.id) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span>{person?.rank} / {person?.fullName}</span>
                              <span className="text-[9px] text-slate-400 font-mono">({leave.leaveType === 'استحقاقه' ? 'سنوية' : leave.leaveType})</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actual Return Date */}
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-400 mb-1.5">تاريخ مباشرة العمل الفعلية</label>
                    <input
                      type="date"
                      value={actualReturnDate}
                      onChange={(e) => setActualReturnDate(e.target.value)}
                      className="w-full text-xs font-bold font-mono bg-slate-55/60 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-right cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsReturnModalOpenGlobal(false);
                      setReturnError('');
                      setReturnSuccess('');
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleReturnSubmitGlobal}
                    className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-550 shadow-md shadow-emerald-600/10 cursor-pointer transition-all active:scale-95"
                  >
                    تأكيد المباشرة والعودة
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
