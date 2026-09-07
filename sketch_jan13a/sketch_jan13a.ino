// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   IV SENTRY PRO™ — 10KG LOAD CELL INFUSION TELEMETRY FIRMWARE           ║
// ║   Hardware: Arduino Uno / Nano + HX711 + Pin D3 Buzzer + I2C LCD         ║
// ║   Version:  2.5 (Precision Chronometer Timer Stop & Complete Sync)      ║
// ║                                                                          ║
// ║   PIN CONNECTIONS:                                                       ║
// ║     • HX711 Load Cell:   DOUT -> Pin D6, SCK -> Pin D7 (VCC 5V, GND)    ║
// ║     • Clinical Buzzer:   Positive (+) -> Pin D3 (GND -> GND)            ║
// ║     • Physical Buttons:  START -> Pin D12 (INPUT_PULLUP to GND)          ║
// ║                          STOP  -> Pin D11 (INPUT_PULLUP to GND)          ║
// ║     • 16x2 I2C LCD:      SDA -> Pin A4, SCL -> Pin A5 (Addr: 0x27)       ║
// ║                                                                          ║
// ║   TELEMETRY PROTOCOL (9600 BAUD):                                        ║
// ║     Outbound: WEIGHT:<g>, LEVEL:<%>, TIME:<hh:mm:ss>, STATUS:<state>     ║
// ║               BUZZER:EVENT:<pct>:<beeps>, EVENT:INFUSION_COMPLETED       ║
// ║     Inbound:  CMD:START, CMD:STOP, CMD:COMPLETE, CMD:BUZZER:<1|5>        ║
// ║               CAL:MODE:START, CAL:MODE:EXIT, CAL:TARE, CAL:FACTOR:<val>  ║
// ║               CAL:FULL:<val>, CAL:EMPTY:<val>, PING                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define LOADCELL_DOUT_PIN  6
#define LOADCELL_SCK_PIN   7

#define BUZZER_PIN         3    // Dedicated Piezo Buzzer on Pin D3 (Relays Removed)

#define START_BUTTON_PIN   12   // Physical Push-Button (Active LOW / Internal Pullup)
#define STOP_BUTTON_PIN    11   // Physical Push-Button (Active LOW / Internal Pullup)

// ── Hardware Objects ──────────────────────────────────────────────────────────
HX711              scale3;
LiquidCrystal_I2C  lcd(0x27, 16, 2);

// ── Calibration & Fluid Envelope Parameters ───────────────────────────────────
// Nominal factor for 10kg load cell transducer (~220.0 to 235.0 for grams)
float calibrationFactor = 228.0f;  
float fullWeight        = 500.0f;   // Full Reservoir Mass (Grams)
float emptyWeight       = 50.0f;    // Tare Mass (Bottle Empty / Tare)
bool  calModeActive     = false;

// ── Infusion Session & Chronometer State ──────────────────────────────────────
unsigned long startTime     = 0;
unsigned long elapsedTime   = 0;
bool          timerRunning  = false;
int           hours = 0, minutes = 0, seconds = 0;
char          timeStr[10]   = "00:00:00";

// ── Buzzer Milestone Flags (Ordered: 90%, 75%, 65%, 50%, 35%, 25%, <10%) ─────
bool beep90                  = false;
bool beep75                  = false;
bool beep65                  = false;
bool beep50                  = false;
bool beep35                  = false;
bool beep25                  = false;
bool beepBelow10             = false;
bool sessionCompletedEmitted = false;

// Serial reception buffer
String rxBuf = "";

// ── Sound Generator (Pin D3 Acoustic Buzzer) ──────────────────────────────────
void beepBuzzer(int count, int freq, int onMs, int offMs) {
  for (int i = 0; i < count; i++) {
    tone(BUZZER_PIN, freq);
    delay(onMs);
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < count - 1) delay(offMs);
  }
  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);
}

void beepBuzzer(int count, int freq) {
  beepBuzzer(count, freq, 120, 90);
}

void beepBuzzer(int count) {
  beepBuzzer(count, 2400, 120, 90);
}

// Sound emergency acoustic alarm on Pin D3 for exactly 10 seconds, then silence completely
void beepAlarm10Seconds() {
  unsigned long startAlarm = millis();
  while (millis() - startAlarm < 10000) {
    tone(BUZZER_PIN, 2800);
    delay(250);
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
    delay(150);
  }
  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);
}

void resetBuzzerMilestones() {
  beep90                  = false;
  beep75                  = false;
  beep65                  = false;
  beep50                  = false;
  beep35                  = false;
  beep25                  = false;
  beepBelow10             = false;
  sessionCompletedEmitted = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  Serial.println(F("\n=============================================="));
  Serial.println(F("   IV SENTRY PRO™ — TELEMETRY CONTROLLER       "));
  Serial.println(F("   PURE D3 BUZZER ARCHITECTURE (RELAYS REMOVED)"));
  Serial.println(F("=============================================="));

  // Initialize I2C LCD Display
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print(F("IV SENTRY PRO™  "));
  lcd.setCursor(0, 1); lcd.print(F("INITIALIZING... "));
  delay(800);

  // Initialize Pin Modes
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STOP_BUTTON_PIN,  INPUT_PULLUP);
  pinMode(BUZZER_PIN,       OUTPUT);
  digitalWrite(BUZZER_PIN,  LOW);

  // Power-on Self-Test Chirp (Confirms Pin D3 Buzzer is active)
  beepBuzzer(1, 2400, 80, 50);

  // Initialize HX711 Load Cell Transducer
  scale3.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  
  // Safe readiness check (works across all HX711 libraries)
  unsigned long waitStart = millis();
  while (!scale3.is_ready() && (millis() - waitStart < 2000)) {
    delay(10);
  }

  if (scale3.is_ready()) {
    scale3.set_scale(calibrationFactor);
    scale3.tare(); // Zero transducer baseline on startup
    Serial.println(F("[HX711] Transducer ready & auto-zeroed to 0.0g baseline."));
  } else {
    Serial.println(F("[WARNING] HX711 transducer offline. Verify DOUT->D6, SCK->D7."));
  }

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("IV SENTRY PRO D3"));
  lcd.setCursor(0, 1); lcd.print(F("STANDBY (READY) "));
  delay(800);

  // Initial Telemetry Handshake Payload
  Serial.println(F("PONG:IVMU_1_PRO"));
  Serial.print(F("CAL_FULL:"));   Serial.println(fullWeight, 1);
  Serial.print(F("CAL_EMPTY:"));  Serial.println(emptyWeight, 1);
  Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
  Serial.println(F("BUZZER_PIN:D3"));
  Serial.println(F("STATUS:IDLE"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Handler (Processes Web Serial & Terminal Instructions)
// ─────────────────────────────────────────────────────────────────────────────
void processCommand(String cmd) {
  cmd.trim();

  // START INFUSION SESSION
  if (cmd == F("CMD:START") || cmd == F("START")) {
    if (!timerRunning) {
      if (sessionCompletedEmitted) {
        // If restarting after a completed session, reset timer from 0
        elapsedTime = 0;
        sessionCompletedEmitted = false;
        resetBuzzerMilestones();
      }
      timerRunning = true;
      startTime    = millis() - elapsedTime; // Resume cleanly from accumulated time if paused
      Serial.println(F("STATUS:RUNNING"));
      Serial.println(F(">>> Infusion Started. D3 Buzzer tracking armed."));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("INFUSION ACTIVE "));
      lcd.setCursor(0, 1); lcd.print(F("SESSION RUNNING "));
      beepBuzzer(1, 2600, 120, 60);
    }
  }
  // STOP / PAUSE INFUSION SESSION — HALTS TIMER IMMEDIATELY
  else if (cmd == F("CMD:STOP") || cmd == F("STOP")) {
    if (timerRunning) {
      elapsedTime  = millis() - startTime; // Lock elapsed time permanently
      timerRunning = false;                // TIMER STOPS
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("STATUS:STOPPED"));
      Serial.println(F(">>> Infusion Paused / Stopped. Timer halted."));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("INFUSION PAUSED "));
      lcd.setCursor(0, 1); lcd.print(F("STOPPED / HOLD  "));
    }
  }
  // COMPLETE INFUSION SESSION — LOCKS FINAL TIME & SILENCES ALL ALARMS
  else if (cmd == F("CMD:COMPLETE") || cmd == F("COMPLETE")) {
    if (!sessionCompletedEmitted || timerRunning) {
      if (timerRunning) {
        elapsedTime = millis() - startTime; // Lock final duration
      }
      timerRunning = false;                 // TIMER STOPS
      sessionCompletedEmitted = true;
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("EVENT:INFUSION_COMPLETED"));
      Serial.println(F("STATUS:COMPLETED"));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("TRIP COMPLETED! "));
      lcd.setCursor(0, 1); lcd.print(F("REPORT AUDIT OK "));
      beepBuzzer(3, 2600, 150, 100);
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
    } else {
      // Already completed — acknowledge status without re-triggering buzzer or event loop
      Serial.println(F("STATUS:COMPLETED"));
    }
  }
  // AUTO-CALIBRATION: AUTOMATIC ZERO TARE
  else if (cmd == F("CAL:MODE:START") || cmd == F("CAL:AUTO")) {
    calModeActive = true;
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
    scale3.tare(); // Auto-zero baseline
    Serial.println(F("CAL_MODE:ACTIVE"));
    Serial.println(F("CAL:TARED"));
    Serial.println(F("CAL:AUTO_ZERO_OK"));
    Serial.println(F(">>> Auto-Calibration started: Transducer auto-tared to 0.0g"));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("AUTO CALIBRATION"));
    lcd.setCursor(0, 1); lcd.print(F("AUTO-ZERO: 0.0g "));
    beepBuzzer(1, 2000, 80, 50);
  }
  // EXIT CALIBRATION MODE
  else if (cmd == F("CAL:MODE:EXIT")) {
    calModeActive = false;
    Serial.println(F("CAL_MODE:INACTIVE"));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("CALIBRATION OK  "));
    lcd.setCursor(0, 1); lcd.print(F("STANDBY MODE    "));
    delay(400);
  }
  // MANUAL ZERO TARE
  else if (cmd == F("CAL:TARE") || cmd == F("TARE") || cmd == F("t") || cmd == F("T")) {
    scale3.tare();
    Serial.println(F("CAL:TARED"));
    Serial.println(F(">>> Scale Zeroed (Tare OK)"));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("ZERO TARE OK    "));
    lcd.setCursor(0, 1); lcd.print(F("WT: 0.0 g       "));
    beepBuzzer(1, 2200, 80, 50);
    delay(400);
  }
  // UPDATE CALIBRATION FACTOR
  else if (cmd.startsWith(F("CAL:FACTOR:"))) {
    calibrationFactor = cmd.substring(11).toFloat();
    if (calibrationFactor != 0) scale3.set_scale(calibrationFactor);
    Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
  }
  // UPDATE FULL RESERVOIR MASS
  else if (cmd.startsWith(F("CAL:FULL:"))) {
    fullWeight = cmd.substring(9).toFloat();
    Serial.print(F("CAL_FULL:")); Serial.println(fullWeight, 1);
  }
  // UPDATE EMPTY TARE MASS
  else if (cmd.startsWith(F("CAL:EMPTY:"))) {
    emptyWeight = cmd.substring(10).toFloat();
    Serial.print(F("CAL_EMPTY:")); Serial.println(emptyWeight, 1);
  }
  // MANUAL BUZZER TEST: 1 BEEP
  else if (cmd == F("CMD:BUZZER:1")) {
    beepBuzzer(1, 2400, 150, 80);
    Serial.println(F("BUZZER:TEST:1_OK"));
  }
  // MANUAL BUZZER TEST: 5 BEEPS
  else if (cmd == F("CMD:BUZZER:5")) {
    beepBuzzer(5, 2800, 100, 90);
    Serial.println(F("BUZZER:TEST:5_OK"));
  }
  // HANDSHAKE PING
  else if (cmd == F("PING")) {
    Serial.println(F("PONG:IVMU_1_PRO"));
    Serial.print(F("CAL_FULL:"));   Serial.println(fullWeight, 1);
    Serial.print(F("CAL_EMPTY:"));  Serial.println(emptyWeight, 1);
    Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
    Serial.println(F("BUZZER_PIN:D3"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────────────────────────────────────
void loop() {

  // ── 1. Ingest Incoming Serial Stream ───────────────────────────────────────
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      processCommand(rxBuf);
      rxBuf = "";
    } else if (c != '\r') {
      rxBuf += c;
    }
  }

  // ── 2. Read Transducer Weight from HX711 ──────────────────────────────────
  float weight = 0.0f;
  if (scale3.is_ready()) {
    weight = scale3.get_units(3); // 3-sample average for rock-solid stability
  } else {
    weight = scale3.get_units(1); // Fast fallback
  }

  // ── 3. Calculate IV Volume Percentage (0% to 100%) ─────────────────────────
  float range = fullWeight - emptyWeight;
  if (range < 1.0f) range = 1.0f;
  int ivLevel = (int)(((weight - emptyWeight) / range) * 100.0f);
  ivLevel = constrain(ivLevel, 0, 100);

  // ── 4. Chronometer Update (Frozen when stopped or completed) ───────────────
  if (timerRunning) {
    elapsedTime = millis() - startTime;
  }
  hours   = (elapsedTime / 3600000UL) % 24;
  minutes = (elapsedTime / 60000UL)   % 60;
  seconds = (elapsedTime / 1000UL)    % 60;
  snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", hours, minutes, seconds);

  // ── 5. Push Real-Time Telemetry Stream to Web Serial API ───────────────────
  Serial.print(F("WEIGHT:")); Serial.println(weight, 1);
  Serial.print(F("LEVEL:"));  Serial.println(ivLevel);
  Serial.print(F("TIME:"));   Serial.println(timeStr);
  Serial.print(F("STATUS:")); Serial.println(timerRunning ? F("RUNNING") : (calModeActive ? F("CAL_MODE") : (sessionCompletedEmitted ? F("COMPLETED") : F("IDLE"))));

  // ── 6. Check Hardware Push-Buttons (D12 = START, D11 = STOP) ───────────────
  // START BUTTON (Pin D12)
  static bool lastStartBtn = HIGH;
  bool curStart = digitalRead(START_BUTTON_PIN);
  if (lastStartBtn == HIGH && curStart == LOW) {
    processCommand(F("CMD:START"));
  }
  lastStartBtn = curStart;

  // STOP BUTTON (Pin D11) — HALTS TIMER IMMEDIATELY
  static bool lastStopBtn = HIGH;
  bool curStop = digitalRead(STOP_BUTTON_PIN);
  if (lastStopBtn == HIGH && curStop == LOW) {
    processCommand(F("CMD:STOP"));
  }
  lastStopBtn = curStop;

  // ── 7. D3 Buzzer Milestone Acoustic Alerts (Descending Order) ──────────────
  if (timerRunning && !calModeActive) {

    // 90% Milestone: 1 Beep (2400 Hz)
    if (ivLevel <= 90 && !beep90) {
      beep90 = true;
      Serial.println(F("BUZZER:EVENT:90:1"));
      beepBuzzer(1, 2400, 150, 80);
    }
    // 75% Milestone: 1 Beep (2400 Hz)
    if (ivLevel <= 75 && !beep75) {
      beep75 = true;
      Serial.println(F("BUZZER:EVENT:75:1"));
      beepBuzzer(1, 2400, 150, 80);
    }
    // 65% Milestone: 1 Beep (2400 Hz)
    if (ivLevel <= 65 && !beep65) {
      beep65 = true;
      Serial.println(F("BUZZER:EVENT:65:1"));
      beepBuzzer(1, 2400, 150, 80);
    }
    // 50% Milestone: 1 Beep (2400 Hz)
    if (ivLevel <= 50 && !beep50) {
      beep50 = true;
      Serial.println(F("BUZZER:EVENT:50:1"));
      beepBuzzer(1, 2400, 150, 80);
    }
    // 35% Milestone: 1 Beep (2500 Hz)
    if (ivLevel <= 35 && !beep35) {
      beep35 = true;
      Serial.println(F("BUZZER:EVENT:35:1"));
      beepBuzzer(1, 2500, 150, 80);
    }
    // 25% Milestone: 1 Beep (2600 Hz)
    if (ivLevel <= 25 && !beep25) {
      beep25 = true;
      Serial.println(F("BUZZER:EVENT:25:1"));
      beepBuzzer(1, 2600, 150, 80);
    }
    // Critical Milestone (< 10%): Stop timer, sound 5-second buzzer alarm, emit critical event & complete session
    if (ivLevel < 10 && !beepBelow10) {
      beepBelow10 = true;
      sessionCompletedEmitted = true;
      if (timerRunning) {
        elapsedTime = millis() - startTime;
        timerRunning = false; // STOP TIMER IMMEDIATELY
      }
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);

      Serial.println(F("EVENT:CRITICAL_EMPTY"));
      Serial.println(F("BUZZER:EVENT:10:10SEC"));
      Serial.println(F("EVENT:INFUSION_COMPLETED"));
      Serial.println(F("STATUS:COMPLETED"));

      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("CRITICAL <10%!  "));
      lcd.setCursor(0, 1); lcd.print(F("TIMER STOPPED   "));

      beepAlarm10Seconds();

      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
    }

    // Automatic Trip Completion (Fluid Level 0% or weight <= empty tare)
    if (ivLevel <= 0 && !sessionCompletedEmitted) {
      sessionCompletedEmitted = true;
      if (timerRunning) {
        elapsedTime = millis() - startTime; // Lock final duration
        timerRunning = false;               // STOP TIMER IMMEDIATELY
      }
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("EVENT:INFUSION_COMPLETED"));
      Serial.println(F("STATUS:COMPLETED"));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("TRIP COMPLETED! "));
      lcd.setCursor(0, 1); lcd.print(F("DOCTOR REPORT OK"));
      beepBuzzer(3, 2600, 150, 100);
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
    }
  }

  // ── 8. I2C LCD Display Real-Time Refresh (Fixed 16-Char Rows) ───────────────
  char line0[17];
  char line1[17];

  if (calModeActive) {
    snprintf(line0, sizeof(line0), "CALIBRATION MODE");
    int wtInt = (int)weight;
    int wtDec = abs((int)(weight * 10.0f)) % 10;
    snprintf(line1, sizeof(line1), "WT: %4d.%1d g    ", wtInt, wtDec);
  } else if (sessionCompletedEmitted || beepBelow10) {
    snprintf(line0, sizeof(line0), "TIME: %-10s", timeStr);
    snprintf(line1, sizeof(line1), "STOP %3d%% W:%4dg", ivLevel, (int)weight);
  } else {
    // Line 1: TIME (e.g., "TIME: 00:01:23  ")
    snprintf(line0, sizeof(line0), "TIME: %-10s", timeStr);

    // Line 2: ST/STP/RUN % W: g (e.g., "RUN  85% W: 425g" or "STOP 10% W:  50g")
    const char* tag = timerRunning ? (ivLevel < 10 ? "ALRT" : "RUN ") : "STOP";
    snprintf(line1, sizeof(line1), "%s %3d%% W:%4dg", tag, ivLevel, (int)weight);
  }

  lcd.setCursor(0, 0);
  lcd.print(line0);
  lcd.setCursor(0, 1);
  lcd.print(line1);

  delay(350); // Telemetry sampling cadence
}
