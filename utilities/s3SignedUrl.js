const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("./s3");

const generateSignedUrl = async (key, expiresIn = 7200) => {
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  // Default 2 hours expiry or custom (e.g. 180s for 3 min)
  return await getSignedUrl(s3, command, { expiresIn: expiresIn || 7200 });
};

module.exports = generateSignedUrl;