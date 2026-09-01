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
  calFull:      500.0,
  calEmpty:     50.0,
  calFactor:    2280.0,
  calMode:      false,
  alarmActive:  false,
  sessionStart: null,
  theme:        'dark',
  logs:         [],
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

// ── Web Audio Clinical Alarm Generator ────────────────────────────────────────
let audioCtx = null;
let beepInterval = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
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
  const c = parseFloat(localStorage.getItem('ivmu_cal_factor'));
  if (!isNaN(f)) state.calFull   = f;
  if (!isNaN(e)) state.calEmpty  = e;
  if (!isNaN(c)) state.calFactor = c;

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
    }
    return;
  }

  // 3. ELAPSED TIME (TIME:00:01:23 or Time: 00:01:23)
  const timeMatch = trimmed.match(/^(?:TIME|Time|time):\s*([0-9:]+)/i);
  if (timeMatch) {
    state.elapsed = timeMatch[1].trim();
    const lblT = document.getElementById('lbl-time');
    const stTC = document.getElementById('stat-time-center');
    if (lblT) lblT.textContent = state.elapsed;
    if (stTC) stTC.textContent = state.elapsed;
    return;
  }

  // 4. SYSTEM STATE (STATUS:RUNNING, Status: RUNNING, RUN, STP)
  const statusMatch = trimmed.match(/^(?:STATUS|Status|status):\s*(\w+)/i);
  if (statusMatch) {
    const rawStat = statusMatch[1].toUpperCase();
    let normalized = 'STANDBY';
    if (rawStat === 'RUNNING' || rawStat === 'RUN') normalized = 'INFUSING';
    else if (rawStat === 'STOPPED' || rawStat === 'STP') normalized = 'PAUSED';
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
    saveCalibration();
    return;
  }

  if (line.startsWith('CAL_EMPTY:')) {
    state.calEmpty = parseFloat(line.slice(10)) || state.calEmpty;
    const el = document.getElementById('stored-empty');
    if (el) el.textContent = state.calEmpty.toFixed(1) + ' g';
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

  // Update Actuator Channels (Line Relays)
  setChannelState('relay-1', level >= 75);
  setChannelState('relay-2', level >= 50 && level < 75);
  setChannelState('relay-3', level >= 25 && level < 50);
  setChannelState('relay-4', level > 0  && level < 25, true);

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

function setChannelState(id, isActive, isWarning = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const statusSpan = el.querySelector('.channel-status');
  if (isActive) {
    el.className = isWarning ? 'channel-card warning' : 'channel-card active';
    if (statusSpan) statusSpan.textContent = isWarning ? 'WARNING ACTIVE' : 'OPEN / ACTIVE';
  } else {
    el.className = 'channel-card';
    if (statusSpan) statusSpan.textContent = 'STANDBY';
  }
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

  if (btnStart) btnStart.disabled = !(state.connected && (status === 'STANDBY' || status === 'PAUSED'));
  if (btnStop)  btnStop.disabled  = !(state.connected && status === 'INFUSING');

  if (status === 'INFUSING' && !state.sessionStart) {
    state.sessionStart = new Date();
    const stTime = document.getElementById('lbl-started-at');
    if (stTime) {
      stTime.textContent = state.sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    showActivePrescriptionBar();
    logEvent(`Infusion session started for ${getPatientName()}.`, 'success');
  }

  if (status === 'PAUSED' || status === 'STANDBY') {
    if (status === 'PAUSED') logEvent('Infusion session paused.', 'warning');
    state.sessionStart = null;
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
  await sendCmd('CMD:START');
}

async function sendStop() {
  await sendCmd('CMD:STOP');
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
  document.getElementById('stored-full').textContent = val.toFixed(1) + ' g';
  saveCalibration();
  await sendCmd(`CAL:FULL:${val}`);
  logEvent(`Full reference mass calibrated to ${val} g.`, 'info');
}

async function applyEmptyWeight() {
  const val = parseFloat(document.getElementById('inp-empty-weight').value);
  if (isNaN(val) || val < 0) { alert('Please enter a valid empty reference weight in grams.'); return; }
  state.calEmpty = val;
  document.getElementById('stored-empty').textContent = val.toFixed(1) + ' g';
  saveCalibration();
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

// ── Initialization ────────────────────────────────────────────────────────────
(function initializeSystem() {
  loadTheme();
  loadCalibration();
  updateIvBag(0);
  enableControls(false);
  animateWaveLoop();

  // Listen for Enter in manual packet terminal
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('serial-manual-input');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') sendManualCmd();
      });
    }
  });

  // Modal ESC key handler
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') saveAndExitCalibration();
  });

  logEvent('IV Sentry Pro Workstation ready. Awaiting telemetry connection to Unit 1.', 'info');
})();
