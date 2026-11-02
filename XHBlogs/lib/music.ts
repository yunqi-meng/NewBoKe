export interface LyricLine {
  time: number;
  text: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  lrcUrl: string | null;
  lyrics: LyricLine[];
  source: 'local';
}

export interface LocalMusicTrack {
  id: string;
  file: string;
  title?: string;
  artist?: string;
  cover?: string;
  lyrics?: string;
  available?: boolean;
}

export function isLocalMusicTrack(value: unknown): value is LocalMusicTrack {
  if (!value || typeof value !== 'object') return false;
  const track = value as Record<string, unknown>;
  return typeof track.id === 'string' && typeof track.file === 'string' && !!track.file
    && track.available !== false;
}

export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText || lrcText.length > 30000) return [];
  const result: LyricLine[] = [];
  for (const line of lrcText.split(/\r?\n/)) {
    const matches = [...line.matchAll(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]/g)];
    const text = line.replace(/\[\d{2,}:\d{2}(?:\.\d{2,3})?\]/g, '')
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim();
    if (!text) continue;
    for (const match of matches) {
      const seconds = Number(match[2]);
      if (seconds >= 60) continue;
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      result.push({ time: Number(match[1]) * 60 + seconds + fraction, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

/** 找到播放位置之前最后一句歌词，避免每次 timeupdate 拷贝、倒序整个数组。 */
export function lyricAt(lines: LyricLine[], time: number): LyricLine | undefined {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  return lines[low - 1];
}
