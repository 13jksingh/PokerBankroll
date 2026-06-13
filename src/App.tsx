import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useData } from './lib/useData';
import StandingsPage from './routes/StandingsPage';
import HistoryPage from './routes/HistoryPage';
import StatsPage from './routes/StatsPage';
import SessionDetailPage from './routes/SessionDetailPage';
import AddSessionPage from './routes/AddSessionPage';
import PlayersPage from './routes/PlayersPage';
import TableBar from './components/TableBar';

function SetupNotice() {
  return (
    <div className="card setup">
      <h2>Almost there</h2>
      <p>
        This app needs your Google Apps Script URL. Create a <code>.env</code>{' '}
        file with:
      </p>
      <pre>VITE_API_URL=https://script.google.com/macros/s/XXXX/exec</pre>
      <p>
        See <code>apps-script/README.md</code> for one-time setup steps, then
        restart the dev server.
      </p>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Standings', icon: '🏆', end: true, primary: false },
  { to: '/history', label: 'History', icon: '🗓️', end: false, primary: false },
  { to: '/add', label: 'Add', icon: '＋', end: false, primary: true },
  { to: '/stats', label: 'Stats', icon: '📊', end: false, primary: false },
  { to: '/players', label: 'Players', icon: '👥', end: false, primary: false },
];

export default function App() {
  const { configured, online, fromCache } = useData();

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">♠</span>
          <span>PokerBankroll</span>
        </NavLink>
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
            <Routes>
              <Route path="/" element={<StandingsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route
                path="/history/:sessionId"
                element={<SessionDetailPage />}
              />
              <Route path="/add" element={<AddSessionPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/players" element={<PlayersPage />} />
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
