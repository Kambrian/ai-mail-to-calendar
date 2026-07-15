// options.js — Settings page logic

const PROVIDERS = {
  openai: {
    label: "OpenAI-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    hint: "Any OpenAI-compatible endpoint (OpenAI, DeepSeek, Groq, Ollama, Requesty, OpenRouter, etc.)",
    modelHint: "e.g. gpt-4o-mini, deepseek-chat, llama3-8b-8192"
  },
  anthropic: {
    label: "Anthropic (Claude)",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-haiku-20241022",
    hint: "Direct Anthropic API or Requesty anthropic-messages endpoint",
    modelHint: "e.g. claude-3-5-haiku-20241022, claude-opus-4-5"
  },
  google: {
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.0-flash",
    hint: "Google Gemini API (get key at aistudio.google.com)",
    modelHint: "e.g. gemini-2.0-flash, gemini-1.5-pro"
  }
};

const defaults = {
  aiProvider: "openai",
  aiBaseUrl: "https://api.openai.com/v1",
  aiApiKey: "",
  aiModel: "gpt-4o-mini",
  aiTimezone: "Asia/Shanghai",
  accounts: []
};

function onProviderChange(provider, keepValues = false) {
  const p = PROVIDERS[provider];
  if (!p) return;
  document.getElementById("aiProviderHint").textContent = p.hint;
  document.getElementById("aiModelHint").textContent = p.modelHint;
  if (!keepValues) {
    document.getElementById("aiBaseUrl").value = p.defaultBaseUrl;
    document.getElementById("aiModel").value = p.defaultModel;
  }
}

function makeElement(tag, { className, textContent, type, value, placeholder } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent !== undefined) el.textContent = textContent;
  if (type) el.type = type;
  if (value !== undefined) el.value = value;
  if (placeholder) el.placeholder = placeholder;
  return el;
}

function createField(labelText, inputClass, inputType, value, placeholder, hintText) {
  const field = makeElement("div", { className: "field" });
  field.appendChild(makeElement("label", { textContent: labelText }));
  field.appendChild(makeElement("input", { className: inputClass, type: inputType, value, placeholder }));
  if (hintText) field.appendChild(makeElement("div", { className: "hint", textContent: hintText }));
  return field;
}

function createAccountRow(acct = {}) {
  const row = makeElement("div", { className: "account-row" });
  row.appendChild(createField("Account Name", "acct-name", "text", acct.name || "", "SJTU Mail"));
  row.appendChild(createField("CalDAV Base URL", "acct-url", "url", acct.baseUrl || "", "https://mail.example.com/dav/user@example.com/", "Parent URL that contains your calendar and task collections"));

  const credentials = makeElement("div", { className: "field-row" });
  credentials.appendChild(createField("Username", "acct-user", "text", acct.username || "", "user@example.com"));
  credentials.appendChild(createField("Password", "acct-pass", "password", acct.password || "", "••••••••"));
  row.appendChild(credentials);

  const collections = makeElement("div", { className: "field-row" });
  collections.appendChild(createField("Events Collection Path", "acct-event-path", "text", acct.eventPath || "Calendar", "Calendar", "Subfolder name for events (e.g. \"Calendar\")"));
  collections.appendChild(createField("Tasks Collection Path", "acct-task-path", "text", acct.taskPath || "Tasks", "Tasks", "Subfolder name for tasks (e.g. \"Task\" or \"Tasks\")"));
  row.appendChild(collections);

  const actions = makeElement("div", { className: "account-actions" });
  const testButton = makeElement("button", { className: "btn-test-acct", type: "button", textContent: "🔗 Test Connection" });
  const discoverButton = makeElement("button", { className: "btn-discover", type: "button", textContent: "🔍 Auto-Discover" });
  const removeButton = makeElement("button", { className: "btn-danger remove-acct", type: "button", textContent: "✕ Remove" });
  actions.append(testButton, discoverButton, removeButton);
  row.appendChild(actions);
  row.appendChild(makeElement("div", { className: "acct-status" }));

  removeButton.addEventListener("click", () => row.remove());
  testButton.addEventListener("click", () => testAccountConnection(row));
  discoverButton.addEventListener("click", () => autoDiscover(row));
  return row;
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
  const data = await browser.storage.local.get(null); // get ALL stored data
  const provider = data.aiProvider || "openai";
  document.getElementById("aiProvider").value = provider;
  document.getElementById("aiBaseUrl").value = data.aiBaseUrl || defaults.aiBaseUrl;
  document.getElementById("aiApiKey").value = data.aiApiKey || "";
  document.getElementById("aiModel").value = data.aiModel || defaults.aiModel;
  document.getElementById("aiTimezone").value = data.aiTimezone || defaults.aiTimezone;
  onProviderChange(provider, true); // update hints without overwriting values

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
  list.replaceChildren();
  if (accounts.length === 0) {
    list.appendChild(createAccountRow());
  } else {
    accounts.forEach(a => list.appendChild(createAccountRow(a)));
  }
}

async function saveSettings() {
  const accounts = getAccounts();
  const settings = {
    aiProvider: document.getElementById("aiProvider").value,
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

  const hostsGranted = await requestHostPermissions([
    document.getElementById("aiBaseUrl").value.trim(),
    ...accounts.map(account => account.baseUrl)
  ]);
  if (!hostsGranted) {
    showStatus("Host permission is required for the configured AI and CalDAV servers.", "error");
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

async function testAiConnection() {
  const provider = document.getElementById("aiProvider").value;
  const baseUrl = document.getElementById("aiBaseUrl").value.trim().replace(/\/+$/, "");
  const apiKey = document.getElementById("aiApiKey").value.trim();
  const model = document.getElementById("aiModel").value.trim();

  if (!baseUrl || !apiKey || !model) {
    showStatus("⚠️ Fill in Base URL, API Key, and Model ID first.", "error");
    return;
  }
  if (!await requestHostPermissions([baseUrl])) {
    showStatus("Host permission is required to test this AI server.", "error");
    return;
  }

  const startTime = Date.now();
  let endpoint, reqHeaders, reqBody;

  if (provider === "anthropic") {
    endpoint = `${baseUrl}/v1/messages`;
    reqHeaders = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    reqBody = JSON.stringify({ model, max_tokens: 10, messages: [{ role: "user", content: "Reply with exactly one word: OK" }] });
  } else if (provider === "google") {
    endpoint = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
    reqHeaders = { "Content-Type": "application/json" };
    reqBody = JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly one word: OK" }] }], generationConfig: { maxOutputTokens: 10 } });
  } else {
    endpoint = `${baseUrl}/chat/completions`;
    reqHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
    reqBody = JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly one word: OK" }], max_tokens: 10 });
  }

  showStatus(`🔄 Sending request to ${endpoint}\n   Provider: ${PROVIDERS[provider]?.label}\n   Model: ${model}\n   Waiting for response...`, "success", 0);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch(endpoint, { method: "POST", headers: reqHeaders, body: reqBody, signal: controller.signal });
    clearTimeout(timeoutId);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (resp.ok) {
      const data = await resp.json();
      let reply = "";
      if (provider === "anthropic") reply = data.content?.[0]?.text || "(empty)";
      else if (provider === "google") reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "(empty)";
      else reply = data.choices?.[0]?.message?.content || "(empty)";
      showStatus(
        `✅ AI connection successful!\n` +
        `   Provider: ${PROVIDERS[provider]?.label}\n` +
        `   Endpoint: ${endpoint}\n` +
        `   Model: ${data.model || model}\n` +
        `   Response: "${reply.substring(0, 100)}"\n` +
        `   Time: ${elapsed}s`,
        "success", 10000
      );
    } else {
      const errBody = await resp.text();
      showStatus(
        `❌ AI error (HTTP ${resp.status} ${resp.statusText})\n` +
        `   Provider: ${PROVIDERS[provider]?.label}\n` +
        `   Endpoint: ${endpoint}\n` +
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

async function requestHostPermissions(urls) {
  try {
    const origins = [...new Set(urls.filter(Boolean).map(url => `${new URL(url).origin}/*`))];
    if (origins.length === 0) return true;
    if (await browser.permissions.contains({ origins })) return true;
    return await browser.permissions.request({ origins });
  } catch {
    return false;
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
  if (!await requestHostPermissions([baseUrl])) {
    showAcctStatus(row, "Host permission is required to contact this CalDAV server.", "error");
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
  if (!await requestHostPermissions([baseUrl])) {
    showAcctStatus(row, "Host permission is required to contact this CalDAV server.", "error");
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

    const text = resp.text;
    let eventPath = "", taskPath = "";
    const discovered = [];

    const base = new URL(baseUrl + "/");
    const basePath = base.pathname.replace(/\/+$/, "");

    // Parse <response> blocks in a tolerant way
    const responseBlocks = text.match(/<(?:[^:>]+:)?response\b[\s\S]*?<\/(?:[^:>]+:)?response>/gi) || [];

    for (const block of responseBlocks) {
      const hrefMatch = block.match(/<(?:[^:>]+:)?href[^>]*>([^<]+)<\/(?:[^:>]+:)?href>/i);
      if (!hrefMatch) continue;

      const hrefRaw = decodeURIComponent(hrefMatch[1].trim());
      let hrefUrl;
      try {
        hrefUrl = new URL(hrefRaw, base.origin);
      } catch {
        continue;
      }

      const hrefPath = hrefUrl.pathname.replace(/\/+$/, "");
      if (!hrefPath.startsWith(basePath)) continue;

      const relPath = hrefPath.slice(basePath.length).replace(/^\/+/, "");
      if (!relPath) continue; // parent itself

      // Only keep first-level children under base path
      if (relPath.includes("/")) continue;

      const hasVevent = /<[^>]*comp[^>]*name\s*=\s*"vevent"/i.test(block);
      const hasVtodo = /<[^>]*comp[^>]*name\s*=\s*"vtodo"/i.test(block);

      const nameMatch = block.match(/<(?:[^:>]+:)?displayname[^>]*>([^<]*)<\/(?:[^:>]+:)?displayname>/i);
      const name = nameMatch ? nameMatch[1].trim() : "";
      const relLower = relPath.toLowerCase();
      const nameLower = name.toLowerCase();

      // Skip common mail/system folders that are not CalDAV collections
      const bannedFolders = new Set(["inbox", "trash", "drafts", "sent", "junk", "spam", "archive", "deleted", "bin"]);
      if (bannedFolders.has(relLower) || bannedFolders.has(nameLower)) continue;

      const looksLikeTaskByName = relLower === "tasks" || relLower === "task" || nameLower === "tasks" || nameLower === "task";
      const looksLikeEventByName = relLower === "calendar" || relLower === "calendars" || nameLower === "calendar" || nameLower === "calendars";

      // Only trust explicit CalDAV component support or clear folder naming
      const isTask = hasVtodo || looksLikeTaskByName;
      const isEvent = hasVevent || looksLikeEventByName;

      if (isTask && !taskPath) {
        taskPath = relPath;
        discovered.push(`📋 Tasks: "${name || relPath}" → ${relPath}`);
      } else if (isEvent && !eventPath) {
        eventPath = relPath;
        discovered.push(`📅 Events: "${name || relPath}" → ${relPath}`);
      }
    }

    // Fallback defaults for common setups
    if (!eventPath) eventPath = "Calendar";
    if (!taskPath) taskPath = "Tasks";

    row.querySelector(".acct-event-path").value = eventPath;
    row.querySelector(".acct-task-path").value = taskPath;

    if (discovered.length > 0) {
      showAcctStatus(row, `✅ Discovered:\n${discovered.join("\n")}` + (discovered.length < 2 ? `\nℹ️ Fallback applied for missing path(s).` : ""), "success");
    } else {
      showAcctStatus(row, "⚠️ Auto-discover did not return clear collections. Filled defaults: Calendar / Tasks. Please verify.", "error");
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
  document.getElementById("aiProvider").addEventListener("change", (e) => {
    onProviderChange(e.target.value, false);
  });
});
