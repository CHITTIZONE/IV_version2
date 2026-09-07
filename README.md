# IV SENTRY PRO™ — Clinical Infusion Telemetry & AI Flow Rate System

**Version:** 2.5 — Pure D3 Acoustic Buzzer Architecture & Web Serial Telemetry  
**Classification:** Clinical-Grade IoT Infusion Monitoring & Decision Support System  
**Hardware Platform:** Arduino Uno / Nano (ATmega328P) + HX711 24-bit ADC Transducer + I2C 16x2 LCD  
**Software Stack:** HTML5, Vanilla CSS3 (Custom Medical Design System), Vanilla JavaScript (ES6+), Web Serial API, Node.js  
**Hosting Compatibility:** Render (Static Site / Web Service), Local Python / Node HTTP Daemons

---

## Table of Contents
1. [System Overview & Vision](#1-system-overview--vision)
2. [Key Capabilities & Features](#2-key-capabilities--features)
3. [Complete System Architecture](#3-complete-system-architecture)
4. [Hardware Bill of Materials (BOM) & Pinout](#4-hardware-bill-of-materials-bom--pinout)
5. [Hardware Circuitry & Wiring Guide](#5-hardware-circuitry--wiring-guide)
6. [Arduino Firmware Architecture (`sketch_jan13a.ino`)](#6-arduino-firmware-architecture-sketch_jan13aino)
7. [Bi-Directional Telemetry Protocol (9600 Baud)](#7-bi-directional-telemetry-protocol-9600-baud)
8. [Clinical AI Flow Rate & Osmotherapy Engine](#8-clinical-ai-flow-rate--osmotherapy-engine)
9. [Web Telemetry Workstation (`frontend/`)](#9-web-telemetry-workstation-frontend)
10. [Official Doctor's Clinical Report & PDF Audit](#10-official-doctors-clinical-report--pdf-audit)
11. [Step-by-Step Installation & Setup](#11-step-by-step-installation--setup)
12. [Calibration & Zero-Tare Procedure](#12-calibration--zero-tare-procedure)
13. [Deployment on Render](#13-deployment-on-render)
14. [Troubleshooting & Diagnostics](#14-troubleshooting--diagnostics)
15. [Repository Structure](#15-repository-structure)

---

## 1. System Overview & Vision

**IV SENTRY PRO™** is an intelligent medical IoT telemetry system designed to eliminate manual infusion monitoring errors, air embolism risks, fluid exhaustion, and vein collapse in clinical environments. 

Traditional intravenous infusion monitoring relies on intermittent nurse checks, making it prone to human error, missed reservoir exhaustion, and delayed medication administration. IV SENTRY PRO™ solves this by combining:
- **Continuous Milligram-Accuracy Gravimetric Sensing:** A 10kg parallel-beam load cell connected via a 24-bit HX711 analog-to-digital converter continuously tracks IV bag mass.
- **Microsecond Precision Hardware Chronometer:** Real-time hardware timer tracking infusion elapsed duration that halts instantaneously on pause, stop, or empty bag conditions.
- **Pure Pin D3 Acoustic Telemetry:** Progressive milestone acoustic alerts (90%, 75%, 65%, 50%, 35%, 25%, and <10% critical alarm) driven by a dedicated piezo sounder, completely replacing cumbersome multi-channel relay modules.
- **Browser-Native Web Serial Workstation:** Direct plug-and-play USB connection to any modern browser without requiring external drivers, cloud relays, or third-party desktop utilities.
- **Heuristic Clinical AI Osmotherapy Engine:** Automated flow rate (mL/hr) and drip rate (drops/min) calculations based on patient vitals (Heart Rate, Blood Pressure, Respiratory Rate) and fluid tonicity.
- **Hospital Audit Doctor Report:** One-click clinical summary report generator with signature blocks, trip duration, alert logs, and print/PDF export for patient EHR archives.

---

## 2. Key Capabilities & Features

| Feature | Description |
|---|---|
| **Real-Time Mass & Level** | 24-bit differential ADC conversion measuring bottle weight in 0.1g increments, converted to percentage (0%–100%) and milliliters (mL). |
| **Realistic Fluid Animation** | Dynamic SVG IV bottle graphic with reactive fluid levels, meniscus curvature, liquid surface shimmer, and animated drip chamber. |
| **Pure D3 Buzzer Milestones** | Frequency-tuned acoustic alerts at 7 designated fluid thresholds; 5 rapid alarm chirps when level drops below 10%. |
| **Instant Timer Stop** | Physical Stop button (Pin D11) or UI Pause immediately freezes the hardware elapsed duration counter. |
| **Auto-Trip Completion** | Automatically detects when reservoir reaches 0% / empty tare, halts the timer, sounds a 3-beep completion chord, and prompts the Doctor Report modal. |
| **Clinical AI Engine** | Evaluates hemodynamic state (Euvolemic, Hypovolemic Shock, Hypertensive/Overload Risk) and suggests calibrated infusion rates. |
| **One-Touch Prescription Sync** | Injects AI-calculated flow rates and drip parameters into clinical notes with instant visual confirmation. |
| **Web Serial Plug & Play** | Direct hardware communication through Google Chrome / Microsoft Edge using standard Web Serial API (`navigator.serial`). |
| **Clinical Light / Dark Theme** | High-contrast dark room bedside monitoring mode and crisp clinical daylight theme with persistent user preference storage. |
| **Zero External Dependencies** | Written in 100% Vanilla HTML5, CSS3, and modern ES6+ JavaScript—no heavyweight frameworks, bundlers, or Node runtimes required for frontend execution. |

---

## 3. Complete System Architecture

```
                                  ┌─────────────────────────────┐
                                  │   IV Bag Reservoir (Fluid)  │
                                  └──────────────┬──────────────┘
                                                 │ Gravitational Mass
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │ 10kg Load Cell Transducer   │
                                  └──────────────┬──────────────┘
                                                 │ Analog Millivolt Signals
                                                 ▼
                                  ┌─────────────────────────────┐
                                  │ HX711 24-Bit ADC (D6, D7)   │
                                  └──────────────┬──────────────┘
                                                 │ 24-bit Digital Data
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          ATmega328P Hardware Controller (Arduino)                      │
│                                                                                        │
│  • Scale Calibration & Filtering (3-sample average)                                    │
│  • Hardware Chronometer (millis() tracking with pause preservation)                     │
│  • Acoustic Alert Scheduler (Milestones: 90%, 75%, 65%, 50%, 35%, 25%, <10%, 0%)      │
│  • Command Processing Engine (START, STOP, COMPLETE, TARE, CAL)                         │
└──────────────┬──────────────────────────────┬───────────────────────────┬──────────────┘
               │                              │                           │
               ▼                              ▼                           ▼
   ┌──────────────────────┐       ┌──────────────────────┐   ┌────────────────────────┐
   │ I2C 16x2 LCD Display │       │ Clinical Piezo (D3)  │   │ Push-Buttons (D11, D12)│
   │ (Time, Level, Mass)  │       │ (Acoustic Alerts)    │   │ (Physical Start / Stop)│
   └──────────────────────┘       └──────────────────────┘   └────────────────────────┘
               │
               ▼ USB Serial UART (9600 Baud)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Web Telemetry Workstation (Browser Native)                      │
│                                                                                        │
│  • Web Serial API Stream Reader / Writer                                              │
│  • Real-Time Reactive SVG IV Bag Visualization                                        │
│  • Biometrics & Clinical AI Osmotherapy Engine                                        │
│  • Patient Admission, Bed Assignment & Medication Notes                               │
│  • Doctor Infusion Summary Report & Hospital Audit Generator                          │
│  • System Calibration, Auto-Tare & Diagnostics Cockpit                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Hardware Bill of Materials (BOM) & Pinout

### Component List
1. **Microcontroller Board:** Arduino Uno Rev3 or Arduino Nano (ATmega328P, 16 MHz, 5V).
2. **Weight Sensor:** 10kg Aluminum Parallel-Beam Load Cell Transducer (sensitivity: ~1.0 mV/V).
3. **ADC Amplifier:** HX711 24-Bit Analog-to-Digital Converter Module.
4. **Display:** 16x2 Character LCD with PCF8574 I2C Backpack (Default Address: `0x27`).
5. **Acoustic Indicator:** Active or Passive 5V Piezo Buzzer (connected to Pin D3).
6. **Physical Control Buttons:** 2x Momentary Push Buttons (Start = Pin D12, Stop = Pin D11).
7. **Chassis & Rig:** Acrylic / 3D-printed IV bottle suspension hook mounted to load cell plate.
8. **Interconnects:** USB Type-A to Type-B (Uno) or Mini-USB (Nano), DuPont jumper cables.

### Pinout Mapping Table

| Arduino Pin | Hardware Component | Function | Electrical Standard |
|---|---|---|---|
| **Pin D6** | HX711 Module | `DOUT` (Data Output) | Digital Input |
| **Pin D7** | HX711 Module | `SCK` (Clock Input) | Digital Output |
| **Pin D3** | Piezo Buzzer | Positive (`+`) Lead | PWM / Digital Output (Active HIGH) |
| **Pin D12** | Start Push-Button | Terminal 1 (Terminal 2 to GND) | Digital Input (`INPUT_PULLUP`, Active LOW) |
| **Pin D11** | Stop Push-Button | Terminal 1 (Terminal 2 to GND) | Digital Input (`INPUT_PULLUP`, Active LOW) |
| **Pin A4** | I2C LCD Module | `SDA` (Serial Data) | I2C Bus (Requires 5V pullups) |
| **Pin A5** | I2C LCD Module | `SCL` (Serial Clock) | I2C Bus |
| **5V** | HX711, LCD, Buzzer | Power Supply (`VCC`) | Regulated 5.0V DC |
| **GND** | HX711, LCD, Buzzer, Buttons | Ground Reference (`GND`) | Common Ground |

---

## 5. Hardware Circuitry & Wiring Guide

### 1. Load Cell to HX711 Module
- **Red Wire:** `E+` (Excitation Positive)
- **Black Wire:** `E-` (Excitation Negative)
- **White Wire:** `A-` (Signal Negative)
- **Green Wire:** `A+` (Signal Positive)
*(Note: If weight readings go negative when weight is added, reverse White and Green leads).*

### 2. HX711 to Arduino
- `VCC` -> Arduino `5V`
- `GND` -> Arduino `GND`
- `DT` (`DOUT`) -> Arduino `Pin D6`
- `SCK` -> Arduino `Pin D7`

### 3. Piezo Buzzer to Arduino
- **Positive Lead (+):** Arduino `Pin D3`
- **Negative Lead (-):** Arduino `GND`
*(No relay or external transistor is needed; Pin D3 drives acoustic square waves directly via `tone()`)*.

### 4. Push Buttons to Arduino
- **Start Button:** One leg to Arduino `Pin D12`, opposite leg to Arduino `GND`.
- **Stop Button:** One leg to Arduino `Pin D11`, opposite leg to Arduino `GND`.
*(Internal pull-up resistors are enabled via software: `pinMode(PIN, INPUT_PULLUP)`)*.

### 5. I2C LCD Display (16x2)
- `VCC` -> Arduino `5V`
- `GND` -> Arduino `GND`
- `SDA` -> Arduino `Pin A4` (or dedicated SDA pin on Uno)
- `SCL` -> Arduino `Pin A5` (or dedicated SCL pin on Uno)

---

## 6. Arduino Firmware Architecture (`sketch_jan13a.ino`)

The firmware is located in [`sketch_jan13a.ino`](file:///f:/PROJECT/IV_version2/sketch_jan13a.ino) and is organized into modular functional layers:

### 1. Chronometer Subsystem
- Uses non-blocking `millis()` delta calculation:
  ```cpp
  if (timerRunning) {
    elapsedTime = millis() - startTime;
  }
  ```
- Pausing halts elapsed time accumulation instantaneously (`elapsedTime = millis() - startTime`).
- Resuming recovers previously elapsed duration seamlessly (`startTime = millis() - elapsedTime`).
- Resetting sets `elapsedTime = 0` upon starting a new infusion trip.

### 2. Gravimetric Mass & Level Computation
- Takes 3 continuous samples (`scale3.get_units(3)`) to reject physical fluid vibrations and swing artifacts.
- Dynamically converts mass into fluid percentage:
  $$\text{Level (\%)} = \text{constrain}\left(\frac{\text{Weight} - \text{EmptyTare}}{\text{FullWeight} - \text{EmptyTare}} \times 100,\, 0,\, 100\right)$$

### 3. Acoustic Milestone Dispatcher
- Evaluates fluid level thresholds in descending order to avoid duplicate triggers:
  - **90% Level:** 1 Beep (2400 Hz, 150ms)
  - **75% Level:** 1 Beep (2400 Hz, 150ms)
  - **65% Level:** 1 Beep (2400 Hz, 150ms)
  - **50% Level:** 1 Beep (2400 Hz, 150ms)
  - **35% Level:** 1 Beep (2500 Hz, 150ms)
  - **25% Level:** 1 Beep (2600 Hz, 150ms)
  - **< 10% Critical Level:** 5 Rapid Warning Beeps (2800 Hz, 100ms on, 90ms off)
  - **0% Trip Completed:** Automatically halts the session, silences ongoing buzzers, and emits 3 triumph chords (2600 Hz).

### 4. Dual 16x2 LCD Dashboard
- **Standby Mode:** Displays system version and ready indicator.
- **Active Session:** Displays current elapsed time (`Time: HH:MM:SS`) on Row 1, and status, percentage, and weight (`RUN L:75% W:375g`) on Row 2.
- **Alert State:** Displays `ALRT!` on critical threshold breaches (<10%).
- **Calibration Mode:** Displays live weight in grams with zero-tare verification.

---

## 7. Bi-Directional Telemetry Protocol (9600 Baud)

Communication occurs over standard UART serial at **9600 baud, 8 data bits, no parity, 1 stop bit (8N1)**.

### Outbound Telemetry (Arduino → Browser Workstation)
Streamed every ~350ms in ASCII lines terminated by `\n`:

| Message Prefix | Payload Format | Description | Example |
|---|---|---|---|
| `WEIGHT:` | `<float>` (grams) | Filtered net weight on transducer | `WEIGHT:425.6` |
| `LEVEL:` | `<int>` (0–100) | Computed percentage level of fluid reservoir | `LEVEL:85` |
| `TIME:` | `HH:MM:SS` | Synchronized session elapsed duration | `TIME:00:14:28` |
| `STATUS:` | `<string>` | `IDLE`, `RUNNING`, `STOPPED`, `COMPLETED`, `CAL_MODE` | `STATUS:RUNNING` |
| `BUZZER:EVENT:` | `<pct>:<beeps>` | Acoustic alert trigger notification | `BUZZER:EVENT:10:5` |
| `EVENT:` | `INFUSION_COMPLETED` | Automatic trip completion trigger | `EVENT:INFUSION_COMPLETED` |
| `CAL_FACTOR:` | `<float>` | Active scale calibration divisor | `CAL_FACTOR:228.0` |
| `CAL_FULL:` | `<float>` | Active calibrated full mass (g) | `CAL_FULL:500.0` |
| `CAL_EMPTY:` | `<float>` | Active calibrated tare mass (g) | `CAL_EMPTY:50.0` |
| `PONG:` | `<string>` | Hardware handshake acknowledgment | `PONG:IVMU_1_PRO` |

### Inbound Commands (Browser Workstation → Arduino)
Issued by workstation user interface interactions:

| Command | Description | Action Taken by Microcontroller |
|---|---|---|
| `CMD:START` | Start / Resume Session | Arms acoustic milestones, resumes timer, sets `STATUS:RUNNING`. |
| `CMD:STOP` | Pause / Stop Session | Freezes chronometer immediately, silences buzzer, sets `STATUS:STOPPED`. |
| `CMD:COMPLETE`| Complete & Audit Trip | Locks final elapsed time, sets `STATUS:COMPLETED`, emits completion chimes. |
| `CMD:BUZZER:1`| Acoustic Diagnostics | Fires 1 test beep on Pin D3 (2400 Hz). |
| `CMD:BUZZER:5`| Acoustic Diagnostics | Fires 5 rapid test alarm chirps on Pin D3 (2800 Hz). |
| `CAL:MODE:START`| Enter Calibration | Halts timers, auto-tares scale to `0.0g`, enters `CAL_MODE`. |
| `CAL:MODE:EXIT` | Exit Calibration | Restores operational standby mode. |
| `CAL:TARE` | Zero-Tare Scale | Re-zeros current transducer baseline reading to `0.0g`. |
| `CAL:FACTOR:<val>`| Update Scale Factor | Updates active conversion factor (e.g., `CAL:FACTOR:228.0`). |
| `CAL:FULL:<val>` | Update Full Weight | Sets mass corresponding to 100% full (e.g., `CAL:FULL:500.0`). |
| `CAL:EMPTY:<val>`| Update Tare Weight | Sets mass corresponding to 0% empty (e.g., `CAL:EMPTY:50.0`). |
| `PING` | Handshake Query | Requests device ID, pinout, and calibration metrics. |

---

## 8. Clinical AI Flow Rate & Osmotherapy Engine

The workstation includes an advanced clinical osmotherapy prediction model implemented in [`frontend/app.js`](file:///f:/PROJECT/IV_version2/frontend/app.js).

### Hemodynamic State Classification
The engine ingests 4 primary clinical biometrics:
1. **Heart Rate (HR):** Normal (60–100 bpm), Tachycardia (>100 bpm), Bradycardia (<60 bpm).
2. **Blood Pressure (Systolic / Diastolic):** Hypertensive crisis (>140 mmHg systolic), Hypotensive (<90 mmHg systolic).
3. **Respiratory Rate (RR):** Tachypnea (>20 bpm), Bradypnea (<12 bpm).
4. **Fluid Osmolarity / Type:** 0.9% Normal Saline (Isotonic), 5% Dextrose (Hypotonic in vivo), Ringer's Lactate (Balanced Crystalloid), 3% Hypertonic Saline, 20% Mannitol (Osmotic Diuretic).

```
   Biometrics Ingestion
   (HR, SBP, DBP, RR)
           │
           ▼
┌───────────────────────┐     Severe Hypotension / Shock      ┌────────────────────────────────┐
│ Hemodynamic Screening ├────────────────────────────────────►│ Rapid Bolus Protocol           │
└──────────┬────────────┘                                     │ (175–250 mL/hr | 58–83 gtt/min)│
           │                                                  └────────────────────────────────┘
           │ Hypertensive / Hypervolemic Risk
           ├─────────────────────────────────────────────────►┌────────────────────────────────┐
           │                                                  │ Restricted Infusion Rate       │
           │ Normal Hemodynamic State                         │ (50–75 mL/hr | 17–25 gtt/min)  │
           ▼                                                  └────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Standard Osmotherapy Maintenance Protocol                   │
│ (100–125 mL/hr | 33–42 gtt/min calibrated to drop factor)   │
└─────────────────────────────────────────────────────────────┘
```

### Flow Rate Calculation Formula
$$\text{Calculated Drip Rate (gtt/min)} = \frac{\text{Flow Rate (mL/hr)} \times \text{Drop Factor (gtt/mL)}}{60}$$
- **Standard Macrodrip Set:** 20 drops/mL.
- **Pediatric Microdrip Set:** 60 drops/mL.
- **Blood Administration Set:** 10–15 drops/mL.

### Interactive One-Touch Prescription Sync
Clicking **`[ ✓ Apply Rate to Infusion Notes ]`**:
1. Formats the prescription string:  
   `[AI PRESCRIBED RATE]: 125 mL/hr (42 gtt/min) | Vitals: HR 76 bpm, BP 120/80 mmHg | Status: STABLE EUVOLEMIC`
2. Automatically updates the clinical notes field without overwriting custom nurse remarks.
3. Provides instantaneous visual feedback on the button (`✓ Applied to Infusion Notes!` in glowing emerald green).

---

## 9. Web Telemetry Workstation (`frontend/`)

Built without heavy JavaScript frameworks, the workstation provides microsecond-level UI responsiveness and zero bundle compilation overhead:

- **[`index.html`](file:///f:/PROJECT/IV_version2/index.html):** Semantic, accessible HTML5 layout featuring unique IDs for automated testability and responsive medical telemetry cockpits.
- **[`style.css`](file:///f:/PROJECT/IV_version2/style.css):** Tailored medical design system with over 3,000 lines of CSS. Includes custom glassmorphic cards, glowing status pills, responsive CSS grids, keyframe-animated telemetry beacons, and an official `@media print` layout.
- **[`app.js`](file:///f:/PROJECT/IV_version2/app.js):** Complete event-driven application state controller managing Web Serial communication, fluid physics calculations, AI prediction updates, modal lifecycle, and doctor report formatting.

---

## 10. Official Doctor's Clinical Report & PDF Audit

When an infusion trip completes (or upon clicking **`Complete Trip & Doctor Report`**), the system compiles an official **Infusion Clinical Summary Report Modal**:

### Included Clinical Metrics
- **Hospital & Ward Identification:** Clinic Name, Bed/Room, Assigned Nurse Name, Attending Physician.
- **Patient Biometrics:** Age, Gender, Baseline Blood Pressure, Heart Rate, Respiratory Rate.
- **Infusion Chronometry:** Start Timestamp, Completion Timestamp, Total Elapsed Duration (`HH:MM:SS`).
- **Dosage Audit:** Solution Type, Prescribed Volume, Administered Volume, Final Residual Fluid.
- **Telemetry Event Log:** Exact timestamps of all milestone acoustic alerts and critical threshold events.
- **Physician Legal Signatures:** Designated signature lines for Licensed Medical Practitioner and Verification RN.

### Print & PDF Export
Clicking **`Print / Save to PDF`** invokes the specialized print engine:
- Strips dark backgrounds and neon borders.
- Re-renders the document into high-contrast monochrome medical typography with formal borders.
- Formats perfectly onto standard **A4 / US Letter** physical paper or digital PDF for hospital EHR filing.

---

## 11. Step-by-Step Installation & Setup

### Prerequisites
- **Hardware:** Arduino Uno / Nano, HX711, 10kg Load Cell, 16x2 I2C LCD, 5V Buzzer, 2 push-buttons.
- **Software:** Arduino IDE (v1.8.x or v2.x), Google Chrome or Microsoft Edge (Web Serial compatible).
- **Arduino Libraries Required:**
  1. `HX711` by Bogdan Necula (Install via Arduino Library Manager).
  2. `LiquidCrystal_I2C` by Frank de Brabander (Install via Arduino Library Manager).
  3. `Wire` (Built into Arduino AVR core).

---

### Step 1: Flash Firmware to Arduino
1. Connect your Arduino board to your computer via USB.
2. Open [`sketch_jan13a.ino`](file:///f:/PROJECT/IV_version2/sketch_jan13a.ino) in Arduino IDE.
3. Select your board (**Tools > Board > Arduino Uno** or **Arduino Nano**).
4. Select your COM Port (**Tools > Port**).
5. Click **Upload**.
6. The buzzer will emit a power-on self-test chirp, and the LCD will display `IV SENTRY PRO D3 / STANDBY (READY)`.

---

### Step 2: Launch the Web Telemetry Workstation

#### Option A: Direct Local Python Server (Recommended)
Open a terminal in the project directory and run:
```powershell
python -m http.server 5500 --directory frontend
```
Navigate to: **`http://localhost:5500/`**

#### Option B: Standalone Node.js Server
```powershell
npm install
npm start
```
Navigate to: **`http://localhost:3000/`**

---

### Step 3: Connect Hardware via Web Serial
1. On the web workstation, click the blue **`Connect Unit 1`** button in the top-right header.
2. A browser permission dialog will appear listing available USB serial devices.
3. Select your Arduino COM port (e.g., `USB-SERIAL CH340` or `Arduino Uno`) and click **Connect**.
4. The status pill will immediately switch from `Offline` to glowing green `Online (COMx)`, and live telemetry readings will begin updating.

---

## 12. Calibration & Zero-Tare Procedure

Accurate gravimetric measurements require setting the baseline zero-point and transducer scale factor:

### Method 1: Automatic Zero-Tare from Web UI
1. Ensure the IV suspension hook is completely empty (no bag attached).
2. Click the **`Settings & Calibration`** button in the header bar.
3. Click the **`Auto-Tare Transducer (Zero Scale)`** button.
4. The system transmits `CAL:MODE:START`, automatically zeroes the offset, and confirms with `CAL:AUTO_ZERO_OK`.

### Method 2: Scale Calibration Factor Adjustment
1. Place a known calibration weight on the hook (e.g., a 500g precision test weight or calibrated 500 mL water container).
2. If the displayed weight differs from 500g:
   - Compute new factor:  
     $$\text{New Factor} = \text{Current Factor} \times \left(\frac{\text{Displayed Weight}}{\text{Actual Weight}}\right)$$
   - Enter the calculated factor into the **Scale Calibration Factor** field and click **`Apply Calibration Factor`**.
3. Set the **Full Reservoir Weight (g)** (typically 500.0g) and **Empty Bottle Tare Weight (g)** (typically 50.0g).
4. Click **`Save & Exit Calibration`**. Parameters persist in active RAM and microcontroller memory.

---

## 13. Deployment on Render

The repository is pre-configured for deployment as either a **Static Site** or a **Web Service** on Render.

### Asset Mirroring Architecture
To prevent 404 errors caused by varying Publish Directory settings on Render, all assets exist in both:
- `./` (Root directory: `index.html`, `style.css`, `app.js`)
- `./frontend/` (Subdirectory: `index.html`, `style.css`, `app.js`)

### Deploy as a Static Site (Free & Fast)
1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Deploy IV Sentry Pro Telemetry Workstation"
   git push origin main
   ```
2. Log into [Render.com](https://render.com/) and click **New > Static Site**.
3. Connect your GitHub repository.
4. Configure build settings:
   - **Name:** `iv-sentry-pro`
   - **Branch:** `main`
   - **Build Command:** *(Leave empty)*
   - **Publish Directory:** `frontend` *(or `.` — both work identically)*
5. Click **Create Static Site**.

### Deploy as a Web Service (Node.js Fallback)
If deployed as a Web Service:
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- `server.js` serves static files with strict MIME types and port binding (`process.env.PORT || 3000`).

*(Note: Web Serial API requires HTTPS in production, which Render provides automatically with free SSL certificates).*

---

## 14. Troubleshooting & Diagnostics

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| **Weight shows negative values** | Load cell signal leads reversed | Swap Green (`A+`) and White (`A-`) wires on the HX711 board. |
| **Transducer offline warning in Serial** | Disconnected DOUT or SCK lines | Check DOUT -> Pin D6 and SCK -> Pin D7. Ensure HX711 VCC receives a stable 5V. |
| **Browser says "No compatible device found"** | Missing CH340 / FTDI drivers | Install the appropriate USB-UART driver for your Arduino clone. |
| **Web Serial prompt does not open** | Non-Chromium browser or insecure HTTP | Use Google Chrome, Brave, or MS Edge. Ensure localhost or HTTPS is used. |
| **Buzzer does not sound at thresholds** | Pin mismatch or wrong buzzer type | Verify buzzer positive lead is on **Pin D3**. Ensure buzzer is 5V-rated. |
| **Timer continues running after pressing Stop** | Firmware version mismatch | Ensure [`sketch_jan13a.ino`](file:///f:/PROJECT/IV_version2/sketch_jan13a.ino) v2.5 is flashed; it halts timer in `CMD:STOP`. |
| **LCD display shows black boxes** | Incorrect I2C address or contrast | Rotate contrast potentiometer on back of I2C module. Confirm address is `0x27` (or change to `0x3F`). |

---

## 15. Repository Structure

```
f:\PROJECT\IV_version2/
├── README.md                   # Complete master engineering documentation
├── index.html                  # Root Web Telemetry Workstation markup
├── style.css                   # Root Medical Design System & Print CSS
├── app.js                      # Root Telemetry stream parser & AI engine
├── package.json                # Node.js server descriptor & dependencies
├── server.js                   # Strict-MIME local/production Node static server
├── render.yaml                 # Render static blueprint configuration
├── sketch_jan13a.ino           # Arduino firmware (ATmega328P + HX711 + Pin D3 Buzzer)
│
├── frontend/                   # Mirrored assets for Render 'frontend' publish directory
│   ├── index.html              # Telemetry workstation UI
│   ├── style.css               # Medical styling & dark/light theme
│   └── app.js                  # Web Serial communication & AI calculation
│
├── sketch_jan13a/              # Arduino IDE project directory
│   └── sketch_jan13a.ino       # Firmware copy for IDE compilation
│
├── hx711_calibration_test/     # Diagnostic test sketches
│   └── hx711_calibration_test.ino # Dedicated load cell calibration sketch
│
└── log/                        # Timestamped audit and engineering change logs
    ├── 2026-09-07_21-35_fix_ai_widget_alignment.md
    ├── 2026-09-07_21-12_fix_render_css_hosting.md
    └── ... (chronological engineering change history)
```

---

## 16. Engineering Standards & Compliance Notes
- **Safety Fail-Safe:** Acoustic alarm on critical empty (<10%) operates autonomously on the microcontroller; it does not rely on browser connectivity. If the computer disconnects or loses power, the Arduino will still alarm locally on Pin D3 and display alerts on the I2C LCD.
- **Precision Chronometer:** Millisecond timer precision calibrated against system crystal oscillator to prevent clock drift during multi-hour saline infusions.
- **Medical UI Hygiene:** Dark theme designed with low blue light intensity (`#060b13` baseline) to maintain patient comfort in darkened hospital rooms during nocturnal infusion monitoring.

---

**IV SENTRY PRO™** — Developed for precision infusion telemetrics and patient safety.
