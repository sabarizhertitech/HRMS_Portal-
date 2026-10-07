const crypto = require("crypto");

/* =====================================================
   CONFIG
===================================================== */
const SECRET_KEY = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_SECRET || "fallback_secret_key")
  .digest();

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

/* =====================================================
   ENCRYPT
===================================================== */
const encrypt = (text) => {
  try {
    if (!text) return "";

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, SECRET_KEY, iv);

    const encrypted = Buffer.concat([
      cipher.update(text.toString(), "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  } catch (err) {
    console.error("Encrypt Error:", err.message);
    return "";
  }
};

/* =====================================================
   DECRYPT
===================================================== */
const decrypt = (encryptedText) => {
  try {
    if (!encryptedText) return "";

    // 🔥 If it's not encrypted format → return as is
    if (typeof encryptedText !== "string" || !encryptedText.includes(":")) {
      return encryptedText;
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;

    const [ivHex, tagHex, dataHex] = parts;

    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encryptedData = Buffer.from(dataHex, "hex");

    const decipher = crypto.createDecipheriv(ALGO, SECRET_KEY, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");

  } catch (err) {
    console.error("Decrypt Error:", err.message);

    // 🔥 CRITICAL: never return empty
    return encryptedText;
  }
};

/* =====================================================
   MASKING
===================================================== */

// Aadhaar → XXXX-XXXX-1234
const maskAadhaar = (aadhaar) => {
  if (!aadhaar || aadhaar.length !== 12) return "XXXX-XXXX-****";
  return "XXXX-XXXX-" + aadhaar.slice(-4);
};

// PAN → XXXXX1234F
const maskPAN = (pan) => {
  if (!pan || pan.length !== 10) return "XXXXX****X";
  return "XXXXX" + pan.slice(5);
};

// 🔥 Account Number → XXXXXX5678
const maskAccountNumber = (acc) => {
  if (!acc) return "XXXX";
  const str = acc.toString();
  if (str.length <= 4) return "XXXX";

  return "X".repeat(str.length - 4) + str.slice(-4);
};

/* =====================================================
   EXPORT
===================================================== */
module.exports = {
  encrypt,
  decrypt,
  maskAadhaar,
  maskPAN,
  maskAccountNumber,
};