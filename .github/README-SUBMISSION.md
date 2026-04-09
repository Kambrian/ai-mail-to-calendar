# AI Mail to Calendar — Thunderbird Submission Details

Use this text for the Thunderbird Add-ons listing submission.

---

## Summary
Create calendar events or tasks from emails using AI-powered extraction. Right-click any email to automatically parse dates, times, locations, and descriptions.

## Detailed Description

### Features
- 📧 **One-click creation** — Right-click any email to create an event or task
- 🤖 **AI-powered parsing** — Automatically extracts title, dates, location, and description
- 📅 **Event or Task** — Toggle between calendar events and todo items
- 💬 **Ask AI to adjust** — Chat with AI in the dialog to refine extracted data
- 🔍 **Auto-discover** — Automatically finds your CalDAV calendar and task collections
- 📝 **Text selection** — Select specific text in an email and only parse that
- ⚙️ **Universal CalDAV** — Works with Nextcloud, iCloud, Radicale, Zimbra, SJTU Mail, and any standard CalDAV server

### How to Use

1. **Configure AI** (first time only)
   - Open Extension → Preferences
   - Enter your AI provider details (OpenAI, DeepSeek, Groq, etc.)
   - Click "Test AI Connection"

2. **Configure CalDAV** (first time only)
   - Add your CalDAV account (Nextcloud, iCloud, etc.)
   - Use "Auto-Discover" to find calendar and task collections
   - Click "Test Connection"

3. **Create an event/task**
   - Select an email in your inbox
   - Right-click → "Create Event/Task from Email"
   - Wait for AI to parse (progress window shows status)
   - Review the extracted data
   - Optionally click "Ask AI to Adjust" to refine
   - Choose Event or Task
   - Select your calendar
   - Click Create

4. **Sync**
   - Right-click your calendar → Synchronize (or wait for auto-sync)

### Supported AI Providers
- OpenAI (GPT-4, GPT-4o)
- DeepSeek
- Groq
- OpenRouter
- Requesty
- Local Ollama
- Any OpenAI-compatible endpoint

### Supported CalDAV Servers
- Nextcloud
- iCloud
- Radicale
- Baikal
- SOGo
- Zimbra
- SJTU Mail
- Any standard CalDAV server

### Requirements
- Thunderbird 128+
- An OpenAI-compatible AI API key
- A CalDAV account (with calendar and task collections)

### Full Documentation
See the complete setup guide at: https://github.com/Kambrian/ai-mail-to-calendar

---

## Support
- **Issues & Feature Requests**: https://github.com/Kambrian/ai-mail-to-calendar/issues
- **Email**: jiaxin.han@sjtu.edu.cn
