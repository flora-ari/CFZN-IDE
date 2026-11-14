export const SEARCH_CATEGORY = 'cfzn-search-results';
export const normalizeSearchText = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
export interface PaletteEntry { text: string; xml: Element; category: string }
export const changesPaletteTemplates = (type: string) => ['create', 'delete', 'change', 'move', 'var_create', 'var_delete', 'var_rename'].includes(type);
export const matchPaletteEntries = (entries: PaletteEntry[], query: string) => {
  const text = normalizeSearchText(query);
  return text ? entries.filter(entry => normalizeSearchText(entry.text).includes(text)) : [];
};
// Remove only instance identity/position. Variable IDs and procedure mutations remain semantic.
export function semanticPaletteXML(node: Element) {
  const copy = node.cloneNode(true) as Element;
  [copy, ...Array.from(copy.querySelectorAll('block, shadow'))].forEach(block => {
    block.removeAttribute('id'); block.removeAttribute('x'); block.removeAttribute('y');
  });
  return new XMLSerializer().serializeToString(copy);
}
