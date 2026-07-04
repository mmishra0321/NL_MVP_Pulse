import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import SandboxPlaylistPage from './pages/SandboxPlaylistPage.jsx';
import NowPlayingPage from './pages/NowPlayingPage.jsx';
import OutcomePage from './pages/OutcomePage.jsx';
import SavedConfirmationPage from './pages/SavedConfirmationPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ResetFlow from './pages/ResetFlow.jsx';
import RunsPage from './pages/RunsPage.jsx';
import { SavedSandboxProvider } from './context/SavedSandboxContext.jsx';

/**
 * The Pulse home (`/`) renders its own full-viewport mobile shell -
 * NO desktop app-header on that route. The engine diagnostics routes
 * (/engine, /engine/runs) keep the old desktop header for internal QA.
 * Legacy /reset kept until P2 replaces it with /sandbox/:sessionId.
 */

function EngineHeader() {
  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="app-brand-dot">{'\u25CF'}</span> Pulse {'\u00b7'} Engine diagnostics
      </div>
      <nav className="app-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Back to Pulse
        </NavLink>
        <NavLink to="/engine" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/engine/runs" className={({ isActive }) => (isActive ? 'active' : '')}>
          Runs
        </NavLink>
      </nav>
    </header>
  );
}

function EngineShell({ children }) {
  return (
    <div className="app-shell">
      <EngineHeader />
      {children}
    </div>
  );
}

export default function App() {
  return (
    // SavedSandboxProvider wraps the whole tree so "playlist saved
    // to library" state (session-local, wiped on refresh) is
    // available to Home, Sandbox, Now Playing, and Outcome pages.
    <SavedSandboxProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/sandbox/:sessionId" element={<SandboxPlaylistPage />} />
        <Route
          path="/sandbox/:sessionId/now-playing/:trackId"
          element={<NowPlayingPage />}
        />
        <Route
          path="/sandbox/:sessionId/saved"
          element={<SavedConfirmationPage />}
        />
        <Route
          path="/sandbox/:sessionId/outcome"
          element={<OutcomePage />}
        />
        <Route path="/engine" element={<EngineShell><Dashboard /></EngineShell>} />
        <Route path="/engine/runs" element={<EngineShell><RunsPage /></EngineShell>} />
        {/* Legacy desktop reset flow - kept behind /engine/reset for internal QA only */}
        <Route path="/engine/reset" element={<EngineShell><ResetFlow /></EngineShell>} />
        <Route path="/engine/reset/:sessionId" element={<EngineShell><ResetFlow /></EngineShell>} />
      </Routes>
    </SavedSandboxProvider>
  );
}
