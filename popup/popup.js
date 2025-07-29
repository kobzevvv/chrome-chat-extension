// Resume Links Extractor Popup
let extractedLinks = [];

document.addEventListener('DOMContentLoaded', () => {
    const extractBtn = document.getElementById('extractBtn');
    const extractAllBtn = document.getElementById('extractAllBtn');
    const saveBtn = document.getElementById('saveBtn');
    const statusEl = document.getElementById('status');
    const resultsEl = document.getElementById('results');
    const linksListEl = document.getElementById('linksList');
    const apiUrlEl = document.getElementById('apiUrl');
    const progressEl = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    // Load saved API URL
    chrome.storage.local.get(['apiUrl'], (result) => {
        if (result.apiUrl) {
            apiUrlEl.value = result.apiUrl;
        }
    });
    
    // Save API URL on change
    apiUrlEl.addEventListener('change', () => {
        chrome.storage.local.set({ apiUrl: apiUrlEl.value });
    });
    
    // Extract button click handler
    extractBtn.addEventListener('click', async () => {
        try {
            statusEl.className = 'status info';
            statusEl.textContent = 'Extracting resume links...';
            extractBtn.disabled = true;
            
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if on vacancy response page
            if (!tab.url.includes('/employer/vacancyresponses')) {
                throw new Error('Please navigate to a vacancy response page first');
            }
            
            // Extract links using chrome.scripting.executeScript
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractResumeLinks
            });
            
            if (result.result.error) {
                throw new Error(result.result.error);
            }
            
            extractedLinks = result.result.links;
            const vacancyId = result.result.vacancyId;
            
            // Display results
            statusEl.className = 'status success';
            statusEl.textContent = `Found ${extractedLinks.length} resume links`;
            
            linksListEl.innerHTML = '';
            extractedLinks.forEach((link, index) => {
                const item = document.createElement('div');
                item.className = 'resume-item';
                item.innerHTML = `
                    <strong>${index + 1}.</strong> ${link.title}<br>
                    <small style="color: #666;">Page ${link.page}</small>
                `;
                linksListEl.appendChild(item);
            });
            
            resultsEl.style.display = 'block';
            saveBtn.style.display = 'block';
            
            // Store vacancy ID for saving
            saveBtn.dataset.vacancyId = vacancyId;
            
        } catch (error) {
            statusEl.className = 'status error';
            statusEl.textContent = error.message;
        } finally {
            extractBtn.disabled = false;
        }
    });
    
    // Extract all pages button click handler
    extractAllBtn.addEventListener('click', async () => {
        try {
            statusEl.className = 'status info';
            statusEl.textContent = 'Starting multi-page extraction...';
            extractBtn.disabled = true;
            extractAllBtn.disabled = true;
            progressEl.style.display = 'block';
            
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if on vacancy response page
            if (!tab.url.includes('/employer/vacancyresponses')) {
                throw new Error('Please navigate to a vacancy response page first');
            }
            
            extractedLinks = [];
            let currentPage = 1;
            let hasMorePages = true;
            let vacancyId = null;
            
            while (hasMorePages) {
                // Update progress
                progressText.textContent = `Extracting page ${currentPage}...`;
                progressBar.style.width = `${Math.min(currentPage * 10, 90)}%`;
                
                // Navigate to page if needed
                const currentUrl = new URL(tab.url);
                const urlPage = parseInt(currentUrl.searchParams.get('page') || '1');
                
                if (urlPage !== currentPage) {
                    currentUrl.searchParams.set('page', currentPage);
                    await chrome.tabs.update(tab.id, { url: currentUrl.toString() });
                    // Wait for page load
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                // Extract links from current page
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: extractResumeLinks
                });
                
                if (result.result.error) {
                    throw new Error(result.result.error);
                }
                
                const pageLinks = result.result.links;
                vacancyId = result.result.vacancyId;
                
                if (pageLinks.length === 0) {
                    hasMorePages = false;
                } else {
                    extractedLinks.push(...pageLinks);
                    progressText.textContent = `Found ${extractedLinks.length} resumes so far...`;
                    currentPage++;
                    
                    // Small delay between pages
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Final update
            progressBar.style.width = '100%';
            progressText.textContent = `Completed! Found ${extractedLinks.length} resumes across ${currentPage - 1} pages`;
            
            // Display results
            statusEl.className = 'status success';
            statusEl.textContent = `Found ${extractedLinks.length} resume links across ${currentPage - 1} pages`;
            
            linksListEl.innerHTML = '';
            extractedLinks.forEach((link, index) => {
                const item = document.createElement('div');
                item.className = 'resume-item';
                item.innerHTML = `
                    <strong>${index + 1}.</strong> ${link.title}<br>
                    <small style="color: #666;">Page ${link.page}</small>
                `;
                linksListEl.appendChild(item);
            });
            
            resultsEl.style.display = 'block';
            saveBtn.style.display = 'block';
            
            // Store vacancy ID for saving
            saveBtn.dataset.vacancyId = vacancyId;
            
            // Hide progress after 2 seconds
            setTimeout(() => {
                progressEl.style.display = 'none';
            }, 2000);
            
        } catch (error) {
            statusEl.className = 'status error';
            statusEl.textContent = error.message;
            progressEl.style.display = 'none';
        } finally {
            extractBtn.disabled = false;
            extractAllBtn.disabled = false;
        }
    });
    
    // Save button click handler
    saveBtn.addEventListener('click', async () => {
        try {
            statusEl.className = 'status info';
            statusEl.textContent = 'Saving to database...';
            saveBtn.disabled = true;
            
            const vacancyId = saveBtn.dataset.vacancyId;
            const apiUrl = apiUrlEl.value;
            
            if (!apiUrl) {
                throw new Error('Please enter API URL');
            }
            
            const response = await fetch(`${apiUrl}/vacancy/resume-links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    vacancyId: vacancyId,
                    links: extractedLinks
                })
            });
            
            if (!response.ok) {
                let errorMessage = `Server error (${response.status})`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    const errorText = await response.text();
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            
            statusEl.className = 'status success';
            statusEl.textContent = result.message || `Saved ${result.inserted} links to database`;
            
        } catch (error) {
            statusEl.className = 'status error';
            if (error.message.includes('Failed to fetch')) {
                statusEl.textContent = 'Cannot connect to API server. Make sure it\'s running at ' + apiUrlEl.value;
            } else {
                statusEl.textContent = error.message;
            }
            console.error('Save error:', error);
        } finally {
            saveBtn.disabled = false;
        }
    });
    
    // Extract resumes button click handler
    const extractResumesBtn = document.getElementById('extractResumesBtn');
    const resumeProgress = document.getElementById('resumeProgress');
    const resumeProgressBar = document.getElementById('resumeProgressBar');
    const resumeProgressText = document.getElementById('resumeProgressText');
    const resumeStatus = document.getElementById('resumeStatus');
    
    extractResumesBtn.addEventListener('click', async () => {
        try {
            resumeStatus.style.display = 'block';
            resumeStatus.className = 'status info';
            resumeStatus.textContent = 'Starting resume extraction...';
            extractResumesBtn.disabled = true;
            resumeProgress.style.display = 'block';
            
            const apiUrl = apiUrlEl.value;
            if (!apiUrl) {
                throw new Error('Please enter API URL');
            }
            
            let processed = 0;
            let successful = 0;
            let failed = 0;
            const targetCount = 50;
            
            resumeProgressText.textContent = `Starting extraction of up to ${targetCount} resumes...`;
            
            // Process resumes one by one
            while (processed < targetCount) {
                let link = null; // Declare link in outer scope
                
                try {
                    // Update progress
                    resumeProgressBar.style.width = `${(processed / targetCount) * 100}%`;
                    resumeProgressText.textContent = `Fetching next resume... (${processed}/${targetCount} completed)`;
                    
                    // Get just one unprocessed link
                    const linksResponse = await fetch(`${apiUrl}/resume-links/unprocessed?limit=1`);
                    if (!linksResponse.ok) {
                        throw new Error('Failed to get unprocessed links');
                    }
                    
                    const linksData = await linksResponse.json();
                    const resumeLinks = linksData.links;
                    
                    if (resumeLinks.length === 0) {
                        resumeStatus.className = 'status success';
                        resumeStatus.textContent = `No more unprocessed links. Processed ${processed} resumes: ${successful} successful, ${failed} failed`;
                        break;
                    }
                    
                    link = resumeLinks[0]; // Assign to outer scope variable
                    
                    // Update status with current resume
                    resumeProgressText.textContent = `Processing ${processed + 1}/${targetCount}: ${link.title || 'Resume'}`;
                    resumeStatus.textContent = `Current: ${link.title || link.url}`;
                    
                    // Navigate to resume page
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    await chrome.tabs.update(tab.id, { url: link.url });
                    
                    // Wait for page load
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Extract resume content
                    const [extractResult] = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: extractResumeContent
                    });
                    
                    if (extractResult.result.error) {
                        throw new Error(extractResult.result.error);
                    }
                    
                    const resumeData = extractResult.result.data;
                    
                    // Send to API for saving HTML content
                    const saveResponse = await fetch(`${apiUrl}/resume/html-content`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            url: link.url,
                            content: resumeData.html,
                            resume_link_id: link.id
                        })
                    });
                    
                    if (!saveResponse.ok) {
                        throw new Error('Failed to save HTML content');
                    }
                    
                    const saveResult = await saveResponse.json();
                    console.log('📝 Save result:', saveResult);
                    
                    // Mark as processed
                    await fetch(`${apiUrl}/resume-links/${link.id}/processed`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({})
                    });
                    
                    successful++;
                    processed++;
                    
                    // Update status with success
                    resumeStatus.className = 'status success';
                    resumeStatus.textContent = `✓ Saved HTML content for: ${link.title} (${successful} successful, ${failed} failed)`;
                    
                    // Check database status every 5 resumes
                    if (processed % 5 === 0) {
                        console.log('🔍 Checking database status...');
                        try {
                            const dbCheckResponse = await fetch(`${apiUrl}/resume/html-content/stats`);
                            const dbStats = await dbCheckResponse.json();
                            console.log('📊 Database stats:', dbStats);
                        } catch (dbError) {
                            console.error('❌ Error checking DB stats:', dbError);
                        }
                    }
                    
                } catch (error) {
                    console.error(`Error processing resume:`, error);
                    
                    // Try to mark as processed with error if we have link info
                    if (link) {
                        try {
                            await fetch(`${apiUrl}/resume-links/${link.id}/processed`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    error: error.message
                                })
                            });
                        } catch (markError) {
                            console.error('Failed to mark as processed:', markError);
                        }
                    }
                    
                    failed++;
                    processed++;
                    
                    // Update status with error
                    resumeStatus.className = 'status error';
                    resumeStatus.textContent = `✗ Failed: ${error.message} (${successful} successful, ${failed} failed)`;
                }
                
                // Small delay between resumes
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Final update
            resumeProgressBar.style.width = '100%';
            resumeProgressText.textContent = `Completed! Processed ${processed} resumes`;
            
            resumeStatus.className = successful > 0 ? 'status success' : 'status error';
            resumeStatus.textContent = `Final: Processed ${processed} resumes - ${successful} successful, ${failed} failed`;
            
            // Final database check
            console.log('🔍 Final database check...');
            try {
                const finalCheckResponse = await fetch(`${apiUrl}/resume/html-content/stats`);
                const finalStats = await finalCheckResponse.json();
                console.log('📊 FINAL Database stats:', finalStats);
                console.log(`📊 Total records in DB: ${finalStats.stats.totalRecords}`);
                
                // Also get full list to debug
                const listResponse = await fetch(`${apiUrl}/resume/html-content`);
                const listData = await listResponse.json();
                console.log('📋 Full record list:', listData);
            } catch (dbError) {
                console.error('❌ Error in final DB check:', dbError);
            }
            
            // Hide progress after 3 seconds
            setTimeout(() => {
                resumeProgress.style.display = 'none';
            }, 3000);
            
        } catch (error) {
            resumeStatus.className = 'status error';
            resumeStatus.textContent = error.message;
            resumeProgress.style.display = 'none';
            console.error('Resume extraction error:', error);
        } finally {
            extractResumesBtn.disabled = false;
        }
    });
});

// Function that runs in the page context to extract resume links
function extractResumeLinks() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const vacancyId = urlParams.get('vacancyId');
        const currentPage = parseInt(urlParams.get('page') || '1');
        
        const links = [];
        
        // Try multiple selectors
        const selectors = [
            'h3.title--Z9FeLyEY3sZrwn2k a[data-qa="serp-item__title"]',
            'a[data-qa="serp-item__title"]',
            '.bloko-link[href*="/resume/"]',
            'a[href*="/resume/"]'
        ];
        
        let resumeElements = null;
        for (const selector of selectors) {
            resumeElements = document.querySelectorAll(selector);
            if (resumeElements.length > 0) {
                console.log(`Found ${resumeElements.length} elements with selector: ${selector}`);
                break;
            }
        }
        
        if (!resumeElements || resumeElements.length === 0) {
            // Try to find any links that look like resume links
            const allLinks = document.querySelectorAll('a[href*="/resume/"]');
            resumeElements = Array.from(allLinks).filter(link => {
                const href = link.getAttribute('href');
                return href && href.match(/\/resume\/[a-f0-9]{32}/);
            });
        }
        
        resumeElements.forEach(element => {
            const href = element.getAttribute('href');
            if (href) {
                const title = element.textContent.trim() || 'No title';
                const fullUrl = href.startsWith('http') ? href : `https://hh.ru${href}`;
                
                links.push({
                    url: fullUrl,
                    title: title,
                    page: currentPage
                });
            }
        });
        
        return {
            vacancyId: vacancyId,
            links: links,
            error: null
        };
        
    } catch (error) {
        return {
            vacancyId: null,
            links: [],
            error: error.message
        };
    }
}

// Function that runs in the page context to extract resume content
function extractResumeContent() {
    // Simplified function to just get print HTML
    return (async () => {
        try {
            // Extract resume ID from URL
            const urlMatch = window.location.href.match(/\/resume\/([a-f0-9]{32})/);
            if (!urlMatch) {
                throw new Error('Could not extract resume ID from URL');
            }
            const resumeId = urlMatch[1];
            
            // Construct print URL
            const printUrl = `https://hh.ru/resume/${resumeId}?print=true&hhtmFrom=resume`;
            
            // Fetch print version
            const response = await fetch(printUrl, {
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': navigator.userAgent
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch print version: ${response.status}`);
            }
            
            const printHtml = await response.text();
            
            return {
                data: {
                    html: printHtml,
                    url: window.location.href
                },
                error: null
            };
            
        } catch (error) {
            // Fallback to regular HTML if print version fails
            console.warn('Failed to get print version, using regular HTML:', error);
            
            return {
                data: {
                    html: document.documentElement.outerHTML,
                    url: window.location.href
                },
                error: null
            };
        }
    })();
}