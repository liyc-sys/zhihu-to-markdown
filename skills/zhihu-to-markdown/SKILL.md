---
name: zhihu-to-markdown
description: Export Zhihu column articles to local Markdown with downloaded local images. Use this whenever the user asks to save, archive, mirror, clip, or整理 a Zhihu article into local markdown files for notes, knowledge-base ingestion, or later summarization, especially when they want the images preserved instead of leaving remote image URLs.
---

# Zhihu To Markdown

Use the bundled exporter script in this skill:

```bash
node scripts/export-zhihu-article.mjs "<zhihu-url>"
```

If the standalone CLI package is installed, these are equivalent:

```bash
zhihu-to-markdown "<zhihu-url>"
npx zhihu-to-markdown "<zhihu-url>"
```

## Workflow

1. Use the exporter instead of manually copying from the page.
2. Let it launch `agent-browser` with a local Chrome profile in headed mode.
3. Save the article as local Markdown plus downloaded local images.
4. Verify the output:
   - title, author, source block
   -正文 headings and code blocks
   - image links rewritten to `./images/...`

## Output

By default the exporter writes to:

```text
notes/zhihu/<article-id>/
```

Files:

- `index.md`
- `metadata.json`
- `images/*`

## Notes

- This flow depends on the local Chrome profile already being able to open the target Zhihu page.
- The exporter intentionally uses a real Chrome profile because plain auth-state export was still blocked by Zhihu.
- Open `references/troubleshooting.md` when the page is blocked, `agent-browser` is missing, or Chrome profile reuse fails.

## Examples

```bash
node scripts/export-zhihu-article.mjs "https://zhuanlan.zhihu.com/p/2020604765843854305"
node scripts/export-zhihu-article.mjs "https://zhuanlan.zhihu.com/p/2020604765843854305" --output-root notes/zhihu --profile Default
```
