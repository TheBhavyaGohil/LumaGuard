# Contributing to LumaGuard

Contributions, bug reports, and algorithmic improvements are welcome!

## Local Development
1. Fork and clone the repository.
2. Make edits inside the `extension/` directory.
3. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked** pointing to `extension/`.
4. Click the reload icon on the LumaGuard card after edits and refresh your test tab.

## Guidelines
- Keep the codebase **100% deterministic**, lightweight, and dependency-free (vanilla JS/CSS/SVG).
- Do not introduce external network calls, analytics, or additional browser permissions without a strong technical justification.
- Test changes across both dark-mode blogs with white diagrams and photo-heavy websites to ensure no tonal distortion.
