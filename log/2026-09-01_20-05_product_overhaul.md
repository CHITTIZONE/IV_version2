# Change Log — IV Sentry Pro Product Overhaul

**Timestamp:** 2026-09-01 20:05:30 (IST)  
**System:** IV Sentry Pro™ Clinical Infusion Telemetry Workstation  
**Device Subsystem:** IV Measurement Unit 1 (IVMU-01)

---

## Changes Implemented

### 1. Professional Product Branding & Identity
- Eliminated all microcontroller/hobby references (Arduino Nano, ATmega, DIY mentions).
- Re-branded system as **IV SENTRY PRO™ — Clinical Infusion Telemetry Workstation**.
- Branded device telemetry hardware as **IV Measurement Unit 1 (UNIT-01 / IVMU-01)**.
- Re-branded hardware output channels as **Actuator Line Channels 1 to 4** (automated multi-stage lines) instead of generic relays.

### 2. Streamlined Dashboard Architecture
- Replaced 3-column cluttered layout with a clean **2-column clinical workstation**:
  - **Left Column:** Patient Clinical Admission & Infusion Setup (Patient Full Name, Age/Gender, MRN/ID, Assigned Attender, Infusion Solution, Target Volume, Notes) and Session Controller (START INFUSION / PAUSE STOP).
  - **Right Column (Hero Station):** Continuous Infusion Telemetry featuring the interactive animated IV bag with wave physics, graduated volumetric marks, active drip animation, real-time Vitals Metric Cards (Transducer Mass g/kg, Volume Level %, Elapsed Duration, Estimated Volume mL), and 4 Actuator Line Channels.

### 3. Integrated Settings, Calibration & Diagnostics Suite (⚙️ Modal)
- Moved **Sensor Calibration**, **Serial Telemetry Terminal**, and **Clinical Event Logs** out of the main dashboard and into a dedicated, high-performance modal drawer accessible via the header ⚙️ button and quick-calibrate shortcuts.
  - **Tab 1: Transducer Calibration:** Live weight telemetry, One-touch Zero Tare, Full Bag Reference capture/manual entry, Empty Bag Reference capture/manual entry, Gain tuning factor.
  - **Tab 2: Telemetry Console:** Bidirectional raw packet terminal stream with custom command dispatcher.
  - **Tab 3: Clinical Event Logs:** Timestamped audit trail with log export capabilities.

### 4. Visual Excellence & Typography
- Loaded typography: **Plus Jakarta Sans** (clean modern UI), **Outfit** (headings), and **JetBrains Mono** (precision vitals).
- Deep medical slate theme with luminous cyan/sapphire accents, glassmorphic card layers, and smooth transitions.
- Clinical Alert Overlay with urgent pulsing ring, patient MRN info, and one-tap acknowledge & mute.

### 5. Firmware Re-Branding (`sketch_jan13a/sketch_jan13a.ino`)
- Updated LCD startup text to `IV MEASURE UNIT 1` / `SYSTEM READY`.
- Protocol handshake updated to `PONG:IVMU_1_PRO`.
- Maintained 100% backward/forward protocol compatibility at 9600 baud.
