// ==========================================
// ADMIN-CONTROL.JS - V2.0 Professional
// Access Control Panel Logic
// User Management + Bandwidth Optimized
// ==========================================

// ==========================================
// STATE
// ==========================================
let allUsers = {};
let allRequests = {};
let activityLog = [];
let editingUserId = null;
let notifSoundEnabled = true;
let lastRequestCount = 0;
let adminControlInitialized = false;
let confirmCallback = null;
let totalBandwidthKB = 0;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof initPageAuth === 'function') {
        initPageAuth('admin-control');
    } else {
        console.error('auth.js not loaded!');
    }

    document.addEventListener('auth-approved', (e) => {
        const { user, userData } = e.detail || {};
        console.log('Auth approved event received', userData);

        if (userData && userData.roles && userData.roles.includes('owner')) {
            initAdminControl();
        } else {
            console.warn('Non-owner tried to access admin control');
        }
    });
});

function initAdminControl() {
    if (adminControlInitialized) return;
    adminControlInitialized = true;

    const mainApp = document.getElementById('mainApp');
    if (!mainApp) return;

    mainApp.style.display = 'block';
    mainApp.style.animation = 'ctrlFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

    // Update header with profile photo + email
    const user = getCurrentUser();
    if (user) {
        const profileImg = document.getElementById('headerProfileImg');
        const userName = document.getElementById('headerUserName');
        const userEmail = document.getElementById('headerUserEmail');

        if (profileImg) profileImg.src = user.photoURL || '';
        if (userName) userName.textContent = user.displayName || 'Owner';
        if (userEmail) userEmail.textContent = user.email || '';
    }

    document.getElementById('settingOwnerEmail').textContent = AUTH_CONFIG.OWNER_EMAIL;

    // Load data
    loadAllUsers();

    // ✅ LISTEN FOR ACCESS REVOCATION - If owner removes own access (edge case)
    document.addEventListener('auth-revoked', (e) => {
        const { reason } = e.detail || {};
        console.warn('🚫 Control panel access revoked:', reason);

        const badge = document.getElementById('ctrlProfileBadge');
        if (badge) badge.remove();

        showToast('⚠️ Access revoked: ' + (reason || 'Contact owner'), 'error');

        // Hide main app
        const mainApp = document.getElementById('mainApp');
        if (mainApp) mainApp.style.display = 'none';

        // Reload to show auth overlay
        setTimeout(() => location.reload(true), 2000);
    });
    loadAccessRequests();
    loadActivityLog();

    // Real-time listeners
    attachRealtimeListeners();

    // Update bandwidth display
    updateBandwidthDisplay();
}

// ==========================================
// REAL-TIME LISTENERS
// Bandwidth optimized: Only listen to needed paths
// ✅ V2.1 FIX: Added renderPendingRequests() to users listener
// ==========================================
function attachRealtimeListeners() {
    if (!authDb) return;

    // ✅ Listen for user changes — renders ALL sections including pending
    authDb.ref('users').on('value', (snap) => {
        allUsers = snap.val() || {};
        trackBW('read', allUsers);
        updateStats();
        renderApprovedUsers();
        renderDeniedUsers();
        renderPendingRequests(); // ✅ V2.1 FIX: Also render pending when users change
    });

    // ✅ Listen for access request changes — also triggers pending render
    authDb.ref('access_requests').on('value', (snap) => {
        allRequests = snap.val() || {};
        trackBW('read', allRequests);
        const newCount = Object.keys(allRequests).length;

        // New request notification
        if (newCount > lastRequestCount && lastRequestCount > 0) {
            showToast('🆕 New access request received!', 'success');
            if (notifSoundEnabled) {
                playNotifSound();
            }
            // Flash the pending section
            const section = document.getElementById('sectionPending');
            if (section) {
                section.classList.add('section-flash');
                setTimeout(() => section.classList.remove('section-flash'), 2000);
            }
        }
        lastRequestCount = newCount;

        renderPendingRequests();
        updateStats();
    });

    // ✅ V2.1 NEW: Listen for activity log changes in real-time
    authDb.ref('activity_log').orderByChild('timestamp').limitToLast(50).on('value', (snap) => {
        const data = snap.val() || {};
        trackBW('read', data);
        activityLog = Object.values(data).reverse();
        renderActivityLog();
    });
}

// ==========================================
// BANDWIDTH TRACKING
// ==========================================
function trackBW(type, data) {
    const jsonStr = JSON.stringify(data || {});
    const kb = Math.ceil(jsonStr.length / 1024);
    if (type === 'read') totalBandwidthKB += kb;
    if (type === 'write') totalBandwidthKB += kb;
    updateBandwidthDisplay();
}

function updateBandwidthDisplay() {
    const bwEl = document.getElementById('statBandwidth');
    const barEl = document.getElementById('bandwidthBar');
    const footerEl = document.getElementById('footerBandwidth');

    let display = '0 KB';
    if (totalBandwidthKB > 1024) {
        display = (totalBandwidthKB / 1024).toFixed(1) + ' MB';
    } else {
        display = totalBandwidthKB + ' KB';
    }

    if (bwEl) bwEl.textContent = display;
    if (footerEl) footerEl.textContent = display + ' estimated';
    if (barEl) {
        const pct = Math.min((totalBandwidthKB / 1024 / 360) * 100, 100);
        barEl.style.width = pct + '%';
        if (pct > 70) barEl.style.background = 'linear-gradient(90deg, #ef4444, #f97316)';
        else if (pct > 40) barEl.style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
    }
}

// ==========================================
// LOAD DATA (Bandwidth optimized: single reads)
// ==========================================
async function loadAllUsers() {
    if (!authDb) return;
    try {
        const snap = await authDb.ref('users').once('value');
        allUsers = snap.val() || {};
        trackBW('read', allUsers);
        updateStats();
        renderApprovedUsers();
        renderDeniedUsers();
    } catch (e) {
        console.error('Load users error:', e);
    }
}

async function loadAccessRequests() {
    if (!authDb) return;
    try {
        const snap = await authDb.ref('access_requests').once('value');
        allRequests = snap.val() || {};
        trackBW('read', allRequests);
        lastRequestCount = Object.keys(allRequests).length;
        renderPendingRequests();
        updateStats();
    } catch (e) {
        console.error('Load requests error:', e);
    }
}

async function loadActivityLog() {
    if (!authDb) return;
    try {
        const snap = await authDb.ref('activity_log').orderByChild('timestamp').limitToLast(50).once('value');
        const data = snap.val() || {};
        trackBW('read', data);
        activityLog = Object.values(data).reverse();
        renderActivityLog();
    } catch (e) {
        console.error('Load log error:', e);
    }
}

// ==========================================
// UPDATE STATS (with animated counters)
// ==========================================
function updateStats() {
    const users = Object.values(allUsers);
    const total = users.length;
    const pending = users.filter(u => u.status === 'pending').length;
    const approved = users.filter(u => u.status === 'approved').length;
    const denied = users.filter(u => u.status === 'denied' || u.status === 'delayed').length;

    animateCounter('statTotalUsers', total);
    animateCounter('statPending', pending);
    animateCounter('statApproved', approved);
    animateCounter('statDenied', denied);

    document.getElementById('pendingBadge').textContent = pending;
    document.getElementById('approvedBadge').textContent = approved;
    document.getElementById('deniedBadge').textContent = denied;

    const pulse = document.getElementById('pendingPulse');
    if (pulse) {
        if (pending > 0) pulse.classList.add('active');
        else pulse.classList.remove('active');
    }
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    const diff = target - current;
    const steps = Math.min(Math.abs(diff), 15);
    const increment = diff / steps;
    let step = 0;

    const timer = setInterval(() => {
        step++;
        if (step >= steps) {
            el.textContent = target;
            clearInterval(timer);
        } else {
            el.textContent = Math.round(current + increment * step);
        }
    }, 30);
}

// ==========================================
// RENDER PENDING REQUESTS
// ✅ V2.1 FIX: Merge users + access_requests data for full info
// ==========================================
function renderPendingRequests() {
    const container = document.getElementById('pendingRequests');
    const empty = document.getElementById('noPending');
    if (!container) return;

    const pendingUsers = Object.entries(allUsers).filter(([uid, u]) => u.status === 'pending');

    if (pendingUsers.length === 0) {
        container.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }

    container.style.display = 'grid';
    if (empty) empty.style.display = 'none';

    let html = '';

    pendingUsers.forEach(([uid, user], index) => {
        // ✅ V2.1: Merge request data with user data for richer display
        const request = allRequests[uid] || {};
        const timeAgo = getTimeAgo(request.requestedAt || user.createdAt);
        const pageName = request.pageNameDisplay || request.requestedPage || '--';
        const initial = getInitial(user.name || user.email || '?');

        const avatarHtml = user.photo
            ? `<img class="request-avatar" src="${escapeAttr(user.photo)}" alt="Avatar" loading="lazy">`
            : `<div class="request-avatar-placeholder">${escapeHtml(initial)}</div>`;

        // ✅ V2.1: Show which page they requested access for
        const pageBadge = pageName !== '--'
            ? `<span class="page-badge">${escapeHtml(pageName)}</span>`
            : '';

        // Ensure tempRoles object exists for this user
        if (!tempRoles[uid]) tempRoles[uid] = [];

        html += `
            <div class="request-card${index === 0 ? ' new' : ''}" style="animation-delay:${index * 0.06}s;" data-uid="${uid}">
                <div class="request-user">
                    ${avatarHtml}
                    <div class="request-user-info">
                        <div class="request-name">${escapeHtml(user.name || 'Unknown')}</div>
                        <div class="request-email">${escapeHtml(user.email || '')}</div>
                    </div>
                </div>
                <div class="request-meta">
                    <span class="request-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ${timeAgo}
                    </span>
                    <span class="request-meta-item">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        ${pageBadge}
                    </span>
                </div>
                <div class="request-roles">
                    <div class="request-roles-label">Assign Roles:</div>
                    <div class="request-roles-grid" id="reqRoles_${uid}">
                        <button class="role-select-btn" onclick="toggleReqRole('${uid}','admin',this)">Admin</button>
                        <button class="role-select-btn" onclick="toggleReqRole('${uid}','scorer',this)">Scorer</button>
                        <button class="role-select-btn" onclick="toggleReqRole('${uid}','team',this)">Team</button>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-success btn-sm" onclick="approveUser('${uid}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        Approve
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="delayUser('${uid}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Delay
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="denyUser('${uid}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Deny
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // ✅ V2.1: Re-apply previously selected role toggles after re-render
    Object.entries(tempRoles).forEach(([uid, roles]) => {
        if (roles.length > 0) {
            const grid = document.getElementById(`reqRoles_${uid}`);
            if (grid) {
                grid.querySelectorAll('.role-select-btn').forEach(btn => {
                    const role = btn.textContent.trim().toLowerCase();
                    if (roles.includes(role)) {
                        btn.classList.add('selected');
                    }
                });
            }
        }
    });
}

// Temporary role selections per request
const tempRoles = {};

function toggleReqRole(uid, role, btn) {
    if (!tempRoles[uid]) tempRoles[uid] = [];
    const idx = tempRoles[uid].indexOf(role);
    if (idx >= 0) {
        tempRoles[uid].splice(idx, 1);
        btn.classList.remove('selected');
    } else {
        tempRoles[uid].push(role);
        btn.classList.add('selected');
    }
}

// ==========================================
// RENDER APPROVED USERS
// ==========================================
function renderApprovedUsers() {
    const container = document.getElementById('approvedUsers');
    const empty = document.getElementById('noApproved');
    if (!container) return;

    const searchTerm = (document.getElementById('searchApproved')?.value || '').toLowerCase();
    const filterRole = document.getElementById('filterRole')?.value || '';

    const approvedUsers = Object.entries(allUsers).filter(([uid, u]) => {
        if (u.status !== 'approved') return false;
        if (searchTerm) {
            if (!(u.name || '').toLowerCase().includes(searchTerm) &&
                !(u.email || '').toLowerCase().includes(searchTerm)) return false;
        }
        if (filterRole) {
            if (!(u.roles || []).includes(filterRole)) return false;
        }
        return true;
    });

    if (approvedUsers.length === 0) {
        container.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }

    container.style.display = 'flex';
    if (empty) empty.style.display = 'none';

    let html = '';
    approvedUsers.forEach(([uid, user], index) => {
        const roles = user.roles || [];
        const isOwnerUser = roles.includes('owner');
        const initial = getInitial(user.name || user.email || '?');

        const avatarHtml = user.photo
            ? `<img class="user-card-avatar" src="${escapeAttr(user.photo)}" alt="Avatar" loading="lazy">`
            : `<div class="user-card-avatar-placeholder">${escapeHtml(initial)}</div>`;

        let rolesHtml = '';
        roles.forEach(r => {
            rolesHtml += `<span class="role-tag ${r}">${r}</span>`;
        });

        const lastLogin = user.lastLogin ? getTimeAgo(user.lastLogin) : '';

        const actionsHtml = isOwnerUser
            ? `<span class="role-tag owner" style="cursor:default;">Owner</span>`
            : `<button class="btn btn-ghost btn-xs" onclick="openRoleModal('${uid}')" title="Edit Roles">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
               </button>
               <button class="btn btn-ghost btn-xs" onclick="revokeAccess('${uid}')" title="Revoke Access" style="color:#fca5a5;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
               </button>`;

        html += `
            <div class="user-card" style="animation-delay:${index * 0.03}s;">
                ${avatarHtml}
                <div class="user-card-info">
                    <div class="user-card-name">${escapeHtml(user.name || 'Unknown')}</div>
                    <div class="user-card-email">${escapeHtml(user.email || '')}${lastLogin ? ' &bull; ' + lastLogin : ''}</div>
                    <div class="user-card-roles">${rolesHtml}</div>
                </div>
                <div class="user-card-actions">${actionsHtml}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function filterApproved() {
    renderApprovedUsers();
}

// ==========================================
// RENDER DENIED/DELAYED USERS
// ==========================================
function renderDeniedUsers() {
    const container = document.getElementById('deniedUsers');
    const empty = document.getElementById('noDenied');
    if (!container) return;

    const deniedUsers = Object.entries(allUsers).filter(([uid, u]) =>
        u.status === 'denied' || u.status === 'delayed'
    );

    if (deniedUsers.length === 0) {
        container.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }

    container.style.display = 'grid';
    if (empty) empty.style.display = 'none';

    let html = '';
    deniedUsers.forEach(([uid, user], index) => {
        const initial = getInitial(user.name || user.email || '?');
        const isDelayed = user.status === 'delayed';
        const statusColor = isDelayed ? '#fbbf24' : '#fca5a5';
        const statusIcon = isDelayed
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        const statusText = isDelayed ? 'Delayed' : 'Denied';

        const avatarHtml = user.photo
            ? `<img class="user-card-avatar" src="${escapeAttr(user.photo)}" alt="Avatar" loading="lazy">`
            : `<div class="user-card-avatar-placeholder">${escapeHtml(initial)}</div>`;

        html += `
            <div class="user-card" style="animation-delay:${index * 0.03}s;">
                ${avatarHtml}
                <div class="user-card-info">
                    <div class="user-card-name">${escapeHtml(user.name || 'Unknown')}</div>
                    <div class="user-card-email">${escapeHtml(user.email || '')}</div>
                    <div style="display:flex;align-items:center;gap:4px;font-size:0.68rem;color:${statusColor};font-weight:700;margin-top:2px;">${statusIcon} ${statusText}</div>
                </div>
                <div class="user-card-actions">
                    <button class="btn btn-success btn-xs" onclick="approveUser('${uid}')" title="Approve">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <button class="btn btn-ghost btn-xs" onclick="deleteUser('${uid}')" title="Delete" style="color:#fca5a5;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ==========================================
// USER ACTIONS (Bandwidth optimized: batch writes)
// ==========================================
async function approveUser(uid) {
    if (!authDb || !uid) return;

    const user = allUsers[uid];
    if (!user) return;

    const roles = tempRoles[uid] && tempRoles[uid].length > 0 ? tempRoles[uid] : ['scorer'];
    delete tempRoles[uid];

    try {
        // Batch update for bandwidth optimization
        const updates = {};
        updates['users/' + uid + '/status'] = 'approved';
        updates['users/' + uid + '/roles'] = roles;
        updates['users/' + uid + '/approvedBy'] = getCurrentUser().uid;
        updates['users/' + uid + '/approvedAt'] = firebase.database.ServerValue.TIMESTAMP;
        updates['users/' + uid + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;

        await authDb.ref().update(updates);
        await authDb.ref('access_requests/' + uid).remove();

        trackBW('write', updates);
        await logActivity('approved', user.name || user.email, roles.join(', '));

        showToast(`${user.name || user.email} approved (${roles.join(', ')})`, 'success');
    } catch (e) {
        console.error('Approve error:', e);
        showToast('Failed to approve user', 'error');
    }
}

async function delayUser(uid) {
    if (!authDb || !uid) return;

    const user = allUsers[uid];
    if (!user) return;

    try {
        const updates = {};
        updates['users/' + uid + '/status'] = 'delayed';
        updates['users/' + uid + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;
        updates['access_requests/' + uid + '/status'] = 'delayed';

        await authDb.ref().update(updates);
        trackBW('write', updates);
        await logActivity('delayed', user.name || user.email);

        showToast(`${user.name || user.email} delayed`, 'warning');
    } catch (e) {
        console.error('Delay error:', e);
        showToast('Failed to delay user', 'error');
    }
}

async function denyUser(uid) {
    if (!authDb || !uid) return;

    const user = allUsers[uid];
    if (!user) return;

    try {
        const updates = {};
        updates['users/' + uid + '/status'] = 'denied';
        updates['users/' + uid + '/roles'] = [];
        updates['users/' + uid + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;
        updates['access_requests/' + uid + '/status'] = 'denied';

        await authDb.ref().update(updates);
        trackBW('write', updates);
        await logActivity('denied', user.name || user.email);

        showToast(`${user.name || user.email} denied`, 'error');
    } catch (e) {
        console.error('Deny error:', e);
        showToast('Failed to deny user', 'error');
    }
}

// ==========================================
// APPROVE ALL PENDING
// ==========================================
async function approveAllPending() {
    if (!authDb) return;

    const pendingCount = Object.values(allUsers).filter(u => u.status === 'pending').length;
    if (pendingCount === 0) {
        showToast('No pending requests to approve', 'warning');
        return;
    }

    showConfirm(
        'Approve All Requests?',
        `This will approve all ${pendingCount} pending requests with default "Scorer" role.`,
        async () => {
            const updates = {};
            Object.entries(allUsers).forEach(([uid, user]) => {
                if (user.status === 'pending') {
                    updates['users/' + uid + '/status'] = 'approved';
                    updates['users/' + uid + '/roles'] = ['scorer'];
                    updates['users/' + uid + '/approvedBy'] = getCurrentUser().uid;
                    updates['users/' + uid + '/approvedAt'] = firebase.database.ServerValue.TIMESTAMP;
                    updates['users/' + uid + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;
                    updates['access_requests/' + uid] = null;
                }
            });

            try {
                await authDb.ref().update(updates);
                trackBW('write', updates);
                await logActivity('approved_all', `${pendingCount} users`);
                showToast(`All ${pendingCount} requests approved`, 'success');
            } catch (e) {
                console.error('Approve all error:', e);
                showToast('Failed to approve all', 'error');
            }
        }
    );
}

// ==========================================
// DENY ALL PENDING
// ==========================================
async function denyAllPending() {
    if (!authDb) return;

    const pendingCount = Object.values(allUsers).filter(u => u.status === 'pending').length;
    if (pendingCount === 0) {
        showToast('No pending requests to deny', 'warning');
        return;
    }

    showConfirm(
        'Deny All Requests?',
        `This will deny all ${pendingCount} pending access requests. This action can be reversed individually.`,
        async () => {
            const updates = {};
            Object.entries(allUsers).forEach(([uid, user]) => {
                if (user.status === 'pending') {
                    updates['users/' + uid + '/status'] = 'denied';
                    updates['users/' + uid + '/roles'] = [];
                    updates['users/' + uid + '/updatedAt'] = firebase.database.ServerValue.TIMESTAMP;
                    updates['access_requests/' + uid + '/status'] = 'denied';
                }
            });

            try {
                await authDb.ref().update(updates);
                trackBW('write', updates);
                await logActivity('denied_all', `${pendingCount} users`);
                showToast(`All ${pendingCount} requests denied`, 'error');
            } catch (e) {
                console.error('Deny all error:', e);
            }
        }
    );
}

// ==========================================
// REVOKE ACCESS
// ==========================================
async function revokeAccess(uid) {
    if (!authDb || !uid) return;

    const user = allUsers[uid];
    if (!user) return;
    if (user.roles && user.roles.includes('owner')) {
        showToast('Cannot revoke owner access!', 'error');
        return;
    }

    showConfirm(
        'Revoke Access?',
        `This will revoke access for ${user.name || user.email}. They will need to request access again.`,
        async () => {
            try {
                await authDb.ref('users/' + uid).update({
                    status: 'denied',
                    roles: [],
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                });

                await logActivity('revoked', user.name || user.email);
                showToast(`${user.name || user.email} access revoked`, 'warning');
            } catch (e) {
                console.error('Revoke error:', e);
                showToast('Failed to revoke access', 'error');
            }
        }
    );
}

// ==========================================
// DELETE USER
// ==========================================
async function deleteUser(uid) {
    if (!authDb || !uid) return;

    const user = allUsers[uid];
    if (!user) return;

    showConfirm(
        'Delete User Permanently?',
        `This will permanently delete ${user.name || user.email} from the system. This cannot be undone.`,
        async () => {
            try {
                await authDb.ref('users/' + uid).remove();
                await authDb.ref('access_requests/' + uid).remove();

                await logActivity('deleted', user.name || user.email);
                showToast(`${user.name || user.email} deleted`, 'error');
            } catch (e) {
                console.error('Delete error:', e);
                showToast('Failed to delete user', 'error');
            }
        }
    );
}

// ==========================================
// ROLE EDIT MODAL
// ==========================================
function openRoleModal(uid) {
    editingUserId = uid;
    const user = allUsers[uid];
    if (!user) return;

    document.getElementById('editUserAvatar').src = user.photo || '';
    document.getElementById('editUserName').textContent = user.name || '--';
    document.getElementById('editUserEmail').textContent = user.email || '--';

    const roles = user.roles || [];
    const checkboxes = document.querySelectorAll('#roleCheckboxes input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = roles.includes(cb.value);
    });

    document.getElementById('roleEditModal').classList.add('show');
}

function closeRoleModal() {
    document.getElementById('roleEditModal').classList.remove('show');
    editingUserId = null;
}

async function saveRoles() {
    if (!authDb || !editingUserId) return;

    const checkboxes = document.querySelectorAll('#roleCheckboxes input[type="checkbox"]');
    const roles = [];
    checkboxes.forEach(cb => {
        if (cb.checked) roles.push(cb.value);
    });

    try {
        await authDb.ref('users/' + editingUserId + '/roles').set(roles);
        await authDb.ref('users/' + editingUserId + '/updatedAt').set(firebase.database.ServerValue.TIMESTAMP);

        trackBW('write', { roles, updatedAt: true });

        const user = allUsers[editingUserId];
        await logActivity('edit_roles', user?.name || user?.email || editingUserId, roles.join(', '));

        closeRoleModal();
        showToast(`Roles updated (${roles.join(', ')})`, 'success');
    } catch (e) {
        console.error('Save roles error:', e);
        showToast('Failed to update roles', 'error');
    }
}

// ==========================================
// CONFIRM DIALOG
// ==========================================
function showConfirm(title, text, callback, type) {
    confirmCallback = callback;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmDialog').classList.add('show');
}

function closeConfirm() {
    document.getElementById('confirmDialog').classList.remove('show');
    confirmCallback = null;
}

function executeConfirm() {
    if (confirmCallback) {
        confirmCallback();
    }
    closeConfirm();
}

// ==========================================
// ACTIVITY LOG
// Bandwidth optimized: limit to 50 entries
// ==========================================
async function logActivity(action, target, detail) {
    if (!authDb) return;

    try {
        await authDb.ref('activity_log').push({
            action: action,
            target: target || '',
            detail: detail || '',
            by: getCurrentUser()?.displayName || 'Owner',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (e) {
        console.error('Log error:', e);
    }
}

function renderActivityLog() {
    const container = document.getElementById('activityLog');
    const empty = document.getElementById('noLog');
    if (!container) return;

    if (activityLog.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';

    let html = '';
    activityLog.forEach((log, i) => {
        const icon = getLogIcon(log.action);
        const text = getLogText(log);
        const time = getTimeAgo(log.timestamp);

        html += `
            <div class="log-item" style="animation-delay:${i * 0.02}s;">
                <span class="log-icon">${icon}</span>
                <span class="log-text">${text}</span>
                <span class="log-time">${time}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

function getLogIcon(action) {
    const icons = {
        approved: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        denied: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        delayed: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        revoked: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        deleted: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        edit_roles: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        approved_all: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        denied_all: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    };
    return icons[action] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function getLogText(log) {
    const target = log.target || '--';
    switch (log.action) {
        case 'approved': return `<strong>${target}</strong> approved${log.detail ? ' (' + log.detail + ')' : ''}`;
        case 'denied': return `<strong>${target}</strong> denied`;
        case 'delayed': return `<strong>${target}</strong> delayed`;
        case 'revoked': return `<strong>${target}</strong> access revoked`;
        case 'deleted': return `<strong>${target}</strong> deleted`;
        case 'edit_roles': return `<strong>${target}</strong> roles &rarr; ${log.detail || '--'}`;
        case 'approved_all': return `<strong>${target}</strong> bulk approved`;
        case 'denied_all': return `<strong>${target}</strong> bulk denied`;
        default: return `${log.action}: <strong>${target}</strong>`;
    }
}

async function clearLog() {
    if (!authDb) return;

    showConfirm(
        'Clear Activity Log?',
        'This will permanently delete all activity records. This cannot be undone.',
        async () => {
            try {
                await authDb.ref('activity_log').remove();
                activityLog = [];
                renderActivityLog();
                showToast('Activity log cleared', 'success');
            } catch (e) {
                console.error('Clear log error:', e);
            }
        }
    );
}

// ==========================================
// EXPORT USERS
// ==========================================
function exportUsers() {
    const users = Object.entries(allUsers).map(([uid, u]) => ({
        uid,
        name: u.name || '',
        email: u.email || '',
        status: u.status || '',
        roles: (u.roles || []).join(';'),
        lastLogin: u.lastLogin ? new Date(u.lastLogin).toISOString() : '',
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : ''
    }));

    if (users.length === 0) {
        showToast('No users to export', 'warning');
        return;
    }

    // CSV Export
    const headers = ['UID', 'Name', 'Email', 'Status', 'Roles', 'Last Login', 'Created'];
    const csvRows = [headers.join(',')];
    users.forEach(u => {
        csvRows.push([
            u.uid,
            `"${u.name}"`,
            u.email,
            u.status,
            `"${u.roles}"`,
            u.lastLogin,
            u.createdAt
        ].join(','));
    });

    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stc-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`Exported ${users.length} users`, 'success');
}

// ==========================================
// NOTIFICATION
// ==========================================
function playNotifSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
        // Sound not available
    }
}

function toggleNotifSound() {
    notifSoundEnabled = document.getElementById('notifSoundToggle').checked;
}

// ==========================================
// TOAST SYSTEM
// ==========================================
let toastId = 0;

function showToast(text, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.id = 'toast_' + (++toastId);

    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    toast.innerHTML = `${icons[type] || icons.success}<span>${text}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 400);
    }, 3500);
}

// ==========================================
// REFRESH
// ==========================================
async function refreshData() {
    showToast('Refreshing data...', 'success');
    await loadAllUsers();
    await loadAccessRequests();
    await loadActivityLog();
    showToast('Data refreshed', 'success');
}

// ==========================================
// HELPERS
// ==========================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getInitial(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
}

function getTimeAgo(timestamp) {
    if (!timestamp) return '--';
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

// ==========================================
// MODAL CLICK OUTSIDE
// ==========================================
document.addEventListener('click', (e) => {
    const roleModal = document.getElementById('roleEditModal');
    if (e.target === roleModal) closeRoleModal();
    const confirmModal = document.getElementById('confirmDialog');
    if (e.target === confirmModal) closeConfirm();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeRoleModal();
        closeConfirm();
    }
});

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
document.addEventListener('keydown', (e) => {
    // Ctrl+R = Refresh (override default)
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        refreshData();
    }
    // Ctrl+E = Export
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        exportUsers();
    }
});

// ==========================================
// GLOBAL EXPORTS
// ==========================================
Object.assign(window, {
    approveUser,
    delayUser,
    denyUser,
    approveAllPending,
    denyAllPending,
    revokeAccess,
    deleteUser,
    openRoleModal,
    closeRoleModal,
    saveRoles,
    toggleReqRole,
    filterApproved,
    clearLog,
    refreshData,
    toggleNotifSound,
    exportUsers,
    closeConfirm,
    executeConfirm,
    showConfirm
});

console.log('Access Control V2.0 Loaded');
