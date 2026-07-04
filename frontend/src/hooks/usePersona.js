/**
 * usePersona - the single source of truth for "who am I viewing Pulse as?".
 *
 * Resolves the active persona in priority order:
 *   1. `?viewingAs=aanya|karthik|riya` URL query param (wins — enables shareable
 *      demo links that skip the picker)
 *   2. `localStorage["pulse.persona"]` (remembers prior choice on this browser)
 *   3. `null` — no persona chosen yet; HomePage opens PersonaPickerModal
 *
 * Backing map is intentionally small: the 3 personas live in
 * `backend/mock_data/mock_users.json` and are surfaced through GET /users.
 * The hook only needs the URL-friendly short key -> backend id mapping.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pulse.persona';
const URL_PARAM = 'viewingAs';

const KEY_TO_ID = {
  aanya: 'demo-aanya-002',
  karthik: 'demo-karthik-001',
  riya: 'demo-riya-003',
};

const ID_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_ID).map(([k, v]) => [v, k]),
);

function readInitialKey() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get(URL_PARAM);
    if (q && KEY_TO_ID[q]) return q;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && KEY_TO_ID[stored]) return stored;
  } catch { /* SSR or private-mode: fall through */ }
  return null;
}

function writeUrlParam(key) {
  try {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set(URL_PARAM, key);
    else url.searchParams.delete(URL_PARAM);
    window.history.replaceState({}, '', url.toString());
  } catch { /* ignore */ }
}


export function usePersona() {
  const [personaKey, setPersonaKey] = useState(readInitialKey);

  const setPersona = useCallback((key) => {
    if (!KEY_TO_ID[key]) return;
    setPersonaKey(key);
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* ignore */ }
    writeUrlParam(key);
  }, []);

  const clearPersona = useCallback(() => {
    setPersonaKey(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    writeUrlParam(null);
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        if (e.newValue && KEY_TO_ID[e.newValue]) setPersonaKey(e.newValue);
        else if (!e.newValue) setPersonaKey(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    personaKey,
    personaId: personaKey ? KEY_TO_ID[personaKey] : null,
    setPersona,
    clearPersona,
    keyForId: (id) => ID_TO_KEY[id] || null,
  };
}

export default usePersona;
