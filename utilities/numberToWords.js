const numberToWords = (inputNum) => {
  if (inputNum === 0) return 'Zero and Zero Paise Only';

  const numObj = Number(inputNum);
  const mainPart = Math.floor(numObj);
  const paisePart = Math.round((numObj - mainPart) * 100);

  const convert = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return '';
    if (num > 999999999) return 'Overflow';

    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';

    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim();
  };

  let mainWords = convert(mainPart);
  if (!mainWords) mainWords = "Zero";

  let paiseWords = "";
  if (paisePart === 0) {
    paiseWords = "Zero Paise";
  } else if (paisePart === 1) {
    paiseWords = "One Paisa";
  } else {
    paiseWords = convert(paisePart) + " Paise";
  }

  return `${mainWords} and ${paiseWords} Only`.trim();
};

module.exports = numberToWords;
