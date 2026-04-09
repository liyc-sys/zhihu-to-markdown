#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const DEFAULT_OUTPUT_ROOT = 'notes/zhihu';
const DEFAULT_PROFILE = process.env.ZHIHU_EXPORT_PROFILE || 'Default';
const DEFAULT_CHROME_PATH =
  process.env.ZHIHU_EXPORT_CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_SESSION = process.env.ZHIHU_EXPORT_SESSION || 'zhihu-export';
const DEFAULT_BROWSER_ARGS =
  process.env.ZHIHU_EXPORT_BROWSER_ARGS || '--disable-blink-features=AutomationControlled';

const EXTRACT_ARTICLE_SCRIPT = String.raw`(() => {
  const article = document.querySelector('article');
  const container = article?.querySelector('.Post-RichTextContainer');
  const content =
    container?.querySelector('#content .RichText') ||
    container?.querySelector('.RichText.ztext.Post-RichText') ||
    container?.querySelector('.RichText');
  if (!article || !container || !content) {
    throw new Error('Could not find Zhihu article content.');
  }

  const clean = (value) =>
    (value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

  const pickImageSrc = (img) =>
    img.currentSrc ||
    img.src ||
    img.getAttribute('data-original') ||
    img.getAttribute('data-actualsrc') ||
    img.getAttribute('data-src') ||
    '';

  const images = Array.from(content.querySelectorAll('img')).map((img, index) => ({
    index,
    alt: clean(img.getAttribute('alt') || ''),
    src: pickImageSrc(img),
  }));

  const title =
    clean(article.querySelector('h1')?.textContent) ||
    clean(document.title).replace(/\s*-\s*知乎$/, '');
  const author =
    clean(article.querySelector('.AuthorInfo-name')?.textContent) ||
    clean(article.querySelector('header a[href*="/people/"]')?.textContent);
  const authorBio =
    clean(article.querySelector('.AuthorInfo-detail')?.textContent) ||
    clean(article.querySelector('.AuthorInfo-badgeText')?.textContent) ||
    clean(article.querySelector('header')?.textContent || '').replace(title, '').replace(author, '');
  const editedAt =
    clean(article.querySelector('.ContentItem-time')?.textContent) ||
    clean(document.querySelector('meta[itemprop="dateModified"]')?.getAttribute('content')) ||
    clean(document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content'));

  return {
    title,
    author,
    authorBio,
    editedAt,
    sourceUrl: location.href,
    contentHtml: content.innerHTML,
    images,
  };
})()`;

function usage() {
  const command = path.basename(process.argv[1] || 'zhihu-to-markdown');
  console.error(`Usage:
  ${command} <zhihu-url> [--output-root <dir>] [--profile <name>] [--chrome-path <path>] [--session <name>] [--keep-open]

Examples:
  ${command} "https://zhuanlan.zhihu.com/p/2020604765843854305"
  ${command} "https://zhuanlan.zhihu.com/p/2020604765843854305" --output-root notes/zhihu --profile Default`);
}

function parseArgs(argv) {
  const options = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    profile: DEFAULT_PROFILE,
    chromePath: DEFAULT_CHROME_PATH,
    session: DEFAULT_SESSION,
    keepOpen: false,
  };
  let url = '';

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!url && !token.startsWith('--')) {
      url = token;
      continue;
    }

    switch (token) {
      case '--output-root':
        options.outputRoot = argv[index + 1];
        index += 1;
        break;
      case '--profile':
        options.profile = argv[index + 1];
        index += 1;
        break;
      case '--chrome-path':
        options.chromePath = argv[index + 1];
        index += 1;
        break;
      case '--session':
        options.session = argv[index + 1];
        index += 1;
        break;
      case '--keep-open':
        options.keepOpen = true;
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!url) {
    usage();
    process.exit(1);
  }

  if (!options.outputRoot || !options.profile || !options.chromePath || !options.session) {
    throw new Error('Missing required option value.');
  }

  return { url, options };
}

function buildBrowserPrefix(options) {
  return [
    '--session',
    options.session,
    '--profile',
    options.profile,
    '--headed',
    '--executable-path',
    options.chromePath,
    '--args',
    DEFAULT_BROWSER_ARGS,
  ];
}

function runAgentBrowser(args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('agent-browser', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      const result = {
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      if (result.code === 0 || allowFailure) {
        resolve(result);
        return;
      }

      const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
      reject(new Error(detail || `agent-browser exited with code ${result.code}`));
    });
  });
}

function deriveArticleId(url) {
  const match = url.match(/\/p\/(\d+)/);
  if (match) {
    return match[1];
  }

  const parsed = new URL(url);
  const tail = parsed.pathname.split('/').filter(Boolean).at(-1) || 'article';
  return tail.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function escapeYaml(value) {
  return JSON.stringify(value || '');
}

function normalizeWhitespace(value) {
  return (value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collapseBlankLines(value) {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function chooseExtension(url, contentType) {
  const parsed = new URL(url);
  const rawExtension = path.extname(parsed.pathname).toLowerCase();
  if (rawExtension) {
    return rawExtension;
  }

  if (!contentType) {
    return '.jpg';
  }

  if (contentType.includes('png')) {
    return '.png';
  }
  if (contentType.includes('webp')) {
    return '.webp';
  }
  if (contentType.includes('gif')) {
    return '.gif';
  }
  if (contentType.includes('svg')) {
    return '.svg';
  }
  if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    return '.jpg';
  }

  return '.bin';
}

async function downloadImage(image, outputDir, sourceUrl, index) {
  const response = await fetch(image.src, {
    headers: {
      referer: sourceUrl,
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Image download failed with ${response.status} for ${image.src}`);
  }

  const extension = chooseExtension(image.src, response.headers.get('content-type'));
  const filename = `${String(index + 1).padStart(2, '0')}${extension}`;
  const absolutePath = path.join(outputDir, filename);
  const bytes = Buffer.from(await response.arrayBuffer());

  await writeFile(absolutePath, bytes);

  return {
    ...image,
    filename,
    relativePath: `./images/${filename}`,
  };
}

function cleanupContentDom(root) {
  root.querySelectorAll('script, style, noscript, button, iframe').forEach((node) => node.remove());

  root.querySelectorAll('img').forEach((img) => {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('style');
    img.removeAttribute('class');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.removeAttribute('loading');
  });

  root.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) {
      return;
    }

    if (href.startsWith('//')) {
      link.setAttribute('href', `https:${href}`);
      return;
    }

    if (href.startsWith('/')) {
      link.setAttribute('href', new URL(href, 'https://www.zhihu.com').toString());
    }
  });
}

function buildTurndown() {
  const turndown = new TurndownService({
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    headingStyle: 'atx',
  });

  turndown.use(gfm);

  turndown.addRule('figureCaption', {
    filter: 'figcaption',
    replacement(content) {
      const cleaned = content.trim();
      return cleaned ? `\n\n*${cleaned}*\n\n` : '\n\n';
    },
  });

  turndown.addRule('zhihuLineBreak', {
    filter: 'br',
    replacement() {
      return '  \n';
    },
  });

  return turndown;
}

function buildFrontmatter(articleId, extracted, sourceUrl) {
  const capturedAt = new Date().toISOString();
  return `---
title: ${escapeYaml(extracted.title)}
source_url: ${escapeYaml(sourceUrl)}
article_id: ${escapeYaml(articleId)}
author: ${escapeYaml(extracted.author)}
author_bio: ${escapeYaml(extracted.authorBio)}
edited_at_text: ${escapeYaml(extracted.editedAt)}
captured_at: ${escapeYaml(capturedAt)}
---
`;
}

function buildHeader(extracted) {
  const lines = [`# ${extracted.title}`, ''];

  lines.push(`> 来源: [${extracted.sourceUrl}](${extracted.sourceUrl})`);

  if (extracted.author) {
    lines.push(`> 作者: ${extracted.author}`);
  }

  if (extracted.authorBio) {
    lines.push(`> 简介: ${extracted.authorBio}`);
  }

  if (extracted.editedAt) {
    lines.push(`> 时间: ${extracted.editedAt}`);
  }

  lines.push('');
  return lines.join('\n');
}

export async function exportArticle(url, options) {
  const prefix = buildBrowserPrefix(options);

  await runAgentBrowser(['close', '--all'], { allowFailure: true });
  await runAgentBrowser([...prefix, 'open', url]);
  await runAgentBrowser([...prefix, 'wait', '.Post-RichTextContainer']);
  await runAgentBrowser([...prefix, 'wait', '1500']);

  const extraction = await runAgentBrowser([...prefix, 'eval', EXTRACT_ARTICLE_SCRIPT]);
  const extracted = JSON.parse(extraction.stdout);
  const articleId = deriveArticleId(extracted.sourceUrl || url);

  const articleDir = path.resolve(options.outputRoot, articleId);
  const imageDir = path.join(articleDir, 'images');
  await mkdir(imageDir, { recursive: true });

  const dom = new JSDOM(`<div id="zhihu-export-root">${extracted.contentHtml}</div>`);
  const root = dom.window.document.querySelector('#zhihu-export-root');
  cleanupContentDom(root);

  const imageNodes = Array.from(root.querySelectorAll('img'));
  const downloadedImages = [];

  for (let index = 0; index < imageNodes.length; index += 1) {
    const imageNode = imageNodes[index];
    const image = extracted.images[index];

    if (!image || !image.src) {
      imageNode.remove();
      continue;
    }

    const downloaded = await downloadImage(image, imageDir, extracted.sourceUrl, index);
    downloadedImages.push(downloaded);
    imageNode.setAttribute('src', downloaded.relativePath);
    imageNode.setAttribute('alt', image.alt || imageNode.getAttribute('alt') || '');
  }

  const turndown = buildTurndown();
  const markdownBody = collapseBlankLines(
    normalizeWhitespace(turndown.turndown(root.innerHTML || '').replace(/\u00a0/g, ' ')),
  );

  const frontmatter = buildFrontmatter(articleId, extracted, extracted.sourceUrl);
  const header = buildHeader(extracted);
  const finalMarkdown = `${frontmatter}\n${header}\n${markdownBody}\n`;

  const markdownPath = path.join(articleDir, 'index.md');
  const metadataPath = path.join(articleDir, 'metadata.json');

  await writeFile(markdownPath, finalMarkdown, 'utf8');
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        ...extracted,
        articleId,
        outputMarkdown: markdownPath,
        downloadedImages,
      },
      null,
      2,
    ),
    'utf8',
  );

  if (!options.keepOpen) {
    await runAgentBrowser(['close', '--all'], { allowFailure: true });
  }

  return {
    articleId,
    articleDir,
    markdownPath,
    imageCount: downloadedImages.length,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { url, options } = parseArgs(argv);
  const result = await exportArticle(url, options);

  console.log(`Saved Zhihu article to ${result.markdownPath}`);
  console.log(`Downloaded ${result.imageCount} images into ${path.join(result.articleDir, 'images')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
