// Resume Parser - Production-ready HH.ru resume parsing
// PARSER_VERSION: 1.0.0

const {
  RESUME_SELECTORS,
  normalizeEmail,
  extractPhones,
  normalizePhoneE164,
  extractTelegram,
  isMasked,
  parseRussianDate,
  extractResumeId,
  dedupe,
  log
} = require('./resume-utils');

/**
 * Main resume parsing function
 * @param {string} html - Resume HTML content (preferably print version)
 * @param {string} sourceUrl - Original resume URL
 * @param {Object} options - Parsing options
 * @param {boolean} options.revealAttempted - Whether contact reveal was attempted
 * @returns {Object} - Parsed resume data
 */
function parseResume(html, sourceUrl, options = {}) {
  log('info', 'Starting resume parsing', { sourceUrl, options });
  
  try {
    // For Node.js environment, we need jsdom
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    const resume_id = extractResumeId(sourceUrl);
    if (!resume_id) {
      throw new Error('Could not extract resume ID from URL');
    }
    
    // Parse basic information
    const basicInfo = parseBasicInfo(doc);
    const personalDetails = parsePersonalDetails(doc);
    const employmentPrefs = parseEmploymentPreferences(doc);
    const skills = parseSkills(doc);
    const experience = parseExperience(doc);
    const education = parseEducation(doc);
    const contactsData = parseContacts(doc, options.revealAttempted);
    
    // Build final resume object
    const resumeData = {
      resume_id,
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
      
      // Basic info
      candidate_name: basicInfo.name,
      headline: basicInfo.headline,
      location: basicInfo.location,
      relocation_readiness: employmentPrefs.relocation,
      
      // Personal details
      age: personalDetails.age,
      birth_date: personalDetails.birthDate,
      status: personalDetails.status,
      
      // Employment preferences
      employment_type: employmentPrefs.types,
      schedule: employmentPrefs.schedules,
      salary: employmentPrefs.salary,
      
      // Skills
      skills: skills,
      
      // Contacts
      email_primary: contactsData.emails[0] || null,
      phone_primary_e164: contactsData.phones_e164[0] || null,
      telegram_primary: contactsData.telegrams[0] || null,
      contacts_masked: contactsData.contacts_masked,
      emails: contactsData.emails,
      phones_raw: contactsData.phones_raw,
      phones_e164: contactsData.phones_e164,
      telegrams: contactsData.telegrams,
      
      // Raw data
      raw_print_html: html,
      
      // Structured data for child tables
      experience,
      education,
      contacts: contactsData.contacts
    };
    
    log('info', 'Resume parsing completed successfully', { 
      resume_id, 
      candidate_name: resumeData.candidate_name,
      contacts_found: contactsData.contacts.length,
      contacts_masked: contactsData.contacts_masked
    });
    
    return resumeData;
    
  } catch (error) {
    log('error', 'Resume parsing failed', { error: error.message, sourceUrl });
    throw error;
  }
}

/**
 * Parse basic resume information
 */
function parseBasicInfo(doc) {
  const info = {};
  
  // Candidate name
  info.name = getTextBySelectors(doc, [
    '[data-qa="resume-personal-name"]',
    '.resume-block__title-text',
    'h1.bloko-header-section-1',
    'h1'
  ]);
  
  // Headline/position
  info.headline = getTextBySelectors(doc, [
    '[data-qa="resume-block-title-position"]',
    '.resume-block-item-gap:first-of-type',
    '.bloko-header-section-2'
  ]);
  
  // Location
  info.location = getTextBySelectors(doc, [
    '[data-qa="resume-personal-address"]',
    '.bloko-text:has-text("г.")',
    '.resume-block-item-gap:has([data-qa*="address"])'
  ]);
  
  return info;
}

/**
 * Parse personal details (age, status, etc.)
 */
function parsePersonalDetails(doc) {
  const details = {};
  
  // Age
  const ageText = getTextBySelectors(doc, [
    '[data-qa="resume-personal-age"]',
    '.bloko-text:has-text("лет")',
    '.bloko-text:has-text("год")'
  ]);
  
  if (ageText) {
    const ageMatch = ageText.match(/(\d+)/);
    details.age = ageMatch ? parseInt(ageMatch[1]) : null;
  }
  
  // Birth date (if available)
  const birthText = getTextBySelectors(doc, [
    '[data-qa="resume-personal-birthday"]',
    '.bloko-text:has-text("родился")',
    '.bloko-text:has-text("родилась")'
  ]);
  
  details.birthDate = birthText ? parseRussianDate(birthText) : null;
  
  // Status
  details.status = getTextBySelectors(doc, [
    '[data-qa="resume-personal-status"]',
    '.resume-block-item-gap .bloko-text'
  ]);
  
  return details;
}

/**
 * Parse employment preferences
 */
function parseEmploymentPreferences(doc) {
  const prefs = {};
  
  // Employment types
  prefs.types = getTextArrayBySelectors(doc, [
    '[data-qa="resume-block-position-employment"] .bloko-tag__text',
    '[data-qa*="employment"] .bloko-text'
  ]);
  
  // Schedule
  prefs.schedules = getTextArrayBySelectors(doc, [
    '[data-qa="resume-block-position-schedule"] .bloko-tag__text',
    '[data-qa*="schedule"] .bloko-text'
  ]);
  
  // Salary
  const salaryText = getTextBySelectors(doc, [
    '[data-qa="resume-block-salary"]',
    '.bloko-text:has-text("₽")',
    '.bloko-text:has-text("руб")'
  ]);
  
  if (salaryText) {
    const salaryMatch = salaryText.match(/(\d+(?:\s\d+)*)/);
    if (salaryMatch) {
      const salaryNum = salaryMatch[1].replace(/\s/g, '');
      prefs.salary = parseInt(salaryNum);
    }
  }
  
  // Relocation readiness
  prefs.relocation = getTextBySelectors(doc, [
    '[data-qa="resume-block-position-relocation"]',
    '.bloko-text:has-text("переезд")',
    '.bloko-text:has-text("командировки")'
  ]);
  
  return prefs;
}

/**
 * Parse skills
 */
function parseSkills(doc) {
  const skillsElements = doc.querySelectorAll([
    '[data-qa="bloko-tag__text"]',
    '[data-qa="resume-block-skills-item"]',
    '.bloko-tag__text',
    '.resume-block-item-gap .bloko-tag__text'
  ].join(', '));
  
  const skills = Array.from(skillsElements)
    .map(el => el.textContent?.trim())
    .filter(Boolean);
  
  return dedupe(skills);
}

/**
 * Parse work experience
 */
function parseExperience(doc) {
  const experience = [];
  
  // Find experience section
  const expSection = doc.querySelector([
    '[data-qa="resume-block-experience"]',
    '.resume-block-container:has([data-qa*="experience"])',
    '.bloko-column:has-text("Опыт работы")'
  ].join(', '));
  
  if (!expSection) {
    log('warn', 'Experience section not found');
    return experience;
  }
  
  // Find individual experience items
  const expItems = expSection.querySelectorAll([
    '.resume-block-item-gap',
    '.bloko-column-row',
    '[data-qa*="experience-item"]'
  ].join(', '));
  
  expItems.forEach((item, index) => {
    try {
      const exp = parseExperienceItem(item);
      if (exp.company || exp.position) {
        experience.push(exp);
      }
    } catch (error) {
      log('warn', `Failed to parse experience item ${index}`, { error: error.message });
    }
  });
  
  return experience;
}

/**
 * Parse single experience item
 */
function parseExperienceItem(item) {
  const exp = {};
  
  // Company name
  exp.company = getTextBySelectors(item, [
    '.bloko-text_strong',
    '.resume-block__sub-title',
    'a[data-qa*="company"]'
  ]);
  
  // Position
  exp.position = getTextBySelectors(item, [
    '.bloko-header-section-3',
    '.resume-block__title-text',
    '[data-qa*="position"]'
  ]);
  
  // Dates
  const dateText = getTextBySelectors(item, [
    '.bloko-column-row .bloko-text',
    '.resume-block__date',
    '.bloko-text:has-text("—")'
  ]);
  
  if (dateText) {
    const dateInfo = parseDateRange(dateText);
    exp.date_from = dateInfo.from;
    exp.date_to = dateInfo.to;
    exp.is_current = dateInfo.isCurrent;
  }
  
  // Description
  exp.description = getTextBySelectors(item, [
    '.bloko-text:not(.bloko-text_strong)',
    '.resume-block__text',
    'p'
  ]);
  
  return exp;
}

/**
 * Parse education
 */
function parseEducation(doc) {
  const education = [];
  
  const eduSection = doc.querySelector([
    '[data-qa="resume-block-education"]',
    '.resume-block-container:has([data-qa*="education"])',
    '.bloko-column:has-text("Образование")'
  ].join(', '));
  
  if (!eduSection) {
    log('warn', 'Education section not found');
    return education;
  }
  
  const eduItems = eduSection.querySelectorAll([
    '.resume-block-item-gap',
    '.bloko-column-row',
    '[data-qa*="education-item"]'
  ].join(', '));
  
  eduItems.forEach((item, index) => {
    try {
      const edu = parseEducationItem(item);
      if (edu.institution || edu.level) {
        education.push(edu);
      }
    } catch (error) {
      log('warn', `Failed to parse education item ${index}`, { error: error.message });
    }
  });
  
  return education;
}

/**
 * Parse single education item
 */
function parseEducationItem(item) {
  const edu = {};
  
  // Education level
  edu.level = getTextBySelectors(item, [
    '.bloko-header-section-3',
    '.resume-block__title-text'
  ]);
  
  // Institution
  edu.institution = getTextBySelectors(item, [
    '.bloko-text_strong',
    'a[data-qa*="education"]'
  ]);
  
  // Faculty/Specialty
  const specialty = getTextBySelectors(item, [
    '.bloko-text:not(.bloko-text_strong)',
    '.resume-block__text'
  ]);
  
  if (specialty) {
    edu.faculty = specialty;
    edu.specialty = specialty;
  }
  
  // Graduation year
  const yearText = getTextBySelectors(item, [
    '.bloko-column-row .bloko-text',
    '.resume-block__date'
  ]);
  
  if (yearText) {
    const yearMatch = yearText.match(/(\d{4})/);
    edu.graduation_year = yearMatch ? parseInt(yearMatch[1]) : null;
  }
  
  return edu;
}

/**
 * Parse contacts with masking detection
 */
function parseContacts(doc, revealAttempted = false) {
  const contactsData = {
    emails: [],
    phones_raw: [],
    phones_e164: [],
    telegrams: [],
    contacts_masked: false,
    contacts: []
  };
  
  // Find contacts section
  const contactsSection = doc.querySelector([
    '[data-qa="resume-contacts"]',
    '.resume-block-container:has([data-qa*="contact"])',
    '.bloko-column:has-text("Контакты")'
  ].join(', '));
  
  if (!contactsSection) {
    log('warn', 'Contacts section not found');
    return contactsData;
  }
  
  const contactText = contactsSection.textContent || '';
  
  // Extract emails
  const emailMatches = contactText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  emailMatches.forEach(email => {
    const normalized = normalizeEmail(email);
    if (normalized) {
      contactsData.emails.push(normalized);
      contactsData.contacts.push({
        contact_type: 'email',
        value_raw: email,
        value_normalized: normalized
      });
    }
    
    if (isMasked(email)) {
      contactsData.contacts_masked = true;
    }
  });
  
  // Extract phones
  const phoneMatches = extractPhones(contactText);
  phoneMatches.forEach(phone => {
    contactsData.phones_raw.push(phone);
    const normalized = normalizePhoneE164(phone, 'RU');
    if (normalized) {
      contactsData.phones_e164.push(normalized);
    }
    
    contactsData.contacts.push({
      contact_type: 'phone',
      value_raw: phone,
      value_normalized: normalized
    });
    
    if (isMasked(phone)) {
      contactsData.contacts_masked = true;
    }
  });
  
  // Extract Telegram
  const telegramHandles = extractTelegram(contactText);
  telegramHandles.forEach(handle => {
    contactsData.telegrams.push(handle);
    contactsData.contacts.push({
      contact_type: 'telegram',
      value_raw: `@${handle}`,
      value_normalized: handle
    });
  });
  
  // Deduplicate arrays
  contactsData.emails = dedupe(contactsData.emails);
  contactsData.phones_raw = dedupe(contactsData.phones_raw);
  contactsData.phones_e164 = dedupe(contactsData.phones_e164);
  contactsData.telegrams = dedupe(contactsData.telegrams);
  
  log('info', 'Contacts parsed', {
    emails: contactsData.emails.length,
    phones: contactsData.phones_raw.length,
    telegrams: contactsData.telegrams.length,
    masked: contactsData.contacts_masked,
    revealAttempted
  });
  
  return contactsData;
}

/**
 * Helper function to get text by multiple selectors
 */
function getTextBySelectors(container, selectors) {
  for (const selector of selectors) {
    const element = container.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim();
      if (text) return text;
    }
  }
  return null;
}

/**
 * Helper function to get text array by selectors
 */
function getTextArrayBySelectors(container, selectors) {
  const results = [];
  
  for (const selector of selectors) {
    const elements = container.querySelectorAll(selector);
    elements.forEach(el => {
      const text = el.textContent?.trim();
      if (text) results.push(text);
    });
  }
  
  return dedupe(results);
}

/**
 * Parse date range from Russian text
 */
function parseDateRange(dateText) {
  const result = {
    from: null,
    to: null,
    isCurrent: false
  };
  
  if (!dateText) return result;
  
  // Check for current work indicator
  if (dateText.includes('по настоящее время') || dateText.includes('н.в.')) {
    result.isCurrent = true;
  }
  
  // Split by dash or similar separators
  const parts = dateText.split(/—|–|-|\s+по\s+/);
  
  if (parts[0]) {
    result.from = parseRussianDate(parts[0].trim());
  }
  
  if (parts[1] && !result.isCurrent) {
    result.to = parseRussianDate(parts[1].trim());
  }
  
  return result;
}

module.exports = {
  parseResume
};