/**
 * @param {Object} controller - The controller object containing route handler functions
 * @param {String} fileName - The name of the file (e.g., 'UsersController.js')
 * @returns {Object} A new object with all functions wrapped for logging
 */
const apiLogger = (controller, fileName) => {
  if (typeof controller === 'function') {
    return async (req, res, next) => {
      const timestamp = new Date().toISOString();
      const route = req ? (req.originalUrl || req.url) : 'Internal/Cron';
      
      const wrappedNext = (err) => {
        if (err) {
          console.error(`\n[API Error (via next)] [${timestamp}] Route: ${route} | File: ${fileName} | Function: DefaultExport`);
          console.error(err);
        }
        if (typeof next === 'function') next(err);
      };

      const method = req ? (req.method || 'GET') : 'INTERNAL';
      const isBackgroundRoute = 
        (method === 'GET' && (
          route.startsWith('/api/leaves') ||
          route.startsWith('/api/notifications') ||
          route.startsWith('/security/pending-for-me') ||
          route.startsWith('/holiday-assignments/my') ||
          route.startsWith('/users/attendance/govholidays') ||
          route.includes('notify=true')
        ));

      if (!isBackgroundRoute) {
        console.log(`\n[API Hit] [${timestamp}] Route: ${route} | File: ${fileName} | Function: DefaultExport`);
      }

      try {
        await controller(req, res, wrappedNext);
      } catch (error) {
        console.error(`\n[API Error (thrown)] [${timestamp}] Route: ${route} | File: ${fileName} | Function: DefaultExport`);
        console.error(error);

        if (res && typeof res.status === 'function' && !res.headersSent) {
          return res.status(500).json({ success: false, message: "Server Error" });
        }
      }
    };
  }

  const wrappedController = {};

  for (const [functionName, handler] of Object.entries(controller)) {
    if (typeof handler === 'function') {
      wrappedController[functionName] = async (req, res, next) => {
        const timestamp = new Date().toISOString();
        const route = (req && (req.originalUrl || req.url)) ? (req.originalUrl || req.url) : 'Internal/Cron';
        
        const wrappedNext = (err) => {
          if (err) {
            console.error(`\n[API Error (via next)] [${timestamp}] Route: ${route} | File: ${fileName} | Function: ${functionName}`);
            console.error(err);
          }
          if (typeof next === 'function') next(err);
        };

        const method = req ? (req.method || 'GET') : 'INTERNAL';
        const isBackgroundRoute = 
          (method === 'GET' && typeof route === 'string' && (
            route.startsWith('/api/leaves') ||
            route.startsWith('/api/notifications') ||
            route.startsWith('/security/pending-for-me') ||
            route.startsWith('/holiday-assignments/my') ||
            route.startsWith('/users/attendance/govholidays') ||
            route.includes('notify=true')
          ));

        if (!isBackgroundRoute) {
          console.log(`\n[API Hit] [${timestamp}] Route: ${route} | File: ${fileName} | Function: ${functionName}`);
        }

        try {
          await handler(req, res, wrappedNext);
        } catch (error) {
          console.error(`\n[API Error (thrown)] [${timestamp}] Route: ${route} | File: ${fileName} | Function: ${functionName}`);
          console.error(error);

          if (res && typeof res.status === 'function' && !res.headersSent) {
            return res.status(500).json({ success: false, message: "Server Error" });
          }
        }
      };
    } else {
      wrappedController[functionName] = handler;
    }
  }

  return wrappedController;
};

module.exports = apiLogger;
