# AI Mail to Calendar

Create calendar events or tasks from emails using AI. Right-click any email to automatically extract dates, times, locations, and descriptions.

## Quick Start

1. **Configure AI** (Preferences)
   - Enter your AI API endpoint (OpenAI, DeepSeek, Groq, etc.)
   - Click "Test AI Connection"

2. **Configure CalDAV** (Preferences)
   - Add your calendar server (Nextcloud, iCloud, Zimbra, etc.)
   - Use "Auto-Discover" to find collections
   - Click "Test Connection"

3. **Create Events**
   - Right-click an email → "Create Event/Task from Email"
   - Review AI extraction
   - Click "Ask AI to Adjust" if needed
   - Select Event or Task
   - Click Create

4. **Sync**
   - Right-click calendar → Synchronize

## Features

- AI-powered extraction from any email
- Toggle between events and tasks
- Refine extracted data with AI chat
- Support for selected text only
- Auto-discover CalDAV collections
- Works with any OpenAI-compatible API
- Works with any standard CalDAV server

## Supported Providers

**AI:** OpenAI, DeepSeek, Groq, OpenRouter, Requesty, Ollama, any OpenAI-compatible endpoint

**CalDAV:** Nextcloud, iCloud, Radicale, Baikal, SOGo, Zimbra, SJTU Mail, any standard CalDAV server

## Requirements

- Thunderbird 128+
- An AI API key
- A CalDAV account with calendar & task collections

## Support & Docs

Full documentation: https://github.com/Kambrian/ai-mail-to-calendar

Issues: https://github.com/Kambrian/ai-mail-to-calendar/issues

Author: Jiaxin Han | License: MIT
