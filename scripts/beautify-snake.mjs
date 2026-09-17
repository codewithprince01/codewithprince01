import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function smoothSnake(filePath, snakeColor = null) {
  if (!fs.existsSync(filePath)) return;
  let svg = fs.readFileSync(filePath, 'utf8');

  // Preserve all original green chart dots colors completely!
  // Only smooth snake corners so it glides cleanly
  svg = svg.replace(/rx="4\.5" ry="4\.5"/g, 'rx="6" ry="6"');

  // Add subtle smoothing transition for snake movement
  if (!svg.includes('transition: transform 0.1s')) {
    svg = svg.replace('.s{', '.s{transition: transform 0.1s ease-out; ');
  }

  fs.writeFileSync(filePath, svg, 'utf8');
  console.log(`Smoothed ${path.basename(filePath)} while preserving original green chart colors!`);
}

smoothSnake(path.resolve(root, 'output/github-contribution-grid-snake-dark.svg'));
smoothSnake(path.resolve(root, 'output/github-contribution-grid-snake.svg'));

