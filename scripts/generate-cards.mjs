#!/usr/bin/env node
/**
 * Generates the README contribution activity chart as SVG files in output/.
 * Runs in GitHub Actions with the built-in GITHUB_TOKEN, so the README never
 * depends on a third-party rendering service that can go down.
 *
 * Usage: node scripts/generate-cards.mjs            (needs GITHUB_TOKEN, optional GH_USER)
 *        Without a token it falls back to a public mirror of the contribution calendar.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'output');
const USER = process.env.GH_USER || 'codewithprince01';

const THEMES = {
  light: {
    suffix: '',
    bg: '#f8f9fa',
    border: '#e3e6ea',
    title: '#667eea',
    muted: '#6b7280',
    accent: '#764ba2',
    grid: '#e3e6ea',
  },
  dark: {
    suffix: '-dark',
    bg: '#0d1117',
    border: '#27303d',
    title: '#8ea2ff',
    muted: '#8b949e',
    accent: '#b08cff',
    grid: '#21262d',
  },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

async function graphql(query, variables = {}) {
  // PROFILE_TOKEN (a classic PAT) wins if set; otherwise the Actions GITHUB_TOKEN is enough.
  const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('No token: set PROFILE_TOKEN or GITHUB_TOKEN');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: 'bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-card-generator',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error('GitHub API ' + res.status + ': ' + (await res.text()));
  const body = await res.json();
  if (body.errors) throw new Error('GraphQL: ' + body.errors.map((e) => e.message).join('; '));
  return body.data;
}

const PROFILE_QUERY = `
query($login: String!) {
  user(login: $login) {
    name
    login
    contributionsCollection { contributionYears }
  }
}`;

const YEAR_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

// Every contribution day the user has ever had, straight from GitHub's GraphQL API.
async function fetchDaysGraphQL() {
  const { user } = await graphql(PROFILE_QUERY, { login: USER });
  const days = [];
  for (const year of user.contributionsCollection.contributionYears) {
    const data = await graphql(YEAR_QUERY, {
      login: USER,
      from: year + '-01-01T00:00:00Z',
      to: year + '-12-31T23:59:59Z',
    });
    for (const w of data.user.contributionsCollection.contributionCalendar.weeks) days.push(...w.contributionDays);
  }
  return { name: user.name || user.login, days };
}

// Fallback without a token: public mirror of the profile contribution calendar.
async function fetchDaysPublic() {
  const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=all`);
  if (!res.ok) throw new Error('Public contributions API ' + res.status);
  const data = await res.json();
  return { name: USER, days: data.contributions.map((d) => ({ date: d.date, contributionCount: d.count })) };
}

async function fetchProfile() {
  let result;
  if (process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN) {
    try {
      result = await fetchDaysGraphQL();
    } catch (e) {
      console.warn('GraphQL API error, falling back to public contributions API:', e.message);
    }
  }
  if (!result) result = await fetchDaysPublic();

  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map();
  for (const d of result.days) if (d.date <= today) byDate.set(d.date, d.contributionCount);
  const days = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, contributionCount]) => ({ date, contributionCount }));
  if (!days.length) throw new Error('No contribution data returned for ' + USER);

  return { name: result.name, login: USER, days, stats: computeStats(days) };
}

function computeStats(days) {
  const total = days.reduce((s, d) => s + d.contributionCount, 0);
  const first = days.find((d) => d.contributionCount > 0);

  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null, end: null };
  for (const d of days) {
    if (d.contributionCount > 0) {
      run = run.length ? { ...run, length: run.length + 1, end: d.date } : { length: 1, start: d.date, end: d.date };
      if (run.length > longest.length) longest = run;
    } else {
      run = { length: 0, start: null, end: null };
    }
  }

  // The current streak survives a still-empty today; it only breaks after a full day without contributions.
  let i = days.length - 1;
  if (days[i].contributionCount === 0) i--;
  let current = { length: 0, start: null, end: null };
  for (let j = i; j >= 0 && days[j].contributionCount > 0; j--) {
    current = { length: current.length + 1, start: days[j].date, end: days[i].date };
  }

  return { total, firstDate: first ? first.date : days[0].date, current, longest };
}

const fmtDate = (iso, withYear = false) =>
  new Date(iso + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

function fmtRange({ start, end }) {
  if (!start) return 'No active streak';
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const thisYear = end.slice(0, 4) === new Date().toISOString().slice(0, 4);
  if (start === end) return fmtDate(start, !thisYear);
  return fmtDate(start, !sameYear || !thisYear) + ' - ' + fmtDate(end, !sameYear || !thisYear);
}

/* ---------------------------------------------------------------- rendering */

const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif";

function frame({ width, height, theme, title, body }) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <style>
    .card-title { font: 600 17px ${FONT}; fill: ${theme.title}; }
    .muted { font: 400 11px ${FONT}; fill: ${theme.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${theme.bg}" stroke="${theme.border}" />
  <text x="24" y="34" class="card-title">${esc(title)}</text>
${body}
</svg>
`;
}

function activityCard(p, theme) {
  const width = 820;
  const height = 270;
  const left = 46;
  const right = width - 24;
  const topY = 60;
  const bottomY = height - 70;

  // Every month since the first contribution, so this chart and the streak card share one all-time total
  const firstMonth = p.stats.firstDate.slice(0, 7);
  const byMonth = new Map();
  for (const d of p.days) {
    const m = d.date.slice(0, 7);
    if (m < firstMonth) continue;
    byMonth.set(m, (byMonth.get(m) || 0) + d.contributionCount);
  }
  const weeks = [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([m, count]) => ({ date: m + '-01', count }));
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const stepX = (right - left) / Math.max(1, weeks.length - 1);
  const x = (i) => left + i * stepX;
  const y = (v) => bottomY - (v / max) * (bottomY - topY);

  const points = weeks.map((w, i) => x(i).toFixed(1) + ',' + y(w.count).toFixed(1));
  const gradId = 'areaGrad' + theme.suffix.replace(/[^a-zA-Z0-9]/g, '');
  const defs = `  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.32" />
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0.02" />
    </linearGradient>
  </defs>`;

  const area = `  <polygon points="${left},${bottomY} ${points.join(' ')} ${right},${bottomY}" fill="url(#${gradId})" />`;
  const line = `  <polyline points="${points.join(' ')}" fill="none" stroke="${theme.accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const gy = bottomY - f * (bottomY - topY);
      return `  <line x1="${left}" y1="${gy.toFixed(1)}" x2="${right}" y2="${gy.toFixed(1)}" stroke="${theme.grid}" stroke-width="1" stroke-dasharray="3,3" />
  <text x="${left - 8}" y="${(gy + 4).toFixed(1)}" class="muted" text-anchor="end">${Math.round(max * f)}</text>`;
    })
    .join('\n');

  // One label per month, tilted so every month fits without overlapping
  const monthTicks = weeks
    .map((w, i) => {
      const d = new Date(w.date + 'T00:00:00Z');
      const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + " '" + String(d.getUTCFullYear()).slice(2);
      const tx = x(i).toFixed(1);
      const ty = bottomY + 14;
      return `  <line x1="${tx}" y1="${bottomY}" x2="${tx}" y2="${bottomY + 4}" stroke="${theme.grid}" stroke-width="1" />
  <text x="${tx}" y="${ty}" class="muted" font-size="10" text-anchor="end" transform="rotate(-45 ${tx} ${ty})">${label}</text>`;
    })
    .filter(Boolean)
    .join('\n');

  const peakIdx = weeks.reduce((best, w, i) => (w.count > weeks[best].count ? i : best), 0);
  const peak = `  <circle cx="${x(peakIdx).toFixed(1)}" cy="${y(weeks[peakIdx].count).toFixed(1)}" r="4" fill="${theme.accent}" />
  <circle cx="${x(peakIdx).toFixed(1)}" cy="${y(weeks[peakIdx].count).toFixed(1)}" r="8" fill="${theme.accent}" fill-opacity="0.25" />`;

  const totalPeriodContribs = weeks.reduce((s, w) => s + w.count, 0);
  const since = new Date(p.stats.firstDate + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const stamp = `  <text x="${right}" y="34" class="muted" text-anchor="end">Monthly contributions (${totalPeriodContribs.toLocaleString('en-US')} since ${since})</text>`;

  return frame({
    width,
    height,
    theme,
    title: 'Contribution Activity',
    body: defs + '\n' + gridLines + '\n' + area + '\n' + line + '\n' + peak + '\n' + monthTicks + '\n' + stamp,
  });
}

function streakCard(p, theme) {
  const isDark = theme.suffix === '-dark';
  const bg = isDark ? '#0d1117' : '#f8f9fa';
  const border = isDark ? '#27303d' : '#e3e6ea';
  const stroke = '#00dfd8';
  const ring = '#7928ca';
  const fire = '#ff007f';
  const sideNums = '#7928ca';
  const sideLabels = isDark ? '#c9d1d9' : '#333333';
  const currStreakNum = '#00dfd8';
  const currStreakLabel = isDark ? '#c9d1d9' : '#333333';
  const dates = isDark ? '#8b949e' : '#6b7280';

  const { total, firstDate, current, longest } = p.stats;
  const totalFormatted = total.toLocaleString('en-US');
  const totalRange = fmtDate(firstDate, true) + ' - Present';
  const cur = current.length;
  const max = longest.length;
  const curDateStr = fmtRange(current);
  const longestRange = fmtRange(longest);

  return `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'
                style='isolation: isolate' viewBox='0 0 495 195' width='495px' height='195px' direction='ltr'>
        <style>
            @keyframes currstreak {
                0% { font-size: 3px; opacity: 0.2; }
                80% { font-size: 34px; opacity: 1; }
                100% { font-size: 28px; opacity: 1; }
            }
            @keyframes fadein {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
        </style>
        <defs>
            <clipPath id='outer_rectangle_${theme.suffix}'>
                <rect width='495' height='195' rx='10'/>
            </clipPath>
            <mask id='mask_out_ring_behind_fire_${theme.suffix}'>
                <rect width='495' height='195' fill='white'/>
                <ellipse cx='247.5' cy='32' rx='13' ry='18' fill='black'/>
            </mask>
        </defs>
        <g clip-path='url(#outer_rectangle_${theme.suffix})'>
            <g style='isolation: isolate'>
                <rect stroke='${border}' stroke-width='1' rx='10' x='0.5' y='0.5' width='494' height='194' fill='${bg}' />
            </g>
            <g style='isolation: isolate'>
                <line x1='165' y1='28' x2='165' y2='170' vector-effect='non-scaling-stroke' stroke-width='1' stroke='${stroke}' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>
                <line x1='330' y1='28' x2='330' y2='170' vector-effect='non-scaling-stroke' stroke-width='1' stroke='${stroke}' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>
            </g>
            <g style='isolation: isolate'>
                <!-- Total Contributions big number (2026) -->
                <g transform='translate(82.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${sideNums}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.6s'>
                        ${totalFormatted}
                    </text>
                </g>

                <!-- Total Contributions label -->
                <g transform='translate(82.5, 84)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${sideLabels}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.7s'>
                        Total Contributions
                    </text>
                </g>

                <!-- Total Contributions range -->
                <g transform='translate(82.5, 114)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${dates}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.8s'>
                        ${totalRange}
                    </text>
                </g>
            </g>
            <g style='isolation: isolate'>
                <!-- Current Streak label -->
                <g transform='translate(247.5, 108)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${currStreakLabel}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>
                        Current Streak
                    </text>
                </g>

                <!-- Current Streak range -->
                <g transform='translate(247.5, 145)'>
                    <text x='0' y='21' stroke-width='0' text-anchor='middle' fill='${dates}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>
                        ${curDateStr}
                    </text>
                </g>

                <!-- Ring around number -->
                <g mask='url(#mask_out_ring_behind_fire_${theme.suffix})'>
                    <circle cx='247.5' cy='71' r='40' fill='none' stroke='${ring}' stroke-width='5' style='opacity: 0; animation: fadein 0.5s linear forwards 0.4s'></circle>
                </g>
                <!-- Fire icon -->
                <g transform='translate(247.5, 19.5)' stroke-opacity='0' style='opacity: 0; animation: fadein 0.5s linear forwards 0.6s'>
                    <path d='M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z' fill='none'/>
                    <path d='M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z' fill='${fire}' stroke-opacity='0'/>
                </g>

                <!-- Current Streak big number -->
                <g transform='translate(247.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${currStreakNum}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='animation: currstreak 0.6s linear forwards'>
                        ${cur}
                    </text>
                </g>

            </g>
            <g style='isolation: isolate'>
                <!-- Longest Streak big number -->
                <g transform='translate(412.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${sideNums}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.2s'>
                        ${max}
                    </text>
                </g>

                <!-- Longest Streak label -->
                <g transform='translate(412.5, 84)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${sideLabels}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.3s'>
                        Longest Streak
                    </text>
                </g>

                <!-- Longest Streak range -->
                <g transform='translate(412.5, 114)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${dates}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.4s'>
                        ${longestRange}
                    </text>
                </g>
            </g>
        </g>
    </svg>`;
}

/* -------------------------------------------------------------------- main */

const profile = await fetchProfile();

await mkdir(OUT_DIR, { recursive: true });
const written = [];
for (const theme of Object.values(THEMES)) {
  const name = 'activity-graph' + theme.suffix + '.svg';
  await writeFile(resolve(OUT_DIR, name), activityCard(profile, theme), 'utf8');
  written.push(name);

  const streakName = 'streak-stats' + theme.suffix + '.svg';
  await writeFile(resolve(OUT_DIR, streakName), streakCard(profile, theme), 'utf8');
  written.push(streakName);
}

console.log('Generated ' + written.length + ' charts for ' + profile.login + ':');
for (const name of written) console.log('  output/' + name);

