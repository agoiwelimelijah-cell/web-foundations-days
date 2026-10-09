# Library Books REST API Design

This document specifies the RESTful API design for the library's `books` resource. It outlines endpoints, standard HTTP verbs, resource paths, request schemas, success status codes, and error-handling semantics.

---

## Endpoints

### 1. List All Books
* **Method**: `GET`
* **Path**: `/books`
* **Description**: Retrieves a list of all books available in the library catalog.
* **Request Body**: None
* **Success Status Code**: `200 OK`

### 2. Get a Single Book
* **Method**: `GET`
* **Path**: `/books/{id}`
* **Description**: Retrieves full details of a specific book by its unique numeric or string identifier.
* **Request Body**: None
* **Success Status Code**: `200 OK`

### 3. Create a New Book
* **Method**: `POST`
* **Path**: `/books`
* **Description**: Adds a new book to the library catalog with provided metadata.
* **Request Body**:
```json
{
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "isbn": "978-0132350884",
  "publishedYear": 2008,
  "genre": "Software Engineering",
  "totalCopies": 5
}
```
* **Success Status Code**: `201 Created`

### 4. Update an Existing Book
* **Method**: `PUT`
* **Path**: `/books/{id}`
* **Description**: Replaces and updates the entire record of an existing book identified by its ID.
* **Request Body**:
```json
{
  "title": "Clean Code: A Handbook of Agile Software Craftsmanship",
  "author": "Robert C. Martin",
  "isbn": "978-0132350884",
  "publishedYear": 2008,
  "genre": "Software Engineering",
  "totalCopies": 8
}
```
* **Success Status Code**: `200 OK`

### 5. Delete a Book
* **Method**: `DELETE`
* **Path**: `/books/{id}`
* **Description**: Permanently removes a book from the library catalog using its ID.
* **Request Body**: None
* **Success Status Code**: `204 No Content`

### 6. List Books by Author (Query Parameter)
* **Method**: `GET`
* **Path**: `/books?author={authorName}`
* **Description**: Retrieves all books authored by a specific author using the `author` query parameter.
* **Request Body**: None
* **Success Status Code**: `200 OK`

---

## HTTP Error Codes

### 400 Bad Request
* **Meaning**: The request cannot be processed due to invalid client syntax, malformed JSON, or missing required attributes.
* **Example Scenario**: A client submits a `POST /books` request with the required `title` field missing or an invalid data type (e.g., `publishedYear: "not-a-year"`).
* **Sample Response**:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Field 'title' is required and 'publishedYear' must be a valid integer."
}
```

### 404 Not Found
* **Meaning**: The server cannot find the requested resource identified by the provided URI or path parameter.
* **Example Scenario**: A client requests `GET /books/999` or `DELETE /books/999`, but no book with ID `999` exists in the library catalog.
* **Sample Response**:
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Book with ID 999 was not found."
}
```

### 500 Internal Server Error
* **Meaning**: An unexpected server-side exception or infrastructure failure prevented the server from completing the request.
* **Example Scenario**: The database service goes offline unexpectedly, or an unhandled exception occurs in the database driver while querying book records.
* **Sample Response**:
```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "An unexpected error occurred while communicating with the database. Please try again later."
}
```
