/* Small, local SVG icons. Geometry is shared across navigation and canvas controls. */
const studioIconPaths = {
  workspace: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  chart: '<path d="M4 4v16h16M9 15v-4m5 4V7m5 8v-6"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
  program: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18m-13 4 2 2-2 2m5 0h3"/>',
  settings: '<path d="m12 3 2 3 3-.3.8 3 2.5 1.8-1.5 2.7.3 3-3 .8-1.8 2.5-2.7-1.5-3 .3-.8-3-2.5-1.8 1.5-2.7-.3-3 3-.8Z"/><circle cx="12" cy="12" r="3"/>',
  book: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18m4-13h4m-4 4h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 2 1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0"/>',
  fit: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
};
function studioIcon(name) {
  return `<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${studioIconPaths[name] || studioIconPaths.workspace}</svg>`;
}
document.querySelectorAll("[data-ui-icon]").forEach(element => { element.innerHTML = studioIcon(element.dataset.uiIcon); });
