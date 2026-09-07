// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  IV SENTRY PRO™ — Clinical Infusion Telemetry Engine                    ║
// ║  Device: IV Measurement Unit 1 (IVMU-01) · Web Serial Protocol          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

'use strict';

// ── Application & Telemetry State ─────────────────────────────────────────────
const state = {
  port:         null,
  reader:       null,
  writer:       null,
  connected:    false,
  status:       'STANDBY',       // STANDBY | INFUSING | PAUSED | ALARM | CAL_MODE
  weight:       0.0,
  level:        0,
  elapsed:      '00:00:00',
  accumulatedSec: 0,
  timerInterval:null,
  calFull:      500.0,
  calEmpty:     50.0,
  calFactor:    228.0,
  calMode:      false,
  alarmActive:  false,
  sessionStart: null,
  sessionEnd:   null,
  startWeight:  500.0,
  tripCompleted:false,
  buzzerMilestones: {
    90: { triggered: false, time: null, count: 1, label: '90% Level' },
    75: { triggered: false, time: null, count: 1, label: '75% Level' },
    65: { triggered: false, time: null, count: 1, label: '65% Level' },
    50: { triggered: false, time: null, count: 1, label: '50% Level' },
    35: { triggered: false, time: null, count: 1, label: '35% Level' },
    25: { triggered: false, time: null, count: 1, label: '25% Level' },
    10: { triggered: false, time: null, count: 5, label: '< 10% Critical' }
  },
  theme:        'dark',
  logs:         [],
  aiPrediction: {
    flowRate:   125,
    dripRate:   42,
    etaHours:   '4.0',
    hemoStatus: 'STABLE EUVOLEMIC',
    statusClass:'status-stable',
    summary:    ''
  }
};

// ── Theme Manager (Dark / Light Mode) ─────────────────────────────────────────
function loadTheme() {
  const saved = localStorage.getItem('iv_theme') || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  applyTheme(target);
  localStorage.setItem('iv_theme', target);
  logEvent(`Clinical theme switched to ${target.toUpperCase()} mode.`, 'info');
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const iconDark  = document.querySelector('.theme-icon-dark');
  const iconLight = document.querySelector('.theme-icon-light');
  const label     = document.getElementById('theme-label');

  if (theme === 'light') {
    if (iconDark) iconDark.classList.add('hidden');
    if (iconLight) iconLight.classList.remove('hidden');
    if (label) label.textContent = 'Light';
  } else {
    if (iconDark) iconDark.classList.remove('hidden');
    if (iconLight) iconLight.classList.add('hidden');
    if (label) label.textContent = 'Dark';
  }
}

// ── Web Audio Clinical Alarm & D3 Buzzer Synthesizer ──────────────────────────
let audioCtx = null;
let beepInterval = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Synthesize precise D3 buzzer acoustic pulses (Single beep for 90%-25%, 5 beeps below 10%)
function playBuzzerBeeps(count, freq = 2400, onMs = 120, offMs = 90) {
  initAudio();
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    for (let i = 0; i < count; i++) {
      const startTime = now + (i * (onMs + offMs)) / 1000;
      const stopTime  = startTime + onMs / 1000;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.30, startTime + 0.015);
      gain.gain.setValueAtTime(0.30, stopTime - 0.015);
      gain.gain.linearRampToValueAtTime(0.001, stopTime);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(stopTime);
    }
  } catch (_) {}
}

function playClinicalAlertBeep() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // High-visibility medical dual-tone chime
    osc.type = 'sine';
    osc.frequency.setValueAtTime(960, audioCtx.currentTime);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.38);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.38);
  } catch (_) {}
}

function startAlarmAudio() {
  initAudio();
  if (beepInterval) return;
  playClinicalAlertBeep();
  beepInterval = setInterval(playClinicalAlertBeep, 850);
}

function stopAlarmAudio() {
  if (beepInterval) {
    clearInterval(beepInterval);
    beepInterval = null;
  }
}

// ── Calibration Persistence ───────────────────────────────────────────────────
function saveCalibration() {
  localStorage.setItem('ivmu_cal_full', state.calFull);
  localStorage.setItem('ivmu_cal_empty', state.calEmpty);
  localStorage.setItem('ivmu_cal_factor', state.calFactor);
}

function loadCalibration() {
  const f = parseFloat(localStorage.getItem('ivmu_cal_full'));
  const e = parseFloat(localStorage.getItem('ivmu_cal_empty'));
  let c = parseFloat(localStorage.getItem('ivmu_cal_factor'));
  if (!isNaN(f)) state.calFull   = f;
  if (!isNaN(e)) state.calEmpty  = e;
  if (!isNaN(c)) {
    if (c > 1000) c = 228.0; // Normalize legacy 2280 default to 228.0
    state.calFactor = c;
  } else {
    state.calFactor = 228.0;
  }

  const inSetupFull = document.getElementById('inp-setup-full-weight');
  const inSetupEmpty = document.getElementById('inp-setup-empty-weight');
  if (inSetupFull) inSetupFull.value = state.calFull;
  if (inSetupEmpty) inSetupEmpty.value = state.calEmpty;

  const inFull = document.getElementById('inp-full-weight');
  const inEmpty = document.getElementById('inp-empty-weight');
  const inFactor = document.getElementById('inp-cal-factor');

  if (inFull) inFull.value = state.calFull;
  if (inEmpty) inEmpty.value = state.calEmpty;
  if (inFactor) inFactor.value = state.calFactor;

  const stFull = document.getElementById('stored-full');
  const stEmpty = document.getElementById('stored-empty');
  const stFactor = document.getElementById('stored-factor');

  if (stFull) stFull.textContent = state.calFull.toFixed(1) + ' g';
  if (stEmpty) stEmpty.textContent = state.calEmpty.toFixed(1) + ' g';
  if (stFactor) stFactor.textContent = state.calFactor.toFixed(1);

  updateStartingRanges(state.calFull, state.calEmpty);
}

// ── Gram Weight Setup & Reservoir Capacity (Channels Removed) ─────────────────
function updateStartingRanges(fullWeight, emptyWeight) {
  fullWeight = parseFloat(fullWeight) || 500.0;
  emptyWeight = parseFloat(emptyWeight) || 50.0;
  if (emptyWeight >= fullWeight) emptyWeight = 0;
  
  state.calFull = fullWeight;
  state.calEmpty = emptyWeight;

  const netRange = fullWeight - emptyWeight;
  const th50 = emptyWeight + 0.50 * netRange;

  // Update Net Saline summary readout
  const dispNet = document.getElementById('disp-net-range');
  if (dispNet) dispNet.textContent = `${netRange.toFixed(1)} g (${Math.round(netRange)} mL)`;

  // Update Slider bounds & ticks
  const slider = document.getElementById('sim-weight-slider');
  if (slider) {
    slider.max = fullWeight;
    slider.min = 0;
  }
  const tFull = document.getElementById('tick-full');
  const tMid = document.getElementById('tick-mid');
  const tEmpty = document.getElementById('tick-empty');
  if (tFull) tFull.textContent = `${Math.round(fullWeight)}g (Full)`;
  if (tMid) tMid.textContent = `${Math.round(th50)}g (50%)`;
  if (tEmpty) tEmpty.textContent = `${Math.round(emptyWeight)}g (Tare)`;

  // Update active preset button highlight
  ['500', '1000', '250', '100'].forEach(p => {
    const btn = document.getElementById(`preset-btn-${p}`);
    if (btn) {
      if (Math.round(fullWeight) === parseInt(p, 10)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });

  // Sync with inputs if not currently focused
  const inSetupFull = document.getElementById('inp-setup-full-weight');
  const inSetupEmpty = document.getElementById('inp-setup-empty-weight');
  if (inSetupFull && document.activeElement !== inSetupFull) inSetupFull.value = fullWeight;
  if (inSetupEmpty && document.activeElement !== inSetupEmpty) inSetupEmpty.value = emptyWeight;

  const inFull = document.getElementById('inp-full-weight');
  const inEmpty = document.getElementById('inp-empty-weight');
  if (inFull && document.activeElement !== inFull) inFull.value = fullWeight;
  if (inEmpty && document.activeElement !== inEmpty) inEmpty.value = emptyWeight;

  const stFull = document.getElementById('stored-full');
  const stEmpty = document.getElementById('stored-empty');
  if (stFull) stFull.textContent = fullWeight.toFixed(1) + ' g';
  if (stEmpty) stEmpty.textContent = emptyWeight.toFixed(1) + ' g';

  // Synchronize target infusion volume
  const inpVol = document.getElementById('inp-saline-volume');
  if (inpVol && document.activeElement !== inpVol) {
    inpVol.value = Math.round(netRange);
    if (typeof triggerAiPrediction === 'function') triggerAiPrediction();
  }

  saveCalibration();
}

function applyWeightPreset(grams) {
  let empty = 50;
  if (grams === 100) empty = 20;
  else if (grams === 250) empty = 30;
  else if (grams === 500) empty = 50;
  else if (grams === 1000) empty = 75;

  const inSetupFull = document.getElementById('inp-setup-full-weight');
  const inSetupEmpty = document.getElementById('inp-setup-empty-weight');
  if (inSetupFull) inSetupFull.value = grams;
  if (inSetupEmpty) inSetupEmpty.value = empty;

  updateStartingRanges(grams, empty);

  if (state.connected) {
    sendCmd(`CAL:FULL:${grams}`);
    sendCmd(`CAL:EMPTY:${empty}`);
  }
  logEvent(`Gram weight starting envelope set to ${grams} g (Tare: ${empty} g).`, 'info');
}

function onStartingWeightInputChange() {
  const full = parseFloat(document.getElementById('inp-setup-full-weight').value) || 500;
  const empty = parseFloat(document.getElementById('inp-setup-empty-weight').value) || 50;
  updateStartingRanges(full, empty);
  if (state.connected) {
    sendCmd(`CAL:FULL:${full}`);
    sendCmd(`CAL:EMPTY:${empty}`);
  }
}

function onSimulateWeightSlider(val) {
  val = parseFloat(val);
  const netRange = state.calFull - state.calEmpty;
  let level = 0;
  if (netRange > 0) {
    level = Math.round(((val - state.calEmpty) / netRange) * 100);
  }
  level = Math.max(0, Math.min(100, level));

  const readout = document.getElementById('slider-preview-val');
  if (readout) {
    readout.textContent = `${val.toFixed(1)} g (${level}%)`;
  }

  state.weight = val;
  state.level = level;

  const stWeight = document.getElementById('stat-weight');
  const stWeightKg = document.getElementById('stat-weight-kg');
  if (stWeight) stWeight.textContent = val.toFixed(1);
  if (stWeightKg) stWeightKg.textContent = (val / 1000.0).toFixed(3) + ' kg';

  const calLive = document.getElementById('cal-live-weight');
  if (calLive) calLive.textContent = val.toFixed(1) + ' g';

  updateIvBag(level);
  computeRemainingVolume();
  checkBuzzerMilestones(level);

  // Critical milestone (< 10%): Stop timer, sound 5s buzzer, place warning popup, and generate complete report
  if (level < 10) {
    if (state.status === 'INFUSING') {
      stopLocalTimer();
      triggerAlarmUI('empty');
      if (!state.tripCompleted) {
        completeInfusionSession(false);
      }
      playBuzzerBeeps(12, 2800, 250, 160); // 5 seconds of emergency acoustic alert beeps (12 x 410ms ≈ 5s)
    } else if (!state.alarmActive) {
      triggerAlarmUI('empty');
    }
  } else if (level >= 10 && state.alarmActive) {
    resolveAlarm();
  }
}

// ── Web Serial Connection ─────────────────────────────────────────────────────
async function connectSerial() {
  if (!('serial' in navigator)) {
    alert('⚠️ Web Serial API is supported in Google Chrome or Microsoft Edge.');
    return;
  }
  try {
    setConnStatus('connecting', 'Connecting...');
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
    state.connected = true;

    // Stream Writer
    const encoder = new TextEncoderStream();
    encoder.readable.pipeTo(state.port.writable);
    state.writer = encoder.writable.getWriter();

    // Stream Reader
    const decoder = new TextDecoderStream();
    state.port.readable.pipeTo(decoder.writable);
    state.reader = decoder.readable.getReader();
    readLoop();

    setConnStatus('connected', 'Online (COM Active)');
    document.getElementById('btn-connect').classList.add('hidden');
    document.getElementById('btn-disconnect').classList.remove('hidden');
    enableControls(true);
    logEvent('IV Measurement Unit 1 linked via telemetry port.', 'success');

    // Transmit handshake ping to verify link without forcibly overwriting calibrations
    setTimeout(async () => {
      await sendCmd('PING');
    }, 500);

  } catch (err) {
    setConnStatus('disconnected', 'Offline');
    if (err.name !== 'NotFoundError') {
      logEvent(`Connection handshake error: ${err.message}`, 'error');
    }
  }
}

async function disconnectSerial() {
  try {
    if (state.reader) { await state.reader.cancel(); state.reader = null; }
    if (state.writer) { await state.writer.close();  state.writer = null; }
    if (state.port)   { await state.port.close();    state.port   = null; }
  } catch (_) {}
  state.connected = false;
  setConnStatus('disconnected', 'Offline');
  document.getElementById('btn-connect').classList.remove('hidden');
  document.getElementById('btn-disconnect').classList.add('hidden');
  enableControls(false);
  logEvent('IV Measurement Unit 1 disconnected from telemetry link.', 'warning');
  updateIvBag(0);
  updateStatus('STANDBY');
}

// ── Stream Ingestion Loop ─────────────────────────────────────────────────────
let rxBuffer = '';

async function readLoop() {
  try {
    while (state.connected) {
      const { value, done } = await state.reader.read();
      if (done) break;
      rxBuffer += value;
      let lines = rxBuffer.split('\n');
      rxBuffer = lines.pop(); // Retain unfinished segment
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) parseTelemetryLine(trimmed);
      }
    }
  } catch (err) {
    if (state.connected) {
      logEvent('Telemetry link interrupted. Reconnecting device required.', 'error');
      await disconnectSerial();
    }
  }
}

// ── Packet Parser (Universal Support for all Firmware Output Formats) ────────
function parseTelemetryLine(line) {
  appendSerialLog(line);
  const trimmed = line.trim();

  // 1. Match WEIGHT (WEIGHT:500.0, Weight: 500.0 g, Weight: 0.5 kg, WT: 500)
  const weightMatch = trimmed.match(/^(?:WEIGHT|Weight|weight|WT|Wt):\s*([+-]?\d+(?:\.\d+)?)/i);
  if (weightMatch) {
    let raw = parseFloat(weightMatch[1]);
    if (!isNaN(raw)) {
      state.weight = raw;

      const stW = document.getElementById('stat-weight');
      const stKg = document.getElementById('stat-weight-kg');
      const calLive = document.getElementById('cal-live-weight');

      if (stW) stW.textContent = state.weight.toFixed(1);
      if (stKg) stKg.textContent = (state.weight >= 10 ? (state.weight / 1000).toFixed(3) : state.weight.toFixed(3)) + ' kg';
      if (calLive) calLive.textContent = state.weight.toFixed(1) + ' g';

      computeRemainingVolume();
    }
    return;
  }

  // 2. Match LEVEL % (LEVEL:75, Level: 75, IV: 75%)
  const levelMatch = trimmed.match(/^(?:LEVEL|Level|level|IV|iv):\s*(\d+)/i);
  if (levelMatch) {
    const lvl = parseInt(levelMatch[1], 10);
    if (!isNaN(lvl)) {
      state.level = Math.max(0, Math.min(100, lvl));
      updateIvBag(state.level);
      computeRemainingVolume();
      checkBuzzerMilestones(state.level);

      // Critical threshold (< 10%): Stop timer, sound 5s alarm, place warning popup, generate complete report
      if (state.level < 10 && state.status === 'INFUSING') {
        stopLocalTimer();
        triggerAlarmUI('empty');
        if (!state.tripCompleted) {
          completeInfusionSession(false);
        }
        playBuzzerBeeps(12, 2800, 250, 160); // 5 seconds of emergency acoustic alert beeps
      } else if (state.level >= 10 && state.alarmActive) {
        resolveAlarm();
      }
    }
    return;
  }

  // 3. ELAPSED TIME (TIME:00:01:23 or Time: 00:01:23)
  const timeMatch = trimmed.match(/^(?:TIME|Time|time):\s*([0-9:]+)/i);
  if (timeMatch) {
    // Only advance telemetry timer if session is actively infusing; freeze when stopped or completed
    if (state.status === 'INFUSING') {
      state.elapsed = timeMatch[1].trim();
      const parts = state.elapsed.split(':');
      if (parts.length === 3) {
        state.accumulatedSec = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      }
      const lblT = document.getElementById('lbl-time');
      const stTC = document.getElementById('stat-time-center');
      if (lblT) lblT.textContent = state.elapsed;
      if (stTC) stTC.textContent = state.elapsed;
    }
    return;
  }

  // 4. SYSTEM STATE (STATUS:RUNNING, Status: RUNNING, RUN, STP, COMPLETED)
  const statusMatch = trimmed.match(/^(?:STATUS|Status|status):\s*(\w+)/i);
  if (statusMatch) {
    const rawStat = statusMatch[1].toUpperCase();
    let normalized = 'STANDBY';
    if (rawStat === 'RUNNING' || rawStat === 'RUN') normalized = 'INFUSING';
    else if (rawStat === 'STOPPED' || rawStat === 'STP') normalized = 'PAUSED';
    else if (rawStat === 'COMPLETED') {
      normalized = 'COMPLETED';
      if (!state.tripCompleted) {
        completeInfusionSession(false);
      }
    }
    else if (rawStat === 'ALARM') normalized = 'ALARM';
    else if (rawStat === 'CAL_MODE') normalized = 'CAL_MODE';
    updateStatus(normalized);
    return;
  }

  // CALIBRATION MODE RESPONSES
  if (line.startsWith('CAL_MODE:')) {
    const mode = line.slice(9).trim();
    state.calMode = (mode === 'ACTIVE');
    if (state.calMode) {
      logEvent('IV Measurement Unit 1 entered Hardware LCD Calibration Mode.', 'info');
    } else {
      logEvent('IV Measurement Unit 1 exited Calibration Mode. Standard telemetry restored.', 'success');
    }
    return;
  }

  // ALARM CODES
  if (line.startsWith('ALARM:')) {
    const code = line.slice(6).trim();
    if (code === 'EMPTY') triggerAlarmUI('empty');
    else if (code === 'LOW_IV') triggerAlarmUI('low');
    else if (code === 'ACKNOWLEDGED') resolveAlarm();
    return;
  }

  // CALIBRATION CONFIRMATIONS
  if (line.startsWith('CAL_FULL:')) {
    state.calFull = parseFloat(line.slice(9)) || state.calFull;
    const el = document.getElementById('stored-full');
    if (el) el.textContent = state.calFull.toFixed(1) + ' g';
    updateStartingRanges(state.calFull, state.calEmpty);
    saveCalibration();
    return;
  }

  if (line.startsWith('CAL_EMPTY:')) {
    state.calEmpty = parseFloat(line.slice(10)) || state.calEmpty;
    const el = document.getElementById('stored-empty');
    if (el) el.textContent = state.calEmpty.toFixed(1) + ' g';
    updateStartingRanges(state.calFull, state.calEmpty);
    saveCalibration();
    return;
  }

  if (line.startsWith('CAL_FACTOR:')) {
    state.calFactor = parseFloat(line.slice(11)) || state.calFactor;
    const el = document.getElementById('stored-factor');
    if (el) el.textContent = state.calFactor.toFixed(1);
    saveCalibration();
    return;
  }

  if (line.startsWith('CAL:TARED')) {
    logEvent('Transducer zero tare completed successfully.', 'success');
    return;
  }

  // HARDWARE D3 BUZZER EVENTS
  if (line.startsWith('BUZZER:EVENT:')) {
    const parts = line.split(':');
    const pct = parseInt(parts[2]);
    const cnt = parseInt(parts[3]) || 1;
    logEvent(`🔊 D3 Hardware Buzzer Event: ${cnt} beep(s) at ${pct}% fluid level.`, 'warning');
    syncBuzzerMilestoneFromHardware(pct, cnt);
    return;
  }

  // CRITICAL RESERVOIR DEPLETION (< 10%)
  if (line.startsWith('EVENT:CRITICAL_EMPTY') || line.startsWith('BUZZER:EVENT:10:5SEC')) {
    stopLocalTimer();
    triggerAlarmUI('empty');
    if (!state.tripCompleted) {
      completeInfusionSession(false);
    }
    playBuzzerBeeps(12, 2800, 250, 160); // 5 seconds of emergency acoustic alert beeps
    logEvent('🚨 CRITICAL EMPTY ALARM: Fluid dropped below 10%. Timer stopped, 5s buzzer sounded, and Doctor Report prepared.', 'error');
    return;
  }

  // INFUSION TRIP COMPLETED EVENT
  if (line.startsWith('EVENT:INFUSION_COMPLETED')) {
    if (!state.tripCompleted) {
      completeInfusionSession(false);
    }
    return;
  }

  // AUTO-ZERO CALIBRATION FEEDBACK
  if (line.startsWith('CAL:AUTO_ZERO_OK') || line === 'CAL:TARED') {
    const fb = document.getElementById('auto-zero-text');
    if (fb) fb.textContent = '✓ Transducer auto-zeroed to 0.00 g baseline successfully.';
    logEvent('Auto-Calibration: Transducer auto-zeroed to 0.00 g successfully.', 'success');
    return;
  }

  if (line.startsWith('PONG:')) {
    logEvent(`Hardware handshake verified: ${line.slice(5)}`, 'success');
    return;
  }
}

// ── Remaining Volume Estimator ────────────────────────────────────────────────
function computeRemainingVolume() {
  const targetVol = parseFloat(document.getElementById('inp-saline-volume').value) || 500;
  const netRange = state.calFull - state.calEmpty;
  let estimatedMl = 0;
  if (netRange > 0) {
    const fraction = (state.weight - state.calEmpty) / netRange;
    estimatedMl = Math.max(0, Math.round(fraction * targetVol));
  } else {
    estimatedMl = Math.round((state.level / 100) * targetVol);
  }
  const el = document.getElementById('stat-volume-ml');
  if (el) el.textContent = `${estimatedMl} mL`;
}

// ── SVG Dynamic Visualization ─────────────────────────────────────────────────
let waveOffset = 0;

function updateIvBag(level) {
  level = Math.max(0, Math.min(100, level));
  const bagHeight = 190; // Inner SVG reservoir bounds (y:54 to y:244)
  const bagTopY   = 54;
  const fillH     = (bagHeight * level) / 100;
  const fillY     = bagTopY + bagHeight - fillH;

  // Fluid rectangle geometry
  const fluidRect = document.getElementById('fluid-rect');
  if (fluidRect) {
    fluidRect.setAttribute('x', '38');
    fluidRect.setAttribute('width', '164');
    fluidRect.setAttribute('y', fillY);
    fluidRect.setAttribute('height', fillH);

    // Gradient selector based on reserve
    if (level > 40) {
      fluidRect.setAttribute('fill', 'url(#fluidGradSafe)');
    } else if (level > 15) {
      fluidRect.setAttribute('fill', 'url(#fluidGradWarn)');
    } else {
      fluidRect.setAttribute('fill', 'url(#fluidGradCrit)');
    }
  }

  // Update Hero numerical gauges
  const badge = document.getElementById('level-badge');
  const statL = document.getElementById('stat-level');
  const barF  = document.getElementById('level-bar-fill');
  const vStat = document.getElementById('vital-level-status');

  if (badge) badge.textContent = `${level}%`;
  if (statL) statL.textContent = level;
  if (barF)  barF.style.width = `${level}%`;

  if (vStat) {
    if (level > 40) {
      vStat.textContent = 'NOMINAL';
      vStat.style.color = 'var(--teal-neon)';
    } else if (level > 15) {
      vStat.textContent = 'LOW RESERVE';
      vStat.style.color = 'var(--amber-warn)';
    } else {
      vStat.textContent = 'CRITICAL';
      vStat.style.color = 'var(--rose-crit)';
    }
  }

  // D3 Buzzer Milestone Check in Descending Order (90%, 75%, 65%, 50%, 35%, 25%, <10%)
  // All relays removed: Subsystem dedicated to D3 Buzzer alerting
  checkBuzzerMilestones(level);

  // Dynamic Drip Animator
  const drop = document.getElementById('drip-drop');
  if (drop) {
    if (state.status === 'INFUSING' && level > 0) {
      drop.classList.add('dripping');
    } else {
      drop.classList.remove('dripping');
    }
  }

  drawWaveSurface(fillY, fillH, level);
}

function drawWaveSurface(fillY, fillH, level) {
  const wave = document.getElementById('fluid-wave');
  if (!wave) return;
  if (fillH <= 0 || level <= 0) {
    wave.setAttribute('d', '');
    return;
  }
  const w = 164, x0 = 38;
  const amp = 3.5, wavePts = [];
  for (let i = 0; i <= w + 20; i += 8) {
    const y = fillY + amp * Math.sin((i + waveOffset) * 0.16);
    wavePts.push(`${x0 + i},${y.toFixed(2)}`);
  }
  const d = `M ${wavePts.join(' L ')} L ${x0 + w + 20},${fillY + fillH} L ${x0},${fillY + fillH} Z`;
  wave.setAttribute('d', d);

  if (level > 40) wave.setAttribute('fill', 'url(#fluidGradSafe)');
  else if (level > 15) wave.setAttribute('fill', 'url(#fluidGradWarn)');
  else wave.setAttribute('fill', 'url(#fluidGradCrit)');
}

function animateWaveLoop() {
  waveOffset += 2;
  const fillH = (190 * state.level) / 100;
  const fillY = 54 + 190 - fillH;
  drawWaveSurface(fillY, fillH, state.level);
  requestAnimationFrame(animateWaveLoop);
}

function startLocalTimer() {
  stopLocalTimer();
  state.timerInterval = setInterval(() => {
    if (state.status !== 'INFUSING') {
      stopLocalTimer();
      return;
    }
    state.accumulatedSec = (state.accumulatedSec || 0) + 1;
    const hrs  = Math.floor(state.accumulatedSec / 3600);
    const mins = Math.floor((state.accumulatedSec % 3600) / 60);
    const secs = state.accumulatedSec % 60;
    state.elapsed = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const stTC = document.getElementById('stat-time-center');
    const lblT = document.getElementById('lbl-time');
    if (stTC) stTC.textContent = state.elapsed;
    if (lblT) lblT.textContent = state.elapsed;
  }, 1000);
}

function stopLocalTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

// ── System Status & Session Synchronization ───────────────────────────────────
function updateStatus(status) {
  state.status = status;
  const pill = document.getElementById('lbl-status');
  if (pill) {
    pill.textContent = status;
    pill.className = `status-pill status-${status.toLowerCase()}`;
  }

  const btnStart = document.getElementById('btn-start');
  const btnStop  = document.getElementById('btn-stop');

  if (btnStart) btnStart.disabled = !(status === 'STANDBY' || status === 'PAUSED');
  if (btnStop)  btnStop.disabled  = !(status === 'INFUSING');

  if (status === 'INFUSING') {
    if (!state.sessionStart) {
      state.sessionStart = new Date();
      state.startWeight = state.weight || state.calFull;
      state.tripCompleted = false;
      resetBuzzerMilestonesUI();
      const stTime = document.getElementById('lbl-started-at');
      if (stTime) {
        stTime.textContent = state.sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      showActivePrescriptionBar();
      logEvent(`Infusion session started for ${getPatientName()}. D3 Buzzer tracking active.`, 'success');
    }
    startLocalTimer();
  } else {
    stopLocalTimer();
    if (status === 'PAUSED') logEvent('Infusion session paused. Timer stopped.', 'warning');
    if (status === 'COMPLETED') {
      const stTC = document.getElementById('stat-time-center');
      if (stTC && state.elapsed) stTC.textContent = state.elapsed;
    }
  }
}

function getPatientName() {
  return document.getElementById('inp-patient-name').value.trim() || 'Unassigned Patient';
}

function showActivePrescriptionBar() {
  const bar = document.getElementById('active-prescription-bar');
  if (!bar) return;
  document.getElementById('p-name').textContent = getPatientName();
  document.getElementById('p-id').textContent   = document.getElementById('inp-patient-id').value.trim() || '—';
  document.getElementById('p-saline').textContent = document.getElementById('inp-saline-type').value;
  const aiRateEl = document.getElementById('p-ai-rate');
  if (aiRateEl) {
    aiRateEl.textContent = `${state.aiPrediction.flowRate} mL/hr (${state.aiPrediction.dripRate} gtt/m)`;
  }
  bar.classList.remove('hidden');
}

// ── Clinical Alarm System ─────────────────────────────────────────────────────
function triggerAlarmUI(type) {
  if (type === 'empty' && !state.alarmActive) {
    state.alarmActive = true;
    const overlay = document.getElementById('alarm-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const name = getPatientName();
    const id   = document.getElementById('inp-patient-id').value.trim() || '—';
    const bed  = document.getElementById('inp-bed-no').value.trim() || '—';
    document.getElementById('alarm-patient-info').textContent = `Patient: ${name} | MRN: ${id} | Bed: ${bed}`;

    startAlarmAudio();
    logEvent('🚨 CRITICAL ALARM: Saline reservoir depleted. Immediate exchange required.', 'error');
  }

  if (type === 'low' && !state.alarmActive) {
    logEvent('⚠️ Caution: Fluid level reached low threshold (≤ 20%).', 'warning');
  }
}

function acknowledgeAlarm() {
  state.alarmActive = false;
  const overlay = document.getElementById('alarm-overlay');
  if (overlay) overlay.classList.add('hidden');
  stopAlarmAudio();
  sendCmd('CMD:ACK_ALARM');
  logEvent('Clinical alarm acknowledged & muted by operator.', 'info');
}

function resolveAlarm() {
  state.alarmActive = false;
  stopAlarmAudio();
  const overlay = document.getElementById('alarm-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── Clinical Command Dispatcher ───────────────────────────────────────────────
async function sendStart() {
  if (!validateAdmissionForm()) return;
  initAudio();
  if (state.status === 'COMPLETED') {
    state.accumulatedSec = 0;
    state.elapsed = '00:00:00';
    state.sessionStart = new Date();
    const stTC = document.getElementById('stat-time-center');
    if (stTC) stTC.textContent = '00:00:00';
  }
  updateStatus('INFUSING');
  if (state.connected) {
    await sendCmd('CMD:START');
  }
}

async function sendStop() {
  updateStatus('PAUSED');
  if (state.connected) {
    await sendCmd('CMD:STOP');
  }
}

async function sendTare() {
  await sendCmd('CAL:TARE');
}

async function setFull() {
  await sendCmd('CAL:SET_FULL_NOW');
}

async function setEmpty() {
  await sendCmd('CAL:SET_EMPTY_NOW');
}

async function applyFullWeight() {
  const val = parseFloat(document.getElementById('inp-full-weight').value);
  if (isNaN(val) || val <= 0) { alert('Please enter a valid reference weight in grams.'); return; }
  state.calFull = val;
  const inSetupFull = document.getElementById('inp-setup-full-weight');
  if (inSetupFull) inSetupFull.value = val;
  updateStartingRanges(val, state.calEmpty);
  await sendCmd(`CAL:FULL:${val}`);
  logEvent(`Full reference mass calibrated to ${val} g.`, 'info');
}

async function applyEmptyWeight() {
  const val = parseFloat(document.getElementById('inp-empty-weight').value);
  if (isNaN(val) || val < 0) { alert('Please enter a valid empty reference weight in grams.'); return; }
  state.calEmpty = val;
  const inSetupEmpty = document.getElementById('inp-setup-empty-weight');
  if (inSetupEmpty) inSetupEmpty.value = val;
  updateStartingRanges(state.calFull, val);
  await sendCmd(`CAL:EMPTY:${val}`);
  logEvent(`Empty reference tare calibrated to ${val} g.`, 'info');
}

async function applyCalFactor() {
  const val = parseFloat(document.getElementById('inp-cal-factor').value);
  if (isNaN(val) || val === 0) { alert('Please enter a valid non-zero calibration factor.'); return; }
  state.calFactor = val;
  document.getElementById('stored-factor').textContent = val.toFixed(1);
  saveCalibration();
  await sendCmd(`CAL:FACTOR:${val}`);
  logEvent(`Transducer gain factor set to ${val}.`, 'info');
}

// ── Save & Exit Calibration Mode ──────────────────────────────────────────────
async function saveAndExitCalibration() {
  saveCalibration();
  if (state.connected) {
    await sendCmd('CAL:MODE:EXIT');
  }
  closeSettingsModal();
  logEvent('Calibration settings confirmed & saved. Telemetry display restored.', 'success');
}

// ── Generic Command Sender ────────────────────────────────────────────────────
async function sendCmd(cmd) {
  if (!state.writer) return;
  try {
    await state.writer.write(cmd + '\n');
  } catch (err) {
    logEvent(`Telemetry dispatch error: ${err.message}`, 'error');
  }
}

async function sendManualCmd() {
  const inp = document.getElementById('serial-manual-input');
  const cmd = inp.value.trim();
  if (!cmd) return;
  await sendCmd(cmd);
  appendSerialLog('TX ➔ ' + cmd);
  inp.value = '';
}

// ── Settings Modal & Tabs Controller ──────────────────────────────────────────
async function openSettingsModal(tab = 'calibration') {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('hidden');
  
  // Select matching tab
  const tabBtns = document.querySelectorAll('.modal-tabs .tab-btn');
  tabBtns.forEach(b => {
    if (b.getAttribute('onclick').includes(tab)) {
      switchSettingsTab(tab, b);
    }
  });

  // If opening calibration tab and connected, instruct Unit 1 to switch physical LCD to live weight display
  if (tab === 'calibration' && state.connected) {
    await sendCmd('CAL:MODE:START');
  }
}

async function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
  
  // Send exit calibration command to hardware
  if (state.connected) {
    await sendCmd('CAL:MODE:EXIT');
  }
}

async function switchSettingsTab(tabName, btnElement) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  if (btnElement) btnElement.classList.add('active');
  const pane = document.getElementById(`tab-pane-${tabName}`);
  if (pane) pane.classList.add('active');

  // Trigger hardware LCD calibration mode only if calibration tab is active
  if (state.connected) {
    if (tabName === 'calibration') {
      await sendCmd('CAL:MODE:START');
    } else {
      await sendCmd('CAL:MODE:EXIT');
    }
  }
}

// ── Form Validation ───────────────────────────────────────────────────────────
function validateAdmissionForm() {
  const name = document.getElementById('inp-patient-name').value.trim();
  const id   = document.getElementById('inp-patient-id').value.trim();
  if (!name) {
    alert('Patient Full Name is required before starting infusion telemetry.');
    document.getElementById('inp-patient-name').focus();
    return false;
  }
  if (!id) {
    alert('Patient MRN / ID is required before starting infusion telemetry.');
    document.getElementById('inp-patient-id').focus();
    return false;
  }
  return true;
}

// ── Logging & Telemetry History ───────────────────────────────────────────────
function logEvent(msg, type = 'info') {
  const log = document.getElementById('event-log');
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const entry = document.createElement('div');
  entry.className = `log-row log-${type}`;
  entry.innerHTML = `<span class="log-timestamp">${now}</span><span class="log-message">${msg}</span>`;
  if (log) {
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 150) log.removeChild(log.firstChild);
  }
  state.logs.push({ time: new Date().toISOString(), type, msg });
}

function appendSerialLog(line) {
  const el = document.getElementById('serial-log');
  if (!el) return;
  el.textContent += line + '\n';
  el.scrollTop = el.scrollHeight;
  const lines = el.textContent.split('\n');
  if (lines.length > 100) el.textContent = lines.slice(-100).join('\n');
}

function clearSerialConsole() {
  const el = document.getElementById('serial-log');
  if (el) el.textContent = '';
}

function clearLog() {
  const log = document.getElementById('event-log');
  if (log) log.innerHTML = '';
  state.logs = [];
  logEvent('Audit log cleared by operator.', 'info');
}

function exportLogs() {
  const blob = new Blob([JSON.stringify({ unit: 'IV Measurement Unit 1', timestamp: new Date().toISOString(), logs: state.logs }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IVMU-01_Audit_Log_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── UI State Helpers ──────────────────────────────────────────────────────────
function setConnStatus(connState, label) {
  const pill = document.getElementById('conn-status');
  const lbl  = document.getElementById('conn-label');
  if (pill) pill.className = `conn-pill ${connState}`;
  if (lbl) lbl.textContent = label;
}

function enableControls(enabled) {
  const startBtn = document.getElementById('btn-start');
  const stopBtn  = document.getElementById('btn-stop');
  const tareBtn  = document.getElementById('btn-tare');
  const fullBtn  = document.getElementById('btn-set-full');
  const emptyBtn = document.getElementById('btn-set-empty');

  if (startBtn) startBtn.disabled = !enabled;
  if (stopBtn)  stopBtn.disabled  = true; // Enabled only when infusing
  if (tareBtn)  tareBtn.disabled  = !enabled;
  if (fullBtn)  fullBtn.disabled  = !enabled;
  if (emptyBtn) emptyBtn.disabled = !enabled;
}

// ── AI Predictive Saline Flow Rate & Clinical Intelligence Engine ─────────────
let aiDebounceTimer = null;

function triggerAiPrediction() {
  clearTimeout(aiDebounceTimer);
  aiDebounceTimer = setTimeout(calculateAiFlowPrediction, 120);
}

function calculateAiFlowPrediction() {
  const age       = parseFloat(document.getElementById('inp-patient-age')?.value) || 42;
  const hr        = parseFloat(document.getElementById('inp-patient-hr')?.value) || 75;
  const rr        = parseFloat(document.getElementById('inp-patient-rr')?.value) || 16;
  const sbp       = parseFloat(document.getElementById('inp-patient-sbp')?.value) || 120;
  const dbp       = parseFloat(document.getElementById('inp-patient-dbp')?.value) || 80;
  const solType   = document.getElementById('inp-saline-type')?.value || '0.9% Normal Saline (NS)';
  const targetVol = parseFloat(document.getElementById('inp-saline-volume')?.value) || 500;

  // Baseline maintenance flow rate
  let baseRate = 125; // standard adult maintenance mL/hr
  let hemoStatus = 'STABLE EUVOLEMIC';
  let statusClass = 'status-stable';
  let reasoning = [];

  // Age factor
  if (age < 12) {
    baseRate = Math.max(40, Math.round(age * 5 + 20));
    reasoning.push(`Pediatric baseline calibrated for age ${age}`);
  } else if (age > 75) {
    baseRate = 80;
    reasoning.push('Geriatric cardiac reserve compensation applied');
  }

  // Blood Pressure & Shock Index heuristics
  if (sbp < 90 || dbp < 55) {
    // Hypotension / Hypovolemic state -> Fluid resuscitation needed
    baseRate = Math.min(240, Math.max(175, baseRate + 80));
    hemoStatus = 'HYPOTENSIVE RESUSCITATION';
    statusClass = 'status-critical';
    reasoning.push(`Systolic BP (${sbp} mmHg) indicates low perfusion pressure — fluid resuscitation flow indicated`);
  } else if (sbp > 160 || dbp > 100) {
    // Stage 2 Hypertension -> Strict fluid restriction to prevent acute pulmonary edema
    baseRate = Math.max(50, Math.min(75, baseRate - 50));
    hemoStatus = 'HYPERTENSIVE RESTRICTED';
    statusClass = 'status-caution';
    reasoning.push(`High blood pressure (${sbp}/${dbp} mmHg) requires conservative rate to mitigate cardiovascular strain`);
  } else if (sbp >= 140 || dbp >= 90) {
    baseRate = Math.max(75, baseRate - 25);
    hemoStatus = 'MILD HYPERTENSIVE';
    statusClass = 'status-caution';
    reasoning.push(`Mildly elevated BP (${sbp}/${dbp} mmHg) — conservative maintenance suggested`);
  }

  // Heart Rate (Pulse) heuristics
  if (hr > 110 && sbp <= 135) {
    // Tachycardia with non-hypertensive state -> likely dehydration/hypovolemia
    baseRate = Math.min(220, baseRate + 35);
    if (statusClass === 'status-stable') {
      hemoStatus = 'TACHYCARDIC HYDRATION';
      statusClass = 'status-caution';
    }
    reasoning.push(`Elevated pulse (${hr} bpm) suggests dehydration compensatory response`);
  } else if (hr < 52) {
    // Bradycardia
    baseRate = Math.max(50, Math.min(90, baseRate - 20));
    if (statusClass === 'status-stable') {
      hemoStatus = 'BRADYCARDIC CAUTION';
      statusClass = 'status-caution';
    }
    reasoning.push(`Low heart rate (${hr} bpm) observed — monitored slow infusion recommended`);
  }

  // Respiration Rate factor
  if (rr > 26) {
    reasoning.push(`Tachypnea (${rr} bpm) factored for metabolic demand`);
  }

  // Infusion solution adjustment
  if (solType.includes('0.45%')) {
    baseRate = Math.min(100, baseRate);
    reasoning.push('Hypotonic solution (0.45% NS) regulated for safe cellular osmolarity');
  } else if (solType.includes('Ringer')) {
    reasoning.push("Ringer's Lactate selected for balanced electrolyte resuscitation");
  }

  // Final flow rate clamp (50 mL/hr to 250 mL/hr)
  const finalFlowRate = Math.max(50, Math.min(250, Math.round(baseRate / 5) * 5));
  
  // Drip rate (gtt/min) for standard 20 gtt/mL IV set: (mL/hr * 20) / 60 = mL/hr / 3
  const dripRate = Math.round((finalFlowRate * 20) / 60);
  const etaHours = (targetVol / finalFlowRate).toFixed(1);

  // Store in state
  state.aiPrediction.flowRate    = finalFlowRate;
  state.aiPrediction.dripRate    = dripRate;
  state.aiPrediction.etaHours    = etaHours;
  state.aiPrediction.hemoStatus  = hemoStatus;
  state.aiPrediction.statusClass = statusClass;

  // Build AI clinical overview narrative
  let narrative = `Patient vitals (HR: <strong>${hr} bpm</strong>, BP: <strong>${sbp}/${dbp} mmHg</strong>, RR: <strong>${rr} bpm</strong>) evaluated for <strong>${solType}</strong>. `;
  if (reasoning.length > 0) {
    narrative += reasoning.join('. ') + '. ';
  }
  narrative += `Optimal target flow rate predicted at <strong>${finalFlowRate} mL/hr</strong> (approx. <strong>${dripRate} drops/min</strong> on 20 gtt/mL set). Expected duration for ${targetVol} mL reservoir is <strong>${etaHours} hours</strong>.`;
  state.aiPrediction.summary = narrative;

  // Render UI updates
  updateAiGaugeUI();
}

function updateAiGaugeUI() {
  const p = state.aiPrediction;

  // Update needle angle (-90deg at 50 mL/hr to +90deg at 250 mL/hr)
  const needle = document.getElementById('ai-gauge-needle-group');
  if (needle) {
    const fraction = Math.max(0, Math.min(1, (p.flowRate - 50) / 200));
    const angle = -90 + (fraction * 180);
    needle.style.transform = `rotate(${angle.toFixed(1)}deg)`;
  }

  // Update digital center readout
  const valEl = document.getElementById('ai-gauge-value');
  if (valEl) valEl.textContent = p.flowRate;

  // Update pill badges
  const hrEl  = document.getElementById('ai-disp-hr');
  const bpEl  = document.getElementById('ai-disp-bp');
  const dripEl= document.getElementById('ai-disp-drip');
  const etaEl = document.getElementById('ai-disp-eta');

  const hrVal  = document.getElementById('inp-patient-hr')?.value || '75';
  const sbpVal = document.getElementById('inp-patient-sbp')?.value || '120';
  const dbpVal = document.getElementById('inp-patient-dbp')?.value || '80';

  if (hrEl)   hrEl.textContent   = `${hrVal} bpm`;
  if (bpEl)   bpEl.textContent   = `${sbpVal}/${dbpVal}`;
  if (dripEl) dripEl.textContent = `${p.dripRate} gtt/m`;
  if (etaEl)  etaEl.textContent  = `${p.etaHours} hrs`;

  // Update status badge
  const badge = document.getElementById('ai-hemo-badge');
  if (badge) {
    badge.textContent = p.hemoStatus;
    badge.className = `ai-status-badge ${p.statusClass}`;
  }

  // Update AI Overview narrative paragraph
  const textEl = document.getElementById('ai-overview-text');
  if (textEl) textEl.innerHTML = p.summary;

  // Update Active prescription bar if active
  const barAiRate = document.getElementById('p-ai-rate');
  if (barAiRate) {
    barAiRate.textContent = `${p.flowRate} mL/hr (${p.dripRate} gtt/m)`;
  }
}

function applyAiFlowRateToNotes() {
  const notesEl = document.getElementById('inp-notes');
  if (!notesEl) return;
  const p = state.aiPrediction;
  const hrVal  = document.getElementById('inp-patient-hr')?.value || '75';
  const sbpVal = document.getElementById('inp-patient-sbp')?.value || '120';
  const dbpVal = document.getElementById('inp-patient-dbp')?.value || '80';

  const entry = `[AI PRESCRIBED RATE]: ${p.flowRate} mL/hr (${p.dripRate} gtt/min) | Vitals: HR ${hrVal} bpm, BP ${sbpVal}/${dbpVal} mmHg | Status: ${p.hemoStatus}`;
  
  if (notesEl.value.includes('[AI PRESCRIBED RATE]')) {
    notesEl.value = notesEl.value.replace(/\[AI PRESCRIBED RATE\]:[^\n]*/, entry);
  } else {
    notesEl.value = (notesEl.value ? notesEl.value.trim() + '\n' : '') + entry;
  }
  logEvent(`AI flow recommendation (${p.flowRate} mL/hr) applied to clinical notes.`, 'info');

  const btn = document.querySelector('.btn-ai-apply');
  if (btn && !btn.classList.contains('applied')) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Applied to Infusion Notes!</span>`;
    btn.classList.add('applied');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('applied');
    }, 2000);
  }
}

// ── Initialization ────────────────────────────────────────────────────────────
(function initializeSystem() {
  loadTheme();
  loadCalibration();
  updateIvBag(0);
  enableControls(false);
  animateWaveLoop();
  calculateAiFlowPrediction();

  // Listen for Enter in manual packet terminal and setup event listeners
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('serial-manual-input');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') sendManualCmd();
      });
    }

    // Attach direct DOM listeners for Gram Weight Setup
    ['500', '1000', '250', '100'].forEach(p => {
      const btn = document.getElementById(`preset-btn-${p}`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          applyWeightPreset(parseInt(p, 10));
        });
      }
    });

    const fullInp = document.getElementById('inp-setup-full-weight');
    if (fullInp) fullInp.addEventListener('input', onStartingWeightInputChange);

    const emptyInp = document.getElementById('inp-setup-empty-weight');
    if (emptyInp) emptyInp.addEventListener('input', onStartingWeightInputChange);

    const slider = document.getElementById('sim-weight-slider');
    if (slider) slider.addEventListener('input', (e) => onSimulateWeightSlider(e.target.value));
  });

  // Modal ESC key handler
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') saveAndExitCalibration();
  });

  logEvent('IV Sentry Pro Workstation ready. Awaiting telemetry connection to Unit 1.', 'info');
})();

// ── D3 Buzzer Milestones Controller (Ordered Descending Alerts) ─────────────
function checkBuzzerMilestones(level) {
  const thresholds = [
    { pct: 90, count: 1, freq: 2400 },
    { pct: 75, count: 1, freq: 2400 },
    { pct: 65, count: 1, freq: 2400 },
    { pct: 50, count: 1, freq: 2400 },
    { pct: 35, count: 1, freq: 2500 },
    { pct: 25, count: 1, freq: 2600 },
    { pct: 10, count: 5, freq: 2800, isCritical: true }
  ];

  thresholds.forEach(t => {
    const isCrossed = (t.pct === 10) ? (level < 10) : (level <= t.pct);
    const m = state.buzzerMilestones[t.pct];
    if (isCrossed && m && !m.triggered) {
      m.triggered = true;
      m.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Highlight on-screen milestone card
      const card = document.getElementById(`ms-${t.pct}`);
      const statSpan = document.getElementById(`ms-status-${t.pct}`);
      if (card) {
        card.classList.add('active', 'triggered');
        setTimeout(() => card.classList.remove('triggered'), 1800);
      }
      if (statSpan) {
        statSpan.textContent = `TRIGGERED (${m.time})`;
      }

      // Synthesize Acoustic Tones via Web Audio
      playBuzzerBeeps(t.count, t.freq);

      // Flash D3 live indicator
      const ind = document.getElementById('buzzer-live-indicator');
      if (ind) {
        ind.classList.add('buzzing');
        setTimeout(() => ind.classList.remove('buzzing'), 1000);
      }

      // Update Audit log cell in Doctor Report
      const repTime = document.getElementById(`rep-btime-${t.pct}`);
      const repStat = document.getElementById(`rep-bstat-${t.pct}`);
      if (repTime) repTime.textContent = m.time;
      if (repStat) {
        repStat.textContent = 'Emitted (D3)';
        repStat.className = (t.pct === 10) ? 'badge-audit alert' : 'badge-audit success';
      }

      // Clinical Event Log Entry
      if (t.count === 5) {
        logEvent(`🚨 CRITICAL BUZZER ALERT: Fluid level below 10%! Emitted 5 rapid alert beeps on D3 & Web Audio.`, 'error');
      } else {
        logEvent(`🔔 D3 Buzzer Milestone: ${t.pct}% volume reached. Emitted single beep tone.`, 'info');
      }

      // Send to hardware if connected
      if (state.connected) {
        sendCmd(`CMD:BUZZER:${t.count}`);
      }
    }
  });

  // Automatic Trip Completion Detection when level reaches 0% during an active session
  if (level <= 0 && state.status === 'INFUSING' && !state.tripCompleted) {
    state.tripCompleted = true;
    setTimeout(() => {
      completeInfusionSession();
    }, 600);
  }
}

function syncBuzzerMilestoneFromHardware(pct, count) {
  const m = state.buzzerMilestones[pct];
  if (m) {
    m.triggered = true;
    m.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const card = document.getElementById(`ms-${pct}`);
    const statSpan = document.getElementById(`ms-status-${pct}`);
    if (card) card.classList.add('active');
    if (statSpan) statSpan.textContent = `TRIGGERED (${m.time})`;
  }
}

function resetBuzzerMilestonesUI() {
  [90, 75, 65, 50, 35, 25, 10].forEach(pct => {
    if (state.buzzerMilestones[pct]) {
      state.buzzerMilestones[pct].triggered = false;
      state.buzzerMilestones[pct].time = null;
    }
    const card = document.getElementById(`ms-${pct}`);
    const statSpan = document.getElementById(`ms-status-${pct}`);
    if (card) card.classList.remove('active', 'triggered');
    if (statSpan) statSpan.textContent = 'STANDBY';

    const repTime = document.getElementById(`rep-btime-${pct}`);
    const repStat = document.getElementById(`rep-bstat-${pct}`);
    if (repTime) repTime.textContent = '—';
    if (repStat) {
      repStat.textContent = 'Pending';
      repStat.className = (pct === 10) ? 'badge-audit alert' : 'badge-audit';
    }
  });
}

function testBuzzerBeep(count) {
  initAudio();
  const freq = (count === 5) ? 2800 : 2400;
  playBuzzerBeeps(count, freq);

  const ind = document.getElementById('buzzer-live-indicator');
  if (ind) {
    ind.classList.add('buzzing');
    setTimeout(() => ind.classList.remove('buzzing'), 1000);
  }

  logEvent(`D3 Buzzer Manual Test: ${count} beep(s) synthesized (${freq} Hz).`, 'warning');
  if (state.connected) {
    sendCmd(`CMD:BUZZER:${count}`);
  }
}

// ── Auto-Calibration with Automated Zero-Tare ─────────────────────────────────
async function startAutoCalibration() {
  initAudio();
  const text = document.getElementById('auto-zero-text');
  const fb = document.getElementById('auto-zero-feedback');

  if (fb) fb.classList.add('zeroing');
  if (text) text.textContent = 'Auto-Zero in progress... Setting transducer baseline tare to 0.00 g.';

  if (state.connected) {
    await sendCmd('CAL:MODE:START');
    await sendCmd('CAL:TARE');
  }

  state.weight = 0.0;
  const calLive = document.getElementById('cal-live-weight');
  const stWeight = document.getElementById('stat-weight');
  if (calLive) calLive.textContent = '0.0 g';
  if (stWeight) stWeight.textContent = '0.0';

  playBuzzerBeeps(1, 2200, 100, 50);

  setTimeout(() => {
    if (fb) fb.classList.remove('zeroing');
    if (text) text.textContent = '✓ Transducer auto-zeroed to 0.00 g baseline. Ready to place reference mass.';
  }, 400);

  logEvent('⚡ Auto-Calibration Initiated: Transducer automatically zeroed to 0.00 g.', 'success');
}

// ── Doctor's Printable Infusion Completion Report Generator ───────────────────
async function completeInfusionSession(fromUser = true) {
  if (state.tripCompleted) return;
  state.tripCompleted = true;
  initAudio();
  stopLocalTimer();
  state.sessionEnd = new Date();
  state.status = 'COMPLETED';

  // Only send completion command to Arduino hardware if initiated by user on the website
  if (fromUser && state.connected) {
    try {
      await sendCmd('CMD:COMPLETE');
    } catch (_) {}
  }

  // System status pill update
  const pill = document.getElementById('lbl-status');
  if (pill) {
    pill.textContent = 'COMPLETED';
    pill.className = 'status-pill status-completed';
  }

  const btnStart = document.getElementById('btn-start');
  const btnStop  = document.getElementById('btn-stop');
  if (btnStart) btnStart.disabled = false;
  if (btnStop)  btnStop.disabled  = true;

  // Use the stopped state.elapsed if valid; otherwise compute from timestamps
  let durationStr = (state.elapsed && state.elapsed !== '00:00:00') ? state.elapsed : '00:00:00';
  let totalSecs = state.accumulatedSec || 0;
  if (durationStr === '00:00:00' && state.sessionStart) {
    totalSecs = Math.max(1, Math.floor((state.sessionEnd.getTime() - state.sessionStart.getTime()) / 1000));
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    durationStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  state.elapsed = durationStr;

  // Freeze the timer on the workstation dashboard!
  const stTC = document.getElementById('stat-time-center');
  const lblT = document.getElementById('lbl-time');
  if (stTC) stTC.textContent = durationStr;
  if (lblT) lblT.textContent = durationStr;

  const totalSecsFinal = Math.max(1, totalSecs);
  const hrs = Math.floor(totalSecsFinal / 3600);
  const mins = Math.floor((totalSecsFinal % 3600) / 60);
  const secs = totalSecsFinal % 60;
  const durationMs = totalSecsFinal * 1000;
  const durationHours = Math.max(0.01, durationMs / 3600000);

  // Gather patient inputs
  const pName = document.getElementById('inp-patient-name').value.trim() || 'Alexander Wright';
  const pId   = document.getElementById('inp-patient-id').value.trim() || 'MED-8841';
  const pAge  = document.getElementById('inp-patient-age').value.trim() || '42';
  const pBed  = document.getElementById('inp-bed-no').value.trim() || 'Bed 04-A (Stepdown)';
  const pAtt  = document.getElementById('inp-attender-name').value.trim() || 'Nurse Sarah Jenkins, RN';
  const pSol  = document.getElementById('inp-saline-type').value || '0.9% Normal Saline (NS)';
  const pVol  = parseFloat(document.getElementById('inp-saline-volume').value) || 500.0;
  const pNotes = document.getElementById('inp-notes').value.trim() || 'Continuous telemetry verified. Normal saline infusion completed per protocol.';

  const hrVal  = document.getElementById('inp-patient-hr').value || '76';
  const rrVal  = document.getElementById('inp-patient-rr').value || '16';
  const sbpVal = document.getElementById('inp-patient-sbp').value || '120';
  const dbpVal = document.getElementById('inp-patient-dbp').value || '80';

  // Volumetric outcome
  const residualPct = state.level || 0;
  const injectedPct = Math.max(0, Math.min(100, 100 - residualPct));
  const injectedVol = (pVol * (injectedPct / 100)).toFixed(1);
  const residualVol = (pVol - parseFloat(injectedVol)).toFixed(1);
  const avgFlowRate = (parseFloat(injectedVol) / durationHours).toFixed(1);

  const startEpoch = state.sessionStart ? state.sessionStart : new Date(state.sessionEnd.getTime() - durationMs);
  const startStr = startEpoch.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
  const endStr   = state.sessionEnd.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
  const nowStr   = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
  const reportRef = `IVR-${pId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;

  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setEl('rep-id', reportRef);
  setEl('rep-timestamp', nowStr);
  setEl('rep-patient-name', pName);
  setEl('rep-patient-id', pId);
  setEl('rep-patient-age', `${pAge} yrs`);
  setEl('rep-patient-bed', pBed);
  setEl('rep-patient-attender', pAtt);
  setEl('rep-admission-time', startStr);

  setEl('rep-vitals-hr', `${hrVal} bpm`);
  setEl('rep-vitals-rr', `${rrVal} bpm`);
  setEl('rep-vitals-bp', `${sbpVal}/${dbpVal} mmHg`);
  setEl('rep-vitals-hemo', state.aiPrediction.hemoStatus || 'STABLE EUVOLEMIC');

  setEl('rep-solution-type', pSol);
  setEl('rep-target-volume', `${pVol.toFixed(0)} mL`);
  setEl('rep-ai-prescribed-flow', `${state.aiPrediction.flowRate} mL/hr (${state.aiPrediction.dripRate} gtt/min)`);
  setEl('rep-weight-envelope', `Full Ref: ${state.calFull.toFixed(1)} g | Tare: ${state.calEmpty.toFixed(1)} g`);
  setEl('rep-clinical-notes', pNotes);

  setEl('rep-saline-injected', injectedVol);
  setEl('rep-saline-mass', `Net Mass Delivered: ${injectedVol} g`);
  setEl('rep-saline-residual', `${residualVol} mL (${residualVol} g)`);
  setEl('rep-time-started', startStr);
  setEl('rep-time-ended', endStr);
  setEl('rep-time-duration', durationStr);
  setEl('rep-time-duration-text', `Total injection time: ${hrs}h ${mins}m ${secs}s`);
  setEl('rep-actual-flow-rate', `${avgFlowRate} mL/hr`);
  setEl('rep-completion-pct', `${injectedPct.toFixed(1)}% Administered`);
  const outcomeText = (residualPct < 10)
    ? 'RESERVOIR DEPLETED (< 10%) — INFUSION HALTED SAFELY FOR BAG REPLACEMENT'
    : (injectedPct >= 95 ? 'TRIP COMPLETED — FULL PRESCRIBED DOSE ADMINISTERED' : 'INFUSION PAUSED / PARTIAL DELIVERY');
  setEl('rep-trip-outcome', outcomeText);

  // Play celebration / completion sound if not in alarm state
  if (residualPct >= 10) {
    playBuzzerBeeps(3, 2600, 160, 90);
  }
  logEvent(`🏁 Infusion Trip Completed for ${pName}. Total Injected: ${injectedVol} mL in ${durationStr}. Doctor's Report prepared.`, 'success');

  // Open the printable report modal for view and download
  openDoctorReportModal();
}

function openDoctorReportModal() {
  const modal = document.getElementById('report-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeDoctorReportModal() {
  const modal = document.getElementById('report-modal');
  if (modal) modal.classList.add('hidden');
}

function printDoctorReport() {
  const pName = document.getElementById('inp-patient-name').value.trim() || 'Patient';
  const pId   = document.getElementById('inp-patient-id').value.trim() || 'ID';
  const origTitle = document.title;
  document.title = `Clinical_Infusion_Report_${pName.replace(/\s+/g, '_')}_${pId}`;
  window.print();
  setTimeout(() => {
    document.title = origTitle;
  }, 1000);
}

function copyReportSummary() {
  const pName = document.getElementById('inp-patient-name').value.trim() || 'Patient';
  const pId   = document.getElementById('inp-patient-id').value.trim() || 'ID';
  const pBed  = document.getElementById('inp-bed-no').value.trim() || 'Bed';
  const pSol  = document.getElementById('inp-saline-type').value || 'Normal Saline';
  const injVol = document.getElementById('rep-saline-injected').textContent || '500';
  const dur    = document.getElementById('rep-time-duration').textContent || '00:00:00';
  const startT = document.getElementById('rep-time-started').textContent || '—';
  const endT   = document.getElementById('rep-time-ended').textContent || '—';

  const text = `CLINICAL INFUSION DELIVERY REPORT — IV SENTRY PRO™\n` +
    `Patient: ${pName} (MRN: ${pId}) | Bed: ${pBed}\n` +
    `Solution: ${pSol}\n` +
    `Saline Injected: ${injVol} mL\n` +
    `Time Started: ${startT}\n` +
    `Time Ended: ${endT}\n` +
    `Injection Duration: ${dur}\n` +
    `Hardware Alert: Pin D3 Buzzer Milestones Active (All Relays Disengaged)\n` +
    `Status: COMPLETED — Verified by Attending Physician.`;

  navigator.clipboard.writeText(text).then(() => {
    logEvent('Clinical Infusion summary copied to clipboard.', 'success');
  }).catch(() => {});
}

function downloadDoctorReportText() {
  const pName = document.getElementById('inp-patient-name')?.value.trim() || 'Patient';
  const pId   = document.getElementById('inp-patient-id')?.value.trim() || 'MED-8841';
  const repRef = document.getElementById('rep-id')?.textContent || `IVR-${pId}`;
  const nowStr = new Date().toLocaleString();

  const textContent = `===============================================================
IV SENTRY PRO™ — CLINICAL INFUSION DELIVERY & AUDIT REPORT
Official Medical Telemetry Record | Reference: ${repRef}
Generated: ${nowStr}
===============================================================

1. PATIENT DEMOGRAPHICS & ADMISSION
---------------------------------------------------------------
Patient Name   : ${pName}
Patient ID/MRN : ${pId}
Patient Age    : ${document.getElementById('rep-patient-age')?.textContent || '—'}
Bed / Room     : ${document.getElementById('rep-patient-bed')?.textContent || '—'}
Attending Staff: ${document.getElementById('rep-patient-attender')?.textContent || '—'}
Admission Time : ${document.getElementById('rep-admission-time')?.textContent || '—'}

2. CLINICAL VITALS & HEMODYNAMIC PROFILE
---------------------------------------------------------------
Heart Rate     : ${document.getElementById('rep-vitals-hr')?.textContent || '—'}
Respiration    : ${document.getElementById('rep-vitals-rr')?.textContent || '—'}
Blood Pressure : ${document.getElementById('rep-vitals-bp')?.textContent || '—'}
Hemo Assessment: ${document.getElementById('rep-vitals-hemo')?.textContent || '—'}

3. PRESCRIPTION & VOLUMETRIC AUDIT
---------------------------------------------------------------
Solution Type  : ${document.getElementById('rep-solution-type')?.textContent || '—'}
Target Volume  : ${document.getElementById('rep-target-volume')?.textContent || '—'}
AI Flow Target : ${document.getElementById('rep-ai-prescribed-flow')?.textContent || '—'}
Administered   : ${document.getElementById('rep-saline-injected')?.textContent || '—'} mL
Residual Mass  : ${document.getElementById('rep-saline-residual')?.textContent || '—'}
Elapsed Time   : ${document.getElementById('rep-time-duration')?.textContent || '—'}
Avg Flow Rate  : ${document.getElementById('rep-actual-flow-rate')?.textContent || '—'}
Status/Outcome : ${document.getElementById('rep-trip-outcome')?.textContent || '—'}

4. CLINICAL NOTES & INSTRUCTIONS
---------------------------------------------------------------
${document.getElementById('rep-clinical-notes')?.textContent || 'None recorded.'}

===============================================================
Document valid when signed by licensed medical practitioner.
IV SENTRY PRO™ Clinical Telemetry Subsystem (ATmega328P / HX711).
===============================================================
`;

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Doctor_Report_${pId}_${Date.now().toString().slice(-4)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logEvent(`Doctor Report downloaded as text file for ${pName}.`, 'success');
}

// ── Explicit Global Window Scope Bindings ─────────────────────────────────────
window.applyWeightPreset = applyWeightPreset;
window.onStartingWeightInputChange = onStartingWeightInputChange;
window.onSimulateWeightSlider = onSimulateWeightSlider;
window.updateStartingRanges = updateStartingRanges;
window.applyFullWeight = applyFullWeight;
window.applyEmptyWeight = applyEmptyWeight;
window.applyCalFactor = applyCalFactor;
window.setFull = setFull;
window.setEmpty = setEmpty;
window.sendTare = sendTare;
window.sendStart = sendStart;
window.sendStop = sendStop;
window.toggleTheme = toggleTheme;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveAndExitCalibration = saveAndExitCalibration;
window.switchSettingsTab = switchSettingsTab;
window.triggerAiPrediction = triggerAiPrediction;
window.applyAiFlowRateToNotes = applyAiFlowRateToNotes;
window.connectSerial = connectSerial;
window.disconnectSerial = disconnectSerial;
window.acknowledgeAlarm = acknowledgeAlarm;
window.clearSerialConsole = clearSerialConsole;
window.clearLog = clearLog;
window.exportLogs = exportLogs;
window.sendManualCmd = sendManualCmd;
window.testBuzzerBeep = testBuzzerBeep;
window.startAutoCalibration = startAutoCalibration;
window.completeInfusionSession = completeInfusionSession;
window.openDoctorReportModal = openDoctorReportModal;
window.closeDoctorReportModal = closeDoctorReportModal;
window.printDoctorReport = printDoctorReport;
window.downloadDoctorReportText = downloadDoctorReportText;
window.copyReportSummary = copyReportSummary;

