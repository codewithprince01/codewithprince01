import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function beautifyDarkSnake() {
  const file = path.resolve(root, 'output/github-contribution-grid-snake-dark.svg');
  if (!fs.existsSync(file)) return;
  let svg = fs.readFileSync(file, 'utf8');

  // Update root colors: rich GitHub dark background, elegant teal/cyan glow levels
  svg = svg.replace(
    /:root\{[^}]+\}/,
    ':root{--cb:#21262d;--cs:#00DFD8;--ce:#161b22;--c0:#161b22;--c1:#0e3a34;--c2:#126359;--c3:#16a390;--c4:#00DFD8}'
  );

  // Upgrade .s (snake) CSS with glowing neon aesthetic and smooth gradient body segments
  const customSnakeCss = `
.s {
  shape-rendering: geometricPrecision;
  transition: all 0.2s ease;
}
.s.s0 {
  fill: #00DFD8 !important;
  filter: drop-shadow(0 0 6px #00DFD8);
  rx: 6px;
  ry: 6px;
}
.s.s1 {
  fill: #38BDF8 !important;
  filter: drop-shadow(0 0 4px #38BDF8);
  rx: 5.5px;
  ry: 5.5px;
}
.s.s2 {
  fill: #818CF8 !important;
  filter: drop-shadow(0 0 3px #818CF8);
  rx: 5px;
  ry: 5px;
}
.s.s3 {
  fill: #A855F7 !important;
  filter: drop-shadow(0 0 3px #A855F7);
  rx: 4.5px;
  ry: 4.5px;
}
.c {
  rx: 3px;
  ry: 3px;
}
`;

  // Inject custom CSS right after <style>
  if (!svg.includes('.s.s0{fill:#00DFD8') && !svg.includes('filter: drop-shadow(0 0 6px #00DFD8)')) {
    svg = svg.replace('<style>', '<style>' + customSnakeCss.replace(/\s+/g, ' '));
  }

  // Round corners on snake segments
  svg = svg.replace(/rx="4\.5" ry="4\.5"/g, 'rx="5.5" ry="5.5"');
  svg = svg.replace(/rx="2" ry="2"/g, 'rx="3" ry="3"');

  fs.writeFileSync(file, svg, 'utf8');
  console.log('Beautified github-contribution-grid-snake-dark.svg successfully!');
}

function beautifyLightSnake() {
  const file = path.resolve(root, 'output/github-contribution-grid-snake.svg');
  if (!fs.existsSync(file)) return;
  let svg = fs.readFileSync(file, 'utf8');

  svg = svg.replace(
    /:root\{[^}]+\}/,
    ':root{--cb:#e1e4e8;--cs:#0070F3;--ce:#ebedf0;--c0:#ebedf0;--c1:#9be9a8;--c2:#40c463;--c3:#30a14e;--c4:#216e39}'
  );

  const customLightSnakeCss = `
.s.s0 {
  fill: #0070F3 !important;
  filter: drop-shadow(0 0 4px rgba(0, 112, 243, 0.6));
  rx: 6px;
  ry: 6px;
}
.s.s1 {
  fill: #4F46E5 !important;
  rx: 5.5px;
  ry: 5.5px;
}
.s.s2 {
  fill: #7928CA !important;
  rx: 5px;
  ry: 5px;
}
.s.s3 {
  fill: #9333EA !important;
  rx: 4.5px;
  ry: 4.5px;
}
.c {
  rx: 3px;
  ry: 3px;
}
`;

  if (!svg.includes('filter: drop-shadow(0 0 4px rgba(0, 112, 243, 0.6))')) {
    svg = svg.replace('<style>', '<style>' + customLightSnakeCss.replace(/\s+/g, ' '));
  }

  svg = svg.replace(/rx="4\.5" ry="4\.5"/g, 'rx="5.5" ry="5.5"');
  svg = svg.replace(/rx="2" ry="2"/g, 'rx="3" ry="3"');

  fs.writeFileSync(file, svg, 'utf8');
  console.log('Beautified github-contribution-grid-snake.svg successfully!');
}

beautifyDarkSnake();
beautifyLightSnake();
