/**
 * Day 5 Assignment: User Directory
 * Script to fetch user list from JSONPlaceholder API and filter by name.
 */

// DOM Elements
const loadUsersButton = document.getElementById('load-users');
const filterInput = document.getElementById('filter-input');
const statusParagraph = document.getElementById('status');
const usersList = document.getElementById('users-list');

// Stored array of loaded users
let users = [];

/**
 * Draws an array of users into the #users-list element using
 * document.createElement and textContent.
 * @param {Array} list - Array of user objects to render
 */
function renderUsers(list) {
  // Clear the existing list contents
  usersList.innerHTML = '';

  // When nothing matches the filter
  if (list.length === 0) {
    if (users.length > 0 || filterInput.value.trim() !== '') {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'no-matches';
      emptyItem.textContent = 'No users match your filter.';
      usersList.appendChild(emptyItem);
    }
    return;
  }

  // Iterate over users and construct DOM nodes using createElement and textContent
  list.forEach((user) => {
    const li = document.createElement('li');

    // User Name
    const nameHeading = document.createElement('div');
    nameHeading.className = 'user-name';
    nameHeading.textContent = user.name;

    // Container for details
    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'user-details';

    // Email
    const emailSpan = document.createElement('span');
    emailSpan.textContent = `Email: ${user.email}`;

    // City
    const citySpan = document.createElement('span');
    const city = user.address && user.address.city ? user.address.city : 'Unknown';
    citySpan.textContent = `City: ${city}`;

    // Company Name
    const companySpan = document.createElement('span');
    const companyName = user.company && user.company.name ? user.company.name : 'Unknown';
    companySpan.textContent = `Company: ${companyName}`;

    // Assemble elements
    detailsContainer.appendChild(emailSpan);
    detailsContainer.appendChild(citySpan);
    detailsContainer.appendChild(companySpan);

    li.appendChild(nameHeading);
    li.appendChild(detailsContainer);

    usersList.appendChild(li);
  });
}

/**
 * Fetches users from JSONPlaceholder API with error handling
 * and loading status management.
 */
async function loadUsers() {
  // Disable button and display loading status
  loadUsersButton.disabled = true;
  statusParagraph.textContent = 'Loading users...';
  usersList.innerHTML = '';
  filterInput.value = '';

  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users');

    // Check if HTTP response status is in the 200-299 range
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    users = data;
    renderUsers(users);
    statusParagraph.textContent = `Loaded ${users.length} users successfully.`;
  } catch (error) {
    console.error('Error fetching users:', error);
    statusParagraph.textContent = `Failed to load users: ${error.message}`;
    users = [];
    renderUsers(users);
  } finally {
    // Re-enable button regardless of success or failure
    loadUsersButton.disabled = false;
  }
}

// Event Listeners
loadUsersButton.addEventListener('click', loadUsers);

// Listen for input event on filter input (case-insensitive search on name without making a new request)
filterInput.addEventListener('input', (event) => {
  const query = event.target.value.toLowerCase().trim();
  const filteredList = users.filter((user) =>
    user.name.toLowerCase().includes(query)
  );
  renderUsers(filteredList);
});
