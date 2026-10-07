const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("./s3");
const redisClient = require("./redis");

const deleteFromS3 = async (key) => {
  if (!key) return;

  try {

    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });

    await s3.send(command);

    // 🔥 2. Remove Redis cache (VERY IMPORTANT)
    await redisClient.del(`s3url:${key}`);

    console.log("✅ S3 + Cache deleted:", key);

  } catch (err) {
    console.error("❌ S3 Delete Error:", err);
    throw err; // don't silently ignore
  }
};

module.exports = deleteFromS3;