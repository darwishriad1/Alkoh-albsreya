/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { User, UserRole } from '../types';
import { getAllFromStore, addUser, deleteUser } from '../lib/db';
import { Users, Plus, Trash2, Shield, Eye, EyeOff, UserPlus, AlertTriangle } from 'lucide-react';

interface UsersViewProps {
  currentUser: { username: string; role: string };
}

export default function UsersView({ currentUser }: UsersViewProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form Fields
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<UserRole>('editor');
  const [formError, setFormError] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<boolean>(false);

  // Toggle password eye
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const data = await getAllFromStore<User>('users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess(false);

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setFormError('يرجى ملء اسم المستخدم وكلمة المرور بالكامل.');
      return;
    }

    if (cleanPassword.length < 5) {
      setFormError('كلمة المرور يجب أن لا تقل عن 5 أحرف أو أرقام للأمان.');
      return;
    }

    // Check uniqueness
    const exists = users.find(u => u.username.toLowerCase() === cleanUsername);
    if (exists) {
      setFormError('اسم المستخدم هذا مسجل مسبقاً في النظام!');
      return;
    }

    const newUser: User = {
      username: cleanUsername,
      password: cleanPassword,
      role
    };

    try {
      await addUser(newUser, currentUser.username);
      
      // Reset form
      setUsername('');
      setPassword('');
      setRole('editor');
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);

      loadData();
    } catch (err: any) {
      setFormError('فشل تسجيل حساب المستخدم: ' + err.message);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.username === 'admin') {
      alert('غير مسموح بحذف الحساب المسؤول الافتراضي (admin)!');
      return;
    }

    if (user.username === currentUser.username) {
      alert('لا يمكنك حذف حسابك الحالي الذي تستخدمه لتسجيل الدخول!');
      return;
    }

    if (confirm(`هل أنت متأكد من حذف حساب المستخدم [${user.username}]؟ سيفقد كافة صلاحيات الدخول للنظام فوراً.`)) {
      try {
        await deleteUser(user.id!, currentUser.username);
        loadData();
      } catch (err: any) {
        alert('فشل الحذف: ' + err.message);
      }
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
    <div id="users-view-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Register User Form (Left Side) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 p-6 h-fit shadow-xs">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-amber-500" />
          إنشاء حساب مستخدم جديد
        </h2>

        <form onSubmit={handleAddUser} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-405 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold">
              تم إنشاء حساب المستخدم بنجاح ومزامنته في النظام!
            </div>
          )}

          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">اسم المستخدم (بالأحرف اللاتينية) *</label>
            <input
              id="form-username"
              type="text"
              required
              placeholder="مثال: editor_ahmed"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
              style={{ direction: 'ltr' }}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">كلمة المرور السرية *</label>
            <div className="relative">
              <input
                id="form-password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="أدخل كلمة مرور قوية..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 focus:outline-hidden focus:border-amber-500"
                style={{ direction: 'ltr' }}
              />
              <button
                id="toggle-pwd-visibility"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400">مستوى الصلاحية الممنوح</label>
            <div className="relative">
              <select
                id="form-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full appearance-none px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 focus:outline-hidden cursor-pointer"
              >
                <option value="editor">محرر (Editor) - تعديل، تسجيل، حضور، وإجازات</option>
                <option value="viewer">مشاهد (Viewer) - استعراض، بحث، وطباعة فقط</option>
                <option value="admin">مدير (Admin) - تحكم مطلق للمنظومة بالكامل</option>
              </select>
            </div>
          </div>

          <button
            id="create-account-btn"
            type="submit"
            className="w-full py-2.5 bg-slate-850 hover:bg-slate-750 dark:bg-amber-600 dark:hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
          >
            إنشاء الحساب وتفعيله
          </button>
        </form>
      </div>

      {/* 2. Existing Users list (Right Side / takes 2 cols) */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 p-6 shadow-xs flex flex-col">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-500" />
          حسابات مستخدمي النظام المسجلين حالياً
        </h2>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-slate-500 text-xs font-bold font-sans">
                <th className="py-3 px-4">اسم الحساب</th>
                <th className="py-3 px-4">مستوى الصلاحية</th>
                <th className="py-3 px-4">ميزات الدور</th>
                <th className="py-3 px-4 text-left">التحكم الحسابي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
              {users.map((u) => {
                const isDefaultAdmin = u.username === 'admin';
                const isSelf = u.username === currentUser.username;

                return (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span className="font-mono" style={{ direction: 'ltr' }}>{u.username}</span>
                        {isSelf && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-2 py-0.5 rounded-md">
                            حسابك الحالي
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-lg ${
                        u.role === 'admin' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400' :
                        u.role === 'editor' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        {u.role === 'admin' ? 'مسؤول (Admin)' : u.role === 'editor' ? 'محرر (Editor)' : 'مشاهد (Viewer)'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {u.role === 'admin' ? 'تحكم بالمنظومة، حسابات، نسخ احتياطي' :
                       u.role === 'editor' ? 'إدخال القوة، التحضير اليومي، الإجازات' :
                       'تصفح، بحث، تصدير، وطباعة الهويات العسكرية'}
                    </td>
                    <td className="py-3 px-4 text-left">
                      {isDefaultAdmin ? (
                        <span className="text-xs text-slate-350 dark:text-slate-600 font-bold">حساب أساسي مؤمن</span>
                      ) : isSelf ? (
                        <span className="text-xs text-slate-350 dark:text-slate-600 font-bold">حساب مستخدم نشط</span>
                      ) : (
                        <button
                          id={`del-user-${u.id}`}
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="حذف حساب المستخدم نهائياً"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
