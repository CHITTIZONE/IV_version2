// ╔══════════════════════════════════════════════════════════════════════════╗
// ║      SMART IV INFUSION & 10KG LOAD CELL TELEMETRY CONTROLLER             ║
// ║      Pin Connections:                                                    ║
// ║        HX711: DOUT -> D6, SCK -> D7 (VCC -> 5V, GND -> GND)              ║
// ║        Buttons: START -> D12 (INPUT_PULLUP), STOP -> D11 (INPUT_PULLUP)  ║
// ║        Relays:  R1 -> D2, R2 -> D3, R3 -> D4, R4 -> D5                   ║
// ║        LCD:     I2C 0x27 (SDA -> A4, SCL -> A5)                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define LOADCELL_DOUT_PIN  6
#define LOADCELL_SCK_PIN   7

#define START_BUTTON_PIN   12
#define STOP_BUTTON_PIN    11

#define RELAY_1_PIN        2   // 100%–75% stage
#define RELAY_2_PIN        3   // 75%–50% stage
#define RELAY_3_PIN        4   // 50%–25% stage
#define RELAY_4_PIN        5   // Low reserve warning stage

// ── Hardware Objects ──────────────────────────────────────────────────────────
HX711              scale3;
LiquidCrystal_I2C  lcd(0x27, 16, 2);

// ── Calibration & Baselines ───────────────────────────────────────────────────
// For 10kg load cell: ~228.0 (for grams output) or 228000.0 (for kg output)
float calibrationFactor = 228.0f;  
float fullWeight        = 500.0f;   // Grams (or kg equivalent)
float emptyWeight       = 50.0f;
bool  calModeActive     = false;

// ── Timer & Session State ─────────────────────────────────────────────────────
unsigned long startTime     = 0;
unsigned long elapsedTime   = 0;
bool          timerRunning  = false;
int           hours = 0, minutes = 0, seconds = 0;
char          timeStr[10]   = "00:00:00";

// Serial input buffer
String rxBuf = "";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  Serial.println(F("\n=============================================="));
  Serial.println(F("   SMART IV 10KG LOAD CELL SYSTEM STARTING   "));
  Serial.println(F("=============================================="));

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print(F("SMART IV SYSTEM "));
  lcd.setCursor(0, 1); lcd.print(F("INITIALIZING... "));
  delay(1500);

  // Initialize Pin Modes
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STOP_BUTTON_PIN,  INPUT_PULLUP);
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(RELAY_3_PIN, OUTPUT);
  pinMode(RELAY_4_PIN, OUTPUT);

  // All relays OFF initially
  digitalWrite(RELAY_1_PIN, LOW);
  digitalWrite(RELAY_2_PIN, LOW);
  digitalWrite(RELAY_3_PIN, LOW);
  digitalWrite(RELAY_4_PIN, LOW);

  // Initialize HX711 Load Cell
  scale3.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  
  if (scale3.wait_ready_timeout(1500)) {
    scale3.set_scale(calibrationFactor);
    scale3.tare(); // Zero scale on start
    Serial.println(F("[HX711] Load cell initialized and zeroed."));
  } else {
    Serial.println(F("[WARNING] HX711 not ready! Check DOUT->D6, SCK->D7 wires."));
  }

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("IV MEASURE UNIT1"));
  lcd.setCursor(0, 1); lcd.print(F("STANDBY (D12/UI)"));
  delay(1200);

  // Ready Handshake for UI & Monitor
  Serial.println(F("PONG:IVMU_1_PRO"));
  Serial.println(F("STATUS:IDLE"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Handler (Web UI + Serial Monitor commands)
// ─────────────────────────────────────────────────────────────────────────────
void processCommand(String cmd) {
  cmd.trim();

  if (cmd == F("CMD:START") || cmd == F("START")) {
    if (!timerRunning) {
      timerRunning = true;
      startTime    = millis();
      Serial.println(F("STATUS:RUNNING"));
      Serial.println(F(">>> Timer Started"));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("INFUSION ACTIVE "));
      lcd.setCursor(0, 1); lcd.print(F("STARTED         "));
      delay(800);
    }
  }
  else if (cmd == F("CMD:STOP") || cmd == F("STOP")) {
    if (timerRunning) {
      timerRunning = false;
      elapsedTime  = millis() - startTime;
      digitalWrite(RELAY_1_PIN, LOW);
      digitalWrite(RELAY_2_PIN, LOW);
      digitalWrite(RELAY_3_PIN, LOW);
      digitalWrite(RELAY_4_PIN, LOW);
      Serial.println(F("STATUS:STOPPED"));
      Serial.println(F(">>> Timer Stopped. All relays are OFF."));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("INFUSION PAUSED "));
      lcd.setCursor(0, 1); lcd.print(F("STOPPED         "));
      delay(800);
    }
  }
  else if (cmd == F("CAL:TARE") || cmd == F("TARE") || cmd == F("t") || cmd == F("T")) {
    scale3.tare();
    Serial.println(F("CAL:TARED"));
    Serial.println(F(">>> Scale Zeroed (Tare OK)"));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("ZERO TARE OK    "));
    delay(800);
  }
  else if (cmd.startsWith(F("CAL:FACTOR:"))) {
    calibrationFactor = cmd.substring(11).toFloat();
    if (calibrationFactor != 0) scale3.set_scale(calibrationFactor);
    Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
  }
  else if (cmd.startsWith(F("CAL:FULL:"))) {
    fullWeight = cmd.substring(9).toFloat();
    Serial.print(F("CAL_FULL:")); Serial.println(fullWeight, 1);
  }
  else if (cmd.startsWith(F("CAL:EMPTY:"))) {
    emptyWeight = cmd.substring(10).toFloat();
    Serial.print(F("CAL_EMPTY:")); Serial.println(emptyWeight, 1);
  }
  else if (cmd == F("CAL:MODE:START")) {
    calModeActive = true;
    digitalWrite(RELAY_1_PIN, LOW);
    digitalWrite(RELAY_2_PIN, LOW);
    digitalWrite(RELAY_3_PIN, LOW);
    digitalWrite(RELAY_4_PIN, LOW);
    Serial.println(F("CAL_MODE:ACTIVE"));
  }
  else if (cmd == F("CAL:MODE:EXIT")) {
    calModeActive = false;
    Serial.println(F("CAL_MODE:INACTIVE"));
  }
  else if (cmd == F("PING")) {
    Serial.println(F("PONG:IVMU_1_PRO"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────────────────────────────────────
void loop() {

  // ── 1. Read Serial Commands ────────────────────────────────────────────────
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      processCommand(rxBuf);
      rxBuf = "";
    } else if (c != '\r') {
      rxBuf += c;
    }
  }

  // ── 2. Read Weight from HX711 Load Cell ───────────────────────────────────
  long rawADC = 0;
  float weight = 0.0f;

  if (scale3.is_ready()) {
    rawADC = scale3.read();
    weight = scale3.get_units(3); // 3-sample average for stability
  } else {
    weight = scale3.get_units(1); // Immediate read fallback
  }

  // ── 3. Calculate IV Percentage Level (0% to 100%) ──────────────────────────
  float range = fullWeight - emptyWeight;
  if (range < 1.0f) range = 1.0f;
  int ivLevel = (int)(((weight - emptyWeight) / range) * 100.0f);
  ivLevel = constrain(ivLevel, 0, 100);

  // ── 4. Chronometer Update ──────────────────────────────────────────────────
  if (timerRunning) {
    elapsedTime = millis() - startTime;
  }
  hours   = (elapsedTime / 3600000UL) % 24;
  minutes = (elapsedTime / 60000UL)   % 60;
  seconds = (elapsedTime / 1000UL)    % 60;
  snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", hours, minutes, seconds);

  // ── 5. Push Telemetry (Supports both Serial Monitor & Web UI) ──────────────
  // Dual-format stream:
  Serial.print(F("WEIGHT:")); Serial.println(weight, 1);
  Serial.print(F("LEVEL:"));  Serial.println(ivLevel);
  Serial.print(F("TIME:"));   Serial.println(timeStr);
  Serial.print(F("STATUS:")); Serial.println(timerRunning ? F("RUNNING") : (calModeActive ? F("CAL_MODE") : F("IDLE")));

  // Human-readable diagnostic line:
  Serial.print(F(">> Weight: "));
  Serial.print(weight, 1);
  Serial.print(F(" g | Level: "));
  Serial.print(ivLevel);
  Serial.print(F("% | Raw ADC: "));
  Serial.print(rawADC);
  Serial.print(F(" | Time: "));
  Serial.println(timeStr);

  // ── 6. Check Physical Buttons ──────────────────────────────────────────────
  // START BUTTON (D12)
  static bool lastStartBtn = HIGH;
  bool curStart = digitalRead(START_BUTTON_PIN);
  if (lastStartBtn == HIGH && curStart == LOW) {
    processCommand(F("CMD:START"));
  }
  lastStartBtn = curStart;

  // STOP BUTTON (D11)
  static bool lastStopBtn = HIGH;
  bool curStop = digitalRead(STOP_BUTTON_PIN);
  if (lastStopBtn == HIGH && curStop == LOW) {
    processCommand(F("CMD:STOP"));
  }
  lastStopBtn = curStop;

  // ── 7. Relay Actuation (Based on IV Level / Weight when timer is running) ───
  if (timerRunning && !calModeActive) {
    // Relay 1: 100% - 75%
    if (ivLevel >= 75 || (weight >= 375.0f)) {
      digitalWrite(RELAY_1_PIN, HIGH);
    } else {
      digitalWrite(RELAY_1_PIN, LOW);
    }

    // Relay 2: 75% - 50%
    if ((ivLevel >= 50 && ivLevel < 75) || (weight >= 250.0f && weight < 375.0f)) {
      digitalWrite(RELAY_2_PIN, HIGH);
    } else {
      digitalWrite(RELAY_2_PIN, LOW);
    }

    // Relay 3: 50% - 25%
    if ((ivLevel >= 25 && ivLevel < 50) || (weight >= 125.0f && weight < 250.0f)) {
      digitalWrite(RELAY_3_PIN, HIGH);
    } else {
      digitalWrite(RELAY_3_PIN, LOW);
    }

    // Relay 4: 25% - 0% (Low / Critical)
    if ((ivLevel > 0 && ivLevel < 25) || (weight > 0.0f && weight < 125.0f)) {
      digitalWrite(RELAY_4_PIN, HIGH);
    } else {
      digitalWrite(RELAY_4_PIN, LOW);
    }
  } else {
    // All relays OFF if timer not running or in calibration
    digitalWrite(RELAY_1_PIN, LOW);
    digitalWrite(RELAY_2_PIN, LOW);
    digitalWrite(RELAY_3_PIN, LOW);
    digitalWrite(RELAY_4_PIN, LOW);
  }

  // ── 8. LCD Display Refresh ─────────────────────────────────────────────────
  if (calModeActive) {
    lcd.setCursor(0, 0);
    lcd.print(F("CALIBRATION MODE"));
    lcd.setCursor(0, 1);
    lcd.print(F("WT: "));
    lcd.print(weight, 1);
    lcd.print(F(" g     "));
  } else {
    // Line 1: Time + Status
    lcd.setCursor(0, 0);
    lcd.print(F("Time: "));
    lcd.print(timeStr);
    lcd.print(F(" "));

    // Line 2: IV% + Weight
    lcd.setCursor(0, 1);
    if (timerRunning) {
      lcd.print(F("RUN "));
    } else {
      lcd.print(F("STP "));
    }
    lcd.print(F("L:"));
    lcd.print(ivLevel);
    lcd.print(F("% W:"));
    lcd.print((int)weight);
    lcd.print(F("g "));
  }

  delay(400); // Telemetry cycle interval
}
