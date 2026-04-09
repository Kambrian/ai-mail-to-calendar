// confirm.js — Confirm popup logic with AI chat

const params = new URLSearchParams(window.location.search);
let eventData, calendars, aiSettings;

try {
  eventData = JSON.parse(params.get("data"));
  calendars = JSON.parse(params.get("calendars"));
  aiSettings = JSON.parse(params.get("aiSettings") || "null");
} catch (e) {
  document.body.innerHTML = "<p>Error: invalid data passed to confirm dialog.</p>";
  throw e;
}

let selectedType = eventData.type || "event";

// Populate fields
function populateFields(data) {
  document.getElementById("title").value = data.title || "";
  document.getElementById("location").value = data.location || "";
  document.getElementById("description").value = data.description || "";
  if (data.start) document.getElementById("start").value = toLocalDatetimeStr(data.start);
  if (data.end) document.getElementById("end").value = toLocalDatetimeStr(data.end);
}

populateFields(eventData);

// Type toggle
function setType(type) {
  selectedType = type;
  document.querySelectorAll(".type-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  // Always show both start and end, but change labels
  if (type === "task") {
    document.getElementById("startLabel").textContent = "Start";
    document.getElementById("endLabel").textContent = "Due";
  } else {
    document.getElementById("startLabel").textContent = "Start";
    document.getElementById("endLabel").textContent = "End";
  }
  populateCalendars(type);
}

function populateCalendars(type) {
  const calSelect = document.getElementById("calendar");
  calSelect.innerHTML = "";
  const filtered = calendars.filter(c => c.type === "both" || c.type === type);
  const list = filtered.length > 0 ? filtered : calendars;
  list.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = c.name;
    calSelect.appendChild(opt);
  });
}

setType(selectedType);

document.querySelectorAll(".type-btn").forEach(btn => {
  btn.addEventListener("click", () => setType(btn.dataset.type));
});

// ── AI Chat ─────────────────────────────────────────────
const aiChat = document.getElementById("aiChat");
const aiHistory = document.getElementById("aiChatHistory");
const aiInput = document.getElementById("aiInput");
const aiSendBtn = document.getElementById("aiSendBtn");
const aiToggleBtn = document.getElementById("aiToggleBtn");

aiToggleBtn.addEventListener("click", () => {
  const visible = aiChat.classList.toggle("visible");
  aiToggleBtn.textContent = visible ? "🤖 Hide AI Chat" : "🤖 Ask AI to Adjust";
  if (visible) {
    // Show original AI extraction as first message if chat is empty (only system msg)
    if (aiHistory.querySelectorAll(".ai-msg:not(.system)").length === 0) {
      const summary = `Title: ${eventData.title}\nType: ${eventData.type}\nStart: ${eventData.start}\nEnd: ${eventData.end || "(none)"}\nLocation: ${eventData.location || "(none)"}\nDescription: ${eventData.description || "(none)"}`;
      addChatMsg("assistant", `AI extracted:\n${summary}`);
    }
    aiInput.focus();
  }
});

aiSendBtn.addEventListener("click", () => sendAiMessage());
aiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendAiMessage();
  }
});

async function sendAiMessage() {
  const msg = aiInput.value.trim();
  if (!msg) return;
  if (!aiSettings) {
    addChatMsg("system", "AI settings not available. Close and retry.");
    return;
  }

  addChatMsg("user", msg);
  aiInput.value = "";
  aiSendBtn.disabled = true;
  aiSendBtn.textContent = "...";

  // Get current form state
  const currentData = getCurrentFormData();

  const systemPrompt = `You are helping the user adjust a calendar event or task.
Current event/task data:
${JSON.stringify(currentData, null, 2)}

The user wants to make changes. Apply their request and return ONLY valid JSON with the updated data.
Use the same JSON structure:
{
  "title": "string",
  "start": "ISO 8601 datetime with timezone",
  "end": "ISO 8601 datetime with timezone (or null)",
  "location": "string or null",
  "description": "string or null",
  "type": "event" or "task"
}

Current time: ${new Date().toISOString()}
Default timezone: ${aiSettings.aiTimezone || "Asia/Shanghai"}

IMPORTANT: Return ONLY the JSON, no explanation.`;

  try {
    const resp = await fetch(`${aiSettings.aiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiSettings.aiApiKey}`
      },
      body: JSON.stringify({
        model: aiSettings.aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: msg }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      addChatMsg("system", `Error: ${resp.status} ${err.substring(0, 150)}`);
      return;
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Strip think blocks and code fences
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    content = content.replace(/<think>[\s\S]*/gi, "").trim();

    const parsed = extractJSON(content);
    if (parsed) {
      // Apply changes to form
      if (parsed.title) document.getElementById("title").value = parsed.title;
      if (parsed.start) document.getElementById("start").value = toLocalDatetimeStr(parsed.start);
      if (parsed.end) document.getElementById("end").value = toLocalDatetimeStr(parsed.end);
      if (parsed.location !== undefined) document.getElementById("location").value = parsed.location || "";
      if (parsed.description !== undefined) document.getElementById("description").value = parsed.description || "";
      if (parsed.type && parsed.type !== selectedType) setType(parsed.type);

      addChatMsg("assistant", "✅ Updated the fields. Review and click Create when ready.");
    } else {
      addChatMsg("assistant", content.substring(0, 300));
    }
  } catch (e) {
    addChatMsg("system", `Error: ${e.message}`);
  } finally {
    aiSendBtn.disabled = false;
    aiSendBtn.textContent = "Send";
  }
}

function addChatMsg(role, text) {
  const div = document.createElement("div");
  div.className = `ai-msg ${role}`;
  div.textContent = text;
  aiHistory.appendChild(div);
  aiHistory.scrollTop = aiHistory.scrollHeight;
}

function getCurrentFormData() {
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  return {
    type: selectedType,
    title: document.getElementById("title").value.trim(),
    start: start ? new Date(start).toISOString() : null,
    end: end ? new Date(end).toISOString() : null,
    location: document.getElementById("location").value.trim() || null,
    description: document.getElementById("description").value.trim() || null
  };
}

function extractJSON(text) {
  let cleaned = text.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, "").replace(/\n?\s*```[\s\S]*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  try { return JSON.parse(text.trim()); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

// ── Create Button ───────────────────────────────────────
document.getElementById("createBtn").addEventListener("click", async () => {
  const title = document.getElementById("title").value.trim();
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const location = document.getElementById("location").value.trim();
  const description = document.getElementById("description").value.trim();
  const calName = document.getElementById("calendar").value;

  if (!title) { showError("Title is required."); return; }
  if (!start) { showError("Start date/time is required."); return; }

  const data = {
    type: selectedType,
    title,
    start: new Date(start).toISOString(),
    end: end ? new Date(end).toISOString() : null,
    location: location || null,
    description: description || null
  };

  await browser.runtime.sendMessage({
    action: "createEvent",
    calendarName: calName,
    eventData: data
  });

  window.close();
});

document.getElementById("cancelBtn").addEventListener("click", () => window.close());

function toLocalDatetimeStr(isoStr) {
  try {
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}

function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}
