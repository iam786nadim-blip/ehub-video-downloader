
const $ = id => document.getElementById(id);

let currentMediaUrl = "";

$("year").textContent = new Date().getFullYear();

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();

  if (host.includes("instagram.com")) return "Instagram";
  if (host.includes("facebook.com") || host === "fb.watch") return "Facebook";
  if (host.includes("twitter.com") || host === "x.com") return "X / Twitter";
  if (host.includes("youtube.com") || host === "youtu.be") return "YouTube";
  if (host.includes("tiktok.com")) return "TikTok";
  if (host.includes("pinterest.com") || host === "pin.it") return "Pinterest";

  return "Direct video link";
}

function showMessage(text) {
  $("message").textContent = text;
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
  let history = JSON.parse(localStorage.getItem("ehubHistory") || "[]");

  history.unshift({url, platform, date: new Date().toLocaleString()});
  history = history.slice(0, 10);

  localStorage.setItem("ehubHistory", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("ehubHistory") || "[]");

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
  const url = $("videoUrl").value.trim();

  $("preview").classList.add("hidden");
  currentMediaUrl = "";

  if (!url) {
    showMessage("Please enter a video URL.");
    return;
  }

  let parsed;

  try {
    parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error();
    }
  } catch {
    showMessage("Please enter a valid HTTP or HTTPS URL.");
    return;
  }

  const platform = detectPlatform(url);

  if (platform !== "Direct video link") {
    showMessage(
      platform + " link detected. This frontend-only edition cannot extract videos from this platform. A compatible backend or official download option is required."
    );
    return;
  }

  showMessage("Checking whether this is a directly accessible video...");

  try {
    const response = await fetch(url, {method:"GET", mode:"cors"});
    if (!response.ok) throw new Error("Video could not be accessed.");

    const type = response.headers.get("content-type") || "";

    if (!type.startsWith("video/")) {
      throw new Error("The link did not return a video file.");
    }

    const blob = await response.blob();
    currentMediaUrl = URL.createObjectURL(blob);

    $("videoPreview").src = currentMediaUrl;
    $("platformName").textContent = "Direct video link";
    $("preview").classList.remove("hidden");

    showMessage("Video found. You can preview and download it.");
  } catch {
    showMessage(
      "This source does not allow browser access (CORS), or the URL is not a direct video file. Try a permitted direct video link."
    );
  }
};

$("directDownload").onclick = () => {
  if (!currentMediaUrl) return;

  const a = document.createElement("a");
  a.href = currentMediaUrl;
  a.download = "ehub-video.mp4";
  document.body.appendChild(a);
  a.click();
  a.remove();

  addHistory($("videoUrl").value, $("platformName").textContent);
};

renderHistory();
