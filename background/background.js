// background.js — Context menu + AI parsing + CalDAV write

// ── Progress Window Management ──────────────────────────
let progressWindowId = null;
let progressResolve = null;

async function openProgress(initialMsg) {
  const win = await browser.windows.create({
    url: browser.runtime.getURL("progress/progress.html"),
    type: "popup",
    width: 420,
    height: 180
  });
  progressWindowId = win.id;

  // Wait for the progress window to signal it's ready
  await new Promise((resolve) => {
    progressResolve = resolve;
    // Fallback: resolve after 500ms in case message is missed
    setTimeout(resolve, 500);
  });

  await updateProgress(initialMsg);
  return win.id;
}

async function updateProgress(text, opts = {}) {
  try {
    await browser.runtime.sendMessage({
      action: "progressUpdate",
      text,
      showClose: opts.showClose || false,
      autoClose: opts.autoClose || 0
    });
  } catch (e) {
    // Progress window may have been closed
  }
}

async function closeProgress() {
  if (progressWindowId) {
    try { await browser.windows.remove(progressWindowId); } catch { /* The window may already be closed. */ }
    progressWindowId = null;
  }
}

// ── Context Menus ───────────────────────────────────────
browser.menus.create({
  id: "email-to-event-list",
  title: "Create Event/Task from Email",
  contexts: ["message_list"]
});

browser.menus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "email-to-event-list") return;

  try {
    const selectedMessages = info.selectedMessages;
    if (!selectedMessages || selectedMessages.messages.length === 0) {
      notify("No email selected", "Please select an email first.");
      return;
    }
    const msg = selectedMessages.messages[0];
    const selectedText = null;

    const subject = msg.subject || "(no subject)";

    // Open progress window
    const hint = selectedText ? " (selected text)" : "";
    await openProgress(`⏳ Reading email: ${subject}${hint}`);

    const full = await browser.messages.getFull(msg.id);
    const fullBody = extractBody(full);
    const from = msg.author || "";
    const date = msg.date ? new Date(msg.date).toISOString() : "";
    const bodyForAI = selectedText || fullBody;

    const messageIdRaw = full?.headers?.["message-id"]?.[0] || "";
    const messageId = messageIdRaw ? String(messageIdRaw).trim() : "";
    const messageIdNoBrackets = messageId.replace(/^<|>$/g, "");
    const midUrl = messageIdNoBrackets ? `mid:${messageIdNoBrackets}` : null;

    const sourceEmail = {
      messageId: messageId || null,
      midUrl,
      subject,
      from: from || null,
      sentAt: date || null
    };

    // Load settings
    const settings = await browser.storage.local.get({
      aiProvider: "openai", aiBaseUrl: "", aiApiKey: "", aiModel: "", aiTimezone: "Asia/Shanghai", calendars: [], remoteServicesEnabled: false
    });

    if (!settings.remoteServicesEnabled) {
      await updateProgress("❌ External services are disabled. Open Preferences, review the data-sharing notice, enable external services, and save.", { showClose: true });
      return;
    }

    if (!settings.aiBaseUrl || !settings.aiApiKey || !settings.aiModel) {
      await updateProgress("❌ AI not configured. Go to Add-ons → Email to Calendar Event → Preferences.", { showClose: true });
      return;
    }
    if (settings.calendars.length === 0) {
      await updateProgress("❌ No calendars configured. Go to Add-ons → Email to Calendar Event → Preferences.", { showClose: true });
      return;
    }

    // Call AI
    await updateProgress(
      `⏳ Contacting AI...\n` +
      `   Model: ${settings.aiModel}\n` +
      `   Email: ${subject}\n` +
      `   Waiting for response...`
    );

    let parsed;
    try {
      parsed = await callAI(settings, subject, from, date, bodyForAI, !!selectedText);
    } catch (e) {
      await updateProgress(
        `❌ AI Error\n\n${e.message}`,
        { showClose: true }
      );
      return;
    }

    if (!parsed) {
      await updateProgress("❌ Failed to parse event details from email.", { showClose: true });
      return;
    }

    await updateProgress("✅ AI parsed successfully. Opening editor...", { autoClose: 1500 });

    // Open confirm popup
    const popupUrl = browser.runtime.getURL("confirm/confirm.html");
    const params = new URLSearchParams({
      data: JSON.stringify(parsed),
      sourceEmail: JSON.stringify(sourceEmail),
      calendars: JSON.stringify(settings.calendars.map(c => ({ name: c.name, type: c.type || "both" })))
    });

    await browser.windows.create({
      url: `${popupUrl}?${params.toString()}`,
      type: "popup",
      width: 540,
      height: 720
    });

  } catch (e) {
    await updateProgress(`❌ Error: ${e.message}`, { showClose: true });
  }
});

// Listen for messages from popups. Do not declare this listener async: an async
// listener returns a Promise for every message, which blocks other listeners.
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "progressReady") {
    if (progressResolve) {
      progressResolve();
      progressResolve = null;
    }
    return undefined;
  }

  if (message.action === "createEvent") {
    return handleCreateEvent(message);
  }
  return undefined;
});

async function handleCreateEvent(message) {
  let progressOpened = false;
  try {
    const settings = await browser.storage.local.get({ calendars: [], remoteServicesEnabled: false });
    if (!settings.remoteServicesEnabled) {
      throw new Error("External services are disabled. Open Preferences, review the data-sharing notice, enable external services, and save.");
    }
    const cal = settings.calendars.find(c => c.name === message.calendarName);
    if (!cal) {
      notify("Error", `Calendar "${message.calendarName}" not found.`);
      return;
    }

    if (!await hasHostPermission(cal.url)) {
      throw new Error("Permission for this CalDAV server has not been granted. Open Preferences and save the settings to grant it.");
    }

    await openProgress(`⏳ Writing to CalDAV: ${cal.name}...`);
    progressOpened = true;

    await writeToCalDAV(cal, message.eventData);

    const typeLabel = message.eventData.type === "task" ? "Task" : "Event";
    await updateProgress(
      `✅ ${typeLabel} created: ${message.eventData.title}\n\n💡 Right-click your calendar → Synchronize to see it immediately.`,
      { showClose: true, autoClose: 5000 }
    );
  } catch (e) {
    if (progressOpened) {
      await updateProgress(`❌ CalDAV Error\n\n${e.message}`, { showClose: true });
    } else {
      notify("CalDAV Error", e.message);
    }
  }
}

// ── AI Call (multi-provider) ──────────────────────────
async function callAI(settings, subject, from, date, body, isSelectedText) {
  if (!settings.remoteServicesEnabled) {
    throw new Error("External services are disabled. Open Preferences to enable them after reviewing the data-sharing notice.");
  }
  const provider = settings.aiProvider || "openai";
  const baseUrl = (settings.aiBaseUrl || "").replace(/\/+$/, "");
  const model = settings.aiModel;
  const apiKey = settings.aiApiKey;

  if (!await hasHostPermission(baseUrl)) {
    throw new Error("Permission for this AI server has not been granted. Open Preferences and save the settings to grant it.");
  }

  const systemPrompt = `You are an assistant that extracts calendar event or task information from emails.
Given an email, extract structured data and return ONLY valid JSON (no markdown, no explanation).

Rules:
- If the email mentions a deadline or due date, create a "task" with:
  - "start" = current time (now: ${new Date().toISOString()})
  - "end" = the deadline date/time
- If the email mentions a meeting, appointment, or scheduled event, create an "event" with start and end times.
- If only a date is mentioned (no time), use 08:00 as start time and 09:00 as end time.
- If no date is found at all, use the email's sent date.
- Times should be in ISO 8601 format with timezone offset.
- Default timezone: ${settings.aiTimezone}
- "type" should be "event" if it's a meeting/appointment/event, or "task" if it's a to-do/action item/deadline.
- For tasks: "start" is when to begin working on it (default: now), "end" is the due date/deadline.
- Keep the description concise (max 500 chars).

Return this exact JSON structure:
{
  "title": "string",
  "start": "ISO 8601 datetime",
  "end": "ISO 8601 datetime (deadline/due for tasks, end time for events)",
  "location": "string or null",
  "description": "brief summary string",
  "type": "event" or "task"
}`;

  const textLabel = isSelectedText ? "Selected text from email" : "Email body";
  const userPrompt = `Email subject: ${subject}\nFrom: ${from}\nDate sent: ${date}\n\n${textLabel}:\n${body.substring(0, 3000)}`;

  let endpoint, reqHeaders, reqBody;

  if (provider === "anthropic") {
    endpoint = `${baseUrl}/v1/messages`;
    reqHeaders = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    reqBody = JSON.stringify({ model, max_tokens: 2000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] });
  } else if (provider === "google") {
    endpoint = `${baseUrl}/v1beta/models/${model}:generateContent`;
    reqHeaders = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
    reqBody = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 2000, temperature: 0.1 }
    });
  } else {
    endpoint = `${baseUrl}/chat/completions`;
    reqHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
    reqBody = JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: 2000, temperature: 0.1 });
  }

  const resp = await fetch(endpoint, { method: "POST", headers: reqHeaders, body: reqBody });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI API error ${resp.status}: ${errText.substring(0, 300)}`);
  }

  const data = await resp.json();
  let content = "";
  if (provider === "anthropic") content = data.content?.[0]?.text || "";
  else if (provider === "google") content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  else content = data.choices?.[0]?.message?.content || "";

  const parsed = extractJSON(content);
  if (!parsed) {
    throw new Error("AI returned invalid JSON.");
  }
  return parsed;
}

function extractJSON(text) {
  let stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  stripped = stripped.replace(/<think>[\s\S]*/gi, "").trim();

  let cleaned = stripped.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, "").replace(/\n?\s*```[\s\S]*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* Try the next JSON parsing strategy. */ }
  try { return JSON.parse(stripped); } catch { /* Try the next JSON parsing strategy. */ }
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* Try the next JSON parsing strategy. */ } }
  const match2 = text.match(/\{[\s\S]*\}/);
  if (match2) { try { return JSON.parse(match2[0]); } catch { /* Try the next JSON parsing strategy. */ } }
  return null;
}

// ── Body Extraction ─────────────────────────────────────
function extractBody(fullMessage) {
  let text = "";
  function walk(part) {
    if (part.contentType === "text/plain" && part.body) {
      text += part.body + "\n";
    } else if (part.contentType === "text/html" && part.body && !text) {
      text += part.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() + "\n";
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(fullMessage);
  return text.trim() || "(empty body)";
}

// ── CalDAV Writer (XMLHttpRequest to bypass CORS) ───────
function xhrRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.onload = () => resolve({ status: xhr.status, statusText: xhr.statusText, text: xhr.responseText });
    xhr.onerror = () => reject(new Error(`Network error: ${xhr.statusText || 'request failed'}`));
    xhr.send(body);
  });
}

async function writeToCalDAV(calendar, eventData) {
  const uid = generateUID();
  const now = formatICalDate(new Date());
  let ical;

  const source = eventData.sourceEmail || null;
  const mergedDescription = eventData.description || "";

  if (eventData.type === "task") {
    const due = eventData.end ? formatICalDate(new Date(eventData.end)) : (eventData.start ? formatICalDate(new Date(eventData.start)) : "");
    const dtstart = eventData.start ? formatICalDate(new Date(eventData.start)) : "";
    ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Email2Event//EN",
      "BEGIN:VTODO",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `SUMMARY:${escapeICalText(eventData.title)}`,
      dtstart ? `DTSTART:${dtstart}` : "",
      due ? `DUE:${due}` : "",
      eventData.location ? `LOCATION:${escapeICalText(eventData.location)}` : "",
      mergedDescription ? `DESCRIPTION:${escapeICalText(mergedDescription)}` : "",
      source?.midUrl ? `URL:${escapeICalText(source.midUrl)}` : "",
      "STATUS:NEEDS-ACTION",
      "END:VTODO",
      "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");
  } else {
    const dtstart = formatICalDate(new Date(eventData.start));
    const dtend = eventData.end ? formatICalDate(new Date(eventData.end)) : formatICalDate(new Date(new Date(eventData.start).getTime() + 3600000));
    ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Email2Event//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${escapeICalText(eventData.title)}`,
      eventData.location ? `LOCATION:${escapeICalText(eventData.location)}` : "",
      mergedDescription ? `DESCRIPTION:${escapeICalText(mergedDescription)}` : "",
      source?.midUrl ? `URL:${escapeICalText(source.midUrl)}` : "",
      "END:VEVENT",
      "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");
  }

  const url = calendar.url.replace(/\/$/, "") + `/${uid}.ics`;
  const authHeader = "Basic " + btoa(`${calendar.username}:${calendar.password}`);
  const headers = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Authorization": authHeader,
    "If-None-Match": "*"
  };

  let resp = await xhrRequest("PUT", url, headers, ical);

  if (resp.status === 405 || resp.status === 404) {
    delete headers["If-None-Match"];
    resp = await xhrRequest("POST", calendar.url, headers, ical);
  }

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`CalDAV ${resp.status}: ${resp.text.substring(0, 300)}`);
  }
}

function generateUID() {
  return "email2event-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9) + "@openclaw";
}

function formatICalDate(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICalText(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

async function hasHostPermission(url) {
  try {
    const origin = new URL(url).origin;
    return await browser.permissions.contains({ origins: [`${origin}/*`] });
  } catch {
    return false;
  }
}

// ── Notifications (fallback) ────────────────────────────
function notify(title, message) {
  browser.notifications.create({
    type: "basic",
    title: title,
    message: message
  });
}
