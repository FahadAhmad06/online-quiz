import { useRef } from 'react';
import Icon from './Icon';
import { useConfirm } from './Feedback';

const wordCount = s => { const t = s.trim(); return t ? t.split(/\s+/).length : 0; };

// Wraps the current selection (or inserts a placeholder) with markdown-style markers.
// A plain textarea stays the source of truth - paragraphs and line breaks work natively,
// bold/italic/lists are lightweight markdown the review screen renders safely (see mdToHtml).
function wrapSelection(ta, before, after = before) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e) || 'text';
  return { next: value.slice(0, s) + before + selected + after + value.slice(e), caret: s + before.length, caretEnd: s + before.length + selected.length };
}

export default function AnswerEditor({ value, onChange, disabled, maxLength = 20000 }) {
  const ref = useRef(null);
  const confirm = useConfirm();

  const format = (before, after) => {
    const ta = ref.current; if (!ta) return;
    const { next, caret, caretEnd } = wrapSelection(ta, before, after);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caretEnd); });
  };
  const insertList = () => {
    const ta = ref.current; if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const next = v.slice(0, lineStart) + '- ' + v.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 2); });
  };
  const clear = async () => {
    if (!value.trim() || disabled) return;
    if (await confirm({ title: 'Clear your answer?', message: 'This removes everything you have written for this question. This cannot be undone.', confirmText: 'Clear answer', danger: true })) onChange('');
  };

  return (
    <div className="answer-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" className="ghost small" onClick={() => format('**')} disabled={disabled} aria-label="Bold"><b>B</b></button>
        <button type="button" className="ghost small" onClick={() => format('*')} disabled={disabled} aria-label="Italic"><i>I</i></button>
        <button type="button" className="ghost small" onClick={insertList} disabled={disabled} aria-label="Bullet list"><Icon name="menu" size={15} /></button>
        <span className="spacer" />
        <button type="button" className="ghost small" onClick={clear} disabled={disabled || !value.trim()}><Icon name="trash" size={14} />Clear</button>
      </div>
      <textarea ref={ref} className="answer-textarea" value={value} disabled={disabled} maxLength={maxLength}
        placeholder="Write your answer here..." onChange={e => onChange(e.target.value)} aria-label="Your answer" />
      <div className="editor-footer muted small-text">
        <span>{wordCount(value)} word{wordCount(value) === 1 ? '' : 's'}</span>
        <span>{value.length.toLocaleString()}/{maxLength.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
