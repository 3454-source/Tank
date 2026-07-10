(() => {
  const socket = io();

  // ---------- Screen management ----------
  const screens = {
    home: document.getElementById("screen-home"),
    room: document.getElementById("screen-room"),
    game: document.getElementById("screen-game"),
  };
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ---------- Home screen ----------
  const nicknameInput = document.getElementById("nickname");
  const joinCodeInput = document.getElementById("joinCode");
  const customCodeInput = document.getElementById("customCode");
  const btnJoin = document.getElementById("btnJoin");
  const btnCreate = document.getElementById("btnCreate");
  const btnPractice = document.getElementById("btnPractice");
  const homeError = document.getElementById("homeError");

  nicknameInput.value = localStorage.getItem("tt_nickname") || "";

  function getName() {
    const n = nicknameInput.value.trim().slice(0, 12);
    return n || "Player";
  }

  btnCreate.addEventListener("click", () => {
    homeError.textContent = "";
    localStorage.setItem("tt_nickname", getName());
    const code = customCodeInput.value.trim();
    socket.emit("createRoom", { name: getName(), code: code || undefined });
  });

  btnJoin.addEventListener("click", () => {
    homeError.textContent = "";
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) {
      homeError.textContent = "초대 코드를 입력하세요.";
      return;
    }
    localStorage.setItem("tt_nickname", getName());
    socket.emit("joinRoom", { code, name: getName() });
  });

  btnPractice.addEventListener("click", () => {
    homeError.textContent = "";
    localStorage.setItem("tt_nickname", getName());
    isPracticeMode = true;
    socket.emit("startPractice", { name: getName() });
  });

  socket.on("joinError", (msg) => {
    homeError.textContent = msg;
  });

  // ---------- Room screen ----------
  const roomCodeEl = document.getElementById("roomCode");
  const btnCopy = document.getElementById("btnCopy");
  const playerListEl = document.getElementById("playerList");
  const gameButtonsEl = document.getElementById("gameButtons");
  const mapSelectEl = document.getElementById("mapSelect");
  const mapButtonsEl = document.getElementById("mapButtons");
  const gameSettingsPanel = document.getElementById("gameSettingsPanel");
  const gameSettingsTitle = document.getElementById("gameSettingsTitle");
  const gameSettingsRows = document.getElementById("gameSettingsRows");
  const btnReady = document.getElementById("btnReady");
  const btnLeave = document.getElementById("btnLeave");
  const roomStatus = document.getElementById("roomStatus");

  let myId = null;
  let currentRoom = null;
  let mapList = [];
  let gameList = [];
  let iAmReady = false;
  let isPracticeMode = false;
  let currentGameId = "tank";
  let lastRenderedSettingsGameId = null;

  socket.on("connect", () => {
    myId = socket.id;
  });

  socket.on("joined", ({ code, mapList: ml, gameList: gl }) => {
    mapList = ml || [];
    gameList = gl || [];
    roomCodeEl.textContent = code;
    renderMapButtons();
    renderGameButtons();
    showScreen("room");
  });

  btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(roomCodeEl.textContent);
      btnCopy.textContent = "복사됨!";
      setTimeout(() => (btnCopy.textContent = "복사"), 1200);
    } catch (e) {
      /* clipboard unavailable, ignore */
    }
  });

  btnReady.addEventListener("click", () => {
    iAmReady = !iAmReady;
    socket.emit("setReady", iAmReady);
  });

  btnLeave.addEventListener("click", () => {
    socket.emit("leaveRoom");
    currentRoom = null;
    iAmReady = false;
    showScreen("home");
  });

  const btnExitPractice = document.getElementById("btnExitPractice");
  btnExitPractice.addEventListener("click", () => {
    socket.emit("leaveRoom");
    isPracticeMode = false;
    btnExitPractice.classList.add("hidden");
    showScreen("home");
  });

  function findGameDef(id) {
    return gameList.find((g) => g.id === id);
  }

  function renderGameButtons() {
    gameButtonsEl.innerHTML = "";
    gameList.forEach((g) => {
      const b = document.createElement("button");
      b.textContent = g.name;
      b.dataset.gameId = g.id;
      b.addEventListener("click", () => {
        if (!currentRoom || currentRoom.hostId !== myId) return;
        socket.emit("setGame", g.id);
      });
      gameButtonsEl.appendChild(b);
    });
  }

  function renderMapButtons() {
    mapButtonsEl.innerHTML = "";
    mapList.forEach((m) => {
      const b = document.createElement("button");
      b.textContent = m.name;
      b.dataset.mapId = m.id;
      b.addEventListener("click", () => {
        if (!currentRoom) return;
        if (currentRoom.hostId !== myId) return;
        socket.emit("setMap", m.id);
      });
      mapButtonsEl.appendChild(b);
    });
  }

  function updateSettingRowLabel(el) {
    const valEl = el.closest(".setting-row").querySelector(".val");
    valEl.textContent = el.value + (el.dataset.unit || "");
  }

  function renderGameSettings(gameId) {
    const def = findGameDef(gameId);
    gameSettingsRows.innerHTML = "";
    if (!def || !def.settingsSchema || def.settingsSchema.length === 0) {
      gameSettingsPanel.classList.add("hidden");
      return;
    }
    gameSettingsPanel.classList.remove("hidden");
    gameSettingsTitle.textContent = `⚙️ ${def.name} 설정 (방장 전용)`;
    def.settingsSchema.forEach((field) => {
      const row = document.createElement("div");
      row.className = "setting-row";
      row.innerHTML =
        `<label><span>${field.label}</span><span class="val"></span></label>` +
        `<input type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${field.default}" data-key="${field.key}" data-unit="${field.unit}" />`;
      gameSettingsRows.appendChild(row);
    });
    [...gameSettingsRows.querySelectorAll("input[type=range]")].forEach((el) => {
      updateSettingRowLabel(el);
      el.addEventListener("input", () => {
        updateSettingRowLabel(el);
        emitSettings();
      });
    });
  }

  function emitSettings() {
    if (!currentRoom || currentRoom.hostId !== myId) return;
    const settings = {};
    [...gameSettingsRows.querySelectorAll("input[type=range]")].forEach((el) => {
      settings[el.dataset.key] = Number(el.value);
    });
    socket.emit("setSettings", settings);
  }

  socket.on("room", (room) => {
    currentRoom = room;
    currentGameId = room.gameId;
    const me = room.players.find((p) => p.id === myId);
    iAmReady = me ? me.ready : false;
    const isHost = room.hostId === myId;

    playerListEl.innerHTML = "";
    room.players.forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "player-chip" + (p.ready ? " ready" : "");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = p.color;
      chip.appendChild(dot);
      const label = document.createElement("span");
      label.textContent = p.name + (p.id === room.hostId ? " 👑" : "") + (p.id === myId ? " (나)" : "");
      chip.appendChild(label);
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = p.ready ? "준비완료" : "대기중";
      chip.appendChild(badge);
      playerListEl.appendChild(chip);
    });

    [...gameButtonsEl.children].forEach((b) => {
      b.classList.toggle("selected", b.dataset.gameId === room.gameId);
      b.disabled = !isHost;
    });

    const def = findGameDef(room.gameId);
    const usesMap = def ? def.usesMap : true;
    mapSelectEl.classList.toggle("hidden", !usesMap);
    [...mapButtonsEl.children].forEach((b) => {
      b.classList.toggle("selected", b.dataset.mapId === room.mapId);
      b.disabled = !isHost;
    });

    if (room.gameId !== lastRenderedSettingsGameId) {
      lastRenderedSettingsGameId = room.gameId;
      renderGameSettings(room.gameId);
    }
    const activeKey =
      document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    if (room.settings) {
      [...gameSettingsRows.querySelectorAll("input[type=range]")].forEach((el) => {
        if (el.dataset.key === activeKey) return;
        if (room.settings[el.dataset.key] !== undefined) {
          el.value = room.settings[el.dataset.key];
          updateSettingRowLabel(el);
        }
      });
    }
    [...gameSettingsRows.querySelectorAll("input")].forEach((el) => (el.disabled = !isHost));

    btnReady.textContent = iAmReady ? "준비 취소" : "준비완료";
    btnReady.classList.toggle("active", iAmReady);

    if (room.state === "countdown") {
      roomStatus.textContent = `모두 준비 완료! 게임 시작 중... (${room.countdown})`;
    } else if (room.players.length < 2) {
      roomStatus.textContent = "게임을 시작하려면 최소 2명이 필요합니다.";
    } else {
      const readyCount = room.players.filter((p) => p.ready).length;
      roomStatus.textContent = `${readyCount}/${room.players.length} 준비완료 — 모두 준비되면 자동 시작됩니다.`;
    }

    if (room.state === "lobby" && screens.game.classList.contains("active")) {
      showScreen("room");
    }
  });

  // ---------- Game screen: view switching ----------
  const gameViews = {
    canvas: document.getElementById("gameView-canvas"),
    reaction: document.getElementById("gameView-reaction"),
    updown: document.getElementById("gameView-updown"),
  };
  function viewForGame(gameId) {
    if (gameId === "tank" || gameId === "sword") return "canvas";
    return gameId;
  }
  function showGameView(gameId) {
    const target = viewForGame(gameId);
    Object.entries(gameViews).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== target);
    });
  }

  const controlsHint = document.getElementById("controlsHint");
  function updateControlsHint(gameId) {
    if (gameId === "tank" || gameId === "sword") {
      controlsHint.textContent =
        "이동: W A S D　발사/공격: Space　(모바일: 조이스틱 + 발사 버튼, 좌상단 ⛶ 버튼으로 전체화면)";
    } else if (gameId === "reaction") {
      controlsHint.textContent = "초록색으로 바뀌면 최대한 빨리 클릭하거나 Space를 누르세요!";
    } else if (gameId === "updown") {
      controlsHint.textContent = "숫자를 입력하고 추측! 버튼을 눌러보세요. Enter로도 제출됩니다.";
    } else {
      controlsHint.textContent = "";
    }
  }

  // ---------- Canvas game (tank / sword) ----------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const roundOverOverlay = document.getElementById("roundOverOverlay");

  let mapData = null; // gameStart payload (walls/world size for canvas games)
  let playersInfo = []; // [{id,name,color}]
  let latestState = null;
  let tankRadius = 16;
  let charRadius = 22;
  let bulletVisualRadius = 4;

  // Fixed-size viewport; the camera pans over the (larger) world instead of
  // shrinking the whole map down to fit, so the arena can be big without
  // making tanks tiny on screen.
  const camera = { x: 0, y: 0 };

  // Personal FOV/zoom preference (client-only, saved per browser).
  const elFov = document.getElementById("setFov");
  const valFov = document.getElementById("valFov");
  let fovPercent = Number(localStorage.getItem("tt_fov")) || 100;
  elFov.value = fovPercent;
  valFov.textContent = fovPercent + "%";
  elFov.addEventListener("input", () => {
    fovPercent = Number(elFov.value);
    valFov.textContent = fovPercent + "%";
    localStorage.setItem("tt_fov", String(fovPercent));
  });

  socket.on("countdown", (n) => {
    countdownOverlay.classList.remove("hidden");
    countdownOverlay.textContent = n > 0 ? n : "GO!";
  });

  socket.on("gameStart", (data) => {
    currentGameId = data.gameId;
    mapData = data;
    playersInfo = data.players || [];
    latestState = null;
    stateBuffer.length = 0;
    camera.x = 0;
    camera.y = 0;
    tankRadius = data.tankRadius || 16;
    charRadius = data.charRadius || 22;
    bulletVisualRadius = data.bulletRadius || 4;
    countdownOverlay.classList.add("hidden");
    roundOverOverlay.classList.add("hidden");
    btnExitPractice.classList.toggle("hidden", !isPracticeMode);
    if (isTouchDevice) mobileControls.classList.toggle("hidden", viewForGame(currentGameId) !== "canvas");

    showGameView(currentGameId);
    updateControlsHint(currentGameId);

    if (currentGameId === "reaction") {
      reactionBox.textContent = "대기 중...";
      reactionBox.classList.remove("go", "early");
    } else if (currentGameId === "updown") {
      updownMax.textContent = data.maxNumber;
      updownInput.value = "";
      updownFeedback.textContent = "";
      updownHistory.innerHTML = "";
    }

    showScreen("game");
  });

  const stateBuffer = []; // { t: performance.now(), state } for render interpolation
  const INTERP_DELAY = 90; // ms

  socket.on("state", (state) => {
    latestState = state;
    stateBuffer.push({ t: performance.now(), state });
    while (stateBuffer.length > 20) stateBuffer.shift();
  });

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerpAngle(a, b, t) {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + diff * t;
  }

  function getRenderState() {
    if (stateBuffer.length === 0) return latestState;
    if (stateBuffer.length === 1) return stateBuffer[0].state;

    const renderTime = performance.now() - INTERP_DELAY;
    if (renderTime <= stateBuffer[0].t) return stateBuffer[0].state;
    const last = stateBuffer[stateBuffer.length - 1];
    if (renderTime >= last.t) return last.state;

    for (let i = 0; i < stateBuffer.length - 1; i++) {
      const cur = stateBuffer[i];
      const next = stateBuffer[i + 1];
      if (renderTime >= cur.t && renderTime <= next.t) {
        const span = next.t - cur.t;
        const t = span > 0 ? (renderTime - cur.t) / span : 0;
        return interpolateState(cur.state, next.state, t);
      }
    }
    return last.state;
  }

  function interpolateState(a, b, t) {
    const result = {};
    if (b.tanks) {
      result.tanks = b.tanks.map((bt) => {
        const at = (a.tanks || []).find((x) => x.id === bt.id);
        if (!at) return bt;
        return {
          id: bt.id,
          x: lerp(at.x, bt.x, t),
          y: lerp(at.y, bt.y, t),
          angle: lerpAngle(at.angle, bt.angle, t),
          alive: bt.alive,
          lives: bt.lives,
        };
      });
    }
    if (b.fighters) {
      result.fighters = b.fighters.map((bf) => {
        const af = (a.fighters || []).find((x) => x.id === bf.id);
        if (!af) return bf;
        return {
          id: bf.id,
          x: lerp(af.x, bf.x, t),
          y: lerp(af.y, bf.y, t),
          angle: lerpAngle(af.angle, bf.angle, t),
          alive: bf.alive,
          lives: bf.lives,
          swinging: bf.swinging,
        };
      });
    }
    if (b.bullets) {
      result.bullets = b.bullets.map((bb) => {
        const ab = (a.bullets || []).find((x) => x.id === bb.id);
        if (!ab) return bb;
        return { id: bb.id, ownerId: bb.ownerId, x: lerp(ab.x, bb.x, t), y: lerp(ab.y, bb.y, t) };
      });
    }
    return result;
  }

  socket.on("roundOver", (data) => {
    roundOverOverlay.classList.remove("hidden");
    const { winnerId, winnerName } = data;
    const tail = '<div class="sub">잠시 후 로비로 돌아갑니다...</div>';

    if (currentGameId === "reaction") {
      reactionBox.textContent = "";
      reactionBox.classList.remove("go", "early");
    }

    if (currentGameId === "reaction" && data.reactionResults) {
      const rows = data.reactionResults
        .map((r, i) => {
          const label = r.early ? "부정 출발" : r.ms !== null ? `${r.ms}ms` : "클릭 안 함";
          return `<div>${i + 1}. ${escapeHtml(r.name)} — ${label}</div>`;
        })
        .join("");
      roundOverOverlay.innerHTML =
        `<div style="font-size:1.4rem">${winnerId ? escapeHtml(winnerName) + " 승리!" : "기록 없음"}</div>` +
        `<div class="sub" style="margin-top:10px">${rows}</div>` +
        tail;
    } else if (currentGameId === "updown" && data.secret !== undefined) {
      roundOverOverlay.innerHTML =
        `<div>${escapeHtml(winnerName)} 정답!</div><div class="sub">정답은 ${data.secret} 이었습니다.</div>` + tail;
    } else if (winnerId) {
      const p = playersInfo.find((pl) => pl.id === winnerId);
      roundOverOverlay.innerHTML = `<div>${escapeHtml(winnerName || (p && p.name) || "?")} 승리!</div>` + tail;
    } else {
      roundOverOverlay.innerHTML = `<div>무승부</div>` + tail;
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function playerColor(id) {
    const p = playersInfo.find((pl) => pl.id === id);
    return p ? p.color : "#fff";
  }
  function playerName(id) {
    const p = playersInfo.find((pl) => pl.id === id);
    return p ? p.name : "";
  }

  function drawBackgroundGrid(w, h) {
    ctx.strokeStyle = "#1e2530";
    ctx.lineWidth = 1;
    const gridSize = 60;
    ctx.beginPath();
    for (let x = 0; x <= w; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  function drawWalls(walls, thick) {
    ctx.strokeStyle = "#4a5568";
    ctx.lineCap = "round";
    ctx.lineWidth = thick;
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 4;
    for (const w of walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawTank(t) {
    const color = playerColor(t.id);
    ctx.save();
    ctx.translate(t.x, t.y);

    if (!t.alive) {
      ctx.globalAlpha = 0.25;
    }

    // name tag (with remaining lives, when the room uses more than 1)
    ctx.globalAlpha = t.alive ? 1 : 0.35;
    ctx.fillStyle = "#cfd6e4";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    const nameLabel =
      mapData && mapData.maxLives > 1 ? `${playerName(t.id)} ❤${Math.max(0, t.lives)}` : playerName(t.id);
    ctx.fillText(nameLabel, 0, -26);

    ctx.rotate(t.angle);
    ctx.scale(tankRadius / 16, tankRadius / 16);

    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    // barrel (points toward the front, +x)
    ctx.fillStyle = "#20242e";
    ctx.fillRect(0, -3, 22, 6);

    // body
    ctx.fillStyle = color;
    ctx.strokeStyle = "#10131a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-16, -12, 32, 24, 5);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // front nose highlight - armored side, blocks incoming shots
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(16, -9);
    ctx.lineTo(22, 0);
    ctx.lineTo(16, 9);
    ctx.closePath();
    ctx.fill();

    // rear weak-point marker - a hit here costs a life
    ctx.fillStyle = "#161822";
    ctx.fillRect(-16, -12, 7, 24);
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-16, -9);
    ctx.lineTo(-9, -2);
    ctx.moveTo(-16, 1);
    ctx.lineTo(-9, 8);
    ctx.stroke();

    ctx.restore();
  }

  function drawFighter(f) {
    const color = playerColor(f.id);
    ctx.save();
    ctx.translate(f.x, f.y);

    if (!f.alive) ctx.globalAlpha = 0.25;

    ctx.globalAlpha = f.alive ? 1 : 0.35;
    ctx.fillStyle = "#cfd6e4";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    const nameLabel =
      mapData && mapData.maxLives > 1 ? `${playerName(f.id)} ❤${Math.max(0, f.lives)}` : playerName(f.id);
    ctx.fillText(nameLabel, 0, -30);

    ctx.rotate(f.angle);
    ctx.scale(charRadius / 22, charRadius / 22);

    // sword swing arc (drawn under the body so the body reads on top)
    if (f.swinging) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 56, -Math.PI / 3, Math.PI / 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    ctx.fillStyle = color;
    ctx.strokeStyle = "#10131a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // facing indicator
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(14, -6);
    ctx.lineTo(23, 0);
    ctx.lineTo(14, 6);
    ctx.closePath();
    ctx.fill();

    // sword
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const swordAngle = f.swinging ? Math.sin(performance.now() * 0.03) * 0.9 : 0.15;
    ctx.save();
    ctx.rotate(swordAngle);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(46, 0);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawBullet(b) {
    const color = playerColor(b.ownerId);
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.arc(b.x, b.y, bulletVisualRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    requestAnimationFrame(render);
    if (!screens.game.classList.contains("active") || viewForGame(currentGameId) !== "canvas" || !mapData) return;

    const renderState = getRenderState();

    // fov > 1 zooms out (shows more of the map), fov < 1 zooms in.
    const fov = fovPercent / 100;
    const viewW = canvas.width * fov;
    const viewH = canvas.height * fov;

    // Follow the local player's entity, clamped so the camera never shows
    // outside the world bounds.
    if (renderState) {
      const entities = renderState.tanks || renderState.fighters || [];
      const mine = entities.find((e) => e.id === myId);
      if (mine) {
        const targetX = mine.x - viewW / 2;
        const targetY = mine.y - viewH / 2;
        camera.x = Math.max(0, Math.min(targetX, Math.max(0, mapData.worldW - viewW)));
        camera.y = Math.max(0, Math.min(targetY, Math.max(0, mapData.worldH - viewH)));
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(1 / fov, 1 / fov);
    ctx.translate(-camera.x, -camera.y);

    drawBackgroundGrid(mapData.worldW, mapData.worldH);
    drawWalls(mapData.walls, mapData.wallThick);

    if (renderState) {
      if (renderState.bullets) for (const b of renderState.bullets) drawBullet(b);
      if (renderState.tanks) for (const t of renderState.tanks) drawTank(t);
      if (renderState.fighters) for (const f of renderState.fighters) drawFighter(f);
    }

    ctx.restore();
  }
  render();

  // ---------- Reaction speed test view ----------
  const reactionBox = document.getElementById("reactionBox");
  reactionBox.addEventListener("click", () => {
    if (currentGameId !== "reaction") return;
    socket.emit("gameAction", { type: "click" });
  });
  socket.on("reactionGo", () => {
    reactionBox.textContent = "지금 클릭!";
    reactionBox.classList.remove("early");
    reactionBox.classList.add("go");
  });
  socket.on("reactionEarly", ({ playerId }) => {
    if (playerId === myId) {
      reactionBox.textContent = "너무 빨랐어요! 대기하세요...";
      reactionBox.classList.add("early");
    }
  });

  // ---------- Up-down guessing view ----------
  const updownMax = document.getElementById("updownMax");
  const updownInput = document.getElementById("updownInput");
  const updownSubmit = document.getElementById("updownSubmit");
  const updownFeedback = document.getElementById("updownFeedback");
  const updownHistory = document.getElementById("updownHistory");

  function submitGuess() {
    if (currentGameId !== "updown") return;
    const v = Number(updownInput.value);
    if (!Number.isFinite(v)) return;
    socket.emit("gameAction", { type: "guess", value: v });
  }
  updownSubmit.addEventListener("click", submitGuess);
  updownInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitGuess();
  });
  socket.on("updownFeedback", ({ guess, hint }) => {
    updownFeedback.textContent = hint === "up" ? `${guess} 보다 큽니다 ⬆️` : `${guess} 보다 작습니다 ⬇️`;
    const chip = document.createElement("span");
    chip.className = "chip " + hint;
    chip.textContent = `${guess} ${hint === "up" ? "⬆" : "⬇"}`;
    updownHistory.appendChild(chip);
  });

  // ---------- Input (movement games: tank / sword) ----------
  // Movement is absolute/screen-relative: WASD (or the joystick) directly
  // sets a direction vector, and the tank/fighter instantly faces that
  // direction. No "rotate, then drive forward relative to facing".
  const keyState = { up: false, down: false, left: false, right: false, shoot: false };
  let joyMoveX = 0;
  let joyMoveY = 0;
  let joyActive = false;
  let lastSent = "";

  function sendInput() {
    let moveX, moveY;
    if (joyActive) {
      moveX = joyMoveX;
      moveY = joyMoveY;
    } else {
      moveX = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
      moveY = (keyState.down ? 1 : 0) - (keyState.up ? 1 : 0);
    }
    const input = { moveX, moveY, shoot: keyState.shoot };
    const s = JSON.stringify(input);
    if (s !== lastSent) {
      lastSent = s;
      socket.emit("input", input);
    }
  }

  const KEY_MAP = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
    Space: "shoot",
  };

  window.addEventListener("keydown", (e) => {
    if (!screens.game.classList.contains("active")) return;
    if (e.code === "Space" && currentGameId === "reaction") {
      e.preventDefault();
      socket.emit("gameAction", { type: "click" });
      return;
    }
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    keyState[action] = true;
    sendInput();
  });

  window.addEventListener("keyup", (e) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    keyState[action] = false;
    sendInput();
  });

  window.addEventListener("blur", () => {
    Object.keys(keyState).forEach((k) => (keyState[k] = false));
    sendInput();
  });

  // ---------- Fullscreen (mainly useful on mobile) ----------
  const btnFullscreen = document.getElementById("btnFullscreen");

  function requestFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) return;
    try {
      Promise.resolve(fn.call(el)).catch(() => {});
    } catch (e) {
      /* fullscreen unsupported/blocked, ignore */
    }
  }
  function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!fn) return;
    try {
      Promise.resolve(fn.call(document)).catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }
  function updateFullscreenButton() {
    btnFullscreen.textContent = isFullscreen() ? "⛶✕" : "⛶";
  }
  btnFullscreen.addEventListener("click", () => {
    if (isFullscreen()) exitFullscreen();
    else requestFullscreen();
  });
  ["fullscreenchange", "webkitfullscreenchange", "msfullscreenchange"].forEach((ev) =>
    document.addEventListener(ev, updateFullscreenButton)
  );

  // ---------- Mobile touch controls (virtual joystick + fire button) ----------
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const mobileControls = document.getElementById("mobileControls");
  const joystickZone = document.getElementById("joystickZone");
  const joystickKnob = document.getElementById("joystickKnob");
  const fireButton = document.getElementById("fireButton");

  if (isTouchDevice) {
    btnFullscreen.classList.remove("hidden");

    const JOY_RADIUS = 50;
    const JOY_DEADZONE = 0.15;

    let joyTouchId = null;
    let joyCenter = { x: 0, y: 0 };

    function updateJoystick(clientX, clientY) {
      const dx = clientX - joyCenter.x;
      const dy = clientY - joyCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOY_RADIUS);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;

      const mag = clamped / JOY_RADIUS;
      if (mag < JOY_DEADZONE) {
        joyActive = false;
        joyMoveX = 0;
        joyMoveY = 0;
      } else {
        joyActive = true;
        joyMoveX = kx / JOY_RADIUS;
        joyMoveY = ky / JOY_RADIUS;
      }
      sendInput();
    }

    function resetJoystick() {
      joyTouchId = null;
      joyActive = false;
      joyMoveX = 0;
      joyMoveY = 0;
      joystickKnob.style.transform = "translate(0px, 0px)";
      sendInput();
    }

    joystickZone.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joyTouchId = t.identifier;
        const rect = joystickZone.getBoundingClientRect();
        joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        updateJoystick(t.clientX, t.clientY);
      },
      { passive: false }
    );

    joystickZone.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const t = [...e.changedTouches].find((t) => t.identifier === joyTouchId);
        if (t) updateJoystick(t.clientX, t.clientY);
      },
      { passive: false }
    );

    function handleJoystickEnd(e) {
      e.preventDefault();
      const ended = [...e.changedTouches].some((t) => t.identifier === joyTouchId);
      if (ended) resetJoystick();
    }
    joystickZone.addEventListener("touchend", handleJoystickEnd, { passive: false });
    joystickZone.addEventListener("touchcancel", handleJoystickEnd, { passive: false });

    fireButton.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        keyState.shoot = true;
        sendInput();
      },
      { passive: false }
    );
    fireButton.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        keyState.shoot = false;
        sendInput();
      },
      { passive: false }
    );
    fireButton.addEventListener(
      "touchcancel",
      (e) => {
        e.preventDefault();
        keyState.shoot = false;
        sendInput();
      },
      { passive: false }
    );
  }
})();
