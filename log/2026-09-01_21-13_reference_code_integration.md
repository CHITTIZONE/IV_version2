# Change Log — Integration of User Reference Architecture & HX711 Diagnostic

**Timestamp:** 2026-09-01 21:13:04 (IST)  
**System:** IV SENTRY PRO™ Infusion Telemetry & Load Cell System  
**Hardware Interface:** HX711 (DOUT=D6, SCK=D7), Buttons (D12, D11), Relays (D2, D3, D4, D5), LCD (I2C 0x27)

---

## Changes Implemented

### 1. Direct Integration of Reference Architecture
- Integrated the user's reference sketch logic with `HX711 scale3`, `START` (D12), `STOP` (D11), `RELAY_1..4` (D2, D3, D4, D5), and `LiquidCrystal_I2C lcd(0x27, 16, 2)`.
- Added **Raw ADC live readouts** (`scale3.read()`) to diagnose wire connectivity and physical load cell pressure response in real-time.
- Synchronized code across both [`sketch_jan13a/sketch_jan13a.ino`](file:///f:/PROJECT/IV_version2/sketch_jan13a/sketch_jan13a.ino) and [`sketch_jan13a.ino`](file:///f:/PROJECT/IV_version2/sketch_jan13a.ino).

### 2. Dual Serial Stream (Monitor & Web UI)
- Emits human-readable lines for Arduino Serial Monitor:
  `>> Weight: 500.0 g | Level: 100% | Raw ADC: 8450120 | Time: 00:01:23`
- Emits structured telemetry packets for Web Serial UI:
  `WEIGHT:500.0`, `LEVEL:100`, `TIME:00:01:23`, `STATUS:RUNNING`
