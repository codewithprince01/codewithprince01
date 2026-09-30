import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// Default is 1.0 (original standard arcade pace: ~200s, 5 steps/sec, 0.5s mouth).
// Keeps motion steady, calm and completely clear.
const SPEED_FACTOR = 1.0; 

function smoothPacman(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return;
  }

  let svg = fs.readFileSync(filePath, 'utf8');

  // 1. Add viewBox to the root <svg> tag if missing so browser can GPU-render and scale without lagging/hanging
  svg = svg.replace(
    /<svg\s+width="1166"\s+height="184"/,
    '<svg viewBox="0 0 1166 184" width="1166" height="184"'
  );

  // 2. Only scale main animation durations if SPEED_FACTOR is not 1
  if (SPEED_FACTOR !== 1.0) {
    svg = svg.replace(/dur="(\d+(?:\.\d+)?)ms"/g, (match, val) => {
      const num = parseFloat(val);
      const newNum = Math.round(num / SPEED_FACTOR);
      return `dur="${newNum}ms"`;
    });

    // Update durationMs metadata
    svg = svg.replace(/<durationMs>(\d+)<\/durationMs>/, (match, ms) => {
      return `<durationMs>${Math.round(parseFloat(ms) / SPEED_FACTOR)}</durationMs>`;
    });
  }

  // 3. Keep mouth chomp at natural retro speed (0.5s)
  svg = svg.replace(/<animate attributeName="d" dur="[^"]+"/g, '<animate attributeName="d" dur="0.5s"');

  fs.writeFileSync(filePath, svg, 'utf8');
  console.log(`Successfully smoothed and normalized ${path.basename(filePath)}!`);
}

// Target dist directory (created by abozanona/pacman-contribution-graph before ghaction-github-pages)
const distDir = path.resolve(root, 'dist');
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir).filter((f) => f.endsWith('.svg'));
  for (const f of files) {
    smoothPacman(path.resolve(distDir, f));
  }
} else {
  // If run locally or with output folder
  const outputDir = path.resolve(root, 'output');
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir).filter((f) => f.includes('pacman') && f.endsWith('.svg'));
    for (const f of files) {
      smoothPacman(path.resolve(outputDir, f));
    }
  }
}
