'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText } from 'lucide-react';
import { MOM } from '@/store/slices/momSlice';

interface Props {
  mom: MOM;
  meetingTitle?: string;
}

export default function ExportButton({ mom, meetingTitle = 'Meeting' }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  // Hidden div used by html2canvas for PDF rendering
  const hiddenRef = useRef<HTMLDivElement>(null);

  const keyPoints = mom.keyPoints ?? [];
  const tasks     = mom.tasks    ?? [];

  // ── PDF export ───────────────────────────────────────────────────────────────
  async function handleExportPDF() {
    setOpen(false);
    setExporting('pdf');
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);

      const el = hiddenRef.current;
      if (!el) return;
      el.style.display = 'block';

      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      el.style.display = 'none';

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // Scale image to page width
      const imgW = pageW - 80;
      const imgH = (canvas.height * imgW) / canvas.width;

      let yPos = 40;
      if (imgH <= pageH - 80) {
        pdf.addImage(imgData, 'PNG', 40, yPos, imgW, imgH);
      } else {
        // Paginate tall content
        let srcY = 0;
        while (srcY < canvas.height) {
          const sliceH    = Math.min(canvas.height - srcY, ((pageH - 80) * canvas.width) / imgW);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width  = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, -srcY);
          const sliceData = sliceCanvas.toDataURL('image/png');
          const sliceImgH = (sliceH * imgW) / canvas.width;
          pdf.addImage(sliceData, 'PNG', 40, yPos, imgW, sliceImgH);
          srcY += sliceH;
          if (srcY < canvas.height) { pdf.addPage(); yPos = 40; }
        }
      }

      pdf.save(`${meetingTitle.replace(/\s+/g, '_')}_MOM.pdf`);
    } finally {
      setExporting(null);
    }
  }

  // ── DOCX export ──────────────────────────────────────────────────────────────
  async function handleExportDOCX() {
    setOpen(false);
    setExporting('docx');
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } =
        await import('docx');

      const summaryParagraphs = mom.summary
        .split('\n')
        .map((line) => new Paragraph({ text: line, spacing: { after: 80 } }));

      const keyPointItems = keyPoints.map(
        (kp) =>
          new Paragraph({
            text: kp.point_text,
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
      );

      // Tasks table
      const taskRows = [
        new TableRow({
          children: ['Title', 'Assigned To', 'Deadline', 'Priority', 'Status'].map(
            (h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
              })
          ),
        }),
        ...tasks.map(
          (task) =>
            new TableRow({
              children: [
                task.title ?? '',
                task.assigned_to ?? 'Unassigned',
                task.deadline ?? '',
                task.priority ?? '',
                task.status ?? '',
              ].map((val) => new TableCell({ children: [new Paragraph({ text: String(val) })] })),
            })
        ),
      ];

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: meetingTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
              new Paragraph({ text: '' }),
              new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }),
              ...summaryParagraphs,
              new Paragraph({ text: '' }),
              ...(keyPoints.length > 0
                ? [
                    new Paragraph({ text: 'Key Points', heading: HeadingLevel.HEADING_1 }),
                    ...keyPointItems,
                    new Paragraph({ text: '' }),
                  ]
                : []),
              ...(tasks.length > 0
                ? [
                    new Paragraph({ text: 'Tasks', heading: HeadingLevel.HEADING_1 }),
                    new Table({ rows: taskRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
                  ]
                : []),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${meetingTitle.replace(/\s+/g, '_')}_MOM.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      {/* Hidden print div for PDF */}
      <div
        ref={hiddenRef}
        style={{ display: 'none', position: 'absolute', left: '-9999px', top: 0, width: 700, background: '#fff', color: '#000', fontFamily: 'sans-serif', padding: '32px' }}
        aria-hidden
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{meetingTitle}</h1>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Summary</h2>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>{mom.summary}</p>
        {keyPoints.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Key Points</h2>
            <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
              {keyPoints.map((kp) => (
                <li key={kp.id} style={{ fontSize: 13, marginBottom: 4 }}>{kp.point_text}</li>
              ))}
            </ul>
          </>
        )}
        {tasks.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Tasks</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Title', 'Assigned To', 'Deadline', 'Priority', 'Status'].map((h) => (
                    <th key={h} style={{ border: '1px solid #ccc', padding: '4px 8px', background: '#f5f5f5', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => (
                  <tr key={i}>
                    <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>{task.title}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>{task.assigned_to ?? 'Unassigned'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>{task.deadline ?? ''}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>{task.priority}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>{task.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Dropdown button */}
      <div className="relative inline-block">
        <button
          className="btn-secondary flex items-center gap-2 text-sm"
          onClick={() => setOpen((v) => !v)}
          disabled={exporting !== null}
        >
          <FileText className="w-4 h-4" />
          {exporting
            ? (exporting === 'pdf'
                ? t('btn.export_pdf', { defaultValue: 'Exporting PDF…' })
                : t('btn.export_docx', { defaultValue: 'Exporting DOCX…' }))
            : t('btn.export', { defaultValue: 'Export' })}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {open && (
          <>
            {/* Click-away */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 mt-1.5 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-lg py-1.5 w-44 overflow-hidden">
              <button
                className="w-full text-left px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                onClick={handleExportPDF}
              >
                {t('btn.export_pdf', { defaultValue: 'Export PDF' })}
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
                onClick={handleExportDOCX}
              >
                {t('btn.export_docx', { defaultValue: 'Export DOCX' })}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
