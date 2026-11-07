
import os
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

app = FastAPI(title="eHub Video Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_HOSTS = {
    "x.com", "www.x.com", "twitter.com", "www.twitter.com",
    "instagram.com", "www.instagram.com",
    "facebook.com", "www.facebook.com", "m.facebook.com",
    "fb.watch", "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
    "youtube.com", "www.youtube.com", "youtu.be"
}

FORMATS = {
    "best": "best[ext=mp4]/best",
    "1080": "best[height<=1080]/best",
    "720": "best[height<=720]/best",
    "480": "best[height<=480]/best",
    "360": "best[height<=360]/best"
}

class VideoRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    quality: str = "best"

def validate_url(url):
    parsed = urlparse(url)

    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(400, "Please use a public HTTPS link.")

    if parsed.hostname.lower() not in ALLOWED_HOSTS:
        raise HTTPException(400, "Unsupported platform.")

@app.get("/")
def home():
    return {
        "service": "eHub Video Downloader",
        "status": "online"
    }

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/info")
def video_info(request: VideoRequest):
    validate_url(request.url)

    try:
        options = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 20
        }

        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(
                request.url,
                download=False
            )

        return {
            "title": info.get("title", "Video"),
            "site": info.get("extractor_key", "Video"),
            "duration": info.get("duration")
        }

    except Exception:
        raise HTTPException(
            422,
            "Video unavailable, private or unsupported."
        )

@app.post("/api/download")
def download_video(request: VideoRequest):
    validate_url(request.url)

    quality = request.quality
    if quality not in FORMATS:
        quality = "best"

    temp_dir = tempfile.mkdtemp(prefix="ehub_")

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": FORMATS[quality],
        "outtmpl": str(Path(temp_dir) / "%(title).70s.%(ext)s"),
        "merge_output_format": "mp4",
        "max_filesize": 500 * 1024 * 1024
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
        ]

        if not candidates:
            raise RuntimeError("No video file created.")

        video_file = candidates[0]

        filename = re.sub(
            r"[^A-Za-z0-9._-]+",
            "_",
            info.get("title", "ehub-video")
        )[:80] + ".mp4"

        return FileResponse(
            str(video_file),
            media_type="application/octet-stream",
            filename=filename,
            background=BackgroundTask(
                shutil.rmtree,
                temp_dir,
                ignore_errors=True
            )
        )

    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            422,
            "Download failed. This video may be restricted or unsupported."
        )
      
