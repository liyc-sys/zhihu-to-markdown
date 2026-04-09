# zhihu-to-markdown

Export Zhihu column articles to local Markdown with downloaded local images.

This package is structured so it can be:

- used locally from this monorepo
- published as its own npm CLI
- paired with a reusable Codex/skills-style `SKILL.md`

## Requirements

- `agent-browser` installed and working
- a local Chrome profile that can already open the target Zhihu page
- Node.js 20+

## Install

Global install:

```bash
npm install -g zhihu-to-markdown
```

Run once if `agent-browser` is not already set up:

```bash
npm install -g agent-browser
agent-browser install
```

## CLI usage

```bash
zhihu-to-markdown "https://zhuanlan.zhihu.com/p/2020604765843854305"
```

Or without a global install:

```bash
node ./bin/zhihu-to-markdown.js "https://zhuanlan.zhihu.com/p/2020604765843854305"
```

By default it writes to:

```text
notes/zhihu/<article-id>/
```

Files created:

- `index.md`
- `metadata.json`
- `images/*`

## Options

```text
--output-root <dir>
--profile <name>
--chrome-path <path>
--session <name>
--keep-open
```

## Skill bundle

The publishable skill lives in:

```text
skills/zhihu-to-markdown/
```

That skill uses the bundled script at:

```text
skills/zhihu-to-markdown/scripts/export-zhihu-article.mjs
```

## Notes

- The exporter intentionally uses a real local Chrome profile because plain auth-state export was still blocked by Zhihu in testing.
- This tool calls the external `agent-browser` CLI; it does not bundle a browser driver itself.
- The CLI is intended to be used either directly or through the bundled `skills/zhihu-to-markdown/` skill.
