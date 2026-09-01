# Smart IV Monitoring System — Change Log

## [2026-09-01 14:48] — Initial Full Implementation

### Summary
Complete build of the Smart IV Monitoring System (version 2.0).
50% Hardware (Arduino Nano) + 50% Software (Web Dashboard).

---

### Arduino Firmware (`sketch_jan13a.ino`)
- **UPDATED** — full rewrite with new structured serial protocol
- Added `WEIGHT:`, `LEVEL:`, `TIME:`, `STATUS:`, `ALARM:` serial output format
- Added `CMD:START`, `CMD:STOP`, `CMD:ACK_ALARM` command reception from PC
- Added `CAL:TARE`, `CAL:SET_FULL_NOW`, `CAL:SET_EMPTY_NOW`, `CAL:FULL:`, `CAL:EMPTY:`, `CAL:FACTOR:` calibration commands
- Fixed IV level logic: level % = (weight − emptyWeight) / (fullWeight − emptyWeight) × 100
- Relay 1 = 75–100%, Relay 2 = 50–75%, Relay 3 = 25–50%, Relay 4 = 0–25% (warning)
- ALARM triggers at ≤5% (blink LCD + optional D8 buzzer), warning log at ≤20%
- Physical buttons (D12=START, D11=STOP) and serial commands both work
- Added `PING` / `PONG:SMART_IV_V2` handshake for firmware detection
- Broadcasts calibration values on startup so UI can sync immediately
- Telemetry at 2 Hz (500ms loop)
- Buzzer on D8 (optional — leave unconnected if not used)

### Frontend (`frontend/`)
**NEW FILES CREATED:**
- `frontend/index.html` — Dashboard layout
- `frontend/style.css` — Premium dark medical UI (Inter + JetBrains Mono fonts)
- `frontend/app.js` — Web Serial API logic

**Features:**
- Plug-and-play: Open HTML → click Connect → pick COM port → works on any machine
- Patient info form: Name, Age, Patient ID, Attender Name, Saline Type, Volume, Notes
- Calibration panel: Live weight reading, "Set as FULL / EMPTY" from live reading, manual entry, calibration factor — all synced in real-time with the Nano
- localStorage persistence: calibration values survive browser refresh
- Animated SVG IV bag: fluid level animates, color shifts green→yellow→red as level drops
- Level progress bar, relay status indicators, elapsed time
- Session summary card shows patient info during active session
- ALARM overlay: flashing red modal + Web Audio API beep when IV empty
- Acknowledge alarm → sends `CMD:ACK_ALARM` to Nano to silence buzzer
- Serial console (debug): raw line viewer + manual command input
- Event log: timestamped session events
- Validation: patient name + ID required before START

### Logs (`log/`)
- **CREATED** `log/` folder
- **CREATED** `log/2026-09-01_14-48_initial_implementation.md` (this file)

---

### Files Changed
| File | Action |
|------|--------|
| `sketch_jan13a.ino` | MODIFIED |
| `frontend/index.html` | NEW |
| `frontend/style.css` | NEW |
| `frontend/app.js` | NEW |
| `log/2026-09-01_14-48_initial_implementation.md` | NEW |
