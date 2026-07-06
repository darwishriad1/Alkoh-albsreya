/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id?: number;
  username: string;
  password?: string;
  role: UserRole;
}

export type PersonnelStatus = 'موجود' | 'إجازة' | 'غياب' | 'مريض' | 'إذن';

export interface Personnel {
  id?: number;
  militaryNumber: string; // Unique
  fullName: string;
  rank: string;
  unit: string; // 'هيئة القيادة' or 'السرية الأولى' or 'السرية الثانية' or 'السرية الثالثة'
  platoon?: string; // 'الفصيل الأول' or 'الفصيل الثاني' or 'الفصيل الثالث' (only for companies)
  status: PersonnelStatus;
  leaveBalance: number; // default 30
  notes?: string;
}

export type LeaveType = 'استحقاقه' | 'مرضية' | 'طارئة' | 'إذن';

export interface Leave {
  id?: number;
  personnelId: number;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysCount: number;
  cutSubmitted: boolean;
  actualReturnDate?: string; // YYYY-MM-DD
  returnSubmitted: boolean;
}

export interface Attendance {
  id?: number;
  personnelId: number;
  date: string; // YYYY-MM-DD
  status: PersonnelStatus;
}

export type DutyType = 'حراسة' | 'دورية' | 'مطبخ' | 'إداري' | 'راحة' | 'لا يوجد';

export interface Duty {
  id?: number;
  personnelId: number;
  date: string; // YYYY-MM-DD
  duty: DutyType;
}

export interface AuditLogEntry {
  id?: number;
  action: string;
  details: string;
  user: string;
  time: string; // ISO string or formatted Arabic date
}

// Predefined Military Ranks in Brigade 43 Giants
export const MILITARY_RANKS = [
  'جندي',
  'جندي أول',
  'عريف',
  'رقيب',
  'رقيب أول',
  'رئيس رقباء',
  'ملازم',
  'ملازم أول',
  'نقيب',
  'رائد',
  'مقدم',
  'عقيد',
  'عميد',
  'لواء',
  'فريق'
];

// Predefined Units
export const BRIGADE_UNITS = [
  'هيئة القيادة',
  'السرية الأولى',
  'السرية الثانية',
  'السرية الثالثة'
];

// Predefined Platoons (only for companies)
export const PLATOONS = [
  'الفصيل الأول',
  'الفصيل الثاني',
  'الفصيل الثالث'
];

// Predefined Personnel Statuses with Colors for Badges
export const STATUS_METADATA: Record<PersonnelStatus, { label: string; color: string; bg: string; text: string }> = {
  'موجود': { label: 'موجود', color: 'emerald', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
  'إجازة': { label: 'إجازة', color: 'blue', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400' },
  'غياب': { label: 'غياب', color: 'red', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400' },
  'مريض': { label: 'مريض', color: 'amber', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  'إذن': { label: 'إذن', color: 'purple', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400' }
};

// Predefined Duty Options
export const DUTY_METADATA: Record<DutyType, { label: string; color: string; bg: string; text: string }> = {
  'حراسة': { label: 'حراسة', color: 'rose', bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400' },
  'دورية': { label: 'دورية', color: 'sky', bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-400' },
  'مطبخ': { label: 'مطبخ', color: 'orange', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-400' },
  'إداري': { label: 'إداري', color: 'indigo', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-400' },
  'راحة': { label: 'راحة', color: 'teal', bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-400' },
  'لا يوجد': { label: 'لا يوجد', color: 'slate', bg: 'bg-slate-50 dark:bg-slate-950/10', text: 'text-slate-500 dark:text-slate-400' }
};
