// ╔══════════════════════════════════════════════════════════════════════════╗
// ║          SMART IV MONITORING SYSTEM — Arduino Nano Firmware            ║
// ║          Serial Protocol: 9600 baud, newline-terminated commands       ║
// ║          Board: Arduino Nano (ATmega328P)                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define LOADCELL_DOUT_PIN  6
#define LOADCELL_SCK_PIN   7
#define START_BUTTON_PIN   12   // Physical start button (INPUT_PULLUP)
#define STOP_BUTTON_PIN    11   // Physical stop button  (INPUT_PULLUP)
#define RELAY_1_PIN        2    // IV Level 75–100%  (Indicator / pump control)
#define RELAY_2_PIN        3    // IV Level 50–75%
#define RELAY_3_PIN        4    // IV Level 25–50%
#define RELAY_4_PIN        5    // IV Level  0–25%  (Warning)
#define BUZZER_PIN         8    // Optional buzzer — leave unconnected if unused

// ── Hardware Objects ──────────────────────────────────────────────────────────
HX711              scale;
LiquidCrystal_I2C  lcd(0x27, 16, 2);

// ── Calibration (overridable via serial commands from UI) ─────────────────────
float calibrationFactor = 2280.0f;  // HX711 scale factor
float fullWeight        = 500.0f;   // grams — full IV bag  (set from UI)
float emptyWeight       = 50.0f;    // grams — empty bag/hanger tare (set from UI)

// ── Session State ─────────────────────────────────────────────────────────────
bool  timerRunning  = false;
bool  alarmActive   = false;
bool  alarmAck      = false;   // acknowledged by UI
int   ivLevel       = 0;
float lastWeight    = 0.0f;

// ── Timer ─────────────────────────────────────────────────────────────────────
unsigned long sessionStartMs = 0;
unsigned long frozenElapsed  = 0;
int  hrs = 0, mins = 0, secs = 0;
char timeBuf[10];               // "HH:MM:SS"

// ── Serial Input Buffer ───────────────────────────────────────────────────────
String rxBuf = "";

// ── LCD Blink State ───────────────────────────────────────────────────────────
unsigned long lastBlinkMs  = 0;
bool          blinkVisible = true;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: turn all relays ON or OFF
// ─────────────────────────────────────────────────────────────────────────────
void setAllRelays(bool on) {
  digitalWrite(RELAY_1_PIN, on ? HIGH : LOW);
  digitalWrite(RELAY_2_PIN, on ? HIGH : LOW);
  digitalWrite(RELAY_3_PIN, on ? HIGH : LOW);
  digitalWrite(RELAY_4_PIN, on ? HIGH : LOW);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: set relays based on IV level %
// ─────────────────────────────────────────────────────────────────────────────
void updateRelays(int lvl) {
  if (!timerRunning) { setAllRelays(false); return; }
  digitalWrite(RELAY_1_PIN, (lvl >= 75)              ? HIGH : LOW);
  digitalWrite(RELAY_2_PIN, (lvl >= 50 && lvl < 75)  ? HIGH : LOW);
  digitalWrite(RELAY_3_PIN, (lvl >= 25 && lvl < 50)  ? HIGH : LOW);
  digitalWrite(RELAY_4_PIN, (lvl > 0  && lvl < 25)   ? HIGH : LOW);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: compute elapsed time string
// ─────────────────────────────────────────────────────────────────────────────
void computeTime() {
  unsigned long el = timerRunning
    ? (millis() - sessionStartMs)
    : frozenElapsed;
  hrs  = (el / 3600000UL) % 24;
  mins = (el / 60000UL)   % 60;
  secs = (el / 1000UL)    % 60;
  snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", hrs, mins, secs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: send full telemetry packet to PC
// ─────────────────────────────────────────────────────────────────────────────
void sendTelemetry(float w, int lvl) {
  Serial.print(F("WEIGHT:")); Serial.println(w, 1);
  Serial.print(F("LEVEL:"));  Serial.println(lvl);
  Serial.print(F("TIME:"));   Serial.println(timeBuf);

  // Status
  if      (alarmActive)  Serial.println(F("STATUS:ALARM"));
  else if (timerRunning) Serial.println(F("STATUS:RUNNING"));
  else                   Serial.println(F("STATUS:IDLE"));

  // Alarm codes
  if (timerRunning) {
    if (lvl <= 5)        Serial.println(F("ALARM:EMPTY"));
    else if (lvl <= 20)  Serial.println(F("ALARM:LOW_IV"));
  }

  // Cal echo (so UI can confirm values on connect)
  Serial.print(F("CAL_FULL:"));   Serial.println(fullWeight, 1);
  Serial.print(F("CAL_EMPTY:"));  Serial.println(emptyWeight, 1);
  Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command processor — called when a full '\n'-terminated line arrives
// ─────────────────────────────────────────────────────────────────────────────
void processCommand(String cmd) {
  cmd.trim();

  // ── Session control ─────────────────────────────────────────────────────
  if (cmd == F("CMD:START")) {
    if (!timerRunning) {
      timerRunning   = true;
      alarmActive    = false;
      alarmAck       = false;
      sessionStartMs = millis();
      frozenElapsed  = 0;
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("STATUS:RUNNING"));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("MONITORING...   "));
      lcd.setCursor(0, 1); lcd.print(F("Session Started "));
      delay(1500);
    }
    return;
  }

  if (cmd == F("CMD:STOP")) {
    if (timerRunning) {
      frozenElapsed = millis() - sessionStartMs;
      timerRunning  = false;
      alarmActive   = false;
      setAllRelays(false);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("STATUS:STOPPED"));
      lcd.clear();
      lcd.setCursor(0, 0); lcd.print(F("Session Stopped "));
      lcd.setCursor(0, 1); lcd.print(F("                "));
      delay(1500);
    }
    return;
  }

  if (cmd == F("CMD:ACK_ALARM")) {
    alarmAck   = true;
    alarmActive = false;
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println(F("ALARM:ACKNOWLEDGED"));
    return;
  }

  // ── Calibration: Tare ───────────────────────────────────────────────────
  if (cmd == F("CAL:TARE")) {
    scale.tare();
    Serial.println(F("CAL:TARED"));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("Scale Tared OK  "));
    delay(1000);
    return;
  }

  // CAL:SET_FULL_NOW — capture current live reading as the full-bag weight
  if (cmd == F("CAL:SET_FULL_NOW")) {
    float w = scale.get_units(10);
    if (w > 0) fullWeight = w;
    Serial.print(F("CAL_FULL:")); Serial.println(fullWeight, 1);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("Full Wt Saved:  "));
    lcd.setCursor(0, 1); lcd.print(fullWeight); lcd.print(F(" g  "));
    delay(1500);
    return;
  }

  // CAL:SET_EMPTY_NOW — capture current live reading as the empty-bag weight
  if (cmd == F("CAL:SET_EMPTY_NOW")) {
    float w = scale.get_units(10);
    emptyWeight = (w < 0) ? 0 : w;
    Serial.print(F("CAL_EMPTY:")); Serial.println(emptyWeight, 1);
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("Empty Wt Saved: "));
    lcd.setCursor(0, 1); lcd.print(emptyWeight); lcd.print(F(" g  "));
    delay(1500);
    return;
  }

  // CAL:FULL:<value>  — set full weight from UI number input
  if (cmd.startsWith(F("CAL:FULL:"))) {
    fullWeight = cmd.substring(9).toFloat();
    Serial.print(F("CAL_FULL:")); Serial.println(fullWeight, 1);
    return;
  }

  // CAL:EMPTY:<value> — set empty weight from UI number input
  if (cmd.startsWith(F("CAL:EMPTY:"))) {
    emptyWeight = cmd.substring(10).toFloat();
    Serial.print(F("CAL_EMPTY:")); Serial.println(emptyWeight, 1);
    return;
  }

  // CAL:FACTOR:<value> — update HX711 calibration factor
  if (cmd.startsWith(F("CAL:FACTOR:"))) {
    calibrationFactor = cmd.substring(11).toFloat();
    if (calibrationFactor != 0) scale.set_scale(calibrationFactor);
    Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
    return;
  }

  // PING — UI sends this on connect to verify firmware version
  if (cmd == F("PING")) {
    Serial.println(F("PONG:SMART_IV_V2"));
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);

  // LCD startup
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print(F("SMART IV SYSTEM "));
  lcd.setCursor(0, 1); lcd.print(F("  Initializing.."));
  delay(2000);

  // Pin modes
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STOP_BUTTON_PIN,  INPUT_PULLUP);
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(RELAY_3_PIN, OUTPUT);
  pinMode(RELAY_4_PIN, OUTPUT);
  pinMode(BUZZER_PIN,  OUTPUT);
  setAllRelays(false);
  digitalWrite(BUZZER_PIN, LOW);

  // Load cell
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibrationFactor);
  scale.tare();

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("Connect USB->PC "));
  lcd.setCursor(0, 1); lcd.print(F("or press START  "));

  // Announce ready
  Serial.println(F("PONG:SMART_IV_V2"));
  Serial.println(F("STATUS:IDLE"));
  Serial.print(F("CAL_FULL:"));   Serial.println(fullWeight, 1);
  Serial.print(F("CAL_EMPTY:"));  Serial.println(emptyWeight, 1);
  Serial.print(F("CAL_FACTOR:")); Serial.println(calibrationFactor, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────────────────────────────────────
void loop() {

  // ── 1. Read any incoming serial commands from PC UI ──────────────────────
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      processCommand(rxBuf);
      rxBuf = "";
    } else if (c != '\r') {
      rxBuf += c;
    }
  }

  // ── 2. Read load cell ─────────────────────────────────────────────────────
  float weight = scale.get_units(5);
  if (weight < 0.0f) weight = 0.0f;
  lastWeight = weight;

  // ── 3. Calculate IV level % ───────────────────────────────────────────────
  float range = fullWeight - emptyWeight;
  if (range < 1.0f) range = 1.0f;
  int lvl = (int)(((weight - emptyWeight) / range) * 100.0f);
  lvl    = constrain(lvl, 0, 100);
  ivLevel = lvl;

  // ── 4. Update elapsed time string ────────────────────────────────────────
  computeTime();

  // ── 5. Send telemetry to PC ───────────────────────────────────────────────
  sendTelemetry(weight, lvl);

  // ── 6. Update relays ─────────────────────────────────────────────────────
  updateRelays(lvl);

  // ── 7. Alarm logic ────────────────────────────────────────────────────────
  if (timerRunning && !alarmAck) {
    if (lvl <= 5) {
      alarmActive = true;
      // Buzzer beep (non-blocking blink approach)
      if (millis() - lastBlinkMs >= 600) {
        lastBlinkMs  = millis();
        blinkVisible = !blinkVisible;
        digitalWrite(BUZZER_PIN, blinkVisible ? HIGH : LOW);
        lcd.clear();
        if (blinkVisible) {
          lcd.setCursor(0, 0); lcd.print(F("!! IV  EMPTY !! "));
          lcd.setCursor(0, 1); lcd.print(F("CHANGE SALINE!! "));
        } else {
          lcd.setCursor(0, 0); lcd.print(F("                "));
          lcd.setCursor(0, 1); lcd.print(F("                "));
        }
      }
    } else if (lvl <= 20) {
      // Low IV — show warning on LCD, no buzzer yet
      if (millis() - lastBlinkMs >= 800) {
        lastBlinkMs  = millis();
        blinkVisible = !blinkVisible;
        lcd.setCursor(0, 1);
        if (blinkVisible) lcd.print(F("!! LOW IV !!    "));
        else               lcd.print(F("                "));
      }
    } else {
      alarmActive  = false;
      alarmAck     = false;
      digitalWrite(BUZZER_PIN, LOW);
      blinkVisible = true;
    }
  }

  // ── 8. Normal LCD update (when not in alarm blink) ────────────────────────
  if (!alarmActive) {
    lcd.clear();
    // Row 0: IV level % + time
    lcd.setCursor(0, 0);
    lcd.print(F("IV:"));
    lcd.print(lvl);
    lcd.print(F("%  "));
    lcd.print(timeBuf);

    // Row 1: Status + weight
    lcd.setCursor(0, 1);
    if (timerRunning) lcd.print(F("RUN "));
    else              lcd.print(F("STP "));
    lcd.print(F("W:"));
    lcd.print((int)weight);
    lcd.print(F("g       "));
  }

  // ── 9. Physical button handling ───────────────────────────────────────────
  static bool lastStartBtn = HIGH;
  static bool lastStopBtn  = HIGH;
  bool curStart = digitalRead(START_BUTTON_PIN);
  bool curStop  = digitalRead(STOP_BUTTON_PIN);

  if (lastStartBtn == HIGH && curStart == LOW) processCommand("CMD:START");
  lastStartBtn = curStart;

  if (lastStopBtn == HIGH && curStop == LOW) processCommand("CMD:STOP");
  lastStopBtn = curStop;

  delay(500);  // 2 Hz telemetry rate — keeps serial buffer manageable
}
