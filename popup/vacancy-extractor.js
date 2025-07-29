// Vacancy Extractor Popup Script
let extractedLinks = [];
let currentVacancyId = null;

const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const progressFillEl = document.getElementById('progressFill');
const progressTextEl = document.getElementById('progressText');
const resultsEl = document.getElementById('results');
const apiUrlEl = document.getElementById('apiUrl');

// Load saved API URL
chrome.storage.local.get(['vacancyExtractorApiUrl'], (result) => {
  if (result.vacancyExtractorApiUrl) {
    apiUrlEl.value = result.vacancyExtractorApiUrl;
  }
});

// Save API URL on change
apiUrlEl.addEventListener('change', () => {
  chrome.storage.local.set({ vacancyExtractorApiUrl: apiUrlEl.value });
});

// Check if we're on a vacancy response page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  if (currentTab.url.includes('/employer/vacancyresponses')) {
    statusEl.className = 'status success';
    statusEl.textContent = 'Страница откликов обнаружена';
    
    // Extract vacancy ID from URL
    const url = new URL(currentTab.url);
    currentVacancyId = url.searchParams.get('vacancyId');
    if (currentVacancyId) {
      statusEl.textContent += ` (Вакансия: ${currentVacancyId})`;
    }
  } else {
    statusEl.className = 'status warning';
    statusEl.textContent = 'Откройте страницу откликов на вакансию';
    document.getElementById('extractCurrentPage').disabled = true;
    document.getElementById('extractAllPages').disabled = true;
  }
});

// Extract current page
document.getElementById('extractCurrentPage').addEventListener('click', async () => {
  try {
    statusEl.className = 'status info';
    statusEl.textContent = 'Извлечение резюме с текущей страницы...';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_VACANCY_RESUMES' });
    
    if (results.error) {
      throw new Error(results.error);
    }
    
    extractedLinks = results.resumeLinks;
    displayResults();
    
    statusEl.className = 'status success';
    statusEl.textContent = `Извлечено ${results.resumeLinks.length} резюме`;
    
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Ошибка: ${error.message}`;
  }
});

// Extract all pages
document.getElementById('extractAllPages').addEventListener('click', async () => {
  try {
    statusEl.className = 'status info';
    statusEl.textContent = 'Начинаю извлечение со всех страниц...';
    progressEl.style.display = 'block';
    
    extractedLinks = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      // Navigate to page if needed
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = new URL(tab.url);
      const urlPage = parseInt(currentUrl.searchParams.get('page') || '1');
      
      if (urlPage !== currentPage) {
        currentUrl.searchParams.set('page', currentPage);
        await chrome.tabs.update(tab.id, { url: currentUrl.toString() });
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load
      }
      
      // Extract from current page
      const results = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_VACANCY_RESUMES' });
      
      if (results.error) {
        throw new Error(results.error);
      }
      
      if (results.resumeLinks.length === 0) {
        hasMorePages = false;
      } else {
        extractedLinks.push(...results.resumeLinks);
        updateProgress(currentPage, extractedLinks.length);
        currentPage++;
        
        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    displayResults();
    statusEl.className = 'status success';
    statusEl.textContent = `Извлечено ${extractedLinks.length} резюме с ${currentPage - 1} страниц`;
    
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Ошибка: ${error.message}`;
  }
});

// Send to database
document.getElementById('sendToDatabase').addEventListener('click', async () => {
  if (extractedLinks.length === 0) {
    statusEl.className = 'status warning';
    statusEl.textContent = 'Сначала извлеките резюме';
    return;
  }
  
  try {
    statusEl.className = 'status info';
    statusEl.textContent = 'Отправка в базу данных...';
    
    const apiUrl = apiUrlEl.value;
    if (!apiUrl) {
      throw new Error('Укажите URL API сервера');
    }
    
    const response = await fetch(`${apiUrl}/vacancy/resume-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vacancyId: currentVacancyId,
        links: extractedLinks
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    statusEl.className = 'status success';
    statusEl.textContent = `Успешно сохранено ${result.inserted} резюме в базу данных`;
    
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `Ошибка: ${error.message}`;
  }
});

function updateProgress(page, total) {
  progressTextEl.textContent = `Страница ${page}, всего резюме: ${total}`;
  // Approximate progress (we don't know total pages)
  const estimatedProgress = Math.min(95, page * 10);
  progressFillEl.style.width = `${estimatedProgress}%`;
}

function displayResults() {
  resultsEl.innerHTML = '<h3>Извлеченные резюме:</h3>';
  extractedLinks.forEach((link, index) => {
    const div = document.createElement('div');
    div.className = 'resume-link';
    div.innerHTML = `
      <strong>${index + 1}.</strong> ${link.title}<br>
      <small>Страница ${link.page}</small>
    `;
    resultsEl.appendChild(div);
  });
}