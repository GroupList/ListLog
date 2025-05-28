const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// Load configuration
let config;
try {
  const configPath = './listlog.config.json';
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✓ Loaded configuration from listlog.config.json');
  } else {
    // Fallback to default config for GitLab
    config = getDefaultConfig();
    console.log('⚠ Using default configuration (create listlog.config.json to customize)');
  }
} catch (error) {
  console.error('❌ Error loading configuration:', error.message);
  process.exit(1);
}

// Default configuration fallback
function getDefaultConfig() {
  return {
    site: {
      name: 'ListLog',
      description: 'A simple, clean blog for sharing your thoughts',
      url: 'https://listlog-0d0e4e.gitlab.io',
      author: 'ListLog Author',
      language: 'en'
    },
    paths: {
      posts: './posts',
      templates: './templates',
      assets: './assets',
      output: './dist'
    },
    build: {
      postsPerPage: 10,
      excerptLength: 200,
      dateFormat: { year: 'numeric', month: 'long', day: 'numeric' },
      generateSitemap: true,
      generateRobotsTxt: false
    },
    rss: {
      enabled: true,
      filename: 'feed.xml',
      maxItems: 20
    },
    social: {
      gitlab: 'https://gitlab.com/grouplist/ListLog'
    },
    features: {
      tags: true,
      archives: false
    }
  };
}

// Ensure output directory exists
if (!fs.existsSync(config.paths.output)) {
  fs.mkdirSync(config.paths.output, { recursive: true });
}

// Read template files
function readTemplate(filename) {
  const templatePath = path.join(config.paths.templates, filename);
  if (!fs.existsSync(templatePath)) {
    console.error(`Template ${filename} not found!`);
    process.exit(1);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

const postTemplate = readTemplate('post.html');
const indexTemplate = readTemplate('index.html');

// Parse markdown front matter
function parseFrontMatter(content) {
  const match = content.match(/^---\n(.*?)\n---\n(.*)/s);
  if (!match) return { metadata: {}, content };
  
  const frontMatter = match[1];
  const body = match[2];
  
  const metadata = {};
  frontMatter.split('\n').forEach(line => {
    const [key, ...values] = line.split(':');
    if (key && values.length) {
      metadata[key.trim()] = values.join(':').trim().replace(/['"]/g, '');
    }
  });
  
  return { metadata, content: body };
}

// Generate slug from filename
function generateSlug(filename) {
  return filename
    .replace('.md', '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '') // Remove date prefix if present
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Format date
function formatDate(dateString) {
  if (!dateString) return new Date().toLocaleDateString();
  const date = new Date(dateString);
  return date.toLocaleDateString(config.site.language || 'en-US', config.build.dateFormat);
}

// Generate social links
function generateSocialLinks() {
  if (!config.social) return '';
  
  const links = [];
  Object.entries(config.social).forEach(([platform, url]) => {
    if (url) {
      const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
      links.push(`<a href="${url}" target="_blank" rel="noopener">${platformName}</a>`);
    }
  });
  
  return links.length > 0 ? `<div class="social-links">${links.join(' • ')}</div>` : '';
}

// Generate post HTML
function generatePost(filename) {
  const filePath = path.join(config.paths.posts, filename);
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const { metadata, content } = parseFrontMatter(rawContent);
  
  const htmlContent = marked(content);
  const slug = generateSlug(filename);
  
  const post = {
    title: metadata.title || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    date: metadata.date || new Date().toISOString().split('T')[0],
    author: metadata.author || config.site.author,
    tags: metadata.tags ? metadata.tags.split(',').map(tag => tag.trim()) : [],
    slug,
    content: htmlContent,
    excerpt: metadata.excerpt || htmlContent.replace(/<[^>]*>/g, '').substring(0, config.build.excerptLength) + '...',
    filename
  };
  
  // Generate post HTML with all config replacements
  let postHtml = postTemplate
    .replace(/{{title}}/g, post.title)
    .replace(/{{date}}/g, formatDate(post.date))
    .replace(/{{author}}/g, post.author)
    .replace(/{{content}}/g, post.content)
    .replace(/{{siteName}}/g, config.site.name)
    .replace(/{{siteDescription}}/g, config.site.description)
    .replace(/{{siteUrl}}/g, config.site.url)
    .replace(/{{slug}}/g, post.slug);
  
  // Handle tags
  const tagsHtml = post.tags.length > 0 
    ? `<div class="tags">${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>`
    : '';
  postHtml = postHtml.replace('{{tags}}', tagsHtml);

  // Add social links
  const socialLinks = generateSocialLinks();
  postHtml = postHtml.replace('{{socialLinks}}', socialLinks);
  
  // Write post file
  const postDir = path.join(config.paths.output, slug);
  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }
  fs.writeFileSync(path.join(postDir, 'index.html'), postHtml);
  
  console.log(`✓ Generated: ${post.title}`);
  return post;
}

// Copy directory recursively
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const files = fs.readdirSync(src);
  files.forEach(file => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    if (fs.statSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

// Generate RSS feed
function generateRSS(posts) {
  if (!config.rss.enabled) return;
  
  const rssItems = posts.slice(0, config.rss.maxItems).map(post => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <description><![CDATA[${post.excerpt}]]></description>
      <link>${config.site.url}/${post.slug}/</link>
      <guid>${config.site.url}/${post.slug}/</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    </item>
  `).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${config.site.name}</title>
    <description>${config.site.description}</description>
    <link>${config.site.url}</link>
    <language>${config.site.language || 'en'}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${rssItems}
  </channel>
</rss>`;

  fs.writeFileSync(path.join(config.paths.output, config.rss.filename), rss);
  console.log('✓ Generated RSS feed');
}

// Generate sitemap (if enabled)
function generateSitemap(posts) {
  if (!config.build.generateSitemap) return;
  
  const urls = [
    `<url><loc>${config.site.url}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`
  ];
  
  posts.forEach(post => {
    urls.push(`<url><loc>${config.site.url}/${post.slug}/</loc><lastmod>${post.date}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  });
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(config.paths.output, 'sitemap.xml'), sitemap);
  console.log('✓ Generated sitemap');
}

// Generate robots.txt (if enabled)
function generateRobotsTxt() {
  if (!config.build.generateRobotsTxt) return;
  
  const robots = `User-agent: *
Allow: /

Sitemap: ${config.site.url}/sitemap.xml`;

  fs.writeFileSync(path.join(config.paths.output, 'robots.txt'), robots);
  console.log('✓ Generated robots.txt');
}

// Main build function
function build() {
  console.log('🚀 Building ListLog...\n');
  console.log(`📝 Site: ${config.site.name}`);
  console.log(`🌐 URL: ${config.site.url}\n`);
  
  // Check if posts directory exists
  if (!fs.existsSync(config.paths.posts)) {
    console.error(`Posts directory not found: ${config.paths.posts}`);
    process.exit(1);
  }
  
  // Get all markdown files
  const postFiles = fs.readdirSync(config.paths.posts)
    .filter(file => file.endsWith('.md'))
    .sort()
    .reverse(); // Most recent first
  
  if (postFiles.length === 0) {
    console.error(`No markdown files found in ${config.paths.posts}`);
    process.exit(1);
  }
  
  // Generate posts
  const posts = postFiles.map(generatePost);
  
  // Generate index page (fix relative URLs)
  const postsList = posts.slice(0, config.build.postsPerPage).map(post => `
    <article class="post-preview">
      <h2><a href="${post.slug}/">${post.title}</a></h2>
      <p class="post-meta">
        <span class="author">By ${post.author}</span>
        <span class="date">${formatDate(post.date)}</span>
      </p>
      <p class="excerpt">${post.excerpt}</p>
      <a href="${post.slug}/" class="read-more">Continue reading →</a>
    </article>
  `).join('');
  
  const indexHtml = indexTemplate
    .replace(/{{siteName}}/g, config.site.name)
    .replace(/{{siteDescription}}/g, config.site.description)
    .replace(/{{siteUrl}}/g, config.site.url)
    .replace('{{posts}}', postsList)
    .replace('{{postsCount}}', posts.length)
    .replace('{{socialLinks}}', generateSocialLinks());
  
  fs.writeFileSync(path.join(config.paths.output, 'index.html'), indexHtml);
  console.log('✓ Generated index page');
  
  // Copy assets
  copyRecursive(config.paths.assets, path.join(config.paths.output, 'assets'));
  console.log('✓ Copied assets');
  
  // Generate additional files
  generateRSS(posts);
  generateSitemap(posts);
  generateRobotsTxt();
  
  console.log(`\n🎉 ListLog built successfully!`);
  console.log(`📝 ${posts.length} posts generated`);
  console.log(`📁 Output: ${config.paths.output}`);
}

// Run build
build();
