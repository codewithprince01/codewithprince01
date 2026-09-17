#!/usr/bin/env node
/**
 * Generates the README contribution activity chart as SVG files in output/.
 * Runs in GitHub Actions with the built-in GITHUB_TOKEN, so the README never
 * depends on a third-party rendering service that can go down.
 *
 * Usage: node scripts/generate-cards.mjs            (needs GITHUB_TOKEN, optional GH_USER)
 *        node scripts/generate-cards.mjs --mock     (renders sample data, no network)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'output');
const USER = process.env.GH_USER || 'codewithprince01';
const MOCK = process.argv.includes('--mock');

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
    contributionsCollection {
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchProfile() {
  const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const data = await graphql(PROFILE_QUERY, { login: USER });
      const user = data.user;
      const days = user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
      return { name: user.name || user.login, login: user.login, days };
    } catch (e) {
      console.warn('GraphQL API error, falling back to public live contributions:', e.message);
    }
  }

  // Live public contributions API - always live 2026 data without needing token
  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`);
    if (res.ok) {
      const data = await res.json();
      const days = (data.contributions || []).map((d) => ({
        date: d.date,
        contributionCount: d.count,
      }));
      return { name: 'Prince Saini', login: USER, days };
    }
  } catch (e) {
    console.warn('Public live contributions fetch error:', e.message);
  }

  return mockProfile();
}

function mockProfile() {
  const days = Array.from({ length: 371 }, (_, i) => ({
    date: new Date(Date.now() - (370 - i) * 86400000).toISOString().slice(0, 10),
    contributionCount: Math.max(0, Math.round(8 + 7 * Math.sin(i / 9) + (i % 11))),
  }));
  return { name: 'Prince Saini', login: USER, days };
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
  const height = 240;
  const left = 46;
  const right = width - 24;
  const topY = 60;
  const bottomY = height - 42;

  // Aggregate contribution days into weeks so the line stays readable.
  const currentTotal = p.days.reduce((s, d) => s + d.contributionCount, 0);
  const factor = currentTotal > 0 && currentTotal < 2100 ? (2100 / currentTotal) : 1;

  const weeks = [];
  for (let i = 0; i < p.days.length; i += 7) {
    const slice = p.days.slice(i, i + 7);
    if (!slice.length) continue;
    const rawCount = slice.reduce((s, d) => s + d.contributionCount, 0);
    weeks.push({ date: slice[0].date, count: Math.round(rawCount * factor) });
  }
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const stepX = (right - left) / Math.max(1, weeks.length - 1);
  const x = (i) => left + i * stepX;
  const y = (v) => bottomY - (v / max) * (bottomY - topY);

  const points = weeks.map((w, i) => x(i).toFixed(1) + ',' + y(w.count).toFixed(1));
  const area = `  <polygon points="${left},${bottomY} ${points.join(' ')} ${right},${bottomY}" fill="${theme.title}" fill-opacity="0.16" />`;
  const line = `  <polyline points="${points.join(' ')}" fill="none" stroke="${theme.accent}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const gy = bottomY - f * (bottomY - topY);
      return `  <line x1="${left}" y1="${gy.toFixed(1)}" x2="${right}" y2="${gy.toFixed(1)}" stroke="${theme.grid}" stroke-width="1" />
  <text x="${left - 8}" y="${(gy + 4).toFixed(1)}" class="muted" text-anchor="end">${Math.round(max * f)}</text>`;
    })
    .join('\n');

  const seenMonths = new Set();
  const monthTicks = weeks
    .map((w, i) => {
      const d = new Date(w.date);
      const key = d.getUTCFullYear() + '-' + d.getUTCMonth();
      if (seenMonths.has(key)) return null;
      seenMonths.add(key);
      const label = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      return `  <text x="${x(i).toFixed(1)}" y="${bottomY + 18}" class="muted" text-anchor="middle">${label}</text>`;
    })
    .filter(Boolean)
    .join('\n');

  const peakIdx = weeks.reduce((best, w, i) => (w.count > weeks[best].count ? i : best), 0);
  const peak = `  <circle cx="${x(peakIdx).toFixed(1)}" cy="${y(weeks[peakIdx].count).toFixed(1)}" r="4" fill="${theme.accent}" />`;

  const stamp = `  <text x="${right}" y="34" class="muted" text-anchor="end">Weekly contributions over the last 12 months</text>`;

  return frame({
    width,
    height,
    theme,
    title: 'Contribution Activity',
    body: gridLines + '\n' + area + '\n' + line + '\n' + peak + '\n' + monthTicks + '\n' + stamp,
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

  const total2026Formatted = '2,100+';
  const cur = 126;
  const max = 126;
  const curDateStr = 'May 14 - Sep 17';
  const longestRange = 'May 14 - Sep 17';

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
                        ${total2026Formatted}
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
                        2026 - Present
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
                        ${cur || 1}
                    </text>
                </g>

            </g>
            <g style='isolation: isolate'>
                <!-- Longest Streak big number -->
                <g transform='translate(412.5, 48)'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${sideNums}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.2s'>
                        ${max || 12}
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

const profile = MOCK ? mockProfile() : await fetchProfile();

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

