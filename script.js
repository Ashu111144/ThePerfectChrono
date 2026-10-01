// ========================================================
// THE WATCH 23 - SEGMENTAL CHRONOMETER
//
// Key Features:
// 1. 4-LED segmental matrix: Hours UP, Minutes DOWN (No colon between LEDs).
// 2. Interactive LED Matrix: Tap any LED segment to glow and update time directly.
// 3. Realistic Sapphire Glass & Ambient Ground Reflection for all conditions.
// 4. Webpage icon with transparent background resets all to live time.
// 5. Acoustic mechanical sound effects via Web Audio API (wheel ratchet & LED chimes).
// 6. Metallic scrollers: Hours, Minutes, Bounded AD/BC (no infinite wrap),
//    Year, Month in text (JAN-DEC), Date (01-31).
// 7. Non-scroller precision Weekday Complication Pod live-computed via Zeller's Congruence.
// 8. Dynamic 3-state Theme Cycler: System -> Opposite -> Next.
// ========================================================

// --------------------------------------------------------
// 1. 4-LED SEGMENT MATRIX ENCODING & REVERSE MAPPING
// Digits 0-3: 1 LED (0: Top, 1: Right, 2: Bottom, 3: Left)
// Digits 4-9: 2 LEDs (Combinations of the 4 LEDs)
// --------------------------------------------------------
const DIGIT_LED_MAP = {
    0: [0],
    1: [1],
    2: [2],
    3: [3],
    4: [0, 1],
    5: [1, 2],
    6: [2, 3],
    7: [3, 0],
    8: [0, 2],
    9: [1, 3]
};

/**
 * Maps a list of active segment indices back to the corresponding digit 0-9
 * @param {number[]} segments - Array of segment indices
 * @returns {number|null} Matching digit or null
 */
function findDigitFromSegments(segments) {
    const sorted = [...segments].sort().join(',');
    for (let d = 0; d <= 9; d++) {
        const segs = [...DIGIT_LED_MAP[d]].sort().join(',');
        if (segs === sorted) return d;
    }
    return null;
}

/**
 * Clears all 4 LED segments of an SVG digit and marks card as dimmed
 * (Used for 10th position zeros in hour and min so they don't glow)
 * @param {string} prefix - 'h1' or 'm1'
 */
function clearDigitLEDs(prefix) {
    for (let i = 0; i < 4; i++) {
        const led = document.getElementById(`${prefix}-led${i}`);
        if (led) {
            led.classList.remove('active');
        }
    }
    const card = document.querySelector(`[data-digit-card="${prefix}"]`);
    if (card) {
        card.classList.add('digit-dimmed');
    }
}

/**
 * Updates the 4 LED segments of an SVG digit
 * @param {string} prefix - 'h1', 'h2', 'm1', or 'm2'
 * @param {number} digit - 0 to 9
 */
function updateDigitLEDs(prefix, digit) {
    const card = document.querySelector(`[data-digit-card="${prefix}"]`);
    if (card) {
        card.classList.remove('digit-dimmed');
    }
    const activeLeds = DIGIT_LED_MAP[digit] || [];
    for (let i = 0; i < 4; i++) {
        const led = document.getElementById(`${prefix}-led${i}`);
        if (led) {
            if (activeLeds.includes(i)) {
                led.classList.add('active');
            } else {
                led.classList.remove('active');
            }
        }
    }
}

// --------------------------------------------------------
// 2. ZELLER'S CONGRUENCE (GREGORIAN / PROLEPTIC GREGORIAN)
// Supports both AD and BC eras.
// --------------------------------------------------------
const ZELLER_DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Computes day of week using Zeller's Congruence
 * @param {number} year - Positive year (e.g. 2026, 44)
 * @param {number} month - Month (1 = Jan, ..., 12 = Dec)
 * @param {number} day - Day (1 to 31)
 * @param {string} era - 'AD' or 'BC'
 * @returns {string} 3-letter weekday abbreviation
 */
function calculateZellerWeekday(year, month, day, era = 'AD') {
    // Astronomical year numbering:
    // 1 AD = 1, 1 BC = 0, 2 BC = -1, Y BC = 1 - Y
    let y = (era === 'BC') ? (1 - year) : year;
    let m = month;
    let q = day;

    // January and February treated as months 13 and 14 of preceding year
    if (m <= 2) {
        m += 12;
        y -= 1;
    }

    const J = Math.floor(y / 100);
    const K = ((y % 100) + 100) % 100;

    const term1 = q;
    const term2 = Math.floor((13 * (m + 1)) / 5);
    const term3 = K;
    const term4 = Math.floor(K / 4);
    const term5 = Math.floor(J / 4);
    const term6 = -2 * J;

    const total = term1 + term2 + term3 + term4 + term5 + term6;
    const h = ((total % 7) + 7) % 7;
    return ZELLER_DAYS[h];
}

/**
 * Determines whether a year is a leap year (handles AD & BC)
 */
function isLeapYear(year, era = 'AD') {
    const y = (era === 'BC') ? (1 - year) : year;
    return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
}

/**
 * Gets the number of days in a given month/year/era
 */
function getDaysInMonth(year, month, era = 'AD') {
    if (month === 2) {
        return isLeapYear(year, era) ? 29 : 28;
    }
    if ([4, 6, 9, 11].includes(month)) {
        return 30;
    }
    return 31;
}

// --------------------------------------------------------
// 3. APPLICATION STATE
// --------------------------------------------------------
const state = {
    isLive: true,
    hour: 0,
    minute: 0,
    second: 0,
    day: 1,
    month: 1,
    year: 2026,
    era: 'AD'
};

// DOM References
const btnReset = document.getElementById('btn-reset');
const liveIndicator = document.getElementById('live-indicator');
const btnTheme = document.getElementById('btn-theme');
const themeIconContainer = document.getElementById('theme-icon-container');
const btnSound = document.getElementById('btn-sound');
const soundIconContainer = document.getElementById('sound-icon-container');
const weekdayValueEl = document.getElementById('weekday-value');
const weekdayPodEl = document.getElementById('weekday-display');

// Era Mechanical Switch Lever DOM references
const moduleEra = document.getElementById('module-era');
const eraLever = document.getElementById('era-lever');
const labelAd = document.getElementById('label-ad');
const labelBc = document.getElementById('label-bc');

// Wheel cylinders for individual digits (3D metal nuts):
// Time: h1, h2, m1, m2
// Date: y1, y2, y3, y4, month, d1, d2
const cylinders = {
    h1: document.getElementById('cylinder-h1'),
    h2: document.getElementById('cylinder-h2'),
    m1: document.getElementById('cylinder-m1'),
    m2: document.getElementById('cylinder-m2'),
    y1: document.getElementById('cylinder-y1'),
    y2: document.getElementById('cylinder-y2'),
    y3: document.getElementById('cylinder-y3'),
    y4: document.getElementById('cylinder-y4'),
    month: document.getElementById('cylinder-month'),
    d1: document.getElementById('cylinder-d1'),
    d2: document.getElementById('cylinder-d2')
};

// --------------------------------------------------------
// 4. ACOUSTIC SOUND CONTROLLER (WEB AUDIO API)
// Synthesizes crisp mechanical watch clicks, LED chimes, and rewinds
// --------------------------------------------------------
class ChronoAudioController {
    constructor() {
        this.ctx = null;
        this.enabled = localStorage.getItem('thewatch_sound') !== 'false';
    }

    init() {
        if (!this.ctx && typeof AudioContext !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playWheelClick(pitchMod = 1.0) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            // Mechanical detent ratchet impulse
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1350 * pitchMod, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.024);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1750, now);
            filter.Q.setValueAtTime(3.2, now);

            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.026);
        } catch (_) {}
    }

    playLimitHit() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            // Heavy solid mechanical stop thud
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.045);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(500, now);

            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.055);
        } catch (_) {}
    }

    playLeverToggle() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            // Mechanical bat toggle latch impulse (double click)
            [0, 0.016].forEach((delay, i) => {
                const t = now + delay;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'square';
                osc.frequency.setValueAtTime(i === 0 ? 1650 : 1100, t);
                osc.frequency.exponentialRampToValueAtTime(220, t + 0.02);

                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1400, t);
                filter.Q.setValueAtTime(2.5, t);

                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(t);
                osc.stop(t + 0.024);
            });
        } catch (_) {}
    }

    playLedTap(pitchMod = 1.0) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // Resonant crystal tap tone
            osc.type = 'sine';
            osc.frequency.setValueAtTime(920 * pitchMod, now);
            osc.frequency.exponentialRampToValueAtTime(1840, now + 0.016);
            osc.frequency.exponentialRampToValueAtTime(460, now + 0.08);

            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.095);
        } catch (_) {}
    }

    playResetSweep() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            for (let i = 0; i < 4; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const t = now + (i * 0.032);

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(500 + (i * 280), t);
                osc.frequency.exponentialRampToValueAtTime(180, t + 0.03);

                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(t);
                osc.stop(t + 0.034);
            }
        } catch (_) {}
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('thewatch_sound', this.enabled ? 'true' : 'false');
        if (this.enabled) {
            this.playWheelClick(1.2);
        }
        return this.enabled;
    }
}

const chronoAudio = new ChronoAudioController();

// Sound button icons
const SOUND_ICONS = {
    on: `
        <svg viewBox="0 0 24 24" class="sound-icon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
    `,
    off: `
        <svg viewBox="0 0 24 24" class="sound-icon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/>
            <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
    `
};

function applySoundUI() {
    if (!soundIconContainer || !btnSound) return;
    if (chronoAudio.enabled) {
        soundIconContainer.innerHTML = SOUND_ICONS.on;
        btnSound.setAttribute('title', 'Mechanical Sound Effects: ON');
        btnSound.setAttribute('aria-label', 'Mechanical Sound Effects: ON');
    } else {
        soundIconContainer.innerHTML = SOUND_ICONS.off;
        btnSound.setAttribute('title', 'Mechanical Sound Effects: MUTED');
        btnSound.setAttribute('aria-label', 'Mechanical Sound Effects: MUTED');
    }
}

if (btnSound) {
    btnSound.addEventListener('click', () => {
        chronoAudio.toggle();
        applySoundUI();
    });
}

// --------------------------------------------------------
// 5. THEME CYCLER
// Cycle: System -> (Opposite of System) -> Next Opposite -> System
// --------------------------------------------------------
let themeCycleState = localStorage.getItem('thewatch_theme_mode') || 'system';

function getSystemPreference() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getEffectiveTheme(cycleState) {
    const sys = getSystemPreference();
    if (cycleState === 'system') return sys;
    if (cycleState === 'opposite') return sys === 'dark' ? 'light' : 'dark';
    if (cycleState === 'other') return sys === 'dark' ? 'dark' : 'light';
    return sys;
}

const THEME_ICONS = {
    system: `
        <svg viewBox="0 0 24 24" class="theme-icon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
            <circle cx="12" cy="10" r="2.5" fill="currentColor"/>
        </svg>
    `,
    sun: `
        <svg viewBox="0 0 24 24" class="theme-icon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    `,
    moon: `
        <svg viewBox="0 0 24 24" class="theme-icon-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
    `
};

function applyTheme() {
    const effective = getEffectiveTheme(themeCycleState);

    if (effective === 'light') {
        document.body.classList.add('theme-light');
    } else {
        document.body.classList.remove('theme-light');
    }

    if (!themeIconContainer || !btnTheme) return;

    if (themeCycleState === 'system') {
        themeIconContainer.innerHTML = THEME_ICONS.system;
        btnTheme.setAttribute('title', `Theme: System (${effective})`);
        btnTheme.setAttribute('aria-label', `Theme: System (${effective})`);
    } else if (effective === 'light') {
        themeIconContainer.innerHTML = THEME_ICONS.sun;
        btnTheme.setAttribute('title', 'Theme: Platinum Light');
        btnTheme.setAttribute('aria-label', 'Theme: Platinum Light');
    } else {
        themeIconContainer.innerHTML = THEME_ICONS.moon;
        btnTheme.setAttribute('title', 'Theme: Titanium Dark');
        btnTheme.setAttribute('aria-label', 'Theme: Titanium Dark');
    }
}

function cycleTheme() {
    chronoAudio.playWheelClick(1.1);
    if (themeCycleState === 'system') {
        themeCycleState = 'opposite';
    } else if (themeCycleState === 'opposite') {
        themeCycleState = 'other';
    } else {
        themeCycleState = 'system';
    }
    localStorage.setItem('thewatch_theme_mode', themeCycleState);
    applyTheme();
}

if (btnTheme) {
    btnTheme.addEventListener('click', cycleTheme);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeCycleState === 'system') {
        applyTheme();
    }
});

// --------------------------------------------------------
// 6. TOP-LEFT WEBPAGE ICON: RESET TO CURRENT DATE & TIME
// --------------------------------------------------------
function resetToCurrentDateTime() {
    state.isLive = true;
    chronoAudio.playResetSweep();

    // Spin animation on button
    btnReset.classList.add('spinning');
    setTimeout(() => btnReset.classList.remove('spinning'), 600);

    const now = new Date();
    state.hour = now.getHours();
    state.minute = now.getMinutes();
    state.second = now.getSeconds();
    state.day = now.getDate();
    state.month = now.getMonth() + 1;
    state.year = now.getFullYear();
    state.era = 'AD';

    updateLiveIndicator();
    updateEraLeverUI();
    updateLEDMatrix();
    renderAllWheels();
    updateWeekdayDisplay();
}

if (btnReset) {
    btnReset.addEventListener('click', resetToCurrentDateTime);
}

if (liveIndicator) {
    liveIndicator.addEventListener('click', resetToCurrentDateTime);
}

function updateLiveIndicator() {
    if (!liveIndicator || !btnReset) return;
    if (state.isLive) {
        liveIndicator.classList.remove('scrubbed');
        liveIndicator.setAttribute('title', 'Live Clock Sync active (Click to reset)');
        btnReset.setAttribute('title', 'Reset to current date & time (Live Sync active)');
    } else {
        liveIndicator.classList.add('scrubbed');
        liveIndicator.setAttribute('title', 'Manual / Scrubbed Mode (Click to sync live)');
        btnReset.setAttribute('title', 'Click to reset to current date & time');
    }
}

// --------------------------------------------------------
// 7. LED MATRIX UPDATE (HOURS UP, MINUTES DOWN)
// For hour and min: don't consider 10th position zero,
// don't glow LED for it, and collapse scroll wheel.
// --------------------------------------------------------
function updateLEDMatrix() {
    const h1 = Math.floor(state.hour / 10);
    const h2 = state.hour % 10;
    const m1 = Math.floor(state.minute / 10);
    const m2 = state.minute % 10;

    // 10th position zero: don't consider it, don't glow LED for it
    if (h1 === 0) {
        clearDigitLEDs('h1');
    } else {
        updateDigitLEDs('h1', h1);
    }
    updateDigitLEDs('h2', h2);

    if (m1 === 0) {
        clearDigitLEDs('m1');
    } else {
        updateDigitLEDs('m1', m1);
    }
    updateDigitLEDs('m2', m2);
}

// --------------------------------------------------------
// 8. TAP ON LED TO GLOW AND CHANGE TIME ACCORDINGLY
// Directly binds to each segment polygon for immediate interaction.
// Rules:
// - "only glow if possible, dont change other led state"
// - "dont change led 10th place 0 no glow logic"
// --------------------------------------------------------

/**
 * Returns the segment indices (0-3) currently active (glowing) for a digit card.
 * Respects the rule: 10th-place zero (h1 and m1) does NOT glow (returns empty array).
 */
function getActiveSegmentsForDigit(digitKey) {
    if (digitKey === 'h1') {
        const h1 = Math.floor(state.hour / 10);
        if (h1 === 0) return [];
        return DIGIT_LED_MAP[h1] ? [...DIGIT_LED_MAP[h1]] : [];
    } else if (digitKey === 'h2') {
        const h2 = state.hour % 10;
        return DIGIT_LED_MAP[h2] ? [...DIGIT_LED_MAP[h2]] : [];
    } else if (digitKey === 'm1') {
        const m1 = Math.floor(state.minute / 10);
        if (m1 === 0) return [];
        return DIGIT_LED_MAP[m1] ? [...DIGIT_LED_MAP[m1]] : [];
    } else if (digitKey === 'm2') {
        const m2 = state.minute % 10;
        return DIGIT_LED_MAP[m2] ? [...DIGIT_LED_MAP[m2]] : [];
    }
    return [];
}

/**
 * Validates that adopting newDigit on digitKey would NOT change the active state
 * of any segment other than the clicked segIdx.
 */
function wouldOtherLedsStayUnchanged(digitKey, currentActive, segIdx, newDigit) {
    let newActive = [];
    if (digitKey === 'h1' || digitKey === 'm1') {
        if (newDigit !== 0) {
            newActive = DIGIT_LED_MAP[newDigit] || [];
        }
    } else {
        newActive = DIGIT_LED_MAP[newDigit] || [];
    }

    for (let s = 0; s < 4; s++) {
        if (s === segIdx) continue;
        const wasActive = currentActive.includes(s);
        const willBeActive = newActive.includes(s);
        if (wasActive !== willBeActive) {
            return false; // Violates "dont change other led state"
        }
    }
    return true;
}

function handleLedClick(digitKey, segIdx) {
    const currentActive = getActiveSegmentsForDigit(digitKey);
    const isCurrentlyLit = currentActive.includes(segIdx);
    let targetSegments = null;

    if (!isCurrentlyLit) {
        // User wants this segment to GLOW
        targetSegments = [...currentActive, segIdx];
    } else {
        // User clicked an already lit segment: toggle it off ONLY IF the resulting state
        // forms a valid digit and does NOT change any other LED
        targetSegments = currentActive.filter(s => s !== segIdx);
    }

    let newDigit = null;

    if (targetSegments.length === 0) {
        // 0 active segments is only valid for 10th-place zero (h1 and m1)
        if (digitKey === 'h1' || digitKey === 'm1') {
            newDigit = 0;
        } else {
            // Unit digits (h2, m2) cannot have 0 segments (digit 0 requires seg 0)
            return;
        }
    } else {
        newDigit = findDigitFromSegments(targetSegments);
        if (newDigit === null) {
            // Combination of segments does not form any digit 0-9
            return;
        }
    }

    // Verify clock bounds for digitKey:
    if (digitKey === 'h1') {
        if (newDigit < 0 || newDigit > 2) return;
        const curH2 = state.hour % 10;
        // If hour tens is set to 2, hour cannot exceed 23
        if (newDigit === 2 && curH2 > 3) return;
        // If unlit clicked and newDigit is 0, dormant 0 doesn't glow seg 0
        if (!isCurrentlyLit && newDigit === 0) return;
    } else if (digitKey === 'h2') {
        if (newDigit < 0 || newDigit > 9) return;
        const curH1 = Math.floor(state.hour / 10);
        if (curH1 === 2 && newDigit > 3) return;
    } else if (digitKey === 'm1') {
        if (newDigit < 0 || newDigit > 5) return;
        if (!isCurrentlyLit && newDigit === 0) return;
    } else if (digitKey === 'm2') {
        if (newDigit < 0 || newDigit > 9) return;
    }

    // Crucial check: verify that NO OTHER LED changes its state!
    if (!wouldOtherLedsStayUnchanged(digitKey, currentActive, segIdx, newDigit)) {
        return;
    }

    // Apply the validated digit
    if (digitKey === 'h1') {
        state.hour = newDigit * 10 + (state.hour % 10);
    } else if (digitKey === 'h2') {
        state.hour = Math.floor(state.hour / 10) * 10 + newDigit;
    } else if (digitKey === 'm1') {
        state.minute = newDigit * 10 + (state.minute % 10);
    } else if (digitKey === 'm2') {
        state.minute = Math.floor(state.minute / 10) * 10 + newDigit;
    }

    // Switch to manual scrubbed mode
    state.isLive = false;
    updateLiveIndicator();

    // Play tactile crystal tap audio
    chronoAudio.playLedTap(1.0 + (segIdx * 0.1));

    // Flare visual animation on the clicked LED segment
    const ledEl = document.getElementById(`${digitKey}-led${segIdx}`);
    if (ledEl) {
        ledEl.classList.remove('just-tapped');
        void ledEl.offsetWidth; // Force reflow
        ledEl.classList.add('just-tapped');
    }

    // Micro-anim on corresponding wheel slot
    const slotEl = document.getElementById(`slot-${digitKey}`);
    if (slotEl) {
        slotEl.classList.remove('drum-anim');
        void slotEl.offsetWidth;
        slotEl.classList.add('drum-anim');
    }

    // Live update LEDs, scrollers, and weekday
    updateLEDMatrix();
    renderAllWheels();
    updateWeekdayDisplay();
}

function setupLedInteractions() {
    const digits = ['h1', 'h2', 'm1', 'm2'];
    digits.forEach(digitKey => {
        for (let seg = 0; seg < 4; seg++) {
            const led = document.getElementById(`${digitKey}-led${seg}`);
            if (led) {
                led.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleLedClick(digitKey, seg);
                });
            }
        }
    });
}

// --------------------------------------------------------
// 9. INDIVIDUAL DIGIT SCROLL WHEELS & 3D DRUM RENDERING
// Formats:
// Time: h1 (0-2), h2 (0-9), m1 (0-5), m2 (0-9)
// Era: Bounded AD / BC (No infinite scroll)
// Year: y1 (thousands), y2 (hundreds), y3 (tens), y4 (units)
// Month: Text JAN-DEC
// Day: d1 (tens 0-3), d2 (units 0-9)
// --------------------------------------------------------
/**
 * Generates the 5 visible slot values for an individual wheel cylinder (3D metal nut).
 * Enforces hard physical boundaries: slots beyond mechanical limits are blank/disabled.
 * @param {string} type - 'h1', 'h2', 'm1', 'm2', 'y1', 'y2', 'y3', 'y4', 'month', 'd1', 'd2'
 */
function getWheelSlots(type) {
    const offsets = [-2, -1, 0, 1, 2];

    // Hour Tens (0-2)
    if (type === 'h1') {
        const curTens = Math.floor(state.hour / 10);
        return offsets.map(offset => {
            if (offset === 0) return { text: String(curTens), step: 0, isCurrent: true };
            const targetTens = curTens + offset;
            if (targetTens < 0 || targetTens > 2) return { text: '', step: 0, disabled: true };
            return { text: String(targetTens), step: offset };
        });
    }

    // Hour Units (0-9, Hard bounded by total hour 0 to 23)
    if (type === 'h2') {
        const curUnits = state.hour % 10;
        return offsets.map(offset => {
            if (offset === 0) return { text: String(curUnits), step: 0, isCurrent: true };
            const targetHour = state.hour + offset;
            if (targetHour < 0 || targetHour > 23) return { text: '', step: 0, disabled: true };
            return { text: String(targetHour % 10), step: offset };
        });
    }

    // Minute Tens (0-5)
    if (type === 'm1') {
        const curTens = Math.floor(state.minute / 10);
        return offsets.map(offset => {
            if (offset === 0) return { text: String(curTens), step: 0, isCurrent: true };
            const targetTens = curTens + offset;
            if (targetTens < 0 || targetTens > 5) return { text: '', step: 0, disabled: true };
            return { text: String(targetTens), step: offset };
        });
    }

    // Minute Units (0-9, Hard bounded by total minute 0 to 59)
    if (type === 'm2') {
        const curUnits = state.minute % 10;
        return offsets.map(offset => {
            if (offset === 0) return { text: String(curUnits), step: 0, isCurrent: true };
            const targetMinute = state.minute + offset;
            if (targetMinute < 0 || targetMinute > 59) return { text: '', step: 0, disabled: true };
            return { text: String(targetMinute % 10), step: offset };
        });
    }

    // Year Digits (y1, y2, y3, y4: 1 to 9999) - Stops at 9999 and 1
    // Individual digit scrolling can keep scrolling changing left side, but not right side wheels
    if (type === 'y1' || type === 'y2' || type === 'y3' || type === 'y4') {
        const multipliers = { y1: 1000, y2: 100, y3: 10, y4: 1 };
        const digitIndices = { y1: 0, y2: 1, y3: 2, y4: 3 };
        const mult = multipliers[type];
        const digitIdx = digitIndices[type];

        return offsets.map(offset => {
            const testYear = state.year + (offset * mult);
            if (testYear < 1 || testYear > 9999) {
                return { text: '', step: 0, disabled: true };
            }
            const testDigits = String(testYear).padStart(4, '0');
            return {
                text: testDigits[digitIdx],
                step: offset,
                isCurrent: offset === 0
            };
        });
    }

    // Month in Text: JAN to DEC (Hard bounded, stops at DEC and JAN)
    if (type === 'month') {
        return offsets.map(offset => {
            if (offset === 0) return { text: MONTH_NAMES[state.month - 1], step: 0, isCurrent: true };
            const targetMonth = state.month + offset;
            if (targetMonth < 1 || targetMonth > 12) return { text: '', step: 0, disabled: true };
            return { text: MONTH_NAMES[targetMonth - 1], step: offset };
        });
    }

    // Day Tens (d1)
    if (type === 'd1') {
        const D = getDaysInMonth(state.year, state.month, state.era);
        const curTens = Math.floor(state.day / 10);
        return offsets.map(offset => {
            if (offset === 0) return { text: String(curTens), step: 0, isCurrent: true };
            const targetDay = state.day + (offset * 10);
            if (targetDay < 1 || targetDay > D) return { text: '', step: 0, disabled: true };
            return { text: String(Math.floor(targetDay / 10)), step: offset };
        });
    }

    // Day Units (d2, Hard bounded by 1 to days in month)
    if (type === 'd2') {
        const D = getDaysInMonth(state.year, state.month, state.era);
        const curUnits = state.day % 10;
        return offsets.map(offset => {
            if (offset === 0) return { text: String(curUnits), step: 0, isCurrent: true };
            const targetDay = state.day + offset;
            if (targetDay < 1 || targetDay > D) return { text: '', step: 0, disabled: true };
            return { text: String(targetDay % 10), step: offset };
        });
    }

    return [];
}

const POS_CLASSES = ['pos-m2', 'pos-m1', 'pos-0', 'pos-p1', 'pos-p2'];

/**
 * Renders a single wheel cylinder (3D metal nut readout)
 */
function renderWheel(type) {
    const cylinder = cylinders[type];
    if (!cylinder) return;

    const slots = getWheelSlots(type);
    cylinder.innerHTML = '';

    slots.forEach((slot, idx) => {
        const div = document.createElement('div');
        div.className = `wheel-item ${POS_CLASSES[idx]}`;
        if (slot.disabled || slot.text === '') {
            div.classList.add('disabled');
        } else {
            div.textContent = slot.text;
            if (slot.step !== 0) {
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    stepWheel(type, slot.step);
                });
            }
        }
        cylinder.appendChild(div);
    });
}

function renderAllWheels() {
    Object.keys(cylinders).forEach(type => renderWheel(type));
}

// --------------------------------------------------------
// 10. WEEKDAY DISPLAY UPDATE (NON-SCROLLER PRECISION POD)
// Live calculated via Zeller's Congruence
// --------------------------------------------------------
function updateWeekdayDisplay() {
    if (!weekdayValueEl) return;
    const currentW = calculateZellerWeekday(state.year, state.month, state.day, state.era);
    if (weekdayValueEl.textContent !== currentW) {
        weekdayValueEl.textContent = currentW;
        if (weekdayPodEl) {
            weekdayPodEl.classList.remove('updating');
            void weekdayPodEl.offsetWidth;
            weekdayPodEl.classList.add('updating');
        }
    }
}

// --------------------------------------------------------
// 11. ERA MECHANICAL METAL TOGGLE SWITCH LEVER (AD / BC)
// --------------------------------------------------------
function updateEraLeverUI() {
    if (!moduleEra || !eraLever) return;
    const isAd = state.era === 'AD';
    if (isAd) {
        moduleEra.classList.add('is-ad');
        moduleEra.classList.remove('is-bc');
        eraLever.classList.add('is-ad');
        eraLever.classList.remove('is-bc');
        moduleEra.setAttribute('aria-checked', 'true');
        if (labelAd) labelAd.classList.add('active');
        if (labelBc) labelBc.classList.remove('active');
    } else {
        moduleEra.classList.add('is-bc');
        moduleEra.classList.remove('is-ad');
        eraLever.classList.add('is-bc');
        eraLever.classList.remove('is-ad');
        moduleEra.setAttribute('aria-checked', 'false');
        if (labelAd) labelAd.classList.remove('active');
        if (labelBc) labelBc.classList.add('active');
    }
}

function toggleEra(explicitEra = null) {
    const targetEra = explicitEra ? explicitEra : (state.era === 'AD' ? 'BC' : 'AD');
    if (targetEra === state.era && explicitEra) return;
    state.isLive = false;
    updateLiveIndicator();
    state.era = targetEra;
    chronoAudio.playLeverToggle();
    updateEraLeverUI();
    updateWeekdayDisplay();

    // Verify day of month validity across era change (e.g. leap years)
    const maxD = getDaysInMonth(state.year, state.month, state.era);
    if (state.day > maxD) {
        state.day = maxD;
    }
    renderAllWheels();
}

function setupLeverInteractions() {
    if (!moduleEra) return;

    if (labelAd) {
        labelAd.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleEra('AD');
        });
    }

    if (labelBc) {
        labelBc.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleEra('BC');
        });
    }

    // Click on toggle lever module
    moduleEra.addEventListener('click', (e) => {
        e.preventDefault();
        toggleEra();
    });

    // Keyboard support: Space / Enter / Up / Down
    moduleEra.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            toggleEra();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            toggleEra('AD');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            toggleEra('BC');
        }
    });

    // Pointer Drag gesture for physical toggle feeling
    let startY = 0;
    let isPointerDown = false;

    moduleEra.addEventListener('pointerdown', (e) => {
        isPointerDown = true;
        startY = e.clientY;
        moduleEra.setPointerCapture(e.pointerId);
    });

    moduleEra.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        const diffY = e.clientY - startY;
        if (diffY < -14) { // Dragged Up -> AD
            toggleEra('AD');
            isPointerDown = false;
        } else if (diffY > 14) { // Dragged Down -> BC
            toggleEra('BC');
            isPointerDown = false;
        }
    });

    const endDrag = (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        try {
            moduleEra.releasePointerCapture(e.pointerId);
        } catch (_) {}
    };

    moduleEra.addEventListener('pointerup', endDrag);
    moduleEra.addEventListener('pointercancel', endDrag);
}

// --------------------------------------------------------
// 12. PHYSICAL MECHANICAL LIMIT FEEDBACK
// Stops scrolling after limits (23hr, 59min, Dec, 9999yr, etc.)
// --------------------------------------------------------
function triggerLimitHit(type, delta) {
    chronoAudio.playLimitHit();
    const slotEl = document.getElementById(`slot-${type}`);
    if (slotEl) {
        slotEl.style.setProperty('--bump-dir', delta > 0 ? '4px' : '-4px');
        slotEl.classList.remove('limit-hit-anim');
        void slotEl.offsetWidth; // Force reflow
        slotEl.classList.add('limit-hit-anim');
    }
}

// --------------------------------------------------------
// 13. WHEEL STEPPING LOGIC WITH STRICT PHYSICAL BOUNDARIES
// Rule: Stop scrolling after limit (no infinite wraps!)
// --------------------------------------------------------
function stepWheel(type, delta) {
    let changed = false;

    // 1. Hour Tens (h1) - Limit: 0 to 2 (Cannot exceed 23 hours total)
    if (type === 'h1') {
        const curTens = Math.floor(state.hour / 10);
        const targetTens = curTens + delta;
        if (targetTens < 0 || targetTens > 2) {
            triggerLimitHit(type, delta);
            return;
        }
        let curH2 = state.hour % 10;
        if (targetTens === 2 && curH2 > 3) curH2 = 3;
        const newHour = targetTens * 10 + curH2;
        if (newHour === state.hour) {
            triggerLimitHit(type, delta);
            return;
        }
        state.hour = newHour;
        changed = true;
    }
    // 2. Hour Units (h2) - Stops after 23hr, stops before 0hr
    else if (type === 'h2') {
        if ((delta > 0 && state.hour >= 23) || (delta < 0 && state.hour <= 0)) {
            triggerLimitHit(type, delta);
            return;
        }
        const targetHour = Math.max(0, Math.min(23, state.hour + delta));
        if (targetHour === state.hour) {
            triggerLimitHit(type, delta);
            return;
        }
        state.hour = targetHour;
        changed = true;
    }
    // 3. Minute Tens (m1) - Limit: 0 to 5
    else if (type === 'm1') {
        const curTens = Math.floor(state.minute / 10);
        const targetTens = curTens + delta;
        if (targetTens < 0 || targetTens > 5) {
            triggerLimitHit(type, delta);
            return;
        }
        const newMinute = targetTens * 10 + (state.minute % 10);
        if (newMinute === state.minute) {
            triggerLimitHit(type, delta);
            return;
        }
        state.minute = newMinute;
        changed = true;
    }
    // 4. Minute Units (m2) - Stops after 59min, stops before 0min
    else if (type === 'm2') {
        if ((delta > 0 && state.minute >= 59) || (delta < 0 && state.minute <= 0)) {
            triggerLimitHit(type, delta);
            return;
        }
        const targetMinute = Math.max(0, Math.min(59, state.minute + delta));
        if (targetMinute === state.minute) {
            triggerLimitHit(type, delta);
            return;
        }
        state.minute = targetMinute;
        changed = true;
    }
    // 5. Year Digits (y1, y2, y3, y4) - Stops after 9999 and before 1:
    // Individual year wheel scrolling can keep scrolling changing left side,
    // but strictly does NOT modify right-side wheels.
    else if (type === 'y1' || type === 'y2' || type === 'y3' || type === 'y4') {
        const multipliers = { y1: 1000, y2: 100, y3: 10, y4: 1 };
        const mult = multipliers[type];
        const targetYear = state.year + (delta * mult);

        if (targetYear < 1 || targetYear > 9999) {
            triggerLimitHit(type, delta);
            return;
        }

        state.year = targetYear;
        changed = true;
    }
    // 9. Month (Stops at JAN and DEC - No wrap)
    else if (type === 'month') {
        if ((delta > 0 && state.month >= 12) || (delta < 0 && state.month <= 1)) {
            triggerLimitHit(type, delta);
            return;
        }
        const targetMonth = Math.max(1, Math.min(12, state.month + delta));
        if (targetMonth === state.month) {
            triggerLimitHit(type, delta);
            return;
        }
        state.month = targetMonth;
        changed = true;
    }
    // 10. Day Units (d2) - Stops at 1 and end of month
    else if (type === 'd2') {
        const D = getDaysInMonth(state.year, state.month, state.era);
        if ((delta > 0 && state.day >= D) || (delta < 0 && state.day <= 1)) {
            triggerLimitHit(type, delta);
            return;
        }
        const targetDay = Math.max(1, Math.min(D, state.day + delta));
        if (targetDay === state.day) {
            triggerLimitHit(type, delta);
            return;
        }
        state.day = targetDay;
        changed = true;
    }
    // 11. Day Tens (d1)
    else if (type === 'd1') {
        const D = getDaysInMonth(state.year, state.month, state.era);
        const curTens = Math.floor(state.day / 10);
        const targetTens = curTens + delta;
        if (targetTens < 0 || targetTens * 10 > D) {
            triggerLimitHit(type, delta);
            return;
        }
        const targetDay = Math.min(D, Math.max(1, targetTens * 10 + (state.day % 10)));
        if (targetDay === state.day) {
            triggerLimitHit(type, delta);
            return;
        }
        state.day = targetDay;
        changed = true;
    }

    if (!changed) return;

    // Clamp days if month/year changed and days exceed max days in month
    const maxD = getDaysInMonth(state.year, state.month, state.era);
    if (state.day > maxD) state.day = maxD;

    // Switch to manual mode
    state.isLive = false;
    updateLiveIndicator();

    // Play mechanical ratchet sound
    chronoAudio.playWheelClick(1.0 + (delta * 0.05));

    // Micro-animation on stepped slot container
    const slotEl = document.getElementById(`slot-${type}`);
    if (slotEl) {
        slotEl.classList.remove('drum-anim');
        void slotEl.offsetWidth; // trigger reflow
        slotEl.classList.add('drum-anim');
    }

    // Live update LED matrix, wheels, and weekday
    updateLEDMatrix();
    renderAllWheels();
    updateWeekdayDisplay();
}

/**
 * Attaches wheel (scroll), drag, and keyboard listeners to all individual wheel slots
 */
function setupWheelInteractions() {
    const slots = document.querySelectorAll('.wheel-slot');

    slots.forEach(slot => {
        const type = slot.getAttribute('data-wheel');
        if (!type) return;

        // Mouse Wheel listener with responsive throttling
        let lastWheelTime = 0;
        slot.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const now = performance.now();
            if (now - lastWheelTime < 60) return;
            lastWheelTime = now;
            const delta = e.deltaY > 0 ? 1 : -1;
            stepWheel(type, delta);
        }, { passive: false });

        // Touch & Pointer Drag listener
        let startY = 0;
        let isPointerDown = false;
        let accumulatedDrag = 0;
        const DRAG_THRESHOLD = 18;

        slot.addEventListener('pointerdown', (e) => {
            isPointerDown = true;
            startY = e.clientY;
            accumulatedDrag = 0;
            slot.setPointerCapture(e.pointerId);
        });

        slot.addEventListener('pointermove', (e) => {
            if (!isPointerDown) return;
            const diffY = e.clientY - startY;
            accumulatedDrag += diffY;
            startY = e.clientY;

            if (Math.abs(accumulatedDrag) >= DRAG_THRESHOLD) {
                const stepDir = accumulatedDrag > 0 ? -1 : 1;
                stepWheel(type, stepDir);
                accumulatedDrag = 0;
            }
        });

        const endDrag = (e) => {
            if (!isPointerDown) return;
            isPointerDown = false;
            try {
                slot.releasePointerCapture(e.pointerId);
            } catch (_) {}
        };

        slot.addEventListener('pointerup', endDrag);
        slot.addEventListener('pointercancel', endDrag);

        // Keyboard arrow navigation
        slot.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                stepWheel(type, -1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                stepWheel(type, 1);
            } else if (e.key === 'PageUp') {
                e.preventDefault();
                stepWheel(type, -2);
            } else if (e.key === 'PageDown') {
                e.preventDefault();
                stepWheel(type, 2);
            }
        });
    });
}

// --------------------------------------------------------
// 14. LIVE TICK LOOP
// --------------------------------------------------------
function tickLive() {
    if (!state.isLive) return;

    const now = new Date();
    const prevMinute = state.minute;
    state.hour = now.getHours();
    state.minute = now.getMinutes();
    state.second = now.getSeconds();
    state.day = now.getDate();
    state.month = now.getMonth() + 1;
    state.year = now.getFullYear();
    state.era = 'AD';

    // Only re-render when minute advances or date changes
    if (prevMinute !== state.minute) {
        updateLEDMatrix();
        renderAllWheels();
        updateWeekdayDisplay();
    }
}

// --------------------------------------------------------
// 15. INITIALIZATION
// --------------------------------------------------------
function init() {
    applyTheme();
    applySoundUI();
    resetToCurrentDateTime();
    setupLedInteractions();
    setupLeverInteractions();
    setupWheelInteractions();
    setInterval(tickLive, 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}