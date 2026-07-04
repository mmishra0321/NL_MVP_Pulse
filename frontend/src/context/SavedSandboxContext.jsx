/**
 * SavedSandboxContext - session-local sandbox lifecycle state.
 *
 * WHY THIS EXISTS
 * ----------------
 * The backend has always been the source of truth for what a
 * ResetSession contains. But UX-wise, our demo flow needs a
 * distinction between four states that the DB does not natively
 * model:
 *
 *   1. Sandbox exists as a preview           (Screen 2 - not saved)
 *   2. User explicitly saved it              (SavedSandboxCard on Home)
 *   3. User tapped Keep - promoted to library (YourPulseReset tile
 *      on Home + kept item in the Library tab)
 *   4. User tapped Discard - gone
 *
 * State (2) and (3) don't belong in the DB - they're purely
 * frontend affordances the user controls in the browser. They
 * MUST reset on refresh so a demo reviewer can walk the flow
 * multiple times without stale playlists carrying over.
 *
 * Because reload/refresh must wipe both flags, we keep the state
 * purely in React (no localStorage, no sessionStorage). The
 * provider wraps App.jsx so state survives route navigation
 * Home <-> Sandbox <-> Now Playing <-> Library, but any hard
 * refresh gets you a clean slate.
 *
 * Shapes:
 *
 *   savedSandbox = null | {
 *     sessionId,
 *     savedAt,          // Date - drives the local countdown
 *     trialEndDate,     // Date - from the backend session
 *     scopeDimensions,  // e.g. ['language'] - for card artwork
 *     trackCount,       // for the "20 songs" subtitle
 *   }
 *
 *   keptPlaylist = null | {
 *     sessionId,
 *     keptAt,           // Date - when Keep was tapped
 *     trialEndDate,     // preserved from the saved state
 *     scopeDimensions,  // preserved for artwork
 *     trackCount,       // preserved
 *   }
 *
 * Multiple concurrent saved sandboxes / kept playlists are out of
 * scope for the MVP; calling saveSandbox() or keepSandbox() again
 * overwrites the previous entry.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from '../api/client.js';


const SavedSandboxContext = createContext(null);


export function SavedSandboxProvider({ children }) {
  const [savedSandbox, setSavedSandbox] = useState(null);
  const [keptPlaylist, setKeptPlaylist] = useState(null);

  const saveSandbox = useCallback((session) => {
    if (!session || !session.id) return;
    setSavedSandbox({
      sessionId: session.id,
      savedAt: new Date(),
      trialEndDate: session.trial_end_date
        ? new Date(session.trial_end_date)
        : null,
      scopeDimensions: session.scope_dimensions || [],
      trackCount: Array.isArray(session.tracks) ? session.tracks.length : 0,
    });
  }, []);

  const discardSandbox = useCallback(() => {
    setSavedSandbox(null);
  }, []);

  // Called after a successful POST /reset/sessions/:id/decide {keep}.
  // Promotes the current savedSandbox into keptPlaylist so it
  // surfaces on Home under "Your Pulse Reset" and in the Library
  // tab, while clearing the SavedSandboxCard.
  const keepSandbox = useCallback(() => {
    setSavedSandbox((current) => {
      if (!current) return current;
      setKeptPlaylist({
        sessionId: current.sessionId,
        keptAt: new Date(),
        trialEndDate: current.trialEndDate,
        scopeDimensions: current.scopeDimensions,
        trackCount: current.trackCount,
      });
      return null;
    });
  }, []);

  const clearKeptPlaylist = useCallback(() => {
    setKeptPlaylist(null);
  }, []);

  const value = useMemo(() => ({
    savedSandbox,
    keptPlaylist,
    saveSandbox,
    discardSandbox,
    keepSandbox,
    clearKeptPlaylist,
    isSaved: (sessionId) =>
      savedSandbox != null && savedSandbox.sessionId === sessionId,
    isKept: (sessionId) =>
      keptPlaylist != null && keptPlaylist.sessionId === sessionId,
  }), [
    savedSandbox, keptPlaylist,
    saveSandbox, discardSandbox, keepSandbox, clearKeptPlaylist,
  ]);

  return (
    <SavedSandboxContext.Provider value={value}>
      {children}
    </SavedSandboxContext.Provider>
  );
}


export function useSavedSandbox() {
  const ctx = useContext(SavedSandboxContext);
  if (!ctx) {
    throw new Error(
      'useSavedSandbox must be used inside a SavedSandboxProvider. '
      + 'Check that App.jsx wraps its <Routes> in <SavedSandboxProvider>.',
    );
  }
  return ctx;
}


/**
 * useSandboxDecision - one-line Keep/Discard for the current
 * savedSandbox.
 *
 * Both HomePage and LibraryPage render `SavedSandboxCard` with
 * inline Keep + Discard buttons. This hook wraps the network
 * round-trip (`POST /reset/sessions/:id/decide`) and the context
 * transition (`keepSandbox()` on keep, `discardSandbox()` on
 * revert) so the two surfaces stay in lockstep - a keep tapped
 * from Library instantly clears the SavedSandboxCard on Home,
 * and vice versa.
 *
 * Callers own their own toast + busy UI via the returned
 * `busy` flag and by passing `onSuccess` / `onError` callbacks.
 *
 * @param {object} [opts]
 * @param {(decision: 'keep' | 'revert') => void} [opts.onSuccess]
 * @param {(err: Error) => void} [opts.onError]
 * @returns {{ decide: (decision: 'keep' | 'revert') => Promise<void>, busy: boolean }}
 */
export function useSandboxDecision({ onSuccess, onError } = {}) {
  const { savedSandbox, keepSandbox, discardSandbox } = useSavedSandbox();
  const [busy, setBusy] = useState(false);

  const decide = useCallback(async (decision) => {
    if (!savedSandbox || busy) return;
    setBusy(true);
    try {
      await api.decideReset(savedSandbox.sessionId, decision);
      if (decision === 'keep') keepSandbox();
      else discardSandbox();
      onSuccess && onSuccess(decision);
    } catch (e) {
      onError && onError(e);
    } finally {
      setBusy(false);
    }
  }, [savedSandbox, busy, keepSandbox, discardSandbox, onSuccess, onError]);

  return { decide, busy };
}
