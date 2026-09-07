# Implementation Plan — Critical <10% Fluid Threshold, 5s Buzzer Alarm & Doctor Report Generation

**System:** IV SENTRY PRO™ Clinical Infusion Telemetry Workstation  
**Hardware Controller:** Arduino Uno / Nano + HX711 Load Cell + Pin D3 Acoustic Buzzer + 16x2 I2C LCD  
**Current Status:** Critical <10% Automation & Complete Doctor's Report (View & Download) Implementation  
**Last Updated:** 2026-09-07 23:45:00 (IST)

---

## 1. Problem Overview & Requirements
When the IV fluid level drops below 10% (`< 10%`):
1. **Stop the Timer Immediately**:
   - Hardware: Lock `elapsedTime = millis() - startTime` and set `timerRunning = false`.
   - Web App: Call `stopLocalTimer()` to halt the local stopwatch interval, freeze `#stat-time-center` and `#lbl-time` without drift.
2. **Sound Buzzer for Exactly 5 Seconds**:
   - Hardware: Execute `beepAlarm5Seconds()` (rapid 2800 Hz alert pulses for 5000ms), followed by `noTone(BUZZER_PIN); digitalWrite(BUZZER_PIN, LOW);` to ensure the buzzer completely silences after 5 seconds.
   - Web App: Synthesize 5 seconds of audio alert via Web Audio API (`playBuzzerBeeps(12, 2800, 250, 160)`).
3. **Place the Warning Popup**:
   - Display `#alarm-overlay` with critical alert messaging: "CRITICAL INFUSION ALERT — Saline reservoir below 10%! Infusion Halted & Doctor Report Generated."
   - Provide "View & Download Doctor's Report" action button + "Mute Alarm" button.
4. **Generate the Complete Report to User in View and Download Manner**:
   - Compile clinical vitals, patient demographics, infused saline volume (mL), residual volume, injection duration, actual flow rate, AI osmotherapy prescription, and D3 buzzer milestone audit table.
   - Open `#report-modal` so the user can immediately **VIEW** the complete official report on screen.
   - Provide multiple **DOWNLOAD** options:
     - **Print Doctor Report (A4 / PDF)** via `window.print()`.
     - **Download Report (.txt)** via `downloadDoctorReportText()`.
     - **Copy Summary** to clipboard.
5. **Fix LCD Garbage Characters & Infinite Serial Ping-Pong Loop**:
   - Format 16x2 LCD output with fixed 16-character padded buffers (`snprintf`) to eliminate corrupted trailing characters.
   - Guard `CMD:COMPLETE` and `completeInfusionSession()` with `sessionCompletedEmitted` and `state.tripCompleted` guards to prevent infinite serial ping-pong loops and continuous buzzer beeping.

---

## 2. Proposed Changes

### Component 1: Arduino Firmware (`sketch_jan13a.ino` & `sketch_jan13a/sketch_jan13a.ino`)
- **[MODIFY] `sketch_jan13a.ino`**:
  - Add `beepAlarm5Seconds()` helper function: loops for 5000 ms with 2800 Hz tones and terminates with `noTone(BUZZER_PIN); digitalWrite(BUZZER_PIN, LOW);`.
  - Update `loop()`: When `ivLevel < 10 && !beepBelow10`, halt timer, emit `EVENT:CRITICAL_EMPTY`, `BUZZER:EVENT:10:5SEC`, `EVENT:INFUSION_COMPLETED`, and `STATUS:COMPLETED`, display `"CRITICAL <10%!  "` on LCD, and sound `beepAlarm5Seconds()`.
  - Guard `CMD:COMPLETE` so it only fires if `!sessionCompletedEmitted`.
  - Use padded `snprintf` 16-character buffers for all LCD rows.
- **[MODIFY] `sketch_jan13a/sketch_jan13a.ino`**: Mirror identical firmware code.

### Component 2: Frontend Telemetry & Report Logic (`frontend/app.js` & `app.js`)
- **[MODIFY] `frontend/app.js`**:
  - Update `LEVEL` telemetry handler: when `state.level < 10 && state.status === 'INFUSING'`, stop local timer, trigger alarm overlay, sound 5s Web Audio alert, and execute `completeInfusionSession(false)`.
  - Update `EVENT:CRITICAL_EMPTY` and `BUZZER:EVENT:10:5SEC` handlers to halt timer, trigger alarm UI, and prepare Doctor's Report.
  - Update `onSimulateWeightSlider(val)`: when tested below 10%, trigger timer stop, 5s alert, warning popup, and report compilation.
  - Implement and export `downloadDoctorReportText()` to global `window`.
  - Fix duration and timestamp handling in `completeInfusionSession()`.
- **[MODIFY] `app.js`**: Mirror identical logic and functions to maintain dual-root deployment integrity.

### Component 3: Workstation Layout & Styling (`style.css` & `frontend/style.css`)
- **[MODIFY] `frontend/style.css` & `style.css`**:
  - Style `.alarm-actions` with clean responsive button row.
  - Style `.btn-alarm-view-report` with medical cyan glow, clear icon, and prominent primary action styling.

---

## 3. Verification Plan

### Automated & Synthesized Tests
1. **Web Audio & 5-Second Sound**: Verify `playBuzzerBeeps(12, 2800, 250, 160)` plays for exactly ~5 seconds without hanging.
2. **Text Report Download**: Verify clicking `downloadDoctorReportText()` triggers browser download of `.txt` clinical audit file with patient name and MRN in filename.
3. **Print Report (PDF)**: Verify `printDoctorReport()` triggers the browser print dialog formatted for clean A4 hospital letterhead.

### Manual Verification in Browser (Port 5500)
1. Open active browser session at `http://localhost:5500/`.
2. Start an infusion session (click "Start Infusion").
3. Slide weight slider to below 10% (e.g., 50g / 5%).
4. Verify:
   - Chronometer timer stops immediately.
   - 5-second acoustic alert sounds.
   - Critical Warning Popup `#alarm-overlay` appears on screen.
   - Doctor's Report Modal `#report-modal` opens with complete session metrics.
   - "Download Report" button downloads `.txt` file.
   - "Print Doctor Report" opens PDF print dialog.
