# Change Log — LCD Live Weight Calibration Mode & Medical Theme Suite

**Timestamp:** 2026-09-01 20:14:38 (IST)  
**System:** IV Sentry Pro™ Clinical Infusion Telemetry Workstation  
**Device Subsystem:** IV Measurement Unit 1 (IVMU-01)

---

## Changes Implemented

### 1. Hardware LCD Live Weight Calibration Mode
- Updated Arduino firmware (`sketch_jan13a/sketch_jan13a.ino`):
  - Added dedicated calibration state (`calModeActive`).
  - Added serial commands `CAL:MODE:START` (and `CAL:MODE:ON`) and `CAL:MODE:EXIT` (and `CAL:MODE:OFF`).
  - When in Calibration Mode:
    - Row 0: `CALIBRATION MODE`
    - Row 1: `WT: <live weight> g` (continuous live reading on the physical 16×2 LCD for immediate operator visibility).
    - Actuator relays are automatically kept in a safe off state.
  - When user exits or saves calibration:
    - Firmware displays `CALIBRATION OK / SETTINGS SAVED` on the LCD and seamlessly returns to normal operational telemetry display (`IV: xx% HH:MM:SS / STP W: xxxg`).

### 2. UI Automatic LCD Calibration Synchronization
- In `frontend/app.js`:
  - When the user opens the Settings modal or clicks "Quick Calibrate", or selects the "Transducer Calibration" tab: the workstation automatically dispatches `CAL:MODE:START` to the hardware over serial.
  - Added a **"Save Calibration & Exit to Normal Telemetry Display"** action button in the calibration tab.
  - When the user clicks Save & Exit or closes the modal: the workstation automatically dispatches `CAL:MODE:EXIT` and returns the physical LCD to normal monitoring mode.

### 3. Medical Grid & ECG Pattern Background
- Added authentic medical background with subtle geometric grid and animated high-tech ECG telemetry waveform trace.
- Responsive to both Dark and Light clinical themes.

### 4. Clinical Dark Mode & Light Mode Suite
- Added theme switcher button in header bar (🌙 Dark / ☀️ Light).
- High-contrast clinical Light Mode featuring clean surgical whites, soft medical slate accents, and dark navy vitals.
- Theme preference persisted in `localStorage`.
