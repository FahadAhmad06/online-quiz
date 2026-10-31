// pdfReport.js — Professional PDF generation for QuizRoom.
// Uses pdfkit (Node.js native, no browser needed). All data must be pre-fetched and
// sanitized before calling these functions — this module only draws, never queries.
//
// Palette (QuizRoom dark-navy + purple brand):
//   NAVY   #0f172a   page background / dark headers
//   PURPLE #7c3aed   accent / brand color
//   INDIGO #4f46e5   secondary accent
//   INK    #1e293b   body text (dark)
//   MUTED  #64748b   secondary text
//   RULE   #e2e8f0   table rules / separators
//   WHITE  #ffffff   on-dark text
//   GREEN  #16a34a   pass / correct
//   RED    #dc2626   fail / incorrect
//   AMBER  #d97706   pending / warning

import PDFDocument from 'pdfkit';
import { pct, grade } from './scoreGrade.js';

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  navy: '#0f172a', purple: '#7c3aed', indigo: '#4f46e5',
  ink: '#1e293b', muted: '#64748b', rule: '#e2e8f0',
  white: '#ffffff', green: '#16a34a', red: '#dc2626',
  amber: '#d97706', bg: '#f8fafc', card: '#ffffff',
  purpleLight: '#ede9fe', greenLight: '#dcfce7', redLight: '#fee2e2', amberLight: '#fef3c7'
};

// ── Shared layout constants ────────────────────────────────────────────────────
const MARGIN = 48;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  oblique: 'Helvetica-Oblique'
};

// ── Low-level helpers ──────────────────────────────────────────────────────────

function newDoc() {
  return new PDFDocument({
    size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Creator: 'QuizRoom', Producer: 'QuizRoom PDF Engine' }, bufferPages: true
  });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// Compact form for narrow table cells - fmtDate's long month name doesn't fit a ~45-70pt column
// without truncating away the year, which is worse than a shorter but complete date.
function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
// Clamped so a very narrow column (a miscalculated width, or one squeezed by long sibling columns)
// still shortens proportionally instead of printing almost the full string into no room at all.
function truncate(str, max = 45) {
  const m = Math.max(1, max);
  return str && str.length > m ? str.slice(0, Math.max(1, m - 1)) + '…' : (str || '—');
}

// ── Drawing primitives ─────────────────────────────────────────────────────────

/** Full-width horizontal rule */
function rule(doc, y, color = C.rule) {
  doc.save().strokeColor(color).lineWidth(0.5).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().restore();
}

/** Filled rectangle */
function rect(doc, x, y, w, h, fill, radius = 0) {
  doc.save().roundedRect(x, y, w, h, radius).fillColor(fill).fill().restore();
}

/** Brand header: navy bar with logo text + report title */
function drawPageHeader(doc, title, subtitle) {
  const barH = 80;
  rect(doc, 0, 0, PAGE_W, barH, C.navy);

  doc.save()
    .font(FONT.bold).fontSize(22).fillColor(C.white)
    .text('QuizRoom', MARGIN, 24, { continued: true })
    .font(FONT.regular).fontSize(10).fillColor(C.purple)
    .text('  •  Learn · Test · Grow', { baseline: 'middle' })
    .restore();

  // Centered within [MARGIN, PAGE_W - MARGIN] - the same printable area every other section uses -
  // not [0, PAGE_W]: the center point is identical either way, but a long title/subtitle now wraps
  // within the margins instead of running out almost to the physical page edges. (An earlier version
  // centered this box at x = PAGE_W/2 with width = PAGE_W, which put the box's own center on the
  // page's right edge and clipped roughly the right half of every title/subtitle off the page.)
  const titleY = 38;
  doc.save()
    .font(FONT.bold).fontSize(13).fillColor(C.white)
    .text(title, MARGIN, titleY, { align: 'center', width: CONTENT_W })
    .font(FONT.regular).fontSize(9).fillColor('#94a3b8')
    .text(subtitle || '', MARGIN, titleY + 17, { align: 'center', width: CONTENT_W })
    .restore();

  return barH + 16;
}

/** Coloured section heading with left accent bar. Width-aware and height-aware: most labels here
 * are short static strings, but some (e.g. "Teacher: " + a name) are dynamic and can be long - with
 * no width this used to just run off the right edge of the page instead of wrapping. */
function sectionHeading(doc, label, y) {
  const w = CONTENT_W - 10;
  const text = String(label);
  doc.font(FONT.bold).fontSize(11);
  const h = doc.heightOfString(text, { width: w });
  rect(doc, MARGIN, y, 4, Math.max(18, h + 4), C.purple, 2);
  doc.save().font(FONT.bold).fontSize(11).fillColor(C.ink)
    .text(text, MARGIN + 10, y + 2, { width: w }).restore();
  return y + Math.max(26, h + 12);
}

// Fixed left column for infoRow's label, so a wrapped multi-line value (right-aligned within its
// own column, starting after this point) can never visually collide with the label - every label
// used across these reports is well under this width at 9pt.
const LABEL_W = 150;

/** Info row: label in a fixed-width left column, value right-aligned in the rest, light rule
 * underneath. Height-aware: a long value (an email, a filter summary, a quiz title) wraps within
 * its column instead of being clipped to one line, and the rule + next row are pushed down by
 * however many lines it actually took - otherwise a wrapped second line would print straight
 * through the rule and the row below it. */
function infoRow(doc, label, value, y, valueColor) {
  const text = String(value ?? '—');
  const valueX = MARGIN + LABEL_W, valueW = CONTENT_W - LABEL_W;
  doc.font(FONT.bold).fontSize(9);
  const h = doc.heightOfString(text, { width: valueW, align: 'right' });
  doc.save().font(FONT.regular).fontSize(9).fillColor(C.muted).text(label, MARGIN, y, { width: LABEL_W - 8 }).restore();
  doc.save().font(FONT.bold).fontSize(9).fillColor(valueColor || C.ink)
    .text(text, valueX, y, { align: 'right', width: valueW }).restore();
  const rowH = Math.max(14, h + 2);
  rule(doc, y + rowH, C.rule);
  return y + rowH + 4;
}

/** Mini stat chip: coloured pill with label+value */
function statChip(doc, label, value, x, y, w, bg, fg) {
  rect(doc, x, y, w, 46, bg, 8);
  doc.save()
    .font(FONT.regular).fontSize(8).fillColor(C.muted)
    .text(label, x + 8, y + 8, { width: w - 16 })
    .font(FONT.bold).fontSize(18).fillColor(fg || C.ink)
    .text(String(value ?? '—'), x + 8, y + 18, { width: w - 16 })
    .restore();
}

/** Page footer with page number */
function drawFooters(doc) {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const y = PAGE_H - MARGIN + 14;
    rule(doc, y - 8, C.rule);
    doc.save()
      .font(FONT.regular).fontSize(8).fillColor(C.muted)
      .text('Generated by QuizRoom  ·  ' + fmtDateTime(new Date()), MARGIN, y, { continued: true, width: CONTENT_W - 60 })
      .text('Page ' + (i - pages.start + 1) + ' of ' + pages.count, MARGIN, y, { align: 'right', width: CONTENT_W })
      .restore();
  }
}

/** Ensure Y has enough space; add new page if not */
function ensureSpace(doc, y, need) {
  if (y + need > PAGE_H - MARGIN - 30) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

// ── Table renderer ─────────────────────────────────────────────────────────────
// cols: [{ label, width, align? }]
function tableHeader(doc, cols, y) {
  rect(doc, MARGIN, y, CONTENT_W, 20, C.navy, 0);
  let x = MARGIN + 8;
  for (const c of cols) {
    doc.save().font(FONT.bold).fontSize(8).fillColor(C.white)
      .text(c.label, x, y + 6, { width: c.width - 8, align: c.align || 'left' }).restore();
    x += c.width;
  }
  return y + 20;
}

function tableRow(doc, cols, values, y, shade) {
  if (shade) rect(doc, MARGIN, y, CONTENT_W, 18, '#f8fafc');
  let x = MARGIN + 8;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i], v = values[i];
    const color = (typeof v === 'object' && v?.color) ? v.color : C.ink;
    const text = (typeof v === 'object' && v?.text != null) ? String(v.text) : String(v ?? '—');
    doc.save().font(FONT.regular).fontSize(8).fillColor(color)
      .text(truncate(text, Math.floor(c.width / 5.5)), x, y + 5, { width: c.width - 8, align: c.align || 'left' }).restore();
    x += c.width;
  }
  rule(doc, y + 18, C.rule);
  return y + 18;
}

function table(doc, cols, rows, startY) {
  let y = tableHeader(doc, cols, startY);
  rows.forEach((row, idx) => {
    y = ensureSpace(doc, y, 20);
    if (y === MARGIN) {
      // Repeat header after page break
      y = tableHeader(doc, cols, y);
    }
    y = tableRow(doc, cols, row, y, idx % 2 === 0);
  });
  return y;
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function progressBar(doc, value, max, x, y, w, fg = C.purple) {
  const trackH = 6;
  rect(doc, x, y, w, trackH, C.rule, 3);
  const fill = max > 0 ? Math.min(1, value / max) * w : 0;
  if (fill > 0) rect(doc, x, y, fill, trackH, fg, 3);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * buildStudentSingleReport — one student's single quiz result.
 * data: { result, attempt, paper, student }
 * Returns a Buffer containing the PDF bytes.
 */
export async function buildStudentSingleReport({ result, attempt, paper }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Cover header ──────────────────────────────────────────────────────────
    let y = drawPageHeader(doc, 'Quiz Result Report', 'Individual student performance record');

    // ── Student & quiz info block ─────────────────────────────────────────────
    y = sectionHeading(doc, 'Student & Exam Details', y + 8);
    y = infoRow(doc, 'Student Name', result.name, y);
    y = infoRow(doc, 'Roll Number', result.roll, y);
    y = infoRow(doc, 'Quiz Title', result.paperTitle, y);
    y = infoRow(doc, 'Paper Code', result.paperCode, y);
    y = infoRow(doc, 'Exam Date', fmtDate(result.createdAt), y);
    y = infoRow(doc, 'Report Date', fmtDateTime(new Date()), y);

    const p = pct(result.correct, result.total);
    y += 8;

    // ── Stats chips (Score/Percentage/Grade/Rank) - no separate score badge: a badge positioned
    // by a fixed offset above this point previously overlapped the info rows whenever a long
    // quiz title wrapped to two lines, hiding the Roll Number / Quiz Title values behind it. ──
    y = sectionHeading(doc, 'Performance Summary', y);
    const chipW = (CONTENT_W - 12) / 4;
    statChip(doc, 'Score', result.correct + ' / ' + result.total, MARGIN, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Percentage', p + '%', MARGIN + chipW, y, chipW - 4, p >= 50 ? C.greenLight : C.redLight, p >= 50 ? C.green : C.red);
    statChip(doc, 'Grade', grade(p).label, MARGIN + chipW * 2, y, chipW - 4, C.purpleLight, grade(p).color);
    statChip(doc, 'Rank', result.rank ? '#' + result.rank : '—', MARGIN + chipW * 3, y, chipW - 4, C.purpleLight, C.indigo);
    y += 58;

    // ── MCQ breakdown ─────────────────────────────────────────────────────────
    if (attempt) {
      const mcqQs = attempt.run.filter(q => q.type === 'mcq');
      const subjQs = attempt.run.filter(q => q.type === 'subjective');
      const answers = attempt.answers || [];
      const mcqCorrect = mcqQs.filter((q, i) => answers[attempt.run.indexOf(q)] === q.correct).length;
      const mcqIncorrect = mcqQs.filter((q, i) => {
        const ans = answers[attempt.run.indexOf(q)];
        return ans !== undefined && ans !== -1 && ans !== q.correct;
      }).length;
      const mcqUnanswered = mcqQs.length - mcqCorrect - mcqIncorrect;

      if (mcqQs.length > 0) {
        y = sectionHeading(doc, 'MCQ Breakdown', y + 4);
        y = infoRow(doc, 'Total MCQ Questions', mcqQs.length, y);
        y = infoRow(doc, 'Correct', mcqCorrect, y, C.green);
        y = infoRow(doc, 'Incorrect', mcqIncorrect, y, C.red);
        y = infoRow(doc, 'Unanswered / Skipped', mcqUnanswered, y, C.amber);
        y += 4;
        progressBar(doc, mcqCorrect, mcqQs.length, MARGIN, y, CONTENT_W, C.green);
        y += 18;
      }

      if (subjQs.length > 0) {
        y = sectionHeading(doc, 'Subjective / Written Questions', y + 4);
        y = infoRow(doc, 'Total Subjective Questions', subjQs.length, y);

        const evs = attempt.evaluations || [];
        const allApproved = evs.every(e => e.status === 'approved');
        const anyPending = evs.some(e => ['pending', 'evaluating', 'awaiting_review'].includes(e.status));

        y = infoRow(doc, 'Evaluation Status', allApproved ? 'Fully Graded' : anyPending ? 'Pending Review' : 'Partially Graded', y,
          allApproved ? C.green : anyPending ? C.amber : C.indigo);

        // Safe: only show finalMarks (admin-approved), never suggestedMarks to students.
        const approvedEvs = evs.filter(e => e.status === 'approved' && e.finalMarks != null);
        if (approvedEvs.length > 0) {
          const totalApproved = approvedEvs.reduce((s, e) => s + e.finalMarks, 0);
          const maxApproved = approvedEvs.reduce((s, e) => s + (e.maxMarks || 0), 0);
          y = infoRow(doc, 'Approved Subjective Marks', totalApproved + ' / ' + maxApproved, y, C.green);
        }
        if (anyPending) {
          y += 4;
          rect(doc, MARGIN, y, CONTENT_W, 28, C.amberLight, 6);
          doc.save().font(FONT.bold).fontSize(9).fillColor(C.amber)
            // Helvetica (this PDF's font) has no glyph for pictographic emoji - one here rendered as
            // garbled characters instead of an hourglass. Plain text only in PDF output.
            .text('Note: Some answers are still awaiting teacher review. Final marks will appear once approved.', MARGIN + 10, y + 9, { width: CONTENT_W - 20 })
            .restore();
          y += 36;
        }
      }
    }

    // ── Final score bar ───────────────────────────────────────────────────────
    y = ensureSpace(doc, y, 60);
    y = sectionHeading(doc, 'Final Result', y + 4);
    const g = grade(p);
    rect(doc, MARGIN, y, CONTENT_W, 44, g.color === C.green ? C.greenLight : g.color === C.red ? C.redLight : '#e0e7ff', 8);
    doc.save()
      .font(FONT.bold).fontSize(16).fillColor(g.color)
      .text(g.label + '  —  ' + p + '%  (' + result.correct + '/' + result.total + ')', MARGIN + 16, y + 14, { width: CONTENT_W - 32, align: 'center' })
      .restore();
    y += 56;

    drawFooters(doc);
    doc.end();
  });
}

/**
 * buildAdminQuizReport — all results for a single quiz.
 * data: { paper, results: [...], admin }
 */
export async function buildAdminQuizReport({ paper, results, admin, filters = {} }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let y = drawPageHeader(doc, 'Quiz Report', paper.title);

    // Quiz info
    y = sectionHeading(doc, 'Quiz Details', y + 8);
    y = infoRow(doc, 'Quiz Title', paper.title, y);
    y = infoRow(doc, 'Paper Code', paper.code, y);
    y = infoRow(doc, 'Total Questions', paper.questions?.length || 0, y);
    y = infoRow(doc, 'Teacher / Admin', admin || '—', y);
    // Disclose any applied date-range filter - the results table below is already scoped to it
    // server-side, so the reader needs to know this isn't necessarily the quiz's complete history.
    if (filters.from || filters.to) {
      const range = [filters.from ? 'From ' + fmtDate(filters.from) : null, filters.to ? 'to ' + fmtDate(filters.to) : null].filter(Boolean).join(' ');
      y = infoRow(doc, 'Date Range', range, y);
    }
    y = infoRow(doc, 'Generated', fmtDateTime(new Date()), y);

    // Summary stats
    const avg = results.length ? Math.round(results.reduce((s, r) => s + pct(r.correct, r.total), 0) / results.length) : 0;
    const highest = results.length ? Math.max(...results.map(r => pct(r.correct, r.total))) : 0;
    y = sectionHeading(doc, 'Summary Statistics', y + 8);
    const chipW = (CONTENT_W - 8) / 4;
    statChip(doc, 'Total Attempts', results.length, MARGIN, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Average Score', avg + '%', MARGIN + chipW, y, chipW - 4, C.purpleLight, C.indigo);
    statChip(doc, 'Highest Score', highest + '%', MARGIN + chipW * 2, y, chipW - 4, C.greenLight, C.green);
    const passed = results.filter(r => pct(r.correct, r.total) >= 50).length;
    statChip(doc, 'Pass Rate', Math.round(passed / (results.length || 1) * 100) + '%', MARGIN + chipW * 3, y, chipW - 4, C.purpleLight, C.indigo);
    y += 60;

    // Score distribution bar
    y = sectionHeading(doc, 'Score Distribution', y);
    const bands = [
      { label: '0–49%  (Fail)', count: results.filter(r => pct(r.correct, r.total) < 50).length, color: C.red },
      { label: '50–69% (Pass)', count: results.filter(r => { const p = pct(r.correct, r.total); return p >= 50 && p < 70; }).length, color: C.amber },
      { label: '70–84% (Good)', count: results.filter(r => { const p = pct(r.correct, r.total); return p >= 70 && p < 85; }).length, color: C.indigo },
      { label: '85–100% (Excellent)', count: results.filter(r => pct(r.correct, r.total) >= 85).length, color: C.green },
    ];
    for (const b of bands) {
      doc.save().font(FONT.regular).fontSize(8).fillColor(C.muted)
        .text(b.label, MARGIN, y, { width: 130 })
        .font(FONT.bold).fontSize(8).fillColor(C.ink)
        .text(String(b.count), MARGIN + 136, y, { width: 30 })
        .restore();
      progressBar(doc, b.count, results.length || 1, MARGIN + 170, y + 1, CONTENT_W - 170, b.color);
      y += 16;
    }
    y += 8;

    // Results table
    y = ensureSpace(doc, y, 40);
    y = sectionHeading(doc, 'Student Results', y);
    const cols = [
      { label: '#', width: 24 },
      { label: 'Name', width: 130 },
      { label: 'Roll', width: 80 },
      { label: 'Score', width: 60, align: 'center' },
      { label: '%', width: 44, align: 'center' },
      { label: 'Grade', width: 60, align: 'center' },
      { label: 'Date', width: CONTENT_W - 24 - 130 - 80 - 60 - 44 - 60 },
    ];
    const rows = results.map((r, i) => {
      const p = pct(r.correct, r.total);
      const g = grade(p);
      return [
        i + 1,
        truncate(r.name, 22),
        r.roll,
        { text: r.correct + '/' + r.total, color: C.ink },
        { text: p + '%', color: p >= 50 ? C.green : C.red },
        { text: g.label, color: g.color },
        fmtDateShort(r.createdAt)
      ];
    });
    table(doc, cols, rows, y);

    drawFooters(doc);
    doc.end();
  });
}

/**
 * buildAdminStudentReport — all quiz results for one student.
 * data: { student: { name, roll, email }, results: [...], adminName }
 */
export async function buildAdminStudentReport({ student, results, adminName, filters = {} }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    let y = drawPageHeader(doc, 'Student Report', student.name + '  ·  Roll: ' + student.roll);

    y = sectionHeading(doc, 'Student Profile', y + 8);
    y = infoRow(doc, 'Name', student.name, y);
    y = infoRow(doc, 'Roll Number', student.roll, y);
    if (student.email) y = infoRow(doc, 'Email', student.email, y);
    y = infoRow(doc, 'Teacher', adminName || '—', y);
    // Disclose any applied quiz/date filter - the Quiz History table below is already scoped to
    // it server-side (the caller filtered the query), so without this the reader can't tell a
    // filtered report from this student's genuinely complete history.
    const scope = [
      filters.paper ? 'Quiz: ' + filters.paper : null,
      filters.from ? 'From: ' + fmtDate(filters.from) : null,
      filters.to ? 'To: ' + fmtDate(filters.to) : null
    ].filter(Boolean).join('  ·  ');
    if (scope) y = infoRow(doc, 'Scope', scope, y);
    y = infoRow(doc, 'Report Date', fmtDateTime(new Date()), y);

    // Summary
    const avg = results.length ? Math.round(results.reduce((s, r) => s + pct(r.correct, r.total), 0) / results.length) : 0;
    const best = results.length ? Math.max(...results.map(r => pct(r.correct, r.total))) : 0;
    y = sectionHeading(doc, 'Overall Performance', y + 8);
    const chipW = (CONTENT_W - 8) / 3;
    statChip(doc, 'Total Quizzes', results.length, MARGIN, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Average Score', avg + '%', MARGIN + chipW, y, chipW - 4, avg >= 50 ? C.greenLight : C.redLight, avg >= 50 ? C.green : C.red);
    statChip(doc, 'Best Score', best + '%', MARGIN + chipW * 2, y, chipW - 4, C.greenLight, C.green);
    y += 58;

    // Per-quiz table
    y = ensureSpace(doc, y, 40);
    y = sectionHeading(doc, 'Quiz History', y);
    // Date needs real room for "Jan 15, 2026" (~60pt); shaved a little off Quiz Title and
    // Attempt # rather than leave Date too narrow to show a complete, untruncated date.
    const cols = [
      { label: 'Quiz Title', width: 140 },
      { label: 'Code', width: 70 },
      { label: 'Score', width: 60, align: 'center' },
      { label: '%', width: 44, align: 'center' },
      { label: 'Grade', width: 55, align: 'center' },
      { label: 'Attempt #', width: 50, align: 'center' },
      { label: 'Date', width: CONTENT_W - 140 - 70 - 60 - 44 - 55 - 50 },
    ];
    const rows = results.map(r => {
      const p = pct(r.correct, r.total);
      const g = grade(p);
      return [
        truncate(r.paperTitle, 22),
        r.paperCode,
        { text: r.correct + '/' + r.total, color: C.ink },
        { text: p + '%', color: p >= 50 ? C.green : C.red },
        { text: g.label, color: g.color },
        r.attemptNumber || 1,
        fmtDateShort(r.createdAt)
      ];
    });
    table(doc, cols, rows, y);

    drawFooters(doc);
    doc.end();
  });
}

/**
 * buildAdminAllStudentsReport — all students across all admin's quizzes (bulk).
 * data: { students: [{ name, roll, results: [...] }], adminName, filters }
 */
export async function buildAdminAllStudentsReport({ students, adminName, filters = {} }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Filter description
    const scopeDesc = [
      filters.paper ? 'Quiz: ' + filters.paper : null,
      filters.from ? 'From: ' + fmtDate(filters.from) : null,
      filters.to ? 'To: ' + fmtDate(filters.to) : null,
      (filters.minPercent || filters.maxPercent) ? 'Performance: ' + (filters.minPercent || 0) + '–' + (filters.maxPercent || 100) + '%' : null,
    ].filter(Boolean).join('  ·  ') || 'All Quizzes';

    let y = drawPageHeader(doc, 'All Students Report', scopeDesc);

    // Summary header
    const totalResults = students.reduce((s, st) => s + st.results.length, 0);
    const allResults = students.flatMap(st => st.results);
    const overallAvg = allResults.length ? Math.round(allResults.reduce((s, r) => s + pct(r.correct, r.total), 0) / allResults.length) : 0;

    y = sectionHeading(doc, 'Report Summary', y + 8);
    y = infoRow(doc, 'Teacher / Admin', adminName || '—', y);
    y = infoRow(doc, 'Scope', scopeDesc, y);
    y = infoRow(doc, 'Total Students', students.length, y);
    y = infoRow(doc, 'Total Attempts', totalResults, y);
    y = infoRow(doc, 'Platform Average', overallAvg + '%', y);
    y = infoRow(doc, 'Report Date', fmtDateTime(new Date()), y);

    // Summary table
    y = ensureSpace(doc, y, 40);
    y = sectionHeading(doc, 'Student Performance Summary', y + 8);
    const cols = [
      { label: '#', width: 24 },
      { label: 'Name', width: 140 },
      { label: 'Roll', width: 80 },
      { label: 'Quizzes', width: 55, align: 'center' },
      { label: 'Avg Score', width: 65, align: 'center' },
      { label: 'Best', width: 50, align: 'center' },
      { label: 'Overall', width: CONTENT_W - 24 - 140 - 80 - 55 - 65 - 50 },
    ];
    const rows = students.map((st, i) => {
      const results = st.results;
      const avg = results.length ? Math.round(results.reduce((s, r) => s + pct(r.correct, r.total), 0) / results.length) : null;
      const best = results.length ? Math.max(...results.map(r => pct(r.correct, r.total))) : null;
      const g = avg != null ? grade(avg) : { label: 'N/A', color: C.muted };
      return [
        i + 1,
        truncate(st.name, 24),
        st.roll,
        results.length,
        avg != null ? { text: avg + '%', color: avg >= 50 ? C.green : C.red } : { text: '—', color: C.muted },
        best != null ? { text: best + '%', color: C.green } : { text: '—', color: C.muted },
        { text: g.label, color: g.color }
      ];
    });
    table(doc, cols, rows, y);

    drawFooters(doc);
    doc.end();
  });
}

/**
 * buildOwnerPlatformReport — platform-wide summary for the Owner.
 * data: { admins: [{ name, papers: [...], results: [...] }], filters }
 */
export async function buildOwnerPlatformReport({ admins, filters = {} }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // filters.from/.to are already applied to the data by the route - disclosed here so the
    // reader doesn't mistake a date-filtered report for the platform's complete history.
    const scopeLabel = [
      filters.adminName ? 'Teacher: ' + filters.adminName : 'All Teachers',
      filters.from ? 'From: ' + fmtDate(filters.from) : null,
      filters.to ? 'To: ' + fmtDate(filters.to) : null
    ].filter(Boolean).join('  ·  ');
    let y = drawPageHeader(doc, 'Platform-Wide Report', scopeLabel);

    const allResults = admins.flatMap(a => a.results);
    const allPapers = admins.flatMap(a => a.papers);
    const avg = allResults.length ? Math.round(allResults.reduce((s, r) => s + pct(r.correct, r.total), 0) / allResults.length) : 0;

    y = sectionHeading(doc, 'Platform Overview', y + 8);
    const chipW = (CONTENT_W - 12) / 4;
    statChip(doc, 'Teachers', admins.length, MARGIN, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Total Quizzes', allPapers.length, MARGIN + chipW, y, chipW - 4, C.purpleLight, C.indigo);
    statChip(doc, 'Total Attempts', allResults.length, MARGIN + chipW * 2, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Platform Avg', avg + '%', MARGIN + chipW * 3, y, chipW - 4, avg >= 50 ? C.greenLight : C.redLight, avg >= 50 ? C.green : C.red);
    y += 58;

    // Per-teacher summary table
    y = ensureSpace(doc, y, 40);
    y = sectionHeading(doc, 'Teacher Performance Summary', y);
    const cols = [
      { label: '#', width: 24 },
      { label: 'Teacher', width: 160 },
      { label: 'Quizzes', width: 60, align: 'center' },
      { label: 'Attempts', width: 60, align: 'center' },
      { label: 'Avg Score', width: 70, align: 'center' },
      { label: 'Best', width: 60, align: 'center' },
      { label: 'Pass Rate', width: CONTENT_W - 24 - 160 - 60 - 60 - 70 - 60 },
    ];
    const rows = admins.map((a, i) => {
      const res = a.results;
      const avg = res.length ? Math.round(res.reduce((s, r) => s + pct(r.correct, r.total), 0) / res.length) : null;
      const best = res.length ? Math.max(...res.map(r => pct(r.correct, r.total))) : null;
      const pass = res.length ? Math.round(res.filter(r => pct(r.correct, r.total) >= 50).length / res.length * 100) : null;
      return [
        i + 1,
        truncate(a.name, 28),
        a.papers.length,
        res.length,
        avg != null ? { text: avg + '%', color: avg >= 50 ? C.green : C.red } : { text: '—', color: C.muted },
        best != null ? { text: best + '%', color: C.green } : { text: '—', color: C.muted },
        pass != null ? { text: pass + '%', color: pass >= 50 ? C.green : C.red } : { text: '—', color: C.muted }
      ];
    });
    table(doc, cols, rows, y);

    // Per-teacher detail sections
    for (const admin of admins) {
      if (!admin.results.length) continue;
      doc.addPage();
      let y2 = MARGIN;
      y2 = sectionHeading(doc, 'Teacher: ' + admin.name, y2);
      y2 = infoRow(doc, 'Quizzes', admin.papers.length, y2);
      y2 = infoRow(doc, 'Attempts', admin.results.length, y2);

      const detailCols = [
        { label: 'Student', width: 115 },
        { label: 'Roll', width: 75 },
        { label: 'Quiz', width: 115 },
        { label: 'Score', width: 55, align: 'center' },
        { label: '%', width: 44, align: 'center' },
        { label: 'Date', width: CONTENT_W - 115 - 75 - 115 - 55 - 44 },
      ];
      const detailRows = admin.results.map(r => {
        const p = pct(r.correct, r.total);
        return [
          truncate(r.name, 20),
          r.roll,
          truncate(r.paperTitle, 20),
          r.correct + '/' + r.total,
          { text: p + '%', color: p >= 50 ? C.green : C.red },
          fmtDateShort(r.createdAt)
        ];
      });
      table(doc, detailCols, detailRows, y2 + 8);
    }

    drawFooters(doc);
    doc.end();
  });
}

/**
 * buildConsolidatedStudentsReport — flat, cross-teacher student summary (one row per student).
 * data: { rows: [{ name, roll, email, teacherName, totalMarks, obtainedMarks, percentage, grade }],
 *         summary: { totalStudents, averageMarks, averagePercentage, highestScore, lowestScore },
 *         filters }
 */
export async function buildConsolidatedStudentsReport({ rows, summary, filters = {} }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const scopeDesc = [
      filters.paper ? 'Quiz: ' + filters.paper : null,
      filters.from ? 'From: ' + fmtDate(filters.from) : null,
      filters.to ? 'To: ' + fmtDate(filters.to) : null,
      (filters.minPercent || filters.maxPercent) ? 'Performance: ' + (filters.minPercent ?? 0) + '–' + (filters.maxPercent ?? 100) + '%' : null
    ].filter(Boolean).join('  ·  ') || 'All Students';

    let y = drawPageHeader(doc, 'All Students Consolidated Report', scopeDesc);

    y = sectionHeading(doc, 'Report Summary', y + 8);
    y = infoRow(doc, 'Scope', scopeDesc, y);
    y = infoRow(doc, 'Report Date', fmtDateTime(new Date()), y);

    y = ensureSpace(doc, y, 60);
    const chipW = (CONTENT_W - 16) / 5;
    statChip(doc, 'Students', summary.totalStudents, MARGIN, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Avg Marks', summary.averageMarks ?? '—', MARGIN + chipW, y, chipW - 4, C.purpleLight, C.indigo);
    statChip(doc, 'Avg %', summary.averagePercentage != null ? summary.averagePercentage + '%' : '—', MARGIN + chipW * 2, y, chipW - 4,
      summary.averagePercentage >= 50 ? C.greenLight : C.redLight, summary.averagePercentage >= 50 ? C.green : C.red);
    statChip(doc, 'Highest', summary.highestScore != null ? summary.highestScore + '%' : '—', MARGIN + chipW * 3, y, chipW - 4, C.greenLight, C.green);
    statChip(doc, 'Lowest', summary.lowestScore != null ? summary.lowestScore + '%' : '—', MARGIN + chipW * 4, y, chipW - 4, C.redLight, C.red);
    y += 60;

    y = ensureSpace(doc, y, 40);
    y = sectionHeading(doc, 'Student Performance', y);
    // Widths must sum to CONTENT_W (~499pt). Grade needs real room ("Excellent" at 8pt is ~45pt) -
    // a previous version left it ~2pt wide, which rendered the label straight over the next column.
    const cols = [
      { label: '#', width: 22 },
      { label: 'Student', width: 95 },
      { label: 'Email', width: 95 },
      { label: 'Teacher', width: 85 },
      { label: 'Total', width: 45, align: 'center' },
      { label: 'Obtained', width: 55, align: 'center' },
      { label: '%', width: 40, align: 'center' },
      { label: 'Grade', width: CONTENT_W - 22 - 95 - 95 - 85 - 45 - 55 - 40 },
    ];
    const tableRows = rows.map((r, i) => {
      const g = grade(r.percentage);
      return [
        i + 1,
        r.name,
        r.email || '—',
        r.teacherName || '—',
        r.totalMarks,
        r.obtainedMarks,
        { text: r.percentage + '%', color: r.percentage >= 50 ? C.green : C.red },
        { text: g.label, color: g.color }
      ];
    });
    table(doc, cols, tableRows, y);

    drawFooters(doc);
    doc.end();
  });
}

/**
 * buildTeachersSummaryReport — Owner's consolidated summary of teachers.
 * data: { teachers: [{ displayName, assignedStudents, createdQuizzes, quizAttempts, averageScore }], filters }
 */
export async function buildTeachersSummaryReport({ teachers, filters = {} }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // getAdminsWithStats() itself has no date filter - its numbers are always all-time.
    let y = drawPageHeader(doc, 'Teachers Summary Report', 'Platform teacher roster and performance');

    const totalStudents = teachers.reduce((s, t) => s + t.assignedStudents, 0);
    const totalQuizzes = teachers.reduce((s, t) => s + t.createdQuizzes, 0);
    const totalAttempts = teachers.reduce((s, t) => s + t.quizAttempts, 0);

    y = sectionHeading(doc, 'Report Summary', y + 8);
    y = infoRow(doc, 'Note', 'All-time totals (not affected by date or performance filters).', y);
    y = infoRow(doc, 'Report Date', fmtDateTime(new Date()), y);

    y = ensureSpace(doc, y, 60);
    const chipW = (CONTENT_W - 12) / 4;
    statChip(doc, 'Teachers', teachers.length, MARGIN, y, chipW - 4, C.purpleLight, C.purple);
    statChip(doc, 'Students', totalStudents, MARGIN + chipW, y, chipW - 4, C.purpleLight, C.indigo);
    statChip(doc, 'Quizzes', totalQuizzes, MARGIN + chipW * 2, y, chipW - 4, C.purpleLight, C.indigo);
    statChip(doc, 'Attempts', totalAttempts, MARGIN + chipW * 3, y, chipW - 4, C.purpleLight, C.purple);
    y += 60;

    y = ensureSpace(doc, y, 40);
    y = sectionHeading(doc, 'Teacher Performance', y);
    const cols = [
      { label: '#', width: 24 },
      { label: 'Teacher', width: 170 },
      { label: 'Students', width: 70, align: 'center' },
      { label: 'Quizzes', width: 60, align: 'center' },
      { label: 'Attempts', width: 65, align: 'center' },
      { label: 'Avg Score', width: CONTENT_W - 24 - 170 - 70 - 60 - 65 },
    ];
    const rows = teachers.map((t, i) => [
      i + 1,
      truncate(t.displayName || t.name, 30),
      t.assignedStudents,
      t.createdQuizzes,
      t.quizAttempts,
      t.averageScore != null ? { text: t.averageScore + '%', color: t.averageScore >= 50 ? C.green : C.red } : { text: '—', color: C.muted }
    ]);
    table(doc, cols, rows, y);

    drawFooters(doc);
    doc.end();
  });
}
