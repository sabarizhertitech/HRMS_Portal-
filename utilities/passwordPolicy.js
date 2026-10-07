// utilities/passwordPolicy.js

/**
 * PASSWORD POLICY — Ertitech Solutions
 *
 * Rules enforced:
 *  - Minimum 12 characters
 *  - At least one uppercase letter (A-Z)
 *  - At least one lowercase letter (a-z)
 *  - At least one numeric digit (0-9)
 *  - At least one special character from the full allowed set:
 *      ! @ # $ % ^ & * ? ~ - _ + = | [ ] { } ( ) ; : ' " , . < > / \
 *
 * FIX: Broadened special character set from [!@#$%^&*] to cover
 *      all characters listed in Ertitech Password Policy Section 2.
 */

const SPECIAL_CHAR_REGEX = /[!@#$%^&*?~\-_+=|[\]{};:'",./<>\\()]/;

const validatePassword = (password) => {
  const errors = [];

  if (!password || typeof password !== "string") {
    errors.push("Password is required");
    return errors;
  }

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter (A-Z)");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter (a-z)");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number (0-9)");
  }

  if (!SPECIAL_CHAR_REGEX.test(password)) {
    errors.push(
      "Password must contain at least one special character (e.g. ! @ # $ % & * ? ~ - _ + = etc.)"
    );
  }

  return errors; // empty array = valid
};

module.exports = { validatePassword, SPECIAL_CHAR_REGEX };