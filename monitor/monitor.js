// ==========================================
// MONITOR.JS - V32.2 FULLY FIXED
// ==========================================

// ==========================================
// 1. CONFIGURATION
// ==========================================
const CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyA3SPSsNTwK6doYq-lpKTozGgRha9HObFI".trim(),
        authDomain: "stc-score-v3.firebaseapp.com".trim(),
        databaseURL: "https://stc-score-v3-default-rtdb.asia-southeast1.firebasedatabase.app".trim(),
        projectId: "stc-score-v3".trim(),
        storageBucket: "stc-score-v3.firebasestorage.app".trim(),
        messagingSenderId: "626214005830".trim(),
        appId: "1:626214005830:web:bd50292e589b0d34896e47".trim()
    },
    CACHE: {
        TEAMS_KEY: 'stc_teams_cache_v2',
        MAX_AGE_MS: 24 * 60 * 60 * 1000
    },
    SITE_URLS: {
        scorebar: 'https://stccricketscoreboard.vercel.app/favicon.ico',
        admin: 'https://stccricketscoreboardadmin.vercel.app/favicon.ico',
        updater: 'https://scoreupdater.vercel.app/favicon.ico',
        team: 'https://teameditor.vercel.app/favicon.ico'
    },
    INTERVALS: {
        SITE_PING: 15000,
        DB_HEALTH: 25000,
        WATCHDOG: 3000,
        TRAFFIC_UPDATE: 1000,
        CLOCK: 1000,
        ERROR_CLEAN_INTERVAL: 60000,
        ERROR_RESOLVED_KEEP_MS: 5 * 60 * 1000,
        PRESENCE_STALE_MS: 25000,
        PRESENCE_TIMEOUT_MS: 45000,
        COMMAND_MAX_AGE_MS: 5000,
        ALERT_LIST_MAX: 30,
        LOG_LIST_MAX: 50,
        OVER_HISTORY_MAX: 8,
        PING_TIMEOUT_MS: 7000
    },
    CRITICAL_SERVICES: ['admin', 'scorebar', 'updater', 'realtime']
};

// ==========================================
// 2. FIREBASE METRICS ENGINE
// ==========================================
const FirebaseMetricsEngine = {
    reads: 0, writes: 0, listenerFires: 0, activeListeners: 0,
    downloadBytes: 0, uploadBytes: 0,
    current: { reads: 0, writes: 0, listenerFires: 0, bandwidthKB: 0 },
    history: {
        reads: new Array(20).fill(0),
        writes: new Array(20).fill(0),
        listeners: new Array(20).fill(0),
        bandwidth: new Array(20).fill(0)
    },
    pathStats: new Map(),

    estimateBytes(path, data) {
        const OVERHEAD = 100;
        const pathBytes = new Blob([path || '']).size;
        let dataBytes = 0;
        try {
            if (data !== null && data !== undefined)
                dataBytes = new Blob([JSON.stringify(data)]).size;
        } catch (e) { dataBytes = 50; }
        return pathBytes + dataBytes + OVERHEAD;
    },

    trackRead(path, data) {
        this.reads++;
        this.current.reads++;
        const bytes = this.estimateBytes(path, data);
        this.downloadBytes += bytes;
        this.current.bandwidthKB += bytes / 1024;
        this._trackPath(path, 'read', bytes);
    },
    trackWrite(path, data) {
        this.writes++;
        this.current.writes++;
        const bytes = this.estimateBytes(path, data);
        this.uploadBytes += bytes;
        this.current.bandwidthKB += bytes / 1024;
        this._trackPath(path, 'write', bytes);
    },
    trackListenerFire(path, data) {
        this.listenerFires++;
        this.current.listenerFires++;
        const bytes = this.estimateBytes(path, data);
        this.downloadBytes += bytes;
        this.current.bandwidthKB += bytes / 1024;
        this._trackPath(path, 'listener', bytes);
    },
    trackListenerAttach(path) {
        this.activeListeners++;
        this.trackRead(path, null);
    },
    trackListenerDetach() {
        if (this.activeListeners > 0) this.activeListeners--;
    },

    _trackPath(path, type, bytes) {
        if (!this.pathStats.has(path)) this.pathStats.set(path, { reads: 0, writes: 0, listenerFires: 0, totalBytes: 0 });
        const stat = this.pathStats.get(path);
        if (type === 'read') stat.reads++;
        else if (type === 'write') stat.writes++;
        else if (type === 'listener') stat.listenerFires++;
        stat.totalBytes += bytes;
    },

    pushHistory() {
        this.history.reads.shift(); this.history.reads.push(this.current.reads);
        this.history.writes.shift(); this.history.writes.push(this.current.writes);
        this.history.listeners.shift(); this.history.listeners.push(this.current.listenerFires);
        this.history.bandwidth.shift(); this.history.bandwidth.push(Number(this.current.bandwidthKB.toFixed(2)));
        this.current.reads = 0; this.current.writes = 0;
        this.current.listenerFires = 0; this.current.bandwidthKB = 0;
    },

    getReadsPerMin() { return this.history.reads.slice(-10).reduce((a, b) => a + b, 0) * 6; },
    getWritesPerMin() { return this.history.writes.slice(-10).reduce((a, b) => a + b, 0) * 6; },
    getListenerFiresPerMin() { return this.history.listeners.slice(-10).reduce((a, b) => a + b, 0) * 6; },
    getReadLoadPct() { return Math.min(100, Math.round((this.history.reads[this.history.reads.length - 1] || 0) * 10)); },
    getWriteLoadPct() { return Math.min(100, Math.round((this.history.writes[this.history.writes.length - 1] || 0) * 12.5)); },
    getListenerLoadPct() { return Math.min(100, Math.round((this.history.listeners[this.history.listeners.length - 1] || 0) * 10)); },
    getBandwidthLoadPct() { return Math.min(100, Math.round((this.history.bandwidth[this.history.bandwidth.length - 1] || 0) * 10)); },

    getTotalBandwidthFormatted() {
        const totalKB = (this.downloadBytes + this.uploadBytes) / 1024;
        return totalKB < 1024 ? `${totalKB.toFixed(1)} KB` : `${(totalKB / 1024).toFixed(2)} MB`;
    },
    getDownloadFormatted() {
        const kb = this.downloadBytes / 1024;
        return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
    },
    getUploadFormatted() {
        const kb = this.uploadBytes / 1024;
        return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
    },
    getTopPaths(limit = 5) {
        return Array.from(this.pathStats.entries())
            .map(([path, stats]) => ({ path, ...stats }))
            .sort((a, b) => b.totalBytes - a.totalBytes)
            .slice(0, limit);
    },
    reset() {
        this.reads = this.writes = this.listenerFires = this.downloadBytes = this.uploadBytes = this.activeListeners = 0;
        this.current = { reads: 0, writes: 0, listenerFires: 0, bandwidthKB: 0 };
        this.history.reads.fill(0); this.history.writes.fill(0);
        this.history.listeners.fill(0); this.history.bandwidth.fill(0);
        this.pathStats.clear();
    }
};

// ==========================================
// 3. FIREBASE SDK WRAPPER
// ==========================================
function createTrackedDatabase(rawDatabase) {
    return {
        _raw: rawDatabase,
        ref(path) {
            const rawRef = rawDatabase.ref(path);
            return {
                _rawRef: rawRef,
                _path: path,
                once(eventType) {
                    return rawRef.once(eventType).then(snap => {
                        FirebaseMetricsEngine.trackRead(path, snap.val());
                        return snap;
                    });
                },
                on(eventType, callback, cancelCallback) {
                    FirebaseMetricsEngine.trackListenerAttach(path);
                    const wrappedCallback = (snap) => {
                        FirebaseMetricsEngine.trackListenerFire(path, snap.val());
                        callback(snap);
                    };
                    rawRef.on(eventType, wrappedCallback, cancelCallback);
                    return wrappedCallback;
                },
                off(eventType, callback) {
                    rawRef.off(eventType, callback);
                },
                set(data) {
                    FirebaseMetricsEngine.trackWrite(path, data);
                    return rawRef.set(data);
                },
                update(data) {
                    FirebaseMetricsEngine.trackWrite(path, data);
                    return rawRef.update(data);
                },
                push(data) {
                    FirebaseMetricsEngine.trackWrite(path, data);
                    return rawRef.push(data);
                },
                remove() {
                    FirebaseMetricsEngine.trackWrite(path, null);
                    return rawRef.remove();
                },
                onDisconnect() { return rawRef.onDisconnect(); },
                child(childPath) {
                    return createTrackedDatabase(rawDatabase).ref(`${path}/${childPath}`);
                },
                toString() { return rawRef.toString(); }
            };
        }
    };
}

// ==========================================
// 4. GLOBAL STATE
// ==========================================
let matchId = localStorage.getItem('matchId') || 'my_match_999';
let firebaseApp = null, database = null, isConnected = false;
let logPaused = false, currentTeamsVersion = 0, teamVersionListenerAttached = false;
let lastUpdaterPresenceJson = '', connectedAt = 0, rttMeasurements = [];
let preloadInProgress = false;

let alertSettings = { admin: true, updater: true, scorebar: true, sound: true };
let lastCriticalSignature = '', lastCriticalUnackSignature = '';
let acknowledgedIssues = new Set(), criticalWasVisible = false;
let audioUnlocked = false, sharedAudioContext = null;
let saveSettingsTimeout = null;

let prevMatchSnapshot = {
    runs: 0,
    wkts: 0,
    overs: '0.0',
    partRuns: 0,
    partBalls: 0
};

function debouncedSaveAlertSettings() {
    clearTimeout(saveSettingsTimeout);
    saveSettingsTimeout = setTimeout(saveAlertSettings, 300);
}

const errorStore = {
    seq: 0, map: new Map(), activeByFingerprint: new Map(), resolvedCount: 0
};

const services = {
    admin: createServiceState('admin'),
    scorebar: createServiceState('scorebar'),
    updater: createServiceState('updater'),
    team: createServiceState('team'),
    db: createDbState(),
    realtime: createRealtimeState()
};

const traffic = {
    rt: { current: 0, history: new Array(20).fill(0) },
    http: { current: 0, history: new Array(20).fill(0) }
};
const totals = { messages: 0, alerts: 0 };

const liveMatch = {
    runs: 0, wkts: 0, overs: '0.0', balls: 0, crr: '0.00',
    target: 0, totOvers: 20, winProb: 50, partRuns: 0, partBalls: 0,
    batTeam: 'BAT', bowlTeam: 'BOWL', matchType: 'limited',
    overBalls: [], freeHit: false,
    striker: { name: '--', runs: 0, balls: 0, fours: 0, sixes: 0, photo: '' },
    nonStriker: { name: '--', runs: 0, balls: 0, fours: 0, sixes: 0, photo: '' },
    bowler: { name: '--', figs: '0-0 0.0', photo: '' },
    upcoming: { show: false, name: '', photo: '' },
    profile: null
};

let updaterDeviceState = {
    online: false, name: '', pingMs: null,
    battery: { supported: false, level: null, charging: null, low: false, critical: false },
    network: {
        online: false, rawType: 'unknown', effectiveType: 'unknown',
        label: 'Unknown', signalBars: 0, signalPct: 0, downlink: 0, rtt: 0, unstable: false
    },
    autoRealtimeEnabled: true, pendingManualPush: false, lastSeen: 0
};

const playerCache = new Map();
let overHistory = [], lastRecordedOver = -1, lastRecordedScore = 0;
let globalErrorCount = 0, lastErrorResetTime = 0;

// ==========================================
// 5. STATE FACTORIES
// ==========================================
function createServiceState(name) {
    return {
        name, online: false, lastHeartbeat: 0, heartbeatCount: 0,
        ping: 0, visible: false, version: '', errors: 0, requests: 0,
        siteReachable: false, siteLatency: 0, reason: 'Waiting for presence...'
    };
}

function createDbState() {
    return {
        online: false, lastCheck: 0, ping: 0, teams: 0,
        players: 0, errors: 0, requests: 0, reason: 'Not checked yet'
    };
}

function createRealtimeState() {
    return {
        online: false, lastConnect: 0, ping: 0,
        messagesReceived: 0, errors: 0, reason: 'Connecting...'
    };
}

// ==========================================
// 6. CACHE HELPERS
// ==========================================
function loadTeamsFromCache() {
    try {
        const cached = localStorage.getItem(CONFIG.CACHE.TEAMS_KEY);
        if (!cached) return null;
        const data = JSON.parse(cached);
        if (Date.now() - (data.timestamp || 0) > CONFIG.CACHE.MAX_AGE_MS) return null;
        return data;
    } catch (e) { return null; }
}

function saveTeamsToCache(teamsData, playersData, version) {
    try {
        const existing = loadTeamsFromCache() || {};
        localStorage.setItem(CONFIG.CACHE.TEAMS_KEY, JSON.stringify({
            teams: teamsData ?? existing.teams ?? {},
            players: playersData ?? existing.players ?? {},
            version: version ?? existing.version ?? Date.now(),
            timestamp: Date.now()
        }));
    } catch (e) { }
}

// ==========================================
// 7. HELPERS
// ==========================================
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
}

function getInitial(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function oversToBalls(oversStr) {
    const parts = String(oversStr || '0.0').split('.');
    const completedOvers = parseInt(parts[0] || '0', 10) * 6;
    const rawBalls = parseInt(parts[1] || '0', 10);
    return completedOvers + Math.min(5, Math.max(0, rawBalls));
}

function calculateRRR() {
    const target = Number(liveMatch.target || 0);
    const totOvers = Number(liveMatch.totOvers || 20);
    if (target <= 0 || totOvers <= 0) return '0.00';
    const runs = Number(liveMatch.runs || 0);
    const balls = Number(liveMatch.balls || 0);
    const need = Math.max(0, target - runs);
    const maxBalls = totOvers * 6;
    const remainingBalls = Math.max(1, maxBalls - balls);
    return (need / (remainingBalls / 6)).toFixed(2);
}

function getDisplayPing(serviceKey) {
    const s = services[serviceKey];
    if (!s) return 0;
    if (serviceKey === 'realtime') return Math.max(0, Math.round(s.ping || 0));
    if (s.siteLatency > 0) return Math.round(s.siteLatency);
    if (s.ping > 0) return Math.round(s.ping);
    return 0;
}

function setAvatar(id, name, photo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = photo
        ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name || 'Player')}">`
        : getInitial(name);
}

function formatBytesClient(bytes) {
    const num = Number(bytes) || 0;
    if (num < 1024) return `${Math.round(num)} B`;
    else if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    else if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ==========================================
// 8. TOAST (was missing in Monitor)
// ==========================================
function showToast(message, type = 'success') {
    const existingToast = document.getElementById('monitorToast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'monitorToast';
    toast.style.cssText = `
        position:fixed;bottom:30px;left:50%;transform:translateX(-50%);
        padding:12px 24px;border-radius:12px;z-index:99999;
        font-size:0.85rem;font-weight:700;font-family:inherit;
        color:#fff;pointer-events:none;
        opacity:0;transition:opacity 0.3s ease;
        background:${type === 'success' ? 'rgba(34,197,94,0.92)' :
            type === 'error' ? 'rgba(239,68,68,0.92)' :
                'rgba(59,130,246,0.92)'};
        backdrop-filter:blur(8px);
        box-shadow:0 4px 20px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 2500);
}

// ==========================================
// 9. UPDATER DEVICE HELPERS
// ==========================================
function monitorSignalBarsText(bars = 0) {
    const map = ['○○○○', '●○○○', '●●○○', '●●●○', '●●●●'];
    return map[Math.max(0, Math.min(4, Math.round(bars)))] || '○○○○';
}

function ingestUpdaterDevicePresence(updaterPresence = {}) {
    const d = updaterPresence.device || {};
    updaterDeviceState = {
        online: updaterPresence.online === true,
        name: updaterPresence.name || '',
        pingMs: updaterPresence.pingMs ?? null,
        lastSeen: updaterPresence.lastSeen || 0,
        battery: {
            supported: d.battery?.supported ?? false,
            level: d.battery?.level ?? null,
            charging: d.battery?.charging ?? null,
            low: d.battery?.low ?? false,
            critical: d.battery?.critical ?? false
        },
        network: {
            online: d.network?.online ?? false,
            rawType: d.network?.rawType || 'unknown',
            effectiveType: d.network?.effectiveType || 'unknown',
            label: d.network?.label || 'Unknown',
            signalBars: d.network?.signalBars ?? 0,
            signalPct: d.network?.signalPct ?? 0,
            downlink: d.network?.downlink ?? 0,
            rtt: d.network?.rtt ?? 0,
            unstable: d.network?.unstable ?? false
        },
        autoRealtimeEnabled: d.autoRealtimeEnabled ?? true,
        pendingManualPush: d.pendingManualPush ?? false
    };
    renderUpdaterDevicePanel();
}

function setMetricTone(el, tone) {
    if (!el) return;
    el.classList.remove('good', 'warn', 'bad');
    if (tone) el.classList.add(tone);
}

function renderUpdaterDevicePanel() {
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const pill = document.getElementById('updDeviceOnlinePill');
    if (pill) {
        pill.className = 'status-pill ' + (updaterDeviceState.online ? 'online' : 'offline');
        pill.textContent = updaterDeviceState.online ? 'Online' : 'Offline';
    }
    set('updDeviceSub', updaterDeviceState.online
        ? `${updaterDeviceState.name || 'Updater'} device telemetry is live`
        : `${updaterDeviceState.name || 'Updater'} device telemetry unavailable`);
    set('updBatteryValue', updaterDeviceState.battery.supported
        ? `${updaterDeviceState.battery.level ?? '--'}%` : 'Unsupported');
    set('updBatteryMeta', !updaterDeviceState.battery.supported
        ? 'Battery API unsupported'
        : [updaterDeviceState.battery.charging ? 'Charging ⚡' : 'Discharging',
        updaterDeviceState.battery.critical ? 'Critical' : updaterDeviceState.battery.low ? 'Low' : 'Normal'].join(' • '));
    setMetricTone(document.getElementById('updBatteryCard'),
        updaterDeviceState.battery.critical ? 'bad' : updaterDeviceState.battery.low ? 'warn' : 'good');
    set('updNetworkValue', updaterDeviceState.network.online
        ? (updaterDeviceState.network.label || 'Unknown') : 'OFFLINE');
    set('updNetworkMeta', updaterDeviceState.network.online
        ? `${updaterDeviceState.network.effectiveType || 'n/a'} • RTT ${updaterDeviceState.network.rtt || 0} ms`
        : 'No internet');
    setMetricTone(document.getElementById('updNetworkCard'),
        !updaterDeviceState.network.online ? 'bad' : updaterDeviceState.network.unstable ? 'warn' : 'good');
    const signalBars = document.getElementById('updSignalBars');
    if (signalBars) {
        signalBars.textContent = monitorSignalBarsText(updaterDeviceState.network.signalBars || 0);
        signalBars.className = 'signal-bars-' + (
            (updaterDeviceState.network.signalBars || 0) >= 3 ? 'good' :
                (updaterDeviceState.network.signalBars || 0) >= 2 ? 'warn' : 'bad');
    }
    set('updSignalMeta', `${updaterDeviceState.network.signalPct || 0}% signal`);
    set('updPushModeValue', updaterDeviceState.autoRealtimeEnabled ? 'AUTO' : 'MANUAL');
    set('updPushModeMeta', updaterDeviceState.pendingManualPush
        ? 'Pending manual push'
        : (updaterDeviceState.autoRealtimeEnabled ? 'Realtime enabled' : 'Manual mode idle'));
    setMetricTone(document.getElementById('updPushCard'),
        !updaterDeviceState.autoRealtimeEnabled ? 'warn' : updaterDeviceState.pendingManualPush ? 'bad' : 'good');
    set('updPingValue', updaterDeviceState.pingMs ? `${updaterDeviceState.pingMs} ms` : '-- ms');
    set('updPingMeta', `Last seen ${updaterDeviceState.lastSeen ? new Date(updaterDeviceState.lastSeen).toLocaleTimeString() : '--'}`);
    set('updStabilityValue', !updaterDeviceState.network.online ? 'OFFLINE'
        : updaterDeviceState.network.unstable ? 'UNSTABLE' : 'STABLE');
    set('updStabilityMeta', updaterDeviceState.network.online
        ? `${updaterDeviceState.network.downlink || 0} Mbps • ${updaterDeviceState.network.rtt || 0} ms RTT`
        : 'No connection');
    setMetricTone(document.getElementById('updStabilityCard'),
        !updaterDeviceState.network.online ? 'bad' : updaterDeviceState.network.unstable ? 'warn' : 'good');
}

// ==========================================
// 10. AUDIO
// ==========================================
function unlockAudio() {
    if (audioUnlocked) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!sharedAudioContext) sharedAudioContext = new AudioCtx();
        if (sharedAudioContext.state === 'suspended') {
            sharedAudioContext.resume().then(() => {
                audioUnlocked = true;
                addLog('Audio alerts unlocked', 'ok');
            }).catch(() => { });
        } else if (sharedAudioContext.state === 'running') {
            audioUnlocked = true;
            addLog('Audio alerts unlocked', 'ok');
        }
    } catch (e) { }
}

function playAlertSound() {
    if (!alertSettings.sound || !audioUnlocked) return;
    try {
        if (!sharedAudioContext) sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume().catch(() => { });
        const ctx = sharedAudioContext, osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
        osc.type = 'sine';
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.26);
    } catch (e) { }
}

// ==========================================
// 11. ERROR TRACKING
// ==========================================
function calculateErrorWeight(category, message = '') {
    if (category === 'realtime_connection' || category === 'db_fatal') return 5;
    if (category === 'timeout' || category === 'service_offline') return 3;
    if (category === 'http_5xx') return 4;
    if (message.includes('500') || message.includes('502') || message.includes('503')) return 4;
    return 1;
}

function addTrackedError(message, category = 'general', serviceKey = null, fingerprint = null) {
    const now = Date.now();
    if (now - lastErrorResetTime > 1000) { globalErrorCount = 0; lastErrorResetTime = now; }
    if (globalErrorCount++ > 15) return;

    const fp = fingerprint || `${serviceKey || 'global'}::${category}::${message}`;
    if (errorStore.activeByFingerprint.has(fp)) {
        const existing = errorStore.map.get(errorStore.activeByFingerprint.get(fp));
        if (existing) { existing.lastSeenAt = Date.now(); return existing.id; }
    }

    const id = ++errorStore.seq;
    errorStore.map.set(id, {
        id, message, category, serviceKey, fingerprint,
        weight: calculateErrorWeight(category, message),
        active: true, createdAt: Date.now(), lastSeenAt: Date.now(), resolvedAt: 0
    });
    errorStore.activeByFingerprint.set(fp, id);
    addAlert(message, 'err');
    addLog(`[ERROR] ${message}`, 'err');
    updateErrorMetrics();
    return id;
}

function resolveErrorsByFilter(filterFn, options = {}) {
    let count = 0;
    const now = Date.now();
    const toResolve = [];
    errorStore.map.forEach((err, id) => {
        if (err.active && filterFn(err)) toResolve.push(id);
    });
    toResolve.forEach(id => {
        const err = errorStore.map.get(id);
        if (err) {
            err.active = false; err.resolvedAt = now;
            errorStore.activeByFingerprint.delete(err.fingerprint);
            errorStore.resolvedCount++; count++;
        }
    });
    if (count > 0 && !options.silent) {
        if (options.message) addAlert(options.message, 'ok');
        if (options.log) addLog(options.log, 'ok');
    }
    updateErrorMetrics();
    return count;
}

function resolveErrorsByService(serviceKey, categories = null, silent = false) {
    return resolveErrorsByFilter(
        err => err.serviceKey === serviceKey && (!categories || categories.includes(err.category)),
        { silent, message: `${serviceKey.toUpperCase()} issue(s) resolved`, log: `[RESOLVED] ${serviceKey.toUpperCase()} issues cleared` }
    );
}

function getActiveErrors() { return Array.from(errorStore.map.values()).filter(err => err.active); }
function getActiveErrorCount() { return getActiveErrors().length; }
function getActiveErrorWeight() { return getActiveErrors().reduce((sum, err) => sum + err.weight, 0); }
function getServiceActiveErrorCount(serviceKey) { return getActiveErrors().filter(err => err.serviceKey === serviceKey).length; }

function resetAllErrors() {
    errorStore.map.clear(); errorStore.activeByFingerprint.clear();
    errorStore.seq = 0; errorStore.resolvedCount = 0;
    addLog('All errors manually reset', 'ok');
    addAlert('Error registry reset by user', 'info');
    updateErrorMetrics(); updateCriticalAlert(); renderServices();
}

function cleanupResolvedErrors() {
    const now = Date.now();
    errorStore.map.forEach((err, id) => {
        if (!err.active && err.resolvedAt && (now - err.resolvedAt) > CONFIG.INTERVALS.ERROR_RESOLVED_KEEP_MS)
            errorStore.map.delete(id);
    });
    updateErrorMetrics();
}

function updateErrorMetrics() {
    const activeCount = getActiveErrorCount(), activeWeight = getActiveErrorWeight();
    const pressure = Math.min(100, Math.round((activeWeight / 24) * 100));
    setText('totalErrorsBig', String(activeCount));
    setText('activeErrorCount', `${activeCount} active`);
    setText('resolvedErrorCount', `${errorStore.resolvedCount} resolved`);
    const errorBig = document.getElementById('totalErrorsBig');
    if (errorBig) errorBig.style.color = activeCount > 0 ? 'var(--red)' : 'var(--green)';
    const errorBar = document.getElementById('errorLoadBar');
    if (errorBar) errorBar.style.width = `${pressure}%`;
    const errorText = document.getElementById('errorLoadText');
    if (errorText) errorText.textContent = `${pressure}%`;
    const errorSummaryCard = document.getElementById('errorSummaryCard');
    if (errorSummaryCard) errorSummaryCard.classList.toggle('error-border-animate', activeCount > 0);
    const logoStatusDot = document.getElementById('logoStatusDot');
    if (logoStatusDot) logoStatusDot.classList.toggle('error', activeCount > 0);
    updateErrorDecorations();
}

function updateErrorDecorations() {
    const pingMap = {
        admin: 'pingCardAdmin', scorebar: 'pingCardScorebar',
        updater: 'pingCardUpdater', realtime: 'pingCardSupabase'
    };
    Object.entries(pingMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('error-border-animate', getServiceActiveErrorCount(key) > 0);
    });
}

// ==========================================
// 12. ALERTS / LOGS
// ==========================================
function addLog(message, type = 'info') {
    if (logPaused) return;
    const container = document.getElementById('logList');
    if (!container) return;
    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.innerHTML = `<div class="item-top"><div class="item-label">${type.toUpperCase()}</div><div class="item-time">${new Date().toLocaleTimeString('en-GB')}</div></div><div class="item-msg">${escapeHtml(message)}</div>`;
    container.prepend(item);
    while (container.children.length > CONFIG.INTERVALS.LOG_LIST_MAX) container.removeChild(container.lastChild);
}

function clearLogs() { const c = document.getElementById('logList'); if (c) c.innerHTML = ''; }

function togglePauseLogs() {
    logPaused = !logPaused;
    const btn = document.getElementById('pauseLogBtn');
    if (btn) btn.textContent = logPaused ? 'Resume' : 'Pause';
}

function addAlert(message, type = 'info') {
    totals.alerts++;
    const container = document.getElementById('alertList');
    if (!container) return;
    const item = document.createElement('div');
    item.className = `alert-item ${type}`;
    item.innerHTML = `<div class="item-top"><div class="item-label">${type.toUpperCase()}</div><div class="item-time">${new Date().toLocaleTimeString('en-GB')}</div></div><div class="item-msg">${escapeHtml(message)}</div>`;
    container.prepend(item);
    while (container.children.length > CONFIG.INTERVALS.ALERT_LIST_MAX) container.removeChild(container.lastChild);
}

function clearAlerts() { const c = document.getElementById('alertList'); if (c) c.innerHTML = ''; }

function getUpdaterDeviceAlertReasons() {
    const reasons = [];
    if (updaterDeviceState.battery.critical) reasons.push({ key: 'updater_battery_critical', label: 'Updater Battery', short: 'BATTERY', reason: `Battery critically low at ${updaterDeviceState.battery.level}%` });
    else if (updaterDeviceState.battery.low) reasons.push({ key: 'updater_battery_low', label: 'Updater Battery', short: 'BATTERY', reason: `Battery low at ${updaterDeviceState.battery.level}%` });
    if (updaterDeviceState.network.online && updaterDeviceState.network.unstable) reasons.push({ key: 'updater_network_unstable', label: 'Updater Network', short: 'NETWORK', reason: `${updaterDeviceState.network.label} unstable • ${updaterDeviceState.network.signalPct}% signal` });
    if (!updaterDeviceState.network.online && updaterDeviceState.online) reasons.push({ key: 'updater_network_offline', label: 'Updater Network', short: 'NETWORK', reason: `Updater device internet is offline` });
    if (updaterDeviceState.pendingManualPush) reasons.push({ key: 'updater_manual_pending', label: 'Updater Push', short: 'PUSH', reason: `Manual push is pending` });
    return reasons;
}

// ==========================================
// 13. CRITICAL ALERT UI
// ==========================================
function getCriticalIssues() {
    const issues = [];
    CONFIG.CRITICAL_SERVICES.forEach(key => {
        const service = services[key];
        if (!isAppAlertEnabled(key)) return;
        if (key === 'realtime') {
            if (getServiceStatus('realtime') !== 'online') issues.push({ key, label: getServiceLabel(key), short: key.toUpperCase(), reason: service.reason || 'Realtime unavailable' });
            return;
        }
        if (service.online === false) issues.push({ key, label: getServiceLabel(key), short: key.toUpperCase(), reason: service.reason || 'Connection Lost' });
    });
    if (isAppAlertEnabled('updater')) issues.push(...getUpdaterDeviceAlertReasons());
    return issues;
}

function dismissCriticalIssue(serviceKey) {
    acknowledgedIssues.add(serviceKey);
    updateCriticalAlert();
}

function dismissAllCriticalIssues() {
    getCriticalIssues().forEach(i => acknowledgedIssues.add(i.key));
    updateCriticalAlert();
}

function clearAcknowledgedIssue(serviceKey) { acknowledgedIssues.delete(serviceKey); }

function pruneAcknowledgedIssues(activeIssues) {
    const activeKeys = new Set(activeIssues.map(i => i.key));
    acknowledgedIssues.forEach(k => { if (!activeKeys.has(k)) acknowledgedIssues.delete(k); });
}

function setServiceCardErrorAnimation(serviceKey, active) {
    const map = { admin: 'pingCardAdmin', scorebar: 'pingCardScorebar', updater: 'pingCardUpdater', realtime: 'pingCardSupabase' };
    const el = document.getElementById(map[serviceKey]);
    if (el) el.classList.toggle('error-border-animate', active);
}

function updateCriticalAlert() {
    const allIssues = getCriticalIssues();
    pruneAcknowledgedIssues(allIssues);
    const currentSignature = allIssues.map(i => `${i.key}:${i.reason}`).sort().join('|');
    const unacknowledgedIssues = allIssues.filter(i => !acknowledgedIssues.has(i.key));
    const isCritical = unacknowledgedIssues.length > 0;
    const unackSignature = unacknowledgedIssues.map(i => i.key).sort().join('|');
    const signatureChanged = currentSignature !== lastCriticalSignature || unackSignature !== lastCriticalUnackSignature;

    CONFIG.CRITICAL_SERVICES.forEach(k => setServiceCardErrorAnimation(k, allIssues.some(i => i.key === k)));

    const banner = document.getElementById('criticalBanner');
    const titleEl = document.getElementById('criticalTitle');
    const subEl = document.getElementById('criticalSub');
    const listEl = document.getElementById('criticalReasonList');

    if (isCritical) {
        document.body.classList.add('critical-alert');
        if (banner) banner.classList.add('show');
        if (signatureChanged) {
            if (titleEl) titleEl.textContent = unacknowledgedIssues.length === 1
                ? `${unacknowledgedIssues[0].label} Connection Lost`
                : `${unacknowledgedIssues.length} Critical Connections Lost`;
            if (subEl) subEl.textContent = 'Please check the connection immediately. Press OK to dismiss temporarily.';
            if (listEl) {
                listEl.innerHTML = unacknowledgedIssues.map(i =>
                    `<div class="critical-reason-row" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <span class="critical-service-pill">${escapeHtml(i.label)}</span>
                            <span class="critical-reason-text">${escapeHtml(i.reason)}</span>
                        </div>
                        <button class="critical-ok-btn" data-key="${escapeHtml(i.key)}">OK</button>
                    </div>`
                ).join('');

                // ✅ Safe event listeners (no inline onclick)
                listEl.querySelectorAll('.critical-ok-btn').forEach(btn => {
                    btn.addEventListener('click', () => dismissCriticalIssue(btn.dataset.key));
                });

                if (unacknowledgedIssues.length >= 1) {
                    const dismissAllDiv = document.createElement('div');
                    dismissAllDiv.style.cssText = 'text-align:center;margin-top:14px;';
                    const dismissAllBtn = document.createElement('button');
                    dismissAllBtn.className = 'critical-dismiss-all-btn';
                    dismissAllBtn.textContent = 'Dismiss All';
                    dismissAllBtn.addEventListener('click', dismissAllCriticalIssues);
                    dismissAllDiv.appendChild(dismissAllBtn);
                    listEl.appendChild(dismissAllDiv);
                }
            }
            lastCriticalSignature = currentSignature;
            lastCriticalUnackSignature = unackSignature;
        }
        if (!criticalWasVisible || signatureChanged) playAlertSound();
        criticalWasVisible = true;
    } else {
        document.body.classList.remove('critical-alert');
        if (banner) banner.classList.remove('show');
        if (listEl) listEl.innerHTML = '';
        if (criticalWasVisible) addAlert('All critical services restored', 'ok');
        criticalWasVisible = false;
        lastCriticalSignature = '';
        lastCriticalUnackSignature = '';
    }
}

// ==========================================
// 14. CLOCK / SUMMARY / TRAFFIC / METRICS UI
// ==========================================
function updateClock() {
    const now = new Date();
    setText('clock', now.toLocaleTimeString('en-GB'));
    setText('dateEl', now.toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    }).toUpperCase());
}

function initCharts() {
    renderBars('rtBars', traffic.rt.history, 'rt');
    renderBars('httpBars', traffic.http.history, 'http');
    renderBars('fmReadsBars', FirebaseMetricsEngine.history.reads, 'rt');
    renderBars('fmWritesBars', FirebaseMetricsEngine.history.writes, 'http');
    renderBars('fmListenerBars', FirebaseMetricsEngine.history.listeners, 'rt');
    renderBars('fmBandwidthBars', FirebaseMetricsEngine.history.bandwidth, 'http');
    updateFirebaseMetricsUI();
}

function renderBars(containerId, data, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (container.children.length === 0)
        for (let i = 0; i < 20; i++) {
            const b = document.createElement('div');
            b.className = 'chart-bar';
            container.appendChild(b);
        }
    const max = Math.max(...data, 1), bars = container.children;
    for (let i = 0; i < bars.length; i++) {
        const v = data[i] || 0, h = Math.max(4, Math.round((v / max) * 80));
        bars[i].style.height = `${h}px`;
        bars[i].className = 'chart-bar';
        if (v > 0) bars[i].classList.add(type === 'rt' ? 'rt-active' : 'http-active');
        if (v > 10) bars[i].classList.add('warn');
    }
}

function pushTrafficHistory() {
    traffic.rt.history.shift(); traffic.rt.history.push(traffic.rt.current); traffic.rt.current = 0;
    traffic.http.history.shift(); traffic.http.history.push(traffic.http.current); traffic.http.current = 0;
    renderBars('rtBars', traffic.rt.history, 'rt');
    renderBars('httpBars', traffic.http.history, 'http');
    FirebaseMetricsEngine.pushHistory();
    updateFirebaseMetricsUI();
    updateSummary();
}

function updateInfraBar(barId, textId, percent, textValue) {
    const bar = document.getElementById(barId), text = document.getElementById(textId);
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = textValue !== undefined ? String(textValue) : `${Math.round(percent)}%`;
}

function calculateHealthPercent() {
    let total = 0;
    ['admin', 'scorebar', 'updater', 'team', 'db', 'realtime'].forEach(k => {
        const s = getServiceStatus(k);
        if (s === 'online') total += 100;
        else if (s === 'warning') total += 50;
    });
    return Math.round(total / 6);
}

function updateFirebaseMetricsUI() {
    const e = FirebaseMetricsEngine;
    setText('fmReadsValue', String(e.reads));
    setText('fmWritesValue', String(e.writes));
    setText('fmListenerValue', String(e.listenerFires));
    setText('fmBandwidthValue', e.getTotalBandwidthFormatted());
    setText('fmReadsSub', `${e.getReadsPerMin()} / min`);
    setText('fmWritesSub', `${e.getWritesPerMin()} / min`);
    setText('fmListenerSub', `${e.getListenerFiresPerMin()} / min`);
    setText('fmBandwidthSub', `${e.getDownloadFormatted()} down · ${e.getUploadFormatted()} up`);
    updateInfraBar('fmReadLoadBar', 'fmReadLoadText', e.getReadLoadPct(), `${e.getReadLoadPct()}%`);
    updateInfraBar('fmWriteLoadBar', 'fmWriteLoadText', e.getWriteLoadPct(), `${e.getWriteLoadPct()}%`);
    updateInfraBar('fmListenerLoadBar', 'fmListenerLoadText', e.getListenerLoadPct(), `${e.getListenerLoadPct()}%`);
    updateInfraBar('fmBandwidthLoadBar', 'fmBandwidthLoadText', e.getBandwidthLoadPct(), `${e.getBandwidthLoadPct()}%`);
    renderBars('fmReadsBars', e.history.reads, 'rt');
    renderBars('fmWritesBars', e.history.writes, 'http');
    renderBars('fmListenerBars', e.history.listeners, 'rt');
    renderBars('fmBandwidthBars', e.history.bandwidth, 'http');
}

function resetFirebaseMetrics() {
    FirebaseMetricsEngine.reset();
    updateFirebaseMetricsUI();
    addLog('Firebase metrics reset', 'ok');
}

function updateSummary() {
    const healthPct = calculateHealthPercent();
    const healthColor = healthPct > 70 ? 'var(--green)' : healthPct > 40 ? 'var(--orange)' : 'var(--red)';
    const healthRing = document.getElementById('healthRing');
    if (healthRing) healthRing.style.background = `conic-gradient(${healthColor} ${healthPct}%, #1b1b1b 0%)`;
    setText('healthRingVal', `${healthPct}%`);
    setText('healthSummary', healthPct > 70 ? 'Most services healthy' : healthPct > 40 ? 'Some services degraded' : 'Critical issues');

    const rtRate = traffic.rt.history[19] || 0, rtPct = Math.min(100, rtRate * 10);
    const rtRing = document.getElementById('rtRing');
    if (rtRing) rtRing.style.background = `conic-gradient(var(--blue) ${rtPct}%, #1b1b1b 0%)`;
    setText('rtRingVal', `${rtRate}/s`);

    const dbPing = services.db.ping || 0;
    const dbPct = services.db.online ? Math.max(0, Math.min(100, 100 - Math.round(dbPing / 5))) : 0;
    const dbRing = document.getElementById('dbRing');
    if (dbRing) dbRing.style.background = `conic-gradient(var(--yellow) ${dbPct}%, #1b1b1b 0%)`;
    setText('dbRingVal', `${dbPct}%`);
    setText('dbRingSummary', services.db.online ? `Latency ${dbPing}ms` : 'DB offline');

    const chip = document.getElementById('globalChip');
    if (chip) {
        const span = chip.querySelector('span');
        if (healthPct > 70) {
            chip.style.background = 'var(--green-bg)'; chip.style.borderColor = 'var(--green-br)'; chip.style.color = 'var(--green)';
            if (span) span.textContent = 'Healthy';
        } else if (healthPct > 40) {
            chip.style.background = 'var(--orange-bg)'; chip.style.borderColor = 'var(--orange-br)'; chip.style.color = 'var(--orange)';
            if (span) span.textContent = 'Degraded';
        } else {
            chip.style.background = 'var(--red-bg)'; chip.style.borderColor = 'var(--red-br)'; chip.style.color = 'var(--red)';
            if (span) span.textContent = 'Critical';
        }
    }

    updateInfraBar('rtQualityBar', 'rtQualityText', services.realtime.online ? 100 - Math.min(100, (services.realtime.ping || 0) / 5) : 0);
    updateInfraBar('dbQualityBar', 'dbQualityText', dbPct);
    updateInfraBar('httpLoadBar', 'httpLoadText', Math.min(100, (traffic.http.history[19] || 0) * 10), traffic.http.history[19] || 0);
    updateErrorMetrics();
    updatePingBarsUI();
    updateCriticalAlert();
}

function applyPingToUI(valId, fillId, ping) {
    const valEl = document.getElementById(valId), fillEl = document.getElementById(fillId);
    if (!valEl || !fillEl) return;
    if (ping === null || ping === undefined) {
        valEl.textContent = '-- ms'; fillEl.style.width = '0%'; fillEl.style.background = 'var(--red)'; return;
    }
    valEl.textContent = `${ping} ms`;
    let width = 100, color = 'var(--green)';
    if (ping <= 60) { width = 100; color = 'var(--green)'; }
    else if (ping <= 120) { width = 80; color = 'var(--green)'; }
    else if (ping <= 220) { width = 60; color = 'var(--orange)'; }
    else if (ping <= 350) { width = 40; color = 'var(--orange)'; }
    else { width = 18; color = 'var(--red)'; }
    fillEl.style.width = `${width}%`;
    fillEl.style.background = color;
}

function updatePingBarsUI() {
    [{ key: 'admin', v: 'pmValAdmin', f: 'pmFillAdmin' },
    { key: 'scorebar', v: 'pmValScorebar', f: 'pmFillScorebar' },
    { key: 'updater', v: 'pmValUpdater', f: 'pmFillUpdater' },
    { key: 'realtime', v: 'pmValSupabase', f: 'pmFillSupabase' }
    ].forEach(a => {
        const isOnline = getServiceStatus(a.key) === 'online';
        applyPingToUI(a.v, a.f, isOnline ? getDisplayPing(a.key) : null);
    });
}

// ==========================================
// 15. FIREBASE INITIALIZATION
// ==========================================
function initFirebase() {
    try {
        if (!window.firebase) {
            addTrackedError('Firebase library failed to load', 'init', 'db', 'db::firebase_lib');
            return;
        }
        if (!firebase.apps.length) firebaseApp = firebase.initializeApp(CONFIG.FIREBASE);
        else firebaseApp = firebase.apps[0];
        database = createTrackedDatabase(firebase.database());
        addLog('Firebase initialized', 'ok');
        connectRealtime();
        preloadPlayers();
    } catch (e) {
        addTrackedError(`Init error: ${e.message}`, 'db_fatal', 'db', 'db::init');
    }
}

// ==========================================
// 16. FIREBASE REALTIME CONNECTION
// ==========================================
function connectRealtime() {
    services.realtime.reason = 'Connecting to Firebase...';
    renderServices();
    const amOnline = database.ref('.info/connected');
    const myPresenceRef = database.ref(`presence/${matchId}/monitor`);

    amOnline.on('value', (snap) => {
        if (snap.val()) {
            isConnected = true;
            services.realtime.online = true;
            services.realtime.lastConnect = Date.now();
            connectedAt = performance.now();
            services.realtime.reason = 'Connected to Firebase';
            myPresenceRef.onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            myPresenceRef.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP, version: '32.2' });
            resolveErrorsByService('realtime', ['realtime_connection'], true);
            addLog('Firebase Realtime connected', 'ok');
        } else {
            isConnected = false;
            services.realtime.online = false;
            services.realtime.reason = 'Firebase Offline';
            addTrackedError('Firebase connection lost', 'realtime_connection', 'realtime', 'realtime::connection');
        }
        renderServices(); updateSummary(); updateCriticalAlert();
    });

    database.ref(`presence/${matchId}`).on('value', (snap) => {
        const data = snap.val() || {}, now = Date.now();
        if (connectedAt > 0 && data.monitor?.online) {
            const rtt = Math.round(performance.now() - connectedAt);
            if (rtt > 0 && rtt < 10000) {
                rttMeasurements.push(rtt);
                if (rttMeasurements.length > 5) rttMeasurements.shift();
                services.realtime.ping = Math.round(rttMeasurements.reduce((a, b) => a + b, 0) / rttMeasurements.length);
            }
            connectedAt = 0;
        }

        ['admin', 'scorebar', 'updater', 'team'].forEach(app => {
            const appData = data[app];
            if (appData?.online) {
                const age = now - (appData.lastSeen || 0);
                if (age > CONFIG.INTERVALS.PRESENCE_STALE_MS) markServiceOffline(app);
                else markServiceOnline(app, { version: appData.version || 'Active', lastSeen: appData.lastSeen, pingMs: appData.pingMs || 0 });
            } else markServiceOffline(app);
        });

        if (data.updater) {
            const newJson = JSON.stringify(data.updater);
            if (newJson !== lastUpdaterPresenceJson) {
                lastUpdaterPresenceJson = newJson;
                ingestUpdaterDevicePresence(data.updater);
            }
        } else {
            if (lastUpdaterPresenceJson !== '') {
                lastUpdaterPresenceJson = '';
                ingestUpdaterDevicePresence({});
            }
        }

        renderServices(); updateSummary(); updateCriticalAlert();
    });

    database.ref(`matches/${matchId}/live`).on('value', (snap) => {
        const data = snap.val();
        if (data) {
            traffic.rt.current++;
            totals.messages++;
            services.realtime.messagesReceived++;
            handleLiveData(data).catch(err => {
                console.error('handleLiveData error:', err);
                addLog(`Live data parse error: ${err.message}`, 'err');
            });
        }
    });

    // ✅ God Mode command listener - FIXED
    database.ref(`matches/${matchId}/command`).on('value', (snap) => {
        const cmd = snap.val();
        if (!cmd?.ts) return;
        if (Date.now() - cmd.ts > CONFIG.INTERVALS.COMMAND_MAX_AGE_MS) return;

        if (cmd.event === 'force_reload') {
            if (cmd.payload?.target === 'monitor' || cmd.payload?.target === 'all') {
                addLog('Force reload command received', 'warn');
                setTimeout(() => location.reload(), 500);
            }
        }

        if (cmd.event === 'show_profile' && cmd.payload) {
            liveMatch.profile = cmd.payload;
            renderProfile(cmd.payload);
            addLog(`Profile broadcast: ${cmd.payload.name || 'Unknown'}`, 'info');
        }

        if (cmd.event === 'hide_graphics') {
            liveMatch.profile = null;
            liveMatch.upcoming = { show: false, name: '', photo: '' };
            renderProfile(null);
            renderLiveMatch();
            addLog('Hide graphics command received', 'warn');
        }

        if (cmd.event === 'trigger_hype') addLog(`Hype triggered: ${cmd.payload?.type || 'UNKNOWN'}`, 'info');
        if (cmd.event === 'show_summary') addLog(`Summary command received: ${cmd.payload?.type || 'summary'}`, 'info');

        // ✅ God Mode Alert - Monitor side shows a log
        if (cmd.event === 'alert_message' && cmd.payload) {
            const msg = cmd.payload.message || '';
            const from = cmd.payload.from || 'GOD MODE';
            addAlert(`🎮 ${from}: ${msg}`, 'warn');
            // ✅ PATCHED: "received" instead of "sent"
            addLog(`God Mode Alert received from ${from}: "${msg}"`, 'info');
        }
    });
}

function markServiceOnline(appKey, meta = {}) {
    const service = services[appKey];
    if (!service) return;
    const wasOffline = !service.online;
    clearAcknowledgedIssue(appKey);
    service.online = true;
    service.lastHeartbeat = meta.lastSeen || Date.now();
    service.heartbeatCount++;
    service.version = meta.version || '';
    service.ping = meta.pingMs || service.ping || 0;
    service.reason = `Connected${service.version ? ` • v${service.version}` : ''}`;
    resolveErrorsByService(appKey, ['service_offline', 'timeout'], true);
    if (wasOffline) {
        addLog(`${appKey.toUpperCase()} connected`, 'ok');
        addAlert(`${appKey.toUpperCase()} is now online`, 'ok');
        triggerDataRoute(appKey);
    }
}

function markServiceOffline(appKey) {
    const service = services[appKey];
    if (!service || !service.online) return;
    service.online = false;
    service.reason = 'Connection lost (Presence)';
    addTrackedError(`${appKey.toUpperCase()} connection lost`, 'service_offline', appKey, `${appKey}::offline`);
    addLog(`${appKey.toUpperCase()} connection lost`, 'err');
}

// ==========================================
// 17. PLAYER CACHE / TEAM CACHE
// ==========================================
async function preloadPlayers(forceRefresh = false) {
    if (!database || preloadInProgress) return;
    preloadInProgress = true;
    try {
        let teamsData = {}, playersData = {}, usedCache = false, version = Date.now();
        if (!forceRefresh) {
            const cached = loadTeamsFromCache();
            if (cached?.players) {
                const serverVersion = await getTeamsServerVersion();
                if (serverVersion <= (cached.version || 0)) {
                    teamsData = cached.teams || {}; playersData = cached.players || {};
                    version = cached.version || Date.now(); usedCache = true;
                    addLog(`Loaded ${Object.keys(playersData).length} players from cache`, 'ok');
                }
            }
        }
        if (!usedCache) {
            const [teamsSnap, playersSnap, versionSnap] = await Promise.all([
                database.ref('teams').once('value'),
                database.ref('players').once('value'),
                database.ref('data_version/teams').once('value')
            ]);
            teamsData = teamsSnap.val() || {}; playersData = playersSnap.val() || {};
            version = versionSnap.val() || Date.now();
            saveTeamsToCache(teamsData, playersData, version);
            addLog(`Loaded ${Object.keys(playersData).length} players from Firebase`, 'ok');
        }
        playerCache.clear();
        Object.values(playersData || {}).forEach(p => {
            if (p.name) playerCache.set(p.name.trim().toLowerCase(), {
                name: p.name, role: p.role || '', school: p.school || '',
                age: p.age || '', photo: p.photo_url || p.photo_base64 || ''
            });
        });
        services.db.teams = Object.keys(teamsData || {}).length;
        services.db.players = Object.keys(playersData || {}).length;
        setupTeamsVersionListener();
    } catch (e) {
        addLog(`Player preload failed: ${e.message}`, 'warn');
    } finally {
        preloadInProgress = false;
    }
}

async function getTeamsServerVersion() {
    try { const s = await database.ref('data_version/teams').once('value'); return s.val() || 0; }
    catch { return 0; }
}

function setupTeamsVersionListener() {
    if (!database || teamVersionListenerAttached) return;
    teamVersionListenerAttached = true;
    database.ref('data_version/teams').on('value', async (snap) => {
        const serverVersion = snap.val() || 0;
        if (!serverVersion || currentTeamsVersion === 0) { currentTeamsVersion = serverVersion; return; }
        if (serverVersion !== currentTeamsVersion) {
            currentTeamsVersion = serverVersion;
            addLog('Team updates detected, refreshing cache...', 'info');
            await preloadPlayers(true);
            await checkDatabaseHealth();
        }
    });
}

async function getPlayerMeta(name) {
    return name ? playerCache.get(name.trim().toLowerCase()) || null : null;
}

// ==========================================
// 18. LIVE MATCH DATA
// ==========================================
async function handleLiveData(payload) {
    if (!payload) return;

    // Capture previous state for change detection
    const prevRuns = liveMatch.runs;
    const prevWkts = liveMatch.wkts;
    const prevOvers = liveMatch.overs;
    const prevPartRuns = liveMatch.partRuns;
    const prevPartBalls = liveMatch.partBalls;

    // --- Existing sparkline logic (unchanged) ---
    if (payload.overs !== undefined) {
        const currentBalls = oversToBalls(payload.overs);
        const currentOverInt = Math.floor(currentBalls / 6);
        const currentRuns = payload.runs || 0;
        if (lastRecordedOver === -1 && currentBalls > 0) {
            lastRecordedOver = currentOverInt;
            lastRecordedScore = currentRuns;
        } else if (currentOverInt > lastRecordedOver) {
            // An over has just completed
            const runsInOver = currentRuns - lastRecordedScore;
            const wicketInOver = (payload.wkts || 0) > prevWkts;
            const completedOverNumber = lastRecordedOver + 1;

            // ✅ Update Powerplay stats
            updatePowerplayStats(completedOverNumber, runsInOver, wicketInOver);

            overHistory.push({ runs: runsInOver, isWicket: wicketInOver });
            if (overHistory.length > CONFIG.INTERVALS.OVER_HISTORY_MAX) overHistory.shift();
            lastRecordedOver = currentOverInt;
            lastRecordedScore = currentRuns;
            renderSparkline();
        }
    }

    // --- Update liveMatch object ---
    liveMatch.runs = payload.runs || 0;
    liveMatch.wkts = payload.wkts || 0;
    liveMatch.overs = payload.overs || '0.0';
    liveMatch.balls = oversToBalls(payload.overs);
    liveMatch.crr = payload.crr || '0.00';
    liveMatch.target = payload.target || 0;
    liveMatch.winProb = payload.winProb || 50;
    liveMatch.partRuns = payload.partRuns || 0;
    liveMatch.partBalls = payload.partBalls || 0;
    liveMatch.batTeam = payload.batFlag || 'BAT';
    liveMatch.bowlTeam = payload.bowlFlag || 'BOWL';
    liveMatch.matchType = payload.matchType || 'limited';
    liveMatch.totOvers = payload.totOvers || liveMatch.totOvers || 20;
    liveMatch.freeHit = payload.isFreeHit || false;
    liveMatch.overBalls = String(payload.thisOver || '').trim().split(/\s+/).filter(Boolean);

    // --- Detect wicket and record partnership ---
    if (liveMatch.wkts > prevWkts) {
        // A wicket has fallen: the partnership that ended is the previous one
        recordPartnershipEnd(liveMatch.wkts, prevPartRuns, prevPartBalls);
    }

    // --- Update player data (unchanged) ---
    const b1 = payload.bat1 || {}, b2 = payload.bat2 || {};
    const strikerNo = String(payload.striker || '1');
    const strikerData = strikerNo === '1' ? b1 : b2;
    const nonStrikerData = strikerNo === '1' ? b2 : b1;

    const strikerMeta = await getPlayerMeta(strikerData.name);
    const nonStrikerMeta = await getPlayerMeta(nonStrikerData.name);
    const bowlerMeta = await getPlayerMeta(payload.bowler?.name);

    liveMatch.striker = { name: strikerData.name || '--', runs: strikerData.runs || 0, balls: strikerData.balls || 0, fours: strikerData.fours || 0, sixes: strikerData.sixes || 0, photo: strikerMeta?.photo || '' };
    liveMatch.nonStriker = { name: nonStrikerData.name || '--', runs: nonStrikerData.runs || 0, balls: nonStrikerData.balls || 0, fours: nonStrikerData.fours || 0, sixes: nonStrikerData.sixes || 0, photo: nonStrikerMeta?.photo || '' };
    liveMatch.bowler = { name: payload.bowler?.name || '--', figs: payload.bowler?.figs || '0-0 0.0', photo: bowlerMeta?.photo || '' };

    if (payload.showUpcomingBatter && payload.upcomingBatterName) {
        const upMeta = await getPlayerMeta(payload.upcomingBatterName);
        liveMatch.upcoming = { show: true, name: payload.upcomingBatterName, photo: payload.upcomingBatterPhoto || upMeta?.photo || '' };
    } else liveMatch.upcoming = { show: false, name: '', photo: '' };

    if (payload.showPlayerProfile && payload.playerProfile) liveMatch.profile = payload.playerProfile;
    if (payload.hidePlayerProfile) liveMatch.profile = null;

    // --- Update Win Probability graph (if winProb changed) ---
    if (liveMatch.winProb !== prevMatchSnapshot.winProb) {
        const currentOver = Math.floor(liveMatch.balls / 6);
        recordWinProb(currentOver, liveMatch.winProb);
    }

    // --- Update previous snapshot for next time ---
    prevMatchSnapshot = {
        runs: liveMatch.runs,
        wkts: liveMatch.wkts,
        overs: liveMatch.overs,
        partRuns: liveMatch.partRuns,
        partBalls: liveMatch.partBalls,
        winProb: liveMatch.winProb
    };

    // --- Render UI ---
    renderLiveMatch();
}

function renderLiveMatch() {
    const m = liveMatch;
    const scoreEl = document.getElementById('scoreValue');
    if (scoreEl) {
        const ns = `${m.runs}/${m.wkts}`;
        if (scoreEl.textContent !== ns) {
            scoreEl.textContent = ns;
            scoreEl.classList.add('flash');
            setTimeout(() => scoreEl.classList.remove('flash'), 450);
        }
    }
    setText('oversValue', `${m.overs} overs`);
    setText('targetValue', `Target ${m.target}`);
    setText('batTeam', m.batTeam);
    setText('bowlTeam', m.bowlTeam);
    setText('matchBadge', matchId);
    setText('rrrValue', `RRR ${calculateRRR()}`);
    setText('miniRuns', String(m.runs));
    setText('miniWkts', String(m.wkts));
    setText('miniBalls', String(m.balls));
    setText('miniCrr', m.crr);
    setText('miniPart', `${m.partRuns} (${m.partBalls})`);
    setText('miniWinProb', `${m.winProb}%`);

    const typePill = document.getElementById('matchTypePill');
    if (typePill) {
        typePill.textContent = m.matchType;
        typePill.className = `status-pill ${services.admin.online ? 'online' : 'offline'}`;
    }
    const fhPill = document.getElementById('freeHitPill');
    if (fhPill) {
        fhPill.className = m.freeHit ? 'status-pill warning' : 'status-pill offline';
        fhPill.textContent = m.freeHit ? 'Free Hit' : 'No Free Hit';
    }
    renderOverBalls();
    renderPlayer('striker', m.striker);
    renderPlayer('nonStriker', m.nonStriker);
    renderBowler(m.bowler);
    const upCard = document.getElementById('upcomingCard');
    if (upCard) {
        if (m.upcoming.show) {
            upCard.classList.add('show');
            setText('upcomingName', m.upcoming.name);
            setAvatar('upcomingAvatar', m.upcoming.name, m.upcoming.photo);
        } else upCard.classList.remove('show');
    }
    renderProfile(m.profile);
    renderSparkline();
}

function renderOverBalls() {
    const container = document.getElementById('overBalls');
    if (!container) return;
    container.innerHTML = '';
    const balls = liveMatch.overBalls;
    const legalCount = balls.filter(b => !/wd|nb/i.test(b)).length;
    balls.forEach((ball, idx) => {
        const div = document.createElement('div');
        div.className = 'ball';
        const v = String(ball).toUpperCase();
        div.textContent = v === '0' ? '•' : v;
        if (v === '0') div.classList.add('dot');
        else if (v === '4') div.classList.add('four');
        else if (v === '6') div.classList.add('six');
        else if (v === 'W') div.classList.add('wicket');
        else if (/WD|NB/i.test(v)) div.classList.add('extra');
        if (idx === balls.length - 1) div.classList.add('last');
        container.appendChild(div);
    });
    for (let i = legalCount; i < 6; i++) {
        const empty = document.createElement('div');
        empty.className = 'ball empty';
        container.appendChild(empty);
    }
}

function renderPlayer(type, player) {
    setText(type + 'Name', player.name || '--');
    setText(type + 'Stats', `${player.runs} (${player.balls}) • 4s:${player.fours} • 6s:${player.sixes}`);
    setAvatar(type + 'Avatar', player.name, player.photo);
}

function renderBowler(player) {
    setText('bowlerName', player.name || '--');
    setText('bowlerStats', player.figs || '0-0 0.0');
    setAvatar('bowlerAvatar', player.name, player.photo);
}

function renderProfile(profile) {
    const emptyEl = document.getElementById('profileEmpty'), wrapEl = document.getElementById('profileWrap');
    if (!emptyEl || !wrapEl) return;
    if (!profile) { emptyEl.style.display = 'block'; wrapEl.style.display = 'none'; return; }
    emptyEl.style.display = 'none';
    wrapEl.style.display = 'flex';
    setAvatar('profileAvatar', profile.name, profile.photo);
    setText('profileRole', (profile.role || 'PLAYER').toUpperCase());
    setText('profileName', profile.name || 'Unknown');
    setText('profileMeta', `${profile.school || ''}${profile.age ? ' • Age ' + profile.age : ''}`);
}

function renderSparkline() {
    const container = document.getElementById('sparklineContainer');
    if (!container) return;
    container.innerHTML = '';
    if (overHistory.length === 0) {
        container.innerHTML = `<span style="color:var(--muted);font-size:.7rem;width:100%;text-align:center;">Waiting for over completion...</span>`;
        return;
    }
    const maxRuns = Math.max(...overHistory.map(o => o.runs), 10);
    overHistory.forEach((over, idx) => {
        const bar = document.createElement('div');
        const h = Math.max(5, (over.runs / maxRuns) * 100);
        bar.className = 'spark-bar';
        bar.style.height = `${h}%`;
        bar.setAttribute('data-val', over.runs);
        bar.setAttribute('data-ov', `Ov ${lastRecordedOver - (overHistory.length - 1 - idx)}`);
        if (over.runs >= 10) bar.classList.add('high');
        if (over.isWicket) bar.classList.add('wicket');
        container.appendChild(bar);
    });
}

// ==========================================
// 19. HEALTH CHECKS
// ==========================================
async function pingSites() {
    await Promise.all(['scorebar', 'admin', 'updater', 'team'].map(k => pingSite(k)));
    renderServices(); updateSummary();
}

async function pingSite(key) {
    const url = CONFIG.SITE_URLS[key];
    if (!url) return;
    const start = Date.now();
    traffic.http.current++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.INTERVALS.PING_TIMEOUT_MS);
    try {
        await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: controller.signal });
        clearTimeout(timeout);
        services[key].siteReachable = true;
        services[key].siteLatency = Date.now() - start;
        resolveErrorsByService(key, ['site_unreachable'], true);
        if (!services[key].online && services[key].siteReachable) services[key].reason = 'Site reachable, waiting for presence...';
    } catch (e) {
        clearTimeout(timeout);
        services[key].siteReachable = false;
        services[key].siteLatency = 0;
        services[key].errors++;
        services[key].reason = e.name === 'AbortError' ? 'Site timeout' : 'Site unreachable';
        addTrackedError(`Ping ${key} failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`, 'site_unreachable', key, `${key}::site_unreachable`);
    }
}

async function checkDatabaseHealth() {
    if (!database) {
        services.db.online = false; services.db.reason = 'Firebase not initialized';
        renderServices(); updateSummary(); return;
    }
    const start = Date.now();
    traffic.http.current++;
    services.db.requests++;
    try {
        await database.ref('data_version/teams').once('value');
        const cached = loadTeamsFromCache();
        if (cached?.teams) services.db.teams = Object.keys(cached.teams).length;
        if (cached?.players) services.db.players = Object.keys(cached.players).length;
        services.db.online = true;
        services.db.lastCheck = Date.now();
        services.db.ping = Date.now() - start;
        services.db.reason = (services.db.teams > 0 || services.db.players > 0)
            ? `Healthy • ${services.db.teams} teams, ${services.db.players} players`
            : 'Healthy • Loading team data...';
        resolveErrorsByService('db', ['db_fatal'], true);
    } catch (e) {
        services.db.online = false; services.db.errors++;
        services.db.reason = `Error: ${e.message}`;
        addTrackedError(`DB health error: ${e.message}`, 'db_fatal', 'db', 'db::health');
    }
    renderServices(); updateSummary();
}

function checkWatchdogs() {
    const now = Date.now();
    ['admin', 'scorebar', 'updater'].forEach(key => {
        const s = services[key];
        if (s.online === false) return;
        const stale = s.lastHeartbeat > 0 && (now - s.lastHeartbeat) > CONFIG.INTERVALS.PRESENCE_TIMEOUT_MS;
        if (stale) {
            s.online = false; s.reason = 'Presence timeout';
            addLog(`${key.toUpperCase()} presence timeout`, 'warn');
            addTrackedError(`${key.toUpperCase()} presence timeout`, 'timeout', key, `${key}::timeout`);
        }
    });
    renderServices(); updateSummary(); updateCriticalAlert();
}

// ==========================================
// 20. SERVICE STATUS RENDER
// ==========================================
function getServiceStatus(key) {
    const s = services[key];
    if (key === 'realtime') return isConnected && s.online ? 'online' : 'offline';
    if (key === 'db') return s.online ? 'online' : 'offline';
    return s.online ? 'online' : s.siteReachable ? 'warning' : 'offline';
}

function getLastSeen(key) {
    const s = services[key];
    let ts = key === 'db' ? s.lastCheck : key === 'realtime' ? s.lastConnect : s.lastHeartbeat;
    if (!ts) return 'never';
    const ago = Math.floor((Date.now() - ts) / 1000);
    return ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
}

function getServiceIcon(key) {
    return { admin: '🎮', scorebar: '📺', updater: '⚡', team: '👥', db: '🗄️', realtime: '📡' }[key] || '📌';
}

function getServiceLabel(key) {
    return { admin: 'Main Admin', scorebar: 'OBS Scorebar', updater: 'Score Updater', team: 'Team Editor', db: 'Firebase DB', realtime: 'Firebase Realtime' }[key] || key;
}

function getServiceUrl(key) {
    return key === 'db' || key === 'realtime' ? CONFIG.FIREBASE.databaseURL : CONFIG.SITE_URLS[key] || '';
}

function renderServiceMeta(key, s) {
    if (key === 'db') return `<span class="meta-pill ok">Teams: ${s.teams}</span> <span class="meta-pill ok">Players: ${s.players}</span>`;
    if (key === 'realtime') return `<span class="meta-pill ok">Messages: ${s.messagesReceived}</span>`;
    return `<span class="meta-pill ${s.siteReachable ? 'ok' : 'bad'}">Site: ${s.siteReachable ? 'OK' : 'DOWN'}</span> ${s.version ? `<span class="meta-pill">v${escapeHtml(s.version)}</span>` : ''}`;
}

function renderServices() {
    const container = document.getElementById('serviceList');
    if (!container) return;
    const keys = ['admin', 'scorebar', 'updater', 'team', 'db', 'realtime'];
    if (container.children.length !== keys.length) {
        container.innerHTML = keys.map(k => {
            const s = services[k], st = getServiceStatus(k), ping = getDisplayPing(k);
            const ls = getLastSeen(k), hasErr = getServiceActiveErrorCount(k) > 0;
            const showR = ['admin', 'scorebar', 'updater'].includes(k);
            return `<div class="service-card ${st} ${hasErr ? 'error-border-animate' : ''}">
                <div class="service-top">
                    <div class="service-name"><span class="dot ${st}"></span>${getServiceIcon(k)} ${getServiceLabel(k)}</div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <div class="status-pill ${st}">${st}</div>
                        ${showR ? `<button class="small-btn btn-danger-lite" data-restart="${k}">Restart</button>` : ''}
                    </div>
                </div>
                <div class="service-url">${getServiceUrl(k)}</div>
                <div class="service-grid">
                    <div class="metric-box"><div class="metric-label">Ping</div><div class="metric-value">${ping} ms</div></div>
                    <div class="metric-box"><div class="metric-label">Last Seen</div><div class="metric-value">${ls}</div></div>
                    <div class="metric-box"><div class="metric-label">${k === 'realtime' ? 'Messages' : 'Requests'}</div><div class="metric-value">${s.messagesReceived || s.requests || s.heartbeatCount || 0}</div></div>
                    <div class="metric-box"><div class="metric-label">Errors</div><div class="metric-value" style="color:var(--red)">${getServiceActiveErrorCount(k)}</div></div>
                </div>
                <div class="meta-row">${renderServiceMeta(k, s)}</div>
                <div class="service-reason">${escapeHtml(s.reason || 'No details')}</div>
                ${renderServiceAlertToggle(k)}
            </div>`;
        }).join('');

        // ✅ Safe event listeners for restart buttons
        container.querySelectorAll('[data-restart]').forEach(btn => {
            btn.addEventListener('click', () => forceReloadApp(btn.dataset.restart));
        });
        return;
    }

    keys.forEach((k, idx) => {
        const s = services[k], card = container.children[idx];
        const st = getServiceStatus(k), ping = getDisplayPing(k);
        const ls = getLastSeen(k), hasErr = getServiceActiveErrorCount(k) > 0;
        const newCls = `service-card ${st} ${hasErr ? 'error-border-animate' : ''}`;
        if (card.className !== newCls) card.className = newCls;
        const dot = card.querySelector('.dot');
        if (dot && dot.className !== `dot ${st}`) dot.className = `dot ${st}`;
        const pill = card.querySelector('.status-pill');
        if (pill && pill.textContent !== st) { pill.className = `status-pill ${st}`; pill.textContent = st; }
        const metrics = card.querySelectorAll('.metric-value');
        if (metrics.length >= 4) {
            metrics[0].textContent = `${ping} ms`;
            metrics[1].textContent = ls;
            metrics[2].textContent = s.messagesReceived || s.requests || s.heartbeatCount || 0;
            metrics[3].textContent = getServiceActiveErrorCount(k);
        }
        const metaRow = card.querySelector('.meta-row');
        if (metaRow) { const newMeta = renderServiceMeta(k, s); if (metaRow.innerHTML !== newMeta) metaRow.innerHTML = newMeta; }
        const reasonEl = card.querySelector('.service-reason');
        if (reasonEl && reasonEl.textContent !== s.reason) reasonEl.textContent = s.reason || 'No details';
        const tog = card.querySelector(`#alertToggle_${k}`);
        if (tog) tog.checked = alertSettings[k] !== false;
        const stEl = card.querySelector(`#alertStatus_${k}`);
        if (stEl) {
            const on = alertSettings[k] !== false;
            stEl.textContent = on ? 'ON' : 'OFF';
            stEl.className = `service-alert-status ${on ? 'on' : 'off'}`;
        }
    });
}

// ==========================================
// 21. CONTROLS
// ==========================================
function forceReloadApp(appName) {
    if (!confirm(`Are you sure you want to force restart ${appName.toUpperCase()}?`)) return;
    if (!database) { addLog('Database not connected, cannot send restart command', 'err'); return; }
    database.ref(`matches/${matchId}/command`).set({
        event: 'force_reload',
        payload: { target: appName },
        ts: firebase.database.ServerValue.TIMESTAMP
    });
    addLog(`Restart command sent to ${appName.toUpperCase()}`, 'warn');
    addAlert(`${appName.toUpperCase()} remote restart requested`, 'warn');
}

function applyMatchId() {
    const newId = document.getElementById('matchIdInput')?.value?.trim();
    if (!newId) { addAlert('Please enter a Match ID', 'warn'); return; }
    matchId = newId;
    localStorage.setItem('matchId', matchId);
    addLog(`Match ID changed to ${matchId}`, 'info');
    location.reload();
}

function manualRefresh() {
    addLog('Manual refresh triggered', 'info');
    pingSites(); checkDatabaseHealth(); preloadPlayers(true);
}

function godModeKillGraphics() {
    if (!confirm('⚠️ Are you sure you want to clear ALL graphics on the Broadcast?')) return;
    if (!database) return;
    database.ref(`matches/${matchId}/command`).set({
        event: 'hide_graphics',
        ts: firebase.database.ServerValue.TIMESTAMP
    });
    addAlert('Emergency graphics kill signal sent', 'err');
}

// ==========================================
// 22. GOD MODE ALERT MODAL - FULLY FIXED
// ==========================================
function godModeAlertScorer() { openGodModeModal(); }

function openGodModeModal() {
    const existing = document.getElementById('godModeModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'godModeModalOverlay';
    overlay.className = 'god-mode-modal-overlay';
    overlay.innerHTML = `
        <div class="god-mode-modal" id="godModeModalCard">
            <button class="god-mode-modal-close" id="gmCloseBtn">✕</button>
            <div class="god-mode-modal-content">
                <div class="god-mode-modal-icon">🎮</div>
                <div class="god-mode-modal-from">GOD MODE</div>
                <textarea id="godModeMessage" class="god-mode-textarea"
                    placeholder="Type your alert message to scorer..." maxlength="200"></textarea>
                <div class="god-mode-modal-actions">
                    <button class="god-mode-btn god-mode-btn-dismiss" id="gmDismissBtn">Cancel</button>
                    <button class="god-mode-btn god-mode-btn-ok" id="gmSendBtn">🚀 Send Alert</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('gmCloseBtn').addEventListener('click', closeGodModeModal);
    document.getElementById('gmDismissBtn').addEventListener('click', closeGodModeModal);
    document.getElementById('gmSendBtn').addEventListener('click', sendGodModeMessage);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeGodModeModal();
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('show');
            setTimeout(() => document.getElementById('godModeMessage')?.focus(), 300);
        });
    });
}

function closeGodModeModal() {
    const overlay = document.getElementById('godModeModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 380);
}

function sendGodModeMessage() {
    const textarea = document.getElementById('godModeMessage');
    const sendBtn = document.getElementById('gmSendBtn');
    const msg = textarea?.value?.trim();

    if (!msg) {
        textarea?.classList.add('shake');
        setTimeout(() => textarea?.classList.remove('shake'), 400);
        return;
    }

    if (!database || !matchId) {
        addAlert('Database not connected or Match ID missing', 'err');
        showToast('Not connected', 'error');
        closeGodModeModal();
        return;
    }

    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '⏳ Sending...'; }

    database.ref(`matches/${matchId}/command`).set({
        event: 'alert_message',
        payload: { message: msg, from: 'GOD MODE' },
        ts: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        addLog(`God Mode alert sent: "${msg}"`, 'ok');
        addAlert(`God Mode alert sent: "${msg}"`, 'ok');
        showToast('✅ Alert sent to scorer!', 'success');
        if (sendBtn) {
            sendBtn.classList.add('sent');
            sendBtn.textContent = '✅ Sent!';
        }
        setTimeout(closeGodModeModal, 600);
    }).catch(err => {
        console.error('God Mode send failed:', err);
        showToast('❌ Failed to send', 'error');
        addLog(`God Mode send failed: ${err.message}`, 'err');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = '🚀 Send Alert';
        }
    });
}

// ==========================================
// 23. DATA FLOW TOPOLOGY
// ==========================================
function triggerDataRoute(source) {
    if (source === 'admin') {
        triggerDataFlow('admin_to_db');
        setTimeout(() => triggerDataFlow('db_to_scorebar'), 430);
    } else if (source === 'updater' || source === 'scorer') {
        triggerDataFlow('updater_to_db');
        setTimeout(() => triggerDataFlow('db_to_scorebar'), 430);
    } else if (source === 'scorebar') triggerDataFlow('scorebar_to_db');
}

function triggerDataFlow(source) {
    if (['admin', 'admin_to_db'].includes(source)) animateFlowOnPath('path-admin', '#38bdf8', 'forward');
    else if (['updater', 'scorer', 'updater_to_db'].includes(source)) animateFlowOnPath('path-updater', '#a855f7', 'forward');
    else if (['db_to_scorebar', 'supabase_out'].includes(source)) animateFlowOnPath('path-scorebar', '#3b82f6', 'forward');
    else if (['scorebar', 'scorebar_to_db'].includes(source)) animateFlowOnPath('path-scorebar', '#22c55e', 'reverse');
}

function animateFlowOnPath(pathId, color, direction = 'forward') {
    const svg = document.getElementById('flowSvg'), basePath = document.getElementById(pathId);
    if (!svg || !basePath) return;
    const ns = 'http://www.w3.org/2000/svg', length = basePath.getTotalLength();
    const dashLen = Math.max(24, length * 0.16), duration = 950;
    const glow = document.createElementNS(ns, 'path');
    glow.setAttribute('d', basePath.getAttribute('d'));
    glow.setAttribute('fill', 'none'); glow.setAttribute('stroke', color);
    glow.setAttribute('stroke-width', '4.2'); glow.setAttribute('stroke-linecap', 'round');
    glow.setAttribute('stroke-opacity', '0.20'); glow.setAttribute('vector-effect', 'non-scaling-stroke');
    glow.setAttribute('filter', 'url(#flowGlow)');
    glow.setAttribute('stroke-dasharray', `${dashLen} ${length + dashLen}`);
    const core = document.createElementNS(ns, 'path');
    core.setAttribute('d', basePath.getAttribute('d'));
    core.setAttribute('fill', 'none'); core.setAttribute('stroke', color);
    core.setAttribute('stroke-width', '1.9'); core.setAttribute('stroke-linecap', 'round');
    core.setAttribute('stroke-opacity', '0.95'); core.setAttribute('vector-effect', 'non-scaling-stroke');
    core.setAttribute('stroke-dasharray', `${dashLen} ${length + dashLen}`);
    svg.appendChild(glow); svg.appendChild(core);
    const frames = buildPremiumDashFrames(length, dashLen, direction);
    glow.animate(frames.glow, { duration, easing: 'linear', fill: 'forwards' });
    core.animate(frames.core, { duration, easing: 'linear', fill: 'forwards' });
    const cleanup = () => { if (glow.parentNode) glow.remove(); if (core.parentNode) core.remove(); };
    setTimeout(cleanup, duration + 100);
    window.addEventListener('beforeunload', cleanup, { once: true });
}

function buildPremiumDashFrames(length, dashLen, direction) {
    const f = direction === 'reverse';
    const off = v => f ? `-${v}` : `${v}`;
    return {
        glow: [
            { strokeDashoffset: off(length), opacity: 0, offset: 0 },
            { strokeDashoffset: off(length * 0.78), opacity: 0.30, offset: 0.18 },
            { strokeDashoffset: off(length * 0.60), opacity: 0.38, offset: 0.36 },
            { strokeDashoffset: off(length * 0.44), opacity: 0.42, offset: 0.56 },
            { strokeDashoffset: off(length * 0.24), opacity: 0.38, offset: 0.76 },
            { strokeDashoffset: off(dashLen * 0.10), opacity: 0.18, offset: 0.92 },
            { strokeDashoffset: off(dashLen), opacity: 0, offset: 1 }
        ],
        core: [
            { strokeDashoffset: off(length), opacity: 0, offset: 0 },
            { strokeDashoffset: off(length * 0.78), opacity: 0.90, offset: 0.18 },
            { strokeDashoffset: off(length * 0.60), opacity: 1, offset: 0.36 },
            { strokeDashoffset: off(length * 0.44), opacity: 1, offset: 0.56 },
            { strokeDashoffset: off(length * 0.24), opacity: 0.98, offset: 0.76 },
            { strokeDashoffset: off(dashLen * 0.10), opacity: 0.75, offset: 0.92 },
            { strokeDashoffset: off(dashLen), opacity: 0, offset: 1 }
        ]
    };
}

// ==========================================
// 24. ALERT TOGGLE FUNCTIONS
// ==========================================
function toggleServiceAlert(serviceKey, enabled) {
    const safeKey = serviceKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    alertSettings[safeKey] = enabled;
    debouncedSaveAlertSettings();
    const stEl = document.getElementById(`alertStatus_${safeKey}`);
    if (stEl) { stEl.textContent = enabled ? 'ON' : 'OFF'; stEl.className = `service-alert-status ${enabled ? 'on' : 'off'}`; }
    addLog(`${serviceKey.toUpperCase()} critical alerts ${enabled ? 'ENABLED' : 'DISABLED'}`, enabled ? 'ok' : 'warn');
    updateCriticalAlert();
}

function toggleAlertSound(enabled) {
    alertSettings.sound = enabled;
    debouncedSaveAlertSettings();
    const st = document.getElementById('soundStatus');
    if (st) st.textContent = enabled ? 'ON' : 'OFF';
    addLog(`Alert sound ${enabled ? 'ENABLED' : 'DISABLED'}`, enabled ? 'ok' : 'warn');
}

function saveAlertSettings() {
    localStorage.setItem('monitorAlertSettings', JSON.stringify(alertSettings));
}

function loadAlertSettings() {
    try {
        const s = localStorage.getItem('monitorAlertSettings');
        if (s) alertSettings = { ...alertSettings, ...JSON.parse(s) };
    } catch (e) { }
    const t = document.getElementById('alertSoundToggle'), st = document.getElementById('soundStatus');
    if (t) t.checked = alertSettings.sound;
    if (st) st.textContent = alertSettings.sound ? 'ON' : 'OFF';
}

function isAppAlertEnabled(appKey) { return alertSettings[appKey] !== false; }

function renderServiceAlertToggle(serviceKey) {
    if (!['admin', 'updater', 'scorebar', 'realtime'].includes(serviceKey)) return '';
    const safeKey = serviceKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const isEnabled = alertSettings[safeKey] !== false;
    return `<div class="service-alert-toggle">
        <div class="service-alert-toggle-left">
            <span class="service-alert-toggle-icon">🚨</span>
            <span class="service-alert-toggle-text">Critical Alert</span>
        </div>
        <span class="service-alert-status ${isEnabled ? 'on' : 'off'}" id="alertStatus_${safeKey}">${isEnabled ? 'ON' : 'OFF'}</span>
        <label class="service-alert-switch">
            <input type="checkbox" id="alertToggle_${safeKey}" ${isEnabled ? 'checked' : ''}
                onchange="toggleServiceAlert('${safeKey}', this.checked)">
            <span class="service-alert-slider"></span>
        </label>
    </div>`;
}

// ==========================================
// 25. GLOBAL ERROR LISTENERS
// ==========================================
window.onerror = function (message, sourceFile, lineNo) {
    const now = Date.now();
    if (now - lastErrorResetTime > 1000) { globalErrorCount = 0; lastErrorResetTime = now; }
    if (globalErrorCount++ > 10) return false;
    let errText = String(message || 'Unknown error');
    if (sourceFile) errText += ` (${sourceFile.split('/').pop()}:${lineNo})`;
    addTrackedError(errText, 'console', null, `console::${errText}`);
    return false;
};

window.addEventListener('unhandledrejection', function (event) {
    const now = Date.now();
    if (now - lastErrorResetTime > 1000) { globalErrorCount = 0; lastErrorResetTime = now; }
    if (globalErrorCount++ > 10) return;
    const reasonMsg = event.reason?.message || String(event.reason || 'Unknown promise rejection');
    addTrackedError(`Unhandled Rejection: ${reasonMsg}`, 'promise', null, `promise::${reasonMsg}`);
});

// ==========================================
// 26. INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlMatchId = urlParams.get('match');
    if (urlMatchId) { matchId = urlMatchId; localStorage.setItem('matchId', matchId); }
    const matchInput = document.getElementById('matchIdInput');
    if (matchInput) matchInput.value = matchId;
    loadAlertSettings();

    ['pointerdown', 'keydown', 'touchstart'].forEach(e =>
        window.addEventListener(e, unlockAudio, { once: true }));

    initFirebase();
    initCharts();

    setInterval(updateClock, CONFIG.INTERVALS.CLOCK);
    setInterval(pushTrafficHistory, CONFIG.INTERVALS.TRAFFIC_UPDATE);
    setInterval(checkWatchdogs, CONFIG.INTERVALS.WATCHDOG);
    setInterval(pingSites, CONFIG.INTERVALS.SITE_PING);
    setInterval(checkDatabaseHealth, CONFIG.INTERVALS.DB_HEALTH);
    setInterval(cleanupResolvedErrors, CONFIG.INTERVALS.ERROR_CLEAN_INTERVAL);
    setInterval(() => {
        const c = document.getElementById('serviceList');
        if (!c) return;
        ['admin', 'scorebar', 'updater', 'team', 'db', 'realtime'].forEach((k, i) => {
            const card = c.children[i];
            if (!card) return;
            const ls = card.querySelectorAll('.metric-value')[1];
            if (ls) ls.textContent = getLastSeen(k);
        });
    }, 3000);

    updateClock();
    renderServices();
    renderLiveMatch();
    renderUpdaterDevicePanel();
    updateSummary();
    updateFirebaseMetricsUI();
    setTimeout(pingSites, 800);
    setTimeout(checkDatabaseHealth, 1600);
    addLog('Monitor V32.2 initialized - All bugs fixed', 'ok');
});

// ==========================================
// 27. WINDOW EVENTS
// ==========================================
window.addEventListener('beforeunload', () => {
    if (database?._raw && matchId) {
        database._raw.ref(`presence/${matchId}/monitor`).set({
            online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
    }
});

let wasOffline = false;
window.addEventListener('offline', () => {
    wasOffline = true; isConnected = false;
    services.realtime.online = false;
    services.realtime.reason = 'Internet Connection Lost';
    renderServices(); updateCriticalAlert();
});
window.addEventListener('online', () => {
    if (wasOffline) { wasOffline = false; location.reload(); }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { checkWatchdogs(); updateCriticalAlert(); }
});

// Feature 6: Win Probability Graph (client-side)
let winProbHistory = [];   // array of { over, prob }

// ==========================================
// ENHANCED: Win Probability Graph (Figma Style)
// ==========================================
// ==========================================
// ENHANCED: Win Probability Graph (Figma Style)
// ==========================================
function updateWinProbGraph() {
    const canvas = document.getElementById('winProbChart');
    if (!canvas) return;

    // Destroy existing chart instance if it exists and is a valid Chart object
    if (window.winProbChart && typeof window.winProbChart.destroy === 'function') {
        window.winProbChart.destroy();
    }

    // Don't render if no data
    if (!winProbHistory || winProbHistory.length === 0) return;

    const labels = winProbHistory.map(p => `Over ${p.over}`);
    const data = winProbHistory.map(p => p.prob);

    // Create a professional gradient for the line (native canvas gradient)
    const ctx = canvas.getContext('2d');
    const gradientFill = ctx.createLinearGradient(0, 0, 0, 200);
    gradientFill.addColorStop(0, 'rgba(248, 180, 0, 0.4)');
    gradientFill.addColorStop(0.5, 'rgba(248, 180, 0, 0.15)');
    gradientFill.addColorStop(1, 'rgba(248, 180, 0, 0.0)');

    window.winProbChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'WIN PROBABILITY',
                data: data,
                borderColor: '#F8B400',
                borderWidth: 3,
                pointBackgroundColor: '#F8B400',
                pointBorderColor: '#ffffff',
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBorderWidth: 2,
                fill: true,
                backgroundColor: gradientFill,
                tension: 0.3,
                // Optional: if you have chartjs-plugin-gradient loaded, you can use gradient object instead
                // gradient: {
                //     backgroundColor: {
                //         axis: 'y',
                //         colors: { 0: 'rgba(248,180,0,0.4)', 50: 'rgba(248,180,0,0.1)', 100: 'rgba(248,180,0,0)' }
                //     }
                // }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    titleColor: '#F8B400',
                    bodyColor: '#ffffff',
                    borderColor: '#F8B400',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return `Win Probability: ${context.raw}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    title: {
                        display: true,
                        text: 'Probability (%)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { weight: 'bold', size: 10 }
                    },
                    ticks: {
                        stepSize: 20,
                        callback: function (val) { return val + '%'; },
                        color: 'rgba(255,255,255,0.6)'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(255,255,255,0.6)',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            },
            elements: {
                point: {
                    hitRadius: 15,
                    hoverBorderWidth: 3
                }
            },
            layout: {
                padding: { top: 15, bottom: 10, left: 5, right: 5 }
            }
        }
    });
}

// Call this whenever winProb changes (e.g., after each over or ball)
function recordWinProb(overNumber, prob) {
    winProbHistory.push({ over: overNumber, prob });
    if (winProbHistory.length > 20) winProbHistory.shift();
    updateWinProbGraph();
}

// Feature 12: Partnership Breakdown Graph
let partnerships = []; // { wicket, runs, balls }

function recordPartnershipEnd(wicketNumber, runs, balls) {
    partnerships.push({ wicket: wicketNumber, runs, balls });
    if (partnerships.length > 11) partnerships.shift();
    renderPartnershipChart();
}

// ==========================================
// ENHANCED: Partnership Graph (Figma Style)
// ==========================================
function renderPartnershipChart() {
    const ctx = document.getElementById('partnershipChart');
    if (!ctx) return;

    if (window.partnershipChart && typeof window.partnershipChart.destroy === 'function') {
        window.partnershipChart.destroy();
    }

    if (partnerships.length === 0) return;

    const labels = partnerships.map(p => `Wkt ${p.wicket}`);
    const runsData = partnerships.map(p => p.runs);

    // Calculate max runs for better bar scaling
    const maxRuns = Math.max(...runsData, 10);

    window.partnershipChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'PARTNERSHIP RUNS',
                data: runsData,
                backgroundColor: 'rgba(248, 180, 0, 0.75)',
                borderColor: '#F8B400',
                borderWidth: 1,
                borderRadius: 6,
                barPercentage: 0.65,
                categoryPercentage: 0.8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#F8B400',
                    bodyColor: '#fff',
                    borderColor: '#F8B400',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            let val = context.raw;
                            let balls = partnerships[context.dataIndex]?.balls || 0;
                            return `${label}: ${val} runs (${balls} balls)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    title: { display: true, text: 'Runs', color: 'rgba(255,255,255,0.5)', font: { weight: 'bold', size: 10 } },
                    ticks: { color: 'rgba(255,255,255,0.6)', stepSize: Math.ceil(maxRuns / 5) }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.6)', font: { weight: 'bold' } }
                }
            },
            layout: { padding: { top: 15, bottom: 5, left: 5, right: 5 } }
        }
    });
}

// Feature 13: Powerplay & Bowling Change Tracker
let powerplay = { runs: 0, balls: 0, wickets: 0 };
let middleOvers = { runs: 0, balls: 0, wickets: 0 };
let deathOvers = { runs: 0, balls: 0, wickets: 0 };
let bowlingChanges = []; // { over, bowler, previousBowler }

function updatePowerplayStats(overNumber, runsInOver, wicketInOver) {
    if (overNumber <= 6) {
        powerplay.runs += runsInOver;
        powerplay.balls += 6;
        powerplay.wickets += wicketInOver ? 1 : 0;
    } else if (overNumber <= 15) {
        middleOvers.runs += runsInOver;
        middleOvers.balls += 6;
        middleOvers.wickets += wicketInOver ? 1 : 0;
    } else {
        deathOvers.runs += runsInOver;
        deathOvers.balls += 6;
        deathOvers.wickets += wicketInOver ? 1 : 0;
    }
    renderPowerplayUI();
}

function renderPowerplayUI() {
    const container = document.getElementById('powerplayStats');
    if (!container) return;
    container.innerHTML = `
        <div><strong>Powerplay (1-6 ov):</strong> ${powerplay.runs}/${powerplay.wickets} (${(powerplay.runs / (powerplay.balls / 6)).toFixed(2)} RPO)</div>
        <div><strong>Middle (7-15 ov):</strong> ${middleOvers.runs}/${middleOvers.wickets} (${(middleOvers.runs / (middleOvers.balls / 6)).toFixed(2)} RPO)</div>
        <div><strong>Death (16-20 ov):</strong> ${deathOvers.runs}/${deathOvers.wickets} (${(deathOvers.runs / (deathOvers.balls / 6)).toFixed(2)} RPO)</div>
    `;
}

function recordBowlingChange(overNumber, newBowler, oldBowler) {
    bowlingChanges.unshift({ over: overNumber, newBowler, oldBowler });
    if (bowlingChanges.length > 10) bowlingChanges.pop();
    const listDiv = document.getElementById('bowlingChangesList');
    if (listDiv) {
        listDiv.innerHTML = bowlingChanges.map(c => `<div>Over ${c.over}: ${c.newBowler} replaced ${c.oldBowler}</div>`).join('');
    }
}

console.log('🖥️ Monitor V32.2 Fully Fixed Loaded');
console.log('✅ showToast() added');
console.log('✅ God Mode Modal - CSS transitions fixed');
console.log('✅ God Mode Modal - Safe event listeners');
console.log('✅ Critical alert - Safe event listeners');
console.log('✅ Service restart buttons - Safe event listeners');
console.log('✅ All inline onclick security issues fixed');