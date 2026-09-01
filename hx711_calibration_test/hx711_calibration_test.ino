// ╔══════════════════════════════════════════════════════════════════════════╗
// ║      HX711 10KG LOAD CELL — Interactive Calibration & Test Utility      ║
// ║      Pins: DOUT = D6, SCK = D7 · Baud Rate: 9600                          ║
// ║      Features: Noise Filter, Tare, Auto-Calibration, LCD & Serial        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// ── Pin Definitions ───────────────────────────────────────────────────────────
#define LOADCELL_DOUT_PIN  6    // HX711 DT pin
#define LOADCELL_SCK_PIN   7    // HX711 SCK pin

// ── Hardware Objects ──────────────────────────────────────────────────────────
HX711              scale;
LiquidCrystal_I2C  lcd(0x27, 16, 2);

// ── Calibration & Filter Parameters ───────────────────────────────────────────
// Default starting factor for 10kg load cell (approx 220.0 to 450.0 for grams, ~228000 for kg)
float calibrationFactor = 228.0f;  
long  tareOffset        = 0;

// Filter state (Exponential Moving Average to stop +/- 0.1 fluctuation)
float filteredWeight    = 0.0f;
const float EMA_ALPHA   = 0.25f;   // Smoothing factor (0.1 = heavy filter, 0.5 = fast)

void printHelp() {
  Serial.println(F("\n=================================================="));
  Serial.println(F("   HX711 10KG LOAD CELL TEST & CALIBRATION TOOL  "));
  Serial.println(F("=================================================="));
  Serial.println(F(" COMMANDS:"));
  Serial.println(F("   't' or 'T'       : Tare (Zero the scale)"));
  Serial.println(F("   '+' or 'a'       : Increase Cal Factor (+10)"));
  Serial.println(F("   '-' or 'z'       : Decrease Cal Factor (-10)"));
  Serial.println(F("   'A' / 'Z'        : Fine Adjust (+1 / -1)"));
  Serial.println(F("   'w <grams>'      : Auto-calibrate with known weight"));
  Serial.println(F("                      (e.g., place 500g bottle, type 'w 500')"));
  Serial.println(F("   'h'              : Show this help menu"));
  Serial.println(F("==================================================\n"));
}

void setup() {
  Serial.begin(9600);
  delay(500);

  // LCD Startup (Safe check)
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print(F("HX711 10KG TEST "));
  lcd.setCursor(0, 1); lcd.print(F("Initializing... "));

  printHelp();

  // Initialize HX711
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);

  Serial.println(F("[HX711] Checking sensor connection..."));
  if (scale.wait_ready_timeout(2000)) {
    Serial.println(F("[HX711] Sensor READY. Taring with empty load..."));
    scale.set_scale(calibrationFactor);
    scale.tare();
    tareOffset = scale.get_offset();
    Serial.print(F("[HX711] Zero Tare Offset: "));
    Serial.println(tareOffset);
    Serial.print(F("[HX711] Initial Calibration Factor: "));
    Serial.println(calibrationFactor);

    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("TARE COMPLETE   "));
    lcd.setCursor(0, 1); lcd.print(F("Place Test Weight"));
    delay(1500);
  } else {
    Serial.println(F("[ERROR] HX711 not found! Check wiring: DOUT->D6, SCK->D7, VCC->5V, GND->GND"));
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("HX711 NOT FOUND "));
    lcd.setCursor(0, 1); lcd.print(F("Check D6/D7 Wire"));
  }
}

void loop() {

  // ── 1. Process Serial Commands ─────────────────────────────────────────────
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() > 0) {
      char cmd = input.charAt(0);

      // TARE
      if (cmd == 't' || cmd == 'T') {
        scale.tare();
        tareOffset = scale.get_offset();
        filteredWeight = 0.0f;
        Serial.println(F("\n>>> [TARE] Scale zeroed (0.00 g)."));
        lcd.clear();
        lcd.setCursor(0, 0); lcd.print(F("SCALE ZEROED    "));
        delay(600);
      }
      // CALIBRATION FACTOR ADJUSTMENTS
      else if (cmd == '+' || cmd == 'a') {
        calibrationFactor += 10.0f;
        scale.set_scale(calibrationFactor);
        Serial.print(F(">>> Cal Factor INCREASED: ")); Serial.println(calibrationFactor);
      }
      else if (cmd == '-' || cmd == 'z') {
        calibrationFactor -= 10.0f;
        if (calibrationFactor < 1.0f) calibrationFactor = 1.0f;
        scale.set_scale(calibrationFactor);
        Serial.print(F(">>> Cal Factor DECREASED: ")); Serial.println(calibrationFactor);
      }
      else if (cmd == 'A') {
        calibrationFactor += 1.0f;
        scale.set_scale(calibrationFactor);
        Serial.print(F(">>> Cal Factor Fine +1: ")); Serial.println(calibrationFactor);
      }
      else if (cmd == 'Z') {
        calibrationFactor -= 1.0f;
        scale.set_scale(calibrationFactor);
        Serial.print(F(">>> Cal Factor Fine -1: ")); Serial.println(calibrationFactor);
      }
      // AUTO-CALIBRATION WITH KNOWN WEIGHT (e.g. "w 500" for 500 grams)
      else if (cmd == 'w' || cmd == 'W') {
        String numPart = input.substring(1);
        numPart.trim();
        float knownWeight = numPart.toFloat();

        if (knownWeight > 0.0f) {
          Serial.println(F("\n>>> Calculating Calibration Factor for placed weight..."));
          // Read raw unscaled value relative to tare
          long rawReading = scale.read_average(10) - tareOffset;
          if (rawReading != 0) {
            calibrationFactor = (float)rawReading / knownWeight;
            scale.set_scale(calibrationFactor);
            Serial.print(F(">>> SUCCESS! New Calibration Factor = "));
            Serial.println(calibrationFactor, 2);
            Serial.println(F(">>> Copy this Calibration Factor into your main project code!"));
            
            lcd.clear();
            lcd.setCursor(0, 0); lcd.print(F("CAL FACTOR SAVED"));
            lcd.setCursor(0, 1); lcd.print(F("FAC: ")); lcd.print(calibrationFactor, 1);
            delay(1500);
          }
        } else {
          Serial.println(F(">>> [ERROR] Please enter valid weight: e.g. 'w 500' for 500g"));
        }
      }
      // HELP
      else if (cmd == 'h' || cmd == 'H') {
        printHelp();
      }
    }
  }

  // ── 2. Read Load Cell with Noise Filtering ─────────────────────────────────
  if (scale.is_ready()) {
    float rawWeight = scale.get_units(2); // Read 2-sample average

    // Apply Exponential Moving Average (EMA) filter to kill noise/drift
    filteredWeight = (EMA_ALPHA * rawWeight) + ((1.0f - EMA_ALPHA) * filteredWeight);

    // Deadband filter for zero stability: clamp small noise near 0
    float displayWeight = filteredWeight;
    if (abs(displayWeight) < 0.15f) {
      displayWeight = 0.0f;
    }

    // ── 3. Print Telemetry to Serial Monitor ──────────────────────────────────
    Serial.print(F("Weight: "));
    Serial.print(displayWeight, 1);
    Serial.print(F(" g ("));
    Serial.print(displayWeight / 1000.0f, 3);
    Serial.print(F(" kg) | Raw ADC: "));
    Serial.print(scale.read());
    Serial.print(F(" | CalFactor: "));
    Serial.println(calibrationFactor, 1);

    // ── 4. Update 16x2 LCD Display ───────────────────────────────────────────
    lcd.setCursor(0, 0);
    lcd.print(F("WT: "));
    lcd.print(displayWeight, 1);
    lcd.print(F(" g       "));

    lcd.setCursor(0, 1);
    lcd.print(F("FAC:"));
    lcd.print((int)calibrationFactor);
    lcd.print(F(" 10KG SENS "));
  }

  delay(250); // 4 Hz refresh rate
}
