const redisClient = require("./redis");
const generateSignedUrl = require("./s3SignedUrl");

const getCachedSignedUrl = async (key) => {

  if (!key) return null;

  const cacheKey = `s3url:${key}`;

  // 1️⃣ Check Redis
  const cachedUrl = await redisClient.get(cacheKey);

  if (cachedUrl) {
    // console.log(`🟢 Image from CACHE (Redis): ${key}`);
    return cachedUrl;
  }
//  console.log(`🔵 Image from SERVER (S3): ${key}`);

  // 2️⃣ Generate new signed URL
  const signedUrl = await generateSignedUrl(key);

  // 3️⃣ Store in Redis for 2 hours
  await redisClient.setEx(cacheKey, 7200, signedUrl);

  return signedUrl;
};

module.exports = getCachedSignedUrl;