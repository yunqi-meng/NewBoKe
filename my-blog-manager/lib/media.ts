/**
 * 📸 本机图片上传助手
 *
 * 控制台不再对接任何第三方图床：图片直接从运营者的电脑上传到内容引擎，
 * 引擎落盘到 <控制台根目录>/data/uploads/，并返回站内地址 /uploads/<文件名>。
 * 公开站发布时由 sync.py 镜像到 public/uploads/，两边引用同一个地址。
 */

export interface UploadResult {
  success: boolean;
  url?: string;
  name?: string;
  size?: number;
  message?: string;
}

/** 上传单张图片，返回站内可用的相对地址 */
export async function uploadLocalImage(file: File): Promise<UploadResult> {
  if (!file.type.startsWith('image/')) {
    return { success: false, message: '只能上传图片文件' };
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/proxy/api/media/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (data?.success && data?.url) {
      return { success: true, url: data.url, name: data.name, size: data.size };
    }
    return { success: false, message: data?.message || '上传失败' };
  } catch (error: any) {
    return { success: false, message: `无法连接内容引擎：${error?.message || '未知错误'}` };
  }
}
