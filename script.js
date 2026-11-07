
const $ = id => document.getElementById(id);

const API = "https://ehub-video-downloader.onrender.com";

let currentVideo = null;

$("year").textContent = new Date().getFullYear();

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
// MESSAGE
// -------------------------

function showMessage(text, type = "") {
  $("message").textContent = text;
  $("message").className = "message " + type;
}

// -------------------------
// PLATFORM DETECTION
// -------------------------

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();

  if (host === "x.com" || host.endsWith(".x.com") ||
      host === "twitter.com" || host.endsWith(".twitter.com")) {
    return "X / Twitter";
  }

  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return "Instagram";
  }

  if (host === "facebook.com" || host.endsWith(".facebook.com") ||
      host === "fb.watch") {
    return "Facebook";
  }

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return "TikTok";
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com") ||
      host === "youtu.be") {
    return "YouTube";
  }

  throw new Error("This platform is not supported.");
}

// -------------------------
// PASTE BUTTON
// -------------------------

$("pasteBtn").onclick = async () => {
  try {
    $("videoUrl").value = await navigator.clipboard.readText();
    showMessage("Link pasted. Now click Find Video.", "success");
  } catch {
    showMessage("Please paste your link manually.");
  }
};

// -------------------------
// HISTORY
// -------------------------

function addHistory(url, platform, title, quality) {
  let history = JSON.parse(
    localStorage.getItem("ehubHistory") || "[]"
  );

  history.unshift({
    url,
    platform,
    title,
    quality,
    date: new Date().toLocaleString()
  });

  history = history.slice(0, 10);

  localStorage.setItem("ehubHistory", JSON.stringify(history));

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

  history.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";

    const title = document.createElement("strong");
    title.textContent = `${item.platform} · ${item.quality}p`;

    const details = document.createElement("div");
    details.textContent =
      `${item.title} · ${item.date}`;

    div.append(title, details);

    $("historyList").appendChild(div);
  });
}

$("clearHistory").onclick = () => {
  localStorage.removeItem("ehubHistory");
  renderHistory();
};

// -------------------------
// BUTTON STATE
// -------------------------

function setBusy(busy) {
  $("checkBtn").disabled = busy;
  $("directDownload").disabled = busy || !currentVideo;

  $("checkBtn").textContent = busy ? "Please wait..." : "Find Video";

  if (busy) {
    $("directDownload").textContent = "Please wait...";
  } else {
    $("directDownload").textContent = "Download Video";
  }
}

// -------------------------
// CHECK VIDEO
// -------------------------

$("checkBtn").onclick = async () => {
  const url = $("videoUrl").value.trim();

  currentVideo = null;
  $("preview").classList.add("hidden");
  $("directDownload").disabled = true;

  if (!url) {
    showMessage("Please enter a video URL.", "error");
    return;
  }

  let platform;

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      throw new Error("Please enter a valid HTTPS URL.");
    }

    platform = detectPlatform(url);

  } catch (error) {
    showMessage(error.message || "Invalid or unsupported URL.", "error");
    return;
  }

  setBusy(true);
  showMessage("Checking video. Please wait...");

  try {
    const response = await fetch(`${API}/api/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: url,
        quality: $("quality").value
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Video could not be checked.");
    }

    currentVideo = {
      url,
      platform,
      title: data.title || "Video",
      duration: data.duration
    };

    $("platformName").textContent = platform;
    $("videoTitle").textContent = currentVideo.title;

    const duration = currentVideo.duration;

    $("videoDuration").textContent =
      duration ? `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s` :
      "Duration: Unknown";

    $("preview").classList.remove("hidden");
    $("directDownload").disabled = false;

    showMessage("Video found! Select your quality and download.", "success");

  } catch (error) {
    showMessage(error.message || "Unable to connect to the downloader.", "error");
  } finally {
    setBusy(false);
  }
};

// -------------------------
// DOWNLOAD VIDEO
// -------------------------

$("directDownload").onclick = async () => {
  if (!currentVideo) {
    showMessage("Please find a video first.", "error");
    return;
  }

  const quality = $("quality").value;

  setBusy(true);
  showMessage(`Downloading video in ${quality === "best" ? "Best Available" : quality + "p"} quality. Please wait...`);

  try {
    const response = await fetch(`${API}/api/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentVideo.url,
        quality: quality
      })
    });

    if (!response.ok) {
      let errorMessage = "Download failed.";

      try {
        const data = await response.json();
        errorMessage = data.detail || errorMessage;
      } catch {}

      throw new Error(errorMessage);
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("The downloaded file is empty.");
    }

    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${currentVideo.platform.replace(/[^a-z0-9]/gi, "-")}-${quality}p.mp4`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    addHistory(
      currentVideo.url,
      currentVideo.platform,
      currentVideo.title,
      quality === "best" ? "Best" : quality
    );

    showMessage("Download started. Check your Downloads folder.", "success");

  } catch (error) {
    showMessage(error.message || "Download failed. Please try again.", "error");
  } finally {
    setBusy(false);
  }
};

// -------------------------
// INITIALIZE
// -------------------------

renderHistory();
