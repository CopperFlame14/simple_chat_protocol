# Simple Chat Protocol (SCP) — Visual Simulator

A small static website that visually simulates a simple client-server protocol called **SCP (Simple Chat Protocol)**.  
The simulator animates messages from a Client to a Server and shows ACKs returned by the Server. It supports configurable network delay, packet loss, ACK timeouts, and automatic resends.

This is purely a front-end demo (HTML, CSS, JavaScript). No server or backend required — ideal for showcasing on GitHub Pages.

## Features
- Two panels: **Server (left)** and **Client (right)**.
- Send messages from the Client using a text input.
- Visual bubbles animate across the screen to represent messages and ACKs.
- SCP-formatted strings shown in console views:
  - `SCP/1.0 | MSG | id=<N> | <text>`
  - `SCP/1.0 | ACK | id=<N> | MSG_RECEIVED`
- Configurable:
  - **Network Delay** (0–3000 ms) — affects animation and simulated latency.
  - **Packet Loss (%)** (0–100) with toggle to enable/disable.
  - **Client ACK Timeout** (ms) — time before the client resends.
  - **Max Retries** — how many resend attempts the client will make.
- Event log with timestamps showing all important events.
- Clean terminal-inspired UI using monospaced fonts and subtle glow.

## How to use
1. Clone or download the repository.
2. Ensure the three files are in the same folder:
   - `index.html`
   - `styles.css`
   - `app.js`
3. Open `index.html` in your browser — or publish the repository via GitHub Pages:
   - In GitHub repo -> Settings -> Pages -> Source: choose `main` branch and `/ (root)` then save.
   - Your site will be available at `https://<your-username>.github.io/<repo>/`.

## Notes & Ideas for extension
- Currently a purely client-side simulation. You can extend it to actually exchange messages with a backend (websocket or REST) if you want a live demo.
- Add persistent logs (localStorage) or export logs.
- Add packet inspector to show the raw bytes or simulated headers.
- Make timing adjustable per-message or add network jitter.

## License
MIT — feel free to reuse and modify for demos, teaching, or documentation.
