const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// ListLog Configuration
const config = {
  postsDir: './posts',
  outputDir: './dist',
  templateDir: './templates',
  siteName: 'ListLog',
  siteDescription: 'A simple, clean blog for sharing your thoughts',
  siteUrl: 'https://grouplist.github.io/ListLog/'
};

// Ensure output directory exists
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

// Read template files
function readTemplate(filename) {
  const templatePath = path.join(config.templateDir, filename);
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
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// Generate post HTML
function generatePost(filename) {
  const filePath = path.join(config.postsDir, filename);
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const { metadata, content } = parseFrontMatter(rawContent);
  
  const htmlContent = marked(content);
  const slug = generateSlug(filename);
  
  const post = {
    title: metadata.title || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    date: metadata.date || new Date().toISOString().split('T')[0],
    author: metadata.author || 'ListLog Author',
    tags: metadata.tags ? metadata.tags.split(',').map(tag => tag.trim()) : [],
    slug,
    content: htmlContent,
    excerpt: metadata.excerpt || htmlContent.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
    filename
  };
  
  // Generate post HTML
  let postHtml = postTemplate
    .replace(/{{title}}/g, post.title)
    .replace(/{{date}}/g, formatDate(post.date))
    .replace(/{{author}}/g, post.author)
    .replace(/{{content}}/g, post.content)
    .replace(/{{siteName}}/g, config.siteName)
    .replace(/{{siteDescription}}/g, config.siteDescription);
  
  // Handle tags
  const tagsHtml = post.tags.length > 0 
    ? `<div class="tags">${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>`
    : '';
  postHtml = postHtml.replace('{{tags}}', tagsHtml);
  
  // Write post file
  const postDir = path.join(config.outputDir, slug);
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
  const rssItems = posts.slice(0, 10).map(post => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <description><![CDATA[${post.excerpt}]]></description>
      <link>${config.siteUrl}/${post.slug}/</link>
      <guid>${config.siteUrl}/${post.slug}/</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    </item>
  `).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${config.siteName}</title>
    <description>${config.siteDescription}</description>
    <link>${config.siteUrl}</link>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${rssItems}
  </channel>
</rss>`;

  fs.writeFileSync(path.join(config.outputDir, 'feed.xml'), rss);
  console.log('✓ Generated RSS feed');
}

// Main build function
function build() {
  console.log('🚀 Building ListLog...\n');
  
  // Check if posts directory exists
  if (!fs.existsSync(config.postsDir)) {
    console.error('Posts directory not found! Create ./posts/ and add some .md files.');
    process.exit(1);
  }
  
  // Get all markdown files
  const postFiles = fs.readdirSync(config.postsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .reverse(); // Most recent first
  
  if (postFiles.length === 0) {
    console.error('No markdown files found in ./posts/');
    process.exit(1);
  }
  
  // Generate posts
  const posts = postFiles.map(generatePost);
  
  // Generate index page
  const postsList = posts.map(post => `
    <article class="post-preview">
      <h2><a href="/${post.slug}/">${post.title}</a></h2>
      <p class="post-meta">
        <span class="author">By ${post.author}</span>
        <span class="date">${formatDate(post.date)}</span>
      </p>
      <p class="excerpt">${post.excerpt}</p>
      <a href="/${post.slug}/" class="read-more">Continue reading →</a>
    </article>
  `).join('');
  
  const indexHtml = indexTemplate
    .replace(/{{siteName}}/g, config.siteName)
    .replace(/{{siteDescription}}/g, config.siteDescription)
    .replace('{{posts}}', postsList)
    .replace('{{postsCount}}', posts.length);
  
  fs.writeFileSync(path.join(config.outputDir, 'index.html'), indexHtml);
  console.log('✓ Generated index page');
  
  // Copy assets
  copyRecursive('./assets', path.join(config.outputDir, 'assets'));
  console.log('✓ Copied assets');
  
  // Generate RSS feed
  generateRSS(posts);
  
  console.log(`\n🎉 ListLog built successfully!`);
  console.log(`📝 ${posts.length} posts generated`);
  console.log(`📁 Output: ${config.outputDir}`);
}

// Run build
build();
