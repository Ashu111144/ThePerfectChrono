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
 * Updates the 4 LED segments of an SVG digit
 * @param {string} prefix - 'h1', 'h2', 'm1', or 'm2'
 * @param {number} digit - 0 to 9
 */
function updateDigitLEDs(prefix, digit) {
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
const ZELLER_DAYS = ['SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI'];
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

// Wheel cylinders (Seconds removed; order: hour, minute, era, year, month, day)
const cylinders = {
    hour: document.getElementById('cylinder-hour'),
    minute: document.getElementById('cylinder-minute'),
    era: document.getElementById('cylinder-era'),
    year: document.getElementById('cylinder-year'),
    month: document.getElementById('cylinder-month'),
    day: document.getElementById('cylinder-day')
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
    updateLEDMatrix();
    renderAllWheels();
    updateWeekdayDisplay();
}

if (btnReset) {
    btnReset.addEventListener('click', resetToCurrentDateTime);
}

function updateLiveIndicator() {
    if (!liveIndicator || !btnReset) return;
    if (state.isLive) {
        liveIndicator.classList.remove('scrubbed');
        btnReset.setAttribute('title', 'Reset to current date & time (Live Sync active)');
    } else {
        liveIndicator.classList.add('scrubbed');
        btnReset.setAttribute('title', 'Click to reset to current date & time');
    }
}

// --------------------------------------------------------
// 7. LED MATRIX UPDATE (HOURS UP, MINUTES DOWN)
// --------------------------------------------------------
function updateLEDMatrix() {
    const h1 = Math.floor(state.hour / 10);
    const h2 = state.hour % 10;
    const m1 = Math.floor(state.minute / 10);
    const m2 = state.minute % 10;

    updateDigitLEDs('h1', h1);
    updateDigitLEDs('h2', h2);
    updateDigitLEDs('m1', m1);
    updateDigitLEDs('m2', m2);
}

// --------------------------------------------------------
// 8. TAP ON LED TO GLOW AND CHANGE TIME ACCORDINGLY
// Directly binds to each segment polygon for immediate interaction
// --------------------------------------------------------
function handleLedClick(digitKey, segIdx) {
    state.isLive = false;
    updateLiveIndicator();

    let currentDigit = 0;
    if (digitKey === 'h1') currentDigit = Math.floor(state.hour / 10);
    else if (digitKey === 'h2') currentDigit = state.hour % 10;
    else if (digitKey === 'm1') currentDigit = Math.floor(state.minute / 10);
    else if (digitKey === 'm2') currentDigit = state.minute % 10;

    const currentActive = [...(DIGIT_LED_MAP[currentDigit] || [0])];
    let newDigit = currentDigit;

    if (currentActive.includes(segIdx)) {
        // Tapped an already glowing LED:
        if (currentActive.length === 2) {
            // Turning it off leaves the other segment
            const remaining = currentActive.filter(s => s !== segIdx);
            newDigit = findDigitFromSegments(remaining);
        } else {
            // Only 1 segment active: advance to pair with adjacent segment
            const nextSeg = (segIdx + 1) % 4;
            newDigit = findDigitFromSegments([segIdx, nextSeg]);
        }
    } else {
        // Tapped an unlit LED: illuminate it!
        if (currentActive.length === 1) {
            // Combine with currently lit segment to form a valid pair
            newDigit = findDigitFromSegments([currentActive[0], segIdx]);
        } else {
            // 2 segments active: replace the first segment with new segment
            newDigit = findDigitFromSegments([currentActive[1], segIdx]);
        }
    }

    if (newDigit === null || newDigit === undefined) {
        newDigit = segIdx; // Fallback to 1-segment digit
    }

    // Enforce 24-hour clock constraints:
    if (digitKey === 'h1') {
        // Tens of hour can only be 0, 1, or 2
        if (newDigit > 2) newDigit = newDigit % 3;
        let curH2 = state.hour % 10;
        if (newDigit === 2 && curH2 > 3) curH2 = 3; // Clamp max 23:xx
        state.hour = newDigit * 10 + curH2;
    } else if (digitKey === 'h2') {
        // Units of hour 0-9
        let curH1 = Math.floor(state.hour / 10);
        if (curH1 === 2 && newDigit > 3) {
            curH1 = 1; // Seamlessly wrap 2x into 1x if tapping higher digit
        }
        state.hour = curH1 * 10 + newDigit;
    } else if (digitKey === 'm1') {
        // Tens of minute 0-5
        if (newDigit > 5) newDigit = newDigit % 6;
        state.minute = newDigit * 10 + (state.minute % 10);
    } else if (digitKey === 'm2') {
        // Units of minute 0-9
        state.minute = Math.floor(state.minute / 10) * 10 + newDigit;
    }

    // Play tactile crystal tap audio
    chronoAudio.playLedTap(1.0 + (segIdx * 0.1));

    // Flare visual animation on the clicked LED segment
    const ledEl = document.getElementById(`${digitKey}-led${segIdx}`);
    if (ledEl) {
        ledEl.classList.remove('just-tapped');
        void ledEl.offsetWidth; // Force CSS reflow
        ledEl.classList.add('just-tapped');
    }

    // Micro-anim on corresponding wheel slot
    const slotType = (digitKey === 'h1' || digitKey === 'h2') ? 'hour' : 'minute';
    const slotEl = document.querySelector(`[data-wheel="${slotType}"]`);
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
// 9. SCROLL WHEEL 3D DRUM RENDERING
// Formats:
// Hour: 00-23
// Minute: 00-59
// Era: Bounded AD / BC (No infinite scroll)
// Year: 0001-9999
// Month: Text JAN-DEC
// Day: 01-31
// --------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');

/**
 * Generates the 5 visible slot values for a wheel cylinder
 * @param {string} type - 'hour', 'minute', 'era', 'year', 'month', 'day'
 */
function getWheelSlots(type) {
    if (type === 'hour') {
        const val = state.hour;
        return [
            { text: pad2((val - 2 + 24) % 24), step: -2 },
            { text: pad2((val - 1 + 24) % 24), step: -1 },
            { text: pad2(val), step: 0, isCurrent: true },
            { text: pad2((val + 1) % 24), step: 1 },
            { text: pad2((val + 2) % 24), step: 2 }
        ];
    }

    if (type === 'minute') {
        const val = state.minute;
        return [
            { text: pad2((val - 2 + 60) % 60), step: -2 },
            { text: pad2((val - 1 + 60) % 60), step: -1 },
            { text: pad2(val), step: 0, isCurrent: true },
            { text: pad2((val + 1) % 60), step: 1 },
            { text: pad2((val + 2) % 60), step: 2 }
        ];
    }

    // Bounded Era (No infinite scroll)
    if (type === 'era') {
        if (state.era === 'BC') {
            return [
                { text: '', step: 0, disabled: true },
                { text: '', step: 0, disabled: true },
                { text: 'BC', step: 0, isCurrent: true },
                { text: 'AD', step: 1 },
                { text: '', step: 0, disabled: true }
            ];
        } else {
            return [
                { text: '', step: 0, disabled: true },
                { text: 'BC', step: -1 },
                { text: 'AD', step: 0, isCurrent: true },
                { text: '', step: 0, disabled: true },
                { text: '', step: 0, disabled: true }
            ];
        }
    }

    if (type === 'year') {
        const val = state.year;
        return [
            { text: val - 2 >= 1 ? pad4(val - 2) : '', step: -2, disabled: val - 2 < 1 },
            { text: val - 1 >= 1 ? pad4(val - 1) : '', step: -1, disabled: val - 1 < 1 },
            { text: pad4(val), step: 0, isCurrent: true },
            { text: val + 1 <= 9999 ? pad4(val + 1) : '', step: 1, disabled: val + 1 > 9999 },
            { text: val + 2 <= 9999 ? pad4(val + 2) : '', step: 2, disabled: val + 2 > 9999 }
        ];
    }

    // Month in Text: JAN, FEB, MAR, ..., DEC
    if (type === 'month') {
        const idx = state.month - 1; // 0 to 11
        return [
            { text: MONTH_NAMES[(idx - 2 + 12) % 12], step: -2 },
            { text: MONTH_NAMES[(idx - 1 + 12) % 12], step: -1 },
            { text: MONTH_NAMES[idx], step: 0, isCurrent: true },
            { text: MONTH_NAMES[(idx + 1) % 12], step: 1 },
            { text: MONTH_NAMES[(idx + 2) % 12], step: 2 }
        ];
    }

    if (type === 'day') {
        const D = getDaysInMonth(state.year, state.month, state.era);
        const val = state.day;
        return [
            { text: pad2((val - 3 + D) % D + 1), step: -2 },
            { text: pad2((val - 2 + D) % D + 1), step: -1 },
            { text: pad2(val), step: 0, isCurrent: true },
            { text: pad2((val % D) + 1), step: 1 },
            { text: pad2(((val + 1) % D) + 1), step: 2 }
        ];
    }

    return [];
}

const POS_CLASSES = ['pos-m2', 'pos-m1', 'pos-0', 'pos-p1', 'pos-p2'];

/**
 * Renders a single wheel cylinder
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
// 11. WHEEL STEPPING & INTERACTION
// Bounded AD/BC (no infinite scroll), month in text, acoustic clicks
// --------------------------------------------------------
function stepWheel(type, delta) {
    // If era is at boundary, do not step and do not trigger audio
    if (type === 'era') {
        if (delta > 0 && state.era === 'BC') {
            state.era = 'AD';
        } else if (delta < 0 && state.era === 'AD') {
            state.era = 'BC';
        } else {
            return; // Hard boundary reached: no infinite scroll!
        }
    } else if (type === 'year') {
        const nextYear = state.year + delta;
        if (nextYear < 1 || nextYear > 9999) return;
        state.year = nextYear;
    } else if (type === 'hour') {
        state.hour = ((state.hour + delta) % 24 + 24) % 24;
    } else if (type === 'minute') {
        state.minute = ((state.minute + delta) % 60 + 60) % 60;
    } else if (type === 'month') {
        state.month = ((state.month - 1 + delta) % 12 + 12) % 12 + 1;
    } else if (type === 'day') {
        const D = getDaysInMonth(state.year, state.month, state.era);
        state.day = ((state.day - 1 + delta) % D + D) % D + 1;
    }

    // Clamp days if month/year changed and days exceed max
    const maxD = getDaysInMonth(state.year, state.month, state.era);
    if (state.day > maxD) state.day = maxD;

    // Switch to manual mode
    state.isLive = false;
    updateLiveIndicator();

    // Play mechanical ratchet sound
    chronoAudio.playWheelClick(1.0 + (delta * 0.05));

    // Micro-animation on stepped slot container
    const slotEl = document.querySelector(`[data-wheel="${type}"]`);
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
 * Attaches wheel (scroll), drag, and keyboard listeners to wheel slots
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
                stepWheel(type, type === 'year' ? -10 : -5);
            } else if (e.key === 'PageDown') {
                e.preventDefault();
                stepWheel(type, type === 'year' ? 10 : 5);
            }
        });
    });

    // Era slot click toggle
    const eraSlot = document.querySelector('.era-slot');
    if (eraSlot) {
        eraSlot.addEventListener('click', () => {
            stepWheel('era', state.era === 'BC' ? 1 : -1);
        });
    }
}

// --------------------------------------------------------
// 12. LIVE TICK LOOP
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
// 13. INITIALIZATION
// --------------------------------------------------------
function init() {
    applyTheme();
    applySoundUI();
    resetToCurrentDateTime();
    setupLedInteractions();
    setupWheelInteractions();
    setInterval(tickLive, 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}