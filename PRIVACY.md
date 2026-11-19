# Privacy Policy — LumaGuard

**Last Updated:** November 2026

**LumaGuard** is an open-source browser extension built with a strict privacy-first design.

## Data Collection
LumaGuard **does not collect, store, transmit, sell, or share** any personal data, browsing history, page contents, or usage analytics.

## Local Storage
The extension uses Chrome's `chrome.storage.local` API exclusively on your own device to remember your preferences:
- Enabled/disabled state
- White Ceiling, Knee Threshold, and Paper Warmth slider values
- Smart Diagram Dark Mode preference
- List of hostnames where you manually chose to pause the filter

This data never leaves your browser.

## Permissions Justification
- **`storage`**: Saves your filter configuration and paused site list locally.
- **`activeTab`**: Reads the hostname of the currently active tab *only* when you open the popup so the per-site Pause/Resume button can display the current domain.
- **Content Script (`<all_urls>`)**: Injects the local SVG `<feComponentTransfer>` highlight-clamping filter into web pages so blinding white images are normalized automatically. No page text, cookies, or images are sent to any external server.

## Network Activity
LumaGuard makes **zero outbound network requests** and contains **no remote code**.

## Contact
If you have questions or security concerns, please open an issue at:  
https://github.com/TheBhavyaGohil/LumaGuard/issues
