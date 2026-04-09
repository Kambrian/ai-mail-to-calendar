// options.js — Settings page logic

const defaults = {
  aiBaseUrl: "https://api.openai.com/v1",
  aiApiKey: "",
  aiModel: "gpt-4o-mini",
  aiTimezone: "Asia/Shanghai",
  accounts: []  // [{name, baseUrl, username, password, eventPath, taskPath}]
};

function createAccountRow(acct = {}) {
  const row = document.createElement("div");
  row.className = "account-row";
  row.innerHTML = `
    <div class="field">
      <label>Account Name</label>
      <input type="text" class="acct-name" value="${esc(acct.name || "")}" placeholder="SJTU Mail">
    </div>
    <div class="field">
      <label>CalDAV Base URL</label>
      <input type="url" class="acct-url" value="${esc(acct.baseUrl || "")}" placeholder="https://mail.example.com/dav/user@example.com/">
      <div class="hint">Parent URL that contains your calendar and task collections</div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Username</label>
        <input type="text" class="acct-user" value="${esc(acct.username || "")}" placeholder="user@example.com">
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" class="acct-pass" value="${esc(acct.password || "")}" placeholder="••••••••">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Events Collection Path</label>
        <input type="text" class="acct-event-path" value="${esc(acct.eventPath || "Calendar")}" placeholder="Calendar">
        <div class="hint">Subfolder name for events (e.g. "Calendar")</div>
      </div>
      <div class="field">
        <label>Tasks Collection Path</label>
        <input type="text" class="acct-task-path" value="${esc(acct.taskPath || "Tasks")}" placeholder="Tasks">
        <div class="hint">Subfolder name for tasks (e.g. "Task" or "Tasks")</div>
      </div>
    </div>
    <div class="account-actions">
      <button class="btn-test-acct">🔗 Test Connection</button>
      <button class="btn-discover">🔍 Auto-Discover</button>
      <button class="btn-danger remove-acct">✕ Remove</button>
    </div>
    <div class="acct-status"></div>
  `;
  row.querySelector(".remove-acct").addEventListener("click", () => row.remove());
  row.querySelector(".btn-test-acct").addEventListener("click", () => testAccountConnection(row));
  row.querySelector(".btn-discover").addEventListener("click", () => autoDiscover(row));
  return row;
}

function esc(s) {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function getAccounts() {
  const rows = document.querySelectorAll(".account-row");
  return Array.from(rows).map(row => ({
    name: row.querySelector(".acct-name").value.trim(),
    baseUrl: row.querySelector(".acct-url").value.trim().replace(/\/+$/, ""),
    username: row.querySelector(".acct-user").value.trim(),
    password: row.querySelector(".acct-pass").value.trim(),
    eventPath: row.querySelector(".acct-event-path").value.trim() || "Calendar",
    taskPath: row.querySelector(".acct-task-path").value.trim() || "Tasks"
  })).filter(a => a.name && a.baseUrl);
}

function showStatus(msg, type, timeout = 6000) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = type;
  el.style.display = "block";
  if (timeout > 0) {
    setTimeout(() => { el.className = ""; el.style.display = "none"; }, timeout);
  }
}

function showAcctStatus(row, msg, type) {
  const el = row.querySelector(".acct-status");
  el.textContent = msg;
  el.className = "acct-status " + type;
  el.style.display = "block";
}

async function loadSettings() {
  const data = await browser.storage.local.get(defaults);
  document.getElementById("aiBaseUrl").value = data.aiBaseUrl;
  document.getElementById("aiApiKey").value = data.aiApiKey;
  document.getElementById("aiModel").value = data.aiModel;
  document.getElementById("aiTimezone").value = data.aiTimezone;

  // Migration: convert old "calendars" format to new "accounts" format
  let accounts = data.accounts || [];
  if (accounts.length === 0 && data.calendars && data.calendars.length > 0) {
    // Try to group old calendars by base URL
    const grouped = {};
    for (const cal of data.calendars) {
      const urlParts = cal.url.replace(/\/+$/, "").split("/");
      const path = urlParts.pop();
      const base = urlParts.join("/");
      const key = `${base}|${cal.username}`;
      if (!grouped[key]) {
        grouped[key] = { name: cal.name, baseUrl: base, username: cal.username, password: cal.password, eventPath: "", taskPath: "" };
      }
      if (cal.type === "task") {
        grouped[key].taskPath = path;
      } else {
        grouped[key].eventPath = path;
      }
    }
    accounts = Object.values(grouped);
    // Save migrated
    await browser.storage.local.set({ accounts });
  }

  const list = document.getElementById("accountList");
  list.innerHTML = "";
  if (accounts.length === 0) {
    list.appendChild(createAccountRow());
  } else {
    accounts.forEach(a => list.appendChild(createAccountRow(a)));
  }
}

async function saveSettings() {
  const accounts = getAccounts();
  const settings = {
    aiBaseUrl: document.getElementById("aiBaseUrl").value.trim().replace(/\/+$/, ""),
    aiApiKey: document.getElementById("aiApiKey").value.trim(),
    aiModel: document.getElementById("aiModel").value.trim(),
    aiTimezone: document.getElementById("aiTimezone").value.trim() || "Asia/Shanghai",
    accounts
  };

  if (!settings.aiBaseUrl || !settings.aiApiKey || !settings.aiModel) {
    showStatus("Please fill in all AI configuration fields.", "error");
    return;
  }
  if (accounts.length === 0) {
    showStatus("Please add at least one CalDAV account.", "error");
    return;
  }

  // Also save in the old "calendars" format for background.js compatibility
  const calendars = [];
  for (const acct of accounts) {
    if (acct.eventPath) {
      calendars.push({
        name: `${acct.name} — Events`,
        url: `${acct.baseUrl}/${acct.eventPath}`,
        type: "event",
        username: acct.username,
        password: acct.password
      });
    }
    if (acct.taskPath) {
      calendars.push({
        name: `${acct.name} — Tasks`,
        url: `${acct.baseUrl}/${acct.taskPath}`,
        type: "task",
        username: acct.username,
        password: acct.password
      });
    }
  }
  settings.calendars = calendars;

  await browser.storage.local.set(settings);
  showStatus("Settings saved!", "success");
}

// ── Test AI Connection (verbose) ────────────────────────
async function testAiConnection() {
  const baseUrl = document.getElementById("aiBaseUrl").value.trim().replace(/\/+$/, "");
  const apiKey = document.getElementById("aiApiKey").value.trim();
  const model = document.getElementById("aiModel").value.trim();

  if (!baseUrl || !apiKey || !model) {
    showStatus("⚠️ Fill in Base URL, API Key, and Model ID first.", "error");
    return;
  }

  const endpoint = `${baseUrl}/chat/completions`;
  showStatus(`🔄 Sending request to ${endpoint}\n   Model: ${model}\n   Waiting for response...`, "success", 0);

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
        max_tokens: 10
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (resp.ok) {
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || "(empty response)";
      const modelUsed = data.model || model;
      showStatus(
        `✅ AI connection successful!\n` +
        `   Endpoint: ${endpoint}\n` +
        `   Model: ${modelUsed}\n` +
        `   Response: "${reply.substring(0, 100)}"\n` +
        `   Time: ${elapsed}s`,
        "success", 10000
      );
    } else {
      const errBody = await resp.text();
      showStatus(
        `❌ AI error (HTTP ${resp.status} ${resp.statusText})\n` +
        `   Endpoint: ${endpoint}\n` +
        `   Model: ${model}\n` +
        `   Time: ${elapsed}s\n` +
        `   Response: ${errBody.substring(0, 300)}`,
        "error", 15000
      );
    }
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (e.name === "AbortError") {
      showStatus(`❌ Request timed out after 30s\n   Endpoint: ${endpoint}\n   Model: ${model}`, "error", 15000);
    } else {
      showStatus(`❌ Connection failed (${elapsed}s)\n   Endpoint: ${endpoint}\n   Error: ${e.message}`, "error", 15000);
    }
  }
}

// ── Test Account Connection ─────────────────────────────
async function testAccountConnection(row) {
  const baseUrl = row.querySelector(".acct-url").value.trim().replace(/\/+$/, "");
  const username = row.querySelector(".acct-user").value.trim();
  const password = row.querySelector(".acct-pass").value.trim();
  const eventPath = row.querySelector(".acct-event-path").value.trim() || "Calendar";
  const taskPath = row.querySelector(".acct-task-path").value.trim() || "Tasks";

  if (!baseUrl || !username || !password) {
    showAcctStatus(row, "⚠️ Fill in URL, username, and password first.", "error");
    return;
  }

  showAcctStatus(row, "🔄 Testing connections...", "success");

  const results = [];
  for (const [label, path] of [["Events", eventPath], ["Tasks", taskPath]]) {
    if (!path) continue;
    const url = `${baseUrl}/${path}`;
    try {
      const resp = await propfind(url, username, password);
      if (resp.status === 207 || resp.status === 200) {
        let displayName = "";
        const m = resp.text.match(/<(?:d:)?displayname[^>]*>([^<]*)<\/(?:d:)?displayname>/i);
        if (m) displayName = m[1];
        results.push(`✅ ${label}: ${displayName || path} (${url})`);
      } else if (resp.status === 401 || resp.status === 403) {
        results.push(`❌ ${label}: Auth failed (${resp.status})`);
      } else if (resp.status === 404) {
        results.push(`❌ ${label}: Not found — check path "${path}"`);
      } else {
        results.push(`⚠️ ${label}: HTTP ${resp.status}`);
      }
    } catch (e) {
      results.push(`❌ ${label}: ${e.message}`);
    }
  }

  showAcctStatus(row, results.join("\n"), results.every(r => r.startsWith("✅")) ? "success" : "error");
}

// ── Auto-Discover Collections ───────────────────────────
async function autoDiscover(row) {
  const baseUrl = row.querySelector(".acct-url").value.trim().replace(/\/+$/, "");
  const username = row.querySelector(".acct-user").value.trim();
  const password = row.querySelector(".acct-pass").value.trim();

  if (!baseUrl || !username || !password) {
    showAcctStatus(row, "⚠️ Fill in URL, username, and password first.", "error");
    return;
  }

  showAcctStatus(row, "🔍 Discovering calendar collections...", "success");

  try {
    // PROPFIND on the base URL with Depth: 1 to list children
    const resp = await propfind(baseUrl + "/", username, password, "1");

    if (resp.status !== 207 && resp.status !== 200) {
      showAcctStatus(row, `❌ Discovery failed (HTTP ${resp.status}). Try entering paths manually.`, "error");
      return;
    }

    // Parse the multistatus response for calendar/task collections
    const text = resp.text;
    let eventPath = "", taskPath = "";
    const discovered = [];

    // Simple XML parsing: find <response> blocks
    const responses = text.split(/<\/?(?:d:)?response>/i).filter(s => s.includes("<"));
    for (const block of responses) {
      const hrefMatch = block.match(/<(?:d:)?href[^>]*>([^<]+)<\/(?:d:)?href>/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];

      const isCalendar = block.includes("calendar") || block.includes("VEVENT");
      const isTask = block.includes("VTODO");
      const nameMatch = block.match(/<(?:d:)?displayname[^>]*>([^<]*)<\/(?:d:)?displayname>/i);
      const name = nameMatch ? nameMatch[1] : "";

      // Extract the relative path from href
      const relPath = href.replace(baseUrl, "").replace(/^\/+/, "").replace(/\/+$/, "");
      if (!relPath) continue; // skip the parent itself

      if (isTask && !taskPath) {
        taskPath = relPath;
        discovered.push(`📋 Tasks: "${name || relPath}" → ${relPath}`);
      } else if (isCalendar && !eventPath) {
        eventPath = relPath;
        discovered.push(`📅 Events: "${name || relPath}" → ${relPath}`);
      }
    }

    if (eventPath) {
      row.querySelector(".acct-event-path").value = eventPath;
    }
    if (taskPath) {
      row.querySelector(".acct-task-path").value = taskPath;
    }

    if (discovered.length > 0) {
      showAcctStatus(row, `✅ Discovered:\n${discovered.join("\n")}`, "success");
    } else {
      showAcctStatus(row, "⚠️ No calendar/task collections found. Enter paths manually.", "error");
    }
  } catch (e) {
    showAcctStatus(row, `❌ Discovery failed: ${e.message}`, "error");
  }
}

// ── CalDAV PROPFIND helper ──────────────────────────────
function propfind(url, username, password, depth = "0") {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PROPFIND", url, true);
    xhr.setRequestHeader("Authorization", "Basic " + btoa(`${username}:${password}`));
    xhr.setRequestHeader("Content-Type", "application/xml; charset=utf-8");
    xhr.setRequestHeader("Depth", depth);
    xhr.timeout = 15000;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <cs:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`;

    xhr.onload = () => resolve({ status: xhr.status, statusText: xhr.statusText, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Timed out after 15s"));
    xhr.send(body);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  document.getElementById("save").addEventListener("click", saveSettings);
  document.getElementById("testAi").addEventListener("click", testAiConnection);
  document.getElementById("addAccount").addEventListener("click", () => {
    document.getElementById("accountList").appendChild(createAccountRow());
  });
});
