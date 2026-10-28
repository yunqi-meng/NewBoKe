"use client";

import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { ToastProvider } from '../../components/ToastProvider';
import CommentManager from '../../components/CommentManager';

/**
 * 💬 评论管理台
 *
 * 站点全部评论的集中视图：审核、回复、删除、批量操作都从这里走，
 * 后台接口通过控制台自己的同源转发器调用，自动继承登录校验。
 */
export default function CommentsPage() {
  return (
    <ToastProvider>
      <div className="min-h-screen relative">
        <Navbar />
        <PageTransition>
          <CommentManager />
        </PageTransition>
      </div>
    </ToastProvider>
  );
}
