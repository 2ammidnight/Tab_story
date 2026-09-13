# Privacy Policy

**Last Updated: 13 sep , 2026**

## Overview

Tab Story is a Chrome extension designed to organize tabs and tab groups. This Privacy Policy describes what data the extension processes, where it is stored, and when it may be shared.

## Data We Store (Local Only)

Tab Story stores the following information **locally on your device** using Chrome’s storage APIs:

- **Tab and group data:** tab titles, URLs, group organization, timestamps, and any notes you add
- **Intent data:** intent names/descriptions you create and relationships between intents and tabs
- **Preferences:** extension settings and UI configuration
- **Backups:** local backups of tab groups and related timeline/organization data

This data is stored only in your local browser profile and is **not** transmitted to Tab Story servers.

## AI Features

### User-enabled Gemini summarization

AI summarization is off until you connect your own Gemini API key and request a summary. Tab Story captures the rendered DOM of the active tab and uses Mozilla Readability locally to remove navigation, advertising, sidebars, forms, and other non-article content. It sends the resulting cleaned article text—and an optional focus instruction you type—directly from the extension to Google’s Gemini API. It does not send the page URL or selected image URL to Gemini. Use of Gemini is subject to Google’s Privacy Policy.

The Gemini API key is stored in Chrome session storage, restricted to trusted extension contexts. It is sent only to Google as API authentication and is cleared when the browser session ends. Tab Story has no AI proxy or application backend.

## What We Do Not Collect

Tab Story does not:

- collect personal information
- track browsing activity
- use analytics or telemetry
- sell your local data or send it to Tab Story servers
- use cookies for tracking or advertising

## Permissions

Tab Story requests the following permissions solely to provide functionality:

- `tabs` (read and organize open tabs)
- `storage` (store data locally)
- `sidePanel` (display the UI)
- `activeTab` and `scripting` (extract the active page only after you invoke the extension)
- `alarms` and `notifications` (run and display reminders)
- `identity` (connect enabled Google account features)

Required host access is limited to Google APIs used by enabled Google account features and Gemini. When you click Summarize, Chrome may ask you to grant optional access to that specific site. This site permission persists until you revoke it through Chrome extension settings; Tab Story does not automatically grant itself access to every website.

## Data Security and Control

Saved tabs, groups, notes, preferences, and reminders remain on your device. Only the cleaned page text you explicitly ask Gemini to summarize leaves the device. You can delete local data through the extension’s storage controls, Chrome extension settings, or by uninstalling the extension.

## Children’s Privacy

Tab Story is not directed to children under 13 and does not knowingly collect data from children.

## Third-Party Services

Tab Story does not use third-party services except:

- **Google Gemini API** (optional, when you connect a key and request a summary)
- **Chrome Web Store** (distribution and updates)

## Changes to This Policy

Updates will be posted with a revised “Last Updated” date and may be reflected in release notes. Continued use after updates indicates acceptance of the revised policy.

## Contact

Questions or concerns:

- GitHub Issues: https://github.com/Rawdyrathaur/Tab_story/issues
- Author: Manish Rathaur (@Rawdyrathaur)
