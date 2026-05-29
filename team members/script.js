/* ============================================
   CARDS.JS - Team Cards OBS Overlay
   Firebase-powered dynamic player cards
   Controlled by Admin Panel via commands
   Zero-bandwidth payload support (short keys)
   Auto hide/show scorebar integration
   ============================================ */

(function () {
  'use strict';

  // ---- Firebase Config (same as project) ----
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyA3SPSsNTwK6doYq-lpKTozGgRha9HObFI",
    authDomain: "stc-score-v3.firebaseapp.com",
    databaseURL: "https://stc-score-v3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "stc-score-v3",
    storageBucket: "stc-score-v3.firebasestorage.app",
    messagingSenderId: "626214005830",
    appId: "1:626214005830:web:bd50292e589b0d34896e47"
  };

  // ---- State ----
  let firebaseApp = null;
  let database = null;
  let matchId = localStorage.getItem('matchId') || 'my_match_999';
  let commandUnsub = null;
  let isVisible = false;
  let currentAnimatingIndex = 0;
  let loopTimer = null;

  // ---- Animation Config ----
  const ZOOM_IN_DURATION = 5000;
  const ZOOM_OUT_DURATION = 800;
  const PAUSE_BETWEEN = 300;

  // ---- DOM References ----
  const overlayContainer = document.getElementById('overlayContainer');
  const bgBlurLayer = document.getElementById('bgBlurLayer');
  const playersGrid = document.getElementById('playersGrid');

  // ---- URL params (matchId can be overridden) ----
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('match')) {
    matchId = urlParams.get('match');
    localStorage.setItem('matchId', matchId);
  }

  // ============================================
  // FIREBASE INIT
  // ============================================
  async function initFirebase() {
    try {
      if (!window.firebase) throw new Error('Firebase SDK not loaded');
      if (!firebase.apps.length) firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      else firebaseApp = firebase.apps[0];
      database = firebase.database();
      console.log('🏏 Cards Page: Firebase connected');
      listenForCommands();
    } catch (e) {
      console.error('Cards Firebase init failed:', e);
    }
  }

  // ============================================
  // COMMAND LISTENER
  // ============================================
  function listenForCommands() {
    if (!database) return;

    // Cleanup old listener
    if (commandUnsub && typeof commandUnsub === 'function') {
      commandUnsub();
    }

    const commandRef = database.ref(`matches/${matchId}/command`);

    commandRef.on('value', (snap) => {
      const cmd = snap.val();
      if (!cmd || !cmd.event) return;

      // Process command
      processCommand(cmd.event, cmd.payload || {});
    });

    // Store unsubscribe reference
    commandUnsub = () => commandRef.off('value');
  }

  // ============================================
  // PROCESS COMMAND
  // ============================================
  function processCommand(event, payload) {
    switch (event) {
      case 'show_cards_team1':
        loadAndShowCards(1, payload);
        break;
      case 'show_cards_team2':
        loadAndShowCards(2, payload);
        break;
      case 'hide_cards':
        hideCards();
        break;
      case 'hide_all':
      case 'hide_all_graphics':
        hideCards();
        break;
    }
  }

  // ============================================
  // LOAD TEAM DATA & SHOW CARDS
  // ============================================
  async function loadAndShowCards(teamNumber, payload) {
    if (!database) return;

    try {
      // Normalize zero-bandwidth payload keys
      // Admin sends short keys: tn=teamName, sn=shortName, tl=teamLogo, p=players[]
      // Each player: n=name, r=role, ph=photo, j=jerseyNumber
      const teamName = payload.tn || payload.teamName || '';
      const teamShortName = payload.sn || payload.teamShortName || '';
      const teamLogo = payload.tl || payload.teamLogo || '';
      const rawPlayers = payload.p || payload.players || [];

      // Normalize players with zero-bandwidth support
      const players = rawPlayers.map(p => {
        if (typeof p === 'string') return { name: p, role: '', photo: '', jerseyNumber: '' };
        return {
          name: p.n || p.name || 'Unknown',
          role: p.r || p.role || '',
          photo: p.ph || p.photo || '',
          jerseyNumber: p.j || p.jerseyNumber || ''
        };
      });

      // If payload already has team data + players, use it directly (zero-bandwidth path)
      if (teamName && players.length > 0) {
        showCardsWithPayload({ teamName, teamShortName, teamLogo, players }, teamNumber);
        return;
      }

      // Fallback: load from Firebase (only if payload was empty/incomplete)
      const liveSnap = await database.ref(`matches/${matchId}/live`).once('value');
      const liveData = liveSnap.val() || {};

      const teamId = payload.ti || payload.teamId || (teamNumber === 1 ? liveData.team1Id : liveData.team2Id);

      let fbTeamName = teamName || (teamNumber === 1 ? liveData.batFlag : liveData.bowlFlag) || `Team ${teamNumber}`;
      let fbShortName = teamShortName || fbTeamName;
      let fbLogo = teamLogo || (teamNumber === 1 ? liveData.t1Logo : liveData.t2Logo) || '';

      // Load team data if teamId is available
      if (teamId) {
        const teamSnap = await database.ref(`teams/${teamId}`).once('value');
        const teamData = teamSnap.val();
        if (teamData) {
          fbTeamName = teamData.name || fbTeamName;
          fbShortName = teamData.short_name || fbShortName;
          fbLogo = teamData.logo_url || teamData.logo_base64 || fbLogo;
        }
      }

      // Load players for this team
      let fbPlayers = players;
      if (fbPlayers.length === 0 && teamId) {
        const playersSnap = await database.ref('players').orderByChild('team_id').equalTo(teamId).once('value');
        const playersData = playersSnap.val() || {};
        fbPlayers = Object.entries(playersData).map(([id, p]) => ({
          id,
          name: p.name || 'Unknown',
          role: p.role || '',
          photo: p.photo_url || p.photo_base64 || '',
          jerseyNumber: p.jersey_number || ''
        }));
      }

      // Build the payload and show
      showCardsWithPayload({
        teamName: fbTeamName,
        teamShortName: fbShortName,
        teamLogo: fbLogo,
        players: fbPlayers
      }, teamNumber);

    } catch (e) {
      console.error('Error loading team data:', e);
    }
  }

  // ============================================
  // SHOW CARDS WITH PAYLOAD DATA
  // ============================================
  function showCardsWithPayload(payload, teamNumber) {
    // Stop any existing loop
    stopLoop();

    // Update header elements
    const teamNameEl = document.getElementById('teamName');
    const teamLogoImg = document.getElementById('teamLogoImg');
    const teamLogoFallback = document.getElementById('teamLogoFallback');
    const brandingBar = document.getElementById('brandingBar');

    // Use full team name (not short name) for display
    const teamName = payload.teamName || `Team ${teamNumber}`;
    const teamShortName = payload.teamShortName || teamName.substring(0, 3).toUpperCase();
    const teamLogo = payload.teamLogo || '';

    // Set team name (full school name)
    if (teamNameEl) teamNameEl.textContent = teamName;

    // Logo
    if (teamLogo) {
      if (teamLogoImg) {
        teamLogoImg.src = teamLogo;
        teamLogoImg.style.display = 'block';
        teamLogoImg.alt = teamName;
      }
      if (teamLogoFallback) teamLogoFallback.style.display = 'none';
    } else {
      if (teamLogoImg) teamLogoImg.style.display = 'none';
      if (teamLogoFallback) {
        teamLogoFallback.textContent = teamShortName;
        teamLogoFallback.style.display = 'block';
      }
    }

    // Build player cards - use full team name instead of short name
    const players = payload.players || [];
    playersGrid.innerHTML = '';

    if (players.length === 0) {
      playersGrid.innerHTML = '<div style="color: rgba(218,165,32,0.5); text-align: center; font-size: 14px; letter-spacing: 2px; padding: 40px;">No players loaded for this team</div>';
    } else {
      players.forEach((player, index) => {
        const isCaptain = index === 0;
        const card = createPlayerCard(player, index, isCaptain, teamName);
        playersGrid.appendChild(card);
      });
    }

    // Show overlay with animation
    showOverlay();

    // Start entrance animation for cards
    startEntranceAnimation();

    // Animate branding bar
    setTimeout(() => {
      if (brandingBar) brandingBar.classList.add('entered');
    }, 500 + players.length * 80);
  }

  // ============================================
  // CREATE PLAYER CARD HTML
  // ============================================
  function createPlayerCard(player, index, isCaptain, teamFullName) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.setAttribute('data-index', index);

    const jerseyNum = player.jerseyNumber || (index + 1);
    const playerName = escapeHtml(player.name || 'Player');
    const playerRole = escapeHtml(player.role || 'Player');
    const playerPhoto = player.photo || '';
    const initial = playerName.charAt(0).toUpperCase();

    // Photo HTML
    let photoHtml = '';
    if (playerPhoto) {
      photoHtml = `<img src="${playerPhoto}" alt="${playerName}" class="player-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <div class="player-initial" style="display:none;">${initial}</div>`;
    } else {
      photoHtml = `<div class="player-initial">${initial}</div>`;
    }

    // Captain badge HTML
    const captainHtml = isCaptain ? '<span class="captain-badge">CAPTAIN</span>' : '';

    // Truncate team name for card bottom if too long
    const displayTeamName = teamFullName.length > 18
      ? teamFullName.substring(0, 16) + '...'
      : teamFullName;

    card.innerHTML = `
      <div class="card-inner">
        ${captainHtml}
        <span class="jersey-watermark">${jerseyNum}</span>
        <span class="top-accent"></span>
        <div class="card-image-wrap">
          ${photoHtml}
          <div class="image-overlay"></div>
          <div class="side-accent"></div>
          <div class="jersey-badge">${jerseyNum}</div>
          <div class="player-info">
            <span class="player-role">${playerRole}</span>
            <span class="player-name">${playerName}</span>
          </div>
        </div>
        <div class="card-bottom">
          <span class="team-indicator"></span>
          <span class="team-label">${escapeHtml(displayTeamName)}</span>
          <span class="jersey-number">#${jerseyNum}</span>
        </div>
      </div>
    `;

    return card;
  }

  // ============================================
  // SHOW / HIDE OVERLAY
  // ============================================
  function showOverlay() {
    if (isVisible) return;
    isVisible = true;

    overlayContainer.classList.remove('hiding');
    overlayContainer.classList.add('visible');
    bgBlurLayer.classList.add('visible');
  }

  function hideCards() {
    if (!isVisible) return;

    stopLoop();
    overlayContainer.classList.add('hiding');

    // Reset branding bar
    const brandingBar = document.getElementById('brandingBar');
    if (brandingBar) brandingBar.classList.remove('entered');

    setTimeout(() => {
      overlayContainer.classList.remove('visible');
      overlayContainer.classList.remove('hiding');
      bgBlurLayer.classList.remove('visible');
      playersGrid.innerHTML = '';
      isVisible = false;
      currentAnimatingIndex = 0;
    }, 700);
  }

  // ============================================
  // ENTRANCE ANIMATION
  // ============================================
  function startEntranceAnimation() {
    const cards = document.querySelectorAll('.player-card');
    cards.forEach((card, index) => {
      setTimeout(() => {
        card.classList.add('entered');
      }, 300 + index * 80);
    });

    // Start loop animation after all cards have entered
    const entranceTime = 300 + cards.length * 80 + 600;
    setTimeout(() => {
      startLoop();
    }, entranceTime);
  }

  // ============================================
  // SEQUENTIAL LOOP ANIMATION
  // ============================================
  function startLoop() {
    const cards = document.querySelectorAll('.player-card');
    if (cards.length === 0) return;
    animateCard(currentAnimatingIndex);
  }

  function animateCard(index) {
    if (!isVisible) return;

    const cards = document.querySelectorAll('.player-card');
    if (cards.length === 0) return;

    const card = cards[index % cards.length];
    if (!card) return;

    const img = card.querySelector('.player-img');

    // Phase 1: ACTIVATE
    card.classList.add('animate');
    if (img) {
      img.style.animation = 'slowZoomIn 5s ease-out forwards';
    }

    // Phase 2: DEACTIVATE after zoom in
    loopTimer = setTimeout(() => {
      card.classList.remove('animate');
      if (img) {
        img.style.animation = 'slowZoomOut 0.8s ease-in-out forwards';
      }

      // Phase 3: CLEAN UP
      loopTimer = setTimeout(() => {
        if (img) {
          img.style.animation = '';
        }

        // Phase 4: Next card
        loopTimer = setTimeout(() => {
          currentAnimatingIndex = (index + 1) % cards.length;
          animateCard(currentAnimatingIndex);
        }, PAUSE_BETWEEN);

      }, ZOOM_OUT_DURATION);

    }, ZOOM_IN_DURATION);
  }

  function stopLoop() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }

    // Remove animate class from all cards
    const cards = document.querySelectorAll('.player-card');
    cards.forEach(card => {
      card.classList.remove('animate');
      const img = card.querySelector('.player-img');
      if (img) img.style.animation = '';
    });
  }

  // ============================================
  // UTILITY - HTML Escape
  // ============================================
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================
  // INITIALIZE
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
  } else {
    initFirebase();
  }

  console.log('🏏 Team Cards OBS Overlay Ready');

})();
