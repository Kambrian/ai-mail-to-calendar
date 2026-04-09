# AI Mail to Calendar — Thunderbird Extension

Create calendar events or tasks from emails using AI-powered parsing. Right-click any email, and AI extracts the title, date/time, location, and description — then writes directly to your CalDAV calendar.

**Author:** Jiaxin Han (jiaxin.han@sjtu.edu.cn)  
**Repository:** https://github.com/Kambrian/ai-mail-to-calendar  
**Built with:** [OpenClaw](https://openclaw.ai)  
**License:** MIT

---

## Features

- 📧 **Right-click any email** → "Create Event/Task from Email"
- ✨ **AI-powered extraction** — automatically parses title, dates, location, description
- 📅 **Event or Task** — toggle between VEVENT and VTODO
- 🤖 **Ask AI to Adjust** — chat with AI in the confirm dialog to refine the extracted data
- 📋 **Unified CalDAV accounts** — configure once, auto-routes events and tasks to the right collection
- 🔍 **Auto-Discover** — automatically finds calendar and task collections on your CalDAV server
- 📝 **Selected text support** — select text in an email body and only send that to AI
- 🔄 **Progress window** — persistent status display during AI parsing and CalDAV writing

## Installation

### From Thunderbird Add-ons Website
1. Open Thunderbird → **Add-ons and Themes** (`Ctrl+Shift+A`)
2. Search for "AI Mail to Calendar"
3. Click **Add to Thunderbird**

### From GitHub Release (.xpi)
1. Download the latest `.xpi` from [Releases](https://github.com/Kambrian/ai-mail-to-calendar/releases)
2. Open Thunderbird → **Add-ons and Themes** (`Ctrl+Shift+A`)
3. Click ⚙️ gear icon → **Install Add-on From File**
4. Select the downloaded `.xpi` file

### For Development (Temporary)
1. Clone this repository
2. Open Thunderbird → `Ctrl+Shift+A` → ⚙️ → **Debug Add-ons**
3. Click **Load Temporary Add-on** → select `manifest.json`

---

## Submission to Thunderbird Add-ons

To submit to [addons.thunderbird.net](https://addons.thunderbird.net/):

1. Go to https://addons.thunderbird.net/developers/
2. Sign in with your Mozilla account
3. Click **Submit a New Add-on**
4. Upload the `.xpi` from [the latest release](https://github.com/Kambrian/ai-mail-to-calendar/releases)
5. Fill in listing details:
   - **Name:** AI Mail to Calendar
   - **Summary:** Create calendar events/tasks from emails using AI
   - **Category:** Mail & News
   - **Description:** Copy from the README Features section
   - **Home Page:** https://github.com/Kambrian/ai-mail-to-calendar
   - **Support Email:** jiaxin.han@sjtu.edu.cn
6. Submit for review

---

## Configuration

After installing, go to **Add-ons → AI Mail to Calendar → Preferences** (or right-click the extension → **Preferences**).

### 🤖 AI Configuration

The plugin uses an **OpenAI-compatible API** to parse emails. Any provider that supports the `/v1/chat/completions` endpoint will work.

| Field | Description | Example |
|-------|-------------|---------|
| **Base URL** | API endpoint (without trailing slash) | `https://api.openai.com/v1` |
| **API Key** | Your API key | `sk-...` |
| **Model ID** | Model to use | `gpt-4o-mini` |
| **Default Timezone** | Timezone for date parsing | `Asia/Shanghai` |

#### Compatible AI Providers

| Provider | Base URL | Notes |
|----------|----------|-------|
| OpenAI | `https://api.openai.com/v1` | Any GPT model |
| Requesty | `https://router.requesty.ai/v1` | Multi-provider router |
| DeepSeek | `https://api.deepseek.com/v1` | Cost-effective |
| Groq | `https://api.groq.com/openai/v1` | Fast inference |
| OpenRouter | `https://openrouter.ai/api/v1` | Multi-model |
| Local (Ollama) | `http://localhost:11434/v1` | Self-hosted |
| Any OpenAI-compatible | `https://your-server.com/v1` | Custom endpoint |

> **Tip:** Click **Test AI Connection** to verify your configuration. The test shows the endpoint, model, response, and latency.

### 📅 CalDAV Account Configuration

Add your CalDAV accounts. Each account represents one CalDAV server with both calendar and task collections.

| Field | Description | Example |
|-------|-------------|---------|
| **Account Name** | Display label | `Work Calendar` |
| **CalDAV Base URL** | Parent URL containing your collections | `https://mail.sjtu.edu.cn/dav/user@sjtu.edu.cn` |
| **Username** | CalDAV auth username | `user@sjtu.edu.cn` |
| **Password** | CalDAV auth password | `••••••••` |
| **Events Collection Path** | Subfolder for events | `Calendar` |
| **Tasks Collection Path** | Subfolder for tasks | `Tasks` |

#### Finding Your CalDAV URL

**From Thunderbird:**
1. Right-click a calendar in the Calendar panel
2. Select **Properties**
3. Copy the **Location** URL
4. The **Base URL** is everything up to the last path segment
   - Full URL: `https://mail.sjtu.edu.cn/dav/user@sjtu.edu.cn/Calendar`
   - Base URL: `https://mail.sjtu.edu.cn/dav/user@sjtu.edu.cn`
   - Events Path: `Calendar`

**Common CalDAV providers:**

| Provider | Base URL Pattern |
|----------|-----------------|
| Nextcloud | `https://cloud.example.com/remote.php/dav/calendars/USERNAME` |
| Radicale | `https://example.com/USERNAME` |
| Baikal | `https://example.com/dav.php/calendars/USERNAME` |
| iCloud | `https://caldav.icloud.com/USERID` |
| SOGo | `https://example.com/SOGo/dav/USERNAME/Calendar` |
| Zimbra / SJTU Mail | `https://mail.sjtu.edu.cn/dav/USERNAME` |

#### Auto-Discover

Click **🔍 Auto-Discover** after entering the Base URL and credentials. The plugin will query the server (using CalDAV `PROPFIND`) and automatically populate the Events and Tasks collection paths.

#### Test Connection

Click **🔗 Test Connection** to verify each account. The test checks:
- ✅ Authentication (username/password)
- ✅ Events collection accessibility
- ✅ Tasks collection accessibility
- ✅ Supported component types (VEVENT, VTODO)

---

## Usage

### Creating an Event/Task from the Message List
1. Select an email in your inbox
2. Right-click → **Create Event/Task from Email**
3. Wait for AI to parse (progress window shows status)
4. Review and edit in the confirm dialog
5. Toggle **📅 Event** or **✅ Task**
6. Select target calendar
7. Click **Create**

### Creating from Inside an Email
1. Open an email to read it
2. **Optionally** select specific text in the email body
3. Right-click → **Create Event/Task from Email**
4. If text was selected, only that text is sent to AI
5. Same confirm flow as above

### Using "Ask AI to Adjust"
If AI didn't parse correctly:
1. Click **🤖 Ask AI to Adjust** in the confirm dialog
2. The chat panel opens showing the original AI extraction
3. Type your correction, e.g.:
   - "Start should be now, deadline is April 20"
   - "Change title to Team Meeting"
   - "This is an event, not a task"
   - "Add location: Room 301"
4. AI updates the form fields automatically
5. Review and click **Create**

---

## How It Works

1. **Email Parsing** — The plugin reads the email subject, sender, date, and body (or selected text)
2. **AI Extraction** — Sends the email content to your configured AI with a structured prompt
3. **JSON Response** — AI returns structured data: title, start, end, location, description, type
4. **User Confirmation** — A dialog shows the extracted data for review and editing
5. **CalDAV Write** — Creates a VEVENT or VTODO via CalDAV PUT (with POST fallback)

### AI Behavior

- **Deadlines** → Creates a **task** with start=now, due=deadline
- **Meetings/Appointments** → Creates an **event** with start and end times
- **Date without time** → Defaults to 08:00–09:00
- **No date found** → Uses the email's sent date
- Supports `<think>` blocks (Minimax, DeepSeek-R1, etc.) — automatically stripped
- Supports markdown code fences in response — automatically stripped

---

## Compatibility

- **Thunderbird:** 128+ (Manifest V2 WebExtension)
- **Tested on:** Thunderbird 140.9.0esr (Ubuntu)
- **CalDAV servers:** Any standard CalDAV server (Nextcloud, Radicale, Baikal, iCloud, SOGo, Zimbra, etc.)

---

## Building from Source

```bash
# Clone
git clone https://github.com/Kambrian/ai-mail-to-calendar.git
cd ai-mail-to-calendar

# Package as .xpi
zip -r email-to-event.xpi . -x '*.git*' 'README.md' 'LICENSE' '.github/*'

# Or use Python (if zip is not available)
python3 -c "
import zipfile, os
with zipfile.ZipFile('email-to-event.xpi', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f in ('README.md', 'LICENSE'): continue
            zf.write(os.path.join(root, f), os.path.join(root, f)[2:])
"
```

---

## Project Structure

```
ai-mail-to-calendar/
├── manifest.json              # Extension manifest (MV2, Thunderbird 128+)
├── README.md                  # This file
├── LICENSE                    # MIT License
├── icons/
│   ├── icon48.png             # Toolbar icon (48x48)
│   └── icon96.png             # High-DPI icon (96x96)
├── background/
│   └── background.js          # Context menus, AI calls, CalDAV writer, progress management
├── options/
│   ├── options.html           # Settings UI
│   └── options.js             # Settings logic (AI config, CalDAV accounts, test/discover)
├── confirm/
│   ├── confirm.html           # Event/task confirm & edit dialog
│   └── confirm.js             # Confirm logic with AI chat
└── progress/
    ├── progress.html          # Progress/status window
    └── progress.js            # Progress updates listener
```

---

## Contributing

Issues and PRs welcome at [GitHub](https://github.com/Kambrian/ai-mail-to-calendar).

---

## License

MIT — see [LICENSE](LICENSE).

---

## Credits

- Built by **Jiaxin Han** (jiaxin.han@sjtu.edu.cn) with [OpenClaw](https://openclaw.ai)
- Uses the Thunderbird WebExtension API and CalDAV protocol
