const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const { URL } = require('url');

async function extractResumeLinks(vacancyUrl) {
  console.log(`Starting extraction for vacancy URL: ${vacancyUrl}`);
  
  const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const parsedUrl = new URL(vacancyUrl);
    const vacancyId = parsedUrl.searchParams.get('vacancyId');
    
    if (!vacancyId) {
      throw new Error('Vacancy ID not found in URL');
    }

    console.log(`Extracted vacancy ID: ${vacancyId}`);
    
    const allResumeLinks = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      console.log(`Processing page ${page}...`);
      
      parsedUrl.searchParams.set('page', page);
      const pageUrl = parsedUrl.toString();
      
      try {
        const response = await axios.get(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });

        const $ = cheerio.load(response.data);
        
        const resumeLinks = [];
        $('h3.title--Z9FeLyEY3sZrwn2k a[data-qa="serp-item__title"]').each((index, element) => {
          const href = $(element).attr('href');
          if (href) {
            const fullUrl = `https://hh.ru${href}`;
            resumeLinks.push({
              url: fullUrl,
              vacancyId: vacancyId,
              page: page
            });
          }
        });

        console.log(`Found ${resumeLinks.length} resume links on page ${page}`);
        
        if (resumeLinks.length === 0) {
          hasMorePages = false;
        } else {
          allResumeLinks.push(...resumeLinks);
          page++;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (pageError) {
        if (pageError.response && pageError.response.status === 404) {
          console.log(`Page ${page} not found - no more pages`);
          hasMorePages = false;
        } else {
          throw pageError;
        }
      }
    }

    console.log(`Total resume links found: ${allResumeLinks.length}`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resume_links_to_extract (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        vacancy_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMP,
        error TEXT
      )
    `);

    let inserted = 0;
    for (const link of allResumeLinks) {
      try {
        await pool.query(
          `INSERT INTO resume_links_to_extract (url, vacancy_id, page_number) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (url) DO NOTHING`,
          [link.url, link.vacancyId, link.page]
        );
        inserted++;
      } catch (insertError) {
        console.error(`Error inserting link: ${link.url}`, insertError.message);
      }
    }

    console.log(`Successfully inserted ${inserted} resume links into database`);

  } catch (error) {
    console.error('Extraction failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const vacancyUrl = process.argv[2];
if (!vacancyUrl) {
  console.error('Please provide a vacancy URL as argument');
  process.exit(1);
}

extractResumeLinks(vacancyUrl);