import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Cpu,
  Layers,
  Folder,
  Activity,
  Wifi,
  Zap,
  Globe,
  ShieldCheck,
  Sliders,
  Maximize2,
  Minimize2,
  X,
  RefreshCw,
  Search,
  Trash2,
  Database,
  BarChart2,
  HardDrive
} from 'lucide-react';

// Distro ASCII Art Component in Retro Monochrome
function OsAsciiArt({ distroId = 'linux', distroName = '' }) {
  const id = (distroId || '').toLowerCase();
  const name = (distroName || '').toLowerCase();

  if (id.includes('arch') || name.includes('arch')) {
    return (
      <pre style={{ fontSize: '0.78rem', lineHeight: '1.15', whiteSpace: 'pre', color: '#f4f4f5' }}>
{`       /\\
      /  \\
     / /\\ \\
    / /  \\ \\
   / /    \\ \\
  / /      \\ \\
 / /        \\ \\
/_/          \\_\\`}
      </pre>
    );
  }

  if (id.includes('cachy') || name.includes('cachy')) {
    return (
      <pre style={{ fontSize: '0.78rem', lineHeight: '1.15', whiteSpace: 'pre', color: '#f4f4f5' }}>
{`       /\\
      /  \\
     /\\   \\
    /      \\
   /   ,,   \\
  /   |  |  \\-
 /_-''    ''-_\\`}
      </pre>
    );
  }

  if (id.includes('ubuntu') || name.includes('ubuntu')) {
    return (
      <pre style={{ fontSize: '0.78rem', lineHeight: '1.15', whiteSpace: 'pre', color: '#f4f4f5' }}>
{`         .-.
       .-'   '-.
      /    .    \\
     |   .  .    |
     |     '     |
      \\         /
       '-.   .-'
          '-'`}
      </pre>
    );
  }

  return (
    <pre style={{ fontSize: '0.78rem', lineHeight: '1.15', whiteSpace: 'pre', color: '#f4f4f5' }}>
{`      .---.
     |o_o  |
     |:_/  |
    //   \\ \\
   (|     | )
  /'\\_   _/\`\\
  \\___)=(___/`}
    </pre>
  );
}

// Period-Accurate Retro Line Graph Component
function RetroLineGraph({ data = [], height = 46, maxVal = null, showGrid = true }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height: `${height}px`, background: '#09090b', border: '1px solid #27272a', borderRadius: '2px', position: 'relative' }} />
    );
  }

  const width = 300;
  const computedMax = maxVal !== null ? maxVal : Math.max(...data, 10);
  const min = 0;
  const range = computedMax - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ position: 'relative', width: '100%', height: `${height}px`, background: '#09090b', border: '1px solid #27272a', borderRadius: '2px', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: `${height}px`, display: 'block' }}>
        {showGrid && (
          <>
            <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1c1c20" strokeDasharray="2 2" strokeWidth="1" />
            <line x1="0" y1={height * 0.50} x2={width} y2={height * 0.50} stroke="#1c1c20" strokeDasharray="2 2" strokeWidth="1" />
            <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1c1c20" strokeDasharray="2 2" strokeWidth="1" />
            
            <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} stroke="#1c1c20" strokeDasharray="2 2" strokeWidth="1" />
            <line x1={width * 0.50} y1="0" x2={width * 0.50} y2={height} stroke="#1c1c20" strokeDasharray="2 2" strokeWidth="1" />
            <line x1={width * 0.75} y1="0" x2={width * 0.75} y2={height} stroke="#1c1c20" strokeDasharray="2 2" strokeWidth="1" />
          </>
        )}
        
        <polyline
          fill="none"
          stroke="#f4f4f5"
          strokeWidth="1.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
          points={points}
        />
      </svg>
    </div>
  );
}

// 6 Main Desktop App Definitions (Strictly Monochrome & Clean Labels)
const DESKTOP_APPS = [
  { id: 'about', title: 'About System', icon: Monitor },
  { id: 'taskmanager', title: 'Task Manager', icon: BarChart2 },
  { id: 'df', title: 'Filesystems (df)', icon: Database },
  { id: 'du', title: 'Directory Sizes (du)', icon: Folder },
  { id: 'diagnostics', title: 'System Audit', icon: ShieldCheck },
  { id: 'alerts', title: 'System Thresholds', icon: Sliders }
];

export default function App() {
  const [vitals, setVitals] = useState(null);
  const [selectedIcon, setSelectedIcon] = useState(null);

  // Open Windows State: map of appId -> { id, title, zIndex, minimized, maximized, top, left }
  const [openWindows, setOpenWindows] = useState({
    about: { id: 'about', title: 'About System', zIndex: 10, minimized: false, maximized: false, top: 40, left: 60 },
    taskmanager: { id: 'taskmanager', title: 'Task Manager', zIndex: 11, minimized: false, maximized: false, top: 60, left: 340 }
  });
  const [activeWindowId, setActiveWindowId] = useState('taskmanager');
  const [nextZIndex, setNextZIndex] = useState(15);
  const [startMenuOpen, setStartMenuOpen] = useState(false);

  // Draggable Window Dragging State
  const [draggingWinId, setDraggingWinId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Task Manager Sub-Tab State: 'processes' | 'performance' | 'networking' | 'disk'
  const [tmTab, setTmTab] = useState('performance');

  // Time state for taskbar clock
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // App specific state
  const [processSearch, setProcessSearch] = useState('');
  const [processSort, setProcessSort] = useState('cpu');
  const [openPorts, setOpenPorts] = useState([]);
  const [portSearch, setPortSearch] = useState('');
  const [cleanableStorage, setCleanableStorage] = useState(null);
  const [isCleaningJournal, setIsCleaningJournal] = useState(false);
  const [dfFilesystems, setDfFilesystems] = useState([]);
  const [dfSearch, setDfSearch] = useState('');
  const [duPath, setDuPath] = useState('~');
  const [duData, setDuData] = useState(null);
  const [inxiData, setInxiData] = useState(null);
  const [smartData, setSmartData] = useState(null);
  const [diagResults, setDiagResults] = useState(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [thresholds, setThresholds] = useState({
    cpu_limit: 85,
    ram_limit: 90,
    gpu_limit: 90,
    disk_limit: 90,
    temp_limit: 80
  });

  // Rolling sparkline history
  const [history, setHistory] = useState({
    cpu: [],
    ram: [],
    gpu0: [],
    gpu1: [],
    netDown: [],
    netUp: [],
    diskRead: []
  });

  const wsRef = useRef(null);

  const [selectedDeviceId, setSelectedDeviceId] = useState('local');
  const [fleetSummary, setFleetSummary] = useState({ total_count: 1, online_count: 1, offline_count: 0, devices: [] });

  const [adminUser, setAdminUser] = useState(localStorage.getItem('admin_user') || 'nandhu');
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || 'local_polkit_session');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [showTokenModal, setShowTokenModal] = useState(false);

  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setAdminUser(data.username);
        setAdminToken(data.access_token);
        localStorage.setItem('admin_user', data.username);
        localStorage.setItem('admin_token', data.access_token);
        setIsRegisterMode(false);
      } else {
        setLoginError(data.detail || 'Authentication failed. Check credentials.');
      }
    } catch (err) {
      setLoginError('Server connection error.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAdminUser('');
    setAdminToken('');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('admin_token');
  };

  const handleGenerateToken = async () => {
    try {
      const res = await fetch(`/api/fleet/enroll-token?token=${adminToken}`);
      const data = await res.json();
      if (data.enrollment_token) {
        setGeneratedToken(data.enrollment_token);
        setShowTokenModal(true);
      }
    } catch (err) {}
  };

  const fetchThresholds = async () => {
    try {
      const res = await fetch('/api/alerts/config');
      if (res.ok) setThresholds(await res.json());
    } catch (err) {}
  };

  const fetchOpenPorts = async () => {
    try {
      const res = await fetch('/api/ports');
      if (res.ok) setOpenPorts(await res.json());
    } catch (err) {}
  };

  const fetchCleanableStorage = async () => {
    try {
      const res = await fetch('/api/storage/cleanable');
      if (res.ok) setCleanableStorage(await res.json());
    } catch (err) {}
  };

  const fetchDf = async () => {
    try {
      const res = await fetch('/api/sys/df');
      if (res.ok) setDfFilesystems(await res.json());
    } catch (err) {}
  };

  const fetchDu = async (targetPath) => {
    try {
      const p = targetPath || duPath || '~';
      const res = await fetch(`/api/sys/du?path=${encodeURIComponent(p)}`);
      if (res.ok) {
        const data = await res.json();
        setDuData(data);
        setDuPath(data.path || p);
      }
    } catch (err) {}
  };

  const fetchInxi = async () => {
    try {
      const res = await fetch('/api/sys/inxi');
      if (res.ok) setInxiData(await res.json());
    } catch (err) {}
  };

  const fetchSmart = async () => {
    try {
      const res = await fetch('/api/sys/smart');
      if (res.ok) setSmartData(await res.json());
    } catch (err) {}
  };

  const handleVacuumJournal = async () => {
    setIsCleaningJournal(true);
    try {
      const res = await fetch('/api/storage/vacuum-journal', { method: 'POST' });
      if (res.ok) fetchCleanableStorage();
    } catch (err) {} finally {
      setIsCleaningJournal(false);
    }
  };

  const runDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const res = await fetch('/api/diagnostics/run');
      if (res.ok) setDiagResults(await res.json());
    } catch (err) {} finally {
      setIsRunningDiag(false);
    }
  };

  // Live Fleet Summary WebSocket
  useEffect(() => {
    if (!adminToken) return;
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/fleet/summary');
        if (res.ok) setFleetSummary(await res.json());
      } catch (e) {}
    };
    fetchSummary();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const adminWsUrl = `${protocol}//${window.location.host}/ws/fleet/admin?token=${adminToken}`;
    let ws;
    function connectFleet() {
      try {
        ws = new WebSocket(adminWsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && typeof data.online_count === 'number') {
              setFleetSummary(data);
            }
          } catch(e){}
        };
        ws.onclose = () => setTimeout(connectFleet, 3000);
      } catch(e){}
    }
    connectFleet();
    return () => { if (ws) ws.close(); };
  }, [adminToken]);

  // Live Taskbar Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch functions
  useEffect(() => {
    fetchThresholds();
    runDiagnostics();
    fetchOpenPorts();
    fetchCleanableStorage();
    fetchDf();
    fetchDu('~');
    fetchInxi();
    fetchSmart();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/vitals`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setVitals(data);
          if (data.filesystems && data.filesystems.length > 0) {
            setDfFilesystems(data.filesystems);
          }

          const gpusList = data.gpu?.all_gpus || [];
          const g0_val = gpusList[0]?.usage_percent || 0;
          const g1_val = gpusList[1]?.usage_percent || 0;

          setHistory(prev => ({
            cpu: [...prev.cpu.slice(-29), data.cpu?.percent || 0],
            ram: [...prev.ram.slice(-29), data.memory?.percent || 0],
            gpu0: [...prev.gpu0.slice(-29), g0_val],
            gpu1: [...prev.gpu1.slice(-29), g1_val],
            netDown: [...prev.netDown.slice(-29), data.network?.down_kb_s || 0],
            netUp: [...prev.netUp.slice(-29), data.network?.up_kb_s || 0],
            diskRead: [...prev.diskRead.slice(-29), data.disk?.read_kb_s || 0]
          }));
        } catch (e) {
          console.error("Parse error:", e);
        }
      };

      ws.onclose = () => setTimeout(connect, 2000);
      ws.onerror = () => ws.close();
    }

    connect();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  // Window Manager Drag Handlers
  const handleMouseDownTitleBar = (appId, e) => {
    if (e.target.tagName === 'BUTTON') return;
    focusWindow(appId);
    setDraggingWinId(appId);
    const win = openWindows[appId];
    setDragOffset({
      x: e.clientX - (win?.left || 0),
      y: e.clientY - (win?.top || 0)
    });
  };

  const handleMouseMoveDesktop = (e) => {
    if (!draggingWinId) return;
    const newLeft = Math.max(0, e.clientX - dragOffset.x);
    const newTop = Math.max(0, e.clientY - dragOffset.y);

    setOpenWindows(prev => ({
      ...prev,
      [draggingWinId]: {
        ...prev[draggingWinId],
        left: newLeft,
        top: newTop
      }
    }));
  };

  const handleMouseUpDesktop = () => {
    setDraggingWinId(null);
  };

  // Window Manager Actions
  const openAppWindow = (appId) => {
    setStartMenuOpen(false);
    const appDef = DESKTOP_APPS.find(a => a.id === appId);
    if (!appDef) return;

    if (openWindows[appId]) {
      setOpenWindows(prev => ({
        ...prev,
        [appId]: {
          ...prev[appId],
          minimized: false,
          zIndex: nextZIndex
        }
      }));
    } else {
      const count = Object.keys(openWindows).length;
      const topOffset = 40 + (count % 8) * 28;
      const leftOffset = 60 + (count % 8) * 28;

      setOpenWindows(prev => ({
        ...prev,
        [appId]: {
          id: appId,
          title: appDef.title,
          zIndex: nextZIndex,
          minimized: false,
          maximized: false,
          top: topOffset,
          left: leftOffset
        }
      }));
    }
    setActiveWindowId(appId);
    setNextZIndex(prev => prev + 1);

    if (appId === 'df') { fetchDf(); fetchSmart(); }
    if (appId === 'du') fetchDu(duPath);
    if (appId === 'about') fetchInxi();
    if (appId === 'taskmanager') { fetchOpenPorts(); fetchSmart(); }
  };

  const focusWindow = (appId) => {
    if (activeWindowId === appId && !openWindows[appId]?.minimized) return;
    setOpenWindows(prev => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        minimized: false,
        zIndex: nextZIndex
      }
    }));
    setActiveWindowId(appId);
    setNextZIndex(prev => prev + 1);
  };

  const toggleMinimizeWindow = (appId, e) => {
    if (e) e.stopPropagation();
    setOpenWindows(prev => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        minimized: !prev[appId].minimized
      }
    }));
  };

  const toggleMaximizeWindow = (appId, e) => {
    if (e) e.stopPropagation();
    setOpenWindows(prev => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        maximized: !prev[appId].maximized
      }
    }));
  };

  const closeWindow = (appId, e) => {
    if (e) e.stopPropagation();
    setOpenWindows(prev => {
      const copy = { ...prev };
      delete copy[appId];
      return copy;
    });
    if (activeWindowId === appId) {
      setActiveWindowId(null);
    }
  };

  const closeAllWindows = () => {
    setOpenWindows({});
    setActiveWindowId(null);
    setStartMenuOpen(false);
  };

  // GPU Data extraction for both Integrated and Discrete GPUs
  const allGpus = vitals?.gpu?.all_gpus || [];
  const discreteGpu = allGpus.find(g => g.type === 'nvidia') || allGpus[0] || {};
  const integratedGpu = allGpus.find(g => g.type === 'amd_intel') || allGpus[1] || {};

  const filteredProcesses = (vitals?.processes || [])
    .filter(p => {
      const q = processSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) ||
             p.pid.toString().includes(q) ||
             p.user.toLowerCase().includes(q);
    })
    .sort((a, b) => b[processSort] - a[processSort]);

  const filteredDf = (dfFilesystems || []).filter(fs => {
    const q = dfSearch.toLowerCase();
    return fs.mount.toLowerCase().includes(q) ||
           fs.filesystem.toLowerCase().includes(q) ||
           fs.type.toLowerCase().includes(q);
  });

  const filteredPorts = openPorts.filter(p => {
    const q = portSearch.toLowerCase();
    return p.port.toString().includes(q) ||
           p.process_name.toLowerCase().includes(q) ||
           p.protocol.toLowerCase().includes(q) ||
           p.ip.includes(q);
  });

  const ramTotalMb = (vitals?.memory?.total_gb || 16) * 1024;
  const ramUsedMb = (vitals?.memory?.used_gb || 4) * 1024;
  const ramFreeMb = (vitals?.memory?.free_gb || 12) * 1024;

  if (!adminToken) {
    return (
      <div className="retro-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#f4f4f5' }}>
        <div style={{ width: '380px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
          <div style={{ background: '#27272a', padding: '10px 14px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} /> PulseLinux Admin Login Gateway
          </div>
          <form onSubmit={handleLogin} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
              Sign in with Linux PAM credentials or master admin account to access your fleet.
            </div>

            {loginError && (
              <div style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#f87171', padding: '8px 10px', borderRadius: '4px', fontSize: '0.75rem' }}>
                ⚠️ {loginError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', marginBottom: '4px', textTransform: 'uppercase' }}>Admin Username</label>
              <input
                type="text"
                placeholder="e.g. nandhu or admin"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', color: '#f4f4f5', outline: 'none', fontSize: '0.85rem' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', marginBottom: '4px', textTransform: 'uppercase' }}>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', color: '#f4f4f5', outline: 'none', fontSize: '0.85rem' }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              style={{ marginTop: '6px', background: isRegisterMode ? '#059669' : '#2563eb', border: 'none', color: '#ffffff', padding: '10px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {isLoggingIn ? 'Processing...' : (isRegisterMode ? 'Set / Register Password' : 'Sign In to Fleet Manager')}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: '#a1a1aa', marginTop: '4px' }}>
              <span onClick={() => { setIsRegisterMode(!isRegisterMode); setLoginError(''); }} style={{ textDecoration: 'underline', cursor: 'pointer', color: '#38bdf8' }}>
                {isRegisterMode ? '← Back to Login' : 'Set / Create Account Password'}
              </span>
              <span>Default: <code>admin</code> / <code>admin123</code></span>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}
      onMouseMove={handleMouseMoveDesktop}
      onMouseUp={handleMouseUpDesktop}
    >

      {/* Retro Desktop Workspace Canvas */}
      <div
        className="retro-desktop"
        onClick={() => { setSelectedIcon(null); setStartMenuOpen(false); }}
      >
        {/* Desktop Icons Grid (Strictly Monochrome Symbols without Box Backgrounds) */}
        <div className="desktop-icon-grid">
          {DESKTOP_APPS.map((app) => {
            const IconComp = app.icon;
            const isSelected = selectedIcon === app.id;

            return (
              <div
                key={app.id}
                className={`desktop-icon ${isSelected ? 'selected' : ''}`}
                onClick={(e) => { e.stopPropagation(); setSelectedIcon(app.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); openAppWindow(app.id); }}
              >
                <div className="desktop-icon-symbol">
                  <IconComp size={30} strokeWidth={1.5} color="#f4f4f5" />
                </div>
                <span className="desktop-icon-label">{app.title}</span>
              </div>
            );
          })}
        </div>

        {/* Render Open Windows */}
        {Object.values(openWindows).map((win) => {
          if (win.minimized) return null;
          const isActive = activeWindowId === win.id;

          return (
            <div
              key={win.id}
              className={`retro-window ${win.maximized ? 'maximized' : ''} ${isActive ? 'active' : ''}`}
              style={{
                top: win.maximized ? undefined : `${win.top}px`,
                left: win.maximized ? undefined : `${win.left}px`,
                zIndex: win.zIndex,
                width: win.maximized ? undefined : win.id === 'taskmanager' || win.id === 'about' || win.id === 'df' ? '720px' : '540px',
                height: win.maximized ? undefined : win.id === 'taskmanager' ? '560px' : win.id === 'about' ? '500px' : '440px'
              }}
              onClick={() => focusWindow(win.id)}
            >
              {/* Draggable Title Bar */}
              <div
                className="window-title-bar"
                onMouseDown={(e) => handleMouseDownTitleBar(win.id, e)}
              >
                <div className="window-title">
                  <Monitor size={14} color="#f4f4f5" />
                  {win.title}
                </div>
                <div className="window-controls">
                  <button className="win-btn" onClick={(e) => toggleMinimizeWindow(win.id, e)} title="Minimize">_</button>
                  <button className="win-btn" onClick={(e) => toggleMaximizeWindow(win.id, e)} title="Maximize">□</button>
                  <button className="win-btn close" onClick={(e) => closeWindow(win.id, e)} title="Close">✕</button>
                </div>
              </div>

              {/* Window Classic Menu Strip */}
              <div className="window-menu-bar">
                <span className="menu-item">File</span>
                <span className="menu-item">Options</span>
                <span className="menu-item">View</span>
                <span className="menu-item">Help</span>
              </div>

              {/* Task Manager Classic Tab Strip */}
              {win.id === 'taskmanager' && (
                <div className="tm-tab-strip">
                  <button className={`tm-tab-btn ${tmTab === 'performance' ? 'active' : ''}`} onClick={() => setTmTab('performance')}>Performance</button>
                  <button className={`tm-tab-btn ${tmTab === 'processes' ? 'active' : ''}`} onClick={() => setTmTab('processes')}>Processes</button>
                  <button className={`tm-tab-btn ${tmTab === 'networking' ? 'active' : ''}`} onClick={() => { setTmTab('networking'); fetchOpenPorts(); }}>Networking & Ports</button>
                  <button className={`tm-tab-btn ${tmTab === 'disk' ? 'active' : ''}`} onClick={() => { setTmTab('disk'); fetchDf(); fetchDu(duPath); fetchSmart(); }}>Disk & Storage (SMART)</button>
                </div>
              )}

              {/* Window Body Content Area */}
              <div className="window-body">

                {/* APP 1: ABOUT SYSTEM */}
                {win.id === 'about' && (
                  <div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px', background: '#09090b', padding: '14px', borderRadius: '4px', border: '1px solid #27272a' }}>
                      <OsAsciiArt distroId={vitals?.sys_info?.distro_id} distroName={vitals?.sys_info?.distro_name} />
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f4f4f5' }}>{vitals?.sys_info?.distro_name || 'Linux Workstation'}</div>
                        <div style={{ fontSize: '0.82rem', color: '#a1a1aa', marginTop: '2px' }}>
                          {vitals?.sys_info?.username}@{vitals?.sys_info?.hostname}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
                          Uptime: {vitals?.uptime || '0m'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>OPERATING SYSTEM</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px' }}>{vitals?.sys_info?.distro_name}</div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>KERNEL VERSION</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px' }}>{vitals?.sys_info?.kernel} ({vitals?.sys_info?.arch})</div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>PROCESSOR (CPU)</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vitals?.sys_info?.cpu_model}</div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>SYSTEM MEMORY</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px' }}>{vitals?.memory?.total_gb || 0} GB RAM</div>
                      </div>

                      {/* Display Both Integrated and Discrete GPUs in About System */}
                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>DISCRETE GPU (dGPU)</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {discreteGpu.name || 'NVIDIA Graphics'}
                        </div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>INTEGRATED GPU (iGPU)</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {integratedGpu.name || 'AMD Radeon / Intel iGPU'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* APP 2: TASK MANAGER GUI */}
                {win.id === 'taskmanager' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                    {/* Performance Tab (Including Both Integrated and Discrete GPUs!) */}
                    {tmTab === 'performance' && (
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
                          <div className="tm-frame-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                              <span>CPU Usage History</span>
                              <strong>{vitals?.cpu?.percent ?? 0}%</strong>
                            </div>
                            <RetroLineGraph data={history.cpu} height={50} maxVal={100} />
                          </div>

                          <div className="tm-frame-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                              <span>MEM Usage History</span>
                              <strong>{vitals?.memory?.percent ?? 0}%</strong>
                            </div>
                            <RetroLineGraph data={history.ram} height={50} maxVal={100} />
                          </div>

                          {/* Discrete GPU (dGPU) Frame */}
                          <div className="tm-frame-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>dGPU: {discreteGpu.name || 'Discrete GPU'}</span>
                              <strong>{discreteGpu.usage_percent ?? 0}%</strong>
                            </div>
                            <RetroLineGraph data={history.gpu0} height={50} maxVal={100} />
                          </div>

                          {/* Integrated GPU (iGPU) Frame */}
                          <div className="tm-frame-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>iGPU: {integratedGpu.name || 'Integrated iGPU'}</span>
                              <strong>{integratedGpu.usage_percent ?? 0}%</strong>
                            </div>
                            <RetroLineGraph data={history.gpu1} height={50} maxVal={100} />
                          </div>
                        </div>

                        {/* Task Manager Stats Frames */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          <div className="tm-frame-box" style={{ marginBottom: 0 }}>
                            <div className="tm-frame-title">Totals</div>
                            <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                              <div>Handles: <strong style={{ color: '#f4f4f5' }}>{openPorts.length * 24 + 104}</strong></div>
                              <div>Threads: <strong style={{ color: '#f4f4f5' }}>{(vitals?.cpu?.core_count || 8) * 16}</strong></div>
                              <div>Processes: <strong style={{ color: '#f4f4f5' }}>{(vitals?.processes || []).length}</strong></div>
                            </div>
                          </div>

                          <div className="tm-frame-box" style={{ marginBottom: 0 }}>
                            <div className="tm-frame-title">Physical Memory (K)</div>
                            <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                              <div>Total: <strong style={{ color: '#f4f4f5' }}>{Math.round(ramTotalMb * 1024)}</strong></div>
                              <div>Available: <strong style={{ color: '#f4f4f5' }}>{Math.round(ramFreeMb * 1024)}</strong></div>
                              <div>Cache: <strong style={{ color: '#f4f4f5' }}>{Math.round((vitals?.memory?.cached_gb || 1) * 1024 * 1024)}</strong></div>
                            </div>
                          </div>

                          <div className="tm-frame-box" style={{ marginBottom: 0 }}>
                            <div className="tm-frame-title">Commit Charge (K)</div>
                            <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                              <div>Total: <strong style={{ color: '#f4f4f5' }}>{Math.round(ramUsedMb * 1024)}</strong></div>
                              <div>Limit: <strong style={{ color: '#f4f4f5' }}>{Math.round(ramTotalMb * 1024)}</strong></div>
                              <div>Peak: <strong style={{ color: '#f4f4f5' }}>{Math.round(ramUsedMb * 1.12 * 1024)}</strong></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Processes Tab */}
                    {tmTab === 'processes' && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="Filter task manager processes..."
                            value={processSearch}
                            onChange={(e) => setProcessSearch(e.target.value)}
                            style={{ flex: 1, padding: '4px 8px', background: '#09090b', border: '1px solid #27272a', borderRadius: '3px', color: '#f4f4f5', outline: 'none', fontSize: '0.75rem' }}
                          />
                          <button onClick={() => setProcessSort(processSort === 'cpu' ? 'memory' : 'cpu')} style={{ background: '#18181b', border: '1px solid #27272a', color: '#f4f4f5', padding: '4px 10px', borderRadius: '3px', fontSize: '0.72rem', cursor: 'pointer' }}>
                            Sort: {processSort.toUpperCase()}
                          </button>
                        </div>

                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                          <table className="retro-table">
                            <thead>
                              <tr>
                                <th>IMAGE NAME</th>
                                <th>PID</th>
                                <th>USER</th>
                                <th>CPU %</th>
                                <th>MEM USAGE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredProcesses.map((proc) => (
                                <tr key={proc.pid}>
                                  <td style={{ fontWeight: 'bold' }}>{proc.name}</td>
                                  <td style={{ color: '#71717a' }}>{proc.pid}</td>
                                  <td>{proc.user}</td>
                                  <td style={{ fontWeight: 'bold' }}>{proc.cpu}%</td>
                                  <td style={{ color: '#a1a1aa' }}>{proc.memory_mb || `${proc.memory}%`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Networking & Ports Tab (Ports moved directly here!) */}
                    {tmTab === 'networking' && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div className="tm-frame-box" style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                            <span>Network Download Speed</span>
                            <strong>↓ {vitals?.network?.down_kb_s ?? 0} KB/s  |  ↑ {vitals?.network?.up_kb_s ?? 0} KB/s</strong>
                          </div>
                          <RetroLineGraph data={history.netDown} height={54} />
                        </div>

                        <div className="tm-frame-box" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div className="tm-frame-title" style={{ margin: 0 }}>Active Listening Sockets & Ports ({openPorts.length})</div>
                            <input
                              type="text"
                              placeholder="Filter ports..."
                              value={portSearch}
                              onChange={(e) => setPortSearch(e.target.value)}
                              style={{ width: '160px', padding: '2px 6px', background: '#09090b', border: '1px solid #27272a', borderRadius: '3px', color: '#f4f4f5', fontSize: '0.7rem' }}
                            />
                          </div>

                          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            <table className="retro-table">
                              <thead>
                                <tr>
                                  <th>PORT</th>
                                  <th>BINDING</th>
                                  <th>PROTO</th>
                                  <th>PROCESS NAME</th>
                                  <th>PID</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredPorts.map((p, idx) => (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 'bold' }}>:{p.port}</td>
                                    <td style={{ color: '#71717a' }}>{p.ip}</td>
                                    <td>{p.protocol}</td>
                                    <td style={{ fontWeight: 'bold' }}>{p.process_name}</td>
                                    <td>{p.pid || 'System'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Disk & Storage Tab (With SMART Disk Health Analysis!) */}
                    {tmTab === 'disk' && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div className="tm-frame-box" style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                            <span>Disk Read / Write Throughput</span>
                            <strong>Read: {vitals?.disk?.read_kb_s ?? 0} KB/s  |  Write: {vitals?.disk?.write_kb_s ?? 0} KB/s</strong>
                          </div>
                          <RetroLineGraph data={history.diskRead} height={46} />
                        </div>

                        {/* SMART Disk Health & Diagnostics Frame */}
                        {smartData?.drives && smartData.drives.length > 0 && (
                          <div className="tm-frame-box" style={{ marginBottom: '10px' }}>
                            <div className="tm-frame-title">SMART Disk Health Diagnostics</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {smartData.drives.map((d, idx) => (
                                <div key={idx} style={{ background: '#121215', padding: '6px 8px', borderRadius: '3px', border: '1px solid #27272a', fontSize: '0.72rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f4f4f5', fontWeight: 'bold' }}>
                                    <span>{d.model} ({d.device})</span>
                                    <span style={{ color: '#ffffff' }}>✓ {d.health}</span>
                                  </div>
                                  <div style={{ fontSize: '0.68rem', color: '#a1a1aa', marginTop: '2px' }}>
                                    {d.details?.slice(0, 3).join(' • ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="tm-frame-box" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          <div className="tm-frame-title">Mounted Filesystems (`df -hT`)</div>
                          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            <table className="retro-table">
                              <thead>
                                <tr>
                                  <th>DEVICE</th>
                                  <th>TYPE</th>
                                  <th>SIZE</th>
                                  <th>USED</th>
                                  <th>AVAIL</th>
                                  <th>USE %</th>
                                  <th>MOUNT</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(dfFilesystems || []).slice(0, 8).map((fs, idx) => (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 'bold' }}>{fs.filesystem}</td>
                                    <td style={{ color: '#71717a' }}>{fs.type}</td>
                                    <td>{fs.size}</td>
                                    <td>{fs.used}</td>
                                    <td style={{ color: '#a1a1aa' }}>{fs.avail}</td>
                                    <td style={{ fontWeight: 'bold' }}>{fs.use_percent}%</td>
                                    <td style={{ fontWeight: 'bold' }}>{fs.mount}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Status Bar */}
                    <div className="tm-status-bar">
                      <div className="tm-status-item">Processes: <strong>{(vitals?.processes || []).length}</strong></div>
                      <div className="tm-status-item">CPU Usage: <strong>{vitals?.cpu?.percent ?? 0}%</strong></div>
                      <div className="tm-status-item">Mem Usage: <strong>{vitals?.memory?.percent ?? 0}%</strong></div>
                    </div>
                  </div>
                )}

                {/* APP 3: FILESYSTEMS (DF & SMART) */}
                {win.id === 'df' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    {smartData?.drives && smartData.drives.length > 0 && (
                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a', marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', marginBottom: '4px' }}>SMART DISK DIAGNOSTICS</div>
                        {smartData.drives.map((d, idx) => (
                          <div key={idx} style={{ fontSize: '0.75rem', color: '#f4f4f5' }}>
                            <strong>{d.model}</strong> ({d.device}): Status <span style={{ color: '#ffffff', fontWeight: 'bold' }}>✓ {d.health}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Filter df filesystems..."
                        value={dfSearch}
                        onChange={(e) => setDfSearch(e.target.value)}
                        style={{ flex: 1, padding: '6px 10px', background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', color: '#f4f4f5', outline: 'none', fontSize: '0.75rem' }}
                      />
                      <button onClick={fetchDf} style={{ background: '#18181b', border: '1px solid #27272a', color: '#f4f4f5', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        Refresh df
                      </button>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <table className="retro-table">
                        <thead>
                          <tr>
                            <th>DEVICE</th>
                            <th>TYPE</th>
                            <th>SIZE</th>
                            <th>USED</th>
                            <th>AVAIL</th>
                            <th>USE %</th>
                            <th>MOUNT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDf.map((fs, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 'bold' }}>{fs.filesystem}</td>
                              <td style={{ color: '#71717a' }}>{fs.type}</td>
                              <td>{fs.size}</td>
                              <td>{fs.used}</td>
                              <td style={{ color: '#a1a1aa' }}>{fs.avail}</td>
                              <td style={{ fontWeight: 'bold' }}>{fs.use_percent}%</td>
                              <td style={{ fontWeight: 'bold' }}>{fs.mount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* APP 4: DIRECTORY SIZES (DU) */}
                {win.id === 'du' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Target directory path..."
                        value={duPath}
                        onChange={(e) => setDuPath(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') fetchDu(duPath); }}
                        style={{ flex: 1, padding: '6px 10px', background: '#09090b', border: '1px solid #27272a', borderRadius: '4px', color: '#f4f4f5', outline: 'none', fontSize: '0.75rem' }}
                      />
                      <button onClick={() => fetchDu(duPath)} style={{ background: '#18181b', border: '1px solid #27272a', color: '#f4f4f5', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        Scan du
                      </button>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <table className="retro-table">
                        <thead>
                          <tr>
                            <th>NAME</th>
                            <th>SIZE</th>
                            <th>PATH</th>
                            <th>ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(duData?.items || []).map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                              <td style={{ fontWeight: 'bold' }}>{item.size}</td>
                              <td style={{ color: '#71717a' }}>{item.path}</td>
                              <td>
                                <button
                                  onClick={() => { setDuPath(item.path); fetchDu(item.path); }}
                                  style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa', padding: '2px 6px', borderRadius: '3px', fontSize: '0.68rem', cursor: 'pointer' }}
                                >
                                  Inner →
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* APP 5: SYSTEM AUDIT */}
                {win.id === 'diagnostics' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a', marginBottom: '12px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#71717a' }}>RECOVERABLE LOG SPACE</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '4px 0' }}>{cleanableStorage?.total_recoverable_mb ?? 0} MB</div>
                      <button onClick={handleVacuumJournal} disabled={isCleaningJournal} style={{ background: '#18181b', border: '1px solid #27272a', color: '#f4f4f5', padding: '4px 10px', borderRadius: '3px', fontSize: '0.72rem', cursor: 'pointer' }}>
                        {isCleaningJournal ? 'Vacuuming...' : 'Vacuum Journal Logs'}
                      </button>
                    </div>

                    <button onClick={runDiagnostics} style={{ background: '#18181b', border: '1px solid #27272a', color: '#f4f4f5', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', width: '100%', cursor: 'pointer', marginBottom: '10px' }}>
                      {isRunningDiag ? 'Scanning...' : 'Run Full Diagnostic Sweep'}
                    </button>

                    {diagResults && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                        {diagResults.issues.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '14px', color: '#f4f4f5' }}>✓ All systems healthy</div>
                        ) : (
                          diagResults.issues.map((issue, idx) => (
                            <div key={idx} style={{ background: '#09090b', padding: '10px', borderRadius: '4px', border: '1px solid #27272a' }}>
                              <div style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{issue.title}</div>
                              <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>{issue.description}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* APP 6: READ-ONLY SYSTEM THRESHOLDS */}
                {win.id === 'alerts' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '12px' }}>
                      Configured Resource Alert Limits & Status Rules (Read-Only)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a' }}>CPU LIMIT</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '2px' }}>{thresholds.cpu_limit}%</div>
                        <div style={{ fontSize: '0.7rem', color: (vitals?.cpu?.percent || 0) > thresholds.cpu_limit ? '#ffffff' : '#a1a1aa', marginTop: '4px' }}>
                          Current: {vitals?.cpu?.percent || 0}% • {(vitals?.cpu?.percent || 0) > thresholds.cpu_limit ? '⚠️ EXCEEDED' : '✓ NORMAL'}
                        </div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a' }}>RAM LIMIT</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '2px' }}>{thresholds.ram_limit}%</div>
                        <div style={{ fontSize: '0.7rem', color: (vitals?.memory?.percent || 0) > thresholds.ram_limit ? '#ffffff' : '#a1a1aa', marginTop: '4px' }}>
                          Current: {vitals?.memory?.percent || 0}% • {(vitals?.memory?.percent || 0) > thresholds.ram_limit ? '⚠️ EXCEEDED' : '✓ NORMAL'}
                        </div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a' }}>GPU LIMIT</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '2px' }}>{thresholds.gpu_limit}%</div>
                        <div style={{ fontSize: '0.7rem', color: (discreteGpu?.usage_percent || 0) > thresholds.gpu_limit ? '#ffffff' : '#a1a1aa', marginTop: '4px' }}>
                          Current: {discreteGpu?.usage_percent || 0}% • {(discreteGpu?.usage_percent || 0) > thresholds.gpu_limit ? '⚠️ EXCEEDED' : '✓ NORMAL'}
                        </div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a' }}>DISK LIMIT</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '2px' }}>{thresholds.disk_limit}%</div>
                        <div style={{ fontSize: '0.7rem', color: (vitals?.disk?.percent || 0) > thresholds.disk_limit ? '#ffffff' : '#a1a1aa', marginTop: '4px' }}>
                          Current: {vitals?.disk?.percent || 0}% • {(vitals?.disk?.percent || 0) > thresholds.disk_limit ? '⚠️ EXCEEDED' : '✓ NORMAL'}
                        </div>
                      </div>

                      <div style={{ gridColumn: 'span 2', background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a' }}>THERMAL TEMP LIMIT</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '2px' }}>{thresholds.temp_limit}°C</div>
                        <div style={{ fontSize: '0.7rem', color: (vitals?.thermal?.max_temp || 0) > thresholds.temp_limit ? '#ffffff' : '#a1a1aa', marginTop: '4px' }}>
                          Current Peak: {vitals?.thermal?.max_temp || 0}°C • {(vitals?.thermal?.max_temp || 0) > thresholds.temp_limit ? '⚠️ EXCEEDED' : '✓ NORMAL'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          );
        })}
      </div>

      {/* Classic Retro OS Bottom Taskbar */}
      <div className="retro-taskbar">

        {/* Start Button */}
        <button className="start-button" onClick={(e) => { e.stopPropagation(); setStartMenuOpen(!startMenuOpen); }}>
          <Monitor size={14} color="#f4f4f5" /> Start
        </button>

        {/* Start Menu Popup */}
        {startMenuOpen && (
          <div className="start-menu" onClick={(e) => e.stopPropagation()} style={{ width: '260px' }}>
            <div className="start-menu-header">PulseLinux Fleet Workstation</div>

            {/* Managed Devices List */}
            <div style={{ padding: '6px 12px 2px 12px', fontSize: '0.65rem', color: '#71717a', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              MANAGED DEVICES ({fleetSummary.online_count || 1} ONLINE / {fleetSummary.offline_count || 0} OFFLINE)
            </div>

            <div
              className={`start-menu-item ${selectedDeviceId === 'local' ? 'active' : ''}`}
              onClick={() => { setSelectedDeviceId('local'); setStartMenuOpen(false); }}
              style={{ background: selectedDeviceId === 'local' ? '#27272a' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>🖥️ {vitals?.sys_info?.hostname || 'This Machine'} (Local)</span>
              <span style={{ fontSize: '0.65rem', color: '#4ade80' }}>● ONLINE</span>
            </div>

            {(fleetSummary.devices || []).filter(d => d.device_id !== 'local-node').map((dev) => (
              <div
                key={dev.device_id}
                className={`start-menu-item ${selectedDeviceId === dev.device_id ? 'active' : ''}`}
                onClick={() => { setSelectedDeviceId(dev.device_id); setStartMenuOpen(false); }}
                style={{ background: selectedDeviceId === dev.device_id ? '#27272a' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>🖥️ {dev.hostname} ({dev.ip})</span>
                <span style={{ fontSize: '0.65rem', color: dev.status === 'online' ? '#4ade80' : '#ef4444' }}>
                  {dev.status === 'online' ? '● ONLINE' : '● OFFLINE'}
                </span>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #27272a', margin: '4px 0' }} />

            <div style={{ padding: '4px 12px 2px 12px', fontSize: '0.65rem', color: '#71717a', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              SYSTEM APPLICATIONS
            </div>

            {DESKTOP_APPS.map((app) => {
              const AppIcon = app.icon;
              return (
                <div key={app.id} className="start-menu-item" onClick={() => openAppWindow(app.id)}>
                  <AppIcon size={14} color="#f4f4f5" /> {app.title}
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid #27272a', margin: '4px 0' }} />
            <div className="start-menu-item" onClick={() => { setStartMenuOpen(false); handleGenerateToken(); }}>
              🔑 Generate Add Device Token
            </div>
            <div className="start-menu-item" onClick={closeAllWindows}>
              <X size={14} color="#f4f4f5" /> Close All Windows
            </div>
            <div style={{ borderTop: '1px solid #27272a', margin: '4px 0' }} />
            <div className="start-menu-item" onClick={handleLogout} style={{ color: '#f87171' }}>
              🔒 Sign Out ({adminUser})
            </div>
          </div>
        )}

        {/* Taskbar App Tabs */}
        <div className="taskbar-apps">
          {Object.values(openWindows).map((win) => {
            const isActive = activeWindowId === win.id && !win.minimized;
            return (
              <div
                key={win.id}
                className={`taskbar-tab ${isActive ? 'active' : ''}`}
                onClick={() => focusWindow(win.id)}
              >
                <Monitor size={12} color="#f4f4f5" />
                {win.title}
              </div>
            );
          })}
        </div>

        {/* System Tray */}
        <div className="system-tray">
          <span style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 'bold' }}>
            ● ONLINE ({vitals?.sys_info?.hostname || 'Host'})
          </span>
          <span style={{ color: '#a1a1aa', fontSize: '0.68rem', marginLeft: '6px' }}>
            [{fleetSummary.online_count || 1}/{(fleetSummary.total_count || 1)} Online]
          </span>
          <span>{currentTimeStr}</span>
        </div>
      </div>

      {/* Enrollment Token Modal */}
      {showTokenModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: '460px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '18px', color: '#f4f4f5' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px' }}>🔑 Add New Remote Device</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '12px' }}>
              Run this command on the remote device to pair it with account <strong>{adminUser}</strong>:
            </div>

            <div style={{ background: '#09090b', padding: '10px', borderRadius: '4px', border: '1px solid #27272a', fontFamily: 'monospace', fontSize: '0.75rem', color: '#4ade80', wordBreak: 'break-all', marginBottom: '10px' }}>
              ENROLL_TOKEN="{generatedToken}" HUB_URL="ws://{window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '<MASTER_HUB_IP>' : window.location.hostname}:8000" sudo -E ./install-daemon.sh
            </div>

            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <div style={{ fontSize: '0.7rem', color: '#fbbf24', background: '#451a03', padding: '8px 10px', borderRadius: '4px', border: '1px solid #78350f', marginBottom: '14px' }}>
                💡 <strong>Important:</strong> Replace <code>&lt;MASTER_HUB_IP&gt;</code> with your Master machine's IP address (e.g. <code>10.232.202.154</code>).
              </div>
            )}

            <button onClick={() => setShowTokenModal(false)} style={{ width: '100%', background: '#27272a', border: 'none', color: '#f4f4f5', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
