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

async function updateProgress(html, opts = {}) {
  try {
    await browser.runtime.sendMessage({
      action: "progressUpdate",
      html,
      showClose: opts.showClose || false,
      autoClose: opts.autoClose || 0
    });
  } catch (e) {
    // Progress window may have been closed
  }
}

async function closeProgress() {
  if (progressWindowId) {
    try { await browser.windows.remove(progressWindowId); } catch {}
    progressWindowId = null;
  }
}

// ── Context Menus ───────────────────────────────────────
browser.menus.create({
  id: "email-to-event-list",
  title: "Create Event/Task from Email",
  contexts: ["message_list"]
});

browser.menus.create({
  id: "email-to-event-content",
  title: "Create Event/Task from Email",
  contexts: ["page", "selection"]
});

browser.menus.onClicked.addListener(async (info, tab) => {
  const validIds = ["email-to-event-list", "email-to-event-content"];
  if (!validIds.includes(info.menuItemId)) return;

  try {
    let msg, selectedText = null;

    if (info.menuItemId === "email-to-event-list") {
      const selectedMessages = info.selectedMessages;
      if (!selectedMessages || selectedMessages.messages.length === 0) {
        notify("No email selected", "Please select an email first.");
        return;
      }
      msg = selectedMessages.messages[0];
    } else {
      if (info.selectionText) {
        selectedText = info.selectionText;
      }
      const msgFromTab = await browser.messageDisplay.getDisplayedMessage(tab.id);
      if (!msgFromTab) {
        notify("No email", "Could not get the current email.");
        return;
      }
      msg = msgFromTab;
    }

    const subject = msg.subject || "(no subject)";

    // Open progress window
    const hint = selectedText ? " (selected text)" : "";
    await openProgress(`<span class="spinner"></span> Reading email: <b>${escapeHtml(subject)}</b>${hint}`);

    const full = await browser.messages.getFull(msg.id);
    const fullBody = extractBody(full);
    const from = msg.author || "";
    const date = msg.date ? new Date(msg.date).toISOString() : "";
    const bodyForAI = selectedText || fullBody;

    // Load settings
    const settings = await browser.storage.local.get({
      aiBaseUrl: "", aiApiKey: "", aiModel: "", aiTimezone: "Asia/Shanghai", calendars: []
    });

    if (!settings.aiBaseUrl || !settings.aiApiKey || !settings.aiModel) {
      await updateProgress(`<span class="error">❌ AI not configured. Go to Add-ons → Email to Calendar Event → Preferences.</span>`, { showClose: true });
      return;
    }
    if (settings.calendars.length === 0) {
      await updateProgress(`<span class="error">❌ No calendars configured. Go to Add-ons → Email to Calendar Event → Preferences.</span>`, { showClose: true });
      return;
    }

    // Call AI
    await updateProgress(
      `<span class="spinner"></span> Contacting AI...\n` +
      `   Model: <b>${escapeHtml(settings.aiModel)}</b>\n` +
      `   Email: <b>${escapeHtml(subject)}</b>\n` +
      `   Waiting for response...`
    );

    let parsed;
    try {
      parsed = await callAI(settings, subject, from, date, bodyForAI, !!selectedText);
    } catch (e) {
      await updateProgress(
        `<span class="error">❌ AI Error</span>\n\n${escapeHtml(e.message)}`,
        { showClose: true }
      );
      return;
    }

    if (!parsed) {
      await updateProgress(`<span class="error">❌ Failed to parse event details from email.</span>`, { showClose: true });
      return;
    }

    await updateProgress(`<span class="success">✅ AI parsed successfully. Opening editor...</span>`, { autoClose: 1500 });

    // Open confirm popup
    const popupUrl = browser.runtime.getURL("confirm/confirm.html");
    const params = new URLSearchParams({
      data: JSON.stringify(parsed),
      calendars: JSON.stringify(settings.calendars.map(c => ({ name: c.name, type: c.type || "both" }))),
      aiSettings: JSON.stringify({ aiBaseUrl: settings.aiBaseUrl, aiApiKey: settings.aiApiKey, aiModel: settings.aiModel, aiTimezone: settings.aiTimezone })
    });

    await browser.windows.create({
      url: `${popupUrl}?${params.toString()}`,
      type: "popup",
      width: 540,
      height: 720
    });

  } catch (e) {
    console.error("[email2event] error:", e);
    await updateProgress(`<span class="error">❌ Error: ${escapeHtml(e.message)}</span>`, { showClose: true });
  }
});

// Listen for messages from popups
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "progressReady") {
    if (progressResolve) {
      progressResolve();
      progressResolve = null;
    }
    return;
  }

  if (message.action === "createEvent") {
    let progressOpened = false;
    try {
      const settings = await browser.storage.local.get({ calendars: [] });
      const cal = settings.calendars.find(c => c.name === message.calendarName);
      if (!cal) {
        notify("Error", `Calendar "${message.calendarName}" not found.`);
        return;
      }

      // Open progress for CalDAV write
      await openProgress(`<span class="spinner"></span> Writing to CalDAV: <b>${escapeHtml(cal.name)}</b>...`);
      progressOpened = true;

      console.log("[email2event] Writing to CalDAV:", cal.name, cal.url, message.eventData);
      await writeToCalDAV(cal, message.eventData);
      console.log("[email2event] CalDAV write succeeded");

      const typeLabel = message.eventData.type === "task" ? "Task" : "Event";
      await updateProgress(
        `<span class="success">✅ ${typeLabel} created: <b>${escapeHtml(message.eventData.title)}</b></span>\n\n` +
        `💡 Right-click your calendar → Synchronize to see it immediately.`,
        { showClose: true, autoClose: 5000 }
      );
    } catch (e) {
      console.error("[email2event] CalDAV write error:", e);
      if (progressOpened) {
        await updateProgress(
          `<span class="error">❌ CalDAV Error</span>\n\n${escapeHtml(e.message)}`,
          { showClose: true }
        );
      } else {
        notify("CalDAV Error", e.message);
      }
    }
  }
});

// ── AI Call ──────────────────────────────────────────────
async function callAI(settings, subject, from, date, body, isSelectedText) {
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
  const userPrompt = `Email subject: ${subject}
From: ${from}
Date sent: ${date}

${textLabel}:
${body.substring(0, 3000)}`;

  const resp = await fetch(`${settings.aiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.aiApiKey}`
    },
    body: JSON.stringify({
      model: settings.aiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.1
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI API error ${resp.status}: ${errText.substring(0, 300)}`);
  }

  const data = await resp.json();
  let content = data.choices?.[0]?.message?.content || "";
  console.log("[email2event] Raw AI response:", content);

  const parsed = extractJSON(content);
  if (!parsed) {
    console.error("[email2event] Failed to parse AI response:", content);
    throw new Error("AI returned invalid JSON. Check console for raw response.");
  }
  return parsed;
}

function extractJSON(text) {
  let stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  stripped = stripped.replace(/<think>[\s\S]*/gi, "").trim();

  let cleaned = stripped.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, "").replace(/\n?\s*```[\s\S]*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  try { return JSON.parse(stripped); } catch {}
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  const match2 = text.match(/\{[\s\S]*\}/);
  if (match2) { try { return JSON.parse(match2[0]); } catch {} }
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
      eventData.description ? `DESCRIPTION:${escapeICalText(eventData.description)}` : "",
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
      eventData.description ? `DESCRIPTION:${escapeICalText(eventData.description)}` : "",
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

  console.log(`[email2event] CalDAV PUT ${url}`);
  let resp = await xhrRequest("PUT", url, headers, ical);
  console.log(`[email2event] PUT response: ${resp.status} ${resp.statusText}`);

  if (resp.status === 405 || resp.status === 404) {
    delete headers["If-None-Match"];
    console.log(`[email2event] Fallback POST to ${calendar.url}`);
    resp = await xhrRequest("POST", calendar.url, headers, ical);
    console.log(`[email2event] POST response: ${resp.status} ${resp.statusText}`);
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

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Notifications (fallback) ────────────────────────────
function notify(title, message) {
  browser.notifications.create({
    type: "basic",
    title: title,
    message: message
  });
}
