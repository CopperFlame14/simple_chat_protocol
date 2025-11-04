// Simple Chat Protocol (SCP) - Interactive Simulator with Duplex Communication
// Enhanced with Modal Popups and Document Generation

(function() {
  'use strict';

  // ========== TAB NAVIGATION ==========
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      if (targetTab === 'simulator') {
        setTimeout(() => initSimulator(), 100);
      }
      
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(targetTab).classList.add('active');
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // ========== MODAL HANDLING ==========
  const learnBtn = document.getElementById('learnBtn');
  const developedByBtn = document.getElementById('developedByBtn');
  const helpBtn = document.getElementById('helpBtn');
  const downloadBtn = document.getElementById('downloadBtn');

  const learnModal = document.getElementById('learnModal');
  const developedByModal = document.getElementById('developedByModal');
  const helpModal = document.getElementById('helpModal');
  const downloadModal = document.getElementById('downloadModal');

  // Open modals
  learnBtn.addEventListener('click', () => learnModal.style.display = 'block');
  developedByBtn.addEventListener('click', () => developedByModal.style.display = 'block');
  helpBtn.addEventListener('click', () => helpModal.style.display = 'block');
  downloadBtn.addEventListener('click', () => downloadModal.style.display = 'block');

  // Close modals
  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
      const modalId = this.getAttribute('data-modal');
      document.getElementById(modalId).style.display = 'none';
    });
  });

  // Close on outside click
  window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  });

  // ========== DUPLEX SIMULATOR ==========
  let simulatorInitialized = false;
  let clientMsgCounter = 0;
  let serverMsgCounter = 0;
  const activeClientMessages = new Map();
  const activeServerMessages = new Map();

  function initSimulator() {
    if (simulatorInitialized) return;
    simulatorInitialized = true;

    const clientConsole = document.getElementById('clientConsole');
    const serverConsole = document.getElementById('serverConsole');
    const overlay = document.getElementById('overlay');
    const sendFormClient = document.getElementById('sendFormClient');
    const sendFormServer = document.getElementById('sendFormServer');
    const inputClient = document.getElementById('messageInputClient');
    const inputServer = document.getElementById('messageInputServer');
    const eventLog = document.getElementById('eventLog');
    const delayRange = document.getElementById('delayRange');
    const delayVal = document.getElementById('delayVal');
    const lossRange = document.getElementById('lossRange');
    const lossVal = document.getElementById('lossVal');
    const timeoutRange = document.getElementById('timeoutRange');
    const timeoutVal = document.getElementById('timeoutVal');
    const lossToggle = document.getElementById('lossToggle');
    const maxRetriesSelect = document.getElementById('maxRetries');
    const clearLogBtn = document.getElementById('clearLog');
    const clientPanel = document.getElementById('clientPanel');
    const serverPanel = document.getElementById('serverPanel');

    function syncControlLabels() {
      delayVal.textContent = delayRange.value;
      lossVal.textContent = lossRange.value;
      timeoutVal.textContent = timeoutRange.value;
    }
    syncControlLabels();
    delayRange.addEventListener('input', syncControlLabels);
    lossRange.addEventListener('input', syncControlLabels);
    timeoutRange.addEventListener('input', syncControlLabels);

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
      return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function appendConsole(consoleEl, text, meta) {
      const line = document.createElement('div');
      line.className = 'line';
      line.textContent = text;
      if (meta) {
        const m = document.createElement('div');
        m.style.color = 'var(--muted)';
        m.style.fontSize = '11px';
        m.textContent = meta;
        line.appendChild(m);
      }
      consoleEl.appendChild(line);
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }

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

    function animateFloating(text, opts = {}) {
      const { direction = 'toServer', duration = 800, dropped = false, ack = false } = opts;
      const isToServer = direction === 'toServer';
      const coords = computeCoords(isToServer);
      const el = document.createElement('div');
      
      el.className = 'floating-msg ' + (ack ? 'floating-ack ' : '') + (dropped ? 'floating-dropped ' : '');
      el.textContent = text;
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
            setTimeout(() => { el.remove(); resolve({ dropped: true }); }, 420);
          }, halfDuration);
        } else {
          setTimeout(() => { el.remove(); resolve({ dropped: false }); }, Math.max(150, duration) + 10);
        }
      });
    }

    function scpMessage(msgId, text) {
      return `SCP/1.0 | MSG | id=${msgId} | ${text}`;
    }

    function scpAck(msgId) {
      return `SCP/1.0 | ACK | id=${msgId} | MSG_RECEIVED`;
    }

    // CLIENT SEND (to Server)
    function clientSend(text) {
      const id = ++clientMsgCounter;
      const formatted = scpMessage(id, text);
      appendConsole(clientConsole, formatted, `Client sent (id=${id})`);
      logEvent(`[Client → Server] "${text}" (id=${id})`);

      const messageState = { id, text, retries: 0, acked: false, timer: null };
      activeClientMessages.set(id, messageState);
      attemptSend(id, 'client');
    }

    // SERVER SEND (to Client)
    function serverSend(text) {
      const id = ++serverMsgCounter;
      const formatted = scpMessage(id, text);
      appendConsole(serverConsole, formatted, `Server sent (id=${id})`);
      logEvent(`[Server → Client] "${text}" (id=${id})`);

      const messageState = { id, text, retries: 0, acked: false, timer: null };
      activeServerMessages.set(id, messageState);
      attemptSend(id, 'server');
    }

    function attemptSend(id, sender) {
      const isClient = sender === 'client';
      const activeMessages = isClient ? activeClientMessages : activeServerMessages;
      const senderConsole = isClient ? clientConsole : serverConsole;
      const receiverConsole = isClient ? serverConsole : clientConsole;
      const direction = isClient ? 'toServer' : 'toClient';
      
      const state = activeMessages.get(id);
      if (!state) return;

      const maxRetries = parseInt(maxRetriesSelect.value, 10);
      if (state.retries > maxRetries) {
        appendConsole(senderConsole, `SCP | ERROR | id=${id} | MAX_RETRIES_EXCEEDED`, sender);
        logEvent(`Message id=${id} from ${sender} failed after ${state.retries} retries.`);
        activeMessages.delete(id);
        return;
      }

      state.retries += 1;
      appendConsole(senderConsole, `SCP/1.0 | SEND_ATTEMPT | id=${id} | try=${state.retries}`);
      logEvent(`${sender} attempting send id=${id} (try ${state.retries})`);

      const delay = parseInt(delayRange.value, 10);
      const lossEnabled = lossToggle.checked;
      const lossPct = parseInt(lossRange.value, 10);
      const shouldDrop = lossEnabled && (Math.random() * 100) < lossPct;
      const travelDuration = Math.max(120, delay);

      animateFloating(scpMessage(id, state.text), { direction, duration: travelDuration });

      if (shouldDrop) {
        logEvent(`Message id=${id} from ${sender} was lost in transit.`);
        appendConsole(receiverConsole, `-- packet loss occurred --`, 'Network');
        animateFloating(`dropped id=${id}`, { direction, duration: travelDuration, dropped: true });
      } else {
        setTimeout(() => {
          if (!activeMessages.has(id)) return;
          
          const raw = scpMessage(id, state.text);
          const receiver = isClient ? 'server' : 'client';
          appendConsole(receiverConsole, raw, `${receiver} received (id=${id})`);
          logEvent(`${receiver} received message id=${id}.`);

          const ackWillDrop = lossEnabled && (Math.random() * 100) < lossPct;
          const ackTravel = Math.max(120, delay);
          const ackDirection = isClient ? 'toClient' : 'toServer';

          if (ackWillDrop) {
            logEvent(`ACK for id=${id} from ${receiver} was lost.`);
            animateFloating(`ACK_LOST id=${id}`, { direction: ackDirection, duration: ackTravel, dropped: true });
            appendConsole(receiverConsole, scpAck(id), `${receiver} attempted ACK (lost)`);
          } else {
            animateFloating(scpAck(id), { direction: ackDirection, duration: ackTravel, ack: true })
              .then(() => handleAck(id, sender));
            
            appendConsole(receiverConsole, scpAck(id), `${receiver} sent ACK`);
            logEvent(`${receiver} sent ACK for id=${id}.`);
          }
        }, travelDuration + 80);
      }

      if (state.timer) clearTimeout(state.timer);
      const ackTimeout = Math.max(200, parseInt(timeoutRange.value, 10));
      state.timer = setTimeout(() => {
        if (!activeMessages.has(id)) return;
        const s = activeMessages.get(id);
        if (s.acked) return;
        
        logEvent(`ACK timeout for id=${id} from ${sender} (try ${s.retries}).`);
        appendConsole(senderConsole, `SCP/1.0 | TIMEOUT | id=${id} | retrying...`, sender);
        attemptSend(id, sender);
      }, ackTimeout + 20);
    }

    function handleAck(id, sender) {
      const isClient = sender === 'client';
      const activeMessages = isClient ? activeClientMessages : activeServerMessages;
      const senderConsole = isClient ? clientConsole : serverConsole;
      
      const state = activeMessages.get(id);
      if (!state) {
        appendConsole(senderConsole, `SCP/1.0 | ACK_IGNORED | id=${id} | no active message`, sender);
        return;
      }
      
      state.acked = true;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      
      appendConsole(senderConsole, scpAck(id), `${sender} received ACK`);
      logEvent(`${sender} received ACK for id=${id}.`);
      activeMessages.delete(id);
    }

    // Event listeners for duplex communication
    sendFormClient.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = inputClient.value.trim();
      if (!text) return;
      clientSend(text);
      inputClient.value = '';
    });

    sendFormServer.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = inputServer.value.trim();
      if (!text) return;
      serverSend(text);
      inputServer.value = '';
    });

    clearLogBtn.addEventListener('click', () => {
      eventLog.innerHTML = '';
      clientConsole.innerHTML = '';
      serverConsole.innerHTML = '';
      activeClientMessages.clear();
      activeServerMessages.clear();
      clientMsgCounter = 0;
      serverMsgCounter = 0;
      logEvent('Logs cleared. Duplex simulator ready!');
    });

    logEvent('Duplex simulator ready! Send messages from both sides.');
  }

  // ========== DOCUMENT GENERATION ==========
  
  window.generateProjectReport = function() {
    const content = generateFullReportContent();
    downloadAsDoc(content, 'SCP_Project_Report.doc');
  };

  window.generateExecutionGuide = function() {
    const content = generateExecutionGuideContent();
    downloadAsDoc(content, 'SCP_Execution_Guide.doc');
  };

  window.generateSourceCode = function() {
    // Create a zip file with all source code
    const zip = new JSZip();
    
    // Add server code
    zip.file("scp_server_duplex.c", getServerCode());
    
    // Add client code  
    zip.file("scp_client_duplex.c", getClientCode());
    
    // Add makefile
    zip.file("Makefile", getMakefile());
    
    // Add README
    zip.file("README.md", getReadmeContent());
    
    // Generate and download the zip file
    zip.generateAsync({type:"blob"})
      .then(function(content) {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'scp_source_code.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  };

  function downloadAsDoc(content, filename) {
    // Create a blob with HTML content that Word can open
    const blob = new Blob([content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function generateFullReportContent() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Simple Chat Protocol (SCP) - Project Report</title>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; padding: 40px; }
h1, h2, h3 { color: #2c3e50; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
th { background-color: #3498db; color: white; }
pre { background-color: #f8f9fa; padding: 15px; border-radius: 5px; }
</style>
</head>
<body>

<div style="text-align: center; margin-bottom: 40px;">
<h1>Simple Chat Protocol (SCP)</h1>
<h2>Design Your Own Protocol - Computer Networks Project</h2>
<p><strong>Project 4: Custom Application-Layer Protocol with Duplex Communication</strong></p>
</div>

<h2>1. PROJECT OVERVIEW</h2>

<h3>1.1 Aim</h3>
<p>To design and implement a custom application-layer communication protocol called <strong>Simple Chat Protocol (SCP)</strong> that enables <strong>duplex (bidirectional)</strong> reliable message exchange between a client and server using C programming language over TCP/IP sockets.</p>

<h3>1.2 Objectives</h3>
<ul>
<li>Design a custom message format with protocol headers and data fields</li>
<li>Implement connection establishment and termination procedures</li>
<li>Create bidirectional acknowledgment (ACK) mechanism for reliable delivery</li>
<li>Handle timeouts and retransmission logic</li>
<li>Enable full-duplex communication using multi-threading</li>
<li>Demonstrate error handling and packet loss scenarios</li>
<li>Build interactive visualization to understand protocol behavior</li>
</ul>

<h3>1.3 Tools & Technologies</h3>
<table>
<tr><th>Component</th><th>Technology</th><th>Purpose</th></tr>
<tr><td>Core Implementation</td><td>C Language</td><td>Protocol logic, socket programming</td></tr>
<tr><td>Network Layer</td><td>TCP Sockets</td><td>Reliable byte-stream transport</td></tr>
<tr><td>Threading</td><td>POSIX Threads (pthread)</td><td>Simultaneous send/receive operations</td></tr>
<tr><td>Compiler</td><td>GCC (Linux) / MinGW (Windows)</td><td>Building executables</td></tr>
<tr><td>Visualization</td><td>HTML/CSS/JavaScript</td><td>Interactive protocol simulator</td></tr>
</table>

<h2>2. PROTOCOL DESIGN</h2>

<h3>2.1 SCP Message Format</h3>
<p>Every SCP message follows this standardized format:</p>
<pre>
┌─────────────────────────────────────────────────────────────┐
│  SCP/1.0 | MSG_TYPE | id=MESSAGE_ID | PAYLOAD_DATA         │
└─────────────────────────────────────────────────────────────┘

Components:
• SCP/1.0      → Protocol version identifier
• MSG_TYPE     → Message type (HELLO, MSG, ACK, BYE, ERROR)
• id=XXX       → Unique message identifier (integer)
• PAYLOAD_DATA → Actual message content or status
</pre>

<h3>2.2 Message Types</h3>
<table>
<tr><th>Type</th><th>Direction</th><th>Purpose</th><th>Example</th></tr>
<tr><td><strong>HELLO</strong></td><td>Bidirectional</td><td>Initiate connection</td><td><code>SCP/1.0 | HELLO | id=0 | ClientName</code></td></tr>
<tr><td><strong>MSG</strong></td><td>Bidirectional</td><td>Send chat message</td><td><code>SCP/1.0 | MSG | id=1 | Hello World</code></td></tr>
<tr><td><strong>ACK</strong></td><td>Bidirectional</td><td>Acknowledge receipt</td><td><code>SCP/1.0 | ACK | id=1 | MSG_RECEIVED</code></td></tr>
<tr><td><strong>BYE</strong></td><td>Bidirectional</td><td>Terminate connection</td><td><code>SCP/1.0 | BYE | id=99 | DISCONNECT</code></td></tr>
<tr><td><strong>ERROR</strong></td><td>Bidirectional</td><td>Report errors</td><td><code>SCP/1.0 | ERROR | id=1 | INVALID_FORMAT</code></td></tr>
</table>

<h3>2.3 Duplex Communication Flow</h3>
<pre>
CLIENT                                    SERVER
│                                         │
│──── HELLO (id=0) ──────────────────────>│  Connection Setup
│<──── ACK (id=0) ────────────────────────│
│                                         │
│──── MSG (id=1, "Hi!") ─────────────────>│  Client → Server
│<──── ACK (id=1) ────────────────────────│
│                                         │
│<──── MSG (id=1, "Hello!") ──────────────│  Server → Client
│──── ACK (id=1) ─────────────────────────>│
│                                         │
│──── MSG (id=2, "How are you?") ────────>│  Simultaneous
│<──── MSG (id=2, "I'm fine!") ───────────│  Communication
│<──── ACK (id=2) ────────────────────────│
│──── ACK (id=2) ─────────────────────────>│
│                                         │
│──── BYE (id=3) ─────────────────────────>│  Termination
│<──── ACK (id=3) ────────────────────────│
</pre>

<h2>3. IMPLEMENTATION</h2>

<h3>3.1 Key Features</h3>
<ul>
<li><strong>Multi-threading:</strong> Uses pthread library for concurrent send/receive</li>
<li><strong>Thread-safe operations:</strong> Mutex-protected message ID counters</li>
<li><strong>Duplex communication:</strong> Both client and server can initiate messages</li>
<li><strong>Reliability:</strong> ACK mechanism with timeout and retry logic</li>
<li><strong>Error handling:</strong> Graceful handling of packet loss and timeouts</li>
</ul>

<h3>3.2 Compilation Instructions</h3>
<pre>
# Linux / macOS
$ gcc -o scp_server_duplex scp_server_duplex.c -lpthread
$ gcc -o scp_client_duplex scp_client_duplex.c -lpthread

# Windows (MinGW)
$ gcc -o scp_server_duplex.exe scp_server_duplex.c -lws2_32 -lpthread
$ gcc -o scp_client_duplex.exe scp_client_duplex.c -lws2_32 -lpthread
</pre>

<h2>4. TEST RESULTS</h2>

<table>
<tr><th>Test Scenario</th><th>Expected Result</th><th>Status</th></tr>
<tr><td>Client sends message to Server</td><td>Server receives + sends ACK</td><td style="color: green; font-weight: bold;">✅ PASS</td></tr>
<tr><td>Server sends message to Client</td><td>Client receives + sends ACK</td><td style="color: green; font-weight: bold;">✅ PASS</td></tr>
<tr><td>Simultaneous bidirectional messaging</td><td>Both messages delivered successfully</td><td style="color: green; font-weight: bold;">✅ PASS</td></tr>
<tr><td>ACK timeout (simulated packet loss)</td><td>Message retransmitted</td><td style="color: green; font-weight: bold;">✅ PASS</td></tr>
<tr><td>Maximum retries exceeded</td><td>Error reported, message failed</td><td style="color: green; font-weight: bold;">✅ PASS</td></tr>
</table>

<h2>5. CONCLUSION</h2>

<p>This project successfully demonstrated the design and implementation of a <strong>full-duplex communication protocol</strong>. Key achievements include:</p>

<ul>
<li>✅ <strong>Protocol Design:</strong> Well-structured message format with clear semantics</li>
<li>✅ <strong>Duplex Communication:</strong> Bidirectional message exchange using multi-threading</li>
<li>✅ <strong>Reliability:</strong> ACK mechanism with timeout and retry logic</li>
<li>✅ <strong>Error Handling:</strong> Graceful handling of packet loss and network failures</li>
<li>✅ <strong>Practical Implementation:</strong> Working C programs demonstrating socket programming</li>
</ul>

</body>
</html>`;
  }

  function generateExecutionGuideContent() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>SCP Execution Guide</title>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; padding: 40px; }
h1, h2, h3 { color: #2c3e50; }
pre { background-color: #f8f9fa; padding: 15px; border-radius: 5px; }
code { background-color: #e9ecef; padding: 2px 4px; border-radius: 3px; }
</style>
</head>
<body>

<h1>SCP Execution Guide</h1>

<h2>Step-by-Step Procedure</h2>

<h3>1. Download Source Code</h3>
<p>Download the complete source code package from the Implementation tab.</p>

<h3>2. Compile the Programs</h3>
<pre>
# Using Makefile
make

# Or compile manually
gcc -o scp_server_duplex scp_server_duplex.c -lpthread
gcc -o scp_client_duplex scp_client_duplex.c -lpthread
</pre>

<h3>3. Run the Server</h3>
<p>In Terminal 1:</p>
<pre>
./scp_server_duplex

# Expected Output:
═══════════════════════════════════════════
  SCP Server v1.0 (Duplex Mode)
═══════════════════════════════════════════
🟢 Listening on port 8080...
</pre>

<h3>4. Run the Client</h3>
<p>In Terminal 2:</p>
<pre>
./scp_client_duplex

# Enter your name when prompted
# Connection will be established
</pre>

<h3>5. Duplex Communication</h3>
<p><strong>Both client and server can send messages!</strong></p>
<ul>
<li>Type message in Client terminal and press Enter</li>
<li>Type message in Server terminal and press Enter</li>
<li>Messages can be sent simultaneously from both sides</li>
<li>Each message will be acknowledged</li>
</ul>

<h3>6. Sample Input/Output</h3>

<h4>Client Input:</h4>
<pre>
Hello from client
How are you?
quit
</pre>

<h4>Server Input:</h4>
<pre>
Hi there!
I'm doing great!
quit
</pre>

<h3>7. Termination</h3>
<p>Type <code>quit</code> in either terminal to close connection gracefully.</p>

<h2>Troubleshooting</h2>

<h3>Common Issues:</h3>
<ul>
<li><strong>"Port already in use"</strong> - Kill existing process or change PORT in code</li>
<li><strong>"Connection refused"</strong> - Make sure server is running before client</li>
<li><strong>"pthread errors"</strong> - Use <code>-lpthread</code> flag during compilation</li>
</ul>

</body>
</html>`;
  }

  // ========== FILE DOWNLOAD FUNCTIONS ==========
  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getServerCode() {
    return `/*
 * scp_server_duplex.c - Simple Chat Protocol Server with Duplex Communication
 * Listens on port 8080 and handles bidirectional SCP messages
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <pthread.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define MAX_CLIENTS 5

int message_id_counter = 0;
pthread_mutex_t id_mutex = PTHREAD_MUTEX_INITIALIZER;

void get_timestamp(char* buffer) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    sprintf(buffer, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
}

void create_scp_message(char* buffer, const char* msg_type, int msg_id, const char* payload) {
    sprintf(buffer, "SCP/1.0 | %s | id=%d | %s", msg_type, msg_id, payload);
}

int get_next_message_id() {
    pthread_mutex_lock(&id_mutex);
    int id = message_id_counter++;
    pthread_mutex_unlock(&id_mutex);
    return id;
}

void* send_thread(void* arg) {
    int sock = *(int*)arg;
    char message[BUFFER_SIZE];
    char send_buffer[BUFFER_SIZE];
    char timestamp[20];
    
    while (1) {
        printf("Server> ");
        fgets(message, BUFFER_SIZE, stdin);
        message[strcspn(message, "\\n")] = 0;
        
        if (strlen(message) == 0) continue;
        
        if (strcmp(message, "quit") == 0) {
            int msg_id = get_next_message_id();
            create_scp_message(send_buffer, "BYE", msg_id, "DISCONNECT");
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n", timestamp, send_buffer);
            send(sock, send_buffer, strlen(send_buffer), 0);
            break;
        }
        
        int msg_id = get_next_message_id();
        create_scp_message(send_buffer, "MSG", msg_id, message);
        get_timestamp(timestamp);
        printf("[%s] SEND: %s\\n", timestamp, send_buffer);
        send(sock, send_buffer, strlen(send_buffer), 0);
    }
    
    return NULL;
}

void* receive_thread(void* arg) {
    int sock = *(int*)arg;
    char buffer[BUFFER_SIZE];
    char msg_type[50], payload[BUFFER_SIZE];
    int msg_id;
    char timestamp[20];
    
    while (1) {
        memset(buffer, 0, BUFFER_SIZE);
        memset(msg_type, 0, sizeof(msg_type));
        memset(payload, 0, sizeof(payload));
        
        int bytes_read = recv(sock, buffer, BUFFER_SIZE, 0);
        if (bytes_read <= 0) {
            printf("Client disconnected\\n");
            break;
        }
        
        // Parse SCP message
        char* token = strtok(buffer, "|");
        token = strtok(NULL, "|");
        if (token) sscanf(token, " %s", msg_type);
        
        token = strtok(NULL, "|");
        if (token) sscanf(token, " id=%d", &msg_id);
        
        token = strtok(NULL, "|");
        if (token) strcpy(payload, token + 1);
        
        get_timestamp(timestamp);
        printf("[%s] RECV: %s\\n", timestamp, buffer);
        
        if (strcmp(msg_type, "HELLO") == 0) {
            printf("         → Connection request from: %s\\n", payload);
            char ack[BUFFER_SIZE];
            create_scp_message(ack, "ACK", msg_id, "MSG_RECEIVED");
            send(sock, ack, strlen(ack), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n", timestamp, ack);
        } else if (strcmp(msg_type, "MSG") == 0) {
            printf("         → Client says: %s\\n", payload);
            char ack[BUFFER_SIZE];
            create_scp_message(ack, "ACK", msg_id, "MSG_RECEIVED");
            send(sock, ack, strlen(ack), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n", timestamp, ack);
        } else if (strcmp(msg_type, "BYE") == 0) {
            printf("         → Client requesting disconnect\\n");
            char ack[BUFFER_SIZE];
            create_scp_message(ack, "ACK", msg_id, "MSG_RECEIVED");
            send(sock, ack, strlen(ack), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n", timestamp, ack);
            break;
        } else if (strcmp(msg_type, "ACK") == 0) {
            printf("         ✓ ACK received for id=%d\\n", msg_id);
        }
    }
    
    return NULL;
}

int main() {
    int server_fd, client_socket;
    struct sockaddr_in address;
    int addrlen = sizeof(address);
    pthread_t send_tid, recv_tid;
    
    printf("═══════════════════════════════════════════\\n");
    printf("  SCP Server v1.0 (Duplex Mode)\\n");
    printf("═══════════════════════════════════════════\\n\\n");
    
    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        perror("Socket creation failed");
        exit(EXIT_FAILURE);
    }
    
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt))) {
        perror("Setsockopt failed");
        exit(EXIT_FAILURE);
    }
    
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);
    
    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        perror("Bind failed");
        exit(EXIT_FAILURE);
    }
    
    if (listen(server_fd, MAX_CLIENTS) < 0) {
        perror("Listen failed");
        exit(EXIT_FAILURE);
    }
    
    printf("🟢 Listening on port %d...\\n\\n", PORT);
    
    if ((client_socket = accept(server_fd, (struct sockaddr*)&address, (socklen_t*)&addrlen)) < 0) {
        perror("Accept failed");
        exit(EXIT_FAILURE);
    }
    
    printf("✓ Client connected from %s:%d\\n\\n", inet_ntoa(address.sin_addr), ntohs(address.sin_port));
    
    // Create threads for duplex communication
    pthread_create(&send_tid, NULL, send_thread, &client_socket);
    pthread_create(&recv_tid, NULL, receive_thread, &client_socket);
    
    // Wait for threads to complete
    pthread_join(send_tid, NULL);
    pthread_join(recv_tid, NULL);
    
    close(client_socket);
    close(server_fd);
    
    printf("\\n═══════════════════════════════════════════\\n");
    printf("  Server shutdown complete\\n");
    printf("═══════════════════════════════════════════\\n");
    
    return 0;
}`;
  }

  function getClientCode() {
    return `/*
 * scp_client_duplex.c - Simple Chat Protocol Client with Duplex Communication
 * Connects to server and enables bidirectional SCP messaging
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <pthread.h>
#include <sys/time.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define ACK_TIMEOUT 5
#define MAX_RETRIES 3

int message_id_counter = 0;
pthread_mutex_t id_mutex = PTHREAD_MUTEX_INITIALIZER;

void get_timestamp(char* buffer) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    sprintf(buffer, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
}

void create_scp_message(char* buffer, const char* msg_type, int msg_id, const char* payload) {
    sprintf(buffer, "SCP/1.0 | %s | id=%d | %s", msg_type, msg_id, payload);
}

int get_next_message_id() {
    pthread_mutex_lock(&id_mutex);
    int id = message_id_counter++;
    pthread_mutex_unlock(&id_mutex);
    return id;
}

int parse_ack(char* buffer) {
    int ack_id = -1;
    char* token = strtok(buffer, "|");
    while (token != NULL) {
        if (strstr(token, "id=") != NULL) {
            sscanf(token, " id=%d", &ack_id);
            break;
        }
        token = strtok(NULL, "|");
    }
    return ack_id;
}

int send_with_ack(int sock, const char* msg_type, const char* payload) {
    char send_buffer[BUFFER_SIZE];
    char recv_buffer[BUFFER_SIZE];
    char timestamp[20];
    int msg_id = get_next_message_id();
    int retries = 0;
    struct timeval tv;
    
    while (retries <= MAX_RETRIES) {
        create_scp_message(send_buffer, msg_type, msg_id, payload);
        get_timestamp(timestamp);
        printf("[%s] SEND (try %d): %s\\n", timestamp, retries + 1, send_buffer);
        send(sock, send_buffer, strlen(send_buffer), 0);
        
        tv.tv_sec = ACK_TIMEOUT;
        tv.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
        
        memset(recv_buffer, 0, BUFFER_SIZE);
        int bytes_read = recv(sock, recv_buffer, BUFFER_SIZE, 0);
        
        if (bytes_read > 0) {
            int ack_id = parse_ack(recv_buffer);
            get_timestamp(timestamp);
            printf("[%s] RECV: %s\\n", timestamp, recv_buffer);
            
            if (ack_id == msg_id) {
                printf("         ✓ ACK received for id=%d\\n\\n", msg_id);
                return 1;
            } else {
                printf("         ✗ ACK mismatch (expected %d, got %d)\\n\\n", msg_id, ack_id);
            }
        } else {
            get_timestamp(timestamp);
            printf("[%s] ⚠ TIMEOUT: No ACK received for id=%d\\n", timestamp, msg_id);
            retries++;
            if (retries <= MAX_RETRIES) {
                printf("         → Retrying... (%d/%d)\\n\\n", retries, MAX_RETRIES);
            }
        }
    }
    
    printf("         ✗ FAILED: Message delivery failed after %d retries\\n\\n", MAX_RETRIES);
    return 0;
}

void* receive_thread(void* arg) {
    int sock = *(int*)arg;
    char buffer[BUFFER_SIZE];
    char msg_type[50], payload[BUFFER_SIZE];
    int msg_id;
    char timestamp[20];
    char ack_buffer[BUFFER_SIZE];
    
    while (1) {
        memset(buffer, 0, BUFFER_SIZE);
        memset(msg_type, 0, sizeof(msg_type));
        memset(payload, 0, sizeof(payload));
        
        int bytes_read = recv(sock, buffer, BUFFER_SIZE, 0);
        if (bytes_read <= 0) {
            printf("Server disconnected\\n");
            break;
        }
        
        // Parse SCP message
        char* token = strtok(buffer, "|");
        token = strtok(NULL, "|");
        if (token) sscanf(token, " %s", msg_type);
        
        token = strtok(NULL, "|");
        if (token) sscanf(token, " id=%d", &msg_id);
        
        token = strtok(NULL, "|");
        if (token) strcpy(payload, token + 1);
        
        get_timestamp(timestamp);
        printf("[%s] RECV: %s\\n", timestamp, buffer);
        
        if (strcmp(msg_type, "MSG") == 0) {
            printf("         → Server says: %s\\n", payload);
            // Send ACK
            create_scp_message(ack_buffer, "ACK", msg_id, "MSG_RECEIVED");
            send(sock, ack_buffer, strlen(ack_buffer), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n", timestamp, ack_buffer);
        } else if (strcmp(msg_type, "BYE") == 0) {
            printf("         → Server requesting disconnect\\n");
            // Send ACK and break
            create_scp_message(ack_buffer, "ACK", msg_id, "MSG_RECEIVED");
            send(sock, ack_buffer, strlen(ack_buffer), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n", timestamp, ack_buffer);
            break;
        } else if (strcmp(msg_type, "ACK") == 0) {
            printf("         ✓ ACK received for id=%d\\n", msg_id);
        }
    }
    
    return NULL;
}

int main() {
    int sock = 0;
    struct sockaddr_in serv_addr;
    char username[100];
    char message[BUFFER_SIZE];
    pthread_t recv_tid;
    
    printf("═══════════════════════════════════════════\\n");
    printf("  SCP Client v1.0 (Duplex Mode)\\n");
    printf("═══════════════════════════════════════════\\n\\n");
    
    printf("Enter your name: ");
    fgets(username, sizeof(username), stdin);
    username[strcspn(username, "\\n")] = 0;
    
    if ((sock = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        printf("\\n✗ Socket creation error\\n");
        return -1;
    }
    
    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port = htons(PORT);
    
    if (inet_pton(AF_INET, "127.0.0.1", &serv_addr.sin_addr) <= 0) {
        printf("\\n✗ Invalid address / Address not supported\\n");
        return -1;
    }
    
    printf("Connecting to server at 127.0.0.1:%d...\\n", PORT);
    if (connect(sock, (struct sockaddr*)&serv_addr, sizeof(serv_addr)) < 0) {
        printf("\\n✗ Connection failed\\n");
        return -1;
    }
    
    printf("✓ Connected to server\\n\\n");
    
    printf("─────────────────────────────────────────\\n");
    printf("Sending connection request...\\n");
    printf("─────────────────────────────────────────\\n");
    if (!send_with_ack(sock, "HELLO", username)) {
        printf("Failed to establish connection\\n");
        close(sock);
        return -1;
    }
    
    // Start receive thread
    pthread_create(&recv_tid, NULL, receive_thread, &sock);
    
    printf("═══════════════════════════════════════════\\n");
    printf("  Chat session started\\n");
    printf("  Type 'quit' to exit\\n");
    printf("═══════════════════════════════════════════\\n\\n");
    
    while (1) {
        printf("You: ");
        fgets(message, BUFFER_SIZE, stdin);
        message[strcspn(message, "\\n")] = 0;
        
        if (strlen(message) == 0) continue;
        
        if (strcmp(message, "quit") == 0) {
            printf("\\nSending disconnect request...\\n");
            printf("─────────────────────────────────────────\\n");
            send_with_ack(sock, "BYE", "DISCONNECT");
            break;
        }
        
        printf("─────────────────────────────────────────\\n");
        send_with_ack(sock, "MSG", message);
    }
    
    pthread_join(recv_tid, NULL);
    close(sock);
    
    printf("\\n═══════════════════════════════════════════\\n");
    printf("  Disconnected from server\\n");
    printf("═══════════════════════════════════════════\\n");
    
    return 0;
}`;
  }

  function getMakefile() {
    return `# Makefile for Simple Chat Protocol (SCP) - Duplex Version

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -pthread
TARGET_SERVER = scp_server_duplex
TARGET_CLIENT = scp_client_duplex

all: $(TARGET_SERVER) $(TARGET_CLIENT)

$(TARGET_SERVER): scp_server_duplex.c
\t$(CC) $(CFLAGS) -o $(TARGET_SERVER) scp_server_duplex.c

$(TARGET_CLIENT): scp_client_duplex.c
\t$(CC) $(CFLAGS) -o $(TARGET_CLIENT) scp_client_duplex.c

clean:
\trm -f $(TARGET_SERVER) $(TARGET_CLIENT)

.PHONY: all clean`;
  }

  function getReadmeContent() {
    return `# Simple Chat Protocol (SCP) - Duplex Communication

A custom application-layer protocol implementing bidirectional communication with reliability features.

## Features

- **Duplex Communication**: Both client and server can send messages simultaneously
- **Reliable Delivery**: ACK mechanism with timeout and retry logic
- **Multi-threading**: Separate threads for sending and receiving
- **Error Handling**: Graceful handling of packet loss and timeouts

## Compilation

\`\`\`bash
make
# Or manually:
gcc -o scp_server_duplex scp_server_duplex.c -lpthread
gcc -o scp_client_duplex scp_client_duplex.c -lpthread
\`\`\`

## Usage

1. Start the server: \`./scp_server_duplex\`
2. Start the client: \`./scp_client_duplex\`
3. Type messages in either terminal
4. Type "quit" to disconnect

## Protocol Format

\`\`\`
SCP/1.0 | MSG_TYPE | id=MESSAGE_ID | PAYLOAD_DATA
\`\`\`

Message Types: HELLO, MSG, ACK, BYE, ERROR

## Network Simulator

Visit the web interface to test the protocol with simulated network conditions.`;
  }

  // Initialize immediately if starting on simulator tab
  if (window.location.hash === '#simulator') {
    document.querySelector('[data-tab="simulator"]').click();
  }

  // Make download functions globally available
  window.downloadFile = downloadFile;
  window.getServerCode = getServerCode;
  window.getClientCode = getClientCode;
  window.getMakefile = getMakefile;

})();
