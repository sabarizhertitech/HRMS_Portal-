const mongoose = require('mongoose');
const LetterTemplate = require('../Models/LetterTemplate');
const GeneratedLetter = require('../Models/GeneratedLetter');
const IncrementLetter = require('../Models/IncrementLetter');
const TerminationLetter = require('../Models/TerminationLetter');
const { uploadToS3 } = require('../utilities/s3Upload');
const generateSignedUrl = require('../utilities/s3SignedUrl');
const deleteFromS3 = require('../utilities/s3Delete');
const Employee = require('../Models/Employee');
const EmployeeDetails = require('../Models/EmployeeDetails');

// Helper to decode HTML entities escaped by xss-clean middleware
const decodeHtmlEntities = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&');
};

// Helper to safely parse salary and currency strings into positive numbers
const parseSalary = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const cleaned = String(val).replace(/,/g, '').replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Default Templates Design Configuration
const DEFAULT_TEMPLATES = {
  internship: {
    subject: '',
    html: '<p style="text-align: center;"><span style="font-family: Roboto, sans-serif; font-size: 18px;"><strong>Appointment for Internship - {designation}</strong></span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">Dear {employeeName},</span><span style="font-family: Roboto, sans-serif;"><br><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">We are pleased to offer you an internship position in the capacity of {designation} at Ertitech Solutions Pvt Ltd, Salem, TamilNadu, effective from {internshipStartDate} to {internshipEndDate}, subject to the terms and conditions outlined below.</span><br><br><span style="font-family: Roboto, sans-serif; font-size: 14px;"><strong>Internship Details:</strong></span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Department </strong>: {department}</span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Reporting To </strong>: {reportingTo}</span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Internship Duration</strong> : {internshipDuration}</span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Working Hours</strong> : {workingHours}</span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Stipend </strong>: {stipend} per month</span><span style="font-family: Roboto, sans-serif;"><br><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">Please sign and return a copy of this letter as a token of your acceptance. We look forward to having you on board and hope this internship will be a valuable learning experience for you.</span></p>',
  },
  appointment: {
    subject: '',
    html: '<p style="line-height: 1.5; text-align: center;"><span style="font-family: Roboto, sans-serif; font-size: 18px;"><strong>Appointment Letter</strong></span></p><p style="line-height: 1.5; text-align: center;"><span style="font-family: Roboto, sans-serif;">Personal & Confidential</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">Dear {employeeName},</span><br><span style="font-family: Roboto, sans-serif;"><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">Congratulations!</span></p><p style="line-height: 1.75;"></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">We are pleased to offer you the position of {designation} at Ertitech Solutions Private Limited, Salem, TamilNadu, with effect from {dateOfJoining}. We are excited about your joining our team and believe you will contribute significantly to our organization\'s growth.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif;"><br></span><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Position</strong>: {designation}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Department</strong>: {department}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Job type</strong>: {jobType}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Reporting to</strong>: {reportingTo}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Monthly Salary</strong>: INR {monthlySalary}/-</span></p><p style="line-height: 1.25;"></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 14px;"><strong>Probation Period </strong></span><span style="font-family: Roboto, sans-serif;"><br><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">Your employment will be subject to a probationary period of [{probationPeriod}]. During this time, your performance will be assessed, and your employment status will be reviewed at the end of the probationary period.</span><span style="font-family: Roboto, sans-serif;"><br><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">We look forward to having you as a permanent member of the Ertitech Solutions Private Limited team and to your continued contributions. If you have any questions or need further clarification, please feel free to contact us.</span></p>',
  },
  'intern-to-fulltime': {
    subject: '',
    html: '<p style="line-height: 1.5; text-align: center;"><span style="font-family: Roboto, sans-serif; font-size: 18px;"><strong>Appointment Letter</strong></span></p><p style="line-height: 1.5; text-align: center;"><span style="font-family: Roboto, sans-serif;">Personal & Confidential</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">Dear {employeeName},</span><br><span style="font-family: Roboto, sans-serif;"><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">Congratulations!</span></p><p style="line-height: 1.75;"></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">We are pleased to inform you that following the successful completion of your internship, we are extending an offer for you to work as a {designation} on a full-time basis with effect from {convertedJoiningDate}. We are excited about the potential you have demonstrated during your internship, and we believe you will continue to add value to our team.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif;"><br></span><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Position</strong>: {designation}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Department</strong>: {department}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Job type</strong>: {jobType}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Reporting to</strong>: {reportingTo}</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 12px;"><strong>Monthly Salary</strong>: INR {monthlySalary}/-</span></p><p style="line-height: 1.25;"></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 14px;"><strong>Probation Period </strong></span><span style="font-family: Roboto, sans-serif;"><br><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">Your employment will be subject to a probationary period of [{probationPeriod}]. During this time, your performance will be assessed, and your employment status will be reviewed at the end of the probationary period.</span><span style="font-family: Roboto, sans-serif;"><br><br></span><span style="font-family: Roboto, sans-serif; font-size: 13px;">We look forward to having you as a permanent member of the Ertitech Solutions Private Limited team and to your continued contributions. If you have any questions or need further clarification, please feel free to contact us.</span></p>',
  },
  'additional-info': {
    subject: '',
    html: '<p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Key Responsibilities</strong></span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Design and Develop: Build and maintain efficient, reusable, and reliable code for both front-end and back-end components of web and mobile applications.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Collaborate with Teams: Work closely with other developers to define, design, and implement new features and enhancements.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ API Development & Integration: Design and implement robust APIs to facilitate interaction between different systems and components.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Database Management: Develop and manage databases using SQL and NoSQL technologies (e.g., MySQL, MongoDB).</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Performance Optimization: Ensure the application’s performance, scalability, and security by writing optimized code and testing across devices and browsers.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Troubleshooting & Debugging: Identify bottlenecks, bugs, and other issues and provide timely solutions.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Maintain & Update Codebase: Continuously monitor, maintain, and improve the existing codebase.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Testing: Write and maintain automated tests for applications to ensure code reliability and robustness.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">➢ Stay Updated: Keep up with the latest industry trends, technologies, and best practices in both front-end and back-end development.</span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Acknowledgment and Acceptance</strong></span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">I, {employeeName}, accept the full-time employment offer as {designation} with Ertitech Solutions Private Limited under the terms and conditions outlined above.</span></p><p style="line-height: 1.75;"><span style="font-family: Roboto, sans-serif; font-size: 13px;">Employee Signature: {employeeName}</span></p>',
  },
  increment: {
    subject: '',
    html: '<p><span style="font-family: Roboto, sans-serif; font-size: 13px;">Dear <strong>{employeeName}</strong>,</span></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;">Congratulations</span>!</p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;">We are pleased to inform you that, based on your performance and contributions to the organization, your monthly salary has been revised with an increment of <strong>{incrementAmount}</strong>, effective from <strong>{dateOfIssue}</strong>.</span></p><p><span style="font-family: Roboto, sans-serif;"><strong>Revised Salary Details:</strong></span></p><ul><li><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>Previous Monthly Salary:</strong> {previousSalary}</span></p></li><li><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>% Increment:</strong> {incrementPercentage}</span></p></li><li><p><span style="font-family: Roboto, sans-serif; font-size: 13px;"><strong>New Monthly Salary:</strong> {newSalary}</span></p></li></ul><p><span style="font-family: Roboto, sans-serif; font-size: 13px;">We sincerely appreciate your dedication and the value you bring to our team. We look forward to your continued contributions and success in your role. Should you have any questions or require further clarification, please feel free to reach out.</span></p><p><span style="font-size: 13px;">Compensation package: The details of your monthly compensation are as follows:</span><br></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;">{allowancesTable}</span></p><p></p><p><span style="font-family: Roboto, sans-serif; font-size: 13px;">We look forward to your continued energetic contribution and many years of rewarding association with Organization.</span></p>',
  },
  termination: {
    subject: '',
    html: '<p>Dear {employeeName},</p><p>This letter serves as formal notification that your employment with ERTI TECH PRIVATE LIMITED is being terminated, effective from <strong>{effectiveDate}</strong>.</p><p>As per company policy and employment terms, your notice period will be <strong>{noticePeriod}</strong>. {reason}</p><p>Please note that your final settlement, including all pending dues and clearance formalities, will be processed as per company regulations. {settlementStatus}</p><p>We request you to hand over all company property, assets, and credentials in your possession to your department head on or before your last working day.</p><p>We thank you for your contributions during your tenure and wish you the best in your future professional pursuits.</p>',
  }
};

/**
 * Get all letter templates.
 * 6 Default templates (isDefault: true) are permanent and pristine.
 * Custom templates (isDefault: false, isActive: true) override for active use.
 */
exports.getTemplates = async (req, res) => {
  try {
    const allowedTypes = ['internship', 'appointment', 'intern-to-fulltime', 'additional-info', 'increment', 'termination'];

    // 1. Fetch all active custom templates
    const customTemplates = await LetterTemplate.find({ isDefault: false, isActive: true }).lean();
    const customMap = {};
    customTemplates.forEach(ct => {
      customMap[ct.letterType] = ct;
    });

    const map = {};

    // 2. Build template map for all 6 letter types
    for (const type of allowedTypes) {
      const defTplConfig = DEFAULT_TEMPLATES[type] || {};
      const pristineDefaultHtml = decodeHtmlEntities(defTplConfig.html || '');
      const pristineSubject = defTplConfig.subject || '';

      const customDoc = customMap[type];
      if (customDoc && customDoc.html) {
        const customHtml = decodeHtmlEntities(customDoc.html);
        map[type] = {
          ...customDoc,
          letterType: type,
          subject: customDoc.subject !== undefined ? customDoc.subject : pristineSubject,
          defaultHtml: pristineDefaultHtml,
          customHtml: customHtml,
          isCustomized: true,
          html: customHtml,
          isDefault: false,
          isActive: true
        };
      } else {
        map[type] = {
          letterType: type,
          subject: pristineSubject,
          defaultHtml: pristineDefaultHtml,
          customHtml: '',
          isCustomized: false,
          html: pristineDefaultHtml,
          isDefault: true,
          isActive: true
        };
      }
    }

    // 3. Ensure pristine default templates exist in DB asynchronously
    Promise.all(
      allowedTypes.map(async (type) => {
        const defTpl = DEFAULT_TEMPLATES[type] || {};
        return LetterTemplate.findOneAndUpdate(
          { letterType: type, isDefault: true },
          {
            $set: {
              letterType: type,
              isDefault: true,
              isActive: true,
              isCustomized: false,
              subject: defTpl.subject || '',
              defaultHtml: defTpl.html || '',
              customHtml: '',
              html: defTpl.html || '',
            }
          },
          { upsert: true, new: true }
        );
      })
    ).catch(err => console.error('Error ensuring default letter templates in DB:', err));

    return res.status(200).json({ success: true, data: map });
  } catch (error) {
    console.error('getTemplates error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving templates' });
  }
};

/**
 * Save / Update a custom template.
 * The 6 default templates (isDefault: true) are NEVER modified.
 * Custom edits are saved as a separate template document (isDefault: false, isActive: true).
 */
exports.saveTemplate = async (req, res) => {
  try {
    const { letterType, subject, html, ...content } = req.body;

    if (!letterType) {
      return res.status(400).json({ success: false, message: 'Letter type is required' });
    }

    const allowedTypes = ['internship', 'appointment', 'intern-to-fulltime', 'additional-info', 'increment', 'termination'];
    if (!allowedTypes.includes(letterType)) {
      return res.status(400).json({ success: false, message: 'Invalid letter type' });
    }

    if (!req.user || (!req.user._id && !req.user.id)) {
      return res.status(400).json({ success: false, message: 'Invalid logged in user.' });
    }

    if (!subject && !html && Object.keys(content).length === 0) {
      return res.status(400).json({ success: false, message: 'Template content is required' });
    }

    const defaultTplConfig = DEFAULT_TEMPLATES[letterType] || {};
    const pristineDefaultHtml = decodeHtmlEntities(defaultTplConfig.html || '');
    const pristineSubject = defaultTplConfig.subject || '';
    const cleanHtml = html !== undefined ? decodeHtmlEntities(html) : '';

    // 1. Ensure the pristine default document is intact
    await LetterTemplate.findOneAndUpdate(
      { letterType, isDefault: true },
      {
        $set: {
          letterType,
          isDefault: true,
          isActive: true,
          isCustomized: false,
          subject: pristineSubject,
          defaultHtml: pristineDefaultHtml,
          customHtml: '',
          html: pristineDefaultHtml,
        }
      },
      { upsert: true }
    );

    // 2. Upsert custom template as a separate document (isDefault: false, isActive: true)
    const customTemplate = await LetterTemplate.findOneAndUpdate(
      { letterType, isDefault: false },
      {
        $set: {
          letterType,
          isDefault: false,
          isActive: true,
          isCustomized: true,
          subject: subject !== undefined ? subject : pristineSubject,
          defaultHtml: pristineDefaultHtml,
          customHtml: cleanHtml,
          html: cleanHtml,
          ...content,
          updatedBy: req.user._id || req.user.id
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const responseData = {
      ...customTemplate.toObject(),
      letterType,
      isCustomized: true,
      defaultHtml: pristineDefaultHtml,
      html: cleanHtml,
      customHtml: cleanHtml,
      isDefault: false,
    };

    return res.status(200).json({
      success: true,
      message: 'Custom template saved successfully (Default template preserved)',
      data: responseData
    });
  } catch (error) {
    console.error('saveTemplate error:', error);
    return res.status(500).json({ success: false, message: 'Server error saving template' });
  }
};

/**
 * Reset template to pristine default.
 * Removes the custom template document (isDefault: false) and restores the pristine default template.
 */
exports.resetTemplate = async (req, res) => {
  try {
    const { letterType } = req.body;

    if (!letterType) {
      return res.status(400).json({ success: false, message: 'Letter type is required' });
    }

    const allowedTypes = ['internship', 'appointment', 'intern-to-fulltime', 'additional-info', 'increment', 'termination'];
    if (!allowedTypes.includes(letterType)) {
      return res.status(400).json({ success: false, message: 'Invalid letter type' });
    }

    // 1. Delete all custom template documents for this letterType
    await LetterTemplate.deleteMany({ letterType, isDefault: false });

    // 2. Ensure default document in DB is set to pristine default configuration
    const defaultTplConfig = DEFAULT_TEMPLATES[letterType] || {};
    const pristineDefaultHtml = decodeHtmlEntities(defaultTplConfig.html || '');
    const pristineSubject = defaultTplConfig.subject || '';

    const defaultDoc = await LetterTemplate.findOneAndUpdate(
      { letterType, isDefault: true },
      {
        $set: {
          letterType,
          isDefault: true,
          isActive: true,
          isCustomized: false,
          subject: pristineSubject,
          defaultHtml: pristineDefaultHtml,
          customHtml: '',
          html: pristineDefaultHtml,
        }
      },
      { upsert: true, new: true }
    ).lean();

    const responseData = {
      ...defaultDoc,
      letterType,
      subject: pristineSubject,
      defaultHtml: pristineDefaultHtml,
      customHtml: '',
      isCustomized: false,
      html: pristineDefaultHtml,
      isDefault: true,
    };

    return res.status(200).json({
      success: true,
      message: 'Template reset to default successfully',
      data: responseData
    });
  } catch (error) {
    console.error('resetTemplate error:', error);
    return res.status(500).json({ success: false, message: 'Server error resetting template' });
  }
};

/**
 * Get previously generated letters list
 */
exports.getGeneratedLetters = async (req, res) => {
  try {
    const { type, page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const skipNum = (pageNum - 1) * limitNum;

    let query;
    if (type === 'increment') {
      query = IncrementLetter.find();
    } else if (type === 'termination') {
      query = TerminationLetter.find();
    } else {
      query = GeneratedLetter.find();
    }

    const letters = await query
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean();

    // Populate signed urls dynamically in parallel for each record's S3 key
    await Promise.all(
      letters.map(async (letter) => {
        if (letter.s3Key) {
          try {
            letter.fileUrl = await generateSignedUrl(letter.s3Key);
          } catch (err) {
            console.error(`Failed to generate signed url for ${letter.s3Key}:`, err);
          }
        }
      })
    );

    return res.status(200).json({ success: true, data: letters, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('getGeneratedLetters error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving letters' });
  }
};

/**
 * Save a generated letter
 */
exports.saveGeneratedLetter = async (req, res) => {
  let s3Key = null;
  try {
    const {
      letterType,
      employeeName,
      dateOfIssue,
      designation,
      department,
      signatoryName,
      signatoryTitle,
      data
    } = req.body;

    // A. Validate letterType
    const allowedLetterTypes = ['internship', 'appointment', 'intern-to-fulltime', 'increment', 'termination'];
    if (!letterType || !allowedLetterTypes.includes(letterType)) {
      return res.status(400).json({ success: false, message: 'Invalid letter type.' });
    }

    // B. Validate employeeName
    if (typeof employeeName !== 'string') {
      return res.status(400).json({ success: false, message: 'Employee name must be a string.' });
    }
    const trimmedEmployeeName = employeeName.trim();
    if (!trimmedEmployeeName) {
      return res.status(400).json({ success: false, message: 'Employee name is required.' });
    }
    if (trimmedEmployeeName.length < 2 || trimmedEmployeeName.length > 100) {
      return res.status(400).json({ success: false, message: 'Employee name must be between 2 and 100 characters.' });
    }
    if (/^\d+$/.test(trimmedEmployeeName)) {
      return res.status(400).json({ success: false, message: 'Employee name cannot contain only numbers.' });
    }
    if (!/[a-zA-Z0-9]/.test(trimmedEmployeeName)) {
      return res.status(400).json({ success: false, message: 'Employee name cannot contain only special characters.' });
    }

    // C. Validate designation
    if (typeof designation !== 'string') {
      return res.status(400).json({ success: false, message: 'Designation must be a string.' });
    }
    const trimmedDesignation = designation.trim();
    if (!trimmedDesignation) {
      return res.status(400).json({ success: false, message: 'Designation is required.' });
    }
    if (trimmedDesignation.length < 2 || trimmedDesignation.length > 100) {
      return res.status(400).json({ success: false, message: 'Designation must be between 2 and 100 characters.' });
    }

    // D. Validate department
    if (department !== undefined && department !== null && department !== "") {
      if (typeof department !== 'string') {
        return res.status(400).json({ success: false, message: 'Department must be a string.' });
      }
      if (department.length > 100) {
        return res.status(400).json({ success: false, message: 'Department must not exceed 100 characters.' });
      }
    }

    // E. Validate signatoryName
    if (signatoryName !== undefined && signatoryName !== null && signatoryName !== "") {
      if (typeof signatoryName !== 'string') {
        return res.status(400).json({ success: false, message: 'Signatory name must be a string.' });
      }
      if (signatoryName.length > 100) {
        return res.status(400).json({ success: false, message: 'Signatory name must not exceed 100 characters.' });
      }
    }

    // F. Validate signatoryTitle
    if (signatoryTitle !== undefined && signatoryTitle !== null && signatoryTitle !== "") {
      if (typeof signatoryTitle !== 'string') {
        return res.status(400).json({ success: false, message: 'Signatory title must be a string.' });
      }
      if (signatoryTitle.length > 100) {
        return res.status(400).json({ success: false, message: 'Signatory title must not exceed 100 characters.' });
      }
    }

    // G. Validate dateOfIssue
    if (!dateOfIssue) {
      return res.status(400).json({ success: false, message: 'Date of issue is required.' });
    }
    const issueDateObj = new Date(dateOfIssue);
    if (isNaN(issueDateObj.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid Date of issue.' });
    }

    // H. Validate req.user
    if (!req.user || (!req.user._id && !req.user.id)) {
      return res.status(400).json({ success: false, message: 'Invalid logged in user.' });
    }

    // I. Validate uploaded file
    if (!req.file || req.file.mimetype !== 'application/pdf' || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid PDF file.' });
    }

    let parsedData = data;
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        console.error("Failed to parse data string", e);
        return res.status(400).json({ success: false, message: 'Invalid JSON format in data field.' });
      }
    }

    // Prepare data BEFORE uploading to S3
    let filteredData = {};
    if (parsedData && typeof parsedData === 'object') {
      switch (letterType) {
        case "internship":
          filteredData = {
            internshipStartDate: parsedData.internshipStartDate,
            internshipDuration: parsedData.internshipDuration,
            internshipEndDate: parsedData.internshipEndDate,
            stipend: parsedData.stipend,
            reportingTo: parsedData.reportingTo,
            workingHours: parsedData.workingHours
          };
          break;
        case "appointment":
          filteredData = {
            monthlySalary: parsedData.monthlySalary,
            jobType: parsedData.jobType,
            reportingTo: parsedData.reportingTo,
            dateOfJoining: parsedData.dateOfJoining
          };
          if (parsedData.hasProbation === "yes") {
            const val = parsedData.probationValue || parsedData.probationPeriod || "6";
            const unit = parsedData.probationUnit || "Months";
            const formattedUnit = unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
            filteredData.probationPeriod = `${val} ${formattedUnit}`;
          }
          break;
        case "intern-to-fulltime":
          filteredData = {
            convertedJoiningDate: parsedData.convertedJoiningDate,
            convertedCtc: parsedData.convertedCtc,
            monthlySalary: parsedData.monthlySalary,
            jobType: parsedData.jobType,
            reportingTo: parsedData.reportingTo
          };
          if (parsedData.hasProbation === "yes") {
            const val = parsedData.probationValue || parsedData.probationPeriod || "6";
            const unit = parsedData.probationUnit || "Months";
            const formattedUnit = unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
            filteredData.probationPeriod = `${val} ${formattedUnit}`;
          }
          break;
        default:
          filteredData = { ...parsedData };
          break;
      }

      // Remove empty values ("", null, undefined)
      Object.keys(filteredData).forEach((key) => {
        if (filteredData[key] === "" || filteredData[key] === null || filteredData[key] === undefined) {
          delete filteredData[key];
        }
      });
    }

    // Now upload to S3 only after ALL validations, duplicate checks, and data preparation pass
    const cleanName = trimmedEmployeeName.replace(/[^a-zA-Z0-9]/g, '_');
    s3Key = `slips/letters/${cleanName}_${Date.now()}.pdf`;
    await uploadToS3(req.file.buffer, s3Key, 'application/pdf');

    if (letterType === 'increment') {
      const prevSalaryVal = parseSalary(parsedData.previousSalary);
      const newSalaryVal = parseSalary(parsedData.newSalary);

      let newLetter;
      try {
        newLetter = await IncrementLetter.create({
          employeeName: trimmedEmployeeName,
          previousSalary: prevSalaryVal,
          newSalary: newSalaryVal,
          incrementPercentage: String(parsedData.incrementPercentage),
          designation: trimmedDesignation,
          department,
          dateOfIssue: issueDateObj,
          effectiveFrom: parsedData.effectiveFrom || req.body.effectiveFrom || "",
          signatoryName,
          signatoryTitle,
          allowances: Array.isArray(parsedData.allowances)
            ? parsedData.allowances.map((a) => ({
              label: a.label || "",
              amount: parseSalary(a.amount),
            }))
            : [],
          s3Key,
          createdBy: req.user._id || req.user.id
        });
      } catch (dbErr) {
        console.error('Database save failed, rolling back S3 upload:', dbErr);
        if (s3Key) {
          try {
            await deleteFromS3(s3Key);
          } catch (s3Err) {
            console.error('S3 rollback deletion failed:', s3Err);
          }
        }
        throw dbErr;
      }

      return res.status(201).json({ success: true, data: newLetter });
    }

    if (letterType === 'termination') {
      let newLetter;
      try {
        newLetter = await TerminationLetter.create({
          employeeName: trimmedEmployeeName,
          designation: trimmedDesignation,
          department,
          dateOfIssue: issueDateObj,
          effectiveDate: parsedData.effectiveDate || req.body.effectiveDate || "",
          noticePeriod: parsedData.noticePeriod || req.body.noticePeriod || "",
          reason: parsedData.reason || req.body.reason || "",
          settlementStatus: parsedData.settlementStatus || req.body.settlementStatus || "",
          signatoryName,
          signatoryTitle,
          s3Key,
          createdBy: req.user._id || req.user.id
        });
      } catch (dbErr) {
        console.error('Database save failed, rolling back S3 upload:', dbErr);
        if (s3Key) {
          try {
            await deleteFromS3(s3Key);
          } catch (s3Err) {
            console.error('S3 rollback deletion failed:', s3Err);
          }
        }
        throw dbErr;
      }

      return res.status(201).json({ success: true, data: newLetter });
    }

    let newLetter;
    try {
      newLetter = await GeneratedLetter.create({
        letterType,
        employeeName: trimmedEmployeeName,
        dateOfIssue: issueDateObj,
        designation: trimmedDesignation,
        department,
        signatoryName,
        signatoryTitle,
        data: filteredData,
        s3Key,
        createdBy: req.user._id || req.user.id
      });
    } catch (dbErr) {
      console.error('Database save failed, rolling back S3 upload:', dbErr);
      if (s3Key) {
        try {
          await deleteFromS3(s3Key);
        } catch (s3Err) {
          console.error('S3 rollback deletion failed:', s3Err);
        }
      }
      throw dbErr;
    }

    return res.status(201).json({ success: true, data: newLetter });
  } catch (error) {
    console.error('saveGeneratedLetter error:', error);
    return res.status(500).json({ success: false, message: 'Server error saving letter details' });
  }
};

/**
 * Delete a generated letter record and its S3 PDF
 */
exports.deleteGeneratedLetter = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid Letter ID.' });
    }
    let letter = await GeneratedLetter.findById(id);
    let letterModelType = 'generated';
    if (!letter) {
      letter = await IncrementLetter.findById(id);
      if (letter) letterModelType = 'increment';
    }
    if (!letter) {
      letter = await TerminationLetter.findById(id);
      if (letter) letterModelType = 'termination';
    }
    if (!letter) {
      return res.status(404).json({ success: false, message: 'Letter record not found' });
    }

    // Check authorization: Admin or HR or letter creator
    if (!req.user || (req.user.role !== 'admin' && !req.user.isHr && String(letter.createdBy) !== String(req.user._id || req.user.id))) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this letter.' });
    }

    // Delete PDF from S3 if it exists
    if (letter.s3Key) {
      try {
        await deleteFromS3(letter.s3Key);
      } catch (s3Err) {
        console.error('S3 delete failed (continuing DB delete):', s3Err);
      }
    }

    if (letterModelType === 'increment') {
      await IncrementLetter.findByIdAndDelete(id);
    } else if (letterModelType === 'termination') {
      await TerminationLetter.findByIdAndDelete(id);
    } else {
      await GeneratedLetter.findByIdAndDelete(id);
    }
    return res.status(200).json({ success: true, message: 'Letter deleted successfully' });
  } catch (error) {
    console.error('deleteGeneratedLetter error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting letter' });
  }
};

/**
 * Separate controller endpoint to fetch all employees for Increment Letter generation.
 * Includes Employee details (name, email, department, designation) and basic salary from EmployeeDetails.
 */
exports.getIncrementEmployees = async (req, res) => {
  try {


    const employees = await Employee.find({
      employmentStatus: { $ne: 'relieved' },
      role: 'employee'
    })
      .select("name empId department designation email basicSalary joiningDate dateJoined role")
      .lean();

    if (!employees || employees.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const empIds = employees.map(e => e._id);
    const empIdStrings = employees.map(e => e.empId).filter(Boolean);

    const detailsList = await EmployeeDetails.find({
      $or: [
        { empId: { $in: empIds } },
        { empIdString: { $in: empIdStrings } }
      ]
    })
      .select("empId empIdString salary salaryHistory")
      .lean();

    const detailsMap = new Map();
    detailsList.forEach(d => {
      if (d.empId) detailsMap.set(String(d.empId), d);
      if (d.empIdString) detailsMap.set(String(d.empIdString), d);
    });

    const result = employees.map((emp) => {
      const details = detailsMap.get(String(emp._id)) || detailsMap.get(String(emp.empId));
      let activeSal = 0;

      if (details && details.salaryHistory && details.salaryHistory.length > 0) {
        const sortedSal = [...details.salaryHistory].sort(
          (a, b) => new Date(b.fromDate || b.addedAt || 0) - new Date(a.fromDate || a.addedAt || 0)
        );
        const latest = sortedSal[0];
        let allowanceTotal = 0;
        if (Array.isArray(latest.allowances)) {
          allowanceTotal = latest.allowances.reduce((sum, al) => sum + (Number(al.value || al.amount) || 0), 0);
        }

        activeSal = Number(latest.totalSalary) || (Number(latest.basicSalary || 0) + allowanceTotal) || Number(latest.basicSalary || 0);
      }

      if (!activeSal && emp.basicSalary) {
        activeSal = Number(emp.basicSalary);
      }
      if (!activeSal && details && details.salary) {
        activeSal = Number(details.salary);
      }

      return {
        _id: emp._id,
        empId: emp.empId || String(emp._id),
        name: emp.name,
        employeeName: emp.name,
        email: emp.email || '',
        department: emp.department || '',
        designation: emp.designation || '',
        joiningDate: emp.dateJoined,
        status: emp.employmentStatus || emp.status || 'Active',
        basicSalary: activeSal,
        previousSalary: activeSal,
        totalSalary: activeSal
      };
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('getIncrementEmployees error:', error);
    return res.status(500).json({ success: false, message: 'Server error retrieving employees' });
  }
};



