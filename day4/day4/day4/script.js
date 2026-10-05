// Select all required elements
const noteText = document.getElementById('note-text');
const charCount = document.getElementById('char-count');
const wordCount = document.getElementById('word-count');
const clearBtn = document.getElementById('clear-btn');
const themeToggle = document.getElementById('theme-toggle');

// Function that updates both counters and the warning classes
function updateCounts() {
  const text = noteText.value;
  const charLength = text.length;

  // Update character counter: "N / 200 characters"
  charCount.textContent = `${charLength} / 200 characters`;

  // Update warning and over classes
  // adds warning class when over 180 characters and over class when over 200
  if (charLength > 200) {
    charCount.classList.remove('warning');
    charCount.classList.add('over');
  } else if (charLength > 180) {
    charCount.classList.add('warning');
    charCount.classList.remove('over');
  } else {
    charCount.classList.remove('warning', 'over');
  }

  // Update word counter: "N words"
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  wordCount.textContent = `${words} words`;
