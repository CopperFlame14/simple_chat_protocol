/* app.js
   SCP Visual Simulator
   - Simulates client → server messages and server ACKs
   - Delay, packet loss, resend logic, retry counter, and logs
*/

(function () {
  // DOM elements
  const clientConsole = document.getElementById('clientConsole');
  const serverConsole = document.getElementById('serverConsole');
  const overlay = document.getElementById('overlay');
  const sendForm = document.getElementById('sendForm');
  const input = document.getElementById('messageInput');
  const eventLog = document.getElementById('eventLog');

  // controls
  const delayRange = document.getElementById('delayRange');
  const delayVal = document.getElementById('delayVal');
  const lossRange = document.getElementById('lossRange');
  const lossVal = document.getElementById('lossVal');
  const timeoutRange = document.getElementById('timeoutRange');
  const timeoutVal = document.getElementById('timeoutVal');
  const lossToggle = document.getElementById('lossToggle');
  const maxRetriesSelect = document.getElementById('maxRetries');
  const clearLogBtn = document.getElementById('clearLog');

  // panels (for geometry)
  const clientPanel = document.getElementById('clientPanel');
  const serverPanel = document.getElementById('serverPanel');

  // ID generator
  let msgCounter = 0;

  // active messages map: id -> state
  const activeMessages = new Map();

  // update UI control labels
  function syncControlLabels() {
    delayVal.textContent = delayRange.value;
    lossVal.textContent = lossRange.value;
    timeoutVal.textContent = timeoutRange.value;
  }
  syncControlLabels();
  delayRange.addEventListener('input', syncControlLabels);
  lossRange.addEventListener('input', syncControlLabels);
  timeoutRange.addEventListener('input', syncControlLabels);

  // utils
  function timeStamp() {
    return new Date().toLocaleTimeString();
  }

  function logEvent(text, kind = 'info') {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span style="color:#9fbdb3">[${timeStamp()}]</span> ${escapeHtml(text)}`;
    eventLog.prepend(line);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

  // compute overlay start pos (center of panel) and dx (distance)
  function computeCoords(isClientToServer = true) {
    const containerRect = overlay.getBoundingClientRect();
    const clientRect = clientPanel.getBoundingClientRect();
    const serverRect = serverPanel.getBoundingClientRect();

    // center Y of panels
    const y = clientRect.top + clientRect.height / 2 - containerRect.top;
    const clientCenterX = clientRect.left + clientRect.width / 2 - containerRect.left;
    const serverCenterX = serverRect.left + serverRect.width / 2 - containerRect.left;

    const fromX = isClientToServer ? clientCenterX : serverCenterX;
    const toX = isClientToServer ? serverCenterX : clientCenterX;
    const dx = toX - fromX;

    return { x: fromX - 10, y: y - 14, dx };
  }

  // animate a floating message element across the overlay
  function animateFloating(text, opts = {}) {
    // opts: direction ('toServer'|'toClient'), duration (ms), dropped (bool), classes (string)
    const { direction = 'toServer', duration = 800, dropped = false, extraClass = '' } = opts;
    const isToServer = direction === 'toServer';
    const coords = computeCoords(isToServer);
    const el = document.createElement('div');
    el.className = 'floating-msg ' + (opts.ack ? 'floating-ack ' : '') + (dropped ? 'floating-dropped ' : '') + extraClass;
    el.textContent = text;

    // position and CSS variables for animation
    el.style.left = `${coords.x}px`;
    el.style.top = `${coords.y}px`;
    // set --dx to px (distance to move)
    el.style.setProperty('--dx', coords.dx + 'px');
    el.style.willChange = 'transform,opacity';

    // set animation
    const keyframesName = isToServer ? 'toRight' : 'toLeft';
    el.style.animation = `${keyframesName} ${Math.max(150, duration)}ms linear forwards`;

    overlay.appendChild(el);

    return new Promise((resolve) => {
      // handle dropped halfway if dropped
      if (dropped) {
        // let it travel half the distance then fade
        const halfDuration = Math.max(100, Math.floor(duration / 2));
        setTimeout(() => {
          el.style.animation = `fadeOut 400ms linear forwards`;
          setTimeout(() => {
            el.remove();
            resolve({ dropped: true });
          }, 420);
        }, halfDuration);
      } else {
        // normal travel
        setTimeout(() => {
          // remove after animation ends
          el.remove();
          resolve({ dropped: false });
        }, Math.max(150, duration) + 10);
      }
    });
  }

  // Compose SCP formatted strings
  function scpMessage(msgId, text) {
    return `SCP/1.0 | MSG | id=${msgId} | ${text}`;
  }
  function scpAck(msgId) {
    return `SCP/1.0 | ACK | id=${msgId} | MSG_RECEIVED`;
  }

  // Client sends message
  async function clientSend(text) {
    const id = ++msgCounter;
    const formatted = scpMessage(id, text);
    appendConsole(clientConsole, formatted, `Client sent (id=${id})`);
    logEvent(`Client -> "${text}" (id=${id})`, 'send');

    // add to active messages map
    const messageState = {
      id,
      text,
      retries: 0,
      acked: false,
      timer: null
    };
    activeMessages.set(id, messageState);

    // show message in client console
    showMessageInConsole(clientConsole, formatted);

    // start the send+timeout process
    attemptSend(id);
  }

  // display readable line as well as console raw lines
  function showMessageInConsole(consoleEl, raw) {
    appendConsole(consoleEl, raw);
  }

  // attempt to send (or resend) message with id
  function attemptSend(id) {
    const state = activeMessages.get(id);
    if (!state) return;

    // check retry limit
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

    // determine network conditions
    const delay = parseInt(delayRange.value, 10);
    const lossEnabled = lossToggle.checked;
    const lossPct = parseInt(lossRange.value, 10);
    const shouldDrop = lossEnabled && (Math.random() * 100) < lossPct;

    // animate message floating to server
    const travelDuration = Math.max(120, delay); // use delay as proxy for animation time
    animateFloating(scpMessage(id, state.text), { direction: 'toServer', duration: travelDuration })
      .then((res) => {
        // if animation finished without being dropped in-flight (we animate drop via shouldDrop)
      });

    // if decided to drop the outgoing message, show dropped animation and do not deliver to server
    if (shouldDrop) {
      logEvent(`Message id=${id} was lost in transit (simulated).`);
      appendConsole(serverConsole, `-- packet loss occurred --`, 'Server');
      // animate a dropped bubble to indicate loss visually
      animateFloating(`dropped id=${id}`, { direction: 'toServer', duration: travelDuration, dropped: true })
        .then(() => {});
      // start client timeout for ACK (it won't arrive), so let timeout trigger resend
    } else {
      // after delay (travelDuration) the server "receives" it
      setTimeout(() => {
        if (!activeMessages.has(id)) return; // maybe timed out and removed
        // server logs and shows message
        const raw = scpMessage(id, state.text);
        appendConsole(serverConsole, raw, `Server received (id=${id})`);
        logEvent(`Server received message id=${id}.`);
        // server prepares ACK — decide if ACK is lost based on loss percentage (independent)
        const ackWillDrop = lossToggle.checked && (Math.random() * 100) < lossPct;
        const ackTravel = Math.max(120, delay);
        // animate ack back
        if (ackWillDrop) {
          logEvent(`ACK for id=${id} was lost in transit (simulated).`);
          animateFloating(`ACK_LOST id=${id}`, { direction: 'toClient', duration: ackTravel, dropped: true })
            .then(() => {});
          // server shows it attempted ACK
          appendConsole(serverConsole, scpAck(id), 'Server attempted ACK (lost)');
        } else {
          // ack arrives normally
          animateFloating(scpAck(id), { direction: 'toClient', duration: ackTravel, ack: true })
            .then(() => {
              // on arrival — deliver ack to client
              handleClientAck(id);
            });
          appendConsole(serverConsole, scpAck(id), 'Server sent ACK');
          logEvent(`Server sent ACK for id=${id}.`);
        }
      }, travelDuration + 80); // slight buffer
    }

    // set / reset timeout for waiting ACK
    if (state.timer) {
      clearTimeout(state.timer);
    }
    const ackTimeout = Math.max(200, parseInt(timeoutRange.value, 10));
    state.timer = setTimeout(() => {
      // if ack not received by timeout
      if (!activeMessages.has(id)) return;
      const s = activeMessages.get(id);
      if (s.acked) return;
      // attempt resend or fail if retries exceeded
      logEvent(`ACK timeout for id=${id} (try ${s.retries}).`);
      appendConsole(clientConsole, `SCP/1.0 | TIMEOUT | id=${id} | retrying...`, 'Client');
      attemptSend(id); // recursive retry
    }, ackTimeout + 20); // small buffer for timing
  }

  // handle receiving ACK at client
  function handleClientAck(id) {
    const state = activeMessages.get(id);
    if (!state) {
      // maybe already failed (exceeded retries)
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
    // mark success in server console (already logged) and remove from active map after showing
    activeMessages.delete(id);
  }

  // wire send form
sendForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  clientSend(text);
  input.value = '';
});

// clear log button
clearLogBtn.addEventListener('click', () => {
  eventLog.innerHTML = '';
  clientConsole.innerHTML = '';
  serverConsole.innerHTML = '';
  activeMessages.clear();
  logEvent('Logs cleared.');
});
})();
