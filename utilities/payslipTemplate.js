const fs = require("fs");
const path = require("path");

const toBase64 = (filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.warn(`[payslipTemplate] Could not load image: ${filePath}`, err.message);
    return "";
  }
};

const publicDir = path.join(__dirname, "../Public");
const erLogoBase64 = toBase64(path.join(publicDir, "Ertitech.png"));
const erWatermarkBase64 = toBase64(path.join(publicDir, "ER.png"));

module.exports = (data) => {
  const earnings = data.earnings || [];
  const deductions = data.deductions || [];
  const hasDeductions = deductions.length > 0;

  let payPeriod = data.payPeriod || "-";
  if (data.dateRelieved || data.relievedDate) {
    const relDate = new Date(data.dateRelieved || data.relievedDate);
    if (!isNaN(relDate.getTime()) && data.month && data.year) {
      if (relDate.getMonth() + 1 === Number(data.month) && relDate.getFullYear() === Number(data.year)) {
        const mStr = String(data.month).padStart(2, "0");
        const yStr = data.year;
        const endDay = String(relDate.getDate()).padStart(2, "0");

        let startDay = "01";
        if (data.doj || data.dateJoined) {
          const dJoined = new Date(data.doj || data.dateJoined);
          if (!isNaN(dJoined.getTime()) && dJoined.getMonth() + 1 === Number(data.month) && dJoined.getFullYear() === Number(data.year)) {
            startDay = String(dJoined.getDate()).padStart(2, "0");
          }
        }
        payPeriod = `${startDay}.${mStr}.${yStr} to ${endDay}.${mStr}.${yStr}`;
      }
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    
    const day = d.getDate().toString().padStart(2, "0");
    const month = d.toLocaleString("en-IN", { month: "short" });
    const year = d.getFullYear();
    
    return `${day}-${month}-${year}`;
  };

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || amount === "") return "-";
    const num = Number(amount);
    return isNaN(num) ? amount : "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const maskAccountNumber = (acc) => {
    if (!acc || acc === "-") return "-";
    const str = String(acc).replace(/\s+/g, "");
    if (str.length <= 4) return str;
    return "•".repeat(str.length - 4) + str.slice(-4);
  };

  const maxRows = Math.max(earnings.length, deductions.length);

  let rows = "";
  for (let i = 0; i < maxRows; i++) {
    rows += `
      <tr>
        <td class="col-label">${earnings[i]?.label || ""}</td>
        <td class="col-val">${earnings[i]?.amount !== undefined ? formatCurrency(earnings[i].amount) : ""}</td>
        ${hasDeductions ? `
          <td class="col-label split-border">${deductions[i]?.label || ""}</td>
          <td class="col-val">${deductions[i]?.amount !== undefined ? formatCurrency(deductions[i].amount) : ""}</td>
        ` : ``}
      </tr>
    `;
  }

  const location = (data.location && data.location !== "-") ? data.location : "Salem";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 40px;
  background: #ffffff;
  color: #374151;
}

.wrapper {
  position: relative;
  max-width: 850px;
  margin: 0 auto;
  overflow: hidden;
}

.watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 800px;
  height: auto;
  opacity: 0.08;
  z-index: 0;
  display: block;
  margin: 0 auto;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.logo {
  height: 52px;
  margin-bottom: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: #707070;
  margin-top: 4px;
}

.card {
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 15px 24px;
  margin-bottom: 24px;
  background: #ffffff;
  position: relative;
  z-index: 1;
}

.info-table {
  width: 100%;
  border-collapse: collapse;
}

.info-table td {
  padding: 8px 0;
  font-size: 11.5px;
  vertical-align: top;
}

.info-table td.label {
  font-weight: 600;
  color: #828386ff;
  width: 95px;
  font-size: 11.5px;
}

.info-table td.value {
  color: #374151;
  font-weight: 500;
  font-size: 11.5px;
}

.info-table td.colon {
  width: 10px;
  padding-right: 15px;
  color: #374151;
}

.main-table-container {
  margin-bottom: 24px;
  background: #ffffff;
  position: relative;
  z-index: 1;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  overflow: hidden;
}

.main-table {
  width: 100%;
  border-collapse: collapse;
}

.main-table thead th {
  background: #636b8a;
  color: #ffffff;
  padding: 12px 18px;
  font-size: 11.5px;
  font-weight: 600;
  text-align: left;
}

.main-table thead th.right {
  text-align: right;
}

.main-table thead th.split-border {
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}

.main-table td {
  padding: 11px 18px;
  font-size: 11.5px;
  color: #374151;
  font-weight: 600;
}

.main-table tbody tr:first-child td {
  padding-top: 20px;
}

.main-table td.split-border {
  border-left: 1px solid #E5E7EB;
}

.main-table td.col-val {
  text-align: right;
  color: #374151;
  font-weight: 400;
}

.main-table tr:last-child td {
  border-bottom: none;
}

.main-table tr.total-row td {
  font-weight: 700;
  color: #424242ff;

}

.main-table tr.netpay-row td {
  font-weight: 700;
  color: #424242ff;
  padding: 14px 18px;

}

.footer-info-box {
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 15px 24px;
  margin-top: 24px;
  background: #ffffff;
  font-size: 11.5px;
  position: relative;
  z-index: 1;
}

.footer-info-box p {
  margin: 12px 0;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
}

.footer-info-box p:first-child {
  margin-top: 0;
}

.footer-info-box p:last-child {
  margin-bottom: 0;
}

.footer {
  text-align: center;
  margin-top: 275px;
  font-size: 11px;
  color: #666;
}
</style>
</head>
<body>
<div class="wrapper">
<img src="${erWatermarkBase64}" class="watermark" />
<div class="header">
  <img src="${erLogoBase64}" class="logo" />
  <div class="title">Payslip for the Month of ${data.monthName} ${data.year}</div>
</div>

<div class="card">
  <table class="info-table">
    <tr>
      <td class="label">Name</td>
      <td class="colon">:</td>
      <td class="value" style="width: 35%;">${data.employeeName}</td>

      <td class="label" style="padding-left: 40px;">Bank A/c No</td>
      <td class="colon">:</td>
      <td class="value">${maskAccountNumber(data.accountNumber)}</td>
    </tr>
    <tr>
      <td class="label">Emp ID</td>
      <td class="colon">:</td>
      <td class="value">${(data.empCode && data.empCode !== "undefined") ? data.empCode : "-"}</td>

      <td class="label" style="padding-left: 40px;">Bank Name</td>
      <td class="colon">:</td>
      <td class="value">${data.bankName || "-"}</td>
    </tr>
    <tr>
      <td class="label">PAN No</td>
      <td class="colon">:</td>
      <td class="value">${data.panNo || "-"}</td>

      <td class="label" style="padding-left: 40px;">Branch Name</td>
      <td class="colon">:</td>
      <td class="value">${data.branchName || "-"}</td>
    </tr>
    <tr>
      <td class="label">Designation</td>
      <td class="colon">:</td>
      <td class="value">${(data.designation && data.designation !== "undefined") ? data.designation : "-"}</td>

      <td class="label" style="padding-left: 40px;">IFSC Code</td>
      <td class="colon">:</td>
      <td class="value">${data.ifscCode || "-"}</td>
    </tr>
    <tr>
      <td class="label">Department</td>
      <td class="colon">:</td>
      <td class="value">${(data.department && data.department !== "undefined") ? data.department : "-"}</td>

      <td class="label" style="padding-left: 40px;">Pay Period</td>
      <td class="colon">:</td>
      <td class="value">${payPeriod}</td>
    </tr>
    <tr>
      <td class="label">DOJ</td>
      <td class="colon">:</td>
      <td class="value">${formatDate(data.doj)}</td>

      <td class="label" style="padding-left: 40px;">Days Worked</td>
      <td class="colon">:</td>
      <td class="value">${(data.workingDays !== undefined && !isNaN(data.workingDays)) ? data.workingDays : "-"}</td>
    </tr>
    <tr>
      <td class="label">Location</td>
      <td class="colon">:</td>
      <td class="value">${location}</td>

      <td class="label" style="padding-left: 40px;">Days Present</td>
      <td class="colon">:</td>
      <td class="value">${(data.presentDays !== undefined && !isNaN(data.presentDays)) ? data.presentDays : "-"}</td>
    </tr>
  </table>
</div>

<div class="main-table-container">
  <table class="main-table">
    <thead>
      <tr>
        <th>Particulars</th>
        <th class="right">Earnings</th>
        ${hasDeductions ? `
          <th class="split-border">Particulars</th>
          <th class="right">Deductions</th>
        ` : ``}
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td>Total </td>
        <td class="col-val">${formatCurrency(data.totalEarnings)}</td>
        ${hasDeductions ? `
          <td class="split-border">Total </td>
          <td class="col-val">${formatCurrency(data.totalDeductions)}</td>
        ` : ``}
      </tr>
    </tbody>
  </table>
</div>

<div class="footer-info-box">
  <p>
    <strong>Take Home Pay:</strong> ${formatCurrency(data.netPay)}
  </p>
  <p>
    <strong>Amount in Words:</strong> ${data.amountInWords || "-"}
  </p>
</div>

<div class="footer">
  This Payslip does not require Signature as it is a System Generated Statement
</div>

</div>
</body>
</html>`;
};