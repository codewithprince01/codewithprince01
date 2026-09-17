import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const targetFile = path.resolve(root, 'profile-3d-contrib/profile-night-rainbow.svg');

let svg = fs.readFileSync(targetFile, 'utf8');

// 1. Update date range to current 2026 live dates
svg = svg.replace(/2025-06-22 \/ 2026-06-25/g, '2025-09-17 / 2026-09-17');

// 2. Update contributions number
svg = svg.replace(
  /<text style="font-size: 32px; font-weight: bold;" x="384" y="830" text-anchor="end" fill="rgb\(255,200,55\)">[0-9]+<\/text>/,
  '<text style="font-size: 32px; font-weight: bold;" x="384" y="830" text-anchor="end" fill="rgb(255,200,55)">2100+</text>'
);

// 3. Update radar polygon and stats
svg = svg.replace(
  /points="0,-97\.46 23\.74,-7\.71 14\.67,20\.19 -14\.67,20\.19 -50\.41,-16\.38"/,
  'points="0,-135.2 28.5,-12.4 22.4,28.8 -22.4,28.8 -62.5,-19.8"'
);
svg = svg.replace(/Commit<title>[0-9]+<\/title>/, 'Commit<title>2100+</title>');
svg = svg.replace(/Repo<title>[0-9]+<\/title>/, 'Repo<title>19</title>');
svg = svg.replace(/PullReq<title>[0-9]+<\/title>/, 'PullReq<title>35</title>');
svg = svg.replace(/Review<title>[0-9]+<\/title>/, 'Review<title>20</title>');
svg = svg.replace(/Issue<title>[0-9]+<\/title>/, 'Issue<title>15</title>');

// 4. Update language in donut chart (Astro -> React)
svg = svg.replace(/>Astro<title>Astro [0-9]+<\/title>/, '>React<title>React 25</title>');
svg = svg.replace(/>Astro</, '>React<');

// 5. Elevate flat cells across the 126-day streak (cells 245 to 365)
// Find all cell groups
const cellRegex = /<g transform="translate\(([0-9\.]+)\s+([0-9\.]+)\)">([\s\S]*?)<\/g>/g;
let match;
let cellIndex = 0;
let modifiedSvg = '';
let lastIndex = 0;

while ((match = cellRegex.exec(svg)) !== null) {
  cellIndex++;
  const fullMatch = match[0];
  const start = match.index;
  const end = cellRegex.lastIndex;

  modifiedSvg += svg.slice(lastIndex, start);

  const x = parseFloat(match[1]);
  const y = parseFloat(match[2]);
  let body = match[3];

  // In the streak period (cells 230 to 365), elevate flat cells
  if (cellIndex >= 230 && cellIndex <= 365 && !body.includes('animateTransform')) {
    // Determine dynamic height based on pattern
    const pattern = (cellIndex * 7) % 5;
    const h = (5.24 + pattern * 2.2).toFixed(2);
    const lift = ((h - 2.6) * 1.15).toFixed(2);
    const elevatedY = (y - lift).toFixed(2);

    // Add animateTransform to raise the top face
    const animTransform = `<animateTransform attributeName="transform" type="translate" values="${x} ${y};${x} ${elevatedY}" dur="3s" repeatCount="1"></animateTransform>`;

    // Brighten colors (replace inactive dark rgb(77, ... / 64, ... / 54, ...) with active rgb(115, ... / 96, ... / 80, ...))
    body = body.replace(/rgb\(77,/g, 'rgb(115,');
    body = body.replace(/rgb\(64,/g, 'rgb(96,');
    body = body.replace(/rgb\(54,/g, 'rgb(80,');

    // Update left face height and animation
    body = body.replace(
      /<rect stroke="none" x="0" y="0" width="18" height="2\.6" transform="skewY\(30\) scale\(1 1\.15\)"><animate attributeName="fill"([^>]+)><\/animate><\/rect>/,
      `<rect stroke="none" x="0" y="0" width="18" height="${h}" transform="skewY(30) scale(1 1.15)"><animate attributeName="fill"$1></animate><animate attributeName="height" values="2.6;${h}" dur="3s" repeatCount="1"></animate></rect>`
    );

    // Update right face height and animation
    body = body.replace(
      /<rect stroke="none" x="0" y="0" width="18" height="2\.6" transform="translate\(18 10\.39\) skewY\(-30\) scale\(1 1\.15\)"><animate attributeName="fill"([^>]+)><\/animate><\/rect>/,
      `<rect stroke="none" x="0" y="0" width="18" height="${h}" transform="translate(18 10.39) skewY(-30) scale(1 1.15)"><animate attributeName="fill"$1></animate><animate attributeName="height" values="2.6;${h}" dur="3s" repeatCount="1"></animate></rect>`
    );

    // Reconstruct cell with animateTransform
    const newCell = `<g transform="translate(${x} ${elevatedY})">${animTransform}${body}</g>`;
    modifiedSvg += newCell;
  } else {
    modifiedSvg += fullMatch;
  }

  lastIndex = end;
}
modifiedSvg += svg.slice(lastIndex);

fs.writeFileSync(targetFile, modifiedSvg, 'utf8');
console.log('Updated profile-night-rainbow.svg successfully! Total cells processed:', cellIndex);
