const MenuPermission = require('../Models/MenuPermission');

module.exports = async (req, res, next) => {
  try {
    // If admin, bypass all permission checks
    if (req.user && req.user.role === 'admin') {
      return next();
    }

    // Bypass permission checks for approval/rejection status updates
    if (req.originalUrl.toLowerCase().includes('/status')) {
      return next();
    }

    const userId = req.user ? req.user.id || req.user._id : null;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - User details not found" });
    }

    const moduleName = getModuleFromPath(req.originalUrl);
    if (!moduleName) {
      // If it doesn't match any of our three permission-restricted modules, allow it
      return next();
    }

    // Fetch the permission configuration for this employee
    const permDoc = await MenuPermission.findOne({ employeeId: userId });
    const userPermissions = permDoc ? permDoc.menus : [];
    const permObj = userPermissions.find(p => p.module === moduleName);
    const permission = permObj ? permObj.permission : 'NO_ACCESS';

    if (permission === 'NO_ACCESS') {
      return res.status(403).json({ message: `Access denied to module ${moduleName}` });
    }

    // If request is a GET (read operation), allow if permission is READ, WRITE or BOTH
    if (req.method === 'GET') {
      if (permission === 'READ' || permission === 'WRITE' || permission === 'BOTH') {
        return next();
      }
    } else {
      // If request is a mutation (POST, PUT, DELETE), only allow if permission is WRITE or BOTH
      if (permission === 'WRITE' || permission === 'BOTH') {
        return next();
      }
    }

    return res.status(403).json({ message: `Permission denied for this operation on ${moduleName}` });
  } catch (error) {
    console.error("Permission Middleware Error:", error);
    return res.status(500).json({ message: "Internal server error during permission check" });
  }
};

function getModuleFromPath(url) {
  const path = url.toLowerCase();
  
  if (path.includes('/payment-scripts')) {
    return 'Payment Script';
  }
  if (path.includes('/vendors')) {
    return 'Inscope Vendor';
  }
  if (path.includes('/audit')) {
    return 'Access Controller';
  }
  return null;
}
