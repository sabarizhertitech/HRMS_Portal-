const { PutObjectCommand } = require("@aws-sdk/client-s3");
const redisClient = require("./redis");
const s3 = require("./s3");

const uploadToS3 = async (buffer, key, contentType) => {

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: "AES256"
  });

  await s3.send(command);

  // 🔥 remove old cached signed url
  await redisClient.del(`s3url:${key}`);

  return key;
};

module.exports = {
  uploadToS3
};