// Writes the app's own icon into the Android launcher icon slots.
// Without this the APK ships Capacitor's default placeholder icon.
//
// Android wants a different pixel size per density bucket, plus an adaptive
// "foreground" layer that the system masks into whatever shape the launcher
// uses (circle, squircle, rounded square). The foreground is inset so the
// mask never crops the artwork.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const SOURCE = join(ROOT, 'icon-512.png');

// px for ic_launcher / ic_launcher_round at each density
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive foreground is 108dp; the inner 72dp is the guaranteed-safe area.
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

if (!(await exists(SOURCE))) {
  console.warn('icon-512.png not found — keeping the default Capacitor icon.');
  process.exit(0);
}
if (!(await exists(RES))) {
  console.error('Android project not found. Run `npx cap add android` first.');
  process.exit(1);
}

// Pillow does the resizing; it is already available on the runner image and
// avoids pulling a native image toolchain into the build.
const PY = `
import sys
from PIL import Image
src, dest, size, inset = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
img = Image.open(src).convert('RGBA')
if inset > 0:
    inner = max(1, int(round(size * (1.0 - inset))))
    scaled = img.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    canvas.paste(scaled, (off, off), scaled)
    out = canvas
else:
    out = img.resize((size, size), Image.LANCZOS)
out.save(dest, 'PNG')
`;

function render(dest, size, inset) {
  execFileSync('python3', ['-c', PY, SOURCE, dest, String(size), String(inset)], { stdio: 'pipe' });
}

let written = 0;
for (const [density, size] of Object.entries(LEGACY)) {
  const dir = join(RES, `mipmap-${density}`);
  await mkdir(dir, { recursive: true });
  render(join(dir, 'ic_launcher.png'), size, 0);
  render(join(dir, 'ic_launcher_round.png'), size, 0);
  // Inset by 25% so an aggressive launcher mask cannot clip the artwork.
  render(join(dir, 'ic_launcher_foreground.png'), FOREGROUND[density], 0.25);
  written += 3;
}

// The adaptive icon XML must point at the PNG foreground rather than the
// template's vector drawable, otherwise the old placeholder keeps showing.
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
const anydpi = join(RES, 'mipmap-anydpi-v26');
await mkdir(anydpi, { recursive: true });
await writeFile(join(anydpi, 'ic_launcher.xml'), adaptive);
await writeFile(join(anydpi, 'ic_launcher_round.xml'), adaptive);

// Match the app's own background so the masked area blends in.
await mkdir(join(RES, 'values'), { recursive: true });
await writeFile(
  join(RES, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0f0e0c</color>
</resources>
`
);

console.log(`Launcher icons written (${written} PNGs + adaptive XML)`);
