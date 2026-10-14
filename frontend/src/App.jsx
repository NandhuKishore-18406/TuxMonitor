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

// Main Desktop App Definitions (Strictly Monochrome & Clean Labels)
const DESKTOP_APPS = [
  { id: 'about', title: 'About System', icon: Monitor },
  { id: 'taskmanager', title: 'Task Manager', icon: BarChart2 },
  { id: 'devices', title: 'Connected Systems', icon: HardDrive },
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

  const [selectedDeviceId, setSelectedDeviceId] = useState('local-node');
  const [localVitals, setLocalVitals] = useState(null);
  const [fleetSummary, setFleetSummary] = useState({ total_count: 1, online_count: 1, offline_count: 0, devices: [] });

  const [adminUser, setAdminUser] = useState(localStorage.getItem('admin_user') || 'nandhu');
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || 'local_polkit_session');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [tokenData, setTokenData] = useState(null);
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
        setTokenData(data);
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

  const isLocalSelected = selectedDeviceId === 'local' || selectedDeviceId === 'local-node';
  const localNode = (fleetSummary.devices || []).find(d => d.device_id === 'local-node');
  const activeDevice = isLocalSelected
    ? (localNode || { device_id: 'local-node', hostname: localNode?.hostname || localVitals?.sys_info?.hostname || 'Local Host', distro_name: localNode?.distro_name || localVitals?.sys_info?.distro_name || 'Linux', status: 'online' })
    : ((fleetSummary.devices || []).find(d => d.device_id === selectedDeviceId) || null);

  // Live Fleet Summary WebSocket & Periodic Polling Fallback
  useEffect(() => {
    let isMounted = true;
    const effectiveToken = adminToken || 'local_polkit_session';
    const fetchSummary = async () => {
      try {
        const url = `/api/fleet/summary?token=${encodeURIComponent(effectiveToken)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${effectiveToken}` }
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setFleetSummary(data);
        }
      } catch (e) {}
    };
    fetchSummary();
    const pollInterval = setInterval(fetchSummary, 2000);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const adminWsUrl = `${protocol}//${window.location.host}/ws/fleet/admin?token=${effectiveToken}`;
    let ws;
    function connectFleet() {
      try {
        ws = new WebSocket(adminWsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && typeof data.online_count === 'number' && isMounted) {
              setFleetSummary(data);
            }
          } catch(e){}
        };
        ws.onclose = () => { if (isMounted) setTimeout(connectFleet, 3000); };
      } catch(e){}
    }
    connectFleet();
    return () => { 
      isMounted = false;
      clearInterval(pollInterval);
      if (ws) ws.close(); 
    };
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

  // Initial one-time resource fetch on component mount
  useEffect(() => {
    fetchThresholds();
    fetchDf();
    fetchOpenPorts();
  }, []);

  // Dedicated Local Telemetry WebSocket stream (strictly decoupled from fleetSummary polling)
  useEffect(() => {
    if (!isLocalSelected) {
      return;
    }

    let isCancelled = false;
    let reconnectTimer = null;
    let ws = null;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/vitals`;

    function connect() {
      if (isCancelled) return;
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
            const data = JSON.parse(event.data);
            setLocalVitals(data);
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

        ws.onclose = () => {
          if (!isCancelled) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch (err) {
        if (!isCancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [isLocalSelected]);

  // When switching between devices, immediately restore cached vitals
  useEffect(() => {
    if (isLocalSelected) {
      const target = localVitals || localNode?.latest_vitals;
      if (target && Object.keys(target).length > 0) {
        setVitals(target);
        if (target.filesystems && target.filesystems.length > 0) setDfFilesystems(target.filesystems);
        if (target.open_ports) setOpenPorts(target.open_ports);
        setCleanableStorage(target.cleanable || null);
        setSmartData(target.smart || null);
        setDiagResults(target.diag || null);
      }
    } else {
      const dev = (fleetSummary.devices || []).find(d => d.device_id === selectedDeviceId);
      if (dev && dev.latest_vitals && Object.keys(dev.latest_vitals).length > 0) {
        const v = dev.latest_vitals;
        setVitals(v);
        setHistory(prev => ({
          cpu: [...prev.cpu.slice(-29), v.cpu?.percent ?? dev.vitals_summary?.cpu ?? 0],
          ram: [...prev.ram.slice(-29), v.memory?.percent ?? dev.vitals_summary?.ram ?? 0],
          gpu0: [...prev.gpu0.slice(-29), 0],
          gpu1: [...prev.gpu1.slice(-29), 0],
          netDown: [...prev.netDown.slice(-29), v.network?.down_kb_s || v.network?.download_kb_s || 0],
          netUp: [...prev.netUp.slice(-29), v.network?.up_kb_s || v.network?.upload_kb_s || 0],
          diskRead: [...prev.diskRead.slice(-29), v.disk?.read_kb_s || 0]
        }));
        if (v.filesystems && v.filesystems.length > 0) setDfFilesystems(v.filesystems);
        if (v.open_ports) setOpenPorts(v.open_ports);
        else setOpenPorts([]);
        setCleanableStorage(v.cleanable || null);
        setSmartData(v.smart || null);
        setDiagResults(v.diag || null);
      }
    }
  }, [selectedDeviceId, fleetSummary, isLocalSelected]);

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
    if (appId === 'diagnostics') runDiagnostics();
    if (appId === 'alerts') fetchThresholds();
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

  const processesList = Array.isArray(vitals?.processes)
    ? vitals.processes
    : (vitals?.processes?.list || []);

  const filteredProcesses = processesList
    .filter(p => {
      const q = processSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) ||
             p.pid.toString().includes(q) ||
             (p.user && p.user.toLowerCase().includes(q));
    })
    .sort((a, b) => b[processSort] - a[processSort]);

  const filteredDf = (dfFilesystems || []).filter(fs => {
    const q = dfSearch.toLowerCase();
    return fs.mount?.toLowerCase().includes(q) ||
           fs.filesystem?.toLowerCase().includes(q) ||
           fs.type?.toLowerCase().includes(q);
  });

  const filteredPorts = openPorts.filter(p => {
    const q = portSearch.toLowerCase();
    return p.port?.toString().includes(q) ||
           p.process_name?.toLowerCase().includes(q) ||
           p.protocol?.toLowerCase().includes(q) ||
           p.ip?.includes(q);
  });

  const ramTotalMb = vitals?.memory?.total_mb !== undefined
    ? vitals.memory.total_mb
    : (vitals?.memory?.total_gb || 16) * 1024;
  const ramUsedMb = vitals?.memory?.used_mb !== undefined
    ? vitals.memory.used_mb
    : (vitals?.memory?.used_gb || 4) * 1024;
  const ramFreeMb = vitals?.memory?.available_mb !== undefined
    ? vitals.memory.available_mb
    : (vitals?.memory?.free_gb !== undefined ? vitals.memory.free_gb * 1024 : Math.max(0, ramTotalMb - ramUsedMb));

  if (!adminToken) {
    return (
      <div className="retro-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#f4f4f5' }}>
        <div style={{ width: '380px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
          <div style={{ background: '#27272a', padding: '10px 14px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} /> PulseLinux Admin Portal (Neon DB Auth)
          </div>
          <form onSubmit={handleLogin} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>
              {isRegisterMode 
                ? 'Create a new admin account stored securely in Neon PostgreSQL DB.'
                : 'Sign in with your Neon DB admin credentials to manage systems enrolled under your account.'}
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
              {isLoggingIn ? 'Processing...' : (isRegisterMode ? 'Create Neon DB Admin Account' : 'Sign In to Fleet Manager')}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: '#a1a1aa', marginTop: '4px' }}>
              <span onClick={() => { setIsRegisterMode(!isRegisterMode); setLoginError(''); }} style={{ textDecoration: 'underline', cursor: 'pointer', color: '#38bdf8' }}>
                {isRegisterMode ? '← Back to Sign In' : 'Create New Admin Account'}
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
                  {activeDevice && (
                    <span style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '2px', background: activeDevice.status === 'online' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: activeDevice.status === 'online' ? '#4ade80' : '#ef4444' }}>
                      [{activeDevice.hostname || selectedDeviceId}]
                    </span>
                  )}
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
                      <OsAsciiArt distroId={vitals?.sys_info?.distro_id || vitals?.os?.distro_id || activeDevice?.distro_id} distroName={vitals?.sys_info?.distro_name || vitals?.os?.distro_name || activeDevice?.distro_name} />
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f4f4f5' }}>{vitals?.sys_info?.distro_name || vitals?.os?.distro_name || activeDevice?.distro_name || 'Linux Workstation'}</div>
                        <div style={{ fontSize: '0.82rem', color: '#a1a1aa', marginTop: '2px' }}>
                          {(vitals?.sys_info?.username || vitals?.os?.username || 'user')}@{(vitals?.sys_info?.hostname || vitals?.os?.hostname || activeDevice?.hostname || selectedDeviceId)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
                          Uptime: {vitals?.uptime || 'N/A'} • Status: <span style={{ color: activeDevice?.status === 'online' ? '#4ade80' : '#ef4444' }}>{activeDevice?.status?.toUpperCase() || 'ONLINE'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>OPERATING SYSTEM</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px' }}>{vitals?.sys_info?.distro_name || vitals?.os?.distro_name || activeDevice?.distro_name || 'Linux'}</div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>KERNEL VERSION</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px' }}>{vitals?.sys_info?.kernel || vitals?.os?.kernel || 'Linux 6.x'} ({vitals?.sys_info?.arch || vitals?.os?.arch || 'x86_64'})</div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>PROCESSOR (CPU)</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vitals?.sys_info?.cpu_model || vitals?.os?.cpu_model || 'Multi-Core Processor'}</div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>SYSTEM MEMORY (RAM)</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px' }}>
                          {(ramTotalMb / 1024).toFixed(1)} GB Total ({Math.round(ramTotalMb).toLocaleString()} MB)
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '3px' }}>
                          Used: <span style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{(ramUsedMb / 1024).toFixed(1)} GB ({Math.round(ramUsedMb).toLocaleString()} MB)</span> • Available: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{(ramFreeMb / 1024).toFixed(1)} GB ({Math.round(ramFreeMb).toLocaleString()} MB)</span> ({vitals?.memory?.percent ?? 0}%)
                        </div>
                      </div>

                      {/* Display Both Integrated and Discrete GPUs in About System */}
                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>DISCRETE GPU (dGPU)</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {discreteGpu.name || (isLocalSelected ? 'NVIDIA Graphics' : 'Remote Graphics')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '3px' }}>
                          {(discreteGpu.vram_total_gb || 0) > 0 || (discreteGpu.vram_total_mb || 0) > 0 ? (
                            <span>
                              VRAM: <strong style={{ color: '#f4f4f5' }}>{(discreteGpu.vram_used_gb || (discreteGpu.vram_used_mb / 1024) || 0).toFixed(1)} GB / {(discreteGpu.vram_total_gb || (discreteGpu.vram_total_mb / 1024) || 0).toFixed(1)} GB</strong> ({Math.round(discreteGpu.vram_used_mb || (discreteGpu.vram_used_gb * 1024) || 0)} / {Math.round(discreteGpu.vram_total_mb || (discreteGpu.vram_total_gb * 1024) || 0)} MB) • Load: <strong style={{ color: '#38bdf8' }}>{discreteGpu.usage_percent ?? 0}%</strong>{discreteGpu.temp_c ? ` • ${discreteGpu.temp_c}°C` : ''}
                            </span>
                          ) : (
                            <span>Load: <strong style={{ color: '#38bdf8' }}>{discreteGpu.usage_percent ?? 0}%</strong> • Shared System Memory</span>
                          )}
                        </div>
                      </div>

                      <div style={{ background: '#09090b', padding: '10px 12px', borderRadius: '4px', border: '1px solid #27272a' }}>
                        <div style={{ fontSize: '0.68rem', color: '#71717a', textTransform: 'uppercase' }}>INTEGRATED GPU (iGPU)</div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f4f4f5', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {integratedGpu.name || (isLocalSelected ? 'AMD Radeon / Intel iGPU' : 'Standard VGA')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '3px' }}>
                          {(integratedGpu.vram_total_gb || 0) > 0 || (integratedGpu.vram_total_mb || 0) > 0 ? (
                            <span>
                              VRAM: <strong style={{ color: '#f4f4f5' }}>{(integratedGpu.vram_used_gb || (integratedGpu.vram_used_mb / 1024) || 0).toFixed(1)} GB / {(integratedGpu.vram_total_gb || (integratedGpu.vram_total_mb / 1024) || 0).toFixed(1)} GB</strong> ({Math.round(integratedGpu.vram_used_mb || (integratedGpu.vram_used_gb * 1024) || 0)} / {Math.round(integratedGpu.vram_total_mb || (integratedGpu.vram_total_gb * 1024) || 0)} MB) • Load: <strong style={{ color: '#38bdf8' }}>{integratedGpu.usage_percent ?? 0}%</strong>
                            </span>
                          ) : (
                            <span>Load: <strong style={{ color: '#38bdf8' }}>{integratedGpu.usage_percent ?? 0}%</strong> • Dynamic Host Shared Memory</span>
                          )}
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
                              <strong>{vitals?.memory?.percent ?? 0}% ({(ramUsedMb / 1024).toFixed(1)} / {(ramTotalMb / 1024).toFixed(1)} GB)</strong>
                            </div>
                            <RetroLineGraph data={history.ram} height={50} maxVal={100} />
                          </div>

                          {/* Discrete GPU (dGPU) Frame */}
                          <div className="tm-frame-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>dGPU: {discreteGpu.name || 'Discrete GPU'}</span>
                              <strong>{discreteGpu.usage_percent ?? 0}% {(discreteGpu.vram_total_gb || 0) > 0 ? `(${(discreteGpu.vram_used_gb || 0).toFixed(1)}/${(discreteGpu.vram_total_gb).toFixed(1)} GB)` : ''}</strong>
                            </div>
                            <RetroLineGraph data={history.gpu0} height={50} maxVal={100} />
                          </div>

                          {/* Integrated GPU (iGPU) Frame */}
                          <div className="tm-frame-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>iGPU: {integratedGpu.name || 'Integrated iGPU'}</span>
                              <strong>{integratedGpu.usage_percent ?? 0}% {(integratedGpu.vram_total_gb || 0) > 0 ? `(${(integratedGpu.vram_used_gb || 0).toFixed(1)}/${(integratedGpu.vram_total_gb).toFixed(1)} GB)` : ''}</strong>
                            </div>
                            <RetroLineGraph data={history.gpu1} height={50} maxVal={100} />
                          </div>
                        </div>

                        {/* Task Manager Stats Frames */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          <div className="tm-frame-box" style={{ marginBottom: 0 }}>
                            <div className="tm-frame-title">Totals</div>
                            <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                              <div>Handles: <strong style={{ color: '#f4f4f5' }}>{openPorts.length > 0 ? openPorts.length * 24 + 104 : 128}</strong></div>
                              <div>Threads: <strong style={{ color: '#f4f4f5' }}>{(vitals?.cpu?.core_count || vitals?.cpu?.count || 8) * 16}</strong></div>
                              <div>Processes: <strong style={{ color: '#f4f4f5' }}>{processesList.length}</strong></div>
                            </div>
                          </div>

                          <div className="tm-frame-box" style={{ marginBottom: 0 }}>
                            <div className="tm-frame-title">Physical Memory (GB / MB)</div>
                            <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                              <div>Total: <strong style={{ color: '#f4f4f5' }}>{(ramTotalMb / 1024).toFixed(2)} GB ({Math.round(ramTotalMb).toLocaleString()} MB)</strong></div>
                              <div>Used: <strong style={{ color: '#f4f4f5' }}>{(ramUsedMb / 1024).toFixed(2)} GB ({Math.round(ramUsedMb).toLocaleString()} MB)</strong></div>
                              <div>Available: <strong style={{ color: '#4ade80' }}>{(ramFreeMb / 1024).toFixed(2)} GB ({Math.round(ramFreeMb).toLocaleString()} MB)</strong></div>
                            </div>
                          </div>

                          <div className="tm-frame-box" style={{ marginBottom: 0 }}>
                            <div className="tm-frame-title">VRAM & Swap (GB / MB)</div>
                            <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>
                              <div>dGPU: <strong style={{ color: '#f4f4f5' }}>{(discreteGpu.vram_total_gb || 0) > 0 ? `${(discreteGpu.vram_used_gb || 0).toFixed(1)}/${(discreteGpu.vram_total_gb).toFixed(1)} GB` : 'Shared Mem'}</strong></div>
                              <div>iGPU: <strong style={{ color: '#f4f4f5' }}>{(integratedGpu.vram_total_gb || 0) > 0 ? `${(integratedGpu.vram_used_gb || 0).toFixed(1)}/${(integratedGpu.vram_total_gb).toFixed(1)} GB` : 'Shared Mem'}</strong></div>
                              <div>Swap: <strong style={{ color: '#f4f4f5' }}>{vitals?.swap?.total_mb > 0 ? `${(vitals.swap.used_mb / 1024).toFixed(1)}/${(vitals.swap.total_mb / 1024).toFixed(1)} GB` : (vitals?.memory?.swap_total_gb > 0 ? `${vitals.memory.swap_used_gb}/${vitals.memory.swap_total_gb} GB` : '0 GB')}</strong></div>
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

                {/* APP 7: CONNECTED SYSTEMS (FLEET DEVICES) */}
                {win.id === 'devices' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f4f4f5' }}>
                          Registered Fleet Systems ({fleetSummary.devices?.length || 1})
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#71717a' }}>
                          Managed infrastructure registered under admin account: <strong>{adminUser}</strong>
                        </div>
                      </div>
                      <button
                        onClick={handleGenerateToken}
                        style={{ background: '#2563eb', border: 'none', color: '#ffffff', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        + Pair Device
                      </button>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Local Machine Node */}
                      <div style={{ background: isLocalSelected ? '#27272a' : '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#f4f4f5' }}>
                              🖥️ {localNode?.hostname || localVitals?.sys_info?.hostname || 'Host Workstation'} (Local Hub)
                            </span>
                            <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '2px', background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', fontWeight: 'bold' }}>● ONLINE</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '3px' }}>
                            IP: 127.0.0.1 • OS: {localNode?.distro_name || localVitals?.sys_info?.distro_name || 'Linux'} • CPU: {localNode?.vitals_summary?.cpu ?? localVitals?.cpu?.percent ?? 0}% • RAM: {localNode?.vitals_summary?.ram ?? localVitals?.memory?.percent ?? 0}% ({(ramUsedMb / 1024).toFixed(1)}/{(ramTotalMb / 1024).toFixed(1)} GB)
                            {(discreteGpu.name || integratedGpu.name) && (
                              <span> • GPU: {discreteGpu.name ? `${discreteGpu.name} (${(discreteGpu.vram_total_gb || 0) > 0 ? `${(discreteGpu.vram_total_gb).toFixed(1)} GB VRAM` : 'Discrete'})` : integratedGpu.name}</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <button
                            onClick={() => setSelectedDeviceId('local-node')}
                            disabled={isLocalSelected}
                            style={{ background: isLocalSelected ? '#18181b' : '#27272a', border: '1px solid #3f3f46', color: '#f4f4f5', padding: '5px 12px', borderRadius: '3px', fontSize: '0.72rem', cursor: isLocalSelected ? 'default' : 'pointer' }}
                          >
                            {isLocalSelected ? 'Active Target' : 'Inspect'}
                          </button>
                        </div>
                      </div>

                      {/* Remote Nodes enrolled under this admin */}
                      {(fleetSummary.devices || []).filter(d => d.device_id !== 'local-node').map((dev) => {
                        const isOnline = dev.status === 'online';
                        const isSelected = selectedDeviceId === dev.device_id;
                        return (
                          <div key={dev.device_id} style={{ background: isSelected ? '#27272a' : '#09090b', border: '1px solid #27272a', borderRadius: '4px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#f4f4f5' }}>🖥️ {dev.hostname}</span>
                                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '2px', background: isOnline ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isOnline ? '#4ade80' : '#ef4444', fontWeight: 'bold' }}>
                                  {isOnline ? '● ONLINE' : '● OFFLINE'}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '3px' }}>
                                IP: {dev.ip} • OS: {dev.distro_name || 'Linux'} • Owner: <span style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{dev.owner_admin || adminUser}</span>
                                {dev.owner_admin !== adminUser && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await fetch('/api/fleet/claim-device', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ device_id: dev.device_id, admin_user: adminUser, token: adminToken })
                                        });
                                      } catch(e) {}
                                    }}
                                    style={{ background: '#1e3a5f', border: '1px solid #2563eb', color: '#93c5fd', padding: '1px 6px', borderRadius: '3px', fontSize: '0.65rem', marginLeft: '6px', cursor: 'pointer' }}
                                    title={`Bind device strictly to ${adminUser}`}
                                  >
                                    Claim for {adminUser}
                                  </button>
                                )}
                                {dev.vitals_summary && (
                                  <span>
                                    {' '}• CPU: {dev.vitals_summary.cpu ?? 0}% • RAM: {dev.vitals_summary.ram ?? 0}%
                                    {dev.latest_vitals?.memory?.total_gb && (
                                      <span> ({(dev.latest_vitals.memory.used_gb || (dev.latest_vitals.memory.used_mb / 1024) || 0).toFixed(1)}/{(dev.latest_vitals.memory.total_gb).toFixed(1)} GB)</span>
                                    )}
                                    {dev.latest_vitals?.gpu?.available && dev.latest_vitals.gpu.name && (
                                      <span> • GPU: {dev.latest_vitals.gpu.name} ({dev.latest_vitals.gpu.usage_percent || 0}%{(dev.latest_vitals.gpu.vram_total_gb || 0) > 0 ? `, ${(dev.latest_vitals.gpu.vram_total_gb).toFixed(1)} GB VRAM` : ''})</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div>
                              <button
                                onClick={() => setSelectedDeviceId(dev.device_id)}
                                disabled={isSelected}
                                style={{ background: isSelected ? '#18181b' : '#27272a', border: '1px solid #3f3f46', color: '#f4f4f5', padding: '5px 12px', borderRadius: '3px', fontSize: '0.72rem', cursor: isSelected ? 'default' : 'pointer' }}
                              >
                                {isSelected ? 'Active Target' : 'Inspect'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
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
              className={`start-menu-item ${isLocalSelected ? 'active' : ''}`}
              onClick={() => { setSelectedDeviceId('local-node'); setStartMenuOpen(false); }}
              style={{ background: isLocalSelected ? '#27272a' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>🖥️ {localNode?.hostname || localVitals?.sys_info?.hostname || 'This Machine'} (Local)</span>
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
            ● ONLINE ({isLocalSelected ? (localNode?.hostname || localVitals?.sys_info?.hostname || 'Host') : `${activeDevice?.hostname || selectedDeviceId} (Remote)`})
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
          <div style={{ width: '480px', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '18px', color: '#f4f4f5' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px' }}>🔑 Add New Remote Device</div>
            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '12px' }}>
              Run this command on the remote device to pair it strictly with account <strong style={{ color: '#38bdf8' }}>{adminUser}</strong>:
            </div>

            <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '6px', fontWeight: 'bold' }}>
              ⚡ Option 1: One-Click Auto-Pair Daemon (Run on Remote Machine as sudo):
            </div>
            <div style={{ background: '#09090b', padding: '10px', borderRadius: '4px', border: '1px solid #27272a', fontFamily: 'monospace', fontSize: '0.75rem', color: '#4ade80', wordBreak: 'break-all', marginBottom: '12px' }}>
              {tokenData?.pin_pair_cmd || tokenData?.pair_cmd || `curl -sSL http://${tokenData?.hub_ip || window.location.hostname}:15000/pair/${tokenData?.pin || generatedToken} | sudo bash`}
            </div>

            {tokenData?.pin && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#27272a', padding: '8px 12px', borderRadius: '4px', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#d4d4d8' }}>6-Digit Pairing PIN:</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', letterSpacing: '3px', color: '#38bdf8', fontFamily: 'monospace' }}>{tokenData.pin}</span>
              </div>
            )}

            <div style={{ fontSize: '0.72rem', color: '#a1a1aa', marginBottom: '12px' }}>
              ⚡ Option 2: Instant run (bound to <strong>{adminUser}</strong>):
              <div style={{ background: '#09090b', padding: '6px 10px', borderRadius: '4px', border: '1px solid #27272a', fontFamily: 'monospace', color: '#38bdf8', marginTop: '4px', wordBreak: 'break-all' }}>
                curl -sSL "http://{tokenData?.hub_ip || window.location.hostname}:15000/connect.sh?admin={adminUser}" | bash
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: '#a1a1aa', marginBottom: '12px' }}>
              Option 3: Manual enrollment with Admin User & Password:
              <div style={{ background: '#09090b', padding: '6px 10px', borderRadius: '4px', border: '1px solid #27272a', fontFamily: 'monospace', color: '#f59e0b', marginTop: '4px', wordBreak: 'break-all' }}>
                HUB_URL="ws://{tokenData?.hub_ip || window.location.hostname}:15000" python3 agent_client.py --admin "{adminUser}" --password "YOUR_PASSWORD"
              </div>
            </div>

            <button onClick={() => setShowTokenModal(false)} style={{ width: '100%', background: '#27272a', border: 'none', color: '#f4f4f5', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
