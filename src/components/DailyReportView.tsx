/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import { Personnel, Leave } from '../types';
import { getAllFromStore, subscribeToDbChanges } from '../lib/db';
import { 
  FileText, 
  Printer, 
  Clock, 
  Calendar, 
  Users, 
  TrendingUp, 
  UserX, 
  ChevronDown, 
  AlertTriangle,
  CheckCircle2,
  Award,
  Search,
  Filter,
  Download,
  FileSpreadsheet
} from 'lucide-react';

interface DailyReportViewProps {
  currentUser: {
    username: string;
    role: string;
  };
}

export default function DailyReportView({ currentUser }: DailyReportViewProps) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [downloadingExcel, setDownloadingExcel] = useState<boolean>(false);
  
  // Custom date selection (defaults to today's date)
  const [reportDate, setReportDate] = useState<string>(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Aden' }) // YYYY-MM-DD in Yemen time
  );
  
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    try {
      const pData = await getAllFromStore<Personnel>('personnel');
      const lData = await getAllFromStore<Leave>('leaves');
      setPersonnel(pData);
      setLeaves(lData);
    } catch (err) {
      console.error('Failed to load data in DailyReportView:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToDbChanges(() => {
      loadData();
    });
    return () => unsub();
  }, []);

  // Format date to readable Arabic style
  const getReadableArabicDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-YE', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  // 1. Daily completed returns (الإجازات المواصلة اليومية)
  // Personnel whose actualReturnDate matches the selected reportDate
  const dailyReturns = leaves
    .filter(l => l.actualReturnDate === reportDate)
    .map(l => {
      const person = personnel.find(p => p.id === l.personnelId);
      return { leave: l, person };
    })
    .filter(item => item.person !== undefined) as { leave: Leave; person: Personnel }[];

  // 2. Expected returns today but hasn't returned yet (or returned late/early on other days)
  // Personnel whose scheduled endDate matches the selected reportDate, but without actualReturnDate, or actualReturnDate != endDate
  const expectedReturns = leaves
    .filter(l => l.endDate === reportDate && !l.actualReturnDate)
    .map(l => {
      const person = personnel.find(p => p.id === l.personnelId);
      return { leave: l, person };
    })
    .filter(item => item.person !== undefined) as { leave: Leave; person: Personnel }[];

  // 3. Overdue / Slackers (المتخلفين عن العودة)
  // Personnel whose scheduled endDate is BEFORE the reportDate and who have NOT registered an actualReturnDate yet
  const overduePersonnel = leaves
    .filter(l => !l.actualReturnDate && l.endDate < reportDate)
    .map(l => {
      const person = personnel.find(p => p.id === l.personnelId);
      return { leave: l, person };
    })
    .filter(item => item.person !== undefined) as { leave: Leave; person: Personnel }[];

  // Calculate days overdue
  const getDaysOverdueCount = (endDateStr: string) => {
    const report = new Date(reportDate);
    const end = new Date(endDateStr);
    const diffTime = report.getTime() - end.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? 0 : diffDays;
  };

  // Units list
  const units = ['هيئة القيادة', 'السرية الأولى', 'السرية الثانية', 'السرية الثالثة'];

  // Unit-specific statistics calculation
  const unitStats = units.map(u => {
    const matchName = u === 'السرية الثالثة' ? 'السرية الثالث' : u;
    // Filter personnel belonging to this unit
    const unitP = personnel.filter(p => p.unit && (p.unit.includes(matchName) || p.unit.includes(u)));
    const total = unitP.length;
    const present = unitP.filter(p => p.status === 'موجود').length;
    const leave = unitP.filter(p => p.status === 'إجازة').length;
    const absent = unitP.filter(p => p.status === 'غياب').length;
    const sick = unitP.filter(p => p.status === 'مريض').length;
    const permit = unitP.filter(p => p.status === 'إذن').length;
    
    // Readiness is ratio of Present to Total
    const ready = total > 0 ? Math.round((present / total) * 100) : 0;
    
    // Count overdue in this unit
    const unitOverdueCount = overduePersonnel.filter(item => item.person?.unit && (item.person.unit.includes(matchName) || item.person.unit.includes(u))).length;

    return { 
      name: u, 
      total, 
      present, 
      leave, 
      absent, 
      sick, 
      permit, 
      ready,
      overdueCount: unitOverdueCount
    };
  });

  // Grand totals
  const grandTotal = unitStats.reduce((sum, item) => sum + item.total, 0);
  const grandPresent = unitStats.reduce((sum, item) => sum + item.present, 0);
  const grandLeave = unitStats.reduce((sum, item) => sum + item.leave, 0);
  const grandAbsent = unitStats.reduce((sum, item) => sum + item.absent, 0);
  const grandSick = unitStats.reduce((sum, item) => sum + item.sick, 0);
  const grandPermit = unitStats.reduce((sum, item) => sum + item.permit, 0);
  const grandOverdue = overduePersonnel.length;
  const overallReadiness = grandTotal > 0 ? Math.round((grandPresent / grandTotal) * 100) : 0;

  // Apply filters on lists
  const filteredDailyReturns = dailyReturns.filter(item => {
    if (!item.person) return false;
    const matchUnit = selectedUnitFilter === 'all' || (item.person.unit && item.person.unit.includes(selectedUnitFilter));
    const matchSearch = searchQuery === '' || 
      (item.person.fullName && item.person.fullName.toLowerCase().includes(searchQuery.toLowerCase())) || 
      (item.person.militaryNumber && item.person.militaryNumber.includes(searchQuery));
    return matchUnit && matchSearch;
  });

  const filteredExpectedReturns = expectedReturns.filter(item => {
    if (!item.person) return false;
    const matchUnit = selectedUnitFilter === 'all' || (item.person.unit && item.person.unit.includes(selectedUnitFilter));
    const matchSearch = searchQuery === '' || 
      (item.person.fullName && item.person.fullName.toLowerCase().includes(searchQuery.toLowerCase())) || 
      (item.person.militaryNumber && item.person.militaryNumber.includes(searchQuery));
    return matchUnit && matchSearch;
  });

  const filteredOverduePersonnel = overduePersonnel.filter(item => {
    if (!item.person) return false;
    const matchUnit = selectedUnitFilter === 'all' || (item.person.unit && item.person.unit.includes(selectedUnitFilter));
    const matchSearch = searchQuery === '' || 
      (item.person.fullName && item.person.fullName.toLowerCase().includes(searchQuery.toLowerCase())) || 
      (item.person.militaryNumber && item.person.militaryNumber.includes(searchQuery));
    return matchUnit && matchSearch;
  });

  const handleDownloadPDF = async () => {
    setDownloadingPdf(true);
    let iframe: HTMLIFrameElement | null = null;

    try {
      const element = document.getElementById('daily-report-pdf-content');
      if (!element) {
        alert('حدث خطأ: لم يتم العثور على محتوى التقرير.');
        return;
      }

      // Create a temporary hidden iframe to fully isolate rendering and avoid main document's OKLCH Tailwind styles
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '850px';
      iframe.style.height = '1200px';
      iframe.style.border = 'none';
      iframe.style.background = '#ffffff';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Could not access iframe document');
      }

      // Get the HTML content of our daily report element
      const contentHtml = element.innerHTML;

      // Construct the complete isolated document inside the iframe
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>Daily Report PDF</title>
          <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              color: #0f172a;
              font-family: 'Tajawal', sans-serif;
              -webkit-print-color-adjust: exact;
            }

            #daily-report-pdf-content {
              font-family: 'Tajawal', 'Inter', sans-serif !important;
              direction: rtl !important;
              background-color: #ffffff !important;
              color: #0f172a !important;
              padding: 32px !important;
              width: 850px !important;
              box-sizing: border-box !important;
              border: none !important;
              box-shadow: none !important;
            }

            /* Flexbox and layouts */
            .flex { display: flex !important; }
            .justify-between { justify-content: space-between !important; }
            .justify-center { justify-content: center !important; }
            .items-start { align-items: flex-start !important; }
            .items-center { align-items: center !important; }
            .flex-col { flex-direction: column !important; }

            /* Grid Layouts */
            .grid { display: grid !important; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
            .md\\:grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
            .col-span-2 { grid-column: span 2 / span 2 !important; }

            /* Spacings & Margins */
            .space-y-1 > * + * { margin-top: 4px !important; }
            .space-y-3 > * + * { margin-top: 12px !important; }
            .space-y-4 > * + * { margin-top: 16px !important; }
            .space-y-8 > * + * { margin-top: 32px !important; }
            .gap-1\\.5 { gap: 6px !important; }
            .gap-2 { gap: 8px !important; }
            .gap-3 { gap: 12px !important; }
            .gap-4 { gap: 16px !important; }
            .gap-8 { gap: 32px !important; }
            .pb-6 { padding-bottom: 24px !important; }
            .pt-6 { padding-top: 24px !important; }
            .pt-10 { padding-top: 40px !important; }
            .mb-1 { margin-bottom: 4px !important; }
            .mt-4 { margin-top: 16px !important; }
            .mt-0\\.5 { margin-top: 2px !important; }

            /* Borders and lines */
            .border-b-2 { border-bottom: 2px solid #0f172a !important; }
            .border-t { border-top: 1px solid #cbd5e1 !important; }
            .border-t-2 { border-top: 2px solid #0f172a !important; }
            .border-dashed { border-style: dashed !important; }
            .border-r-4 { border-right: 4px solid #10b981 !important; }
            .border-emerald-500 { border-color: #10b981 !important; }
            .border-indigo-500 { border-color: #6366f1 !important; }
            .border-rose-500 { border-color: #f43f5e !important; }
            .pr-3 { padding-right: 12px !important; }
            .pr-2 { padding-right: 8px !important; }
            .border { border: 1px solid #cbd5e1 !important; }
            .border-slate-200 { border-color: #cbd5e1 !important; }
            .border-slate-800 { border-color: #1e293b !important; }
            .border-slate-850 { border-color: #334155 !important; }
            .rounded-xl { border-radius: 12px !important; }
            .rounded-2xl { border-radius: 16px !important; }
            .rounded-3xl { border-radius: 24px !important; }

            /* Text configurations */
            .text-right { text-align: right !important; }
            .text-center { text-align: center !important; }
            .text-left { text-align: left !important; }
            .font-sans { font-family: 'Tajawal', sans-serif !important; }
            .font-mono { font-family: 'JetBrains Mono', monospace !important; }
            .font-bold { font-weight: 700 !important; }
            .font-black { font-weight: 900 !important; }
            .font-extrabold { font-weight: 800 !important; }

            /* Text Sizes */
            .text-xs { font-size: 11px !important; }
            .text-sm { font-size: 13px !important; }
            .text-base { font-size: 15px !important; }
            .text-\\[9px\\] { font-size: 9px !important; }
            .text-\\[10px\\] { font-size: 10px !important; }
            .text-\\[11px\\] { font-size: 11px !important; }
            .text-\\[13px\\] { font-size: 13px !important; }

            /* Colors */
            .text-slate-900 { color: #0f172a !important; }
            .text-slate-850 { color: #1e293b !important; }
            .text-slate-800 { color: #1e293b !important; }
            .text-slate-600 { color: #475569 !important; }
            .text-slate-500 { color: #64748b !important; }
            .text-slate-400 { color: #94a3b8 !important; }
            .text-indigo-500 { color: #6366f1 !important; }
            .text-indigo-600 { color: #4f46e5 !important; }
            .text-indigo-400 { color: #818cf8 !important; }
            .text-emerald-500 { color: #10b981 !important; }
            .text-emerald-600 { color: #059669 !important; }
            .text-blue-500 { color: #3b82f6 !important; }
            .text-blue-600 { color: #2563eb !important; }
            .text-rose-500 { color: #f43f5e !important; }
            .text-rose-600 { color: #e11d48 !important; }
            .text-rose-700 { color: #be123c !important; }
            .text-amber-500 { color: #f59e0b !important; }
            .text-amber-600 { color: #d97706 !important; }
            .text-purple-600 { color: #9333ea !important; }
            .text-red-600 { color: #dc2626 !important; }

            /* Backgrounds */
            .bg-white { background-color: #ffffff !important; }
            .bg-slate-50 { background-color: #f8fafc !important; }
            .bg-slate-100 { background-color: #f1f5f9 !important; }
            .bg-slate-950 { background-color: #020617 !important; }
            .text-white { color: #ffffff !important; }

            /* Colors with Opacity */
            .bg-emerald-500\\/5 { background-color: rgba(16, 185, 129, 0.05) !important; }
            .bg-emerald-500\\/10 { background-color: rgba(16, 185, 129, 0.1) !important; }
            .bg-blue-500\\/5 { background-color: rgba(59, 130, 246, 0.05) !important; }
            .bg-blue-500\\/10 { background-color: rgba(59, 130, 246, 0.1) !important; }
            .bg-rose-500\\/5 { background-color: rgba(244, 63, 94, 0.05) !important; }
            .bg-rose-500\\/10 { background-color: rgba(244, 63, 94, 0.1) !important; }
            .bg-amber-500\\/5 { background-color: rgba(245, 158, 11, 0.05) !important; }
            .bg-amber-500\\/10 { background-color: rgba(245, 158, 11, 0.1) !important; }
            .bg-indigo-900\\/60 { background-color: rgba(49, 46, 129, 0.6) !important; }
            .bg-slate-50\\/50 { background-color: rgba(248, 250, 252, 0.5) !important; }

            /* Table structures */
            table {
              width: 100% !important;
              border-collapse: collapse !important;
              border-spacing: 0 !important;
            }
            thead tr {
              background-color: #f8fafc !important;
              border-bottom: 1px solid #cbd5e1 !important;
            }
            th {
              padding: 10px 8px !important;
              font-weight: 700 !important;
              color: #64748b !important;
              font-size: 11px !important;
              text-align: right !important;
            }
            tbody tr {
              border-bottom: 1px solid #f1f5f9 !important;
            }
            tbody tr:last-child {
              border-bottom: none !important;
            }
            td {
              padding: 10px 8px !important;
              font-size: 11px !important;
              vertical-align: middle !important;
            }

            /* Grand Total row overrides */
            tr.bg-slate-950 {
              background-color: #020617 !important;
              color: #ffffff !important;
            }
            tr.bg-slate-950 td {
              color: #ffffff !important;
              font-weight: 900 !important;
            }

            /* Badge classes */
            .inline-block { display: inline-block !important; }
            .px-2\\.5 { padding-left: 10px !important; padding-right: 10px !important; }
            .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
            .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
            .py-0\\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
            .rounded-md { border-radius: 6px !important; }
            .rounded { border-radius: 4px !important; }

            /* Image placeholder styling */
            .w-14 { width: 56px !important; height: 56px !important; }
            .h-14 { height: 56px !important; }
            .w-5 { width: 20px !important; height: 20px !important; }
            .h-5 { height: 20px !important; }
            .w-4 { width: 16px !important; height: 16px !important; }
            .h-4 { height: 16px !important; }
            .w-3\\.5 { width: 14px !important; height: 14px !important; }
            .h-3\\.5 { height: 14px !important; }

            /* Opacity helper */
            .opacity-90 { opacity: 0.9 !important; }
          </style>
        </head>
        <body>
          <div id="daily-report-pdf-content">
            ${contentHtml}
          </div>
        </body>
        </html>
      `);
      iframeDoc.close();

      // Give the browser time to layout and fetch fonts inside the iframe
      await new Promise(resolve => setTimeout(resolve, 500));

      const iframeReportEl = iframeDoc.getElementById('daily-report-pdf-content');
      if (!iframeReportEl) {
        throw new Error('Report element inside iframe not found');
      }

      // Safe fallback: strip or replace any remaining inline styles inside elements of the iframe
      // that contain unsupported css properties/values
      const allElements = iframeReportEl.getElementsByTagName('*');
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const styleAttr = el.getAttribute('style');
        if (styleAttr && (styleAttr.includes('okl') || styleAttr.includes('color-mix') || styleAttr.includes('light-dark'))) {
          el.setAttribute('style', styleAttr
            .replace(/okl(ch|ab)\((?:[^()]+|\([^()]*\))*\)/g, '#64748b')
            .replace(/color-mix\((?:[^()]+|\([^()]*\))*\)/g, '#64748b')
            .replace(/light-dark\((?:[^()]+|\([^()]*\))*\)/g, '#64748b')
          );
        }
      }

      // Capture using html2canvas directly from the isolated iframe
      const canvas = await html2canvas(iframeReportEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 850
      });

      // Convert canvas to image and add to jsPDF
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 0.35; // clean standard padding
      const contentWidth = pdfWidth - (margin * 2);
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      if (contentHeight > (pdfHeight - (margin * 2))) {
        // Multi-page slicing for large reports
        let heightLeft = contentHeight;
        let pageCount = 0;
        const pageHeightLimit = pdfHeight - (margin * 2);

        while (heightLeft > 0) {
          if (pageCount > 0) {
            pdf.addPage();
          }

          const sourceY = pageCount * (canvas.height * (pageHeightLimit / contentHeight));
          const sourceHeight = canvas.height * (pageHeightLimit / contentHeight);

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(sourceHeight, canvas.height - sourceY);
          
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(
              canvas, 
              0, sourceY, canvas.width, sliceCanvas.height, 
              0, 0, sliceCanvas.width, sliceCanvas.height
            );
            const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.98);
            pdf.addImage(
              sliceImgData, 
              'JPEG', 
              margin, 
              margin, 
              contentWidth, 
              (sliceCanvas.height * contentWidth) / canvas.width
            );
          }

          heightLeft -= pageHeightLimit;
          pageCount++;
        }
      } else {
        // Single page rendering
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      }

      // Save document
      pdf.save(`تقرير_الموقف_اليومي_اللواء_43_${reportDate}.pdf`);

    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('فشل توليد ملف PDF. يرجى استخدام ميزة طباعة التقرير كخيار بديل وسريع لحفظ المستند.');
    } finally {
      // Clean up the iframe
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      setDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    setDownloadingExcel(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'نظام المتابعة العسكري - اللواء 43';
      workbook.lastModifiedBy = 'نظام المتابعة العسكري';
      workbook.created = new Date();
      workbook.modified = new Date();

      // ----- SHEET 1: خلاصة موقف الجاهزية -----
      const sheet1 = workbook.addWorksheet('خلاصة موقف الجاهزية', {
        views: [{ rightToLeft: true }]
      });

      // Show grid lines explicitly
      sheet1.views[0].showGridLines = true;

      // 1. Title Block
      sheet1.mergeCells('A1:I1');
      const titleCell = sheet1.getCell('A1');
      titleCell.value = 'تقرير موقف وجاهزية القوة اليومي - اللواء 43 مشاة';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' } // Deep Navy
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet1.getRow(1).height = 45;

      // 2. Report Date & Filter Block
      sheet1.mergeCells('A2:I2');
      const dateCell = sheet1.getCell('A2');
      const filterText = `تصفية الوحدة: ${selectedUnitFilter === 'all' ? 'الكل' : selectedUnitFilter}${searchQuery ? ` | البحث: "${searchQuery}"` : ''}`;
      dateCell.value = `تاريخ الموقف: ${getReadableArabicDate(reportDate)} | ${filterText} | تاريخ التصدير: ${new Date().toLocaleDateString('ar-YE')}`;
      dateCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1E293B' } };
      dateCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' } // Light Slate
      };
      dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet1.getRow(2).height = 25;

      // Spacer
      sheet1.addRow([]);

      // 3. Section Header: إحصائيات السرايا والوحدات
      sheet1.mergeCells('A4:I4');
      const sec1Cell = sheet1.getCell('A4');
      sec1Cell.value = 'أولاً: موقف السرايا والوحدات الفعلي والجاهزية اليومية';
      sec1Cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
      sec1Cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' } // Blue-100
      };
      sec1Cell.alignment = { horizontal: 'right', vertical: 'middle' };
      sheet1.getRow(4).height = 25;

      // 4. Stats Table Headers
      const statsHeaders = [
        'الوحدة / السرية', 
        'إجمالي القوة', 
        'الموجود فعلياً', 
        'في الإجازة', 
        'غياب', 
        'مريض', 
        'إذن', 
        'المتخلفين عن العودة', 
        'نسبة الجاهزية'
      ];
      const headerRow = sheet1.addRow(statsHeaders);
      headerRow.height = 30;
      
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF334155' } // Slate-700
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
          left: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FF94A3B8' } }
        };
      });

      // Add stats rows
      unitStats.forEach((stat) => {
        const row = sheet1.addRow([
          stat.name,
          stat.total,
          stat.present,
          stat.leave,
          stat.absent,
          stat.sick,
          stat.permit,
          stat.overdueCount,
          `${stat.ready}%`
        ]);
        row.height = 24;
        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Arial', size: 10, bold: colNumber === 1 };
          cell.alignment = { horizontal: colNumber === 1 ? 'right' : 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          
          // Color coding for readiness
          if (colNumber === 9) {
            const readyVal = parseInt(stat.ready.toString());
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: readyVal >= 80 ? 'FF059669' : readyVal >= 50 ? 'FFD97706' : 'FFDC2626' } };
          }
        });
      });

      // Add Grand Total Row
      const totalRow = sheet1.addRow([
        'الإجمالي العام للواء',
        grandTotal,
        grandPresent,
        grandLeave,
        grandAbsent,
        grandSick,
        grandPermit,
        grandOverdue,
        `${overallReadiness}%`
      ]);
      totalRow.height = 28;
      totalRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0F172A' } // Slate-900 (matches UI)
        };
        cell.alignment = { horizontal: colNumber === 1 ? 'right' : 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F172A' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF475569' } },
          right: { style: 'thin', color: { argb: 'FF475569' } }
        };
      });

      sheet1.addRow([]); // Blank spacer

      // 5. Section Header: مؤشرات وخلاصة الموقف العام
      sheet1.mergeCells('A12:I12');
      const cardsHeader = sheet1.getCell('A12');
      cardsHeader.value = 'ثانياً: مؤشرات وخلاصة الموقف العام والجاهزية القتالية';
      cardsHeader.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
      cardsHeader.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' }
      };
      cardsHeader.alignment = { horizontal: 'right', vertical: 'middle' };
      sheet1.getRow(12).height = 25;

      sheet1.addRow([]); // Blank spacer

      // Helper function to draw a styled "Card" in Excel
      const addSummaryCard = (startCol: string, endCol: string, title: string, value: string, subtext: string, themeColorHex: string) => {
        const titleCell = sheet1.getCell(`${startCol}14`);
        const valueCell = sheet1.getCell(`${startCol}15`);
        const subCell = sheet1.getCell(`${startCol}16`);

        // Merge columns for card cells
        sheet1.mergeCells(`${startCol}14:${endCol}14`);
        sheet1.mergeCells(`${startCol}15:${endCol}15`);
        sheet1.mergeCells(`${startCol}16:${endCol}16`);

        titleCell.value = title;
        titleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

        valueCell.value = value;
        valueCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: themeColorHex } };
        valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

        subCell.value = subtext;
        subCell.font = { name: 'Arial', size: 9, color: { argb: 'FF94A3B8' } };
        subCell.alignment = { horizontal: 'center', vertical: 'middle' };
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

        // Apply borders around the card
        const startCharCode = startCol.charCodeAt(0);
        const endCharCode = endCol.charCodeAt(0);
        for (let r = 14; r <= 16; r++) {
          for (let c = startCharCode; c <= endCharCode; c++) {
            const colLetter = String.fromCharCode(c);
            const cell = sheet1.getCell(`${colLetter}${r}`);
            cell.border = {
              top: r === 14 ? { style: 'thin', color: { argb: 'FFE2E8F0' } } : undefined,
              bottom: r === 16 ? { style: 'thin', color: { argb: 'FFE2E8F0' } } : undefined,
              left: colLetter === startCol ? { style: 'thin', color: { argb: 'FFE2E8F0' } } : undefined,
              right: colLetter === endCol ? { style: 'thin', color: { argb: 'FFE2E8F0' } } : undefined,
            };
          }
        }
      };

      // Create cards on row 14 to 16
      addSummaryCard('A', 'C', 'نسبة الجاهزية العامة للواء', `${overallReadiness}%`, 'جاهزية القوة والعتاد للعمليات', 'FF4F46E5');
      addSummaryCard('E', 'G', 'إجمالي القوة البشرية المسجلة', `${grandTotal} فرد`, 'إجمالي القوة الفعالة بكافة السرايا', 'FF0F172A');
      addSummaryCard('I', 'I', 'المتخلفين عن العودة', `${grandOverdue} فرد`, 'تأخروا عن الإجازات', 'FFDC2626');

      // Adjust column widths for Sheet 1
      sheet1.columns.forEach((col, index) => {
        if (index === 0) col.width = 24; // Unit Name
        else if (index === 8) col.width = 18; // Readiness
        else col.width = 15;
      });


      // ----- SHEET 2: كشوفات الإجازات والعودة التفصيلية -----
      const sheet2 = workbook.addWorksheet('كشوفات الإجازات والعودة اليومية', {
        views: [{ rightToLeft: true }]
      });
      sheet2.views[0].showGridLines = true;

      // Title Block
      sheet2.mergeCells('A1:G1');
      const titleCell2 = sheet2.getCell('A1');
      titleCell2.value = `الكشوفات التفصيلية لحركة الإجازات والعودة - لليوم الموافق: ${getReadableArabicDate(reportDate)}`;
      titleCell2.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet2.getRow(1).height = 40;

      let currentRow = 3;

      // 1. Table: الإجازات المواصلة اليومية (dailyReturns)
      sheet2.mergeCells(`A${currentRow}:G${currentRow}`);
      const list1Header = sheet2.getCell(`A${currentRow}`);
      list1Header.value = `أولاً: الإجازات المواصلة والعودة المسجلة اليوم (${filteredDailyReturns.length} فرد)`;
      list1Header.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF059669' } };
      list1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
      list1Header.alignment = { horizontal: 'right', vertical: 'middle' };
      sheet2.getRow(currentRow).height = 26;
      currentRow++;

      const listHeaders = ['الرقم العسكري', 'الرتبة', 'الاسم الكامل', 'الوحدة / السرية', 'تاريخ البدء', 'تاريخ العودة المقرر', 'تاريخ العودة الفعلي'];
      const subHeaderRow1 = sheet2.addRow(listHeaders);
      subHeaderRow1.height = 25;
      subHeaderRow1.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      currentRow++;

      if (filteredDailyReturns.length === 0) {
        const emptyRow = sheet2.addRow(['لا توجد عودات مسجلة لهذا اليوم تطابق الفلاتر المحددة']);
        sheet2.mergeCells(`A${currentRow}:G${currentRow}`);
        emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        emptyRow.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
        currentRow++;
      } else {
        filteredDailyReturns.forEach((item) => {
          const r = sheet2.addRow([
            item.person?.militaryNumber || '-',
            item.person?.rank || '-',
            item.person?.fullName || '-',
            item.person?.unit || '-',
            item.leave.startDate,
            item.leave.endDate,
            item.leave.actualReturnDate || '-'
          ]);
          r.height = 22;
          r.eachCell((cell, colIdx) => {
            cell.font = { name: 'Arial', size: 9 };
            cell.alignment = { horizontal: colIdx === 3 || colIdx === 4 ? 'right' : 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          });
          currentRow++;
        });
      }

      currentRow += 2; // Spacer

      // 2. Table: العائدون المتوقعون اليوم ولم يباشروا (expectedReturns)
      sheet2.mergeCells(`A${currentRow}:G${currentRow}`);
      const list2Header = sheet2.getCell(`A${currentRow}`);
      list2Header.value = `ثانياً: الأفراد المتوقع عودتهم اليوم ولم يسجلوا مباشرة بعد (${filteredExpectedReturns.length} فرد)`;
      list2Header.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFB45309' } };
      list2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
      list2Header.alignment = { horizontal: 'right', vertical: 'middle' };
      sheet2.getRow(currentRow).height = 26;
      currentRow++;

      const subHeaderRow2 = sheet2.addRow(['الرقم العسكري', 'الرتبة', 'الاسم الكامل', 'الوحدة / السرية', 'تاريخ البدء', 'تاريخ العودة المقرر', 'الحالة والمتبقي']);
      subHeaderRow2.height = 25;
      subHeaderRow2.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      currentRow++;

      if (filteredExpectedReturns.length === 0) {
        const emptyRow = sheet2.addRow(['لا يوجد أفراد متوقع عودتهم اليوم يطابقون الفلاتر المحددة']);
        sheet2.mergeCells(`A${currentRow}:G${currentRow}`);
        emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        emptyRow.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
        currentRow++;
      } else {
        filteredExpectedReturns.forEach((item) => {
          const r = sheet2.addRow([
            item.person?.militaryNumber || '-',
            item.person?.rank || '-',
            item.person?.fullName || '-',
            item.person?.unit || '-',
            item.leave.startDate,
            item.leave.endDate,
            'اليوم (تاريخ العودة)'
          ]);
          r.height = 22;
          r.eachCell((cell, colIdx) => {
            cell.font = { name: 'Arial', size: 9 };
            cell.alignment = { horizontal: colIdx === 3 || colIdx === 4 ? 'right' : 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          });
          currentRow++;
        });
      }

      currentRow += 2; // Spacer

      // 3. Table: المتخلفين عن العودة (overduePersonnel)
      sheet2.mergeCells(`A${currentRow}:G${currentRow}`);
      const list3Header = sheet2.getCell(`A${currentRow}`);
      list3Header.value = `ثالثاً: كشف المتخلفين عن العودة من الإجازات حتى اليوم (${filteredOverduePersonnel.length} فرد)`;
      list3Header.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFB91C1C' } };
      list3Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
      list3Header.alignment = { horizontal: 'right', vertical: 'middle' };
      sheet2.getRow(currentRow).height = 26;
      currentRow++;

      const subHeaderRow3 = sheet2.addRow(['الرقم العسكري', 'الرتبة', 'الاسم الكامل', 'الوحدة / السرية', 'تاريخ البدء', 'تاريخ العودة المفترض', 'مدة التأخر والتخلف']);
      subHeaderRow3.height = 25;
      subHeaderRow3.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      currentRow++;

      if (filteredOverduePersonnel.length === 0) {
        const emptyRow = sheet2.addRow(['لا يوجد متخلفين عن العودة يطابقون الفلاتر المحددة']);
        sheet2.mergeCells(`A${currentRow}:G${currentRow}`);
        emptyRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        emptyRow.getCell(1).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
        currentRow++;
      } else {
        filteredOverduePersonnel.forEach((item) => {
          const daysOverdue = getDaysOverdueCount(item.leave.endDate);
          const r = sheet2.addRow([
            item.person?.militaryNumber || '-',
            item.person?.rank || '-',
            item.person?.fullName || '-',
            item.person?.unit || '-',
            item.leave.startDate,
            item.leave.endDate,
            `${daysOverdue} يوم`
          ]);
          r.height = 22;
          r.eachCell((cell, colIdx) => {
            cell.font = { name: 'Arial', size: 9, bold: colIdx === 7, color: colIdx === 7 ? { argb: 'FFDC2626' } : undefined };
            cell.alignment = { horizontal: colIdx === 3 || colIdx === 4 ? 'right' : 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
          });
          currentRow++;
        });
      }

      // Adjust column widths for Sheet 2
      sheet2.columns.forEach((col, index) => {
        if (index === 0) col.width = 16; // Military ID
        else if (index === 1) col.width = 12; // Rank
        else if (index === 2) col.width = 28; // Name
        else if (index === 3) col.width = 18; // Unit
        else if (index === 4) col.width = 14; // Start
        else if (index === 5) col.width = 14; // End
        else col.width = 18; // Extra/Days
      });

      // Generate buffer and trigger download in browser
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `تقرير_الموقف_اليومي_اللواء_43_${reportDate}.xlsx`;
      link.click();

    } catch (error) {
      console.error('Failed to generate Excel:', error);
      alert('فشل تصدير ملف Excel. الرجاء المحاولة مرة أخرى.');
    } finally {
      setDownloadingExcel(false);
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
    <div className="space-y-6 pb-20 print:pb-0" style={{ direction: 'rtl' }}>
      
      {/* ----------------- Top Actions & Settings (Hidden on print) ----------------- */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm no-print flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">تقرير الموقف والجاهزية اليومي</h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">
            استعرض تقرير الجاهزية الشامل، المتخلفين عن العودة، والإجازات الواصلة لليوم المحدد.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Report Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-850">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-extrabold text-slate-400">تاريخ التقرير:</span>
            <input 
              type="date" 
              value={reportDate} 
              onChange={(e) => setReportDate(e.target.value)} 
              className="text-xs font-black font-mono bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer text-right"
            />
          </div>

          {/* Download PDF button */}
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer ${
              downloadingPdf 
                ? 'bg-amber-500/80 cursor-wait animate-pulse' 
                : 'bg-amber-600 hover:bg-amber-550 shadow-amber-600/10'
            }`}
          >
            {downloadingPdf ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                <span>جاري التنزيل...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>تنزيل التقرير PDF</span>
              </>
            )}
          </button>

          {/* Download Excel button */}
          <button
            onClick={handleDownloadExcel}
            disabled={downloadingExcel}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer ${
              downloadingExcel 
                ? 'bg-emerald-500/80 cursor-wait animate-pulse' 
                : 'bg-emerald-600 hover:bg-emerald-550 shadow-emerald-600/10'
            }`}
          >
            {downloadingExcel ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                <span>جاري التصدير...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>تنزيل التقرير Excel</span>
              </>
            )}
          </button>

          {/* Print button */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-black shadow-md shadow-indigo-600/10 cursor-pointer active:scale-95 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير (أو حفظ PDF)</span>
          </button>
        </div>
      </div>

      {/* ----------------- Filtering controls bar (Hidden on print) ----------------- */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm no-print flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث بالاسم أو الرقم العسكري داخل الجداول..."
            className="w-full text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 pr-8 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-3.5" />
        </div>

        {/* Company filter */}
        <div className="relative min-w-[180px]">
          <select
            value={selectedUnitFilter}
            onChange={(e) => setSelectedUnitFilter(e.target.value)}
            className="w-full text-xs font-black bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 p-2.5 pr-3 pl-8 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none text-right cursor-pointer"
          >
            <option value="all">كل السرايا والوحدات</option>
            {units.map((u, idx) => (
              <option key={idx} value={u}>{u}</option>
            ))}
          </select>
          <Filter className="w-4 h-4 text-slate-400 absolute left-2.5 top-3.5 pointer-events-none" />
        </div>
      </div>

      {/* ----------------------------------------------------------------------------- */}
      {/*                             PRINTABLE REPORT LAYOUT                           */}
      {/* ----------------------------------------------------------------------------- */}
      <div id="daily-report-pdf-content" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl p-6 md:p-8 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0">
        
        {/* Official Military Header */}
        <div className="flex justify-between items-start pb-6 border-b-2 border-slate-900 dark:border-slate-100 font-sans">
          <div className="text-right space-y-1">
            <h1 className="text-base font-black text-slate-900 dark:text-slate-100">الجمهورية اليمنية</h1>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">وزارة الدفاع ورئاسة هيئة الأركان</p>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">ألوية العمالقة الجنوبية - اللواء 43</p>
            <p className="text-xs font-extrabold text-amber-600 dark:text-amber-500 font-sans">شعبة القوة البشرية والسيطرة</p>
          </div>
          
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center font-black text-xs text-slate-800 dark:text-slate-200 shadow-sm font-sans mb-1">
              شعــار
              <br />
              اللواء
            </div>
            <span className="text-[9px] text-slate-400 font-mono">المنظومة الرقمية للواء 43</span>
          </div>

          <div className="text-left space-y-1">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">التاريخ: <span className="font-mono font-black">{reportDate}</span></p>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">اليوم: <span className="font-extrabold">{getReadableArabicDate(reportDate).split('،')[0]}</span></p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">صُدّر بواسطة: <span className="font-mono">{currentUser.username}</span></p>
          </div>
        </div>

        {/* Big Report Title */}
        <div className="text-center py-2 bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 rounded-xl">
          <h2 className="text-sm md:text-base font-black tracking-widest font-sans">
            تقرير الموقف اليومي للقوة والجاهزية والرقابة على الإجازات
          </h2>
          <p className="text-[10px] font-mono font-bold tracking-wider mt-0.5 opacity-90">
            {getReadableArabicDate(reportDate)}
          </p>
        </div>

        {/* Quick Stats Grid (Aesthetic Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center">
            <Users className="w-5 h-5 text-indigo-500 mb-1" />
            <span className="text-[10px] font-extrabold text-slate-400">إجمالي قوة اللواء</span>
            <span className="text-base font-black font-mono text-slate-800 dark:text-slate-100">{grandTotal}</span>
          </div>
          
          <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 flex flex-col items-center text-center">
            <TrendingUp className="w-5 h-5 text-emerald-500 mb-1" />
            <span className="text-[10px] font-extrabold text-slate-400">القوة الموجودة (الفعلي)</span>
            <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">{grandPresent}</span>
          </div>

          <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex flex-col items-center text-center">
            <Calendar className="w-5 h-5 text-blue-500 mb-1" />
            <span className="text-[10px] font-extrabold text-slate-400">أفراد في إجازة جارية</span>
            <span className="text-base font-black font-mono text-blue-600 dark:text-blue-400">{grandLeave}</span>
          </div>

          <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10 flex flex-col items-center text-center">
            <UserX className="w-5 h-5 text-rose-500 mb-1" />
            <span className="text-[10px] font-extrabold text-slate-400">إجمالي الغياب اليومي</span>
            <span className="text-base font-black font-mono text-rose-600 dark:text-rose-400">{grandAbsent}</span>
          </div>

          <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex flex-col items-center text-center col-span-2 md:col-span-1">
            <AlertTriangle className="w-5 h-5 text-amber-500 mb-1" />
            <span className="text-[10px] font-extrabold text-slate-400">المتخلفين عن العودة</span>
            <span className="text-base font-black font-mono text-amber-600 dark:text-amber-400">{grandOverdue}</span>
          </div>
        </div>

        {/* ----------------------------------------------------------------------------- */}
        {/*           SECTION 1: DAILY FORCE AND READINESS (قسم القوة والجاهزية اليومية)           */}
        {/* ----------------------------------------------------------------------------- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-r-4 border-emerald-500 pr-3">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              أولاً: موقف السرايا والجاهزية القتالية والعملياتية لليوم
            </h3>
          </div>

          {/* Force and Readiness Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                  <th className="p-3 font-black">الوحدة / السرية</th>
                  <th className="p-3 text-center font-black">إجمالي القوة البشرية</th>
                  <th className="p-3 text-center font-black text-emerald-600 dark:text-emerald-400">الموجود الفعلي</th>
                  <th className="p-3 text-center font-black text-blue-600 dark:text-blue-400">المجازين</th>
                  <th className="p-3 text-center font-black text-rose-600 dark:text-rose-400">الغياب</th>
                  <th className="p-3 text-center font-black text-purple-600 dark:text-purple-400">المرضى والمأذونين</th>
                  <th className="p-3 text-center font-black text-amber-600 dark:text-amber-400">المتخلفين عن الإجازات</th>
                  <th className="p-3 text-center font-black">نسبة الجاهزية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-bold">
                {unitStats.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                    <td className="p-3 font-black text-slate-850 dark:text-slate-150">{item.name}</td>
                    <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-300">{item.total}</td>
                    <td className="p-3 text-center font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">{item.present}</td>
                    <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400">{item.leave}</td>
                    <td className="p-3 text-center font-mono text-rose-600 dark:text-rose-400">{item.absent}</td>
                    <td className="p-3 text-center font-mono text-purple-600 dark:text-purple-400">{item.sick + item.permit}</td>
                    <td className="p-3 text-center font-mono text-amber-600 dark:text-amber-400 bg-amber-500/5">{item.overdueCount}</td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-mono font-black ${
                        item.ready >= 85 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                          : item.ready >= 70 
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}>
                        {item.ready}%
                      </span>
                    </td>
                  </tr>
                ))}
                
                {/* Grand Total Row */}
                <tr className="bg-slate-950 dark:bg-slate-950 text-white dark:text-slate-100 font-black border-t-2 border-slate-900">
                  <td className="p-3 text-slate-100">إجمالي الـلـواء</td>
                  <td className="p-3 text-center font-mono">{grandTotal}</td>
                  <td className="p-3 text-center font-mono text-emerald-400">{grandPresent}</td>
                  <td className="p-3 text-center font-mono text-blue-400">{grandLeave}</td>
                  <td className="p-3 text-center font-mono text-rose-400">{grandAbsent}</td>
                  <td className="p-3 text-center font-mono text-purple-400">{grandSick + grandPermit}</td>
                  <td className="p-3 text-center font-mono text-amber-400">{grandOverdue}</td>
                  <td className="p-3 text-center bg-indigo-900/60 text-white font-mono rounded-b-xl">
                    {overallReadiness}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ----------------------------------------------------------------------------- */}
        {/*                  SECTION 2: DAILY RETURNS (قسم الإجازات المواصلة اليومية)                 */}
        {/* ----------------------------------------------------------------------------- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-r-4 border-indigo-500 pr-3">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              ثانياً: كشف الإجازات المواصلة اليومية ومباشرة العمل الفعلية ({reportDate})
            </h3>
          </div>

          {filteredDailyReturns.length === 0 ? (
            <div className="p-5 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-400 font-bold text-[11px]">
              لا توجد إجازات مواصلة أو عودة فعلية مسجلة لليوم المحدد {reportDate}.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                    <th className="p-3">الرتبة والاسم الكامل</th>
                    <th className="p-3 text-center font-mono">الرقم العسكري</th>
                    <th className="p-3 text-center">الوحدة / السرية</th>
                    <th className="p-3 text-center">نوع الإجازة</th>
                    <th className="p-3 text-center">فترة الإجازة</th>
                    <th className="p-3 text-center font-black">تاريخ العودة المسجل</th>
                    <th className="p-3 text-center">الحالة والانضباط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-bold">
                  {filteredDailyReturns.map(({ leave, person }, idx) => {
                    const isLate = new Date(leave.actualReturnDate!) > new Date(leave.endDate);
                    const isEarly = new Date(leave.actualReturnDate!) < new Date(leave.endDate);
                    
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                        <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200">{person.rank} / {person.fullName}</td>
                        <td className="p-3 text-center font-mono text-slate-500">{person.militaryNumber}</td>
                        <td className="p-3 text-center text-slate-600 dark:text-slate-300">{person.unit}</td>
                        <td className="p-3 text-center text-slate-600 dark:text-slate-300">{leave.leaveType === 'استحقاقه' ? 'سنوية' : leave.leaveType}</td>
                        <td className="p-3 text-center font-mono text-[10px] text-slate-500">
                          {leave.startDate} إلى {leave.endDate}
                        </td>
                        <td className="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                          {leave.actualReturnDate}
                        </td>
                        <td className="p-3 text-center">
                          {isLate ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[9px] bg-rose-500/10 text-rose-600 font-extrabold">عودة متأخرة</span>
                          ) : isEarly ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-600 font-extrabold">عودة مبكرة</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-600 font-extrabold">منضبط في الموعد</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-section: Expected returns but not returned yet */}
          {filteredExpectedReturns.length > 0 && (
            <div className="mt-4 space-y-3">
              <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 flex items-center gap-1.5 pr-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>مجندون مقرر عودتهم ومواصلتهم العمل اليوم ولم يسجل عودتهم الفعلية بعد:</span>
              </h4>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                      <th className="p-2.5">الرتبة والاسم الكامل</th>
                      <th className="p-2.5 text-center font-mono">الرقم العسكري</th>
                      <th className="p-2.5 text-center">الوحدة / السرية</th>
                      <th className="p-2.5 text-center font-black">موعد العودة المقرر</th>
                      <th className="p-2.5 text-center">ملاحظات شعبة القوة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
                    {filteredExpectedReturns.map(({ leave, person }, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/10">
                        <td className="p-2.5 font-bold">{person.rank} / {person.fullName}</td>
                        <td className="p-2.5 text-center font-mono text-slate-500">{person.militaryNumber}</td>
                        <td className="p-2.5 text-center">{person.unit}</td>
                        <td className="p-2.5 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">{leave.endDate}</td>
                        <td className="p-2.5 text-center text-[10px] text-amber-600 dark:text-amber-400">تحت المتابعة وتأكيد العودة</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------------------- */}
        {/*                     SECTION 3: OVERDUE PERSONNEL (المتخلفين عن العودة)                   */}
        {/* ----------------------------------------------------------------------------- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-r-4 border-rose-500 pr-3">
            <UserX className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              ثالثاً: كشف الأفراد المتخلفين عن العودة من الإجازات ومباشرة الواجب
            </h3>
          </div>

          {filteredOverduePersonnel.length === 0 ? (
            <div className="p-5 border border-dashed border-emerald-200 dark:border-emerald-900 rounded-xl text-center text-emerald-600 dark:text-emerald-400 font-bold text-[11px] bg-emerald-500/5">
              كل التوفيق والانضباط! لا يوجد أي فرد متخلف عن العودة من الإجازة لليوم المحدد {reportDate}.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                    <th className="p-3">الرتبة والاسم الكامل</th>
                    <th className="p-3 text-center font-mono">الرقم العسكري</th>
                    <th className="p-3 text-center">الوحدة / السرية</th>
                    <th className="p-3 text-center">نوع الإجازة المنتهية</th>
                    <th className="p-3 text-center font-black">موعد العودة المفترض</th>
                    <th className="p-3 text-center text-rose-600 dark:text-rose-400 font-black">مدة التخلف والغياب</th>
                    <th className="p-3 text-center">التصنيف والاتخاذ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-bold">
                  {filteredOverduePersonnel.map(({ leave, person }, idx) => {
                    const daysOverdue = getDaysOverdueCount(leave.endDate);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
                        <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200">{person.rank} / {person.fullName}</td>
                        <td className="p-3 text-center font-mono text-slate-500">{person.militaryNumber}</td>
                        <td className="p-3 text-center text-slate-600 dark:text-slate-300">{person.unit}</td>
                        <td className="p-3 text-center text-slate-600 dark:text-slate-300">{leave.leaveType === 'استحقاقه' ? 'سنوية' : leave.leaveType}</td>
                        <td className="p-3 text-center font-mono font-black text-rose-600 dark:text-rose-400 bg-rose-500/5">
                          {leave.endDate}
                        </td>
                        <td className="p-3 text-center font-black text-rose-700 dark:text-rose-400 bg-rose-500/10 text-[13px] font-mono">
                          {daysOverdue} يــوم
                        </td>
                        <td className="p-3 text-center">
                          {daysOverdue > 5 ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[9px] bg-red-600 text-white font-extrabold animate-pulse">تخلف مفرط (اتخاذ إجراء)</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-600 font-extrabold">تخلف جاري تحت الرقابة</span>
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

        {/* Official Military Signatures Block */}
        <div className="grid grid-cols-3 gap-8 pt-10 border-t border-slate-200 dark:border-slate-800 text-center text-xs font-sans">
          <div className="space-y-8">
            <p className="font-extrabold text-slate-400">مدخل ومحضر البيانات</p>
            <div className="space-y-1">
              <p className="font-black text-slate-800 dark:text-slate-200">الاسم: .......................................</p>
              <p className="font-bold text-slate-500 text-[10px]">مساعد / شعبة القوة البشرية</p>
            </div>
          </div>

          <div className="space-y-8">
            <p className="font-extrabold text-slate-400">رئيس شعبة القوة البشرية والسيطرة</p>
            <div className="space-y-1">
              <p className="font-black text-slate-800 dark:text-slate-200">العقيد / .....................................</p>
              <p className="font-bold text-slate-500 text-[10px]">شعبة السيطرة البشرية - اللواء 43</p>
            </div>
          </div>

          <div className="space-y-8">
            <p className="font-extrabold text-slate-400">قائد اللواء 43 عمالقة جنوبية</p>
            <div className="space-y-1">
              <p className="font-black text-slate-800 dark:text-slate-200">العميد / .....................................</p>
              <p className="font-bold text-slate-500 text-[10px]">المصادقة والاعتماد الميداني</p>
            </div>
          </div>
        </div>

        {/* System stamp footnote */}
        <div className="pt-6 border-t border-dashed border-slate-150 dark:border-slate-800 text-center text-[10px] text-slate-400 font-semibold font-sans flex justify-between items-center">
          <p>تم توليد هذه الوثيقة وتفقيطها آلياً عبر المنظومة الرقمية لشعبة القوة البشرية.</p>
          <p className="font-mono">ID: {new Date(reportDate).getTime()}-43AM</p>
        </div>

      </div>

    </div>
  );
}
