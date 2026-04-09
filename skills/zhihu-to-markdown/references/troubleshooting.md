# Troubleshooting

## `agent-browser: command not found`

Install the CLI and browser runtime first:

```bash
npm install -g agent-browser
agent-browser install
```

## Zhihu returns an error page or `40362`

- Use a real local Chrome profile instead of a bare exported auth state.
- Confirm the target page opens correctly in your own Chrome session first.
- Try the default profile explicitly:

```bash
node scripts/export-zhihu-article.mjs "<url>" --profile Default
```

## Wrong Chrome binary

Pass the executable path explicitly:

```bash
node scripts/export-zhihu-article.mjs "<url>" --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Stale agent-browser daemon

The exporter already calls `agent-browser close --all` before starting. If the browser still seems stuck, run this once manually:

```bash
agent-browser close --all
```

## Images are missing

- Some Zhihu articles genuinely have no inline article images.
- The exporter only downloads images inside the main article rich-text container.
- Decorative images, avatars, and ads are intentionally ignored.
