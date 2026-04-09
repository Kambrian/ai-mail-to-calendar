// progress.js — Progress window logic
const statusEl = document.getElementById("status");
const closeBtn = document.getElementById("closeBtn");

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "progressUpdate") {
    statusEl.innerHTML = message.html || "";
    if (message.showClose) {
      closeBtn.style.display = "inline-block";
    }
    if (message.autoClose) {
      setTimeout(() => window.close(), message.autoClose);
    }
  }
});

closeBtn.addEventListener("click", () => window.close());

// Tell background we're ready
browser.runtime.sendMessage({ action: "progressReady" });
