
const $ = id => document.getElementById(id);

const API = "https://ehub-video-downloader.onrender.com";

let currentVideo = null;
let selectedQuality = "best";
let busy = false;

$("year").textContent = new Date().getFullYear();

function showMessage(message, type = "") {
  $("message").textContent = message;
  $("message").className = "message " + type;
}

function setBusy(value) {
  busy = value;
  $("checkBtn").disabled = value;
  $("checkBtn").textContent = value ? "Please wait..." : "Find Video";
  $("downloadBtn").disabled = value || !currentVideo;
}

// THEME

function loadTheme() {
  let theme = "dark";

  try {
    theme = localStorage.getItem("ehubTheme") || "dark";
  } catch {}

  document.body.classList.toggle("light", theme === "light");
  $("themeBtn").textContent = theme === "light" ? "🌙" : "☀️";
}

$("themeBtn").onclick = () => {
  const light = !document.body.classList.contains("light");

  document.body.classList.toggle("light", light);

  try {
    localStorage.setItem("ehubTheme", light ? "light" : "dark");
  } catch {}

  $("themeBtn").textContent = light ? "🌙" : "☀️";
};

loadTheme();

// PLATFORM

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();

  if (host.includes("youtube.com") || host === "youtu.be")
    return "YouTube";

  if (host.includes("instagram.com"))
    return "Instagram";

  if (host.includes("facebook.com") || host === "fb.watch")
    return "Facebook";

  if (host.includes("tiktok.com"))
    return "TikTok";

  if (host.includes("twitter.com") || host.includes("x.com"))
    return "X / Twitter";

  throw new Error("This platform is not supported by the frontend.");
}

function getYouTubeId(url) {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be"))
      return u.pathname.split("/").filter(Boolean)[0];

    if (u.pathname.includes("/shorts/"))
      return u.pathname.split("/")[2];

    if (u.pathname.includes("/embed/"))
      return u.pathname.split("/")[2];

    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function formatDuration(seconds) {
  if (seconds == null) return "Duration unavailable";

  const n = Number(seconds);

  if (!Number.isFinite(n)) return "Duration unavailable";

  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);

  return h
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;
}

// PASTE

$("pasteBtn").onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();

    if (!text.trim()) throw new Error();

    $("videoUrl").value = text.trim();
    showMessage("Link pasted. Now click Find Video.", "success");

  } catch {
    $("videoUrl").focus();
    showMessage("Long press the input box and select Paste.");
  }
};

// PREVIEW

function renderPreview(video) {
  const area = $("previewArea");
  area.replaceChildren();

  if (video.platform === "YouTube") {
    const id = getYouTubeId(video.url);

    if (id) {
      const frame = document.createElement("iframe");

      frame.src =
        "https://www.youtube-nocookie.com/embed/" +
        encodeURIComponent(id);

      frame.title = "YouTube preview";
      frame.allowFullscreen = true;
      frame.allow =
        "accelerometer; autoplay; encrypted-media; picture-in-picture";

      area.appendChild(frame);

      $("previewMessage").textContent =
        "YouTube preview is available above.";

    } else {
      area.textContent = "Preview unavailable.";
    }

  } else {
    const placeholder = document.createElement("div");

    placeholder.className = "preview-placeholder";
    placeholder.innerHTML =
      "<span>▶</span><p>Open the original video to preview.</p>";

    area.appendChild(placeholder);

    $("previewMessage").textContent =
      "This platform does not provide an embedded preview here.";
  }

  $("openOriginal").href = video.url;
}

// QUALITY OPTIONS

const qualities = [
  { value: "best", label: "Best Available", desc: "Highest available quality" },
  { value: "1080", label: "1080p", desc: "Full HD" },
  { value: "720", label: "720p", desc: "HD" },
  { value: "480", label: "480p", desc: "Standard" },
  { value: "360", label: "360p", desc: "Low data usage" }
];

function renderQualities() {
  const list = $("qualityList");
  list.replaceChildren();

  qualities.forEach(q => {
    const button = document.createElement("button");

    button.type = "button";
    button.className =
      "quality-item" +
      (selectedQuality === q.value ? " selected" : "");

    const info = document.createElement("span");
    info.className = "quality-info";

    const title = document.createElement("strong");
    title.textContent = q.label;

    const desc = document.createElement("small");
    desc.textContent = q.desc;

    info.append(title, desc);

    const status = document.createElement("span");
    status.className = "quality-status";
    status.textContent =
      selectedQuality === q.value ? "✓ Selected" : "Select";

    button.append(info, status);

    button.onclick = () => {
      selectedQuality = q.value;
      renderQualities();
    };

    list.appendChild(button);
  });
}

// GET VIDEO

$("checkBtn").onclick = async () => {
  const url = $("videoUrl").value.trim();

  currentVideo = null;
  $("results").classList.add("hidden");
  $("downloadBtn").disabled = true;

  if (!url) {
    showMessage("Please enter a video link.", "error");
    return;
  }

  let platform;

  try {
    const parsed = new URL(url);

    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Invalid video URL.");
    }

    platform = detectPlatform(url);

  } catch (error) {
    showMessage(error.message || "Invalid link.", "error");
    return;
  }

  setBusy(true);
  showMessage("Connecting to eHub server...");

  try {
    const response = await fetch(API + "/api/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.detail || "Unable to find this video."
      );
    }

    const data = await response.json();

    currentVideo = {
      url,
      platform: data.site || platform,
      title: data.title || "Video",
      duration: data.duration
    };

    selectedQuality = "best";

    $("platformName").textContent = currentVideo.platform;
    $("videoTitle").textContent = currentVideo.title;

    $("videoMeta").textContent =
      "Duration: " + formatDuration(currentVideo.duration);

    renderPreview(currentVideo);
    renderQualities();

    $("results").classList.remove("hidden");

    showMessage("Video found successfully!", "success");

    $("results").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    showMessage(
      error.message || "Backend connection failed.",
      "error"
    );

  } finally {
    setBusy(false);
  }
};

// DOWNLOAD

$("downloadBtn").onclick = async () => {
  if (!currentVideo || busy) return;

  setBusy(true);

  showMessage("Preparing your download...");

  try {
    const response = await fetch(API + "/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentVideo.url,
        quality: selectedQuality
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.detail || "Download failed."
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("Empty video file received.");
    }

    const disposition =
      response.headers.get("content-disposition") || "";

    const match = disposition.match(
      /filename\*?=(?:UTF-8''|")?([^";]+)"?/i
    );

    let filename = match
      ? decodeURIComponent(match[1].replace(/"/g, ""))
      : "ehub-video.mp4";

    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60000);

    addHistory(
      currentVideo.platform,
      currentVideo.title,
      selectedQuality
    );

    showMessage("Download started successfully!", "success");

  } catch (error) {
    showMessage(error.message || "Download failed.", "error");

  } finally {
    setBusy(false);
  }
};

// HISTORY

function addHistory(platform, title, quality) {
  let history = [];

  try {
    history = JSON.parse(
      localStorage.getItem("ehubHistory") || "[]"
    );
  } catch {}

  history.unshift({
    platform,
    title,
    quality,
    date: new Date().toLocaleString()
  });

  try {
    localStorage.setItem(
      "ehubHistory",
      JSON.stringify(history.slice(0, 10))
    );
  } catch {}

  renderHistory();
}

function renderHistory() {
  let history = [];

  try {
    history = JSON.parse(
      localStorage.getItem("ehubHistory") || "[]"
    );
  } catch {}

  const list = $("historyList");
  list.replaceChildren();

  if (!history.length) {
    list.textContent = "No downloads yet.";
    return;
  }

  history.forEach(entry => {
    const item = document.createElement("div");
    item.className = "history-item";

    const title = document.createElement("strong");
    title.textContent =
      `${entry.platform} · ${entry.quality}`;

    const detail = document.createElement("div");
    detail.textContent =
      `${entry.title} · ${entry.date}`;

    item.append(title, detail);
    list.appendChild(item);
  });
}

$("clearHistory").onclick = () => {
  localStorage.removeItem("ehubHistory");
  renderHistory();
};

renderHistory();
