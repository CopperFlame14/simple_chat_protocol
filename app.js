// Simple Chat Protocol (SCP) - Interactive Simulator
// Main application logic

(function() {
  'use strict';

  // Tab Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // Initialize simulator when switching to that tab
      if (targetTab === 'simulator') {
        setTimeout(() => initSimulator(), 100);
      }
      
      // Update active states
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show target content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(targetTab).classList.add('active');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Simulator initialization
  let simulatorInitialized = false;
  let msgCounter = 0;
  const activeMessages = new Map();

  function initSimulator() {
    if (simulatorInitialized) return;
    simulatorInitialized = true;

    // DOM elements
    const clientConsole = document.getElementById('clientConsole');
    const serverConsole = document.getElementById('serverConsole');
    const overlay = document.getElementById('overlay');
    const sendForm = document.getElementById('sendForm');
    const input = document.getElementById('messageInput');
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

    // Update control labels
    function syncControlLabels() {
      delayVal.textContent = delayRange.value;
      lossVal.textContent = lossRange.value;
      timeoutVal.textContent = timeoutRange.value;
    }
    syncControlLabels();
    delayRange.addEventListener('input', syncControlLabels);
    lossRange.addEventListener('input', syncControlLabels);
    timeoutRange.addEventListener('input', syncControlLabels);

    // Utility functions
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
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
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

    // Animation positioning
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

    // Floating message animation
    function animateFloating(text, opts = {}) {
      const { 
        direction = 'toServer', 
        duration = 800, 
        dropped = false, 
        extraClass = '', 
        ack = false 
      } = opts;
      
      const isToServer = direction === 'toServer';
      const coords = computeCoords(isToServer);
      const el = document.createElement('div');
      
      el.className = 'floating-msg ' + 
                     (ack ? 'floating-ack ' : '') + 
                     (dropped ? 'floating-dropped ' : '') + 
                     extraClass;
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
    }

    // SCP message formatters
    function scpMessage(msgId, text) {
      return `SCP/1.0 | MSG | id=${msgId} | ${text}`;
    }

    function scpAck(msgId) {
      return `SCP/1.0 | ACK | id=${msgId} | MSG_RECEIVED`;
    }

    // Client send function
    function clientSend(text) {
      const id = ++msgCounter;
      const formatted = scpMessage(id, text);
      appendConsole(clientConsole, formatted, `Client sent (id=${id})`);
      logEvent(`Client -> "${text}" (id=${id})`);

      const messageState = { 
        id, 
        text, 
        retries: 0, 
        acked: false, 
        timer: null 
      };
      activeMessages.set(id, messageState);
      attemptSend(id);
    }

    // Attempt send with retry logic
    function attemptSend(id) {
      const state = activeMessages.get(id);
      if (!state) return;

      const maxRetries = parseInt(maxRetriesSelect.value, 10);
      if (state.retries > maxRetries) {
        appendConsole(
          clientConsole, 
          `SCP_CLIENT | ERROR | id=${id} | MAX_RETRIES_EXCEEDED`, 
          'Client'
        );
        logEvent(`Message id=${id} failed after ${state.retries} retries.`);
        activeMessages.delete(id);
        return;
      }

      state.retries += 1;
      appendConsole(
        clientConsole, 
        `SCP/1.0 | SEND_ATTEMPT | id=${id} | try=${state.retries}`
      );
      logEvent(`Attempting send id=${id} (try ${state.retries})`);

      const delay = parseInt(delayRange.value, 10);
      const lossEnabled = lossToggle.checked;
      const lossPct = parseInt(lossRange.value, 10);
      const shouldDrop = lossEnabled && (Math.random() * 100) < lossPct;
      const travelDuration = Math.max(120, delay);

      // Animate message to server
      animateFloating(scpMessage(id, state.text), { 
        direction: 'toServer', 
        duration: travelDuration 
      });

      if (shouldDrop) {
        // Simulate packet loss
        logEvent(`Message id=${id} was lost in transit (simulated).`);
        appendConsole(serverConsole, `-- packet loss occurred --`, 'Server');
        animateFloating(`dropped id=${id}`, { 
          direction: 'toServer', 
          duration: travelDuration, 
          dropped: true 
        });
      } else {
        // Message arrives at server
        setTimeout(() => {
          if (!activeMessages.has(id)) return;
          
          const raw = scpMessage(id, state.text);
          appendConsole(serverConsole, raw, `Server received (id=${id})`);
          logEvent(`Server received message id=${id}.`);

          const ackWillDrop = lossEnabled && (Math.random() * 100) < lossPct;
          const ackTravel = Math.max(120, delay);

          if (ackWillDrop) {
            // ACK is lost
            logEvent(`ACK for id=${id} was lost in transit (simulated).`);
            animateFloating(`ACK_LOST id=${id}`, { 
              direction: 'toClient', 
              duration: ackTravel, 
              dropped: true 
            });
            appendConsole(serverConsole, scpAck(id), 'Server attempted ACK (lost)');
          } else {
            // ACK arrives successfully
            animateFloating(scpAck(id), { 
              direction: 'toClient', 
              duration: ackTravel, 
              ack: true 
            }).then(() => handleClientAck(id));
            
            appendConsole(serverConsole, scpAck(id), 'Server sent ACK');
            logEvent(`Server sent ACK for id=${id}.`);
          }
        }, travelDuration + 80);
      }

      // Set timeout for ACK
      if (state.timer) clearTimeout(state.timer);
      const ackTimeout = Math.max(200, parseInt(timeoutRange.value, 10));
      state.timer = setTimeout(() => {
        if (!activeMessages.has(id)) return;
        const s = activeMessages.get(id);
        if (s.acked) return;
        
        logEvent(`ACK timeout for id=${id} (try ${s.retries}).`);
        appendConsole(
          clientConsole, 
          `SCP/1.0 | TIMEOUT | id=${id} | retrying...`, 
          'Client'
        );
        attemptSend(id);
      }, ackTimeout + 20);
    }

    // Handle client receiving ACK
    function handleClientAck(id) {
      const state = activeMessages.get(id);
      if (!state) {
        appendConsole(
          clientConsole, 
          `SCP/1.0 | ACK_IGNORED | id=${id} | no active message`, 
          'Client'
        );
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

    // Event listeners
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
      msgCounter = 0;
      logEvent('Logs cleared. Ready to send messages!');
    });

    // Initialize with welcome message
    logEvent('Simulator ready! Type a message and click Send.');
  }

  // File download functions for C code
  window.downloadFile = function(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.getServerCode = function() {
    return `/*
 * scp_server.c - Simple Chat Protocol Server
 * Listens on port 8080 and handles SCP messages
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define MAX_CLIENTS 5

void parse_scp_message(char* buffer, char* msg_type, int* msg_id, char* payload) {
    char* token;
    char temp[BUFFER_SIZE];
    strcpy(temp, buffer);
    
    token = strtok(temp, "|");
    token = strtok(NULL, "|");
    if (token) sscanf(token, " %s", msg_type);
    
    token = strtok(NULL, "|");
    if (token) sscanf(token, " id=%d", msg_id);
    
    token = strtok(NULL, "|");
    if (token) strcpy(payload, token + 1);
}

void create_ack(char* buffer, int msg_id) {
    sprintf(buffer, "SCP/1.0 | ACK | id=%d | MSG_RECEIVED", msg_id);
}

void get_timestamp(char* buffer) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    sprintf(buffer, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
}

int main() {
    int server_fd, client_socket;
    struct sockaddr_in address;
    int addrlen = sizeof(address);
    char buffer[BUFFER_SIZE] = {0};
    char msg_type[50], payload[BUFFER_SIZE];
    int msg_id;
    char timestamp[20];
    
    printf("═══════════════════════════════════════════\\n");
    printf("  Simple Chat Protocol (SCP) Server v1.0\\n");
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
    
    printf("🟢 Server listening on port %d...\\n\\n", PORT);
    
    if ((client_socket = accept(server_fd, (struct sockaddr*)&address, (socklen_t*)&addrlen)) < 0) {
        perror("Accept failed");
        exit(EXIT_FAILURE);
    }
    
    printf("✓ Client connected from %s:%d\\n\\n", inet_ntoa(address.sin_addr), ntohs(address.sin_port));
    
    while (1) {
        memset(buffer, 0, BUFFER_SIZE);
        memset(msg_type, 0, sizeof(msg_type));
        memset(payload, 0, sizeof(payload));
        
        int bytes_read = read(client_socket, buffer, BUFFER_SIZE);
        if (bytes_read <= 0) {
            printf("Client disconnected\\n");
            break;
        }
        
        parse_scp_message(buffer, msg_type, &msg_id, payload);
        get_timestamp(timestamp);
        printf("[%s] RECV: %s\\n", timestamp, buffer);
        
        if (strcmp(msg_type, "HELLO") == 0) {
            printf("         → Connection request from: %s\\n", payload);
            char ack[BUFFER_SIZE];
            create_ack(ack, msg_id);
            send(client_socket, ack, strlen(ack), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n\\n", timestamp, ack);
        } else if (strcmp(msg_type, "MSG") == 0) {
            printf("         → Message: %s\\n", payload);
            char ack[BUFFER_SIZE];
            create_ack(ack, msg_id);
            send(client_socket, ack, strlen(ack), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n\\n", timestamp, ack);
        } else if (strcmp(msg_type, "BYE") == 0) {
            printf("         → Client requesting disconnect\\n");
            char ack[BUFFER_SIZE];
            create_ack(ack, msg_id);
            send(client_socket, ack, strlen(ack), 0);
            get_timestamp(timestamp);
            printf("[%s] SEND: %s\\n\\n", timestamp, ack);
            printf("Connection closed by client\\n");
            break;
        } else {
            printf("         → Unknown message type: %s\\n\\n", msg_type);
        }
    }
    
    close(client_socket);
    close(server_fd);
    
    printf("\\n═══════════════════════════════════════════\\n");
    printf("  Server shutdown complete\\n");
    printf("═══════════════════════════════════════════\\n");
    
    return 0;
}`;
  };

  window.getClientCode = function() {
    return `/*
 * scp_client.c - Simple Chat Protocol Client
 * Connects to server and sends SCP messages with ACK handling
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define ACK_TIMEOUT 5
#define MAX_RETRIES 3

int message_id_counter = 0;

void get_timestamp(char* buffer) {
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    sprintf(buffer, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
}

void create_scp_message(char* buffer, const char* msg_type, int msg_id, const char* payload) {
    sprintf(buffer, "SCP/1.0 | %s | id=%d | %s", msg_type, msg_id, payload);
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
    int msg_id = message_id_counter++;
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
        int bytes_read = read(sock, recv_buffer, BUFFER_SIZE);
        
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

int main() {
    int sock = 0;
    struct sockaddr_in serv_addr;
    char username[100];
    char message[BUFFER_SIZE];
    
    printf("═══════════════════════════════════════════\\n");
    printf("  Simple Chat Protocol (SCP) Client v1.0\\n");
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
    
    close(sock);
    
    printf("\\n═══════════════════════════════════════════\\n");
    printf("  Disconnected from server\\n");
    printf("═══════════════════════════════════════════\\n");
    
    return 0;
}`;
  };

  window.getMakefile = function() {
    return `# Makefile for Simple Chat Protocol (SCP)

CC = gcc
CFLAGS = -Wall -Wextra -std=c99
TARGET_SERVER = scp_server
TARGET_CLIENT = scp_client

all: $(TARGET_SERVER) $(TARGET_CLIENT)

$(TARGET_SERVER): scp_server.c
\t$(CC) $(CFLAGS) -o $(TARGET_SERVER) scp_server.c

$(TARGET_CLIENT): scp_client.c
\t$(CC) $(CFLAGS) -o $(TARGET_CLIENT) scp_client.c

clean:
\trm -f $(TARGET_SERVER) $(TARGET_CLIENT)

.PHONY: all clean`;
  };

})();
