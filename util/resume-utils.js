// Resume parsing utilities with contact normalization
// PARSER_VERSION: 1.0.0

// HH.ru Resume Selectors Map
const RESUME_SELECTORS = {
  // Basic info selectors
  candidateName: '[data-qa="resume-personal-name"], .resume-block__title-text, h1',
  headline: '[data-qa="resume-block-title-position"], .resume-block-item-gap',
  location: '[data-qa="resume-personal-address"], [data-qa="resume-block-item-gap"]:has-text("г.")',
  
  // Personal details
  age: '[data-qa="resume-personal-age"]',
  status: '[data-qa="resume-personal-status"]',
  
  // Employment preferences
  employmentType: '[data-qa="resume-block-position-employment"]',
  schedule: '[data-qa="resume-block-position-schedule"]',
  salary: '[data-qa="resume-block-salary"]',
  relocation: '[data-qa="resume-block-position-relocation"]',
  
  // Skills
  skills: '[data-qa="bloko-tag__text"], [data-qa="resume-block-skills-item"]',
  
  // Experience section
  experienceSection: '[data-qa="resume-block-experience"]',
  experienceItems: '[data-qa="resume-block-container"], .resume-block-item-gap',
  
  // Education section
  educationSection: '[data-qa="resume-block-education"]',
  educationItems: '[data-qa="resume-block-item-gap"]',
  
  // Contacts section
  contactsSection: '[data-qa="resume-contacts"], .resume-block-container:has([data-qa*="contact"])',
  contactItems: '[data-qa*="resume-contacts"], [data-qa*="contact"]',
  revealContactsButton: 'button:has-text("Показать все контакты"), a:has-text("Показать все контакты")',
  
  // Print version detection
  printButton: '[data-qa="resume-print-button"], .print-button, button:has-text("Печать")',
  isPrintVersion: '.print-view, [data-qa="print"], body:has(.print-only)'
};

// Russian month names to numbers mapping
const RU_MONTHS = {
  'январь': 1, 'января': 1, 'янв': 1,
  'февраль': 2, 'февраля': 2, 'фев': 2,
  'март': 3, 'марта': 3, 'мар': 3,
  'апрель': 4, 'апреля': 4, 'апр': 4,
  'май': 5, 'мая': 5,
  'июнь': 6, 'июня': 6, 'июн': 6,
  'июль': 7, 'июля': 7, 'июл': 7,
  'август': 8, 'августа': 8, 'авг': 8,
  'сентябрь': 9, 'сентября': 9, 'сен': 9,
  'октябрь': 10, 'октября': 10, 'окт': 10,
  'ноябрь': 11, 'ноября': 11, 'ноя': 11,
  'декабрь': 12, 'декабря': 12, 'дек': 12
};

// Contact validation regexes
const CONTACT_REGEXES = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /\+?\d[\d\s().-]{7,}\d/g,
  telegram: /(?:^|[\s:])@([A-Za-z0-9_]{5,32})/g,
  telegramUrl: /t\.me\/([A-Za-z0-9_]{5,32})/g
};

// Country code mapping for phone normalization
const COUNTRY_CODES = {
  'RU': '+7', 'BY': '+375', 'UA': '+380', 'KZ': '+7',
  'UZ': '+998', 'KG': '+996', 'TJ': '+992', 'AM': '+374'
};

/**
 * Normalize email address
 * @param {string} email - Raw email string
 * @returns {string|null} - Normalized email or null if invalid
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  
  const cleaned = email.trim().toLowerCase();
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  
  return emailRegex.test(cleaned) ? cleaned : null;
}

/**
 * Extract phone numbers from text
 * @param {string} text - Text to search for phone numbers
 * @returns {string[]} - Array of raw phone numbers
 */
function extractPhones(text) {
  if (!text) return [];
  
  const matches = text.match(CONTACT_REGEXES.phone) || [];
  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Normalize phone number to E.164 format
 * @param {string} rawPhone - Raw phone number
 * @param {string} defaultRegion - Default country code (e.g., 'RU')
 * @returns {string|null} - E.164 formatted phone or null
 */
function normalizePhoneE164(rawPhone, defaultRegion = 'RU') {
  if (!rawPhone) return null;
  
  // Remove all non-digits except leading +
  let digits = rawPhone.replace(/[^\d+]/g, '');
  
  // If starts with +, validate and return
  if (digits.startsWith('+')) {
    const phoneDigits = digits.slice(1);
    if (phoneDigits.length >= 8 && phoneDigits.length <= 17) {
      return digits;
    }
    return null;
  }
  
  // Add country code based on region
  const countryCode = COUNTRY_CODES[defaultRegion] || '+7';
  
  // Handle Russian numbers starting with 8
  if (digits.startsWith('8') && defaultRegion === 'RU') {
    digits = '7' + digits.slice(1);
  }
  
  // If doesn't start with country code, prepend it
  if (!digits.startsWith(countryCode.slice(1))) {
    digits = countryCode.slice(1) + digits;
  }
  
  const fullNumber = '+' + digits;
  const phoneDigits = digits;
  
  if (phoneDigits.length >= 8 && phoneDigits.length <= 17) {
    return fullNumber;
  }
  
  return null;
}

/**
 * Extract Telegram handles from text
 * @param {string} text - Text to search for Telegram handles
 * @returns {string[]} - Array of normalized Telegram handles (without @)
 */
function extractTelegram(text) {
  if (!text) return [];
  
  const handles = new Set();
  
  // Match @handle format
  const atMatches = text.match(CONTACT_REGEXES.telegram) || [];
  atMatches.forEach(match => {
    const handle = match.match(/@([A-Za-z0-9_]{5,32})/);
    if (handle) handles.add(handle[1]);
  });
  
  // Match t.me/handle format
  const urlMatches = text.match(CONTACT_REGEXES.telegramUrl) || [];
  urlMatches.forEach(match => {
    const handle = match.match(/t\.me\/([A-Za-z0-9_]{5,32})/);
    if (handle) handles.add(handle[1]);
  });
  
  return Array.from(handles);
}

/**
 * Check if a value contains masking characters
 * @param {string} value - Value to check
 * @returns {boolean} - True if masked
 */
function isMasked(value) {
  if (!value || typeof value !== 'string') return false;
  
  // Check for masking characters
  const maskingChars = /[*•…]/;
  const ellipsis = /\.{3,}|…/;
  const truncated = /\d+\.{3,}|\d+…/;
  
  return maskingChars.test(value) || ellipsis.test(value) || truncated.test(value);
}

/**
 * Parse Russian date string to ISO date
 * @param {string} dateStr - Russian date string
 * @returns {string|null} - ISO date string or null
 */
function parseRussianDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle different date formats
  const patterns = [
    // "январь 2020", "января 2020"
    /(\w+)\s+(\d{4})/,
    // "01.2020", "1.2020"
    /(\d{1,2})\.(\d{4})/,
    // Just year "2020"
    /^(\d{4})$/
  ];
  
  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      if (pattern === patterns[2]) {
        // Just year
        return `${match[1]}-01-01`;
      } else if (pattern === patterns[1]) {
        // Month.Year format
        const month = match[1].padStart(2, '0');
        return `${match[2]}-${month}-01`;
      } else {
        // Russian month name
        const monthName = match[1].toLowerCase();
        const monthNum = RU_MONTHS[monthName];
        if (monthNum) {
          const month = monthNum.toString().padStart(2, '0');
          return `${match[2]}-${month}-01`;
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract resume ID from URL
 * @param {string} url - Resume URL
 * @returns {string|null} - Resume ID or null
 */
function extractResumeId(url) {
  if (!url) return null;
  
  // Match patterns like /resume/eb6a98c0000f30b1ee0097a6044d4958673372
  const match = url.match(/\/resume\/([a-f0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Remove duplicates from array
 * @param {Array} arr - Array to deduplicate
 * @returns {Array} - Deduplicated array
 */
function dedupe(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * Log with timestamp and context
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {*} data - Additional data to log
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [RESUME-PARSER] [${level.toUpperCase()}]`;
  
  if (data) {
    console[level](`${prefix} ${message}`, data);
  } else {
    console[level](`${prefix} ${message}`);
  }
}

module.exports = {
  RESUME_SELECTORS,
  RU_MONTHS,
  CONTACT_REGEXES,
  COUNTRY_CODES,
  normalizeEmail,
  extractPhones,
  normalizePhoneE164,
  extractTelegram,
  isMasked,
  parseRussianDate,
  extractResumeId,
  dedupe,
  log
};