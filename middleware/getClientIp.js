const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }

  return req.ip || "unknown";
};

module.exports = getClientIp;