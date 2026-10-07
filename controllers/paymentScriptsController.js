const PaymentScriptDoc = require('../Models/PaymentScriptsModel');
const ExcelJS = require('exceljs');

const paymentScriptsController = {
  // Fetch all data for Admin or Employee
  getAllPaymentScriptsData: async (req, res) => {
    try {
      const { status } = req.query; // e.g., 'Pending', 'Approved', 'Rejected', 'Draft'

      let doc = await PaymentScriptDoc.findOne();
      if (!doc) {
        return res.status(200).json({
          success: true,
          data: { paymentScripts: [], documentInfos: [], revisionHistories: [] }
        });
      }

      let paymentScripts = doc.paymentScripts ? doc.paymentScripts.toObject() : [];
      let revisionHistories = doc.revisionHistories ? doc.revisionHistories.toObject() : [];

      if (status) {
        paymentScripts = paymentScripts.filter(a => a.approvalStatus === status);
        revisionHistories = revisionHistories.filter(a => a.approvalStatus === status);
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

      res.status(200).json({
        success: true,
        data: {
          paymentScripts,
          documentInfos,
          revisionHistories
        }
      });
    } catch (error) {
      console.error('Error fetching payment scripts data:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // ────────────────────────────────────────────────
  // Payment Scripts CRUD
  // ────────────────────────────────────────────────
  savePaymentScript: async (req, res) => {
    try {
      const { id, records, ...data } = req.body;
      let doc = await PaymentScriptDoc.findOne();
      if (!doc) doc = new PaymentScriptDoc();

      // Backend calculated version numbers
      const currentVersion = Number(doc.currentVersion || 0);
      const oldVersion = currentVersion;
      const newVersion = currentVersion + 1;

      // Update document-level fields from whichever payload carries them
      const meta = records ? data : data;
      doc.author = meta.author || doc.author;
      doc.documentId = meta.documentId || doc.documentId;
      doc.currentVersion = newVersion.toString();
      doc.dateOfCurrentVersion = new Date();
      doc.documentType = meta.documentType || doc.documentType;
      doc.owner = meta.owner || doc.owner;

      if (id) {
        // ── Single edit ──────────────────────────────────────────
        const item = doc.paymentScripts.id(id);
        if (item) {
          Object.assign(item, data);
          doc.revisionHistories.push({
            changeDate: data.changeDate || data.lastUpdatedDate || new Date(),
            changeDescription: `Edited Payment Script: ${item.scriptName}`,
            changeEffectiveDate: data.changeEffectiveDate || data.auditReviewDate || new Date(),
            oldVersion: oldVersion.toString(),
            newVersion: newVersion.toString(),
            changeDoneBy: data.changeDoneBy || 'Vishnu D (IT)',
            changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || 'Jayaprakash R (CISO)',
            approvalStatus: data.approvalStatus || 'Draft'
          });
        }
      } else if (records && Array.isArray(records) && records.length > 0) {
        // ── Bulk insert: push all records, ONE revision history entry ────────
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        records.forEach(r => doc.paymentScripts.push({ ...r, approvalStatus: data.approvalStatus || 'Draft', batchId }));
        const scriptNames = records.map(r => r.scriptName).filter(Boolean).join(', ');
        doc.revisionHistories.push({
          changeDate: data.reviewDate || new Date(),
          changeDescription: `Bulk Added ${records.length} Payment Script record(s): ${scriptNames}`,
          changeEffectiveDate: data.reviewDate || new Date(),
          oldVersion: oldVersion.toString(),
          newVersion: newVersion.toString(),
          changeDoneBy: data.changeDoneBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      } else {
        // ── Single new record ────────────────────────────────────
        doc.paymentScripts.push(data);
        doc.revisionHistories.push({
          changeDate: data.changeDate || data.lastUpdatedDate || new Date(),
          changeDescription: data.changeDescription || `Added/Updated Payment Script for ${data.scriptName}`,
          changeEffectiveDate: data.changeEffectiveDate || data.auditReviewDate || new Date(),
          oldVersion: oldVersion.toString(),
          newVersion: newVersion.toString(),
          changeDoneBy: data.changeDoneBy || 'Vishnu D (IT)',
          changeReviewedAndApprovedBy: data.changeReviewedAndApprovedBy || 'Jayaprakash R (CISO)',
          approvalStatus: data.approvalStatus || 'Draft'
        });
      }
      await doc.save();
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
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

  // ────────────────────────────────────────────────
  // Update Approval Status (Admin)
  // ────────────────────────────────────────────────
  updateStatus: async (req, res) => {
    try {
      const { type, id, status, rejectReason, reviewerName } = req.body; // type = 'script', 'revision'
      const doc = await PaymentScriptDoc.findOne();
      if (!doc) return res.status(404).json({ success: false });

      if (type === 'script') {
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
      } else if (type === 'revision') {
        const item = doc.revisionHistories.id(id);
        if (item) {
          item.approvalStatus = status;
          if (status === 'Rejected' && rejectReason) item.rejectReason = rejectReason;
          if (reviewerName) item.changeReviewedAndApprovedBy = reviewerName;
        }
      }
      await doc.save();
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ────────────────────────────────────────────────
  // Revision History CRUD (Mock endpoints)
  // ────────────────────────────────────────────────
  saveRevisionHistory: async (req, res) => {
    try {
      const { id, ...data } = req.body;
      let doc = await PaymentScriptDoc.findOne();
      if (!doc) return res.status(404).json({ success: false });

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
      const doc = await PaymentScriptDoc.findOne();
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
      const doc = await PaymentScriptDoc.findOne();
      if (!doc) return res.status(404).json({ success: false, message: 'No data found' });

      // ── Helper: apply thin border to a single cell ──────────────────────────
      const borderStyle = {
        top:    { style: 'thin', color: { argb: 'FF000000' } },
        left:   { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right:  { style: 'thin', color: { argb: 'FF000000' } },
      };
      const applyBorderToCell = (cell) => { cell.border = borderStyle; };

      const applyBorderToRow = (row, startCol, endCol) => {
        for (let c = startCol; c <= endCol; c++) {
          applyBorderToCell(row.getCell(c));
        }
      };

      // ── Sheet 1: Changes & Review ───────────────────────────────────────────
      const changesSheet = workbook.addWorksheet('Changes & Review');

      changesSheet.columns = [
        { key: 'A', width: 4  },
        { key: 'B', width: 28 },
        { key: 'C', width: 35 },
        { key: 'D', width: 22 },
        { key: 'E', width: 12 },
        { key: 'F', width: 12 },
        { key: 'G', width: 22 },
        { key: 'H', width: 35 },
      ];

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
      changesSheet.getCell('C10').value = doc.documentType || 'Security Governance Document';
      changesSheet.getCell('C11').value = doc.owner || 'IT Department';

      changesSheet.getCell('B14').value = "Revision History";
      changesSheet.getCell('B14').font = { bold: true, size: 14 };

      const revHeaderRow = changesSheet.getRow(15);
      revHeaderRow.values = ['', 'Change Date', 'Change Description', 'Change Effective Date', 'Old Version', 'New Version', 'Change done by', 'Change reviewed and approved by'];
      revHeaderRow.font = { bold: true };
      applyBorderToRow(revHeaderRow, 2, 8);

      const revisions = doc.revisionHistories.filter(r => r.approvalStatus === 'Approved').sort((a, b) => new Date(a.changeDate) - new Date(b.changeDate));
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

      // ── Sheet 2: Authorized Payment Scripts ─────────────────────────────────────────────────────
      const scriptsSheet = workbook.addWorksheet('Authorized Payment Scripts');

      scriptsSheet.columns = [
        { key: 'A', width: 4  },
        { key: 'B', width: 6  },
        { key: 'C', width: 25 },
        { key: 'D', width: 25 },
        { key: 'E', width: 35 },
        { key: 'F', width: 20 },
        { key: 'G', width: 20 },
        { key: 'H', width: 20 },
        { key: 'I', width: 12 },
      ];

      scriptsSheet.getCell('B4').value = "Authorized Payment Scripts";
      scriptsSheet.getCell('B4').font = { bold: true, size: 14 };

      const headerRow = scriptsSheet.getRow(5);
      headerRow.values = ['', 'S/N', 'Script Name', 'Source Domain', 'Purpose', 'Authorized By', 'Last Updated Date', 'Audit Review Date', 'Status'];
      headerRow.font = { bold: true };
      applyBorderToRow(headerRow, 2, 9);

      const paymentScripts = doc.paymentScripts.filter(r => r.approvalStatus === 'Approved').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      let pRow = 6;
      paymentScripts.forEach((script, index) => {
        const row = scriptsSheet.getRow(pRow + index);
        row.getCell(2).value = index + 1;
        row.getCell(3).value = script.scriptName;
        row.getCell(4).value = script.sourceDomain;
        row.getCell(5).value = script.purpose;
        row.getCell(6).value = script.authorizedBy;
        row.getCell(7).value = script.lastUpdatedDate ? new Date(script.lastUpdatedDate).toLocaleDateString() : '';
        row.getCell(8).value = script.auditReviewDate ? new Date(script.auditReviewDate).toLocaleDateString() : '';
        row.getCell(9).value = script.status || 'Active';
        applyBorderToRow(row, 2, 9);
        row.commit();
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Authorized_Payment_Scripts_Export.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Download excel error:', error);
      res.status(500).json({ success: false, message: 'Internal server error while downloading Excel' });
    }
  }
};

module.exports = paymentScriptsController;
