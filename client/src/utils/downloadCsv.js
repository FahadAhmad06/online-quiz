const quote = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const toCsv = (head, body) => [head, ...body].map(r => r.map(quote).join(',')).join('\n');

function save(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = filename + '.csv'; a.click();
}

export default function downloadCsv(filename, rows) {
  const head = ['Paper code', 'Name', 'Roll number', 'Email', 'Marks', 'Total', 'Wrong', 'Score %', 'Rank', 'Date'];
  const body = rows.map(r => [r.paperCode, r.name, r.roll, r.email, r.correct, r.total, r.wrong, r.percent, r.rank, new Date(r.createdAt).toISOString()]);
  save(filename, toCsv(head, body));
}

// Generic CSV export for any {head: [...], rows: [[...], ...]} shape — used by every new
// Teacher/Student/Owner report so the CSV always matches whatever JSON fed the matching PDF.
export function downloadCsvGeneric(filename, head, rows) {
  save(filename, toCsv(head, rows));
}
