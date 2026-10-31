// Single source of truth for percentage + grade label, shared by pdfReport.js and every
// report/CSV route so the PDF, the JSON, and the CSV built from that JSON always agree.
export function pct(correct, total) {
  return total > 0 ? Math.round(correct / total * 100) : 0;
}
export function grade(p) {
  if (p >= 85) return { label: 'Excellent', color: '#16a34a' };
  if (p >= 70) return { label: 'Good', color: '#16a34a' };
  if (p >= 50) return { label: 'Pass', color: '#4f46e5' };
  return { label: 'Fail', color: '#dc2626' };
}
