/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Personnel, Leave, Attendance, Duty, AuditLogEntry, User, PersonnelStatus } from '../types';

const DB_NAME = 'Brigade43ForceDB';
const DB_VERSION = 1;

// Custom Event/Listener type for reactivity
type DbChangeListener = () => void;
const listeners = new Set<DbChangeListener>();

export function subscribeToDbChanges(listener: DbChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.error('Error in DB listener:', e);
    }
  });
}

// Open Database Promise
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // Personnel Store
      if (!db.objectStoreNames.contains('personnel')) {
        const personnelStore = db.createObjectStore('personnel', { keyPath: 'id', autoIncrement: true });
        personnelStore.createIndex('militaryNumber', 'militaryNumber', { unique: true });
      }

      // Leaves Store
      if (!db.objectStoreNames.contains('leaves')) {
        db.createObjectStore('leaves', { keyPath: 'id', autoIncrement: true });
      }

      // Attendance Store
      if (!db.objectStoreNames.contains('attendance')) {
        db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
      }

      // Duties Store
      if (!db.objectStoreNames.contains('duties')) {
        db.createObjectStore('duties', { keyPath: 'id', autoIncrement: true });
      }

      // AuditLog Store
      if (!db.objectStoreNames.contains('auditLog')) {
        db.createObjectStore('auditLog', { keyPath: 'id', autoIncrement: true });
      }

      // Settings Store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Users Store
      if (!db.objectStoreNames.contains('users')) {
        const usersStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        usersStore.createIndex('username', 'username', { unique: true });
      }
    };
  });
}

// Pre-seed database if empty
export async function seedDatabaseIfEmpty(): Promise<void> {
  const db = await openDB();

  // 1. Check if Users exist
  const users = await getAllFromStore<User>('users');
  if (users.length === 0) {
    // Seed default users
    await addToStore('users', { username: 'admin', password: 'admin123', role: 'admin' });
    await addToStore('users', { username: 'editor', password: 'editor123', role: 'editor' });
    await addToStore('users', { username: 'viewer', password: 'viewer123', role: 'viewer' });
    
    // Log seeding user
    await writeAuditLog('تهيئة النظام', 'تم إنشاء حسابات المستخدمين الافتراضية بنجاح', 'النظام');
  }

  // 2. Check if Personnel exist
  const personnel = await getAllFromStore<Personnel>('personnel');
  if (personnel.length === 0) {
    const initialPersonnel: Personnel[] = [
      { militaryNumber: '1001', fullName: 'محمد علوي اليافعي', rank: 'عقيد', unit: 'هيئة القيادة', status: 'موجود', leaveBalance: 30, notes: 'قائد الكتيبة' },
      { militaryNumber: '1002', fullName: 'صالح أحمد العولقي', rank: 'مقدم', unit: 'هيئة القيادة', status: 'موجود', leaveBalance: 28, notes: 'رئيس العمليات' },
      { militaryNumber: '2001', fullName: 'فهد حسين الردفاني', rank: 'رقيب أول', unit: 'السرية الأولى', platoon: 'الفصيل الأول', status: 'موجود', leaveBalance: 30 },
      { militaryNumber: '2002', fullName: 'عبدالرحمن ناصر الحدي', rank: 'عريف', unit: 'السرية الأولى', platoon: 'الفصيل الثاني', status: 'إجازة', leaveBalance: 15 },
      { militaryNumber: '2003', fullName: 'ماجد فرج الصبيحي', rank: 'جندي', unit: 'السرية الأولى', platoon: 'الفصيل الثالث', status: 'غياب', leaveBalance: 30 },
      { militaryNumber: '3001', fullName: 'وضاح عبدالله الشعيبي', rank: 'رقيب', unit: 'السرية الثانية', platoon: 'الفصيل الأول', status: 'موجود', leaveBalance: 25 },
      { militaryNumber: '3002', fullName: 'عادل سعيد الكلدي', rank: 'جندي أول', unit: 'السرية الثانية', platoon: 'الفصيل الثاني', status: 'مريض', leaveBalance: 30, notes: 'تقرير طبي مستمر لـ 5 أيام' },
      { militaryNumber: '4001', fullName: 'سالم يسلم الحالمي', rank: 'ملازم أول', unit: 'السرية الثالثة', platoon: 'الفصيل الأول', status: 'موجود', leaveBalance: 20 },
      { militaryNumber: '4002', fullName: 'منصر قاسم الضالعي', rank: 'جندي', unit: 'السرية الثالثة', platoon: 'الفصيل الثاني', status: 'إذن', leaveBalance: 30 },
      { militaryNumber: '4003', fullName: 'علي محسن الفضلي', rank: 'جندي', unit: 'السرية الثالثة', platoon: 'الفصيل الثالث', status: 'موجود', leaveBalance: 30 }
    ];

    for (const p of initialPersonnel) {
      await addToStore('personnel', p);
    }

    // Seed some initial leave record for personnel 2002 (عبدالرحمن ناصر الحدي)
    const allP = await getAllFromStore<Personnel>('personnel');
    const p2002 = allP.find(p => p.militaryNumber === '2002');
    if (p2002 && p2002.id) {
      const today = new Date();
      const startDate = new Date();
      startDate.setDate(today.getDate() - 5);
      const endDate = new Date();
      endDate.setDate(today.getDate() + 10);

      await addToStore('leaves', {
        personnelId: p2002.id,
        leaveType: 'استحقاقه',
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        daysCount: 15,
        cutSubmitted: false,
        returnSubmitted: false
      } as Leave);
    }

    await writeAuditLog('تهيئة القوة', 'تم تسجيل القوة البشرية الافتراضية للواء 43 عمالقة', 'النظام');
  }
}

// Base helper: Get All from store
export function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

// Base helper: Add to store
export function addToStore<T>(storeName: string, item: T): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(item);

      request.onsuccess = () => {
        notifyListeners();
        resolve(request.result as number);
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

// Base helper: Put (insert or update) in store
export function putInStore<T>(storeName: string, item: T): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => {
        notifyListeners();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

// Base helper: Delete from store
export function deleteFromStore(storeName: string, id: any): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        notifyListeners();
        resolve();
      };
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

// --- Specific Module Functions ---

// 1. Audit Log Helper
export async function writeAuditLog(action: string, details: string, user: string): Promise<void> {
  const entry: AuditLogEntry = {
    action,
    details,
    user,
    time: new Date().toISOString()
  };
  await addToStore('auditLog', entry);
}

// 2. Personnel Database CRUD
export async function addPersonnel(person: Personnel, currentUser: string): Promise<number> {
  const id = await addToStore('personnel', person);
  await writeAuditLog('إضافة فرد', `تم تسجيل فرد جديد: ${person.rank}/ ${person.fullName} (رقم عسكري: ${person.militaryNumber})`, currentUser);
  return id;
}

export async function updatePersonnel(person: Personnel, currentUser: string): Promise<void> {
  await putInStore('personnel', person);
  await writeAuditLog('تحديث فرد', `تم تعديل بيانات الفرد: ${person.rank}/ ${person.fullName} (رقم عسكري: ${person.militaryNumber})`, currentUser);
}

export async function deletePersonnel(id: number, currentUser: string): Promise<void> {
  const db = await openDB();
  
  // Get person details first for audit log
  const transaction1 = db.transaction('personnel', 'readonly');
  const store1 = transaction1.objectStore('personnel');
  const person: Personnel = await new Promise((resolve) => {
    const req = store1.get(id);
    req.onsuccess = () => resolve(req.result);
  });

  if (!person) return;

  // Perform cascaded deletion in a single readwrite transaction across multiple stores
  const transaction2 = db.transaction(['personnel', 'leaves', 'attendance', 'duties'], 'readwrite');
  
  // 1. Delete from personnel
  transaction2.objectStore('personnel').delete(id);

  // 2. Delete related leaves
  const leavesStore = transaction2.objectStore('leaves');
  const leavesReq = leavesStore.getAll();
  leavesReq.onsuccess = () => {
    const leaves: Leave[] = leavesReq.result;
    leaves.filter(l => l.personnelId === id).forEach(l => {
      leavesStore.delete(l.id!);
    });
  };

  // 3. Delete related attendance
  const attendanceStore = transaction2.objectStore('attendance');
  const attendanceReq = attendanceStore.getAll();
  attendanceReq.onsuccess = () => {
    const attendances: Attendance[] = attendanceReq.result;
    attendances.filter(a => a.personnelId === id).forEach(a => {
      attendanceStore.delete(a.id!);
    });
  };

  // 4. Delete related duties
  const dutiesStore = transaction2.objectStore('duties');
  const dutiesReq = dutiesStore.getAll();
  dutiesReq.onsuccess = () => {
    const duties: Duty[] = dutiesReq.result;
    duties.filter(d => d.personnelId === id).forEach(d => {
      dutiesStore.delete(d.id!);
    });
  };

  transaction2.oncomplete = async () => {
    await writeAuditLog('حذف فرد', `تم حذف الفرد وكافة سجلاته: ${person.rank}/ ${person.fullName} (رقم عسكري: ${person.militaryNumber})`, currentUser);
    notifyListeners();
  };
}

// Bulk update personnel status
export async function bulkUpdateStatus(ids: number[], newStatus: PersonnelStatus, currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('personnel', 'readwrite');
  const store = tx.objectStore('personnel');

  for (const id of ids) {
    const person: Personnel = await new Promise((resolve) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result);
    });
    if (person) {
      person.status = newStatus;
      store.put(person);
    }
  }

  tx.oncomplete = async () => {
    await writeAuditLog('تعديل جماعي للحالة', `تم تعديل حالة ${ids.length} أفراد جماعياً إلى [${newStatus}]`, currentUser);
    notifyListeners();
  };
}

// Bulk delete personnel
export async function bulkDeletePersonnel(ids: number[], currentUser: string): Promise<void> {
  for (const id of ids) {
    await deletePersonnel(id, currentUser);
  }
}

// 3. Daily Attendance Logic
export async function getAttendanceByDate(dateStr: string): Promise<Attendance[]> {
  const all = await getAllFromStore<Attendance>('attendance');
  return all.filter(a => a.date === dateStr);
}

// Checks active leaves on a specific date for a person
export async function getActiveLeaveForDate(personnelId: number, dateStr: string): Promise<Leave | null> {
  const leaves = await getAllFromStore<Leave>('leaves');
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);

  const active = leaves.find(l => {
    if (l.personnelId !== personnelId) return false;
    const start = new Date(l.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(l.endDate);
    end.setHours(0, 0, 0, 0);

    // If actualReturnDate is recorded, check if it returned early
    if (l.actualReturnDate) {
      const actReturn = new Date(l.actualReturnDate);
      actReturn.setHours(0, 0, 0, 0);
      return targetDate >= start && targetDate < actReturn;
    }

    return targetDate >= start && targetDate <= end;
  });

  return active || null;
}

// Dynamically calculates a person's status on a specific date based on all their leaves.
export function getPersonnelStatusOnDate(personnelId: number, dateStr: string, leaves: Leave[]): PersonnelStatus {
  const personLeaves = leaves.filter(l => l.personnelId === personnelId);
  if (personLeaves.length === 0) {
    return 'موجود';
  }

  // Sort leaves chronologically
  personLeaves.sort((a, b) => a.startDate.localeCompare(b.startDate));

  let status: PersonnelStatus = 'موجود';

  for (const l of personLeaves) {
    if (dateStr >= l.startDate) {
      if (dateStr <= l.endDate) {
        if (l.actualReturnDate && dateStr >= l.actualReturnDate) {
          status = 'موجود'; // Returned early, present from return date onwards
        } else {
          status = 'إجازة'; // Still on active leave
        }
      } else {
        if (!l.actualReturnDate) {
          status = 'غياب'; // Leave ended, did not return yet -> Absent
        } else {
          if (dateStr < l.actualReturnDate) {
            status = 'غياب'; // Target date is between endDate and actualReturnDate -> Absent
          } else {
            status = 'موجود'; // Returned late, but target date is on or after return date -> Present/At work
          }
        }
      }
    }
  }

  return status;
}

// Save Daily Attendance
export async function saveDailyAttendance(dateStr: string, records: { personnelId: number; status: PersonnelStatus }[], currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(['attendance', 'personnel'], 'readwrite');
  
  const attendanceStore = tx.objectStore('attendance');
  const personnelStore = tx.objectStore('personnel');

  // Load existing attendances for this date to avoid duplicate insertion, rather we overwrite
  const existingReq = attendanceStore.getAll();
  
  existingReq.onsuccess = async () => {
    const existing: Attendance[] = existingReq.result;
    const filteredExisting = existing.filter(a => a.date === dateStr);

    for (const rec of records) {
      // 1. Create or update attendance record
      const match = filteredExisting.find(a => a.personnelId === rec.personnelId);
      const attRecord: Attendance = match 
        ? { ...match, status: rec.status }
        : { personnelId: rec.personnelId, date: dateStr, status: rec.status };
      
      attendanceStore.put(attRecord);

      // 2. Sync status to personnel record ONLY if date is today (so we don't overwrite current status with old historical attendance edits)
      const todayStr = new Date().toISOString().split('T')[0];
      if (dateStr === todayStr) {
        const pReq = personnelStore.get(rec.personnelId);
        pReq.onsuccess = () => {
          const p: Personnel = pReq.result;
          if (p && p.status !== rec.status) {
            p.status = rec.status;
            personnelStore.put(p);
          }
        };
      }
    }
  };

  tx.oncomplete = async () => {
    await writeAuditLog('تحضير اليومي', `تم حفظ سجل التحضير اليومي للتاريخ: ${dateStr}`, currentUser);
    notifyListeners();
  };
}

// 4. Leave Management Logic
export async function addLeave(leave: Leave, currentUser: string): Promise<number> {
  const db = await openDB();

  // 1. Add Leave record
  const leaveId = await addToStore('leaves', leave);

  // 2. Update Personnel Status dynamically
  await syncPersonnelStatus(leave.personnelId);

  // Get name for audit log
  const pTx = db.transaction('personnel', 'readonly');
  const person2: Personnel = await new Promise((resolve) => {
    const r = pTx.objectStore('personnel').get(leave.personnelId);
    r.onsuccess = () => resolve(r.result);
  });

  const fullName = person2 ? person2.fullName : 'فرد';
  await writeAuditLog('منح إجازة', `تم منح إجازة (${leave.leaveType}) لـ ${fullName} من ${leave.startDate} إلى ${leave.endDate} (${leave.daysCount} يوم)`, currentUser);

  notifyListeners();
  return leaveId;
}

export async function deleteLeave(leaveId: number, currentUser: string): Promise<void> {
  const db = await openDB();
  
  // Get leave details
  const leaveTx = db.transaction('leaves', 'readonly');
  const leave: Leave = await new Promise((resolve) => {
    const r = leaveTx.objectStore('leaves').get(leaveId);
    r.onsuccess = () => resolve(r.result);
  });

  if (!leave) return;

  // Get personnel details
  const pTx = db.transaction('personnel', 'readonly');
  const person: Personnel = await new Promise((resolve) => {
    const r = pTx.objectStore('personnel').get(leave.personnelId);
    r.onsuccess = () => resolve(r.result);
  });

  // Delete leave record
  await deleteFromStore('leaves', leaveId);

  // Re-evaluate current status
  await syncPersonnelStatus(leave.personnelId);

  const name = person ? person.fullName : 'فرد';
  await writeAuditLog('حذف إجازة', `تم حذف سجل إجازة الفرد: ${name} (النوع: ${leave.leaveType}، من: ${leave.startDate})`, currentUser);
  notifyListeners();
}

// Submit Cut (رفع قطع الإجازة)
export async function submitLeaveCut(leaveId: number, currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('leaves', 'readwrite');
  const store = tx.objectStore('leaves');
  
  const leave: Leave = await new Promise((resolve) => {
    const r = store.get(leaveId);
    r.onsuccess = () => resolve(r.result);
  });

  if (leave) {
    leave.cutSubmitted = true;
    store.put(leave);

    // Write audit
    const personnel = await getAllFromStore<Personnel>('personnel');
    const person = personnel.find(p => p.id === leave.personnelId);
    const name = person ? person.fullName : 'فرد';

    tx.oncomplete = async () => {
      await writeAuditLog('رفع قطع إجازة', `تم رفع طلب قطع إجازة الفرد: ${name} لشؤون الأفراد`, currentUser);
      notifyListeners();
    };
  }
}

// Record Actual Return
export async function recordLeaveReturn(leaveId: number, actualReturnDate: string, currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('leaves', 'readwrite');
  const store = tx.objectStore('leaves');
  
  const leave: Leave = await new Promise((resolve) => {
    const r = store.get(leaveId);
    r.onsuccess = () => resolve(r.result);
  });

  if (leave) {
    leave.actualReturnDate = actualReturnDate;
    store.put(leave);

    tx.oncomplete = async () => {
      // Re-evaluate current status of the person
      await syncPersonnelStatus(leave.personnelId);

      const personnel = await getAllFromStore<Personnel>('personnel');
      const person = personnel.find(p => p.id === leave.personnelId);
      const name = person ? person.fullName : 'فرد';

      const isLate = new Date(actualReturnDate) > new Date(leave.endDate);
      const delayText = isLate ? 'متأخراً عن الموعد' : 'في موعده';

      await writeAuditLog('تسجيل عودة من إجازة', `تم تسجيل عودة الفرد: ${name} فعلياً في تاريخ: ${actualReturnDate} (${delayText})`, currentUser);
      notifyListeners();
    };
  }
}

// Submit Return (رفع العودة لشؤون الأفراد)
export async function submitLeaveReturn(leaveId: number, currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('leaves', 'readwrite');
  const store = tx.objectStore('leaves');
  
  const leave: Leave = await new Promise((resolve) => {
    const r = store.get(leaveId);
    r.onsuccess = () => resolve(r.result);
  });

  if (leave) {
    leave.returnSubmitted = true;
    store.put(leave);

    const personnel = await getAllFromStore<Personnel>('personnel');
    const person = personnel.find(p => p.id === leave.personnelId);
    const name = person ? person.fullName : 'فرد';

    tx.oncomplete = async () => {
      await writeAuditLog('رفع عودة من إجازة', `تم رفع مباشرة العمل والعودة للفرد: ${name} لشؤون الأفراد`, currentUser);
      notifyListeners();
    };
  }
}

// Bulk submit pending cuts
export async function bulkSubmitCuts(leaveIds: number[], currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('leaves', 'readwrite');
  const store = tx.objectStore('leaves');

  for (const id of leaveIds) {
    const leave: Leave = await new Promise((resolve) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result);
    });
    if (leave) {
      leave.cutSubmitted = true;
      store.put(leave);
    }
  }

  tx.oncomplete = async () => {
    await writeAuditLog('رفع قطع جماعي', `تم رفع عدد (${leaveIds.length}) من قطوعات الإجازات المعلقة شؤون الأفراد جماعياً`, currentUser);
    notifyListeners();
  };
}

// Bulk submit pending returns
export async function bulkSubmitReturns(leaveIds: number[], currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('leaves', 'readwrite');
  const store = tx.objectStore('leaves');

  for (const id of leaveIds) {
    const leave: Leave = await new Promise((resolve) => {
      const r = store.get(id);
      r.onsuccess = () => resolve(r.result);
    });
    if (leave) {
      leave.returnSubmitted = true;
      store.put(leave);
    }
  }

  tx.oncomplete = async () => {
    await writeAuditLog('رفع عودة جماعي', `تم رفع عدد (${leaveIds.length}) من مباشرات وعودات الإجازات لشؤون الأفراد جماعياً`, currentUser);
    notifyListeners();
  };
}

// Re-evaluates person's status to their dynamic calculated status for today.
export async function syncPersonnelStatus(personnelId: number): Promise<void> {
  const db = await openDB();
  const todayStr = new Date().toISOString().split('T')[0];
  const leaves = await getAllFromStore<Leave>('leaves');
  const targetStatus = getPersonnelStatusOnDate(personnelId, todayStr, leaves);

  const tx = db.transaction('personnel', 'readwrite');
  const store = tx.objectStore('personnel');
  const person: Personnel = await new Promise((resolve) => {
    const r = store.get(personnelId);
    r.onsuccess = () => resolve(r.result);
  });

  if (person) {
    let finalStatus = targetStatus;
    
    // Preserve manual statuses (like sick 'مريض' or official permission 'إذن') 
    // if there is no active or overdue leave today.
    if (targetStatus === 'موجود' && (person.status === 'مريض' || person.status === 'إذن')) {
      const personLeaves = leaves.filter(l => l.personnelId === personnelId);
      const hasActiveOrOverdueLeave = personLeaves.some(l => {
        if (todayStr >= l.startDate) {
          if (todayStr <= l.endDate) {
            return !l.actualReturnDate || todayStr < l.actualReturnDate;
          } else {
            return !l.actualReturnDate || todayStr < l.actualReturnDate;
          }
        }
        return false;
      });
      
      if (!hasActiveOrOverdueLeave) {
        finalStatus = person.status;
      }
    }

    if (person.status !== finalStatus) {
      person.status = finalStatus;
      store.put(person);
    }
  }
}

// 5. Duty Roster Logic
export async function getDutiesByDate(dateStr: string): Promise<Duty[]> {
  const duties = await getAllFromStore<Duty>('duties');
  return duties.filter(d => d.date === dateStr);
}

export async function saveDailyDuties(dateStr: string, records: { personnelId: number; duty: any }[], currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('duties', 'readwrite');
  const store = tx.objectStore('duties');

  const existingReq = store.getAll();
  existingReq.onsuccess = () => {
    const existing: Duty[] = existingReq.result;
    const filtered = existing.filter(d => d.date === dateStr);

    for (const rec of records) {
      const match = filtered.find(d => d.personnelId === rec.personnelId);
      const record: Duty = match
        ? { ...match, duty: rec.duty }
        : { personnelId: rec.personnelId, date: dateStr, duty: rec.duty };
      
      store.put(record);
    }
  };

  tx.oncomplete = async () => {
    await writeAuditLog('جدول واجب اليوم', `تم تعديل وحفظ جدول الواجبات اليومي للتاريخ: ${dateStr}`, currentUser);
    notifyListeners();
  };
}

// 6. User Management
export async function addUser(user: User, currentUser: string): Promise<number> {
  const id = await addToStore('users', user);
  await writeAuditLog('إضافة مستخدم', `تم إنشاء مستخدم جديد في النظام: ${user.username} (الصلاحية: ${user.role})`, currentUser);
  return id;
}

export async function deleteUser(id: number, currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('users', 'readonly');
  const user: User = await new Promise((resolve) => {
    const r = tx.objectStore('users').get(id);
    r.onsuccess = () => resolve(r.result);
  });

  if (!user) return;
  if (user.username === 'admin') {
    throw new Error('لا يمكن حذف حساب المسؤول الافتراضي (admin)!');
  }

  await deleteFromStore('users', id);
  await writeAuditLog('حذف مستخدم', `تم حذف حساب المستخدم: ${user.username}`, currentUser);
}

// 7. Data Backup & Restore (JSON Export / Import)
export async function exportDatabaseBackup(): Promise<string> {
  const dbData = {
    backupDate: new Date().toISOString(),
    personnel: await getAllFromStore('personnel'),
    leaves: await getAllFromStore('leaves'),
    attendance: await getAllFromStore('attendance'),
    duties: await getAllFromStore('duties'),
    auditLog: await getAllFromStore('auditLog'),
    users: await getAllFromStore('users'),
    settings: await getAllFromStore('settings')
  };

  return JSON.stringify(dbData, null, 2);
}

export async function importDatabaseRestore(jsonString: string, currentUser: string): Promise<void> {
  const parsed = JSON.parse(jsonString);

  if (!parsed.personnel || !parsed.users) {
    throw new Error('ملف النسخة الاحتياطية غير صالح أو تالف!');
  }

  const db = await openDB();

  // Perform full clear and insert of everything in a single massive transactional effort
  const stores = ['personnel', 'leaves', 'attendance', 'duties', 'auditLog', 'settings', 'users'];
  const tx = db.transaction(stores, 'readwrite');

  // Clear existing
  stores.forEach(s => tx.objectStore(s).clear());

  // Populate new
  if (Array.isArray(parsed.personnel)) {
    const store = tx.objectStore('personnel');
    parsed.personnel.forEach(p => {
      delete p.id; // Let auto-increment rebuild or preserve if needed, keeping them simple
      store.add(p);
    });
  }

  if (Array.isArray(parsed.leaves)) {
    const store = tx.objectStore('leaves');
    parsed.leaves.forEach(l => {
      delete l.id;
      store.add(l);
    });
  }

  if (Array.isArray(parsed.attendance)) {
    const store = tx.objectStore('attendance');
    parsed.attendance.forEach(a => {
      delete a.id;
      store.add(a);
    });
  }

  if (Array.isArray(parsed.duties)) {
    const store = tx.objectStore('duties');
    parsed.duties.forEach(d => {
      delete d.id;
      store.add(d);
    });
  }

  if (Array.isArray(parsed.users)) {
    const store = tx.objectStore('users');
    parsed.users.forEach(u => {
      delete u.id;
      store.add(u);
    });
  } else {
    // Re-seed default if missing
    const store = tx.objectStore('users');
    store.add({ username: 'admin', password: 'admin123', role: 'admin' });
  }

  if (Array.isArray(parsed.settings)) {
    const store = tx.objectStore('settings');
    parsed.settings.forEach(s => store.put(s));
  }

  tx.oncomplete = async () => {
    // Log the restore
    await writeAuditLog('استعادة البيانات', 'تمت استعادة كافة البيانات بنجاح من ملف النسخة الاحتياطية', currentUser);
    notifyListeners();
  };
}

export async function clearAuditLog(currentUser: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('auditLog', 'readwrite');
  tx.objectStore('auditLog').clear();
  tx.oncomplete = async () => {
    await writeAuditLog('تطهير السجل', `تم مسح سجل التدقيق بالكامل بواسطة المسؤول`, currentUser);
    notifyListeners();
  };
}

// Re-evaluates status for all personnel
export async function syncAllPersonnelStatus(): Promise<void> {
  const pList = await getAllFromStore<Personnel>('personnel');
  for (const p of pList) {
    if (p.id) {
      await syncPersonnelStatus(p.id);
    }
  }
}

