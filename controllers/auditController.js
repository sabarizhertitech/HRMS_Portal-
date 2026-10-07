const Asset = require('../Models/AssetsModels');
const PaymentScriptDoc = require('../Models/PaymentScriptsModel');
const VendorsDoc = require('../Models/VendorsModel');
const ExcelJS = require('exceljs');
const Employee = require('../Models/Employee');
const Notification = require('../Models/Notification');
const { sendPushNotification } = require('../utilities/notificationService');
const MenuPermission = require('../Models/MenuPermission');


const sendApprovalNotification = async (reviewerName, typeStr) => {
  if (!reviewerName) return;
  try {
    const reviewer = await Employee.findOne({ name: reviewerName });
    if (reviewer) {
      const title = `New ${typeStr} Approval Request`;
      const message = `A new ${typeStr.toLowerCase()} has been submitted for your review.`;

      await Notification.create({
        type: "SECURITY_REQUEST",
        toEmployee: reviewer._id,
        title,
        message,
      });

      await sendPushNotification(reviewer._id, title, message, { type: "SECURITY_REQUEST" });
    }
  } catch (err) {
    console.error('Error sending audit notification:', err);
  }
};

const broadcastToAllEmployees = async (title, message, metadata) => {
  try {
    const allEmployees = await Employee.find({ status: 'Active' }).select('_id');
    const employeeIds = allEmployees.map(emp => emp._id);
    if (employeeIds.length > 0) {
      await sendPushNotification(employeeIds, title, message, metadata);
    }
  } catch (error) {
    console.error("Error broadcasting to all employees:", error);
  }
};

const auditController = {
  // Fetch all data for Admin or Employee
  getAllAuditData: async (req, res) => {
    try {
      const { status } = req.query; // e.g., 'Pending', 'Approved', 'Rejected', 'Draft'

      let doc = await Asset.findOne();
      if (!doc) {
        return res.status(200).json({
          success: true,
          data: { accessReviews: [], firewallRules: [], documentInfos: [], revisionHistories: [] }
        });
      }

      let accessReviews = doc.accessReviews ? doc.accessReviews.toObject() : [];
      let firewallRules = doc.firewallRules ? doc.firewallRules.toObject() : [];
      let revisionHistories = doc.revisionHistories ? doc.revisionHistories.toObject() : [];

      if (status) {
        accessReviews = accessReviews.filter(a => a.approvalStatus === status);
        firewallRules = firewallRules.filter(a => a.approvalStatus === status);
        revisionHistories = revisionHistories.filter(a => a.approvalStatus === status);
      }

      const documentInfos = [{
        _id: doc._id,
        author: doc.author,
        reviewedBy: doc.reviewedBy,
        documentId: doc.documentId,
        currentVersion: doc.currentVersion,
        dateOfCurrentVersion: doc.dateOfCurrentVersion,
        documentType: doc.documentType,
        owner: doc.owner
      }];

      res.status(200).json({
        success: true,
        data: {
          accessReviews,
          firewallRules,
          documentInfos,
          revisionHistories
        }
      });
    } catch (error) {
      console.error('Error fetching audit data:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },


  saveAccessReview: async (req, res) => {
    try {
      const { id, records, ...data } = req.body;
      let doc = await Asset.findOne();
      if (!doc) doc = new Asset();

      const currentVersion = Number(doc.currentVersion || 0);
      const oldVersion = currentVersion;
      const newVersion = currentVersion + 1;

      doc.author = data.author || doc.author;
      doc.reviewedBy = data.docReviewedBy || data.reviewedBy || doc.reviewedBy;
      doc.documentId = data.documentId || doc.documentId;
      doc.dateOfCurrentVersion = data.dateOfCurrentVersion || doc.dateOfCurrentVersion;
      doc.documentType = data.documentType || doc.documentType;
      doc.owner = data.owner || doc.owner;

      if (id) {
        // ── Single edit ──────────────────────────────────────────
        const item = doc.accessReviews.id(id);
        if (item) {
          const oldReviewer = item.reviewedBy;
          const newReviewer = data.reviewedBy;
          const oldStatus = item.approvalStatus;
          Object.assign(item, data);

          let desc = `Edited User Access Review details for ${item.user}`;
          if (oldReviewer && newReviewer && oldReviewer !== newReviewer) {
            desc = `Edited: Changed reviewer/approver for ${item.user} from "${oldReviewer}" to "${newReviewer}"`;
          }

          doc.currentVersion = String(newVersion);
          doc.dateOfCurrentVersion = new Date();
          doc.revisionHistories.push({
            changeDate: new Date(),
            changeDescription: desc,
            changeEffectiveDate: new Date(),
            oldVersion: String(oldVersion),
            newVersion: String(newVersion),
            changeDoneBy: data.author || item.user || 'User',
            changeReviewedAndApprovedBy: newReviewer || item.reviewedBy || 'Jayaprakash R (CISO)',
            approvalStatus: data.approvalStatus || oldStatus || 'Draft'
          });
        }
      } else if (records && Array.isArray(records) && records.length > 0) {
        // ── Bulk insert: push all records, ONE revision history entry ────────
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        records.forEach(r => doc.accessReviews.push({ ...r, approvalStatus: data.approvalStatus || 'Draft', batchId }));
        const userNames = records.map(r => r.user).filter(Boolean).join(', ');
        doc.currentVersion = String(newVersion);
        doc.dateOfCurrentVersion = new Date();
        doc.revisionHistories.push({
          changeDate: data.reviewDate || new Date(),
          changeDescription: `Bulk Added ${records.length} User Access Review record(s): ${userNames}`,
          changeEffectiveDate: data.reviewDate || new Date(),
          oldVersion: String(oldVersion),
          newVersion: String(newVersion),
          changeDoneBy: data.changeDoneBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      } else {
        // ── Single new record (unchanged) ────────────────────────────────────
        doc.accessReviews.push(data);
        doc.currentVersion = String(newVersion);
        doc.dateOfCurrentVersion = new Date();
        doc.revisionHistories.push({
          changeDate: data.changeDate || data.reviewDate || new Date(),
          changeDescription: data.changeDescription || `Added/Updated User Access Review for ${data.user}`,
          changeEffectiveDate: data.changeEffectiveDate || data.reviewDate || new Date(),
          oldVersion: String(oldVersion),
          newVersion: String(newVersion),
          changeDoneBy: data.changeDoneBy || data.user || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      }
      await doc.save();

      if (data.approvalStatus === 'Pending') {
        const reviewerName = data.changeReviewedAndApprovedBy || data.reviewedBy;
        await sendApprovalNotification(reviewerName, 'Access Review');
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  deleteAccessReview: async (req, res) => {
    try {
      const doc = await Asset.findOne();
      if (doc) {
        doc.accessReviews.pull({ _id: req.params.id });
        await doc.save();
      }
      res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ────────────────────────────────────────────────
  // Firewall Rules CRUD
  // ────────────────────────────────────────────────
  saveFirewallRule: async (req, res) => {
    try {
      const { id, records, ...data } = req.body;
      let doc = await Asset.findOne();
      if (!doc) doc = new Asset();

      doc.author = data.author || doc.author;
      doc.reviewedBy = data.docReviewedBy || data.reviewedBy || doc.reviewedBy;
      doc.documentId = data.documentId || doc.documentId;
      const currentVersion = Number(doc.currentVersion || 0);

      const oldVersion = currentVersion;

      const newVersion = currentVersion + 1;
      doc.dateOfCurrentVersion = data.dateOfCurrentVersion || doc.dateOfCurrentVersion;
      doc.documentType = data.documentType || doc.documentType;
      doc.owner = data.owner || doc.owner;

      if (id) {
        // ── Single edit ──────────────────────────────────────────
        const item = doc.firewallRules.id(id);
        if (item) {
          const oldReviewer = item.reviewedBy;
          const newReviewer = data.reviewedBy;
          const oldStatus = item.approvalStatus;
          Object.assign(item, data);

          let desc = `Edited Firewall Rule ${item.ruleId}`;
          if (oldReviewer && newReviewer && oldReviewer !== newReviewer) {
            desc = `Edited: Changed reviewer/approver for Firewall Rule ${item.ruleId} from "${oldReviewer}" to "${newReviewer}"`;
          }

          doc.currentVersion = String(newVersion);
          doc.dateOfCurrentVersion = new Date();
          doc.revisionHistories.push({
            changeDate: new Date(),
            changeDescription: desc,
            changeEffectiveDate: new Date(),
            oldVersion: String(oldVersion),
            newVersion: String(newVersion),
            changeDoneBy: data.author || item.implementedBy || 'User',
            changeReviewedAndApprovedBy: newReviewer || item.reviewedBy || 'Jayaprakash R (CISO)',
            approvalStatus: data.approvalStatus || oldStatus || 'Draft'
          });
        }
      } else if (records && Array.isArray(records) && records.length > 0) {
        // ── Bulk insert: push all records, ONE revision history entry ────────
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        records.forEach(r => doc.firewallRules.push({ ...r, approvalStatus: data.approvalStatus || 'Draft', batchId }));
        const ruleIds = records.map(r => r.ruleId).filter(Boolean).join(', ');
        doc.currentVersion = String(newVersion);
        doc.dateOfCurrentVersion = new Date();
        doc.revisionHistories.push({
          changeDate: data.reviewDate || new Date(),
          changeDescription: `Bulk Added ${records.length} Firewall Rule record(s): ${ruleIds}`,
          changeEffectiveDate: data.reviewDate || new Date(),
          oldVersion: String(oldVersion),
          newVersion: String(newVersion),
          changeDoneBy: data.changeDoneBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      } else {
        // ── Single new record (unchanged) ────────────────────────────────────
        doc.firewallRules.push(data);
        doc.currentVersion = String(newVersion);
        doc.dateOfCurrentVersion = new Date();
        doc.revisionHistories.push({
          changeDate: data.changeDate || data.reviewDate || new Date(),
          changeDescription: data.changeDescription || `Added/Updated Firewall Rule ${data.ruleId}`,
          changeEffectiveDate: data.changeEffectiveDate || data.reviewDate || new Date(),
          oldVersion: String(oldVersion),
          newVersion: String(newVersion),
          changeDoneBy: data.changeDoneBy || data.implementedBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      }
      await doc.save();

      if (data.approvalStatus === 'Pending') {
        const reviewerName = data.changeReviewedAndApprovedBy || data.reviewedBy;
        await sendApprovalNotification(reviewerName, 'Firewall Rule');
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  deleteFirewallRule: async (req, res) => {
    try {
      const doc = await Asset.findOne();
      if (doc) {
        doc.firewallRules.pull({ _id: req.params.id });
        await doc.save();
      }
      res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ────────────────────────────────────────────────
  // Update Approval Status (Admin)
  // ────────────────────────────────────────────────
  updateStatus: async (req, res) => {
    try {
      const { type, id, status, rejectReason, reviewerName } = req.body; // type = 'access', 'firewall', 'revision'
      const doc = await Asset.findOne();
      if (!doc) return res.status(404).json({ success: false });

      if (type === 'access') {
        const item = doc.accessReviews.id(id);
        if (item) {
          item.approvalStatus = status;
          if (status === 'Rejected' && rejectReason) item.rejectReason = rejectReason;

          const rev = [...doc.revisionHistories]
            .reverse()
            .find(r =>
              r.changeDescription &&
              r.changeDescription.includes(item.user)
            );

          if (rev) {
            rev.approvalStatus = status;
            rev.changeReviewedAndApprovedBy = reviewerName;
            if (status === 'Rejected') {
              rev.rejectReason = rejectReason;
            }
          }
        }
      } else if (type === 'firewall') {
        const item = doc.firewallRules.id(id);
        if (item) {
          item.approvalStatus = status;
          if (status === 'Rejected' && rejectReason) item.rejectReason = rejectReason;

          const rev = [...doc.revisionHistories]
            .reverse()
            .find(r =>
              r.changeDescription &&
              r.changeDescription.includes(item.ruleId)
            );

          if (rev) {
            rev.approvalStatus = status;
            rev.changeReviewedAndApprovedBy = reviewerName;
            if (status === 'Rejected') {
              rev.rejectReason = rejectReason;
            }
          }
        }
      } else if (type === 'revision') {
        // Only update the status on the existing revision entry — do NOT push a new one
        const item = doc.revisionHistories.id(id);
        if (item) {
          item.approvalStatus = status;
          if (status === 'Rejected' && rejectReason) item.rejectReason = rejectReason;
          if (reviewerName) item.changeReviewedAndApprovedBy = reviewerName;
        }
      }
      await doc.save();

      // ── Broadcast if Approved ──
      if (status === 'Approved') {
        let title = '';
        let message = '';
        if (type === 'access') {
          title = 'Access Review Approved';
          message = `A new Access Review record has been officially Approved.`;
        } else if (type === 'firewall') {
          title = 'Firewall Rule Approved';
          message = `A new Firewall Rule has been officially Approved.`;
        }
        if (title) await broadcastToAllEmployees(title, message, { type: "SECURITY_REQUEST" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ────────────────────────────────────────────────
  // Revision History direct CRUD (Asset document)
  // ────────────────────────────────────────────────
  saveRevisionHistory: async (req, res) => {
    try {
      const { id, ...data } = req.body;
      const doc = await Asset.findOne();
      if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
      if (id) {
        const item = doc.revisionHistories.id(id);
        if (item) Object.assign(item, data);
      } else {
        doc.revisionHistories.push(data);
      }
      await doc.save();
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
  deleteRevisionHistory: async (req, res) => {
    try {
      const doc = await Asset.findOne();
      if (doc) {
        doc.revisionHistories.pull({ _id: req.params.id });
        await doc.save();
      }
      res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ────────────────────────────────────────────────
  // Download Excel
  // ────────────────────────────────────────────────
  downloadExcel: async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const doc = await Asset.findOne();
      if (!doc) return res.status(404).json({ success: false, message: 'No data found' });

      // ── Helper: apply thin border to a single cell ──────────────────────────
      const borderStyle = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
      const applyBorderToCell = (cell) => { cell.border = borderStyle; };

      // Helper: apply border to a range of cells in a row (col indices, 1-based)
      const applyBorderToRow = (row, startCol, endCol) => {
        for (let c = startCol; c <= endCol; c++) {
          applyBorderToCell(row.getCell(c));
        }
      };

      // ── Sheet 1: Changes & Review ───────────────────────────────────────────
      const changesSheet = workbook.addWorksheet('Changes & Review');

      // Set column widths for Changes & Review sheet
      // Col A(1)=small, B(2)=label, C(3)=value, D(4)=date, E(5)=ver, F(6)=ver, G(7)=done by, H(8)=approved by
      changesSheet.columns = [
        { key: 'A', width: 4 },  // col A – spacer
        { key: 'B', width: 28 },  // Change Date / label
        { key: 'C', width: 35 },  // Change Description / value
        { key: 'D', width: 22 },  // Change Effective Date
        { key: 'E', width: 12 },  // Old Version
        { key: 'F', width: 12 },  // New Version
        { key: 'G', width: 22 },  // Change done by
        { key: 'H', width: 35 },  // Change reviewed and approved by
      ];

      // Build "Document Information" section
      changesSheet.getCell('B4').value = "Document Information";
      changesSheet.getCell('B4').font = { bold: true, size: 14 };

      changesSheet.getCell('B5').value = "Author";
      changesSheet.getCell('B6').value = "Reviewed By";
      changesSheet.getCell('B7').value = "Document ID";
      changesSheet.getCell('B8').value = "Current Version";
      changesSheet.getCell('B9').value = "Date of Current Version";
      changesSheet.getCell('B10').value = "Document Type";
      changesSheet.getCell('B11').value = "Owner";

      changesSheet.getCell('C5').value = doc.author || 'Vishnu D (IT)';
      changesSheet.getCell('C6').value = doc.reviewedBy || 'Jayaprakash R (CISO)';
      changesSheet.getCell('C7').value = doc.documentId || 'PCI-RR-001';
      changesSheet.getCell('C8').value = doc.currentVersion || '1';
      changesSheet.getCell('C9').value = doc.dateOfCurrentVersion ? new Date(doc.dateOfCurrentVersion).toLocaleDateString() : '';
      changesSheet.getCell('C10').value = doc.documentType || 'Access Control Review';
      changesSheet.getCell('C11').value = doc.owner || 'IT Department';

      // Build "Revision History" section
      changesSheet.getCell('B14').value = "Revision History";
      changesSheet.getCell('B14').font = { bold: true, size: 14 };

      const revHeaderRow = changesSheet.getRow(15);
      revHeaderRow.values = ['', 'Change Date', 'Change Description', 'Change Effective Date', 'Old Version', 'New Version', 'Change done by', 'Change reviewed and approved by'];
      revHeaderRow.font = { bold: true };
      applyBorderToRow(revHeaderRow, 2, 8);

      const revisions = doc.revisionHistories.filter(r => r.approvalStatus === 'Approved' || r.approvalStatus === 'Rejected').sort((a, b) => new Date(a.changeDate) - new Date(b.changeDate));
      let startRow = 16;
      revisions.forEach((rev, index) => {
        const row = changesSheet.getRow(startRow + index);
        row.getCell(2).value = rev.changeDate ? new Date(rev.changeDate).toLocaleDateString() : '';
        row.getCell(3).value = rev.changeDescription;
        row.getCell(4).value = rev.changeEffectiveDate ? new Date(rev.changeEffectiveDate).toLocaleDateString() : '';
        row.getCell(5).value = rev.oldVersion || 'N/A';
        row.getCell(6).value = rev.newVersion || '1.1';
        row.getCell(7).value = rev.changeDoneBy || 'Vishnu D (IT)';
        row.getCell(8).value = rev.changeReviewedAndApprovedBy || 'Jayaprakash R (CISO)';
        applyBorderToRow(row, 2, 8);
        row.commit();
      });

      // ── Sheet 2: Assets ─────────────────────────────────────────────────────
      const assetsSheet = workbook.addWorksheet('Assets');

      // Parse custom columns order/visibility from query
      const { accessCols, fwCols } = req.query;

      let accessKeyOrder = [];
      if (accessCols) {
        accessKeyOrder = accessCols.split(',').filter(k => k !== '__approval__' && k !== '__actions__');
      } else {
        accessKeyOrder = ['user', 'role', 'awsConsole', 'awsConsoleDesc', 'ec2Server', 'ec2ServerDesc', 'database', 'databaseDesc', 'kmsSecrets', 'gitRepository', 'gitRepositoryDesc', 'firewallWaf', 'productionDeploy', 'productionDeployDesc', 'reviewedBy', 'reviewDate', 'status'];
      }

      let fwKeyOrder = [];
      if (fwCols) {
        fwKeyOrder = fwCols.split(',').filter(k => k !== '__approval__' && k !== '__actions__');
      } else {
        fwKeyOrder = ['firewallType', 'ruleId', 'source', 'destination', 'action', 'businessJustification', 'implementedBy', 'reviewedBy', 'reviewDate', 'status'];
      }

      const hasAwsDesc = doc.accessReviews.some(ar => ar.awsConsole?.includes(' - '));
      const hasEc2Desc = doc.accessReviews.some(ar => ar.ec2Server?.includes(' - '));
      const hasDbDesc = doc.accessReviews.some(ar => ar.database?.includes(' - '));
      const hasGitDesc = doc.accessReviews.some(ar => ar.gitRepository?.includes(' - '));
      const hasProdDesc = doc.accessReviews.some(ar => ar.productionDeploy?.includes(' - '));

      accessKeyOrder = accessKeyOrder.filter(key => {
        if (key === 'awsConsoleDesc') return hasAwsDesc;
        if (key === 'ec2ServerDesc') return hasEc2Desc;
        if (key === 'databaseDesc') return hasDbDesc;
        if (key === 'gitRepositoryDesc') return hasGitDesc;
        if (key === 'productionDeployDesc') return hasProdDesc;
        return true;
      });

      // Configure spreadsheet columns layout dynamically
      const maxCols = Math.max(accessKeyOrder.length, fwKeyOrder.length) + 2;
      const columnsConfig = [{ key: 'A', width: 4 }, { key: 'B', width: 6 }];
      for (let i = 0; i < maxCols; i++) {
        columnsConfig.push({ width: 20 });
      }
      assetsSheet.columns = columnsConfig;

      assetsSheet.getCell('B4').value = "User Access Review";
      assetsSheet.getCell('B4').font = { bold: true, size: 14 };

      const accessReviews = doc.accessReviews.filter(r => r.approvalStatus === 'Approved').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const accessMapping = {
        user: { label: 'User', getValue: (ar) => ar.user },
        role: { label: 'Role', getValue: (ar) => ar.role },
        awsConsole: { label: 'AWS Console', getValue: (ar) => ar.awsConsole && ar.awsConsole.includes(' - ') ? ar.awsConsole.split(' - ')[0] : (ar.awsConsole || 'N/A') },
        awsConsoleDesc: { label: 'AWS Description', getValue: (ar) => ar.awsConsole && ar.awsConsole.includes(' - ') ? ar.awsConsole.split(' - ').slice(1).join(' - ') : '' },
        ec2Server: { label: 'EC2 Server', getValue: (ar) => ar.ec2Server && ar.ec2Server.includes(' - ') ? ar.ec2Server.split(' - ')[0] : (ar.ec2Server || 'N/A') },
        ec2ServerDesc: { label: 'EC2 Description', getValue: (ar) => ar.ec2Server && ar.ec2Server.includes(' - ') ? ar.ec2Server.split(' - ').slice(1).join(' - ') : '' },
        database: { label: 'Database', getValue: (ar) => ar.database && ar.database.includes(' - ') ? ar.database.split(' - ')[0] : (ar.database || 'N/A') },
        databaseDesc: { label: 'Database Description', getValue: (ar) => ar.database && ar.database.includes(' - ') ? ar.database.split(' - ').slice(1).join(' - ') : '' },
        kmsSecrets: { label: 'KMS/Secrets', getValue: (ar) => ar.kmsSecrets },
        gitRepository: { label: 'Git Repository', getValue: (ar) => ar.gitRepository && ar.gitRepository.includes(' - ') ? ar.gitRepository.split(' - ')[0] : (ar.gitRepository || 'N/A') },
        gitRepositoryDesc: { label: 'Git Repo Description', getValue: (ar) => ar.gitRepository && ar.gitRepository.includes(' - ') ? ar.gitRepository.split(' - ').slice(1).join(' - ') : '' },
        firewallWaf: { label: 'Firewall/WAF', getValue: (ar) => ar.firewallWaf },
        productionDeploy: { label: 'Production Deploy', getValue: (ar) => ar.productionDeploy && ar.productionDeploy.includes(' - ') ? ar.productionDeploy.split(' - ')[0] : (ar.productionDeploy || 'N/A') },
        productionDeployDesc: { label: 'Prod Deploy Description', getValue: (ar) => ar.productionDeploy && ar.productionDeploy.includes(' - ') ? ar.productionDeploy.split(' - ').slice(1).join(' - ') : '' },
        reviewedBy: { label: 'Reviewed By', getValue: (ar) => ar.reviewedBy },
        reviewDate: { label: 'Review Date', getValue: (ar) => ar.reviewDate ? new Date(ar.reviewDate).toLocaleDateString() : '' },
        status: { label: 'Status', getValue: (ar) => ar.status || 'Active' },
      };

      // Header row for Access Review
      const arHeaderRow = assetsSheet.getRow(5);
      const arHeaderValues = ['', 'S.No'];
      accessKeyOrder.forEach(key => {
        if (key.startsWith('__custom__')) {
          arHeaderValues.push(key.replace('__custom__', ''));
        } else {
          arHeaderValues.push(accessMapping[key]?.label || key);
        }
      });
      arHeaderRow.values = arHeaderValues;
      arHeaderRow.font = { bold: true };
      const arTotalCols = 2 + accessKeyOrder.length;
      applyBorderToRow(arHeaderRow, 2, arTotalCols);

      let arRow = 6;
      accessReviews.forEach((ar, index) => {
        const row = assetsSheet.getRow(arRow + index);
        row.getCell(2).value = index + 1;

        accessKeyOrder.forEach((key, colIndex) => {
          const cellNum = 3 + colIndex;
          if (key.startsWith('__custom__')) {
            const label = key.replace('__custom__', '');
            const cf = ar.customFields && ar.customFields.find(c => c.label === label);
            row.getCell(cellNum).value = cf ? cf.value : '';
          } else {
            const mapper = accessMapping[key];
            row.getCell(cellNum).value = mapper ? mapper.getValue(ar) : '';
          }
        });

        applyBorderToRow(row, 2, arTotalCols);
        row.commit();
      });

      let fwRow = arRow + accessReviews.length + 3;
      assetsSheet.getCell(`B${fwRow}`).value = "Firewall Rules";
      assetsSheet.getCell(`B${fwRow}`).font = { bold: true, size: 14 };

      const fwMapping = {
        firewallType: { label: 'Firewall Type', getValue: (fw) => fw.firewallType },
        ruleId: { label: 'Rule ID', getValue: (fw) => fw.ruleId },
        source: { label: 'Source', getValue: (fw) => fw.source },
        destination: { label: 'Destination', getValue: (fw) => fw.destination },
        action: { label: 'Action', getValue: (fw) => fw.action },
        businessJustification: { label: 'Business Justification', getValue: (fw) => fw.businessJustification },
        implementedBy: { label: 'Implemented By', getValue: (fw) => fw.implementedBy },
        reviewedBy: { label: 'Reviewed By', getValue: (fw) => fw.reviewedBy },
        reviewDate: { label: 'Review Date', getValue: (fw) => fw.reviewDate ? new Date(fw.reviewDate).toLocaleDateString() : '' },
        status: { label: 'Status', getValue: (fw) => fw.status || 'Active' },
      };

      const fwHeaderRow = assetsSheet.getRow(fwRow + 1);
      const fwHeaderValues = ['', 'S.No'];
      fwKeyOrder.forEach(key => {
        fwHeaderValues.push(fwMapping[key]?.label || key);
      });
      fwHeaderRow.values = fwHeaderValues;
      fwHeaderRow.font = { bold: true };
      const fwTotalCols = 2 + fwKeyOrder.length;
      applyBorderToRow(fwHeaderRow, 2, fwTotalCols);

      const firewallRules = doc.firewallRules.filter(r => r.approvalStatus === 'Approved').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      firewallRules.forEach((fw, index) => {
        const row = assetsSheet.getRow(fwRow + 2 + index);
        row.getCell(2).value = index + 1;
        // Use fwKeyOrder to write cells in the correct dynamic column order
        fwKeyOrder.forEach((key, colIndex) => {
          const cellNum = 3 + colIndex;
          const mapper = fwMapping[key];
          row.getCell(cellNum).value = mapper ? mapper.getValue(fw) : '';
        });
        applyBorderToRow(row, 2, fwTotalCols);
        row.commit();
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Access_Control_Review_Export.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Download excel error:', error);
      res.status(500).json({ success: false, message: 'Internal server error while downloading Excel' });
    }
  }
};

// ────────────────────────────────────────────────────────────────
// Payment Script Controllers
// ────────────────────────────────────────────────────────────────

const paymentScriptController = {

  // GET all payment script data
  getAllPaymentScripts: async (req, res) => {
    try {
      const { status } = req.query;
      let doc = await PaymentScriptDoc.findOne();
      if (!doc) {
        return res.status(200).json({ success: true, data: { paymentScripts: [], revisionHistories: [], documentInfos: [] } });
      }

      let paymentScripts = doc.paymentScripts ? doc.paymentScripts.toObject() : [];
      let revisionHistories = doc.revisionHistories ? doc.revisionHistories.toObject() : [];

      if (status) {
        paymentScripts = paymentScripts.filter(p => p.approvalStatus === status);
        revisionHistories = revisionHistories.filter(r => r.approvalStatus === status);
      }

      const documentInfos = [{
        _id: doc._id,
        author: doc.author,
        documentId: doc.documentId,
        currentVersion: doc.currentVersion,
        dateOfCurrentVersion: doc.dateOfCurrentVersion,
        documentType: doc.documentType,
        owner: doc.owner
      }];

      res.status(200).json({ success: true, data: { paymentScripts, revisionHistories, documentInfos } });
    } catch (error) {
      console.error('Error fetching payment scripts:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // POST save (create or edit) a payment script record
  savePaymentScript: async (req, res) => {
    try {
      const { id, records, ...data } = req.body;
      let doc = await PaymentScriptDoc.findOne();
      if (!doc) doc = new PaymentScriptDoc();

      // Backend calculated version numbers
      const currentVersion = Number(doc.currentVersion || 0);
      const oldVersion = currentVersion;
      const newVersion = currentVersion + 1;

      // Update document-level metadata
      doc.author = data.author || doc.author;
      doc.documentId = data.documentId || doc.documentId;
      doc.currentVersion = newVersion.toString();
      doc.dateOfCurrentVersion = new Date();
      doc.documentType = data.documentType || doc.documentType;
      doc.owner = data.owner || doc.owner;

      if (id) {
        // Single edit
        const item = doc.paymentScripts.id(id);
        if (item) {
          Object.assign(item, data);
          doc.revisionHistories.push({
            changeDate: data.auditReviewDate || new Date(),
            changeDescription: `Edited Payment Script: ${item.scriptName}`,
            changeEffectiveDate: data.auditReviewDate || new Date(),
            oldVersion: oldVersion.toString(),
            newVersion: newVersion.toString(),
            changeDoneBy: data.changeDoneBy || data.authorizedBy || 'Vishnu D (IT)',
            changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
            approvalStatus: data.approvalStatus || 'Draft'
          });
        }
      } else if (records && Array.isArray(records) && records.length > 0) {
        // Bulk insert
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        records.forEach(r => doc.paymentScripts.push({ ...r, approvalStatus: data.approvalStatus || 'Draft', batchId }));
        const scriptNames = records.map(r => r.scriptName).filter(Boolean).join(', ');
        doc.revisionHistories.push({
          changeDate: data.auditReviewDate || new Date(),
          changeDescription: `Bulk Added ${records.length} Payment Script record(s): ${scriptNames}`,
          changeEffectiveDate: data.auditReviewDate || new Date(),
          oldVersion: oldVersion.toString(),
          newVersion: newVersion.toString(),
          changeDoneBy: data.changeDoneBy || data.authorizedBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      } else {
        // Single new record
        doc.paymentScripts.push(data);
        doc.revisionHistories.push({
          changeDate: data.auditReviewDate || new Date(),
          changeDescription: `Added/Updated Payment Script: ${data.scriptName}`,
          changeEffectiveDate: data.auditReviewDate || new Date(),
          oldVersion: oldVersion.toString(),
          newVersion: newVersion.toString(),
          changeDoneBy: data.changeDoneBy || data.authorizedBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      }

      await doc.save();

      // Send notification to selected approver when submitting for approval
      if (data.approvalStatus === 'Pending') {
        const reviewerName = data.changeReviewedAndApprovedBy || data.reviewedBy;
        await sendApprovalNotification(reviewerName, 'Payment Script');
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // DELETE a payment script record
  deletePaymentScript: async (req, res) => {
    try {
      const doc = await PaymentScriptDoc.findOne();
      if (doc) {
        doc.paymentScripts.pull({ _id: req.params.id });
        await doc.save();
      }
      res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PUT update approval status (Admin)
  updatePaymentScriptStatus: async (req, res) => {
    try {
      const { id, status, rejectReason, reviewerName } = req.body;
      const doc = await PaymentScriptDoc.findOne();
      if (!doc) return res.status(404).json({ success: false });

      const item = doc.paymentScripts.id(id);
      if (item) {
        item.approvalStatus = status;
        if (status === 'Rejected' && rejectReason) item.rejectReason = rejectReason;

        // Find the latest matching revision history entry (search from newest to oldest)
        const rev = [...doc.revisionHistories].reverse().find(r =>
          r.changeDescription && r.changeDescription.includes(item.scriptName)
        );
        if (rev) {
          rev.approvalStatus = status;
          if (status === 'Rejected' && rejectReason) rev.rejectReason = rejectReason;
          if (reviewerName) rev.changeReviewedAndApprovedBy = reviewerName;
        }
      }

      await doc.save();

      // ── Broadcast if Approved ──
      if (status === 'Approved') {
        const title = 'Payment Script Approved';
        const message = `The Payment Script "${item?.scriptName || 'record'}" has been officially Approved.`;
        await broadcastToAllEmployees(title, message, { type: "SECURITY_REQUEST" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Download Payment Scripts Excel
  downloadPaymentScriptsExcel: async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const doc = await PaymentScriptDoc.findOne();
      if (!doc) return res.status(404).json({ success: false, message: 'No data found' });

      const borderStyle = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
      const applyBorderToRow = (row, startCol, endCol) => {
        for (let c = startCol; c <= endCol; c++) {
          row.getCell(c).border = borderStyle;
        }
      };

      // ── Sheet 1: Changes & Review ────────────────────────────────
      const changesSheet = workbook.addWorksheet('Changes & Review');
      changesSheet.columns = [
        { key: 'A', width: 4 },
        { key: 'B', width: 28 },
        { key: 'C', width: 35 },
        { key: 'D', width: 22 },
        { key: 'E', width: 12 },
        { key: 'F', width: 12 },
        { key: 'G', width: 22 },
        { key: 'H', width: 35 },
      ];

      changesSheet.getCell('B3').value = 'Field';
      changesSheet.getCell('B3').font = { bold: true };
      changesSheet.getCell('C3').value = 'Value';
      changesSheet.getCell('C3').font = { bold: true };

      changesSheet.getCell('B4').value = 'Author'; changesSheet.getCell('C4').value = doc.author || 'Vishnu D (IT)';
      changesSheet.getCell('B5').value = 'Reviewed By'; changesSheet.getCell('C5').value = doc.reviewedBy || 'Jayaprakash R (CISO)';
      changesSheet.getCell('B6').value = 'Document ID'; changesSheet.getCell('C6').value = doc.documentId || 'PCI-RR-001';
      changesSheet.getCell('B7').value = 'Current Version'; changesSheet.getCell('C7').value = doc.currentVersion || '1';
      changesSheet.getCell('B8').value = 'Date of Current Version'; changesSheet.getCell('C8').value = doc.dateOfCurrentVersion ? new Date(doc.dateOfCurrentVersion).toLocaleDateString() : '';
      changesSheet.getCell('B9').value = 'Document Type'; changesSheet.getCell('C9').value = doc.documentType || 'Security Governance Document';
      changesSheet.getCell('B10').value = 'Owner'; changesSheet.getCell('C10').value = doc.owner || 'IT Department';

      changesSheet.getCell('B12').value = 'Revision History';
      changesSheet.getCell('B12').font = { bold: true, size: 14 };

      const revHeaderRow = changesSheet.getRow(13);
      revHeaderRow.values = ['', 'Change Date', 'Change Description', 'Change Effective Date', 'Old Version', 'New Version', 'Change Done By', 'Change Reviewed and Approved By'];
      revHeaderRow.font = { bold: true };
      applyBorderToRow(revHeaderRow, 2, 8);

      const revisions = (doc.revisionHistories || []).filter(r => r.approvalStatus === 'Approved' || r.approvalStatus === 'Rejected').sort((a, b) => new Date(a.changeDate) - new Date(b.changeDate));
      revisions.forEach((rev, index) => {
        const row = changesSheet.getRow(14 + index);
        row.getCell(2).value = rev.changeDate ? new Date(rev.changeDate).toLocaleDateString() : '';
        row.getCell(3).value = rev.changeDescription;
        row.getCell(4).value = rev.changeEffectiveDate ? new Date(rev.changeEffectiveDate).toLocaleDateString() : '';
        row.getCell(5).value = rev.oldVersion || 'N/A';
        row.getCell(6).value = rev.newVersion || '1';
        row.getCell(7).value = rev.changeDoneBy || 'Vishnu D (IT)';
        row.getCell(8).value = rev.changeReviewedAndApprovedBy || 'Jayaprakash R (CISO)';
        applyBorderToRow(row, 2, 8);
        row.commit();
      });

      // ── Sheet 2: authorized_payment_scripts ──────────────────────
      const psSheet = workbook.addWorksheet('authorized_payment_scripts');

      const { cols } = req.query;
      let psKeyOrder = [];
      if (cols) {
        psKeyOrder = cols.split(',').filter(k => k !== '__approval__' && k !== '__actions__');
      } else {
        psKeyOrder = ['scriptName', 'sourceDomain', 'purpose', 'authorizedBy', 'lastUpdatedDate', 'auditReviewDate', 'status'];
      }

      const psMapping = {
        scriptName: { label: 'Script Name', getValue: (ps) => ps.scriptName },
        sourceDomain: { label: 'Source Domain', getValue: (ps) => ps.sourceDomain },
        purpose: { label: 'Purpose', getValue: (ps) => ps.purpose },
        authorizedBy: { label: 'Authorized By', getValue: (ps) => ps.authorizedBy },
        lastUpdatedDate: { label: 'Last Updated Date', getValue: (ps) => ps.lastUpdatedDate ? new Date(ps.lastUpdatedDate).toLocaleDateString() : '' },
        auditReviewDate: { label: 'Audit Review Date', getValue: (ps) => ps.auditReviewDate ? new Date(ps.auditReviewDate).toLocaleDateString() : '' },
        status: { label: 'Status', getValue: (ps) => ps.status || 'Active' },
      };

      const columnsConfig = [{ key: 'A', width: 6 }];
      psKeyOrder.forEach(() => {
        columnsConfig.push({ width: 22 });
      });
      psSheet.columns = columnsConfig;

      const psHeaderRow = psSheet.getRow(4);
      const psHeaderValues = ['S/N'];
      psKeyOrder.forEach(key => {
        psHeaderValues.push(psMapping[key]?.label || key);
      });
      psHeaderRow.values = psHeaderValues;
      psHeaderRow.font = { bold: true };

      const totalCols = 1 + psKeyOrder.length;
      applyBorderToRow(psHeaderRow, 1, totalCols);

      const approvedScripts = (doc.paymentScripts || []).filter(p => p.approvalStatus === 'Approved').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      approvedScripts.forEach((ps, index) => {
        const row = psSheet.getRow(5 + index);
        row.getCell(1).value = index + 1;

        psKeyOrder.forEach((key, colIndex) => {
          const cellNum = 2 + colIndex;
          const mapper = psMapping[key];
          row.getCell(cellNum).value = mapper ? mapper.getValue(ps) : '';
        });

        applyBorderToRow(row, 1, totalCols);
        row.commit();
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Payment_Scripts_Export.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Download payment scripts excel error:', error);
      res.status(500).json({ success: false, message: 'Internal server error while downloading Excel' });
    }
  }
};

// ────────────────────────────────────────────────────────────────
// Vendor Controllers
// ────────────────────────────────────────────────────────────────

const vendorController = {

  // GET all vendor data
  getAllVendors: async (req, res) => {
    try {
      const { status } = req.query;
      let doc = await VendorsDoc.findOne();
      if (!doc) {
        return res.status(200).json({ success: true, data: { vendors: [], revisionHistories: [], documentInfos: [] } });
      }

      let vendors = doc.vendors ? doc.vendors.toObject() : [];
      // Logged in user
      const loggedInUser = req.user.name;
      const userRole = req.user.role;

      // Employee should only see records assigned to them or created by them unless they have READ/WRITE access
      if (userRole !== "admin") {
        const permDoc = await MenuPermission.findOne({ employeeId: req.user.id });
        const permission = permDoc?.menus?.find(p => p.module === "Inscope Vendor")?.permission || "NO_ACCESS";

        if (permission !== "READ" && permission !== "WRITE") {
          vendors = vendors.filter(v =>
              (v.reviewedBy &&
              v.reviewedBy.trim().toLowerCase() ===
              loggedInUser.trim().toLowerCase()) ||
              (doc.author &&
              doc.author.trim().toLowerCase() ===
              loggedInUser.trim().toLowerCase())
          );
        }
      }
      let revisionHistories = doc.revisionHistories ? doc.revisionHistories.toObject() : [];

      if (status) {
        vendors = vendors.filter(p => p.approvalStatus === status);
        revisionHistories = revisionHistories.filter(r => r.approvalStatus === status);
      }

      const documentInfos = [{
        _id: doc._id,
        author: doc.author,
        documentId: doc.documentId,
        currentVersion: doc.currentVersion,
        dateOfCurrentVersion: doc.dateOfCurrentVersion,
        documentType: doc.documentType,
        owner: doc.owner
      }];

      res.status(200).json({ success: true, data: { vendors, revisionHistories, documentInfos } });
    } catch (error) {
      console.error('Error fetching vendors:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // POST save (create or edit) a vendor record
  saveVendor: async (req, res) => {
    try {
      const { id, records, ...data } = req.body;
      let doc = await VendorsDoc.findOne();
      if (!doc) doc = new VendorsDoc();

      // Backend calculated version numbers
      const currentVersion = Number(doc.currentVersion || 0);
      const oldVersion = currentVersion;
      const newVersion = currentVersion + 1;

      // Update document-level metadata
      doc.author = data.author || doc.author;
      doc.documentId = data.documentId || doc.documentId;
      doc.currentVersion = newVersion.toString();
      doc.dateOfCurrentVersion = data.dateOfCurrentVersion || doc.dateOfCurrentVersion;
      doc.documentType = data.documentType || doc.documentType;
      doc.owner = data.owner || doc.owner;

      if (id) {
        // Single edit
        const item = doc.vendors.id(id);
        if (item) {
          Object.assign(item, data);
          doc.revisionHistories.push({
            changeDate: data.auditReviewDate || new Date(),
            changeDescription: `Edited Vendor: ${item.vendorName}`,
            changeEffectiveDate: data.auditReviewDate || new Date(),
            oldVersion: oldVersion.toString(),
            newVersion: newVersion.toString(),
            changeDoneBy: data.changeDoneBy || data.author || 'Vishnu D (IT)',
            changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
            approvalStatus: data.approvalStatus || 'Draft'
          });
        }
      } else if (records && Array.isArray(records) && records.length > 0) {
        // Bulk insert
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        records.forEach(r => doc.vendors.push({ ...r, approvalStatus: data.approvalStatus || 'Draft', batchId }));
        const vendorNames = records.map(r => r.vendorName).filter(Boolean).join(', ');
        
        const reviewers = [
          ...new Set(
            records.map(r => r.reviewedBy)
          )
        ].filter(Boolean).join(", ");

        doc.revisionHistories.push({
          changeDate: data.auditReviewDate || new Date(),
          changeDescription: `Bulk Added ${records.length} Vendor record(s): ${vendorNames}`,
          changeEffectiveDate: data.auditReviewDate || new Date(),
          oldVersion: oldVersion.toString(),
          newVersion: newVersion.toString(),
          changeDoneBy: data.changeDoneBy || data.author || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: reviewers || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      } else {
        // Single new record
        doc.vendors.push(data);
        doc.revisionHistories.push({
          changeDate: data.auditReviewDate || new Date(),
          changeDescription: `Added/Updated Vendor: ${data.vendorName}`,
          changeEffectiveDate: data.auditReviewDate || new Date(),
          oldVersion: oldVersion.toString(),
          newVersion: newVersion.toString(),
          changeDoneBy: data.changeDoneBy || data.author || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || data.reviewedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      }

      await doc.save();

      // Send notification to selected approver when submitting for approval
      if (data.approvalStatus === 'Pending') {
        if (records && Array.isArray(records)) {
          for (const vendor of records) {
            if (vendor.reviewedBy) {
              await sendApprovalNotification(
                vendor.reviewedBy,
                "Inscope Vendor"
              );
            }
          }
        } else {
          const reviewerName = data.changeReviewedAndApprovedBy || data.reviewedBy;
          await sendApprovalNotification(reviewerName, 'Inscope Vendor');
        }
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // DELETE a vendor record
  deleteVendor: async (req, res) => {
    try {
      const doc = await VendorsDoc.findOne();
      if (doc) {
        doc.vendors.pull({ _id: req.params.id });
        await doc.save();
      }
      res.status(200).json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PUT update approval status (Admin)
  updateVendorStatus: async (req, res) => {
    try {
      const { id, status, rejectReason, reviewerName } = req.body;
      const doc = await VendorsDoc.findOne();
      if (!doc) return res.status(404).json({ success: false });

      const item = doc.vendors.id(id);
      if (item) {
        item.approvalStatus = status;
        if (status === 'Rejected' && rejectReason) item.rejectReason = rejectReason;

        // Find the latest matching revision history entry (search from newest to oldest)
        const rev = [...doc.revisionHistories].reverse().find(r =>
          r.changeDescription && r.changeDescription.includes(item.vendorName)
        );
        if (rev) {
          rev.approvalStatus = status;
          if (status === 'Rejected' && rejectReason) rev.rejectReason = rejectReason;
          if (reviewerName) rev.changeReviewedAndApprovedBy = reviewerName;
        }
      }

      await doc.save();

      // ── Broadcast if Approved ──
      if (status === 'Approved') {
        const title = 'Inscope Vendor Approved';
        const message = `The Vendor "${item?.vendorName || 'record'}" has been officially Approved.`;
        await broadcastToAllEmployees(title, message, { type: "SECURITY_REQUEST" });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Download Vendors Excel
  downloadVendorsExcel: async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const doc = await VendorsDoc.findOne();
      if (!doc) return res.status(404).json({ success: false, message: 'No data found' });

      const borderStyle = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };
      const applyBorderToRow = (row, startCol, endCol) => {
        for (let c = startCol; c <= endCol; c++) {
          row.getCell(c).border = borderStyle;
        }
      };

      // ── Sheet 1: Changes & Review ────────────────────────────────
      const changesSheet = workbook.addWorksheet('Changes & Review');
      changesSheet.columns = [
        { key: 'A', width: 4 },
        { key: 'B', width: 28 },
        { key: 'C', width: 35 },
        { key: 'D', width: 22 },
        { key: 'E', width: 12 },
        { key: 'F', width: 12 },
        { key: 'G', width: 22 },
        { key: 'H', width: 35 },
      ];

      changesSheet.getCell('B3').value = 'Field';
      changesSheet.getCell('B3').font = { bold: true };
      changesSheet.getCell('B3').border = borderStyle;
      changesSheet.getCell('C3').value = 'Value';
      changesSheet.getCell('C3').font = { bold: true };
      changesSheet.getCell('C3').border = borderStyle;

      const fields = [
        { name: 'Author', value: doc.author || 'Vishnu D (IT)' },
        { name: 'Reviewed By', value: doc.reviewedBy || 'Jayaprakash R (CISO)' },
        { name: 'Document ID', value: doc.documentId || 'PCI-IV-001' },
        { name: 'Current Version', value: doc.currentVersion || '1' },
        { name: 'Date of Current Version', value: doc.dateOfCurrentVersion ? new Date(doc.dateOfCurrentVersion).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '' },
        { name: 'Document Type', value: doc.documentType || 'Inscope Vendors Document' },
        { name: 'Owner', value: doc.owner || 'IT Department' }
      ];

      fields.forEach((f, idx) => {
        const r = idx + 4;
        changesSheet.getCell(`B${r}`).value = f.name;
        changesSheet.getCell(`B${r}`).border = borderStyle;
        changesSheet.getCell(`C${r}`).value = f.value;
        changesSheet.getCell(`C${r}`).border = borderStyle;
      });

      changesSheet.getCell('B12').value = 'Revision History';
      changesSheet.getCell('B12').font = { bold: true, size: 14 };

      const revHeaderRow = changesSheet.getRow(13);
      revHeaderRow.values = ['', 'Change Date', 'Change Description', 'Change Effective Date', 'Old Version', 'New Version', 'Change Done By', 'Change Reviewed and Approved By'];
      revHeaderRow.font = { bold: true };
      applyBorderToRow(revHeaderRow, 2, 8);

      const revisions = (doc.revisionHistories || []).filter(r => r.approvalStatus === 'Approved' || r.approvalStatus === 'Rejected').sort((a, b) => new Date(a.changeDate) - new Date(b.changeDate));
      revisions.forEach((rev, index) => {
        const row = changesSheet.getRow(14 + index);
        row.getCell(2).value = rev.changeDate ? new Date(rev.changeDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '';
        row.getCell(3).value = rev.changeDescription;
        row.getCell(4).value = rev.changeEffectiveDate ? new Date(rev.changeEffectiveDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '';
        row.getCell(5).value = rev.oldVersion || 'N/A';
        row.getCell(6).value = rev.newVersion || '1';
        row.getCell(7).value = rev.changeDoneBy || 'Vishnu D (IT)';
        row.getCell(8).value = rev.changeReviewedAndApprovedBy || 'Jayaprakash R (CISO)';
        applyBorderToRow(row, 2, 8);
        row.commit();
      });

      // ── Sheet 2: Vendors ──────────────────────
      const vSheet = workbook.addWorksheet('Vendors');
      const { cols } = req.query;
      let vendorKeyOrder = [];
      if (cols) {
        vendorKeyOrder = cols.split(',').filter(k => k !== '__approval__' && k !== '__actions__');
      } else {
        vendorKeyOrder = ['vendorName', 'serviceProvided', 'inScopeForPci', 'dataAccessType', 'contractAvailable', 'responsibilityNotes', 'reviewDate', 'status'];
      }

      const vendorMapping = {
        vendorName: { label: 'Vendor Name', getValue: (v) => v.vendorName },
        serviceProvided: { label: 'Service Provided', getValue: (v) => v.serviceProvided },
        inScopeForPci: { label: 'In Scope For PCI', getValue: (v) => v.inScopeForPci },
        dataAccessType: { label: 'Data/Access Type', getValue: (v) => v.dataAccessType },
        contractAvailable: { label: 'Contract Available', getValue: (v) => v.contractAvailable },
        responsibilityNotes: { label: 'Responsibility Notes', getValue: (v) => v.responsibilityNotes },
        reviewDate: { label: 'Review Date', getValue: (v) => v.reviewDate ? new Date(v.reviewDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '' },
        reviewedBy: { label: 'Reviewed By', getValue: (v) => v.reviewedBy },
        status: { label: 'Status', getValue: (v) => v.status || 'Active' },
      };

      const columnsConfig = [{ key: 'A', width: 6 }];
      vendorKeyOrder.forEach(() => {
        columnsConfig.push({ width: 22 });
      });
      vSheet.columns = columnsConfig;

      const headerFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF9BC2E6' } // Light blue similar to screenshot
      };

      const vHeaderRow = vSheet.getRow(3);
      const vHeaderValues = ['S/N'];
      vendorKeyOrder.forEach(key => {
        vHeaderValues.push(vendorMapping[key]?.label || key);
      });
      vHeaderRow.values = vHeaderValues;
      vHeaderRow.font = { bold: true };

      const totalCols = 1 + vendorKeyOrder.length;
      for (let c = 1; c <= totalCols; c++) {
        vHeaderRow.getCell(c).fill = headerFill;
        vHeaderRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
      }
      applyBorderToRow(vHeaderRow, 1, totalCols);

      const approvedVendors = (doc.vendors || []).filter(p => p.approvalStatus === 'Approved' || p.approvalStatus === 'Rejected').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      approvedVendors.forEach((vendor, index) => {
        const row = vSheet.getRow(4 + index);
        row.getCell(1).value = index + 1;

        vendorKeyOrder.forEach((key, colIndex) => {
          const cellNum = 2 + colIndex;
          const mapper = vendorMapping[key];
          row.getCell(cellNum).value = mapper ? mapper.getValue(vendor) : '';
        });

        row.alignment = { vertical: 'middle', wrapText: true };
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' };

        const reviewDateIdx = vendorKeyOrder.indexOf('reviewDate');
        if (reviewDateIdx !== -1) {
          row.getCell(2 + reviewDateIdx).alignment = { vertical: 'middle', horizontal: 'center' };
        }

        applyBorderToRow(row, 1, totalCols);
        row.commit();
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Inscope_Vendors_Export.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Download vendors excel error:', error);
      res.status(500).json({ success: false, message: 'Internal server error while downloading Excel' });
    }
  }
};

module.exports = { ...auditController, ...paymentScriptController, ...vendorController };
