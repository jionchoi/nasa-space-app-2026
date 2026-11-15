// v4 shell: which panel is open (sidebar, Inbox, Learn pop-up) and which message the Inbox should focus.
// One panel at a time; Escape closes it (the Act now pop-up is separate and needs Acknowledge).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isTypingTarget } from '../lib/sound';

export type Panel = 'sidebar' | 'inbox' | 'learn' | null;

interface ShellState {
  panel: Panel;
  open(panel: Exclude<Panel, null>): void;
  close(): void;
  /** Open the Inbox on a message (a draft id), or on the message composer when null. */
  openInbox(focus?: string | null): void;
  inboxFocus: string | null;
}

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [inboxFocus, setInboxFocus] = useState<string | null>(null);
  const close = useCallback(() => setPanel(null), []);
  const open = useCallback((p: Exclude<Panel, null>) => setPanel(p), []);
  const openInbox = useCallback((focus: string | null = null) => { setInboxFocus(focus); setPanel('inbox'); }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isTypingTarget(e.target)) setPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const value = useMemo(() => ({ panel, open, close, openInbox, inboxFocus }), [panel, open, close, openInbox, inboxFocus]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): ShellState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShell must be used inside ShellProvider');
  return ctx;
}
