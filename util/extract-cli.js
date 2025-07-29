#!/usr/bin/env node
require('dotenv').config();
const fetch = require('node-fetch');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const DEFAULT_TEST_URL = 'https://ufa.hh.ru/resume/eb6a98c0000f30b1ee0097a6044d4958673372';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const url = args[1] || DEFAULT_TEST_URL;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printUsage() {
  console.log(`
${colors.bright}Resume Extractor CLI${colors.reset}

Usage:
  node extract-cli.js <command> [url]

Commands:
  extract [url]     Extract HTML from a resume URL (default: test resume)
  list             List unprocessed extracts
  process [id]     Process a specific extract (transform to structured data)
  help            Show this help message

Examples:
  node extract-cli.js extract
  node extract-cli.js extract https://hh.ru/resume/abc123
  node extract-cli.js list
  node extract-cli.js process 123

Environment Variables:
  API_URL         API server URL (default: http://localhost:4000)
`);
}

async function extractFromUrl(resumeUrl) {
  try {
    log(`\n📥 Extracting resume from URL...`, 'bright');
    log(`URL: ${resumeUrl}`, 'cyan');
    
    const response = await fetch(`${API_URL}/extract-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: resumeUrl })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    
    log(`\n✅ Extract request sent successfully!`, 'green');
    log(`Resume ID: ${result.resume_id}`, 'yellow');
    
    if (result.next_steps) {
      log(`\nNext steps:`, 'bright');
      result.next_steps.forEach((step, i) => {
        log(`  ${step}`, 'blue');
      });
    }
    
    log(`\n💡 To extract HTML from browser, use the Chrome extension`, 'yellow');
    log(`   or implement server-side fetching with puppeteer/playwright`, 'yellow');
    
  } catch (error) {
    log(`\n❌ Error extracting resume: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function listUnprocessedExtracts() {
  try {
    log(`\n📋 Fetching unprocessed extracts...`, 'bright');
    
    const response = await fetch(`${API_URL}/extracts/unprocessed`);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    
    if (result.count === 0) {
      log(`\nNo unprocessed extracts found.`, 'yellow');
      return;
    }
    
    log(`\nFound ${result.count} unprocessed extract(s):`, 'green');
    console.log('');
    
    result.extracts.forEach((extract, i) => {
      console.log(`${colors.bright}${i + 1}. Extract ID: ${extract.id}${colors.reset}`);
      console.log(`   Resume ID: ${colors.cyan}${extract.resume_id}${colors.reset}`);
      console.log(`   Source URL: ${colors.blue}${extract.source_url}${colors.reset}`);
      console.log(`   Extracted: ${new Date(extract.extracted_at).toLocaleString()}`);
      console.log(`   HTML Size: ${(extract.html_content.length / 1024).toFixed(1)} KB`);
      console.log('');
    });
    
  } catch (error) {
    log(`\n❌ Error listing extracts: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function processExtract(extractId) {
  try {
    if (!extractId) {
      log(`\n❌ Please provide an extract ID to process`, 'red');
      log(`   Use 'node extract-cli.js list' to see available extracts`, 'yellow');
      process.exit(1);
    }
    
    log(`\n🔄 Processing extract ID: ${extractId}...`, 'bright');
    
    // In a real implementation, this would:
    // 1. Fetch the extract from database
    // 2. Parse the HTML using resume-parser
    // 3. Save structured data to resume tables
    // 4. Mark extract as processed
    
    log(`\n⚠️  Processing not implemented yet`, 'yellow');
    log(`   This would parse the HTML and save structured data`, 'yellow');
    
  } catch (error) {
    log(`\n❌ Error processing extract: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) {
      throw new Error('API server is not responding');
    }
    return true;
  } catch (error) {
    log(`\n❌ Cannot connect to API server at ${API_URL}`, 'red');
    log(`   Make sure the server is running: npm run api`, 'yellow');
    process.exit(1);
  }
}

// Main execution
async function main() {
  // Check API health first
  await checkApiHealth();
  
  switch (command) {
    case 'extract':
      await extractFromUrl(url);
      break;
      
    case 'list':
      await listUnprocessedExtracts();
      break;
      
    case 'process':
      await processExtract(args[1]);
      break;
      
    case 'help':
    case undefined:
      printUsage();
      break;
      
    default:
      log(`\n❌ Unknown command: ${command}`, 'red');
      printUsage();
      process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});