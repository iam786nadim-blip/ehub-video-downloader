
import logging
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ehub")

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
    "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"
}

class VideoRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    format_id: str = Field(min_length=1, max_length=100)


def validate_url(url):
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise HTTPException(400, "Please use a public HTTPS link.")

        if parsed.hostname.lower() not in ALLOWED_HOSTS:
            raise HTTPException(400, "Unsupported platform.")

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid video URL.")


def extractor_options():
    return {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "extractor_retries": 2,
    }


def get_video_info(url):
    validate_url(url)

    try:
        with yt_dlp.YoutubeDL(extractor_options()) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = []

        for f in info.get("formats", []):
            # Browser preview needs video and audio in one format.
            if f.get("vcodec") in (None, "none"):
                continue
            if f.get("acodec") in (None, "none"):
                continue

            height = f.get("height")
            if not height:
                continue

            format_id = f.get("format_id")
            if not format_id:
                continue

            ext = f.get("ext") or "unknown"

            formats.append({
                "format_id": str(format_id),
                "height": height,
                "quality": f.get("format_note") or f"{height}p",
                "ext": ext,
                "filesize": f.get("filesize") or f.get("filesize_approx"),
                "vcodec": f.get("vcodec"),
                "acodec": f.get("acodec"),
            })

        # Remove duplicate format IDs and sort by resolution.
        unique = {}
        for f in formats:
            unique[f["format_id"]] = f

        formats = sorted(
            unique.values(),
            key=lambda x: (x["height"], x["ext"] == "mp4"),
            reverse=True
        )

        return info, formats

    except HTTPException:
        raise
    except Exception:
        logger.exception("VIDEO INFO ERROR")
        raise HTTPException(
            422,
            "Video unavailable or unsupported. Check Render logs."
        )


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
def video_info(request: dict):
    url = request.get("url", "")
    info, formats = get_video_info(url)

    return {
        "title": info.get("title") or "Video",
        "site": info.get("extractor_key") or "Video",
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "formats": formats,
        "status": "available"
    }


@app.get("/api/stream")
def stream_video(
    url: str = Query(..., min_length=8, max_length=2048),
    format_id: str = Query(..., min_length=1, max_length=100)
):
    info, formats = get_video_info(url)

    selected = next(
        (f for f in formats if f["format_id"] == format_id),
        None
    )

    if not selected:
        raise HTTPException(404, "Selected video quality is unavailable.")

    try:
        options = extractor_options()

        with yt_dlp.YoutubeDL(options) as ydl:
            data = ydl.extract_info(url, download=False)

        chosen = next(
            (
                f for f in data.get("formats", [])
                if str(f.get("format_id")) == format_id
                and f.get("vcodec") not in (None, "none")
                and f.get("acodec") not in (None, "none")
            ),
            None
        )

        if not chosen or not chosen.get("url"):
            raise HTTPException(404, "Preview is unavailable for this format.")

        return RedirectResponse(
            url=chosen["url"],
            status_code=302
        )

    except HTTPException:
        raise
    except Exception:
        logger.exception("VIDEO STREAM ERROR")
        raise HTTPException(422, "Unable to play this video online.")


@app.post("/api/download")
def download_video(request: VideoRequest):
    info, formats = get_video_info(request.url)

    selected = next(
        (f for f in formats if f["format_id"] == request.format_id),
        None
    )

    if not selected:
        raise HTTPException(404, "Selected quality is unavailable.")

    temp_dir = tempfile.mkdtemp(prefix="ehub_")

    options = {
        **extractor_options(),
        "format": request.format_id,
        "outtmpl": str(Path(temp_dir) / "%(title).70s.%(ext)s"),
        "max_filesize": 500 * 1024 * 1024,
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            downloaded_info = ydl.extract_info(
                request.url,
                download=True
            )

        candidates = [
            p for p in Path(temp_dir).glob("*")
            if p.is_file()
        ]

        if not candidates:
            raise RuntimeError("No downloaded file was created.")

        video_file = max(
            candidates,
            key=lambda p: p.stat().st_size
        )

        if video_file.stat().st_size > 500 * 1024 * 1024:
            raise RuntimeError("Video exceeds 500 MB limit.")

        safe_title = re.sub(
            r"[^A-Za-z0-9._-]+",
            "_",
            downloaded_info.get("title") or "ehub-video"
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
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            422,
            "Download failed. Check Render logs."
        )
        
