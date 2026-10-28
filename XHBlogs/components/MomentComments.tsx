"use client";

import Comments from './Comments';

/**
 * 说说（动态）卡片里的评论区。
 *
 * 主题固定为 /moments/<id>，样式更紧凑一些。
 */
export default function MomentComments({ id }: { id: string }) {
  return <Comments target={id} compact />;
}
