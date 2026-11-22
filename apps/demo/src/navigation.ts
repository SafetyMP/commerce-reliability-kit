export type View = 'case' | 'technical';

export function viewFromHash(hash: string): View {
  const technical = ['#technical', '#workbench', '#library', '#report', '#compare'];
  return technical.includes(hash.split('?')[0] ?? '') ? 'technical' : 'case';
}
export function initialView(): View {
  return typeof window === 'undefined' ? 'case' : viewFromHash(window.location.hash);
}

// A fragment change would overwrite the route and add an ambiguous history
// entry. Keep the href as a native fallback, but focus without changing the URL.
export function skipToMain(
  event: Pick<Event, 'preventDefault'>,
  target: Pick<Document, 'getElementById'>,
): void {
  const main = target.getElementById('main');
  if (!main) return;
  event.preventDefault();
  main.focus();
}

// Keep the native skip-to-main anchor from changing the current view.
// The URL only identifies a view; reports and drafts remain in memory.
export function observeHash(
  target: Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>,
  onView: (view: View) => void,
): () => void {
  const changed = () => {
    if (target.location.hash !== '#main') onView(viewFromHash(target.location.hash));
  };
  target.addEventListener('hashchange', changed);
  return () => target.removeEventListener('hashchange', changed);
}
