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
  const btnJoin = document.getElementById("btnJoin");
  const btnCreate = document.getElementById("btnCreate");
  const homeError = document.getElementById("homeError");

  nicknameInput.value = localStorage.getItem("tt_nickname") || "";

  function getName() {
    const n = nicknameInput.value.trim().slice(0, 12);
    return n || "Player";
  }

  btnCreate.addEventListener("click", () => {
    homeError.textContent = "";
    localStorage.setItem("tt_nickname", getName());
    socket.emit("createRoom", { name: getName() });
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

  socket.on("joinError", (msg) => {
    homeError.textContent = msg;
  });

  // ---------- Room screen ----------
  const roomCodeEl = document.getElementById("roomCode");
  const btnCopy = document.getElementById("btnCopy");
  const playerListEl = document.getElementById("playerList");
  const mapButtonsEl = document.getElementById("mapButtons");
  const btnReady = document.getElementById("btnReady");
  const btnLeave = document.getElementById("btnLeave");
  const roomStatus = document.getElementById("roomStatus");

  const elSpeed = document.getElementById("setSpeed");
  const elFireRate = document.getElementById("setFireRate");
  const elBulletSpeed = document.getElementById("setBulletSpeed");
  const valSpeed = document.getElementById("valSpeed");
  const valFireRate = document.getElementById("valFireRate");
  const valBulletSpeed = document.getElementById("valBulletSpeed");

  let myId = null;
  let currentRoom = null;
  let mapList = [];
  let iAmReady = false;

  socket.on("connect", () => {
    myId = socket.id;
  });

  socket.on("joined", ({ code, mapList: ml }) => {
    mapList = ml || [];
    roomCodeEl.textContent = code;
    renderMapButtons();
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

  function updateSettingLabels() {
    valSpeed.textContent = elSpeed.value + "%";
    valFireRate.textContent = elFireRate.value + "%";
    valBulletSpeed.textContent = elBulletSpeed.value + "%";
  }
  updateSettingLabels();

  function emitSettings() {
    if (!currentRoom || currentRoom.hostId !== myId) return;
    socket.emit("setSettings", {
      speedMult: Number(elSpeed.value) / 100,
      fireRateMult: Number(elFireRate.value) / 100,
      bulletSpeedMult: Number(elBulletSpeed.value) / 100,
    });
  }
  [elSpeed, elFireRate, elBulletSpeed].forEach((el) => {
    el.addEventListener("input", () => {
      updateSettingLabels();
      emitSettings();
    });
  });

  socket.on("room", (room) => {
    currentRoom = room;
    const me = room.players.find((p) => p.id === myId);
    iAmReady = me ? me.ready : false;

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

    [...mapButtonsEl.children].forEach((b) => {
      b.classList.toggle("selected", b.dataset.mapId === room.mapId);
      b.disabled = room.hostId !== myId;
    });

    const isHost = room.hostId === myId;
    elSpeed.disabled = !isHost;
    elFireRate.disabled = !isHost;
    elBulletSpeed.disabled = !isHost;
    if (room.settings && document.activeElement !== elSpeed && document.activeElement !== elFireRate && document.activeElement !== elBulletSpeed) {
      elSpeed.value = Math.round(room.settings.speedMult * 100);
      elFireRate.value = Math.round(room.settings.fireRateMult * 100);
      elBulletSpeed.value = Math.round(room.settings.bulletSpeedMult * 100);
      updateSettingLabels();
    }

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

  // ---------- Game screen ----------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const roundOverOverlay = document.getElementById("roundOverOverlay");

  let mapData = null; // { walls, worldW, worldH, wallThick }
  let playersInfo = []; // [{id,name,color}]
  let latestState = null;
  let tankRadius = 16; // updated from gameStart, used to scale tank rendering
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
    mapData = data;
    playersInfo = data.players;
    latestState = null;
    stateBuffer.length = 0;
    camera.x = 0;
    camera.y = 0;
    tankRadius = data.tankRadius || 16;
    bulletVisualRadius = data.bulletRadius || 4;
    countdownOverlay.classList.add("hidden");
    roundOverOverlay.classList.add("hidden");
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
    const tanks = b.tanks.map((bt) => {
      const at = a.tanks.find((x) => x.id === bt.id);
      if (!at) return bt;
      return {
        id: bt.id,
        x: lerp(at.x, bt.x, t),
        y: lerp(at.y, bt.y, t),
        angle: lerpAngle(at.angle, bt.angle, t),
        alive: bt.alive,
      };
    });
    const bullets = b.bullets.map((bb) => {
      const ab = a.bullets.find((x) => x.id === bb.id);
      if (!ab) return bb;
      return { id: bb.id, ownerId: bb.ownerId, x: lerp(ab.x, bb.x, t), y: lerp(ab.y, bb.y, t) };
    });
    return { tanks, bullets };
  }

  socket.on("roundOver", ({ winnerId, winnerName }) => {
    roundOverOverlay.classList.remove("hidden");
    if (winnerId) {
      const p = playersInfo.find((pl) => pl.id === winnerId);
      roundOverOverlay.innerHTML = `<div>${escapeHtml(winnerName || (p && p.name) || "?")} 승리!</div><div class="sub">잠시 후 로비로 돌아갑니다...</div>`;
    } else {
      roundOverOverlay.innerHTML = `<div>무승부</div><div class="sub">잠시 후 로비로 돌아갑니다...</div>`;
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

    // name tag
    ctx.globalAlpha = t.alive ? 1 : 0.35;
    ctx.fillStyle = "#cfd6e4";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(playerName(t.id), 0, -26);

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

    // rear weak-point marker - a hit here is a kill
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
    if (!screens.game.classList.contains("active") || !mapData) return;

    const renderState = getRenderState();

    // fov > 1 zooms out (shows more of the map), fov < 1 zooms in.
    const fov = fovPercent / 100;
    const viewW = canvas.width * fov;
    const viewH = canvas.height * fov;

    // Follow the local player's tank, clamped so the camera never shows
    // outside the world bounds.
    if (renderState) {
      const myTank = renderState.tanks.find((t) => t.id === myId);
      if (myTank) {
        const targetX = myTank.x - viewW / 2;
        const targetY = myTank.y - viewH / 2;
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
      for (const b of renderState.bullets) drawBullet(b);
      for (const t of renderState.tanks) drawTank(t);
    }

    ctx.restore();
  }
  render();

  // ---------- Input ----------
  const keyState = { up: false, down: false, left: false, right: false, shoot: false };
  let lastSent = "";

  function sendInput() {
    const s = JSON.stringify(keyState);
    if (s !== lastSent) {
      lastSent = s;
      socket.emit("input", keyState);
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
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (!screens.game.classList.contains("active")) return;
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

  // ---------- Mobile touch controls (virtual joystick + fire button) ----------
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const mobileControls = document.getElementById("mobileControls");
  const joystickZone = document.getElementById("joystickZone");
  const joystickKnob = document.getElementById("joystickKnob");
  const fireButton = document.getElementById("fireButton");

  if (isTouchDevice) {
    mobileControls.classList.remove("hidden");

    const JOY_RADIUS = 50;
    const JOY_DEADZONE = 0.25;
    const TURN_DEADZONE = 0.12;

    let joyTouchId = null;
    let joyCenter = { x: 0, y: 0 };
    let joyAngle = 0;
    let joyMag = 0;

    function applyJoystickToKeys() {
      if (joyTouchId === null || joyMag < JOY_DEADZONE) {
        keyState.up = false;
        keyState.down = false;
        keyState.left = false;
        keyState.right = false;
        sendInput();
        return;
      }
      let tankAngle = 0;
      if (latestState) {
        const mine = latestState.tanks.find((t) => t.id === myId);
        if (mine) tankAngle = mine.angle;
      }
      let diff = joyAngle - tankAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));

      keyState.left = diff < -TURN_DEADZONE;
      keyState.right = diff > TURN_DEADZONE;
      if (Math.abs(diff) < Math.PI / 2) {
        keyState.up = true;
        keyState.down = false;
      } else {
        keyState.up = false;
        keyState.down = true;
      }
      sendInput();
    }

    function updateJoystick(clientX, clientY) {
      const dx = clientX - joyCenter.x;
      const dy = clientY - joyCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOY_RADIUS);
      const angle = Math.atan2(dy, dx);
      joystickKnob.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
      joyAngle = angle;
      joyMag = clamped / JOY_RADIUS;
      applyJoystickToKeys();
    }

    function resetJoystick() {
      joyTouchId = null;
      joyMag = 0;
      joystickKnob.style.transform = "translate(0px, 0px)";
      applyJoystickToKeys();
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
