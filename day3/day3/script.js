let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

/**
 * 1. searchNotes(word)
 * Returns an array of notes whose text contains word, ignoring upper and lower case.
 * Written using filter, toLowerCase and includes.
 */
function searchNotes(word) {
  const lowerWord = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(lowerWord));
}

/**
 * 2. longestNote()
 * Returns the note object with the most characters, or null if there are no notes.
 * Handles the empty array first, then compares lengths.
 */
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }
  return longest;
}

/**
 * 3. countByCategory()
 * Returns an object counting notes per category, such as { personal: 2, work: 1, study: 2 }.
 * Written by looping over the notes and increasing a counter in an object.
 */
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    if (counts[note.category]) {
      counts[note.category]++;
    } else {
      counts[note.category] = 1;
    }
  }
  return counts;
}

/**
 * 4. getSummary()
 * Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
 * Written using countByCategory and a template literal.
 * Uses "note" for exactly one note and "notes" otherwise.
 */
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noteWord = total === 1 ? "note" : "notes";

  // Standard category display ordering: personal, work, study
  const categoryOrder = ["personal", "work", "study"];
  const sortedCategories = Object.keys(counts).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });

  if (sortedCategories.length === 0) {
    return `${total} ${noteWord}.`;
  }

  const breakdown = sortedCategories
    .map((category) => `${counts[category]} ${category}`)
    .join(", ");

  return `${total} ${noteWord}: ${breakdown}.`;
}

/**
 * 5. isDuplicate(text)
 * Returns true if a note with the same text already exists (ignoring case and extra spaces).
 * Written using some, comparing trimmed lower-case text.
 */
function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();
  return notes.some(
    (note) => note.text.trim().toLowerCase() === normalizedText
  );
}

/**
 * 6. addNote(text, category)
 * Adds a note only if it is 1–200 characters, is not a duplicate and the category
 * is one of personal, work or study. Returns true when added and false otherwise, logging the reason.
 */
function addNote(text, category) {
  // Check text length (1 to 200 characters)
  if (typeof text !== "string" || text.trim().length === 0 || text.length > 200) {
    console.log("Failed to add note: Note text must be between 1 and 200 characters.");
    return false;
  }

  // Check category (must be personal, work, or study)
  const allowedCategories = ["personal", "work", "study"];
  if (!allowedCategories.includes(category)) {
    console.log(`Failed to add note: Invalid category "${category}". Must be personal, work, or study.`);
    return false;
  }

  // Check if duplicate
  if (isDuplicate(text)) {
    console.log(`Failed to add note: A note with the text "${text.trim()}" already exists.`);
    return false;
  }

  // Generate next id
  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  const newNote = {
    id: nextId,
    text: text.trim(),
    category: category,
  };

  notes.push(newNote);
  return true;
}

// ==========================================
// TESTS & CONSOLE OUTPUT DEMONSTRATION
// ==========================================

console.log("--- Testing searchNotes ---");
// Normal case: search for "bread" in lowercase
console.log(searchNotes("bread"));
// Expected output: [{ id: 1, text: "Buy milk and bread", category: "personal" }]

// Edge case: search for a term with no matches
console.log(searchNotes("nonexistent keyword"));
// Expected output: []

// Normal case: search with uppercase to demonstrate case-insensitivity
console.log(searchNotes("ASSIGNMENT"));
// Expected output: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]


console.log("\n--- Testing longestNote ---");
// Normal case: find the longest note from initial list (note id 3, 33 characters)
console.log(longestNote());
// Expected output: { id: 3, text: "Email the project report to Grace", category: "work" }

// Edge case: empty notes array returns null
const backupNotes = notes;
notes = [];
console.log(longestNote());
// Expected output: null
notes = backupNotes; // restore notes array


console.log("\n--- Testing countByCategory ---");
// Normal case: count categories in starting notes
console.log(countByCategory());
// Expected output: { personal: 2, study: 2, work: 1 }

// Edge case: count when notes array is empty
notes = [];
console.log(countByCategory());
// Expected output: {}
notes = backupNotes; // restore notes array


console.log("\n--- Testing getSummary ---");
// Normal case: summary for 5 notes (plural "notes")
console.log(getSummary());
// Expected output: "5 notes: 2 personal, 1 work, 2 study."

// Edge case: summary for exactly 1 note (singular "note")
notes = [{ id: 10, text: "Solo note", category: "personal" }];
console.log(getSummary());
// Expected output: "1 note: 1 personal."
notes = backupNotes; // restore notes array

// Edge case: summary for 0 notes
notes = [];
console.log(getSummary());
// Expected output: "0 notes."
notes = backupNotes; // restore notes array


console.log("\n--- Testing isDuplicate ---");
// Normal case: duplicate check for existing text with different casing
console.log(isDuplicate("buy milk and bread"));
// Expected output: true

// Edge case: duplicate check with surrounding extra spaces and uppercase
console.log(isDuplicate("   CALL MUM   "));
// Expected output: true

// Normal case: text that does not exist in notes
console.log(isDuplicate("Go grocery shopping"));
// Expected output: false


console.log("\n--- Testing addNote ---");
// Normal case: adding a valid note with category "work"
console.log(addNote("Prepare presentation slides", "work"));
// Expected output: true

// Edge case: attempting to add a duplicate note (ignoring extra spaces & case)
console.log(addNote("  BUY MILK AND BREAD  ", "personal"));
// Expected output: false (logs reason: "Failed to add note: A note with the text "BUY MILK AND BREAD" already exists.")

// Edge case: attempting to add with an invalid category
console.log(addNote("Drink 2L of water", "health"));
// Expected output: false (logs reason: "Failed to add note: Invalid category "health". Must be personal, work, or study.")

// Edge case: attempting to add empty string (less than 1 character)
console.log(addNote("", "study"));
// Expected output: false (logs reason: "Failed to add note: Note text must be between 1 and 200 characters.")

// Edge case: attempting to add text over 200 characters
console.log(addNote("A".repeat(201), "personal"));
// Expected output: false (logs reason: "Failed to add note: Note text must be between 1 and 200 characters.")

// Final summary check to verify newly added note is accounted for
console.log("\n--- Final getSummary after additions ---");
console.log(getSummary());
// Expected output: "6 notes: 2 personal, 2 work, 2 study."
