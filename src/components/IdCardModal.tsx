/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Personnel } from '../types';
import { Shield, Printer, X, Award } from 'lucide-react';

interface IdCardModalProps {
  personnel: Personnel;
  onClose: () => void;
}

export default function IdCardModal({ personnel, onClose }: IdCardModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Generate QR Code Offline using canvas
    if (personnel.militaryNumber) {
      QRCode.toDataURL(
        personnel.militaryNumber,
        {
          width: 120,
          margin: 1,
          color: {
            dark: '#0f172a', // deep navy slate
            light: '#ffffff',
          },
        },
        (err, url) => {
          if (err) {
            console.error('Error generating QR Code', err);
            return;
          }
          setQrCodeUrl(url);
        }
      );
    }
  }, [personnel.militaryNumber]);

  const handlePrint = () => {
    // Print the ID card
    window.print();
  };

  return (
    <div id="id-card-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 no-print">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <span className="font-bold text-slate-800 dark:text-slate-100">بطاقة الهوية العسكرية</span>
          </div>
          <button 
            id="close-id-card-modal"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / ID Card Canvas wrapper */}
        <div className="p-6 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-950/20">
          {/* Real Card Aspect Ratio Container */}
          <div 
            id="military-id-card-print-area"
            className="print-card-only w-full max-w-sm h-56 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white rounded-xl shadow-lg overflow-hidden relative border border-amber-600/30 flex flex-col justify-between p-4"
            style={{ direction: 'rtl' }}
          >
            {/* Fine watermark background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none flex items-center justify-center">
              <Shield className="w-64 h-64 text-white" />
            </div>

            {/* Card Top / Header */}
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2 relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                  <Award className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-tight text-slate-100">قوات العمالقة الجنوبية</h3>
                  <p className="text-[9px] text-amber-400 font-medium">اللواء 43 عمالقة - شؤون الأفراد</p>
                </div>
              </div>
              <div className="text-left text-[9px] text-slate-400">
                <p>جمهورية اليمن</p>
                <p>البطاقة التعريفية</p>
              </div>
            </div>

            {/* Card Center / Info & QR Code */}
            <div className="flex justify-between items-center my-2 gap-4 relative z-10">
              <div className="flex-1 space-y-1.5">
                <div>
                  <p className="text-[8px] text-amber-400/80 uppercase font-semibold">الاسم الكامل</p>
                  <p className="text-sm font-bold text-slate-100 leading-tight truncate">{personnel.fullName}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[8px] text-amber-400/80 font-semibold">الرتبة العسكرية</p>
                    <p className="text-xs font-semibold text-slate-200">{personnel.rank}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-amber-400/80 font-semibold">الرقم العسكري</p>
                    <p className="text-xs font-mono font-bold text-amber-400">{personnel.militaryNumber}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[8px] text-amber-400/80 font-semibold">الوحدة / السرية</p>
                    <p className="text-[10px] font-medium text-slate-300 truncate">{personnel.unit}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-amber-400/80 font-semibold">الفصيل</p>
                    <p className="text-[10px] font-medium text-slate-300 truncate">{personnel.platoon || 'قيادة السرية'}</p>
                  </div>
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center shrink-0">
                <div className="p-1 bg-white rounded-lg border border-amber-500/20 shadow-inner">
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="ID QR Code" 
                      className="w-20 h-20"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-slate-800 flex items-center justify-center text-[8px] text-slate-500">
                      جاري التوليد...
                    </div>
                  )}
                </div>
                <span className="text-[8px] text-slate-400 mt-1 font-mono tracking-wider">{personnel.militaryNumber}</span>
              </div>
            </div>

            {/* Card Footer */}
            <div className="flex justify-between items-center border-t border-slate-800 pt-1.5 mt-1 relative z-10 text-[8px] text-slate-400">
              <span className="flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                قوة فعالة ومؤهلة
              </span>
              <span className="text-amber-400/70">مكتب شؤون الأفراد والضباط</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 no-print">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            * يمكنك استخدام زر الطباعة لطباعة البطاقة مباشرة باللون الأسود على ورق أبيض.
          </p>
          <div className="flex gap-2">
            <button
              id="print-id-card-btn"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-xl shadow-md cursor-pointer transition-all"
            >
              <Printer className="w-4 h-4" />
              طباعة البطاقة
            </button>
            <button
              id="close-id-card-modal-secondary"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
