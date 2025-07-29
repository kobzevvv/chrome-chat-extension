// Get Resume Links from Vacancy Response Page
console.log('🔍 Resume links extractor loaded');

async function extractVacancyResumeLinks() {
  const results = {
    vacancyId: null,
    vacancyUrl: window.location.href,
    resumeLinks: [],
    totalPages: 0,
    error: null
  };

  try {
    // Extract vacancy ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    results.vacancyId = urlParams.get('vacancyId');
    
    if (!results.vacancyId) {
      throw new Error('Vacancy ID not found in URL');
    }

    console.log(`📋 Extracting resumes for vacancy ID: ${results.vacancyId}`);

    // Function to extract links from current page
    function extractLinksFromPage() {
      const links = [];
      
      // Try multiple possible selectors
      const selectors = [
        'a[data-qa="serp-item__title"]',
        'a[href*="/resume/"]',
        '.resume-search-item__name a',
        '.bloko-link[href*="/resume/"]',
        'h3 a[href*="/resume/"]'
      ];
      
      console.log('🔍 Trying to find resume links with selectors:', selectors);
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${elements.length} elements`);
        
        if (elements.length > 0) {
          elements.forEach(element => {
            const href = element.getAttribute('href');
            if (href && href.includes('/resume/')) {
              const fullUrl = href.startsWith('http') ? href : `https://hh.ru${href}`;
              links.push({
                url: fullUrl,
                title: element.textContent.trim()
              });
            }
          });
          
          if (links.length > 0) {
            console.log(`✅ Successfully extracted ${links.length} resume links`);
            break;
          }
        }
      }
      
      // Remove duplicates
      const uniqueLinks = Array.from(new Map(links.map(link => [link.url, link])).values());
      
      return uniqueLinks;
    }

    // Function to navigate to next page
    async function goToPage(pageNumber) {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('page', pageNumber);
      window.location.href = currentUrl.toString();
      
      // Wait for page load
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (document.readyState === 'complete') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    // Extract from current page
    const currentPageLinks = extractLinksFromPage();
    const currentPage = parseInt(urlParams.get('page') || '1');
    
    results.resumeLinks = currentPageLinks.map(link => ({
      ...link,
      page: currentPage
    }));

    console.log(`✅ Found ${currentPageLinks.length} resumes on page ${currentPage}`);

    // Send results back
    return results;

  } catch (error) {
    console.error('❌ Extraction error:', error);
    results.error = error.message;
    return results;
  }
}

// Listen for extraction requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_VACANCY_RESUMES') {
    console.log('📨 Received extraction request');
    
    extractVacancyResumeLinks().then(results => {
      sendResponse(results);
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (message.type === 'GO_TO_NEXT_PAGE') {
    const currentUrl = new URL(window.location.href);
    const currentPage = parseInt(currentUrl.searchParams.get('page') || '1');
    const nextPage = currentPage + 1;
    
    currentUrl.searchParams.set('page', nextPage);
    window.location.href = currentUrl.toString();
    
    sendResponse({ navigating: true, nextPage });
  }
});

// Auto-extract if this is a vacancy response page
if (window.location.href.includes('/employer/vacancyresponses')) {
  console.log('📍 Vacancy response page detected');
  
  // Notify background script that we're ready
  chrome.runtime.sendMessage({
    type: 'RESUME_LINKS_EXTRACTOR_READY',
    url: window.location.href
  });
}