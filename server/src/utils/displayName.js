// Safe display name for a Teacher/Admin: their set name, or a readable fallback derived from
// their email's local part for legacy accounts created before the name field existed. Every place
// that shows a teacher's identity (dashboards, profiles, PDFs, CSVs, report filters) should go
// through this - never the raw email - so renaming is consistent and no caller shows a blank.
export default function displayName(admin) {
  const name = String(admin?.name || '').trim();
  if (name) return name;
  const local = String(admin?.email || '').split('@')[0].trim();
  return local || 'Unnamed Teacher';
}
