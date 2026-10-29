"""ORM 模型：博客的全部内容都在这里，不再散落成 markdown / TS 文件。

内容类型一览：
    Article      文章、杂谈、关于页（type 区分，slug 唯一）
    Moment       说说
    Album/Photo  相册与相册里的照片
    Friend       友链
    Project      项目矩阵
    SiteConfig   站点配置（整份 JSON，单行）
    Draft        草稿箱
    MusicTrack   本地音乐
    DailyQuote   每日一句
    MediaAsset   上传的图片元数据
    Setting      其它零散设置（每日一句配置等）
"""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .db import Base


class Article(Base):
    """文章 / 杂谈 / 关于页。三者字段一致，用 type 区分。"""

    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(200), unique=True, index=True, nullable=False)
    type = Column(String(20), index=True, nullable=False, default="post")  # post | chatter | about
    title = Column(String(300), default="")
    description = Column(Text, default="")
    content = Column(Text, default="")  # 正文（Markdown）
    cover = Column(String(600), default="")
    tags = Column(Text, default="[]")  # JSON 数组
    mood = Column(String(120), default="")
    date = Column(String(40), index=True, default="")  # YYYY-MM-DD HH:MM:SS，字典序即时间序
    created_at = Column(String(40), default="")
    updated_at = Column(String(40), default="")


class Moment(Base):
    """说说。"""

    __tablename__ = "moments"

    id = Column(String(120), primary_key=True)  # moment-17123456789
    date = Column(String(40), index=True, default="")
    content = Column(Text, default="")
    location = Column(String(240), default="")
    images = Column(Text, default="[]")  # JSON 数组
    created_at = Column(String(40), default="")


class Album(Base):
    """相册。"""

    __tablename__ = "albums"

    id = Column(String(120), primary_key=True)
    title = Column(String(300), default="")
    description = Column(Text, default="")
    cover = Column(String(600), default="")
    date = Column(String(40), default="")
    sort_order = Column(Integer, default=0)

    photos = relationship(
        "AlbumPhoto",
        back_populates="album",
        cascade="all, delete-orphan",
        order_by="AlbumPhoto.sort_order",
    )


class AlbumPhoto(Base):
    """相册里的单张照片。"""

    __tablename__ = "album_photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    album_id = Column(String(120), ForeignKey("albums.id"), index=True)
    url = Column(String(600), default="")
    caption = Column(String(600), default="")
    sort_order = Column(Integer, default=0)

    album = relationship("Album", back_populates="photos")


class Friend(Base):
    """友链。"""

    __tablename__ = "friends"

    id = Column(String(120), primary_key=True)
    name = Column(String(200), default="")
    url = Column(String(600), default="")
    description = Column(Text, default="")
    avatar = Column(String(600), default="")
    theme_color = Column(String(120), default="")
    sort_order = Column(Integer, default=0)


class Project(Base):
    """项目矩阵。"""

    __tablename__ = "projects"

    id = Column(String(120), primary_key=True)
    name = Column(String(200), default="")
    description = Column(Text, default="")
    icon = Column(String(600), default="")
    github_url = Column(String(600), default="")
    tags = Column(Text, default="[]")  # JSON 数组
    sort_order = Column(Integer, default=0)


class SiteConfig(Base):
    """站点配置。整份配置存成一个 JSON，固定只有一行（id=1）。"""

    __tablename__ = "site_config"

    id = Column(Integer, primary_key=True, default=1)
    payload = Column(Text, default="{}")
    updated_at = Column(String(40), default="")


class Draft(Base):
    """草稿箱。编辑器里没发布的内容。"""

    __tablename__ = "drafts"

    id = Column(String(120), primary_key=True)
    type = Column(String(20), default="post")  # post | chatter | about
    title = Column(String(300), default="")
    description = Column(Text, default="")
    content = Column(Text, default="")  # 编辑器里的 HTML
    cover = Column(String(600), default="")
    tags = Column(Text, default="[]")
    mood = Column(String(120), default="")
    date = Column(String(40), default="")
    last_modified = Column(Integer, default=0)  # 毫秒时间戳


class MusicTrack(Base):
    """本地音乐。音频文件本身仍放在磁盘上，这里只存元数据。"""

    __tablename__ = "music_tracks"

    id = Column(String(64), primary_key=True)
    title = Column(String(300), default="")
    artist = Column(String(300), default="")
    file = Column(String(400), default="")
    cover = Column(String(400), default="")
    lyrics = Column(String(400), default="")
    size = Column(Integer, default=0)
    added_at = Column(String(40), default="")
    sort_order = Column(Integer, default=0)


class DailyQuote(Base):
    """每日一句。date 为主键，同一天只留一条。"""

    __tablename__ = "daily_quotes"

    date = Column(String(20), primary_key=True)
    quote = Column(Text, default="")
    source = Column(String(20), default="ai")  # ai | manual
    model = Column(String(160), default="")
    label = Column(String(240), default="")
    generated_at = Column(String(40), default="")


class MediaAsset(Base):
    """上传图片的元数据。文件本体在 content_dir/uploads 下。"""

    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(300), unique=True, index=True, nullable=False)
    size = Column(Integer, default=0)
    content_type = Column(String(120), default="")
    created_at = Column(String(40), default="")


class Comment(Base):
    """评论（含站长回复）。

    评论不进内容快照：它是访客产生的数据，跟内容版本无关，
    单独用数据库文件备份即可。
    """

    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    target = Column(String(200), index=True, default="")  # 评论主题标识（文章 slug 等）
    target_label = Column(String(300), default="")
    parent_id = Column(Integer, default=0, index=True)
    author_name = Column(String(80), default="")
    author_email = Column(String(200), default="")
    author_website = Column(String(400), default="")
    author_ip = Column(String(80), default="")
    visitor_id = Column(String(64), index=True, default="")
    author_agent = Column(String(400), default="")
    content = Column(Text, default="")
    status = Column(String(20), index=True, default="pending")
    is_admin = Column(Boolean, default=False)
    likes = Column(Integer, default=0)
    created_at = Column(String(40), index=True, default="")
    updated_at = Column(String(40), default="")


class CommentLike(Base):
    """点赞记录：同一个访客对同一条评论只计一次。"""

    __tablename__ = "comment_likes"

    comment_id = Column(Integer, primary_key=True)
    visitor_id = Column(String(64), primary_key=True)
    created_at = Column(String(40), default="")


class Setting(Base):
    """零散设置（每日一句配置、评论设置等），按 key 存 JSON。"""

    __tablename__ = "settings"

    key = Column(String(80), primary_key=True)
    payload = Column(Text, default="{}")
    updated_at = Column(String(40), default="")
