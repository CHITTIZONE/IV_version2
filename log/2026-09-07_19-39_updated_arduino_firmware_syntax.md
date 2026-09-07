# Firmware Update — Universal Arduino Telemetry & D3 Buzzer Syntax

**Timestamp:** 2026-09-07 19:39:00 (IST)  
**System:** IV SENTRY PRO™ Clinical Infusion Telemetry Workstation  
**Component:** Arduino Firmware (`sketch_jan13a.ino` and `sketch_jan13a/sketch_jan13a.ino`)

---

## 1. Action Overview
User requested: *"give me the updated arduino code for the updated syntax"*.

Upgraded and synchronized both firmware files with the latest syntax standards:
1. **Relays & Channels Cleaned**:
   - Total removal of relay pins (2, 4, 5, 8) and channel labels (CH-1..4).
   - Dedicated audio alerting exclusively to Pin D3.
2. **Universal HX711 Library Compatibility**:
   - Replaced library-specific blocking calls with a robust non-blocking polling timeout loop that functions seamlessly across all HX711 library variants.
3. **Overloaded `beepBuzzer` Syntax**:
   - Converted single function with default arguments to overloaded C++ signatures (`beepBuzzer(count, freq, onMs, offMs)`, `beepBuzzer(count, freq)`, `beepBuzzer(count)`) preventing compiler ambiguity across diverse Arduino AVR toolchains.
4. **Telemetry & Calibration Protocol Alignment**:
   - Aligned auto-zero calibration (`CAL:MODE:START` -> `CAL:AUTO_ZERO_OK`, `CAL:TARED`), live tare (`CAL:TARE`), and parameter adjustments.
   - Synchronized telemetry emissions (`WEIGHT:`, `LEVEL:`, `TIME:`, `STATUS:`, `BUZZER:EVENT:`, `EVENT:INFUSION_COMPLETED`).

---

## 2. Updated Files
- **[sketch_jan13a.ino](file:///f:/PROJECT/IV_version2/sketch_jan13a.ino)**
- **[sketch_jan13a/sketch_jan13a.ino](file:///f:/PROJECT/IV_version2/sketch_jan13a/sketch_jan13a.ino)**
