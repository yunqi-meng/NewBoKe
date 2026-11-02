"use client";

import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

import { isLocalMusicTrack, lyricAt, parseLrc, type LyricLine, type MusicTrack } from '../lib/music';

// 🌟 1. 扩充 Context 类型，加入 MusicPage 需要的所有属性
type PlayMode = 'loop' | 'single' | 'random';

interface MusicContextType {
  playlist: MusicTrack[];
  currentIndex: number;
  lyrics: LyricLine[];
  currentSong: MusicTrack | undefined;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  currentLyric: string;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;

  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  handleSeek: (value: number | { target: { value: string } }) => void;
  playSong: (index: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  togglePlayMode: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

const DEFAULT_COVER = '/images/music-default.svg';
const EMPTY_LYRICS: LyricLine[] = [];

/**
 * 读取统一后端里的本地音乐清单。
 *
 * 音频本体与歌词只保存在后端（server/data/music/），
 * 播放列表元数据在 music_tracks 表里，后台上传后公开站立刻就能看到。
 */
async function loadLocalPlaylist(): Promise<MusicTrack[]> {
  try {
    const res = await fetch('/api/music/local', { cache: 'no-store' });
    if (!res.ok) return [];

    const data = await res.json();
    const tracks: unknown[] = Array.isArray(data?.data?.tracks) ? data.data.tracks : [];

    return tracks
      .filter(isLocalMusicTrack)
      .map((track) => ({
        id: track.id || track.file,
        title: track.title || '未知歌曲',
        artist: track.artist || '本地音乐',
        cover: track.cover ? `/api/music/cover/${encodeURIComponent(track.id)}` : DEFAULT_COVER,
        src: `/api/music/file/${encodeURIComponent(track.file)}`,
        lrcUrl: track.lyrics ? `/api/music/lyrics/${encodeURIComponent(track.id)}` : null,
        lyrics: [],
        source: 'local' as const,
      }));
  } catch {
    return [];
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadedLyrics, setLoadedLyrics] = useState<{ url: string; lines: LyricLine[] } | null>(null);
  const lyricCache = useRef(new Map<string, LyricLine[]>());
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 2. 新增音量和播放模式状态
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('loop');

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAll = async () => {
      const songs = await loadLocalPlaylist();

      if (!isMounted) return;
      if (songs.length > 0) {
        setPlaylist(songs);
      }
      setIsLoading(false);
    };

    loadAll();

    return () => { isMounted = false; };
  }, []);

  const currentSong = playlist[currentIndex];
  const lyricUrl = currentSong?.lrcUrl;
  const lyrics = currentSong?.lyrics.length ? currentSong.lyrics
    : loadedLyrics && loadedLyrics.url === lyricUrl ? loadedLyrics.lines : EMPTY_LYRICS;
  const currentLyric = lyricAt(lyrics, currentTime)?.text
    || (isLoading ? '正在连接音乐库…' : !currentSong ? '还没有可播放的音乐' : '♪ 纯享音乐 ♪');

  useEffect(() => {
    if (!lyricUrl) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        let lines = lyricCache.current.get(lyricUrl);
        if (!lines) {
          const response = await fetch(lyricUrl, { signal: controller.signal });
          if (!response.ok) return;
          lines = parseLrc(await response.text());
          lyricCache.current.set(lyricUrl, lines);
        }
        if (!controller.signal.aborted) setLoadedLyrics({ url: lyricUrl, lines });
      } catch {
        // 换歌时取消上一首的歌词请求；歌词不可达时仍可播放音频。
      }
    };
    void load();
    return () => controller.abort();
  }, [lyricUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let active = true;
    if (isPlaying) {
      void audio.play().catch(() => { if (active) setIsPlaying(false); });
    } else {
      audio.pause();
    }
    return () => { active = false; };
  }, [isPlaying, currentSong?.src]);

  // 🌟 4. 同步音量到 audio 元素
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (currentSong) setIsPlaying(playing => !playing);
  };

  // 🌟 5. 重写 nextSong，加入对随机模式的处理
  const nextSong = () => {
    if (playlist.length === 0) return;
    if (playMode === 'random') {
      const offset = 1 + Math.floor(Math.random() * Math.max(1, playlist.length - 1));
      setCurrentIndex(previous => (previous + offset) % playlist.length);
    } else {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }
  };

  const prevSong = () => {
    if (playlist.length === 0) return;
    if (playMode === 'random') {
      const offset = 1 + Math.floor(Math.random() * Math.max(1, playlist.length - 1));
      setCurrentIndex(previous => (previous + offset) % playlist.length);
    } else {
      setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
    }
  };

  // 🌟 6. 暴露直接播放指定歌曲的方法
  const playSong = (index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= playlist.length) return;
    setCurrentIndex(index);
    setIsPlaying(true); // 保证切歌后自动播放
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const { currentTime, duration } = audioRef.current;
      setCurrentTime(currentTime);
      const validDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
      setDuration(validDuration);
      setProgress(validDuration ? (currentTime / validDuration) * 100 : 0);
    }
  };

  // 🌟 7. 处理歌曲结束
  const handleEnded = () => {
    if ((playMode === 'single' || playlist.length === 1) && audioRef.current) {
       audioRef.current.currentTime = 0;
       void audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
       nextSong();
    }
  };

  const handleSeek = (value: number | { target: { value: string } }) => {
    const requested = typeof value === 'number' ? value : Number(value.target.value);
    if (!Number.isFinite(requested)) return;
    const newProgress = Math.max(0, Math.min(100, requested));
    setProgress(newProgress);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (newProgress / 100) * audioRef.current.duration;
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const setVolume = (val: number) => {
    if (!Number.isFinite(val)) return;
    setVolumeState(Math.max(0, Math.min(1, val)));
    if (isMuted && val > 0) setIsMuted(false);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const togglePlayMode = () => {
    setPlayMode(prev => {
      if (prev === 'loop') return 'single';
      if (prev === 'single') return 'random';
      return 'loop';
    });
  };

  return (
    <MusicContext.Provider value={{
        playlist, currentIndex, currentSong, lyrics, isPlaying, progress, currentTime, duration, currentLyric, isLoading,
        volume, isMuted, playMode, // 暴露新状态
        togglePlay, nextSong, prevSong, handleSeek,
        playSong, setVolume, toggleMute, togglePlayMode // 暴露新方法
    }}>
      {children}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.src}
          preload="metadata"
          onError={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded} // 使用我们重写的结束处理
          onLoadedMetadata={handleTimeUpdate}
        />
      )}
    </MusicContext.Provider>
  );
}

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used within MusicProvider");
  return context;
};
