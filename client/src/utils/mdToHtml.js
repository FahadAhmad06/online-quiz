// Minimal, safe markdown for subjective answers/feedback: escape everything first, THEN add
// **bold**, *italic*, and "- " list markup, so nothing in the source text can ever become a tag.
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function mdToHtml(text) {
  const lines = escapeHtml(text || '').split('\n');
  let html = '', inList = false;
  for (const line of lines) {
    const isItem = /^-\s+/.test(line);
    if (isItem && !inList) { html += '<ul>'; inList = true; }
    if (!isItem && inList) { html += '</ul>'; inList = false; }
    const inline = line.replace(/^-\s+/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    html += isItem ? '<li>' + inline + '</li>' : (line ? '<p>' + inline + '</p>' : '<br/>');
  }
  if (inList) html += '</ul>';
  return html;
}
