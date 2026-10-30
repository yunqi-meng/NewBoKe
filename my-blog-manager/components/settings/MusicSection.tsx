"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { withBasePath } from '../../lib/consoleBasePath';
import { motion } from 'framer-motion';
import { CloudUpload, ListMusic, Trash2, Play, Pause, Disc3, Image as ImageIcon, FileText, RefreshCw } from 'lucide-react';

const AUDIO_ACCEPT = '.mp3,.m4a,.aac,.ogg,.oga,.wav,.flac,.weba';
const DEFAULT_COVER = withBasePath('/music-default.svg');

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MusicSection({ showToast }: any) {
  // ---------------- 本地音乐状态 ----------------
  const [localTracks, setLocalTracks] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [lyricFile, setLyricFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadLocalTracks = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch(withBasePath('/api/proxy/api/music/local'), { cache: 'no-store' });
      const payload = await res.json();
      setLocalTracks(Array.isArray(payload?.data?.tracks) ? payload.data.tracks : []);
    } catch {
      setLocalTracks([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocalTracks();
  }, [loadLocalTracks]);

  const pickAudio = (file: File | undefined | null) => {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!AUDIO_ACCEPT.split(',').includes(ext)) {
      showToast('只支持音频文件（mp3 / m4a / flac / wav 等）', 'warning');
      return;
    }
    setAudioFile(file);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
  };

  const resetForm = () => {
    setAudioFile(null);
    setCoverFile(null);
    setLyricFile(null);
    setTitle('');
    setArtist('');
  };

  const submitUpload = async () => {
    if (!audioFile) {
      showToast('请先选择一个音频文件', 'warning');
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', audioFile);
      form.append('title', title);
      form.append('artist', artist);

      const res = await fetch(withBasePath('/api/proxy/api/music/upload'), { method: 'POST', body: form });
      const payload = await res.json();

      if (!res.ok || !payload?.success) {
        showToast(payload?.message || '上传失败', 'error');
        return;
      }

      const trackId = payload.data.id;

      if (coverFile) {
        const coverForm = new FormData();
        coverForm.append('file', coverFile);
        await fetch(withBasePath(`/api/proxy/api/music/cover/${encodeURIComponent(trackId)}`), { method: 'POST', body: coverForm });
      }

      if (lyricFile) {
        const lyricForm = new FormData();
        lyricForm.append('file', lyricFile);
        await fetch(withBasePath(`/api/proxy/api/music/lyrics/${encodeURIComponent(trackId)}`), { method: 'POST', body: lyricForm });
      }

      showToast('已加入本地歌单，别忘了点「线上发布」同步到网站', 'success');
      resetForm();
      await loadLocalTracks();
    } catch {
      showToast('上传过程中通道中断，请重试', 'error');
    } finally {
      setUploading(false);
    }
  };

  const uploadExtra = async (trackId: string, kind: 'cover' | 'lyrics', file: File | null) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(withBasePath(`/api/proxy/api/music/${kind}/${encodeURIComponent(trackId)}`), { method: 'POST', body: form });
    const payload = await res.json();
    showToast(payload?.success ? (kind === 'cover' ? '封面已更新' : '歌词已更新') : (payload?.message || '更新失败'), payload?.success ? 'success' : 'error');
    if (payload?.success) await loadLocalTracks();
  };

  const removeLocalTrack = async (trackId: string, titleText: string) => {
    const res = await fetch(withBasePath(`/api/proxy/api/music/local/${encodeURIComponent(trackId)}`), { method: 'DELETE' });
    const payload = await res.json();
    if (payload?.success) {
      if (playingId === trackId) setPlayingId(null);
      showToast(`《${titleText}》已删除`, 'success');
      await loadLocalTracks();
    } else {
      showToast(payload?.message || '删除失败', 'error');
    }
  };

  const togglePreview = (track: any) => {
    const src = withBasePath(`/api/proxy/api/music/file/${encodeURIComponent(track.file)}`);
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = src;
      audioRef.current.play().catch(() => setPlayingId(null));
    }
    setPlayingId(track.id);
  };

  return (
    <motion.section initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-2xl">
      <h2 className="text-xl font-black text-slate-800 dark:text-white mb-6">🎵 音乐播放设置</h2>

      <div className="space-y-8">
        {/* 上传区 */}
        <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-3xl p-6 space-y-5">
          <p className="text-[10px] font-black text-slate-400 uppercase">上传本地音乐</p>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickAudio(e.dataTransfer.files?.[0]); }}
            className={`flex flex-col items-center justify-center gap-3 py-10 rounded-3xl border-2 border-dashed transition-all cursor-pointer ${dragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400'}`}
          >
            <CloudUpload className={dragging ? 'text-indigo-500 animate-bounce' : 'text-slate-400'} size={30} />
            <span className="text-sm font-black text-slate-700 dark:text-slate-200">
              {audioFile ? audioFile.name : '把音频拖进来，或点击选择文件'}
            </span>
            <span className="text-[10px] text-slate-400">
              {audioFile ? formatSize(audioFile.size) : '支持 mp3 / m4a / aac / ogg / wav / flac，单个不超过 100MB'}
            </span>
            <input
              type="file"
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(e) => { pickAudio(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="歌曲名" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-white dark:bg-slate-900 border-none rounded-2xl px-4 py-3 text-sm outline-none shadow-sm" />
            <input type="text" placeholder="歌手 / 专辑（选填）" value={artist} onChange={(e) => setArtist(e.target.value)} className="bg-white dark:bg-slate-900 border-none rounded-2xl px-4 py-3 text-sm outline-none shadow-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 px-4 py-3 bg-white/60 dark:bg-slate-900/60 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-white dark:hover:bg-slate-800 transition-colors">
              <ImageIcon size={16} className="text-pink-500 shrink-0" />
              <span className="truncate">{coverFile ? coverFile.name : '封面图片（选填）'}</span>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" className="hidden" onChange={(e) => { setCoverFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            </label>
            <label className="flex items-center gap-3 px-4 py-3 bg-white/60 dark:bg-slate-900/60 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-white dark:hover:bg-slate-800 transition-colors">
              <FileText size={16} className="text-indigo-500 shrink-0" />
              <span className="truncate">{lyricFile ? lyricFile.name : 'LRC 歌词（选填）'}</span>
              <input type="file" accept=".lrc" className="hidden" onChange={(e) => { setLyricFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={submitUpload} disabled={uploading || !audioFile} className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl text-sm font-black shadow-xl shadow-indigo-500/20 disabled:opacity-40 active:scale-95 transition-all">
              {uploading ? '上传中…' : '上传并加入歌单'}
            </button>
            {(audioFile || coverFile || lyricFile) && (
              <button onClick={resetForm} className="px-6 py-4 bg-white/60 dark:bg-slate-800/60 rounded-2xl text-sm font-black text-slate-500 hover:text-red-500 transition-colors">清空</button>
            )}
          </div>
        </div>

        {/* 已上传列表 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase">本地歌单 ({localTracks.length})</p>
            <button onClick={loadLocalTracks} className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-colors">
              <RefreshCw size={12} /> 刷新
            </button>
          </div>

          {listLoading ? (
            <div className="flex items-center justify-center gap-3 py-10 text-xs font-bold text-slate-400">
              <Disc3 size={18} className="animate-spin" /> 正在读取本地歌单…
            </div>
          ) : localTracks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 rounded-3xl border border-dashed border-slate-300 dark:border-slate-600 text-center">
              <ListMusic size={28} className="text-slate-300 dark:text-slate-500" />
              <p className="text-xs font-bold text-slate-400">本地歌单还是空的，上传一首歌试试</p>
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {localTracks.map((track: any) => (
                <div key={track.id} className="flex items-center gap-3 p-3 bg-white/40 dark:bg-slate-800/40 rounded-2xl border border-white/20 group">
                  <button
                    onClick={() => togglePreview(track)}
                    className="relative w-11 h-11 shrink-0 rounded-xl overflow-hidden shadow-sm bg-slate-200 dark:bg-slate-700"
                    title={playingId === track.id ? '暂停' : '试听'}
                  >
                    <img
                      src={track.cover ? withBasePath(`/api/proxy/api/music/cover/${encodeURIComponent(track.id)}`) : DEFAULT_COVER}
                      alt="cover"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      {playingId === track.id ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                    </span>
                  </button>

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-bold line-clamp-1 text-slate-800 dark:text-white">{track.title || '未知歌曲'}</span>
                    <span className="text-[10px] text-slate-500 font-medium line-clamp-1">
                      {track.artist || '本地音乐'} · {formatSize(track.size)}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      {track.cover && <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-500 font-bold">有封面</span>}
                      {track.lyrics && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500 font-bold">有歌词</span>}
                      {!track.available && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-500 font-bold">文件丢失</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label className="w-8 h-8 rounded-lg bg-slate-500/10 text-slate-500 hover:bg-pink-500 hover:text-white flex items-center justify-center cursor-pointer transition-all" title="更换封面">
                      <ImageIcon size={14} />
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" className="hidden" onChange={(e) => { uploadExtra(track.id, 'cover', e.target.files?.[0] || null); e.target.value = ''; }} />
                    </label>
                    <label className="w-8 h-8 rounded-lg bg-slate-500/10 text-slate-500 hover:bg-indigo-500 hover:text-white flex items-center justify-center cursor-pointer transition-all" title="上传歌词">
                      <FileText size={14} />
                      <input type="file" accept=".lrc" className="hidden" onChange={(e) => { uploadExtra(track.id, 'lyrics', e.target.files?.[0] || null); e.target.value = ''; }} />
                    </label>
                    <button onClick={() => removeLocalTrack(track.id, track.title)} className="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white flex items-center justify-center" title="删除">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] leading-5 text-slate-400 pt-2">
            音频文件只保存在控制台服务器上，不会进 Git 仓库；发布时会被镜像到网站的 <code className="px-1 py-0.5 rounded bg-slate-500/10">public/audio</code> 目录。改完记得去「线上发布」点一次发布。
          </p>
        </div>
      </div>

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
    </motion.section>
  );
}
