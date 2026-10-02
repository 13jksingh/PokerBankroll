import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useData } from './lib/useData';
import { useEditGate } from './lib/editGate';
import StandingsPage from './routes/StandingsPage';
import HistoryPage from './routes/HistoryPage';
import StatsPage from './routes/StatsPage';
import SessionDetailPage from './routes/SessionDetailPage';
import AddSessionPage from './routes/AddSessionPage';
import LiveNightPage from './routes/LiveNightPage';
import WalletPage from './routes/WalletPage';
import TableBar from './components/TableBar';

function SetupNotice() {
  return (
    <div className="card setup">
      <h2>Almost there</h2>
      <p>
        This app needs its backend API URL. Create a <code>.env</code> file
        with:
      </p>
      <pre>VITE_API_URL=https://your-api.example.com/api/poker</pre>
      <p>
        See <code>api/README.md</code> for setup steps, then restart the dev
        server.
      </p>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Standings', icon: '🏆', end: true, primary: false },
  { to: '/history', label: 'History', icon: '🗓️', end: false, primary: false },
  { to: '/add', label: 'Add', icon: '＋', end: false, primary: true },
  { to: '/stats', label: 'Stats', icon: '📊', end: false, primary: false },
  { to: '/wallet', label: 'Wallet', icon: '💰', end: false, primary: false },
];

export default function App() {
  const { configured, online, fromCache, data, tableId } = useData();
  const { unlocked, requireUnlock, lock } = useEditGate();

  const openSession =
    data && tableId
      ? data.sessions.find((s) => s.tableId === tableId && s.status === 'open')
      : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">♠</span>
          <span>PokerBankroll</span>
        </NavLink>
        {configured && (
          <button
            type="button"
            className={`lock-btn ${unlocked ? 'unlocked' : ''}`}
            onClick={() => (unlocked ? lock() : void requireUnlock())}
            title={
              unlocked
                ? 'Editing unlocked — tap to lock'
                : 'Locked — tap to enter PIN'
            }
          >
            {unlocked ? '🔓' : '🔒'}
          </button>
        )}
      </header>

      {!online && (
        <div className="banner warn">
          You’re offline. {fromCache ? 'Showing saved data. ' : ''}Editing is
          paused until you reconnect.
        </div>
      )}

      <main className="content">
        {!configured ? (
          <SetupNotice />
        ) : (
          <>
            <TableBar />
            {openSession && (
              <NavLink
                to={`/live/${openSession.sessionId}`}
                className="banner live-resume"
              >
                <span className="live-dot" /> Live night in progress — tap to
                resume
              </NavLink>
            )}
            <Routes>
              <Route path="/" element={<StandingsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route
                path="/history/:sessionId"
                element={<SessionDetailPage />}
              />
              <Route path="/add" element={<AddSessionPage />} />
              <Route path="/live" element={<LiveNightPage />} />
              <Route path="/live/:sessionId" element={<LiveNightPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route
                path="/players"
                element={<Navigate to="/stats" replace />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        )}
      </main>

      {configured && (
        <nav className="bottom-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `nav-item${n.primary ? ' primary' : ''}${
                  isActive ? ' active' : ''
                }`
              }
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
