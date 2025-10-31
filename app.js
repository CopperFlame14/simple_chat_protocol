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
(() => {
  // Elements
  const clientConsole = document.getElementById('clientConsole');
  const serverConsole = document.getElementById('serverConsole');
  const eventLog = document.getElementById('eventLog');
  const sendForm = document.getElementById('sendForm');
  const input = document.getElementById('messageInput');
  const clearLogBtn = document.getElementById('clearLog');

  let msgCounter = 0;
  const activeMessages = new Map();

  const delayInput = document.getElementById('delayRange');
  const delayVal = document.getElementById('delayVal');
  const lossInput = document.getElementById('lossRange');
  const lossVal = document.getElementById('lossVal');
  const ackLossInput = document.getElementById('ackLossRange');
  const ackLossVal = document.getElementById('ackLossVal');

  delayInput.addEventListener('input', () => (delayVal.textContent = delayInput.value));
  lossInput.addEventListener('input', () => (lossVal.textContent = lossInput.value));
  ackLossInput.addEventListener('input', () => (ackLossVal.textContent = ackLossInput.value));

  function logEvent(text) {
    const p = document.createElement('p');
    p.textContent = text;
    eventLog.appendChild(p);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  function appendMsg(panel, text, type = 'normal') {
    const msg = document.createElement('p');
    msg.className = type;
    msg.textContent = text;
    panel.appendChild(msg);
    panel.scrollTop = panel.scrollHeight;
  }

  function simulateDelay() {
    return parseInt(delayInput.value);
  }

  function simulateLoss(prob) {
    return Math.random() < prob / 100;
  }

  function clientSend(message) {
    msgCounter++;
    const id = msgCounter;
    const scpMsg = `SCP/1.0 | MSG | id=${id} | ${message}`;
    appendMsg(clientConsole, scpMsg, 'outgoing');
    logEvent(`Client sent message ${id}`);

    activeMessages.set(id, { message, retries: 0 });
    attemptSend(id);
  }

  function attemptSend(id) {
    const { message, retries } = activeMessages.get(id);
    const lossProb = parseInt(lossInput.value);
    const ackLossProb = parseInt(ackLossInput.value);

    const animationDelay = simulateDelay();

    setTimeout(() => {
      if (simulateLoss(lossProb)) {
        logEvent(`Message ${id} lost in transit. Retrying...`);
        retrySend(id);
        return;
      }

      const scpMsg = `SCP/1.0 | MSG | id=${id} | ${message}`;
      appendMsg(serverConsole, scpMsg, 'incoming');
      logEvent(`Server received message ${id}`);

      const ackMsg = `SCP/1.0 | ACK | id=${id} | MSG_RECEIVED`;

      setTimeout(() => {
        if (simulateLoss(ackLossProb)) {
          logEvent(`ACK for message ${id} lost. Retrying...`);
          retrySend(id);
          return;
        }
        appendMsg(clientConsole, ackMsg, 'ack');
        logEvent(`Client received ACK for message ${id}`);
        activeMessages.delete(id);
      }, simulateDelay());
    }, animationDelay);
  }

  function retrySend(id) {
    const data = activeMessages.get(id);
    if (!data) return;
    data.retries++;
    if (data.retries > 3) {
      logEvent(`Message ${id} failed after 3 retries.`);
      activeMessages.delete(id);
      return;
    }
    activeMessages.set(id, data);
    attemptSend(id);
  }

  sendForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    clientSend(text);
    input.value = '';
  });

  clearLogBtn.addEventListener('click', () => {
    eventLog.innerHTML = '';
    clientConsole.innerHTML = '';
    serverConsole.innerHTML = '';
    activeMessages.clear();
    logEvent('Logs cleared.');
  });
})();

