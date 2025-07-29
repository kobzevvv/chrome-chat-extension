# Resume Capture Testing Guide

This guide walks through testing the HH.ru resume capture functionality end-to-end.

## Prerequisites

1. **Database Setup**
   - Ensure your Neon database is configured in `.env`
   - The API server should be running: `npm run dev`
   - Verify database connection in server logs

2. **Chrome Extension**
   - Load unpacked extension in Chrome
   - Ensure you're logged into HH.ru

## Testing Steps

### 1. Navigate to Test Resume

Open the provided resume URL:
```
https://ufa.hh.ru/resume/eb6a98c0000f30b1ee0097a6044d4958673372
```

Or any other resume URL you have access to.

### 2. Test Via Browser Console

Open Developer Tools (F12) and run:

```javascript
// Test without revealing contacts
window.testResumeCapture()

// Test with contact reveal attempt
window.testResumeCapture({ revealContacts: true })
```

Watch the console logs for:
- Resume page detection
- HTML capture (print version attempt)
- API communication
- Success/error messages

### 3. Test Via Extension Popup

1. Click the extension icon
2. Look for the "Resume Capture" section
3. Check "Reveal contacts" if desired
4. Click "Save HH Resume to Neon"
5. Watch the status messages in the popup

### 4. Verify Data Storage

#### Option A: Check API Endpoints

```bash
# Get all stored resumes
curl http://localhost:4000/resumes

# Get specific resume (replace with actual ID)
curl http://localhost:4000/resumes/eb6a98c0000f30b1ee0097a6044d4958673372
```

#### Option B: Check Database Directly

Connect to your Neon database and run:

```sql
-- View all resumes
SELECT resume_id, candidate_name, email_primary, phone_primary_e164, contacts_masked 
FROM resumes 
ORDER BY created_at DESC;

-- View resume with details
SELECT * FROM resumes WHERE resume_id = 'eb6a98c0000f30b1ee0097a6044d4958673372';

-- View experience
SELECT * FROM resume_experience WHERE resume_id = 'eb6a98c0000f30b1ee0097a6044d4958673372';

-- View education
SELECT * FROM resume_education WHERE resume_id = 'eb6a98c0000f30b1ee0097a6044d4958673372';

-- View contacts
SELECT * FROM resume_contacts WHERE resume_id = 'eb6a98c0000f30b1ee0097a6044d4958673372';
```

## Expected Results

### Successful Capture
- Resume ID extracted from URL
- Basic info: candidate name, headline, location
- Employment preferences: types, schedules, salary
- Skills array
- Experience records with dates
- Education records
- Contacts (if visible): emails, phones, telegram

### Contacts Handling
- **Masked contacts**: `contacts_masked = true` if hidden
- **Reveal attempt**: If checkbox checked, attempts to click reveal button
- **Normalized data**: Phone numbers in E.164 format, lowercase emails

## Troubleshooting

### Content Script Not Loaded
```javascript
// Manually inject if needed
chrome.scripting.executeScript({
  target: { tabId: currentTabId },
  files: ['content.js']
});
```

### Print Version Issues
- The extension tries multiple methods to get print version
- Falls back to current page HTML if print unavailable
- Check console for print URL attempts

### Parser Errors
Check server logs for detailed error messages:
- Missing selectors
- DOM structure changes
- Invalid date formats

### Database Errors
- Check `DATABASE_URL` is set correctly
- Verify tables exist (run `createTables()`)
- Check for unique constraint violations

## Debug Mode

For detailed debugging, check these locations:

1. **Browser Console** (on resume page)
   - Content script logs
   - Network requests to API

2. **Extension Popup**
   - Status log shows step-by-step progress
   - Color-coded messages (green=success, red=error)

3. **API Server Console**
   - Incoming requests
   - Parser output
   - Database operations

4. **Chrome Extension Logs**
   - chrome://extensions → Details → Inspect views

## Sample Resume Data

A successfully parsed resume should have:

```json
{
  "resume_id": "eb6a98c0000f30b1ee0097a6044d4958673372",
  "candidate_name": "Иван Иванов",
  "headline": "Product Manager",
  "location": "Уфа",
  "skills": ["Agile", "Scrum", "JIRA"],
  "email_primary": "ivan@example.com",
  "phone_primary_e164": "+79991234567",
  "contacts_masked": false,
  "experience": [
    {
      "company": "ООО Компания",
      "position": "Product Manager",
      "date_from": "2020-01-01",
      "date_to": null,
      "is_current": true
    }
  ]
}
```

## Privacy & Compliance Notes

- Only captures what the logged-in user can see
- Respects HH.ru's contact visibility settings
- No attempts to bypass security measures
- All data stored locally in your database

## Next Steps

After successful testing:

1. **Batch Processing**: Implement `collectApplicantsFromSearchPage()`
2. **Export Features**: Add CSV/JSON export for captured resumes
3. **Deduplication**: Handle resume updates intelligently
4. **Analytics**: Build dashboards for resume data

---

For issues or questions, check the main README or create an issue in the repository.