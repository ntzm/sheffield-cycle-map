export function createPopupContainer(titleText) {
  const root = document.createElement('div');
  root.style.maxWidth = '260px';
  root.style.fontSize = '13px';
  root.style.lineHeight = '1.4';

  const heading = document.createElement('div');
  heading.style.fontWeight = '700';
  heading.style.fontSize = '16px';
  heading.style.lineHeight = '1.25';
  heading.textContent = titleText || '';
  root.appendChild(heading);
  return { root, heading };
}

export function addRow(root, label, value) {
  if (value === undefined || value === null || value === '') return;
  const row = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label}:`;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(' '));
  row.appendChild(document.createTextNode(String(value)));
  root.appendChild(row);
}
