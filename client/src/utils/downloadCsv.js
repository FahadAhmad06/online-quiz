export default function downloadCsv(filename, rows) {
  const c = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['Paper code', 'Name', 'Roll number', 'Email', 'Marks', 'Total', 'Wrong', 'Score %', 'Rank', 'Date'];
  const body = rows.map(r => [r.paperCode, r.name, r.roll, r.email, r.correct, r.total, r.wrong, r.percent, r.rank, new Date(r.createdAt).toISOString()]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head, ...body].map(r => r.map(c).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = filename + '.csv'; a.click();
}
