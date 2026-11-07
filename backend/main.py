
import logging
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

# -----------------------------
# LOGGING
# -----------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("ehub")

# -----------------------------
# APP
# -----------------------------

app = FastAPI(title="eHub Video Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# -----------------------------
# ALLOWED HOSTS
# -----------------------------

ALLOWED_HOSTS = {
    "x.com", "www.x.com",
    "twitter.com", "www.twitter.com",
    "instagram.com", "www.instagram.com",
    "facebook.com", "www.facebook.com",
    "m.facebook.com", "fb.watch",
    "tiktok.com", "www.tiktok.com",
    "vm.tiktok.com",
    "youtube.com", "www.youtube.com",
    "m.youtube.com", "youtu.be"
}

# -----------------------------
# VIDEO FORMATS
# -----------------------------

FORMATS = {
    "best": "bestvideo+bestaudio/best",

    "480": (
        "bestvideo[height<=480]+bestaudio/"
        "best[height<=480]"
    ),

    "720": (
        "bestvideo[height<=720]+bestaudio/"
        "best[height<=720]"
    ),

    "1080": (
        "bestvideo[height<=1080]+bestaudio/"
        "best[height<=1080]"
    ),

    "1440": (
        "bestvideo[height<=1440]+bestaudio/"
        "best[height<=1440]"
    )
}

# -----------------------------
# REQUEST MODEL
# -----------------------------

class VideoRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    quality: str = "best"


# -----------------------------
# URL VALIDATION
# -----------------------------

def validate_url(url):

    try:
        parsed = urlparse(url)

        if parsed.scheme != "https" or not parsed.hostname:
            raise HTTPException(
                status_code=400,
                detail="Please use a public HTTPS link."
            )

        hostname = parsed.hostname.lower()

        if hostname not in ALLOWED_HOSTS:
            raise HTTPException(
                status_code=400,
                detail="Unsupported video platform."
            )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid video URL."
        )


# -----------------------------
# HOME
# -----------------------------

@app.get("/")
def home():
    return {
        "service": "eHub Video Downloader",
        "status": "online"
    }


# -----------------------------
# HEALTH
# -----------------------------

@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "eHub Video Downloader"
    }


# -----------------------------
# VIDEO INFO
# -----------------------------

@app.post("/api/info")
def video_info(request: VideoRequest):

    validate_url(request.url)

    try:
        options = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "extractor_retries": 2
        }

        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(
                request.url,
                download=False
            )

        return {
            "title": info.get("title", "Video"),
            "site": info.get("extractor_key", "Video"),
            "duration": info.get("duration"),
            "status": "available"
        }

    except Exception:
        logger.exception("VIDEO INFO ERROR")

        raise HTTPException(
            status_code=422,
            detail="Video check failed. Please check backend logs."
        )


# -----------------------------
# VIDEO DOWNLOAD
# -----------------------------

@app.post("/api/download")
def download_video(request: VideoRequest):

    validate_url(request.url)

    quality = request.quality

    if quality not in FORMATS:
        raise HTTPException(
            status_code=400,
            detail="Invalid video quality."
        )

    temp_dir = tempfile.mkdtemp(prefix="ehub_")

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": FORMATS[quality],
        "outtmpl": str(
            Path(temp_dir) / "%(title).70s.%(ext)s"
        ),
        "merge_output_format": "mp4",
        "max_filesize": 500 * 1024 * 1024,
        "socket_timeout": 30,
        "retries": 2,
        "fragment_retries": 2
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(
                request.url,
                download=True
            )

        candidates = [
            p for p in Path(temp_dir).glob("*")
            if p.is_file()
            and p.suffix.lower() in {
                ".mp4", ".mkv", ".webm", ".mov"
            }
        ]

        if not candidates:
            raise RuntimeError("No video file was created.")

        video_file = max(
            candidates,
            key=lambda p: p.stat().st_size
        )

        if video_file.stat().st_size > 500 * 1024 * 1024:
            raise RuntimeError("Video exceeds the 500 MB limit.")

        safe_title = re.sub(
            r"[^A-Za-z0-9._-]+",
            "_",
            info.get("title", "ehub-video")
        )[:80]

        filename = safe_title + video_file.suffix

        return FileResponse(
            path=str(video_file),
            media_type="application/octet-stream",
            filename=filename,
            background=BackgroundTask(
                shutil.rmtree,
                temp_dir,
                ignore_errors=True
            )
        )

    except Exception:
        logger.exception("VIDEO DOWNLOAD ERROR")

        shutil.rmtree(
            temp_dir,
            ignore_errors=True
        )

        raise HTTPException(
            status_code=422,
            detail="Download failed. Please check backend logs."
        )
        
