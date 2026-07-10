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

  socket.on("countdown", (n) => {
    countdownOverlay.classList.remove("hidden");
    countdownOverlay.textContent = n > 0 ? n : "GO!";
  });

  socket.on("gameStart", (data) => {
    mapData = data;
    playersInfo = data.players;
    latestState = null;
    countdownOverlay.classList.add("hidden");
    roundOverOverlay.classList.add("hidden");
    showScreen("game");
  });

  socket.on("state", (state) => {
    latestState = state;
  });

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

  function drawWalls(walls, thick) {
    ctx.strokeStyle = "#4a5568";
    ctx.lineCap = "round";
    ctx.lineWidth = thick;
    for (const w of walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
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

    // barrel
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

    ctx.restore();
  }

  function drawBullet(b) {
    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    requestAnimationFrame(render);
    if (!screens.game.classList.contains("active") || !mapData) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWalls(mapData.walls, mapData.wallThick);

    if (latestState) {
      for (const b of latestState.bullets) drawBullet(b);
      for (const t of latestState.tanks) drawTank(t);
    }
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
})();
