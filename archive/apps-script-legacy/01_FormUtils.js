/***************************************
 * 01_FormUtils.gs
 ***************************************/

function extractFormFileId(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) throw new Error('Form URL or ID is empty');

  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw) && !raw.startsWith('http')) return raw;

  const editMatch = raw.match(/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (editMatch && editMatch[1]) return editMatch[1];

  if (/forms\/d\/e\/[a-zA-Z0-9_-]+/.test(raw)) {
    throw new Error('Invalid Form URL: public viewform link provided. Use edit URL: https://docs.google.com/forms/d/<FILE_ID>/edit');
  }

  throw new Error('Could not extract Form FILE ID. Use edit link: https://docs.google.com/forms/d/<FILE_ID>/edit');
}

function openFormSafe(formIdOrUrl) {
  const fileId = extractFormFileId(formIdOrUrl);
  try {
    return FormApp.openById(fileId);
  } catch (error) {
    throw new Error(
      `Failed to open Form.\n\n` +
      `Make sure:\n` +
      `1. FORM_ID_OR_URL is the EDIT link or file ID\n` +
      `2. You are an EDITOR on the form\n\n` +
      `File ID: ${fileId}\n` +
      `Original error: ${error.message}`
    );
  }
}

function buildPageBreakIndex(form) {
  const items = form.getItems();
  const pageBreaks = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].getType() === FormApp.ItemType.PAGE_BREAK) {
      pageBreaks.push({
        index: i,
        item: items[i].asPageBreakItem(),
        title: String(items[i].getTitle() || '').trim()
      });
    }
  }
  return { items, pageBreaks };
}

function findQuestionInSection(items, sectionStartIndex, sectionEndIndex, questionTitle) {
  const targetTitle = String(questionTitle || '').trim();
  for (let i = sectionStartIndex; i < sectionEndIndex; i++) {
    const it = items[i];
    const title = String(it.getTitle ? it.getTitle() : '').trim();
    if (title !== targetTitle) continue;

    const type = it.getType();
    const isMC = type === FormApp.ItemType.MULTIPLE_CHOICE;
    const isList = type === FormApp.ItemType.LIST;
    if (isMC || isList) return it;
    return { wrongType: true, type: type };
  }
  return null;
}
