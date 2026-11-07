
const $ = id => document.getElementById(id);

const API = "https://ehub-video-downloader.onrender.com";

let currentVideo = null;
let selectedFormat = null;
let availableFormats = [];

// -------------------------
// INITIAL SETTINGS
// -------------------------

$("year").textContent = new Date().getFullYear();

function showMessage(message, type = "") {
  $("message").textContent = message;
  $("message").className = "message " + type;
}

function setBusy(busy) {
  $("checkBtn").disabled = busy;
  $("checkBtn").textContent = busy ? "Please wait..." : "Get Video";
  $("downloadBtn").disabled = busy || !selectedFormat;
}

// -------------------------
// THEME
// -------------------------

function loadTheme() {
  const theme = localStorage.getItem("ehubTheme");

  if (theme === "light") {
    document.body.classList.add("light");
    $("themeBtn").textContent = "🌙";
  } else {
    $("themeBtn").textContent = "☀️";
  }
}

$("themeBtn").onclick = () => {
  document.body.classList.toggle("light");

  const light = document.body.classList.contains("light");

  localStorage.setItem("ehubTheme", light ? "light" : "dark");
  $("themeBtn").textContent = light ? "🌙" : "☀️";
};

loadTheme();

// -------------------------
// PLATFORM DETECTION
// -------------------------

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();

  if (
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host === "twitter.com" ||
    host.endsWith(".twitter.com")
  ) return "X / Twitter";

  if (
    host === "instagram.com" ||
    host.endsWith(".instagram.com")
  ) return "Instagram";

  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.watch"
  ) return "Facebook";

  if (
    host === "tiktok.com" ||
    host.endsWith(".tiktok.com")
  ) return "TikTok";

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  ) return "YouTube";

  throw new Error("Unsupported platform.");
}

// -------------------------
// FORMAT HELPERS
// -------------------------

function formatSize(bytes) {
  if (!bytes) return "Size unavailable";

  const mb = bytes / (1024 * 1024);

  if (mb >= 1024) {
    return (mb / 1024).toFixed(2) + " GB";
  }

  return mb.toFixed(1) + " MB";
}

function formatDuration(seconds) {
  if (!seconds) return "Duration unavailable";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}m ${remaining}s`;
}

// -------------------------
// PASTE BUTTON
// -------------------------

$("pasteBtn").onclick = async () => {
  try {
    $("videoUrl").value = await navigator.clipboard.readText();
    showMessage("Link pasted successfully.", "success");
  } catch {
    showMessage("Please paste your link manually.");
  }
};

// -------------------------
// RENDER QUALITIES
// -------------------------

function renderQualities(formats) {
  const list = $("qualityList");

  list.innerHTML = "";

  $("qualityCount").textContent =
    formats.length + " formats";

  formats.forEach(format => {
    const item = document.createElement("div");

    item.className = "quality-item";
    item.dataset.formatId = format.format_id;

    const info = document.createElement("div");
    info.className = "quality-info";

    const title = document.createElement("strong");
    title.textContent = `${format.height}p`;

    const details = document.createElement("small");
    details.textContent =
      `${format.ext.toUpperCase()} · ${formatSize(format.filesize)}`;

    info.append(title, details);

    const actions = document.createElement("div");
    actions.className = "quality-actions";

    const play = document.createElement("button");
    play.type = "button";
    play.className = "play-quality";
    play.textContent = "▶ Play";

    play.onclick = () => playVideo(format);

    const download = document.createElement("button");
    download.type = "button";
    download.textContent = "↓ Download";

    download.onclick = () => downloadVideo(format);

    actions.append(play, download);
    item.append(info, actions);

    item.onclick = event => {
      if (event.target.closest("button")) return;
      selectFormat(format);
    };

    list.appendChild(item);
  });
}

// -------------------------
// SELECT FORMAT
// -------------------------

function selectFormat(format) {
  selectedFormat = format;

  document.querySelectorAll(".quality-item").forEach(item => {
    item.classList.toggle(
      "selected",
      item.dataset.formatId === format.format_id
    );
  });

  $("downloadBtn").disabled = false;
  $("playerMessage").textContent =
    `Selected quality: ${format.height}p`;
}

// -------------------------
// PLAY ONLINE
// -------------------------

async function playVideo(format) {
  if (!currentVideo) return;

  selectFormat(format);

  const player = $("videoPlayer");

  const params = new URLSearchParams({
    url: currentVideo.url,
    format_id: format.format_id
  });

  const streamUrl = `${API}/api/stream?${params.toString()}`;

  player.pause();
  player.removeAttribute("src");
  player.load();

  player.src = streamUrl;
  player.load();

  $("playerMessage").textContent =
    `Loading ${format.height}p video...`;

  try {
    await player.play();
    $("playerMessage").textContent =
      `Now playing ${format.height}p`;
  } catch {
    $("playerMessage").textContent =
      "Press the Play button on the video player to start playback.";
  }

  player.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

// -------------------------
// GET VIDEO
// -------------------------

$("checkBtn").onclick = async () => {
  const url = $("videoUrl").value.trim();

  currentVideo = null;
  selectedFormat = null;
  availableFormats = [];

  $("results").classList.add("hidden");
  $("videoPlayer").pause();
  $("videoPlayer").removeAttribute("src");
  $("videoPlayer").load();

  if (!url) {
    showMessage("Please enter a video link.", "error");
    return;
  }

  let platform;

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      throw new Error("Please use a valid HTTPS link.");
    }

    platform = detectPlatform(url);

  } catch (error) {
    showMessage(error.message || "Invalid video link.", "error");
    return;
  }

  setBusy(true);
  showMessage("Finding available video qualities...");

  try {
    const response = await fetch(`${API}/api/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Unable to find video.");
    }

    if (!Array.isArray(data.formats) || data.formats.length === 0) {
      throw new Error(
        "No browser-compatible video formats are available."
      );
    }

    currentVideo = {
      url,
      platform,
      title: data.title || "Video",
      duration: data.duration
    };

    availableFormats = data.formats;

    $("platformName").textContent = platform;
    $("videoTitle").textContent = currentVideo.title;
    $("videoDuration").textContent =
      formatDuration(currentVideo.duration);

    renderQualities(availableFormats);

    $("results").classList.remove("hidden");

    showMessage(
      `Found ${availableFormats.length} playable video formats.`,
      "success"
    );

    $("results").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    showMessage(
      error.message || "Something went wrong.",
      "error"
    );
  } finally {
    setBusy(false);
  }
};

// -------------------------
// DOWNLOAD SELECTED FORMAT
// -------------------------

async function downloadVideo(format) {
  if (!currentVideo || !format) return;

  selectFormat(format);

  setBusy(true);

  showMessage(
    `Downloading ${format.height}p video. Please wait...`
  );

  try {
    const response = await fetch(`${API}/api/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentVideo.url,
        format_id: format.format_id
      })
    });

    if (!response.ok) {
      let message = "Download failed.";

      try {
        const data = await response.json();
        message = data.detail || message;
      } catch {}

      throw new Error(message);
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("Downloaded file is empty.");
    }

    const contentDisposition =
      response.headers.get("content-disposition") || "";

    const match = contentDisposition.match(
      /filename\*?=(?:UTF-8''|")?([^";]+)"?/i
    );

    let filename = match
      ? decodeURIComponent(match[1])
      : `ehub-video-${format.height}p.${format.ext}`;

    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    addHistory(
      currentVideo.platform,
      currentVideo.title,
      format.height
    );

    showMessage(
      `${format.height}p download started successfully.`,
      "success"
    );

  } catch (error) {
    showMessage(error.message || "Download failed.", "error");
  } finally {
    setBusy(false);
  }
}

$("downloadBtn").onclick = () => {
  if (selectedFormat) {
    downloadVideo(selectedFormat);
  }
};

// -------------------------
// HISTORY
// -------------------------

function addHistory(platform, title, quality) {
  let history = JSON.parse(
    localStorage.getItem("ehubHistory") || "[]"
  );

  history.unshift({
    platform,
    title,
    quality,
    date: new Date().toLocaleString()
  });

  history = history.slice(0, 10);

  localStorage.setItem(
    "ehubHistory",
    JSON.stringify(history)
  );

  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(
    localStorage.getItem("ehubHistory") || "[]"
  );

  $("historyList").innerHTML = "";

  if (!history.length) {
    $("historyList").textContent = "No downloads yet.";
    return;
  }

  history.forEach(entry => {
    const item = document.createElement("div");
    item.className = "history-item";

    const title = document.createElement("strong");
    title.textContent =
      `${entry.platform} · ${entry.quality}p`;

    const details = document.createElement("div");
    details.textContent =
      `${entry.title} · ${entry.date}`;

    item.append(title, details);
    $("historyList").appendChild(item);
  });
}

$("clearHistory").onclick = () => {
  localStorage.removeItem("ehubHistory");
  renderHistory();
};

renderHistory();
  
