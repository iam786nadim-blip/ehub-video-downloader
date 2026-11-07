
const $ = id => document.getElementById(id);

const API = "https://ehub-video-downloader.onrender.com";

let currentUrl = "";
let currentPlatform = "";
let busy = false;

$("year").textContent = new Date().getFullYear();

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();

  if (host.includes("instagram.com")) return "Instagram";
  if (host.includes("facebook.com") || host === "fb.watch") return "Facebook";
  if (host.includes("twitter.com") || host === "x.com") return "X / Twitter";
  if (host.includes("youtube.com") || host === "youtu.be") return "YouTube";
  if (host.includes("tiktok.com")) return "TikTok";
  if (host.includes("pinterest.com") || host === "pin.it") return "Pinterest";

  return "Unknown";
}

function showMessage(message) {
  $("message").textContent = message;
}

function setBusy(value) {
  busy = value;
  $("checkBtn").disabled = value;
  $("directDownload").disabled = value;
}

$("themeBtn").onclick = () => {
  document.body.classList.toggle("light");
  localStorage.setItem(
    "ehubTheme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
};

if (localStorage.getItem("ehubTheme") === "light") {
  document.body.classList.add("light");
}

$("pasteBtn").onclick = async () => {
  try {
    $("videoUrl").value = await navigator.clipboard.readText();
  } catch {
    showMessage("Please paste your link manually.");
  }
};

function addHistory(url, platform) {
  let history = JSON.parse(
    localStorage.getItem("ehubHistory") || "[]"
  );

  history.unshift({
    url,
    platform,
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
    title.textContent = item.platform + " · " + item.date;

    const link = document.createElement("div");
    link.textContent = item.url;

    div.append(title, link);
    $("historyList").appendChild(div);
  });
}

$("clearHistory").onclick = () => {
  localStorage.removeItem("ehubHistory");
  renderHistory();
};

$("checkBtn").onclick = async () => {
  if (busy) return;

  const url = $("videoUrl").value.trim();

  $("preview").classList.add("hidden");
  currentUrl = "";
  currentPlatform = "";

  if (!url) {
    showMessage("Please enter a video URL.");
    return;
  }

  let parsed;

  try {
    parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    showMessage("Please enter a valid HTTPS video URL.");
    return;
  }

  const platform = detectPlatform(url);

  if (platform === "Unknown" || platform === "Pinterest") {
    showMessage("This platform is not currently supported.");
    return;
  }

  currentUrl = url;
  currentPlatform = platform;

  setBusy(true);
  showMessage("Connecting to eHub server. Please wait...");

  try {
    const response = await fetch(API + "/api/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not access this video.");
    }

    $("platformName").textContent = platform;

    // Use an existing title element if your page has one.
    const titleElement = $("videoTitle");
    if (titleElement) {
      titleElement.textContent = data.title || "Video ready";
    }

    $("preview").classList.remove("hidden");

    showMessage(
      "Video information found: " +
      (data.title || "Video") +
      ". Choose Download."
    );

  } catch (error) {
    currentUrl = "";
    showMessage(error.message || "Server connection failed.");
  } finally {
    setBusy(false);
  }
};

$("directDownload").onclick = async () => {
  if (!currentUrl || busy) {
    showMessage("Please check a video link first.");
    return;
  }

  setBusy(true);
  showMessage("Preparing your video. Please wait...");

  try {
    const response = await fetch(API + "/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentUrl,
        quality: "best"
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
    const objectUrl = URL.createObjectURL(blob);

    const disposition =
      response.headers.get("Content-Disposition") || "";

    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match ? match[1] : "ehub-video.mp4";

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    addHistory(currentUrl, currentPlatform);

    showMessage("Download started successfully!");

  } catch (error) {
    showMessage(error.message || "Download failed. Try another public video.");
  } finally {
    setBusy(false);
  }
};

renderHistory();
