<img width="1024" height="434" alt="image" src="https://github.com/user-attachments/assets/f67eebe9-512d-41a8-8bc0-574d8dd6f788" />


# V.A.R.M.A — On-Device Perception for a Light-Weight Browser Agent

A production-grade, privacy-first Chrome **side-panel** agent that perceives the web page you are viewing and executes complex workflows live on your browser tabs.

Built for **Smart India Hackathon — Problem SIH26171**  
**"On-device Visual Perception for Light-weight Browser Agents"**  
Indian Space Research Organisation (ISRO) / Department of Space.

| | |
|---|---|
| **Problem statement** | SIH26171 |
| **Organisation** | ISRO / Department of Space |
| **Theme** | Smart Automation (Software) |
| **Deliverable** | Privacy-preserving hybrid browser agent: on-device perception + client-side redaction, 24/7 hosted server reasoning, and Supabase cloud storage |
| **Client** | Chrome MV3 side panel extension (`extension/`) |
| **Server** | Python FastAPI receiver (`server/`) + vLLM (`gemma-4-12b-it` on `:8000`) running 24/7 |

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CHROME EXTENSION CLIENT                         │
│   • Welcome Screen with Google OAuth (Supabase Auth)                        │
│   • On-Device Layer-1 PII Redaction (0ms deterministic masking)             │
│   • Smooth Glowing Neon Cursor (0.65s visible tracking)                     │
│   • Native Browser Tab Driver (No --remote-debugging-port needed for users!)│
└──────────────┬──────────────────────────────────────────────▲───────────────┘
               │                                              │ 
               │ HTTP / WebSocket (:8002)                     │ Actions / Telemetry
               ▼                                              │
┌─────────────────────────────────────────────────────────────┴───────────────┐
│                    HOSTED 24/7 GPU SERVER (Ubuntu / Linux)                  │
│                                                                             │
│   FastAPI Receiver (Port 8002)                                              │
│     ├── /health           -> Engine & service liveness                      │
│     ├── /chat             -> Instant conversational replies                 │
│     └── /ws/agent         -> Real-time browser agent reasoning loop         │
│                                                                             │
│   vLLM Engine (Port 8000)                                                   │
│     └── gemma-4-12b-it   -> Visual reasoning & perception grounding         │
│                                                                             │
│   Supervisor (systemd / start_production_247.sh)                            │
│     └── Auto-restarts processes upon failure, runs 24/7 in background        │
└──────────────┬──────────────────────────────────────────────────────────────┘
               │
               │ HTTPS Telemetry & Redacted Screenshots
               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE CLOUD INFRASTRUCTURE                          │
│   • Google OAuth Authentication (launchWebAuthFlow)                         │
│   • User-Isolated Storage Buckets: `redacted-screens/users/{user_id}/...`   │
│   • Postgres Telemetry Tables: `tasks`, `task_steps`                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Zero-Setup User Guide (For Extension Users)

Any user anywhere can load the extension and use the AI agent **without installing Python, CUDA, or local models**:

### Step 1: Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the **`extension/dist`** folder.
4. Pin the **V.A.R.M.A** icon to your Chrome toolbar and click it to open the Side Panel.

### Step 2: Sign In & Start Browsing
1. The **V.A.R.M.A Welcome Screen** will appear.
2. Click **Sign in with Google** (or choose manual email / *"Continue as vispl@gmail.com"*).
3. The agent connects to the hosted server automatically!
4. Type any task in the input dock:
   ```text
   Create 5 tabs with wikipedia
   ```
   or
   ```text
   Search for ISRO Chandrayaan-3 updates on Google
   ```
5. Watch the glowing neon cyan cursor glide smoothly across the page and execute your instructions.

> **Configuring a Custom Server URL:**  
> If you are hosting your own server instance, click `⋮` (Menu) in the extension header ➔ **Server Endpoint** ➔ enter your server's IP (e.g. `http://103.89.8.32:8002`) ➔ click **Save**.

---

## 3. Server Deployment Guide (Running 24/7 on a GPU Server)

To host the V.A.R.M.A backend and `gemma-4-12b-it` model on an Ubuntu / Linux GPU server:

### Step 1: Clone the Repository
```bash
git clone https://github.com/SnippetTechie/Agent.git
cd Agent
```

### Step 2: Install Dependencies
Run the all-in-one dependency installer:
```bash
bash scripts/install_server_deps.sh
```
*(This installs FastAPI, Uvicorn, vLLM, Flash-Attention, Playwright, and sets up `server/.env`).*

### Step 3: Configure Environment
Copy and verify your server configuration:
```bash
cp server/.env.example server/.env
```
Key settings in `server/.env`:
```ini
RECEIVER_HOST=0.0.0.0
RECEIVER_PORT=8002
VLLM_BASE_URL=http://127.0.0.1:8000/v1
VLLM_MODEL=gemma-4-12b-it
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_STORAGE_BUCKET=redacted-screens
```

### Step 4: Launch 24/7 All-in-One Supervisor
Run the production script that starts both **vLLM (gemma-4-12b-it)** and the **Receiver server** and supervises them 24/7:
```bash
bash scripts/start_production_247.sh
```
*(Or use the Python cross-platform runner: `python3 scripts/start_gemma_and_server.py`)*.

What this does:
- Starts vLLM with `gemma-4-12b-it` on `:8000` with optimized Flash-Attention and bfloat16 precision.
- Waits for GPU weights to warm up.
- Starts `start_server.py` bound to `0.0.0.0:8002`.
- Monitors both processes: if either crashes, it auto-restarts within 3 seconds.
- Logs all output to `logs/vllm.log` and `logs/receiver.log`.

### Step 5 (Optional): Run as a Background Systemd Service
To ensure the server launches automatically on system boot and runs permanently in the background without keeping a terminal open:
```bash
sudo bash scripts/setup_systemd.sh
```
Manage the service anytime:
```bash
sudo systemctl status varma       # Check live status
sudo journalctl -u varma -f       # Follow live logs
sudo systemctl restart varma      # Restart
sudo systemctl stop varma         # Stop
```

### Step 6: Verify Server Health
From any machine, run:
```bash
curl http://<YOUR_SERVER_IP>:8002/health
```
Expected response:
```json
{
  "server": "healthy",
  "vllm": { "reachable": true, "model": "gemma-4-12b-it" },
  "supabase": { "configured": true }
}
```

---

## 4. Google OAuth & Supabase Cloud Configuration

V.A.R.M.A isolates every user's tasks and redacted screenshots under their personal namespace: `redacted-screens/users/{user_id}/`.

### 1. Enable Google Provider in Supabase
1. Go to your **Supabase Dashboard ➔ Authentication ➔ Providers**.
2. Expand **Google**, toggle to **ON**.
3. Enter your Google Cloud **Client ID** and **Client Secret**.
4. Click **Save**.

### 2. Configure Redirect URLs
1. In Supabase Dashboard, go to **Authentication ➔ URL Configuration**.
2. Under **Redirect URLs**, click **Add URL** and enter:
   ```text
   https://*.chromiumapp.org/**
   ```
3. Click **Save**.

### 3. Google Cloud Console Callback
In your Google Cloud Console OAuth Credentials, verify **Authorized redirect URIs** contains:
```text
https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

---

## 5. Key Features & Innovations

### 1. Layer-1 On-Device Privacy Shield
- **Deterministic 0ms redaction:** Automatically intercepts and blacks out passwords, credit cards, Aadhaar, PAN, SSN, API keys, and emails before the AI inspects the screen.
- Preserves semantic context (`[REDACTED_CREDENTIAL]`, `[REDACTED_ID]`) so the AI understands element roles without ever seeing private values.

### 2. Visible Glowing Mouse Cursor
- Renders an animated neon cyan cursor beacon with a white target center dot.
- Set to a slow, legible `0.65s` gliding transition with pre-action pauses, ensuring the user can clearly watch and verify every decision.

### 3. Multi-Tab Autonomous Driving
- Capable of creating, grouping, and orchestrating multiple tabs sequentially (e.g. *"Create 5 tabs with Wikipedia"*).
- Intelligent anti-loop detector bypass for multi-tab workflows.

### 4. Human-in-the-Loop Safety Gate
- **Manual Mode:** State-changing actions (`click`, `type`, `navigate`) pause for user confirmation.
- **Auto Mode:** 1-second visual countdown before execution for audit awareness.
- **Skip Mode:** Fully autonomous execution for maximal speed.

---

## 6. Development & Local Testing

### Building the Extension
```bash
cd extension
npm install
npm run build
```
The production bundle is compiled into `extension/dist`.

### Running Server Standalone
```bash
python scripts/start_server.py
```

### Running Test Probes
```bash
python scripts/tests/test_agent.py "Search ISRO on Google"
python scripts/tests/test_redaction.py
```

---

## 7. Project Structure

```
Agent/
├── extension/                       # Chrome Manifest V3 Extension
│   ├── manifest.config.ts           # Permissions, CSP & Side Panel config
│   ├── src/sidepanel/
│   │   ├── SidePanel.tsx            # Main layout & router
│   │   ├── components/
│   │   │   ├── WelcomeScreen.tsx    # Google OAuth branding & setup guide
│   │   │   ├── Header.tsx           # User badge, sign-out, settings
│   │   │   └── HeaderMenu.tsx       # Dynamic Server URL config & visuals
│   │   ├── hooks/
│   │   │   ├── useAuthUser.ts       # Supabase Google OAuth & JWT decode
│   │   │   └── useAgentSession.ts   # WebSocket run loop & user telemetry
│   │   └── lib/
│   │       ├── serverConfig.ts      # Dynamic server endpoint resolver
│   │       ├── agentWebSocket.ts    # WS client for /ws/agent
│   │       ├── extensionDriver.ts   # On-page cursor & tab click driver
│   │       └── capture.ts           # Screenshot & DOM redaction capture
│   └── dist/                        # Ready-to-load Chrome unpacked bundle
│
├── server/                          # Python Backend
│   ├── receiver.py                  # FastAPI server: /health, /chat, /ws/agent
│   ├── requirements.txt             # Backend dependencies
│   ├── .env.example                 # Environment template
│   ├── agent/
│   │   ├── loop.py                  # Main observe -> think -> act agent loop
│   │   ├── extension_session.py     # Tab driver bridge over WebSocket
│   │   ├── dom.py                   # On-page element perception & PII masking
│   │   └── prompts.py               # Action schema & system instructions
│   └── db/
│       └── supabase_client.py       # User bucket isolation & telemetry logger
│
├── scripts/                         # 24/7 Production & Maintenance Scripts
│   ├── start_production_247.sh      # 24/7 Bash runner (vLLM + Receiver supervisor)
│   ├── start_gemma_and_server.py    # 24/7 Cross-platform Python supervisor
│   ├── setup_systemd.sh             # Linux systemd service installer (auto-boot)
│   ├── install_server_deps.sh       # 1-click server dependencies setup
│   └── start_server.py              # Standalone receiver launcher
│
└── README.md                        # Master documentation
```

---

## 8. License & Acknowledgments

Developed for **Smart India Hackathon (SIH26171)** in collaboration with **ISRO / Department of Space**.  
Built with FastAPI, vLLM, Google Gemma-4, React, TailwindCSS, and Supabase.
