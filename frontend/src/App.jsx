import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Bell,
  Search,
  RefreshCw,
  Trash2,
  Folder,
  FolderOpen,
  Send,
  Zap,
  Sliders,
  Terminal,
  Layers,
  ArrowLeft,
  Key,
  Laptop,
  Check,
  X,
  Lock,
  ChevronRight,
  Database,
  BarChart2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Info
} from 'lucide-react';

export default function App() {
  // Authentication & Role
  const [adminUser, setAdminUser] = useState(localStorage.getItem('admin_user') || '');
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || '');
  const [userRole, setUserRole] = useState(localStorage.getItem('user_role') || 'admin');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Client Ping Request Modal State (Ping to connect)
  const [showPingModal, setShowPingModal] = useState(false);
  const [clientPingHostname, setClientPingHostname] = useState('');
  const [clientPingStatus, setClientPingStatus] = useState(null);
  const [isSubmittingPing, setIsSubmittingPing] = useState(false);

  // Fleet & Navigation State
  const [fleetSummary, setFleetSummary] = useState({ total_count: 1, online_count: 1, offline_count: 0, devices: [] });
  const [selectedDevice, setSelectedDevice] = useState(null); // null = Fleet Grid View; object = Drill-down Detail View
  const [activeDockTab, setActiveDockTab] = useState('overview'); // overview | diagnostics | processes | storage | chat | settings
  const [searchQuery, setSearchQuery] = useState('');

  // Pending Client Approvals Queue
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);

  // Real-time Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatBottomRef = useRef(null);

  // Notifications & Alerts
  const [systemNotifications, setSystemNotifications] = useState([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  // Per-Device Diagnostics & Task Data
  const [vitals, setVitals] = useState(null);
  const [openPorts, setOpenPorts] = useState([]);
  const [cleanableStorage, setCleanableStorage] = useState(null);
  const [dfFilesystems, setDfFilesystems] = useState([]);
  const [smartData, setSmartData] = useState(null);
  const [duPath, setDuPath] = useState('~');
  const [duData, setDuData] = useState(null);
  const [isScanningDu, setIsScanningDu] = useState(false);
  const [diagResults, setDiagResults] = useState(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [fixStatusMap, setFixStatusMap] = useState({});

  // Thresholds & Node Settings
  const [thresholds, setThresholds] = useState({ cpu_limit: 85, ram_limit: 90, disk_limit: 90, temp_limit: 80 });
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [saveAlertMsg, setSaveAlertMsg] = useState('');
  const [userPrefs, setUserPrefs] = useState({ excluded_folders: [], share_processes: true, share_gpu: true, share_disks: true });
  const [newExcludedFolder, setNewExcludedFolder] = useState('');

  // Process Manager search & sort
  const [procSearch, setProcSearch] = useState('');
  const [procSort, setProcSort] = useState('cpu');

  // Sparkline history per selected node
  const [cpuHistory, setCpuHistory] = useState([]);

  // Setup Notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Fleet WebSocket Stream
  useEffect(() => {
    if (!adminToken) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/fleet/admin?token=${adminToken}`;
    let ws;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data && typeof data.online_count === 'number') {
              setFleetSummary(data);

              // Update selected device's latest telemetry if active
              if (selectedDevice) {
                const updated = (data.devices || []).find(d => d.device_id === selectedDevice.device_id);
                if (updated && updated.latest_vitals) {
                  setVitals(updated.latest_vitals);
                  setCpuHistory(prev => [...prev.slice(-24), updated.latest_vitals.cpu?.percent || 0]);
                }
              }
            }
          } catch (e) {}
        };
        ws.onclose = () => setTimeout(connect, 3000);
      } catch (e) {}
    };

    connect();
    return () => { if (ws) ws.close(); };
  }, [adminToken, selectedDevice]);

  // Periodic polling for pending ping requests & fleet summary
  useEffect(() => {
    if (!adminToken) return;
    const fetchPendingAndFleet = async () => {
      try {
        const [pRes, fRes] = await Promise.all([
          fetch('/api/fleet/pending-requests'),
          fetch('/api/fleet/summary')
        ]);
        if (pRes.ok) {
          const d = await pRes.json();
          setPendingRequests(d.pending_requests || []);
        }
        if (fRes.ok) {
          const s = await fRes.json();
          if (s && typeof s.online_count === 'number') {
            setFleetSummary(s);
          }
        }
      } catch (e) {}
    };
    fetchPendingAndFleet();
    const interval = setInterval(fetchPendingAndFleet, 3000);
    return () => clearInterval(interval);
  }, [adminToken]);

  // Fetch device details when selected
  useEffect(() => {
    if (!selectedDevice) return;
    const devId = selectedDevice.device_id;
    setCpuHistory([]);

    // Initialize local vitals from device card
    if (selectedDevice.latest_vitals && Object.keys(selectedDevice.latest_vitals).length > 0) {
      setVitals(selectedDevice.latest_vitals);
    }

    // Load Chat History
    fetchChatMessages(devId);
    // Load Diagnostics
    fetchDiagnosticsData();
  }, [selectedDevice]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchChatMessages = async (devId) => {
    try {
      const res = await fetch(`/api/fleet/chat/${devId}`);
      if (res.ok) {
        const d = await res.json();
        setChatMessages(d.messages || []);
      }
    } catch (e) {}
  };

  const handleSendChat = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !selectedDevice) return;
    setIsSendingChat(true);
    const text = chatInput.trim();
    setChatInput('');

    try {
      const res = await fetch('/api/fleet/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: selectedDevice.device_id,
          sender: adminUser || 'Admin',
          text: text,
          is_admin: userRole === 'admin',
          is_alert: false
        })
      });
      if (res.ok) {
        const d = await res.json();
        setChatMessages(prev => [...prev, d.message]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSendingChat(false);
    }
  };

  const fetchDiagnosticsData = async () => {
    setIsRunningDiag(true);
    try {
      const [diagRes, portsRes, storageRes, dfRes, smartRes] = await Promise.all([
        fetch('/api/diagnostics/run'),
        fetch('/api/ports'),
        fetch('/api/storage/cleanable'),
        fetch('/api/sys/df'),
        fetch('/api/sys/smart')
      ]);

      if (diagRes.ok) setDiagResults(await diagRes.json());
      if (portsRes.ok) setOpenPorts(await portsRes.json());
      if (storageRes.ok) setCleanableStorage(await storageRes.json());
      if (dfRes.ok) setDfFilesystems(await dfRes.json());
      if (smartRes.ok) setSmartData(await smartRes.json());
      fetchDu('~');
    } catch (e) {} finally {
      setIsRunningDiag(false);
    }
  };

  const fetchDu = async (targetPath) => {
    setIsScanningDu(true);
    try {
      const p = targetPath !== undefined ? targetPath : duPath;
      const res = await fetch(`/api/sys/du?path=${encodeURIComponent(p || '')}&user=${encodeURIComponent(adminUser || '')}&token=${encodeURIComponent(adminToken || '')}`);
      if (res.ok) {
        const data = await res.json();
        setDuData(data);
        setDuPath(data.path || p);
      }
    } catch (err) {} finally {
      setIsScanningDu(false);
    }
  };

  const handleFixService = async (unitName, action = 'restart') => {
    const key = `${unitName}:${action}`;
    setFixStatusMap(prev => ({ ...prev, [key]: 'running' }));
    try {
      const isRemote = selectedDevice && selectedDevice.device_id !== 'local-node' && selectedDevice.device_id !== 'local';
      if (isRemote) {
        await fetch('/api/fleet/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: selectedDevice.device_id,
            action: 'fix_service',
            payload: { unit_name: unitName, action },
            token: adminToken
          })
        });
      } else {
        await fetch('/api/diagnostics/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unit_name: unitName, action })
        });
      }
      setFixStatusMap(prev => ({ ...prev, [key]: 'success' }));
      setTimeout(() => fetchDiagnosticsData(), 1200);
    } catch (err) {
      setFixStatusMap(prev => ({ ...prev, [key]: 'failed' }));
    }
  };

  const handleVacuumJournal = async () => {
    try {
      await fetch('/api/storage/vacuum-journal', { method: 'POST' });
      fetchDiagnosticsData();
    } catch (e) {}
  };

  const handleCleanPkgCache = async () => {
    try {
      await fetch('/api/storage/clean-pkg-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_versions: 2 })
      });
      fetchDiagnosticsData();
    } catch (e) {}
  };

  const handleApproveRequest = async (reqId) => {
    try {
      const res = await fetch('/api/fleet/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ req_id: reqId })
      });
      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r.req_id !== reqId));
      }
    } catch (e) {}
  };

  const handleRejectRequest = async (reqId) => {
    try {
      const res = await fetch('/api/fleet/reject-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ req_id: reqId })
      });
      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r.req_id !== reqId));
      }
    } catch (e) {}
  };

  const handlePingAdmin = async (e) => {
    if (e) e.preventDefault();
    if (!clientPingHostname.trim()) return;
    setIsSubmittingPing(true);
    setClientPingStatus(null);
    try {
      const res = await fetch('/api/fleet/ping-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: clientPingHostname.trim(),
          distro_name: 'Linux Client',
          distro_id: 'linux'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'success') {
        setClientPingStatus({ success: true, msg: '✓ Connection request sent to Administrator! Once approved, your device will link automatically.' });
      } else {
        const errorDetail = data.detail || `Server returned ${res.status}: ${res.statusText}`;
        setClientPingStatus({ success: false, msg: `Failed to send ping request: ${errorDetail}` });
      }
    } catch (e) {
      setClientPingStatus({ success: false, msg: `Network connection error: ${e.message}. Check that the backend server is running.` });
    } finally {
      setIsSubmittingPing(false);
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setAdminUser(data.username);
        setAdminToken(data.access_token);
        setUserRole(data.role || 'admin');
        localStorage.setItem('admin_user', data.username);
        localStorage.setItem('admin_token', data.access_token);
        localStorage.setItem('user_role', data.role || 'admin');
      } else {
        setLoginError(data.detail || 'Authentication failed. Check PAM credentials.');
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
    localStorage.removeItem('user_role');
    setSelectedDevice(null);
  };

  // Pre-Failure Health Scoring Engine
  const calculateDeviceHealth = (dev) => {
    if (!dev || dev.status === 'offline') return { score: 0, status: 'offline', text: 'Offline' };
    const cpu = dev.vitals_summary?.cpu || dev.latest_vitals?.cpu?.percent || 0;
    const ram = dev.vitals_summary?.ram || dev.latest_vitals?.memory?.percent || 0;
    const disk = dev.vitals_summary?.disk || dev.latest_vitals?.disk?.percent || 0;
    const temp = dev.vitals_summary?.temp || dev.latest_vitals?.thermal?.max_temp || 0;

    let deductions = 0;
    if (cpu > 85) deductions += 25;
    if (ram > 90) deductions += 25;
    if (disk > 90) deductions += 35;
    if (temp > 80) deductions += 20;

    const score = Math.max(0, 100 - deductions);
    if (score >= 85) return { score, status: 'optimal', text: 'Optimal' };
    if (score >= 60) return { score, status: 'warning', text: 'Warning' };
    return { score, status: 'critical', text: 'Critical Risk' };
  };

  // Filtered devices
  const filteredDevices = (fleetSummary.devices || []).filter(d => {
    const q = searchQuery.toLowerCase();
    return !q || d.hostname?.toLowerCase().includes(q) || d.ip?.includes(q) || d.distro_name?.toLowerCase().includes(q);
  });

  // Filtered processes
  const processesList = vitals?.processes?.list || [];
  const filteredProcesses = processesList
    .filter(p => !procSearch || p.name?.toLowerCase().includes(procSearch.toLowerCase()) || String(p.pid).includes(procSearch))
    .sort((a, b) => procSort === 'cpu' ? (b.cpu || 0) - (a.cpu || 0) : (b.memory || 0) - (a.memory || 0));

  // --- LOGIN SCREEN ---
  if (!adminToken) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(circle at 50% 30%, #161926 0%, #090a0f 70%)', color: '#f8fafc', padding: '20px' }}>
        <div style={{ width: '420px', background: 'rgba(22, 25, 36, 0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px -4px rgba(56, 189, 248, 0.5)' }}>
              <Server size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', color: '#f8fafc' }}>PulseLinux Fleet</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Multi-System Observability & Diagnostic Engine</div>
            </div>
          </div>

          <div style={{ margin: '24px 0 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }} />

          {loginError && (
            <div style={{ background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={15} /> {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Linux Account / Username
              </label>
              <input
                type="text"
                placeholder="e.g. nandhu or admin"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '8px', color: '#f8fafc', fontSize: '0.85rem', outline: 'none' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                System Password
              </label>
              <input
                type="password"
                placeholder="Local Unix PAM password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '8px', color: '#f8fafc', fontSize: '0.85rem', outline: 'none' }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              style={{ marginTop: '4px', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '8px', fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)' }}
            >
              <ShieldCheck size={16} />
              {isLoggingIn ? 'Authenticating via PAM...' : 'Sign In to Console'}
            </button>
          </form>

          {/* Client Connection Ping Modal Trigger */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ color: '#94a3b8' }}>Are you a client machine?</span>
            <button
              type="button"
              onClick={() => setShowPingModal(true)}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Laptop size={13} /> Ping Admin to Join →
            </button>
          </div>
        </div>

        {/* Client Ping Request Modal */}
        {showPingModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ width: '400px', background: '#161924', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Laptop size={18} color="#38bdf8" /> Ping Admin for Access
                </div>
                <button onClick={() => setShowPingModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4', marginBottom: '16px' }}>
                Broadcast a connection ping to the master dashboard. The administrator will see your machine in the pending approvals queue and authorize you with one click.
              </div>

              {clientPingStatus && (
                <div style={{ background: clientPingStatus.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)', border: `1px solid ${clientPingStatus.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`, color: clientPingStatus.success ? '#34d399' : '#fb7185', padding: '10px', borderRadius: '8px', fontSize: '0.75rem', marginBottom: '16px' }}>
                  {clientPingStatus.msg}
                </div>
              )}

              <form onSubmit={handlePingAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>Client Machine Name</label>
                  <input
                    type="text"
                    placeholder="e.g. dev-laptop or work-station"
                    value={clientPingHostname}
                    onChange={(e) => setClientPingHostname(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: '#090a0f', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#f8fafc', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingPing}
                  style={{ background: '#0284c7', border: 'none', color: '#ffffff', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', marginTop: '6px' }}
                >
                  {isSubmittingPing ? 'Broadcasting Ping...' : 'Send Connection Request'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- MAIN PROFESSIONAL DASHBOARD ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #131722 0%, #090a0f 75%)', color: '#f8fafc', overflow: 'hidden' }}>

      {/* TOP GLOBAL HEADER */}
      <header style={{ height: '56px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(16, 18, 26, 0.8)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, zIndex: 40 }}>
        {/* Left: Brand & Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setSelectedDevice(null)}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Server size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: 1.1 }}>PulseLinux</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Fleet Observability</div>
            </div>
          </div>

          {selectedDevice && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#94a3b8' }}>
              <span>/</span>
              <button
                onClick={() => setSelectedDevice(null)}
                style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#f8fafc', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <ArrowLeft size={13} /> Fleet Matrix
              </button>
              <span>/</span>
              <span style={{ color: '#38bdf8', fontWeight: '700' }}>{selectedDevice.hostname}</span>
            </div>
          )}
        </div>

        {/* Center: Search Filter */}
        <div style={{ width: '340px', position: 'relative' }}>
          <Search size={14} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search devices by hostname, IP, OS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 34px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', color: '#f8fafc', fontSize: '0.78rem', outline: 'none' }}
          />
        </div>

        {/* Right: Quick Stats, Approvals & User Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Cluster Summary Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
            <span style={{ padding: '3px 10px', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.25)', fontWeight: '600' }}>
              ● {fleetSummary.online_count || 1} Online
            </span>
            {fleetSummary.offline_count > 0 && (
              <span style={{ padding: '3px 10px', borderRadius: '20px', background: 'rgba(100, 116, 139, 0.12)', color: '#94a3b8', border: '1px solid rgba(100, 116, 139, 0.25)', fontWeight: '600' }}>
                {fleetSummary.offline_count} Offline
              </span>
            )}
          </div>

          {/* Pending Approval Requests Badge */}
          {pendingRequests.length > 0 && (
            <button
              onClick={() => setShowPendingDrawer(true)}
              style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Bell size={13} className="spin" /> {pendingRequests.length} Pending Approval
            </button>
          )}

          {/* User & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '8px', borderLeft: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#f8fafc' }}>{adminUser}</div>
              <div style={{ fontSize: '0.65rem', color: '#38bdf8', textTransform: 'uppercase' }}>{userRole}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              style={{ background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.25)', color: '#fb7185', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
            >
              <Lock size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* BODY CONTENT AREA */}
      <main style={{ flex: 1, minHeight: 0, position: 'relative', overflowY: 'auto', padding: '24px 32px 90px' }}>

        {/* VIEW 1: FLEET GRID (FIRST PAGE) */}
        {!selectedDevice ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.02em', color: '#f8fafc' }}>Connected Devices Matrix</h1>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Real-time telemetry and preventative pre-failure diagnostics across all enrolled infrastructure.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowPendingDrawer(true)}
                  style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#f8fafc', padding: '8px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Laptop size={14} /> Pair Client Device
                </button>
              </div>
            </div>

            {/* Device Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
              {filteredDevices.map((dev) => {
                const health = calculateDeviceHealth(dev);
                const isOnline = dev.status === 'online';
                const cpu = dev.vitals_summary?.cpu || dev.latest_vitals?.cpu?.percent || 0;
                const ram = dev.vitals_summary?.ram || dev.latest_vitals?.memory?.percent || 0;
                const disk = dev.vitals_summary?.disk || dev.latest_vitals?.disk?.percent || 0;
                const temp = dev.vitals_summary?.temp || dev.latest_vitals?.thermal?.max_temp || 0;

                return (
                  <div
                    key={dev.device_id}
                    className="device-card"
                    onClick={() => { setSelectedDevice(dev); setActiveDockTab('overview'); }}
                    style={{ borderRadius: '14px', padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                  >
                    <div>
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: isOnline ? 'rgba(56, 189, 248, 0.15)' : 'rgba(100, 116, 139, 0.15)', border: `1px solid ${isOnline ? 'rgba(56, 189, 248, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Laptop size={20} color={isOnline ? '#38bdf8' : '#94a3b8'} />
                          </div>
                          <div>
                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {dev.hostname}
                              {dev.device_id === 'local-node' && (
                                <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', background: '#2563eb', color: '#ffffff' }}>HOST</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>
                              {dev.ip} • {dev.distro_name || 'Linux'}
                            </div>
                          </div>
                        </div>

                        {/* Health Badge */}
                        <div style={{ textAlign: 'right' }}>
                          <span className={`badge-${health.status}`} style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 'bold' }}>
                            ● {health.text} ({health.score}%)
                          </span>
                        </div>
                      </div>

                      {/* Vital Gauges Row with Segmented Mini Bars */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', margin: '16px 0 16px' }}>
                        <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '10px 8px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>CPU</div>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: cpu > 80 ? '#fb7185' : '#f8fafc', margin: '2px 0 6px' }}>{cpu}%</div>
                          <div className="meter-track">
                            <div className="meter-fill" style={{ width: `${Math.min(100, cpu)}%`, background: cpu > 80 ? '#f43f5e' : (cpu > 60 ? '#f59e0b' : '#38bdf8') }} />
                          </div>
                        </div>

                        <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '10px 8px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>RAM</div>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: ram > 85 ? '#fbbf24' : '#f8fafc', margin: '2px 0 6px' }}>{ram}%</div>
                          <div className="meter-track">
                            <div className="meter-fill" style={{ width: `${Math.min(100, ram)}%`, background: ram > 85 ? '#f59e0b' : '#10b981' }} />
                          </div>
                        </div>

                        <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '10px 8px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>DISK</div>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: disk > 90 ? '#fb7185' : '#f8fafc', margin: '2px 0 6px' }}>{disk}%</div>
                          <div className="meter-track">
                            <div className="meter-fill" style={{ width: `${Math.min(100, disk)}%`, background: disk > 90 ? '#f43f5e' : '#38bdf8' }} />
                          </div>
                        </div>

                        <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '10px 8px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>TEMP</div>
                          <div style={{ fontSize: '1rem', fontWeight: '800', color: temp > 80 ? '#fb7185' : '#f8fafc', margin: '2px 0 6px' }}>{temp > 0 ? `${temp}°C` : '--'}</div>
                          <div className="meter-track">
                            <div className="meter-fill" style={{ width: `${Math.min(100, (temp / 100) * 100)}%`, background: temp > 80 ? '#f43f5e' : '#10b981' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Quick Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={12} color="#64748b" /> {dev.latest_vitals?.uptime ? `Up ${dev.latest_vitals.uptime}` : 'Active'}
                      </div>
                      <div style={{ color: '#38bdf8', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Inspect Device <ChevronRight size={13} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* VIEW 2: ELABORATE SYSTEM DETAIL VIEW FOR SELECTED DEVICE */
          <div>
            {/* Top Node Header Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(22, 25, 36, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Server size={22} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedDevice.hostname}
                    <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>● ONLINE</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>
                    IP: {selectedDevice.ip} • OS: {selectedDevice.distro_name} • Kernel: {vitals?.sys_info?.kernel || '6.x'} ({vitals?.sys_info?.arch || 'x86_64'})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={fetchDiagnosticsData}
                  disabled={isRunningDiag}
                  style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#f8fafc', padding: '8px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RefreshCw size={13} className={isRunningDiag ? 'spin' : ''} /> Refresh Telemetry
                </button>
              </div>
            </div>

            {/* TAB 1: OVERVIEW & GAUGES */}
            {activeDockTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 4 Core Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.72rem', fontWeight: '600', textTransform: 'uppercase' }}>
                      <span>Processor (CPU)</span>
                      <Cpu size={14} color="#38bdf8" />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '800', margin: '8px 0 4px', color: '#f8fafc' }}>
                      {vitals?.cpu?.percent ?? 0}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {vitals?.sys_info?.cpu_model || 'Multi-Core CPU'} ({vitals?.cpu?.cores || 8} Cores)
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.72rem', fontWeight: '600', textTransform: 'uppercase' }}>
                      <span>System Memory</span>
                      <Activity size={14} color="#34d399" />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '800', margin: '8px 0 4px', color: '#f8fafc' }}>
                      {vitals?.memory?.percent ?? 0}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {vitals?.memory?.used_gb || 0} GB used / {vitals?.memory?.total_gb || 0} GB Total
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.72rem', fontWeight: '600', textTransform: 'uppercase' }}>
                      <span>Root Storage</span>
                      <HardDrive size={14} color="#fbbf24" />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '800', margin: '8px 0 4px', color: '#f8fafc' }}>
                      {vitals?.disk?.percent ?? 0}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {vitals?.disk?.free_gb || 0} GB Free of {vitals?.disk?.total_gb || 0} GB
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.72rem', fontWeight: '600', textTransform: 'uppercase' }}>
                      <span>Network Throughput</span>
                      <Wifi size={14} color="#a855f7" />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: '800', margin: '8px 0 4px', color: '#f8fafc' }}>
                      ↓ {vitals?.network?.down_kb_s ?? 0} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>KB/s</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      ↑ {vitals?.network?.up_kb_s ?? 0} KB/s Outbound
                    </div>
                  </div>
                </div>

                {/* GPU Graphics Section */}
                {vitals?.gpu?.all_gpus && vitals.gpu.all_gpus.length > 0 && (
                  <div className="glass-panel" style={{ padding: '16px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#f8fafc', marginBottom: '12px' }}>
                      Graphics & GPU Telemetry
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                      {vitals.gpu.all_gpus.map((g, idx) => (
                        <div key={idx} style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '12px' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#f8fafc' }}>{g.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>Type: {g.type}</div>
                          <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                            <span style={{ color: '#94a3b8' }}>Load:</span>
                            <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{g.usage_percent}%</span>
                          </div>
                          {g.memory_used_mb !== undefined && (
                            <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                              <span style={{ color: '#94a3b8' }}>VRAM:</span>
                              <span>{g.memory_used_mb} / {g.memory_total_mb} MB</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PRE-FAILURE PREVENTATIVE DIAGNOSTICS */}
            {activeDockTab === 'diagnostics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(2, 132, 199, 0.1)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={16} /> Pre-Failure Early Warning Engine
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                      Scans SMART drive sector wear, kernel Out-Of-Memory events, missing firmware/drivers, and failed system services before hardware crashes.
                    </div>
                  </div>
                  <button
                    onClick={fetchDiagnosticsData}
                    disabled={isRunningDiag}
                    style={{ background: '#0284c7', border: 'none', color: '#ffffff', padding: '8px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    {isRunningDiag ? 'Scanning Subsystems...' : 'Re-run Deep Scan'}
                  </button>
                </div>

                {/* Pre-Failure Issues Detected */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', marginBottom: '14px' }}>
                    Subsystem Audit Results ({(diagResults?.issues || []).length} Detected)
                  </div>

                  {(diagResults?.issues || []).length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#34d399' }}>
                      <CheckCircle2 size={32} style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>All Systems Healthy</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>No driver errors, failed services, disk sector wear, or OOM events detected.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {diagResults.issues.map((issue, idx) => (
                        <div key={idx} style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, paddingRight: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: issue.severity === 'critical' ? '#7f1d1d' : (issue.severity === 'high' ? '#78350f' : '#27272a'), color: issue.severity === 'critical' ? '#fca5a5' : (issue.severity === 'high' ? '#fcd34d' : '#e4e4e7'), fontWeight: 'bold', textTransform: 'uppercase' }}>
                                {issue.severity}
                              </span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc' }}>{issue.title}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>{issue.description}</div>
                            {issue.solution && (
                              <div style={{ fontSize: '0.72rem', color: '#38bdf8', marginTop: '6px' }}>
                                💡 Recommended Fix: {issue.solution}
                              </div>
                            )}
                          </div>

                          {issue.unit && (
                            <button
                              onClick={() => handleFixService(issue.unit, 'restart')}
                              disabled={fixStatusMap[`${issue.unit}:restart`] === 'running'}
                              style={{ background: '#2563eb', border: 'none', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              {fixStatusMap[`${issue.unit}:restart`] === 'running' ? 'Restarting...' : '1-Click Fix'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SMART Disk Health Breakdown */}
                {smartData && (
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', marginBottom: '12px' }}>
                      SMART Physical Drive Health Analysis
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                      {(smartData.drives || []).map((drv, idx) => (
                        <div key={idx} style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#f8fafc' }}>{drv.device}</span>
                            <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: drv.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', color: drv.passed ? '#34d399' : '#fb7185', fontWeight: 'bold' }}>
                              {drv.passed ? 'PASSED' : 'FAILING'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>{drv.model || 'Solid State Drive'}</div>
                          <div style={{ marginTop: '8px', fontSize: '0.72rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Temp:</span>
                            <span>{drv.temperature ? `${drv.temperature}°C` : 'N/A'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: PROCESSES & ACTIVE PORTS */}
            {activeDockTab === 'processes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc' }}>Active Processes ({processesList.length})</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Search process name or PID..."
                        value={procSearch}
                        onChange={(e) => setProcSearch(e.target.value)}
                        style={{ padding: '6px 12px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem', outline: 'none' }}
                      />
                      <button
                        onClick={() => setProcSort(procSort === 'cpu' ? 'memory' : 'cpu')}
                        style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#f8fafc', padding: '6px 10px', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer' }}
                      >
                        Sort: {procSort.toUpperCase()}
                      </button>
                    </div>
                  </div>

                  <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>IMAGE NAME</th>
                          <th style={{ padding: '8px' }}>PID</th>
                          <th style={{ padding: '8px' }}>USER</th>
                          <th style={{ padding: '8px' }}>CPU %</th>
                          <th style={{ padding: '8px' }}>MEM USAGE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProcesses.slice(0, 40).map((p) => (
                          <tr key={p.pid} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '8px', fontWeight: '600', color: '#f8fafc' }}>{p.name}</td>
                            <td style={{ padding: '8px', color: '#64748b', fontFamily: 'monospace' }}>{p.pid}</td>
                            <td style={{ padding: '8px', color: '#94a3b8' }}>{p.user}</td>
                            <td style={{ padding: '8px', fontWeight: 'bold', color: (p.cpu || 0) > 40 ? '#fb7185' : '#f8fafc' }}>{p.cpu}%</td>
                            <td style={{ padding: '8px', color: '#94a3b8' }}>{p.memory_mb || `${p.memory}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Active Listening Ports */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc', marginBottom: '12px' }}>
                    Open Listening Ports ({openPorts.length})
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '6px' }}>PORT</th>
                          <th style={{ padding: '6px' }}>IP BINDING</th>
                          <th style={{ padding: '6px' }}>PROTO</th>
                          <th style={{ padding: '6px' }}>PROCESS</th>
                          <th style={{ padding: '6px' }}>PID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPorts.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '6px', fontWeight: 'bold', color: '#38bdf8', fontFamily: 'monospace' }}>:{p.port}</td>
                            <td style={{ padding: '6px', color: '#64748b', fontFamily: 'monospace' }}>{p.ip}</td>
                            <td style={{ padding: '6px', color: '#94a3b8' }}>{p.protocol}</td>
                            <td style={{ padding: '6px', fontWeight: '600', color: '#f8fafc' }}>{p.process_name}</td>
                            <td style={{ padding: '6px', color: '#64748b' }}>{p.pid || 'System'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: STORAGE & 1-CLICK CLEANUPS */}
            {activeDockTab === 'storage' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 3 Storage Action Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>JOURNAL LOG FILES</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f8fafc', margin: '4px 0' }}>
                        {cleanableStorage?.journal_size_mb || 0} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>MB</span>
                      </div>
                    </div>
                    <button
                      onClick={handleVacuumJournal}
                      style={{ marginTop: '10px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', padding: '6px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Vacuum Logs (7 Days)
                    </button>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>PACKAGE CACHE (PACMAN/APT)</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fbbf24', margin: '4px 0' }}>
                        {cleanableStorage?.pkg_cache_size_mb || 0} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>MB</span>
                      </div>
                    </div>
                    <button
                      onClick={handleCleanPkgCache}
                      style={{ marginTop: '10px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', padding: '6px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Clean Cache (Keep 2)
                    </button>
                  </div>

                  <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>TOTAL RECOVERABLE SPACE</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#34d399', margin: '4px 0' }}>
                        {cleanableStorage?.total_recoverable_mb || 0} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>MB</span>
                      </div>
                    </div>
                    <button
                      onClick={() => { handleVacuumJournal(); handleCleanPkgCache(); }}
                      style={{ marginTop: '10px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#ffffff', padding: '6px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Recover All Space
                    </button>
                  </div>
                </div>

                {/* Directory Explorer (du) */}
                <div className="glass-panel" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Folder size={16} color="#38bdf8" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc' }}>Directory Size Breakdown</span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <input
                      type="text"
                      value={duPath}
                      onChange={(e) => setDuPath(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') fetchDu(duPath); }}
                      style={{ flex: 1, padding: '7px 12px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: '#f8fafc', fontSize: '0.75rem' }}
                    />
                    <button
                      onClick={() => fetchDu(duPath)}
                      disabled={isScanningDu}
                      style={{ background: '#2563eb', border: 'none', color: '#ffffff', padding: '7px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      {isScanningDu ? 'Scanning...' : 'Scan Directory'}
                    </button>
                  </div>

                  <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '6px' }}>NAME</th>
                          <th style={{ padding: '6px' }}>SIZE</th>
                          <th style={{ padding: '6px' }}>PATH</th>
                          <th style={{ padding: '6px' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(duData?.items || []).map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '6px', fontWeight: '600', color: item.is_dir ? '#38bdf8' : '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {item.is_dir ? <FolderOpen size={13} color="#38bdf8" /> : <HardDrive size={13} color="#64748b" />} {item.name}
                            </td>
                            <td style={{ padding: '6px', fontWeight: 'bold', color: item.size_mb > 1024 ? '#fb7185' : '#f8fafc' }}>{item.size}</td>
                            <td style={{ padding: '6px', color: '#64748b', fontFamily: 'monospace' }}>{item.path}</td>
                            <td style={{ padding: '6px' }}>
                              {item.is_dir && (
                                <button
                                  onClick={() => fetchDu(item.path)}
                                  style={{ background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', cursor: 'pointer' }}
                                >
                                  Open
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: DIRECT CHAT & NOTIFICATIONS */}
            {activeDockTab === 'chat' && (
              <div className="glass-panel" style={{ height: '520px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc' }}>Direct Operator Chat: {selectedDevice.hostname}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Real-time communication and push notifications to this system.</div>
                  </div>
                </div>

                {/* Messages Thread */}
                <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', margin: 'auto', fontSize: '0.8rem' }}>
                      <MessageSquare size={24} style={{ margin: '0 auto 8px' }} />
                      No messages exchanged with this device yet.
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          alignSelf: msg.is_admin ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          background: msg.is_alert ? 'rgba(244, 63, 94, 0.18)' : (msg.is_admin ? '#2563eb' : 'rgba(255, 255, 255, 0.08)'),
                          border: msg.is_alert ? '1px solid rgba(244, 63, 94, 0.4)' : 'none',
                          color: msg.is_alert ? '#fca5a5' : '#ffffff',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <div style={{ fontSize: '0.65rem', color: msg.is_admin ? 'rgba(255,255,255,0.7)' : '#94a3b8', marginBottom: '2px', fontWeight: 'bold' }}>
                          {msg.sender} • {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div>{msg.text}</div>
                      </div>
                    ))
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Send Box */}
                <form onSubmit={handleSendChat} style={{ padding: '12px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder={`Message ${selectedDevice.hostname}...`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    style={{ flex: 1, padding: '10px 14px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: '#f8fafc', fontSize: '0.8rem', outline: 'none' }}
                  />
                  <button
                    type="submit"
                    disabled={isSendingChat}
                    style={{ background: '#2563eb', border: 'none', color: '#ffffff', padding: '0 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '0.8rem' }}
                  >
                    <Send size={14} /> Send
                  </button>
                </form>
              </div>
            )}

            {/* TAB 6: NODE SETTINGS & EXCLUSIONS */}
            {activeDockTab === 'settings' && (
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc', marginBottom: '4px' }}>
                    Node Privacy & Excluded Folders
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Directories listed below are hidden from storage indexing, du scans, and remote telemetry audits.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter directory path to exclude (e.g. ~/private or /home/user/.gnupg)..."
                    value={newExcludedFolder}
                    onChange={(e) => setNewExcludedFolder(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: '#f8fafc', fontSize: '0.78rem' }}
                  />
                  <button
                    onClick={() => {
                      if (newExcludedFolder.trim()) {
                        setUserPrefs(prev => ({ ...prev, excluded_folders: [...(prev.excluded_folders || []), newExcludedFolder.trim()] }));
                        setNewExcludedFolder('');
                      }
                    }}
                    style={{ background: '#2563eb', border: 'none', color: '#ffffff', padding: '8px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    + Add Path
                  </button>
                </div>

                {/* Excluded paths pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(userPrefs.excluded_folders || ['~/.gnupg', '~/.ssh']).map((p, idx) => (
                    <span key={idx} style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Lock size={11} color="#f87171" /> {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FLOATING BOTTOM DOCK (For Selected Device Drilldown) */}
      {selectedDevice && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}>
          <div className="floating-dock" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(16, 18, 26, 0.92)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.14)', borderRadius: '18px', boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(56, 189, 248, 0.15)' }}>
            {[
              { id: 'overview', label: 'Overview', icon: Activity, desc: 'Live Gauges' },
              { id: 'diagnostics', label: 'Pre-Failure', icon: ShieldAlert, desc: 'Hardware & OS' },
              { id: 'processes', label: 'Processes', icon: Cpu, desc: 'Tasks & Ports' },
              { id: 'storage', label: 'Storage', icon: HardDrive, desc: 'Disks & Clean' },
              { id: 'chat', label: 'Chat & Alerts', icon: MessageSquare, desc: 'Direct Comms' },
              { id: 'settings', label: 'Settings', icon: Sliders, desc: 'Node Config' }
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeDockTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`dock-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDockTab(tab.id)}
                  style={{
                    background: isActive ? 'linear-gradient(180deg, rgba(56, 189, 248, 0.22) 0%, rgba(56, 189, 248, 0.08) 100%)' : 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid',
                    borderColor: isActive ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.06)',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    padding: '8px 16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    minWidth: '82px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 4px 12px rgba(56, 189, 248, 0.4)' : 'none'
                  }}>
                    <TabIcon size={16} color={isActive ? '#090a0f' : '#f8fafc'} />
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '-0.01em', color: isActive ? '#38bdf8' : '#e2e8f0' }}>
                    {tab.label}
                  </span>
                  <span style={{ fontSize: '0.58rem', color: isActive ? 'rgba(255,255,255,0.7)' : '#64748b', marginTop: '-2px' }}>
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* PENDING APPROVALS DRAWER */}
      {showPendingDrawer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: '520px', background: '#161924', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Laptop size={18} color="#38bdf8" /> Client Device Connection Requests
              </div>
              <button onClick={() => setShowPendingDrawer(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '16px' }}>
              Client devices that pinged this master server requesting enrollment authorization:
            </div>

            {pendingRequests.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                No pending connection pings. Run <code>curl -sSL http://{window.location.hostname}:15000/pair/pin | sudo bash</code> on client machines to connect.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                {pendingRequests.map((req) => (
                  <div key={req.req_id} style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#f8fafc' }}>{req.hostname}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>IP: {req.ip} • OS: {req.distro_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleApproveRequest(req.req_id)}
                        style={{ background: '#10b981', border: 'none', color: '#ffffff', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button
                        onClick={() => handleRejectRequest(req.req_id)}
                        style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'right' }}>
              <button
                onClick={() => setShowPendingDrawer(false)}
                style={{ background: '#2563eb', border: 'none', color: '#ffffff', padding: '8px 16px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
