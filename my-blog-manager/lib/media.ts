/**
 * 📸 本机图片上传助手
 *
 * 控制台不再对接任何第三方图床：图片直接从运营者的电脑上传到统一后端，
 * 后端落盘到 <后端数据目录>/uploads/，并返回站内地址 /uploads/<文件名>。
 * 公开站与控制台都用 /uploads/<文件名> 引用同一批图片，
 * 由两端的同名路由转发到后端取回文件，不需要任何 URL 改写。
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
