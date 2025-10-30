/* app.js
Simple Chat Protocol (SCP) — Visual Simulator
---------------------------------------------

Simulates client → server messages and server ACKs
Features:

* Network delay, packet loss, resend logic, retry counter
* Visual animation of messages
* Event log with timestamps

---

*/

(function () {
// DOM elements
const clientConsole = document.getElementById('clientConsole');
const serverConsole = document.getElementById('serverConsole');
const overlay = document.getElementById('overlay');
const sendForm = document.getElementById('sendForm');
const input = document.getElementById('messageInput');
const eventLog = document.getElementById('eventLog');

// control panel
const delayRange = document.getElementById('delayRange');
const delayVal = document.getElementById('delayVal');
const lossRange = document.getElementById('lossRange');
const lossVal = document.getElementById('lossVal');
const timeoutRange = document.getElementById('timeoutRange');
const timeoutVal = document.getElementById('timeoutVal');
const lossToggle = document.getElementById('lossToggle');
const maxRetriesSelect = document.getElementById('maxRetries');
const clearLogBtn = document.getElementById('clearLog');

// panels for animation geometry
const clientPanel = document.getElementById('clientPanel');
const serverPanel = document.getElementById('serverPanel');

// ID generator
let msgCounter = 0;

// active messages map: id -> state
const activeMessages = new Map();

// --- UI control labels ---
function syncControlLabels() {
delayVal.textContent = delayRange.value;
lossVal.textContent = lossRange.value;
timeoutVal.textContent = timeoutRange.value;
}
syncControlLabels();
delayRange.addEventListener('input', syncControlLabels);
lossRange.addEventListener('input', syncControlLabels);
timeoutRange.addEventListener('input', syncControlLabels);

// --- utils ---
function timeStamp() {
return new Date().toLocaleTimeString();
}

function logEvent(text) {
const line = document.createElement('div');
line.className = 'log-line';
line.innerHTML = `<span style="color:#9fbdb3">[${timeStamp()}]</span> ${escapeHtml(text)}`;
eventLog.prepend(line);
}

function escapeHtml(s) {
return s.replace(/[&<>"']/g, (c) => ({'&':'&','<':'<','>':'>','"':'"',"'":'''}[c]));
}

function appendConsole(consoleEl, text, meta) {
const line = document.createElement('div');
line.className = 'line';
line.textContent = text;
if (meta) {
const m = document.createElement('div');
m.className = 'meta';
m.textContent = meta;
line.appendChild(m);
}
consoleEl.appendChild(line);
consoleEl.scrollTop = consoleEl.scrollHeight;
}

// --- animation positioning ---
function computeCoords(isClientToServer = true) {
const containerRect = overlay.getBoundingClientRect();
const clientRect = clientPanel.getBoundingClientRect();
const serverRect = serverPanel.getBoundingClientRect();
const y = clientRect.top + clientRect.height / 2 - containerRect.top;
const clientCenterX = clientRect.left + clientRect.width / 2 - containerRect.left;
const serverCenterX = serverRect.left + serverRect.width / 2 - containerRect.left;
const fromX = isClientToServer ? clientCenterX : serverCenterX;
const toX = isClientToServer ? serverCenterX : clientCenterX;
const dx = toX - fromX;
return { x: fromX - 10, y: y - 14, dx };
}

// --- floating message animation ---
function animateFloating(text, opts = {}) {
const { direction = 'toServer', duration = 800, dropped = false, extraClass = '', ack = false } = opts;
const isToServer = direction === 'toServer';
const coords = computeCoords(isToServer);
const el = document.createElement('div');
el.className = 'floating-msg ' + (ack ? 'floating-ack ' : '') + (dropped ? 'floating-dropped ' : '') + extraClass;
el.textContent = text;

```
el.style.left = `${coords.x}px`;
el.style.top = `${coords.y}px`;
el.style.setProperty('--dx', coords.dx + 'px');
const keyframesName = isToServer ? 'toRight' : 'toLeft';
el.style.animation = `${keyframesName} ${Math.max(150, duration)}ms linear forwards`;

overlay.appendChild(el);

return new Promise((resolve) => {
  if (dropped) {
    const halfDuration = Math.max(100, Math.floor(duration / 2));
    setTimeout(() => {
      el.style.animation = `fadeOut 400ms linear forwards`;
      setTimeout(() => {
        el.remove();
        resolve({ dropped: true });
      }, 420);
    }, halfDuration);
  } else {
    setTimeout(() => {
      el.remove();
      resolve({ dropped: false });
    }, Math.max(150, duration) + 10);
  }
});
```

}

// --- SCP Message Helpers ---
function scpMessage(msgId, text) {
return `SCP/1.0 | MSG | id=${msgId} | ${text}`;
}
function scpAck(msgId) {
return `SCP/1.0 | ACK | id=${msgId} | MSG_RECEIVED`;
}

// --- Client Send ---
async function clientSend(text) {
const id = ++msgCounter;
const formatted = scpMessage(id, text);
appendConsole(clientConsole, formatted, `Client sent (id=${id})`);
logEvent(`Client -> "${text}" (id=${id})`);

```
const messageState = { id, text, retries: 0, acked: false, timer: null };
activeMessages.set(id, messageState);

attemptSend(id);
```

}

// --- Attempt Send (handles resend + ACK logic) ---
function attemptSend(id) {
const state = activeMessages.get(id);
if (!state) return;

```
const maxRetries = parseInt(maxRetriesSelect.value, 10);
if (state.retries > maxRetries) {
  appendConsole(clientConsole, `SCP_CLIENT | ERROR | id=${id} | MAX_RETRIES_EXCEEDED`, 'Client');
  logEvent(`Message id=${id} failed after ${state.retries} retries.`);
  activeMessages.delete(id);
  return;
}

state.retries += 1;
appendConsole(clientConsole, `SCP/1.0 | SEND_ATTEMPT | id=${id} | try=${state.retries}`);
logEvent(`Attempting send id=${id} (try ${state.retries})`);

const delay = parseInt(delayRange.value, 10);
const lossEnabled = lossToggle.checked;
const lossPct = parseInt(lossRange.value, 10);
const shouldDrop = lossEnabled && (Math.random() * 100) < lossPct;

const travelDuration = Math.max(120, delay);
animateFloating(scpMessage(id, state.text), { direction: 'toServer', duration: travelDuration });

if (shouldDrop) {
  logEvent(`Message id=${id} was lost in transit (simulated).`);
  appendConsole(serverConsole, `-- packet loss occurred --`, 'Server');
  animateFloating(`dropped id=${id}`, { direction: 'toServer', duration: travelDuration, dropped: true });
} else {
  setTimeout(() => {
    if (!activeMessages.has(id)) return;
    const raw = scpMessage(id, state.text);
    appendConsole(serverConsole, raw, `Server received (id=${id})`);
    logEvent(`Server received message id=${id}.`);

    const ackWillDrop = lossEnabled && (Math.random() * 100) < lossPct;
    const ackTravel = Math.max(120, delay);

    if (ackWillDrop) {
      logEvent(`ACK for id=${id} was lost in transit (simulated).`);
      animateFloating(`ACK_LOST id=${id}`, { direction: 'toClient', duration: ackTravel, dropped: true });
      appendConsole(serverConsole, scpAck(id), 'Server attempted ACK (lost)');
    } else {
      animateFloating(scpAck(id), { direction: 'toClient', duration: ackTravel, ack: true })
        .then(() => handleClientAck(id));
      appendConsole(serverConsole, scpAck(id), 'Server sent ACK');
      logEvent(`Server sent ACK for id=${id}.`);
    }
  }, travelDuration + 80);
}

if (state.timer) clearTimeout(state.timer);
const ackTimeout = Math.max(200, parseInt(timeoutRange.value, 10));
state.timer = setTimeout(() => {
  if (!activeMessages.has(id)) return;
  const s = activeMessages.get(id);
  if (s.acked) return;
  logEvent(`ACK timeout for id=${id} (try ${s.retries}).`);
  appendConsole(clientConsole, `SCP/1.0 | TIMEOUT | id=${id} | retrying...`, 'Client');
  attemptSend(id);
}, ackTimeout + 20);
```

}

// --- Handle Client Receiving ACK ---
function handleClientAck(id) {
const state = activeMessages.get(id);
if (!state) {
appendConsole(clientConsole, `SCP/1.0 | ACK_IGNORED | id=${id} | no active message`, 'Client');
return;
}
state.acked = true;
if (state.timer) {
clearTimeout(state.timer);
state.timer = null;
}
appendConsole(clientConsole, scpAck(id), 'Client received ACK');
logEvent(`Client received ACK for id=${id}.`);
activeMessages.delete(id);
}

// --- Send form handler ---
sendForm.addEventListener('submit', (ev) => {
ev.preventDefault();
const text = input.value.trim();
if (!text) return;
clientSend(text);
input.value = '';
});

// --- Clear log button ---
clearLogBtn.addEventListener('click', () => {
eventLog.innerHTML = '';
clientConsole.innerHTML = '';
serverConsole.innerHTML = '';
activeMessages.clear();
logEvent('Logs cleared.');
});
})();
