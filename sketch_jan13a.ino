#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h" // Load cell library

// Load Cell Pins
#define LOADCELL_DOUT_PIN 6
#define LOADCELL_SCK_PIN 7

// Push Button Pins
#define START_BUTTON_PIN 12
#define STOP_BUTTON_PIN 11

// Relay Pins
#define RELAY_1_PIN 2
#define RELAY_2_PIN 3
#define RELAY_3_PIN 4
#define RELAY_4_PIN 5

// Initialize Load Cell and LCD
HX711 scale3;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Timer Variables
unsigned long startTime = 0;
unsigned long elapsedTime = 0;
bool timerRunning = false;
int hours = 0, minutes = 0, seconds = 0;

void setup() {
  // Initialize Serial Monitor
  Serial.begin(9600);
  Serial.println("System Initializing...");

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SMART IV SYSYTEM");
  delay(2000);

  // Initialize Pins
  pinMode(START_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STOP_BUTTON_PIN, INPUT_PULLUP);
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(RELAY_3_PIN, OUTPUT);
  pinMode(RELAY_4_PIN, OUTPUT);

  // Start Load Cell
  scale3.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale3.set_scale(2280.f);  // Set the known calibration factor
  scale3.tare(); // Reset the scale to zero

  // Display Calibration status on LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Calibration");
  delay(1000); // Wait for 1 second to show calibration message
}

void loop() {
  // Get weight reading from load cell
  float weight = scale3.get_units(10);  // Average 10 readings for more stability

  // Print weight to Serial Monitor
  Serial.print("Weight: ");
  Serial.print(weight);
  Serial.println(" kg");

  // Display time on LCD if the timer is running
  if (timerRunning) {
    elapsedTime = millis() - startTime;
    hours = (elapsedTime / 3600000) % 24; // Convert to hours
    minutes = (elapsedTime / 60000) % 60; // Convert to minutes
    seconds = (elapsedTime / 1000) % 60;  // Convert to seconds

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Time: ");
    lcd.setCursor(6, 0);
    lcd.print(hours < 10 ? "0" : "");
    lcd.print(hours);
    lcd.print(":");
    lcd.print(minutes < 10 ? "0" : "");
    lcd.print(minutes);
    lcd.print(":");
    lcd.print(seconds < 10 ? "0" : "");
    lcd.print(seconds);
  } else {
    // Display time even if the timer is stopped
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Time: ");
    lcd.setCursor(6, 0);
    lcd.print(hours < 10 ? "0" : "");
    lcd.print(hours);
    lcd.print(":");
    lcd.print(minutes < 10 ? "0" : "");
    lcd.print(minutes);
    lcd.print(":");
    lcd.print(seconds < 10 ? "0" : "");
    lcd.print(seconds);
  }

  // Check if the START button (D12) is pressed to start the system (momentary)
  static bool lastStartButtonState = HIGH;
  bool currentStartButtonState = digitalRead(START_BUTTON_PIN);
  if (lastStartButtonState == HIGH && currentStartButtonState == LOW) {
    if (!timerRunning) {
      timerRunning = true;
      startTime = millis(); // Start the timer
      Serial.println("Timer Started");
      lcd.setCursor(0, 1);
  lcd.print("STARTED");
  delay(2000);
    }
  }
  lastStartButtonState = currentStartButtonState;

  // Check if the STOP button (D11) is pressed to stop the system
  static bool lastStopButtonState = HIGH;
  bool currentStopButtonState = digitalRead(STOP_BUTTON_PIN);
  if (lastStopButtonState == HIGH && currentStopButtonState == LOW) {
    if (timerRunning) {
      timerRunning = false;
      elapsedTime = millis() - startTime; // Freeze the time
      // Set all relays to LOW when stopped
      digitalWrite(RELAY_1_PIN, LOW);
      digitalWrite(RELAY_2_PIN, LOW);
      digitalWrite(RELAY_3_PIN, LOW);
      digitalWrite(RELAY_4_PIN, LOW);
      Serial.println("Timer Stopped. All relays are OFF.");
      lcd.setCursor(0, 1);
  lcd.print("STOPED");
  delay(2000);
    }
  }
  lastStopButtonState = currentStopButtonState;

  // Control Relay 1 based on weight range (only if timer is running)
  if (timerRunning) {
    if (weight > 10.0 && weight < 20.0) {  // Example weight range: 10 kg to 20 kg
      digitalWrite(RELAY_1_PIN, HIGH); // Turn on Relay 1
      Serial.println("Relay 1 ON");
      lcd.setCursor(8, 1);
  lcd.print("%:100");
    } else {
      digitalWrite(RELAY_1_PIN, LOW);  // Turn off Relay 1
      Serial.println("Relay 1 OFF");
    }

    // Control Relay 2 based on weight range
    if (weight > 20.0 && weight < 30.0) {  // Example weight range: 20 kg to 30 kg
      digitalWrite(RELAY_2_PIN, HIGH); // Turn on Relay 2
      Serial.println("Relay 2 ON");
      lcd.setCursor(8, 1);
  lcd.print("%:75");
    } else {
      digitalWrite(RELAY_2_PIN, LOW);  // Turn off Relay 2
      Serial.println("Relay 2 OFF");
    }

    // Control Relay 3 based on weight range
    if (weight > 30.0 && weight < 40.0) {  // Example weight range: 30 kg to 40 kg
      digitalWrite(RELAY_3_PIN, HIGH); // Turn on Relay 3
      Serial.println("Relay 3 ON");
      lcd.setCursor(8, 1);
  lcd.print("%:50");
    } else {
      digitalWrite(RELAY_3_PIN, LOW);  // Turn off Relay 3
      Serial.println("Relay 3 OFF");
    }

    // Control Relay 4 based on weight range
    if (weight > 40.0 && weight < 50.0) {  // Example weight range: 40 kg to 50 kg
      digitalWrite(RELAY_4_PIN, HIGH); // Turn on Relay 4
      Serial.println("Relay 4 ON");
      lcd.setCursor(8, 1);
  lcd.print("%:10");
    } else {
      digitalWrite(RELAY_4_PIN, LOW);  // Turn off Relay 4
      Serial.println("Relay 4 OFF");
    }
  }

  delay(500); // Small delay to avoid flooding the Serial Monitor
}
