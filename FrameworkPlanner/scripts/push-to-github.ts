import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

const REPO_OWNER = 'Karfearsw';
const REPO_NAME = 'OTPSTACKK';

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.replit',
  'replit.nix',
  '.upm',
  '.cache',
  '.config',
  'package-lock.json',
  '.env',
  '/tmp',
  'attached_assets',
  '*.log',
  '.breakpoints'
];

function shouldIgnore(filePath: string): boolean {
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.startsWith('*')) {
      if (filePath.endsWith(pattern.slice(1))) return true;
    } else if (filePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (shouldIgnore(fullPath)) return;
    
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function pushToGitHub() {
  console.log('🚀 Starting push to GitHub...');
  console.log(`📦 Repository: ${REPO_OWNER}/${REPO_NAME}`);
  
  const octokit = await getGitHubClient();
  
  // Get all files
  const files = getAllFiles('.');
  console.log(`📄 Found ${files.length} files to upload`);

  // Upload files one by one using Contents API (works with empty repos)
  console.log('📤 Uploading files...');
  let successCount = 0;
  let errorCount = 0;

  for (const filePath of files) {
    const relativePath = filePath.replace(/^\.\//, '');
    try {
      const content = fs.readFileSync(filePath);
      const base64Content = content.toString('base64');
      
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data: existing } = await octokit.repos.getContent({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: relativePath
        });
        if (!Array.isArray(existing) && 'sha' in existing) {
          sha = existing.sha;
        }
      } catch (e) {
        // File doesn't exist, that's fine
      }
      
      await octokit.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: relativePath,
        message: sha ? `Update ${relativePath}` : `Add ${relativePath}`,
        content: base64Content,
        sha: sha
      });
      
      successCount++;
      process.stdout.write(`\r📤 Uploaded ${successCount}/${files.length} files`);
    } catch (err: any) {
      errorCount++;
      console.error(`\n❌ Failed: ${relativePath} - ${err.message}`);
    }
  }

  console.log(`\n\n✅ Successfully uploaded ${successCount} files`);
  if (errorCount > 0) {
    console.log(`⚠️  Failed to upload ${errorCount} files`);
  }
  console.log(`\n🎉 Done! View your repo at:`);
  console.log(`🔗 https://github.com/${REPO_OWNER}/${REPO_NAME}`);
}

pushToGitHub().catch(console.error);
