"use strict";

/**
 * ============================================================================
 * FORM VALIDATION TESTING ANALYZER & RUNNER
 * ============================================================================
 * 
 * Inspects all web forms across crawled pages (Contact Us, Registration,
 * Login, Enquiry, Feedback, Support, Application, etc.), infers field
 * validation rules, generates valid and invalid test inputs, and safely
 * executes browser-side HTML5 Constraint Validation API checks without
 * triggering form submissions or creating server-side side-effects.
 */

// ============================================================================
// 1. SEMANTIC INTENT & FIELD TYPE INFERENCE
// ============================================================================

/**
 * Determines the semantic role of an input field based on its metadata.
 */
function inferSemanticFieldType({ name = "", id = "", type = "", placeholder = "", label = "", autocomplete = "" }) {
  const t = (type || "").toLowerCase().trim();
  const meta = `${name} ${id} ${placeholder} ${label} ${autocomplete}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[-_.:]/g, " ");

  if (t === "email" || /\b(email|mail|e mail)\b/i.test(meta)) {
    return "email";
  }

  if (t === "tel" || /\b(phone|mobile|cell|telephone|contact num|whatsapp|tel)\b/i.test(meta)) {
    return "phone";
  }

  if (t === "password" || /\b(password|passwd|pwd|passcode)\b/i.test(meta)) {
    return "password";
  }

  if (t === "url" || /\b(website|web url|homepage|site url|linkedin|portfolio)\b/i.test(meta)) {
    return "url";
  }

  if (t === "number" || /\b(age|quantity|qty|amount|zip|zipcode|pincode|postal)\b/i.test(meta)) {
    return "number";
  }

  if (["date", "datetime-local", "time", "month", "week"].includes(t) || /\b(birth date|dob|appointment date)\b/i.test(meta)) {
    return "date";
  }

  if (t === "textarea" || /\b(message|comment|feedback|query|enquiry|description|details|notes|body|problem)\b/i.test(meta)) {
    return "message";
  }

  if (/\b(subject|topic|title|reason|inquiry title|heading)\b/i.test(meta)) {
    return "subject";
  }

  if (/\b(name|fullname|firstname|lastname|username|first name|last name|full name|user name|contact name|author|fname|lname|surname|person)\b/i.test(meta) &&
      !/\b(company|firm|org|file)\b/i.test(meta)) {
    return "name";
  }

  if (t === "checkbox") return "checkbox";
  if (t === "radio") return "radio";
  if (t === "select" || t === "select-one" || t === "select-multiple") return "select";

  return "text";
}

/**
 * Classifies the form purpose (Contact Us, Registration, Login, Enquiry, Feedback, etc.).
 */
function inferFormType({ id = "", name = "", action = "", text = "", heading = "" }) {
  const combined = `${id} ${name} ${action} ${text} ${heading}`.toLowerCase();

  if (/\b(login|signin|sign-in|log-in|auth)\b/i.test(combined)) return "login";
  if (/\b(register|registration|signup|sign-up|create[-_]?account|join)\b/i.test(combined)) return "registration";
  if (/\b(contact|contact[-_]?us|reach[-_]?us|get[-_]?in[-_]?touch)\b/i.test(combined)) return "contact";
  if (/\b(enquiry|inquiry|quote|request[-_]?quote|estimation)\b/i.test(combined)) return "enquiry";
  if (/\b(feedback|review|rate[-_]?us|survey|testimonial)\b/i.test(combined)) return "feedback";
  if (/\b(support|help|ticket|issue|helpdesk|service[-_]?desk)\b/i.test(combined)) return "support";
  if (/\b(apply|application|career|job|internship|admission|candidate)\b/i.test(combined)) return "application";
  if (/\b(subscribe|newsletter|mailing[-_]?list)\b/i.test(combined)) return "newsletter";
  if (/\b(search|find|query)\b/i.test(combined)) return "search";

  return "general";
}

// ============================================================================
// 2. TEST CASE GENERATOR
// ============================================================================

/**
 * Builds test cases (valid and invalid) for a field according to its semantic role and HTML attributes.
 */
function generateFieldTestCases(field) {
  const tests = [];
  const {
    semanticType,
    required = false,
    pattern = null,
    minLength = null,
    maxLength = null,
    min = null,
    max = null,
    type = "text"
  } = field;

  // Skip non-interactive fields
  if (["hidden", "submit", "button", "reset", "image"].includes(type)) {
    return tests;
  }

  // Helper to add test
  const addTest = (testName, inputValue, expected, description) => {
    tests.push({
      testName,
      inputValue: String(inputValue !== null && inputValue !== undefined ? inputValue : ""),
      expected, // "Accept" or "Reject"
      description,
    });
  };

  // 1. Required Field Empty Test
  if (required) {
    addTest("empty_required", "", "Reject", "Empty input is rejected when field is required");
  }

  // 2. Type-Specific Validation Rules
  switch (semanticType) {
    case "name":
      // Valid name
      addTest("valid_name", "John Doe", "Accept", "Valid text input is accepted");
      // Numeric-only rejected for name
      addTest("numeric_only_name", "12345", "Reject", "Numeric-only input is rejected for name field");
      // Invalid characters rejected if text-only
      addTest("special_chars_name", "John!@#$%", "Reject", "Invalid symbols/characters rejected for name field");
      break;

    case "email":
      // Valid email
      addTest("valid_email", "test@example.com", "Accept", "A valid email address is accepted");
      // Invalid email formats
      addTest("invalid_email_no_at", "test", "Reject", "Missing @ and domain format is rejected");
      addTest("invalid_email_trailing_at", "test@", "Reject", "Trailing @ without domain is rejected");
      addTest("invalid_email_no_user", "@example.com", "Reject", "Missing user local-part is rejected");
      addTest("invalid_email_domain_only", "test.com", "Reject", "Domain-only without @ is rejected");
      break;

    case "phone":
      // Valid phone numbers
      addTest("valid_phone", "9876543210", "Accept", "Valid standard phone number is accepted");
      // Alphabetic characters rejected
      addTest("alpha_in_phone", "abc1234567", "Reject", "Alphabetic characters are rejected for phone number");
      addTest("letters_only_phone", "invalidphone", "Reject", "Alphabetic text is rejected for phone number");
      // Length violations if specified
      if (minLength && minLength > 5) {
        addTest("phone_too_short", "123", "Reject", `Phone number shorter than minlength (${minLength}) is rejected`);
      }
      break;

    case "subject":
      addTest("valid_subject", "General Inquiry Regarding Services", "Accept", "Valid text subject is accepted");
      if (minLength && minLength > 2) {
        addTest("subject_too_short", "Hi", "Reject", `Subject shorter than minlength (${minLength}) is rejected`);
      }
      if (maxLength && maxLength > 10) {
        addTest("subject_too_long", "A".repeat(maxLength + 20), "Reject", `Subject exceeding maxlength (${maxLength}) is rejected`);
      }
      break;

    case "message":
      addTest("valid_message", "Hello, I would like to request more information about your platform and services.", "Accept", "Valid text message is accepted");
      if (minLength && minLength > 5) {
        addTest("message_too_short", "Hi", "Reject", `Message shorter than minlength (${minLength}) is rejected`);
      }
      if (maxLength && maxLength > 10) {
        addTest("message_too_long", "A".repeat(maxLength + 20), "Reject", `Message exceeding maxlength (${maxLength}) is rejected`);
      }
      break;

    case "url":
      addTest("valid_url", "https://example.com", "Accept", "Valid URL address is accepted");
      addTest("invalid_url", "not-a-valid-url", "Reject", "Malformed URL format is rejected");
      break;

    case "number":
      addTest("valid_number", "42", "Accept", "Valid numeric input is accepted");
      addTest("invalid_number_alpha", "not_a_number", "Reject", "Non-numeric string is rejected");
      if (min !== null && !isNaN(Number(min))) {
        addTest("number_underflow", String(Number(min) - 1), "Reject", `Value below minimum (${min}) is rejected`);
      }
      if (max !== null && !isNaN(Number(max))) {
        addTest("number_overflow", String(Number(max) + 1), "Reject", `Value above maximum (${max}) is rejected`);
      }
      break;

    case "password":
      addTest("valid_password", "P@ssw0rd!Secure2026", "Accept", "Valid standard password is accepted");
      if (minLength && minLength > 3) {
        addTest("password_too_short", "12", "Reject", `Password shorter than minlength (${minLength}) is rejected`);
      }
      break;

    case "date":
      addTest("valid_date", "2026-06-15", "Accept", "Valid ISO date format is accepted");
      addTest("invalid_date", "not-a-date", "Reject", "Malformed date string is rejected");
      break;

    case "select":
    case "radio":
    case "checkbox":
      // Handled natively or as general controls
      break;

    default: // generic text
      addTest("valid_text", "Sample Valid Input", "Accept", "Standard valid text is accepted");
      if (minLength && minLength > 2) {
        addTest("text_too_short", "A", "Reject", `Input shorter than minlength (${minLength}) is rejected`);
      }
      if (maxLength && maxLength > 10) {
        addTest("text_too_long", "A".repeat(maxLength + 10), "Reject", `Input exceeding maxlength (${maxLength}) is rejected`);
      }
      break;
  }

  // 3. Custom pattern testing if present
  if (pattern) {
    try {
      const regex = new RegExp(pattern);
      if (!regex.test("INVALID_TEST_VALUE_!@#$%^&*()")) {
        addTest("pattern_mismatch", "INVALID_TEST_VALUE_!@#$%^&*()", "Reject", "Value violating HTML pattern regex is rejected");
      }
    } catch {
      // Invalid pattern syntax in HTML; skip custom regex test
    }
  }

  return tests;
}

// ============================================================================
// 3. IN-BROWSER SAFE VALIDATION RUNNER (PLAYWRIGHT)
// ============================================================================

/**
 * Injected script executed within Playwright page context.
 * Performs browser-side inspection, tests fields, and restores original values.
 * Form submission is strictly prevented.
 */
async function runInBrowserFormValidation(pageInstance, pageUrl, pageTitle) {
  return await pageInstance.evaluate(async ({ pageUrl, pageTitle }) => {
    // ------------------------------------------------------------------------
    // Helper: Normalize Whitespace
    // ------------------------------------------------------------------------
    const cleanText = (t) => (t || "").replace(/\s+/g, " ").trim();

    // ------------------------------------------------------------------------
    // Helper: Find Label for an Element
    // ------------------------------------------------------------------------
    const getFieldLabel = (el) => {
      // 1. Explicit <label for="id">
      if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl && cleanText(lbl.innerText)) return cleanText(lbl.innerText);
      }
      // 2. Enclosing <label>
      const parentLabel = el.closest("label");
      if (parentLabel && cleanText(parentLabel.innerText)) {
        return cleanText(parentLabel.innerText);
      }
      // 3. aria-label
      if (el.getAttribute("aria-label")) {
        return cleanText(el.getAttribute("aria-label"));
      }
      // 4. aria-labelledby
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const target = document.getElementById(labelledBy);
        if (target && cleanText(target.innerText)) return cleanText(target.innerText);
      }
      // 5. Preceding sibling or parent heading
      const prev = el.previousElementSibling;
      if (prev && ["SPAN", "LABEL", "P", "STRONG", "B", "H4", "H5"].includes(prev.tagName)) {
        const txt = cleanText(prev.innerText);
        if (txt && txt.length < 50) return txt;
      }
      // 6. Placeholder
      if (el.placeholder) return cleanText(el.placeholder);
      // 7. Name or ID
      return el.name || el.id || "";
    };

    // ------------------------------------------------------------------------
    // Helper: Infer Semantic Type In-Browser
    // ------------------------------------------------------------------------
    const inferSemanticType = (name, id, type, placeholder, label, autocomplete) => {
      const t = (type || "").toLowerCase().trim();
      const meta = `${name} ${id} ${placeholder} ${label} ${autocomplete}`
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/[-_.:]/g, " ");

      if (t === "email" || /\b(email|mail|e mail)\b/i.test(meta)) return "email";
      if (t === "tel" || /\b(phone|mobile|cell|telephone|contact num|whatsapp|tel)\b/i.test(meta)) return "phone";
      if (t === "password" || /\b(password|passwd|pwd|passcode)\b/i.test(meta)) return "password";
      if (t === "url" || /\b(website|web url|homepage|site url|linkedin|portfolio)\b/i.test(meta)) return "url";
      if (t === "number" || /\b(age|quantity|qty|amount|zip|zipcode|pincode|postal)\b/i.test(meta)) return "number";
      if (["date", "datetime-local", "time", "month", "week"].includes(t) || /\b(birth date|dob|appointment date)\b/i.test(meta)) return "date";
      if (t === "textarea" || /\b(message|comment|feedback|query|enquiry|description|details|notes|body|problem)\b/i.test(meta)) return "message";
      if (/\b(subject|topic|title|reason|inquiry title|heading)\b/i.test(meta)) return "subject";
      if (/\b(name|fullname|firstname|lastname|username|first name|last name|full name|user name|contact name|author|fname|lname|surname|person)\b/i.test(meta) &&
          !/\b(company|firm|org|file)\b/i.test(meta)) return "name";
      if (t === "checkbox") return "checkbox";
      if (t === "radio") return "radio";
      if (t === "select" || t === "select-one" || t === "select-multiple") return "select";
      return "text";
    };

    // ------------------------------------------------------------------------
    // Helper: Build Expected Validation Summary String
    // ------------------------------------------------------------------------
    const getExpectedValidationDesc = (semanticType, required, pattern, minLength, maxLength) => {
      const parts = [];
      if (required) parts.push("Required");
      switch (semanticType) {
        case "name": parts.push("Text only, non-numeric"); break;
        case "email": parts.push("Valid email format (user@domain.tld)"); break;
        case "phone": parts.push("Valid numeric phone digits"); break;
        case "url": parts.push("Valid URL protocol and domain"); break;
        case "number": parts.push("Valid numeric number"); break;
        case "password": parts.push("Secure password string"); break;
        case "subject": parts.push("Text subject line"); break;
        case "message": parts.push("Text body content"); break;
        default: parts.push("Standard text"); break;
      }
      if (minLength) parts.push(`Min length: ${minLength}`);
      if (maxLength) parts.push(`Max length: ${maxLength}`);
      if (pattern) parts.push(`Pattern: ${pattern}`);
      return parts.join(", ");
    };

    // ------------------------------------------------------------------------
    // Helper: Generate In-Browser Test Cases
    // ------------------------------------------------------------------------
    const getTestsForField = (field) => {
      const tests = [];
      const add = (testName, inputValue, expected, description) => {
        tests.push({ testName, inputValue: String(inputValue ?? ""), expected, description });
      };

      if (field.required) {
        add("empty_required", "", "Reject", "Empty input is rejected when field is required");
      }

      switch (field.semanticType) {
        case "name":
          add("valid_name", "John Doe", "Accept", "Valid text input is accepted");
          add("numeric_only_name", "12345", "Reject", "Numeric-only input is rejected for name");
          add("special_chars_name", "John!@#$%", "Reject", "Special characters rejected for text-only name");
          break;

        case "email":
          add("valid_email", "test@example.com", "Accept", "Valid email address is accepted");
          add("invalid_email_no_domain", "test@", "Reject", "Missing domain is rejected");
          add("invalid_email_no_at", "test.com", "Reject", "Missing @ is rejected");
          add("invalid_email_no_user", "@example.com", "Reject", "Missing username part is rejected");
          break;

        case "phone":
          add("valid_phone", "9876543210", "Accept", "Valid phone number is accepted");
          add("alpha_in_phone", "abc1234567", "Reject", "Alphabetic characters are rejected for phone");
          if (field.minLength && field.minLength > 5) {
            add("phone_too_short", "123", "Reject", `Phone number shorter than minlength (${field.minLength}) rejected`);
          }
          break;

        case "subject":
          add("valid_subject", "General Inquiry Regarding Services", "Accept", "Valid text subject is accepted");
          if (field.minLength && field.minLength > 2) {
            add("subject_too_short", "Hi", "Reject", `Subject shorter than minlength (${field.minLength}) rejected`);
          }
          break;

        case "message":
          add("valid_message", "Hello, I would like to request more information about your platform.", "Accept", "Valid text message is accepted");
          if (field.minLength && field.minLength > 5) {
            add("message_too_short", "Hi", "Reject", `Message shorter than minlength (${field.minLength}) rejected`);
          }
          break;

        case "url":
          add("valid_url", "https://example.com", "Accept", "Valid URL is accepted");
          add("invalid_url", "not-a-valid-url", "Reject", "Malformed URL is rejected");
          break;

        case "number":
          add("valid_number", "42", "Accept", "Valid number is accepted");
          add("invalid_number", "not_a_number", "Reject", "Non-numeric string is rejected");
          break;

        case "password":
          add("valid_password", "P@ssw0rd!Secure2026", "Accept", "Valid password is accepted");
          if (field.minLength && field.minLength > 3) {
            add("password_too_short", "12", "Reject", `Password shorter than minlength (${field.minLength}) rejected`);
          }
          break;

        default:
          add("valid_text", "Sample Input", "Accept", "Standard valid text is accepted");
          break;
      }

      if (field.pattern) {
        add("pattern_mismatch", "INV_#$@!999", "Reject", "Input violating pattern regex is rejected");
      }

      return tests;
    };

    // ------------------------------------------------------------------------
    // Form Detection (Forms and Form-Like Containers)
    // ------------------------------------------------------------------------
    const formElements = Array.from(document.querySelectorAll("form"));
    
    // Also detect standalone form containers (divs with role="form" or containing inputs + submit)
    const standaloneContainers = Array.from(document.querySelectorAll("[role='form'], .contact-form, .inquiry-form, .login-form, .register-form"))
      .filter(el => el.tagName !== "FORM" && el.querySelectorAll("input, textarea, select").length > 0);

    const allContainers = [...formElements, ...standaloneContainers];

    const reportedForms = [];

    allContainers.forEach((formEl, formIdx) => {
      const formId = formEl.id || `form-${formIdx + 1}`;
      const formName = formEl.getAttribute("name") || formId;
      const formAction = formEl.getAttribute("action") || pageUrl;
      const formMethod = (formEl.getAttribute("method") || "GET").toUpperCase();

      // Heading or surrounding context text
      const headingEl = formEl.querySelector("h1, h2, h3, h4, h5, legend");
      const headingText = headingEl ? cleanText(headingEl.innerText) : "";
      const surroundingText = cleanText(formEl.innerText).slice(0, 300);

      // Infer Form Type
      const formTypeMeta = `${formId} ${formName} ${formAction} ${headingText} ${surroundingText}`.toLowerCase();
      let formType = "general";
      if (/\b(login|signin|sign-in|log-in|auth)\b/i.test(formTypeMeta)) formType = "login";
      else if (/\b(register|registration|signup|sign-up|join|create[-_]?account)\b/i.test(formTypeMeta)) formType = "registration";
      else if (/\b(contact|reach[-_]?us|get[-_]?in[-_]?touch)\b/i.test(formTypeMeta)) formType = "contact";
      else if (/\b(enquiry|inquiry|quote|estimate)\b/i.test(formTypeMeta)) formType = "enquiry";
      else if (/\b(feedback|review|survey|rate[-_]?us)\b/i.test(formTypeMeta)) formType = "feedback";
      else if (/\b(support|help|ticket|issue)\b/i.test(formTypeMeta)) formType = "support";
      else if (/\b(apply|application|career|job|internship)\b/i.test(formTypeMeta)) formType = "application";
      else if (/\b(subscribe|newsletter)\b/i.test(formTypeMeta)) formType = "newsletter";
      else if (/\b(search)\b/i.test(formTypeMeta)) formType = "search";

      // Collect Form Fields
      const inputElements = Array.from(formEl.querySelectorAll("input, textarea, select"));
      const testableFields = [];

      inputElements.forEach((inputEl, fieldIdx) => {
        const rawType = (inputEl.type || inputEl.tagName).toLowerCase();
        if (["hidden", "submit", "button", "reset", "image"].includes(rawType)) return;

        const fieldName = inputEl.name || inputEl.id || `field-${fieldIdx + 1}`;
        const fieldId = inputEl.id || "";
        const placeholder = inputEl.placeholder || "";
        const label = getFieldLabel(inputEl);
        const autocomplete = inputEl.autocomplete || "";
        const required = inputEl.hasAttribute("required") || inputEl.required === true;
        const pattern = inputEl.getAttribute("pattern") || null;
        const minLength = inputEl.minLength > 0 ? inputEl.minLength : (parseInt(inputEl.getAttribute("minlength"), 10) || null);
        const maxLength = inputEl.maxLength > 0 && inputEl.maxLength < 500000 ? inputEl.maxLength : (parseInt(inputEl.getAttribute("maxlength"), 10) || null);
        const min = inputEl.getAttribute("min") || null;
        const max = inputEl.getAttribute("max") || null;
        const step = inputEl.getAttribute("step") || null;
        const inputMode = inputEl.getAttribute("inputmode") || null;
        const disabled = inputEl.disabled || inputEl.hasAttribute("disabled");
        const readOnly = inputEl.readOnly || inputEl.hasAttribute("readonly");

        const semanticType = inferSemanticType(fieldName, fieldId, rawType, placeholder, label, autocomplete);
        const expectedValidation = getExpectedValidationDesc(semanticType, required, pattern, minLength, maxLength);

        testableFields.push({
          element: inputEl,
          meta: {
            fieldName,
            fieldId,
            fieldType: rawType,
            label,
            placeholder,
            required,
            semanticType,
            expectedValidation,
            htmlValidationAttrs: {
              required,
              pattern,
              minLength,
              maxLength,
              min,
              max,
              step,
              inputMode,
              autocomplete,
              disabled,
              readOnly,
            },
            disabled,
            readOnly,
          }
        });
      });

      if (testableFields.length === 0) return;

      const fieldResults = [];
      let formPassCount = 0;
      let formFailCount = 0;
      let formTotalTests = 0;

      // ----------------------------------------------------------------------
      // Execute Safe Browser-Side Validation Checks Per Field
      // ----------------------------------------------------------------------
      testableFields.forEach(({ element, meta }) => {
        if (meta.disabled || meta.readOnly) {
          fieldResults.push({
            ...meta,
            requiredDisplay: meta.required ? "Yes" : "No",
            validTestValue: "N/A",
            validTestResult: "N/A",
            invalidTestValue: "N/A",
            invalidTestResult: "N/A",
            validationStatus: "NOT_TESTED",
            overallFieldStatus: "NOT_TESTED",
            validationMessage: "Field is disabled or read-only",
            tests: [],
          });
          return;
        }

        const originalValue = element.value || "";
        const tests = getTestsForField(meta);
        const testResults = [];
        let validTestSummary = null;
        let invalidTestSummary = null;
        let fieldFailed = false;

        tests.forEach((t) => {
          formTotalTests++;
          // Set value
          element.value = t.inputValue;

          // Dispatch standard interaction events
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.dispatchEvent(new Event("blur", { bubbles: true }));

          // 1. Browser HTML5 Constraint Validation
          let isNativeValid = true;
          let validationMessage = "";
          let validityState = {};

          try {
            if (typeof element.checkValidity === "function") {
              isNativeValid = element.checkValidity();
            }
            if (element.validity) {
              validityState = {
                valid: element.validity.valid,
                valueMissing: element.validity.valueMissing,
                typeMismatch: element.validity.typeMismatch,
                patternMismatch: element.validity.patternMismatch,
                tooShort: element.validity.tooShort,
                tooLong: element.validity.tooLong,
                rangeUnderflow: element.validity.rangeUnderflow,
                rangeOverflow: element.validity.rangeOverflow,
                badInput: element.validity.badInput,
                customError: element.validity.customError,
              };
              isNativeValid = element.validity.valid;
            }
            validationMessage = element.validationMessage || "";
          } catch { }

          // 2. Custom JS/CSS Validation State Detection
          const hasErrorClass = element.classList.contains("is-invalid") ||
                                element.classList.contains("error") ||
                                element.classList.contains("invalid") ||
                                element.classList.contains("has-error") ||
                                element.getAttribute("aria-invalid") === "true";

          // 3. Semantic Validation Logic (when HTML5 doesn't restrict by default)
          // For Name: numbers or scripts should be rejected
          // For Phone: alphabetic chars should be rejected
          let semanticRejected = false;
          if (meta.semanticType === "name" && t.testName === "numeric_only_name" && /^\d+$/.test(t.inputValue)) {
            // A name field should reject numeric-only if pattern/type or validation is configured
            if (!meta.htmlValidationAttrs.pattern && isNativeValid && !hasErrorClass) {
              // Website fails to reject numeric-only names
              semanticRejected = false;
            } else {
              semanticRejected = true;
            }
          }

          if (meta.semanticType === "phone" && (t.testName === "alpha_in_phone" || t.testName === "letters_only_phone") && /[a-zA-Z]/.test(t.inputValue)) {
            if (!meta.htmlValidationAttrs.pattern && meta.fieldType !== "tel" && isNativeValid && !hasErrorClass) {
              // Website allows alphabetic letters in phone field
              semanticRejected = false;
            } else if (meta.fieldType === "tel" && isNativeValid && !meta.htmlValidationAttrs.pattern && !hasErrorClass) {
              // HTML5 tel type by spec does not enforce syntax without pattern, but website validation should
              semanticRejected = false;
            } else {
              semanticRejected = true;
            }
          }

          // Determine Actual browser/site decision: "Accepted" vs "Rejected"
          let actual = "Accepted";
          if (!isNativeValid || hasErrorClass || semanticRejected) {
            actual = "Rejected";
          }

          // Determine test pass/fail
          const passed = (t.expected === "Accept" && actual === "Accepted") ||
                         (t.expected === "Reject" && actual === "Rejected");

          const status = passed ? "PASS" : "FAIL";

          if (!passed) {
            fieldFailed = true;
            formFailCount++;
          } else {
            formPassCount++;
          }

          const resultItem = {
            testName: t.testName,
            description: t.description,
            inputValue: t.inputValue,
            expected: t.expected,
            actual,
            status,
            passed,
            validationMessage,
            validityState,
          };

          testResults.push(resultItem);

          if (t.expected === "Accept" && !validTestSummary) {
            validTestSummary = `${t.inputValue} (${actual})`;
          }
          if (t.expected === "Reject" && !invalidTestSummary) {
            invalidTestSummary = `${t.inputValue || "Empty"} (${actual})`;
          }
        });

        // Restore original value
        element.value = originalValue;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));

        const overallFieldStatus = testResults.length === 0 ? "NOT_TESTED" : (fieldFailed ? "FAIL" : "PASS");

        fieldResults.push({
          ...meta,
          requiredDisplay: meta.required ? "Yes" : "No",
          validTestValue: validTestSummary || "None",
          validTestResult: fieldFailed ? "Failed Rule" : "Accepted",
          invalidTestValue: invalidTestSummary || "None",
          invalidTestResult: fieldFailed ? "Accepted (Unenforced)" : "Rejected",
          validationStatus: overallFieldStatus,
          overallFieldStatus,
          validationMessage: testResults.find(r => r.validationMessage)?.validationMessage || "",
          tests: testResults,
        });
      });

      // Compute Form Overall Status
      let overallFormStatus = "PASS";
      const totalFields = fieldResults.length;
      const failedFields = fieldResults.filter(f => f.overallFieldStatus === "FAIL").length;
      const notTestedFields = fieldResults.filter(f => f.overallFieldStatus === "NOT_TESTED").length;

      if (totalFields === 0 || notTestedFields === totalFields) {
        overallFormStatus = "NOT_TESTED";
      } else if (failedFields > 0) {
        overallFormStatus = "FAIL";
      } else if (notTestedFields > 0) {
        overallFormStatus = "PARTIAL";
      }

      reportedForms.push({
        pageUrl,
        pageTitle,
        formId,
        formName,
        formAction,
        formMethod,
        action: formAction,
        method: formMethod,
        formType,
        overallStatus: overallFormStatus,
        totalFields,
        totalTests: formTotalTests,
        passedTests: formPassCount,
        failedTests: formFailCount,
        fields: fieldResults,
        inputs: fieldResults.map(f => ({
          name: f.fieldName || f.name || "",
          type: f.fieldType || f.type || "text",
        })),
      });
    });

    return reportedForms;
  }, { pageUrl, pageTitle });
}

// ============================================================================
// 4. MAIN EXPORTED DETECTION & VALIDATION FUNCTION
// ============================================================================

/**
 * Detects and tests all forms on a page using Playwright.
 * 
 * @param {object} pageInstance Playwright page instance.
 * @param {string} pageUrl Current page URL.
 * @param {string} pageTitle Current page Title.
 * @param {object} options Optional settings.
 * @returns {Promise<Array>} List of tested forms with complete field results.
 */
async function detectAndTestPageForms(pageInstance, pageUrl, pageTitle, options = {}) {
  try {
    if (!pageInstance) return [];

    const forms = await runInBrowserFormValidation(pageInstance, pageUrl, pageTitle || "");
    return forms || [];
  } catch (err) {
    console.error(`[FormValidator] Error inspecting forms on ${pageUrl}:`, err.message);
    return [];
  }
}

// ============================================================================
// 5. AGGREGATOR FOR OVERALL CRAWL INTELLIGENCE REPORT
// ============================================================================

/**
 * Aggregates all form validation results across all crawled pages.
 * Produces structured summaries, table rows, and issues for the final report.
 * 
 * @param {Array} pages Array of CrawlPage documents/objects.
 * @returns {object} Form validation summary and issue list.
 */
function aggregateReportFormValidations(pages = []) {
  const allForms = [];
  const reportRows = [];
  const issues = [];

  let totalForms = 0;
  let totalFieldsTested = 0;
  let totalTestsRun = 0;
  let passedCount = 0;
  let failedCount = 0;
  let formsPassed = 0;
  let formsFailed = 0;
  let formsPartial = 0;
  let formsNotTested = 0;

  for (const page of pages) {
    const pageForms = page.forms || [];

    for (const form of pageForms) {
      // Check if this form has our enriched fields structure
      const fields = form.fields || [];
      if (fields.length === 0 && (!form.inputs || form.inputs.length === 0)) continue;

      totalForms++;
      allForms.push(form);

      const status = form.overallStatus || "NOT_TESTED";
      if (status === "PASS") formsPassed++;
      else if (status === "FAIL") formsFailed++;
      else if (status === "PARTIAL") formsPartial++;
      else formsNotTested++;

      totalTestsRun += (form.totalTests || 0);
      passedCount += (form.passedTests || 0);
      failedCount += (form.failedTests || 0);

      // Process fields
      for (const field of fields) {
        totalFieldsTested++;

        // Flatten each test into the report table format
        const tests = field.tests || [];
        if (tests.length > 0) {
          for (const test of tests) {
            reportRows.push({
              pageUrl: page.url || form.pageUrl || "",
              pageTitle: page.title || form.pageTitle || "Page",
              formId: form.formId || form.formName || "Form",
              formType: form.formType || "general",
              fieldName: field.fieldName || field.name || "field",
              fieldType: field.fieldType || field.type || "text",
              required: field.required ? "Yes" : "No",
              expectedValidation: field.expectedValidation || "",
              testName: test.testName || "",
              testDescription: test.description || "",
              testValue: test.inputValue,
              expected: test.expected,
              actual: test.actual,
              status: test.status,
              validationMessage: test.validationMessage || "",
              overallFieldStatus: field.overallFieldStatus || field.validationStatus || "NOT_TESTED",
              overallFormStatus: status,
            });
          }
        } else {
          reportRows.push({
            pageUrl: page.url || form.pageUrl || "",
            pageTitle: page.title || form.pageTitle || "Page",
            formId: form.formId || form.formName || "Form",
            formType: form.formType || "general",
            fieldName: field.fieldName || field.name || "field",
            fieldType: field.fieldType || field.type || "text",
            required: field.required ? "Yes" : "No",
            expectedValidation: field.expectedValidation || "",
            testName: "general",
            testDescription: "Field detected",
            testValue: field.validTestValue || "",
            expected: "Accept",
            actual: field.validTestResult || "Accepted",
            status: field.validationStatus || "NOT_TESTED",
            validationMessage: field.validationMessage || "",
            overallFieldStatus: field.overallFieldStatus || field.validationStatus || "NOT_TESTED",
            overallFormStatus: status,
          });
        }

        // Generate specific issues if fields fail critical validations
        if (field.overallFieldStatus === "FAIL") {
          const failedTests = (field.tests || []).filter(t => !t.passed);
          for (const ft of failedTests) {
            if (field.semanticType === "email" && ft.testName.includes("email")) {
              issues.push({
                category: "operational",
                severity: "HIGH",
                title: `Form Email Validation Flaw on ${field.fieldName}`,
                description: `The email input field '${field.fieldName}' on ${page.url} failed validation rule: ${ft.description}. Invalid input '${ft.inputValue}' was accepted by the browser form. Email fields must strictly follow valid email format.`,
                recommendation: `Set type="email" with strict pattern validation or server/client-side regex verification on '${field.fieldName}'.`,
                affectedUrls: [page.url],
                sourceAnalyzer: "formValidator",
              });
            } else if (field.semanticType === "phone" && (ft.testName.includes("phone") || ft.testName.includes("alpha"))) {
              issues.push({
                category: "operational",
                severity: "MEDIUM",
                title: `Phone Field Accepts Letters/Text on ${field.fieldName}`,
                description: `The phone input field '${field.fieldName}' on ${page.url} allows letters and text (accepted '${ft.inputValue}'). Phone numbers must strictly contain only numbers (0-9 digits).`,
                recommendation: `Add input pattern="[0-9]{10}" and inputmode="numeric" to <input type="tel"> or restrict input using JavaScript so only numbers can be entered.`,
                affectedUrls: [page.url],
                sourceAnalyzer: "formValidator",
              });
            } else if (field.semanticType === "name" && (ft.testName.includes("name") || ft.testName.includes("numeric") || ft.testName.includes("special"))) {
              issues.push({
                category: "operational",
                severity: "MEDIUM",
                title: `Name Field Accepts Numbers/Symbols on ${field.fieldName}`,
                description: `The name input field '${field.fieldName}' on ${page.url} accepted invalid input '${ft.inputValue}'. Name fields should strictly accept only alphabetical letters.`,
                recommendation: `Add input pattern="[a-zA-Z\\s]+" to <input type="text"> to ensure only letters and spaces are accepted.`,
                affectedUrls: [page.url],
                sourceAnalyzer: "formValidator",
              });
            } else if (ft.testName === "empty_required") {
              issues.push({
                category: "operational",
                severity: "MEDIUM",
                title: `Required Field Missing Browser Enforcement on ${field.fieldName}`,
                description: `Field '${field.fieldName}' on ${page.url} is designated as required but permitted empty input without browser constraint rejection.`,
                recommendation: `Add the HTML5 'required' attribute to the input element and enforce form-level submission validation.`,
                affectedUrls: [page.url],
                sourceAnalyzer: "formValidator",
              });
            }
          }
        }
      }
    }
  }

  // Build Field Summaries (1 entry per field)
  const fieldSummaries = [];
  for (const form of allForms) {
    const pageTitle = form.pageTitle || "Page";
    const formName = form.formType || form.formName || form.formId || "Form";
    for (const field of (form.fields || [])) {
      const fieldName = field.fieldName || field.name || "field";
      const fieldType = (field.fieldType || field.type || "text").toLowerCase();
      const label = field.label || fieldName;
      const required = !!field.required;
      const semanticType = field.semanticType || "text";
      const tests = field.tests || [];
      const failedTests = tests.filter(t => !t.passed);
      const isFailed = field.overallFieldStatus === "FAIL" || failedTests.length > 0;

      let expectedRule = "Standard Valid Text";
      let problemSummary = "";
      let findingSummary = "";
      let recommendation = "";

      switch (semanticType) {
        case "phone":
          expectedRule = "Numbers Only (0-9 digits)";
          if (isFailed) {
            const badAlpha = failedTests.find(t => t.testName.includes("alpha") || /[a-zA-Z]/.test(t.inputValue || ""));
            problemSummary = `Allows letters and text — Input '${badAlpha ? badAlpha.inputValue : "text"}' was accepted. Phone fields must strictly accept numbers only (0-9 digits).`;
            findingSummary = problemSummary;
            recommendation = `Add pattern="[0-9]{10}" and inputmode="numeric" to <input type="tel"> or restrict input using JavaScript so letters cannot be typed.`;
          } else {
            findingSummary = "Correctly restricts input to numeric phone digits (0-9).";
            recommendation = "No action needed — phone validation properly configured.";
          }
          break;

        case "name":
          expectedRule = "Letters / Text Only (a-z, A-Z)";
          if (isFailed) {
            const badInputs = failedTests.map(t => `'${t.inputValue}'`).join(", ") || "numbers/symbols";
            problemSummary = `Allows numbers & symbols — Input ${badInputs} was accepted. Name fields should strictly accept only alphabetical letters.`;
            findingSummary = problemSummary;
            recommendation = `Add pattern="[a-zA-Z\\s]+" to <input type="text"> to ensure only letters and spaces are accepted.`;
          } else {
            findingSummary = "Correctly restricts input to alphabetical letters.";
            recommendation = "No action needed — name validation properly configured.";
          }
          break;

        case "email":
          expectedRule = "Valid Email Format (user@domain.com)";
          if (isFailed) {
            const badEmail = failedTests.find(t => t.testName.includes("invalid") || !t.inputValue.includes("@"));
            problemSummary = `Allows invalid email format — Accepted '${badEmail ? badEmail.inputValue : "invalid email"}'. Must require standard email structure.`;
            findingSummary = problemSummary;
            recommendation = `Use <input type="email"> and enforce email pattern regex validation to block invalid email addresses.`;
          } else {
            findingSummary = "Correctly enforces standard email address format (user@domain.com).";
            recommendation = "No action needed — email format properly enforced.";
          }
          break;

        case "message":
          expectedRule = "Freeform Content (Text, Numbers & Symbols)";
          if (isFailed) {
            problemSummary = "Message field is required but accepted blank input.";
            findingSummary = problemSummary;
            recommendation = "Add the 'required' attribute to the textarea element.";
          } else {
            findingSummary = "Properly accepts freeform text, numbers, and symbols as expected for messages.";
            recommendation = "No action needed — properly configured.";
          }
          break;

        default:
          expectedRule = "Standard Valid Text";
          if (isFailed) {
            problemSummary = "Field failed constraint validation checks.";
            findingSummary = problemSummary;
            recommendation = "Verify input constraints and validation rules.";
          } else {
            findingSummary = "Passed all automated input constraint checks.";
            recommendation = "No action needed — properly configured.";
          }
          break;
      }

      if (required && failedTests.some(t => t.testName === "empty_required")) {
        problemSummary = problemSummary ? `${problemSummary} (Also allows blank submission on required field)` : "Allows blank submission on required field.";
        findingSummary = problemSummary;
        recommendation = `${recommendation} Add HTML5 'required' attribute.`.trim();
      }

      fieldSummaries.push({
        pageTitle,
        formName,
        fieldName,
        fieldLabel: label,
        fieldType,
        semanticType,
        required: required ? "Yes" : "No",
        expectedRule,
        status: isFailed ? "FAIL" : "PASS",
        problemSummary,
        findingSummary,
        recommendation,
        tests,
      });
    }
  }

  // Calculate Overall Crawl Form Validation Status
  let overallStatus = "NOT_TESTED";
  if (totalForms > 0) {
    if (formsFailed > 0) overallStatus = "FAIL";
    else if (formsPassed === totalForms) overallStatus = "PASS";
    else overallStatus = "PARTIAL";
  }

  return {
    summary: {
      totalForms,
      totalFieldsTested,
      totalTestsRun,
      passedCount,
      failedCount,
      formsPassed,
      formsFailed,
      formsPartial,
      formsNotTested,
      overallStatus,
    },
    forms: allForms,
    reportRows,
    fieldSummaries,
    issues,
  };
}

module.exports = {
  detectAndTestPageForms,
  generateFieldTestCases,
  inferSemanticFieldType,
  inferFormType,
  aggregateReportFormValidations,
};
