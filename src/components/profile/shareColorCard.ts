import { supabase } from '@/integrations/supabase/client';

interface ColourItem { name?: string; hex?: string }

interface CardInput {
  season: string;
  bestColours: ColourItem[];
  summary?: string;
}

const isHex = (h?: string) => !!h && /^#[0-9a-fA-F]{6}$/.test(h);

function firstSentence(s?: string): string {
  if (!s) return '';
  const trimmed = s.trim().replace(/\s+/g, ' ');
  const m = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : trimmed).slice(0, 180);
}

function pickAccent(colours: ColourItem[]): string {
  const hexes = colours.map((c) => c.hex).filter(isHex) as string[];
  return hexes[Math.floor(hexes.length / 2)] || hexes[0] || '#111111';
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function readableOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#FFFFFF';
}

export async function renderColorCard({ season, bestColours, summary }: CardInput): Promise<Blob> {
  const size = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background: warm off-white editorial
  ctx.fillStyle = '#FBF8F4';
  ctx.fillRect(0, 0, size, size);

  const accent = pickAccent(bestColours);

  // Top hairline
  ctx.fillStyle = accent;
  ctx.fillRect(80, 80, 120, 2);

  // Eyebrow label
  ctx.fillStyle = '#6B6459';
  ctx.font = '500 22px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'top';
  ctx.fillText('MY SEASON', 80, 100);

  // Hero season name
  ctx.fillStyle = '#111111';
  ctx.font = '400 108px Georgia, "Times New Roman", serif';
  const seasonText = season || 'Your Season';
  // Wrap if too wide
  const maxWidth = size - 160;
  let fontSize = 108;
  ctx.font = `400 ${fontSize}px Georgia, "Times New Roman", serif`;
  while (ctx.measureText(seasonText).width > maxWidth && fontSize > 60) {
    fontSize -= 4;
    ctx.font = `400 ${fontSize}px Georgia, "Times New Roman", serif`;
  }
  ctx.fillText(seasonText, 80, 160);

  // Palette centrepiece
  const paletteY = 380;
  const paletteX = 80;
  const paletteW = size - 160;
  const paletteH = 260;

  const swatches = bestColours.filter((c) => isHex(c.hex)).slice(0, 12);
  const n = swatches.length;
  if (n > 0) {
    const gap = 14;
    const swW = (paletteW - gap * (n - 1)) / n;
    swatches.forEach((c, i) => {
      const x = paletteX + i * (swW + gap);
      const r = 24;
      ctx.fillStyle = c.hex!;
      roundRect(ctx, x, paletteY, swW, paletteH, r);
      ctx.fill();
    });
  }

  // Palette caption
  ctx.fillStyle = '#6B6459';
  ctx.font = '500 20px Georgia, serif';
  ctx.fillText('MY BEST COLOURS', 80, paletteY + paletteH + 28);

  // Flattering line
  const line = firstSentence(summary);
  if (line) {
    ctx.fillStyle = '#2A251E';
    ctx.font = 'italic 400 34px Georgia, "Times New Roman", serif';
    wrapText(ctx, `"${line}"`, 80, paletteY + paletteH + 90, size - 160, 46);
  }

  // Bottom band
  const bandY = size - 160;
  ctx.fillStyle = accent;
  ctx.fillRect(0, bandY, size, 160);
  const onAccent = readableOn(accent);

  ctx.fillStyle = onAccent;
  ctx.font = '600 42px Georgia, "Times New Roman", serif';
  ctx.fillText('Serena', 80, bandY + 36);

  ctx.font = '400 22px Georgia, serif';
  ctx.fillText('Find your season  →  serena-outfitoracle.lovable.app', 80, bandY + 92);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render card'))), 'image/png');
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, cy);
      line = words[i] + ' ';
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), x, cy);
}

export async function shareOrDownloadCard(blob: Blob, filename = 'serena-my-season.png'): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav: any = navigator;
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: 'My Serena colour season',
        text: 'Find your season → serena-outfitoracle.lovable.app',
      });
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function logShareEvent() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('share_events').insert({ user_id: user.id, share_type: 'color_card' });
  } catch (err) {
    console.warn('share_events insert failed (non-fatal):', err);
  }
}
