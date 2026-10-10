/**
 * Piezas de interfaz reutilizables.
 *
 * Todo se construye con `document.createElement` en vez de innerHTML. Es algo
 * mas de codigo, pero significa que un nombre de jugador con `<` dentro se
 * pinta como texto y no se interpreta como HTML. Para un juego donde el nombre
 * viene de otro jugador, esa distincion no es decorativa.
 */

/** Crea un elemento con clase, texto y atributos. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    class?: string;
    text?: string;
    attrs?: Record<string, string>;
    children?: (Node | string)[];
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class !== undefined) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const child of options.children ?? []) {
    node.append(child);
  }
  return node;
}

/** Un boton con su etiqueta y su manejador. */
export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const node = el('button', { text: label, class: className });
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** Una etiqueta pequena con un valor: "En linea: 12". */
export function chip(label: string, value: string | number, extraClass = ''): HTMLElement {
  const node = el('div', { class: `chip ${extraClass}`.trim() });
  node.append(el('span', { text: `${label}: ` }));
  const strong = el('strong', { text: String(value) });
  node.append(strong);
  return node;
}

/** Rellena un elemento, quitando antes lo que hubiera. */
export function render(host: HTMLElement, ...nodes: (Node | string)[]): void {
  host.replaceChildren(...nodes);
}

/**
 * Un aviso del servidor, con su nivel.
 *
 * `null` en el texto lo oculta, para que al llegar uno nuevo se sustituya.
 */
export function notice(
  level: 'info' | 'warn' | 'error',
  text: string,
): HTMLElement {
  return el('div', { class: `notice ${level}`, text });
}

/** Un panel con titulo. */
export function panel(title: string, ...children: (Node | string)[]): HTMLElement {
  const node = el('section', { class: 'panel' });
  if (title !== '') node.append(el('h2', { text: title }));
  node.append(...children);
  return node;
}