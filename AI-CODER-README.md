# AI Coder Collaboration Guide

This document provides guidelines for AI assistants working on this project to maintain clean, organized development workflow and clear change history.

## Branch & Pull Request Management

### 🌿 **Branch Naming Convention**
Use descriptive branch names that clearly indicate the feature or fix:
- `feature/database-message-storage` - New features
- `fix/message-selector-updates` - Bug fixes  
- `enhance/popup-debug-tools` - Enhancements
- `refactor/content-script-structure` - Code refactoring
- `docs/api-setup-guide` - Documentation updates

### 🔄 **Workflow Requirements**

#### 1. **Always Suggest Branch/PR Names**
At the end of each coding session, provide:
```
## 📋 Suggested Branch/PR Name:
**Branch:** `feature/enhanced-message-debugging`
**PR Title:** "Add comprehensive debugging tools for message capture"
**Description:** Enhanced popup with DOM inspection, updated HH.ru selectors, and real-time debug logs
```

#### 2. **Check for Existing Branches**
Before creating new branches, always: 
- Run `git branch -a` to list all branches
- Check if a related branch already exists
- If found, use the existing branch instead of creating new ones

#### 3. **Branch Creation Process**
```bash
# Check current branch and status
git status
git branch -a

# If no related branch exists, create one:
git checkout -b feature/your-feature-name

# If related branch exists, switch to it:
git checkout existing-branch-name
```

#### 4. **Commit Message Standards**
Use clear, descriptive commit messages:
```bash
git commit -m "feat: add DOM inspection tools to popup

- Add inspectMessagesDOM function to popup
- Create INSPECT_MESSAGES_DOM handler in content script
- Update popup UI with new debug button
- Enhance logging with color-coded message types"
```

## 🛠️ **Development Guidelines**

### **Before Starting Work:**
1. ✅ Check `git status` and current branch
2. ✅ Review existing branches with `git branch -a`
3. ✅ Look for related open PRs
4. ✅ Switch to appropriate branch or create new one

### **During Development:**
1. 📝 Use TodoWrite to track progress
2. 🧪 Test changes thoroughly
3. 📋 Document new features in code comments
4. 🔍 Verify no breaking changes

### **End of Session:**
1. 📊 Summarize what was accomplished
2. 🌿 Suggest appropriate branch/PR name
3. 💡 Provide clear PR description
4. 🔄 Note any follow-up tasks needed

## 📝 **Documentation Standards**

### **Code Comments:**
- Add JSDoc comments for new functions
- Explain complex logic or HH.ru-specific workarounds
- Include usage examples for utility functions

### **README Updates:**
- Update setup instructions for new features
- Add troubleshooting sections for common issues
- Include API endpoint documentation

## 🧪 **Testing Requirements**

### **Before Committing:**
1. Test all new functionality manually
2. Verify existing features still work
3. Check browser console for errors
4. Test API endpoints if backend changes made

### **Testing Checklist:**
- [ ] Extension loads without errors
- [ ] Popup functionality works
- [ ] Content script injection successful
- [ ] API server responds correctly
- [ ] Database operations complete successfully

## 🔧 **Technical Standards**

### **Code Quality:**
- Follow existing code style and patterns
- Use meaningful variable and function names
- Avoid hardcoded values where possible
- Handle errors gracefully with try-catch blocks

### **Security:**
- Never commit sensitive data (API keys, passwords)
- Use environment variables for configuration
- Validate all user inputs
- Follow Chrome extension security best practices

## 📋 **Session Templates**

### **Starting a Session:**
```
## 🎯 Session Goal: [Brief description]
## 🌿 Branch: [current/new branch name]
## 📝 Tasks:
1. [ ] Task 1
2. [ ] Task 2
3. [ ] Task 3
```

### **Ending a Session:**
```
## ✅ Completed:
- [List of completed tasks]

## 📋 Suggested Branch/PR:
**Branch:** `feature/example-feature`
**PR Title:** "Add example feature with comprehensive testing"
**Description:** [Detailed description of changes]

## 🔄 Next Steps:
- [Any follow-up tasks needed]
```

## 🤖 **AI Assistant Notes**

### **Capabilities Check:**
- **Git Operations:** ✅ Can read git status, branches, logs
- **Branch Creation:** ❓ Check if `git checkout -b` works in your environment
- **File Operations:** ✅ Can read, write, edit files
- **Testing:** ✅ Can run bash commands for testing

### **Limitations:**
- Cannot directly push to remote repositories
- Cannot create GitHub PRs automatically
- May need user confirmation for git operations

## 📞 **Communication Guidelines**

### **Progress Updates:**
- Use TodoWrite tool to track and display progress
- Provide clear status updates during long operations
- Explain technical decisions and trade-offs

### **Error Handling:**
- Report errors clearly with context
- Suggest troubleshooting steps
- Provide alternative approaches when needed

---

## 📚 **Quick Reference**

### **Useful Commands:**
```bash
# Check current status
git status
git branch -a

# Create and switch to new branch  
git checkout -b feature/branch-name

# Stage and commit changes
git add .
git commit -m "descriptive commit message"

# Check recent commits
git log --oneline -5

# View file changes
git diff
```

### **Project Structure:**
```
├── background.js          # Extension background script
├── content.js             # Content script (main logic)
├── popup/                 # Extension popup UI
├── util/                  # API server and utilities
├── DATABASE_SETUP.md      # Database setup instructions
└── AI-CODER-README.md     # This file
```

---

*This document should be updated as the project evolves and new patterns emerge.*